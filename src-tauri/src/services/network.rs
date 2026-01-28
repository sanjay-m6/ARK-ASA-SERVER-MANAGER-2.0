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

pub fn check_port_open(ip: &str, port: u16) -> bool {
    // Try to connect to the IP:Port
    // Timeout is short because we expect a quick response or fail
    let addr = format!("{}:{}", ip, port);

    // We need to run this in a blocking way or async
    // Since we are likely calling this from an async command, we can use std::net with a timeout

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
    // Check TCP
    if TcpListener::bind(("0.0.0.0", port)).is_err() {
        return true;
    }

    // Check UDP
    if UdpSocket::bind(("0.0.0.0", port)).is_err() {
        return true;
    }

    false
}
