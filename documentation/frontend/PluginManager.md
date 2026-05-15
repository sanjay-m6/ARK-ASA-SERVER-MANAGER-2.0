# 🔌 Plugin Manager (ASA API)

The Plugin Manager is the dedicated orchestration hub for the ASA Server API ecosystem. It enables administrators to enhance their servers with advanced functionality, custom commands, and community-developed features beyond the standard game engine capabilities.

## 📝 Page Overview
- **Route**: `/tools/plugins`
- **Purpose**: ASA Server API management, automated plugin importation, lifecycle orchestration, and repository bridging.
- **Aesthetic**: Premium "Violet & Fuchsia" interface featuring status-aware audit badges, interactive detail modals, and sequential installation guides.

## 🚀 Key Modules

### 1. API Framework Audit (🛡️)
Ensure your server is ready for advanced extensions:
- **ASA Server API Detection**: The manager automatically scans your server installation to verify if the required ASA Server API framework is installed and functional.
- **One-Click Framework Access**: If the API is missing, the manager provides direct links to the official repository to ensure you are always running the latest compatible version.
- **Per-Server Isolation**: Plugin status and API health are tracked independently for every server instance in your library.

### 2. Intelligent Plugin Importer (📦)
Seamlessly expand your server's capabilities:
- **Archive Ingestion Suite**: Import plugin archives (.zip, .7z, or .rar) directly. The manager handles the extraction and places the files in the correct directory structure automatically.
- **Automated Directory Discovery**: The manager dynamically identifies the specific `Plugins` folder for your selected server, removing the need for manual filesystem navigation.
- **Import Verification**: Every imported plugin is immediately scanned for metadata, updating your library with the plugin's name, version, and author information.

### 3. Lifecycle & State Control (⚙️)
Manage your extension library with precision:
- **Enable/Disable Toggles**: Instantly activate or deactivate specific plugins. The manager handles the technical renaming or move operations required by the ASA API to change a plugin's state.
- **Detailed Plugin Forensics**: Interactive modals allow you to inspect a plugin's description, author, minimum API version requirements, and exact installation path.
- **Safe Uninstallation**: A secure removal engine that completely wipes a plugin's files after administrator confirmation, keeping your server directory clean and optimized.

### 4. Community Bridge & Guides (🌐)
Stay connected to the developer ecosystem:
- **Official Repository Access**: Direct integration with `ark-server-api.com`, allowing you to browse the latest community releases and documentation without leaving the app.
- **Step-by-Step Guides**: Built-in instructions for the manual import workflow, ensuring even new administrators can successfully extend their servers.
- **Restart Coordination**: Includes intelligent reminders that inform you when a server reboot is required to apply changes to your plugin configuration.

## 🛠️ Interface Controls
- **Import Plugin [Download]**: Open the file selector to ingest a new plugin archive.
- **API Status [Badge]**: View the current health of the ASA Server API on your server.
- **Toggle State [Power]**: Enable or disable an installed plugin instantly.
- **Refresh Library [Refresh]**: Perform a fresh scan of the server's plugin directory.
- **Browse Repository [External Link]**: Visit the official community plugin hub.

## 🎨 Design Notes
- **Premium Aesthetic**: Uses vibrant violet and fuchsia gradients to distinguish the "Advanced/Extension" layer of server management.
- **Interactive Modals**: Uses high-fidelity overlays with glassmorphism backgrounds for deep-dives into plugin technical data.
- **Responsive Grids**: Visualizes your plugin library using clean, informative cards that highlight author and version metadata.
