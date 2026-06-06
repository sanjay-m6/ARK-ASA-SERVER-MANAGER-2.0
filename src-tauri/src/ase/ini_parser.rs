use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════════════
// New line-level document model — preserves every byte of the original file
// ═══════════════════════════════════════════════════════════════════════

/// Represents a single line in the INI file.
#[derive(Debug, Clone)]
pub enum IniLine {
    /// Empty/whitespace-only line — preserved exactly as-is
    Blank(String),
    /// Comment line (starts with ; or #) — preserved exactly
    Comment(String),
    /// Section header e.g. `[ServerSettings]`
    SectionHeader {
        raw: String,
        name: String,
    },
    /// Key=Value entry
    Entry {
        raw: String,
        key: String,
        value: String,
    },
    /// Continuation line for multi-line parenthesized values
    Continuation(String),
    /// Any line that doesn't match known patterns — preserved as-is
    Unknown(String),
}

/// Full document model preserving every line of the original file.
#[derive(Debug, Clone)]
pub struct IniDocument {
    pub lines: Vec<IniLine>,
}

impl IniDocument {
    pub fn new() -> Self {
        Self { lines: Vec::new() }
    }

    /// Parse an INI string into a line-level document model.
    /// Handles multi-line values (parenthesized arrays), comments, blank lines,
    /// duplicate keys, and unknown content.
    pub fn parse(content: &str) -> Self {
        let mut doc = IniDocument::new();
        let mut paren_depth: i32 = 0;

        for raw_line in content.lines() {
            let trimmed = raw_line.trim();

            // If we're inside a multi-line value (open parens), accumulate as Continuation
            if paren_depth > 0 {
                // Count parens on this continuation line
                for ch in trimmed.chars() {
                    match ch {
                        '(' => paren_depth += 1,
                        ')' => paren_depth -= 1,
                        _ => {}
                    }
                }
                doc.lines.push(IniLine::Continuation(raw_line.to_string()));
                continue;
            }

            // Empty/whitespace-only line
            if trimmed.is_empty() {
                doc.lines.push(IniLine::Blank(raw_line.to_string()));
                continue;
            }

            // Comment line
            if trimmed.starts_with(';') || trimmed.starts_with('#') {
                doc.lines.push(IniLine::Comment(raw_line.to_string()));
                continue;
            }

            // Section header
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                let name = trimmed[1..trimmed.len() - 1].to_string();
                doc.lines.push(IniLine::SectionHeader {
                    raw: raw_line.to_string(),
                    name,
                });
                continue;
            }

            // Key=Value entry
            if let Some(eq_pos) = trimmed.find('=') {
                let key = trimmed[..eq_pos].trim().to_string();
                let value = trimmed[eq_pos + 1..].to_string();

                // Check for multi-line: count open/close parens in the value
                for ch in value.chars() {
                    match ch {
                        '(' => paren_depth += 1,
                        ')' => paren_depth -= 1,
                        _ => {}
                    }
                }

                doc.lines.push(IniLine::Entry {
                    raw: raw_line.to_string(),
                    key,
                    value,
                });
                continue;
            }

            // Unknown line — preserve as-is
            doc.lines.push(IniLine::Unknown(raw_line.to_string()));
        }

        doc
    }

    /// Get the current section name for a given line index.
    #[allow(dead_code)]
    fn section_at(&self, idx: usize) -> Option<&str> {

        for i in (0..=idx).rev() {
            if let IniLine::SectionHeader { name, .. } = &self.lines[i] {
                return Some(name);
            }
        }
        None
    }

    /// Get the first value for a key in a section (case-insensitive).
    /// Multi-line entries return the value with all continuation lines joined.
    pub fn get_value(&self, section: &str, key: &str) -> Option<String> {
        let section_lower = section.to_lowercase();
        let key_lower = key.to_lowercase();

        let mut in_target_section = false;
        let mut i = 0;
        while i < self.lines.len() {
            match &self.lines[i] {
                IniLine::SectionHeader { name, .. } => {
                    in_target_section = name.to_lowercase() == section_lower;
                }
                IniLine::Entry { key: k, value: v, .. } if in_target_section => {
                    if k.to_lowercase() == key_lower {
                        // Collect continuation lines
                        let mut full_value = v.clone();
                        let mut j = i + 1;
                        while j < self.lines.len() {
                            if let IniLine::Continuation(cont) = &self.lines[j] {
                                full_value.push('\n');
                                full_value.push_str(cont);
                                j += 1;
                            } else {
                                break;
                            }
                        }
                        return Some(full_value);
                    }
                }
                _ => {}
            }
            i += 1;
        }
        None
    }

    /// Get ALL values for a key in a section (for duplicate keys like OverrideNamedEngramEntries).
    /// Each entry is returned as a separate string (with continuations joined).
    pub fn get_all_values(&self, section: &str, key: &str) -> Vec<String> {
        let section_lower = section.to_lowercase();
        let key_lower = key.to_lowercase();

        let mut results = Vec::new();
        let mut in_target_section = false;
        let mut i = 0;

        while i < self.lines.len() {
            match &self.lines[i] {
                IniLine::SectionHeader { name, .. } => {
                    in_target_section = name.to_lowercase() == section_lower;
                }
                IniLine::Entry { key: k, value: v, .. } if in_target_section => {
                    if k.to_lowercase() == key_lower {
                        let mut full_value = v.clone();
                        let mut j = i + 1;
                        while j < self.lines.len() {
                            if let IniLine::Continuation(cont) = &self.lines[j] {
                                full_value.push('\n');
                                full_value.push_str(cont);
                                j += 1;
                            } else {
                                break;
                            }
                        }
                        results.push(full_value);
                    }
                }
                _ => {}
            }
            i += 1;
        }

        results
    }

    /// Set a single value for a key in a section. Updates the first occurrence in-place.
    /// If no occurrence exists, appends to the section. If the section doesn't exist, creates it.
    pub fn set_value(&mut self, section: &str, key: &str, value: &str) {
        let section_lower = section.to_lowercase();
        let key_lower = key.to_lowercase();

        let mut in_target_section = false;
        let mut first_match: Option<usize> = None;
        let mut duplicates: Vec<usize> = Vec::new();
        let mut section_found = false;

        let mut i = 0;
        while i < self.lines.len() {
            match &self.lines[i] {
                IniLine::SectionHeader { name, .. } => {
                    in_target_section = name.to_lowercase() == section_lower;
                    if in_target_section {
                        section_found = true;
                    }
                }
                IniLine::Entry { key: k, .. } if in_target_section => {
                    if k.to_lowercase() == key_lower {
                        if first_match.is_none() {
                            first_match = Some(i);
                        } else {
                            duplicates.push(i);
                        }
                    }
                }
                _ => {}
            }
            i += 1;
        }



        // Remove continuation lines after duplicates first (in reverse order)
        for &dup_idx in duplicates.iter().rev() {
            // Remove continuation lines after this duplicate
            let j = dup_idx + 1;
            while j < self.lines.len() {
                if let IniLine::Continuation(_) = &self.lines[j] {
                    self.lines.remove(j);
                } else {
                    break;
                }
            }
            self.lines.remove(dup_idx);
        }

        if let Some(match_idx) = first_match {
            // Remove old continuation lines after first match
            let j = match_idx + 1;
            while j < self.lines.len() {
                if let IniLine::Continuation(_) = &self.lines[j] {
                    self.lines.remove(j);
                } else {
                    break;
                }
            }
            // Update the entry in-place
            self.lines[match_idx] = IniLine::Entry {
                raw: format!("{}={}", key, value),
                key: key.to_string(),
                value: value.to_string(),
            };
        } else if section_found {
            // Find insertion point: end of section content (before next section or EOF)
            let insert_at = self.find_section_insert_point(section);
            self.lines.insert(insert_at, IniLine::Entry {
                raw: format!("{}={}", key, value),
                key: key.to_string(),
                value: value.to_string(),
            });
        } else {
            // Section doesn't exist — create it
            // Add blank line separator if file isn't empty
            if !self.lines.is_empty() {
                self.lines.push(IniLine::Blank(String::new()));
            }
            self.lines.push(IniLine::SectionHeader {
                raw: format!("[{}]", section),
                name: section.to_string(),
            });
            self.lines.push(IniLine::Entry {
                raw: format!("{}={}", key, value),
                key: key.to_string(),
                value: value.to_string(),
            });
        }
    }

    /// Set a value only if non-empty; remove the key if empty.
    pub fn set_value_opt(&mut self, section: &str, key: &str, value: &str) {
        if value.is_empty() {
            self.remove_key(section, key);
        } else {
            self.set_value(section, key, value);
        }
    }

    /// Replace ALL entries for a key with a new set of values.
    /// Used for ARK array keys like OverrideNamedEngramEntries, DinoSpawnWeightMultipliers, etc.
    pub fn set_array_values(&mut self, section: &str, key: &str, values: &[String]) {
        let section_lower = section.to_lowercase();
        let key_lower = key.to_lowercase();

        // Collect indices of all matching entries (+ their continuations)
        let mut remove_ranges: Vec<(usize, usize)> = Vec::new();
        let mut in_target_section = false;
        let mut i = 0;
        while i < self.lines.len() {
            match &self.lines[i] {
                IniLine::SectionHeader { name, .. } => {
                    in_target_section = name.to_lowercase() == section_lower;
                }
                IniLine::Entry { key: k, .. } if in_target_section && k.to_lowercase() == key_lower => {
                    let start = i;
                    let mut end = i;
                    let mut j = i + 1;
                    while j < self.lines.len() {
                        if let IniLine::Continuation(_) = &self.lines[j] {
                            end = j;
                            j += 1;
                        } else {
                            break;
                        }
                    }
                    remove_ranges.push((start, end));
                    i = end + 1;
                    continue;
                }
                _ => {}
            }
            i += 1;
        }

        // Calculate insertion point (where first match was, or end of section)
        let insert_at = if let Some(&(start, _)) = remove_ranges.first() {
            start
        } else {
            self.find_section_insert_point(section)
        };

        // Remove old entries in reverse order
        for &(start, end) in remove_ranges.iter().rev() {
            for j in (start..=end).rev() {
                self.lines.remove(j);
            }
        }

        // Calculate adjusted insert point after removals
        let removed_before_insert: usize = remove_ranges.iter()
            .filter(|&&(start, _)| start < insert_at)
            .map(|&(start, end)| end - start + 1)
            .sum();
        let adjusted_insert = insert_at - removed_before_insert;

        // Insert new values
        if !values.is_empty() {
            // Ensure section exists
            self.ensure_section(section);
            let final_insert = adjusted_insert.min(self.lines.len());
            for (offset, val) in values.iter().enumerate() {
                let trimmed = val.trim();
                if !trimmed.is_empty() {
                    self.lines.insert(final_insert + offset, IniLine::Entry {
                        raw: format!("{}={}", key, trimmed),
                        key: key.to_string(),
                        value: trimmed.to_string(),
                    });
                }
            }
        }
    }

    /// Remove ALL occurrences of a key from a section (including continuations).
    pub fn remove_key(&mut self, section: &str, key: &str) {
        let section_lower = section.to_lowercase();
        let key_lower = key.to_lowercase();

        let mut i = 0;
        let mut in_target_section = false;
        while i < self.lines.len() {
            match &self.lines[i] {
                IniLine::SectionHeader { name, .. } => {
                    in_target_section = name.to_lowercase() == section_lower;
                    i += 1;
                }
                IniLine::Entry { key: k, .. } if in_target_section && k.to_lowercase() == key_lower => {
                    self.lines.remove(i);
                    // Also remove trailing continuations
                    while i < self.lines.len() {
                        if let IniLine::Continuation(_) = &self.lines[i] {
                            self.lines.remove(i);
                        } else {
                            break;
                        }
                    }
                    // Don't increment i — we removed the current line
                }
                _ => {
                    i += 1;
                }
            }
        }
    }

    /// Ensure a section header exists. Returns true if it was already present.
    pub fn ensure_section(&mut self, section: &str) -> bool {
        let section_lower = section.to_lowercase();
        for line in &self.lines {
            if let IniLine::SectionHeader { name, .. } = line {
                if name.to_lowercase() == section_lower {
                    return true;
                }
            }
        }
        // Add the section at the end
        if !self.lines.is_empty() {
            self.lines.push(IniLine::Blank(String::new()));
        }
        self.lines.push(IniLine::SectionHeader {
            raw: format!("[{}]", section),
            name: section.to_string(),
        });
        false
    }

    /// Find the insertion point for new entries at the end of a section's content.
    fn find_section_insert_point(&self, section: &str) -> usize {
        let section_lower = section.to_lowercase();
        let mut in_target_section = false;
        let mut last_content_idx: Option<usize> = None;

        for (i, line) in self.lines.iter().enumerate() {
            match line {
                IniLine::SectionHeader { name, .. } => {
                    if in_target_section {
                        // We've hit the next section — insert before it
                        return i;
                    }
                    in_target_section = name.to_lowercase() == section_lower;
                    if in_target_section {
                        last_content_idx = Some(i);
                    }
                }
                IniLine::Entry { .. } | IniLine::Continuation(_) if in_target_section => {
                    last_content_idx = Some(i);
                }
                IniLine::Comment(_) if in_target_section => {
                    last_content_idx = Some(i);
                }
                _ => {}
            }
        }

        // If we're still in the target section at EOF, insert at end
        if let Some(idx) = last_content_idx {
            idx + 1
        } else {
            self.lines.len()
        }
    }

    /// Serialize the document back to a string, preserving all formatting.
    pub fn serialize(&self) -> String {
        let mut out = String::with_capacity(self.lines.len() * 40);

        for line in &self.lines {
            match line {
                IniLine::Blank(raw) => {
                    out.push_str(raw);
                    out.push('\n');
                }
                IniLine::Comment(raw) => {
                    out.push_str(raw);
                    out.push('\n');
                }
                IniLine::SectionHeader { raw, .. } => {
                    out.push_str(raw);
                    out.push('\n');
                }
                IniLine::Entry { raw, .. } => {
                    out.push_str(raw);
                    out.push('\n');
                }
                IniLine::Continuation(raw) => {
                    out.push_str(raw);
                    out.push('\n');
                }
                IniLine::Unknown(raw) => {
                    out.push_str(raw);
                    out.push('\n');
                }
            }
        }

        // Trim trailing newlines and add exactly one
        let trimmed = out.trim_end_matches('\n');
        if trimmed.is_empty() {
            String::new()
        } else {
            format!("{}\n", trimmed)
        }
    }

    /// Convert to the legacy IniData format for backward compatibility.
    pub fn to_ini_data(&self) -> IniData {
        let mut data = IniData::new();
        let mut current_section: Option<&mut IniSection> = None;
        let mut pending_comments: Vec<String> = Vec::new();

        for line in &self.lines {
            match line {
                IniLine::Comment(raw) => {
                    pending_comments.push(raw.trim().to_string());
                }
                IniLine::SectionHeader { name, .. } => {
                    data.sections.push(IniSection {
                        name: name.clone(),
                        entries: Vec::new(),
                    });
                    current_section = data.sections.last_mut();
                    pending_comments.clear();
                }
                IniLine::Entry { key, value, .. } => {
                    let comment = if !pending_comments.is_empty() {
                        let combined = pending_comments.join("\n");
                        pending_comments.clear();
                        Some(combined)
                    } else {
                        None
                    };

                    let entry = IniEntry {
                        key: key.clone(),
                        value: value.clone(),
                        comment,
                    };

                    if let Some(ref mut sec) = current_section {
                        sec.entries.push(entry);
                    } else {
                        data.sections.push(IniSection {
                            name: "__root__".to_string(),
                            entries: vec![entry],
                        });
                        current_section = data.sections.last_mut();
                    }
                }
                _ => {}
            }
        }

        data
    }
}

impl Default for IniDocument {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Legacy compatibility types — kept for existing call sites
// (server.rs, config_advanced.rs, and frontend JSON serialization)
// ═══════════════════════════════════════════════════════════════════════

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
    /// This delegates to IniDocument internally for accurate parsing, then converts.
    pub fn parse(content: &str) -> Self {
        IniDocument::parse(content).to_ini_data()
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
