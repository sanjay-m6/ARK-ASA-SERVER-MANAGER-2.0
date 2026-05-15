# ⚙️ Config Generator Service

The Config Generator is the high-fidelity translation engine that converts the manager's high-level UI settings and database records into the complex `.ini` configuration files and startup commands required by the ARK: Survival Ascended engine.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/config_generator.rs`
- **Architecture**: Template-based generation with Non-Destructive Merge logic.
- **Core Functionality**: INI Generation (GameUserSettings & Game.ini), Map-Specific Profiles, CLI Command Construction.

## 🚀 Key Features

### 1. Engine-Native Compatibility (🔧)
- **ARK Boolean Normalization**: Automatically converts standard data types into ARK-specific formats (e.g., mapping `true` to `True`), ensuring the Unreal Engine parser recognizes all settings.
- **Corruption Sanitization**: Includes a specialized "Password Cleaner" that strips the `?ServerPassword=` string that the ARK engine incorrectly appends to admin password entries during runtime.
- **Non-Destructive Merging**: Instead of overwriting entire files, the service merges new changes into existing configurations. This ensures that manually added settings or specific mod-configs are preserved while the manager updates global rates and ports.

### 2. Map-Specific Intelligence
- **Profile Preset Library**: Contains optimized baseline configurations for all major ASA maps, including `TheIsland`, `ScorchedEarth`, `Aberration`, and popular mod maps like `Svartalfheim`.
- **Dynamic Multipliers**: Automatically adjusts recommended XP, Taming, and Harvest rates based on the unique environmental challenges of the selected map profile.

### 3. Comprehensive Settings Coverage
- **World Identity**: Manages session names, passwords, and server visibility.
- **Gameplay Rates**: Controls XP, Taming, Harvesting, Difficulty, and Resource-specific multipliers.
- **Biological Systems**: Fine-tunes Breeding, Egg Hatching, Baby Maturation, and Stat-per-level increases for both players and wild/tamed creatures.
- **Day/Night Cycles**: Configures time progression speeds and individual day/night duration scaling.

### 4. Advanced Launch Orchestration
- **Startup Command Builder**: Construct the finalized `ArkAscendedServer.exe` execution string.
- **Parameter Optimization**: Intelligently prioritizes INI-based password storage over CLI-based storage to prevent command-line truncation or corruption by the engine's internal URL parser.
- **Mod Injection**: Automatically builds the `-mods=` list based on the user's active mod selection.

## 🛠️ Technical Details

### Multiplier Serialization
The service iterates through stat arrays to generate precise per-level modifiers:
```rust
for (i, val) in config.per_level_stats_multiplier_player.iter().enumerate() {
    if *val != 1.0 {
        content.push_str(&format!("PerLevelStatsMultiplier_Player[{}]={:.6}\n", i, val));
    }
}
```

### Safety Backups
Before any write operation, the service triggers an atomic backup:
1. Locate the `WindowsServer` config directory.
2. Create a timestamped folder inside `backups/`.
3. Copy existing `GameUserSettings.ini` and `Game.ini` before applying updates.

## 🎨 Developer Notes
- **Line Endings**: Generates `\r\n` (CRLF) line endings to ensure maximum compatibility with Windows-native text editors and the game engine.
- **Precision**: Uses 6-decimal point precision for stat multipliers to support high-accuracy "Modded" gameplay configurations.
