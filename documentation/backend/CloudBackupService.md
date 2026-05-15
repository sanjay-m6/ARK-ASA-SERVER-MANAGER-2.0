# ☁️ Cloud Backup Service

The Cloud Backup service provides an off-site data protection layer, enabling administrators to securely store server archives across multiple cloud storage providers with military-grade encryption.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/cloud_backup_service.rs`
- **Abstraction Layer**: Powered by `opendal` for cross-provider compatibility.
- **Supported Providers**: Amazon S3 (and S3-compatible), Google Drive, Dropbox, Backblaze B2.
- **Security Standard**: AES-256-GCM Encryption + PBKDF2 Key Derivation.

## 🚀 Key Features

### 1. Multi-Provider Integration (🌐)
Through the `opendal` operator, the service supports a wide array of storage backends:
- **S3-Compatible**: AWS, Minio, DigitalOcean Spaces, etc.
- **Consumer Cloud**: Native support for Google Drive and Dropbox via OAuth2 refresh tokens.
- **Object Storage**: High-performance integration with Backblaze B2.

### 2. High-Grade Encryption (🔐)
Ensures that backups remain private even if the cloud provider is compromised:
- **AES-256-GCM**: Industry-standard authenticated encryption providing both confidentiality and integrity.
- **PBKDF2 Derivation**: Password-to-key conversion using 100,000 iterations of SHA-256 and random 16-byte salts to thwart pre-computation and brute-force attacks.
- **Combined Payload**: Each backup file contains its own [Salt + Nonce + Ciphertext] for independent decryption.

### 3. Optimization & Integrity
- **ZSTD Compression**: Aggressively reduces backup size before the encryption phase to save bandwidth and storage costs.
- **SHA-256 Checksums**: Every upload generates a companion `.sha256` file. During download, the service verifies the hash to ensure zero data corruption during transit.
- **Retry Layer**: Automatically handles transient network errors using exponential backoff.

### 4. Retention Management
- **Tiered Retention**: Supports separate rotation counts for Hourly, Daily, and Weekly snapshots.
- **Server Isolation**: Each server's backups are stored in their own unique cloud directory prefix.

## 🛠️ Technical Details

### Cloud Provider Configuration
The service uses a tagged enum to handle various authentication schemes:
```rust
pub enum CloudProviderConfig {
    S3 { endpoint, bucket, access_key_id, ... },
    GoogleDrive { client_id, client_secret, refresh_token, ... },
    Dropbox { access_token, refresh_token, ... },
}
```

### Encryption Flow
1. **Compress**: Local ZIP -> ZSTD Stream.
2. **Derive**: User Password + Random Salt -> 32-byte Key.
3. **Encrypt**: ZSTD Data + Key + Random Nonce -> AES-GCM Ciphertext.
4. **Upload**: [Salt + Nonce + Ciphertext] -> Cloud.

## 🎨 Developer Notes
- **Testing**: Use the `initialize_provider` command to test credentials in the UI without triggering a full backup.
- **Streaming**: For very large saves (10GB+), future iterations will implement streaming encryption to minimize local RAM usage.
