//! Configuration module for INI file parsing and modification

use anyhow::{Context, Result};
use colored::*;
use ini::Ini;
use std::path::{Path, PathBuf};

/// Path to GameUserSettings.ini relative to server root
const GAME_USER_SETTINGS_PATH: &str = "ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini";

/// Path to Game.ini relative to server root
const GAME_INI_PATH: &str = "ShooterGame/Saved/Config/WindowsServer/Game.ini";

/// Server settings structure mapped from INI
#[derive(Debug, Default)]
pub struct ServerSettings {
    pub difficulty_offset: f32,
    pub harvest_amount_multiplier: f32,
    pub xp_multiplier: f32,
    pub taming_speed_multiplier: f32,
    pub server_pve: bool,
}

/// Trait for applying optimized settings
pub trait ApplyOptimizedSettings {
    fn apply_optimized(&mut self) -> Result<()>;
}

impl ApplyOptimizedSettings for ServerSettings {
    fn apply_optimized(&mut self) -> Result<()> {
        self.difficulty_offset = 1.0;
        self.harvest_amount_multiplier = 3.0;
        self.xp_multiplier = 2.0;
        self.taming_speed_multiplier = 5.0;
        Ok(())
    }
}

/// Handle config command
pub fn handle_config(
    server_path: &Path,
    optimize: bool,
    harvest: Option<f32>,
    xp: Option<f32>,
    taming: Option<f32>,
    difficulty: Option<f32>,
    show: bool,
) -> Result<()> {
    let config_path = server_path.join(GAME_USER_SETTINGS_PATH);

    if show {
        return show_config(&config_path);
    }

    println!("{}", "📝 Updating server configuration...".cyan());

    // Load or create INI
    let mut ini = if config_path.exists() {
        Ini::load_from_file(&config_path)
            .with_context(|| format!("Failed to load {}", config_path.display()))?
    } else {
        println!(
            "  {} Config file not found, creating new one...",
            "⚠️".yellow()
        );
        Ini::new()
    };

    // Get or create ServerSettings section
    let section = ini.section_mut(Some("ServerSettings")).map(|s| s.clone());

    let mut updates = Vec::new();

    if optimize {
        println!("  Applying optimized settings...");
        set_ini_value(&mut ini, "ServerSettings", "DifficultyOffset", "1.0");
        set_ini_value(&mut ini, "ServerSettings", "HarvestAmountMultiplier", "3.0");
        set_ini_value(&mut ini, "ServerSettings", "XPMultiplier", "2.0");
        set_ini_value(&mut ini, "ServerSettings", "TamingSpeedMultiplier", "5.0");
        updates.push("Applied optimized settings");
    }

    if let Some(h) = harvest {
        set_ini_value(
            &mut ini,
            "ServerSettings",
            "HarvestAmountMultiplier",
            &h.to_string(),
        );
        updates.push("Updated harvest multiplier");
    }

    if let Some(x) = xp {
        set_ini_value(&mut ini, "ServerSettings", "XPMultiplier", &x.to_string());
        updates.push("Updated XP multiplier");
    }

    if let Some(t) = taming {
        set_ini_value(
            &mut ini,
            "ServerSettings",
            "TamingSpeedMultiplier",
            &t.to_string(),
        );
        updates.push("Updated taming speed");
    }

    if let Some(d) = difficulty {
        set_ini_value(
            &mut ini,
            "ServerSettings",
            "DifficultyOffset",
            &d.to_string(),
        );
        updates.push("Updated difficulty offset");
    }

    if !updates.is_empty() {
        // Ensure directory exists
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        ini.write_to_file(&config_path)
            .with_context(|| format!("Failed to write {}", config_path.display()))?;

        for update in updates {
            println!("  {} {}", "✓".green(), update);
        }

        println!("  Saved to: {}", config_path.display().to_string().yellow());
    } else {
        println!(
            "  {} No changes specified. Use --optimize or --harvest/--xp/--taming/--difficulty",
            "ℹ️".blue()
        );
    }

    Ok(())
}

/// Handle performance optimization
pub fn handle_optimize(server_path: &Path, startup: bool, motd: bool) -> Result<()> {
    println!("{}", "⚡ Applying performance optimizations...".cyan());

    let config_path = server_path.join(GAME_USER_SETTINGS_PATH);
    let game_ini_path = server_path.join(GAME_INI_PATH);

    let performance_commands = [
        "r.VolumetricCloud 0",
        "r.VolumetricFog 0",
        "r.Water.SingleLayer.Reflection 0",
    ];

    if startup {
        println!("  Adding startup performance arguments...");

        // Load GameUserSettings.ini
        let mut ini = if config_path.exists() {
            Ini::load_from_file(&config_path)?
        } else {
            Ini::new()
        };

        // Add to [/Script/Engine.GameSession] or create startup args
        for cmd in &performance_commands {
            println!("    {} {}", "→".blue(), cmd);
        }

        // Note: In practice, these would go into command line args
        // For now, we document them
        println!(
            "  {}",
            "Note: Add these to your server startup command line:".yellow()
        );
        for cmd in &performance_commands {
            println!("    -ExecCmds=\"{}\"", cmd);
        }
    }

    if motd {
        println!("  Updating MOTD with performance tips...");

        let mut ini = if config_path.exists() {
            Ini::load_from_file(&config_path)?
        } else {
            Ini::new()
        };

        set_ini_value(&mut ini, "MessageOfTheDay", "Message", 
            "Welcome! For best performance, disable volumetric clouds/fog in your graphics settings.");
        set_ini_value(&mut ini, "MessageOfTheDay", "Duration", "20");

        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        ini.write_to_file(&config_path)?;

        println!("  {} MOTD updated", "✓".green());
    }

    if !startup && !motd {
        println!(
            "  {} Specify --startup or --motd to apply optimizations",
            "ℹ️".blue()
        );
    }

    Ok(())
}

/// Show current configuration
fn show_config(config_path: &Path) -> Result<()> {
    println!("{}", "📋 Current Server Configuration:".cyan());
    println!();

    if !config_path.exists() {
        println!("  {} Config file not found at:", "⚠️".yellow());
        println!("  {}", config_path.display());
        return Ok(());
    }

    let ini = Ini::load_from_file(config_path)?;

    let important_keys = [
        ("DifficultyOffset", "Difficulty"),
        ("HarvestAmountMultiplier", "Harvest Rate"),
        ("XPMultiplier", "XP Rate"),
        ("TamingSpeedMultiplier", "Taming Speed"),
        ("serverPVE", "PvE Mode"),
        ("MaxPlayers", "Max Players"),
        ("ServerPassword", "Password Protected"),
    ];

    if let Some(section) = ini.section(Some("ServerSettings")) {
        println!("  {}", "[ServerSettings]".yellow());
        for (key, label) in important_keys {
            if let Some(value) = section.get(key) {
                println!("    {:20} = {}", label, value.green());
            }
        }
    }

    // Check for active mods
    if let Some(section) = ini.section(Some("ServerSettings")) {
        if let Some(mods) = section.get("ActiveMods") {
            if !mods.is_empty() {
                println!();
                println!("  {}", "[Active Mods]".yellow());
                let mod_list: Vec<&str> = mods.split(',').collect();
                println!("    Count: {}", mod_list.len().to_string().green());
                for (i, mod_id) in mod_list.iter().take(5).enumerate() {
                    println!("    {}. {}", i + 1, mod_id);
                }
                if mod_list.len() > 5 {
                    println!("    ... and {} more", mod_list.len() - 5);
                }
            }
        }
    }

    Ok(())
}

/// Helper to set INI value
fn set_ini_value(ini: &mut Ini, section: &str, key: &str, value: &str) {
    ini.with_section(Some(section)).set(key, value);
}

/// Get the path to GameUserSettings.ini
pub fn get_game_user_settings_path(server_path: &Path) -> PathBuf {
    server_path.join(GAME_USER_SETTINGS_PATH)
}

/// Get the path to Game.ini
pub fn get_game_ini_path(server_path: &Path) -> PathBuf {
    server_path.join(GAME_INI_PATH)
}

/// Parse ActiveMods from INI into Vec<u64>
pub fn parse_active_mods(server_path: &Path) -> Result<Vec<u64>> {
    let config_path = get_game_user_settings_path(server_path);

    if !config_path.exists() {
        return Ok(vec![]);
    }

    let ini = Ini::load_from_file(&config_path)?;

    if let Some(section) = ini.section(Some("ServerSettings")) {
        if let Some(mods) = section.get("ActiveMods") {
            return Ok(mods
                .split(',')
                .filter_map(|s| s.trim().parse::<u64>().ok())
                .collect());
        }
    }

    Ok(vec![])
}
