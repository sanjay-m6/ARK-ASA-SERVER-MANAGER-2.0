# Release v2.1.4

## 🐛 Bug Fixes
- Fixed server status display - now correctly shows RUNNING/STOPPED status
- Fixed column index bug in database query for server status

## 🧩 Mod System Improvements
- Mods are now passed to server even if not pre-installed
- ARK/CFCore will auto-download missing mods on server start

## 📊 Logs Console (Complete Rework)
- Real-time log streaming from server
- Server selector dropdown
- Filter by log level (Info/Warning/Error/CFCore)
- Text search functionality
- Auto-scroll toggle
- Export logs to file
- RCON command panel with history (↑↓ keys)
- Quick actions (SaveWorld, ListPlayers, Broadcast, etc.)

## 💾 Backups & Rollbacks (Complete Rework)
- Stats dashboard (total backups, storage used, last backup)
- Backup options panel (include configs, saves, mods, compression)
- Preview backup contents before restoring
- Verify backup integrity
- Cleanup old backups (keep last N)
- Modern glass panel UI with animations

## ⚠️ Known Issues
- CFCore "No machine id" error requires running server as admin first
