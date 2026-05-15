# 📦 Mod Manager

The Mod Manager is a powerful, integrated bridge to the CurseForge ecosystem, designed to simplify the complex task of discovering, installing, and orchestrating mods for your ARK: Survival Ascended servers.

## 📝 Page Overview
- **Route**: `/mods`
- **Purpose**: CurseForge mod discovery, batch installation, configuration generation, and cross-server mod synchronization.
- **Aesthetic**: Creative "Sky & Violet" interface featuring rich mod imagery, floating progress monitors, and technical configuration previews.

## 🚀 Key Modules

### 1. CurseForge Search & Discovery (🔍)
A high-performance portal to the ARK mod library:
- **Advanced Filtering**: Narrow down thousands of mods by category (e.g., Maps, Dinos, Overhauls, UI) and sort by popularity or update frequency.
- **Rich Metadata**: Every mod card displays high-resolution thumbnails, author information, and full HTML descriptions directly from the CurseForge API.
- **Instant Search**: Debounced search logic ensures you find specific mods instantly as you type.

### 2. High-Efficiency Installation (⚡)
Tools designed for managing large-scale mod lists:
- **Batch Installation**: Select dozens of mods at once and launch a background installation pipeline. A persistent floating bar tracks progress across the entire batch.
- **Advanced ID Input**: Have a list of IDs from a website or Discord? Paste them into the "Advanced Input" sidebar to import your entire mod list in seconds.
- **One-Click Deployment**: Single mods can be installed to specific server instances with automated dependency handling.

### 3. Config Engine & Conflict Scanner (🛡️)
The manager handles the technical heavy lifting of server configuration:
- **Auto-Config Generator**: The manager automatically calculates the correct `ActiveMods` string for your `GameUserSettings.ini` and generates the corresponding startup command-line arguments.
- **Conflict Detection**: A specialized scanner that analyzes your installed mods for known incompatibilities, helping you avoid server crashes before they happen.
- **Manual Control**: Access a "Config Preview" to see exactly what changes will be made, or copy the instructions for manual use.

### 4. Modpack & Portability Suite (📦)
Move your configurations across your cluster or share them with others:
- **Modpack Export**: Generate a shareable JSON "blueprint" of your entire mod configuration.
- **Instant Import**: Paste a Modpack JSON from another administrator to replicate their exact mod setup instantly.
- **Cross-Server Transfer**: Directly push your mod list from one server to another within your local manager without re-downloading files.

### 5. Watchdog & Ordering (🕒)
Maintain control over your server's loading sequence:
- **Load Order Management**: Use intuitive "Move Up/Down" controls to prioritize critical mods (like overhauls) that must load first.
- **Update Watchdog**: Integrated monitoring for mod updates, ensuring your server stays synchronized with the latest CurseForge versions.
- **Toggle Control**: Temporarily disable mods without unistalling them to troubleshoot gameplay issues.

## 🛠️ Interface Controls
- **Search [Magnifier]**: Filter the available mod library.
- **Category Filter**: Browse mods by specific gameplay types.
- **Batch Install [Download]**: Trigger the background installation of all selected mods.
- **Apply Changes [Save]**: Commit your new mod list to the server configuration.
- **Conflict Scan [Shield]**: Audit your current mod list for stability issues.

## 🎨 Design Notes
- **Imagery-First Design**: Large thumbnails and glassmorphism cards make the mod library feel like a premium store experience.
- **Floating Progress UI**: The batch installation bar uses a vibrant sky-to-violet gradient with pulse animations to show active work.
- **Technical Previews**: The configuration modal uses a high-contrast monospaced font for maximum legibility of INI settings.
