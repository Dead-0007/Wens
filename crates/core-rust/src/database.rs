use crate::models::{
    AccentId, AppPreferences, BackgroundAudioMode, BootstrapPayload, CreateIdea, CreateProject,
    DailyWorshipRecord, FastingSoundMode, Idea, NotificationRecord, NotificationSummary,
    PrayerSoundMode, Project, QuietHours, ThemeId, UpdateIdea, UpdateProject, WorkSessionRecord,
    WorkSoundMode,
};
use chrono::Utc;
use rusqlite::{params, Connection, ErrorCode, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use thiserror::Error;
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: i64 = 3;

const BACKUP_SNAPSHOT_FORMAT: &str = "wens-native-snapshot";
const BACKUP_SNAPSHOT_FIELDS: [&str; 11] = [
    "settings",
    "projects",
    "tasks",
    "ideas",
    "workSessions",
    "dailyWorship",
    "prayerLogs",
    "fastingEntries",
    "dailyLogs",
    "notificationHistory",
    "kv",
];
const LEGACY_WORSHIP_REPAIRED: &str = "__legacy_worship_repaired";


#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("database error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("invalid legacy state: {0}")]
    Json(#[from] serde_json::Error),
    #[error("file error: {0}")]
    Io(#[from] std::io::Error),
    #[error(
        "migration verification failed for {domain}: expected {expected}, inserted {inserted}"
    )]
    Verification {
        domain: String,
        expected: usize,
        inserted: usize,
    },
    #[error("{0}")]
    Validation(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationCounts {
    pub projects: usize,
    pub tasks: usize,
    pub ideas: usize,
    pub fasting_entries: usize,
    pub work_sessions: usize,
    pub marketing_entries: usize,
    pub daily_entries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub from_version: i64,
    pub to_version: i64,
    pub migrated: bool,
    pub backup_path: Option<String>,
    pub counts: MigrationCounts,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BackupTask {
    id: String,
    project_id: Option<String>,
    title: String,
    #[serde(default)]
    notes: String,
    #[serde(default = "default_task_status")]
    status: String,
    #[serde(default)]
    position: i64,
    #[serde(default)]
    due_at: Option<String>,
    #[serde(default)]
    completed_at: Option<String>,
    device_id: String,
    created_at: String,
    updated_at: String,
    #[serde(default = "default_revision")]
    revision: i64,
}

fn default_task_status() -> String {
    "open".to_string()
}

fn default_revision() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BackupPrayerLog {
    id: String,
    prayer_date: String,
    prayer_name: String,
    status: String,
    #[serde(default)]
    marked_at: Option<String>,
    device_id: String,
    created_at: String,
    updated_at: String,
    #[serde(default = "default_revision")]
    revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BackupFastingEntry {
    id: String,
    kind: String,
    label: String,
    #[serde(default)]
    target_date: Option<String>,
    status: String,
    device_id: String,
    created_at: String,
    updated_at: String,
    #[serde(default = "default_revision")]
    revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BackupDailyLog {
    id: String,
    log_date: String,
    payload_json: String,
    device_id: String,
    created_at: String,
    updated_at: String,
    #[serde(default = "default_revision")]
    revision: i64,
}

pub struct Database {
    connection: Connection,
    path: PathBuf,
    migration: Option<MigrationReport>,
}

fn is_corruption_error(err: &DatabaseError) -> bool {
    matches!(
        err,
        DatabaseError::Sql(rusqlite::Error::SqliteFailure(ffi_err, _))
            if matches!(
                ffi_err.code,
                ErrorCode::NotADatabase | ErrorCode::DatabaseCorrupt
            ) || ffi_err.extended_code == rusqlite::ffi::SQLITE_NOTADB
                || ffi_err.extended_code == rusqlite::ffi::SQLITE_CORRUPT
    )
}

fn quarantine_corrupt_db(path: &Path) -> Result<(), std::io::Error> {
    let epoch = Utc::now().timestamp();
    let mut candidate_num = 0u32;
    let backup_main = loop {
        let mut base = path.as_os_str().to_os_string();
        if candidate_num == 0 {
            base.push(format!(".corrupt.{epoch}.bak"));
        } else {
            base.push(format!(".corrupt.{epoch}.{candidate_num}.bak"));
        }
        let candidate = PathBuf::from(&base);
        if !candidate.exists() {
            break candidate;
        }
        candidate_num = candidate_num.saturating_add(1);
    };

    if path.exists() {
        fs::rename(path, &backup_main)?;
    }
    for suffix in ["-wal", "-shm", "-journal"] {
        let mut sidecar_src = path.as_os_str().to_os_string();
        sidecar_src.push(suffix);
        let src_path = PathBuf::from(&sidecar_src);
        if src_path.exists() {
            let mut sidecar_dst = backup_main.as_os_str().to_os_string();
            sidecar_dst.push(suffix);
            let _ = fs::rename(&src_path, PathBuf::from(&sidecar_dst));
        }
    }
    Ok(())
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, DatabaseError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        match Self::open_inner(&path) {
            Ok(db) => Ok(db),
            Err(err) if is_corruption_error(&err) => {
                quarantine_corrupt_db(&path)?;
                Self::open_inner(&path)
            }
            Err(err) => Err(err),
        }
    }

    fn open_inner(path: &Path) -> Result<Self, DatabaseError> {
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_millis(5000))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let current_journal: String =
            connection.query_row("PRAGMA journal_mode", [], |r| r.get(0))?;
        if !current_journal.eq_ignore_ascii_case("wal") {
            connection.pragma_update(None, "journal_mode", "WAL")?;
        }
        connection.pragma_update(None, "synchronous", "NORMAL")?;

        let check_result: String =
            connection.query_row("PRAGMA quick_check(1)", [], |r| r.get(0))?;
        if !check_result.eq_ignore_ascii_case("ok") {
            return Err(DatabaseError::Sql(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
                Some(format!("PRAGMA quick_check failed: {check_result}")),
            )));
        }

        ensure_legacy_tables(&connection)?;
        let migration = migrate_to_v2(&mut connection, path)?;
        ensure_vnext_tables(&connection)?;
        ensure_v3_schema(&mut connection)?;
        reconcile_legacy_snapshot(&mut connection)?;
        migrate_legacy_worship(&mut connection)?;
        Ok(Self {
            connection,
            path: path.to_path_buf(),
            migration,
        })
    }

    fn begin_immediate(&self) -> Result<Transaction<'_>, DatabaseError> {
        Ok(Transaction::new_unchecked(
            &self.connection,
            TransactionBehavior::Immediate,
        )?)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn bootstrap(&self) -> Result<BootstrapPayload, DatabaseError> {
        let device_id = self.local_device_id()?;
        let settings = self.get_preferences()?;
        let unread_count = self.unread_notifications_count().unwrap_or(0);
        let notification_summary = NotificationSummary {
            next_reminder: None,
            status: if settings.notifications.prayer_at_time_enabled {
                "armed".into()
            } else {
                "silent".into()
            },
            unread_count,
            last_recoverable_error: None,
        };
        Ok(BootstrapPayload {
            schema_version: CURRENT_SCHEMA_VERSION,
            device_id,
            settings,
            notification_summary,
            projects: self.projects()?,
            ideas: self.ideas()?,
            migration: self.migration.clone(),
        })
    }

    pub fn legacy_snapshot(&self) -> Result<Option<String>, DatabaseError> {
        Ok(self
            .connection
            .query_row(
                "SELECT value FROM app_state WHERE key = 'root'",
                [],
                |row| row.get(0),
            )
            .optional()?)
    }

    pub fn save_compatibility_snapshot(&self, state_json: &str) -> Result<(), DatabaseError> {
        if state_json.len() > 10_000_000 {
            return Err(DatabaseError::Validation("state payload too large".into()));
        }
        let _: Value = serde_json::from_str(state_json)?;
        let tx = self.begin_immediate()?;
        tx.execute(
            "INSERT INTO app_state(key,value,updated_at) VALUES('root',?1,CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
            [state_json],
        )?;
        // The 0.3 UI remains available during the transition. Mark its snapshot
        // dirty so the next typed-core open reconciles it before vNext reads.
        tx.execute(
            "INSERT INTO settings(key,value_json,updated_at) VALUES('__legacy_snapshot_dirty','true',CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value_json='true',updated_at=CURRENT_TIMESTAMP",
            [],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn create_project(&self, input: CreateProject) -> Result<Project, DatabaseError> {
        let title = input.title.trim();
        if title.is_empty() {
            return Err(DatabaseError::Validation(
                "project title is required".into(),
            ));
        }
        let tx = self.begin_immediate()?;
        let now = Utc::now().to_rfc3339();
        let device_id = local_device_id_conn(&tx)?;
        let project = Project {
            id: Uuid::new_v4().to_string(),
            title: title.to_owned(),
            description: input.description.trim().to_owned(),
            status: input.status,
            progress: 0,
            symbol: "✦".into(),
            current_task: input.current_task.filter(|v| !v.trim().is_empty()),
            goal: input.goal.filter(|v| !v.trim().is_empty()),
            is_current: input.is_current,
            device_id,
            created_at: now.clone(),
            updated_at: now,
            revision: 1,
            deleted_at: None,
        };
        if project.is_current {
            tx.execute("UPDATE projects SET is_current = 0", [])?;
        }
        tx.execute(
            "INSERT INTO projects(id,title,description,status,progress,symbol,current_task,goal,is_current,device_id,created_at,updated_at,revision)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                project.id,
                project.title,
                project.description,
                project.status,
                project.progress,
                project.symbol,
                project.current_task,
                project.goal,
                if project.is_current { 1 } else { 0 },
                project.device_id,
                project.created_at,
                project.updated_at,
                project.revision
            ],
        )?;
        append_change_conn(
            &tx,
            "project",
            &project.id,
            "insert",
            project.revision,
            serde_json::to_value(&project)?,
        )?;
        tx.commit()?;
        Ok(project)
    }

    pub fn update_project(&self, update: UpdateProject) -> Result<Project, DatabaseError> {
        let tx = self.begin_immediate()?;
        let now = Utc::now().to_rfc3339();
        let existing = tx
            .query_row(
                "SELECT id,title,description,status,progress,symbol,current_task,goal,is_current,device_id,created_at,updated_at,revision,deleted_at
                 FROM projects WHERE id=?1 AND deleted_at IS NULL",
                [&update.id],
                |row| {
                    let is_curr: i64 = row.get(8).unwrap_or(0);
                    Ok(Project {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        description: row.get(2)?,
                        status: row.get(3)?,
                        progress: row.get(4)?,
                        symbol: row.get(5)?,
                        current_task: row.get(6)?,
                        goal: row.get(7)?,
                        is_current: is_curr != 0,
                        device_id: row.get(9)?,
                        created_at: row.get(10)?,
                        updated_at: row.get(11)?,
                        revision: row.get(12)?,
                        deleted_at: row.get(13)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| {
                DatabaseError::Validation(format!("Project not found: {}", update.id))
            })?;

        let title = update.title.unwrap_or(existing.title);
        if title.trim().is_empty() {
            return Err(DatabaseError::Validation(
                "project title is required".into(),
            ));
        }
        let description = update.description.unwrap_or(existing.description);
        let status = update.status.unwrap_or(existing.status);
        let progress = update.progress.unwrap_or(existing.progress);
        if !(0..=100).contains(&progress) {
            return Err(DatabaseError::Validation(
                "project progress must be between 0 and 100".into(),
            ));
        }
        let symbol = update.symbol.unwrap_or(existing.symbol);
        let current_task = match update.current_task {
            Some(ct) => ct,
            None => existing.current_task,
        };
        let goal = match update.goal {
            Some(g) => g,
            None => existing.goal,
        };
        let is_current = update.is_current.unwrap_or(existing.is_current);

        if is_current {
            tx.execute(
                "UPDATE projects SET is_current = 0 WHERE id != ?1",
                [&update.id],
            )?;
        }

        let new_revision = existing.revision + 1;
        tx.execute(
            "UPDATE projects SET title=?1, description=?2, status=?3, progress=?4, symbol=?5, current_task=?6, goal=?7, is_current=?8, updated_at=?9, revision=?10 WHERE id=?11",
            params![
                title,
                description,
                status,
                progress,
                symbol,
                current_task,
                goal,
                if is_current { 1 } else { 0 },
                now,
                new_revision,
                update.id
            ],
        )?;

        let updated = Project {
            id: update.id,
            title,
            description,
            status,
            progress,
            symbol,
            current_task,
            goal,
            is_current,
            device_id: existing.device_id,
            created_at: existing.created_at,
            updated_at: now,
            revision: new_revision,
            deleted_at: None,
        };
        append_change_conn(
            &tx,
            "project",
            &updated.id,
            "update",
            updated.revision,
            serde_json::to_value(&updated)?,
        )?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn delete_project(&self, id: &str) -> Result<bool, DatabaseError> {
        let tx = self.begin_immediate()?;
        let now = Utc::now().to_rfc3339();
        let existing_rev: Option<i64> = tx
            .query_row(
                "SELECT revision FROM projects WHERE id=?1 AND deleted_at IS NULL",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(rev) = existing_rev else {
            return Ok(false);
        };
        let new_rev = rev + 1;
        let affected = tx.execute(
            "UPDATE projects SET deleted_at=?1, updated_at=?1, revision=?2 WHERE id=?3 AND deleted_at IS NULL",
            params![now, new_rev, id],
        )?;
        if affected > 0 {
            tx.execute(
                "UPDATE tasks SET deleted_at=?1, updated_at=?1 WHERE project_id=?2 AND deleted_at IS NULL",
                params![now, id],
            )?;
            append_change_conn(
                &tx,
                "project",
                id,
                "delete",
                new_rev,
                serde_json::json!({ "id": id, "deletedAt": now }),
            )?;
            tx.commit()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn set_current_project(&self, id: &str) -> Result<(), DatabaseError> {
        let tx = self.begin_immediate()?;
        let now = Utc::now().to_rfc3339();
        tx.execute("UPDATE projects SET is_current = 0", [])?;
        tx.execute(
            "UPDATE projects SET is_current = 1, updated_at = ?1, revision = revision + 1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now, id],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn create_idea(&self, input: CreateIdea) -> Result<Idea, DatabaseError> {
        let title = input.title.trim();
        if title.is_empty() {
            return Err(DatabaseError::Validation("idea title is required".into()));
        }
        let tx = self.begin_immediate()?;
        let now = Utc::now().to_rfc3339();
        let device_id = local_device_id_conn(&tx)?;
        let idea = Idea {
            id: Uuid::new_v4().to_string(),
            title: title.to_owned(),
            tag: input.tag,
            body: input.body,
            device_id,
            created_at: now.clone(),
            updated_at: now,
            revision: 1,
            deleted_at: None,
        };
        tx.execute(
            "INSERT INTO ideas(id,title,tag,body,device_id,created_at,updated_at,revision)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                idea.id,
                idea.title,
                idea.tag,
                idea.body,
                idea.device_id,
                idea.created_at,
                idea.updated_at,
                idea.revision
            ],
        )?;
        append_change_conn(
            &tx,
            "idea",
            &idea.id,
            "insert",
            idea.revision,
            serde_json::to_value(&idea)?,
        )?;
        tx.commit()?;
        Ok(idea)
    }

    pub fn update_idea(&self, update: UpdateIdea) -> Result<Idea, DatabaseError> {
        let tx = self.begin_immediate()?;
        let now = Utc::now().to_rfc3339();
        let existing = tx
            .query_row(
                "SELECT id,title,tag,body,device_id,created_at,updated_at,revision,deleted_at
                 FROM ideas WHERE id=?1 AND deleted_at IS NULL",
                [&update.id],
                |row| {
                    Ok(Idea {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        tag: row.get(2)?,
                        body: row.get(3)?,
                        device_id: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                        revision: row.get(7)?,
                        deleted_at: row.get(8)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| DatabaseError::Validation(format!("Idea not found: {}", update.id)))?;

        let title = update.title.unwrap_or(existing.title);
        if title.trim().is_empty() {
            return Err(DatabaseError::Validation("idea title is required".into()));
        }
        let tag = update.tag.unwrap_or(existing.tag);
        let body = update.body.unwrap_or(existing.body);
        let new_revision = existing.revision + 1;

        tx.execute(
            "UPDATE ideas SET title=?1, tag=?2, body=?3, updated_at=?4, revision=?5 WHERE id=?6",
            params![title, tag, body, now, new_revision, update.id],
        )?;

        let updated = Idea {
            id: update.id,
            title,
            tag,
            body,
            device_id: existing.device_id,
            created_at: existing.created_at,
            updated_at: now,
            revision: new_revision,
            deleted_at: None,
        };
        append_change_conn(
            &tx,
            "idea",
            &updated.id,
            "update",
            updated.revision,
            serde_json::to_value(&updated)?,
        )?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn delete_idea(&self, id: &str) -> Result<bool, DatabaseError> {
        let tx = self.begin_immediate()?;
        let now = Utc::now().to_rfc3339();
        let existing_rev: Option<i64> = tx
            .query_row(
                "SELECT revision FROM ideas WHERE id=?1 AND deleted_at IS NULL",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(rev) = existing_rev else {
            return Ok(false);
        };
        let new_rev = rev + 1;
        let affected = tx.execute(
            "UPDATE ideas SET deleted_at=?1, updated_at=?1, revision=?2 WHERE id=?3 AND deleted_at IS NULL",
            params![now, new_rev, id],
        )?;
        if affected > 0 {
            append_change_conn(
                &tx,
                "idea",
                id,
                "delete",
                new_rev,
                serde_json::json!({ "id": id, "deletedAt": now }),
            )?;
            tx.commit()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn promote_idea_to_project(&self, idea_id: &str) -> Result<Project, DatabaseError> {
        let tx = self.begin_immediate()?;
        let (title, body, idea_rev) = tx
            .query_row(
                "SELECT title, body, revision FROM ideas WHERE id=?1 AND deleted_at IS NULL",
                [idea_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| {
                DatabaseError::Validation(format!("Idea not found: {}", idea_id))
            })?;

        let trimmed_title = title.trim();
        if trimmed_title.is_empty() {
            return Err(DatabaseError::Validation(
                "project title is required".into(),
            ));
        }

        let now = Utc::now().to_rfc3339();
        let device_id = local_device_id_conn(&tx)?;
        let project = Project {
            id: Uuid::new_v4().to_string(),
            title: trimmed_title.to_owned(),
            description: body.trim().to_owned(),
            status: "قيد التنفيذ".into(),
            progress: 0,
            symbol: "✦".into(),
            current_task: None,
            goal: None,
            is_current: false,
            device_id,
            created_at: now.clone(),
            updated_at: now.clone(),
            revision: 1,
            deleted_at: None,
        };
        tx.execute(
            "INSERT INTO projects(id,title,description,status,progress,symbol,current_task,goal,is_current,device_id,created_at,updated_at,revision)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                project.id,
                project.title,
                project.description,
                project.status,
                project.progress,
                project.symbol,
                project.current_task,
                project.goal,
                0,
                project.device_id,
                project.created_at,
                project.updated_at,
                project.revision
            ],
        )?;
        append_change_conn(
            &tx,
            "project",
            &project.id,
            "insert",
            project.revision,
            serde_json::to_value(&project)?,
        )?;

        let next_idea_rev = idea_rev + 1;
        let deleted = tx.execute(
            "UPDATE ideas SET deleted_at=?1, updated_at=?1, revision=?2 WHERE id=?3 AND deleted_at IS NULL",
            params![now, next_idea_rev, idea_id],
        )?;
        if deleted == 0 {
            return Err(DatabaseError::Validation(format!(
                "Idea already deleted: {}",
                idea_id
            )));
        }
        append_change_conn(
            &tx,
            "idea",
            idea_id,
            "delete",
            next_idea_rev,
            serde_json::json!({ "id": idea_id, "deletedAt": now }),
        )?;

        tx.commit()?;
        Ok(project)
    }

    pub fn save_work_session(
        &self,
        record: WorkSessionRecord,
    ) -> Result<WorkSessionRecord, DatabaseError> {
        self.connection.execute(
            "INSERT INTO work_session_records(id, project_id, project_title, duration_secs, started_at, ended_at, note)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
               project_id=excluded.project_id,
               project_title=excluded.project_title,
               duration_secs=excluded.duration_secs,
               started_at=excluded.started_at,
               ended_at=excluded.ended_at,
               note=excluded.note",
            params![
                record.id,
                record.project_id,
                record.project_title,
                record.duration_secs,
                record.started_at,
                record.ended_at,
                record.note
            ],
        )?;
        Ok(record)
    }

    pub fn list_work_sessions(
        &self,
        limit: usize,
    ) -> Result<Vec<WorkSessionRecord>, DatabaseError> {
        let mut stmt = self.connection.prepare(
            "SELECT id, project_id, project_title, duration_secs, started_at, ended_at, note
             FROM work_session_records ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([i64::try_from(limit).unwrap_or(i64::MAX)], |row| {
            Ok(WorkSessionRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                project_title: row.get(2)?,
                duration_secs: row.get(3)?,
                started_at: row.get(4)?,
                ended_at: row.get(5)?,
                note: row.get(6)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn get_daily_worship(
        &self,
        date: &str,
    ) -> Result<Option<DailyWorshipRecord>, DatabaseError> {
        let mut stmt = self.connection.prepare(
            "SELECT date, fajr, sunrise, dhuhr, asr, maghrib, isha, fasting, note, updated_at
             FROM daily_worship_logs WHERE date=?1",
        )?;
        let record = stmt
            .query_row([date], |row| {
                Ok(DailyWorshipRecord {
                    date: row.get(0)?,
                    fajr: row.get::<_, i64>(1)? != 0,
                    sunrise: row.get::<_, i64>(2)? != 0,
                    dhuhr: row.get::<_, i64>(3)? != 0,
                    asr: row.get::<_, i64>(4)? != 0,
                    maghrib: row.get::<_, i64>(5)? != 0,
                    isha: row.get::<_, i64>(6)? != 0,
                    fasting: row.get::<_, i64>(7)? != 0,
                    note: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .optional()?;
        Ok(record)
    }

    pub fn set_daily_worship(&self, record: DailyWorshipRecord) -> Result<(), DatabaseError> {
        self.connection.execute(
            "INSERT INTO daily_worship_logs(date, fajr, sunrise, dhuhr, asr, maghrib, isha, fasting, note, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(date) DO UPDATE SET
               fajr=excluded.fajr,
               sunrise=excluded.sunrise,
               dhuhr=excluded.dhuhr,
               asr=excluded.asr,
               maghrib=excluded.maghrib,
               isha=excluded.isha,
               fasting=excluded.fasting,
               note=excluded.note,
               updated_at=excluded.updated_at",
            params![
                record.date,
                if record.fajr { 1 } else { 0 },
                if record.sunrise { 1 } else { 0 },
                if record.dhuhr { 1 } else { 0 },
                if record.asr { 1 } else { 0 },
                if record.maghrib { 1 } else { 0 },
                if record.isha { 1 } else { 0 },
                if record.fasting { 1 } else { 0 },
                record.note,
                record.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_history_range(
        &self,
        days: u32,
    ) -> Result<Vec<DailyWorshipRecord>, DatabaseError> {
        let mut stmt = self.connection.prepare(
            "SELECT date, fajr, sunrise, dhuhr, asr, maghrib, isha, fasting, note, updated_at
             FROM daily_worship_logs ORDER BY date DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([days], |row| {
            Ok(DailyWorshipRecord {
                date: row.get(0)?,
                fajr: row.get::<_, i64>(1)? != 0,
                sunrise: row.get::<_, i64>(2)? != 0,
                dhuhr: row.get::<_, i64>(3)? != 0,
                asr: row.get::<_, i64>(4)? != 0,
                maghrib: row.get::<_, i64>(5)? != 0,
                isha: row.get::<_, i64>(6)? != 0,
                fasting: row.get::<_, i64>(7)? != 0,
                note: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn kv_get(&self, key: &str) -> Result<Option<String>, DatabaseError> {
        let value = self
            .connection
            .query_row(
                "SELECT value_json FROM domain_kv_store WHERE key=?1",
                [key],
                |row| row.get(0),
            )
            .optional()?;
        Ok(value)
    }

    pub fn kv_set(&self, key: &str, value_json: &str) -> Result<(), DatabaseError> {
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO domain_kv_store(key, value_json, updated_at) VALUES(?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
            params![key, value_json, now],
        )?;
        Ok(())
    }

    pub fn export_backup(&self) -> Result<String, DatabaseError> {
        let prefs = self.get_preferences()?;
        let projects = self.projects()?;
        let ideas = self.ideas()?;

        // Export ALL work_session_records without silent 1000-row cap.
        let work_sessions = {
            let mut stmt = self.connection.prepare(
                "SELECT id, project_id, project_title, duration_secs, started_at, ended_at, note
                 FROM work_session_records ORDER BY started_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(WorkSessionRecord {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    project_title: row.get(2)?,
                    duration_secs: row.get(3)?,
                    started_at: row.get(4)?,
                    ended_at: row.get(5)?,
                    note: row.get(6)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        // Export ALL daily_worship_logs without silent 365-day cap.
        let history = {
            let mut stmt = self.connection.prepare(
                "SELECT date, fajr, sunrise, dhuhr, asr, maghrib, isha, fasting, note, updated_at
                 FROM daily_worship_logs ORDER BY date DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(DailyWorshipRecord {
                    date: row.get(0)?,
                    fajr: row.get::<_, i64>(1)? != 0,
                    sunrise: row.get::<_, i64>(2)? != 0,
                    dhuhr: row.get::<_, i64>(3)? != 0,
                    asr: row.get::<_, i64>(4)? != 0,
                    maghrib: row.get::<_, i64>(5)? != 0,
                    isha: row.get::<_, i64>(6)? != 0,
                    fasting: row.get::<_, i64>(7)? != 0,
                    note: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let tasks = {
            let mut stmt = self.connection.prepare(
                "SELECT id, project_id, title, notes, status, position, due_at, completed_at, device_id, created_at, updated_at, revision
                 FROM tasks WHERE deleted_at IS NULL ORDER BY position ASC, updated_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(BackupTask {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    notes: row.get(3)?,
                    status: row.get(4)?,
                    position: row.get(5)?,
                    due_at: row.get(6)?,
                    completed_at: row.get(7)?,
                    device_id: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                    revision: row.get(11)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let prayer_logs = {
            let mut stmt = self.connection.prepare(
                "SELECT id, prayer_date, prayer_name, status, marked_at, device_id, created_at, updated_at, revision
                 FROM prayer_logs WHERE deleted_at IS NULL ORDER BY prayer_date DESC, prayer_name ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(BackupPrayerLog {
                    id: row.get(0)?,
                    prayer_date: row.get(1)?,
                    prayer_name: row.get(2)?,
                    status: row.get(3)?,
                    marked_at: row.get(4)?,
                    device_id: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                    revision: row.get(8)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let fasting_entries = {
            let mut stmt = self.connection.prepare(
                "SELECT id, kind, label, target_date, status, device_id, created_at, updated_at, revision
                 FROM fasting_entries WHERE deleted_at IS NULL ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(BackupFastingEntry {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    label: row.get(2)?,
                    target_date: row.get(3)?,
                    status: row.get(4)?,
                    device_id: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                    revision: row.get(8)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let daily_logs = {
            let mut stmt = self.connection.prepare(
                "SELECT id, log_date, payload_json, device_id, created_at, updated_at, revision
                 FROM daily_logs WHERE deleted_at IS NULL ORDER BY log_date DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(BackupDailyLog {
                    id: row.get(0)?,
                    log_date: row.get(1)?,
                    payload_json: row.get(2)?,
                    device_id: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    revision: row.get(6)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let notification_history = {
            let mut stmt = self.connection.prepare(
                "SELECT id, title, body, kind, status, error_message, created_at, read_at
                 FROM notification_history ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(NotificationRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    kind: row.get(3)?,
                    status: row.get(4)?,
                    error_message: row.get(5)?,
                    created_at: row.get(6)?,
                    read_at: row.get(7)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut kv_items = BTreeMap::new();
        {
            let mut stmt = self
                .connection
                .prepare("SELECT key, value_json FROM domain_kv_store ORDER BY key ASC")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            for item in rows {
                let (k, v) = item?;
                kv_items.insert(k, v);
            }
        }

        let backup = serde_json::json!({
            "format": BACKUP_SNAPSHOT_FORMAT,
            "version": CURRENT_SCHEMA_VERSION,
            "exportedAt": Utc::now().to_rfc3339(),
            "settings": prefs,
            "projects": projects,
            "tasks": tasks,
            "ideas": ideas,
            "workSessions": work_sessions,
            "dailyWorship": history,
            "prayerLogs": prayer_logs,
            "fastingEntries": fasting_entries,
            "dailyLogs": daily_logs,
            "notificationHistory": notification_history,
            "kv": kv_items,
        });
        Ok(serde_json::to_string_pretty(&backup)?)
    }

    pub fn restore_backup(&self, payload_json: &str) -> Result<(), DatabaseError> {
        let val: Value = serde_json::from_str(payload_json)?;
        let Some(obj) = val.as_object() else {
            return Err(DatabaseError::Validation(
                "backup payload must be a JSON object".into(),
            ));
        };
        if obj.is_empty() {
            return Err(DatabaseError::Validation(
                "backup payload cannot be empty".into(),
            ));
        }

        let version = if let Some(version_val) = obj.get("version") {
            let Some(v) = version_val.as_i64() else {
                return Err(DatabaseError::Validation(
                    "backup version must be an integer".into(),
                ));
            };
            if !(1..=CURRENT_SCHEMA_VERSION).contains(&v) {
                return Err(DatabaseError::Validation(format!(
                    "unsupported backup version: {v}"
                )));
            }
            Some(v)
        } else {
            None
        };

        // Earlier native exports did not include a format marker. Their complete field
        // set distinguishes them from legacy imports that only update selected domains.
        let complete_snapshot = version.is_some_and(|v| v >= 3)
            && BACKUP_SNAPSHOT_FIELDS.iter().all(|field| obj.contains_key(*field));
        let has_snapshot_marker = obj.get("format").and_then(Value::as_str) == Some(BACKUP_SNAPSHOT_FORMAT);
        if has_snapshot_marker && !complete_snapshot {
            return Err(DatabaseError::Validation("native backup is incomplete".into()));
        }

        let mut has_non_empty_recognized = false;

        let parsed_settings = if let Some(settings_val) = obj.get("settings") {
            if !settings_val.is_object() {
                return Err(DatabaseError::Validation(
                    "backup field 'settings' must be a JSON object".into(),
                ));
            }
            let prefs: AppPreferences = serde_json::from_value(settings_val.clone())
                .map_err(|e| DatabaseError::Validation(format!("invalid backup settings: {e}")))?;
            prefs.validate().map_err(DatabaseError::Validation)?;
            has_non_empty_recognized = true;
            Some(prefs)
        } else {
            None
        };

        fn parse_typed_array<T: serde::de::DeserializeOwned>(
            obj: &serde_json::Map<String, Value>,
            primary: &str,
            alias: Option<&str>,
            has_non_empty: &mut bool,
        ) -> Result<Option<Vec<T>>, DatabaseError> {
            let raw = obj
                .get(primary)
                .or_else(|| alias.and_then(|a| obj.get(a)));
            let Some(field_val) = raw else {
                return Ok(None);
            };
            let Some(arr) = field_val.as_array() else {
                return Err(DatabaseError::Validation(format!(
                    "backup field '{primary}' must be an array"
                )));
            };
            let mut out = Vec::with_capacity(arr.len());
            for (idx, item) in arr.iter().enumerate() {
                let parsed: T = serde_json::from_value(item.clone()).map_err(|e| {
                    DatabaseError::Validation(format!(
                        "invalid item at '{primary}[{idx}]': {e}"
                    ))
                })?;
                out.push(parsed);
            }
            if !out.is_empty() {
                *has_non_empty = true;
            }
            Ok(Some(out))
        }

        let parsed_projects: Option<Vec<Project>> =
            parse_typed_array(obj, "projects", None, &mut has_non_empty_recognized)?;
        if let Some(ref projects) = parsed_projects {
            for (idx, p) in projects.iter().enumerate() {
                if !(0..=100).contains(&p.progress) {
                    return Err(DatabaseError::Validation(format!(
                        "invalid progress at 'projects[{idx}]': {}",
                        p.progress
                    )));
                }
            }
        }
        let parsed_tasks: Option<Vec<BackupTask>> =
            parse_typed_array(obj, "tasks", None, &mut has_non_empty_recognized)?;
        let parsed_ideas: Option<Vec<Idea>> =
            parse_typed_array(obj, "ideas", None, &mut has_non_empty_recognized)?;
        let parsed_sessions: Option<Vec<WorkSessionRecord>> = parse_typed_array(
            obj,
            "workSessions",
            Some("work_session_records"),
            &mut has_non_empty_recognized,
        )?;
        let parsed_worship: Option<Vec<DailyWorshipRecord>> = parse_typed_array(
            obj,
            "dailyWorship",
            Some("daily_worship_logs"),
            &mut has_non_empty_recognized,
        )?;
        let parsed_prayer_logs: Option<Vec<BackupPrayerLog>> = parse_typed_array(
            obj,
            "prayerLogs",
            Some("prayer_logs"),
            &mut has_non_empty_recognized,
        )?;
        let parsed_fasting: Option<Vec<BackupFastingEntry>> = parse_typed_array(
            obj,
            "fastingEntries",
            Some("fasting_entries"),
            &mut has_non_empty_recognized,
        )?;
        let parsed_daily_logs: Option<Vec<BackupDailyLog>> = parse_typed_array(
            obj,
            "dailyLogs",
            Some("daily_logs"),
            &mut has_non_empty_recognized,
        )?;
        let parsed_notifications: Option<Vec<NotificationRecord>> = parse_typed_array(
            obj,
            "notificationHistory",
            Some("notification_history"),
            &mut has_non_empty_recognized,
        )?;

        let parsed_kv = if let Some(kv_val) = obj
            .get("kv")
            .or_else(|| obj.get("domain_kv_store"))
        {
            let Some(map) = kv_val.as_object() else {
                return Err(DatabaseError::Validation(
                    "backup field 'kv' must be a JSON object".into(),
                ));
            };
            if !map.is_empty() {
                has_non_empty_recognized = true;
            }
            let mut entries = Vec::with_capacity(map.len());
            for (k, v) in map {
                let v_str = if let Some(s) = v.as_str() {
                    s.to_string()
                } else {
                    v.to_string()
                };
                entries.push((k.clone(), v_str));
            }
            Some(entries)
        } else {
            None
        };

        if !has_non_empty_recognized {
            return Err(DatabaseError::Validation(
                "backup payload must include settings or at least one recognized non-empty backup field".into(),
            ));
        }

        let tx = self.begin_immediate()?;
        let now = Utc::now().to_rfc3339();

        if complete_snapshot {
            tx.execute_batch(
                "DELETE FROM work_sessions;
                 DELETE FROM tasks;
                 DELETE FROM projects;
                 DELETE FROM ideas;
                 DELETE FROM work_session_records;
                 DELETE FROM daily_worship_logs;
                 DELETE FROM prayer_logs;
                 DELETE FROM fasting_entries;
                 DELETE FROM daily_logs;
                 DELETE FROM notification_history;
                 DELETE FROM domain_kv_store;
                 DELETE FROM app_state WHERE key='root';
                 DELETE FROM settings WHERE key='__legacy_snapshot_dirty';
                 DELETE FROM change_journal WHERE entity_type IN ('project','idea');",
            )?;
        }

        if let Some(ref prefs) = parsed_settings {
            let json_str = serde_json::to_string(prefs)?;
            tx.execute(
                "INSERT INTO settings(key, value_json, updated_at) VALUES('app_preferences', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
                params![json_str, now],
            )?;
        }

        if let Some(projects) = parsed_projects {
            if projects.iter().any(|p| p.is_current) {
                tx.execute("UPDATE projects SET is_current = 0", [])?;
            }
            for proj in projects {
                tx.execute(
                    "INSERT INTO projects(id,title,description,status,progress,symbol,current_task,goal,is_current,device_id,created_at,updated_at,revision,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL)
                     ON CONFLICT(id) DO UPDATE SET
                       title=excluded.title,
                       description=excluded.description,
                       status=excluded.status,
                       progress=excluded.progress,
                       symbol=excluded.symbol,
                       current_task=excluded.current_task,
                       goal=excluded.goal,
                       is_current=excluded.is_current,
                       device_id=excluded.device_id,
                       updated_at=excluded.updated_at,
                       revision=excluded.revision,
                       deleted_at=NULL",
                    params![
                        proj.id,
                        proj.title,
                        proj.description,
                        proj.status,
                        proj.progress,
                        proj.symbol,
                        proj.current_task,
                        proj.goal,
                        if proj.is_current { 1 } else { 0 },
                        proj.device_id,
                        proj.created_at,
                        proj.updated_at,
                        proj.revision
                    ],
                )?;
            }
        }

        if let Some(tasks) = parsed_tasks {
            for task in tasks {
                tx.execute(
                    "INSERT INTO tasks(id,project_id,title,notes,status,position,due_at,completed_at,device_id,created_at,updated_at,revision,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,NULL)
                     ON CONFLICT(id) DO UPDATE SET
                       project_id=excluded.project_id,
                       title=excluded.title,
                       notes=excluded.notes,
                       status=excluded.status,
                       position=excluded.position,
                       due_at=excluded.due_at,
                       completed_at=excluded.completed_at,
                       device_id=excluded.device_id,
                       updated_at=excluded.updated_at,
                       revision=excluded.revision,
                       deleted_at=NULL",
                    params![
                        task.id,
                        task.project_id,
                        task.title,
                        task.notes,
                        task.status,
                        task.position,
                        task.due_at,
                        task.completed_at,
                        task.device_id,
                        task.created_at,
                        task.updated_at,
                        task.revision
                    ],
                )?;
            }
        }

        if let Some(ideas) = parsed_ideas {
            for idea in ideas {
                tx.execute(
                    "INSERT INTO ideas(id,title,tag,body,device_id,created_at,updated_at,revision,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,NULL)
                     ON CONFLICT(id) DO UPDATE SET
                       title=excluded.title,
                       tag=excluded.tag,
                       body=excluded.body,
                       device_id=excluded.device_id,
                       updated_at=excluded.updated_at,
                       revision=excluded.revision,
                       deleted_at=NULL",
                    params![
                        idea.id,
                        idea.title,
                        idea.tag,
                        idea.body,
                        idea.device_id,
                        idea.created_at,
                        idea.updated_at,
                        idea.revision
                    ],
                )?;
            }
        }

        if let Some(sessions) = parsed_sessions {
            for rec in sessions {
                tx.execute(
                    "INSERT INTO work_session_records(id, project_id, project_title, duration_secs, started_at, ended_at, note)
                     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(id) DO UPDATE SET
                       project_id=excluded.project_id,
                       project_title=excluded.project_title,
                       duration_secs=excluded.duration_secs,
                       started_at=excluded.started_at,
                       ended_at=excluded.ended_at,
                       note=excluded.note",
                    params![
                        rec.id,
                        rec.project_id,
                        rec.project_title,
                        rec.duration_secs,
                        rec.started_at,
                        rec.ended_at,
                        rec.note
                    ],
                )?;
            }
        }

        if let Some(worship_days) = parsed_worship {
            for rec in worship_days {
                tx.execute(
                    "INSERT INTO daily_worship_logs(date, fajr, sunrise, dhuhr, asr, maghrib, isha, fasting, note, updated_at)
                     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                     ON CONFLICT(date) DO UPDATE SET
                       fajr=excluded.fajr,
                       sunrise=excluded.sunrise,
                       dhuhr=excluded.dhuhr,
                       asr=excluded.asr,
                       maghrib=excluded.maghrib,
                       isha=excluded.isha,
                       fasting=excluded.fasting,
                       note=excluded.note,
                       updated_at=excluded.updated_at",
                    params![
                        rec.date,
                        if rec.fajr { 1 } else { 0 },
                        if rec.sunrise { 1 } else { 0 },
                        if rec.dhuhr { 1 } else { 0 },
                        if rec.asr { 1 } else { 0 },
                        if rec.maghrib { 1 } else { 0 },
                        if rec.isha { 1 } else { 0 },
                        if rec.fasting { 1 } else { 0 },
                        rec.note,
                        rec.updated_at
                    ],
                )?;
            }
        }

        if let Some(prayer_logs) = parsed_prayer_logs {
            for pl in prayer_logs {
                tx.execute(
                    "DELETE FROM prayer_logs WHERE prayer_date=?1 AND prayer_name=?2 AND id != ?3",
                    params![pl.prayer_date, pl.prayer_name, pl.id],
                )?;
                tx.execute(
                    "INSERT INTO prayer_logs(id,prayer_date,prayer_name,status,marked_at,device_id,created_at,updated_at,revision,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL)
                     ON CONFLICT(id) DO UPDATE SET
                       prayer_date=excluded.prayer_date,
                       prayer_name=excluded.prayer_name,
                       status=excluded.status,
                       marked_at=excluded.marked_at,
                       device_id=excluded.device_id,
                       updated_at=excluded.updated_at,
                       revision=excluded.revision,
                       deleted_at=NULL",
                    params![
                        pl.id,
                        pl.prayer_date,
                        pl.prayer_name,
                        pl.status,
                        pl.marked_at,
                        pl.device_id,
                        pl.created_at,
                        pl.updated_at,
                        pl.revision
                    ],
                )?;
            }
        }

        if let Some(fasting_entries) = parsed_fasting {
            for fe in fasting_entries {
                tx.execute(
                    "INSERT INTO fasting_entries(id,kind,label,target_date,status,device_id,created_at,updated_at,revision,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL)
                     ON CONFLICT(id) DO UPDATE SET
                       kind=excluded.kind,
                       label=excluded.label,
                       target_date=excluded.target_date,
                       status=excluded.status,
                       device_id=excluded.device_id,
                       updated_at=excluded.updated_at,
                       revision=excluded.revision,
                       deleted_at=NULL",
                    params![
                        fe.id,
                        fe.kind,
                        fe.label,
                        fe.target_date,
                        fe.status,
                        fe.device_id,
                        fe.created_at,
                        fe.updated_at,
                        fe.revision
                    ],
                )?;
            }
        }

        if let Some(daily_logs) = parsed_daily_logs {
            for dl in daily_logs {
                tx.execute(
                    "DELETE FROM daily_logs WHERE log_date=?1 AND id != ?2",
                    params![dl.log_date, dl.id],
                )?;
                tx.execute(
                    "INSERT INTO daily_logs(id,log_date,payload_json,device_id,created_at,updated_at,revision,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,NULL)
                     ON CONFLICT(id) DO UPDATE SET
                       log_date=excluded.log_date,
                       payload_json=excluded.payload_json,
                       device_id=excluded.device_id,
                       updated_at=excluded.updated_at,
                       revision=excluded.revision,
                       deleted_at=NULL",
                    params![
                        dl.id,
                        dl.log_date,
                        dl.payload_json,
                        dl.device_id,
                        dl.created_at,
                        dl.updated_at,
                        dl.revision
                    ],
                )?;
            }
        }

        if let Some(notifs) = parsed_notifications {
            for rec in notifs {
                tx.execute(
                    "INSERT INTO notification_history(id, title, body, kind, status, error_message, created_at, read_at)
                     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                     ON CONFLICT(id) DO UPDATE SET
                       title=excluded.title,
                       body=excluded.body,
                       kind=excluded.kind,
                       status=excluded.status,
                       error_message=excluded.error_message,
                       created_at=excluded.created_at,
                       read_at=excluded.read_at",
                    params![
                        rec.id,
                        rec.title,
                        rec.body,
                        rec.kind,
                        rec.status,
                        rec.error_message,
                        rec.created_at,
                        rec.read_at
                    ],
                )?;
            }
        }

        if let Some(kv_entries) = parsed_kv {
            for (k, v_str) in kv_entries {
                tx.execute(
                    "INSERT INTO domain_kv_store(key, value_json, updated_at) VALUES(?1, ?2, ?3)
                     ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
                    params![k, v_str, now],
                )?;
            }
        }

        if complete_snapshot && !has_snapshot_marker {
            sync_legacy_worship_rows(&tx, true)?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn factory_reset(&self) -> Result<(), DatabaseError> {
        let tx = self.begin_immediate()?;
        tx.execute_batch(
            "DELETE FROM work_sessions;
             DELETE FROM tasks;
             DELETE FROM projects;
             DELETE FROM ideas;
             DELETE FROM prayer_logs;
             DELETE FROM fasting_entries;
             DELETE FROM marketing_entries;
             DELETE FROM daily_logs;
             DELETE FROM daily_worship_logs;
             DELETE FROM work_session_records;
             DELETE FROM domain_kv_store;
             DELETE FROM notification_history;
             DELETE FROM change_journal;
             DELETE FROM agent_jobs;
             DELETE FROM legacy_backups;
             DELETE FROM profiles;
             DELETE FROM sync_peers;
             DELETE FROM app_state;
             DELETE FROM settings;",
        )?;
        let _ = ensure_local_device(&tx)?;
        let defaults = AppPreferences::default();
        let now = Utc::now().to_rfc3339();
        let json_str = serde_json::to_string(&defaults)?;
        tx.execute(
            "INSERT INTO settings(key, value_json, updated_at) VALUES('app_preferences', ?1, ?2)",
            params![json_str, now],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn projects(&self) -> Result<Vec<Project>, DatabaseError> {
        let mut statement = self.connection.prepare(
            "SELECT id,title,description,status,progress,symbol,current_task,goal,is_current,device_id,created_at,updated_at,revision,deleted_at
             FROM projects WHERE deleted_at IS NULL ORDER BY is_current DESC, updated_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            let is_curr: i64 = row.get(8).unwrap_or(0);
            Ok(Project {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                status: row.get(3)?,
                progress: row.get(4)?,
                symbol: row.get(5)?,
                current_task: row.get(6)?,
                goal: row.get(7)?,
                is_current: is_curr != 0,
                device_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                revision: row.get(12)?,
                deleted_at: row.get(13)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn ideas(&self) -> Result<Vec<Idea>, DatabaseError> {
        let mut statement = self.connection.prepare(
            "SELECT id,title,tag,body,device_id,created_at,updated_at,revision,deleted_at
             FROM ideas WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(Idea {
                id: row.get(0)?,
                title: row.get(1)?,
                tag: row.get(2)?,
                body: row.get(3)?,
                device_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                revision: row.get(7)?,
                deleted_at: row.get(8)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn get_preferences(&self) -> Result<AppPreferences, DatabaseError> {
        if let Some(raw) = self
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = 'app_preferences'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
        {
            if let Ok(prefs) = serde_json::from_str::<AppPreferences>(&raw) {
                return Ok(prefs);
            }
        }
        let settings_val = self.settings()?;
        let prefs = migrate_legacy_settings(&settings_val);
        let _ = self.save_preferences(&prefs);
        Ok(prefs)
    }

    pub fn save_preferences(&self, prefs: &AppPreferences) -> Result<(), DatabaseError> {
        prefs.validate().map_err(DatabaseError::Validation)?;
        let now = Utc::now().to_rfc3339();
        let json_str = serde_json::to_string(prefs)?;
        self.connection.execute(
            "INSERT INTO settings(key, value_json, updated_at) VALUES('app_preferences', ?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            params![json_str, now],
        )?;
        Ok(())
    }

    pub fn update_legacy_root_settings(&self, prefs: &AppPreferences) -> Result<(), DatabaseError> {
        let raw: Option<String> = self
            .connection
            .query_row(
                "SELECT value FROM app_state WHERE key = 'root'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let mut root: Value = match raw {
            Some(ref s) => serde_json::from_str(s).unwrap_or_else(|_| serde_json::json!({})),
            None => serde_json::json!({}),
        };
        if !root.is_object() {
            root = serde_json::json!({});
        }
        let settings_obj = root
            .as_object_mut()
            .unwrap()
            .entry("settings")
            .or_insert_with(|| serde_json::json!({}));
        if !settings_obj.is_object() {
            *settings_obj = serde_json::json!({});
        }
        if let Some(target) = settings_obj.as_object_mut() {
            let prefs_val = serde_json::to_value(prefs)?;
            if let Some(src) = prefs_val.as_object() {
                for (k, v) in src {
                    target.insert(k.clone(), v.clone());
                }
            }
            target.insert("themeAccent".to_string(), Value::String(prefs.accent_id.as_str().to_string()));
        }
        let serialized = serde_json::to_string(&root)?;
        self.connection.execute(
            "INSERT INTO app_state(key, value, updated_at) VALUES('root', ?1, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
            [&serialized],
        )?;
        Ok(())
    }

    pub fn insert_notification_record(
        &self,
        record: &NotificationRecord,
    ) -> Result<(), DatabaseError> {
        self.connection.execute(
            "INSERT INTO notification_history(id, title, body, kind, status, error_message, created_at, read_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                error_message = excluded.error_message,
                read_at = excluded.read_at",
            params![
                record.id,
                record.title,
                record.body,
                record.kind,
                record.status,
                record.error_message,
                record.created_at,
                record.read_at
            ],
        )?;
        Ok(())
    }

    pub fn list_notification_records(
        &self,
        limit: usize,
    ) -> Result<Vec<NotificationRecord>, DatabaseError> {
        let limit = limit.clamp(1, 500) as i64;
        let mut stmt = self.connection.prepare(
            "SELECT id, title, body, kind, status, error_message, created_at, read_at
             FROM notification_history
             ORDER BY created_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map([i64::try_from(limit).unwrap_or(i64::MAX)], |row| {
            Ok(NotificationRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                kind: row.get(3)?,
                status: row.get(4)?,
                error_message: row.get(5)?,
                created_at: row.get(6)?,
                read_at: row.get(7)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn mark_notification_read(&self, id: &str) -> Result<(), DatabaseError> {
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "UPDATE notification_history SET read_at = ?1 WHERE id = ?2 AND read_at IS NULL",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn mark_all_notifications_read(&self) -> Result<(), DatabaseError> {
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "UPDATE notification_history SET read_at = ?1 WHERE read_at IS NULL",
            params![now],
        )?;
        Ok(())
    }

    pub fn unread_notifications_count(&self) -> Result<usize, DatabaseError> {
        let count: i64 = self.connection.query_row(
            "SELECT COUNT(*) FROM notification_history WHERE read_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }

    fn settings(&self) -> Result<Value, DatabaseError> {
        let mut statement = self
            .connection
            .prepare("SELECT key,value_json FROM settings ORDER BY key")?;
        let pairs = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut map = serde_json::Map::new();
        for pair in pairs {
            let (key, value) = pair?;
            map.insert(key, serde_json::from_str(&value)?);
        }
        Ok(Value::Object(map))
    }

    fn local_device_id(&self) -> Result<String, DatabaseError> {
        local_device_id_conn(&self.connection)
    }
}

fn local_device_id_conn(conn: &Connection) -> Result<String, DatabaseError> {
    Ok(conn.query_row(
        "SELECT id FROM devices WHERE is_local=1 LIMIT 1",
        [],
        |row| row.get(0),
    )?)
}

fn append_change_conn(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    operation: &str,
    revision: i64,
    payload: Value,
) -> Result<(), DatabaseError> {
    let now = Utc::now().to_rfc3339();
    let device_id = local_device_id_conn(conn)?;
    let device_prefix: String = device_id.chars().take(8).collect();
    let hlc = format!("{}-0-{}", Utc::now().timestamp_millis(), device_prefix);
    conn.execute(
        "INSERT INTO change_journal(id,entity_type,entity_id,operation,device_id,hlc,revision,payload_json,created_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            Uuid::new_v4().to_string(),
            entity_type,
            entity_id,
            operation,
            device_id,
            hlc,
            revision,
            payload.to_string(),
            now
        ],
    )?;
    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, DatabaseError> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        [name],
        |r| r.get(0),
    )?)
}

fn ensure_legacy_tables(connection: &Connection) -> Result<(), DatabaseError> {
    if table_exists(connection, "schema_migrations")? && table_exists(connection, "app_state")? {
        return Ok(());
    }
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
         CREATE TABLE IF NOT EXISTS app_state(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);"
    )?;
    Ok(())
}

fn ensure_vnext_tables(connection: &Connection) -> Result<(), DatabaseError> {
    if table_exists(connection, "notification_history")? {
        return Ok(());
    }
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS notification_history (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT,
            created_at TEXT NOT NULL,
            read_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at DESC);"
    )?;
    Ok(())
}

fn read_settings_map_conn(conn: &Connection) -> Result<Value, DatabaseError> {
    let mut statement = conn.prepare("SELECT key,value_json FROM settings ORDER BY key")?;
    let pairs = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = serde_json::Map::new();
    for pair in pairs {
        let (key, value) = pair?;
        if let Ok(parsed) = serde_json::from_str::<Value>(&value) {
            map.insert(key, parsed);
        }
    }
    Ok(Value::Object(map))
}

fn v3_already_ready(conn: &Connection) -> Result<bool, DatabaseError> {
    let has_v3_row: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version >= 3)",
        [],
        |r| r.get(0),
    )?;
    if !has_v3_row
        || !table_exists(conn, "daily_worship_logs")?
        || !table_exists(conn, "work_session_records")?
        || !table_exists(conn, "domain_kv_store")?
    {
        return Ok(false);
    }
    let has_goal: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name IN ('goal','is_current')",
        [],
        |r| r.get::<_, i64>(0),
    )? == 2;
    if !has_goal {
        return Ok(false);
    }
    // Check if legacy work_sessions or daily_logs still need one-time migration into v3 tables.
    let v3_sessions: i64 =
        conn.query_row("SELECT COUNT(*) FROM work_session_records", [], |r| r.get(0))?;
    if v3_sessions == 0 {
        let legacy_sessions: i64 = conn.query_row(
            "SELECT COUNT(*) FROM work_sessions WHERE deleted_at IS NULL",
            [],
            |r| r.get(0),
        )?;
        if legacy_sessions > 0 {
            return Ok(false);
        }
    }
    let v3_worship: i64 =
        conn.query_row("SELECT COUNT(*) FROM daily_worship_logs", [], |r| r.get(0))?;
    if v3_worship == 0 {
        let legacy_days: i64 = conn.query_row(
            "SELECT COUNT(*) FROM daily_logs WHERE deleted_at IS NULL",
            [],
            |r| r.get(0),
        )?;
        if legacy_days > 0 {
            return Ok(false);
        }
    }
    // Check if onboarding flag upgrade is still pending.
    let existing_prefs_raw: Option<String> = conn
        .query_row(
            "SELECT value_json FROM settings WHERE key = 'app_preferences'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(raw) = existing_prefs_raw {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            if val
                .as_object()
                .map_or(false, |obj| !obj.contains_key("onboardingCompleted"))
            {
                return Ok(false);
            }
        }
        return Ok(true);
    }
    let has_existing_data: i64 = conn.query_row(
        "SELECT
           (SELECT COUNT(*) FROM projects)
         + (SELECT COUNT(*) FROM ideas)
         + (SELECT COUNT(*) FROM work_session_records)
         + (SELECT COUNT(*) FROM daily_worship_logs)
         + (SELECT COUNT(*) FROM app_state WHERE key = 'root')
         + (SELECT COUNT(*) FROM settings WHERE key NOT IN ('__legacy_snapshot_dirty', '__legacy_worship_repaired', 'app_preferences'))",
        [],
        |r| r.get(0),
    )?;
    Ok(has_existing_data == 0)
}

fn ensure_v3_schema(connection: &mut Connection) -> Result<(), DatabaseError> {
    if v3_already_ready(connection)? {
        return Ok(());
    }
    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;

    let has_goal: bool = tx
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name='goal'",
            [],
            |r| r.get::<_, i64>(0),
        )?
        > 0;
    if !has_goal {
        tx.execute("ALTER TABLE projects ADD COLUMN goal TEXT", [])?;
    }

    let has_is_current: bool = tx
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name='is_current'",
            [],
            |r| r.get::<_, i64>(0),
        )?
        > 0;
    if !has_is_current {
        tx.execute(
            "ALTER TABLE projects ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS daily_worship_logs (
            date TEXT PRIMARY KEY,
            fajr INTEGER NOT NULL DEFAULT 0,
            sunrise INTEGER NOT NULL DEFAULT 0,
            dhuhr INTEGER NOT NULL DEFAULT 0,
            asr INTEGER NOT NULL DEFAULT 0,
            maghrib INTEGER NOT NULL DEFAULT 0,
            isha INTEGER NOT NULL DEFAULT 0,
            fasting INTEGER NOT NULL DEFAULT 0,
            note TEXT,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS work_session_records (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            project_title TEXT,
            duration_secs INTEGER NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL,
            ended_at TEXT NOT NULL,
            note TEXT
        );
        CREATE TABLE IF NOT EXISTS domain_kv_store (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        INSERT OR IGNORE INTO schema_migrations(version) VALUES (3);",
    )?;

    // P1-9: Migrate legacy work_sessions -> work_session_records if target is empty.
    let v3_sessions_count: i64 =
        tx.query_row("SELECT COUNT(*) FROM work_session_records", [], |r| r.get(0))?;
    if v3_sessions_count == 0 {
        tx.execute(
            "INSERT OR IGNORE INTO work_session_records(id, project_id, project_title, duration_secs, started_at, ended_at, note)
             SELECT
               ws.id,
               ws.project_id,
               p.title,
               CASE WHEN ws.duration_ms > 0 THEN ws.duration_ms / 1000 ELSE 0 END,
               ws.started_at,
               COALESCE(ws.ended_at, ws.started_at),
               CASE WHEN ws.source IS NOT NULL AND ws.source != '' THEN ws.source ELSE NULL END
             FROM work_sessions ws
             LEFT JOIN projects p ON p.id = ws.project_id
             WHERE ws.deleted_at IS NULL",
            [],
        )?;
    }

    sync_legacy_worship_rows(&tx, false)?;

    // P1-9: Existing users upgrading from v1/v2 or pre-onboarding v3 should NOT be
    // forced through first-run onboarding.
    let existing_prefs_raw: Option<String> = tx
        .query_row(
            "SELECT value_json FROM settings WHERE key = 'app_preferences'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    let now = Utc::now().to_rfc3339();
    if let Some(raw) = existing_prefs_raw {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            let missing_flag = val
                .as_object()
                .map_or(false, |obj| !obj.contains_key("onboardingCompleted"));
            if missing_flag {
                if let Ok(mut prefs) = serde_json::from_value::<AppPreferences>(val) {
                    prefs.onboarding_completed = true;
                    if prefs.validate().is_ok() {
                        let updated_json = serde_json::to_string(&prefs)?;
                        tx.execute(
                            "UPDATE settings SET value_json = ?1, updated_at = ?2 WHERE key = 'app_preferences'",
                            params![updated_json, now],
                        )?;
                    }
                }
            }
        }
    } else {
        let has_existing_user_data: bool = {
            let projects_n: i64 =
                tx.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?;
            let ideas_n: i64 = tx.query_row("SELECT COUNT(*) FROM ideas", [], |r| r.get(0))?;
            let sessions_n: i64 =
                tx.query_row("SELECT COUNT(*) FROM work_session_records", [], |r| r.get(0))?;
            let worship_n: i64 =
                tx.query_row("SELECT COUNT(*) FROM daily_worship_logs", [], |r| r.get(0))?;
            let legacy_root_n: i64 = tx.query_row(
                "SELECT COUNT(*) FROM app_state WHERE key = 'root'",
                [],
                |r| r.get(0),
            )?;
            let legacy_settings_n: i64 = tx.query_row(
                "SELECT COUNT(*) FROM settings WHERE key NOT IN ('__legacy_snapshot_dirty', '__legacy_worship_repaired', 'app_preferences')",
                [],
                |r| r.get(0),
            )?;
            projects_n > 0
                || ideas_n > 0
                || sessions_n > 0
                || worship_n > 0
                || legacy_root_n > 0
                || legacy_settings_n > 0
        };
        if has_existing_user_data {
            let settings_val = read_settings_map_conn(&tx)?;
            let mut prefs = migrate_legacy_settings(&settings_val);
            prefs.onboarding_completed = true;
            if prefs.validate().is_ok() {
                let json_str = serde_json::to_string(&prefs)?;
                tx.execute(
                    "INSERT INTO settings(key, value_json, updated_at) VALUES('app_preferences', ?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
                    params![json_str, now],
                )?;
            }
        }
    }

    tx.commit()?;
    Ok(())
}


fn migrate_legacy_worship(connection: &mut Connection) -> Result<(), DatabaseError> {
    let repair_existing: bool = !connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM settings WHERE key=?1)",
        [LEGACY_WORSHIP_REPAIRED],
        |row| row.get::<_, bool>(0),
    )?;
    let missing: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM daily_logs l
         WHERE l.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM daily_worship_logs w WHERE w.date=l.log_date))",
        [],
        |row| row.get(0),
    )?;
    if !repair_existing && !missing {
        return Ok(());
    }

    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    sync_legacy_worship_rows(&tx, repair_existing)?;
    if repair_existing {
        tx.execute(
            "INSERT OR IGNORE INTO settings(key,value_json,updated_at) VALUES(?1,'true',CURRENT_TIMESTAMP)",
            [LEGACY_WORSHIP_REPAIRED],
        )?;
    }
    tx.commit()?;
    Ok(())
}

fn sync_legacy_worship_rows(
    tx: &Transaction<'_>,
    repair_existing: bool,
) -> Result<(), DatabaseError> {
    let mut stmt = tx.prepare(
        "SELECT l.log_date, l.payload_json, l.updated_at
         FROM daily_logs l LEFT JOIN daily_worship_logs w ON w.date=l.log_date
         WHERE l.deleted_at IS NULL
           AND (w.date IS NULL OR (?1 AND w.updated_at=l.updated_at))",
    )?;
    let rows = stmt.query_map([repair_existing], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    })?;
    // Materialize candidates before updating the underlying table.
    let legacy_days = rows.collect::<Result<Vec<_>, _>>()?;
    for (date, payload, updated_at) in legacy_days {
        let Ok(value) = serde_json::from_str::<Value>(&payload) else {
            continue;
        };
        let prayer = |key: &str, ar: &str| match value
            .get("prayers")
            .and_then(|prayers| prayers.get(key).or_else(|| prayers.get(ar)))
            .or_else(|| value.get(key))
        {
            Some(Value::Bool(prayed)) => *prayed,
            Some(Value::String(status)) => {
                status == "done" || (key != "sunrise" && status == "made-up")
            }
            _ => false,
        };
        let fasting = value
            .get("fasting")
            .or_else(|| value.get("fasted"))
            .is_some_and(|status| status.as_bool() == Some(true) || status.as_str() == Some("yes"));
        let note = value.get("note").or_else(|| value.get("notes")).and_then(Value::as_str);
        tx.execute(
            "INSERT INTO daily_worship_logs(date, fajr, sunrise, dhuhr, asr, maghrib, isha, fasting, note, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(date) DO UPDATE SET
               fajr=MAX(daily_worship_logs.fajr, excluded.fajr),
               sunrise=MAX(daily_worship_logs.sunrise, excluded.sunrise),
               dhuhr=MAX(daily_worship_logs.dhuhr, excluded.dhuhr),
               asr=MAX(daily_worship_logs.asr, excluded.asr),
               maghrib=MAX(daily_worship_logs.maghrib, excluded.maghrib),
               isha=MAX(daily_worship_logs.isha, excluded.isha),
               fasting=MAX(daily_worship_logs.fasting, excluded.fasting)
             WHERE ?11 AND daily_worship_logs.updated_at=excluded.updated_at",
            params![
                date,
                prayer("fajr", "الفجر"),
                prayer("sunrise", "الشروق"),
                prayer("dhuhr", "الظهر"),
                prayer("asr", "العصر"),
                prayer("maghrib", "المغرب"),
                prayer("isha", "العشاء"),
                fasting,
                note,
                updated_at,
                repair_existing,
            ],
        )?;
    }
    Ok(())
}

pub fn migrate_legacy_settings(root_or_settings: &Value) -> AppPreferences {
    let settings_obj = if let Some(obj) = root_or_settings
        .get("settings")
        .and_then(Value::as_object)
    {
        obj
    } else if let Some(obj) = root_or_settings.as_object() {
        obj
    } else {
        return AppPreferences::default();
    };

    let mut prefs = AppPreferences::default();

    if let Some(t) = settings_obj.get("themeId").and_then(Value::as_str) {
        if let Some(theme) = ThemeId::from_str_loose(t) {
            prefs.theme_id = theme;
        }
    }

    if let Some(a) = settings_obj.get("accentId").and_then(Value::as_str) {
        if let Some(accent) = AccentId::from_str_loose(a) {
            prefs.accent_id = accent;
        }
    } else if let Some(legacy_accent) = settings_obj.get("themeAccent").and_then(Value::as_str) {
        if let Some(accent) = AccentId::from_str_loose(legacy_accent) {
            prefs.accent_id = accent;
        }
    }

    // Audio & Sound Chime migration:
    // soundChime: false -> silent mode
    // soundChime: true -> gentle chime (NEVER automatic adhan!)
    if let Some(sound_chime) = settings_obj.get("soundChime").and_then(Value::as_bool) {
        if sound_chime {
            prefs.audio.prayer = PrayerSoundMode::GentleChime;
            prefs.audio.fasting = FastingSoundMode::GentleChime;
            prefs.audio.work = WorkSoundMode::GentleChime;
        } else {
            prefs.audio.prayer = PrayerSoundMode::Silent;
            prefs.audio.fasting = FastingSoundMode::Silent;
            prefs.audio.work = WorkSoundMode::Silent;
        }
    }

    if let Some(audio_obj) = settings_obj.get("audio").and_then(Value::as_object) {
        if let Some(p) = audio_obj.get("prayer").and_then(Value::as_str) {
            match p {
                "gentle-chime" => prefs.audio.prayer = PrayerSoundMode::GentleChime,
                "adhan" => prefs.audio.prayer = PrayerSoundMode::Adhan,
                _ => prefs.audio.prayer = PrayerSoundMode::Silent,
            }
        }
        if let Some(f) = audio_obj.get("fasting").and_then(Value::as_str) {
            match f {
                "strong-alarm" => prefs.audio.fasting = FastingSoundMode::StrongAlarm,
                "adhan" => prefs.audio.fasting = FastingSoundMode::Adhan,
                "gentle-chime" => prefs.audio.fasting = FastingSoundMode::GentleChime,
                "silent" => prefs.audio.fasting = FastingSoundMode::Silent,
                _ => prefs.audio.fasting = FastingSoundMode::GentleChime,
            }
        }
        if let Some(w) = audio_obj.get("work").and_then(Value::as_str) {
            match w {
                "gentle-chime" => prefs.audio.work = WorkSoundMode::GentleChime,
                "work-chime" => prefs.audio.work = WorkSoundMode::WorkChime,
                _ => prefs.audio.work = WorkSoundMode::Silent,
            }
        }
        if let Some(vol) = audio_obj.get("volume").and_then(Value::as_u64) {
            prefs.audio.volume = (vol as u8).min(100);
        }
        if let Some(bg) = audio_obj.get("backgroundPlayback").and_then(Value::as_str) {
            match bg {
                "always" => prefs.audio.background_playback = BackgroundAudioMode::Always,
                _ => prefs.audio.background_playback = BackgroundAudioMode::ForegroundOnly,
            }
        }
    }

    if let Some(pre) = settings_obj.get("prePrayer").and_then(Value::as_bool) {
        prefs.notifications.pre_prayer_enabled = pre;
    }
    if let Some(at) = settings_obj.get("atPrayer").and_then(Value::as_bool) {
        prefs.notifications.prayer_at_time_enabled = at;
    }
    if let Some(fasting) = settings_obj.get("fastingEnabled").and_then(Value::as_bool) {
        prefs.notifications.fasting_enabled = fasting;
    }
    if let Some(focus) = settings_obj
        .get("focusCompletionEnabled")
        .and_then(Value::as_bool)
    {
        prefs.notifications.focus_completion_enabled = focus;
    }

    if let Some(qh) = settings_obj.get("quietHours").and_then(Value::as_object) {
        let start = qh
            .get("start")
            .and_then(Value::as_str)
            .unwrap_or("22:00")
            .to_string();
        let end = qh
            .get("end")
            .and_then(Value::as_str)
            .unwrap_or("06:00")
            .to_string();
        prefs.notifications.quiet_hours = Some(QuietHours { start, end });
    } else if settings_obj.get("quietDefault").and_then(Value::as_bool) == Some(true) {
        prefs.notifications.quiet_hours = Some(QuietHours {
            start: "22:00".to_string(),
            end: "06:00".to_string(),
        });
    }

    if let Some(v) = settings_obj.get("latitude").and_then(Value::as_f64) {
        prefs.latitude = v;
    }
    if let Some(v) = settings_obj.get("longitude").and_then(Value::as_f64) {
        prefs.longitude = v;
    }
    if let Some(v) = settings_obj.get("wuduLeadMinutes").and_then(Value::as_i64) {
        prefs.wudu_lead_minutes = v;
    }
    if let Some(leads) = settings_obj.get("prePrayerLeads").and_then(Value::as_array) {
        let mut parsed = Vec::new();
        for l in leads {
            if let Some(m) = l.as_i64() {
                if !parsed.contains(&m) {
                    parsed.push(m);
                }
            }
        }
        parsed.sort_by(|a, b| b.cmp(a));
        prefs.pre_prayer_leads = parsed;
    }
    if let Some(v) = settings_obj.get("calcMethod").and_then(Value::as_str) {
        prefs.calc_method = v.to_string();
    }
    if let Some(v) = settings_obj.get("petVisible").and_then(Value::as_bool) {
        prefs.pet_visible = v;
    }
    if let Some(v) = settings_obj.get("overlayWidget").and_then(Value::as_bool) {
        prefs.overlay_widget = v;
    }
    if let Some(v) = settings_obj.get("locationLabel").and_then(Value::as_str) {
        prefs.location_label = v.to_string();
    }
    if let Some(v) = settings_obj.get("countryCode").and_then(Value::as_str) {
        prefs.country_code = v.to_string();
    }
    if let Some(v) = settings_obj.get("timeZone").and_then(Value::as_str) {
        prefs.time_zone = v.to_string();
    }
    if let Some(v) = settings_obj.get("fajrOffset").and_then(Value::as_i64) {
        prefs.fajr_offset = v;
    }
    if let Some(v) = settings_obj.get("maghribOffset").and_then(Value::as_i64) {
        prefs.maghrib_offset = v;
    }
    if let Some(v) = settings_obj.get("ishaOffset").and_then(Value::as_i64) {
        prefs.isha_offset = v;
    }
    if let Some(v) = settings_obj
        .get("hijriDateOffset")
        .or_else(|| settings_obj.get("hijriOffset"))
        .and_then(Value::as_i64)
    {
        prefs.hijri_date_offset = v.clamp(-5, 5);
    }
    if let Some(v) = settings_obj.get("bubbles").and_then(Value::as_bool) {
        prefs.bubbles = v;
    }
    if let Some(v) = settings_obj.get("livelyPopups").and_then(Value::as_bool) {
        prefs.lively_popups = v;
    }
    if let Some(v) = settings_obj.get("quietDefault").and_then(Value::as_bool) {
        prefs.quiet_default = v;
    }
    if let Some(v) = settings_obj.get("strictOffline").and_then(Value::as_bool) {
        prefs.strict_offline = v;
    }
    if let Some(v) = settings_obj.get("petAvatar").and_then(Value::as_str) {
        prefs.pet_avatar = match v {
            "robot" | "cat" | "owl" | "crescent" | "sprout" | "lantern" => v.to_string(),
            _ => "orb".to_string(),
        };
    }

    if let Some(v) = settings_obj.get("suhoorLeadMinutes").and_then(Value::as_i64) {
        if (5..=180).contains(&v) {
            prefs.suhoor_lead_minutes = v;
        }
    }
    if let Some(v) = settings_obj.get("imsakWaterLeadMinutes").and_then(Value::as_i64) {
        if (0..=60).contains(&v) {
            prefs.imsak_water_lead_minutes = v;
        }
    }
    if let Some(v) = settings_obj.get("suhoorWakeChallenge").and_then(Value::as_bool) {
        prefs.suhoor_wake_challenge = v;
    }
    if let Some(v) = settings_obj.get("suhoorWakeCheckMinutes").and_then(Value::as_i64) {
        if (0..=30).contains(&v) {
            prefs.suhoor_wake_check_minutes = v;
        }
    }
    if let Some(v) = settings_obj.get("preventSleepForSuhoor").and_then(Value::as_bool) {
        prefs.prevent_sleep_for_suhoor = v;
    }
    if let Some(v) = settings_obj.get("taskbarWidgetEnabled").and_then(Value::as_bool) {
        prefs.taskbar_widget_enabled = v;
    }
    if let Some(v) = settings_obj.get("taskbarWidgetPosition").and_then(Value::as_str) {
        prefs.taskbar_widget_position = v.to_string();
    }
    if let Some(v) = settings_obj.get("taskbarWidgetDigits").and_then(Value::as_str) {
        prefs.taskbar_widget_digits = v.to_string();
    }
    if let Some(v) = settings_obj.get("taskbarShowFocusTimer").and_then(Value::as_bool) {
        prefs.taskbar_show_focus_timer = v;
    }

    prefs
}

fn migrate_to_v2(
    connection: &mut Connection,
    path: &Path,
) -> Result<Option<MigrationReport>, DatabaseError> {
    let applied: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version >= 2)",
        [],
        |row| row.get(0),
    )?;
    if applied {
        return Ok(None);
    }

    let legacy: Option<String> = connection
        .query_row("SELECT value FROM app_state WHERE key='root'", [], |row| {
            row.get(0)
        })
        .optional()?;
    let backup_path = if let Some(raw) = legacy.as_ref() {
        let backup = path.with_file_name(format!(
            "wens-legacy-root-{}.json",
            Utc::now().format("%Y%m%dT%H%M%SZ")
        ));
        fs::write(&backup, raw)?;
        Some(backup.to_string_lossy().to_string())
    } else {
        None
    };

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    create_v2_schema(&transaction)?;
    let device_id = ensure_local_device(&transaction)?;
    let mut counts = MigrationCounts::default();
    if let Some(raw) = legacy.as_ref() {
        let root: Value = serde_json::from_str(raw)?;
        counts = import_legacy(&transaction, &device_id, &root, false, false, false, false)?;
        verify_counts(&transaction, &root, &counts, false, false, false)?;
        transaction.execute(
            "INSERT INTO legacy_backups(id,source_schema,payload_json,created_at) VALUES(?1,1,?2,?3)",
            params![Uuid::new_v4().to_string(), raw, Utc::now().to_rfc3339()],
        )?;
    }
    transaction.execute(
        "INSERT INTO schema_migrations(version) VALUES(?1)",
        [CURRENT_SCHEMA_VERSION],
    )?;
    transaction.commit()?;
    Ok(Some(MigrationReport {
        from_version: 1,
        to_version: CURRENT_SCHEMA_VERSION,
        migrated: legacy.is_some(),
        backup_path,
        counts,
    }))
}

fn reconcile_legacy_snapshot(connection: &mut Connection) -> Result<(), DatabaseError> {
    let dirty: Option<String> = connection
        .query_row(
            "SELECT value_json FROM settings WHERE key='__legacy_snapshot_dirty'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if dirty.as_deref() != Some("true") {
        return Ok(());
    }

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let raw: Option<String> = transaction
        .query_row("SELECT value FROM app_state WHERE key='root'", [], |row| {
            row.get(0)
        })
        .optional()?;
    let Some(raw) = raw else {
        transaction.execute(
            "INSERT INTO settings(key,value_json,updated_at) VALUES('__legacy_snapshot_dirty','false',CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value_json='false',updated_at=CURRENT_TIMESTAMP",
            [],
        )?;
        transaction.commit()?;
        return Ok(());
    };
    let root: Value = serde_json::from_str(&raw)?;
    let device_id = ensure_local_device(&transaction)?;

    let is_vnext_active: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version >= 2)",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    let has_nonempty_projects = root
        .get("projects")
        .and_then(Value::as_array)
        .map_or(false, |a| !a.is_empty());
    let has_nonempty_ideas = root
        .get("ideas")
        .and_then(Value::as_array)
        .map_or(false, |a| !a.is_empty());
    let has_nonempty_fasting = root
        .pointer("/fasting/custom")
        .and_then(Value::as_array)
        .map_or(false, |a| !a.is_empty());
    let has_nonempty_work = root
        .get("workSessions")
        .and_then(Value::as_array)
        .map_or(false, |a| !a.is_empty());
    let has_nonempty_marketing = root
        .get("marketing")
        .and_then(Value::as_object)
        .map_or(false, |m| !m.is_empty());
    let has_nonempty_days = root
        .pointer("/accountability/days")
        .and_then(Value::as_object)
        .map_or(false, |d| !d.is_empty());

    let existing_projects: i64 = transaction
        .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
        .unwrap_or(0);
    let existing_ideas: i64 = transaction
        .query_row("SELECT COUNT(*) FROM ideas", [], |r| r.get(0))
        .unwrap_or(0);
    let existing_fasting: i64 = transaction
        .query_row("SELECT COUNT(*) FROM fasting_entries", [], |r| r.get(0))
        .unwrap_or(0);
    let existing_work: i64 = transaction
        .query_row("SELECT COUNT(*) FROM work_sessions", [], |r| r.get(0))
        .unwrap_or(0);
    let existing_marketing: i64 = transaction
        .query_row("SELECT COUNT(*) FROM marketing_entries", [], |r| r.get(0))
        .unwrap_or(0);
    let existing_days: i64 = transaction
        .query_row("SELECT COUNT(*) FROM daily_logs", [], |r| r.get(0))
        .unwrap_or(0);

    // CRITICAL DATA LOSS GUARD:
    // When incoming snapshot lacks non-empty entities, or when vNext is the active schema
    // and already contains user entities, NEVER delete existing user data.
    if !is_vnext_active {
        if has_nonempty_projects {
            transaction.execute_batch("DELETE FROM tasks; DELETE FROM projects;")?;
        }
        if has_nonempty_ideas {
            transaction.execute_batch("DELETE FROM ideas;")?;
        }
        if has_nonempty_fasting {
            transaction.execute_batch("DELETE FROM fasting_entries;")?;
        }
        if has_nonempty_work {
            transaction.execute_batch("DELETE FROM work_sessions;")?;
        }
        if has_nonempty_marketing {
            transaction.execute_batch("DELETE FROM marketing_entries;")?;
        }
        if has_nonempty_days {
            transaction.execute_batch("DELETE FROM daily_logs;")?;
        }
    } else {
        if has_nonempty_projects && existing_projects == 0 {
            transaction.execute_batch("DELETE FROM tasks; DELETE FROM projects;")?;
        }
        if has_nonempty_ideas && existing_ideas == 0 {
            transaction.execute_batch("DELETE FROM ideas;")?;
        }
        if has_nonempty_fasting && existing_fasting == 0 {
            transaction.execute_batch("DELETE FROM fasting_entries;")?;
        }
        if has_nonempty_work && existing_work == 0 {
            transaction.execute_batch("DELETE FROM work_sessions;")?;
        }
        if has_nonempty_marketing && existing_marketing == 0 {
            transaction.execute_batch("DELETE FROM marketing_entries;")?;
        }
        if has_nonempty_days && existing_days == 0 {
            transaction.execute_batch("DELETE FROM daily_logs;")?;
        }
    }

    let skip_projects = is_vnext_active && existing_projects > 0;
    let skip_ideas = is_vnext_active && existing_ideas > 0;
    let skip_work = is_vnext_active && existing_work > 0;
    let preserve_existing_settings: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM settings WHERE key='app_preferences')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(false);

    let counts = import_legacy(
        &transaction,
        &device_id,
        &root,
        skip_projects,
        skip_ideas,
        skip_work,
        preserve_existing_settings,
    )?;
    verify_counts(&transaction, &root, &counts, skip_projects, skip_ideas, skip_work)?;
    transaction.execute(
        "INSERT INTO settings(key,value_json,updated_at) VALUES('__legacy_snapshot_dirty','false',CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value_json='false',updated_at=CURRENT_TIMESTAMP",
        [],
    )?;
    transaction.commit()?;
    Ok(())
}

fn create_v2_schema(tx: &Transaction<'_>) -> Result<(), DatabaseError> {
    tx.execute_batch(include_str!("schema_v2.sql"))?;
    Ok(())
}

fn ensure_local_device(tx: &Transaction<'_>) -> Result<String, DatabaseError> {
    if let Some(id) = tx
        .query_row(
            "SELECT id FROM devices WHERE is_local=1 LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    tx.execute("INSERT INTO devices(id,name,platform,is_local,created_at,updated_at,revision) VALUES(?1,'Windows','windows',1,?2,?2,1)", params![id, Utc::now().to_rfc3339()])?;
    Ok(id)
}

fn import_legacy(
    tx: &Transaction<'_>,
    device_id: &str,
    root: &Value,
    skip_projects: bool,
    skip_ideas: bool,
    skip_work: bool,
    preserve_existing_settings: bool,
) -> Result<MigrationCounts, DatabaseError> {
    let now = Utc::now().to_rfc3339();
    let mut counts = MigrationCounts::default();
    if let Some(settings) = root.get("settings").and_then(Value::as_object) {
        let insert_setting_sql = if preserve_existing_settings {
            "INSERT OR IGNORE INTO settings(key,value_json,updated_at) VALUES(?1,?2,?3)"
        } else {
            "INSERT OR REPLACE INTO settings(key,value_json,updated_at) VALUES(?1,?2,?3)"
        };
        for (key, value) in settings {
            if matches!(key.as_str(), "app_preferences" | "__legacy_snapshot_dirty" | LEGACY_WORSHIP_REPAIRED) {
                continue;
            }
            tx.execute(insert_setting_sql, params![key, value.to_string(), now])?;
        }
    }
    if !skip_projects {
        if let Some(projects) = root.get("projects").and_then(Value::as_array) {
            for item in projects {
                let id = Uuid::new_v4().to_string();
                let current_task = string(item, "currentTask");
                tx.execute(
                    "INSERT INTO projects(id,title,description,status,progress,symbol,current_task,device_id,created_at,updated_at,revision)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9,1)",
                    params![id, string(item,"title").unwrap_or_else(|| "مشروع".into()), string(item,"description").unwrap_or_default(),
                      string(item,"status").unwrap_or_else(|| "فكرة".into()), item.get("progress").and_then(Value::as_i64).unwrap_or(0).clamp(0, 100),
                      string(item,"symbol").unwrap_or_else(|| "✦".into()), current_task, device_id, now],
                )?;
                counts.projects += 1;
                if let Some(task_title) = string(item, "currentTask") {
                    tx.execute("INSERT INTO tasks(id,project_id,title,status,position,device_id,created_at,updated_at,revision) VALUES(?1,?2,?3,'open',0,?4,?5,?5,1)", params![Uuid::new_v4().to_string(), id, task_title, device_id, now])?;
                    counts.tasks += 1;
                }
            }
        }
    }
    if !skip_ideas {
        if let Some(ideas) = root.get("ideas").and_then(Value::as_array) {
            for item in ideas {
                tx.execute("INSERT INTO ideas(id,title,tag,body,device_id,created_at,updated_at,revision) VALUES(?1,?2,?3,'',?4,?5,?5,1)", params![Uuid::new_v4().to_string(), string(item,"title").unwrap_or_else(|| "فكرة".into()), string(item,"tag").unwrap_or_else(|| "فكرة".into()), device_id, now])?;
                counts.ideas += 1;
            }
        }
    }
    if let Some(custom) = root.pointer("/fasting/custom").and_then(Value::as_array) {
        for item in custom {
            let label = string(item, "title")
                .or_else(|| string(item, "label"))
                .unwrap_or_else(|| "صيام اختياري".into());
            let target_date = string(item, "date");
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM fasting_entries WHERE kind='custom' AND label=?1 AND COALESCE(target_date, '')=COALESCE(?2, '') AND deleted_at IS NULL)",
                params![&label, &target_date],
                |r| r.get(0),
            )?;
            if !exists {
                tx.execute(
                    "INSERT INTO fasting_entries(id,kind,label,target_date,status,device_id,created_at,updated_at,revision)
                     VALUES(?1,'custom',?2,?3,'planned',?4,?5,?5,1)",
                    params![Uuid::new_v4().to_string(), label, target_date, device_id, now],
                )?;
                counts.fasting_entries += 1;
            }
        }
    }
    if !skip_work {
        if let Some(sessions) = root.get("workSessions").and_then(Value::as_array) {
            for item in sessions {
                let id = string(item, "id").unwrap_or_else(|| Uuid::new_v4().to_string());
                let started_at = string(item, "startedAt").unwrap_or_else(|| now.clone());
                let ended_at = string(item, "endedAt");
                let duration_ms = item.get("durationMs").and_then(Value::as_i64).unwrap_or(0);
                let source = string(item, "source").unwrap_or_else(|| "legacy".into());
                tx.execute(
                    "INSERT INTO work_sessions(id,started_at,ended_at,duration_ms,source,device_id,created_at,updated_at,revision)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?7,1)
                     ON CONFLICT(id) DO UPDATE SET
                       started_at=excluded.started_at,
                       ended_at=excluded.ended_at,
                       duration_ms=excluded.duration_ms,
                       source=excluded.source,
                       updated_at=excluded.updated_at,
                       revision=work_sessions.revision+1,
                       deleted_at=NULL",
                    params![id, started_at, ended_at, duration_ms, source, device_id, now],
                )?;
                counts.work_sessions += 1;
            }
        }
    }
    if let Some(marketing) = root.get("marketing").and_then(Value::as_object) {
        for (kind, entries) in marketing {
            if let Some(items) = entries.as_array() {
                for item in items {
                    let payload_str = item.to_string();
                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM marketing_entries WHERE kind=?1 AND payload_json=?2 AND deleted_at IS NULL)",
                        params![kind, &payload_str],
                        |r| r.get(0),
                    )?;
                    if !exists {
                        tx.execute(
                            "INSERT INTO marketing_entries(id,kind,payload_json,device_id,created_at,updated_at,revision)
                             VALUES(?1,?2,?3,?4,?5,?5,1)",
                            params![
                                Uuid::new_v4().to_string(),
                                kind,
                                payload_str,
                                device_id,
                                string(item, "createdAt").unwrap_or_else(|| now.clone())
                            ],
                        )?;
                        counts.marketing_entries += 1;
                    }
                }
            }
        }
    }
    if let Some(days) = root
        .pointer("/accountability/days")
        .and_then(Value::as_object)
    {
        for (date, item) in days {
            tx.execute(
                "INSERT INTO daily_logs(id,log_date,payload_json,device_id,created_at,updated_at,revision)
                 VALUES(?1,?2,?3,?4,?5,?5,1)
                 ON CONFLICT(log_date) DO UPDATE SET
                   payload_json=excluded.payload_json,
                   updated_at=excluded.updated_at,
                   revision=daily_logs.revision+1,
                   deleted_at=NULL",
                params![Uuid::new_v4().to_string(), date, item.to_string(), device_id, now],
            )?;
            counts.daily_entries += 1;
        }
    }
    Ok(counts)
}

fn verify_counts(
    tx: &Transaction<'_>,
    root: &Value,
    counts: &MigrationCounts,
    skip_projects: bool,
    skip_ideas: bool,
    skip_work: bool,
) -> Result<(), DatabaseError> {
    let mut expected: BTreeMap<&'static str, (usize, usize)> = BTreeMap::new();
    if !skip_projects {
        if let Some(p) = root.get("projects").and_then(Value::as_array) {
            expected.insert("projects", (p.len(), counts.projects));
        }
    }
    if !skip_ideas {
        if let Some(i) = root.get("ideas").and_then(Value::as_array) {
            expected.insert("ideas", (i.len(), counts.ideas));
        }
    }
    if !skip_work {
        if let Some(w) = root.get("workSessions").and_then(Value::as_array) {
            expected.insert("work_sessions", (w.len(), counts.work_sessions));
        }
    }

    for (domain, (expected_count, inserted_count)) in expected {
        let actual: i64 = tx.query_row(&format!("SELECT COUNT(*) FROM {domain}"), [], |row| {
            row.get(0)
        })?;
        if expected_count != inserted_count || (actual as u64) < inserted_count as u64 {
            return Err(DatabaseError::Verification {
                domain: domain.into(),
                expected: expected_count,
                inserted: inserted_count,
            });
        }
    }
    Ok(())
}

fn string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn migrates_legacy_root_transactionally_and_keeps_backup() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let connection = Connection::open(&path).unwrap();
        ensure_legacy_tables(&connection).unwrap();
        let legacy = json!({
            "settings": {"latitude": 30.0444, "overlayWidget": true},
            "projects": [{"title":"وِنس", "description":"بناء", "status":"قيد التنفيذ", "progress":35, "currentTask":"ترحيل البيانات"}],
            "ideas": [{"title":"فكرة أولى", "tag":"منتج"}],
            "fasting": {"custom":[{"date":"2026-09-01","title":"قضاء"}]},
            "workSessions": [{"id":"session-1","startedAt":"2026-08-26T10:00:00Z","endedAt":"2026-08-26T10:25:00Z","durationMs":1500000}],
            "marketing": {"briefs":[{"product":"وِنس"}]},
            "accountability": {"days":{"2026-08-26":{"prayers":{"fajr":true}}}}
        }).to_string();
        connection
            .execute(
                "INSERT INTO app_state(key,value) VALUES('root',?1)",
                [&legacy],
            )
            .unwrap();
        drop(connection);

        let db = Database::open(&path).unwrap();
        let bootstrap = db.bootstrap().unwrap();
        let report = bootstrap.migration.unwrap();
        assert!(report.migrated);
        assert_eq!(report.counts.projects, 1);
        assert_eq!(report.counts.tasks, 1);
        assert_eq!(report.counts.ideas, 1);
        assert_eq!(bootstrap.projects[0].title, "وِنس");
        assert_eq!(
            db.legacy_snapshot().unwrap().as_deref(),
            Some(legacy.as_str())
        );
        assert!(Path::new(report.backup_path.as_deref().unwrap()).exists());
    }

    #[test]
    fn invalid_legacy_json_rolls_back_schema_version() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let connection = Connection::open(&path).unwrap();
        ensure_legacy_tables(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO app_state(key,value) VALUES('root','{broken')",
                [],
            )
            .unwrap();
        drop(connection);
        assert!(Database::open(&path).is_err());
        let connection = Connection::open(&path).unwrap();
        let applied: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version=2",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(applied, 0);
    }

    #[test]
    fn reconciles_legacy_writes_before_typed_bootstrap() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();
        db.save_compatibility_snapshot(
            &json!({
                "settings":{"latitude":31.0},
                "projects":[{"title":"بعد الترحيل","status":"فكرة"}],
                "ideas":[{"title":"تعديل من الواجهة القديمة","tag":"انتقال"}]
            })
            .to_string(),
        )
        .unwrap();
        drop(db);
        let reopened = Database::open(&path).unwrap();
        let bootstrap = reopened.bootstrap().unwrap();
        assert_eq!(bootstrap.projects.len(), 1);
        assert_eq!(bootstrap.projects[0].title, "بعد الترحيل");
        assert_eq!(bootstrap.ideas[0].title, "تعديل من الواجهة القديمة");
    }

    #[test]
    fn migrates_legacy_sound_chime_to_gentle_chime_never_adhan() {
        let legacy_chime_on = json!({
            "settings": {
                "soundChime": true,
                "themeAccent": "lime",
                "prePrayer": true,
                "atPrayer": true,
                "wuduLeadMinutes": 20,
                "latitude": 29.9792,
                "longitude": 31.1342,
                "petVisible": false,
                "overlayWidget": true,
                "quietDefault": true
            }
        });
        let prefs = migrate_legacy_settings(&legacy_chime_on);
        assert_eq!(prefs.audio.prayer, PrayerSoundMode::GentleChime);
        assert_ne!(prefs.audio.prayer, PrayerSoundMode::Adhan);
        assert_eq!(prefs.audio.fasting, FastingSoundMode::GentleChime);
        assert_eq!(prefs.audio.work, WorkSoundMode::GentleChime);
        assert_eq!(prefs.accent_id, AccentId::Lime);
        assert_eq!(prefs.wudu_lead_minutes, 20);
        assert_eq!(prefs.latitude, 29.9792);
        assert_eq!(prefs.longitude, 31.1342);
        assert!(!prefs.pet_visible);
        assert!(prefs.overlay_widget);
        assert!(prefs.notifications.quiet_hours.is_some());

        let legacy_chime_off = json!({
            "settings": {
                "soundChime": false,
                "themeAccent": "purple"
            }
        });
        let prefs_off = migrate_legacy_settings(&legacy_chime_off);
        assert_eq!(prefs_off.audio.prayer, PrayerSoundMode::Silent);
        assert_eq!(prefs_off.audio.fasting, FastingSoundMode::Silent);
        assert_eq!(prefs_off.audio.work, WorkSoundMode::Silent);
        assert_eq!(prefs_off.accent_id, AccentId::Violet);
    }

    #[test]
    fn validates_preferences_and_quiet_hours() {
        let mut prefs = AppPreferences::default();
        assert!(prefs.validate().is_ok());

        prefs.audio.volume = 101;
        assert!(prefs.validate().is_err());
        prefs.audio.volume = 100;
        assert!(prefs.validate().is_ok());

        prefs.notifications.quiet_hours = Some(QuietHours {
            start: "23:00".into(),
            end: "07:00".into(),
        });
        assert!(prefs.validate().is_ok());

        let qh = prefs.notifications.quiet_hours.as_ref().unwrap();
        assert!(qh.contains(23, 30));
        assert!(qh.contains(2, 0));
        assert!(qh.contains(6, 59));
        assert!(!qh.contains(7, 0));
        assert!(!qh.contains(12, 0));

        prefs.notifications.quiet_hours = Some(QuietHours {
            start: "25:00".into(),
            end: "07:00".into(),
        });
        assert!(prefs.validate().is_err());

        prefs.notifications.quiet_hours = Some(QuietHours {
            start: "23:00".into(),
            end: "bad-time".into(),
        });
        assert!(prefs.validate().is_err());
    }

    #[test]
    fn app_preferences_apply_patch_deeply_merges_without_reverting() {
        let mut prefs = AppPreferences::default();

        // 1. Change theme and accent
        prefs
            .apply_patch(&serde_json::json!({
                "themeId": "dawn-sand",
                "accentId": "lime"
            }))
            .unwrap();
        assert_eq!(prefs.theme_id, ThemeId::DawnSand);
        assert_eq!(prefs.accent_id, AccentId::Lime);
        assert_eq!(prefs.audio.volume, 85);
        assert!(prefs.notifications.pre_prayer_enabled);

        // 2. Change audio prayer sound only - theme and accent must NOT reset
        prefs
            .apply_patch(&serde_json::json!({
                "audio": { "prayer": "gentle-chime" }
            }))
            .unwrap();
        assert_eq!(prefs.theme_id, ThemeId::DawnSand);
        assert_eq!(prefs.accent_id, AccentId::Lime);
        assert_eq!(prefs.audio.prayer, PrayerSoundMode::GentleChime);
        assert_eq!(prefs.audio.volume, 85);
        assert_eq!(prefs.audio.fasting, FastingSoundMode::GentleChime);

        // 3. Change notifications fasting toggle only - audio and theme must NOT reset
        assert!(!prefs.notifications.fasting_enabled);
        prefs
            .apply_patch(&serde_json::json!({
                "notifications": { "fastingEnabled": true }
            }))
            .unwrap();
        assert_eq!(prefs.theme_id, ThemeId::DawnSand);
        assert_eq!(prefs.audio.prayer, PrayerSoundMode::GentleChime);
        assert!(prefs.notifications.fasting_enabled);
        assert!(prefs.notifications.pre_prayer_enabled);

        // 4. Quiet hours partial patch (only start)
        prefs
            .apply_patch(&serde_json::json!({
                "notifications": {
                    "quietHours": { "start": "23:30" }
                }
            }))
            .unwrap();
        let qh = prefs.notifications.quiet_hours.as_ref().unwrap();
        assert_eq!(qh.start, "23:30");
        assert_eq!(qh.end, "06:00");

        // 5. Update other fields (strictOffline, bubbles, location)
        prefs
            .apply_patch(&serde_json::json!({
                "strictOffline": true,
                "bubbles": false,
                "locationLabel": "الإسكندرية، مصر"
            }))
            .unwrap();
        assert!(prefs.strict_offline);
        assert!(!prefs.bubbles);
        assert_eq!(prefs.location_label, "الإسكندرية، مصر");
        assert_eq!(prefs.theme_id, ThemeId::DawnSand);

        // 6. Disable quiet hours with null
        prefs
            .apply_patch(&serde_json::json!({
                "notifications": { "quietHours": null }
            }))
            .unwrap();
        assert!(prefs.notifications.quiet_hours.is_none());

        // 7. Error handling
        assert!(prefs
            .apply_patch(&serde_json::json!({ "themeId": "unknown-skin" }))
            .is_err());
        assert!(prefs
            .apply_patch(&serde_json::json!({ "audio": { "volume": 120 } }))
            .is_err());
    }

    #[test]
    fn records_and_retrieves_notification_history_states() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();

        let rec1 = NotificationRecord {
            id: "notif-1".into(),
            title: "حان وقت العصر".into(),
            body: "صلاة العصر".into(),
            kind: "prayer-at".into(),
            status: "delivered".into(),
            error_message: None,
            created_at: "2026-09-24T15:30:00Z".into(),
            read_at: None,
        };
        let rec2 = NotificationRecord {
            id: "notif-2".into(),
            title: "حان وقت المغرب".into(),
            body: "صلاة المغرب".into(),
            kind: "prayer-at".into(),
            status: "suppressed".into(),
            error_message: None,
            created_at: "2026-09-24T18:00:00Z".into(),
            read_at: None,
        };
        let rec3 = NotificationRecord {
            id: "notif-3".into(),
            title: "تنبيه ويندوز".into(),
            body: "فشل الإرسال".into(),
            kind: "test".into(),
            status: "failed".into(),
            error_message: Some("Windows Toast Service Unavailable".into()),
            created_at: "2026-09-24T19:00:00Z".into(),
            read_at: None,
        };

        db.insert_notification_record(&rec1).unwrap();
        db.insert_notification_record(&rec2).unwrap();
        db.insert_notification_record(&rec3).unwrap();

        assert_eq!(db.unread_notifications_count().unwrap(), 3);
        let list = db.list_notification_records(10).unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].id, "notif-3");
        assert_eq!(list[0].status, "failed");
        assert_eq!(
            list[0].error_message.as_deref(),
            Some("Windows Toast Service Unavailable")
        );

        db.mark_notification_read("notif-3").unwrap();
        assert_eq!(db.unread_notifications_count().unwrap(), 2);

        db.mark_all_notifications_read().unwrap();
        assert_eq!(db.unread_notifications_count().unwrap(), 0);
    }

    #[test]
    fn reconcile_does_not_delete_projects_when_snapshot_lacks_them() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();
        db.create_project(CreateProject {
            title: "مشروع vNext المهم".into(),
            description: "لا تحذفني".into(),
            status: "نشط".into(),
            current_task: None,
            goal: None,
            is_current: false,
        })
        .unwrap();
        db.create_idea(CreateIdea {
            title: "فكرة vNext".into(),
            tag: "ابتكار".into(),
            body: "مهمة".into(),
        })
        .unwrap();

        assert_eq!(db.projects().unwrap().len(), 1);
        assert_eq!(db.ideas().unwrap().len(), 1);

        // Simulate incoming legacy snapshot lacking projects/ideas (e.g. from backlog.ts or prayer tracker)
        db.save_compatibility_snapshot(
            &json!({
                "prayerBacklog": {
                    "autoTrack": true,
                    "items": []
                }
            })
            .to_string(),
        )
        .unwrap();
        drop(db);

        // Reopen database, which triggers reconcile_legacy_snapshot
        let reopened = Database::open(&path).unwrap();
        let projects = reopened.projects().unwrap();
        let ideas = reopened.ideas().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].title, "مشروع vNext المهم");
        assert_eq!(ideas.len(), 1);
        assert_eq!(ideas[0].title, "فكرة vNext");
    }

    #[test]
    fn reconcile_does_not_delete_projects_when_snapshot_has_empty_array() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();
        db.create_project(CreateProject {
            title: "مشروع vNext المهم".into(),
            description: "وصف".into(),
            status: "نشط".into(),
            current_task: Some("مهمة 1".into()),
            goal: None,
            is_current: false,
        })
        .unwrap();
        db.create_idea(CreateIdea {
            title: "فكرة vNext".into(),
            tag: "ابتكار".into(),
            body: "مهمة".into(),
        })
        .unwrap();

        assert_eq!(db.projects().unwrap().len(), 1);
        assert_eq!(db.ideas().unwrap().len(), 1);

        // Snapshot explicitly has empty arrays for projects and ideas
        db.save_compatibility_snapshot(
            &json!({
                "projects": [],
                "ideas": []
            })
            .to_string(),
        )
        .unwrap();
        drop(db);

        let reopened = Database::open(&path).unwrap();
        let projects = reopened.projects().unwrap();
        let ideas = reopened.ideas().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].title, "مشروع vNext المهم");
        assert_eq!(ideas.len(), 1);
        assert_eq!(ideas[0].title, "فكرة vNext");
    }

    #[test]
    fn reconcile_protects_existing_vnext_projects_from_legacy_overwrites() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();
        db.create_project(CreateProject {
            title: "مشروع vNext الأصلي".into(),
            description: "وصف".into(),
            status: "نشط".into(),
            current_task: Some("مهمة 1".into()),
            goal: None,
            is_current: false,
        })
        .unwrap();

        // Snapshot comes with a legacy project
        db.save_compatibility_snapshot(
            &json!({
                "projects": [{"title": "مشروع قديم", "status": "فكرة"}]
            })
            .to_string(),
        )
        .unwrap();
        drop(db);

        let reopened = Database::open(&path).unwrap();
        let projects = reopened.projects().unwrap();
        // vNext project is preserved and not replaced
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].title, "مشروع vNext الأصلي");
    }

    #[test]
    fn update_legacy_root_settings_persists_theme_and_accent() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();
        let mut prefs = db.get_preferences().unwrap();
        prefs.theme_id = ThemeId::DawnSand;
        prefs.accent_id = AccentId::Rose;
        db.save_preferences(&prefs).unwrap();
        db.update_legacy_root_settings(&prefs).unwrap();

        let raw = db.legacy_snapshot().unwrap().expect("snapshot exists");
        let root: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(root["settings"]["themeId"], "dawn-sand");
        assert_eq!(root["settings"]["accentId"], "rose");
    }

    #[test]
    fn pre_prayer_leads_persistence_and_patching() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();
        let mut prefs = db.get_preferences().unwrap();
        assert_eq!(prefs.pre_prayer_leads, vec![15]);

        let patch = serde_json::json!({
            "prePrayerLeads": [5, 20, 60, 30, 10, 15]
        });
        prefs.apply_patch(&patch).unwrap();
        assert_eq!(prefs.pre_prayer_leads, vec![60, 30, 20, 15, 10, 5]);

        db.save_preferences(&prefs).unwrap();
        let loaded = db.get_preferences().unwrap();
        assert_eq!(loaded.pre_prayer_leads, vec![60, 30, 20, 15, 10, 5]);
    }

    #[test]
    fn v3_unified_storage_crud_and_backup() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();

        // 1. Projects CRUD
        let p1 = db
            .create_project(CreateProject {
                title: "مشروع كتابة".into(),
                description: "وصف".into(),
                status: "قيد التنفيذ".into(),
                current_task: Some("الفصل الأول".into()),
                goal: Some("إنهاء المسودة".into()),
                is_current: true,
            })
            .unwrap();
        assert_eq!(p1.title, "مشروع كتابة");
        assert_eq!(p1.goal.as_deref(), Some("إنهاء المسودة"));
        assert!(p1.is_current);

        let p2 = db
            .create_project(CreateProject {
                title: "مشروع ثاني".into(),
                description: "".into(),
                status: "جديد".into(),
                current_task: None,
                goal: None,
                is_current: false,
            })
            .unwrap();

        let updated_p1 = db
            .update_project(UpdateProject {
                id: p1.id.clone(),
                title: Some("مشروع كتابة محدث".into()),
                description: None,
                status: None,
                progress: Some(50),
                symbol: None,
                current_task: None,
                goal: None,
                is_current: None,
            })
            .unwrap();
        assert_eq!(updated_p1.title, "مشروع كتابة محدث");
        assert_eq!(updated_p1.progress, 50);

        db.set_current_project(&p2.id).unwrap();
        let projs = db.projects().unwrap();
        assert_eq!(projs[0].id, p2.id);
        assert!(projs[0].is_current);

        db.delete_project(&p1.id).unwrap();
        let remaining_projs = db.projects().unwrap();
        assert_eq!(remaining_projs.len(), 1);
        assert_eq!(remaining_projs[0].id, p2.id);

        // 2. Ideas CRUD & Promotion
        let idea = db
            .create_idea(CreateIdea {
                title: "فكرة ممتازة".into(),
                tag: "عمل".into(),
                body: "تفاصيل الفكرة".into(),
            })
            .unwrap();
        let updated_idea = db
            .update_idea(UpdateIdea {
                id: idea.id.clone(),
                title: Some("فكرة معدلة".into()),
                tag: None,
                body: None,
            })
            .unwrap();
        assert_eq!(updated_idea.title, "فكرة معدلة");

        let promoted_proj = db.promote_idea_to_project(&idea.id).unwrap();
        assert_eq!(promoted_proj.title, "فكرة معدلة");
        assert_eq!(db.ideas().unwrap().len(), 0);

        // 3. Work sessions
        let session = db
            .save_work_session(WorkSessionRecord {
                id: "sess-1".into(),
                project_id: Some(promoted_proj.id.clone()),
                project_title: Some(promoted_proj.title.clone()),
                duration_secs: 1500,
                started_at: "2026-10-31T10:00:00Z".into(),
                ended_at: "2026-10-31T10:25:00Z".into(),
                note: Some("جلسة أولى".into()),
            })
            .unwrap();
        let sessions = db.list_work_sessions(10).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, session.id);
        assert_eq!(sessions[0].duration_secs, 1500);

        // 4. Daily worship logs
        db.set_daily_worship(DailyWorshipRecord {
            date: "2026-10-31".into(),
            fajr: true,
            sunrise: false,
            dhuhr: true,
            asr: true,
            maghrib: true,
            isha: true,
            fasting: false,
            note: Some("الحمد لله".into()),
            updated_at: "2026-10-31T20:00:00Z".into(),
        })
        .unwrap();

        let worship = db.get_daily_worship("2026-10-31").unwrap().unwrap();
        assert!(worship.fajr);
        assert!(worship.isha);
        assert_eq!(worship.note.as_deref(), Some("الحمد لله"));

        let history = db.get_history_range(7).unwrap();
        assert_eq!(history.len(), 1);

        // 5. KV store
        db.kv_set("khatma_v2", "{\"page\": 150}").unwrap();
        let kv_val = db.kv_get("khatma_v2").unwrap();
        assert_eq!(kv_val.as_deref(), Some("{\"page\": 150}"));

        // 6. Backup & Restore
        let backup_json = db.export_backup().unwrap();
        assert!(backup_json.contains("khatma_v2"));
        assert!(backup_json.contains("مشروع ثاني"));

        drop(db);
        let restored_db = Database::open(&path).unwrap();
        restored_db.restore_backup(&backup_json).unwrap();
        assert_eq!(restored_db.projects().unwrap().len(), 2);
        assert_eq!(restored_db.kv_get("khatma_v2").unwrap().as_deref(), Some("{\"page\": 150}"));
    }

    #[test]
    fn preferences_safe_defaults_nan_rejection_and_enum_preservation() {
        let mut prefs = AppPreferences::default();
        assert!(!prefs.notifications.fasting_enabled);
        assert!(!prefs.prevent_sleep_for_suhoor);
        assert_eq!(prefs.audio.fasting, FastingSoundMode::GentleChime);
        assert_eq!(prefs.audio.volume, 85);
        assert!(!prefs.onboarding_completed);
        assert!(prefs.quran_radio_enabled);
        assert_eq!(prefs.quran_radio_default_station, "cairo");

        // Deserializing empty JSON uses identical defaults (including volume 85, fasting false).
        let from_empty: AppPreferences = serde_json::from_str("{}").unwrap();
        assert!(!from_empty.notifications.fasting_enabled);
        assert!(!from_empty.prevent_sleep_for_suhoor);
        assert_eq!(from_empty.audio.fasting, FastingSoundMode::GentleChime);
        assert_eq!(from_empty.audio.volume, 85);
        assert!(!from_empty.onboarding_completed);
        assert!(from_empty.quran_radio_enabled);
        assert_eq!(from_empty.quran_radio_default_station, "cairo");

        // NaN / Infinity rejection
        let mut bad = AppPreferences::default();
        bad.latitude = f64::NAN;
        assert!(bad.validate().is_err());
        bad.latitude = f64::INFINITY;
        assert!(bad.validate().is_err());
        bad.latitude = 30.0;
        bad.longitude = f64::NEG_INFINITY;
        assert!(bad.validate().is_err());
        bad.longitude = f64::NAN;
        assert!(bad.validate().is_err());

        // apply_patch rejects bad coords atomically without mutating other fields
        let res = prefs.apply_patch(&json!({
            "onboardingCompleted": true,
            "latitude": 999.0
        }));
        assert!(res.is_err());
        assert!(!prefs.onboarding_completed);

        // taskbarWidgetPosition & islandOrientation preservation + new fields
        for (input, expected) in [
            ("near-tray", "tray"),
            ("tray", "tray"),
            ("left", "left"),
            ("far_left", "far_left"),
        ] {
            prefs
                .apply_patch(&json!({ "taskbarWidgetPosition": input }))
                .unwrap();
            assert_eq!(prefs.taskbar_widget_position, expected);
        }
        for ori in ["top", "bottom", "left", "right", "horizontal", "vertical"] {
            prefs
                .apply_patch(&json!({ "islandOrientation": ori }))
                .unwrap();
            assert_eq!(prefs.island_orientation, ori);
        }
        prefs
            .apply_patch(&json!({
                "onboardingCompleted": true,
                "quranRadioEnabled": false,
                "quranRadioDefaultStation": "makkah",
                "overlaySize": "compact",
                "dhikrCardsIntervalMinutes": 30
            }))
            .unwrap();
        assert!(prefs.onboarding_completed);
        assert!(!prefs.quran_radio_enabled);
        assert_eq!(prefs.quran_radio_default_station, "makkah");
        assert_eq!(prefs.overlay_size, "compact");
        assert_eq!(prefs.dhikr_cards_interval_minutes, 30);
    }

    #[test]
    fn p0_4_reconcile_legacy_snapshot_upserts_daily_logs_and_deduplicates_across_reopens() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();

        let snap1 = json!({
            "fasting": { "custom": [{"date": "2026-09-01", "title": "قضاء"}] },
            "marketing": { "briefs": [{"product": "وِنس", "createdAt": "2026-09-01T10:00:00Z"}] },
            "accountability": { "days": { "2026-09-01": { "prayers": { "fajr": true } } } }
        })
        .to_string();
        db.save_compatibility_snapshot(&snap1).unwrap();
        drop(db);

        // First reopen reconciles snapshot cleanly.
        let db2 = Database::open(&path).unwrap();
        // Save updated snapshot with the SAME log_date, fasting entry, and marketing entry.
        let snap2 = json!({
            "fasting": { "custom": [{"date": "2026-09-01", "title": "قضاء"}] },
            "marketing": { "briefs": [{"product": "وِنس", "createdAt": "2026-09-01T10:00:00Z"}] },
            "accountability": { "days": { "2026-09-01": { "prayers": { "fajr": true, "dhuhr": true } } } }
        })
        .to_string();
        db2.save_compatibility_snapshot(&snap2).unwrap();
        drop(db2);

        // Second reopen MUST NOT brick with UNIQUE constraint failed on daily_logs.log_date!
        let db3 = Database::open(&path).unwrap();
        let dirty: String = db3
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key='__legacy_snapshot_dirty'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dirty, "false");

        let daily_count: i64 = db3
            .connection
            .query_row("SELECT COUNT(*) FROM daily_logs", [], |r| r.get(0))
            .unwrap();
        let fasting_count: i64 = db3
            .connection
            .query_row("SELECT COUNT(*) FROM fasting_entries", [], |r| r.get(0))
            .unwrap();
        let marketing_count: i64 = db3
            .connection
            .query_row("SELECT COUNT(*) FROM marketing_entries", [], |r| r.get(0))
            .unwrap();
        assert_eq!(daily_count, 1);
        assert_eq!(fasting_count, 1, "fasting_entries must not duplicate on reconcile");
        assert_eq!(
            marketing_count, 1,
            "marketing_entries must not duplicate on reconcile"
        );
    }

    #[test]
    fn p0_5_backup_strict_validation_transaction_atomicity_undelete_and_uncapped_export() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();

        // 1. Strict rejection of malformed / empty / wrong-typed backup payloads.
        for bad in [
            "{}",
            "null",
            "123",
            "[]",
            "\"hello\"",
            r#"{"unrelated": true}"#,
            r#"{"version": "3"}"#,
            r#"{"version": 999}"#,
            r#"{"version": 3, "projects": "not-an-array"}"#,
            r#"{"version": 3, "settings": 123}"#,
            r#"{"version": 3, "kv": []}"#,
            r#"{"projects": []}"#,
            r#"{"projects": [{"bad": true}]}"#,
            r#"{"settings": {"latitude": 999.0}}"#,
        ] {
            let err = db.restore_backup(bad);
            assert!(
                matches!(err, Err(DatabaseError::Validation(_))),
                "expected Validation error for payload {bad}, got {err:?}"
            );
        }

        // 2. Populate projects, ideas, tasks, prayer_logs, fasting_entries, daily_logs,
        // notification_history, >1000 work_session_records, >365 daily_worship_logs, kv.
        let p = db
            .create_project(CreateProject {
                title: "مشروع للاستعادة".into(),
                description: "مهم".into(),
                status: "نشط".into(),
                current_task: None,
                goal: Some("هدف".into()),
                is_current: true,
            })
            .unwrap();
        let idea = db
            .create_idea(CreateIdea {
                title: "فكرة للاستعادة".into(),
                tag: "عام".into(),
                body: "تفاصيل".into(),
            })
            .unwrap();
        let dev_id = db.local_device_id().unwrap();
        let now = Utc::now().to_rfc3339();
        db.connection
            .execute(
                "INSERT INTO tasks(id,project_id,title,notes,status,position,device_id,created_at,updated_at,revision)
                 VALUES('t-1',?1,'مهمة 1','','open',0,?2,?3,?3,1)",
                params![p.id, dev_id, now],
            )
            .unwrap();
        db.connection
            .execute(
                "INSERT INTO prayer_logs(id,prayer_date,prayer_name,status,marked_at,device_id,created_at,updated_at,revision)
                 VALUES('pl-1','2026-10-01','fajr','prayed',?2,?1,?2,?2,1)",
                params![dev_id, now],
            )
            .unwrap();
        db.connection
            .execute(
                "INSERT INTO fasting_entries(id,kind,label,target_date,status,device_id,created_at,updated_at,revision)
                 VALUES('fe-1','custom','الإثنين','2026-10-05','planned',?1,?2,?2,1)",
                params![dev_id, now],
            )
            .unwrap();
        db.connection
            .execute(
                "INSERT INTO daily_logs(id,log_date,payload_json,device_id,created_at,updated_at,revision)
                 VALUES('dl-1','2026-10-01','{\"ok\":true}',?1,?2,?2,1)",
                params![dev_id, now],
            )
            .unwrap();
        db.insert_notification_record(&NotificationRecord {
            id: "n-1".into(),
            title: "تنبيه".into(),
            body: "نص".into(),
            kind: "prayer-at".into(),
            status: "delivered".into(),
            error_message: None,
            created_at: now.clone(),
            read_at: None,
        })
        .unwrap();
        db.kv_set("custom_key", "{\"a\":1}").unwrap();

        // Insert 1020 work sessions & 380 daily worship days to verify NO 1000/365 silent caps.
        {
            let tx = db.connection.unchecked_transaction().unwrap();
            for i in 0..1020 {
                tx.execute(
                    "INSERT INTO work_session_records(id, project_id, project_title, duration_secs, started_at, ended_at, note)
                     VALUES(?1, NULL, NULL, 60, ?2, ?2, NULL)",
                    params![format!("s-{i:04}"), format!("2026-01-01T00:{:02}:{:02}Z", (i / 60) % 60, i % 60)],
                )
                .unwrap();
            }
            let mut d = chrono::NaiveDate::from_ymd_opt(2025, 1, 1).unwrap();
            for _ in 0..380 {
                tx.execute(
                    "INSERT INTO daily_worship_logs(date, fajr, sunrise, dhuhr, asr, maghrib, isha, fasting, note, updated_at)
                     VALUES(?1, 1, 0, 1, 1, 1, 1, 0, NULL, ?2)",
                    params![d.format("%Y-%m-%d").to_string(), now],
                )
                .unwrap();
                d = d.succ_opt().unwrap();
            }
            tx.commit().unwrap();
        }

        let exported = db.export_backup().unwrap();
        let exported_val: Value = serde_json::from_str(&exported).unwrap();
        assert_eq!(exported_val["workSessions"].as_array().unwrap().len(), 1020);
        assert_eq!(exported_val["dailyWorship"].as_array().unwrap().len(), 380);
        assert_eq!(exported_val["tasks"].as_array().unwrap().len(), 1);
        assert_eq!(exported_val["prayerLogs"].as_array().unwrap().len(), 1);
        assert_eq!(exported_val["fastingEntries"].as_array().unwrap().len(), 1);
        assert_eq!(exported_val["dailyLogs"].as_array().unwrap().len(), 1);
        assert_eq!(
            exported_val["notificationHistory"].as_array().unwrap().len(),
            1
        );

        // 3. Soft-delete project & idea, then restore backup -> MUST clear deleted_at = NULL!
        assert!(db.delete_project(&p.id).unwrap());
        assert!(db.delete_idea(&idea.id).unwrap());
        assert_eq!(db.projects().unwrap().len(), 0);
        assert_eq!(db.ideas().unwrap().len(), 0);

        db.restore_backup(&exported).unwrap();
        assert_eq!(db.projects().unwrap().len(), 1);
        assert_eq!(db.projects().unwrap()[0].id, p.id);
        assert_eq!(db.ideas().unwrap().len(), 1);
        assert_eq!(db.ideas().unwrap()[0].id, idea.id);

        // 4. Transactional rollback on mid-restore SQL error (broken FK in tasks rolls back settings + projects!).
        let broken_fk_backup = json!({
            "version": 3,
            "settings": { "locationLabel": "SHOULD_ROLL_BACK" },
            "projects": [],
            "tasks": [{
                "id": "bad-task",
                "projectId": "non-existent-project-fk",
                "title": "orphan",
                "notes": "",
                "status": "open",
                "position": 0,
                "deviceId": dev_id,
                "createdAt": now,
                "updatedAt": now,
                "revision": 1
            }]
        })
        .to_string();
        assert!(db.restore_backup(&broken_fk_backup).is_err());
        assert_ne!(
            db.get_preferences().unwrap().location_label,
            "SHOULD_ROLL_BACK",
            "restore_backup must roll back atomically on any SQL failure"
        );
    }

    #[test]
    fn full_backup_replaces_existing_data_atomically() {
        let fixture = tempdir().unwrap();
        let source = Database::open(fixture.path().join("source.sqlite3")).unwrap();
        source.kv_set("retained", "true").unwrap();
        let target_path = fixture.path().join("target.sqlite3");
        let target = Database::open(&target_path).unwrap();
        target.kv_set("stale", "true").unwrap();
        target.save_compatibility_snapshot(r#"{"projects":[{"title":"stale"}]}"#).unwrap();
        target.create_project(CreateProject {
            title: "Existing".into(),
            description: String::new(),
            status: "active".into(),
            current_task: None,
            goal: None,
            is_current: false,
        }).unwrap();

        let export = source.export_backup().unwrap();
        let mut malformed: Value = serde_json::from_str(&export).unwrap();
        malformed["tasks"] = json!([{
            "id": "broken-task",
            "projectId": "missing-project",
            "title": "Missing parent",
            "deviceId": "device",
            "createdAt": "2026-11-22T10:00:00Z",
            "updatedAt": "2026-11-22T10:00:00Z",
        }]);
        assert!(target.restore_backup(&malformed.to_string()).is_err());
        assert_eq!(target.projects().unwrap().len(), 1);
        assert_eq!(target.kv_get("stale").unwrap().as_deref(), Some("true"));

        target.restore_backup(&export).unwrap();
        drop(target);
        let reopened = Database::open(&target_path).unwrap();
        assert!(reopened.projects().unwrap().is_empty());
        assert!(reopened.kv_get("stale").unwrap().is_none());
        assert_eq!(reopened.kv_get("retained").unwrap().as_deref(), Some("true"));

        // Previously exported v3 files have the same fields without the new format marker.
        let mut old_export: Value = serde_json::from_str(&export).unwrap();
        old_export.as_object_mut().unwrap().remove("format");
        reopened.kv_set("stale", "true").unwrap();
        reopened.restore_backup(&old_export.to_string()).unwrap();
        assert!(reopened.kv_get("stale").unwrap().is_none());

        // A partial import still merges its selected domains.
        reopened.restore_backup(r#"{"version":2,"kv":{"added":true}}"#).unwrap();
        assert_eq!(reopened.kv_get("added").unwrap().as_deref(), Some("true"));
        assert_eq!(reopened.kv_get("retained").unwrap().as_deref(), Some("true"));

    }

    #[test]
    fn restores_legacy_worship_from_unmarked_native_backup() {
        let fixture = tempdir().unwrap();
        let db = Database::open(fixture.path().join("wens.sqlite3")).unwrap();
        let mut backup: Value = serde_json::from_str(&db.export_backup().unwrap()).unwrap();
        let migration_time = "2026-11-20T00:00:00Z";
        let migrated_date = "2026-11-18";
        let edited_date = "2026-11-19";

        backup.as_object_mut().unwrap().remove("format");
        backup["dailyLogs"] = json!([migrated_date, edited_date].map(|date| json!({
            "id": date,
            "logDate": date,
            "payloadJson": json!({
                "prayers": { "الفجر": "done" },
                "fasting": "yes"
            }).to_string(),
            "deviceId": "legacy-device",
            "createdAt": migration_time,
            "updatedAt": migration_time
        })));
        backup["dailyWorship"] = json!([
            { "date": migrated_date, "updatedAt": migration_time },
            { "date": edited_date, "updatedAt": "2026-11-21T00:00:00Z" }
        ]);

        db.restore_backup(&backup.to_string()).unwrap();
        let migrated = db.get_daily_worship(migrated_date).unwrap().unwrap();
        assert!(migrated.fajr);
        assert!(migrated.fasting);
        let edited = db.get_daily_worship(edited_date).unwrap().unwrap();
        assert!(!edited.fajr);
        assert!(!edited.fasting);
    }

    #[test]
    fn backfills_legacy_worship_values_without_overwriting_updated_checks() {
        let fixture = tempdir().unwrap();
        let path = fixture.path().join("wens.sqlite3");
        let date_from_migration = "2026-11-18";
        let manually_changed_date = "2026-11-19";
        let timestamp = "2026-11-20T00:00:00Z";
        {
            let db = Database::open(&path).unwrap();
            db.connection.execute("DELETE FROM settings", []).unwrap();
            let device = db.local_device_id().unwrap();
            let payload = json!({
                "prayers": { "الفجر": "done", "الظهر": "made-up", "العصر": "excused" },
                "fasting": "yes"
            }).to_string();
            for date in [date_from_migration, manually_changed_date] {
                db.connection.execute(
                    "INSERT INTO daily_logs(id, log_date, payload_json, device_id, created_at, updated_at)
                     VALUES(?1,?1,?2,?3,?4,?4)",
                    params![date, payload, device, timestamp]
                ).unwrap();
                let ts = if date == date_from_migration { timestamp } else { "2026-11-21T00:00:00Z" };
                db.connection.execute(
                    "INSERT INTO daily_worship_logs(date, updated_at) VALUES(?1,?2)",
                    params![date, ts]
                ).unwrap();
            }
        }
        let db = Database::open(&path).unwrap();
        let repaired = db.get_daily_worship(date_from_migration).unwrap().unwrap();
        assert!(repaired.fajr);
        assert!(repaired.dhuhr);
        assert!(!repaired.asr);
        assert!(repaired.fasting);

        let manual = db.get_daily_worship(manually_changed_date).unwrap().unwrap();
        assert!(!manual.fajr);
        assert!(!manual.fasting);
    }

    #[test]
    fn p1_9_v1_and_v2_migration_populates_v3_tables_and_skips_onboarding_for_existing_users() {
        // Brand-new DB -> onboarding_completed must be false and stay false on reopen.
        let fresh_dir = tempdir().unwrap();
        let fresh_path = fresh_dir.path().join("fresh.sqlite3");
        {
            let db = Database::open(&fresh_path).unwrap();
            assert!(!db.get_preferences().unwrap().onboarding_completed);
        }
        {
            let db = Database::open(&fresh_path).unwrap();
            assert!(!db.get_preferences().unwrap().onboarding_completed);
        }

        // Legacy v1 DB -> upgrades to v3 with work_session_records, daily_worship_logs, onboarding_completed = true.
        let v1_dir = tempdir().unwrap();
        let v1_path = v1_dir.path().join("v1.sqlite3");
        {
            let conn = Connection::open(&v1_path).unwrap();
            ensure_legacy_tables(&conn).unwrap();
            let legacy = json!({
                "settings": {"latitude": 24.7136, "longitude": 46.6753, "locationLabel": "الرياض"},
                "projects": [{"title":"مشروع قديم","status":"نشط"}],
                "workSessions": [{"id":"ws-old","startedAt":"2026-08-26T10:00:00Z","endedAt":"2026-08-26T10:30:00Z","durationMs":1800000}],
                "accountability": {"days":{"2026-08-26":{"prayers":{"الفجر":"done","dhuhr":true},"fasting":"yes","note":"يوم مبارك"}}}
            })
            .to_string();
            conn.execute("INSERT INTO app_state(key,value) VALUES('root',?1)", [&legacy])
                .unwrap();
        }
        let db = Database::open(&v1_path).unwrap();
        let prefs = db.get_preferences().unwrap();
        assert!(
            prefs.onboarding_completed,
            "existing migrated user must have onboarding_completed = true"
        );
        let sessions = db.list_work_sessions(10).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "ws-old");
        assert_eq!(sessions[0].duration_secs, 1800);
        let worship = db.get_daily_worship("2026-08-26").unwrap().unwrap();
        assert!(worship.fajr);
        assert!(worship.dhuhr);
        assert!(worship.fasting);
        assert_eq!(worship.note.as_deref(), Some("يوم مبارك"));
    }

    #[test]
    fn corrupt_db_auto_recovers_and_quarantines_corrupt_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("wens.sqlite3");
        let wal_path = dir.path().join("wens.sqlite3-wal");
        fs::write(&path, b"THIS IS COMPLETELY CORRUPT NON-SQLITE GARBAGE DATA").unwrap();
        fs::write(&wal_path, b"corrupt wal").unwrap();

        let db = Database::open(&path).unwrap();
        assert_eq!(db.projects().unwrap().len(), 0);
        db.create_project(CreateProject {
            title: "بعد التعافي".into(),
            description: "".into(),
            status: "نشط".into(),
            current_task: None,
            goal: None,
            is_current: false,
        })
        .unwrap();
        assert_eq!(db.projects().unwrap().len(), 1);

        let quarantined: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains(".corrupt.") && name.ends_with(".bak"))
            .collect();
        assert_eq!(quarantined.len(), 1, "corrupt DB must be quarantined as .corrupt.<epoch>.bak");
    }

    #[test]
    fn change_journal_records_exact_operations_and_factory_reset_wipes_cleanly() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("wens.sqlite3");
        let db = Database::open(&path).unwrap();

        let mut prefs = db.get_preferences().unwrap();
        prefs.onboarding_completed = true;
        prefs.location_label = "المدينة المنورة".into();
        db.save_preferences(&prefs).unwrap();

        let p = db
            .create_project(CreateProject {
                title: "أول".into(),
                description: "".into(),
                status: "جديد".into(),
                current_task: None,
                goal: None,
                is_current: true,
            })
            .unwrap();
        db.update_project(UpdateProject {
            id: p.id.clone(),
            title: Some("محدث".into()),
            description: None,
            status: None,
            progress: Some(40),
            symbol: None,
            current_task: None,
            goal: None,
            is_current: None,
        })
        .unwrap();
        db.delete_project(&p.id).unwrap();

        let idea = db
            .create_idea(CreateIdea {
                title: "فكرة للترقية".into(),
                tag: "منتج".into(),
                body: "وصف".into(),
            })
            .unwrap();
        db.promote_idea_to_project(&idea.id).unwrap();

        let ops: Vec<(String, String)> = {
            let mut stmt = db
                .connection
                .prepare("SELECT entity_type, operation FROM change_journal ORDER BY sequence ASC")
                .unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(
            ops,
            vec![
                ("project".to_string(), "insert".to_string()),
                ("project".to_string(), "update".to_string()),
                ("project".to_string(), "delete".to_string()),
                ("idea".to_string(), "insert".to_string()),
                ("project".to_string(), "insert".to_string()),
                ("idea".to_string(), "delete".to_string()),
            ]
        );

        // Factory reset wipes all user data and resets preferences to defaults.
        db.kv_set("k", "\"v\"").unwrap();
        db.factory_reset().unwrap();
        let boot = db.bootstrap().unwrap();
        assert!(boot.projects.is_empty());
        assert!(boot.ideas.is_empty());
        assert_eq!(boot.settings, AppPreferences::default());
        assert!(!boot.settings.onboarding_completed);
        assert!(db.kv_get("k").unwrap().is_none());

        drop(db);
        let reopened = Database::open(&path).unwrap();
        assert!(!reopened.get_preferences().unwrap().onboarding_completed);
    }

    #[test]
    fn concurrent_multi_thread_sqlite_access_has_zero_lock_errors() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("concurrent.sqlite3");
        let _init = Database::open(&path).unwrap();

        let handles: Vec<_> = (0..6)
            .map(|tid| {
                let p = path.clone();
                std::thread::spawn(move || {
                    for iter in 0..20 {
                        let db = Database::open(&p).unwrap();
                        db.kv_set(&format!("k-{tid}-{iter}"), "\"ok\"").unwrap();
                        let _ = db.get_preferences().unwrap();
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
    }

    #[test]
    fn reconcile_preserves_existing_legacy_settings_when_app_preferences_exists() {
        // Case 1: Active v3 DB with canonical `app_preferences` and existing legacy `settings['overlayWidget'] = 'true'`
        let dir = tempdir().unwrap();
        let path = dir.path().join("wens.sqlite3");
        {
            let db = Database::open(&path).unwrap();
            let mut prefs = db.get_preferences().unwrap();
            prefs.overlay_widget = true;
            db.save_preferences(&prefs).unwrap();
            db.connection
                .execute(
                    "INSERT OR REPLACE INTO settings(key,value_json,updated_at) VALUES('overlayWidget','true',CURRENT_TIMESTAMP)",
                    [],
                )
                .unwrap();
            db.save_compatibility_snapshot(
                &json!({
                    "settings": {
                        "overlayWidget": false,
                        "newLegacyKey": 42
                    }
                })
                .to_string(),
            )
            .unwrap();
        }

        let reopened = Database::open(&path).unwrap();
        let overlay_row: String = reopened
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key='overlayWidget'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let new_key_row: String = reopened
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key='newLegacyKey'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let dirty_row: String = reopened
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key='__legacy_snapshot_dirty'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(overlay_row, "true", "existing legacy setting must not be overwritten when app_preferences exists");
        assert_eq!(new_key_row, "42", "missing legacy setting key should still be inserted via INSERT OR IGNORE");
        assert_eq!(dirty_row, "false");
        assert!(reopened.get_preferences().unwrap().overlay_widget);

        // Case 2: v2 -> v3 upgrade where `settings['overlayWidget'] = 'true'` and stale `app_state.root` has `overlayWidget: false`
        let v2_dir = tempdir().unwrap();
        let v2_path = v2_dir.path().join("v2.sqlite3");
        {
            let mut conn = Connection::open(&v2_path).unwrap();
            ensure_legacy_tables(&conn).unwrap();
            let tx = conn.transaction().unwrap();
            create_v2_schema(&tx).unwrap();
            let _ = ensure_local_device(&tx).unwrap();
            tx.execute("INSERT INTO schema_migrations(version) VALUES(2)", [])
                .unwrap();
            tx.execute(
                "INSERT INTO settings(key,value_json,updated_at) VALUES('overlayWidget','true',CURRENT_TIMESTAMP)",
                [],
            )
            .unwrap();
            tx.execute(
                "INSERT INTO settings(key,value_json,updated_at) VALUES('__legacy_snapshot_dirty','true',CURRENT_TIMESTAMP)",
                [],
            )
            .unwrap();
            tx.execute(
                "INSERT INTO app_state(key,value) VALUES('root',?1)",
                [json!({ "settings": { "overlayWidget": false } }).to_string()],
            )
            .unwrap();
            tx.commit().unwrap();
        }

        let upgraded = Database::open(&v2_path).unwrap();
        let upgraded_overlay: String = upgraded
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key='overlayWidget'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            upgraded_overlay, "true",
            "v2->v3 upgrade must not flip legacy overlayWidget from true to false"
        );
        assert!(upgraded.get_preferences().unwrap().overlay_widget);
    }
}
