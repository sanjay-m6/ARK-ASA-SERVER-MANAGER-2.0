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
        }
    ])
}

// ── Commands ───────────────────────────────────────────────────────────

/// Non-streaming AI chat — sends messages to NVIDIA API and returns full response
#[tauri::command]
pub async fn ai_chat(
    state: tauri::State<'_, AppState>,
    messages: Vec<AiMessage>,
    model: String,
) -> Result<AiResponse, String> {
    // Read API key from settings DB
    let api_key = {
        let db = state.db.lock().map_err(|e| format!("DB lock failed: {}", e))?;
        let conn = db.get_connection().map_err(|e| format!("DB connection failed: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = 'nvidia_api_key'")
            .map_err(|e| format!("DB query failed: {}", e))?;
        let key: Option<String> = stmt
            .query_row([], |row| row.get(0))
            .ok();
        key
    };

    let api_key = api_key
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| "NVIDIA API key not configured. Add it in Settings → API Keys.".to_string())?;

    // Build request body
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "tools": get_tool_definitions(),
        "tool_choice": "auto",
        "temperature": 0.7,
        "max_tokens": 4096,
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://integrate.api.nvidia.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
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
    // Read API key from settings DB
    let api_key = {
        let db = state.db.lock().map_err(|e| format!("DB lock failed: {}", e))?;
        let conn = db.get_connection().map_err(|e| format!("DB connection failed: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = 'nvidia_api_key'")
            .map_err(|e| format!("DB query failed: {}", e))?;
        let key: Option<String> = stmt
            .query_row([], |row| row.get(0))
            .ok();
        key
    };

    let api_key = api_key
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| "NVIDIA API key not configured. Add it in Settings → API Keys.".to_string())?;

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4096,
        "stream": true,
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://integrate.api.nvidia.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
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
