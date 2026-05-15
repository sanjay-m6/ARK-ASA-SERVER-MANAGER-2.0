# ⚙️ Settings Page

The Settings page serves as the global configuration hub for the application, handling API integrations, security, language, and automated software updates.

## 📝 Component Overview
- **File Path**: `src/pages/Settings.tsx`
- **Associated Components**: `FirewallSettings`, `CloudBackupDashboard`.
- **Features**: API Key Management, Firewall Automation, Software Update System, I18n Localization.

## 🚀 Key Features

### 1. API Integration Management
- **Steam Web API**: Required for checking server software updates and identifying Steam users.
- **CurseForge API**: Essential for the Mod Manager; allows searching, downloading, and updating ARK mods.
- **NVIDIA AI API**: Powers the Infinity AI Assistant, enabling autonomous server management and "Smart Search" features.
- **Verification**: Built-in verification logic for CurseForge keys to ensure connectivity before saving.

### 2. Firewall Automation (🛡️)
- **Automatic Rules**: Automatically detects required ports based on server configurations and creates the necessary Windows Firewall exceptions.
- **Cleanup**: Allows for mass-deletion of old or orphaned server rules.

### 3. Software Update System (🔄)
- **Check Now**: Manually trigger a check against the GitHub releases API.
- **Auto-Update**: Background worker that silently downloads and prepares updates, prompting the user for a restart when ready.
- **Update History**: A detailed log of installed, skipped, or failed updates with version numbers and timestamps.

### 4. Cloud Backup Configuration (☁️)
- **Provider Setup**: Link the application to cloud storage providers (e.g., Google Drive, Dropbox) for off-site backup redundancy.
- **Dashboard**: Real-time view of cloud storage usage and last-sync status.

### 5. Localization (🌐)
- **Multi-language Support**: Toggle between supported languages (English, Turkish, German, etc.) with instant UI updates using `react-i18next`.

## 🛠️ Technical Details

### Settings Persistence
Settings are stored in a local SQLite database and retrieved using the `get_setting` and `set_setting` Tauri commands.
```typescript
await setSetting('curseforge_api_key', curseforgeApiKey);
```

### Security Pattern
Sensitive keys are masked in the UI by default and can be toggled for viewing. All keys are stored locally on the user's machine and are never transmitted to any third-party server other than the intended API provider (Steam/CurseForge/NVIDIA).

## 🎨 UI/UX Patterns
- **Tabbed Interface**: Organizes complex settings into logical categories (API, Firewall, Updates, etc.) to prevent information overload.
- **Key Status Indicators**: Real-time feedback on API key validity (Valid ✅ / Invalid ❌).
- **Gradient Typography**: Distinctive "Sky to Violet" gradient for the page header to match the prestige theme.
