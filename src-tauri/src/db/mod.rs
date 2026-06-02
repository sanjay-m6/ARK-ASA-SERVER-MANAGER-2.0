use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let mut conn = Connection::open(db_path)?;

        // Enable Write-Ahead Logging (WAL) for concurrency
        // Note: PRAGMA journal_mode returns the new mode (e.g. "wal"), so execute() fails.
        // We use pragma_update or query_row to handle this.
        let _mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;

        // Set synchronous mode to NORMAL (faster in WAL mode)
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        // Set busy timeout to 5 seconds to handle potential locks gracefully
        conn.pragma_update(None, "busy_timeout", 5000)?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        // Initialize schema
        Self::init_schema(&mut conn)?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    fn init_schema(conn: &mut Connection) -> Result<()> {
        let schema = include_str!("schema.sql");
        conn.execute_batch(schema)?;

        let migrations = include_str!("migrations.sql");
        conn.execute_batch(migrations)?;

        // Run migrations for existing databases
        Self::run_migrations(conn)?;

        // Initialize Advanced Config tables
        // Initialize Advanced Config tables
        crate::services::advanced_config::AdvancedConfigService::init_tables(conn)?;

        // Run status check migration (to allow 'online' status)
        Self::run_status_migration(conn)?;

        // Run scheduler migration (v2) to allow AutoUpdateMods
        Self::run_tasks_migration_v2(conn)?;

        // Run scheduler migration (v3) to add task_name
        Self::run_tasks_migration_v3(conn)?;

        // Run schema repair (restore missing columns if previous run faulty)
        Self::run_schema_repair(conn)?;

        // Run scheduler settings migration (advanced fields)
        Self::run_scheduler_migration(conn)?;

        // Run settings migration (defaults)
        Self::run_settings_migration(conn)?;

        Self::run_hardware_allocation_migration(conn)?;

        // ASE Module tables
        Self::run_ase_migration(conn)?;

        // Backup system migrations
        Self::run_backup_system_migration(conn)?;

        Ok(())
    }

    fn run_backup_system_migration(conn: &Connection) -> Result<()> {
        let mut stmt = conn.prepare("PRAGMA table_info(backups)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        if !columns.contains(&"label".to_string()) {
            println!("📦 Migration: Adding 'label' to backups");
            conn.execute("ALTER TABLE backups ADD COLUMN label TEXT", [])?;
        }
        if !columns.contains(&"notes".to_string()) {
            println!("📦 Migration: Adding 'notes' to backups");
            conn.execute("ALTER TABLE backups ADD COLUMN notes TEXT", [])?;
        }
        if !columns.contains(&"is_protected".to_string()) {
            println!("📦 Migration: Adding 'is_protected' to backups");
            conn.execute("ALTER TABLE backups ADD COLUMN is_protected INTEGER DEFAULT 0", [])?;
        }
        if !columns.contains(&"status".to_string()) {
            println!("📦 Migration: Adding 'status' to backups");
            conn.execute("ALTER TABLE backups ADD COLUMN status TEXT DEFAULT 'completed'", [])?;
        }
        if !columns.contains(&"hash".to_string()) {
            println!("📦 Migration: Adding 'hash' to backups");
            conn.execute("ALTER TABLE backups ADD COLUMN hash TEXT", [])?;
        }

        let mut stmt_bp = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='backup_policies'")?;
        let table_exists = stmt_bp.exists([])?;
        
        if !table_exists {
            println!("📦 Migration: Creating backup_policies table");
            conn.execute(
                "CREATE TABLE IF NOT EXISTS backup_policies (
                    server_id INTEGER PRIMARY KEY,
                    enabled BOOLEAN DEFAULT 0,
                    interval_hours INTEGER DEFAULT 24,
                    retention_days INTEGER DEFAULT 7,
                    retention_count INTEGER DEFAULT 10,
                    storage_quota_gb REAL DEFAULT 50.0,
                    backup_before_update BOOLEAN DEFAULT 1,
                    backup_before_restart BOOLEAN DEFAULT 1,
                    compression_enabled BOOLEAN DEFAULT 1,
                    cloud_sync_enabled BOOLEAN DEFAULT 0,
                    discord_webhook TEXT,
                    FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
                )",
                [],
            )?;
        }

        Ok(())
    }

    fn run_settings_migration(conn: &Connection) -> Result<()> {
        let startup_timeout = Self::get_setting_static(conn, "startup_timeout")?;
        if startup_timeout.is_none() {
            println!("📦 Migration: Setting default 'startup_timeout' to 1800s");
            Self::set_setting_static(conn, "startup_timeout", "1800")?;
        }

        let defaults = [
            ("global_auto_start_enabled", "false"),
            ("global_boot_delay", "0"),
            ("start_minimized_to_tray", "false"),
            ("silent_headless_startup", "false"),
            ("windows_startup_shortcut", "false"),
            ("loop_prevention_max_crashes", "3"),
            ("loop_prevention_time_window_mins", "15"),
        ];

        for &(key, val) in &defaults {
            if Self::get_setting_static(conn, key)?.is_none() {
                println!("📦 Migration: Setting default '{}' to '{}'", key, val);
                Self::set_setting_static(conn, key, val)?;
            }
        }

        Ok(())
    }

    fn run_hardware_allocation_migration(conn: &Connection) -> Result<()> {
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hardware_allocation'")?;
        let table_exists = stmt.exists([])?;
        
        if !table_exists {
            println!("📦 Migration: Creating hardware_allocation table");
            conn.execute(
                "CREATE TABLE IF NOT EXISTS hardware_allocation (
                    server_id INTEGER PRIMARY KEY,
                    use_all_cores INTEGER DEFAULT 1,
                    cpu_affinity TEXT,
                    process_priority TEXT DEFAULT 'Normal',
                    FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
                )",
                [],
            )?;
        }
        Ok(())
    }

    fn run_scheduler_migration(conn: &Connection) -> Result<()> {
        let mut stmt = conn.prepare("PRAGMA table_info(scheduler_settings)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        if !columns.contains(&"advanced_time".to_string()) {
            println!("📦 Migration: Adding 'advanced_time' to scheduler_settings");
            conn.execute(
                "ALTER TABLE scheduler_settings ADD COLUMN advanced_time TEXT",
                [],
            )?;
        }
        if !columns.contains(&"advanced_days".to_string()) {
            println!("📦 Migration: Adding 'advanced_days' to scheduler_settings");
            conn.execute(
                "ALTER TABLE scheduler_settings ADD COLUMN advanced_days TEXT",
                [],
            )?;
        }
        if !columns.contains(&"advanced_warning_minutes".to_string()) {
            println!("📦 Migration: Adding 'advanced_warning_minutes' to scheduler_settings");
            conn.execute(
                "ALTER TABLE scheduler_settings ADD COLUMN advanced_warning_minutes TEXT",
                [],
            )?;
        }
        if !columns.contains(&"advanced_shutdown".to_string()) {
            println!("📦 Migration: Adding 'advanced_shutdown' to scheduler_settings");
            conn.execute(
                "ALTER TABLE scheduler_settings ADD COLUMN advanced_shutdown INTEGER DEFAULT 0",
                [],
            )?;
        }
        if !columns.contains(&"advanced_update".to_string()) {
            println!("📦 Migration: Adding 'advanced_update' to scheduler_settings");
            conn.execute(
                "ALTER TABLE scheduler_settings ADD COLUMN advanced_update INTEGER DEFAULT 0",
                [],
            )?;
        }
        if !columns.contains(&"advanced_restart".to_string()) {
            println!("📦 Migration: Adding 'advanced_restart' to scheduler_settings");
            conn.execute(
                "ALTER TABLE scheduler_settings ADD COLUMN advanced_restart INTEGER DEFAULT 0",
                [],
            )?;
        }
        if !columns.contains(&"advanced_dino_wipe".to_string()) {
            println!("📦 Migration: Adding 'advanced_dino_wipe' to scheduler_settings");
            conn.execute(
                "ALTER TABLE scheduler_settings ADD COLUMN advanced_dino_wipe INTEGER DEFAULT 0",
                [],
            )?;
        }

        Ok(())
    }

    fn run_migrations(conn: &Connection) -> Result<()> {
        // Add missing columns to servers table (if they don't exist)
        // SQLite doesn't have IF NOT EXISTS for ALTER TABLE, so we use a table info check

        let mut stmt = conn.prepare("PRAGMA table_info(servers)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        // Add mods column if missing
        if !columns.contains(&"mods".to_string()) {
            println!("📦 Migration: Adding 'mods' column to servers table");
            conn.execute("ALTER TABLE servers ADD COLUMN mods TEXT", [])?;
        }

        // Add custom_args column if missing
        if !columns.contains(&"custom_args".to_string()) {
            println!("📦 Migration: Adding 'custom_args' column to servers table");
            conn.execute("ALTER TABLE servers ADD COLUMN custom_args TEXT", [])?;
        }

        // Add rcon_enabled column if missing
        if !columns.contains(&"rcon_enabled".to_string()) {
            println!("📦 Migration: Adding 'rcon_enabled' column to servers table");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN rcon_enabled INTEGER DEFAULT 1",
                [],
            )?;
        }

        // Add ip_address column if missing
        if !columns.contains(&"ip_address".to_string()) {
            println!("📦 Migration: Adding 'ip_address' column to servers table");
            conn.execute("ALTER TABLE servers ADD COLUMN ip_address TEXT", [])?;
        }

        // Add cluster_id column if missing
        if !columns.contains(&"cluster_id".to_string()) {
            println!("📦 Migration: Adding 'cluster_id' column to servers table");
            conn.execute("ALTER TABLE servers ADD COLUMN cluster_id INTEGER REFERENCES clusters(id) ON DELETE SET NULL", [])?;
        }

        // Add auto_start column if missing
        if !columns.contains(&"auto_start".to_string()) {
            println!("📦 Migration: Adding 'auto_start' column to servers table");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN auto_start INTEGER DEFAULT 0",
                [],
            )?;
        }

        // Add auto_stop column if missing (logic truncated in view, adding full block plus new migration)
        if !columns.contains(&"auto_stop".to_string()) {
            println!("📦 Migration: Adding 'auto_stop' column to servers table");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN auto_stop INTEGER DEFAULT 0",
                [],
            )?;
        }

        // Add startup_delay column if missing
        if !columns.contains(&"startup_delay".to_string()) {
            println!("📦 Migration: Adding 'startup_delay' column to servers table");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN startup_delay INTEGER DEFAULT 0",
                [],
            )?;
        }

        // Add startup_priority column if missing
        if !columns.contains(&"startup_priority".to_string()) {
            println!("📦 Migration: Adding 'startup_priority' column to servers table");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN startup_priority INTEGER DEFAULT 100",
                [],
            )?;
        }

        // Add auto_restart column if missing
        if !columns.contains(&"auto_restart".to_string()) {
            println!("📦 Migration: Adding 'auto_restart' column to servers table");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN auto_restart INTEGER DEFAULT 0",
                [],
            )?;
        }

        // Initialize scheduler_settings table for existing DBs
        conn.execute(
            "CREATE TABLE IF NOT EXISTS scheduler_settings (
                server_id INTEGER PRIMARY KEY,
                mode TEXT NOT NULL DEFAULT 'disabled',
                basic_interval_hours INTEGER DEFAULT 24,
                basic_warning_minutes TEXT DEFAULT '30,15,10,5,1',
                next_run_basic TIMESTAMP,
                advanced_time TEXT,
                advanced_days TEXT,
                advanced_warning_minutes TEXT,
                advanced_shutdown INTEGER DEFAULT 0,
                advanced_update INTEGER DEFAULT 0,
                advanced_restart INTEGER DEFAULT 0,
                advanced_dino_wipe INTEGER DEFAULT 0,
                FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Add intelligent_mode column if missing
        if !columns.contains(&"intelligent_mode".to_string()) {
            println!("📦 Migration: Adding 'intelligent_mode' column to servers table");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN intelligent_mode INTEGER DEFAULT 0",
                [],
            )?;
        }

        // --- Anti-Cheat Config Migrations ---
        // Need to check anti_cheat_config columns
        let mut stmt_ac = conn.prepare("PRAGMA table_info(anti_cheat_config)")?;
        let ac_columns: Vec<String> = stmt_ac
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        if !ac_columns.contains(&"mesh_enabled".to_string()) {
            println!("📦 Migration: Adding 'mesh_enabled' to anti_cheat_config");
            conn.execute(
                "ALTER TABLE anti_cheat_config ADD COLUMN mesh_enabled INTEGER DEFAULT 0",
                [],
            )?;
        }
        if !ac_columns.contains(&"mesh_threshold".to_string()) {
            println!("📦 Migration: Adding 'mesh_threshold' to anti_cheat_config");
            conn.execute(
                "ALTER TABLE anti_cheat_config ADD COLUMN mesh_threshold REAL DEFAULT 0.6",
                [],
            )?;
        }
        if !ac_columns.contains(&"mesh_notify".to_string()) {
            println!("📦 Migration: Adding 'mesh_notify' to anti_cheat_config");
            conn.execute(
                "ALTER TABLE anti_cheat_config ADD COLUMN mesh_notify INTEGER DEFAULT 1",
                [],
            )?;
        }

        if !ac_columns.contains(&"command_enabled".to_string()) {
            println!("📦 Migration: Adding 'command_enabled' to anti_cheat_config");
            conn.execute(
                "ALTER TABLE anti_cheat_config ADD COLUMN command_enabled INTEGER DEFAULT 0",
                [],
            )?;
        }
        // Store lists as JSON strings or comma-separated
        if !ac_columns.contains(&"command_blacklisted".to_string()) {
            println!("📦 Migration: Adding 'command_blacklisted' to anti_cheat_config");
            conn.execute(
                "ALTER TABLE anti_cheat_config ADD COLUMN command_blacklisted TEXT DEFAULT ''",
                [],
            )?;
        }
        if !ac_columns.contains(&"command_whitelist".to_string()) {
            println!("📦 Migration: Adding 'command_whitelist' to anti_cheat_config");
            conn.execute(
                "ALTER TABLE anti_cheat_config ADD COLUMN command_whitelist TEXT DEFAULT ''",
                [],
            )?;
        }

        // --- Discord Bridge Config Migrations ---
        let mut stmt_db = conn.prepare("PRAGMA table_info(discord_bridge_config)")?;
        let db_columns: Vec<String> = stmt_db
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        if !db_columns.contains(&"server_list_enabled".to_string()) {
            println!("📦 Migration: Adding 'server_list_enabled' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN server_list_enabled INTEGER DEFAULT 0",
                [],
            )?;
        }
        if !db_columns.contains(&"server_list_channel_id".to_string()) {
            println!("📦 Migration: Adding 'server_list_channel_id' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN server_list_channel_id TEXT",
                [],
            )?;
        }
        if !db_columns.contains(&"server_list_message_id".to_string()) {
            println!("📦 Migration: Adding 'server_list_message_id' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN server_list_message_id TEXT",
                [],
            )?;
        }
        if !db_columns.contains(&"player_list_enabled".to_string()) {
            println!("📦 Migration: Adding 'player_list_enabled' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN player_list_enabled INTEGER DEFAULT 0",
                [],
            )?;
        }
        if !db_columns.contains(&"player_list_channel_id".to_string()) {
            println!("📦 Migration: Adding 'player_list_channel_id' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN player_list_channel_id TEXT",
                [],
            )?;
        }
        if !db_columns.contains(&"player_list_message_id".to_string()) {
            println!("📦 Migration: Adding 'player_list_message_id' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN player_list_message_id TEXT",
                [],
            )?;
        }
        if !db_columns.contains(&"show_tribe_names".to_string()) {
            println!("📦 Migration: Adding 'show_tribe_names' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN show_tribe_names INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"show_playtime".to_string()) {
            println!("📦 Migration: Adding 'show_playtime' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN show_playtime INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"admin_channel_id".to_string()) {
            println!("📦 Migration: Adding 'admin_channel_id' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN admin_channel_id TEXT DEFAULT ''",
                [],
            )?;
        }
        if !db_columns.contains(&"notifications_channel_id".to_string()) {
            println!("📦 Migration: Adding 'notifications_channel_id' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notifications_channel_id TEXT DEFAULT ''",
                [],
            )?;
        }
        if !db_columns.contains(&"notify_player_join_leave".to_string()) {
            println!("📦 Migration: Adding 'notify_player_join_leave' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notify_player_join_leave INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"notify_server_crashes".to_string()) {
            println!("📦 Migration: Adding 'notify_server_crashes' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notify_server_crashes INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"notify_server_recovery".to_string()) {
            println!("📦 Migration: Adding 'notify_server_recovery' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notify_server_recovery INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"notify_scheduled_restarts".to_string()) {
            println!("📦 Migration: Adding 'notify_scheduled_restarts' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notify_scheduled_restarts INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"notify_backup_completion".to_string()) {
            println!("📦 Migration: Adding 'notify_backup_completion' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notify_backup_completion INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"notify_performance_alerts".to_string()) {
            println!("📦 Migration: Adding 'notify_performance_alerts' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notify_performance_alerts INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"notify_mod_watchdog".to_string()) {
            println!("📦 Migration: Adding 'notify_mod_watchdog' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notify_mod_watchdog INTEGER DEFAULT 1",
                [],
            )?;
        }
        if !db_columns.contains(&"notify_anti_cheat".to_string()) {
            println!("📦 Migration: Adding 'notify_anti_cheat' to discord_bridge_config");
            conn.execute(
                "ALTER TABLE discord_bridge_config ADD COLUMN notify_anti_cheat INTEGER DEFAULT 1",
                [],
            )?;
        }

        Ok(())
    }

    fn run_tasks_migration_v2(conn: &Connection) -> Result<()> {
        let migration_key = "migration_tasks_check_v2";
        let has_migrated =
            Self::get_setting_static(conn, migration_key)?.unwrap_or("0".to_string()) == "1";

        if !has_migrated {
            println!("📦 Migration: Updating CHECK constraint on scheduled_tasks (AutoUpdateMods)");

            // Disable FKs
            conn.pragma_update(None, "foreign_keys", "OFF")?;

            conn.execute("BEGIN TRANSACTION", [])?;

            // Rename old table
            conn.execute(
                "ALTER TABLE scheduled_tasks RENAME TO scheduled_tasks_old",
                [],
            )?;

            // Create new table with updated CHECK constraint
            conn.execute(
                "CREATE TABLE scheduled_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id INTEGER NOT NULL,
                    task_type TEXT NOT NULL CHECK(task_type IN ('restart', 'backup', 'rcon-command', 'announcement', 'save-world', 'destroy-wild-dinos', 'AutoUpdateMods')),
                    cron_expression TEXT NOT NULL,
                    command TEXT,
                    message TEXT,
                    pre_warning_minutes INTEGER DEFAULT 5,
                    enabled INTEGER DEFAULT 1,
                    last_run TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
                )",
                [],
            )?;

            // Copy data from old table
            conn.execute(
                "INSERT INTO scheduled_tasks (id, server_id, task_type, cron_expression, command, message, pre_warning_minutes, enabled, last_run, created_at)
                 SELECT id, server_id, task_type, cron_expression, command, message, pre_warning_minutes, enabled, last_run, created_at
                 FROM scheduled_tasks_old",
                [],
            )?;

            // Drop old table
            conn.execute("DROP TABLE scheduled_tasks_old", [])?;

            conn.execute("COMMIT", [])?;

            // Re-enable FKs
            conn.pragma_update(None, "foreign_keys", "ON")?;

            Self::set_setting_static(conn, migration_key, "1")?;
        }

        Ok(())
    }

    fn run_tasks_migration_v3(conn: &Connection) -> Result<()> {
        let mut stmt = conn.prepare("PRAGMA table_info(scheduled_tasks)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        if !columns.contains(&"task_name".to_string()) {
            println!("📦 Migration: Adding 'task_name' column to scheduled_tasks");
            conn.execute("ALTER TABLE scheduled_tasks ADD COLUMN task_name TEXT", [])?;
        }

        Ok(())
    }

    fn run_status_migration(conn: &Connection) -> Result<()> {
        let migration_key = "migration_status_check_v1";
        let has_migrated =
            Self::get_setting_static(conn, migration_key)?.unwrap_or("0".to_string()) == "1";

        if !has_migrated {
            println!("📦 Migration: Removing restrictive CHECK constraint on server status");

            // Disable FKs to prevent constraint errors during table swap and to prevent
            // SQLite from updating references in other tables (like scheduler_settings) to point to servers_old.
            conn.pragma_update(None, "foreign_keys", "OFF")?;

            conn.execute("BEGIN TRANSACTION", [])?;

            // Rename old table
            conn.execute("ALTER TABLE servers RENAME TO servers_old", [])?;

            // Create new table without CHECK constraint on status
            // NOTE: We must include ALL columns from the original schema
            conn.execute(
                "CREATE TABLE servers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    server_type TEXT NOT NULL DEFAULT 'ASA',
                    install_path TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'stopped',
                    game_port INTEGER NOT NULL DEFAULT 7777,
                    query_port INTEGER NOT NULL DEFAULT 27015,
                    rcon_port INTEGER NOT NULL DEFAULT 27020,
                    max_players INTEGER NOT NULL DEFAULT 70,
                    server_password TEXT DEFAULT '',
                    admin_password TEXT DEFAULT '',
                    map_name TEXT NOT NULL DEFAULT 'TheIsland_WP',
                    session_name TEXT NOT NULL DEFAULT 'Ark Server',
                    motd TEXT,
                    ip_address TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_started TIMESTAMP,
                    auto_start INTEGER DEFAULT 0,
                    auto_stop INTEGER DEFAULT 0,
                    intelligent_mode INTEGER DEFAULT 0,
                    mods TEXT,
                    custom_args TEXT,
                    rcon_enabled INTEGER DEFAULT 1,
                    cluster_id INTEGER REFERENCES clusters(id) ON DELETE SET NULL
                )",
                [],
            )?;

            // Copy data - assuming servers_old has these columns (if it was created from schema.sql)
            // If servers_old came from the BROKEN migration, it lacks them.
            // But this block only runs if !has_migrated.
            // If the user hasn't migrated, they have the ORIGINAL schema which HAS these columns.
            // So we select them.
            conn.execute(
                "INSERT INTO servers (id, name, server_type, install_path, status, game_port, query_port, rcon_port, max_players, server_password, admin_password, map_name, session_name, motd, ip_address, created_at, last_started, auto_start, auto_stop, intelligent_mode, mods, custom_args, rcon_enabled, cluster_id)
                 SELECT id, name, server_type, install_path, status, game_port, query_port, rcon_port, max_players, server_password, admin_password, map_name, session_name, motd, ip_address, created_at, last_started, auto_start, auto_stop, intelligent_mode, mods, custom_args, rcon_enabled, cluster_id
                 FROM servers_old",
                [],
            )?;

            // Drop old table
            conn.execute("DROP TABLE servers_old", [])?;

            conn.execute("COMMIT", [])?;

            // Re-enable FKs
            conn.pragma_update(None, "foreign_keys", "ON")?;

            Self::set_setting_static(conn, migration_key, "1")?;
        }

        Ok(())
    }

    fn run_schema_repair(conn: &mut Connection) -> Result<()> {
        // This is to fix the missing columns from the accidentally broken run_status_migration (v1)
        // Check for missing columns and add them.

        // 1. Check current columns
        let columns: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(servers)")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            let mut cols = Vec::new();
            for c in rows.flatten() {
                cols.push(c);
            }
            cols
        };

        let mut changes_made = false;

        // server_type
        if !columns.contains(&"server_type".to_string()) {
            println!("📦 Repair Migration: Restoring 'server_type'");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN server_type TEXT NOT NULL DEFAULT 'ASA'",
                [],
            )?;
            changes_made = true;
        }

        // map_name
        if !columns.contains(&"map_name".to_string()) {
            println!("📦 Repair Migration: Restoring 'map_name'");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN map_name TEXT NOT NULL DEFAULT 'TheIsland_WP'",
                [],
            )?;
            changes_made = true;
        }

        // session_name
        if !columns.contains(&"session_name".to_string()) {
            println!("📦 Repair Migration: Restoring 'session_name'");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN session_name TEXT NOT NULL DEFAULT 'Ark Server'",
                [],
            )?;
            changes_made = true;
        }

        // motd
        if !columns.contains(&"motd".to_string()) {
            println!("📦 Repair Migration: Restoring 'motd'");
            conn.execute("ALTER TABLE servers ADD COLUMN motd TEXT", [])?;
            changes_made = true;
        }

        if changes_made {
            println!("✅ Repair Migration Completed: Missing columns restored.");
        }

        // Run FK repair
        Self::repair_broken_fks(conn)?;

        Ok(())
    }

    fn repair_broken_fks(conn: &mut Connection) -> Result<()> {
        // List of tables that refer to 'servers'
        let tables = vec![
            "mods",
            "backups",
            "cluster_servers",
            "player_sessions",
            "scheduled_tasks",
            "anti_cheat_config",
            "anti_cheat_logs",
            "scheduler_settings",
        ];

        let mut repaired_any = false;

        for table in tables {
            let needs_repair = {
                let mut stmt = conn.prepare(&format!("PRAGMA foreign_key_list({})", table))?;
                let fks = stmt.query_map([], |row| {
                    let table_to: String = row.get(2)?; // 'table' column
                    Ok(table_to)
                })?;

                let mut repair_needed = false;
                for to_table in fks.flatten() {
                    if to_table == "servers_old" {
                        repair_needed = true;
                        break;
                    }
                }
                repair_needed
            };

            if needs_repair {
                println!("🔧 Repairing table '{}' (FK points to servers_old)", table);

                // Disable foreign keys during repair
                conn.pragma_update(None, "foreign_keys", "OFF")?;

                let tx = conn.transaction()?;

                // Rename bad table
                let temp_name = format!("{}_broken_fk", table);
                tx.execute(
                    &format!("ALTER TABLE {} RENAME TO {}", table, temp_name),
                    [],
                )?;

                // Recreate table with correct schema
                // We refer to schema definitions. Since we can't easily include SQL here dynamically without parsing,
                // we'll manually define the CREATE statements for these specific tables based on schema.sql.

                let create_sql = match table {
                    "mods" => "CREATE TABLE mods (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        server_id INTEGER NOT NULL,
                        mod_id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        version TEXT,
                        author TEXT,
                        description TEXT,
                        workshop_url TEXT,
                        server_type TEXT NOT NULL DEFAULT 'ASA' CHECK(server_type IN ('ASA', 'ASE')),
                        enabled BOOLEAN DEFAULT 1,
                        load_order INTEGER NOT NULL,
                        installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
                        UNIQUE(server_id, mod_id)
                    )",
                    "backups" => "CREATE TABLE backups (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        server_id INTEGER NOT NULL,
                        backup_type TEXT NOT NULL CHECK(backup_type IN ('auto', 'manual', 'pre-update', 'pre-restart')),
                        file_path TEXT NOT NULL,
                        size INTEGER NOT NULL,
                        includes_configs BOOLEAN DEFAULT 1,
                        includes_mods BOOLEAN DEFAULT 1,
                        includes_saves BOOLEAN DEFAULT 1,
                        includes_cluster BOOLEAN DEFAULT 0,
                        verified BOOLEAN DEFAULT 0,
                        label TEXT,
                        notes TEXT,
                        is_protected INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'completed',
                        hash TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
                    )",
                    "cluster_servers" => "CREATE TABLE cluster_servers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        cluster_id INTEGER NOT NULL,
                        server_id INTEGER NOT NULL,
                        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (cluster_id) REFERENCES clusters (id) ON DELETE CASCADE,
                        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
                        UNIQUE(cluster_id, server_id)
                    )",
                    "player_sessions" => "CREATE TABLE player_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        server_id INTEGER NOT NULL,
                        steam_id TEXT NOT NULL,
                        player_name TEXT NOT NULL,
                        joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        left_at TIMESTAMP,
                        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
                    )",
                    "scheduled_tasks" => "CREATE TABLE scheduled_tasks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        server_id INTEGER NOT NULL,
                        task_name TEXT,
                        task_type TEXT NOT NULL CHECK(task_type IN ('restart', 'backup', 'rcon-command', 'announcement', 'save-world', 'destroy-wild-dinos', 'AutoUpdateMods')),
                        cron_expression TEXT NOT NULL,
                        command TEXT,
                        message TEXT,
                        pre_warning_minutes INTEGER DEFAULT 5,
                        enabled INTEGER DEFAULT 1,
                        last_run TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
                    )",
                    "anti_cheat_config" => "CREATE TABLE anti_cheat_config (
                        server_id INTEGER PRIMARY KEY,
                        enabled INTEGER DEFAULT 0,
                        sensitivity REAL DEFAULT 1.0,
                        log_only INTEGER DEFAULT 1,
                        kick_enabled INTEGER DEFAULT 0,
                        ban_enabled INTEGER DEFAULT 0,
                        discord_alert INTEGER DEFAULT 0,
                        rules_json TEXT,
                        mesh_enabled INTEGER DEFAULT 0,
                        mesh_threshold REAL DEFAULT 0.6,
                        mesh_notify INTEGER DEFAULT 1,
                        command_enabled INTEGER DEFAULT 0,
                        command_blacklisted TEXT DEFAULT '',
                        command_whitelist TEXT DEFAULT '',
                        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
                    )",
                    "anti_cheat_logs" => "CREATE TABLE anti_cheat_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        server_id INTEGER NOT NULL,
                        player_name TEXT NOT NULL,
                        steam_id TEXT NOT NULL,
                        violation_type TEXT NOT NULL,
                        severity REAL NOT NULL,
                        details TEXT,
                        action_taken TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
                    )",
                    "scheduler_settings" => "CREATE TABLE scheduler_settings (
                        server_id INTEGER PRIMARY KEY,
                        mode TEXT NOT NULL DEFAULT 'disabled',
                        basic_interval_hours INTEGER DEFAULT 24,
                        basic_warning_minutes TEXT DEFAULT '30,15,10,5,1',
                        next_run_basic TIMESTAMP,
                        advanced_time TEXT,
                        advanced_days TEXT,
                        advanced_warning_minutes TEXT,
                        advanced_shutdown INTEGER DEFAULT 0,
                        advanced_update INTEGER DEFAULT 0,
                        advanced_restart INTEGER DEFAULT 0,
                        advanced_dino_wipe INTEGER DEFAULT 0,
                        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
                    )",
                    _ => "",
                };

                if create_sql.is_empty() {
                    // Should not happen given our list
                    continue;
                }

                tx.execute(create_sql, [])?;

                // Copy data back using explicit column names
                // This ensures column order or missing columns do not break the insert
                let columns_list = {
                    let mut stmt_old = tx.prepare(&format!("PRAGMA table_info({})", temp_name))?;
                    let old_columns: Vec<String> = stmt_old
                        .query_map([], |row| row.get::<_, String>(1))?
                        .filter_map(|r| r.ok())
                        .collect();

                    let mut stmt_new = tx.prepare(&format!("PRAGMA table_info({})", table))?;
                    let new_columns: Vec<String> = stmt_new
                        .query_map([], |row| row.get::<_, String>(1))?
                        .filter_map(|r| r.ok())
                        .collect();

                    let common_columns: Vec<String> = old_columns.into_iter().filter(|c| new_columns.contains(c)).collect();
                    common_columns.join(", ")
                };

                if !columns_list.is_empty() {
                    tx.execute(
                        &format!("INSERT INTO {} ({}) SELECT {} FROM {}", table, columns_list, columns_list, temp_name),
                        [],
                    )?;
                }

                // Drop broken table
                tx.execute(&format!("DROP TABLE {}", temp_name), [])?;

                tx.commit()?;

                // Re-enable FKs
                conn.pragma_update(None, "foreign_keys", "ON")?;

                println!("  ✅ Table '{}' repaired successfully.", table);
                repaired_any = true;
            }
        }

        if repaired_any {
            println!("✅ Database FK Repair Completed.");
        }

        Ok(())
    }

    fn get_setting_static(conn: &Connection, key: &str) -> Result<Option<String>> {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query([key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    fn set_setting_static(conn: &Connection, key: &str, value: &str) -> Result<()> {
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) 
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP",
            [key, value],
        )?;
        Ok(())
    }

    pub fn get_connection(&self) -> std::sync::LockResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn.lock()
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query([key])?;

        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) 
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP",
            [key, value],
        )?;
        Ok(())
    }

    fn run_ase_migration(conn: &Connection) -> Result<()> {
        // Check if ase_servers table already exists
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ase_servers'")?;
        let table_exists = stmt.exists([])?;

        if !table_exists {
            println!("📦 ASE Migration: Creating ASE module tables");

            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS ase_servers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    install_path TEXT NOT NULL DEFAULT '',
                    map_name TEXT NOT NULL DEFAULT 'TheIsland',
                    port INTEGER NOT NULL DEFAULT 7777,
                    query_port INTEGER NOT NULL DEFAULT 27015,
                    rcon_port INTEGER NOT NULL DEFAULT 27020,
                    rcon_password TEXT NOT NULL DEFAULT '',
                    max_players INTEGER NOT NULL DEFAULT 70,
                    server_password TEXT NOT NULL DEFAULT '',
                    admin_password TEXT NOT NULL DEFAULT '',
                    session_name TEXT NOT NULL DEFAULT 'ARK Server',
                    active_mods TEXT NOT NULL DEFAULT '',
                    cluster_id TEXT NOT NULL DEFAULT '',
                    battleye INTEGER NOT NULL DEFAULT 1,
                    extra_args TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'stopped',
                    process_id INTEGER,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    auto_start INTEGER NOT NULL DEFAULT 0,
                    auto_stop INTEGER NOT NULL DEFAULT 0,
                    intelligent_mode INTEGER NOT NULL DEFAULT 0,
                    startup_delay INTEGER NOT NULL DEFAULT 0,
                    startup_priority INTEGER NOT NULL DEFAULT 100,
                    branch TEXT NOT NULL DEFAULT 'default'
                );

                CREATE TABLE IF NOT EXISTS ase_mods (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id INTEGER NOT NULL,
                    workshop_id TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT 'Unknown Mod',
                    version TEXT NOT NULL DEFAULT '1.0',
                    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
                    enabled INTEGER NOT NULL DEFAULT 1,
                    load_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(server_id) REFERENCES ase_servers(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS ase_backups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id INTEGER NOT NULL,
                    path TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY(server_id) REFERENCES ase_servers(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS ase_scheduled_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id INTEGER NOT NULL,
                    task_type TEXT NOT NULL DEFAULT 'restart',
                    cron_expr TEXT NOT NULL DEFAULT '0 */6 * * *',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    last_run TEXT,
                    FOREIGN KEY(server_id) REFERENCES ase_servers(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS ase_clusters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    cluster_dir TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );"
            )?;

            println!("✅ ASE Migration: All ASE tables created successfully");
        } else {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS ase_clusters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    cluster_dir TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );"
            )?;
        }

        // Migrate existing ase_servers databases if columns are missing
        let mut stmt_cols = conn.prepare("PRAGMA table_info(ase_servers)")?;
        let existing_cols: Vec<String> = stmt_cols
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        let new_cols = [
            ("auto_start", "INTEGER NOT NULL DEFAULT 0"),
            ("auto_stop", "INTEGER NOT NULL DEFAULT 0"),
            ("intelligent_mode", "INTEGER NOT NULL DEFAULT 0"),
            ("startup_delay", "INTEGER NOT NULL DEFAULT 0"),
            ("startup_priority", "INTEGER NOT NULL DEFAULT 100"),
            ("branch", "TEXT NOT NULL DEFAULT 'default'"),
        ];

        for (col_name, col_type) in new_cols {
            if !existing_cols.contains(&col_name.to_string()) {
                println!("📦 ASE Migration: Adding '{}' column to ase_servers", col_name);
                conn.execute(
                    &format!("ALTER TABLE ase_servers ADD COLUMN {} {}", col_name, col_type),
                    [],
                )?;
            }
        }

        Self::run_ase_mods_metadata_migration(conn)?;

        Ok(())
    }

    fn run_ase_mods_metadata_migration(conn: &Connection) -> Result<()> {
        let mut stmt = conn.prepare("PRAGMA table_info(ase_mods)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        let metadata_columns = [
            ("description", "TEXT"),
            ("author", "TEXT"),
            ("preview_url", "TEXT"),
            ("subscribers", "TEXT"),
            ("file_size", "TEXT"),
            ("time_updated", "TEXT"),
            ("time_created", "TEXT"),
            ("tags", "TEXT"),
        ];

        for (col_name, col_type) in metadata_columns {
            if !columns.contains(&col_name.to_string()) {
                println!("📦 ASE Migration: Adding '{}' column to ase_mods", col_name);
                conn.execute(
                    &format!("ALTER TABLE ase_mods ADD COLUMN {} {}", col_name, col_type),
                    [],
                )?;
            }
        }

        Ok(())
    }
}

