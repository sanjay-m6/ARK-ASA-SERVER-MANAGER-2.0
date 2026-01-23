//! Backup module for atomic save file operations

use anyhow::{Context, Result};
use chrono::Local;
use colored::*;
use std::fs;
use std::path::Path;

/// SavedArks directory relative to server root
const SAVED_ARKS_PATH: &str = "ShooterGame/Saved/SavedArks";

/// Common map save file names
const COMMON_MAPS: [&str; 12] = [
    "TheIsland_WP.ark",
    "ScorchedEarth_WP.ark",
    "TheCenter_WP.ark",
    "Aberration_WP.ark",
    "Extinction_WP.ark",
    "Ragnarok_WP.ark",
    "Valguero_WP.ark",
    "Genesis_WP.ark",
    "Genesis2_WP.ark",
    "CrystalIsles_WP.ark",
    "LostIsland_WP.ark",
    "Fjordur_WP.ark",
];

/// Handle backup command
pub fn handle_backup(
    server_path: &Path,
    name: Option<String>,
    list: bool,
    restore: Option<String>,
) -> Result<()> {
    let saves_path = server_path.join(SAVED_ARKS_PATH);

    if list {
        return list_backups(&saves_path);
    }

    if let Some(backup_name) = restore {
        return restore_backup(&saves_path, &backup_name);
    }

    // Create backup
    create_backup(&saves_path, name)
}

/// Create a backup of all .ark save files
fn create_backup(saves_path: &Path, custom_name: Option<String>) -> Result<()> {
    println!("{}", "💾 Creating backup...".cyan());

    if !saves_path.exists() {
        println!("  {} SavedArks directory not found at:", "⚠️".yellow());
        println!("  {}", saves_path.display());
        return Ok(());
    }

    // Create backup directory
    let backup_dir = saves_path.join("Backups");
    fs::create_dir_all(&backup_dir)
        .context("Failed to create Backups directory")?;

    // Generate timestamp
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let suffix = custom_name.as_deref().unwrap_or("backup");
    let backup_folder = backup_dir.join(format!("{}_{}", timestamp, suffix));
    fs::create_dir_all(&backup_folder)?;

    // Find and copy all .ark files
    let mut backed_up = 0;
    let mut total_size = 0u64;

    for entry in fs::read_dir(saves_path)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "ark" {
                    let file_name = path.file_name().unwrap();
                    let dest = backup_folder.join(file_name);
                    
                    print!("  Backing up {}...", file_name.to_string_lossy().yellow());
                    
                    let metadata = fs::metadata(&path)?;
                    total_size += metadata.len();
                    
                    fs::copy(&path, &dest)
                        .with_context(|| format!("Failed to copy {:?}", path))?;
                    
                    println!(" {}", "✓".green());
                    backed_up += 1;
                }
            }
        }
    }

    if backed_up == 0 {
        println!("  {} No .ark files found to backup", "⚠️".yellow());
    } else {
        let size_mb = total_size as f64 / 1_048_576.0;
        println!();
        println!("  {} Backed up {} file(s) ({:.1} MB)", "✓".green(), backed_up, size_mb);
        println!("  Location: {}", backup_folder.display().to_string().yellow());
    }

    Ok(())
}

/// List all available backups
fn list_backups(saves_path: &Path) -> Result<()> {
    println!("{}", "📋 Available Backups:".cyan());
    println!();

    let backup_dir = saves_path.join("Backups");

    if !backup_dir.exists() {
        println!("  {} No backups found", "ℹ️".blue());
        return Ok(());
    }

    let mut backups: Vec<_> = fs::read_dir(&backup_dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .collect();

    if backups.is_empty() {
        println!("  {} No backups found", "ℹ️".blue());
        return Ok(());
    }

    // Sort by name (which includes timestamp)
    backups.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    for (i, entry) in backups.iter().enumerate() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        // Get folder size
        let size = get_dir_size(&entry.path()).unwrap_or(0);
        let size_mb = size as f64 / 1_048_576.0;

        // Count .ark files
        let ark_count = fs::read_dir(entry.path())
            .map(|rd| rd.filter_map(|e| e.ok())
                .filter(|e| e.path().extension().map(|ext| ext == "ark").unwrap_or(false))
                .count())
            .unwrap_or(0);

        println!(
            "  {}. {} ({} files, {:.1} MB)",
            i + 1,
            name_str.green(),
            ark_count,
            size_mb
        );
    }

    println!();
    println!("  Use --restore <name> to restore a backup");

    Ok(())
}

/// Restore from a specific backup
fn restore_backup(saves_path: &Path, backup_name: &str) -> Result<()> {
    println!("{}", "🔄 Restoring backup...".cyan());

    let backup_dir = saves_path.join("Backups");
    let backup_path = backup_dir.join(backup_name);

    if !backup_path.exists() {
        // Try partial match
        if let Ok(entries) = fs::read_dir(&backup_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.contains(backup_name) {
                    return restore_from_folder(&entry.path(), saves_path);
                }
            }
        }
        
        anyhow::bail!("Backup not found: {}", backup_name);
    }

    restore_from_folder(&backup_path, saves_path)
}

/// Actually restore files from a backup folder
fn restore_from_folder(backup_path: &Path, saves_path: &Path) -> Result<()> {
    println!("  Restoring from: {}", backup_path.display().to_string().yellow());

    // First, backup current state
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let pre_restore_backup = saves_path.join("Backups").join(format!("{}_pre-restore", timestamp));
    fs::create_dir_all(&pre_restore_backup)?;

    // Backup current .ark files
    for entry in fs::read_dir(saves_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "ark" {
                    let dest = pre_restore_backup.join(path.file_name().unwrap());
                    fs::copy(&path, &dest)?;
                }
            }
        }
    }

    println!("  Pre-restore backup created: {}", pre_restore_backup.display().to_string().blue());

    // Restore files
    let mut restored = 0;
    for entry in fs::read_dir(backup_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "ark" {
                    let file_name = path.file_name().unwrap();
                    let dest = saves_path.join(file_name);
                    
                    print!("  Restoring {}...", file_name.to_string_lossy().yellow());
                    fs::copy(&path, &dest)?;
                    println!(" {}", "✓".green());
                    restored += 1;
                }
            }
        }
    }

    println!();
    println!("  {} Restored {} file(s)", "✓".green(), restored);

    Ok(())
}

/// Get total size of a directory
fn get_dir_size(path: &Path) -> Result<u64> {
    let mut size = 0;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_file() {
            size += metadata.len();
        }
    }
    Ok(size)
}

/// Create a backup specifically before mod updates
pub fn backup_before_mod_update(server_path: &Path) -> Result<String> {
    let saves_path = server_path.join(SAVED_ARKS_PATH);
    let backup_dir = saves_path.join("Backups");
    fs::create_dir_all(&backup_dir)?;

    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let backup_folder = backup_dir.join(format!("{}_pre-mod-update", timestamp));
    fs::create_dir_all(&backup_folder)?;

    for entry in fs::read_dir(&saves_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "ark" {
                    let dest = backup_folder.join(path.file_name().unwrap());
                    fs::copy(&path, &dest)?;
                }
            }
        }
    }

    Ok(backup_folder.to_string_lossy().to_string())
}
