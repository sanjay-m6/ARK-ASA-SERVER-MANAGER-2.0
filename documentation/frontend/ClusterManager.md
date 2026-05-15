# Cluster Management

The Cluster Manager allows you to link multiple server instances together, enabling players to travel between different maps with their characters, items, and tamed creatures.

## Creating a Cluster

To start a cluster, you must first define a **Cluster ID**. This unique string identifies your network of servers and ensures that data is shared correctly.

### Cluster Path
The "Cluster Path" is a shared folder on your disk where the game stores player profile data and items currently in transit (uploaded to the Obelisk).
- **Recommendation**: Use a fast SSD for the cluster path to minimize "character loss" issues during transfers.
- **Shared Storage**: Ensure all servers in the cluster have full read/write permissions to this directory.

## Adding Servers to a Cluster

Once a cluster is created, you can add servers to it:
1. Select the target server from the dropdown.
2. The manager will automatically apply the `-clusterid=` and `-ClusterDirOverride=` startup arguments.
3. Ensure that **"Cross-Travel"** is enabled in the server's configuration settings.

## Cross-Chat Integration

One of the premier features of the Cluster Manager is **Integrated Cross-Chat**.
- When enabled, players on "Server A" can see and reply to chat messages from "Server B."
- Requires a configured RCON connection for each server.
- Supports Discord bridge synchronization, allowing your Discord members to chat with players across the entire cluster.

## Monitoring Cluster Health

- **Active Transfers**: View a live list of players currently transitioning between servers.
- **Sync Status**: The manager monitors the timestamp of profile files in the cluster directory to ensure data is propagating correctly between instances.
- **Connectivity Check**: Verifies that all servers in the cluster are reachable on their respective ports to prevent "transfer loops" or character timeouts.

---
*Important: All servers in a cluster MUST share the same mod list for a seamless player experience. Mismatched mods will cause players to be kicked during transfer.*
