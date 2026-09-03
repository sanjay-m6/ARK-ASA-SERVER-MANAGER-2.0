use crate::AppState;
use igd_next::aio::tokio::search_gateway;
use igd_next::PortMappingProtocol;
use serde::Serialize;
use std::net::SocketAddrV4;
use tauri::State;

// =============================================================================
// UPnP AUTO PORT FORWARDING (Phase C2)
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct UPnPGatewayInfo {
    pub gateway_address: String,
    pub external_ip: String,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PortMappingResult {
    pub port: u16,
    pub protocol: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UPnPForwardResult {
    pub gateway: UPnPGatewayInfo,
    pub mappings: Vec<PortMappingResult>,
    pub all_success: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExistingPortMapping {
    pub internal_port: u16,
    pub external_port: u16,
    pub protocol: String,
    pub description: String,
    pub internal_client: String,
}

/// Discover the UPnP gateway on the local network
#[tauri::command]
pub async fn discover_upnp_gateway() -> Result<UPnPGatewayInfo, String> {
    println!("🌐 Discovering UPnP gateway...");

    let gateway = search_gateway(Default::default())
        .await
        .map_err(|e| format!("No UPnP gateway found on network: {}", e))?;

    let external_ip = gateway
        .get_external_ip()
        .await
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    let info = UPnPGatewayInfo {
        gateway_address: gateway.addr.to_string(),
        external_ip,
        available: true,
    };

    println!("  ✅ Gateway found: {} (External: {})", info.gateway_address, info.external_ip);
    Ok(info)
}

/// Forward ports for a specific server via UPnP
#[tauri::command]
pub async fn forward_server_ports(
    state: State<'_, AppState>,
    server_id: i64,
    lease_duration: Option<u32>,
) -> Result<UPnPForwardResult, String> {
    println!("🔌 Forwarding ports for server {} via UPnP", server_id);

    // Get server port info
    let (game_port, query_port, rcon_port, server_name): (i64, i64, i64, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT game_port, query_port, rcon_port, session_name FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    // Discover gateway
    let gateway = search_gateway(Default::default())
        .await
        .map_err(|e| format!("UPnP gateway not found: {}", e))?;

    let external_ip = gateway
        .get_external_ip()
        .await
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    // Get local IP
    let local_ip = get_local_ip();
    let lease = lease_duration.unwrap_or(86400); // 24 hours default

    let ports_to_forward = vec![
        (game_port as u16, "UDP", format!("ASM - {} Game", server_name)),
        ((game_port + 1) as u16, "UDP", format!("ASM - {} Peer", server_name)),
        (query_port as u16, "UDP", format!("ASM - {} Query", server_name)),
        (rcon_port as u16, "TCP", format!("ASM - {} RCON", server_name)),
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
                println!("  ✅ Forwarded {} port {} → {}", proto, port, local_addr);
                mappings.push(PortMappingResult {
                    port: *port,
                    protocol: proto.to_string(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                let err_msg = format!("{}", e);
                println!("  ❌ Failed {} port {}: {}", proto, port, err_msg);
                all_success = false;
                mappings.push(PortMappingResult {
                    port: *port,
                    protocol: proto.to_string(),
                    success: false,
                    error: Some(err_msg),
                });
            }
        }
    }

    Ok(UPnPForwardResult {
        gateway: UPnPGatewayInfo {
            gateway_address: gateway.addr.to_string(),
            external_ip,
            available: true,
        },
        mappings,
        all_success,
    })
}

/// Remove UPnP port mappings for a server
#[tauri::command]
pub async fn remove_server_port_forwards(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<PortMappingResult>, String> {
    println!("🔌 Removing UPnP port forwards for server {}", server_id);

    let (game_port, query_port, rcon_port): (i64, i64, i64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT game_port, query_port, rcon_port FROM servers WHERE id = ?1",
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
                println!("  ✅ Removed {} port {}", proto, port);
                results.push(PortMappingResult {
                    port: *port,
                    protocol: proto.to_string(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                println!("  ⚠️ Could not remove {} port {}: {}", proto, port, e);
                results.push(PortMappingResult {
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

/// Get the local IPv4 address (best guess)
fn get_local_ip() -> std::net::Ipv4Addr {
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
