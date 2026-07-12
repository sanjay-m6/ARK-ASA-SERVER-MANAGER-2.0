use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

// ── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChoice {
    pub message: AiChoiceMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChoiceMessage {
    pub role: String,
    pub content: Option<String>,
    pub tool_calls: Option<Vec<AiToolCallRaw>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiToolCallRaw {
    pub id: String,
    pub r#type: String,
    pub function: AiToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiApiResponse {
    pub choices: Option<Vec<AiChoice>>,
    pub error: Option<AiApiError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiApiError {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<AiToolCall>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiStreamChunk {
    pub content: String,
    pub done: bool,
}

// ── Tool Definitions (sent to the AI model) ────────────────────────────

fn get_tool_definitions() -> serde_json::Value {
    serde_json::json!([
        {
            "type": "function",
            "function": {
                "name": "get_server_status",
                "description": "Get the status of all ARK servers managed by the application. Returns server names, IDs, status (running/stopped), and basic info.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "install_server",
                "description": "Installs and configures a new ARK server instance. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "install_path": { "type": "string", "description": "The installation path. Defaults to C:\\ARKServers\\AIServer" },
                        "name": { "type": "string", "description": "The name of the server. Defaults to 'AI Managed Server'" },
                        "map_name": { "type": "string", "description": "The map name. Defaults to 'TheIsland_WP'" },
                        "game_port": { "type": "integer", "description": "The game port. Defaults to 7777" },
                        "query_port": { "type": "integer", "description": "The query port. Defaults to 27015" },
                        "rcon_port": { "type": "integer", "description": "The RCON port. Defaults to 27020" }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "start_server",
                "description": "Start an ARK server by its ID. Requires confirmation from the user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID to start" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "stop_server",
                "description": "Stop a running ARK server by its ID. Requires confirmation from the user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID to stop" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "restart_server",
                "description": "Restart an ARK server by its ID. This will stop and then start the server. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID to restart" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_backup",
                "description": "Create a backup of an ARK server's save data.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID to backup" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_system_info",
                "description": "Get current system information including CPU usage, RAM usage, disk space, and OS details.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_server_logs",
                "description": "Get recent log entries for an ARK server.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID to get logs for" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "rcon_command",
                "description": "Execute an RCON command on a running ARK server. Requires confirmation for destructive commands.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "command": { "type": "string", "description": "The RCON command to execute" }
                    },
                    "required": ["server_id", "command"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "broadcast_message",
                "description": "Broadcast a message to all players on a running ARK server via RCON.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "message": { "type": "string", "description": "The message to broadcast" }
                    },
                    "required": ["server_id", "message"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_scheduled_tasks",
                "description": "Get all scheduled tasks configured in the scheduler.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_server",
                "description": "Check for and install ARK server updates via SteamCMD. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID to update" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "analyze_crash_log",
                "description": "Fetches recent crash events and log anomalies to diagnose server instability.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        },
        // ── Config Engine Tools ──────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "read_ini_config",
                "description": "Reads the raw contents of a server INI config file. Use config_type: 'GameUserSettings', 'Game', or 'Engine'.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "config_type": { "type": "string", "description": "Config file type: 'GameUserSettings', 'Game', or 'Engine'" }
                    },
                    "required": ["server_id", "config_type"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "save_ini_config",
                "description": "Writes INI content to a server config file. Always backup first. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "config_type": { "type": "string", "description": "Config type: 'GameUserSettings', 'Game', or 'Engine'" },
                        "content": { "type": "string", "description": "The full INI content to write" }
                    },
                    "required": ["server_id", "config_type", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "load_server_config",
                "description": "Loads the fully parsed server configuration including all multipliers, rates, and settings as a structured object.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "backup_ini_config",
                "description": "Creates a timestamped backup of a config file before making changes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "config_type": { "type": "string", "description": "Config type to backup" }
                    },
                    "required": ["server_id", "config_type"]
                }
            }
        },
        // ── Backup Management Tools ──────────────────────────
        {
            "type": "function",
            "function": {
                "name": "list_backups",
                "description": "Lists all backups for a server, sorted newest first.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "restore_backup",
                "description": "Restores a server from a specific backup. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "backup_id": { "type": "integer", "description": "The backup ID to restore" }
                    },
                    "required": ["backup_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_backup",
                "description": "Deletes a specific backup by ID. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "backup_id": { "type": "integer", "description": "The backup ID to delete" }
                    },
                    "required": ["backup_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "cleanup_old_backups",
                "description": "Removes old backups, keeping only the most recent N backups for a server.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "keep_count": { "type": "integer", "description": "Number of recent backups to keep. Defaults to 5" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        // ── Player Management Tools ──────────────────────────
        {
            "type": "function",
            "function": {
                "name": "list_players",
                "description": "Lists all currently online players on a server via RCON ListPlayers.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "kick_player",
                "description": "Kicks a player from the server. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "player_id": { "type": "string", "description": "The Steam ID or player name to kick" }
                    },
                    "required": ["server_id", "player_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "ban_player",
                "description": "Permanently bans a player from the server by Steam ID. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "player_id": { "type": "string", "description": "The Steam ID to ban" }
                    },
                    "required": ["server_id", "player_id"]
                }
            }
        },
        // ── Scheduler Tools ──────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "create_scheduled_task",
                "description": "Creates a new scheduled task. Types: 'backup', 'restart', 'update', 'rcon_command'. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" },
                        "task_type": { "type": "string", "description": "Type: 'backup', 'restart', 'update', or 'rcon_command'" },
                        "cron_expression": { "type": "string", "description": "Cron expression like '0 3 * * 0' for every Sunday at 3am" },
                        "name": { "type": "string", "description": "Human-readable name for the task" },
                        "rcon_command": { "type": "string", "description": "RCON command if task_type is 'rcon_command'" }
                    },
                    "required": ["server_id", "task_type", "cron_expression", "name"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_scheduled_task",
                "description": "Deletes a scheduled task by its ID. Requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": { "type": "integer", "description": "The task ID to delete" }
                    },
                    "required": ["task_id"]
                }
            }
        },
        // ── Navigation Tool ──────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "navigate_to_page",
                "description": "Navigates the user to a specific page: '/dashboard', '/servers', '/mods', '/config-editor', '/backup', '/rcon', '/scheduler', '/players', '/infinity-ai', '/settings', '/cluster', '/plugins', '/firewall', '/import', '/community', '/advanced-config'",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "The route path to navigate to" }
                    },
                    "required": ["path"]
                }
            }
        },
        // ── Mod Manager Tools ────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "search_mods",
                "description": "Searches for ARK mods on CurseForge or Steam Workshop.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search query for mod name" },
                        "source": { "type": "string", "description": "Source: 'curseforge' or 'steam'. Defaults to 'curseforge'" }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_installed_mods",
                "description": "Gets the list of mods currently installed on a server.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" }
                    },
                    "required": ["server_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "save_world",
                "description": "Forces a world save on a running server via RCON SaveWorld command.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_id": { "type": "integer", "description": "The server ID" }
                    },
                    "required": ["server_id"]
                }
            }
        }
    ])
}

// ── Provider Resolution ────────────────────────────────────────────────

/// Resolved endpoint config for the active AI provider.
struct AiProviderConfig {
    /// Full chat-completions endpoint URL.
    endpoint: String,
    /// Bearer token, if the provider requires auth. LM Studio typically does not.
    api_key: Option<String>,
    /// Effective model id to send in the request body.
    model: String,
}

/// Normalizes an OpenAI-compatible base URL to a `/chat/completions` endpoint.
/// Accepts either a bare base ("http://localhost:1234/v1") or a full endpoint.
fn build_openai_endpoint(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{}/chat/completions", trimmed)
    }
}

/// Resolves the AI provider config from the settings DB.
///
/// - `nvidia` (default): NVIDIA NIM cloud API, requires `nvidia_api_key`.
/// - `lmstudio`: local LM Studio (OpenAI-compatible) server at `lmstudio_base_url`.
///   API key is optional; the custom loaded model name (`lmstudio_model`) overrides
///   the requested model when set.
fn resolve_ai_config(
    state: &tauri::State<'_, AppState>,
    requested_model: String,
) -> Result<AiProviderConfig, String> {
    let db = state.db.lock().map_err(|e| format!("DB lock failed: {}", e))?;

    let get = |key: &str| -> Option<String> {
        db.get_setting(key).ok().flatten().filter(|v| !v.trim().is_empty())
    };

    let provider = get("ai_provider").unwrap_or_else(|| "nvidia".to_string());

    match provider.as_str() {
        "lmstudio" => {
            let base = get("lmstudio_base_url")
                .unwrap_or_else(|| "http://localhost:1234/v1".to_string());
            // Custom loaded model takes precedence; fall back to whatever the UI passed.
            let model = get("lmstudio_model").unwrap_or(requested_model);
            Ok(AiProviderConfig {
                endpoint: build_openai_endpoint(&base),
                api_key: get("lmstudio_api_key"),
                model,
            })
        }
        _ => {
            let api_key = get("nvidia_api_key").ok_or_else(|| {
                "NVIDIA API key not configured. Add it in Settings → API Keys.".to_string()
            })?;
            Ok(AiProviderConfig {
                endpoint: "https://integrate.api.nvidia.com/v1/chat/completions".to_string(),
                api_key: Some(api_key),
                model: requested_model,
            })
        }
    }
}

// ── Commands ───────────────────────────────────────────────────────────

/// Non-streaming AI chat — sends messages to the configured provider and returns full response
#[tauri::command]
pub async fn ai_chat(
    state: tauri::State<'_, AppState>,
    messages: Vec<AiMessage>,
    model: String,
) -> Result<AiResponse, String> {
    let config = resolve_ai_config(&state, model)?;

    // Build request body
    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "tools": get_tool_definitions(),
        "tool_choice": "auto",
        "temperature": 0.7,
        "max_tokens": 4096,
    });

    let client = reqwest::Client::new();
    let mut req = client
        .post(&config.endpoint)
        .header("Content-Type", "application/json")
        .json(&body);
    if let Some(key) = &config.api_key {
        req = req.header("Authorization", format!("Bearer {}", key));
    }
    let response = req
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        // Try to parse error message from API
        if let Ok(err_resp) = serde_json::from_str::<AiApiResponse>(&response_text) {
            if let Some(err) = err_resp.error {
                return Err(format!("API error ({}): {}", status, err.message));
            }
        }
        return Err(format!("API error ({}): {}", status, response_text));
    }

    let api_resp: AiApiResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse API response: {} — raw: {}", e, &response_text[..200.min(response_text.len())]))?;

    let choice = api_resp
        .choices
        .and_then(|c| c.into_iter().next())
        .ok_or_else(|| "No response from AI model".to_string())?;

    let tool_calls = choice
        .message
        .tool_calls
        .unwrap_or_default()
        .into_iter()
        .map(|tc| AiToolCall {
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
        })
        .collect();

    Ok(AiResponse {
        content: choice.message.content,
        tool_calls,
        finish_reason: choice.finish_reason,
    })
}

/// Streaming AI chat — emits tokens via Tauri events for real-time UX
#[tauri::command]
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    messages: Vec<AiMessage>,
    model: String,
) -> Result<(), String> {
    let config = resolve_ai_config(&state, model)?;

    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4096,
        "stream": true,
    });

    let client = reqwest::Client::new();
    let mut req = client
        .post(&config.endpoint)
        .header("Content-Type", "application/json")
        .json(&body);
    if let Some(key) = &config.api_key {
        req = req.header("Authorization", format!("Bearer {}", key));
    }
    let response = req
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        let _ = app.emit("ai-stream-chunk", AiStreamChunk {
            content: format!("API error ({}): {}", status, err_text),
            done: true,
        });
        return Err(format!("API error: {}", status));
    }

    // Process SSE stream
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[AI Stream] Error reading chunk: {}", e);
                break;
            }
        };

        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
                    let _ = app.emit("ai-stream-chunk", AiStreamChunk {
                        content: String::new(),
                        done: true,
                    });
                    return Ok(());
                }

                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                        let _ = app.emit("ai-stream-chunk", AiStreamChunk {
                            content: content.to_string(),
                            done: false,
                        });
                    }
                }
            }
        }
    }

    let _ = app.emit("ai-stream-chunk", AiStreamChunk {
        content: String::new(),
        done: true,
    });

    Ok(())
}

/// Lists models currently loaded/available on an LM Studio (or any OpenAI-compatible)
/// server. Used by Settings to detect the custom loaded model and verify connectivity.
/// `base_url` is optional — falls back to the saved `lmstudio_base_url` setting.
#[tauri::command]
pub async fn lmstudio_list_models(
    state: tauri::State<'_, AppState>,
    base_url: Option<String>,
) -> Result<Vec<String>, String> {
    let (base, api_key) = {
        let db = state.db.lock().map_err(|e| format!("DB lock failed: {}", e))?;
        let get = |key: &str| -> Option<String> {
            db.get_setting(key).ok().flatten().filter(|v| !v.trim().is_empty())
        };
        let base = base_url
            .filter(|b| !b.trim().is_empty())
            .or_else(|| get("lmstudio_base_url"))
            .unwrap_or_else(|| "http://localhost:1234/v1".to_string());
        (base, get("lmstudio_api_key"))
    };

    let url = format!("{}/models", base.trim().trim_end_matches('/'));

    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    if let Some(key) = &api_key {
        req = req.header("Authorization", format!("Bearer {}", key));
    }
    let response = req
        .send()
        .await
        .map_err(|e| format!("Failed to reach LM Studio at {}: {}", url, e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("LM Studio error ({}): {}", status, text));
    }

    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    let models = parsed["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(models)
}
