//! Shared, UI-independent local core for Wens.
//!
//! The crate owns durable data contracts and database migration. Desktop and
//! Android shells must call these services instead of reading SQLite directly.

pub mod contracts;
pub mod database;
pub mod lan;
pub mod models;
pub mod prayer;
pub mod sync;

pub use database::{Database, DatabaseError, MigrationReport, CURRENT_SCHEMA_VERSION};
pub use lan::{send_once, EncryptedFrame, LanError};
pub use models::{
    AccentId, AppPreferences, AudioPreferences, BackgroundAudioMode, BootstrapPayload, CreateIdea,
    CreateProject, DailyWorshipRecord, DeliveryResult, FastingSoundMode, Idea,
    NotificationPreferences, NotificationRecord, NotificationSummary, PrayerSoundMode, Project,
    QuietHours, ReminderEvent, ThemeId, UpdateIdea, UpdateProject, WorkSessionRecord,
    WorkSoundMode,
};
pub use prayer::{calculate_prayer_day, AsrJurist, CalculationMethod, PrayerDay, PrayerRequest};
pub use sync::{
    compare_hlc, decode_pairing, encode_pairing, resolve_scalar, Conflict, CryptoError,
    HybridLogicalClock, PairingPayload, SyncConflict, SyncCrypto,
};
