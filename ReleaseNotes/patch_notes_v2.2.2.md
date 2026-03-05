# 📢 ASA Server Manager Patch v2.2.2 Released!

We've just pushed a critical update addressing several high-priority issues reported by the community. This patch focuses on stability, correct configuration application, and crucial bug fixes.

### 🛡️ **Critical Fixes**

🔹 **Server Settings Not Applying**
*   **Fixed:** Critical bug where servers would run with default 1x settings (harvest, XP, taming, etc.) regardless of UI configuration.
*   **Action:** Config files are now generated with correct Windows line endings (`CRLF`) and pathing to ensure the game reads them properly.

🔹 **Public IP Display**
*   **Fixed:** Dashboard showing `127.0.0.1` instead of your actual Public IP.
*   **Improvement:** The app now correctly detects and saves your Public IP for display, even if the server is still updating or ports are temporarily closed.

🔹 **Administrator Privileges**
*   **Security:** The application now correctly enforces **Administrator Privileges** in Release/Production mode to ensure it has the necessary permissions to manage server processes and files.
*   **Dev Mode:** Developers can now run in Dev mode without Admin prompts for easier testing.

### 🔧 **Feature Fixes & Improvements**

✅ **Mod Manager Restored**
*   Fixed Mod Manager crashing and failing to install mods.
*   Updated CurseForge API integration to use the correct ASA Game ID.
*   Added auto-retry logic for improved reliability during mod downloads.

✅ **Mod Transfers**
*   Added ability to **Copy/Transfer Mods** between server profiles! You can now sync your mod lists instantly.

✅ **Max Player Count**
*   Fixed `MaxPlayers` setting not applying in-game (was stuck at default 70). It is now correctly enforced via launch arguments.

✅ **Per-Level Stats**
*   Fixed custom per-level stats (Health, Weight, etc.) resetting to default after server restarts. Your OP stats will now stick!

✅ **MotD Support**
*   Added a proper editor for **Message of the Day** so you can welcome players to your server properly.

---
**How to Update:**
1. Close your running server manager.
2. Download the latest release.
3. Run the installer (it will update your existing installation).

*Thank you for your feedback! If you find any more issues, please report them in the support channel.* 🦕
