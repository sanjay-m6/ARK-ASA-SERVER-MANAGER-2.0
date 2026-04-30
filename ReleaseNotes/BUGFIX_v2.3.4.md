# 🔐 ARK ASA Server Manager — v2.3.4 Hotfix

## Password Corruption & Advanced Config UI Fix

**Release Date:** 2026-04-30

---

### 🐛 Critical Bug Fix — Password Corruption

**Reported Issue:**
Setting `Server Password = Ark123` and `Admin Password = Admin123` resulted in the Admin Password being corrupted to `Admin123?ServerPassword=Ark123` after every server startup.

**Root Cause:**
The startup command builder in `process_manager.rs` was merging `ServerAdminPassword` and `ServerPassword` into a single concatenated query string instead of treating them as separate parameters.

**Fix Applied Across 3 Layers:**

| Layer | File | Fix |
|-------|------|-----|
| **Startup Args** | `process_manager.rs` | Sanitize admin password with `.split("?ServerPassword=")` before building launch URL |
| **Config Sync** | `commands/config.rs` | Strip `?ServerPassword=` postfix from admin password during DB read/write |
| **INI Generation** | `config_generator.rs` | Write password fields unconditionally (allows clearing passwords) |

**Auto-Repair:** Existing corrupted passwords in the database are automatically detected and repaired on load — no manual intervention needed.

---

### 🔒 Password Security UI

- Password fields now use **masked input** (`••••••••`) by default
- **Show/Hide toggle** (Eye icon) on both Server Password and Admin Password
- Passwords can be **dynamically changed or cleared** without restarting the manager

---

### 🎨 Advanced Configuration Dashboard — UI Overhaul

- **Event Profiles tab** — Added saved profiles list with selection, LIVE badge, "New Profile" button
- **Multiplier Sliders** — Custom slider component with visual fill bars + inline numeric inputs
- **Transfer Policy tab** — Visual disabled states when policy is off, improved layout
- **Structure Overrides tab** — Cleaned up placeholder with informative redirect
- **Toast feedback** — All save/toggle actions now show success/error notifications
- **Loading states** — Spinner indicators on all async buttons

---

### 📋 Files Changed

```
src-tauri/src/commands/config.rs          — Auto-repair corrupted passwords on load
src-tauri/src/services/config_generator.rs — Unconditional password field writing
src-tauri/src/services/process_manager.rs  — Launch argument sanitization
src/components/config/ConfigBuilder.tsx    — SettingPassword component with Eye toggle
src/components/server/AdvancedConfigDashboard.tsx — Full UI rebuild
```

---

*Report bugs in #bug-reports | Feature requests in #suggestions*
