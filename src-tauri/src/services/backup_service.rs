// Backup Service for ASA Server Manager
// Handles real backup creation, restoration, and management

use crate::models::{Backup, BackupOptions, BackupType, RestoreOptions};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// Backup service for managing server backups
pub struct BackupService;

impl BackupService {
    /// Create a full backup of the server's saved data
    pub fn create_backup(
        server_path: &Path,
        backup_dir: &Path,
        server_id: i64,
        backup_type: BackupType,
        options: &BackupOptions,
    ) -> Result<Backup, String> {
        // Create backup directory if it doesn't exist
        fs::create_dir_all(backup_dir)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;

        // Generate backup filename
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_name = format!("backup_{}_{}.zip", server_id, timestamp);
        let backup_path = backup_dir.join(&backup_name);

        // Create the zip file
        let file = File::create(&backup_path)
            .map_err(|e| format!("Failed to create backup file: {}", e))?;
        let mut zip = ZipWriter::new(file);

        let compression = match options.compression_level {
            0 => CompressionMethod::Stored,
            _ => CompressionMethod::Deflated,
        };

        #[allow(deprecated)]
        let file_options = FileOptions::default()
            .compression_method(compression)
            .unix_permissions(0o644);

        let mut total_size: u64 = 0;
        let mut includes_configs = false;
        let mut includes_mods = false;
        let mut includes_saves = false;
        let mut includes_cluster = false;

        // Backup saved data (SavedArks)
        if options.include_saves {
            let saved_arks = server_path.join("ShooterGame/Saved/SavedArks");
            if saved_arks.exists() {
                total_size +=
                    Self::add_dir_to_zip(&mut zip, &saved_arks, "SavedArks", &file_options)?;
                includes_saves = true;
            }
        }

        // Backup configs
        if options.include_configs {
            let config_dir = server_path.join("ShooterGame/Saved/Config/WindowsServer");
            if config_dir.exists() {
                total_size += Self::add_dir_to_zip(&mut zip, &config_dir, "Config", &file_options)?;
                includes_configs = true;
            }
        }

        // Backup mods (this can be large!)
        if options.include_mods {
            let mods_dir = server_path.join("ShooterGame/Binaries/Win64/ShooterGame/Mods");
            if mods_dir.exists() {
                total_size += Self::add_dir_to_zip(&mut zip, &mods_dir, "Mods", &file_options)?;
                includes_mods = true;
            }
        }

        // Backup cluster data
        if options.include_cluster {
            let cluster_dir = server_path.join("ShooterGame/Saved/clusters");
            if cluster_dir.exists() {
                total_size +=
                    Self::add_dir_to_zip(&mut zip, &cluster_dir, "clusters", &file_options)?;
                includes_cluster = true;
            }
        }

        zip.finish()
            .map_err(|e| format!("Failed to finish zip archive: {}", e))?;

        // Get actual file size
        let file_size = fs::metadata(&backup_path)
            .map(|m| m.len() as i64)
            .unwrap_or(total_size as i64);

        let backup = Backup {
            id: 0, // Will be set by database
            server_id,
            backup_type,
            file_path: backup_path,
            size: file_size,
            includes_configs,
            includes_mods,
            includes_saves,
            includes_cluster,
            verified: false,
            created_at: chrono::Local::now().to_rfc3339(),
        };

        println!("✅ Backup created: {} ({} bytes)", backup_name, file_size);
        Ok(backup)
    }

    /// Add a directory to the zip archive recursively
    fn add_dir_to_zip<W: Write + std::io::Seek>(
        zip: &mut ZipWriter<W>,
        source_dir: &Path,
        prefix: &str,
        options: &FileOptions<()>,
    ) -> Result<u64, String> {
        let mut total_size: u64 = 0;

        if !source_dir.exists() {
            return Ok(0);
        }

        for entry in walkdir::WalkDir::new(source_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            let relative_path = path
                .strip_prefix(source_dir)
                .map_err(|e| format!("Path error: {}", e))?;

            let archive_path = format!("{}/{}", prefix, relative_path.to_string_lossy());

            if path.is_file() {
                zip.start_file(&archive_path, *options)
                    .map_err(|e| format!("Failed to create zip entry: {}", e))?;

                let mut file = File::open(path)
                    .map_err(|e| format!("Failed to open file for backup: {}", e))?;
                let mut buffer = Vec::new();
                file.read_to_end(&mut buffer)
                    .map_err(|e| format!("Failed to read file: {}", e))?;

                total_size += buffer.len() as u64;
                zip.write_all(&buffer)
                    .map_err(|e| format!("Failed to write to zip: {}", e))?;
            } else if path.is_dir() && !archive_path.ends_with('/') {
                zip.add_directory(&format!("{}/", archive_path), *options)
                    .map_err(|e| format!("Failed to create directory in zip: {}", e))?;
            }
        }

        Ok(total_size)
    }

    /// Verify backup integrity
    pub fn verify_backup(backup_path: &Path) -> Result<bool, String> {
        let file =
            File::open(backup_path).map_err(|e| format!("Failed to open backup file: {}", e))?;

        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("Invalid backup archive: {}", e))?;

        // Try to read each file in the archive
        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read archive entry {}: {}", i, e))?;

            // Read file contents to verify
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer)
                .map_err(|e| format!("Failed to read archive contents: {}", e))?;
        }

        println!("✅ Backup verified: {} entries", archive.len());
        Ok(true)
    }

    /// Restore from a backup
    pub fn restore_backup(
        backup_path: &Path,
        server_path: &Path,
        options: &RestoreOptions,
    ) -> Result<(), String> {
        let file =
            File::open(backup_path).map_err(|e| format!("Failed to open backup file: {}", e))?;

        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("Invalid backup archive: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read archive entry: {}", e))?;

            let out_path = match file.enclosed_name() {
                Some(path) => path.to_owned(),
                None => continue,
            };

            // Determine the target path based on the backup structure
            let target_path = if out_path.starts_with("SavedArks") {
                if !options.restore_saves {
                    continue;
                }
                server_path.join("ShooterGame/Saved").join(&out_path)
            } else if out_path.starts_with("Config") {
                if !options.restore_configs {
                    continue;
                }
                let relative = out_path.strip_prefix("Config").unwrap();
                server_path
                    .join("ShooterGame/Saved/Config/WindowsServer")
                    .join(relative)
            } else {
                continue;
            };

            if file.name().ends_with('/') {
                fs::create_dir_all(&target_path)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                if let Some(parent) = target_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                }

                let mut out_file = File::create(&target_path)
                    .map_err(|e| format!("Failed to create file: {}", e))?;

                std::io::copy(&mut file, &mut out_file)
                    .map_err(|e| format!("Failed to extract file: {}", e))?;
            }
        }

        println!("✅ Backup restored to {:?}", server_path);
        Ok(())
    }

    /// Get backup preview (list of files in backup)
    pub fn get_backup_contents(backup_path: &Path) -> Result<Vec<String>, String> {
        let file =
            File::open(backup_path).map_err(|e| format!("Failed to open backup file: {}", e))?;

        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("Invalid backup archive: {}", e))?;

        let mut contents: Vec<String> = Vec::new();
        for i in 0..archive.len() {
            if let Ok(f) = archive.by_index(i) {
                if let Some(name) = f.enclosed_name() {
                    contents.push(name.to_string_lossy().to_string());
                }
            }
        }

        Ok(contents)
    }

    /// Cleanup old backups (keep only N most recent)
    pub fn cleanup_old_backups(
        backup_dir: &Path,
        server_id: i64,
        keep_count: usize,
    ) -> Result<Vec<PathBuf>, String> {
        let mut backups: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();

        if !backup_dir.exists() {
            return Ok(Vec::new());
        }

        // Find all backup files for this server
        let pattern = format!("backup_{}_", server_id);
        for entry in fs::read_dir(backup_dir)
            .map_err(|e| format!("Failed to read backup directory: {}", e))?
        {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file()
                    && path
                        .file_name()
                        .map(|n| n.to_string_lossy().starts_with(&pattern))
                        .unwrap_or(false)
                {
                    if let Ok(metadata) = path.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            backups.push((path, modified));
                        }
                    }
                }
            }
        }

        // Sort by date (newest first)
        backups.sort_by(|a, b| b.1.cmp(&a.1));

        // Delete old backups
        let mut deleted = Vec::new();
        for (path, _) in backups.into_iter().skip(keep_count) {
            if fs::remove_file(&path).is_ok() {
                println!("🗑️ Deleted old backup: {:?}", path);
                deleted.push(path);
            }
        }

        Ok(deleted)
    }

    /// Get the default backup directory path
    pub fn get_backup_dir(app_data_dir: &Path, server_id: i64) -> PathBuf {
        app_data_dir
            .join("backups")
            .join(format!("server_{}", server_id))
    }
}
