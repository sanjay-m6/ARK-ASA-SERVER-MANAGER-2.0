# Discord Announcement — v2.3.4

Copy the text below and paste it into your Discord #announcements channel.

---

```markdown
@everyone

# 🔐 v2.3.4 Hotfix & UI Update

**Download:** https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases/tag/v2.3.4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 🐛 Critical Bug Fix: Password Corruption
We fixed a critical issue where the **Admin Password** and **Server Password** were getting merged during server startup (e.g., `Admin123?ServerPassword=Ark123`).
* **Clean Passwords:** Passwords now remain fully isolated.
* **Auto-Repair:** If your passwords were corrupted, they will be **automatically fixed** the next time you open the manager!

### 🛑 Smart Port Conflict Detection
* **Dynamic Validation:** The manager now actively checks your network ports before launching a server.
* **Soft Bypass:** If you share ports between multiple offline server profiles, the manager will give you an advisory warning but allow you to "Start Anyway".
* **Hard Block:** If a port is actively being used by another *running* server, the system will block startup to prevent crashes and port conflicts.

### 🔒 Password Security UI
* **Masked Inputs:** Passwords are now hidden by default (`••••••••`).
* **Toggle Visibility:** Added an Eye icon (👁️) to show/hide passwords.
* **Easy Clearing:** You can now fully clear and remove passwords dynamically without breaking the config.

### 🎨 Advanced Config UI Overhaul
The **Advanced Rules** tab has been completely redesigned for a premium experience:
* **Event Profiles:** Saved profiles are now listed in a sleek menu with a **LIVE** badge indicator. 
* **Multiplier Sliders:** Added custom sliders with visual fill bars and inline numeric inputs for precise economic adjustments.
* **Transfer Policy:** Cleaner layout with better text areas and visual disabled states.
* **Feedback:** Added loading spinners and popup toast notifications for all save actions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**How to Update:** Download the latest `.msi` from the link above and run it to upgrade in-place. Enjoy!
```
