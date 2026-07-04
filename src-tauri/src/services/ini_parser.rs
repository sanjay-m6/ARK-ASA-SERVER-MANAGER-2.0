use indexmap::IndexMap;

pub struct IniParser;

impl IniParser {
    /// Parse INI content into an ordered map of sections -> keys -> values.
    /// Deduplicates keys by keeping only the LAST value (the newest value).
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
                    // Case-insensitive key replacement
                    let mut existing_key = None;
                    for k in entries.keys() {
                        if k.eq_ignore_ascii_case(&key) {
                            existing_key = Some(k.clone());
                            break;
                        }
                    }
                    if let Some(existing) = existing_key {
                        entries.insert(existing, value);
                    } else {
                        entries.insert(key, value);
                    }
                }
            }
        }

        result
    }

    /// Serialize ordered sections back to INI format.
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
                result.push_str(&format!("{}={}\r\n", key, value));
            }

            first = false;
        }

        result
    }

    /// Merge two INI contents. `updates` take precedence over `base`.
    /// Duplicate keys are completely removed, keeping only the newest value.
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
                    base_entries.insert(existing, v);
                } else {
                    base_entries.insert(k, v);
                }
            }
        }

        Self::serialize_ordered(&base_sections)
    }

    /// Get a value from a specific section and key, case-insensitive.
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
