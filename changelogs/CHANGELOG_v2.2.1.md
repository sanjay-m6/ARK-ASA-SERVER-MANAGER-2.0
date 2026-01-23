# 🎮 ARK ASA Server Manager - Changelog

## Version 2.2.1 - Bug Fixes & Crossplay Support

### 🐛 Bug Fixes

**Server Configuration Issues (Fixed)**
- 🗺️ **Map Selection Not Saving** - Fixed issue where changing the map (e.g., to Valguero) was ignored and server always started with LostColony. Map selection now properly saves and applies.
- 🔢 **Wrong Port Displayed** - Fixed port display showing 7777 instead of the configured port (e.g., 33000). Ports now correctly sync between config and server overview.
- 🔐 **Admin Password Resetting** - Fixed bug where Admin Password kept reverting to `admin123`. Password changes now persist correctly.
- 🖥️ **Server Overview Showing Wrong Map** - Fixed Overview displaying "TheIsland" regardless of actual map selection.

**Config Editor Improvements (Fixed)**
- ⌨️ **Text Input Focus Issue** - Fixed bug where typing in Server Name and Password fields only allowed one character at a time before losing focus. Text fields now work normally.
- 🎛️ **Boolean Toggle Alignment** - Fixed UI layout bug where toggle switches were misaligned with long description text.
- ⚔️ **Duplicate "Enable PvP Gamma"** - Removed duplicate entry appearing in both PvE and PvP sections.

---

### ✨ New Features

**🎮 Crossplay Support Added**
- Added **Crossplay toggle** in the Install Server wizard (Step 2: Server Details)
  - 🖥️ **PC Only** - Steam/Epic players
  - 🎮 **Crossplay** - PC + Xbox + PlayStation players together
- Added **Enable Crossplay** setting in Config Editor under Server Identity section
- Allows Xbox, PlayStation, and PC (Epic/Steam) players to join the same server

---

### 📝 Notes
- Crossplay requires the server to use Epic/Xbox crossplay binaries
- Hot reload enabled - changes apply without restart

---

*Report bugs in #bug-reports | Feature requests in #suggestions*
