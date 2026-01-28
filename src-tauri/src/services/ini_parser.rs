// INI Parser and Merger Utility
// Handles parsing, merging, and serializing INI files while preserving unknown keys

use std::collections::BTreeMap;

/// Represents a parsed INI file with sections and their key-value pairs
pub struct IniParser;

impl IniParser {
    /// Parse INI content into a structured format
    /// Returns (sections, section_order) where section_order preserves original ordering
    pub fn parse(content: &str) -> (BTreeMap<String, BTreeMap<String, String>>, Vec<String>) {
        let mut sections: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
        let mut section_order: Vec<String> = Vec::new();
        let mut current_section = String::from("__global__");

        sections.insert(current_section.clone(), BTreeMap::new());
        section_order.push(current_section.clone());

        for line in content.lines() {
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
                continue;
            }

            // Section header
            if line.starts_with('[') && line.ends_with(']') {
                current_section = line[1..line.len() - 1].to_string();
                if !sections.contains_key(&current_section) {
                    sections.insert(current_section.clone(), BTreeMap::new());
                    section_order.push(current_section.clone());
                }
                continue;
            }

            // Key=Value pair
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

    /// Merge two INI contents, updates take precedence over base
    /// This preserves all keys from base that aren't in updates
    pub fn merge(base: &str, updates: &str) -> String {
        let (mut base_sections, mut section_order) = Self::parse(base);
        let (update_sections, update_order) = Self::parse(updates);

        // Add any new sections from updates to the order
        for section in &update_order {
            if !section_order.contains(section) {
                section_order.push(section.clone());
            }
        }

        // Merge update sections into base
        for (section_name, section_values) in update_sections {
            if let Some(base_section) = base_sections.get_mut(&section_name) {
                // Merge values - updates win on conflicts
                for (key, value) in section_values {
                    base_section.insert(key, value);
                }
            } else {
                // New section from updates
                base_sections.insert(section_name, section_values);
            }
        }

        Self::serialize(&base_sections, &section_order)
    }

    /// Serialize sections back to INI format
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

                // Skip global section header
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

    /// Update a specific key in a section, preserving all other content
    #[allow(dead_code)]
    pub fn update_key(content: &str, section: &str, key: &str, value: &str) -> String {
        let (mut sections, section_order) = Self::parse(content);

        // Ensure section exists
        if !sections.contains_key(section) {
            sections.insert(section.to_string(), BTreeMap::new());
        }

        if let Some(section_map) = sections.get_mut(section) {
            section_map.insert(key.to_string(), value.to_string());
        }

        // Rebuild section order if needed
        let mut order = section_order;
        if !order.contains(&section.to_string()) {
            order.push(section.to_string());
        }

        Self::serialize(&sections, &order)
    }

    /// Get a value from parsed INI content
    #[allow(dead_code)]
    pub fn get_value(content: &str, section: &str, key: &str) -> Option<String> {
        let (sections, _) = Self::parse(content);
        sections.get(section).and_then(|s| s.get(key)).cloned()
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
        assert!(merged.contains("MaxPlayers=50"));
        // Verify custom setting preserved
        assert!(merged.contains("CustomSetting=value"));
        // Verify per-level stat preserved
        assert!(merged.contains("PerLevelStatsMultiplier_Player[0]=2.0"));
        // Verify other section preserved
        assert!(merged.contains("[MessageOfTheDay]"));
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
}
