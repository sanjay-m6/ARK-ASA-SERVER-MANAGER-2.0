# 🌐 UPnP Port Forwarding Page

The UPnP (Universal Plug and Play) Panel automates the complex process of configuring home routers for external server access, eliminating the need for manual port forwarding.

## 📝 Component Overview
- **File Path**: `src/pages/tools/UPnPPanel.tsx`
- **Core Requirement**: A router with UPnP/IGD (Internet Gateway Device) protocol enabled.
- **Features**: Gateway Discovery, Automated Multi-Port Mapping, External IP Detection, Mapping Lifecycle Management.

## 🚀 Key Features

### 1. Gateway Discovery (📡)
- **Automatic Scanning**: Detects the local router's IP and identifies if it supports the UPnP protocol.
- **Status Indicators**: Real-time feedback on whether a gateway is "Available" or "Offline".
- **External IP Detection**: Automatically retrieves the user's public IP address, useful for sharing server connection details.

### 2. Automated Forwarding (🚀)
- **One-Click Configuration**: Automatically maps all required ports for a selected server:
    - **Game Port** (UDP)
    - **Query Port** (UDP)
    - **RCON Port** (TCP)
- **Bulk Action**: Forwards all three ports simultaneously using the `forwardServerPorts` Tauri command.

### 3. Real-time Results Dashboard
- **Mapping Verification**: Displays a detailed list of results for each port, showing a checkmark (✅) for success or a cross (❌) with a specific error message (e.g., "Conflict", "Not Supported").
- **Protocol Awareness**: Correctly distinguishes between UDP (Game/Query) and TCP (RCON) requirements.

### 4. Lifecycle Management
- **Manual Removal**: Allows users to clear active port mappings when a server is no longer needed.
- **Lease Awareness**: Includes built-in warnings about the temporary nature of UPnP leases (typically 24 hours).

## 🛠️ Technical Details

### Backend Integration
The panel communicates with the Rust backend using the `igupnp` crate or similar local networking implementation:
```typescript
const result = await forwardServerPorts(selectedServerId);
```

### Protocol Details
- **Game Port**: 7777 (Default UDP)
- **Query Port**: 27015 (Default UDP)
- **RCON Port**: 27020 (Default TCP)

## 🎨 UI/UX Patterns
- **Glow Accents**: Uses a "Cyan to Teal" gradient theme to symbolize network connectivity and flow.
- **Status Pulse**: A pulsating green dot indicates an active and verified gateway connection.
- **Safety Alerts**: Amber-colored informational boxes explain the technical limitations of UPnP for non-technical users.
