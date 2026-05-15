# 🔌 Plugin Manager

The Plugin Manager is the definitive hub for extending your ARK: Survival Ascended server. Built specifically for the **ASA Server API**, it simplifies the discovery, installation, and management of powerful server-side plugins that add features, improve performance, and enhance community management.

## 📝 Page Overview
- **Route**: `/tools/plugins`
- **Purpose**: Automated ASA Server API detection, one-click plugin importing, and granular per-server plugin orchestration.
- **Aesthetic**: Modern "Fuchsia & Violet" interface featuring glassmorphic cards, interactive status indicators, and integrated repository links.

## 🚀 Key Modules

### 1. ASA Server API Guard (🛡️)
Automated environment verification:
- **Instant Detection**: The manager automatically scans your server installation for the **ASA Server API**. It provides immediate visual feedback on whether the server is ready to host plugins.
- **Dependency Guidance**: If the API is missing, the manager provides direct, high-fidelity links to the official download resources, ensuring you never have to hunt for the correct version.

### 2. Streamlined Plugin Import (📥)
Eliminate the complexity of manual FTP and directory navigation:
- **Universal Archive Support**: Directly import plugins from `.zip`, `.7z`, or `.rar` archives. The manager handles the decompression and placement automatically.
- **Automatic Directory Mapping**: Intelligently identifies the correct `Plugins` folder within your server structure, ensuring every import is perfect every time.
- **Live Progress Tracking**: Features animated loading states and toast notifications that keep you informed throughout the import process.

### 3. Plugin Orchestration Hub (🕹️)
Granular control over your server's capabilities:
- **State Management**: One-click toggles to Enable or Disable plugins without uninstalling them.
- **Dynamic Metadata Cards**: Every plugin is presented with a rich metadata card showing its name, version, author, and description.
- **Safety-First Uninstallation**: Securely remove plugins from your server with a single click, including automated cleanup of associated files.

### 4. Official Repository Integration (🌐)
Stay connected to the plugin ecosystem:
- **Direct Repository Access**: Quick-access links to `ark-server-api.com`, the primary hub for the ASA modding community.
- **Instructional Overlay**: A built-in 3-step guide for new administrators, explaining how to find, import, and activate plugins successfully.

## 🛠️ Interface Controls
- **Server Selector [Select]**: Choose which server instance's plugins you want to manage.
- **Import Plugin [Primary Action]**: Select an archive from your local machine to upload and install.
- **Power Toggle [Switch]**: Enable or disable an installed plugin.
- **Refresh [Button]**: Re-scan the plugin directory for manual changes.
- **Plugin Card [Interactive]**: Click any plugin to view detailed installation paths and compatibility information.

## 🎨 Design Notes
- **Vibrant Gradients**: Uses a sophisticated Fuchsia-to-Violet gradient system for primary actions and headers, distinguishing the modding layer from core server settings.
- **Glassmorphism**: Employs semi-transparent "Glass Panels" with subtle border glows that react to the plugin's active/inactive state.
- **Impact Indicators**: Uses high-contrast emerald checkmarks and amber warning icons to provide instant environmental awareness.
