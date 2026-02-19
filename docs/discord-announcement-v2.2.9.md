## 📢 ASA Server Manager – v2.2.9 Announcement

Hey survivors!  
A new update for **ASA Server Manager** is now live with important fixes and powerful new features.

---

### ✅ Bug Fixes

- **Server start reliability**
  - Fixed an issue where some servers could fail to start or restart correctly under certain conditions.
  - Startup flow is now more robust and logs clearer error information for easier troubleshooting.

---

### 🛡️ New: Automatic Backup & Safe Rollback

- **Scheduled & automatic backups**
  - Create backups on a schedule (every X hours / daily / weekly) via the **Scheduler** page.
- **Pre‑update safety snapshot**
  - Before scheduled mod updates, the manager automatically creates a **pre‑update backup** of:
    - Save files (maps, players, tribes)
    - Config files (`Game.ini`, `GameUserSettings.ini`)
    - Optional: Mods and cluster data
- **Automatic rollback on failure**
  - If a scheduled mod‑update restart fails, the manager will:
    - Use the most recent pre‑update backup for that server
    - **Roll back** saves + configs
    - Attempt a clean restart using the restored data
- **Backup management UI**
  - `Backups` tab per server with:
    - Date, time, size, and type (manual / auto / pre‑update)
    - Verify button (integrity check)
    - Preview of files inside each backup
    - One‑click **Restore** and **Clean old backups**

---

### 🛠️ New: Admin Access & Command Features

- Improved handling of **admin commands** (RCON + Scheduler tasks).
- Easier setup of **scheduled admin actions**:
  - Announcements
  - Restarts
  - Mod auto‑updates
  - Custom RCON commands
- Designed to work safely together with the new backup/rollback system, so risky operations can be protected by recent backups.

---

### 🌍 Language & Localization Improvements

- Expanded and updated **multi‑language support**:
  - More UI texts translated across dashboards, scheduler, backups, and settings.
  - Confirmation dialogs (restore/delete/cleanup) now use a consistent in‑app style with localized text.
- We’re continuing to improve translations—feedback and contributions are welcome!

---

If you run into any issues or have suggestions, please share them in this channel.  
Thanks for helping us make **ASA Server Manager** more stable, safer, and easier to use for your worlds!

