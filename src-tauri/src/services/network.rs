use reqwest::Client;
use std::net::{TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::time::Duration;

pub async fn get_public_ip() -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let ip = client
        .get("https://api.ipify.org")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    Ok(ip)
}

/// Check if an IP address string belongs to a local network interface on this machine.
/// Used to prevent passing public/WAN IPs to `-MultiHome`, which causes UE5/ShooterGame
/// socket bind failures (WSAEADDRNOTAVAIL 10049) and crashes.
pub fn is_local_interface_ip(ip_str: &str) -> bool {
    let trimmed = ip_str.trim();
    if trimmed.is_empty() || trimmed == "0.0.0.0" || trimmed == "127.0.0.1" {
        return true;
    }

    let target_ip: std::net::IpAddr = match trimmed.parse() {
        Ok(ip) => ip,
        Err(_) => return false,
    };

    if target_ip.is_loopback() {
        return true;
    }

    // Check all network interfaces on the host
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_name, iface_ip) in interfaces {
            if iface_ip == target_ip {
                return true;
            }
        }
    } else if let Ok(default_local) = local_ip_address::local_ip() {
        if default_local == target_ip {
            return true;
        }
    }

    false
}

pub fn check_port_open(ip: &str, port: u16) -> bool {
    let addr = format!("{}:{}", ip, port);
    if let Ok(addrs) = addr.to_socket_addrs() {
        for addr in addrs {
            if let Ok(_) = TcpStream::connect_timeout(&addr, Duration::from_secs(2)) {
                return true;
            }
        }
    }
    false
}

/// Check if a local port is already in use by trying to bind to it
pub fn is_port_in_use(port: u16) -> bool {
    if TcpListener::bind(("0.0.0.0", port)).is_err() {
        return true;
    }
    if UdpSocket::bind(("0.0.0.0", port)).is_err() {
        return true;
    }
    false
}

/// Query the server using A2S_INFO protocol to check if it's reachable and ready
/// Returns True if the server responds to the query
pub fn query_server(ip: &str, port: u16) -> bool {
    // A2S_INFO Request: 0xFF 0xFF 0xFF 0xFF 'T' Source Engine Query \0
    let request = [
        0xFF, 0xFF, 0xFF, 0xFF, // Header
        0x54, // 'T' (A2S_INFO)
        0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20, 0x45, 0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51,
        0x75, 0x65, 0x72, 0x79, // "Source Engine Query"
        0x00, // Null terminator
    ];

    match UdpSocket::bind("0.0.0.0:0") {
        Ok(socket) => {
            // Set a short timeout
            if socket.set_read_timeout(Some(Duration::from_secs(2))).is_err() {
                return false;
            }
            if socket.set_write_timeout(Some(Duration::from_secs(2))).is_err() {
                return false;
            }

            let addr = format!("{}:{}", ip, port);
            if socket.connect(addr).is_err() {
                return false;
            }

            if socket.send(&request).is_err() {
                return false;
            }

            let mut buffer = [0u8; 1400];
            match socket.recv(&mut buffer) {
                Ok(size) => {
                    // Verify response header: 0xFF 0xFF 0xFF 0xFF
                    if size > 4
                        && buffer[0] == 0xFF
                        && buffer[1] == 0xFF
                        && buffer[2] == 0xFF
                        && buffer[3] == 0xFF
                    {
                        return true;
                    }
                    false
                }
                Err(_) => false,
            }
        }
        Err(_) => false,
    }
}
