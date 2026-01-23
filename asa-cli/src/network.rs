//! Network module for CurseForge API interaction

use anyhow::{Context, Result};
use colored::*;
use serde::Deserialize;
use std::path::Path;
use sysinfo::System;

use crate::config::parse_active_mods;

/// CurseForge API base URL
const CURSEFORGE_API_BASE: &str = "https://api.curseforge.com/v1";

/// ASA Game ID on CurseForge
const ASA_GAME_ID: u32 = 83374;

/// Mod info from CurseForge API
#[derive(Debug, Deserialize)]
pub struct CurseForgeMod {
    pub id: u64,
    pub name: String,
    #[serde(rename = "latestFilesIndexes")]
    pub latest_files: Option<Vec<LatestFile>>,
}

#[derive(Debug, Deserialize)]
pub struct LatestFile {
    #[serde(rename = "fileId")]
    pub file_id: u64,
    pub filename: String,
    #[serde(rename = "gameVersion")]
    pub game_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeResponse {
    data: Option<CurseForgeMod>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeMultiResponse {
    data: Vec<CurseForgeMod>,
}

/// Check if ARK server is running
pub fn is_server_running() -> bool {
    let mut sys = System::new_all();
    sys.refresh_all();

    for process in sys.processes().values() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("arkascendedserver") || name.contains("shootergame") {
            return true;
        }
    }
    false
}

/// Handle mod update command
pub async fn handle_mod_update(server_path: &Path, force: bool, check_only: bool) -> Result<()> {
    println!("{}", "🔄 Checking mods...".cyan());

    // CRITICAL: Check if server is running
    if is_server_running() {
        println!("{}", "❌ ERROR: Server is currently running!".red());
        println!("  Stop the server before updating mods to prevent:");
        println!("    • Mod download stutter");
        println!("    • File corruption");
        println!("    • Data loss");
        anyhow::bail!("Server must be stopped before updating mods");
    }

    // Parse active mods from config
    let active_mods = parse_active_mods(server_path)?;

    if active_mods.is_empty() {
        println!("  {} No active mods found in configuration", "ℹ️".blue());
        return Ok(());
    }

    println!("  Found {} active mod(s)", active_mods.len().to_string().yellow());

    // Check mods directory
    let mods_path = server_path.join("ShooterGame/Binaries/Win64/ShooterGame/Mods");
    if !mods_path.exists() {
        println!("  {} Creating mods directory...", "⚠️".yellow());
        std::fs::create_dir_all(&mods_path)?;
    }

    // Check each mod
    for mod_id in &active_mods {
        check_mod_status(&mods_path, *mod_id, force, check_only).await?;
    }

    if check_only {
        println!("  {}", "Check complete. Use without --check-only to download updates.".blue());
    }

    Ok(())
}

/// Check status of a single mod
async fn check_mod_status(mods_path: &Path, mod_id: u64, force: bool, check_only: bool) -> Result<()> {
    print!("  Mod {}: ", mod_id.to_string().cyan());

    // Check for local .ucas and .utoc files
    let ucas_pattern = mods_path.join(format!("{}*.ucas", mod_id));
    let utoc_pattern = mods_path.join(format!("{}*.utoc", mod_id));

    let has_ucas = glob_exists(&format!("{}/{}*.ucas", mods_path.display(), mod_id));
    let has_utoc = glob_exists(&format!("{}/{}*.utoc", mods_path.display(), mod_id));

    if has_ucas && has_utoc && !force {
        println!("{}", "✓ Installed".green());
        return Ok(());
    }

    if !has_ucas || !has_utoc {
        println!("{}", "⚠️ Missing files".yellow());
        
        if check_only {
            println!("    Would download mod {}", mod_id);
        } else {
            println!("    {} Download required (use CurseForge app or manual install)", "→".blue());
            // Note: Direct download requires CurseForge API key
            // For now, we inform the user
        }
    } else if force {
        println!("{}", "↻ Force update requested".yellow());
        if !check_only {
            println!("    {} Download required (use CurseForge app or manual install)", "→".blue());
        }
    }

    Ok(())
}

/// Check if any files match a glob pattern
fn glob_exists(pattern: &str) -> bool {
    if let Ok(paths) = glob::glob(pattern) {
        return paths.count() > 0;
    }
    
    // Fallback: simple directory scan
    let path = std::path::Path::new(pattern);
    if let Some(parent) = path.parent() {
        if let Ok(entries) = std::fs::read_dir(parent) {
            let stem = path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let ext = path.extension()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.contains(stem) && name_str.ends_with(ext) {
                    return true;
                }
            }
        }
    }
    false
}

/// Verify mod integrity (check .ucas and .utoc exist)
pub fn verify_mod_files(server_path: &Path, mod_ids: &[u64]) -> Result<Vec<u64>> {
    let mods_path = server_path.join("ShooterGame/Binaries/Win64/ShooterGame/Mods");
    let mut missing = Vec::new();

    for mod_id in mod_ids {
        let has_ucas = glob_exists(&format!("{}/{}*.ucas", mods_path.display(), mod_id));
        let has_utoc = glob_exists(&format!("{}/{}*.utoc", mods_path.display(), mod_id));

        if !has_ucas || !has_utoc {
            missing.push(*mod_id);
        }
    }

    Ok(missing)
}
