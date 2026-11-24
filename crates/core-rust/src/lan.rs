use crate::sync::{CryptoError, SyncCrypto};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};

const MAX_FRAME_BYTES: u32 = 4 * 1024 * 1024;
const NONCE_LEN: usize = 12;

/// Generate a cryptographically random 12-byte nonce via OS CSPRNG.
pub fn generate_nonce() -> [u8; NONCE_LEN] {
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    nonce
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedFrame {
    pub version: u16,
    #[serde(default)]
    pub nonce: String,
    pub aad: String,
    pub ciphertext: String,
}

#[derive(Debug, thiserror::Error)]
pub enum LanError {
    #[error("network I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid frame: {0}")]
    Frame(#[from] serde_json::Error),
    #[error("frame is too large")]
    TooLarge,
    #[error("invalid frame encoding")]
    Encoding,
    #[error("encryption error: {0}")]
    Crypto(#[from] CryptoError),
}

impl EncryptedFrame {
    /// Seal a payload using a fresh cryptographically random 12-byte nonce (`OsRng`)
    /// prepended directly to the ciphertext bytes.
    pub fn seal_random(
        shared_key: &[u8; 32],
        payload: &[u8],
        aad: &[u8],
    ) -> Result<Self, LanError> {
        let nonce = generate_nonce();
        Self::seal(shared_key, payload, aad, nonce)
    }

    /// Seal a payload with the supplied 12-byte nonce, prepending the nonce to
    /// the encoded ciphertext bytes (version 2 wire format).
    pub fn seal(
        shared_key: &[u8; 32],
        payload: &[u8],
        aad: &[u8],
        nonce: [u8; NONCE_LEN],
    ) -> Result<Self, LanError> {
        let encrypted_b64 = SyncCrypto::encrypt(shared_key, nonce, aad, payload)?;
        let raw_ciphertext = URL_SAFE_NO_PAD
            .decode(&encrypted_b64)
            .map_err(|_| LanError::Encoding)?;
        let mut combined = Vec::with_capacity(NONCE_LEN + raw_ciphertext.len());
        combined.extend_from_slice(&nonce);
        combined.extend_from_slice(&raw_ciphertext);
        Ok(Self {
            version: 2,
            nonce: URL_SAFE_NO_PAD.encode(nonce),
            aad: URL_SAFE_NO_PAD.encode(aad),
            ciphertext: URL_SAFE_NO_PAD.encode(combined),
        })
    }

    pub fn open(&self, shared_key: &[u8; 32]) -> Result<Vec<u8>, LanError> {
        let aad = URL_SAFE_NO_PAD
            .decode(&self.aad)
            .map_err(|_| LanError::Encoding)?;
        match self.version {
            2 => {
                let combined = URL_SAFE_NO_PAD
                    .decode(&self.ciphertext)
                    .map_err(|_| LanError::Encoding)?;
                if combined.len() < NONCE_LEN + 16 {
                    return Err(LanError::Encoding);
                }
                let (nonce_slice, ct_slice) = combined.split_at(NONCE_LEN);
                let nonce: [u8; NONCE_LEN] =
                    nonce_slice.try_into().map_err(|_| LanError::Encoding)?;
                if !self.nonce.is_empty() {
                    let header_nonce = URL_SAFE_NO_PAD
                        .decode(&self.nonce)
                        .map_err(|_| LanError::Encoding)?;
                    if header_nonce.as_slice() != nonce_slice {
                        return Err(LanError::Encoding);
                    }
                }
                let ct_b64 = URL_SAFE_NO_PAD.encode(ct_slice);
                Ok(SyncCrypto::decrypt(shared_key, nonce, &aad, &ct_b64)?)
            }
            1 => {
                let nonce: [u8; NONCE_LEN] = URL_SAFE_NO_PAD
                    .decode(&self.nonce)
                    .map_err(|_| LanError::Encoding)?
                    .try_into()
                    .map_err(|_| LanError::Encoding)?;
                Ok(SyncCrypto::decrypt(
                    shared_key,
                    nonce,
                    &aad,
                    &self.ciphertext,
                )?)
            }
            _ => Err(LanError::Encoding),
        }
    }
}

pub fn write_frame<W: Write>(writer: &mut W, frame: &EncryptedFrame) -> Result<(), LanError> {
    let bytes = serde_json::to_vec(frame)?;
    if bytes.len() > MAX_FRAME_BYTES as usize {
        return Err(LanError::TooLarge);
    }
    writer.write_all(&(bytes.len() as u32).to_le_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()?;
    Ok(())
}

pub fn read_frame<R: Read>(reader: &mut R) -> Result<EncryptedFrame, LanError> {
    let mut size = [0; 4];
    reader.read_exact(&mut size)?;
    let size = u32::from_le_bytes(size);
    if size > MAX_FRAME_BYTES {
        return Err(LanError::TooLarge);
    }
    let mut bytes = vec![0; size as usize];
    reader.read_exact(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}

/// One-shot LAN exchange used by the shells. Uses a fresh random 12-byte nonce
/// from `OsRng` per frame prepended to the ciphertext.
pub fn send_once<A: ToSocketAddrs>(
    address: A,
    shared_key: &[u8; 32],
    payload: &[u8],
) -> Result<Vec<u8>, LanError> {
    let mut stream = TcpStream::connect(address)?;
    let frame = EncryptedFrame::seal_random(shared_key, payload, b"wens-sync-v1")?;
    write_frame(&mut stream, &frame)?;
    read_frame(&mut stream)?.open(shared_key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn encrypted_frame_round_trip_over_loopback() {
        let key = [9; 32];
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let req_frame = read_frame(&mut stream).unwrap();
            assert_eq!(req_frame.version, 2);
            let req_nonce = URL_SAFE_NO_PAD.decode(&req_frame.nonce).unwrap();
            assert_eq!(req_nonce.len(), NONCE_LEN);
            assert_ne!(req_nonce.as_slice(), &[0u8; NONCE_LEN]);
            let request = req_frame.open(&key).unwrap();
            let response =
                EncryptedFrame::seal_random(&key, &request, b"wens-sync-v1").unwrap();
            write_frame(&mut stream, &response).unwrap();
        });
        let response = send_once(address, &key, b"lan payload").unwrap();
        handle.join().unwrap();
        assert_eq!(response, b"lan payload");
    }

    #[test]
    fn seal_random_prepends_unique_non_zero_nonce_and_reads_it_back() {
        let key = [42u8; 32];
        let f1 = EncryptedFrame::seal_random(&key, b"same plaintext", b"aad").unwrap();
        let f2 = EncryptedFrame::seal_random(&key, b"same plaintext", b"aad").unwrap();
        assert_eq!(f1.version, 2);
        assert_ne!(f1.nonce, f2.nonce);
        assert_ne!(f1.ciphertext, f2.ciphertext);

        let raw1 = URL_SAFE_NO_PAD.decode(&f1.ciphertext).unwrap();
        let n1 = URL_SAFE_NO_PAD.decode(&f1.nonce).unwrap();
        assert_eq!(&raw1[..NONCE_LEN], n1.as_slice());
        assert_ne!(n1.as_slice(), &[0u8; NONCE_LEN]);

        // Even with header nonce cleared, open() reads the 12-byte nonce prepended to ciphertext.
        let mut stripped = f1.clone();
        stripped.nonce.clear();
        assert_eq!(stripped.open(&key).unwrap(), b"same plaintext");

        // Tampering with prepended nonce bytes fails AEAD authentication.
        let mut tampered_bytes = raw1.clone();
        tampered_bytes[0] ^= 0xFF;
        let tampered = EncryptedFrame {
            version: 2,
            nonce: String::new(),
            aad: f1.aad.clone(),
            ciphertext: URL_SAFE_NO_PAD.encode(&tampered_bytes),
        };
        assert!(tampered.open(&key).is_err());

        // Mismatched header nonce vs prepended nonce fails decoding.
        let mut mismatched = f1.clone();
        mismatched.nonce = f2.nonce.clone();
        assert!(mismatched.open(&key).is_err());
    }
}
