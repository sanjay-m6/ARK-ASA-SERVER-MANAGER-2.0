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

        Ok(())
    }

    fn run_settings_migration(conn: &Connection) -> Result<()> {
        let startup_timeout = Self::get_setting_static(conn, "startup_timeout")?;
        if startup_timeout.is_none() {
            println!("📦 Migration: Setting default 'startup_timeout' to 1800s");
            Self::set_setting_static(conn, "startup_timeout", "1800")?;
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
                        server_type TEXT NOT NULL DEFAULT 'ASA' CHECK(server_type IN ('ASA')),
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
                        task_type TEXT NOT NULL CHECK(task_type IN ('restart', 'backup', 'rcon-command', 'announcement', 'save-world', 'destroy-wild-dinos')),
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

                // Copy data back
                // We just select * because we are reusing the schema mostly
                // Note: For anti_cheat_config we added columns in migrations, ensure CREATE matches current state
                // The CREATE statements above include the NEW columns.
                // data copy: INSERT INTO X SELECT * FROM X_broken
                // If columns match, this works.
                // If columns don't match exactly (order or count), we might have issues.
                // But here we are renaming the EXISTING table (which has all current columns) to _broken.
                // And creating a NEW table with the FULL current schema.
                // So columns should match.

                tx.execute(
                    &format!("INSERT INTO {} SELECT * FROM {}", table, temp_name),
                    [],
                )?;

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
}

