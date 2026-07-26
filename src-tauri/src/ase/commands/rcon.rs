use crate::AppState;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;
use tauri::State;

/// Source RCON packet types
const SERVERDATA_AUTH: i32 = 3;
const SERVERDATA_EXECCOMMAND: i32 = 2;
const SERVERDATA_RESPONSE_VALUE: i32 = 0;

/// Build a Source RCON binary packet
/// Format: [4 size][4 id][4 type][body\0][\0]
fn build_rcon_packet(id: i32, packet_type: i32, body: &str) -> Vec<u8> {
    let body_bytes = body.as_bytes();
    // Size = 4 (id) + 4 (type) + body_len + 1 (body null) + 1 (empty string null)
    let size = 4 + 4 + body_bytes.len() as i32 + 1 + 1;

    let mut packet = Vec::with_capacity(size as usize + 4);
    packet.extend_from_slice(&size.to_le_bytes());
    packet.extend_from_slice(&id.to_le_bytes());
    packet.extend_from_slice(&packet_type.to_le_bytes());
    packet.extend_from_slice(body_bytes);
    packet.push(0); // Body null terminator
    packet.push(0); // Empty string terminator

    packet
}

/// Read a single RCON response packet from the stream
/// Returns (id, type, body)
fn read_rcon_packet(stream: &mut TcpStream) -> Result<(i32, i32, String), String> {
    let mut size_buf = [0u8; 4];
    stream
        .read_exact(&mut size_buf)
        .map_err(|e| format!("Failed to read packet size: {}", e))?;
    let size = i32::from_le_bytes(size_buf) as usize;

    if size < 10 || size > 4096 {
        return Err(format!("Invalid RCON packet size: {}", size));
    }

    let mut body_buf = vec![0u8; size];
    stream
        .read_exact(&mut body_buf)
        .map_err(|e| format!("Failed to read packet body: {}", e))?;

    let id = i32::from_le_bytes([body_buf[0], body_buf[1], body_buf[2], body_buf[3]]);
    let ptype = i32::from_le_bytes([body_buf[4], body_buf[5], body_buf[6], body_buf[7]]);

    // Body starts at byte 8, ends before the two null terminators
    let body_end = if size > 10 { size - 2 } else { 8 };
    let body = String::from_utf8_lossy(&body_buf[8..body_end]).to_string();

    Ok((id, ptype, body))
}

/// Connect and authenticate with the RCON server, then send a command
fn rcon_exec(host: &str, port: u16, password: &str, command: &str) -> Result<String, String> {
    let addr = format!("{}:{}", host, port);
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Invalid address: {}", e))?,
        Duration::from_secs(5),
    )
    .map_err(|e| format!("RCON connection failed to {}: {}", addr, e))?;

    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| format!("Failed to set write timeout: {}", e))?;

    // Step 1: Authenticate
    let auth_packet = build_rcon_packet(1, SERVERDATA_AUTH, password);
    stream
        .write_all(&auth_packet)
        .map_err(|e| format!("Failed to send auth packet: {}", e))?;
    stream.flush().map_err(|e| format!("Flush failed: {}", e))?;

    // Read auth response — server may send an empty RESPONSE_VALUE first, then AUTH_RESPONSE
    let (id1, _type1, _body1) = read_rcon_packet(&mut stream)?;

    // Some implementations send two packets for auth: an empty RESPONSE_VALUE then AUTH_RESPONSE
    // If first response ID is -1, auth failed immediately
    if id1 == -1 {
        return Err("RCON authentication failed: incorrect password".to_string());
    }

    // Check if we got the actual auth response or need to read another packet
    if _type1 == SERVERDATA_RESPONSE_VALUE {
        // This is the empty RESPONSE_VALUE, read the real AUTH_RESPONSE
        let (id2, _type2, _body2) = read_rcon_packet(&mut stream)?;
        if id2 == -1 {
            return Err("RCON authentication failed: incorrect password".to_string());
        }
    }

    // Step 2: Execute command
    let exec_packet = build_rcon_packet(2, SERVERDATA_EXECCOMMAND, command);
    stream
        .write_all(&exec_packet)
        .map_err(|e| format!("Failed to send exec packet: {}", e))?;
    stream.flush().map_err(|e| format!("Flush failed: {}", e))?;

    // Step 3: Read response(s)
    let mut full_response = String::new();

    // Read packets until we get an empty response or timeout
    loop {
        match read_rcon_packet(&mut stream) {
            Ok((_id, _ptype, body)) => {
                if body.is_empty() {
                    break;
                }
                full_response.push_str(&body);

                // Most ARK commands return a single packet
                // Try to read more but don't block forever
                stream
                    .set_read_timeout(Some(Duration::from_millis(500)))
                    .ok();
            }
            Err(_) => {
                // Timeout reading next packet — this is expected after final response
                break;
            }
        }
    }

    Ok(full_response)
}

#[tauri::command]
pub async fn connect_ase_rcon(server_id: i64, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let (rcon_port, admin_password): (u16, String) = conn
        .query_row(
            "SELECT rcon_port, admin_password FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    // Test connection with a simple command
    let result = rcon_exec("127.0.0.1", rcon_port, &admin_password, "GetChat")?;
    Ok(format!("Connected to RCON on port {}. Response: {}", rcon_port, result))
}

pub async fn send_ase_rcon_internal(server_id: i64, command: &str, state: &AppState) -> Result<String, String> {
    let mut command_owned = command.to_string();

    // Sanitize broadcast command syntax (wrap message in quotes if it has spaces or is not quoted)
    let trimmed = command_owned.trim();
    let lower = trimmed.to_lowercase();
    if lower.starts_with("broadcast ") {
        let msg = &trimmed[10..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("Broadcast \"{}\"", msg_trimmed);
        }
    } else if lower.starts_with("cheat broadcast ") {
        let msg = &trimmed[16..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("Broadcast \"{}\"", msg_trimmed);
        }
    } else if lower.starts_with("admincheat broadcast ") {
        let msg = &trimmed[21..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("Broadcast \"{}\"", msg_trimmed);
        }
    } else if lower.starts_with("serverchat ") {
        let msg = &trimmed[11..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("ServerChat \"{}\"", msg_trimmed);
        }
    } else if lower.starts_with("cheat serverchat ") {
        let msg = &trimmed[17..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("ServerChat \"{}\"", msg_trimmed);
        }
    } else if lower.starts_with("admincheat serverchat ") {
        let msg = &trimmed[22..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("ServerChat \"{}\"", msg_trimmed);
        }
    } else if lower.starts_with("serverchatsilent ") {
        let msg = &trimmed[17..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("ServerChatSilent \"{}\"", msg_trimmed);
        }
    } else if lower.starts_with("cheat serverchatsilent ") {
        let msg = &trimmed[23..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("ServerChatSilent \"{}\"", msg_trimmed);
        }
    } else if lower.starts_with("admincheat serverchatsilent ") {
        let msg = &trimmed[28..];
        let msg_trimmed = msg.trim();
        if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
            command_owned = format!("ServerChatSilent \"{}\"", msg_trimmed);
        }
    }

    if command_owned.trim().eq_ignore_ascii_case("DoExit") {
        use tauri::Manager;
        if let Some(guardian) = state.app_handle.try_state::<crate::services::guardian::GuardianState>() {
            let guard = guardian.0.lock().await;
            guard.mark_as_stopping(-server_id).await;
        }
        state.process_manager.set_pending_stop_reason(server_id, crate::services::process_manager::StopReason::UserAction);
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let (rcon_port, admin_password): (u16, String) = conn
        .query_row(
            "SELECT rcon_port, admin_password FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    rcon_exec("127.0.0.1", rcon_port, &admin_password, &command_owned)
}

#[tauri::command]
pub async fn send_ase_rcon(server_id: i64, command: String, state: State<'_, AppState>) -> Result<String, String> {
    send_ase_rcon_internal(server_id, &command, &state).await
}
