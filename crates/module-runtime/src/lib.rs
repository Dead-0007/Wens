use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{Read, Seek},
    path::Path,
};
use thiserror::Error;
use zip::ZipArchive;

pub const MANIFEST_VERSION: u16 = 1;
const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_PACKAGE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_ARCHIVE_FILES: usize = 2048;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModuleManifest {
    pub manifest_version: u16,
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub min_app_version: String,
    pub module_types: Vec<ModuleType>,
    #[serde(default)]
    pub permissions: Vec<String>,
    pub entry_data: Vec<String>,
    #[serde(default)]
    pub assets: Vec<String>,
    #[serde(default)]
    pub locales: Vec<String>,
    pub content_hash: String,
    #[serde(default)]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ModuleType {
    MarketingTemplate,
    ProjectTemplate,
    FastingRule,
    ReminderContent,
    PersonalityLines,
    Theme,
    IconPack,
    CreativeTemplate,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackagePreview {
    pub manifest: ModuleManifest,
    pub signed: bool,
    pub trusted: bool,
    pub files: Vec<String>,
    pub unpacked_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub module_id: String,
    pub version: String,
    pub install_path: String,
    pub rollback_path: Option<String>,
    pub preview: PackagePreview,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RollbackResult {
    pub module_id: String,
    pub version: String,
    pub install_path: String,
    pub displaced_path: Option<String>,
}

#[derive(Debug, Error)]
pub enum PackageError {
    #[error("package file error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid ZIP package: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("invalid manifest: {0}")]
    Manifest(#[from] serde_json::Error),
    #[error("manifest.json is missing")]
    MissingManifest,
    #[error("unsafe or unsupported package path: {0}")]
    UnsafePath(String),
    #[error("executable content is forbidden in data-only packages: {0}")]
    ExecutableContent(String),
    #[error("package exceeds the size limit")]
    TooLarge,
    #[error("content hash does not match the manifest")]
    HashMismatch,
    #[error("package is unsigned; enable Developer Mode for this install")]
    Unsigned,
    #[error("publisher signature is invalid")]
    InvalidSignature,
    #[error("publisher is not trusted: {0}")]
    UnknownPublisher(String),
    #[error("manifest references a missing file: {0}")]
    MissingEntry(String),
    #[error("unsupported manifest version {0}")]
    UnsupportedVersion(u16),
    #[error("no rollback version is available for module {0}")]
    NoRollback(String),
}

pub fn preview_package(
    path: impl AsRef<Path>,
    trusted_publishers: &BTreeMap<String, VerifyingKey>,
    developer_mode: bool,
) -> Result<PackagePreview, PackageError> {
    let file = File::open(path)?;
    if file.metadata()?.len() > MAX_PACKAGE_BYTES {
        return Err(PackageError::TooLarge);
    }
    validate_archive(file, trusted_publishers, developer_mode)
}

/// Build the canonical byte payload signed by Ed25519 for a `.wenspack` manifest.
/// Covers the full canonical `manifest.json` (with `signature` cleared) AND `content_hash`,
/// so tampering with `id`, `version`, `permissions`, `publisher`, or any other manifest field
/// invalidates the signature.
pub fn canonical_signing_payload(manifest: &ModuleManifest) -> Vec<u8> {
    let mut unsigned = manifest.clone();
    unsigned.signature = None;
    let canonical_manifest =
        serde_json::to_vec(&unsigned).expect("ModuleManifest serialization is infallible");
    let normalized_hash = manifest.content_hash.to_ascii_lowercase();
    let mut payload =
        Vec::with_capacity(20 + canonical_manifest.len() + normalized_hash.len());
    payload.extend_from_slice(b"wenspack-sig-v1\0");
    payload.extend_from_slice(&canonical_manifest);
    payload.push(0);
    payload.extend_from_slice(normalized_hash.as_bytes());
    payload
}

/// Produce a base64-encoded Ed25519 signature over `canonical_signing_payload(manifest)`.
pub fn sign_manifest(manifest: &ModuleManifest, signing_key: &SigningKey) -> String {
    let payload = canonical_signing_payload(manifest);
    let sig = signing_key.sign(&payload);
    BASE64.encode(sig.to_bytes())
}

/// Validate, stage, and atomically install a data-only package. Existing
/// versions are moved to a rollback directory before the final rename.
pub fn install_package(
    path: impl AsRef<Path>,
    modules_dir: impl AsRef<Path>,
    trusted_publishers: &BTreeMap<String, VerifyingKey>,
    developer_mode: bool,
) -> Result<InstallResult, PackageError> {
    let source = path.as_ref();
    let preview = preview_package(source, trusted_publishers, developer_mode)?;
    validate_module_id(&preview.manifest.id)?;
    validate_module_version(&preview.manifest.version)?;
    let modules_dir = modules_dir.as_ref();
    fs::create_dir_all(modules_dir)?;
    let canonical_modules_dir = fs::canonicalize(modules_dir)?;
    let staging_root = canonical_modules_dir.join(".staging");
    let rollback_root = canonical_modules_dir.join(".rollback");
    fs::create_dir_all(&staging_root)?;
    fs::create_dir_all(&rollback_root)?;
    let canonical_staging_root = fs::canonicalize(&staging_root)?;
    let canonical_rollback_root = fs::canonicalize(&rollback_root)?;

    let token = format!("{}-{}", preview.manifest.id, std::process::id());
    validate_safe_component(&token)?;
    let stage = canonical_staging_root.join(&token);
    ensure_direct_child(&canonical_staging_root, &stage, &token)?;
    if stage.exists() {
        fs::remove_dir_all(&stage)?;
    }
    fs::create_dir_all(&stage)?;
    let extraction = extract_data_files(source, &stage);
    if let Err(error) = extraction {
        let _ = fs::remove_dir_all(&stage);
        return Err(error);
    }

    let destination = canonical_modules_dir.join(&preview.manifest.id);
    ensure_direct_child(&canonical_modules_dir, &destination, &preview.manifest.id)?;

    let rollback = if destination.exists() {
        let backup_name = format!("{}-{}", preview.manifest.id, preview.manifest.version);
        validate_safe_component(&backup_name)?;
        let backup = canonical_rollback_root.join(&backup_name);
        ensure_direct_child(&canonical_rollback_root, &backup, &backup_name)?;
        if backup.exists() {
            fs::remove_dir_all(&backup)?;
        }
        fs::rename(&destination, &backup)?;
        Some(backup)
    } else {
        None
    };
    if let Err(error) = fs::rename(&stage, &destination) {
        if let Some(backup) = rollback.as_ref() {
            let _ = fs::rename(backup, &destination);
        }
        let _ = fs::remove_dir_all(&stage);
        return Err(PackageError::Io(error));
    }
    Ok(InstallResult {
        module_id: preview.manifest.id.clone(),
        version: preview.manifest.version.clone(),
        install_path: destination.to_string_lossy().to_string(),
        rollback_path: rollback.map(|path| path.to_string_lossy().to_string()),
        preview,
    })
}

pub fn rollback_package(
    module_id: &str,
    modules_dir: impl AsRef<Path>,
) -> Result<RollbackResult, PackageError> {
    validate_module_id(module_id)?;
    let modules_dir = modules_dir.as_ref();
    let canonical_modules_dir = fs::canonicalize(modules_dir)
        .map_err(|_| PackageError::NoRollback(module_id.into()))?;
    let rollback_root = canonical_modules_dir.join(".rollback");
    let canonical_rollback_root = fs::canonicalize(&rollback_root)
        .map_err(|_| PackageError::NoRollback(module_id.into()))?;

    let prefix = format!("{module_id}-");
    let mut candidates = Vec::new();
    for entry in fs::read_dir(&canonical_rollback_root)
        .map_err(|_| PackageError::NoRollback(module_id.into()))?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.starts_with(&prefix) || validate_safe_component(name).is_err() {
            continue;
        }
        if fs::symlink_metadata(&path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let Ok(canon) = fs::canonicalize(&path) else {
            continue;
        };
        if canon.starts_with(&canonical_rollback_root)
            && canon.parent() == Some(canonical_rollback_root.as_path())
        {
            candidates.push(canon);
        }
    }
    candidates.sort();
    let previous = candidates
        .pop()
        .ok_or_else(|| PackageError::NoRollback(module_id.into()))?;
    ensure_direct_child(
        &canonical_rollback_root,
        &previous,
        &previous.to_string_lossy(),
    )?;

    let destination = canonical_modules_dir.join(module_id);
    ensure_direct_child(&canonical_modules_dir, &destination, module_id)?;

    let displaced = if destination.exists() {
        let displaced_name = format!("{module_id}-current-{}", std::process::id());
        validate_safe_component(&displaced_name)?;
        let path = canonical_rollback_root.join(&displaced_name);
        ensure_direct_child(&canonical_rollback_root, &path, &displaced_name)?;
        if path.exists() {
            fs::remove_dir_all(&path)?;
        }
        fs::rename(&destination, &path)?;
        Some(path)
    } else {
        None
    };
    fs::rename(&previous, &destination)?;
    let manifest: ModuleManifest =
        serde_json::from_slice(&fs::read(destination.join("manifest.json"))?)?;
    validate_module_id(&manifest.id)?;
    validate_module_version(&manifest.version)?;
    Ok(RollbackResult {
        module_id: module_id.into(),
        version: manifest.version,
        install_path: destination.to_string_lossy().to_string(),
        displaced_path: displaced.map(|path| path.to_string_lossy().to_string()),
    })
}

fn extract_data_files(source: &Path, destination: &Path) -> Result<(), PackageError> {
    let canonical_dest = fs::canonicalize(destination)?;
    let mut archive = ZipArchive::new(File::open(source)?)?;
    if archive.len() > MAX_ARCHIVE_FILES {
        return Err(PackageError::TooLarge);
    }
    let mut total = 0_u64;
    let mut seen = BTreeSet::new();
    for index in 0..archive.len() {
        let file = archive.by_index(index)?;
        let raw_name = file.name()?.replace('\\', "/");
        if file.is_dir() {
            let trimmed = raw_name.trim_end_matches('/');
            if !trimmed.is_empty() {
                validate_path(trimmed)?;
            }
            continue;
        }
        validate_path(&raw_name)?;
        if !seen.insert(raw_name.clone()) {
            return Err(PackageError::UnsafePath(raw_name));
        }
        reject_executable(&raw_name)?;
        let output = canonical_dest.join(&raw_name);
        if !output.starts_with(&canonical_dest) {
            return Err(PackageError::UnsafePath(raw_name));
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
            let canon_parent = fs::canonicalize(parent)?;
            if !canon_parent.starts_with(&canonical_dest) {
                return Err(PackageError::UnsafePath(raw_name));
            }
        }
        let mut out = File::create(&output)?;
        let mut limited = file.take(MAX_FILE_BYTES + 1);
        let copied = std::io::copy(&mut limited, &mut out)?;
        if copied > MAX_FILE_BYTES {
            let _ = fs::remove_file(&output);
            return Err(PackageError::TooLarge);
        }
        total = total.saturating_add(copied);
        if total > MAX_PACKAGE_BYTES {
            let _ = fs::remove_file(&output);
            return Err(PackageError::TooLarge);
        }
    }
    Ok(())
}

fn is_windows_reserved_name(segment: &str) -> bool {
    let stem = segment.split('.').next().unwrap_or(segment);
    matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn validate_safe_component(value: &str) -> Result<(), PackageError> {
    if value.is_empty()
        || value.len() > 200
        || value.starts_with('.')
        || value.ends_with('.')
        || value.ends_with(' ')
        || value.contains("..")
        || value.contains('/')
        || value.contains('\\')
        || value.contains(':')
        || is_windows_reserved_name(value)
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(PackageError::UnsafePath(value.into()));
    }
    Ok(())
}

fn ensure_direct_child(root: &Path, candidate: &Path, label: &str) -> Result<(), PackageError> {
    if !candidate.starts_with(root) || candidate.parent() != Some(root) {
        return Err(PackageError::UnsafePath(label.into()));
    }
    Ok(())
}

pub fn validate_module_id(id: &str) -> Result<(), PackageError> {
    if id.is_empty()
        || id.len() > 120
        || id.starts_with('.')
        || id.ends_with('.')
        || id.ends_with(' ')
        || id.contains("..")
        || id.contains('/')
        || id.contains('\\')
        || id.contains(':')
        || !id.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        || !id.chars().last().is_some_and(|c| c.is_ascii_alphanumeric())
        || is_windows_reserved_name(id)
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(PackageError::UnsafePath(id.into()));
    }
    Ok(())
}

pub fn validate_module_version(version: &str) -> Result<(), PackageError> {
    if version.is_empty()
        || version.len() > 64
        || version.starts_with('.')
        || version.ends_with('.')
        || version.ends_with(' ')
        || version.contains("..")
        || version.contains('/')
        || version.contains('\\')
        || version.contains(':')
        || !version.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        || !version.chars().last().is_some_and(|c| c.is_ascii_alphanumeric())
        || is_windows_reserved_name(version)
        || !version.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(PackageError::UnsafePath(version.into()));
    }
    Ok(())
}

pub fn validate_archive<R: Read + Seek>(
    reader: R,
    trusted_publishers: &BTreeMap<String, VerifyingKey>,
    developer_mode: bool,
) -> Result<PackagePreview, PackageError> {
    let mut archive = ZipArchive::new(reader)?;
    if archive.len() > MAX_ARCHIVE_FILES {
        return Err(PackageError::TooLarge);
    }
    let mut manifest_bytes = None;
    let mut content = BTreeMap::<String, Vec<u8>>::new();
    let mut total = 0_u64;
    for index in 0..archive.len() {
        let file = archive.by_index(index)?;
        let raw_name = file.name()?.replace('\\', "/");
        if file.is_dir() {
            let trimmed = raw_name.trim_end_matches('/');
            if !trimmed.is_empty() {
                validate_path(trimmed)?;
            }
            continue;
        }
        validate_path(&raw_name)?;
        reject_executable(&raw_name)?;

        // Streaming bounded read: never trust spoofed ZIP header `file.size()` (blocks Zip Bombs).
        let mut bytes = Vec::with_capacity((file.size().min(64 * 1024)) as usize);
        let mut limited = file.take(MAX_FILE_BYTES + 1);
        limited.read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_FILE_BYTES {
            return Err(PackageError::TooLarge);
        }
        total = total.saturating_add(bytes.len() as u64);
        if total > MAX_PACKAGE_BYTES {
            return Err(PackageError::TooLarge);
        }

        if raw_name == "manifest.json" {
            if manifest_bytes.is_some() {
                return Err(PackageError::UnsafePath(raw_name));
            }
            manifest_bytes = Some(bytes);
        } else {
            if content.contains_key(&raw_name) {
                return Err(PackageError::UnsafePath(raw_name));
            }
            content.insert(raw_name, bytes);
        }
    }
    let manifest: ModuleManifest =
        serde_json::from_slice(&manifest_bytes.ok_or(PackageError::MissingManifest)?)?;
    if manifest.manifest_version != MANIFEST_VERSION {
        return Err(PackageError::UnsupportedVersion(manifest.manifest_version));
    }
    validate_module_id(&manifest.id)?;
    validate_module_version(&manifest.version)?;

    for name in manifest.entry_data.iter().chain(manifest.assets.iter()) {
        validate_path(name)?;
        reject_executable(name)?;
        if !content.contains_key(name) {
            return Err(PackageError::MissingEntry(name.clone()));
        }
    }
    let actual_hash = content_hash(&content);
    if !actual_hash.eq_ignore_ascii_case(&manifest.content_hash) {
        return Err(PackageError::HashMismatch);
    }

    let (signed, trusted) = match manifest.signature.as_deref() {
        Some(encoded) => {
            let key = trusted_publishers
                .get(&manifest.publisher)
                .ok_or_else(|| PackageError::UnknownPublisher(manifest.publisher.clone()))?;
            let signature_bytes = BASE64
                .decode(encoded)
                .map_err(|_| PackageError::InvalidSignature)?;
            let signature = Signature::try_from(signature_bytes.as_slice())
                .map_err(|_| PackageError::InvalidSignature)?;
            let signing_payload = canonical_signing_payload(&manifest);
            key.verify(&signing_payload, &signature)
                .map_err(|_| PackageError::InvalidSignature)?;
            (true, true)
        }
        None if developer_mode => (false, false),
        None => return Err(PackageError::Unsigned),
    };
    Ok(PackagePreview {
        manifest,
        signed,
        trusted,
        files: content.keys().cloned().collect(),
        unpacked_bytes: total,
    })
}

pub fn content_hash(files: &BTreeMap<String, Vec<u8>>) -> String {
    let mut digest = Sha256::new();
    for (name, bytes) in files {
        digest.update(name.as_bytes());
        digest.update([0]);
        digest.update(bytes);
        digest.update([0]);
    }
    format!("{:x}", digest.finalize())
}

fn validate_path(name: &str) -> Result<(), PackageError> {
    if name.is_empty()
        || name.starts_with('/')
        || name.starts_with('\\')
        || name.ends_with('/')
        || name.contains('\\')
        || name.contains(':')
        || name.contains("../")
        || name.chars().any(|c| c.is_control())
    {
        return Err(PackageError::UnsafePath(name.into()));
    }
    for part in name.split('/') {
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with('.')
            || part.ends_with(' ')
            || is_windows_reserved_name(part)
        {
            return Err(PackageError::UnsafePath(name.into()));
        }
    }
    Ok(())
}

fn reject_executable(name: &str) -> Result<(), PackageError> {
    let filename = name.rsplit('/').next().unwrap_or(name);
    if filename.contains(':') || filename.ends_with('.') || filename.ends_with(' ') {
        return Err(PackageError::UnsafePath(name.into()));
    }
    let Some((_, raw_ext)) = filename.rsplit_once('.') else {
        return Ok(());
    };
    let extension = raw_ext.to_ascii_lowercase();
    let forbidden = BTreeSet::from([
        "hta", "vbs", "vbe", "js", "jse", "mjs", "cjs", "wsf", "wsh", "lnk", "html", "htm",
        "xhtml", "ps1", "psm1", "psd1", "cmd", "bat", "scr", "msi", "msp", "mst", "exe", "dll",
        "com", "pif", "cpl", "reg", "jar", "sh", "wasm",
    ]);
    if forbidden.contains(extension.as_str()) {
        return Err(PackageError::ExecutableContent(name.into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn package_bytes(content: &[u8], declared_hash: String) -> Cursor<Vec<u8>> {
        let manifest = ModuleManifest {
            manifest_version: 1,
            id: "com.wens.test".into(),
            name: "Test pack".into(),
            version: "1.0.0".into(),
            publisher: "local.test".into(),
            min_app_version: "0.4.0".into(),
            module_types: vec![ModuleType::MarketingTemplate],
            permissions: vec!["templates:read".into()],
            entry_data: vec!["data/template.json".into()],
            assets: vec![],
            locales: vec!["ar-EG".into()],
            content_hash: declared_hash,
            signature: None,
        };
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut cursor);
            writer
                .start_file("manifest.json", SimpleFileOptions::default())
                .unwrap();
            writer
                .write_all(&serde_json::to_vec(&manifest).unwrap())
                .unwrap();
            writer
                .start_file("data/template.json", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(content).unwrap();
            writer.finish().unwrap();
        }
        cursor.set_position(0);
        cursor
    }
    #[test]
    fn content_hash_is_deterministic() {
        let a = BTreeMap::from([("data/template.json".into(), br#"{"name":"one"}"#.to_vec())]);
        assert_eq!(content_hash(&a), content_hash(&a));
    }
    #[test]
    fn rejects_traversal_and_executables() {
        assert!(matches!(
            validate_path("../escape.json"),
            Err(PackageError::UnsafePath(_))
        ));
        assert!(matches!(
            reject_executable("payload.ps1"),
            Err(PackageError::ExecutableContent(_))
        ));
    }
    #[test]
    fn previews_unsigned_package_only_in_developer_mode() {
        let files = BTreeMap::from([("data/template.json".into(), br#"{"name":"one"}"#.to_vec())]);
        let archive = package_bytes(&files["data/template.json"], content_hash(&files));
        let preview = validate_archive(archive, &BTreeMap::new(), true).unwrap();
        assert!(!preview.signed);
        assert_eq!(preview.files, vec!["data/template.json"]);
        let archive = package_bytes(&files["data/template.json"], content_hash(&files));
        assert!(matches!(
            validate_archive(archive, &BTreeMap::new(), false),
            Err(PackageError::Unsigned)
        ));
    }
    #[test]
    fn rejects_tampered_package_content() {
        let original =
            BTreeMap::from([("data/template.json".into(), br#"{"name":"one"}"#.to_vec())]);
        let archive = package_bytes(br#"{"name":"tampered"}"#, content_hash(&original));
        assert!(matches!(
            validate_archive(archive, &BTreeMap::new(), true),
            Err(PackageError::HashMismatch)
        ));
    }

    #[test]
    fn installs_to_staging_and_keeps_previous_version_for_rollback() {
        let directory = tempfile::tempdir().unwrap();
        let modules = directory.path().join("modules");
        let files = BTreeMap::from([("data/template.json".into(), br#"{"name":"one"}"#.to_vec())]);
        let archive = package_bytes(&files["data/template.json"], content_hash(&files));
        let source = directory.path().join("one.wenspack");
        fs::write(&source, archive.into_inner()).unwrap();
        let first = install_package(&source, &modules, &BTreeMap::new(), true).unwrap();
        assert!(Path::new(&first.install_path)
            .join("data/template.json")
            .exists());
        let second = install_package(&source, &modules, &BTreeMap::new(), true).unwrap();
        assert!(second.rollback_path.is_some());
        assert!(Path::new(second.rollback_path.as_deref().unwrap()).exists());
        let rollback = rollback_package("com.wens.test", &modules).unwrap();
        assert_eq!(rollback.version, "1.0.0");
    }

    fn custom_package_bytes(
        manifest: &ModuleManifest,
        files: &BTreeMap<String, Vec<u8>>,
    ) -> Cursor<Vec<u8>> {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut cursor);
            writer
                .start_file("manifest.json", SimpleFileOptions::default())
                .unwrap();
            writer
                .write_all(&serde_json::to_vec(manifest).unwrap())
                .unwrap();
            for (name, bytes) in files {
                writer
                    .start_file(name, SimpleFileOptions::default())
                    .unwrap();
                writer.write_all(bytes).unwrap();
            }
            writer.finish().unwrap();
        }
        cursor.set_position(0);
        cursor
    }

    #[test]
    fn validates_manifest_id_and_version_strictly() {
        for bad_id in [
            "",
            ".hidden",
            "trailing.",
            "trailing ",
            "com.wens..evil",
            "../escape",
            "com/wens/test",
            "com\\wens\\test",
            "com.wens:ads",
            "CON",
            "NUL.pack",
        ] {
            assert!(
                matches!(validate_module_id(bad_id), Err(PackageError::UnsafePath(_))),
                "expected bad id to be rejected: {bad_id:?}"
            );
        }
        for bad_ver in [
            "",
            "1.0/../../pwn",
            "1.0\\..\\pwn",
            "1.0..2",
            "1.0:stream",
            ".1.0",
            "1.0.",
            "1.0 ",
            "AUX",
        ] {
            assert!(
                matches!(
                    validate_module_version(bad_ver),
                    Err(PackageError::UnsafePath(_))
                ),
                "expected bad version to be rejected: {bad_ver:?}"
            );
        }
        assert!(validate_module_id("com.wens.test_pack-1").is_ok());
        assert!(validate_module_version("1.2.3-rc_1").is_ok());
    }

    #[test]
    fn signed_manifest_rejects_id_version_and_permissions_tampering() {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let verifying_key = signing_key.verifying_key();
        let trusted = BTreeMap::from([("official.wens".to_string(), verifying_key)]);
        let files = BTreeMap::from([(
            "data/template.json".to_string(),
            br#"{"name":"signed"}"#.to_vec(),
        )]);
        let mut manifest = ModuleManifest {
            manifest_version: 1,
            id: "com.wens.signed".into(),
            name: "Signed Pack".into(),
            version: "1.0.0".into(),
            publisher: "official.wens".into(),
            min_app_version: "1.0.0".into(),
            module_types: vec![ModuleType::Theme],
            permissions: vec!["themes:read".into()],
            entry_data: vec!["data/template.json".into()],
            assets: vec![],
            locales: vec!["ar-EG".into()],
            content_hash: content_hash(&files),
            signature: None,
        };
        manifest.signature = Some(sign_manifest(&manifest, &signing_key));

        // Authentic signed package passes even with developer_mode = false.
        let valid_archive = custom_package_bytes(&manifest, &files);
        let preview = validate_archive(valid_archive, &trusted, false).unwrap();
        assert!(preview.signed && preview.trusted);

        // Tampering id while keeping content_hash + signature MUST fail.
        let mut tampered_id = manifest.clone();
        tampered_id.id = "com.wens.hijacked".into();
        assert!(matches!(
            validate_archive(custom_package_bytes(&tampered_id, &files), &trusted, false),
            Err(PackageError::InvalidSignature)
        ));

        // Tampering version MUST fail.
        let mut tampered_ver = manifest.clone();
        tampered_ver.version = "9.9.9".into();
        assert!(matches!(
            validate_archive(custom_package_bytes(&tampered_ver, &files), &trusted, false),
            Err(PackageError::InvalidSignature)
        ));

        // Tampering permissions MUST fail.
        let mut tampered_perm = manifest.clone();
        tampered_perm.permissions.push("system:admin".into());
        assert!(matches!(
            validate_archive(
                custom_package_bytes(&tampered_perm, &files),
                &trusted,
                false
            ),
            Err(PackageError::InvalidSignature)
        ));
    }

    #[test]
    fn rejects_zip_bomb_exceeding_max_file_bytes() {
        // 9 MB of zeros compresses to <15 KB in DEFLATE, exceeding MAX_FILE_BYTES (8 MB).
        let huge = vec![0u8; (MAX_FILE_BYTES as usize) + 1024 * 1024];
        let files = BTreeMap::from([("data/bomb.json".to_string(), huge)]);
        let manifest = ModuleManifest {
            manifest_version: 1,
            id: "com.wens.bomb".into(),
            name: "Bomb".into(),
            version: "1.0.0".into(),
            publisher: "local.test".into(),
            min_app_version: "1.0.0".into(),
            module_types: vec![ModuleType::Theme],
            permissions: vec![],
            entry_data: vec!["data/bomb.json".into()],
            assets: vec![],
            locales: vec![],
            content_hash: content_hash(&files),
            signature: None,
        };
        let archive = custom_package_bytes(&manifest, &files);
        assert!(matches!(
            validate_archive(archive, &BTreeMap::new(), true),
            Err(PackageError::TooLarge)
        ));
    }

    #[test]
    fn rejects_windows_dangerous_extensions_ads_and_trailing_dots_or_spaces() {
        let dangerous = [
            "a.hta", "a.vbs", "a.vbe", "a.js", "a.jse", "a.wsf", "a.wsh", "a.lnk", "a.html",
            "a.htm", "a.ps1", "a.cmd", "a.bat", "a.scr", "a.msi", "a.HTA", "sub/run.VBS",
        ];
        for name in dangerous {
            assert!(
                matches!(reject_executable(name), Err(PackageError::ExecutableContent(_))),
                "expected executable rejection for {name}"
            );
        }
        let unsafe_paths = [
            "data/file.json.",
            "data/file.json ",
            "data /file.json",
            "data./file.json",
            "data/file.json:evil.exe",
            "data/file.json:$DATA",
            "C:/windows/win.ini",
            "data/CON.json",
        ];
        for path in unsafe_paths {
            assert!(
                matches!(validate_path(path), Err(PackageError::UnsafePath(_))),
                "expected unsafe path rejection for {path:?}"
            );
        }
    }
}
