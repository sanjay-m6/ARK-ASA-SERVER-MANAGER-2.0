use indexmap::IndexMap;

pub struct IniParser;

impl IniParser {
    /// Parse INI content into an ordered map of sections -> keys -> values.
    /// Duplicate keys are preserved by joining their values with `\n`.
    /// This mirrors the frontend `parseIniContent` behaviour so that
    /// round-tripping through parse → serialize never loses data.
    pub fn parse_ordered(content: &str) -> IndexMap<String, IndexMap<String, String>> {
        let mut result = IndexMap::new();
        let mut current_section = "__global__".to_string();
        result.insert(current_section.clone(), IndexMap::<String, String>::new());

        for line in content.lines() {
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
                continue;
            }

            // Section header
            if line.starts_with('[') && line.ends_with(']') {
                let section_name = line[1..line.len() - 1].to_string();

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
                    section_name
                });

            let base_entries = base_sections.get_mut(&target_section).unwrap();

            for (k, v) in update_entries {
                let existing_key = base_entries.keys().find(|bk| bk.eq_ignore_ascii_case(&k)).cloned();
                if let Some(existing) = existing_key {
                    // Replace entirely with the update value (which may contain \n for duplicates)
                    base_entries.insert(existing, v);
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

    /// Update a specific key in a section, preserving all other content.
    #[allow(dead_code)]
    pub fn update_key(content: &str, section: &str, key: &str, value: &str) -> String {
        let mut parsed = Self::parse_ordered(content);

        let target_section = parsed
            .keys()
            .find(|k| k.eq_ignore_ascii_case(section))
            .cloned()
            .unwrap_or_else(|| {
                parsed.insert(section.to_string(), IndexMap::new());
                section.to_string()
            });

        let entries = parsed.get_mut(&target_section).unwrap();

        let existing_key = entries.keys().find(|k| k.eq_ignore_ascii_case(key)).cloned();
        if let Some(existing) = existing_key {
            entries.insert(existing, value.to_string());
        } else {
            entries.insert(key.to_string(), value.to_string());
        }

        Self::serialize_ordered(&parsed)
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
}
