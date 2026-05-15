# 🌐 Cluster Manager Page

The Cluster Manager allows users to link multiple ARK servers into a unified "Cluster," enabling player travel between maps and synchronized features like Cross-Chat and shared Discord bridges.

## 📝 Component Overview
- **File Path**: `src/pages/ClusterManager.tsx`
- **Core Logic**: `src-tauri/src/services/cross_chat.rs` (Backend).
- **Features**: Visual Cluster Builder, Cross-Chat, Configuration Validation, Bulk Lifecycle Controls.

## 🚀 Key Features

### 1. Cluster Creation & Linking
- **Server Selection**: Select two or more servers to form a cluster.
- **Cluster ID**: Automatically generates the `ClusterID` required for the server start arguments.
- **Custom Directory**: Users can specify a custom directory for shared cluster data (e.g., player profile migration files).

### 2. Visual Topology Builder
- **Hierarchy View**: Displays a visual connection between the cluster "Master" and its linked "Slave" servers.
- **Health Indicators**: Shows the real-time status of every server within the cluster at a glance.

### 3. Bulk Lifecycle Controls
- **Start All / Stop All**: Trigger the startup or shutdown sequence for every server in the cluster with a single click.
- **Sequential Startup**: (Backend feature) Servers are started in a staggered sequence to prevent CPU/RAM spikes.

### 4. Cross-Server Chat (BETA)
- **Real-time Sync**: Synchronizes the global chat across all servers in the cluster using RCON. 
- **Formatting**: In-game messages are prefixed with the source server's name (e.g., `[The Island] Player: Hello`).
- **Toggle**: Can be enabled or disabled per cluster.

### 5. Cluster Configuration Validation
- **Conflict Scanning**: Automatically checks for:
    - Port overlaps between clustered servers.
    - Missing common configuration keys (e.g., `NoTributeDownloads`).
    - Inconsistent Mod IDs across the cluster (optional check).

## 🎨 UI/UX Patterns
- **Gradient Accents**: Uses Rose/Pink gradients to distinguish Cluster management from individual Server management.
- **Collapsible Discord Settings**: The Discord Bot integration for the cluster is hidden behind a collapsible panel to keep the UI clean.
- **Visual Validation Dialogs**: Errors are presented in a structured dialog with clear icons (❌ for Errors, ⚠️ for Warnings).
