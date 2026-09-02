use rusqlite::{params, Connection};
use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerRecord {
    pub id: i64,
    pub name: String,
    pub server_type: String,
    pub install_path: String,
    pub status: String,
    pub game_port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
    pub max_players: i32,
    pub server_password: Option<String>,
    pub admin_password: String,
    pub map_name: String,
    pub session_name: String,
    pub motd: Option<String>,
    pub mods: Option<String>,
    pub custom_args: Option<String>,
    pub rcon_enabled: bool,
    pub ip_address: Option<String>,
    pub cluster_id: Option<i64>,
    pub auto_start: bool,
    pub auto_stop: bool,
    pub intelligent_mode: bool,
    pub startup_delay: i32,
    pub startup_priority: i32,
    pub auto_restart: bool,
    pub battleye: bool,
    pub api_loader_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerRconCredentials {
    pub ip_address: String,
    pub rcon_port: u16,
    pub admin_password: String,
}

pub struct ServerRepository;

impl ServerRepository {
    pub fn get_by_id(conn: &Connection, id: i64) -> AppResult<Option<ServerRecord>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, server_type, install_path, status, game_port, query_port, rcon_port, \
                    max_players, server_password, admin_password, map_name, session_name, motd, \
                    mods, custom_args, rcon_enabled, ip_address, cluster_id, auto_start, auto_stop, \
                    intelligent_mode, startup_delay, startup_priority, auto_restart, battleye, \
                    api_loader_enabled \
             FROM servers WHERE id = ?1"
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ServerRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                server_type: row.get(2)?,
                install_path: row.get(3)?,
                status: row.get(4)?,
                game_port: row.get::<_, u32>(5)? as u16,
                query_port: row.get::<_, u32>(6)? as u16,
                rcon_port: row.get::<_, u32>(7)? as u16,
                max_players: row.get(8)?,
                server_password: row.get(9)?,
                admin_password: row.get(10)?,
                map_name: row.get(11)?,
                session_name: row.get(12)?,
                motd: row.get(13)?,
                mods: row.get(14)?,
                custom_args: row.get(15)?,
                rcon_enabled: row.get::<_, i32>(16)? != 0,
                ip_address: row.get(17)?,
                cluster_id: row.get(18)?,
                auto_start: row.get::<_, i32>(19)? != 0,
                auto_stop: row.get::<_, i32>(20)? != 0,
                intelligent_mode: row.get::<_, i32>(21)? != 0,
                startup_delay: row.get(22)?,
                startup_priority: row.get(23)?,
                auto_restart: row.get::<_, i32>(24)? != 0,
                battleye: row.get::<_, i32>(25)? != 0,
                api_loader_enabled: row.get::<_, i32>(26)? != 0,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_all_basic(conn: &Connection) -> AppResult<Vec<(i64, String, String)>> {
        let mut stmt = conn.prepare("SELECT id, name, status FROM servers")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    pub fn get_install_path(conn: &Connection, id: i64) -> AppResult<Option<String>> {
        let mut stmt = conn.prepare("SELECT install_path FROM servers WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn get_status(conn: &Connection, id: i64) -> AppResult<Option<String>> {
        let mut stmt = conn.prepare("SELECT status FROM servers WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn update_status(conn: &Connection, id: i64, status: &str) -> AppResult<()> {
        conn.execute(
            "UPDATE servers SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
        Ok(())
    }

    pub fn get_rcon_credentials(conn: &Connection, id: i64) -> AppResult<Option<ServerRconCredentials>> {
        let mut stmt = conn.prepare(
            "SELECT COALESCE(ip_address, '127.0.0.1'), rcon_port, admin_password \
             FROM servers WHERE id = ?1"
        )?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ServerRconCredentials {
                ip_address: row.get(0)?,
                rcon_port: row.get::<_, u32>(1)? as u16,
                admin_password: row.get(2)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_servers_by_cluster_id(conn: &Connection, cluster_id: i64) -> AppResult<Vec<(i64, String)>> {
        let mut stmt = conn.prepare("SELECT id, name FROM servers WHERE cluster_id = ?1")?;
        let rows = stmt.query_map(params![cluster_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }
}
