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

        // Add auto_stop column if missing
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
