use indexmap::IndexMap;

pub struct IniParser;

impl IniParser {
    /// Normalize text by stripping UTF-8 BOM, converting OpenOffice/smart quotes to ASCII,
    /// and normalizing non-breaking spaces and Unicode dashes.
    pub fn normalize_ini_text(text: &str) -> String {
        text.trim_start_matches('\u{feff}')
            .replace(['\u{201c}', '\u{201d}', '\u{201e}', '\u{201f}', '«', '»'], "\"")
            .replace(['\u{2018}', '\u{2019}', '\u{201a}', '\u{201b}'], "'")
            .replace(['\u{2013}', '\u{2014}'], "-")
            .replace('\u{00a0}', " ")
    }

    /// Parse INI content into an ordered map of sections -> keys -> values.
    /// Duplicate keys are preserved by joining their values with `\n`.
    /// This mirrors the frontend `parseIniContent` behaviour so that
    /// round-tripping through parse → serialize never loses data.
    pub fn parse_ordered(content: &str) -> IndexMap<String, IndexMap<String, String>> {
        let normalized = Self::normalize_ini_text(content);
        let mut result = IndexMap::new();
        let mut current_section = "__global__".to_string();
        result.insert(current_section.clone(), IndexMap::<String, String>::new());

        for line in normalized.lines() {
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with(';') || line.starts_with('#') || line.starts_with("//") {
                continue;
            }

            // Section header: handle [SectionName] with optional inline comment or whitespace
            if line.starts_with('[') {
                if let Some(end_bracket) = line.find(']') {
                    let section_name = line[1..end_bracket].trim().to_string();
                    if !section_name.is_empty() {
                        // Use a case-insensitive search to find existing section
                        let existing_section = result.keys().find(|k| k.eq_ignore_ascii_case(&section_name)).cloned();

                        if let Some(existing) = existing_section {
                            current_section = existing;
                        } else {
                            current_section = section_name.clone();
                            result.insert(current_section.clone(), IndexMap::<String, String>::new());
                        }
                        continue;
                    }
                }
            }

            // Key=Value pair
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim().to_string();
                let value = value.trim().to_string();

                if let Some(entries) = result.get_mut(&current_section) {
                    // Case-insensitive key lookup
                    let existing_key = entries.keys()
                        .find(|k| k.eq_ignore_ascii_case(&key))
                        .cloned();

                    if let Some(existing) = existing_key {
                        // Duplicate key: append with \n separator to preserve all values
                        let prev = entries.get(&existing).cloned().unwrap_or_default();
                        entries.insert(existing, format!("{}\n{}", prev, value));
                    } else {
                        entries.insert(key, value);
                    }
                }
            }
        }

        result
    }

    /// Serialize ordered sections back to INI format.
    /// Values containing `\n` are expanded into duplicate key lines,
    /// restoring the original multi-line INI layout.
    pub fn serialize_ordered(sections: &IndexMap<String, IndexMap<String, String>>) -> String {
        let mut result = String::new();
        let mut first = true;

        for (section_name, entries) in sections {
            if entries.is_empty() {
                continue;
            }

            // Skip global section header
            if section_name != "__global__" {
                if !first {
                    result.push_str("\r\n");
                }
                result.push_str(&format!("[{}]\r\n", section_name));
            }

            for (key, value) in entries {
                if value.contains('\n') {
                    // Multi-value key: emit one line per sub-value
                    for part in value.split('\n') {
                        let trimmed = part.trim();
                        if !trimmed.is_empty() {
                            result.push_str(&format!("{}={}\r\n", key, trimmed));
                        }
                    }
                } else {
                    result.push_str(&format!("{}={}\r\n", key, value));
                }
            }

            first = false;
        }

        result
    }

    /// Read an INI file safely from disk, supporting UTF-16 LE, UTF-16 BE, UTF-8 with BOM,
    /// standard UTF-8, and Windows-1252/Latin-1 encodings commonly produced by Unreal Engine,
    /// Windows Notepad, and classic ARK Server Manager.
    pub fn read_file_to_string(path: &std::path::Path) -> std::io::Result<String> {
        use std::fs::File;
        use std::io::Read;

        let mut file = File::open(path)?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;

        if bytes.is_empty() {
            return Ok(String::new());
        }

        // UTF-16 LE with BOM
        if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
            let u16_data: Vec<u16> = bytes[2..]
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            if let Ok(s) = String::from_utf16(&u16_data) {
                return Ok(Self::normalize_ini_text(&s));
            }
        }
        // UTF-16 BE with BOM
        if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
            let u16_data: Vec<u16> = bytes[2..]
                .chunks_exact(2)
                .map(|c| u16::from_be_bytes([c[0], c[1]]))
                .collect();
            if let Ok(s) = String::from_utf16(&u16_data) {
                return Ok(Self::normalize_ini_text(&s));
            }
        }
        // UTF-16 LE without BOM (heuristically detected: second byte is 0 for typical ASCII/Latin characters)
        if bytes.len() >= 4 && bytes[1] == 0 && bytes[3] == 0 {
            let u16_data: Vec<u16> = bytes
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            if let Ok(s) = String::from_utf16(&u16_data) {
                return Ok(Self::normalize_ini_text(&s));
            }
        }
        // UTF-8 with BOM
        if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
            if let Ok(s) = std::str::from_utf8(&bytes[3..]) {
                return Ok(Self::normalize_ini_text(s));
            }
            return Ok(Self::normalize_ini_text(&String::from_utf8_lossy(&bytes[3..])));
        }

        // Standard UTF-8 without BOM
        if let Ok(s) = std::str::from_utf8(&bytes) {
            return Ok(Self::normalize_ini_text(s));
        }

        // Fallback for Windows-1252 / ISO-8859-1 (Western European / German ANSI encodings)
        let s: String = bytes.iter().map(|&b| match b {
            0x80 => '€',
            0x82 => '‚',
            0x83 => 'ƒ',
            0x84 => '„',
            0x85 => '…',
            0x86 => '†',
            0x87 => '‡',
            0x88 => 'ˆ',
            0x89 => '‰',
            0x8A => 'Š',
            0x8B => '‹',
            0x8C => 'Œ',
            0x8E => 'Ž',
            0x91 => '‘',
            0x92 => '’',
            0x93 => '“',
            0x94 => '”',
            0x95 => '•',
            0x96 => '–',
            0x97 => '—',
            0x98 => '˜',
            0x99 => '™',
            0x9A => 'š',
            0x9B => '›',
            0x9C => 'œ',
            0x9E => 'ž',
            0x9F => 'Ÿ',
            _ => b as char,
        }).collect();

        Ok(Self::normalize_ini_text(&s))
    }

    /// Check if a file exists and is marked as Read-Only on disk.
    pub fn is_file_readonly(path: &std::path::Path) -> bool {
        if let Ok(meta) = std::fs::metadata(path) {
            meta.permissions().readonly()
        } else {
            false
        }
    }

    /// Write an INI string safely to disk as pure UTF-8 (without BOM, with Windows CRLF line endings).
    /// If the target file has the Read-Only attribute (e.g. set by user to prevent automated edits),
    /// this function will temporarily remove the Read-Only attribute, write the content safely, and
    /// restore the Read-Only attribute so the file remains protected from outside processes.
    pub fn write_string_to_file_utf8(path: &std::path::Path, content: &str) -> std::io::Result<()> {
        use std::io::Write;

        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let was_readonly = if let Ok(meta) = std::fs::metadata(path) {
            meta.permissions().readonly()
        } else {
            false
        };

        if was_readonly {
            if let Ok(mut perms) = std::fs::metadata(path).map(|m| m.permissions()) {
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(path, perms);
            }
        }

        let mut normalized_crlf = String::with_capacity(content.len() + 64);
        for line in content.lines() {
            let trimmed = line.trim_end_matches('\r');
            normalized_crlf.push_str(trimmed);
            normalized_crlf.push_str("\r\n");
        }

        // Atomic write via temp file
        let tmp_path = path.with_extension("tmp");
        let write_result = (|| -> std::io::Result<()> {
            let mut file = std::fs::File::create(&tmp_path)?;
            file.write_all(normalized_crlf.as_bytes())?;
            file.flush()?;
            drop(file);
            if std::fs::rename(&tmp_path, path).is_ok() {
                return Ok(());
            }
            let _ = std::fs::remove_file(&tmp_path);
            std::fs::write(path, normalized_crlf.as_bytes())
        })();

        // Restore Read-Only attribute if it was originally set
        if was_readonly {
            if let Ok(mut perms) = std::fs::metadata(path).map(|m| m.permissions()) {
                perms.set_readonly(true);
                let _ = std::fs::set_permissions(path, perms);
                println!("  🔒 [Read-Only Guard] Re-applied Read-Only lock to {:?}", path);
            }
        }

        write_result
    }

    /// Merge two INI contents. `updates` take precedence over `base`.
    /// Duplicate keys are properly preserved through the merge.
    pub fn merge(base: &str, updates: &str) -> String {
        let mut base_sections = Self::parse_ordered(base);
        let update_sections = Self::parse_ordered(updates);

        for (section_name, update_entries) in update_sections {
            // Find existing section case-insensitively or create new
            let target_section = base_sections
                .keys()
                .find(|k| k.eq_ignore_ascii_case(&section_name))
                .cloned()
                .unwrap_or_else(|| {
                    base_sections.insert(section_name.clone(), IndexMap::new());
                    section_name.clone()
                });

            let base_entries = base_sections.get_mut(&target_section).unwrap();

            for (k, v) in update_entries {
                let existing_key = base_entries.keys().find(|bk| bk.eq_ignore_ascii_case(&k)).cloned();
                if let Some(existing) = existing_key {
                    // If the update key uses canonical/different casing, adopt the update key name
                    if existing != k {
                        base_entries.shift_remove(&existing);
                        base_entries.insert(k, v);
                    } else {
                        base_entries.insert(existing, v);
                    }
                } else {
                    base_entries.insert(k, v);
                }
            }
        }

        Self::serialize_ordered(&base_sections)
    }

    /// Get a value from a specific section and key, case-insensitive.
    /// For duplicate keys, returns the full \n-joined value.
    pub fn get_value(content: &str, section: &str, key: &str) -> Option<String> {
        let parsed = Self::parse_ordered(content);
        let section_key = parsed.keys().find(|k| k.eq_ignore_ascii_case(section))?;
        let entries = parsed.get(section_key)?;
        let entry_key = entries.keys().find(|k| k.eq_ignore_ascii_case(key))?;
        entries.get(entry_key).cloned()
    }

    /// Update a specific key in a section in-place, strictly preserving ALL comments,
    /// blank lines, duplicate keys, and untouched sections/keys without any loss.
    pub fn update_key(content: &str, section: &str, key: &str, value: &str) -> String {
        let normalized = Self::normalize_ini_text(content);
        let section_lower = section.trim().to_lowercase();
        let key_lower = key.trim().to_lowercase();

        let mut lines: Vec<String> = normalized.lines().map(|l| l.trim_end_matches('\r').to_string()).collect();
        let mut in_target_section = false;
        let mut found_key_idx = None;
        let mut last_section_line_idx = None;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with('[') {
                if let Some(end_bracket) = trimmed.find(']') {
                    let sec_name = trimmed[1..end_bracket].trim().to_lowercase();
                    if in_target_section {
                        // Reached next section
                        break;
                    }
                    if sec_name == section_lower {
                        in_target_section = true;
                        last_section_line_idx = Some(i);
                        continue;
                    }
                }
            }

            if in_target_section {
                last_section_line_idx = Some(i);
                if !trimmed.starts_with(';') && !trimmed.starts_with('#') && !trimmed.starts_with("//") {
                    if let Some((k, _)) = trimmed.split_once('=') {
                        if k.trim().to_lowercase() == key_lower {
                            found_key_idx = Some(i);
                            break;
                        }
                    }
                }
            }
        }

        if let Some(idx) = found_key_idx {
            lines[idx] = format!("{}={}", key, value);
        } else if let Some(last_idx) = last_section_line_idx {
            lines.insert(last_idx + 1, format!("{}={}", key, value));
        } else {
            if !lines.is_empty() && !lines.last().map(|l| l.trim().is_empty()).unwrap_or(true) {
                lines.push(String::new());
            }
            lines.push(format!("[{}]", section));
            lines.push(format!("{}={}", key, value));
        }

        let mut res = lines.join("\r\n");
        if !res.ends_with("\r\n") {
            res.push_str("\r\n");
        }
        res
    }

    /// Remove a specific key from a section in-place, preserving all comments and other lines.
    pub fn remove_key(content: &str, section: &str, key: &str) -> String {
        let normalized = Self::normalize_ini_text(content);
        let section_lower = section.trim().to_lowercase();
        let key_lower = key.trim().to_lowercase();

        let mut lines: Vec<String> = normalized.lines().map(|l| l.trim_end_matches('\r').to_string()).collect();
        let mut in_target_section = false;
        let mut remove_indices = Vec::new();

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with('[') {
                if let Some(end_bracket) = trimmed.find(']') {
                    let sec_name = trimmed[1..end_bracket].trim().to_lowercase();
                    if in_target_section {
                        break;
                    }
                    if sec_name == section_lower {
                        in_target_section = true;
                        continue;
                    }
                }
            }

            if in_target_section {
                if !trimmed.starts_with(';') && !trimmed.starts_with('#') && !trimmed.starts_with("//") {
                    if let Some((k, _)) = trimmed.split_once('=') {
                        if k.trim().to_lowercase() == key_lower {
                            remove_indices.push(i);
                        }
                    }
                }
            }
        }

        for idx in remove_indices.into_iter().rev() {
            lines.remove(idx);
        }

        let mut res = lines.join("\r\n");
        if !res.ends_with("\r\n") {
            res.push_str("\r\n");
        }
        res
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_duplicate_keys_preserved() {
        let ini = "\
[/Script/ShooterGame.ShooterGameMode]
ConfigOverrideSupplyCrateItems=(SupplyCrateClassString=\"SupplyCrate_Level03_C\",MinItemSets=1,MaxItemSets=1)
ConfigOverrideSupplyCrateItems=(SupplyCrateClassString=\"SupplyCrate_Cave_QualityTier3_C\",MinItemSets=1,MaxItemSets=2)
bAllowFlyerSpeedLeveling=True
NPCReplacements=(FromClassName=\"Raptor_Character_BP_C\",ToClassName=\"Rex_Character_BP_C\")
NPCReplacements=(FromClassName=\"Dodo_Character_BP_C\",ToClassName=\"Trike_Character_BP_C\")
";
        let parsed = IniParser::parse_ordered(ini);
        let section = parsed.get("/Script/ShooterGame.ShooterGameMode").unwrap();

        // Duplicate keys should be joined with \n
        let crate_val = section.get("ConfigOverrideSupplyCrateItems").unwrap();
        assert!(crate_val.contains('\n'), "Duplicate keys must be \\n-joined");
        assert_eq!(crate_val.split('\n').count(), 2);

        let npc_val = section.get("NPCReplacements").unwrap();
        assert_eq!(npc_val.split('\n').count(), 2);

        // Non-duplicate key should be a single value
        let flyer = section.get("bAllowFlyerSpeedLeveling").unwrap();
        assert!(!flyer.contains('\n'));
        assert_eq!(flyer, "True");
    }

    #[test]
    fn test_serialize_expands_duplicates() {
        let ini = "\
[ServerSettings]
SessionName=TestServer
ConfigOverrideSupplyCrateItems=(Crate1)
ConfigOverrideSupplyCrateItems=(Crate2)
ConfigOverrideSupplyCrateItems=(Crate3)
";
        let parsed = IniParser::parse_ordered(ini);
        let output = IniParser::serialize_ordered(&parsed);

        // Count occurrences of the key in the output
        let count = output.matches("ConfigOverrideSupplyCrateItems=").count();
        assert_eq!(count, 3, "All three duplicate lines must be preserved in output");

        // Verify the single-value key is also there
        assert!(output.contains("SessionName=TestServer"));
    }

    #[test]
    fn test_merge_preserves_duplicates() {
        let base = "\
[/Script/ShooterGame.ShooterGameMode]
ConfigOverrideSupplyCrateItems=(OldCrate1)
ConfigOverrideSupplyCrateItems=(OldCrate2)
bAllowFlyerSpeedLeveling=False
";
        let updates = "\
[/Script/ShooterGame.ShooterGameMode]
ConfigOverrideSupplyCrateItems=(NewCrate1)
ConfigOverrideSupplyCrateItems=(NewCrate2)
ConfigOverrideSupplyCrateItems=(NewCrate3)
bAllowFlyerSpeedLeveling=True
";
        let merged = IniParser::merge(base, updates);

        // The update should win: 3 new crate lines
        let count = merged.matches("ConfigOverrideSupplyCrateItems=").count();
        assert_eq!(count, 3, "Merge must keep all 3 new crate lines from updates");

        // Old crates should be gone
        assert!(!merged.contains("OldCrate1"));
        assert!(!merged.contains("OldCrate2"));

        // Single-value update should also win
        assert!(merged.contains("bAllowFlyerSpeedLeveling=True"));
    }

    #[test]
    fn test_roundtrip_preserves_content() {
        let original = "\
[ServerSettings]\r
SessionName=MyServer\r
MaxPlayers=70\r
\r
[/Script/ShooterGame.ShooterGameMode]\r
ConfigOverrideSupplyCrateItems=(A)\r
ConfigOverrideSupplyCrateItems=(B)\r
bAllowFlyerSpeedLeveling=True\r
";
        let parsed = IniParser::parse_ordered(original);
        let output = IniParser::serialize_ordered(&parsed);

        // Re-parse the output and compare
        let re_parsed = IniParser::parse_ordered(&output);

        // Both should have the same sections and values
        assert_eq!(parsed.len(), re_parsed.len());

        for (section, entries) in &parsed {
            let re_entries = re_parsed.get(section).expect("Section missing after roundtrip");
            for (key, value) in entries {
                let re_value = re_entries.get(key).expect("Key missing after roundtrip");
                assert_eq!(value, re_value, "Value mismatch for {}.{}", section, key);
            }
        }
    }

    #[test]
    fn test_utf8_bom_and_smart_quotes() {
        // Simulates an OpenOffice/LibreOffice or Nitrado export with UTF-8 BOM and curly quotes
        let bom_ini = "\u{feff}[ServerSettings] ; main server configs\r\nSessionName=“Matthias Server”\r\nMaxPlayers=70\r\n\r\n[/Script/ShooterGame.ShooterGameMode]\r\nConfigOverrideItemMaxQuantity=(ItemClassString=“PrimalItemResource_Wood_C”,Quantity=(MaxItemQuantity=500,bIgnoreMultiplier=True))\r\nLevelExperienceRampOverrides=(ExperiencePointsForLevel[0]=5,ExperiencePointsForLevel[1]=20)\r\n";
        
        let parsed = IniParser::parse_ordered(bom_ini);
        
        // Section without BOM should match ServerSettings
        let server_settings = parsed.get("ServerSettings").expect("ServerSettings section must be parsed despite BOM and comment");
        assert_eq!(server_settings.get("SessionName").unwrap(), "\"Matthias Server\"");
        assert_eq!(server_settings.get("MaxPlayers").unwrap(), "70");

        let game_mode = parsed.get("/Script/ShooterGame.ShooterGameMode").expect("ShooterGameMode section must be parsed");
        let stack_override = game_mode.get("ConfigOverrideItemMaxQuantity").unwrap();
        assert!(stack_override.contains("\"PrimalItemResource_Wood_C\""), "Smart quotes should be converted to standard ASCII double quotes");
    }

    #[test]
    fn test_update_key_preserves_comments_and_formatting() {
        let original = "\
; Section for core ARK server settings
[ServerSettings]
# Custom admin setting added by user
ServerPassword=MySecret
; Next line is important
MaxPlayers=70
CrossARKAllowForeignDinoDownloads=False

[/Script/ShooterGame.ShooterGameMode]
// Mode comment
bAllowSpeedLeveling=True
";
        // Update CrossARKAllowForeignDinoDownloads in place
        let updated = IniParser::update_key(original, "ServerSettings", "CrossARKAllowForeignDinoDownloads", "True");

        // Verify comments and lines are strictly preserved
        assert!(updated.contains("; Section for core ARK server settings"));
        assert!(updated.contains("# Custom admin setting added by user"));
        assert!(updated.contains("; Next line is important"));
        assert!(updated.contains("// Mode comment"));
        assert!(updated.contains("CrossARKAllowForeignDinoDownloads=True"));
        assert!(updated.contains("ServerPassword=MySecret"));
        assert!(updated.contains("bAllowSpeedLeveling=True"));

        // Add a new key to ServerSettings
        let with_new_key = IniParser::update_key(&updated, "ServerSettings", "NoTributeDownloads", "False");
        assert!(with_new_key.contains("NoTributeDownloads=False"));
        assert!(with_new_key.contains("; Section for core ARK server settings"));
    }

    #[test]
    fn test_remove_key_preserves_comments() {
        let original = "\
[ServerSettings]
# User notes here
ActiveMapMod=12345
SessionName=My Server
";
        let updated = IniParser::remove_key(original, "ServerSettings", "ActiveMapMod");
        assert!(!updated.contains("ActiveMapMod=12345"));
        assert!(updated.contains("# User notes here"));
        assert!(updated.contains("SessionName=My Server"));
    }

    #[test]
    fn test_readonly_file_write_preserves_attribute() {
        let tmp_dir = std::env::temp_dir().join(format!("ini_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
        let _ = std::fs::create_dir_all(&tmp_dir);
        let test_file = tmp_dir.join("GameUserSettings.ini");

        // Create initial file
        std::fs::write(&test_file, "[ServerSettings]\r\nSessionName=Before\r\n").unwrap();

        // Mark as Read-Only
        let mut perms = std::fs::metadata(&test_file).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&test_file, perms).unwrap();
        assert!(IniParser::is_file_readonly(&test_file));

        // Write new content via write_string_to_file_utf8
        let write_res = IniParser::write_string_to_file_utf8(&test_file, "[ServerSettings]\r\nSessionName=After\r\n");
        assert!(write_res.is_ok(), "Writing to read-only file must succeed: {:?}", write_res);

        // Verify content was updated
        let read_back = std::fs::read_to_string(&test_file).unwrap();
        assert!(read_back.contains("SessionName=After"));

        // Verify file is STILL Read-Only
        assert!(IniParser::is_file_readonly(&test_file), "File must retain Read-Only attribute after safe write");

        // Cleanup
        let mut perms = std::fs::metadata(&test_file).unwrap().permissions();
        perms.set_readonly(false);
        let _ = std::fs::set_permissions(&test_file, perms);
        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
