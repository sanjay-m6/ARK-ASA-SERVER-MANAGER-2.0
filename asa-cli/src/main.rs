mod config;
mod network;
mod backup;
mod errors;

use clap::{Parser, Subcommand};
use colored::*;
use std::path::PathBuf;

/// ASA Server Manager CLI - High-performance server automation tool
#[derive(Parser)]
#[command(name = "asa_manager")]
#[command(author = "ASA Server Manager")]
#[command(version = "1.0.0")]
#[command(about = "CLI tool for ARK: Survival Ascended server automation", long_about = None)]
struct Cli {
    /// Path to the server installation directory
    #[arg(short, long, default_value = ".")]
    server_path: PathBuf,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Update server configuration with optimized settings
    Config {
        /// Apply high-performance settings
        #[arg(long)]
        optimize: bool,

        /// Set harvest amount multiplier
        #[arg(long)]
        harvest: Option<f32>,

        /// Set XP multiplier
        #[arg(long)]
        xp: Option<f32>,

        /// Set taming speed multiplier
        #[arg(long)]
        taming: Option<f32>,

        /// Set difficulty offset
        #[arg(long)]
        difficulty: Option<f32>,

        /// Show current configuration
        #[arg(long)]
        show: bool,
    },

    /// Check and update mods from CurseForge
    UpdateMods {
        /// Force update even if versions match
        #[arg(long)]
        force: bool,

        /// Check only, don't download
        #[arg(long)]
        check_only: bool,
    },

    /// Create a backup of the world save
    Backup {
        /// Custom backup name suffix
        #[arg(long)]
        name: Option<String>,

        /// List all available backups
        #[arg(long)]
        list: bool,

        /// Restore from a specific backup
        #[arg(long)]
        restore: Option<String>,
    },

    /// Apply performance optimizations
    Optimize {
        /// Inject performance commands into startup args
        #[arg(long)]
        startup: bool,

        /// Update MOTD with performance tips
        #[arg(long)]
        motd: bool,
    },

    /// Verify server integrity
    Verify {
        /// Check mod files exist
        #[arg(long)]
        mods: bool,

        /// Check config files are valid
        #[arg(long)]
        config: bool,

        /// Check save files exist
        #[arg(long)]
        saves: bool,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    println!("{}", "╔══════════════════════════════════════════╗".cyan());
    println!("{}", "║     ASA Server Manager CLI v1.0.0        ║".cyan());
    println!("{}", "╚══════════════════════════════════════════╝".cyan());
    println!();

    let server_path = cli.server_path.canonicalize().unwrap_or(cli.server_path);
    println!("📁 Server path: {}", server_path.display().to_string().yellow());
    println!();

    match cli.command {
        Commands::Config { optimize, harvest, xp, taming, difficulty, show } => {
            config::handle_config(&server_path, optimize, harvest, xp, taming, difficulty, show)?;
        }

        Commands::UpdateMods { force, check_only } => {
            network::handle_mod_update(&server_path, force, check_only).await?;
        }

        Commands::Backup { name, list, restore } => {
            backup::handle_backup(&server_path, name, list, restore)?;
        }

        Commands::Optimize { startup, motd } => {
            config::handle_optimize(&server_path, startup, motd)?;
        }

        Commands::Verify { mods, config, saves } => {
            verify_server(&server_path, mods, config, saves)?;
        }
    }

    println!();
    println!("{}", "✅ Operation completed successfully!".green());
    Ok(())
}

fn verify_server(server_path: &PathBuf, check_mods: bool, check_config: bool, check_saves: bool) -> anyhow::Result<()> {
    println!("{}", "🔍 Verifying server integrity...".cyan());

    let mut issues = Vec::new();

    if check_config || (!check_mods && !check_saves) {
        println!("  Checking config files...");
        let config_path = server_path
            .join("ShooterGame/Saved/Config/WindowsServer");
        
        if !config_path.join("GameUserSettings.ini").exists() {
            issues.push("GameUserSettings.ini not found");
        }
        if !config_path.join("Game.ini").exists() {
            issues.push("Game.ini not found");
        }
    }

    if check_mods || (!check_config && !check_saves) {
        println!("  Checking mod files...");
        let mods_path = server_path
            .join("ShooterGame/Binaries/Win64/ShooterGame/Mods");
        
        if !mods_path.exists() {
            issues.push("Mods directory not found");
        }
    }

    if check_saves || (!check_config && !check_mods) {
        println!("  Checking save files...");
        let saves_path = server_path.join("ShooterGame/Saved/SavedArks");
        
        if !saves_path.exists() {
            issues.push("SavedArks directory not found");
        }
    }

    if issues.is_empty() {
        println!("  {}", "All checks passed!".green());
    } else {
        println!("  {}", "Issues found:".red());
        for issue in issues {
            println!("    ❌ {}", issue.red());
        }
    }

    Ok(())
}
