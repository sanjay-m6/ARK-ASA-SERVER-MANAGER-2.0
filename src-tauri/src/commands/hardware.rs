use tauri::State;
use serde::Serialize;
use crate::AppState;
use crate::models::HardwareAllocation;

#[derive(Serialize)]
pub struct CpuTopology {
    pub logical_cores: usize,
    pub physical_cores: usize,
}

#[tauri::command]
pub fn get_cpu_topology(state: State<'_, AppState>) -> Result<CpuTopology, String> {
    let mut sys = state.sys.lock().map_err(|_| "Sysinfo lock failed".to_string())?;
    sys.refresh_cpu_all();
    
    let logical_cores = sys.cpus().len();
    let physical_cores = sys.physical_core_count().unwrap_or(logical_cores);
    
    Ok(CpuTopology {
        logical_cores,
        physical_cores,
    })
}

#[tauri::command]
pub fn get_hardware_allocation(state: State<'_, AppState>, server_id: i64) -> Result<HardwareAllocation, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT use_all_cores, cpu_affinity, process_priority FROM hardware_allocation WHERE server_id = ?1")
        .map_err(|e| e.to_string())?;
        
    let result = stmt.query_row([server_id], |row| {
        let use_all_cores_int: i32 = row.get(0)?;
        let cpu_affinity: Option<String> = row.get(1)?;
        let process_priority: Option<String> = row.get(2)?;
        
        Ok(HardwareAllocation {
            server_id,
            use_all_cores: use_all_cores_int != 0,
            cpu_affinity: cpu_affinity.unwrap_or_else(|| "[]".to_string()),
            process_priority: process_priority.unwrap_or_else(|| "Normal".to_string()),
        })
    });
    
    match result {
        Ok(alloc) => Ok(alloc),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Return default if not configured yet
            Ok(HardwareAllocation {
                server_id,
                use_all_cores: true,
                cpu_affinity: "[]".to_string(),
                process_priority: "Normal".to_string(),
            })
        },
        Err(e) => Err(e.to_string())
    }
}

#[tauri::command]
pub fn save_hardware_allocation(state: State<'_, AppState>, allocation: HardwareAllocation) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO hardware_allocation (server_id, use_all_cores, cpu_affinity, process_priority) 
         VALUES (?1, ?2, ?3, ?4) 
         ON CONFLICT(server_id) DO UPDATE SET 
         use_all_cores = ?2, cpu_affinity = ?3, process_priority = ?4",
        rusqlite::params![
            allocation.server_id,
            if allocation.use_all_cores { 1 } else { 0 },
            allocation.cpu_affinity,
            allocation.process_priority
        ]
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}
