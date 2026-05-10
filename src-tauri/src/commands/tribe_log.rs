use crate::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

// =============================================================================
// TRIBE LOG VIEWER (Phase B2)
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct TribeLogEntry {
    pub timestamp: String,
    pub day: i32,
    pub event_type: String, // "tamed", "killed", "destroyed", "claimed", "starved", "demolished", "enemy_killed", "member_added", "member_removed", "tribe_renamed"
    pub message: String,
    pub raw_line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TribeLogResult {
    pub server_name: String,
    pub entries: Vec<TribeLogEntry>,
    pub total_parsed: usize,
    pub total_lines: usize,
}

/// Parse tribe logs from a server's Saved directory
fn parse_tribe_log_line(line: &str) -> Option<TribeLogEntry> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    // ARK tribe log format examples:
    // "Day 42, 15:30:22: <RichColor ...>Your Tribe Tamed a Rex - Lvl 150!</>"
    // "Day 42, 15:30:22: <RichColor ...>Tribemember SomePlayer was killed!</>"
    // "Day 42, 15:30:22: <RichColor ...>Your 'Metal Foundation' was destroyed!</>"

    // Extract day number
    let day = if line.starts_with("Day ") {
        line.get(4..)
            .and_then(|s| s.split(',').next())
            .and_then(|s| s.trim().parse::<i32>().ok())
            .unwrap_or(0)
    } else {
        0
    };

    // Extract timestamp (between "Day X, " and ": <")
    let timestamp = line
        .find(", ")
        .and_then(|start| {
            let after = &line[start + 2..];
            after.find(": ").map(|end| after[..end].to_string())
        })
        .unwrap_or_default();

    // Extract message content (strip RichColor tags)
    let message = strip_richcolor_tags(line);

    // Classify event type
    let event_type = classify_tribe_event(&message);

    Some(TribeLogEntry {
        timestamp,
        day,
        event_type,
        message,
        raw_line: line.to_string(),
    })
}

/// Strip ARK RichColor XML-style tags from log lines
fn strip_richcolor_tags(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut in_tag = false;
    let chars = input.chars().peekable();

    // Skip everything before the first ": " after the timestamp
    let skip_prefix = if let Some(pos) = input.find(": ") {
        pos + 2
    } else {
        0
    };

    let trimmed = &input[skip_prefix..];
    let mut tchars = trimmed.chars().peekable();

    while let Some(ch) = tchars.next() {
        if ch == '<' {
            in_tag = true;
            continue;
        }
        if ch == '>' {
            in_tag = false;
            continue;
        }
        if !in_tag {
            result.push(ch);
        }
    }

    // Also handle the outer tag removal for cases like "<RichColor...>text</>"
    let _ = chars;
    result.trim().to_string()
}

/// Classify a tribe log event based on message content
fn classify_tribe_event(message: &str) -> String {
    let lower = message.to_lowercase();

    if lower.contains("tamed") {
        "tamed".to_string()
    } else if lower.contains("was killed") {
        if lower.contains("tribemember") || lower.contains("your") {
            "member_killed".to_string()
        } else {
            "enemy_killed".to_string()
        }
    } else if lower.contains("killed") {
        "killed".to_string()
    } else if lower.contains("destroyed") || lower.contains("was removed") {
        "destroyed".to_string()
    } else if lower.contains("demolished") || lower.contains("auto-decay") {
        "demolished".to_string()
    } else if lower.contains("starved") {
        "starved".to_string()
    } else if lower.contains("claimed") {
        "claimed".to_string()
    } else if lower.contains("added to") || lower.contains("joined") {
        "member_added".to_string()
    } else if lower.contains("removed from") || lower.contains("left") {
        "member_removed".to_string()
    } else if lower.contains("renamed") {
        "tribe_renamed".to_string()
    } else if lower.contains("uploaded") || lower.contains("downloaded") {
        "transfer".to_string()
    } else {
        "other".to_string()
    }
}

/// Get and parse tribe logs for a specific server
#[tauri::command]
pub async fn get_tribe_logs(
    state: State<'_, AppState>,
    server_id: i64,
    limit: Option<usize>,
) -> Result<TribeLogResult, String> {
    println!("📜 Getting tribe logs for server {}", server_id);

    // Get server info
    let (install_path, server_name): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let path: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Server not found: {}", e))?;

        let name: String = conn
            .query_row(
                "SELECT session_name FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "Unknown".to_string());

        (path, name)
    };

    // Scan for tribe log files in the Saved directory
    let saved_dir = PathBuf::from(&install_path).join("ShooterGame/Saved");
    let logs_dir = saved_dir.join("Logs");
    let tribes_dir = saved_dir.join("SavedArks");

    let mut all_entries = Vec::new();
    let mut total_lines = 0usize;

    // Try multiple possible locations for tribe logs
    let search_dirs = vec![
        logs_dir.clone(),
        tribes_dir.clone(),
        saved_dir.clone(),
    ];

    for dir in &search_dirs {
        if !dir.exists() {
            continue;
        }

        // Scan for tribe log files (format: TribeLog_*.txt or *.tribelog)
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name().unwrap_or_default().to_string_lossy();

                if name.contains("Tribe") && (name.ends_with(".log") || name.ends_with(".txt")) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        for line in content.lines() {
                            total_lines += 1;
                            if let Some(entry) = parse_tribe_log_line(line) {
                                all_entries.push(entry);
                            }
                        }
                    }
                }
            }
        }
    }

    // Also parse any tribe log entries from the main server log
    let server_log = logs_dir.join("ShooterGame.log");
    if server_log.exists() {
        if let Ok(content) = std::fs::read_to_string(&server_log) {
            for line in content.lines() {
                if line.contains("TribeLog") || line.contains("Day ") {
                    total_lines += 1;
                    if let Some(entry) = parse_tribe_log_line(line) {
                        all_entries.push(entry);
                    }
                }
            }
        }
    }

    // Sort by day descending (newest first)
    all_entries.sort_by(|a, b| b.day.cmp(&a.day));

    // Apply limit
    let max = limit.unwrap_or(200);
    let total_parsed = all_entries.len();
    all_entries.truncate(max);

    println!(
        "  ✅ Parsed {} tribe log entries from {} total lines",
        total_parsed, total_lines
    );

    Ok(TribeLogResult {
        server_name,
        entries: all_entries,
        total_parsed,
        total_lines,
    })
}
