use crate::AppState;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventProfile {
    pub id: Option<i64>,
    pub server_id: i64,
    pub profile_name: String,
    pub harvest_multiplier: f32,
    pub stack_size_multiplier: f32,
    pub structure_resistance: f32,
    pub structure_damage: f32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferPolicy {
    pub id: Option<i64>,
    pub server_id: i64,
    pub item_whitelist: String, // Comma separated list
    pub dino_whitelist: String, // Comma separated list
    pub max_quantity: i32,
    pub enabled: bool,
}

pub struct AdvancedConfigService {
    app_handle: AppHandle,
}

impl AdvancedConfigService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// initialize database tables
    pub fn init_tables(conn: &Connection) -> Result<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS event_configs (
                id INTEGER PRIMARY KEY,
                server_id INTEGER NOT NULL,
                profile_name TEXT NOT NULL,
                harvest_multiplier REAL DEFAULT 1.0,
                stack_size_multiplier REAL DEFAULT 1.0,
                structure_resistance REAL DEFAULT 1.0,
                structure_damage REAL DEFAULT 1.0,
                is_active BOOLEAN DEFAULT 0,
                FOREIGN KEY(server_id) REFERENCES servers(id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS transfer_policies (
                id INTEGER PRIMARY KEY,
                server_id INTEGER NOT NULL,
                item_whitelist TEXT,
                dino_whitelist TEXT,
                max_quantity INTEGER DEFAULT 100,
                enabled BOOLEAN DEFAULT 0,
                FOREIGN KEY(server_id) REFERENCES servers(id)
            )",
            [],
        )?;
        Ok(())
    }

    pub fn get_event_profiles(&self, server_id: i64) -> Result<Vec<EventProfile>, String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare("SELECT id, server_id, profile_name, harvest_multiplier, stack_size_multiplier, structure_resistance, structure_damage, is_active FROM event_configs WHERE server_id = ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([server_id], |row| {
                Ok(EventProfile {
                    id: Some(row.get(0)?),
                    server_id: row.get(1)?,
                    profile_name: row.get(2)?,
                    harvest_multiplier: row.get(3)?,
                    stack_size_multiplier: row.get(4)?,
                    structure_resistance: row.get(5)?,
                    structure_damage: row.get(6)?,
                    is_active: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut profiles = Vec::new();
        for row in rows {
            profiles.push(row.map_err(|e| e.to_string())?);
        }

        Ok(profiles)
    }

    pub fn save_event_profile(&self, profile: EventProfile) -> Result<i64, String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        if let Some(id) = profile.id {
            conn.execute(
                "UPDATE event_configs SET profile_name = ?1, harvest_multiplier = ?2, stack_size_multiplier = ?3, structure_resistance = ?4, structure_damage = ?5, is_active = ?6 WHERE id = ?7",
                params![
                    profile.profile_name,
                    profile.harvest_multiplier,
                    profile.stack_size_multiplier,
                    profile.structure_resistance,
                    profile.structure_damage,
                    profile.is_active,
                    id
                ],
            ).map_err(|e| e.to_string())?;
            Ok(id)
        } else {
            conn.execute(
                "INSERT INTO event_configs (server_id, profile_name, harvest_multiplier, stack_size_multiplier, structure_resistance, structure_damage, is_active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    profile.server_id,
                    profile.profile_name,
                    profile.harvest_multiplier,
                    profile.stack_size_multiplier,
                    profile.structure_resistance,
                    profile.structure_damage,
                    profile.is_active
                ],
            ).map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }

    pub fn activate_profile(&self, server_id: i64, profile_id: Option<i64>) -> Result<(), String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // 1. Deactivate all for this server
        conn.execute(
            "UPDATE event_configs SET is_active = 0 WHERE server_id = ?1",
            [server_id],
        )
        .map_err(|e| e.to_string())?;

        // 2. Activate specific if provided
        if let Some(pid) = profile_id {
            conn.execute(
                "UPDATE event_configs SET is_active = 1 WHERE id = ?1",
                [pid],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn get_active_profile(&self, server_id: i64) -> Result<Option<EventProfile>, String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        Self::get_active_profile_from_conn(&conn, server_id)
    }

    pub fn get_active_profile_from_conn(
        conn: &Connection,
        server_id: i64,
    ) -> Result<Option<EventProfile>, String> {
        let mut stmt = conn
            .prepare("SELECT id, server_id, profile_name, harvest_multiplier, stack_size_multiplier, structure_resistance, structure_damage, is_active FROM event_configs WHERE server_id = ?1 AND is_active = 1")
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query_map([server_id], |row| {
                Ok(EventProfile {
                    id: Some(row.get(0)?),
                    server_id: row.get(1)?,
                    profile_name: row.get(2)?,
                    harvest_multiplier: row.get(3)?,
                    stack_size_multiplier: row.get(4)?,
                    structure_resistance: row.get(5)?,
                    structure_damage: row.get(6)?,
                    is_active: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;

        if let Some(row) = rows.next() {
            Ok(Some(row.map_err(|e| e.to_string())?))
        } else {
            Ok(None)
        }
    }

    // Transfer Policy Methods

    pub fn get_transfer_policy(&self, server_id: i64) -> Result<Option<TransferPolicy>, String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        Self::get_transfer_policy_from_conn(&conn, server_id)
    }

    pub fn get_transfer_policy_from_conn(
        conn: &Connection,
        server_id: i64,
    ) -> Result<Option<TransferPolicy>, String> {
        let mut stmt = conn
            .prepare("SELECT id, server_id, item_whitelist, dino_whitelist, max_quantity, enabled FROM transfer_policies WHERE server_id = ?1")
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query_map([server_id], |row| {
                Ok(TransferPolicy {
                    id: Some(row.get(0)?),
                    server_id: row.get(1)?,
                    item_whitelist: row.get(2).unwrap_or_default(),
                    dino_whitelist: row.get(3).unwrap_or_default(),
                    max_quantity: row.get(4)?,
                    enabled: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        if let Some(row) = rows.next() {
            Ok(Some(row.map_err(|e| e.to_string())?))
        } else {
            Ok(None)
        }
    }

    pub fn save_transfer_policy(&self, policy: TransferPolicy) -> Result<i64, String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        if let Some(id) = policy.id {
            conn.execute(
                "UPDATE transfer_policies SET item_whitelist = ?1, dino_whitelist = ?2, max_quantity = ?3, enabled = ?4 WHERE id = ?5",
                params![
                    policy.item_whitelist,
                    policy.dino_whitelist,
                    policy.max_quantity,
                    policy.enabled,
                    id
                ],
            ).map_err(|e| e.to_string())?;
            Ok(id)
        } else {
            conn.execute(
                "INSERT INTO transfer_policies (server_id, item_whitelist, dino_whitelist, max_quantity, enabled) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    policy.server_id,
                    policy.item_whitelist,
                    policy.dino_whitelist,
                    policy.max_quantity,
                    policy.enabled
                ],
            ).map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }
}
