use std::io;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;
use bytes::{Buf, BufMut, BytesMut};

const PACKET_TYPE_AUTH: i32 = 3;
const PACKET_TYPE_AUTH_RESPONSE: i32 = 2;
const PACKET_TYPE_EXEC_COMMAND: i32 = 2;
const PACKET_TYPE_RESPONSE_VALUE: i32 = 0;

/// Default timeout for waiting for auth response
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
/// Wait this long after receiving the first packet to see if more packets are coming (Multi-packet response)
const FRAGMENT_TIMEOUT: Duration = Duration::from_millis(50);
/// Absolute max wait time for a single command to complete all its fragments
const COMMAND_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug)]
pub struct ArkRconClient {
    stream: TcpStream,
    next_id: i32,
    buffer: BytesMut,
}

#[derive(Debug, Clone)]
pub struct RconPacket {
    pub id: i32,
    pub p_type: i32,
    pub body: String,
}

impl ArkRconClient {
    /// Connects to the RCON server and performs authentication.
    pub async fn connect(address: &str, password: &str) -> Result<Self, String> {
        let stream = match timeout(Duration::from_secs(10), TcpStream::connect(address)).await {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => return Err(format!("Connection Refused: {}", e)),
            Err(_) => return Err("Connection Timed Out: Server not reachable or firewall blocked".to_string()),
        };

        let mut client = Self {
            stream,
            next_id: 1,
            buffer: BytesMut::with_capacity(4096),
        };

        // Authenticate
        client.authenticate(password).await?;

        Ok(client)
    }

    /// Performs the Source RCON authentication sequence
    async fn authenticate(&mut self, password: &str) -> Result<(), String> {
        let auth_id = self.get_next_id();
        self.send_packet(auth_id, PACKET_TYPE_AUTH, password).await
            .map_err(|e| format!("Socket Closed during auth: {}", e))?;

        // Wait for auth response
        match timeout(AUTH_TIMEOUT, self.read_auth_response(auth_id)).await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(e),
            Err(_) => Err("Timeout Waiting For Response during authentication".to_string()),
        }
    }

    async fn read_auth_response(&mut self, expected_id: i32) -> Result<(), String> {
        loop {
            let packet = self.read_packet().await
                .map_err(|e| format!("Packet Parse Failed: {}", e))?;

            if packet.p_type == PACKET_TYPE_RESPONSE_VALUE {
                // Ignore the empty response value sent before auth response
                continue;
            }

            if packet.p_type == PACKET_TYPE_AUTH_RESPONSE {
                if packet.id == -1 {
                    return Err("Authentication Failed: Invalid RCON Password".to_string());
                } else if packet.id == expected_id {
                    return Ok(());
                } else {
                    return Err(format!("Authentication Failed: ID mismatch (expected {}, got {})", expected_id, packet.id));
                }
            }

            log::warn!("[RCON] Unexpected packet type during auth: {}", packet.p_type);
        }
    }

    /// Sends a command to the server and returns the aggregated response
    pub async fn send_command(&mut self, command: &str) -> Result<String, String> {
        let id = self.get_next_id();
        self.send_packet(id, PACKET_TYPE_EXEC_COMMAND, command).await
            .map_err(|e| format!("Socket Closed during command send: {}", e))?;

        // Aggregate multi-packet responses.
        // ASA often splits large outputs (like ListPlayers) but does NOT send an empty sentinel packet.
        // We wait up to COMMAND_TIMEOUT for the first response, then wait FRAGMENT_TIMEOUT for subsequent fragments.
        let mut response_body = String::new();
        
        let mut first_packet = true;
        let command_start = std::time::Instant::now();

        loop {
            if command_start.elapsed() > COMMAND_TIMEOUT {
                log::warn!("[RCON] Command timeout reached while reading fragments.");
                break;
            }

            let timeout_duration = if first_packet { COMMAND_TIMEOUT } else { FRAGMENT_TIMEOUT };

            match timeout(timeout_duration, self.read_packet()).await {
                Ok(Ok(packet)) => {
                    if packet.id == id && packet.p_type == PACKET_TYPE_RESPONSE_VALUE {
                        response_body.push_str(&packet.body);
                        first_packet = false;
                    } else {
                        log::warn!("[RCON] Ignored out-of-sequence packet (ID: {}, Expected: {})", packet.id, id);
                    }
                }
                Ok(Err(e)) => {
                    return Err(format!("Socket Closed or Invalid Packet Size: {}", e));
                }
                Err(_) => {
                    // Timeout occurred. 
                    if first_packet {
                        return Err("Timeout Waiting For Response".to_string());
                    } else {
                        // Timeout on fragment means we probably reached the end of the ASA multi-packet response
                        break;
                    }
                }
            }
        }

        Ok(response_body)
    }

    /// Reads exactly n bytes into the buffer
    async fn read_exact_bytes(&mut self, n: usize) -> io::Result<()> {
        while self.buffer.len() < n {
            let mut temp_buf = [0u8; 1024];
            let read_bytes = self.stream.read(&mut temp_buf).await?;
            if read_bytes == 0 {
                return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "Connection closed by server"));
            }
            self.buffer.put_slice(&temp_buf[..read_bytes]);
        }
        Ok(())
    }

    /// Reads a single packet from the stream
    async fn read_packet(&mut self) -> io::Result<RconPacket> {
        // Read 4-byte size
        self.read_exact_bytes(4).await?;
        let size = self.buffer.get_i32_le() as usize;

        if size < 10 || size > 8192 {
            return Err(io::Error::new(io::ErrorKind::InvalidData, format!("Invalid Packet Size: {}", size)));
        }

        // Read the rest of the packet
        self.read_exact_bytes(size).await?;

        let id = self.buffer.get_i32_le();
        let p_type = self.buffer.get_i32_le();

        let body_len = size - 10;
        let mut body_bytes = vec![0u8; body_len];
        self.buffer.copy_to_slice(&mut body_bytes);

        // Read two null terminators
        let _null1 = self.buffer.get_u8();
        let _null2 = self.buffer.get_u8();

        // ASA sends non-UTF8 characters often. Use lossy conversion to prevent crashes!
        let body = String::from_utf8_lossy(&body_bytes).trim_end_matches('\0').to_string();

        log::debug!("[RCON Debug] Received Packet - ID: {}, Type: {}, Size: {}", id, p_type, size);

        Ok(RconPacket {
            id,
            p_type,
            body,
        })
    }

    /// Sends a serialized packet to the stream
    async fn send_packet(&mut self, id: i32, p_type: i32, body: &str) -> io::Result<()> {
        let body_bytes = body.as_bytes();
        let size = 10 + body_bytes.len() as i32; // id (4) + type (4) + body (len) + null (1) + null (1)

        let mut buf = BytesMut::with_capacity((size + 4) as usize);
        buf.put_i32_le(size);
        buf.put_i32_le(id);
        buf.put_i32_le(p_type);
        buf.put_slice(body_bytes);
        buf.put_u8(0);
        buf.put_u8(0);

        log::debug!("[RCON Debug] Sending Packet - ID: {}, Type: {}, Size: {}", id, p_type, size);

        self.stream.write_all(&buf).await?;
        self.stream.flush().await?;
        Ok(())
    }

    fn get_next_id(&mut self) -> i32 {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1);
        if self.next_id <= 0 {
            self.next_id = 1;
        }
        id
    }
}
