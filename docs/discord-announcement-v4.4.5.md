## 📢 ASA Server Manager – v4.4.5 Announcement

Hey survivors!
A major new update for **ASA Server Manager** is now live, packed with powerful new tools, expanded ASE support, and critical UI fixes.

---

### 🔁 New: ASE Server Cloning & Clustering

- **One‑click server cloning**
  - Duplicate any existing ASE server via the new **Clone Options Modal**.
  - Customize the session name, ports, query port, RCON port, and more during cloning.
- **Cluster integration**
  - Cloned servers can be directly assigned to existing or new clusters for seamless cross‑server travel and shared save data.

---

### 🧩 New: Plugin Manager

- **Full plugin lifecycle management**
  - Browse, search, install, uninstall, configure, and enable/disable server plugins all from within the manager.
- **Per‑server plugin configuration**
  - Each server maintains its own independent plugin state and configuration.

---

### 💥 New: Infinity Floating Damage System

- **Premium damage indicator customization**
  - Fine‑tune in‑game floating damage numbers: colors, sizes, outlines, glow effects, animations, and fonts.
- **Critical hit & boss damage styling**
  - Configure threshold values, size multipliers, particle effects, screen flash, and screen shake for critical hits and boss encounters.
- **Healing, XP, harvest & loot visuals**
  - Customize floating text for healing, XP gains, harvesting, and loot pickups independently.
- **Preset system**
  - Quickly apply Official, PvP, MMO, Boss Hunter, or Infinity Premium presets.
- **Live preview**
  - See your changes in real‑time before saving.

---

### 🎨 New: Custom GUI Color Picker

- Replaced the native HTML color picker (which was blocked by Tauri/WebView2) with a **premium in‑app color picker**.
- Features color preset swatches, RGB range sliders, and manual Hex text input.
- Works seamlessly across all color fields in the manager.

---

### 🐛 Bug Fixes

- **Input focus hijacking resolved**
  - Fixed an issue where search/filter inputs, text fields, and color selectors were unresponsive due to Tauri WebView2 keypress interception.
  - Category filters, MOTD editors, and configuration text inputs now accept keyboard input correctly.
- **Dropdown functionality restored**
  - Fixed non‑functional dropdown menus across several configuration pages.

---

### 📥 Download

Grab the latest `.msi` or `.exe` installer from the **Releases** page:
🔗 https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases/tag/v4.4.5

---

If you run into any issues or have suggestions, please share them in this channel.
Thanks for helping us make **ASA Server Manager** better with every release! 🎮
