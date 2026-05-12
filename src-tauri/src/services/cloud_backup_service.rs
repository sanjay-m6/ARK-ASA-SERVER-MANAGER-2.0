use anyhow::{Context, Result};
use log::{error, info, warn};
use opendal::{layers::RetryLayer, Operator};
use opendal::services::{S3, Gdrive, Dropbox, B2};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

// Cloud Provider Configuration types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "provider_type")]
pub enum CloudProviderConfig {
    S3 {
        #[serde(default)] endpoint: String,
        #[serde(default)] bucket: String,
        #[serde(default)] region: String,
        #[serde(default)] access_key_id: String,
        #[serde(default)] secret_access_key: String,
    },
    B2 {
        #[serde(default)] application_key_id: String,
        #[serde(default)] application_key: String,
        #[serde(default)] bucket: String,
        #[serde(default)] bucket_id: String,
    },
    GoogleDrive {
        #[serde(default)] client_id: String,
        #[serde(default)] client_secret: String,
        #[serde(default)] refresh_token: String,
        #[serde(default)] root_folder_id: String,
    },
    Dropbox {
        #[serde(default)] access_token: String,
        #[serde(default)] refresh_token: String,
        #[serde(default)] client_id: String,
        #[serde(default)] client_secret: String,
        #[serde(default)] root_path: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudBackupSettings {
    pub enabled: bool,
    pub provider: Option<CloudProviderConfig>,
    pub encryption_key: Option<String>, // Should be securely stored, but keeping here for architecture
    pub retain_hourly: u32,
    pub retain_daily: u32,
    pub retain_weekly: u32,
    pub compression_level: i32, // zstd compression level
}

impl Default for CloudBackupSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: None,
            encryption_key: None,
            retain_hourly: 24,
            retain_daily: 14,
            retain_weekly: 8,
            compression_level: 3,
        }
    }
}

pub struct CloudBackupService {
    operator: Arc<Mutex<Option<Operator>>>,
    settings: Arc<Mutex<CloudBackupSettings>>,
}

impl CloudBackupService {
    pub fn new() -> Self {
        Self {
            operator: Arc::new(Mutex::new(None)),
            settings: Arc::new(Mutex::new(CloudBackupSettings::default())),
        }
    }

    /// Initializes the OpenDAL operator based on the configured provider
    pub async fn initialize_provider(&self, config: CloudProviderConfig) -> Result<()> {
        let op = match config {
            CloudProviderConfig::S3 { endpoint, bucket, region, access_key_id, secret_access_key } => {
                let builder = S3::default()
                    .root("/")
                    .bucket(&bucket)
                    .region(&region)
                    .endpoint(&endpoint)
                    .access_key_id(&access_key_id)
                    .secret_access_key(&secret_access_key);
                
                Operator::new(builder)?
                    .layer(RetryLayer::new())
                    .finish()
            },
            CloudProviderConfig::B2 { application_key_id, application_key, bucket, bucket_id } => {
                let builder = B2::default()
                    .root("/")
                    .bucket(&bucket)
                    .bucket_id(&bucket_id)
                    .application_key_id(&application_key_id)
                    .application_key(&application_key);

                Operator::new(builder)?
                    .layer(RetryLayer::new())
                    .finish()
            },
            CloudProviderConfig::GoogleDrive { client_id, client_secret, refresh_token, root_folder_id } => {
                let builder = Gdrive::default()
                    .root(&root_folder_id)
                    .client_id(&client_id)
                    .client_secret(&client_secret)
                    .refresh_token(&refresh_token);

                Operator::new(builder)?
                    .layer(RetryLayer::new())
                    .finish()
            },
            CloudProviderConfig::Dropbox { refresh_token, client_id, client_secret, root_path, .. } => {
                let builder = Dropbox::default()
                    .root(&root_path)
                    .client_id(&client_id)
                    .client_secret(&client_secret)
                    .refresh_token(&refresh_token);

                Operator::new(builder)?
                    .layer(RetryLayer::new())
                    .finish()
            }
        };

        // Test the connection
        op.check().await.context("Failed to connect to cloud provider. Check credentials.")?;
        
        let mut current_op = self.operator.lock().await;
        *current_op = Some(op);
        
        info!("Cloud backup provider initialized successfully.");
        Ok(())
    }

    /// Update settings
    pub async fn update_settings(&self, new_settings: CloudBackupSettings) -> Result<()> {
        let mut settings = self.settings.lock().await;
        
        // If provider changed, reinitialize
        let reinit = if let Some(ref _new_prov) = new_settings.provider {
            match settings.provider {
                Some(ref _old_prov) => {
                    // Primitive check, real impl would compare variants/credentials
                    true 
                },
                None => true
            }
        } else {
            false
        };

        *settings = new_settings.clone();

        if reinit {
            if let Some(prov) = new_settings.provider {
                // Ignore initialization errors during settings update, they can be surfaced to UI
                if let Err(e) = self.initialize_provider(prov).await {
                    error!("Failed to initialize new cloud provider during settings update: {}", e);
                }
            }
        }

        Ok(())
    }

    /// Core method to compress, encrypt and upload a backup
    pub async fn upload_backup(&self, server_id: &str, local_backup_path: &Path) -> Result<()> {
        let settings = self.settings.lock().await.clone();
        
        if !settings.enabled {
            return Ok(());
        }

        let op_guard = self.operator.lock().await;
        let op = op_guard.as_ref().context("Cloud provider not configured")?;

        info!("Starting cloud backup for {}...", server_id);

        // 1. Read file
        let file_data = tokio::fs::read(local_backup_path).await?;
        
        // 2. Compress (ZSTD)
        // TODO: stream compression for large files
        let compressed_data = zstd::stream::encode_all(file_data.as_slice(), settings.compression_level)?;
        
        // 3. Encrypt (AES-256-GCM) if key is present
        let final_data = if let Some(ref key) = settings.encryption_key {
            self.encrypt_data(&compressed_data, key)?
        } else {
            compressed_data
        };

        // 4. Generate Checksum
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(&final_data);
        let checksum = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect::<String>();

        // 5. Upload via OpenDAL
        let file_name = local_backup_path.file_name().unwrap().to_string_lossy();
        let remote_path = format!("{}/{}", server_id, file_name);
        
        info!("Uploading {} to cloud...", remote_path);
        
        op.write(&remote_path, final_data).await?;
        
        // Upload checksum metadata file
        let checksum_path = format!("{}/{}.sha256", server_id, file_name);
        op.write(&checksum_path, checksum).await?;

        info!("Cloud backup {} uploaded successfully.", remote_path);

        Ok(())
    }

    /// Encrypts data using AES-256-GCM. 
    /// Derives a 32-byte key from the password using PBKDF2 (SHA-256).
    /// Prepends the 16-byte salt and 12-byte nonce to the ciphertext.
    fn encrypt_data(&self, data: &[u8], password: &str) -> Result<Vec<u8>> {
        use aes_gcm::{
            aead::{Aead, KeyInit, OsRng},
            Aes256Gcm, Nonce,
        };
        use ring::pbkdf2;
        use aes_gcm::aead::rand_core::RngCore;

        // 1. Generate a random 16-byte salt
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);

        // 2. Derive a 32-byte key using PBKDF2
        let mut key_bytes = [0u8; 32];
        pbkdf2::derive(
            pbkdf2::PBKDF2_HMAC_SHA256,
            std::num::NonZeroU32::new(100_000).unwrap(),
            &salt,
            password.as_bytes(),
            &mut key_bytes,
        );

        // 3. Initialize AES-256-GCM cipher
        let cipher = Aes256Gcm::new_from_slice(&key_bytes)
            .map_err(|e| anyhow::anyhow!("Invalid key length: {}", e))?;

        // 4. Generate a random 12-byte nonce
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // 5. Encrypt the data
        let ciphertext = cipher.encrypt(nonce, data)
            .map_err(|e| anyhow::anyhow!("Encryption failure: {}", e))?;

        // 6. Combine salt + nonce + ciphertext
        let mut final_payload = Vec::with_capacity(salt.len() + nonce_bytes.len() + ciphertext.len());
        final_payload.extend_from_slice(&salt);
        final_payload.extend_from_slice(&nonce_bytes);
        final_payload.extend_from_slice(&ciphertext);

        Ok(final_payload)
    }

    /// Decrypts data using AES-256-GCM.
    /// Extracts the salt and nonce from the payload, derives the key, and decrypts.
    pub fn decrypt_data(&self, encrypted_payload: &[u8], password: &str) -> Result<Vec<u8>> {
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };
        use ring::pbkdf2;

        if encrypted_payload.len() < 16 + 12 {
            return Err(anyhow::anyhow!("Payload too small to contain salt and nonce"));
        }

        // 1. Extract salt and nonce
        let (salt, rest) = encrypted_payload.split_at(16);
        let (nonce_bytes, ciphertext) = rest.split_at(12);

        // 2. Derive the 32-byte key using PBKDF2
        let mut key_bytes = [0u8; 32];
        pbkdf2::derive(
            pbkdf2::PBKDF2_HMAC_SHA256,
            std::num::NonZeroU32::new(100_000).unwrap(),
            salt,
            password.as_bytes(),
            &mut key_bytes,
        );

        // 3. Initialize AES-256-GCM cipher
        let cipher = Aes256Gcm::new_from_slice(&key_bytes)
            .map_err(|e| anyhow::anyhow!("Invalid key length: {}", e))?;
        let nonce = Nonce::from_slice(nonce_bytes);

        // 4. Decrypt
        let plaintext = cipher.decrypt(nonce, ciphertext)
            .map_err(|_| anyhow::anyhow!("Decryption failure. Incorrect password or corrupted data."))?;

        Ok(plaintext)
    }

    /// Lists all available backups for a specific server in the cloud.
    pub async fn list_backups(&self, server_id: &str) -> Result<Vec<String>> {
        let op_guard = self.operator.lock().await;
        let op = op_guard.as_ref().context("Cloud provider not configured")?;

        let entries = op.list(server_id).await?;
        let mut backups = Vec::new();

        for entry in entries {
            let path = entry.path();
            // Filter out checksum files, we just want the main archives
            if !path.ends_with(".sha256") {
                backups.push(path.to_string());
            }
        }

        // Sort backups by name (which typically contains the timestamp)
        backups.sort();
        backups.reverse(); // Newest first

        Ok(backups)
    }

    /// Downloads, validates, decrypts, and decompresses a cloud backup.
    pub async fn download_and_restore_backup(
        &self, 
        remote_path: &str, 
        target_extraction_path: &Path
    ) -> Result<()> {
        let settings = self.settings.lock().await.clone();
        
        let op_guard = self.operator.lock().await;
        let op = op_guard.as_ref().context("Cloud provider not configured")?;

        info!("Starting download and restore for {}...", remote_path);

        // 1. Download Backup Archive
        let encrypted_data = op.read(remote_path).await?;
        
        // 2. Download and Verify Checksum
        let checksum_path = format!("{}.sha256", remote_path);
        let expected_checksum = match op.read(&checksum_path).await {
            Ok(data) => String::from_utf8_lossy(&data.to_vec()).to_string(),
            Err(e) => {
                warn!("Checksum file not found for {}: {}", remote_path, e);
                String::new()
            }
        };

        if !expected_checksum.is_empty() {
            use sha2::{Sha256, Digest};
            let mut hasher = Sha256::new();
            hasher.update(&encrypted_data.to_vec());
            let actual_checksum = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect::<String>();

            if actual_checksum != expected_checksum {
                return Err(anyhow::anyhow!("Integrity validation failed! Checksum mismatch."));
            }
            info!("Checksum validation passed.");
        }

        // 3. Decrypt
        let compressed_data = if let Some(ref key) = settings.encryption_key {
            self.decrypt_data(&encrypted_data.to_vec(), key)?
        } else {
            encrypted_data.to_vec()
        };

        // 4. Decompress
        let plaintext_data = zstd::stream::decode_all(compressed_data.as_slice())?;

        // 5. Write to target (assume it's a zip/tar archive that another service will extract)
        // For this abstraction, we just save the restored raw archive to a local temp path
        tokio::fs::write(target_extraction_path, plaintext_data).await?;

        info!("Backup successfully restored to {:?}", target_extraction_path);
        Ok(())
    }
}
