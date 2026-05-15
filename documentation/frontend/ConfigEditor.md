# Configuration Editor

The Configuration Editor provides a user-friendly interface for modifying the complex `GameUserSettings.ini` and `Game.ini` files that control your ARK server's rules, rates, and features.

## Intelligent Settings Groups

Settings are organized into logical categories to prevent "INI fatigue":

### Basic Settings
- **Server Name & Passwords**: Set your public session name, admin password, and private join password.
- **Player Limits**: Define the maximum number of simultaneous connections.
- **Message of the Day (MOTD)**: Configure the greeting message shown to players upon joining.

### World & Environment
- **Time Speeds**: Adjust day and night cycle durations.
- **Structure Decay**: Control how quickly abandoned bases disappear.
- **Harvest Rates**: Set the multiplier for resource gathering.

### Player & Creature Stats
- **XP Multipliers**: Adjust the rate of leveling for both players and dinos.
- **Taming Speeds**: Configure how quickly wild creatures can be tamed.
- **Breeding & Hatching**: Modify egg incubation and maturation speeds.

## Direct INI Access

For power users, the **"Advanced View"** provides a raw text editor for both major configuration files.
- **Syntax Highlighting**: Easily distinguish between sections, keys, and values.
- **Validation**: The editor checks for common formatting errors (like missing brackets or duplicate keys) before saving.
- **Auto-Formatting**: Automatically aligns keys for better readability.

## Config Profiles & Backups

### Saving Profiles
You can save your current configuration as a "Profile." This allows you to quickly switch between different server types (e.g., "10x PvP" vs "Classic PvE") with a single click.

### Automatic Backups
Every time you save changes in the Configuration Editor, a backup is created. If a mistake is made, you can use the **"Restore"** button to revert to a previous version.

## Startup Command Generator
The manager dynamically generates the server's startup string based on your configuration. You can view this command in the **"Preview"** tab to see exactly what flags (e.g., `-ActiveEvent=`, `-Crossplay=`, `-NoBattleEye`) are being sent to the executable.

---
*Pro Tip: Use the "Search Settings" bar to find specific variables without scrolling through categories.*
