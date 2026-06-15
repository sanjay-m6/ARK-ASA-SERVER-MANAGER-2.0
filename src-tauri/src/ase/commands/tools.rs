use crate::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;
use igd_next::aio::tokio::search_gateway;
use igd_next::PortMappingProtocol;
use std::net::SocketAddrV4;

// =============================================================================
// ASE ADVANCED TOOLS BACKEND MODULE
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct AsePluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub enabled: bool,
    pub source: String, // "uMod" or "ArkApi"
}

#[derive(Debug, Clone, Serialize)]
pub struct AseTribeLogEntry {
    pub timestamp: String,
    pub day: i32,
    pub event_type: String,
    pub message: String,
    pub raw_line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AseTribeLogResult {
    pub server_name: String,
    pub entries: Vec<AseTribeLogEntry>,
    pub total_parsed: usize,
    pub total_lines: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AseUPnPGatewayInfo {
    pub gateway_address: String,
    pub external_ip: String,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AsePortMappingResult {
    pub port: u16,
    pub protocol: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AseUPnPForwardResult {
    pub gateway: AseUPnPGatewayInfo,
    pub mappings: Vec<AsePortMappingResult>,
    pub all_success: bool,
}

// Helper to get local IP address (best guess)
fn get_local_ip_internal() -> std::net::Ipv4Addr {
    use std::net::UdpSocket;
    
    // 1. Try UDP connection to a public DNS (most reliable for active gateway interface)
    if let Some(ip) = UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .ok()
        .and_then(|addr| match addr {
            std::net::SocketAddr::V4(v4) => Some(*v4.ip()),
            _ => None,
        })
    {
        return ip;
    }

    // 2. Fallback: Use local_ip_address crate to scan active local network adapters
    if let Ok(std::net::IpAddr::V4(v4)) = local_ip_address::local_ip() {
        return v4;
    }

    // 3. Fallback: Default to loopback
    std::net::Ipv4Addr::new(127, 0, 0, 1)
}

// Helper to strip rich color tags from log lines
fn strip_richcolor_tags(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut in_tag = false;

    let skip_prefix = if let Some(pos) = input.find(": ") {
        pos + 2
    } else {
        0
    };

    let trimmed = &input[skip_prefix..];
    let mut tchars = trimmed.chars().peekable();

    while let Some(ch) = tchars.next() {
        if ch == '<' {
            in_tag = true;
            continue;
        }
        if ch == '>' {
            in_tag = false;
            continue;
        }
        if !in_tag {
            result.push(ch);
        }
    }

    result.trim().to_string()
}

// Helper to classify tribe log events
fn classify_tribe_event(message: &str) -> String {
    let lower = message.to_lowercase();

    if lower.contains("tamed") {
        "tamed".to_string()
    } else if lower.contains("was killed") {
        if lower.contains("tribemember") || lower.contains("your") {
            "member_killed".to_string()
        } else {
            "enemy_killed".to_string()
        }
    } else if lower.contains("killed") {
        "killed".to_string()
    } else if lower.contains("destroyed") || lower.contains("was removed") {
        "destroyed".to_string()
    } else if lower.contains("demolished") || lower.contains("auto-decay") {
        "demolished".to_string()
    } else if lower.contains("starved") {
        "starved".to_string()
    } else if lower.contains("claimed") {
        "claimed".to_string()
    } else if lower.contains("added to") || lower.contains("joined") {
        "member_added".to_string()
    } else if lower.contains("removed from") || lower.contains("left") {
        "member_removed".to_string()
    } else if lower.contains("renamed") {
        "tribe_renamed".to_string()
    } else if lower.contains("uploaded") || lower.contains("downloaded") {
        "transfer".to_string()
    } else {
        "other".to_string()
    }
}

// Helper to parse tribe log lines
fn parse_tribe_log_line(line: &str) -> Option<AseTribeLogEntry> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    let day = if line.starts_with("Day ") {
        line.get(4..)
            .and_then(|s| s.split(',').next())
            .and_then(|s| s.trim().parse::<i32>().ok())
            .unwrap_or(0)
    } else {
        0
    };

    let timestamp = line
        .find(", ")
        .and_then(|start| {
            let after = &line[start + 2..];
            after.find(": ").map(|end| after[..end].to_string())
        })
        .unwrap_or_default();

    let message = strip_richcolor_tags(line);
    let event_type = classify_tribe_event(&message);

    Some(AseTribeLogEntry {
        timestamp,
        day,
        event_type,
        message,
        raw_line: line.to_string(),
    })
}

// ─── Tauri Commands ─────────────────────────────────────────────────────────

/// Gets the local IP address of the machine
#[tauri::command]
pub fn get_local_ip() -> Result<String, String> {
    Ok(get_local_ip_internal().to_string())
}

/// Checks if ASE server has ARK Server API or uMod installed
#[tauri::command]
pub async fn check_ase_api_installed(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let base_path = PathBuf::from(&install_path).join("ShooterGame/Binaries/Win64");
    let arkapi_path = base_path.join("ArkApi");
    let oxide_path = base_path.join("oxide");

    Ok(arkapi_path.exists() || oxide_path.exists())
}

/// Retrieves list of installed uMod/Oxide and ArkApi plugins for ASE
#[tauri::command]
pub async fn get_installed_ase_plugins(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<AsePluginInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let base_path = PathBuf::from(&install_path).join("ShooterGame/Binaries/Win64");
    let mut list = Vec::new();

    // 1. Scan ARK Server API Plugins
    let arkapi_dir = base_path.join("ArkApi/Plugins");
    if arkapi_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&arkapi_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    if dir_name.starts_with('.') {
                        continue;
                    }

                    // Look for a DLL or json inside
                    let mut version = "1.0.0".to_string();
                    let mut description = "ARK Server API DLL Plugin".to_string();
                    let mut author = "Unknown".to_string();

                    // Read info.json if exists
                    let info_path = entry.path().join("plugin.json");
                    if info_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&info_path) {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(v) = json.get("version").or_else(|| json.get("Version")) {
                                    version = v.as_str().unwrap_or("1.0.0").to_string();
                                }
                                if let Some(d) = json.get("description").or_else(|| json.get("Description")) {
                                    description = d.as_str().unwrap_or("").to_string();
                                }
                                if let Some(a) = json.get("author").or_else(|| json.get("Author")) {
                                    author = a.as_str().unwrap_or("").to_string();
                                }
                            }
                        }
                    }

                    list.push(AsePluginInfo {
                        id: dir_name.clone(),
                        name: dir_name,
                        version,
                        description,
                        author,
                        enabled: true,
                        source: "ArkApi".to_string(),
                    });
                }
            }
        }
    }

    // 2. Scan uMod/Oxide Plugins
    let oxide_dir = base_path.join("oxide/plugins");
    if oxide_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&oxide_dir) {
            for entry in entries.flatten() {
                if entry.path().is_file() {
                    let filename = entry.file_name().to_string_lossy().to_string();
                    if filename.ends_with(".cs") {
                        let plugin_name = filename.trim_end_matches(".cs").to_string();
                        list.push(AsePluginInfo {
                            id: plugin_name.clone(),
                            name: plugin_name,
                            version: "1.0.0".to_string(),
                            description: "uMod/Oxide C# Plugin".to_string(),
                            author: "Unknown".to_string(),
                            enabled: true,
                            source: "uMod".to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(list)
}

/// Retrieve and parse tribe logs specifically for an ASE server
#[tauri::command]
pub async fn get_ase_tribe_logs(
    state: State<'_, AppState>,
    server_id: i64,
    limit: Option<usize>,
) -> Result<AseTribeLogResult, String> {
    println!("📜 [ASE] Getting tribe logs for server {}", server_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let server_name: String = conn
        .query_row(
            "SELECT session_name FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "ASE Server".to_string());

    let saved_dir = PathBuf::from(&install_path).join("ShooterGame/Saved");
    let logs_dir = saved_dir.join("Logs");
    let tribes_dir = saved_dir.join("SavedArks");

    let mut all_entries = Vec::new();
    let mut total_lines = 0usize;

    let search_dirs = vec![logs_dir.clone(), tribes_dir.clone(), saved_dir.clone()];

    for dir in &search_dirs {
        if !dir.exists() {
            continue;
        }

        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name().unwrap_or_default().to_string_lossy();

                if name.contains("Tribe") && (name.ends_with(".log") || name.ends_with(".txt")) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        for line in content.lines() {
                            total_lines += 1;
                            if let Some(entry) = parse_tribe_log_line(line) {
                                all_entries.push(entry);
                            }
                        }
                    }
                }
            }
        }
    }

    let server_log = logs_dir.join("ShooterGame.log");
    if server_log.exists() {
        if let Ok(content) = std::fs::read_to_string(&server_log) {
            for line in content.lines() {
                if line.contains("TribeLog") || line.contains("Day ") {
                    total_lines += 1;
                    if let Some(entry) = parse_tribe_log_line(line) {
                        all_entries.push(entry);
                    }
                }
            }
        }
    }

    all_entries.sort_by(|a, b| b.day.cmp(&a.day));
    let max = limit.unwrap_or(200);
    let total_parsed = all_entries.len();
    all_entries.truncate(max);

    Ok(AseTribeLogResult {
        server_name,
        entries: all_entries,
        total_parsed,
        total_lines,
    })
}

/// Discover the UPnP gateway for port mapping
#[tauri::command]
pub async fn discover_ase_upnp_gateway() -> Result<AseUPnPGatewayInfo, String> {
    let gateway = search_gateway(Default::default())
        .await
        .map_err(|e| format!("No UPnP gateway found on network: {}", e))?;

    let external_ip = gateway
        .get_external_ip()
        .await
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    Ok(AseUPnPGatewayInfo {
        gateway_address: gateway.addr.to_string(),
        external_ip,
        available: true,
    })
}

/// Forward ports for an ASE server via UPnP
#[tauri::command]
pub async fn forward_ase_server_ports(
    state: State<'_, AppState>,
    server_id: i64,
    lease_duration: Option<u32>,
) -> Result<AseUPnPForwardResult, String> {
    println!("🔌 [ASE] Forwarding ports for server {} via UPnP", server_id);

    let (game_port, query_port, rcon_port, server_name): (i64, i64, i64, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT port, query_port, rcon_port, session_name FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    let gateway = search_gateway(Default::default())
        .await
        .map_err(|e| format!("UPnP gateway not found: {}", e))?;

    let external_ip = gateway
        .get_external_ip()
        .await
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    let local_ip = get_local_ip_internal();
    let lease = lease_duration.unwrap_or(86400);

    let ports_to_forward = vec![
        (game_port as u16, "UDP", format!("ASM-ASE - {} Game", server_name)),
        ((game_port + 1) as u16, "UDP", format!("ASM-ASE - {} Raw", server_name)),
        (query_port as u16, "UDP", format!("ASM-ASE - {} Query", server_name)),
        (rcon_port as u16, "TCP", format!("ASM-ASE - {} RCON", server_name)),
    ];

    let mut mappings = Vec::new();
    let mut all_success = true;

    for (port, proto, desc) in &ports_to_forward {
        let protocol = match *proto {
            "TCP" => PortMappingProtocol::TCP,
            _ => PortMappingProtocol::UDP,
        };

        let local_addr = std::net::SocketAddr::V4(SocketAddrV4::new(local_ip, *port));
        let result = gateway
            .add_port(protocol, *port, local_addr, lease, desc)
            .await;

        match result {
            Ok(()) => {
                mappings.push(AsePortMappingResult {
                    port: *port,
                    protocol: proto.to_string(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                all_success = false;
                mappings.push(AsePortMappingResult {
                    port: *port,
                    protocol: proto.to_string(),
                    success: false,
                    error: Some(format!("{}", e)),
                });
            }
        }
    }

    Ok(AseUPnPForwardResult {
        gateway: AseUPnPGatewayInfo {
            gateway_address: gateway.addr.to_string(),
            external_ip,
            available: true,
        },
        mappings,
        all_success,
    })
}

/// Remove UPnP port mappings for an ASE server
#[tauri::command]
pub async fn remove_ase_server_port_forwards(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<AsePortMappingResult>, String> {
    println!("🔌 [ASE] Removing UPnP port forwards for server {}", server_id);

    let (game_port, query_port, rcon_port): (i64, i64, i64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT port, query_port, rcon_port FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    let gateway = search_gateway(Default::default())
        .await
        .map_err(|e| format!("UPnP gateway not found: {}", e))?;

    let ports_to_remove = vec![
        (game_port as u16, "UDP"),
        ((game_port + 1) as u16, "UDP"),
        (query_port as u16, "UDP"),
        (rcon_port as u16, "TCP"),
    ];

    let mut results = Vec::new();

    for (port, proto) in &ports_to_remove {
        let protocol = match *proto {
            "TCP" => PortMappingProtocol::TCP,
            _ => PortMappingProtocol::UDP,
        };

        match gateway.remove_port(protocol, *port).await {
            Ok(()) => {
                results.push(AsePortMappingResult {
                    port: *port,
                    protocol: proto.to_string(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                results.push(AsePortMappingResult {
                    port: *port,
                    protocol: proto.to_string(),
                    success: false,
                    error: Some(format!("{}", e)),
                });
            }
        }
    }

    Ok(results)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortStatus {
    pub name: String,
    pub port: u16,
    pub protocol: String,
    pub is_bound: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFileStatus {
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub size_bytes: u64,
    pub md5_hash: String,
    pub validation_issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModHealthStatus {
    pub workshop_id: String,
    pub name: String,
    pub is_installed: bool,
    pub is_valid: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResources {
    pub total_memory_gb: u64,
    pub free_memory_gb: u64,
    pub cpu_usage_pct: f32,
    pub disk_free_space_gb: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AseDiagnosticsReport {
    pub server_id: i64,
    pub server_name: String,
    pub status: String,
    pub process_id: Option<u32>,
    pub is_process_running: bool,
    pub local_ip: String,
    pub public_ip: String,
    pub ports: Vec<PortStatus>,
    pub config_files: Vec<ConfigFileStatus>,
    pub mods: Vec<ModHealthStatus>,
    pub system_resources: SystemResources,
}

#[tauri::command]
pub async fn generate_diagnostics_report(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<AseDiagnosticsReport, String> {
    use sha2::{Sha256, Digest};
    use sysinfo::Disks;

    println!("[INFO] [ASE Diagnostics] Generating diagnostics report for server {}", server_id);

    // 1. IP Addresses (Fetch public IP BEFORE acquiring DB connection locks to keep future Send)
    let local_ip = get_local_ip_internal().to_string();
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(1))
        .build()
        .ok();
        
    let public_ip = if let Some(ref c) = client {
        match c.get("https://api.ipify.org").send().await {
            Ok(resp) => resp.text().await.unwrap_or_else(|_| "Unknown".to_string()),
            Err(_) => "Unknown".to_string(),
        }
    } else {
        "Unknown".to_string()
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let (server_name, install_path, port, query_port, rcon_port, current_status, process_id) = conn
        .query_row(
            "SELECT name, install_path, port, query_port, rcon_port, status, process_id FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u16>(2)?,
                    row.get::<_, u16>(3)?,
                    row.get::<_, u16>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<u32>>(6)?,
                ))
            },
        )
        .map_err(|e| format!("Server not found in database: {}", e))?;

    // 2. Process Status
    let mut is_process_running = false;
    if let Some(pid) = process_id {
        if let Ok(mut sys) = state.sys.lock() {
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            is_process_running = sys.process(sysinfo::Pid::from_u32(pid)).is_some();
        }
    }

    // 3. Port Bindings
    let check_port_bound_udp = |p: u16| -> bool {
        std::net::UdpSocket::bind(("0.0.0.0", p)).is_err()
    };
    let check_port_bound_tcp = |p: u16| -> bool {
        std::net::TcpListener::bind(("0.0.0.0", p)).is_err()
    };

    let ports = vec![
        PortStatus {
            name: "Game Port".to_string(),
            port,
            protocol: "UDP".to_string(),
            is_bound: check_port_bound_udp(port),
            error: None,
        },
        PortStatus {
            name: "Peer Port (RawPort)".to_string(),
            port: port + 1,
            protocol: "UDP".to_string(),
            is_bound: check_port_bound_udp(port + 1),
            error: None,
        },
        PortStatus {
            name: "Query Port".to_string(),
            port: query_port,
            protocol: "UDP".to_string(),
            is_bound: check_port_bound_udp(query_port),
            error: None,
        },
        PortStatus {
            name: "RCON Port".to_string(),
            port: rcon_port,
            protocol: "TCP".to_string(),
            is_bound: check_port_bound_tcp(rcon_port),
            error: None,
        },
    ];

    // 4. Config Files Status
    let config_dir = PathBuf::from(&install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer");
        
    let gus_path = config_dir.join("GameUserSettings.ini");
    let game_ini_path = config_dir.join("Game.ini");

    let compute_hash = |p: &std::path::Path| -> String {
        if let Ok(data) = std::fs::read(p) {
            let mut hasher = Sha256::new();
            hasher.update(&data);
            let result = hasher.finalize();
            result.iter().map(|b| format!("{:02x}", b)).collect::<String>()
        } else {
            "N/A".to_string()
        }
    };

    let validate_file_simple = |p: &std::path::Path| -> Vec<String> {
        let mut issues = Vec::new();
        if p.exists() {
            if let Ok(content) = std::fs::read_to_string(p) {
                for (idx, line) in content.lines().enumerate() {
                    let open_parens = line.chars().filter(|&c| c == '(').count();
                    let close_parens = line.chars().filter(|&c| c == ')').count();
                    if open_parens != close_parens {
                        issues.push(format!("Line {}: Unbalanced parentheses", idx + 1));
                    }
                    let quotes = line.chars().filter(|&c| c == '"').count();
                    if quotes % 2 != 0 {
                        issues.push(format!("Line {}: Unbalanced quotes", idx + 1));
                    }
                }
            }
        }
        issues
    };

    let mut config_files = Vec::new();
    
    let gus_exists = gus_path.exists();
    let gus_size = if gus_exists {
        std::fs::metadata(&gus_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    config_files.push(ConfigFileStatus {
        name: "GameUserSettings.ini".to_string(),
        path: gus_path.to_string_lossy().to_string(),
        exists: gus_exists,
        size_bytes: gus_size,
        md5_hash: compute_hash(&gus_path),
        validation_issues: validate_file_simple(&gus_path),
    });

    let game_exists = game_ini_path.exists();
    let game_size = if game_exists {
        std::fs::metadata(&game_ini_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    config_files.push(ConfigFileStatus {
        name: "Game.ini".to_string(),
        path: game_ini_path.to_string_lossy().to_string(),
        exists: game_exists,
        size_bytes: game_size,
        md5_hash: compute_hash(&game_ini_path),
        validation_issues: validate_file_simple(&game_ini_path),
    });

    // 5. Mods Status
    let mut mods = Vec::new();
    let mut stmt = conn
        .prepare("SELECT workshop_id, name FROM ase_mods WHERE server_id = ?1")
        .map_err(|e| e.to_string())?;
        
    let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
    
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let workshop_id: String = row.get(0).map_err(|e| e.to_string())?;
        let mod_name: String = row.get(1).map_err(|e| e.to_string())?;
        
        let mods_dir = PathBuf::from(&install_path).join("ShooterGame").join("Content").join("Mods");
        let mod_file = mods_dir.join(format!("{}.mod", workshop_id));
        let mod_folder = mods_dir.join(&workshop_id);
        
        let mut errors = Vec::new();
        let is_installed = mod_file.exists() && mod_folder.exists();
        
        if !mod_file.exists() {
            errors.push(format!("Missing .mod file"));
        }
        if !mod_folder.exists() {
            errors.push(format!("Missing mod assets directory"));
        } else if mod_folder.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&mod_folder) {
                if entries.count() == 0 {
                    errors.push(format!("Mod folder is empty"));
                }
            }
        }

        mods.push(ModHealthStatus {
            workshop_id,
            name: mod_name,
            is_installed,
            is_valid: errors.is_empty(),
            errors,
        });
    }

    // 6. System Resources
    let (cpu_usage_pct, ram_total, ram_free) = {
        if let Ok(mut sys) = state.sys.lock() {
            sys.refresh_cpu_all();
            sys.refresh_memory();
            let cpus = sys.cpus();
            let cpu = if cpus.is_empty() {
                sys.global_cpu_usage()
            } else {
                let total: f32 = cpus.iter().map(|c| c.cpu_usage()).sum();
                total / cpus.len() as f32
            };
            (
                cpu,
                sys.total_memory() / (1024 * 1024 * 1024),
                sys.free_memory() / (1024 * 1024 * 1024),
            )
        } else {
            (0.0, 0, 0)
        }
    };

    let disks = Disks::new_with_refreshed_list();
    let mut disk_free_space_gb = 0;
    let install_path_buf = PathBuf::from(&install_path);
    if let Some(component) = install_path_buf.components().next() {
        let install_drive = component.as_os_str().to_string_lossy().to_string().to_lowercase();
        for disk in disks.list() {
            let mount_point = disk.mount_point().to_string_lossy().to_string().to_lowercase();
            if mount_point.starts_with(&install_drive) || install_drive.starts_with(&mount_point) {
                disk_free_space_gb = disk.available_space() / (1024 * 1024 * 1024);
                break;
            }
        }
    }

    Ok(AseDiagnosticsReport {
        server_id,
        server_name,
        status: current_status,
        process_id,
        is_process_running,
        local_ip,
        public_ip,
        ports,
        config_files,
        mods,
        system_resources: SystemResources {
            total_memory_gb: ram_total,
            free_memory_gb: ram_free,
            cpu_usage_pct,
            disk_free_space_gb,
        },
    })
}
