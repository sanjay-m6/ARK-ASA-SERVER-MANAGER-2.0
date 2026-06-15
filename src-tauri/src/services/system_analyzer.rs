use std::path::Path;
use sysinfo::{System, Disks, Networks};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemHardwareSpecs {
    pub os_name: String,
    pub os_version: String,
    pub cpu_brand: String,
    pub cpu_cores: usize,
    pub ram_total_gb: f64,
    pub ram_free_gb: f64,
    pub active_adapter: String,
    pub mac_address: String,
    pub local_ip: String,
    pub destination_free_gb: f64,
    pub destination_total_gb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// Helper to get local IPv4 address by connecting to public DNS
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

/// Retrieves all physical system specifications and disk details for the installation path
pub fn get_system_specs(install_path: &Path) -> SystemHardwareSpecs {
    let mut sys = System::new_all();
    sys.refresh_all();

    // OS info
    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown version".to_string());

    // CPU info
    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    let cpu_cores = sys.cpus().len();

    // Memory info
    let ram_total_gb = (sys.total_memory() as f64) / (1024.0 * 1024.0 * 1024.0);
    let ram_free_gb = (sys.free_memory() as f64) / (1024.0 * 1024.0 * 1024.0);

    // Network specs
    let local_ip = get_local_ip().to_string();
    let networks = Networks::new_with_refreshed_list();
    let mut active_adapter = "Unknown".to_string();
    let mut mac_address = "Unknown".to_string();

    for (interface_name, network) in &networks {
        let mac = network.mac_address().to_string();
        if mac != "00:00:00:00:00:00" && !interface_name.contains("loopback") && !interface_name.contains("lo") {
            active_adapter = interface_name.clone();
            mac_address = mac;
        }
    }

    // Disk space info for specific partition
    let disks = Disks::new_with_refreshed_list();
    let mut dest_free_bytes = 0u64;
    let mut dest_total_bytes = 0u64;
    let mut best_len = 0;
    let mut found_disk = false;

    for disk in disks.list() {
        let mount_path = disk.mount_point();
        if install_path.starts_with(mount_path) {
            let len = mount_path.to_string_lossy().len();
            if len > best_len {
                best_len = len;
                dest_free_bytes = disk.available_space();
                dest_total_bytes = disk.total_space();
                found_disk = true;
            }
        }
    }

    // Fallback if no matching mount point found
    if !found_disk {
        if let Some(disk) = disks.list().first() {
            dest_free_bytes = disk.available_space();
            dest_total_bytes = disk.total_space();
        }
    }

    let destination_free_gb = (dest_free_bytes as f64) / (1024.0 * 1024.0 * 1024.0);
    let destination_total_gb = (dest_total_bytes as f64) / (1024.0 * 1024.0 * 1024.0);

    SystemHardwareSpecs {
        os_name,
        os_version,
        cpu_brand,
        cpu_cores,
        ram_total_gb,
        ram_free_gb,
        active_adapter,
        mac_address,
        local_ip,
        destination_free_gb,
        destination_total_gb,
    }
}

/// Validates server settings and hardware constraints for completeness and correctness
pub fn validate_server_details(
    name: &str,
    map_name: &str,
    game_port: u16,
    query_port: u16,
    rcon_port: u16,
    admin_password: &str,
    specs: &SystemHardwareSpecs,
) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // 1. Validate basic name & map
    if name.trim().is_empty() {
        errors.push("Server name is empty.".to_string());
    }
    if map_name.trim().is_empty() {
        errors.push("Map name is empty.".to_string());
    }

    // 2. Validate ports range and collisions
    if game_port == 0 {
        errors.push("Game port cannot be 0.".to_string());
    }
    if query_port == 0 {
        errors.push("Query port cannot be 0.".to_string());
    }
    if rcon_port == 0 {
        errors.push("RCON port cannot be 0.".to_string());
    }

    if game_port == query_port {
        errors.push(format!("Game Port ({}) and Query Port ({}) collide.", game_port, query_port));
    }
    if game_port == rcon_port {
        errors.push(format!("Game Port ({}) and RCON Port ({}) collide.", game_port, rcon_port));
    }
    if query_port == rcon_port {
        errors.push(format!("Query Port ({}) and RCON Port ({}) collide.", query_port, rcon_port));
    }

    // Standard port range warning (ARK usually uses ports in the range 7777-7788 and 27015)
    // u16 max is 65535, so only the lower bound check is needed
    if game_port < 1024 {
        errors.push(format!("Game port {} is in the privileged range (< 1024).", game_port));
    }
    if query_port < 1024 {
        errors.push(format!("Query port {} is in the privileged range (< 1024).", query_port));
    }
    if rcon_port < 1024 {
        errors.push(format!("RCON port {} is in the privileged range (< 1024).", rcon_port));
    }

    // 3. Admin password validation
    if admin_password.trim().is_empty() {
        errors.push("Admin password is required and cannot be empty.".to_string());
    } else if admin_password.len() < 6 {
        warnings.push("Admin password is very short (< 6 characters) and insecure.".to_string());
    }

    // 4. Disk space validation (ARK typically requires ~60GB free space)
    if specs.destination_free_gb < 50.0 {
        warnings.push(format!(
            "Low disk space: {:.1} GB free. At least 50.0 GB is recommended for server installation.",
            specs.destination_free_gb
        ));
    }

    // 5. Memory validation
    if specs.ram_total_gb < 16.0 {
        warnings.push(format!(
            "Low system memory: {:.1} GB total RAM. At least 16.0 GB is recommended for hosting ARK servers.",
            specs.ram_total_gb
        ));
    }

    ValidationResult {
        is_valid: errors.is_empty(),
        errors,
        warnings,
    }
}
