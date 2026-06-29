use crate::models::{Cluster, ClusterStatus, ServerStatus, ServerStatusInfo};
use crate::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

const DEFAULT_CLUSTER_ROOT: &str = "C:/ASE_Clusters";

#[tauri::command]
pub async fn create_ase_cluster(
    state: State<'_, AppState>,
    name: String,
    server_ids: Vec<i64>,
    cluster_dir: Option<String>,
) -> Result<Cluster, String> {
    println!(
        "🔗 Creating cluster: {} with {} ase_servers",
        name,
        server_ids.len()
    );

    // Check if cluster name matches existing one
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM ase_clusters WHERE name = ?1)",
                [&name],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if exists {
            return Err(format!("Cluster with name '{}' already exists", name));
        }
    }

    // Determine the cluster directory path
    let cluster_dir = match &cluster_dir {
        Some(p) if !p.trim().is_empty() => {
            // Validate the custom path
            let validation = validate_path(p);
            if !validation.valid {
                return Err(validation.error.unwrap_or("Invalid path".to_string()));
            }
            p.trim().replace('\\', "/")
        }
        _ => format!("{}/{}", DEFAULT_CLUSTER_ROOT, name.replace(' ', "_")),
    };

    // Create the cluster directory
    std::fs::create_dir_all(&cluster_dir)
        .map_err(|e| format!("Failed to create cluster directory: {}", e))?;

    // Perform DB operations in a transaction
    let cluster_id: i64 = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut conn = db.get_connection().map_err(|e| e.to_string())?;

        // Start transaction
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 1. Insert into database
        let cid = match tx.execute(
            "INSERT INTO ase_clusters (name, cluster_dir) VALUES (?1, ?2)",
            rusqlite::params![name, cluster_dir],
        ) {
            Ok(_) => tx.last_insert_rowid(),
            Err(e) => {
                // If DB insert fails, try to cleanup directory
                let _ = std::fs::remove_dir_all(&cluster_dir);
                return Err(format!("Database error (insert cluster): {}", e));
            }
        };

        // 2. Link ase_servers to cluster
        for server_id in &server_ids {
            // Insert into ase_cluster_servers junction table
            if let Err(e) = tx.execute(
                "INSERT OR REPLACE INTO ase_cluster_servers (cluster_id, server_id) VALUES (?1, ?2)",
                rusqlite::params![cid, server_id],
            ) {
                let _ = std::fs::remove_dir_all(&cluster_dir);
                return Err(format!("Database error (link server {}): {}", server_id, e));
            }

            // Set cluster_id on the server
            if let Err(e) = tx.execute(
                "UPDATE ase_servers SET cluster_id = ?1 WHERE id = ?2",
                rusqlite::params![cid, server_id],
            ) {
                let _ = std::fs::remove_dir_all(&cluster_dir);
                return Err(format!(
                    "Database error (update server {}): {}",
                    server_id, e
                ));
            }

            // Update server's GameUserSettings.ini with ClusterDirOverride
            // Note: We can only query inside the transaction or need to fetch paths before?
            // rusqlite transaction allows queries.
            if let Ok(install_path) = tx.query_row::<String, _, _>(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            ) {
                // Side effect outside DB - nice to have, but if it fails we don't rollback DB usually
                // But for consistency we should log it
                update_ase_cluster_config(&install_path, &cluster_dir);
            }
        }

        // Commit transaction
        if let Err(e) = tx.commit() {
            let _ = std::fs::remove_dir_all(&cluster_dir);
            return Err(format!("Failed to commit transaction: {}", e));
        }

        cid
    };

    let cluster = Cluster {
        id: cluster_id,
        name,
        cluster_path: PathBuf::from(&cluster_dir),
        server_ids,
        created_at: chrono::Local::now().to_rfc3339(),
    };

    println!("  ✅ Cluster created: ID {}", cluster_id);
    Ok(cluster)
}

#[tauri::command]
pub async fn update_ase_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    name: Option<String>,
    new_path: Option<String>,
    move_data: Option<bool>,
) -> Result<(), String> {
    println!("✏️ Updating cluster: {}", cluster_id);

    // Read current cluster info
    let (current_name, current_path): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT name, cluster_dir FROM ase_clusters WHERE id = ?1",
            [cluster_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Cluster not found: {}", e))?
    };

    // Update name if provided
    if let Some(ref new_name) = name {
        if !new_name.trim().is_empty() && new_name.trim() != current_name {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE ase_clusters SET name = ?1 WHERE id = ?2",
                rusqlite::params![new_name.trim(), cluster_id],
            )
            .map_err(|e| e.to_string())?;
            println!(
                "  📝 Cluster renamed: '{}' → '{}'",
                current_name,
                new_name.trim()
            );
        }
    }

    // Update path if provided
    if let Some(ref path) = new_path {
        let normalized = path.trim().replace('\\', "/");
        if !normalized.is_empty() && normalized != current_path {
            // Validate new path
            let validation = validate_path(&normalized);
            if !validation.valid {
                return Err(validation.error.unwrap_or("Invalid path".to_string()));
            }

            // Ensure new directory exists
            std::fs::create_dir_all(&normalized)
                .map_err(|e| format!("Failed to create new cluster directory: {}", e))?;

            // Optionally move data from old path to new path
            if move_data.unwrap_or(false) {
                move_cluster_data(&current_path, &normalized)?;
            }

            // Update DB
            {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let conn = db.get_connection().map_err(|e| e.to_string())?;
                conn.execute(
                    "UPDATE ase_clusters SET cluster_dir = ?1 WHERE id = ?2",
                    rusqlite::params![normalized, cluster_id],
                )
                .map_err(|e| e.to_string())?;
            }

            // Update ClusterDirOverride in all linked ase_servers
            {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let conn = db.get_connection().map_err(|e| e.to_string())?;
                let mut stmt = conn
                    .prepare(
                        "SELECT s.install_path FROM ase_servers s
                         INNER JOIN ase_cluster_servers cs ON s.id = cs.server_id
                         WHERE cs.cluster_id = ?1",
                    )
                    .map_err(|e| e.to_string())?;

                let paths: Vec<String> = stmt
                    .query_map([cluster_id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();

                for install_path in paths {
                    update_ase_cluster_config(&install_path, &normalized);
                }
            }

            println!(
                "  📁 Cluster path changed: '{}' → '{}'",
                current_path, normalized
            );
        }
    }

    println!("  ✅ Cluster {} updated", cluster_id);
    Ok(())
}

#[tauri::command]
pub async fn get_ase_clusters(state: State<'_, AppState>) -> Result<Vec<Cluster>, String> {
    println!("📋 Getting all ase_clusters");

    let ase_clusters = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare("SELECT id, name, cluster_dir, created_at FROM ase_clusters")
            .map_err(|e| e.to_string())?;

        let cluster_iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut ase_clusters = Vec::new();
        for cluster_result in cluster_iter {
            if let Ok((id, name, cluster_dir, created_at)) = cluster_result {
                // Get linked server IDs
                let server_ids: Vec<i64> = conn
                    .prepare("SELECT server_id FROM ase_cluster_servers WHERE cluster_id = ?1")
                    .map_err(|e| e.to_string())?
                    .query_map([id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();

                ase_clusters.push(Cluster {
                    id,
                    name,
                    cluster_path: PathBuf::from(cluster_dir),
                    server_ids,
                    created_at,
                });
            }
        }
        ase_clusters
    };

    println!("  Found {} ase_clusters", ase_clusters.len());
    Ok(ase_clusters)
}

#[tauri::command]
pub async fn delete_ase_cluster(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    println!("🗑️ Deleting cluster: {}", cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    // We need a mutable connection for transaction
    let mut conn = db.get_connection().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Clear cluster_id on linked ase_servers (use empty string, not NULL — column is NOT NULL)
    if let Err(e) = tx.execute(
        "UPDATE ase_servers SET cluster_id = '' WHERE cluster_id = ?1",
        [cluster_id.to_string()],
    ) {
        return Err(format!("Failed to unlink ase_servers: {}", e));
    }

    // Remove cluster-server links
    if let Err(e) = tx.execute(
        "DELETE FROM ase_cluster_servers WHERE cluster_id = ?1",
        [cluster_id],
    ) {
        return Err(format!("Failed to remove server links: {}", e));
    }

    // Remove cluster
    match tx.execute("DELETE FROM ase_clusters WHERE id = ?1", [cluster_id]) {
        Ok(0) => return Err("Cluster not found".to_string()),
        Ok(_) => (),
        Err(e) => return Err(format!("Failed to delete cluster record: {}", e)),
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    println!("  ✅ Cluster deleted");
    Ok(())
}

#[tauri::command]
pub async fn add_ase_server_to_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    server_id: i64,
) -> Result<(), String> {
    println!("➕ Adding server {} to cluster {}", server_id, cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Add to junction table
    conn.execute(
        "INSERT OR REPLACE INTO ase_cluster_servers (cluster_id, server_id) VALUES (?1, ?2)",
        rusqlite::params![cluster_id, server_id],
    )
    .map_err(|e| e.to_string())?;

    // Update server's cluster_id
    conn.execute(
        "UPDATE ase_servers SET cluster_id = ?1 WHERE id = ?2",
        rusqlite::params![cluster_id, server_id],
    )
    .map_err(|e| e.to_string())?;

    // Update server's GameUserSettings.ini with ClusterDirOverride
    if let Ok((cluster_dir, install_path)) = conn.query_row::<(String, String), _, _>(
        "SELECT c.cluster_dir, s.install_path FROM ase_clusters c, ase_servers s WHERE c.id = ?1 AND s.id = ?2",
        rusqlite::params![cluster_id, server_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ) {
        update_ase_cluster_config(&install_path, &cluster_dir);
    }

    println!("  ✅ Server {} added to cluster {}", server_id, cluster_id);
    Ok(())
}

#[tauri::command]
pub async fn remove_ase_server_from_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    server_id: i64,
) -> Result<(), String> {
    println!(
        "➖ Removing server {} from cluster {}",
        server_id, cluster_id
    );

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Remove from junction table
    conn.execute(
        "DELETE FROM ase_cluster_servers WHERE cluster_id = ?1 AND server_id = ?2",
        rusqlite::params![cluster_id, server_id],
    )
    .map_err(|e| e.to_string())?;

    // Clear cluster_id on the server (use empty string, not NULL — column is NOT NULL)
    conn.execute(
        "UPDATE ase_servers SET cluster_id = '' WHERE id = ?1 AND cluster_id = ?2",
        rusqlite::params![server_id, cluster_id.to_string()],
    )
    .map_err(|e| e.to_string())?;

    println!(
        "  ✅ Server {} removed from cluster {}",
        server_id, cluster_id
    );
    Ok(())
}

// ── Path Validation ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct PathValidation {
    pub valid: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn validate_cluster_dir(path: String) -> Result<PathValidation, String> {
    Ok(validate_path(&path))
}

fn validate_path(path: &str) -> PathValidation {
    let path = path.trim();
    if path.is_empty() {
        return PathValidation {
            valid: false,
            error: Some("Path cannot be empty".to_string()),
        };
    }

    let p = PathBuf::from(path);

    // Check for obviously invalid / restricted paths
    let normalized = path.replace('\\', "/").to_lowercase();
    let restricted = ["/windows/", "/system32", "/program files/", "/programdata/"];
    for r in &restricted {
        if normalized.contains(r) {
            return PathValidation {
                valid: false,
                error: Some(format!("Cannot use restricted system directory: {}", r)),
            };
        }
    }

    // If path exists, check it's a directory and writable
    if p.exists() {
        if !p.is_dir() {
            return PathValidation {
                valid: false,
                error: Some("Path exists but is not a directory".to_string()),
            };
        }
        // Test write by creating a temp file
        let test_file = p.join(".asm_test_write");
        match std::fs::write(&test_file, "test") {
            Ok(_) => {
                let _ = std::fs::remove_file(&test_file);
            }
            Err(e) => {
                return PathValidation {
                    valid: false,
                    error: Some(format!("Directory is not writable: {}", e)),
                };
            }
        }
    }
    // If path doesn't exist, check that the parent exists or can be created
    else if let Some(parent) = p.parent() {
        if !parent.exists() {
            // Try to determine if the path looks valid (has a drive letter etc)
            if cfg!(windows) && !path.contains(':') {
                return PathValidation {
                    valid: false,
                    error: Some("Path must include a drive letter (e.g. D:\\ase_clusters)".to_string()),
                };
            }
        }
    }

    PathValidation {
        valid: true,
        error: None,
    }
}

// ── Data Migration ─────────────────────────────────────────────────────

fn move_cluster_data(old_path: &str, new_path: &str) -> Result<(), String> {
    let old = PathBuf::from(old_path);
    let new = PathBuf::from(new_path);

    if !old.exists() {
        println!("  ℹ️ Old cluster path does not exist, nothing to move");
        return Ok(());
    }

    // Create destination
    std::fs::create_dir_all(&new).map_err(|e| format!("Failed to create destination: {}", e))?;

    // Copy all files/directories from old to new
    let entries =
        std::fs::read_dir(&old).map_err(|e| format!("Failed to read source directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src = entry.path();
        let dst = new.join(entry.file_name());

        if src.is_dir() {
            copy_dir_recursive(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst).map_err(|e| {
                format!(
                    "Failed to copy file {} → {}: {}",
                    src.display(),
                    dst.display(),
                    e
                )
            })?;
        }
    }

    println!("  📦 Cluster data moved: {} → {}", old_path, new_path);
    Ok(())
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create dir {}: {}", dst.display(), e))?;

    for entry in
        std::fs::read_dir(src).map_err(|e| format!("Failed to read {}: {}", src.display(), e))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let child_src = entry.path();
        let child_dst = dst.join(entry.file_name());

        if child_src.is_dir() {
            copy_dir_recursive(&child_src, &child_dst)?;
        } else {
            std::fs::copy(&child_src, &child_dst).map_err(|e| {
                format!(
                    "Failed to copy {} → {}: {}",
                    child_src.display(),
                    child_dst.display(),
                    e
                )
            })?;
        }
    }
    Ok(())
}

// ── Config Helpers ─────────────────────────────────────────────────────

/// Update GameUserSettings.ini with ClusterDirOverride
fn update_ase_cluster_config(install_path: &str, cluster_dir: &str) {
    let mut config_path = PathBuf::from(install_path)
        .join("ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini");
        
    if !config_path.exists() {
        config_path = PathBuf::from(install_path)
            .join("ShooterGame/Saved/Config/Windows/GameUserSettings.ini");
    }

    if let Ok(content) = std::fs::read_to_string(&config_path) {
        let cluster_line = format!("ClusterDirOverride={}", cluster_dir);

        let new_content = if content.contains("ClusterDirOverride=") {
            content
                .lines()
                .map(|line| {
                    if line.starts_with("ClusterDirOverride=") {
                        cluster_line.as_str()
                    } else {
                        line
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            let mut result = String::new();
            let mut added = false;
            for line in content.lines() {
                result.push_str(line);
                result.push('\n');
                if line.starts_with("[ServerSettings]") && !added {
                    result.push_str(&cluster_line);
                    result.push('\n');
                    added = true;
                }
            }
            result
        };

        let _ = std::fs::write(&config_path, new_content);
        println!("  📝 Updated cluster config for server at {}", install_path);
    }
}

// ── Cluster Status & Operations ────────────────────────────────────────

/// Get the status of all ase_servers in a cluster
#[tauri::command]
pub async fn get_ase_cluster_status(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<ClusterStatus, String> {
    println!("📊 Getting cluster status for {}", cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Get cluster info
    let cluster_name: String = conn
        .query_row(
            "SELECT name FROM ase_clusters WHERE id = ?1",
            [cluster_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Cluster not found: {}", e))?;

    // Get all ase_servers in this cluster
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.status FROM ase_servers s
             INNER JOIN ase_cluster_servers cs ON s.id = cs.server_id
             WHERE cs.cluster_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let server_iter = stmt
        .query_map([cluster_id], |row| {
            let id: i64 = row.get(0)?;
            let name: String = row.get(1)?;
            let status_str: String = row.get(2)?;
            let status = match status_str.as_str() {
                "running" | "online" => ServerStatus::Running,
                "starting" => ServerStatus::Starting,
                "stopped" => ServerStatus::Stopped,
                "crashed" => ServerStatus::Crashed,
                "updating" => ServerStatus::Updating,
                "restarting" => ServerStatus::Restarting,
                _ => ServerStatus::Stopped,
            };
            Ok((id, name, status))
        })
        .map_err(|e| e.to_string())?;

    let mut server_statuses: Vec<ServerStatusInfo> = Vec::new();
    let mut running_servers = 0;
    let total_players = 0;

    for (id, name, status) in server_iter.flatten() {
        if matches!(status, ServerStatus::Running | ServerStatus::Starting) {
            running_servers += 1;
        }
        server_statuses.push(ServerStatusInfo {
            server_id: id,
            server_name: name,
            status,
            player_count: 0,
        });
    }

    let status = ClusterStatus {
        cluster_id,
        cluster_name,
        total_servers: server_statuses.len() as i32,
        running_servers,
        total_players,
        server_statuses,
    };

    println!(
        "  ✅ Cluster has {} ase_servers, {} running",
        status.total_servers, running_servers
    );
    Ok(status)
}

/// Start all ase_servers in a cluster
#[tauri::command]
pub async fn start_ase_cluster(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    println!("▶️ Starting all ase_servers in cluster {}", cluster_id);

    // Get cluster info first
    let (cluster_name, cluster_dir): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT name, cluster_dir FROM ase_clusters WHERE id = ?1",
            [cluster_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Cluster not found: {}", e))?
    };

    // Get all server info for this cluster
    let ase_servers: Vec<(
        i64,
        String,
        String,
        String,
        u16,
        u16,
        u16,
        i32,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        bool,
    )> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.install_path, s.map_name, s.session_name, s.game_port, 
                        s.query_port, s.rcon_port, s.max_players, s.server_password, s.admin_password, s.ip_address, s.custom_args, s.battleye
                 FROM ase_servers s
                 INNER JOIN ase_cluster_servers cs ON s.id = cs.server_id
                 WHERE cs.cluster_id = ?1 AND s.status = 'stopped'",
            )
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        let mut rows = stmt.query([cluster_id]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            result.push((
                row.get::<_, i64>(0).unwrap_or(0),
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, String>(3).unwrap_or_default(),
                row.get::<_, u16>(4).unwrap_or(7777),
                row.get::<_, u16>(5).unwrap_or(27015),
                row.get::<_, u16>(6).unwrap_or(27020),
                row.get::<_, i32>(7).unwrap_or(70),
                row.get::<_, Option<String>>(8).unwrap_or(None),
                row.get::<_, String>(9).unwrap_or_default(),
                row.get::<_, Option<String>>(10).unwrap_or(None),
                row.get::<_, Option<String>>(11).unwrap_or(None),
                row.get::<_, i32>(12).unwrap_or(1) != 0,
            ));
        }
        result
    };

    // Start each server with cluster args
    for (
        server_id,
        install_path,
        map_name,
        session_name,
        game_port,
        query_port,
        rcon_port,
        max_players,
        server_password,
        admin_password,
        ip_address,
        custom_args,
        battleye_enabled,
    ) in ase_servers
    {
        // Get enabled mods for this server
        let enabled_mods: Vec<String> = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;

            let mut stmt = conn.prepare(
                "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
            ).map_err(|e| e.to_string())?;

            let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
            let mut mods = Vec::new();
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                if let Ok(mod_id) = row.get::<_, String>(0) {
                    mods.push(mod_id);
                }
            }
            mods
        };

        if !enabled_mods.is_empty() {
            println!(
                "  🧩 Found {} enabled mods for server {}",
                enabled_mods.len(),
                server_id
            );
        }

        let install_path = PathBuf::from(&install_path);
        let server_password_ref = server_password.as_deref();
        let ip_address_ref = ip_address.as_deref();
        let mods_option = if enabled_mods.is_empty() {
            None
        } else {
            Some(enabled_mods.as_slice())
        };

        if let Err(e) = state.process_manager.start_server(
            server_id,
            "ASE",
            &install_path,
            &map_name,
            &session_name,
            game_port,
            query_port,
            rcon_port,
            max_players,
            server_password_ref,
            &admin_password,
            ip_address_ref,
            Some(&cluster_name),
            Some(&cluster_dir),
            mods_option,
            custom_args.as_deref(),
            battleye_enabled,
        ) {
            println!("  ⚠️ Failed to start server {}: {}", server_id, e);
        } else {
            // Update status in database
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "UPDATE ase_servers SET status = 'starting' WHERE id = ?1",
                        [server_id],
                    );
                }
            }
            println!("  ✅ Started server {}", server_id);
        }
        // Small delay between starts to prevent overwhelming the system
        std::thread::sleep(std::time::Duration::from_secs(5));
    }

    Ok(())
}

/// Stop all ase_servers in a cluster
#[tauri::command]
pub async fn stop_ase_cluster(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    println!("⏹️ Stopping all ase_servers in cluster {}", cluster_id);

    let server_ids: Vec<i64> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT s.id FROM ase_servers s
                 INNER JOIN ase_cluster_servers cs ON s.id = cs.server_id
                 WHERE cs.cluster_id = ?1 AND s.status IN ('running', 'online', 'starting', 'restarting')",
            )
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        let mut rows = stmt.query([cluster_id]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            if let Ok(id) = row.get::<_, i64>(0) {
                result.push(id);
            }
        }
        result
    };

    // Stop each server
    for server_id in server_ids {
        if let Err(e) = state.process_manager.stop_server_with_reason(
            server_id,
            crate::services::process_manager::StopReason::UserAction,
        ) {
            println!("  ⚠️ Failed to stop server {}: {}", server_id, e);
        } else {
            // Update status in database
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "UPDATE ase_servers SET status = 'stopped' WHERE id = ?1",
                        [server_id],
                    );
                }
            }
            println!("  ✅ Stopped server {}", server_id);
        }
    }

    Ok(())
}

/// Toggle cross-server chat for a cluster
/// EXPERIMENTAL FEATURE
#[tauri::command]
pub async fn toggle_ase_cluster_cross_chat(
    state: State<'_, AppState>,
    cluster_id: i64,
    enabled: bool,
) -> Result<(), String> {
    println!(
        "💬 {} cross-chat for cluster {}",
        if enabled { "Enabling" } else { "Disabling" },
        cluster_id
    );

    // Store setting in database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // First check if setting exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM ase_cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_enabled'",
                [cluster_id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if exists {
            conn.execute(
                "UPDATE ase_cluster_settings SET value = ?1 WHERE cluster_id = ?2 AND key = 'cross_chat_enabled'",
                rusqlite::params![if enabled { "true" } else { "false" }, cluster_id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO ase_cluster_settings (cluster_id, key, value) VALUES (?1, 'cross_chat_enabled', ?2)",
                rusqlite::params![cluster_id, if enabled { "true" } else { "false" }],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    println!(
        "  ✅ Cross-chat {} for cluster {}",
        if enabled { "enabled" } else { "disabled" },
        cluster_id
    );
    Ok(())
}

/// Get cross-chat status for a cluster
#[tauri::command]
pub async fn get_ase_cluster_cross_chat_status(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let enabled: bool = conn
        .query_row(
            "SELECT value = 'true' FROM ase_cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_enabled'",
            [cluster_id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    Ok(enabled)
}

// ── Cluster Validation ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ClusterValidationIssue {
    pub server_id: i64,
    pub server_name: String,
    /// "error" | "warning"
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClusterValidationResult {
    pub cluster_id: i64,
    pub cluster_name: String,
    pub cluster_dir: String,
    pub issues: Vec<ClusterValidationIssue>,
}

#[tauri::command]
pub async fn validate_ase_cluster_configuration(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<ClusterValidationResult, String> {
    println!("🧪 Validating cluster configuration for {}", cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Load cluster basic info
    let (cluster_name, raw_cluster_dir): (String, String) = conn
        .query_row(
            "SELECT name, cluster_dir FROM ase_clusters WHERE id = ?1",
            [cluster_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Cluster not found: {}", e))?;

    let cluster_dir = raw_cluster_dir.clone();

    // Load all ase_servers linked to this cluster (including ports & args)
    #[allow(clippy::type_complexity)]
    let ase_servers: Vec<(i64, String, u16, u16, u16, Option<String>, Option<String>)> = {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.name, s.game_port, s.query_port, s.rcon_port, s.custom_args, s.install_path
                 FROM ase_servers s
                 INNER JOIN ase_cluster_servers cs ON s.id = cs.server_id
                 WHERE cs.cluster_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let mut rows = stmt.query([cluster_id]).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            out.push((
                row.get::<_, i64>(0).unwrap_or(0),
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, u16>(2).unwrap_or(7777),
                row.get::<_, u16>(3).unwrap_or(27015),
                row.get::<_, u16>(4).unwrap_or(27020),
                row.get::<_, Option<String>>(5).unwrap_or(None),
                row.get::<_, Option<String>>(6).unwrap_or(None),
            ));
        }
        out
    };

    let mut issues: Vec<ClusterValidationIssue> = Vec::new();

    // 1) Validate cluster path itself (existence + permissions)
    let path_validation = validate_path(&cluster_dir);
    if !path_validation.valid {
        issues.push(ClusterValidationIssue {
            server_id: 0,
            server_name: cluster_name.clone(),
            level: "error".to_string(),
            message: path_validation
                .error
                .unwrap_or_else(|| "Cluster directory is invalid or not writable".to_string()),
        });
    }

    // 2) Port uniqueness within this cluster
    use std::collections::HashMap;
    let mut game_ports: HashMap<u16, i64> = HashMap::new();
    let mut query_ports: HashMap<u16, i64> = HashMap::new();
    let mut rcon_ports: HashMap<u16, i64> = HashMap::new();

    for (server_id, server_name, game_port, query_port, rcon_port, custom_args, install_path) in
        &ase_servers
    {
        // Game port
        if let Some(existing) = game_ports.insert(*game_port, *server_id) {
            issues.push(ClusterValidationIssue {
                server_id: *server_id,
                server_name: server_name.clone(),
                level: "error".to_string(),
                message: format!(
                    "Game Port {} is also used by server ID {} in this cluster",
                    game_port, existing
                ),
            });
        }

        // Query port
        if let Some(existing) = query_ports.insert(*query_port, *server_id) {
            issues.push(ClusterValidationIssue {
                server_id: *server_id,
                server_name: server_name.clone(),
                level: "error".to_string(),
                message: format!(
                    "Query Port {} is also used by server ID {} in this cluster",
                    query_port, existing
                ),
            });
        }

        // RCON port
        if let Some(existing) = rcon_ports.insert(*rcon_port, *server_id) {
            issues.push(ClusterValidationIssue {
                server_id: *server_id,
                server_name: server_name.clone(),
                level: "error".to_string(),
                message: format!(
                    "RCON Port {} is also used by server ID {} in this cluster",
                    rcon_port, existing
                ),
            });
        }

        // 3) Check for custom args overriding cluster flags incorrectly
        if let Some(args) = custom_args {
            let lowered = args.to_lowercase();

            if lowered.contains("-clusterid") && !lowered.contains(&cluster_name.to_lowercase()) {
                issues.push(ClusterValidationIssue {
                    server_id: *server_id,
                    server_name: server_name.clone(),
                    level: "warning".to_string(),
                    message: "Custom launch arguments contain a manual -clusterid that may override the manager's value"
                        .to_string(),
                });
            }

            if lowered.contains("-clusterdiroverride")
                && !lowered.contains(&cluster_dir.to_lowercase())
            {
                issues.push(ClusterValidationIssue {
                    server_id: *server_id,
                    server_name: server_name.clone(),
                    level: "warning".to_string(),
                    message:
                        "Custom launch arguments contain a manual -ClusterDirOverride that may override the manager's value"
                            .to_string(),
                });
            }
        }

        // 4) Ensure GameUserSettings.ini has matching ClusterDirOverride
        if let Some(install_path) = install_path {
            let ini_path = PathBuf::from(install_path)
                .join("ShooterGame")
                .join("Saved")
                .join("Config")
                .join("WindowsServer")
                .join("GameUserSettings.ini");

            if let Ok(content) = std::fs::read_to_string(&ini_path) {
                let mut found = false;
                for line in content.lines() {
                    if let Some(value) = line.strip_prefix("ClusterDirOverride=") {
                        found = true;
                        if value.trim().replace('\\', "/") != cluster_dir.replace('\\', "/") {
                            issues.push(ClusterValidationIssue {
                                server_id: *server_id,
                                server_name: server_name.clone(),
                                level: "warning".to_string(),
                                message: format!(
                                    "GameUserSettings.ini ClusterDirOverride ({}) does not match cluster path ({})",
                                    value.trim(),
                                    cluster_dir
                                ),
                            });
                        }
                        break;
                    }
                }
                if !found {
                    issues.push(ClusterValidationIssue {
                        server_id: *server_id,
                        server_name: server_name.clone(),
                        level: "warning".to_string(),
                        message:
                            "GameUserSettings.ini is missing ClusterDirOverride entry; manager will inject it automatically on cluster changes"
                                .to_string(),
                    });
                }
            } else {
                issues.push(ClusterValidationIssue {
                    server_id: *server_id,
                    server_name: server_name.clone(),
                    level: "warning".to_string(),
                    message: "Could not read GameUserSettings.ini to verify ClusterDirOverride"
                        .to_string(),
                });
            }
        }
    }

    let result = ClusterValidationResult {
        cluster_id,
        cluster_name,
        cluster_dir,
        issues,
    };

    Ok(result)
}




