use tauri::State;
use crate::AppState;
use std::path::PathBuf;
use std::fs;
use std::collections::HashSet;
use chrono::Local;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AsePlayer {
    pub steam_id: String,
    pub epic_id: Option<String>,
    pub player_name: String,
    pub platform: String,
    pub date_added: String,
    pub notes: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsePlayerLists {
    pub admins: Vec<AsePlayer>,
    pub whitelist: Vec<AsePlayer>,
    pub exclusive: Vec<AsePlayer>,
}

fn init_db_table(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ase_players (
            server_id INTEGER NOT NULL,
            steam_id TEXT NOT NULL,
            epic_id TEXT,
            player_name TEXT NOT NULL,
            platform TEXT NOT NULL,
            date_added TEXT NOT NULL,
            notes TEXT,
            is_admin INTEGER DEFAULT 0,
            is_whitelisted INTEGER DEFAULT 0,
            is_exclusive INTEGER DEFAULT 0,
            PRIMARY KEY (server_id, steam_id),
            FOREIGN KEY (server_id) REFERENCES ase_servers (id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to initialize ase_players table: {}", e))?;
    Ok(())
}

fn parse_ids_file(path: &PathBuf) -> HashSet<String> {
    let mut ids = HashSet::new();
    if path.exists() && path.is_file() {
        if let Ok(content) = fs::read_to_string(path) {
            for line in content.lines() {
                let trimmed = line.trim();
                // Validate SteamID64: 17 digits starting with 7656
                if trimmed.len() == 17 && trimmed.chars().all(|c| c.is_ascii_digit()) && trimmed.starts_with("7656") {
                    ids.insert(trimmed.to_string());
                }
            }
        }
    }
    ids
}

fn backup_and_write_file(path: &PathBuf, ids: &HashSet<String>) -> Result<(), String> {
    // Ensure parent dir exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
        }
    }

    // Backup existing file if it exists
    if path.exists() && path.is_file() {
        let mut backup_path = path.clone();
        backup_path.set_extension("txt.bak");
        let _ = fs::copy(path, backup_path);
    }

    // Write new content
    let mut sorted_ids: Vec<&String> = ids.iter().collect();
    sorted_ids.sort();
    let content = sorted_ids
        .iter()
        .map(|id| id.as_str())
        .collect::<Vec<&str>>()
        .join("\n") + "\n";

    fs::write(path, content).map_err(|e| format!("Failed to write player list file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_ase_players(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<AsePlayerLists, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    // Initialize the DB table
    init_db_table(&conn)?;

    // Get server install path
    let install_path: String = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [server_id],
        |row| row.get::<_, String>(0),
    ).map_err(|e| format!("Server not found: {}", e))?;

    let saved_dir = PathBuf::from(&install_path).join("ShooterGame").join("Saved");
    
    let admins_file = saved_dir.join("AllowedCheaterSteamIDs.txt");
    let whitelist_file = saved_dir.join("PlayersExclusiveJoinList.txt");
    let exclusive_file = saved_dir.join("PlayersJoinNoCheckList.txt");

    // Parse IDs from files
    let admin_ids = parse_ids_file(&admins_file);
    let whitelist_ids = parse_ids_file(&whitelist_file);
    let exclusive_ids = parse_ids_file(&exclusive_file);

    // Fetch existing players from database
    let mut stmt = conn.prepare(
        "SELECT steam_id, epic_id, player_name, platform, date_added, notes FROM ase_players WHERE server_id = ?1"
    ).map_err(|e| e.to_string())?;

    let mut db_players = std::collections::HashMap::new();
    let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let steam_id: String = row.get(0).map_err(|e| e.to_string())?;
        let player = AsePlayer {
            steam_id: steam_id.clone(),
            epic_id: row.get(1).map_err(|e| e.to_string())?,
            player_name: row.get(2).map_err(|e| e.to_string())?,
            platform: row.get(3).map_err(|e| e.to_string())?,
            date_added: row.get(4).map_err(|e| e.to_string())?,
            notes: row.get(5).map_err(|e| e.to_string())?,
        };
        db_players.insert(steam_id, player);
    }

    // Helper to get or build player info
    let today = Local::now().format("%Y-%m-%d").to_string();
    let get_player = |steam_id: &str| -> AsePlayer {
        if let Some(p) = db_players.get(steam_id) {
            p.clone()
        } else {
            AsePlayer {
                steam_id: steam_id.to_string(),
                epic_id: None,
                player_name: format!("Player {}", steam_id),
                platform: "Steam".to_string(),
                date_added: today.clone(),
                notes: None,
            }
        }
    };

    let mut admins = Vec::new();
    for id in &admin_ids {
        admins.push(get_player(id));
    }

    let mut whitelist = Vec::new();
    for id in &whitelist_ids {
        whitelist.push(get_player(id));
    }

    let mut exclusive = Vec::new();
    for id in &exclusive_ids {
        exclusive.push(get_player(id));
    }

    Ok(AsePlayerLists {
        admins,
        whitelist,
        exclusive,
    })
}

#[tauri::command]
pub async fn save_ase_players(
    server_id: i64,
    admins: Vec<AsePlayer>,
    whitelist: Vec<AsePlayer>,
    exclusive: Vec<AsePlayer>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut conn = db.get_connection().map_err(|e| e.to_string())?;
    
    // Initialize the DB table
    init_db_table(&conn)?;

    // Get server install path
    let install_path: String = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [server_id],
        |row| row.get::<_, String>(0),
    ).map_err(|e| format!("Server not found: {}", e))?;

    let saved_dir = PathBuf::from(&install_path).join("ShooterGame").join("Saved");
    
    let admins_file = saved_dir.join("AllowedCheaterSteamIDs.txt");
    let whitelist_file = saved_dir.join("PlayersExclusiveJoinList.txt");
    let exclusive_file = saved_dir.join("PlayersJoinNoCheckList.txt");

    // Collect IDs for writing to files
    let mut admin_ids = HashSet::new();
    let mut whitelist_ids = HashSet::new();
    let mut exclusive_ids = HashSet::new();

    // Map to keep track of metadata and flags
    let mut player_map = std::collections::HashMap::new();

    // Fill map and set flags
    for p in admins {
        admin_ids.insert(p.steam_id.clone());
        let entry = player_map.entry(p.steam_id.clone()).or_insert((p.clone(), 0, 0, 0));
        entry.1 = 1; // is_admin
    }
    for p in whitelist {
        whitelist_ids.insert(p.steam_id.clone());
        let entry = player_map.entry(p.steam_id.clone()).or_insert((p.clone(), 0, 0, 0));
        entry.2 = 1; // is_whitelisted
    }
    for p in exclusive {
        exclusive_ids.insert(p.steam_id.clone());
        let entry = player_map.entry(p.steam_id.clone()).or_insert((p.clone(), 0, 0, 0));
        entry.3 = 1; // is_exclusive
    }

    // Write to files
    backup_and_write_file(&admins_file, &admin_ids)?;
    backup_and_write_file(&whitelist_file, &whitelist_ids)?;
    backup_and_write_file(&exclusive_file, &exclusive_ids)?;

    // Start database transaction
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
    
    // Clear role flags for this server
    tx.execute(
        "UPDATE ase_players SET is_admin = 0, is_whitelisted = 0, is_exclusive = 0 WHERE server_id = ?1",
        [server_id],
    ).map_err(|e| format!("Failed to clear player flags: {}", e))?;

    // Upsert each player's metadata and flags
    for (steam_id, (p, is_admin, is_whitelisted, is_exclusive)) in player_map {
        tx.execute(
            "INSERT OR REPLACE INTO ase_players (
                server_id, steam_id, epic_id, player_name, platform, date_added, notes,
                is_admin, is_whitelisted, is_exclusive
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                server_id,
                steam_id,
                p.epic_id,
                p.player_name,
                p.platform,
                p.date_added,
                p.notes,
                is_admin,
                is_whitelisted,
                is_exclusive
            ],
        ).map_err(|e| format!("Failed to upsert player: {}", e))?;
    }

    tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}
