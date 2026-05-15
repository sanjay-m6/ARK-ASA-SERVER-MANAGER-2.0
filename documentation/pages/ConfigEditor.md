# ⚙️ Config Editor Page

The Config Editor is a powerful tool for modifying server settings, offering both a user-friendly visual interface and a raw INI editor for advanced users.

## 📝 Component Overview
- **File Path**: `src/pages/ConfigEditor.tsx`
- **INI Engine**: Custom parser and generator located in `src/data/configMappings.ts`.
- **Modes**: Visual Editor, Raw Editor, Level Ramp Generator, Stat Multipliers.

## 🚀 Key Features

### 1. Visual Configuration
- **Categorization**: Settings are grouped into logical sections (Server, Gameplay, Rules, Multipliers).
- **Tooltips**: Every setting includes a description and a direct link to the Official ARK Wiki.
- **Smart Inputs**: Uses sliders for multipliers, toggles for booleans, and dropdowns for maps/modes.

### 2. Raw INI Editor
- **Syntax Highlighting**: Built using `CodeEditor` (likely Monaco or similar) for clear reading.
- **Bi-directional Sync**: Changes in the raw editor are parsed back into the visual editor and vice-versa.
- **File Access**: Directly edits `GameUserSettings.ini` and `Game.ini`.

### 3. Level & XP Generator
- **Custom Level Caps**: Set max player and dino levels with automatic XP curve generation.
- **Ramp Overrides**: Automatically writes the complex `LevelExperienceRampOverrides` lines into `Game.ini`.

### 4. Presets
- **Ready-to-use Templates**: Apply "Small Tribes", "Official", or "High Rates" presets instantly.
- **Custom Presets**: Save current configurations as personal presets for future use.

## 🛠️ Technical Details

### INI Parsing Logic
The application uses a specialized parser that preserves comments and formatting where possible:
```typescript
const configs = parseIniContent(rawIniString); // Returns Map<Section, Map<Key, Value>>
```

### Critical Sync
When saving, the manager also updates the application database with critical values (Ports, Session Name, Map) to ensure the manager's UI stays in sync with the actual file contents.

## 🎨 UI/UX Patterns
- **Modification Badges**: Small orange dots next to settings that have been changed from their default values.
- **Search & Filter**: Quickly find any setting across all INI sections.
- **Validation Banner**: Alerts the user if conflicting settings are detected (e.g., "PvE Mode" enabled alongside "Friendly Fire").
