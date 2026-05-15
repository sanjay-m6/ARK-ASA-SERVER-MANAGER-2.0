# 🔌 Plugin Manager Page

The Plugin Manager provides a streamlined interface for managing server-side plugins based on the ASA Server API (formerly Ark Server API). It allows for easy installation, enabling/disabling, and removal of plugins.

## 📝 Component Overview
- **File Path**: `src/pages/PluginManager.tsx`
- **Core Requirement**: ASA Server API (must be installed on the server).
- **Features**: Plugin Archive Import, API Status Detection, Per-Server Plugin Isolation.

## 🚀 Key Features

### 1. API Status Detection
- **Real-time Verification**: Automatically checks if `AsaApi.dll` and the associated directory structure exist within the server's `Binaries/Win64` folder.
- **Installation Prompts**: Provides direct links to the official API download if it is missing.

### 2. Plugin Archive Import
- **Multi-format Support**: Support for importing plugins from `.zip`, `.7z`, and `.rar` archives.
- **Automated Extraction**: The backend automatically extracts the archive into the correct `Plugins` folder, ensuring directory structures remain intact.

### 3. Plugin Management
- **Enable/Disable**: Toggle plugins without deleting them. This works by renaming the plugin's folder or using a `.disabled` flag (depending on the API version).
- **Detail View**: View plugin metadata including author, version, description, and minimum API requirements.
- **One-click Uninstall**: Safely removes the plugin folder and its associated configuration files.

### 4. Official Repository Integration
- **Direct Links**: Quick access to `ark-server-api.com`, the primary hub for community-created ASA plugins.

## 🛠️ Technical Details

### Plugin Directory structure
Plugins are managed within the following relative path:
`ShooterGame/Binaries/Win64/ArkApi/Plugins/`

### Interaction Logic
The frontend uses Tauri commands to manipulate the filesystem:
```typescript
const plugin = await importPluginArchive(selectedServerId, archivePath);
```

## 🎨 UI/UX Patterns
- **Status Banners**: Color-coded banners (Green for Installed, Amber for Missing) at the top of the page provide instant feedback on the API status.
- **Modal Overlays**: Detailed plugin information is presented in a glassmorphic modal with clear action buttons (Enable/Disable, Uninstall).
- **Vibrant Gradients**: Uses a "Violet to Fuchsia" gradient theme to distinguish Plugin management from core Server settings.
