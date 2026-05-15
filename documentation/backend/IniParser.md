# 📄 INI Parser Utility

The INI Parser is a specialized low-level utility designed to handle the complex and non-standard configuration formats used by the ARK: Survival Ascended engine, specifically focusing on ordered merging and array-style key management.

## 📝 Utility Overview
- **File Path**: `src-tauri/src/services/ini_parser.rs`
- **Architecture**: Vector-based ordered storage (to support duplicate keys).
- **Format**: Enforces Windows-standard CRLF (`\r\n`) line endings.
- **Key Use Case**: Powers the `ConfigGenerator` by merging user-interface changes into existing `.ini` files.

## 🚀 Key Features

### 1. ARK-Specific Array Support (🔄)
Standard INI parsers typically use HashMaps, which collapse duplicate keys into a single value. The ARK Manager utility is custom-built to handle:
- **Repeated Keys**: Correctly parses and serializes keys that appear dozens of times (e.g., `OverridePlayerLevelEngramPoints` or `NPCReplacements`).
- **Array Blocks**: During a merge, if the incoming configuration contains multiple lines for the same key, the parser treats them as an authoritative "block," replacing all existing entries in the base file with the new set.

### 2. Preservative Merging
- **Order Preservation**: Maintains the original order of sections and keys within the file, which is critical for administrative readability and certain engine behaviors.
- **Non-Destructive Ops**: Unknown keys (from third-party mods or manual edits) are preserved as-is. Only keys explicitly modified by the manager are updated.
- **Section Integrity**: Correctly handles "Global" keys (those appearing before any bracketed section header) and ensures bracketed sections are never accidentally merged or deleted.

### 3. Serialization Standards
- **Standardized Output**: All generated INI content is serialized with `\r\n` line endings to ensure compatibility with the Windows server binary.
- **Clean Formatting**: Automatically handles whitespace trimming and prevents empty section headers from being written to disk.

## 🛠️ Technical Details

### Ordered Data Structure
The utility avoids `BTreeMap` and `HashMap` in favor of ordered vectors to ensure that duplicate keys are never lost:
```rust
type SectionEntries = Vec<(String, String)>;
pub struct IniParser;
```

### Merging Heuristics
The `merge` function applies specific logic based on key frequency:
- **If Frequency = 1**: Update-in-place (overwrite the existing key).
- **If Frequency > 1**: Block-replace (remove all occurrences in base, append the entire new list from update).

## 🎨 Developer Notes
- **Performance**: The parser is optimized for files with thousands of lines, frequently encountered in `Game.ini` files with custom level ramps.
- **Compatibility**: A legacy `parse` and `serialize` API is maintained using `BTreeMap` for simple configuration files where duplicate keys are not expected.
