use crate::ase::models::AseCluster;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn create_ase_cluster(name: String, cluster_dir: String, state: State<'_, AppState>) -> Result<AseCluster, String> {
    // Create cluster directory on disk
    let dir = std::path::PathBuf::from(&cluster_dir);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create cluster directory: {}", e))?;
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO ase_clusters (name, cluster_dir, created_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![name, cluster_dir, now],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(AseCluster {
        id,
        name,
        cluster_dir,
        server_ids: vec![],
        allow_transfer_survivors: true,
        allow_transfer_items: true,
        allow_transfer_dinos: true,
        created_at: now,
    })
}

#[tauri::command]
pub async fn get_ase_clusters(state: State<'_, AppState>) -> Result<Vec<AseCluster>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Try to query the clusters table — if it doesn't exist yet, return empty
    let mut stmt = match conn.prepare(
        "SELECT id, name, cluster_dir, created_at FROM ase_clusters ORDER BY name"
    ) {
        Ok(s) => s,
        Err(_) => return Ok(vec![]),
    };

    let mut clusters = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let cluster_id: i64 = row.get(0).map_err(|e| e.to_string())?;

        // Get associated server IDs
        let server_ids: Vec<i64> = match conn.prepare(
            "SELECT id FROM ase_servers WHERE cluster_id = ?1"
        ) {
            Ok(mut s) => {
                let mut ids = Vec::new();
                let mut r = s.query(rusqlite::params![cluster_id.to_string()]).map_err(|e| e.to_string())?;
                while let Some(sr) = r.next().map_err(|e| e.to_string())? {
                    ids.push(sr.get(0).map_err(|e| e.to_string())?);
                }
                ids
            }
            Err(_) => vec![],
        };

        clusters.push(AseCluster {
            id: cluster_id,
            name: row.get(1).map_err(|e| e.to_string())?,
            cluster_dir: row.get(2).map_err(|e| e.to_string())?,
            server_ids,
            allow_transfer_survivors: true,
            allow_transfer_items: true,
            allow_transfer_dinos: true,
            created_at: row.get(3).map_err(|e| e.to_string())?,
        });
    }

    Ok(clusters)
}

#[tauri::command]
pub async fn add_server_to_ase_cluster(
    server_id: i64, cluster_id: i64, state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Get cluster info
    let cluster_dir: String = conn.query_row(
        "SELECT cluster_dir FROM ase_clusters WHERE id = ?1",
        [cluster_id], |row| row.get(0),
    ).map_err(|e| format!("Cluster not found: {}", e))?;

    let cluster_name: String = conn.query_row(
        "SELECT name FROM ase_clusters WHERE id = ?1",
        [cluster_id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Update server's cluster_id and extra_args to include cluster flags
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE ase_servers SET cluster_id = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![cluster_id.to_string(), now, server_id],
    ).map_err(|e| e.to_string())?;

    // Add cluster args to extra_args (if not already present)
    let current_args: String = conn.query_row(
        "SELECT extra_args FROM ase_servers WHERE id = ?1",
        [server_id], |row| row.get(0),
    ).unwrap_or_default();

    let mut args = current_args;
    if !args.contains("-clusterid=") {
        args.push_str(&format!(" -clusterid={}", cluster_name));
    }
    if !args.contains("-ClusterDirOverride=") {
        args.push_str(&format!(" -ClusterDirOverride=\"{}\"", cluster_dir));
    }

    conn.execute(
        "UPDATE ase_servers SET extra_args = ?1 WHERE id = ?2",
        rusqlite::params![args.trim(), server_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
