# 🧩 Mod Manager Page

The Mod Manager provides a seamless interface for managing ARK: Survival Ascended mods via the CurseForge API.

## 📝 Component Overview
- **File Path**: `src/pages/ModManager.tsx`
- **Data Source**: CurseForge Eternal API (via Tauri Backend).
- **Sub-components**: `ModCard`, `ModSearch`, `ModpackManager`.

## 🚀 Key Features

### 1. CurseForge Search Integration
- **Direct Search**: Browse thousands of mods directly within the manager.
- **Filter & Sort**: Filter by category, popularity, or last updated date.
- **Mod Details**: View descriptions, screenshots, and version history.

### 2. Mod Installation & Updates
- **One-Click Install**: Automatically adds mod IDs to the server configuration.
- **Update Checker**: Compares local mod versions with the latest on CurseForge.
- **Mass Update**: Update all mods for a specific server with a single click.

### 3. Modpacks (Import/Export)
- **Serialization**: Export a server's mod list as a JSON modpack.
- **Easy Sharing**: Import modpacks to quickly replicate server setups.
- **Automatic Downloading**: When a modpack is imported, the manager triggers background downloads for all contained mods.

### 4. Dependency Management
- **Auto-Resolve**: Detects if a mod requires another (dependency) and prompts for installation.
- **Load Order**: Visual drag-and-drop to reorder mods, which modifies the `-mods` launch parameter.

## 🛠️ Technical Details

### CurseForge Bridge
The frontend does not call CurseForge directly to avoid CORS and secret exposure. It uses a Tauri IPC bridge:
```typescript
const searchResult = await invoke('curseforge_search', { query: 'stacking' });
```

### Configuration Sync
Mods are stored in the server's `GameUserSettings.ini` under the `[ModInstaller]` section and passed as a command-line argument `-mods=ID1,ID2`. The manager ensures these two are always in sync.

## 🎨 UI/UX Patterns
- **Thumbnail Previews**: Rich visual grid for browsing mods.
- **Conflict Highlighting**: Red borders on mods that are known to conflict or have missing dependencies.
- **Async Loading**: Infinite scroll for search results to maintain performance.
