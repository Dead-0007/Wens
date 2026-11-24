use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Stable public envelope written to the local change journal.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRecord {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: ChangeOperation,
    pub device_id: String,
    pub hlc: String,
    pub revision: i64,
    pub payload: Option<Value>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChangeOperation {
    Upsert,
    Delete,
}

/// SyncEnvelope v1. Transport encryption is applied outside this structure.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncEnvelope {
    pub version: u16,
    pub envelope_id: String,
    pub sender_device_id: String,
    pub cursor: Option<String>,
    pub changes: Vec<ChangeRecord>,
    pub sent_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub signing_public_key: String,
    pub exchange_public_key: String,
    pub created_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentJob {
    pub id: String,
    pub source_device_id: String,
    pub connector: String,
    pub prompt: String,
    pub working_directory: String,
    pub selected_files: Vec<String>,
    pub permissions: Vec<String>,
    pub read_only: bool,
    pub timeout_ms: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentResult {
    pub job_id: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub completed_at: String,
}
