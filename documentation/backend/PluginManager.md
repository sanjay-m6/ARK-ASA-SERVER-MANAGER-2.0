# 🔌 Plugin Manager Service

The Plugin Manager service is a filesystem intelligence utility that detects and validates the presence of server-side extensions and API frameworks (such as ArkApi for ASA).

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/plugin_manager.rs`
- **Mechanism**: Path-Aware Filesystem Discovery.
- **Core Functionality**: Plugin Status Verification, Extension Detection.

## 🚀 Key Features

### 1. ArkApi-Ready Discovery (🧩)
The service is hard-coded with the industry-standard directory structures used by ASA server extensions:
- **Primary Path**: Automatically looks for plugins in `ShooterGame/Binaries/Win64/ArkApi/Plugins/`.
- **Flexible Signatures**: Can detect both **Directory-based** plugins (which contain assets and configs) and **Standalone DLL** plugins (which are flat binaries).

### 2. Relational Path Resolution
- **Server Context**: Instead of requiring absolute paths for every check, the service accepts a `server_id` and automatically resolves the physical installation path from the manager's SQLite database.
- **Error Resilience**: Gracefully handles scenarios where server paths have been moved or deleted on the filesystem, returning `false` rather than crashing the calling service.

### 3. Integrated Feature Verification
The Plugin Manager serves as a "Gatekeeper" for other manager features:
- **Anti-Cheat Verification**: Used by the `AntiCheatService` to confirm if required plugins (like `NgcCore`) are installed before enabling advanced detection heuristics.
- **UI Responsiveness**: Allows the frontend to dynamically enable or disable configuration tabs based on which plugins are actually detected on the server binaries.

## 🛠️ Technical Details

### Detection Logic
The service implements a multi-stage check to ensure high accuracy:
```rust
let api_plugin_path = install_path
    .join("ShooterGame/Binaries/Win64/ArkApi/Plugins")
    .join(plugin_name);

// Stage 1: Check for Plugin Directory
if api_plugin_path.exists() { return true; }

// Stage 2: Check for direct DLL file
let dll_path = api_plugin_path.with_extension("dll");
if dll_path.exists() { return true; }
```

## 🎨 Developer Notes
- **Lightweight Implementation**: This service is designed for rapid polling. It performs simple filesystem metadata checks (`exists()`) without opening or reading the files, ensuring minimal I/O impact.
- **Extensibility**: Future updates will include "Plugin Versioning" by reading the `plugininfo.json` file inside detected plugin directories.
