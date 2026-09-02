use crate::models::{Cluster, ClusterStatus, ServerStatus, ServerStatusInfo};
use crate::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

pub fn get_default_cluster_root() -> String {
    crate::platform::Platform::default_cluster_dir().to_string_lossy().to_string()
}

#[derive(Serialize)]
pub struct DiscoveredClusterFolder {
    pub name: String,
    pub path: String,
    pub exists_in_db: bool,
}

/// Scan cluster root path for existing cluster directories to auto-link
#[tauri::command]
pub async fn scan_existing_clusters(
    state: State<'_, AppState>,
    search_root: Option<String>,
) -> Result<Vec<DiscoveredClusterFolder>, String> {
    let root_path = search_root.unwrap_or_else(get_default_cluster_root);
    let path = std::path::Path::new(&root_path);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let existing_names: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT name FROM clusters").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut discovered = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let folder_name = entry.file_name().to_string_lossy().to_string();
                let folder_path = entry.path().to_string_lossy().replace('\\', "/");
                let exists_in_db = existing_names.contains(&folder_name);
                discovered.push(DiscoveredClusterFolder {
                    name: folder_name,
                    path: folder_path,
                    exists_in_db,
                });
            }
        }
    }
    Ok(discovered)
}

#[tauri::command]
pub async fn create_cluster(
    state: State<'_, AppState>,
    name: String,
    server_ids: Vec<i64>,
    cluster_path: Option<String>,
    cluster_id_string: Option<String>,
    auto_link_existing: Option<bool>,
) -> Result<Cluster, String> {
    println!(
        "🔗 Creating/linking cluster: {} with {} servers",
        name,
        server_ids.len()
    );

    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("Cluster name cannot be empty".to_string());
    }

    let cluster_id_str_val = match cluster_id_string {
        Some(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => Some(trimmed_name.replace(' ', "_")),
    };

    // Check if cluster name matches existing one
    let should_auto_link = auto_link_existing.unwrap_or(false);
    let existing_cluster: Option<(i64, String)> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, cluster_path FROM clusters WHERE name = ?1",
            [&trimmed_name],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok()
    };

    if existing_cluster.is_some() && !should_auto_link {
        return Err(format!("Cluster with name '{}' already exists", trimmed_name));
    }

    // Determine the cluster directory path
    let cluster_dir: String = match &cluster_path {
        Some(p) if !p.trim().is_empty() => {
            // Validate the custom path
            let validation = validate_path(p);
            if !validation.valid {
                return Err(validation.error.unwrap_or_else(|| "Invalid path".to_string()));
            }
            p.trim().replace('\\', "/")
        }
        _ => {
            if let Some((_, ref old_path)) = existing_cluster {
                old_path.clone()
            } else {
                let default_root = get_default_cluster_root();
                let sanitized_name = trimmed_name.replace(' ', "_");
                let target = format!("{}/{}", default_root, sanitized_name);
                // Attempt creating directory; if denied (e.g. root C:\ permission), fallback to user home directory
                if std::fs::create_dir_all(&target).is_err() {
                    let fallback_root = crate::platform::Platform::fallback_cluster_dir();
                    let fallback_path: String = format!("{}/{}", fallback_root.to_string_lossy().replace('\\', "/"), sanitized_name);
                    fallback_path
                } else {
                    target
                }
            }
        }
    };

    let dir_existed_before = std::path::Path::new(&cluster_dir).exists();

    // Create the cluster directory if it doesn't already exist
    if let Err(e) = std::fs::create_dir_all(&cluster_dir) {
        return Err(format!(
            "Failed to create cluster directory '{}': {}. Please specify a writable folder using Browse.",
            cluster_dir, e
        ));
    }

    // Perform DB operations in a transaction
    let cluster_id: i64 = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut conn = db.get_connection().map_err(|e| e.to_string())?;

        // Start transaction
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 1. Insert or update in database
        let server_ids_json = serde_json::to_string(&server_ids)
            .map_err(|e| format!("Failed to serialize server_ids: {}", e))?;

        let cid = if let Some((existing_id, _)) = existing_cluster {
            // Auto-linking: update existing cluster record
            tx.execute(
                "UPDATE clusters SET cluster_path = ?1, server_ids = ?2, cluster_id_string = ?3 WHERE id = ?4",
                rusqlite::params![cluster_dir, server_ids_json, cluster_id_str_val, existing_id],
            ).map_err(|e| format!("Database error (update cluster): {}", e))?;
            existing_id
        } else {
            // New cluster: insert record
            match tx.execute(
                "INSERT INTO clusters (name, cluster_path, server_ids, cluster_id_string) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![trimmed_name, cluster_dir, server_ids_json, cluster_id_str_val],
            ) {
                Ok(_) => tx.last_insert_rowid(),
                Err(e) => {
                    if !dir_existed_before {
                        let _ = std::fs::remove_dir_all(&cluster_dir);
                    }
                    return Err(format!("Database error (insert cluster): {}", e));
                }
            }
        };

        // 2. Link servers to cluster
        for server_id in &server_ids {
            // Insert into cluster_servers junction table
            if let Err(e) = tx.execute(
                "INSERT OR REPLACE INTO cluster_servers (cluster_id, server_id) VALUES (?1, ?2)",
                rusqlite::params![cid, server_id],
            ) {
                if !dir_existed_before && existing_cluster.is_none() {
                    let _ = std::fs::remove_dir_all(&cluster_dir);
                }
                return Err(format!("Database error (link server {}): {}", server_id, e));
            }

            // Set cluster_id on the server
            if let Err(e) = tx.execute(
                "UPDATE servers SET cluster_id = ?1 WHERE id = ?2",
                rusqlite::params![cid, server_id],
            ) {
                if !dir_existed_before && existing_cluster.is_none() {
                    let _ = std::fs::remove_dir_all(&cluster_dir);
                }
                return Err(format!(
                    "Database error (update server {}): {}",
                    server_id, e
                ));
            }

            // Update server's GameUserSettings.ini with ClusterDirOverride
            if let Ok(install_path) = tx.query_row::<String, _, _>(
                "SELECT install_path FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            ) {
                update_cluster_config(&install_path, &cluster_dir);
            }
        }

        // Commit transaction
        if let Err(e) = tx.commit() {
            if !dir_existed_before && existing_cluster.is_none() {
                let _ = std::fs::remove_dir_all(&cluster_dir);
            }
            return Err(format!("Failed to commit transaction: {}", e));
        }

        cid
    };

    let cluster = Cluster {
        id: cluster_id,
        name: trimmed_name,
        cluster_path: PathBuf::from(&cluster_dir),
        server_ids,
        cluster_id_string: cluster_id_str_val,
        created_at: chrono::Local::now().to_rfc3339(),
    };

    println!("  ✅ Cluster created/linked: ID {}", cluster_id);
    Ok(cluster)
}

#[tauri::command]
pub async fn update_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    name: Option<String>,
    new_path: Option<String>,
    cluster_id_string: Option<String>,
    move_data: Option<bool>,
) -> Result<(), String> {
    println!("✏️ Updating cluster: {}", cluster_id);

    // Read current cluster info
    let (current_name, current_path): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT name, cluster_path FROM clusters WHERE id = ?1",
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
                "UPDATE clusters SET name = ?1 WHERE id = ?2",
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

    // Update cluster_id_string if provided
    if let Some(ref new_cid_str) = cluster_id_string {
        let trimmed = new_cid_str.trim();
        if !trimmed.is_empty() {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE clusters SET cluster_id_string = ?1 WHERE id = ?2",
                rusqlite::params![trimmed, cluster_id],
            )
            .map_err(|e| e.to_string())?;
            println!("  🔗 Cluster ID string updated to: '{}'", trimmed);
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
                    "UPDATE clusters SET cluster_path = ?1 WHERE id = ?2",
                    rusqlite::params![normalized, cluster_id],
                )
                .map_err(|e| e.to_string())?;
            }

            // Update ClusterDirOverride in all linked servers
            {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let conn = db.get_connection().map_err(|e| e.to_string())?;
                let mut stmt = conn
                    .prepare(
                        "SELECT s.install_path FROM servers s
                         INNER JOIN cluster_servers cs ON s.id = cs.server_id
                         WHERE cs.cluster_id = ?1",
                    )
                    .map_err(|e| e.to_string())?;

                let paths: Vec<String> = stmt
                    .query_map([cluster_id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();

                for install_path in paths {
                    update_cluster_config(&install_path, &normalized);
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
pub async fn get_clusters(state: State<'_, AppState>) -> Result<Vec<Cluster>, String> {
    println!("📋 Getting all clusters");

    let clusters = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare("SELECT id, name, cluster_path, created_at, cluster_id_string FROM clusters")
            .map_err(|e| e.to_string())?;

        let cluster_iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut clusters = Vec::new();
        for cluster_result in cluster_iter {
            if let Ok((id, name, cluster_path, created_at, cluster_id_string)) = cluster_result {
                // Get linked server IDs
                let server_ids: Vec<i64> = conn
                    .prepare("SELECT server_id FROM cluster_servers WHERE cluster_id = ?1")
                    .map_err(|e| e.to_string())?
                    .query_map([id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();

                clusters.push(Cluster {
                    id,
                    name,
                    cluster_path: PathBuf::from(cluster_path),
                    server_ids,
                    cluster_id_string,
                    created_at,
                });
            }
        }
        clusters
    };

    println!("  Found {} clusters", clusters.len());
    Ok(clusters)
}

#[tauri::command]
pub async fn delete_cluster(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    println!("🗑️ Deleting cluster: {}", cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    // We need a mutable connection for transaction
    let mut conn = db.get_connection().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Clear cluster_id on linked servers
    if let Err(e) = tx.execute(
        "UPDATE servers SET cluster_id = NULL WHERE cluster_id = ?1",
        [cluster_id],
    ) {
        return Err(format!("Failed to unlink servers: {}", e));
    }

    // Remove cluster-server links
    if let Err(e) = tx.execute(
        "DELETE FROM cluster_servers WHERE cluster_id = ?1",
        [cluster_id],
    ) {
        return Err(format!("Failed to remove server links: {}", e));
    }

    // Remove cluster
    match tx.execute("DELETE FROM clusters WHERE id = ?1", [cluster_id]) {
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
pub async fn add_server_to_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    server_id: i64,
) -> Result<(), String> {
    println!("➕ Adding server {} to cluster {}", server_id, cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Add to junction table
    conn.execute(
        "INSERT OR REPLACE INTO cluster_servers (cluster_id, server_id) VALUES (?1, ?2)",
        rusqlite::params![cluster_id, server_id],
    )
    .map_err(|e| e.to_string())?;

    // Update server's cluster_id
    conn.execute(
        "UPDATE servers SET cluster_id = ?1 WHERE id = ?2",
        rusqlite::params![cluster_id, server_id],
    )
    .map_err(|e| e.to_string())?;

    // Update server's GameUserSettings.ini with ClusterDirOverride
    if let Ok((cluster_path, install_path)) = conn.query_row::<(String, String), _, _>(
        "SELECT c.cluster_path, s.install_path FROM clusters c, servers s WHERE c.id = ?1 AND s.id = ?2",
        rusqlite::params![cluster_id, server_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ) {
        update_cluster_config(&install_path, &cluster_path);
    }

    println!("  ✅ Server {} added to cluster {}", server_id, cluster_id);
    Ok(())
}

#[tauri::command]
pub async fn remove_server_from_cluster(
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
        "DELETE FROM cluster_servers WHERE cluster_id = ?1 AND server_id = ?2",
        rusqlite::params![cluster_id, server_id],
    )
    .map_err(|e| e.to_string())?;

    // Clear cluster_id on the server
    conn.execute(
        "UPDATE servers SET cluster_id = NULL WHERE id = ?1 AND cluster_id = ?2",
        rusqlite::params![server_id, cluster_id],
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
pub async fn validate_cluster_path(path: String) -> Result<PathValidation, String> {
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
            // Try to determine if the path looks valid (has a drive letter or is UNC path)
            if cfg!(windows) && !path.contains(':') && !path.starts_with("\\\\") && !path.starts_with("//") {
                return PathValidation {
                    valid: false,
                    error: Some("Path must include a drive letter (e.g. D:\\Clusters) or network share (e.g. \\\\192.168.1.6\\ARKCluster)".to_string()),
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
fn update_cluster_config(install_path: &str, cluster_path: &str) {
    let mut config_path = PathBuf::from(install_path)
        .join("ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini");
        
    if !config_path.exists() {
        config_path = PathBuf::from(install_path)
            .join("ShooterGame/Saved/Config/Windows/GameUserSettings.ini");
    }

    if let Ok(content) = std::fs::read_to_string(&config_path) {
        let cluster_line = format!("ClusterDirOverride={}", cluster_path);

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

/// Get the status of all servers in a cluster
#[tauri::command]
pub async fn get_cluster_status(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<ClusterStatus, String> {
    println!("📊 Getting cluster status for {}", cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Get cluster info
    let cluster_name: String = conn
        .query_row(
            "SELECT name FROM clusters WHERE id = ?1",
            [cluster_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Cluster not found: {}", e))?;

    // Get all servers in this cluster
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.status FROM servers s
             INNER JOIN cluster_servers cs ON s.id = cs.server_id
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
        "  ✅ Cluster has {} servers, {} running",
        status.total_servers, running_servers
    );
    Ok(status)
}

/// Start all servers in a cluster with configurable delay
#[tauri::command]
pub async fn start_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    delay_seconds: Option<u64>,
) -> Result<(), String> {
    let delay = delay_seconds.unwrap_or(15).clamp(1, 300);
    println!("▶️ Starting all servers in cluster {} (delay: {}s)", cluster_id, delay);

    // Get cluster info first
    let (cluster_name, cluster_path): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT name, cluster_path FROM clusters WHERE id = ?1",
            [cluster_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Cluster not found: {}", e))?
    };

    // Get all server info for this cluster
    let servers: Vec<(
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
                 FROM servers s
                 INNER JOIN cluster_servers cs ON s.id = cs.server_id
                 WHERE cs.cluster_id = ?1 AND s.status NOT IN ('running', 'online', 'starting', 'updating', 'restarting')",
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
    ) in servers
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
            "ASA",
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
            Some(&cluster_path),
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
                        "UPDATE servers SET status = 'starting' WHERE id = ?1",
                        [server_id],
                    );
                }
            }
            println!("  ✅ Started server {}", server_id);
        }
        // Configurable delay between starts to prevent CPU/RAM spikes and crashes
        std::thread::sleep(std::time::Duration::from_secs(delay));
    }

    Ok(())
}

/// Stop all servers in a cluster
#[tauri::command]
pub async fn stop_cluster(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    println!("⏹️ Stopping all servers in cluster {}", cluster_id);

    let server_ids: Vec<i64> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT s.id FROM servers s
                 INNER JOIN cluster_servers cs ON s.id = cs.server_id
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
                        "UPDATE servers SET status = 'stopped' WHERE id = ?1",
                        [server_id],
                    );
                }
            }
            println!("  ✅ Stopped server {}", server_id);
        }
    }

    Ok(())
}

/// Restart all servers in a cluster with graceful shutdown and configurable launch delay
#[tauri::command]
pub async fn restart_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    delay_seconds: Option<u64>,
) -> Result<(), String> {
    println!("🔄 Restarting all servers in cluster {}", cluster_id);
    let _ = stop_cluster(state.clone(), cluster_id).await;
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    start_cluster(state, cluster_id, delay_seconds).await
}

/// Toggle cross-server chat for a cluster
/// EXPERIMENTAL FEATURE
#[tauri::command]
pub async fn toggle_cluster_cross_chat(
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
                "SELECT COUNT(*) > 0 FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_enabled'",
                [cluster_id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if exists {
            conn.execute(
                "UPDATE cluster_settings SET value = ?1 WHERE cluster_id = ?2 AND key = 'cross_chat_enabled'",
                rusqlite::params![if enabled { "true" } else { "false" }, cluster_id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO cluster_settings (cluster_id, key, value) VALUES (?1, 'cross_chat_enabled', ?2)",
                rusqlite::params![cluster_id, if enabled { "true" } else { "false" }],
            )
            .map_err(|e| e.to_string())?;
        }
    }

pub fn auto_clean_map_name(map_name: &str) -> String {
    let lower = map_name.to_lowercase();
    if lower.contains("theisland") || lower.contains("island") {
        "Island".to_string()
    } else if lower.contains("scorched") {
        "Scorched Earth".to_string()
    } else if lower.contains("aberration") {
        "Aberration".to_string()
    } else if lower.contains("extinction") {
        "Extinction".to_string()
    } else if lower.contains("blinkingfluid") || lower.contains("genesis") {
        "Genesis".to_string()
    } else if lower.contains("ragnarok") {
        "Ragnarok".to_string()
    } else if lower.contains("valguero") {
        "Valguero".to_string()
    } else if lower.contains("crystalisles") || lower.contains("crystal") {
        "Crystal Isles".to_string()
    } else if lower.contains("center") {
        "The Center".to_string()
    } else if lower.contains("lostisland") {
        "Lost Island".to_string()
    } else if lower.contains("fjordur") {
        "Fjordur".to_string()
    } else if lower.contains("astral") {
        "Astral".to_string()
    } else {
        let clean = map_name.trim_end_matches("_WP").trim_end_matches("_P");
        if clean.is_empty() {
            map_name.to_string()
        } else {
            clean.to_string()
        }
    }
}

    let mode: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_mode'",
            [cluster_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "lacc".to_string())
    };

    if enabled && mode == "native" {
        let servers = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;

            let aliases_json: Option<String> = conn
                .query_row(
                    "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_server_aliases'",
                    [cluster_id],
                    |row| row.get(0),
                )
                .ok();

            let aliases: std::collections::HashMap<String, String> = aliases_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            let mut stmt = conn
                .prepare(
                    "SELECT id, name, install_path, ip_address, rcon_port, admin_password, map_name FROM servers WHERE cluster_id = ?1",
                )
                .map_err(|e| e.to_string())?;

            let rows = stmt
                .query_map([cluster_id], |row| {
                    let server_id: i64 = row.get(0)?;
                    let server_name: String = row.get(1)?;
                    let install_path: String = row.get(2)?;
                    let ip_addr: Option<String> = row.get(3)?;
                    let rcon_port: i64 = row.get(4)?;
                    let rcon_pwd: Option<String> = row.get(5)?;
                    let map_name: String = row.get::<_, Option<String>>(6)?.unwrap_or_default();

                    let custom_alias = aliases.get(&server_id.to_string()).cloned().filter(|s| !s.trim().is_empty());
                    let display_name = custom_alias.or_else(|| {
                        if !map_name.trim().is_empty() {
                            Some(auto_clean_map_name(&map_name))
                        } else {
                            None
                        }
                    });

                    Ok(crate::services::cross_chat::CrossChatServer {
                        server_id,
                        server_name,
                        display_name,
                        install_path,
                        rcon_address: ip_addr.unwrap_or_else(|| "127.0.0.1".to_string()),
                        rcon_port: rcon_port as u16,
                        rcon_password: rcon_pwd.unwrap_or_default(),
                    })
                })
                .map_err(|e| e.to_string())?;

            let list = rows.filter_map(Result::ok).collect::<Vec<_>>();
            list
        };

        if !servers.is_empty() {
            let _ = state.cross_chat.enable_for_cluster(cluster_id, servers.clone()).await;
            state.cross_chat.clone().start_chat_relay(cluster_id, servers).await;
        }
    } else {
        let _ = state.cross_chat.disable_for_cluster(cluster_id).await;
    }

    println!(
        "  ✅ Cross-chat {} (mode: {}) for cluster {}",
        if enabled { "enabled" } else { "disabled" },
        mode,
        cluster_id
    );
    Ok(())
}

/// Get cross-chat status for a cluster
#[tauri::command]
pub async fn get_cluster_cross_chat_status(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let enabled: bool = conn
        .query_row(
            "SELECT value = 'true' FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_enabled'",
            [cluster_id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    Ok(enabled)
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClusterCrossChatConfig {
    pub mode: Option<String>, // "lacc" | "asa_api" | "native"
    pub host: String,
    pub user: String,
    pub pass: String,
    pub db_name: String,
    pub port: i32,
    pub fetch_interval: f32,
    pub debug: bool,
    pub hide_world_save_notifs: Option<bool>,
    pub server_aliases: Option<std::collections::HashMap<String, String>>,
    pub is_plugin_installed: Option<bool>,
    pub is_lacc_installed: Option<bool>,
}

#[tauri::command]
pub async fn get_cluster_cross_chat_config(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<ClusterCrossChatConfig, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mode = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_mode'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .ok();

    let host = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_mysql_host'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "localhost".to_string());

    let user = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_mysql_user'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "root".to_string());

    let pass = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_mysql_pass'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "".to_string());

    let db_name = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_mysql_db'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "test".to_string());

    let port_str = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_mysql_port'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "3306".to_string());
    let port = port_str.parse::<i32>().unwrap_or(3306);

    let fetch_str = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_fetch_interval'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "0.25".to_string());
    let fetch_interval = fetch_str.parse::<f32>().unwrap_or(0.25);

    let debug_str = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_debug'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "false".to_string());
    let debug = debug_str == "true";

    let hide_save_str = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_hide_world_save_notifs'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "true".to_string());
    let hide_world_save_notifs = hide_save_str == "true";

    let aliases_json = conn
        .query_row(
            "SELECT value FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_server_aliases'",
            [cluster_id],
            |row| row.get::<_, String>(0),
        )
        .ok();
    let server_aliases: Option<std::collections::HashMap<String, String>> = aliases_json
        .and_then(|s| serde_json::from_str(&s).ok());

    // Check if plugin is installed in any cluster server
    let mut is_plugin_installed = false;
    let mut is_lacc_installed = false;

    if let Ok(mut stmt) = conn.prepare("SELECT install_path, mods FROM servers WHERE cluster_id = ?1") {
        if let Ok(rows) = stmt.query_map([cluster_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))) {
            for row_res in rows {
                if let Ok((install_path, mods_opt)) = row_res {
                    let plugin_cfg = std::path::PathBuf::from(&install_path)
                        .join("ShooterGame")
                        .join("Binaries")
                        .join("Win64")
                        .join("ArkApi")
                        .join("Plugins")
                        .join("AsaCrossChat")
                        .join("config.json");
                    if plugin_cfg.exists() {
                        is_plugin_installed = true;
                    }

                    if let Some(mods) = mods_opt {
                        if mods.contains("928795") {
                            is_lacc_installed = true;
                        }
                    }
                }
            }
        }
    }

    Ok(ClusterCrossChatConfig {
        mode,
        host,
        user,
        pass,
        db_name,
        port,
        fetch_interval,
        debug,
        hide_world_save_notifs: Some(hide_world_save_notifs),
        server_aliases,
        is_plugin_installed: Some(is_plugin_installed),
        is_lacc_installed: Some(is_lacc_installed),
    })
}

#[tauri::command]
pub async fn save_cluster_cross_chat_config(
    state: State<'_, AppState>,
    cluster_id: i64,
    config: ClusterCrossChatConfig,
) -> Result<(), String> {
    let mode_str = config.mode.unwrap_or_else(|| "lacc".to_string());
    let hide_save_val = config.hide_world_save_notifs.unwrap_or(true).to_string();

    let server_configs = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let settings = vec![
            ("cross_chat_mode", mode_str.clone()),
            ("cross_chat_mysql_host", config.host.clone()),
            ("cross_chat_mysql_user", config.user.clone()),
            ("cross_chat_mysql_pass", config.pass.clone()),
            ("cross_chat_mysql_db", config.db_name.clone()),
            ("cross_chat_mysql_port", config.port.to_string()),
            ("cross_chat_fetch_interval", config.fetch_interval.to_string()),
            ("cross_chat_debug", config.debug.to_string()),
            ("cross_chat_hide_world_save_notifs", hide_save_val),
        ];

        for (key, val) in settings {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM cluster_settings WHERE cluster_id = ?1 AND key = ?2",
                    rusqlite::params![cluster_id, key],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if exists {
                conn.execute(
                    "UPDATE cluster_settings SET value = ?1 WHERE cluster_id = ?2 AND key = ?3",
                    rusqlite::params![val, cluster_id, key],
                )
                .map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "INSERT INTO cluster_settings (cluster_id, key, value) VALUES (?1, ?2, ?3)",
                    rusqlite::params![cluster_id, key, val],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        if let Some(aliases) = &config.server_aliases {
            if let Ok(json_str) = serde_json::to_string(aliases) {
                let exists: bool = conn
                    .query_row(
                        "SELECT COUNT(*) > 0 FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_server_aliases'",
                        rusqlite::params![cluster_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(false);

                if exists {
                    let _ = conn.execute(
                        "UPDATE cluster_settings SET value = ?1 WHERE cluster_id = ?2 AND key = 'cross_chat_server_aliases'",
                        rusqlite::params![json_str, cluster_id],
                    );
                } else {
                    let _ = conn.execute(
                        "INSERT INTO cluster_settings (cluster_id, key, value) VALUES (?1, 'cross_chat_server_aliases', ?2)",
                        rusqlite::params![cluster_id, json_str],
                    );
                }
            }
        }

        let mut stmt = conn
            .prepare("SELECT id, install_path, name FROM servers WHERE cluster_id = ?1")
            .map_err(|e| e.to_string())?;
        let server_rows = stmt
            .query_map([cluster_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for server_row in server_rows {
            if let Ok(row) = server_row {
                list.push(row);
            }
        }
        list
    };

    for (server_id, install_path, _name) in server_configs {
        let install_path_buf = PathBuf::from(install_path);
        let plugin_config_dir = install_path_buf
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ArkApi")
            .join("Plugins")
            .join("AsaCrossChat");

        if !plugin_config_dir.exists() {
            let _ = std::fs::create_dir_all(&plugin_config_dir);
        }

        let config_file_path = plugin_config_dir.join("config.json");
        
        let config_json = serde_json::json!({
            "MySQL": {
                "Host": config.host,
                "User": config.user,
                "Password": config.pass,
                "Database": config.db_name,
                "Port": config.port
            },
            "General": {
                "FetchChatInterval": config.fetch_interval
            },
            "ServerKey": format!("Server{}", server_id)
        });

        if let Ok(config_str) = serde_json::to_string_pretty(&config_json) {
            let _ = std::fs::write(config_file_path, config_str);
        }
    }

    // If switched away from native RCON mode, ensure native background relay is shut down immediately
    if mode_str != "native" {
        let _ = state.cross_chat.disable_for_cluster(cluster_id).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn apply_lacc_mod_to_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<i32, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let lacc_mod_id = "928795";

    // Gather all server IDs associated with this cluster
    let mut target_server_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();

    // 1. Check servers table cluster_id column
    if let Ok(mut stmt) = conn.prepare("SELECT id FROM servers WHERE cluster_id = ?1") {
        if let Ok(rows) = stmt.query_map([cluster_id], |row| row.get::<_, i64>(0)) {
            for id_res in rows {
                if let Ok(id) = id_res {
                    target_server_ids.insert(id);
                }
            }
        }
    }

    // 2. Check cluster_servers junction table
    if let Ok(mut stmt) = conn.prepare("SELECT server_id FROM cluster_servers WHERE cluster_id = ?1") {
        if let Ok(rows) = stmt.query_map([cluster_id], |row| row.get::<_, i64>(0)) {
            for id_res in rows {
                if let Ok(id) = id_res {
                    target_server_ids.insert(id);
                }
            }
        }
    }

    // 3. Check server_ids JSON column in clusters table
    if let Ok(server_ids_json) = conn.query_row::<String, _, _>(
        "SELECT server_ids FROM clusters WHERE id = ?1",
        [cluster_id],
        |row| row.get(0),
    ) {
        if let Ok(parsed_ids) = serde_json::from_str::<Vec<i64>>(&server_ids_json) {
            for id in parsed_ids {
                target_server_ids.insert(id);
            }
        }
    }

    if target_server_ids.is_empty() {
        return Err("No servers are currently linked to this cluster. Add servers to this cluster first!".to_string());
    }

    let mut count = 0;
    for server_id in target_server_ids {
        let current_mods_opt: Option<String> = conn
            .query_row(
                "SELECT mods FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            )
            .ok();

        let current_mods = current_mods_opt.unwrap_or_default();
        let mut mod_list: Vec<String> = current_mods
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if !mod_list.contains(&lacc_mod_id.to_string()) {
            mod_list.push(lacc_mod_id.to_string());
            let updated_mods = mod_list.join(",");
            let _ = conn.execute(
                "UPDATE servers SET mods = ?1 WHERE id = ?2",
                rusqlite::params![updated_mods, server_id],
            );
        }
        count += 1;
    }

    Ok(count)
}

#[tauri::command]
pub async fn install_crosschat_ascended_plugin(
    state: State<'_, AppState>,
    cluster_id: i64,
    config: ClusterCrossChatConfig,
) -> Result<i32, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, install_path, name FROM servers WHERE cluster_id = ?1")
        .map_err(|e| e.to_string())?;

    let server_rows = stmt
        .query_map([cluster_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    for server_row in server_rows {
        if let Ok((server_id, install_path, _name)) = server_row {
            let plugin_config_dir = std::path::PathBuf::from(&install_path)
                .join("ShooterGame")
                .join("Binaries")
                .join("Win64")
                .join("ArkApi")
                .join("Plugins")
                .join("AsaCrossChat");

            let _ = std::fs::create_dir_all(&plugin_config_dir);

            // 1. Write PluginInfo.json
            let info_path = plugin_config_dir.join("PluginInfo.json");
            let info_json = serde_json::json!({
                "FullName": "CrosschatAscended",
                "Description": "Pelayori's 100% Asynchronous Cross-Server Chat plugin with utf8mb4 multi-language support",
                "Version": "1.2.0",
                "MinApiVersion": "1.0",
                "Author": "Pelayori"
            });
            let _ = std::fs::write(&info_path, serde_json::to_string_pretty(&info_json).unwrap_or_default());

            // 2. Write config.json with current MySQL credentials
            let config_path = plugin_config_dir.join("config.json");
            let config_json = serde_json::json!({
                "MySQL": {
                    "Host": config.host,
                    "User": config.user,
                    "Password": config.pass,
                    "Database": config.db_name,
                    "Port": config.port
                },
                "General": {
                    "FetchChatInterval": config.fetch_interval,
                    "EnableUnicode": true,
                    "Charset": "utf8mb4"
                },
                "ServerKey": format!("Server{}", server_id)
            });
            let _ = std::fs::write(&config_path, serde_json::to_string_pretty(&config_json).unwrap_or_default());
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
pub async fn test_mysql_connection(
    host: String,
    port: u16,
) -> Result<bool, String> {
    let addr = format!("{}:{}", host, port);
    match tokio::time::timeout(
        std::time::Duration::from_secs(3),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    {
        Ok(Ok(_)) => Ok(true),
        Ok(Err(e)) => Err(format!("Connection failed on {}: {}", addr, e)),
        Err(_) => Err(format!("Connection timed out reaching {}", addr)),
    }
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
    pub cluster_path: String,
    pub issues: Vec<ClusterValidationIssue>,
}

#[tauri::command]
pub async fn validate_cluster_configuration(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<ClusterValidationResult, String> {
    println!("🧪 Validating cluster configuration for {}", cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Load cluster basic info
    let (cluster_name, raw_cluster_path): (String, String) = conn
        .query_row(
            "SELECT name, cluster_path FROM clusters WHERE id = ?1",
            [cluster_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Cluster with ID {} not found in database: {}", cluster_id, e))?;

    let cluster_path = raw_cluster_path.clone();

    // Load all servers linked to this cluster (including ports & args)
    #[allow(clippy::type_complexity)]
    let servers: Vec<(i64, String, u16, u16, u16, Option<String>, Option<String>)> = {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.name, s.game_port, s.query_port, s.rcon_port, s.custom_args, s.install_path
                 FROM servers s
                 INNER JOIN cluster_servers cs ON s.id = cs.server_id
                 WHERE cs.cluster_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare server validation query: {}", e))?;

        let mut rows = stmt.query([cluster_id]).map_err(|e| format!("Failed to execute server validation query: {}", e))?;
        let mut out = Vec::new();
        while let Ok(Some(row)) = rows.next() {
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

    if servers.is_empty() {
        issues.push(ClusterValidationIssue {
            server_id: 0,
            server_name: cluster_name.clone(),
            level: "warning".to_string(),
            message: "No servers are currently linked to this cluster.".to_string(),
        });
    }

    // 1) Validate cluster path itself (existence + permissions)
    let path_validation = validate_path(&cluster_path);
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
        &servers
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
                && !lowered.contains(&cluster_path.to_lowercase())
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
                        if value.trim().replace('\\', "/") != cluster_path.replace('\\', "/") {
                            issues.push(ClusterValidationIssue {
                                server_id: *server_id,
                                server_name: server_name.clone(),
                                level: "warning".to_string(),
                                message: format!(
                                    "GameUserSettings.ini ClusterDirOverride ({}) does not match cluster path ({})",
                                    value.trim(),
                                    cluster_path
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
        cluster_path,
        issues,
    };

    Ok(result)
}
