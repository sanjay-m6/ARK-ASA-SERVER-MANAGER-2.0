use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IniData {
    pub sections: Vec<IniSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IniSection {
    pub name: String,
    pub entries: Vec<IniEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IniEntry {
    pub key: String,
    pub value: String,
    pub comment: Option<String>,
}

impl IniData {
    pub fn new() -> Self {
        Self::default()
    }

    /// Parses an INI string into structured data, preserving order and duplicate keys.
    /// It loosely associates trailing comments or full-line comments to entries.
    pub fn parse(content: &str) -> Self {
        let mut data = IniData::new();
        let mut current_section: Option<IniSection> = None;
        let mut pending_comments: Vec<String> = Vec::new();

        for line in content.lines() {
            let trimmed = line.trim();

            if trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with(';') || trimmed.starts_with('#') {
                pending_comments.push(trimmed.to_string());
                continue;
            }

            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                if let Some(sec) = current_section.take() {
                    data.sections.push(sec);
                }
                current_section = Some(IniSection {
                    name: trimmed[1..trimmed.len() - 1].to_string(),
                    entries: Vec::new(),
                });
                pending_comments.clear();
            } else if let Some(eq_pos) = trimmed.find('=') {
                let key = trimmed[..eq_pos].trim().to_string();
                let val_part = trimmed[eq_pos + 1..].trim();
                
                // Simple inline comment extraction (only if it starts with ; and isn't inside quotes, but for ARK INIs, usually quotes wrap the whole value)
                // To keep it safe and avoid breaking Ark configs, we won't aggressively split inline comments unless obvious.
                let value = val_part.to_string();
                
                let comment = if !pending_comments.is_empty() {
                    let combined = pending_comments.join("\n");
                    pending_comments.clear();
                    Some(combined)
                } else {
                    None
                };

                let entry = IniEntry {
                    key,
                    value,
                    comment,
                };

                if let Some(ref mut sec) = current_section {
                    sec.entries.push(entry);
                } else {
                    // Global scope (no section defined yet)
                    let mut sec = IniSection {
                        name: "__root__".to_string(),
                        entries: Vec::new(),
                    };
                    sec.entries.push(entry);
                    current_section = Some(sec);
                }
            }
        }

        if let Some(sec) = current_section {
            data.sections.push(sec);
        }

        data
    }

    /// Serializes the structured data back into an INI string.
    pub fn serialize(&self) -> String {
        let mut out = String::with_capacity(4096);

        for section in &self.sections {
            if section.name != "__root__" {
                out.push_str(&format!("[{}]\n", section.name));
            }
            for entry in &section.entries {
                if let Some(ref comment) = entry.comment {
                    for line in comment.lines() {
                        out.push_str(&format!("{}\n", line));
                    }
                }
                out.push_str(&format!("{}={}\n", entry.key, entry.value));
            }
            out.push('\n');
        }

        out.trim_end().to_string() + "\n"
    }

    pub fn get_section_mut(&mut self, name: &str) -> Option<&mut IniSection> {
        self.sections.iter_mut().find(|s| s.name == name)
    }

    pub fn get_section(&self, name: &str) -> Option<&IniSection> {
        self.sections.iter().find(|s| s.name == name)
    }

    pub fn ensure_section(&mut self, name: &str) -> &mut IniSection {
        if self.sections.iter().any(|s| s.name == name) {
            return self.get_section_mut(name).unwrap();
        }
        self.sections.push(IniSection {
            name: name.to_string(),
            entries: Vec::new(),
        });
        self.sections.last_mut().unwrap()
    }
}
