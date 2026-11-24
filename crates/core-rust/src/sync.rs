use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chacha20poly1305::{
    aead::{Aead, Payload},
    ChaCha20Poly1305, KeyInit, Nonce,
};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use x25519_dalek::{PublicKey, StaticSecret};

/// HLC value encoded as `physicalMillis-logical-deviceId` for deterministic
/// ordering across offline edits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HybridLogicalClock {
    pub physical_millis: i64,
    pub logical: u32,
    pub device_id: String,
}

impl HybridLogicalClock {
    pub fn new(device_id: impl Into<String>) -> Self {
        Self {
            physical_millis: 0,
            logical: 0,
            device_id: device_id.into(),
        }
    }
    pub fn tick(&mut self, wall_millis: i64) -> String {
        if wall_millis > self.physical_millis {
            self.physical_millis = wall_millis;
            self.logical = 0;
        } else {
            self.logical = self.logical.saturating_add(1);
        }
        self.encode()
    }
    pub fn observe(&mut self, remote: &str, wall_millis: i64) -> Result<String, SyncConflict> {
        let remote = parse_hlc(remote)?;
        let physical = self
            .physical_millis
            .max(remote.physical_millis)
            .max(wall_millis);
        let logical = if physical == self.physical_millis && physical == remote.physical_millis {
            self.logical.max(remote.logical).saturating_add(1)
        } else if physical == self.physical_millis {
            self.logical.saturating_add(1)
        } else if physical == remote.physical_millis {
            remote.logical.saturating_add(1)
        } else {
            0
        };
        self.physical_millis = physical;
        self.logical = logical;
        Ok(self.encode())
    }
    pub fn encode(&self) -> String {
        format!(
            "{}-{}-{}",
            self.physical_millis, self.logical, self.device_id
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conflict {
    pub local_hlc: String,
    pub remote_hlc: String,
    pub local_payload: String,
    pub remote_payload: String,
}

#[derive(Debug, thiserror::Error)]
pub enum SyncConflict {
    #[error("invalid HLC value")]
    InvalidHlc,
}

pub fn compare_hlc(left: &str, right: &str) -> Result<Ordering, SyncConflict> {
    let left = parse_hlc(left)?;
    let right = parse_hlc(right)?;
    Ok((left.physical_millis, left.logical, left.device_id).cmp(&(
        right.physical_millis,
        right.logical,
        right.device_id,
    )))
}

/// Scalar records use deterministic LWW. Long text callers can preserve both
/// payloads by using `SyncConflict` UI merge rather than calling this helper.
pub fn resolve_scalar(local: (&str, &str), remote: (&str, &str)) -> Result<String, SyncConflict> {
    Ok(if compare_hlc(local.0, remote.0)? == Ordering::Less {
        remote.1
    } else {
        local.1
    }
    .to_owned())
}

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("invalid base64 key or payload")]
    InvalidEncoding,
    #[error("payload authentication failed")]
    AuthenticationFailed,
    #[error("pairing payload is expired")]
    PairingExpired,
    #[error("pairing code does not match")]
    PairingCodeMismatch,
    #[error("invalid pairing payload")]
    InvalidPairingPayload,
}

/// X25519 key agreement + ChaCha20-Poly1305 transport primitive. Private keys
/// are intentionally not serializable; shells persist them in OS keystores.
pub struct SyncCrypto {
    secret: StaticSecret,
    pub public_key: [u8; 32],
}

impl SyncCrypto {
    pub fn generate() -> Self {
        let secret = StaticSecret::random_from_rng(rand_core::OsRng);
        let public_key = PublicKey::from(&secret).to_bytes();
        Self { secret, public_key }
    }
    pub fn public_key_base64(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.public_key)
    }
    pub fn shared_key(&self, peer_public_base64: &str) -> Result<[u8; 32], CryptoError> {
        let bytes = URL_SAFE_NO_PAD
            .decode(peer_public_base64)
            .map_err(|_| CryptoError::InvalidEncoding)?;
        let peer: [u8; 32] = bytes.try_into().map_err(|_| CryptoError::InvalidEncoding)?;
        Ok(self
            .secret
            .diffie_hellman(&PublicKey::from(peer))
            .to_bytes())
    }
    pub fn encrypt(
        shared_key: &[u8; 32],
        nonce: [u8; 12],
        aad: &[u8],
        plaintext: &[u8],
    ) -> Result<String, CryptoError> {
        let cipher = ChaCha20Poly1305::new_from_slice(shared_key)
            .map_err(|_| CryptoError::InvalidEncoding)?;
        let encrypted = cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: plaintext,
                    aad,
                },
            )
            .map_err(|_| CryptoError::AuthenticationFailed)?;
        Ok(URL_SAFE_NO_PAD.encode(encrypted))
    }
    pub fn decrypt(
        shared_key: &[u8; 32],
        nonce: [u8; 12],
        aad: &[u8],
        encoded: &str,
    ) -> Result<Vec<u8>, CryptoError> {
        let cipher = ChaCha20Poly1305::new_from_slice(shared_key)
            .map_err(|_| CryptoError::InvalidEncoding)?;
        let encrypted = URL_SAFE_NO_PAD
            .decode(encoded)
            .map_err(|_| CryptoError::InvalidEncoding)?;
        cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &encrypted,
                    aad,
                },
            )
            .map_err(|_| CryptoError::AuthenticationFailed)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PairingPayload {
    pub version: u16,
    pub device_id: String,
    pub exchange_public_key: String,
    pub short_code: String,
    pub expires_at: i64,
}

pub fn encode_pairing(payload: &PairingPayload) -> Result<String, CryptoError> {
    serde_json::to_vec(payload)
        .map(|bytes| URL_SAFE_NO_PAD.encode(bytes))
        .map_err(|_| CryptoError::InvalidPairingPayload)
}
pub fn decode_pairing(
    encoded: &str,
    now_millis: i64,
    expected_code: &str,
) -> Result<PairingPayload, CryptoError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| CryptoError::InvalidEncoding)?;
    let payload: PairingPayload =
        serde_json::from_slice(&bytes).map_err(|_| CryptoError::InvalidPairingPayload)?;
    if payload.expires_at < now_millis {
        return Err(CryptoError::PairingExpired);
    }
    if payload.short_code != expected_code {
        return Err(CryptoError::PairingCodeMismatch);
    }
    Ok(payload)
}

fn parse_hlc(value: &str) -> Result<HybridLogicalClock, SyncConflict> {
    let mut parts = value.splitn(3, '-');
    let physical_millis = parts
        .next()
        .and_then(|part| part.parse().ok())
        .ok_or(SyncConflict::InvalidHlc)?;
    let logical = parts
        .next()
        .and_then(|part| part.parse().ok())
        .ok_or(SyncConflict::InvalidHlc)?;
    let device_id = parts
        .next()
        .filter(|part| !part.is_empty())
        .ok_or(SyncConflict::InvalidHlc)?
        .to_owned();
    Ok(HybridLogicalClock {
        physical_millis,
        logical,
        device_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hlc_observes_remote_without_time_travel() {
        let mut clock = HybridLogicalClock::new("device-a");
        assert_eq!(clock.tick(1000), "1000-0-device-a");
        assert_eq!(
            clock.observe("1000-4-device-b", 1000).unwrap(),
            "1000-5-device-a"
        );
        assert_eq!(clock.tick(999), "1000-6-device-a");
    }
    #[test]
    fn scalar_lww_is_deterministic_and_invalid_values_are_rejected() {
        assert_eq!(
            resolve_scalar(("1-0-a", "local"), ("2-0-b", "remote")).unwrap(),
            "remote"
        );
        assert!(compare_hlc("broken", "1-0-a").is_err());
    }
    #[test]
    fn x25519_and_chacha_round_trip_with_aad() {
        let alice = SyncCrypto::generate();
        let bob = SyncCrypto::generate();
        let alice_key = alice.shared_key(&bob.public_key_base64()).unwrap();
        let bob_key = bob.shared_key(&alice.public_key_base64()).unwrap();
        assert_eq!(alice_key, bob_key);
        let encoded =
            SyncCrypto::encrypt(&alice_key, [7; 12], b"wens-sync-v1", b"hello local network")
                .unwrap();
        assert_eq!(
            SyncCrypto::decrypt(&bob_key, [7; 12], b"wens-sync-v1", &encoded).unwrap(),
            b"hello local network"
        );
        assert!(SyncCrypto::decrypt(&bob_key, [7; 12], b"wrong-aad", &encoded).is_err());
    }
    #[test]
    fn pairing_payload_requires_code_and_expiry() {
        let payload = PairingPayload {
            version: 1,
            device_id: "device-a".into(),
            exchange_public_key: "key".into(),
            short_code: "123456".into(),
            expires_at: 2000,
        };
        let encoded = encode_pairing(&payload).unwrap();
        assert_eq!(decode_pairing(&encoded, 1000, "123456").unwrap(), payload);
        assert!(matches!(
            decode_pairing(&encoded, 1000, "000000"),
            Err(CryptoError::PairingCodeMismatch)
        ));
        assert!(matches!(
            decode_pairing(&encoded, 3000, "123456"),
            Err(CryptoError::PairingExpired)
        ));
    }
}
