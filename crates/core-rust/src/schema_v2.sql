CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL,
  signing_public_key TEXT, exchange_public_key TEXT, is_local INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_local_device ON devices(is_local) WHERE is_local=1;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', locale TEXT NOT NULL DEFAULT 'ar-EG',
  device_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), symbol TEXT NOT NULL DEFAULT '✦', current_task TEXT,
  device_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
  position INTEGER NOT NULL DEFAULT 0, due_at TEXT, completed_at TEXT, device_id TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, tag TEXT NOT NULL DEFAULT 'فكرة', body TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS prayer_logs (
  id TEXT PRIMARY KEY, prayer_date TEXT NOT NULL, prayer_name TEXT NOT NULL, status TEXT NOT NULL, marked_at TEXT,
  device_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
  UNIQUE(prayer_date, prayer_name)
);
CREATE TABLE IF NOT EXISTS fasting_entries (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT NOT NULL, target_date TEXT, status TEXT NOT NULL,
  device_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), task_id TEXT REFERENCES tasks(id), started_at TEXT NOT NULL, ended_at TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'app', device_id TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS marketing_entries (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL, device_id TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS daily_logs (
  id TEXT PRIMARY KEY, log_date TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, device_id TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY, version TEXT NOT NULL, publisher TEXT NOT NULL, manifest_json TEXT NOT NULL, install_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, trusted INTEGER NOT NULL DEFAULT 0, installed_at TEXT NOT NULL, updated_at TEXT NOT NULL, rollback_json TEXT
);
CREATE TABLE IF NOT EXISTS change_journal (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  operation TEXT NOT NULL, device_id TEXT NOT NULL, hlc TEXT NOT NULL, revision INTEGER NOT NULL,
  payload_json TEXT, created_at TEXT NOT NULL, acknowledged_at TEXT
);
CREATE TABLE IF NOT EXISTS sync_peers (
  device_id TEXT PRIMARY KEY REFERENCES devices(id), last_cursor TEXT, last_seen_at TEXT, pairing_state TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS agent_jobs (
  id TEXT PRIMARY KEY, source_device_id TEXT NOT NULL, connector TEXT NOT NULL, request_json TEXT NOT NULL,
  approval_state TEXT NOT NULL DEFAULT 'pending', result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS legacy_backups (
  id TEXT PRIMARY KEY, source_schema INTEGER NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_history (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL, error_message TEXT, created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at DESC);

