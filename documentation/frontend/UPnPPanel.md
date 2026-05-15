# UPnP Port Forwarding

The UPnP (Universal Plug and Play) module simplifies the complex process of opening router ports, which is required for your ARK server to be visible in the public server list.

## Automated Discovery

When you open the UPnP Panel, the manager will attempt to locate your gateway (router) on the local network.
- **Requirements**: UPnP must be enabled in your router's firmware settings.
- **Status Check**: The panel will report whether a compatible gateway was found and its public IP address.

## Managing Port Forwards

The panel displays a list of all active servers and their required ports:
- **Game Port (UDP)**
- **Query Port (UDP)**
- **RCON Port (TCP)**

### Applying Rules
Click **"Open Ports"** for a specific server, and the manager will request the router to create temporary port mapping rules. This eliminates the need to manually log in to your router's administration page.

### Manual Rules
If UPnP is disabled or unsupported, the panel provides instructions and the exact values needed to create manual port forwarding rules.

## Security Considerations

- **Lease Duration**: The manager requests ports with a specific "lease time." If the manager is closed, the ports will eventually be closed by the router for security.
- **Port Conflict Detection**: The manager checks if another application is already using the required ports before attempting to forward them.

---
*Note: UPnP is a convenience feature. For permanent production servers, manual port forwarding is often more reliable.*
