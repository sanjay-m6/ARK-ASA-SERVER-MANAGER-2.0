use crate::AppState;
use tauri::State;
use reqwest::Client;
use serde_json::json;

#[tauri::command]
pub async fn save_ase_discord_config(
    webhook_url: String,
    alerts_config: String,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    db.set_setting("ase_discord_webhook_url", &webhook_url).map_err(|e| e.to_string())?;
    db.set_setting("ase_discord_alerts_config", &alerts_config).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_ase_discord_config(
    state: State<'_, AppState>
) -> Result<(String, String), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let webhook_url = db.get_setting("ase_discord_webhook_url")
        .ok()
        .flatten()
        .unwrap_or_default();
        
    let alerts_config = db.get_setting("ase_discord_alerts_config")
        .ok()
        .flatten()
        .unwrap_or_default();
        
    Ok((webhook_url, alerts_config))
}

#[tauri::command]
pub async fn test_ase_discord_webhook(
    webhook_url: String,
    server_id: i64,
    state: State<'_, AppState>
) -> Result<(), String> {
    if webhook_url.trim().is_empty() {
        return Err("Webhook URL is empty".to_string());
    }

    let server_name = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT name FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0)
        ).unwrap_or_else(|_| format!("Server #{}", server_id))
    };

    let payload = json!({
        "embeds": [{
            "title": "🔔 ASE Server Manager - Test Connection",
            "description": format!("This is a test notification from the ASE Server Manager for **{}**! Webhook integration is successfully configured and active.", server_name),
            "color": 0xF59E0B, // Amber
            "footer": {
                "text": "ASE Server Manager 2.0"
            },
            "timestamp": chrono::Utc::now().to_rfc3339()
        }]
    });

    let client = Client::new();
    match client.post(&webhook_url).json(&payload).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                Ok(())
            } else {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                Err(format!("HTTP {} - {}", status, body))
            }
        }
        Err(e) => Err(format!("Network error: {}", e)),
    }
}

#[tauri::command]
pub fn generate_ase_bot_invite_url(client_id: String) -> Result<String, String> {
    if client_id.trim().is_empty() {
        return Err("Client ID is empty".to_string());
    }
    
    // Request basic permissions: Send Messages, Embed Links, Read Message History
    let permissions = "274877910016";
    let invite_url = format!(
        "https://discord.com/api/oauth2/authorize?client_id={}&permissions={}&scope=bot%20applications.commands",
        client_id.trim(),
        permissions
    );
    
    Ok(invite_url)
}
