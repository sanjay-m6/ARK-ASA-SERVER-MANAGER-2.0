use rusqlite::Connection;
use std::path::{Path, PathBuf};

use crate::commands::server::{ini_get, parse_ini};
use crate::services::ini_parser::IniParser;

pub struct IniSyncResult {
    pub updated: bool,
    pub max_players: Option<i32>,
    pub ip_address: Option<String>,
    pub rcon_enabled: Option<bool>,
    pub rcon_port: Option<u16>,
    pub game_port: Option<u16>,
    pub query_port: Option<u16>,
    pub session_name: Option<String>,
}

/// Find the active GameUserSettings.ini path for a given server installation.
pub fn find_server_gus_path(install_path: &Path, server_type: &str) -> Option<PathBuf> {
    let base = install_path.join("ShooterGame").join("Saved").join("Config");

    // Check WindowsServer first (standard for dedicated servers)
    let ws_path = base.join("WindowsServer").join("GameUserSettings.ini");
    if ws_path.exists() {
        return Some(ws_path);
    }

    // Check Windows next (some ASA / Beacon setups use Windows)
    let win_path = base.join("Windows").join("GameUserSettings.ini");
    if win_path.exists() {
        return Some(win_path);
    }

    // Check LinuxServer for Linux installs
    let linux_path = base.join("LinuxServer").join("GameUserSettings.ini");
    if linux_path.exists() {
        return Some(linux_path);
    }

    // Fallback: default to WindowsServer path even if it doesn't exist yet
    if server_type == "ASE" {
        Some(ws_path)
    } else {
        Some(ws_path)
    }
}

/// Inspects GameUserSettings.ini on disk and synchronizes any changed settings
/// (such as MaxPlayers, MultiHome/IPAddress, RCONEnabled, Ports, Passwords) into the SQLite database.
pub fn sync_server_from_ini_if_changed(
    conn: &Connection,
    server_id: i64,
    install_path: &Path,
    server_type: &str,
) -> Result<IniSyncResult, String> {
    let gus_path = match find_server_gus_path(install_path, server_type) {
        Some(p) if p.exists() => p,
        _ => {
            return Ok(IniSyncResult {
                updated: false,
                max_players: None,
                ip_address: None,
                rcon_enabled: None,
                rcon_port: None,
                game_port: None,
                query_port: None,
                session_name: None,
            });
        }
    };

    let content = match IniParser::read_file_to_string(&gus_path) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("[INI Sync] Could not read {:?}: {}", gus_path, e);
            return Ok(IniSyncResult {
                updated: false,
                max_players: None,
                ip_address: None,
                rcon_enabled: None,
                rcon_port: None,
                game_port: None,
                query_port: None,
                session_name: None,
            });
        }
    };

    let sections = parse_ini(&content);

    // 1. MaxPlayers (support [ServerSettings], [/Script/Engine.GameSession], [SessionSettings], [URL])
    let max_players: Option<i32> = ini_get(
        &sections,
        &[
            "ServerSettings",
            "/Script/Engine.GameSession",
            "Engine.GameSession",
            "SessionSettings",
            "URL",
            "/Script/ShooterGame.ShooterGameMode",
        ],
        "MaxPlayers",
    )
    .and_then(|v| v.trim_matches('"').trim_matches('\'').parse::<i32>().ok())
    .filter(|&p| p > 0);

    // 2. Server IP / MultiHome (support [URL] MultiHome, [ServerSettings] MultiHome, IPAddress, ServerIP, ListenIP)
    let ip_address: Option<String> = ini_get(
        &sections,
        &["URL", "ServerSettings", "SessionSettings"],
        "MultiHome",
    )
    .or_else(|| ini_get(&sections, &["ServerSettings", "URL"], "IPAddress"))
    .or_else(|| ini_get(&sections, &["ServerSettings"], "ServerIP"))
    .or_else(|| ini_get(&sections, &["ServerSettings"], "ListenIP"))
    .map(|s| s.trim_matches('"').trim_matches('\'').trim().to_string())
    .filter(|s| {
        !s.is_empty()
            && !s.eq_ignore_ascii_case("true")
            && !s.eq_ignore_ascii_case("false")
            && s != "0.0.0.0"
            && s != "127.0.0.1"
    });

    // 3. RCONEnabled (support [ServerSettings], [/Script/ShooterGame.ShooterGameMode])
    let rcon_enabled: Option<bool> = ini_get(
        &sections,
        &["ServerSettings", "/Script/ShooterGame.ShooterGameMode"],
        "RCONEnabled",
    )
    .map(|v| {
        let vl = v.trim_matches('"').trim_matches('\'').trim().to_lowercase();
        vl == "true" || vl == "1"
    });

    // 4. RCONPort
    let rcon_port: Option<u16> = ini_get(&sections, &["ServerSettings", "URL"], "RCONPort")
        .and_then(|v| v.trim_matches('"').trim_matches('\'').parse::<u16>().ok())
        .filter(|&p| p > 0);

    // 5. Game Port
    let game_port: Option<u16> = ini_get(
        &sections,
        &["URL", "ServerSettings", "SessionSettings"],
        "Port",
    )
    .or_else(|| ini_get(&sections, &["ServerSettings"], "GamePort"))
    .and_then(|v| v.trim_matches('"').trim_matches('\'').parse::<u16>().ok())
    .filter(|&p| p > 0);

    // 6. Query Port
    let query_port: Option<u16> = ini_get(
        &sections,
        &["URL", "ServerSettings", "SessionSettings"],
        "QueryPort",
    )
    .and_then(|v| v.trim_matches('"').trim_matches('\'').parse::<u16>().ok())
    .filter(|&p| p > 0);

    // 7. Session Name
    let session_name: Option<String> = ini_get(
        &sections,
        &["SessionSettings", "ServerSettings"],
        "SessionName",
    )
    .or_else(|| ini_get(&sections, &["ServerSettings"], "ServerName"))
    .map(|s| s.trim_matches('"').trim_matches('\'').trim().to_string())
    .filter(|s| !s.is_empty());

    // 8. Server Password
    let server_password: Option<String> =
        ini_get(&sections, &["ServerSettings"], "ServerPassword")
            .map(|s| s.trim_matches('"').trim_matches('\'').trim().to_string());

    // 9. Admin Password
    let admin_password: Option<String> =
        ini_get(&sections, &["ServerSettings"], "ServerAdminPassword").map(|s| {
            let v = s.trim_matches('"').trim_matches('\'').trim();
            v.split("?ServerPassword=").next().unwrap_or(v).to_string()
        });

    let mut updated = false;

    if server_type != "ASE" {
        // Query existing ASA server values from DB
        let db_row: Result<
            (
                i32,             // 0: max_players
                Option<String>,  // 1: ip_address
                i32,             // 2: rcon_enabled
                u16,             // 3: rcon_port
                u16,             // 4: game_port
                u16,             // 5: query_port
                String,          // 6: session_name
                Option<String>,  // 7: server_password
                String,          // 8: admin_password
            ),
            rusqlite::Error,
        > = conn.query_row(
            "SELECT max_players, ip_address, rcon_enabled, rcon_port, game_port, query_port, session_name, server_password, admin_password FROM servers WHERE id = ?1",
            [server_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            },
        );

        if let Ok((
            db_max_players,
            db_ip_address,
            db_rcon_enabled,
            db_rcon_port,
            db_game_port,
            db_query_port,
            db_session_name,
            db_server_password,
            db_admin_password,
        )) = db_row
        {
            let mut updates = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

            if let Some(mp) = max_players {
                if mp != db_max_players {
                    updates.push("max_players = ?");
                    params.push(Box::new(mp));
                }
            }

            if let Some(ref ip) = ip_address {
                if db_ip_address.as_deref() != Some(ip.as_str()) {
                    updates.push("ip_address = ?");
                    params.push(Box::new(ip.clone()));
                }
            }

            if let Some(re) = rcon_enabled {
                let re_int = if re { 1 } else { 0 };
                if re_int != db_rcon_enabled {
                    updates.push("rcon_enabled = ?");
                    params.push(Box::new(re_int));
                }
            }

            if let Some(rp) = rcon_port {
                if rp != db_rcon_port {
                    updates.push("rcon_port = ?");
                    params.push(Box::new(rp));
                }
            }

            if let Some(gp) = game_port {
                if gp != db_game_port {
                    updates.push("game_port = ?");
                    params.push(Box::new(gp));
                }
            }

            if let Some(qp) = query_port {
                if qp != db_query_port {
                    updates.push("query_port = ?");
                    params.push(Box::new(qp));
                }
            }

            if let Some(ref sn) = session_name {
                if sn != &db_session_name {
                    updates.push("session_name = ?");
                    params.push(Box::new(sn.clone()));
                    updates.push("name = ?");
                    params.push(Box::new(sn.clone()));
                }
            }

            if let Some(ref sp) = server_password {
                if db_server_password.as_deref().unwrap_or("") != sp.as_str() {
                    updates.push("server_password = ?");
                    params.push(Box::new(if sp.is_empty() { None } else { Some(sp.clone()) }));
                }
            }

            if let Some(ref ap) = admin_password {
                if !ap.is_empty() && ap != &db_admin_password {
                    updates.push("admin_password = ?");
                    params.push(Box::new(ap.clone()));
                }
            }

            if !updates.is_empty() {
                let query = format!("UPDATE servers SET {} WHERE id = ?", updates.join(", "));
                params.push(Box::new(server_id));
                let params_refs: Vec<&dyn rusqlite::ToSql> =
                    params.iter().map(|p| p.as_ref()).collect();

                conn.execute(&query, params_refs.as_slice())
                    .map_err(|e| format!("Failed to update database from INI: {}", e))?;

                println!(
                    "🔄 [INI Sync] Synced external config (Beacon/INI) to database for ASA server {}: MaxPlayers={:?}, IP={:?}, RCONEnabled={:?}",
                    server_id, max_players, ip_address, rcon_enabled
                );
                updated = true;
            }
        }
    } else {
        // Query existing ASE server values from DB
        let db_row: Result<
            (
                i32,             // 0: max_players
                u16,             // 1: port
                u16,             // 2: query_port
                u16,             // 3: rcon_port
                String,          // 4: session_name
                String,          // 5: server_password
                String,          // 6: admin_password
            ),
            rusqlite::Error,
        > = conn.query_row(
            "SELECT max_players, port, query_port, rcon_port, session_name, server_password, admin_password FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        );

        if let Ok((
            db_max_players,
            db_port,
            db_query_port,
            db_rcon_port,
            db_session_name,
            db_server_password,
            db_admin_password,
        )) = db_row
        {
            let mut updates = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

            if let Some(mp) = max_players {
                if mp != db_max_players {
                    updates.push("max_players = ?");
                    params.push(Box::new(mp));
                }
            }

            if let Some(gp) = game_port {
                if gp != db_port {
                    updates.push("port = ?");
                    params.push(Box::new(gp));
                }
            }

            if let Some(qp) = query_port {
                if qp != db_query_port {
                    updates.push("query_port = ?");
                    params.push(Box::new(qp));
                }
            }

            if let Some(rp) = rcon_port {
                if rp != db_rcon_port {
                    updates.push("rcon_port = ?");
                    params.push(Box::new(rp));
                }
            }

            if let Some(ref sn) = session_name {
                if sn != &db_session_name {
                    updates.push("session_name = ?");
                    params.push(Box::new(sn.clone()));
                    updates.push("name = ?");
                    params.push(Box::new(sn.clone()));
                }
            }

            if let Some(ref sp) = server_password {
                if &db_server_password != sp {
                    updates.push("server_password = ?");
                    params.push(Box::new(sp.clone()));
                }
            }

            if let Some(ref ap) = admin_password {
                if !ap.is_empty() && ap != &db_admin_password {
                    updates.push("admin_password = ?");
                    params.push(Box::new(ap.clone()));
                }
            }

            if !updates.is_empty() {
                let query = format!("UPDATE ase_servers SET {} WHERE id = ?", updates.join(", "));
                params.push(Box::new(server_id));
                let params_refs: Vec<&dyn rusqlite::ToSql> =
                    params.iter().map(|p| p.as_ref()).collect();

                conn.execute(&query, params_refs.as_slice())
                    .map_err(|e| format!("Failed to update database from INI: {}", e))?;

                println!(
                    "🔄 [INI Sync] Synced external config (Beacon/INI) to database for ASE server {}: MaxPlayers={:?}",
                    server_id, max_players
                );
                updated = true;
            }
        }
    }

    Ok(IniSyncResult {
        updated,
        max_players,
        ip_address,
        rcon_enabled,
        rcon_port,
        game_port,
        query_port,
        session_name,
    })
}
