use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;

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
        Self::init_schema(&conn)?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    fn init_schema(conn: &Connection) -> Result<()> {
        let schema = include_str!("schema.sql");
        conn.execute_batch(schema)?;

        // Run migrations for existing databases
        Self::run_migrations(conn)?;

        // Initialize Advanced Config tables
        // Initialize Advanced Config tables
        crate::services::advanced_config::AdvancedConfigService::init_tables(conn)?;

        // Run status check migration (to allow 'online' status)
        Self::run_status_migration(conn)?;

        // Run schema repair (restore missing columns if previous run faulty)
        Self::run_schema_repair(conn)?;

        // Run scheduler settings migration (advanced fields)
        Self::run_scheduler_migration(conn)?;

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
                FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;
        if !columns.contains(&"auto_stop".to_string()) {
            println!("📦 Migration: Adding 'auto_stop' column to servers table");
            conn.execute(
                "ALTER TABLE servers ADD COLUMN auto_stop INTEGER DEFAULT 0",
                [],
            )?;
        }

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

    fn run_schema_repair(conn: &Connection) -> Result<()> {
        // This is to fix the missing columns from the accidentally broken run_status_migration (v1)
        // Check for missing columns and add them.

        // 1. Check current columns
        let mut stmt = conn.prepare("PRAGMA table_info(servers)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

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
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query([key])?;

        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) 
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP",
            [key, value],
        )?;
        Ok(())
    }
}
