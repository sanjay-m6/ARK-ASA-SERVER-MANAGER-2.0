use crate::AppState;
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::process::Command;
use tauri::State;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Status of firewall rules for a specific port
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PortStatus {
    Open,
    Closed,
    Unknown,
}

/// Firewall status for a single server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFirewallStatus {
    pub server_id: i64,
    pub server_name: String,
    pub game_port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
    pub rcon_enabled: bool,
    pub game_port_status: PortStatus,
    pub query_port_status: PortStatus,
    pub rcon_port_status: PortStatus,
}

/// Result of a firewall operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallOperationResult {
    pub success: bool,
    pub message: String,
    pub requires_admin: bool,
}

/// Helper struct for parsing PowerShell JSON output
#[derive(Debug, Deserialize)]
struct FirewallRuleData {
    #[serde(alias = "LocalPort")]
    local_port: serde_json::Value,
    #[serde(alias = "Protocol")]
    protocol: String,
}

/// Fetch all relevant firewall rules (filtered for ARK to avoid hanging)
fn fetch_all_firewall_rules() -> std::collections::HashSet<(u16, String)> {
    // Filter by DisplayName wildcard to reduce overhead significantly
    let script = "Get-NetFirewallRule -DisplayName 'ARK Server*' -Enabled True -Direction Inbound -Action Allow | Get-NetFirewallPortFilter | Select-Object LocalPort, Protocol | ConvertTo-Json -Compress";

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    let mut rules_set = std::collections::HashSet::new();

    if let Ok(result) = output {
        if result.status.success() {
            let stdout = String::from_utf8_lossy(&result.stdout);

            // Handle single object vs array vs empty
            if let Ok(rules) = serde_json::from_str::<Vec<FirewallRuleData>>(&stdout) {
                for rule in rules {
                    let port_val = match &rule.local_port {
                        serde_json::Value::String(s) => s.parse::<u16>().ok(),
                        serde_json::Value::Number(n) => n.as_u64().map(|v| v as u16),
                        _ => None,
                    };

                    if let Some(port) = port_val {
                        rules_set.insert((port, rule.protocol.to_uppercase()));
                    }
                }
            } else if let Ok(rule) = serde_json::from_str::<FirewallRuleData>(&stdout) {
                // Single object case
                let port_val = match &rule.local_port {
                    serde_json::Value::String(s) => s.parse::<u16>().ok(),
                    serde_json::Value::Number(n) => n.as_u64().map(|v| v as u16),
                    _ => None,
                };

                if let Some(port) = port_val {
                    rules_set.insert((port, rule.protocol.to_uppercase()));
                }
            }
        }
    }

    rules_set
}

/// Check if a firewall rule exists for a specific port using the cache
fn check_port_in_cache(
    cache: &std::collections::HashSet<(u16, String)>,
    port: u16,
    protocol: &str,
) -> PortStatus {
    if cache.contains(&(port, protocol.to_uppercase())) {
        PortStatus::Open
    } else {
        PortStatus::Closed
    }
}

/// Check if a firewall rule exists for a specific port (Legacy - rarely used now)
fn check_port_rule_exists(port: u16, protocol: &str) -> PortStatus {
    // Re-use the batch fetch for consistency, or keep independent if needed.
    // For now, let's just do a quick single check to avoid breaking existing single-calls
    let script = format!(
        "Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow | Get-NetFirewallPortFilter | Where-Object {{ $_.LocalPort -eq '{}' -and $_.Protocol -eq '{}' }} | Measure-Object | Select-Object -ExpandProperty Count",
        port, protocol
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(result) => {
            let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
            match stdout.parse::<i32>() {
                Ok(count) if count > 0 => PortStatus::Open,
                Ok(_) => PortStatus::Closed,
                Err(_) => PortStatus::Unknown,
            }
        }
        Err(_) => PortStatus::Unknown,
    }
}

/// Create a firewall rule for a specific port (non-elevated, for compatibility)
#[allow(dead_code)]
fn create_firewall_rule(port: u16, protocol: &str, rule_name: &str) -> Result<(), String> {
    let script = format!(
        r#"
        $ruleName = "{}"
        $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        if ($existingRule) {{
            Write-Output "Rule already exists"
        }} else {{
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort {} -Protocol {} -Action Allow -Profile Any | Out-Null
            Write-Output "Rule created"
        }}
        "#,
        rule_name, port, protocol
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("Access is denied") || stderr.contains("requires elevation") {
            Err("Administrator privileges required".to_string())
        } else {
            Err(format!("Failed to create rule: {}", stderr))
        }
    }
}

/// Remove a firewall rule by name (non-elevated)
#[allow(dead_code)]
fn remove_firewall_rule(rule_name: &str) -> Result<(), String> {
    let script = format!(
        r#"Remove-NetFirewallRule -DisplayName "{}" -ErrorAction SilentlyContinue"#,
        rule_name
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("Access is denied") || stderr.contains("requires elevation") {
            Err("Administrator privileges required".to_string())
        } else {
            Err(format!("Failed to remove rule: {}", stderr))
        }
    }
}

/// Create multiple firewall rules with elevation (prompts UAC once)
fn create_firewall_rules_elevated(rules: Vec<(u16, &str, String)>) -> Result<(), String> {
    if rules.is_empty() {
        return Ok(());
    }

    // Build a PowerShell script that creates all rules
    let mut script_parts = Vec::new();
    for (port, protocol, rule_name) in &rules {
        script_parts.push(format!(
            r#"$ruleName = '{}'
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {{
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort {} -Protocol {} -Action Allow -Profile Any | Out-Null
    Write-Host "Created: $ruleName"
}} else {{
    Write-Host "Exists: $ruleName"
}}"#,
            rule_name, port, protocol
        ));
    }
    let combined_script = script_parts.join("\n");

    // Write script to temp file
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("ark_firewall_rules.ps1");
    std::fs::write(&script_path, &combined_script)
        .map_err(|e| format!("Failed to write temp script: {}", e))?;

    // Use Start-Process with -Verb RunAs to get elevation
    let launcher_script = format!(
        r#"Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '{}'"#,
        script_path.to_string_lossy().replace('\\', "\\\\")
    );

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &launcher_script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&script_path);

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.is_empty() {
            Ok(()) // UAC was shown but no error
        } else {
            Err(format!("Failed to create rules: {}", stderr))
        }
    }
}

/// Remove multiple firewall rules with elevation (prompts UAC once)
fn remove_firewall_rules_elevated(rule_names: Vec<String>) -> Result<(), String> {
    if rule_names.is_empty() {
        return Ok(());
    }

    // Build a PowerShell script that removes all rules
    let mut script_parts = Vec::new();
    for rule_name in &rule_names {
        script_parts.push(format!(
            r#"Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue
Write-Host 'Removed: {}'"#,
            rule_name, rule_name
        ));
    }
    let combined_script = script_parts.join("\n");

    // Write script to temp file
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("ark_firewall_rules.ps1");
    std::fs::write(&script_path, &combined_script)
        .map_err(|e| format!("Failed to write temp script: {}", e))?;

    // Use Start-Process with -Verb RunAs to get elevation
    let launcher_script = format!(
        r#"Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '{}'"#,
        script_path.to_string_lossy().replace('\\', "\\\\")
    );

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &launcher_script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&script_path);

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.is_empty() {
            Ok(()) // UAC was shown but no error
        } else {
            Err(format!("Failed to remove rules: {}", stderr))
        }
    }
}

/// Helper struct for server data
struct ServerData {
    id: i64,
    name: String,
    game_port: u16,
    query_port: u16,
    rcon_port: u16,
    rcon_enabled: bool,
}

/// Get all servers from database
fn get_servers_from_db(state: &State<'_, AppState>) -> Result<Vec<ServerData>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, game_port, query_port, rcon_port, rcon_enabled FROM servers")
        .map_err(|e| e.to_string())?;

    let mut servers = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let rcon_enabled: i32 = row.get(5).unwrap_or(1);
        servers.push(ServerData {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            game_port: row.get(2).map_err(|e| e.to_string())?,
            query_port: row.get(3).map_err(|e| e.to_string())?,
            rcon_port: row.get(4).map_err(|e| e.to_string())?,
            rcon_enabled: rcon_enabled != 0,
        });
    }

    Ok(servers)
}

/// Get a single server from database
fn get_server_from_db(state: &State<'_, AppState>, server_id: i64) -> Result<ServerData, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, game_port, query_port, rcon_port, rcon_enabled FROM servers WHERE id = ?1",
        [server_id],
        |row| {
            let rcon_enabled: i32 = row.get(5).unwrap_or(1);
            Ok(ServerData {
                id: row.get(0)?,
                name: row.get(1)?,
                game_port: row.get(2)?,
                query_port: row.get(3)?,
                rcon_port: row.get(4)?,
                rcon_enabled: rcon_enabled != 0,
            })
        },
    )
    .map_err(|e| format!("Server not found: {}", e))
}

/// Get firewall status for all servers
/// Get firewall status for all servers
#[tauri::command]
pub async fn get_all_servers_firewall_status(
    state: State<'_, AppState>,
) -> Result<Vec<ServerFirewallStatus>, String> {
    let servers = get_servers_from_db(&state)?;

    // Fetch all rules ONCE
    let rules_cache = fetch_all_firewall_rules();

    let mut statuses = Vec::new();

    for server in servers {
        // Check game port (UDP)
        let game_port_status = check_port_in_cache(&rules_cache, server.game_port, "UDP");

        // Check query port (UDP)
        let query_port_status = check_port_in_cache(&rules_cache, server.query_port, "UDP");

        // Check RCON port (TCP) only if enabled
        let rcon_port_status = if server.rcon_enabled {
            check_port_in_cache(&rules_cache, server.rcon_port, "TCP")
        } else {
            PortStatus::Closed
        };

        statuses.push(ServerFirewallStatus {
            server_id: server.id,
            server_name: server.name,
            game_port: server.game_port,
            query_port: server.query_port,
            rcon_port: server.rcon_port,
            rcon_enabled: server.rcon_enabled,
            game_port_status,
            query_port_status,
            rcon_port_status,
        });
    }

    Ok(statuses)
}

/// Get firewall status for a single server
#[tauri::command]
pub async fn get_firewall_status(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ServerFirewallStatus, String> {
    let server = get_server_from_db(&state, server_id)?;

    // Use batch fetch even for single server to save process creation overhead
    let rules_cache = fetch_all_firewall_rules();

    let game_port_status = check_port_in_cache(&rules_cache, server.game_port, "UDP");
    let query_port_status = check_port_in_cache(&rules_cache, server.query_port, "UDP");
    let rcon_port_status = if server.rcon_enabled {
        check_port_in_cache(&rules_cache, server.rcon_port, "TCP")
    } else {
        PortStatus::Closed
    };

    Ok(ServerFirewallStatus {
        server_id: server.id,
        server_name: server.name,
        game_port: server.game_port,
        query_port: server.query_port,
        rcon_port: server.rcon_port,
        rcon_enabled: server.rcon_enabled,
        game_port_status,
        query_port_status,
        rcon_port_status,
    })
}

/// Create firewall rules for a single server (with UAC elevation)
#[tauri::command]
pub async fn create_firewall_rules(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<FirewallOperationResult, String> {
    let server = get_server_from_db(&state, server_id)?;

    let server_name = &server.name;

    // Build list of rules to create
    let mut rules: Vec<(u16, &str, String)> = vec![
        (
            server.game_port,
            "UDP",
            format!(
                "ARK Server - {} - Game (UDP {})",
                server_name, server.game_port
            ),
        ),
        (
            server.query_port,
            "UDP",
            format!(
                "ARK Server - {} - Query (UDP {})",
                server_name, server.query_port
            ),
        ),
    ];

    // Add RCON port if enabled
    if server.rcon_enabled {
        rules.push((
            server.rcon_port,
            "TCP",
            format!(
                "ARK Server - {} - RCON (TCP {})",
                server_name, server.rcon_port
            ),
        ));
    }

    // Create all rules with elevation (single UAC prompt)
    match create_firewall_rules_elevated(rules) {
        Ok(_) => Ok(FirewallOperationResult {
            success: true,
            message: format!("Firewall rules created for '{}'", server_name),
            requires_admin: false,
        }),
        Err(e) => Ok(FirewallOperationResult {
            success: false,
            message: e,
            requires_admin: false,
        }),
    }
}

/// Remove firewall rules for a single server (with UAC elevation)
#[tauri::command]
pub async fn remove_firewall_rules(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<FirewallOperationResult, String> {
    let server = get_server_from_db(&state, server_id)?;

    let server_name = &server.name;

    // Build list of rule names to remove
    let rule_names = vec![
        format!(
            "ARK Server - {} - Game (UDP {})",
            server_name, server.game_port
        ),
        format!(
            "ARK Server - {} - Query (UDP {})",
            server_name, server.query_port
        ),
        format!(
            "ARK Server - {} - RCON (TCP {})",
            server_name, server.rcon_port
        ),
    ];

    // Remove all rules with elevation (single UAC prompt)
    match remove_firewall_rules_elevated(rule_names) {
        Ok(_) => Ok(FirewallOperationResult {
            success: true,
            message: format!("Firewall rules removed for '{}'", server_name),
            requires_admin: false,
        }),
        Err(e) => Ok(FirewallOperationResult {
            success: false,
            message: e,
            requires_admin: false,
        }),
    }
}

/// Create firewall rules for all servers (with UAC elevation)
#[tauri::command]
pub async fn create_all_firewall_rules(
    state: State<'_, AppState>,
) -> Result<FirewallOperationResult, String> {
    let servers = get_servers_from_db(&state)?;

    if servers.is_empty() {
        return Ok(FirewallOperationResult {
            success: true,
            message: "No servers configured".to_string(),
            requires_admin: false,
        });
    }

    // Build list of all rules to create
    let mut rules: Vec<(u16, &str, String)> = Vec::new();

    for server in &servers {
        let server_name = &server.name;

        // Game port
        rules.push((
            server.game_port,
            "UDP",
            format!(
                "ARK Server - {} - Game (UDP {})",
                server_name, server.game_port
            ),
        ));

        // Query port
        rules.push((
            server.query_port,
            "UDP",
            format!(
                "ARK Server - {} - Query (UDP {})",
                server_name, server.query_port
            ),
        ));

        // RCON port (if enabled)
        if server.rcon_enabled {
            rules.push((
                server.rcon_port,
                "TCP",
                format!(
                    "ARK Server - {} - RCON (TCP {})",
                    server_name, server.rcon_port
                ),
            ));
        }
    }

    let rule_count = rules.len();

    // Create all rules with elevation (single UAC prompt)
    match create_firewall_rules_elevated(rules) {
        Ok(_) => Ok(FirewallOperationResult {
            success: true,
            message: format!(
                "Created {} firewall rules for {} servers",
                rule_count,
                servers.len()
            ),
            requires_admin: false,
        }),
        Err(e) => Ok(FirewallOperationResult {
            success: false,
            message: e,
            requires_admin: false,
        }),
    }
}

/// Manual port configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualPortConfig {
    pub port: u16,
    pub protocol: String, // "TCP" or "UDP"
    pub description: String,
}

/// Check status of a manual port
#[tauri::command]
pub async fn check_manual_port_status(port: u16, protocol: String) -> Result<String, String> {
    let status = check_port_rule_exists(port, &protocol);
    Ok(match status {
        PortStatus::Open => "open".to_string(),
        PortStatus::Closed => "closed".to_string(),
        PortStatus::Unknown => "unknown".to_string(),
    })
}

/// Create a manual firewall rule for a custom port (with UAC elevation)
#[tauri::command]
pub async fn create_manual_firewall_rule(
    port: u16,
    protocol: String,
    description: String,
) -> Result<FirewallOperationResult, String> {
    // Validate protocol
    let protocol_upper = protocol.to_uppercase();
    if protocol_upper != "TCP" && protocol_upper != "UDP" {
        return Ok(FirewallOperationResult {
            success: false,
            message: "Protocol must be 'TCP' or 'UDP'".to_string(),
            requires_admin: false,
        });
    }

    // Validate port
    if port == 0 {
        return Ok(FirewallOperationResult {
            success: false,
            message: "Port must be greater than 0".to_string(),
            requires_admin: false,
        });
    }

    let rule_name = if description.is_empty() {
        format!("ARK Server Manager - Custom {} {}", protocol_upper, port)
    } else {
        format!(
            "ARK Server Manager - {} ({} {})",
            description, protocol_upper, port
        )
    };

    // Use elevated function with single rule
    let rules = vec![(port, protocol_upper.as_str(), rule_name)];
    match create_firewall_rules_elevated(rules) {
        Ok(_) => Ok(FirewallOperationResult {
            success: true,
            message: format!("Opened port {} ({})", port, protocol_upper),
            requires_admin: false,
        }),
        Err(e) => Ok(FirewallOperationResult {
            success: false,
            message: e,
            requires_admin: false,
        }),
    }
}

/// Remove a manual firewall rule (with UAC elevation)
#[tauri::command]
pub async fn remove_manual_firewall_rule(
    port: u16,
    protocol: String,
    description: String,
) -> Result<FirewallOperationResult, String> {
    let protocol_upper = protocol.to_uppercase();

    let rule_name = if description.is_empty() {
        format!("ARK Server Manager - Custom {} {}", protocol_upper, port)
    } else {
        format!(
            "ARK Server Manager - {} ({} {})",
            description, protocol_upper, port
        )
    };

    // Use elevated function
    match remove_firewall_rules_elevated(vec![rule_name]) {
        Ok(_) => Ok(FirewallOperationResult {
            success: true,
            message: format!("Closed port {} ({})", port, protocol_upper),
            requires_admin: false,
        }),
        Err(e) => Ok(FirewallOperationResult {
            success: false,
            message: e,
            requires_admin: false,
        }),
    }
}

/// Create multiple manual firewall rules at once (with UAC elevation)
#[tauri::command]
pub async fn create_manual_firewall_rules(
    ports: Vec<ManualPortConfig>,
) -> Result<FirewallOperationResult, String> {
    if ports.is_empty() {
        return Ok(FirewallOperationResult {
            success: true,
            message: "No ports specified".to_string(),
            requires_admin: false,
        });
    }

    // Build list of all rules
    let rules: Vec<(u16, String, String)> = ports
        .iter()
        .map(|port_config| {
            let protocol_upper = port_config.protocol.to_uppercase();
            let rule_name = if port_config.description.is_empty() {
                format!(
                    "ARK Server Manager - Custom {} {}",
                    protocol_upper, port_config.port
                )
            } else {
                format!(
                    "ARK Server Manager - {} ({} {})",
                    port_config.description, protocol_upper, port_config.port
                )
            };
            (port_config.port, protocol_upper, rule_name)
        })
        .collect();

    let rule_count = rules.len();

    // Convert to the format expected by create_firewall_rules_elevated
    let rules_for_elevated: Vec<(u16, &str, String)> = rules
        .iter()
        .map(|(port, protocol, name)| (*port, protocol.as_str(), name.clone()))
        .collect();

    match create_firewall_rules_elevated(rules_for_elevated) {
        Ok(_) => Ok(FirewallOperationResult {
            success: true,
            message: format!("Created {} firewall rules", rule_count),
            requires_admin: false,
        }),
        Err(e) => Ok(FirewallOperationResult {
            success: false,
            message: e,
            requires_admin: false,
        }),
    }
}
