# 🌐 Network Service

The Network service provides critical connectivity diagnostics, port management, and server discovery tools to ensure that ARK servers are reachable by players and correctly configured for the internet.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/network.rs`
- **Protocol Support**: TCP (Connectivity), UDP (Source Engine Query), HTTP (IP Discovery).
- **Core Functionality**: Public IP Resolution, Port Availability Testing, Server Health Querying (A2S).

## 🚀 Key Features

### 1. External Connectivity Testing (📡)
- **Public IP Resolution**: Automatically fetches the host's WAN IP address via `ipify.org`, allowing the manager to provide ready-to-use "Copy IP" buttons for cluster members.
- **Inbound Port Audit**: Attempts to establish a remote connection to the server's Query and Game ports to verify that Port Forwarding and Firewall rules are correctly configured.

### 2. Smart Port Management
- **Conflict Detection**: Before starting a server, the manager uses the `is_port_in_use` heuristic to check if the target ports are already occupied by another ARK instance or system process.
- **Dual-Protocol Validation**: Since ARK uses both TCP (RCON) and UDP (Query/Game), the service validates availability for both protocols before confirming a port as "Free."

### 3. A2S Server Query (🔍)
The service implements the native **Source Engine Query (A2S_INFO)** protocol to verify the actual state of a running server:
- **UDP Heartbeat**: Sends a specialized binary packet (`0xFFFFFFFFTSource Engine Query\0`) to the server's Query port.
- **Readiness Verification**: A server is only marked as "Online" in the UI once it successfully responds to this query, indicating the engine has fully loaded and is listening for players.
- **Timeout Protection**: Uses a strict 2-second timeout window to prevent unresponsive servers from causing UI lag.

## 🛠️ Technical Details

### A2S Query Packet
The service manually constructs the binary request to minimize dependencies:
```rust
let request = [
    0xFF, 0xFF, 0xFF, 0xFF, // Header
    0x54,                   // 'T' (A2S_INFO)
    0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20, 0x45, 0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51,
    0x75, 0x65, 0x72, 0x79, // "Source Engine Query"
    0x00,                   // Null terminator
];
```

### Local Bind Logic
Verifies port availability by attempting an ephemeral bind:
```rust
pub fn is_port_in_use(port: u16) -> bool {
    TcpListener::bind(("0.0.0.0", port)).is_err() || UdpSocket::bind(("0.0.0.0", port)).is_err()
}
```

## 🎨 Developer Notes
- **Reliability**: IP discovery uses a 5-second timeout and `reqwest` for robust handling of intermittent network issues.
- **Port Ranges**: Administrators should ensure that ports tested by this service are also allowed in the Windows Advanced Firewall and any upstream routers.
