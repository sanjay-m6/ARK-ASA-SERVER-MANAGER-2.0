use crate::AppState;
use serde::{Deserialize, Serialize};
use crate::platform::CommandNoWindowExt;
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

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
    pub peer_port: Option<u16>,
    pub peer_port_status: Option<PortStatus>,
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

fn extract_port(value: &serde_json::Value) -> Option<u16> {
    match value {
        serde_json::Value::String(s) => s.parse::<u16>().ok(),
        serde_json::Value::Number(n) => n.as_u64().map(|v| v as u16),
        _ => None,
    }
}

fn parse_firewall_rules_json(
    json: &str,
    rules_set: &mut std::collections::HashSet<(u16, String)>,
) {
    if let Ok(rules) = serde_json::from_str::<Vec<FirewallRuleData>>(json) {
        for rule in rules {
            if let Some(port) = extract_port(&rule.local_port) {
                rules_set.insert((port, rule.protocol.to_uppercase()));
            }
        }
    } else if let Ok(rule) = serde_json::from_str::<FirewallRuleData>(json) {
        if let Some(port) = extract_port(&rule.local_port) {
            rules_set.insert((port, rule.protocol.to_uppercase()));
        }
    }
}

/// Fetch all relevant firewall rules (filtered for ARK to avoid hanging)
fn fetch_all_firewall_rules() -> std::collections::HashSet<(u16, String)> {
    if !cfg!(target_os = "windows") {
        return fetch_all_firewall_rules_linux();
    }

    // Use -DisplayName 'ARK Server*' with -ErrorAction SilentlyContinue so an empty
    // result set doesn't throw a terminating error.
    let script = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
        Get-NetFirewallRule -DisplayName 'ARK Server*' -ErrorAction SilentlyContinue \
        | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' } \
        | Get-NetFirewallPortFilter \
        | Select-Object LocalPort, Protocol \
        | ConvertTo-Json -Compress";

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .no_window()
        .output();

    let mut rules_set = std::collections::HashSet::new();

    match output {
        Ok(result) => {
            let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&result.stderr).trim().to_string();

            if !stderr.is_empty() {
                log::warn!("[FIREWALL] PowerShell stderr: {}", stderr);
            }

            if stdout.is_empty() {
                log::info!("[FIREWALL] Primary query returned empty — trying broad PS fallback");
                return fetch_firewall_rules_ps_broad();
            }

            log::info!(
                "[FIREWALL] Raw PowerShell output: {}",
                &stdout[..stdout.len().min(500)]
            );

            parse_firewall_rules_json(&stdout, &mut rules_set);

            if rules_set.is_empty() {
                log::warn!("[FIREWALL] Could not parse JSON: {} — trying broad PS fallback", stdout);
                return fetch_firewall_rules_ps_broad();
            }
        }
        Err(e) => {
            log::error!("[FIREWALL] PowerShell failed: {} — trying broad PS fallback", e);
            return fetch_firewall_rules_ps_broad();
        }
    }

    rules_set
}

/// Locale-independent fallback: enumerate all inbound allow rules via PowerShell
/// without relying on the -DisplayName parameter filter (which can fail on some systems).
/// Works correctly on non-English Windows since it uses PowerShell cmdlets, not netsh text.
fn fetch_firewall_rules_ps_broad() -> std::collections::HashSet<(u16, String)> {
    let script = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
        Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -ErrorAction SilentlyContinue \
        | Where-Object { $_.DisplayName -like 'ARK*' } \
        | Get-NetFirewallPortFilter \
        | Where-Object { $_.LocalPort -match '^[0-9]+$' } \
        | Select-Object LocalPort, Protocol \
        | ConvertTo-Json -Compress";

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .no_window()
        .output();

    let mut rules_set = std::collections::HashSet::new();

    match output {
        Ok(result) => {
            let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
            if stdout.is_empty() {
                log::info!("[FIREWALL] Broad PS fallback: no ARK rules found");
                return rules_set;
            }
            parse_firewall_rules_json(&stdout, &mut rules_set);
            log::info!("[FIREWALL] Broad PS fallback found {} rules", rules_set.len());
        }
        Err(e) => {
            log::error!("[FIREWALL] Broad PS fallback also failed: {}", e);
        }
    }

    rules_set
}

fn fetch_all_firewall_rules_linux() -> std::collections::HashSet<(u16, String)> {
    let mut rules_set = std::collections::HashSet::new();

    // Check UFW status output
    if let Ok(output) = Command::new("ufw").arg("status").output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let line = line.trim();
            if line.contains("ALLOW") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(port_proto) = parts.first() {
                    let mut split = port_proto.split('/');
                    if let (Some(port_str), Some(proto_str)) = (split.next(), split.next()) {
                        if let Ok(port) = port_str.parse::<u16>() {
                            rules_set.insert((port, proto_str.to_uppercase()));
                        }
                    }
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

/// Check if a firewall rule exists for a specific port
fn check_port_rule_exists(port: u16, protocol: &str) -> PortStatus {
    let cache = fetch_all_firewall_rules();
    check_port_in_cache(&cache, port, protocol)
}

/// Create multiple firewall rules with elevation (prompts UAC once)
pub fn create_firewall_rules_elevated(rules: Vec<(u16, &str, String)>) -> Result<(), String> {
    if rules.is_empty() {
        return Ok(());
    }

    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("ark_firewall_rules.ps1");
    let log_path = temp_dir.join("ark_firewall_rules.log");

    // BUG B FIX: The elevated child process runs in a separate context where
    // stdout/stderr are invisible to the parent. Now we redirect output to a log
    // file that the parent can read to verify success.
    let mut script_parts = Vec::new();
    script_parts.push(format!(
        "$logFile = '{}'",
        log_path.to_string_lossy().replace('\\', "\\\\")
    ));
    script_parts.push("$results = @()".to_string());

    for (port, protocol, rule_name) in &rules {
        script_parts.push(format!(
            r#"$ruleName = '{}'
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {{
    try {{
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort {} -Protocol {} -Action Allow -Profile Any | Out-Null
        $results += "CREATED: $ruleName"
    }} catch {{
        $results += "FAILED: $ruleName - $($_.Exception.Message)"
    }}
}} else {{
    $results += "EXISTS: $ruleName"
}}"#,
            rule_name, port, protocol
        ));
    }

    script_parts.push("$results | Out-File -FilePath $logFile -Encoding UTF8".to_string());
    let combined_script = script_parts.join("\n");

    let mut bom_bytes = vec![0xEF, 0xBB, 0xBF];
    bom_bytes.extend_from_slice(combined_script.as_bytes());
    std::fs::write(&script_path, bom_bytes)
        .map_err(|e| format!("Failed to write temp script: {}", e))?;

    // Clean up old log file
    let _ = std::fs::remove_file(&log_path);

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
        .no_window()
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    // Clean up script file
    let _ = std::fs::remove_file(&script_path);

    // BUG B FIX: Read the log file written by the elevated process to verify results
    let log_contents = std::fs::read_to_string(&log_path).unwrap_or_default();
    let _ = std::fs::remove_file(&log_path);

    if !log_contents.is_empty() {
        log::info!(
            "[FIREWALL] Elevated script results:\n{}",
            log_contents.trim()
        );

        // Check if any rule FAILED
        if log_contents.contains("FAILED:") {
            let failures: Vec<&str> = log_contents
                .lines()
                .filter(|l| l.contains("FAILED:"))
                .collect();
            return Err(format!(
                "Some firewall rules failed to create: {}",
                failures.join("; ")
            ));
        }
        Ok(())
    } else {
        // No log file means the elevated process never ran (UAC was dismissed)
        if !output.status.success() {
            return Err(
                "UAC elevation was denied or failed. Please run as Administrator.".to_string(),
            );
        }
        // Even if parent reports success, no log means UAC was likely dismissed
        Err(
            "Firewall rules could not be verified. UAC elevation may have been dismissed."
                .to_string(),
        )
    }
}

/// Create outbound firewall rules with elevation (mirrors inbound but with Direction=Outbound).
/// Required for Steam LAN broadcast discovery responses.
pub fn create_outbound_firewall_rules_elevated(rules: Vec<(u16, &str, String)>) -> Result<(), String> {
    if rules.is_empty() {
        return Ok(());
    }

    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("ark_firewall_outbound.ps1");
    let log_path = temp_dir.join("ark_firewall_outbound.log");

    let mut script_parts = Vec::new();
    script_parts.push(format!(
        "$logFile = '{}'",
        log_path.to_string_lossy().replace('\\', "\\\\")
    ));
    script_parts.push("$results = @()".to_string());

    for (port, protocol, rule_name) in &rules {
        script_parts.push(format!(
            r#"$ruleName = '{}'
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {{
    try {{
        New-NetFirewallRule -DisplayName $ruleName -Direction Outbound -LocalPort {} -Protocol {} -Action Allow -Profile Any | Out-Null
        $results += "CREATED: $ruleName"
    }} catch {{
        $results += "FAILED: $ruleName - $($_.Exception.Message)"
    }}
}} else {{
    $results += "EXISTS: $ruleName"
}}"#,
            rule_name, port, protocol
        ));
    }

    script_parts.push("$results | Out-File -FilePath $logFile -Encoding UTF8".to_string());
    let combined_script = script_parts.join("\n");

    let mut bom_bytes = vec![0xEF, 0xBB, 0xBF];
    bom_bytes.extend_from_slice(combined_script.as_bytes());
    std::fs::write(&script_path, bom_bytes)
        .map_err(|e| format!("Failed to write temp script: {}", e))?;

    let _ = std::fs::remove_file(&log_path);

    let launcher_script = format!(
        r#"Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '{}'"#,
        script_path.to_string_lossy().replace('\\', "\\\\")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &launcher_script])
        .no_window()
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    let _ = std::fs::remove_file(&script_path);
    let log_contents = std::fs::read_to_string(&log_path).unwrap_or_default();
    let _ = std::fs::remove_file(&log_path);

    if !log_contents.is_empty() {
        log::info!("[FIREWALL] Outbound rules results:\n{}", log_contents.trim());
        if log_contents.contains("FAILED:") {
            let failures: Vec<&str> = log_contents.lines().filter(|l| l.contains("FAILED:")).collect();
            return Err(format!("Some outbound rules failed: {}", failures.join("; ")));
        }
        Ok(())
    } else if !output.status.success() {
        Err("UAC elevation was denied for outbound rules.".to_string())
    } else {
        Err("Outbound rules could not be verified. UAC may have been dismissed.".to_string())
    }
}

/// Create a program-based firewall rule allowing all UDP traffic from a specific executable.
/// This covers Steam LAN broadcast packets that may not match specific port rules.
pub fn create_program_firewall_rule_elevated(exe_path: &str, rule_name: &str) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("ark_firewall_program.ps1");
    let log_path = temp_dir.join("ark_firewall_program.log");

    let escaped_exe = exe_path.replace('\\', "\\\\");
    let script = format!(
        r#"$logFile = '{log}'
$ruleName = '{name}'
$results = @()
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {{
    try {{
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Program '{exe}' -Protocol UDP -Action Allow -Profile Any | Out-Null
        $results += "CREATED: $ruleName"
    }} catch {{
        $results += "FAILED: $ruleName - $($_.Exception.Message)"
    }}
}} else {{
    $results += "EXISTS: $ruleName"
}}
$results | Out-File -FilePath $logFile -Encoding UTF8"#,
        log = log_path.to_string_lossy().replace('\\', "\\\\"),
        name = rule_name,
        exe = escaped_exe,
    );

    let mut bom_bytes = vec![0xEF, 0xBB, 0xBF];
    bom_bytes.extend_from_slice(script.as_bytes());
    std::fs::write(&script_path, bom_bytes)
        .map_err(|e| format!("Failed to write temp script: {}", e))?;

    let _ = std::fs::remove_file(&log_path);

    let launcher_script = format!(
        r#"Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '{}'"#,
        script_path.to_string_lossy().replace('\\', "\\\\")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &launcher_script])
        .no_window()
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    let _ = std::fs::remove_file(&script_path);
    let log_contents = std::fs::read_to_string(&log_path).unwrap_or_default();
    let _ = std::fs::remove_file(&log_path);

    if !log_contents.is_empty() {
        log::info!("[FIREWALL] Program rule results:\n{}", log_contents.trim());
        if log_contents.contains("FAILED:") {
            return Err(format!("Program firewall rule failed: {}", log_contents.trim()));
        }
        Ok(())
    } else if !output.status.success() {
        Err("UAC elevation was denied for program rule.".to_string())
    } else {
        Err("Program rule could not be verified. UAC may have been dismissed.".to_string())
    }
}

/// Remove firewall rules by exact DisplayName with elevation (for manual/custom rules).
fn remove_firewall_rules_elevated(rule_names: Vec<String>) -> Result<(), String> {
    if rule_names.is_empty() {
        return Ok(());
    }

    let mut script_parts = Vec::new();
    for rule_name in &rule_names {
        script_parts.push(format!(
            r#"Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue"#,
            rule_name
        ));
    }
    let combined_script = script_parts.join("\n");

    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("ark_firewall_rules.ps1");
    let mut bom_bytes = vec![0xEF, 0xBB, 0xBF];
    bom_bytes.extend_from_slice(combined_script.as_bytes());
    std::fs::write(&script_path, bom_bytes)
        .map_err(|e| format!("Failed to write temp script: {}", e))?;

    let launcher_script = format!(
        r#"Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '{}'"#,
        script_path.to_string_lossy().replace('\\', "\\\\")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &launcher_script])
        .no_window()
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    let _ = std::fs::remove_file(&script_path);

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.is_empty() {
            Ok(())
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
    install_path: String,
}

/// Get all servers from database
fn get_servers_from_db(state: &State<'_, AppState>) -> Result<Vec<ServerData>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, game_port, query_port, rcon_port, rcon_enabled, install_path FROM servers")
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
            install_path: row.get(6).unwrap_or_default(),
        });
    }

    Ok(servers)
}

/// Get a single server from database
fn get_server_from_db(state: &State<'_, AppState>, server_id: i64) -> Result<ServerData, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, game_port, query_port, rcon_port, rcon_enabled, install_path FROM servers WHERE id = ?1",
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
                install_path: row.get(6).unwrap_or_default(),
            })
        },
    )
    .map_err(|e| format!("Server not found: {}", e))
}

/// Get firewall status for all servers
#[tauri::command]
pub async fn get_all_servers_firewall_status(
    state: State<'_, AppState>,
) -> Result<Vec<ServerFirewallStatus>, String> {
    let servers = get_servers_from_db(&state)?;

    // Fetch all rules ONCE
    let rules_cache = fetch_all_firewall_rules();
    log::info!(
        "[FIREWALL] Status check: found {} cached rules",
        rules_cache.len()
    );

    let mut statuses = Vec::new();

    for server in servers {
        // Game port: UDP is the primary game protocol in UE5
        let game_port_status = check_port_in_cache(&rules_cache, server.game_port, "UDP");
        log::info!(
            "[FIREWALL] {} game port {} UDP => {:?}",
            server.name, server.game_port, game_port_status
        );

        // Query port: Steam A2S is UDP-only
        let query_port_status = check_port_in_cache(&rules_cache, server.query_port, "UDP");
        log::info!(
            "[FIREWALL] {} query port {} UDP => {:?}",
            server.name, server.query_port, query_port_status
        );

        // RCON port: Source RCON is TCP-only
        let rcon_port_status = if server.rcon_enabled {
            let status = check_port_in_cache(&rules_cache, server.rcon_port, "TCP");
            log::info!(
                "[FIREWALL] {} RCON port {} TCP => {:?}",
                server.name, server.rcon_port, status
            );
            status
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
            peer_port: Some(server.game_port + 1),
            peer_port_status: Some(check_port_in_cache(&rules_cache, server.game_port + 1, "UDP")),
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

    // Game port: UDP (UE5 primary protocol)
    let game_port_status = check_port_in_cache(&rules_cache, server.game_port, "UDP");

    // Query port: UDP (Steam A2S protocol)
    let query_port_status = check_port_in_cache(&rules_cache, server.query_port, "UDP");

    // RCON port: TCP (Source RCON protocol)
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
        peer_port: Some(server.game_port + 1),
        peer_port_status: Some(check_port_in_cache(&rules_cache, server.game_port + 1, "UDP")),
    })
}

fn delete_firewall_rules_raw(server_id: i64) -> Result<(), String> {
    let rule_names = vec![
        format!("ARK-ASA-Manager-Game-UDP-In-{}", server_id),
        format!("ARK-ASA-Manager-Game-UDP-Out-{}", server_id),
        format!("ARK-ASA-Manager-Game-TCP-In-{}", server_id),
        format!("ARK-ASA-Manager-Game-TCP-Out-{}", server_id),
        format!("ARK-ASA-Manager-Raw-UDP-In-{}", server_id),
        format!("ARK-ASA-Manager-Raw-UDP-Out-{}", server_id),
        format!("ARK-ASA-Manager-Query-UDP-In-{}", server_id),
        format!("ARK-ASA-Manager-Query-UDP-Out-{}", server_id),
        format!("ARK-ASA-Manager-RCON-TCP-In-{}", server_id),
        format!("ARK-ASA-Manager-RCON-TCP-Out-{}", server_id),
        format!("ARK-ASA-Manager-App-In-{}", server_id),
        format!("ARK-ASA-Manager-App-Out-{}", server_id),
    ];
    for name in rule_names {
        let output = Command::new("netsh")
            .args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", name)])
            .no_window()
            .output()
            .map_err(|e| format!("Failed to run netsh: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let err_msg = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            };
            if is_elevation_error(&err_msg) {
                return Err(err_msg);
            }
        }
    }
    Ok(())
}

fn create_firewall_rules_raw(
    server_id: i64,
    game_port: u16,
    raw_port: u16,
    query_port: u16,
    rcon_port: u16,
    rcon_enabled: bool,
    exe_path: &str,
) -> Result<(), String> {
    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASA-Manager-Game-UDP-In-{}", server_id),
        "dir=in", "action=allow", "protocol=UDP",
        &format!("localport={}", game_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASA-Manager-Game-UDP-Out-{}", server_id),
        "dir=out", "action=allow", "protocol=UDP",
        &format!("localport={}", game_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASA-Manager-Game-TCP-In-{}", server_id),
        "dir=in", "action=allow", "protocol=TCP",
        &format!("localport={}", game_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASA-Manager-Game-TCP-Out-{}", server_id),
        "dir=out", "action=allow", "protocol=TCP",
        &format!("localport={}", game_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASA-Manager-Raw-UDP-In-{}", server_id),
        "dir=in", "action=allow", "protocol=UDP",
        &format!("localport={}", raw_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASA-Manager-Raw-UDP-Out-{}", server_id),
        "dir=out", "action=allow", "protocol=UDP",
        &format!("localport={}", raw_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASA-Manager-Query-UDP-In-{}", server_id),
        "dir=in", "action=allow", "protocol=UDP",
        &format!("localport={}", query_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASA-Manager-Query-UDP-Out-{}", server_id),
        "dir=out", "action=allow", "protocol=UDP",
        &format!("localport={}", query_port), "profile=any"
    ])?;

    if rcon_enabled && rcon_port > 0 {
        execute_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=ARK-ASA-Manager-RCON-TCP-In-{}", server_id),
            "dir=in", "action=allow", "protocol=TCP",
            &format!("localport={}", rcon_port), "profile=any"
        ])?;
        execute_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=ARK-ASA-Manager-RCON-TCP-Out-{}", server_id),
            "dir=out", "action=allow", "protocol=TCP",
            &format!("localport={}", rcon_port), "profile=any"
        ])?;
    }

    if !exe_path.is_empty() {
        execute_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=ARK-ASA-Manager-App-In-{}", server_id),
            "dir=in", "action=allow", "protocol=UDP",
            &format!("program={}", exe_path), "profile=any"
        ])?;
        execute_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=ARK-ASA-Manager-App-Out-{}", server_id),
            "dir=out", "action=allow", "protocol=UDP",
            &format!("program={}", exe_path), "profile=any"
        ])?;
    }

    Ok(())
}

fn check_firewall_configured_raw(
    server_id: i64,
    game_port: u16,
    raw_port: u16,
    query_port: u16,
    rcon_port: u16,
    rcon_enabled: bool,
    exe_path: &str,
) -> bool {
    let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-Game-UDP-In-{}", server_id));
    if !info.exists || info.port != Some(game_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-Game-UDP-Out-{}", server_id));
    if !info.exists || info.port != Some(game_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-Game-TCP-In-{}", server_id));
    if !info.exists || info.port != Some(game_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-Game-TCP-Out-{}", server_id));
    if !info.exists || info.port != Some(game_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-Raw-UDP-In-{}", server_id));
    if !info.exists || info.port != Some(raw_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-Raw-UDP-Out-{}", server_id));
    if !info.exists || info.port != Some(raw_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-Query-UDP-In-{}", server_id));
    if !info.exists || info.port != Some(query_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-Query-UDP-Out-{}", server_id));
    if !info.exists || info.port != Some(query_port) { return false; }

    if rcon_enabled && rcon_port > 0 {
        let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-RCON-TCP-In-{}", server_id));
        if !info.exists || info.port != Some(rcon_port) { return false; }

        let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-RCON-TCP-Out-{}", server_id));
        if !info.exists || info.port != Some(rcon_port) { return false; }
    }

    if !exe_path.is_empty() {
        let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-App-In-{}", server_id));
        if !info.exists { return false; }
        if let Some(ref p) = info.program {
            let normalized_p = p.trim_matches('"').to_lowercase();
            let normalized_exe = exe_path.trim_matches('"').to_lowercase();
            if normalized_p != normalized_exe { return false; }
        } else {
            return false;
        }

        let info = get_netsh_rule_info(&format!("ARK-ASA-Manager-App-Out-{}", server_id));
        if !info.exists { return false; }
        if let Some(ref p) = info.program {
            let normalized_p = p.trim_matches('"').to_lowercase();
            let normalized_exe = exe_path.trim_matches('"').to_lowercase();
            if normalized_p != normalized_exe { return false; }
        } else {
            return false;
        }
    }

    true
}

pub fn configure_firewall_raw(
    state: &State<'_, AppState>,
    server_id: i64,
) -> Result<ConfigureFirewallResult, String> {
    let server = get_server_from_db(state, server_id)?;
    let raw_port = server.game_port + 1;

    let mut exe_path = "".to_string();
    if !server.install_path.trim().is_empty() {
        let path = PathBuf::from(&server.install_path)
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ArkAscendedServer.exe");
        exe_path = path.to_string_lossy().replace("/", "\\");
    }

    let already_configured = check_firewall_configured_raw(
        server_id,
        server.game_port,
        raw_port,
        server.query_port,
        server.rcon_port,
        server.rcon_enabled,
        &exe_path,
    );

    let ports = FirewallPorts {
        game: server.game_port,
        peer: raw_port,
        query: server.query_port,
        rcon: server.rcon_port,
    };

    if already_configured {
        return Ok(ConfigureFirewallResult {
            success: true,
            rules_created: false,
            ports,
            already_configured: true,
            message: "Firewall rules are already correctly configured.".to_string(),
        });
    }

    log::info!(
        "[FIREWALL] Configuration mismatch or rules missing for ASA server ID {}. Recreating all rules.",
        server_id
    );

    let _ = delete_firewall_rules_raw(server_id);

    match create_firewall_rules_raw(
        server_id,
        server.game_port,
        raw_port,
        server.query_port,
        server.rcon_port,
        server.rcon_enabled,
        &exe_path,
    ) {
        Ok(_) => {
            log::info!("[FIREWALL] Successfully configured firewall rules for ASA server ID {}.", server_id);
            Ok(ConfigureFirewallResult {
                success: true,
                rules_created: true,
                ports,
                already_configured: false,
                message: "Firewall rules successfully configured.".to_string(),
            })
        }
        Err(e) => {
            log::error!("[FIREWALL] Failed to configure firewall rules for ASA server ID {}: {}", server_id, e);
            let requires_elevation = is_elevation_error(&e);
            let message = if requires_elevation {
                "Firewall configuration failed: Administrative privileges are required. Please run Ark Infinity Server Manager as Administrator to configure firewall rules.".to_string()
            } else {
                format!("Firewall configuration failed: {}", e)
            };

            Err(message)
        }
    }
}

/// Create firewall rules for a single server (with UAC elevation)
/// Game port: UDP + TCP (UE5 compatibility). Query port: UDP only (Steam A2S). RCON: TCP only.
#[tauri::command]
pub async fn create_firewall_rules(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<FirewallOperationResult, String> {
    match configure_firewall_raw(&state, server_id) {
        Ok(res) => Ok(FirewallOperationResult {
            success: res.success,
            message: res.message,
            requires_admin: false,
        }),
        Err(e) => Ok(FirewallOperationResult {
            success: false,
            message: e,
            requires_admin: true,
        }),
    }
}

/// Remove firewall rules for a single server (with UAC elevation)
/// Uses name-based removal so it is extremely precise and does not require UAC if run as Admin.
#[tauri::command]
pub async fn remove_firewall_rules(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<FirewallOperationResult, String> {
    let server = get_server_from_db(&state, server_id)?;
    let server_name = &server.name;

    log::info!(
        "[FIREWALL] Removing ASA rules for server '{}' (id={})",
        server_name, server_id
    );

    match delete_firewall_rules_raw(server_id) {
        Ok(_) => Ok(FirewallOperationResult {
            success: true,
            message: format!("Firewall rules removed for '{}'", server_name),
            requires_admin: false,
        }),
        Err(e) => {
            let requires_admin = is_elevation_error(&e);
            Ok(FirewallOperationResult {
                success: false,
                message: if requires_admin {
                    "Failed to remove rules: Administrative privileges required.".to_string()
                } else {
                    e
                },
                requires_admin,
            })
        }
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

    let mut configured_count = 0;
    for server in &servers {
        match configure_firewall_raw(&state, server.id) {
            Ok(res) => {
                if res.success {
                    configured_count += 1;
                }
            }
            Err(e) => {
                return Ok(FirewallOperationResult {
                    success: false,
                    message: format!("Failed at server '{}': {}", server.name, e),
                    requires_admin: is_elevation_error(&e),
                });
            }
        }
    }

    Ok(FirewallOperationResult {
        success: true,
        message: format!("Configured firewall rules for {} servers", configured_count),
        requires_admin: false,
    })
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
    if protocol_upper != "TCP" && protocol_upper != "UDP" && protocol_upper != "BOTH" {
        return Ok(FirewallOperationResult {
            success: false,
            message: "Protocol must be 'TCP', 'UDP', or 'BOTH'".to_string(),
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

    let mut rules = Vec::new();

    if protocol_upper == "BOTH" {
        let name_tcp = if description.is_empty() {
            format!("ARK Server Manager - Custom TCP {}", port)
        } else {
            format!("ARK Server Manager - {} (TCP {})", description, port)
        };
        let name_udp = if description.is_empty() {
            format!("ARK Server Manager - Custom UDP {}", port)
        } else {
            format!("ARK Server Manager - {} (UDP {})", description, port)
        };
        rules.push((port, "TCP", name_tcp));
        rules.push((port, "UDP", name_udp));
    } else {
        let rule_name = if description.is_empty() {
            format!("ARK Server Manager - Custom {} {}", protocol_upper, port)
        } else {
            format!(
                "ARK Server Manager - {} ({} {})",
                description, protocol_upper, port
            )
        };
        rules.push((port, protocol_upper.as_str(), rule_name));
    }

    // Use elevated function
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

    let mut rule_names = Vec::new();

    if protocol_upper == "BOTH" {
        let name_tcp = if description.is_empty() {
            format!("ARK Server Manager - Custom TCP {}", port)
        } else {
            format!("ARK Server Manager - {} (TCP {})", description, port)
        };
        let name_udp = if description.is_empty() {
            format!("ARK Server Manager - Custom UDP {}", port)
        } else {
            format!("ARK Server Manager - {} (UDP {})", description, port)
        };
        rule_names.push(name_tcp);
        rule_names.push(name_udp);
    } else {
        let rule_name = if description.is_empty() {
            format!("ARK Server Manager - Custom {} {}", protocol_upper, port)
        } else {
            format!(
                "ARK Server Manager - {} ({} {})",
                description, protocol_upper, port
            )
        };
        rule_names.push(rule_name);
    }

    // Use elevated function
    match remove_firewall_rules_elevated(rule_names) {
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

    // Build list of all rules, expanding BOTH into separate TCP + UDP entries
    let mut rules: Vec<(u16, String, String)> = Vec::new();
    for port_config in &ports {
        let protocol_upper = port_config.protocol.to_uppercase();
        let protos: &[&str] = if protocol_upper == "BOTH" {
            &["TCP", "UDP"]
        } else {
            &[protocol_upper.as_str()]
        };
        for proto in protos {
            let rule_name = if port_config.description.is_empty() {
                format!("ARK Server Manager - Custom {} {}", proto, port_config.port)
            } else {
                format!("ARK Server Manager - {} ({} {})", port_config.description, proto, port_config.port)
            };
            rules.push((port_config.port, proto.to_string(), rule_name));
        }
    }

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

/// Helper struct for ASE server data
struct AseServerData {
    id: i64,
    name: String,
    game_port: u16,
    query_port: u16,
    rcon_port: u16,
    rcon_enabled: bool,
    install_path: String,
}

/// Get all ASE servers from database
fn get_ase_servers_from_db(state: &State<'_, AppState>) -> Result<Vec<AseServerData>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, port, query_port, rcon_port, install_path FROM ase_servers")
        .map_err(|e| e.to_string())?;

    let mut servers = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let rcon_port: u16 = row.get(4).unwrap_or(0);
        servers.push(AseServerData {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            game_port: row.get(2).map_err(|e| e.to_string())?,
            query_port: row.get(3).map_err(|e| e.to_string())?,
            rcon_port,
            rcon_enabled: rcon_port > 0,
            install_path: row.get(5).unwrap_or_default(),
        });
    }

    Ok(servers)
}

/// Get a single ASE server from database
fn get_ase_server_from_db(state: &State<'_, AppState>, server_id: i64) -> Result<AseServerData, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, port, query_port, rcon_port, install_path FROM ase_servers WHERE id = ?1",
        [server_id],
        |row| {
            let rcon_port: u16 = row.get(4).unwrap_or(0);
            Ok(AseServerData {
                id: row.get(0)?,
                name: row.get(1)?,
                game_port: row.get(2)?,
                query_port: row.get(3)?,
                rcon_port,
                rcon_enabled: rcon_port > 0,
                install_path: row.get(5).unwrap_or_default(),
            })
        },
    )
    .map_err(|e| format!("ASE Server not found: {}", e))
}

/// Get firewall status for all ASE servers
#[tauri::command]
pub async fn get_all_ase_servers_firewall_status(
    state: State<'_, AppState>,
) -> Result<Vec<ServerFirewallStatus>, String> {
    let servers = get_ase_servers_from_db(&state)?;

    // Fetch all rules ONCE
    let rules_cache = fetch_all_firewall_rules();
    log::info!(
        "[FIREWALL] ASE Status check: found {} cached rules",
        rules_cache.len()
    );

    let mut statuses = Vec::new();

    for server in servers {
        let game_port_status = check_port_in_cache(&rules_cache, server.game_port, "UDP");
        let query_port_status = check_port_in_cache(&rules_cache, server.query_port, "UDP");
        let peer_port_status = check_port_in_cache(&rules_cache, server.game_port + 1, "UDP");
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
            peer_port: Some(server.game_port + 1),
            peer_port_status: Some(peer_port_status),
        });
    }

    Ok(statuses)
}

/// Get firewall status for a single ASE server
#[tauri::command]
pub async fn get_ase_firewall_status(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ServerFirewallStatus, String> {
    let server = get_ase_server_from_db(&state, server_id)?;
    let rules_cache = fetch_all_firewall_rules();

    let game_port_status = check_port_in_cache(&rules_cache, server.game_port, "UDP");
    let query_port_status = check_port_in_cache(&rules_cache, server.query_port, "UDP");
    let peer_port_status = check_port_in_cache(&rules_cache, server.game_port + 1, "UDP");
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
        peer_port: Some(server.game_port + 1),
        peer_port_status: Some(peer_port_status),
    })
}

/// Create firewall rules for a single ASE server
#[tauri::command]
pub async fn create_ase_firewall_rules(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<FirewallOperationResult, String> {
    match configure_ase_firewall_raw(&state, server_id) {
        Ok(res) => Ok(FirewallOperationResult {
            success: res.success,
            message: res.message,
            requires_admin: false,
        }),
        Err(e) => Ok(FirewallOperationResult {
            success: false,
            message: e,
            requires_admin: true,
        }),
    }
}

/// Remove firewall rules for a single ASE server
#[tauri::command]
pub async fn remove_ase_firewall_rules(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<FirewallOperationResult, String> {
    let server = get_ase_server_from_db(&state, server_id)?;
    let server_name = &server.name;

    log::info!(
        "[FIREWALL] Removing ASE rules for server '{}' (id={})",
        server_name, server_id
    );

    match delete_ase_firewall_rules_raw(server_id) {
        Ok(_) => Ok(FirewallOperationResult {
            success: true,
            message: format!("Firewall rules removed for '{}'", server_name),
            requires_admin: false,
        }),
        Err(e) => {
            let requires_admin = is_elevation_error(&e);
            Ok(FirewallOperationResult {
                success: false,
                message: if requires_admin {
                    "Failed to remove rules: Administrative privileges required.".to_string()
                } else {
                    e
                },
                requires_admin,
            })
        }
    }
}

/// Create firewall rules for all ASE servers
#[tauri::command]
pub async fn create_all_ase_firewall_rules(
    state: State<'_, AppState>,
) -> Result<FirewallOperationResult, String> {
    let servers = get_ase_servers_from_db(&state)?;

    if servers.is_empty() {
        return Ok(FirewallOperationResult {
            success: true,
            message: "No ASE servers configured".to_string(),
            requires_admin: false,
        });
    }

    let mut configured_count = 0;
    for server in &servers {
        match configure_ase_firewall_raw(&state, server.id) {
            Ok(res) => {
                if res.success {
                    configured_count += 1;
                }
            }
            Err(e) => {
                return Ok(FirewallOperationResult {
                    success: false,
                    message: format!("Failed at server '{}': {}", server.name, e),
                    requires_admin: is_elevation_error(&e),
                });
            }
        }
    }

    Ok(FirewallOperationResult {
        success: true,
        message: format!("Configured firewall rules for {} servers", configured_count),
        requires_admin: false,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallPorts {
    pub game: u16,
    pub peer: u16,
    pub query: u16,
    pub rcon: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureFirewallResult {
    pub success: bool,
    pub rules_created: bool,
    pub ports: FirewallPorts,
    pub already_configured: bool,
    pub message: String,
}

#[derive(Debug)]
struct NetshRuleInfo {
    exists: bool,
    port: Option<u16>,
    program: Option<String>,
}

fn is_elevation_error(err: &str) -> bool {
    let err_lower = err.to_lowercase();
    err_lower.contains("elevation") || err_lower.contains("administrator") || err_lower.contains("access is denied") || err_lower.contains("permission")
}

fn get_netsh_rule_info(rule_name: &str) -> NetshRuleInfo {
    let output = match Command::new("netsh")
        .args(["advfirewall", "firewall", "show", "rule", &format!("name={}", rule_name)])
        .no_window()
        .output()
    {
        Ok(out) => out,
        Err(_) => return NetshRuleInfo { exists: false, port: None, program: None },
    };

    if !output.status.success() {
        return NetshRuleInfo { exists: false, port: None, program: None };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut port = None;
    let mut program = None;

    for line in stdout.lines() {
        let line_lower = line.to_lowercase();
        if (line_lower.contains("local") || line_lower.contains("lokal") || line_lower.contains("port local")) && line_lower.contains("port") {
            if let Some(pos) = line.find(':') {
                let val = line[pos + 1..].trim();
                if let Ok(p) = val.parse::<u16>() {
                    port = Some(p);
                }
            }
        } else if line_lower.contains("program") || line_lower.contains("programm") {
            if let Some(pos) = line.find(':') {
                program = Some(line[pos + 1..].trim().to_string());
            }
        }
    }

    NetshRuleInfo {
        exists: true,
        port,
        program,
    }
}

fn delete_ase_firewall_rules_raw(server_id: i64) -> Result<(), String> {
    let rule_names = vec![
        format!("ARK-ASE-Manager-Game-UDP-In-{}", server_id),
        format!("ARK-ASE-Manager-Game-UDP-Out-{}", server_id),
        format!("ARK-ASE-Manager-Game-TCP-In-{}", server_id),
        format!("ARK-ASE-Manager-Game-TCP-Out-{}", server_id),
        format!("ARK-ASE-Manager-Peer-UDP-In-{}", server_id),
        format!("ARK-ASE-Manager-Peer-UDP-Out-{}", server_id),
        format!("ARK-ASE-Manager-Query-UDP-In-{}", server_id),
        format!("ARK-ASE-Manager-Query-UDP-Out-{}", server_id),
        format!("ARK-ASE-Manager-RCON-TCP-In-{}", server_id),
        format!("ARK-ASE-Manager-RCON-TCP-Out-{}", server_id),
        format!("ARK-ASE-Manager-App-In-{}", server_id),
        format!("ARK-ASE-Manager-App-Out-{}", server_id),
    ];
    for name in rule_names {
        let output = Command::new("netsh")
            .args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", name)])
            .no_window()
            .output()
            .map_err(|e| format!("Failed to run netsh: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let err_msg = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            };
            if is_elevation_error(&err_msg) {
                return Err(err_msg);
            }
        }
    }
    Ok(())
}

fn execute_netsh(args: &[&str]) -> Result<(), String> {
    let output = Command::new("netsh")
        .args(args)
        .no_window()
        .output()
        .map_err(|e| format!("Failed to run netsh: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let err_msg = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            stdout.trim().to_string()
        };
        Err(err_msg)
    }
}

fn create_ase_firewall_rules_raw(
    server_id: i64,
    game_port: u16,
    peer_port: u16,
    query_port: u16,
    rcon_port: u16,
    rcon_enabled: bool,
    exe_path: &str,
) -> Result<(), String> {
    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASE-Manager-Game-UDP-In-{}", server_id),
        "dir=in", "action=allow", "protocol=UDP",
        &format!("localport={}", game_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASE-Manager-Game-UDP-Out-{}", server_id),
        "dir=out", "action=allow", "protocol=UDP",
        &format!("localport={}", game_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASE-Manager-Game-TCP-In-{}", server_id),
        "dir=in", "action=allow", "protocol=TCP",
        &format!("localport={}", game_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASE-Manager-Game-TCP-Out-{}", server_id),
        "dir=out", "action=allow", "protocol=TCP",
        &format!("localport={}", game_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASE-Manager-Peer-UDP-In-{}", server_id),
        "dir=in", "action=allow", "protocol=UDP",
        &format!("localport={}", peer_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASE-Manager-Peer-UDP-Out-{}", server_id),
        "dir=out", "action=allow", "protocol=UDP",
        &format!("localport={}", peer_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASE-Manager-Query-UDP-In-{}", server_id),
        "dir=in", "action=allow", "protocol=UDP",
        &format!("localport={}", query_port), "profile=any"
    ])?;

    execute_netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name=ARK-ASE-Manager-Query-UDP-Out-{}", server_id),
        "dir=out", "action=allow", "protocol=UDP",
        &format!("localport={}", query_port), "profile=any"
    ])?;

    if rcon_enabled && rcon_port > 0 {
        execute_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=ARK-ASE-Manager-RCON-TCP-In-{}", server_id),
            "dir=in", "action=allow", "protocol=TCP",
            &format!("localport={}", rcon_port), "profile=any"
        ])?;
        execute_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=ARK-ASE-Manager-RCON-TCP-Out-{}", server_id),
            "dir=out", "action=allow", "protocol=TCP",
            &format!("localport={}", rcon_port), "profile=any"
        ])?;
    }

    if !exe_path.is_empty() {
        execute_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=ARK-ASE-Manager-App-In-{}", server_id),
            "dir=in", "action=allow", "protocol=UDP",
            &format!("program={}", exe_path), "profile=any"
        ])?;
        execute_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=ARK-ASE-Manager-App-Out-{}", server_id),
            "dir=out", "action=allow", "protocol=UDP",
            &format!("program={}", exe_path), "profile=any"
        ])?;
    }

    Ok(())
}

fn check_ase_firewall_configured_raw(
    server_id: i64,
    game_port: u16,
    peer_port: u16,
    query_port: u16,
    rcon_port: u16,
    rcon_enabled: bool,
    exe_path: &str,
) -> bool {
    let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-Game-UDP-In-{}", server_id));
    if !info.exists || info.port != Some(game_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-Game-UDP-Out-{}", server_id));
    if !info.exists || info.port != Some(game_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-Game-TCP-In-{}", server_id));
    if !info.exists || info.port != Some(game_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-Game-TCP-Out-{}", server_id));
    if !info.exists || info.port != Some(game_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-Peer-UDP-In-{}", server_id));
    if !info.exists || info.port != Some(peer_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-Peer-UDP-Out-{}", server_id));
    if !info.exists || info.port != Some(peer_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-Query-UDP-In-{}", server_id));
    if !info.exists || info.port != Some(query_port) { return false; }

    let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-Query-UDP-Out-{}", server_id));
    if !info.exists || info.port != Some(query_port) { return false; }

    if rcon_enabled && rcon_port > 0 {
        let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-RCON-TCP-In-{}", server_id));
        if !info.exists || info.port != Some(rcon_port) { return false; }

        let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-RCON-TCP-Out-{}", server_id));
        if !info.exists || info.port != Some(rcon_port) { return false; }
    }

    if !exe_path.is_empty() {
        let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-App-In-{}", server_id));
        if !info.exists { return false; }
        if let Some(ref p) = info.program {
            let normalized_p = p.trim_matches('"').to_lowercase();
            let normalized_exe = exe_path.trim_matches('"').to_lowercase();
            if normalized_p != normalized_exe { return false; }
        } else {
            return false;
        }

        let info = get_netsh_rule_info(&format!("ARK-ASE-Manager-App-Out-{}", server_id));
        if !info.exists { return false; }
        if let Some(ref p) = info.program {
            let normalized_p = p.trim_matches('"').to_lowercase();
            let normalized_exe = exe_path.trim_matches('"').to_lowercase();
            if normalized_p != normalized_exe { return false; }
        } else {
            return false;
        }
    }

    true
}

pub fn configure_ase_firewall_raw(
    state: &State<'_, AppState>,
    server_id: i64,
) -> Result<ConfigureFirewallResult, String> {
    let server = get_ase_server_from_db(state, server_id)?;
    let peer_port = server.game_port + 1;

    let mut exe_path = "".to_string();
    if !server.install_path.trim().is_empty() {
        let path = PathBuf::from(&server.install_path)
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ShooterGameServer.exe");
        exe_path = path.to_string_lossy().replace("/", "\\");
    }

    let already_configured = check_ase_firewall_configured_raw(
        server_id,
        server.game_port,
        peer_port,
        server.query_port,
        server.rcon_port,
        server.rcon_enabled,
        &exe_path,
    );

    let ports = FirewallPorts {
        game: server.game_port,
        peer: peer_port,
        query: server.query_port,
        rcon: server.rcon_port,
    };

    if already_configured {
        return Ok(ConfigureFirewallResult {
            success: true,
            rules_created: false,
            ports,
            already_configured: true,
            message: "Firewall rules are already correctly configured.".to_string(),
        });
    }

    log::info!(
        "[FIREWALL] Configuration mismatch or rules missing for ASE server ID {}. Recreating all rules.",
        server_id
    );

    let _ = delete_ase_firewall_rules_raw(server_id);

    match create_ase_firewall_rules_raw(
        server_id,
        server.game_port,
        peer_port,
        server.query_port,
        server.rcon_port,
        server.rcon_enabled,
        &exe_path,
    ) {
        Ok(_) => {
            log::info!("[FIREWALL] Successfully configured firewall rules for ASE server ID {}.", server_id);
            Ok(ConfigureFirewallResult {
                success: true,
                rules_created: true,
                ports,
                already_configured: false,
                message: "Firewall rules successfully configured.".to_string(),
            })
        }
        Err(e) => {
            log::error!("[FIREWALL] Failed to configure firewall rules for ASE server ID {}: {}", server_id, e);
            let requires_elevation = is_elevation_error(&e);
            let message = if requires_elevation {
                "Firewall configuration failed: Administrative privileges are required. Please run Ark Infinity Server Manager as Administrator to configure firewall rules.".to_string()
            } else {
                format!("Firewall configuration failed: {}", e)
            };

            Err(message)
        }
    }
}

/// Tauri command to check and configure firewall rules for a single ASE server
#[tauri::command]
pub async fn configure_ase_firewall(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ConfigureFirewallResult, String> {
    configure_ase_firewall_raw(&state, server_id)
}

/// Tauri command to check and configure firewall rules for a single ASA server
#[tauri::command]
pub async fn configure_firewall(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ConfigureFirewallResult, String> {
    configure_firewall_raw(&state, server_id)
}


