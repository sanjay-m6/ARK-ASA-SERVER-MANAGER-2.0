// INI Parser and Merger Utility
// Handles parsing, merging, and serializing INI files while preserving unknown keys
// and duplicate/array-style ARK keys (e.g. OverridePlayerLevelEngramPoints repeated 30+ times).

use std::collections::BTreeMap;

/// Internal section representation as an ordered list of (key, value) pairs.
/// Using Vec instead of BTreeMap is critical: ARK uses repeated key names for arrays
/// (e.g. OverridePlayerLevelEngramPoints=800 appearing 30+ times).
/// A BTreeMap would silently collapse all but the last occurrence.
type SectionEntries = Vec<(String, String)>;

/// Represents a parsed INI file with sections and their key-value pairs
pub struct IniParser;

impl IniParser {
    /// Parse INI content into an ordered list of (section_name, entries) pairs.
    /// Preserves duplicate keys and insertion order within each section.
    fn parse_ordered(content: &str) -> Vec<(String, SectionEntries)> {
        let mut result: Vec<(String, SectionEntries)> = Vec::new();
        let mut current_section = "__global__".to_string();
        result.push((current_section.clone(), Vec::new()));

        for line in content.lines() {
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
                continue;
            }

            // Section header
            if line.starts_with('[') && line.ends_with(']') {
                current_section = line[1..line.len() - 1].to_string();
                // Add section if not yet present
                if !result.iter().any(|(s, _)| s == &current_section) {
                    result.push((current_section.clone(), Vec::new()));
                }
                continue;
            }

            // Key=Value pair
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim().to_string();
                let value = value.trim().to_string();
                if let Some((_, entries)) = result.iter_mut().find(|(s, _)| s == &current_section) {
                    entries.push((key, value));
                }
            }
        }

        result
    }

    /// Serialize ordered sections back to INI format.
    fn serialize_ordered(sections: &[(String, SectionEntries)]) -> String {
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
                result.push_str(&format!("{}={}\r\n", key, value));
            }

            first = false;
        }

        result
    }

    /// Merge two INI contents. `updates` take precedence over `base`.
    ///
    /// Merge semantics for duplicate/array keys:
    /// - If a key appears once in `updates`: update the first matching key in base (or append).
    /// - If a key appears multiple times in `updates` (array-style):
    ///     → Remove ALL entries for that key from base and replace them with ALL from updates.
    ///     This preserves the full array from the authoritative source (updates).
    /// - Keys in base not present in updates: preserved as-is.
    pub fn merge(base: &str, updates: &str) -> String {
        let mut base_sections = Self::parse_ordered(base);
        let update_sections = Self::parse_ordered(updates);

        for (section_name, update_entries) in &update_sections {
            // Build a frequency map for keys in updates for this section
            let mut update_key_freq: BTreeMap<&str, usize> = BTreeMap::new();
            for (k, _) in update_entries {
                *update_key_freq.entry(k.as_str()).or_insert(0) += 1;
            }

            // Find or create the section in base
            let base_section_idx = base_sections.iter().position(|(s, _)| s == section_name);
            let base_section_idx = match base_section_idx {
                Some(i) => i,
                None => {
                    let idx = base_sections.len();
                    base_sections.push((section_name.clone(), Vec::new()));
                    idx
                }
            };

            let base_entries = &mut base_sections[base_section_idx].1;

            // For each key in updates, decide how to merge
            for (k, freq) in &update_key_freq {
                if *freq > 1 {
                    // Array-style key: remove all base entries for this key, will re-add below
                    base_entries.retain(|(bk, _)| bk.as_str() != *k);
                } else {
                    // Single-value key: update-in-place if exists
                    let update_val = update_entries
                        .iter()
                        .find(|(uk, _)| uk.as_str() == *k)
                        .map(|(_, v)| v.as_str())
                        .unwrap_or("");
                    if let Some(entry) = base_entries.iter_mut().find(|(bk, _)| bk.as_str() == *k) {
                        entry.1 = update_val.to_string();
                    } else {
                        // New single key not in base — append
                        base_entries.push((k.to_string(), update_val.to_string()));
                    }
                }
            }

            // Append all entries for array-style keys from updates (in order)
            for (k, v) in update_entries {
                if update_key_freq.get(k.as_str()).copied().unwrap_or(0) > 1 {
                    base_entries.push((k.clone(), v.clone()));
                }
            }
        }

        Self::serialize_ordered(&base_sections)
    }

    /// Update a specific key in a section, preserving all other content.
    /// If the key appears multiple times, updates only the first occurrence.
    #[allow(dead_code)]
    pub fn update_key(content: &str, section: &str, key: &str, value: &str) -> String {
        let mut sections = Self::parse_ordered(content);

        // Find or create the section
        let section_idx = sections.iter().position(|(s, _)| s == section);
        let section_idx = match section_idx {
            Some(i) => i,
            None => {
                let idx = sections.len();
                sections.push((section.to_string(), Vec::new()));
                idx
            }
        };

        let entries = &mut sections[section_idx].1;
        if let Some(entry) = entries.iter_mut().find(|(k, _)| k == key) {
            entry.1 = value.to_string();
        } else {
            entries.push((key.to_string(), value.to_string()));
        }

        Self::serialize_ordered(&sections)
    }

    /// Get a value from parsed INI content.
    /// Returns the first matching value if the key appears multiple times.
    #[allow(dead_code)]
    pub fn get_value(content: &str, section: &str, key: &str) -> Option<String> {
        let sections = Self::parse_ordered(content);
        sections
            .iter()
            .find(|(s, _)| s == section)
            .and_then(|(_, entries)| entries.iter().find(|(k, _)| k == key))
            .map(|(_, v)| v.clone())
    }

    // -------------------------------------------------------------------------
    // Legacy API — kept for compatibility with callers that still use BTreeMap.
    // These wrap the ordered implementation.
    // -------------------------------------------------------------------------

    /// Parse INI content into a structured format (legacy BTreeMap API).
    /// NOTE: This collapses duplicate keys to the last value.
    /// Prefer `parse_ordered` / `merge` for Game.ini handling.
    #[allow(dead_code)]
    pub fn parse(content: &str) -> (BTreeMap<String, BTreeMap<String, String>>, Vec<String>) {
        let mut sections: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
        let mut section_order: Vec<String> = Vec::new();
        let mut current_section = String::from("__global__");

        sections.insert(current_section.clone(), BTreeMap::new());
        section_order.push(current_section.clone());

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
                continue;
            }
            if line.starts_with('[') && line.ends_with(']') {
                current_section = line[1..line.len() - 1].to_string();
                if !sections.contains_key(&current_section) {
                    sections.insert(current_section.clone(), BTreeMap::new());
                    section_order.push(current_section.clone());
                }
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim().to_string();
                let value = value.trim().to_string();
                if let Some(section_map) = sections.get_mut(&current_section) {
                    section_map.insert(key, value);
                }
            }
        }

        (sections, section_order)
    }

    /// Serialize sections back to INI format (legacy BTreeMap API).
    #[allow(dead_code)]
    pub fn serialize(
        sections: &BTreeMap<String, BTreeMap<String, String>>,
        section_order: &[String],
    ) -> String {
        let mut result = String::new();

        for section_name in section_order {
            if let Some(section_values) = sections.get(section_name) {
                if section_values.is_empty() {
                    continue;
                }
                if section_name != "__global__" {
                    if !result.is_empty() {
                        result.push_str("\r\n");
                    }
                    result.push_str(&format!("[{}]\r\n", section_name));
                }
                for (key, value) in section_values {
                    result.push_str(&format!("{}={}\r\n", key, value));
                }
            }
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple() {
        let content = r#"
[ServerSettings]
MaxPlayers=70
SessionName=Test Server
"#;
        let (sections, _) = IniParser::parse(content);
        assert!(sections.contains_key("ServerSettings"));
        assert_eq!(
            sections.get("ServerSettings").unwrap().get("MaxPlayers"),
            Some(&"70".to_string())
        );
    }

    #[test]
    fn test_merge_preserves_keys() {
        let base = r#"
[ServerSettings]
MaxPlayers=70
CustomSetting=value
PerLevelStatsMultiplier_Player[0]=2.0

[MessageOfTheDay]
Message=Hello
"#;
        let updates = r#"
[ServerSettings]
MaxPlayers=50
"#;
        let merged = IniParser::merge(base, updates);

        // Verify MaxPlayers was updated
        assert!(
            merged.contains("MaxPlayers=50"),
            "MaxPlayers not updated: {}",
            merged
        );
        // Verify custom setting preserved
        assert!(
            merged.contains("CustomSetting=value"),
            "CustomSetting lost: {}",
            merged
        );
        // Verify per-level stat preserved
        assert!(
            merged.contains("PerLevelStatsMultiplier_Player[0]=2.0"),
            "PerLevelStats lost: {}",
            merged
        );
        // Verify other section preserved
        assert!(
            merged.contains("[MessageOfTheDay]"),
            "MessageOfTheDay lost: {}",
            merged
        );
    }

    #[test]
    fn test_update_key() {
        let content = r#"
[ServerSettings]
MaxPlayers=70
"#;
        let updated = IniParser::update_key(content, "ServerSettings", "MaxPlayers", "100");
        assert!(updated.contains("MaxPlayers=100"));
    }

    #[test]
    fn test_merge_array_keys() {
        let base = "";
        let updates = r#"
[/Script/ShooterGame.ShooterGameMode]
PerLevelStatsMultiplier_Player[0]=10.0
PerLevelStatsMultiplier_Player[1]=5.0
"#;
        let merged = IniParser::merge(base, updates);
        assert!(merged.contains("PerLevelStatsMultiplier_Player[0]=10.0"));
        assert!(merged.contains("PerLevelStatsMultiplier_Player[1]=5.0"));
    }

    #[test]
    fn test_merge_preserves_duplicate_array_keys() {
        // This is the critical ARK scenario: OverridePlayerLevelEngramPoints repeated many times
        let base = r#"
[/Script/ShooterGame.ShooterGameMode]
EggHatchSpeedMultiplier=25.00
OverridePlayerLevelEngramPoints=0
OverridePlayerLevelEngramPoints=800
OverridePlayerLevelEngramPoints=850
OverridePlayerLevelEngramPoints=850
NPCReplacements=(FromClassName="Pegomastax_Character_BP_C",ToClassName="")
NPCReplacements=(FromClassName="Ichthyornis_Character_BP_C",ToClassName="")
"#;
        // Updates only change one single-value key
        let updates = r#"
[/Script/ShooterGame.ShooterGameMode]
EggHatchSpeedMultiplier=10.00
"#;
        let merged = IniParser::merge(base, updates);

        // Single key updated
        assert!(
            merged.contains("EggHatchSpeedMultiplier=10.00"),
            "Multiplier not updated: {}",
            merged
        );
        // All four OverridePlayerLevelEngramPoints lines preserved
        assert_eq!(
            merged.matches("OverridePlayerLevelEngramPoints=").count(),
            4,
            "OverridePlayerLevelEngramPoints count wrong: {}",
            merged
        );
        // Both NPCReplacements lines preserved
        assert_eq!(
            merged.matches("NPCReplacements=").count(),
            2,
            "NPCReplacements count wrong: {}",
            merged
        );
    }

    #[test]
    fn test_merge_replaces_array_block_from_updates() {
        // When updates provides a new array block, it should replace the old one entirely
        let base = r#"
[/Script/ShooterGame.ShooterGameMode]
OverridePlayerLevelEngramPoints=0
OverridePlayerLevelEngramPoints=800
OverridePlayerLevelEngramPoints=850
"#;
        let updates = r#"
[/Script/ShooterGame.ShooterGameMode]
OverridePlayerLevelEngramPoints=0
OverridePlayerLevelEngramPoints=1000
OverridePlayerLevelEngramPoints=1200
OverridePlayerLevelEngramPoints=1500
"#;
        let merged = IniParser::merge(base, updates);
        // Should now have 4 entries from updates, not 3 from base
        assert_eq!(
            merged.matches("OverridePlayerLevelEngramPoints=").count(),
            4,
            "Array replacement wrong: {}",
            merged
        );
        assert!(
            merged.contains("OverridePlayerLevelEngramPoints=1500"),
            "New value missing: {}",
            merged
        );
        assert!(
            !merged.contains("OverridePlayerLevelEngramPoints=850"),
            "Old value still present: {}",
            merged
        );
    }
}
