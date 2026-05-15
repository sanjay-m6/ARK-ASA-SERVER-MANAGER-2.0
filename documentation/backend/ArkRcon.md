# 🛰️ Ark RCON Service

The Ark RCON Service provides robust, real-time communication with ARK: Survival Ascended servers using the Source RCON protocol, specifically tuned for ASA's unique quirks.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/ark_rcon.rs`
- **Protocol**: Source RCON (TCP).
- **Core Features**: Command execution, authentication, and multi-packet response aggregation.

## 🚀 Key Features

### 1. ASA-Specific Multi-Packet Handling
Standard Source RCON uses an empty "sentinel" packet to signal the end of a multi-packet response. ARK: Survival Ascended does not always follow this standard.
- **Fragment Aggregation**: The service waits for the first packet, then uses a short `FRAGMENT_TIMEOUT` (50ms) to check for subsequent fragments.
- **Concatenation**: All fragments are combined into a single string before being returned to the caller, ensuring commands like `ListPlayers` return the full list.

### 2. Robust Error Handling
- **UTF-8 Lossy Conversion**: ARK logs often contain non-standard characters. The service uses lossy UTF-8 conversion (`from_utf8_lossy`) to prevent process crashes during string parsing.
- **Timeout Management**:
    - `AUTH_TIMEOUT`: 10 seconds for initial login.
    - `COMMAND_TIMEOUT`: 15 seconds for general commands.
    - `CONNECTION_TIMEOUT`: 10 seconds for initial TCP handshake.

### 3. Authentication Sequence
- **Validation**: Automatically handles the Source RCON auth challenge.
- **Security**: Returns clear errors for invalid passwords or unreachable servers, allowing the frontend to show user-friendly warnings.

## 🛠️ Usage Example (Internal)

```rust
let mut client = ArkRconClient::connect("127.0.0.1:27020", "your_password").await?;
let response = client.send_command("ListPlayers").await?;
println!("Players: {}", response);
```

## ⚠️ Known Quirks & Fixes
- **Empty Responses**: Some commands in ASA return successfully but with an empty body. The service treats this as a valid execution.
- **Large Packets**: ASA can send packets up to 4096 bytes. The service uses a `BytesMut` buffer to safely handle variable-sized responses without memory overflow.
