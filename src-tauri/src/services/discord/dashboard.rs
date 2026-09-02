// Interactive Discord Status Dashboard & Action Component Builder
use crate::AppState;
use serde_json::json;
use tauri::{AppHandle, Manager};

/// Helper to render an ASCII/Unicode progress bar
pub fn render_bar(percentage: f64, width: usize) -> String {
    let pct = percentage.clamp(0.0, 100.0);
    let filled = ((pct / 100.0) * width as f64).round() as usize;
    let filled = filled.min(width);
    let empty = width.saturating_sub(filled);
    return format!("{}{}", "▰".repeat(filled), "▱".repeat(empty));
}

pub struct DashboardBuilder;

pub struct ClusterServerSummary {
    pub id: i64,
    pub name: String,
    pub map_name: String,
    pub status: String,
    pub max_players: i32,
    pub last_started: Option<String>,
}

impl DashboardBuilder {
    /// Fetch all servers belonging to a cluster
    pub fn fetch_servers(app_handle: &AppHandle, cluster_id: i64) -> Result<Vec<ClusterServerSummary>, String> {
        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let sql = if cluster_id > 0 {
            "SELECT id, name, map_name, status, max_players, last_started FROM servers WHERE cluster_id = ?1 ORDER BY id ASC"
        } else {
            "SELECT id, name, map_name, status, max_players, last_started FROM servers ORDER BY id ASC"
        };

        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let mut servers = Vec::new();

        if cluster_id > 0 {
            let rows = stmt.query_map([cluster_id], |row| {
                Ok(ClusterServerSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    map_name: row.get(2)?,
                    status: row.get(3)?,
                    max_players: row.get(4)?,
                    last_started: row.get(5)?,
                })
            }).map_err(|e| e.to_string())?;
            for r in rows.flatten() {
                servers.push(r);
            }
        } else {
            let rows = stmt.query_map([], |row| {
                Ok(ClusterServerSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    map_name: row.get(2)?,
                    status: row.get(3)?,
                    max_players: row.get(4)?,
                    last_started: row.get(5)?,
                })
            }).map_err(|e| e.to_string())?;
            for r in rows.flatten() {
                servers.push(r);
            }
        }

        Ok(servers)
    }

    /// Build the full JSON payload for the Discord Dashboard message
    pub async fn build_dashboard_payload(
        app_handle: &AppHandle,
        cluster_id: i64,
    ) -> Result<serde_json::Value, String> {
        let servers = Self::fetch_servers(app_handle, cluster_id)?;
        
        let player_counts = if let Some(state) = app_handle.try_state::<AppState>() {
            state.player_intelligence.get_player_counts().await
        } else {
            std::collections::HashMap::new()
        };

        // System CPU and Memory Telemetry
        let (cpu_usage, ram_usage, ram_used_gb, ram_total_gb) = {
            if let Some(state) = app_handle.try_state::<AppState>() {
                if let Ok(mut sys) = state.sys.lock() {
                    sys.refresh_cpu_usage();
                    sys.refresh_memory();
                    let cpus = sys.cpus();
                    let cpu_u = if !cpus.is_empty() {
                        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() as f64 / cpus.len() as f64
                    } else {
                        0.0
                    };
                    let used_gb = sys.used_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
                    let total_gb = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
                    let ram_u = if total_gb > 0.0 { (used_gb / total_gb) * 100.0 } else { 0.0 };
                    (cpu_u, ram_u, used_gb, total_gb)
                } else {
                    (0.0, 0.0, 0.0, 0.0)
                }
            } else {
                (0.0, 0.0, 0.0, 0.0)
            }
        };

        let cpu_bar = render_bar(cpu_usage, 10);
        let ram_bar = render_bar(ram_usage, 10);

        let mut desc = format!("⏱️ **Cluster Command Center** • Updated: <t:{}:R>\n\n", chrono::Utc::now().timestamp());
        let mut select_options = Vec::new();
        let mut total_online_players = 0;
        let mut total_capacity = 0;

        for s in &servers {
            let player_count = player_counts.get(&s.id).copied().unwrap_or(0);
            total_capacity += s.max_players;

            let (status_icon, status_text) = match s.status.as_str() {
                "online" | "running" => {
                    total_online_players += player_count;
                    ("🟢", "Online")
                },
                "starting" => ("🟡", "Starting"),
                "stopped" => ("🔴", "Offline"),
                "crashed" => ("💥", "Crashed"),
                "updating" | "updates" => ("🔄", "Updating"),
                "restarting" => ("🔁", "Restarting"),
                "repairing" => ("🔧", "Repairing"),
                "startup_timeout" => ("⏰", "Timed Out"),
                _ => ("🔴", "Offline"),
            };

            let uptime_str: String = if s.status == "running" || s.status == "online" {
                if let Some(started_at_str) = &s.last_started {
                    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(started_at_str, "%Y-%m-%d %H:%M:%S") {
                        let started_ts = dt.and_utc().timestamp();
                        let ts_str: String = format!("<t:{}:R>", started_ts);
                        ts_str
                    } else {
                        "Online".to_string()
                    }
                } else {
                    "Online".to_string()
                }
            } else {
                status_text.to_string()
            };

            desc.push_str(&format!(
                "{} **{}** `(#{})` — *{}*\n└ Status: `{}` | Players: `[ {} / {} ]` | Uptime: {}\n\n",
                status_icon, s.name, s.id, s.map_name, s.status.to_uppercase(), player_count, s.max_players, uptime_str
            ));

            select_options.push(json!({
                "label": format!("#{}: {}", s.id, s.name.chars().take(40).collect::<String>()),
                "value": s.id.to_string(),
                "description": format!("{} {} | {}/{} Players | Map: {}", status_icon, status_text, player_count, s.max_players, s.map_name)
            }));
        }

        if servers.is_empty() {
            desc.push_str("*No ARK servers currently assigned to this cluster.*\n");
        }

        let mut components = Vec::new();

        // Row 1: Select menu for individual server control
        if !select_options.is_empty() {
            components.push(json!({
                "type": 1,
                "components": [
                    {
                        "type": 3,
                        "custom_id": "select_server_dashboard",
                        "placeholder": "🎯 Select a Server for Quick Actions & Controls...",
                        "options": select_options
                    }
                ]
            }));
        }

        // Row 2: Cluster Management Buttons
        components.push(json!({
            "type": 1,
            "components": [
                {
                    "type": 2,
                    "label": "⚡ Start All",
                    "style": 3,
                    "custom_id": "cluster_start_all"
                },
                {
                    "type": 2,
                    "label": "🛑 Stop All",
                    "style": 4,
                    "custom_id": "cluster_stop_all"
                },
                {
                    "type": 2,
                    "label": "🔄 Restart All",
                    "style": 1,
                    "custom_id": "cluster_restart_all"
                },
                {
                    "type": 2,
                    "label": "⬇️ Update All",
                    "style": 2,
                    "custom_id": "cluster_update_all"
                },
                {
                    "type": 2,
                    "label": "🔁 Refresh",
                    "style": 2,
                    "custom_id": "cluster_refresh"
                }
            ]
        }));

        let payload = json!({
            "content": "",
            "embeds": [{
                "title": "🦖 ARK SERVER MANAGER — LIVE COMMAND CENTER",
                "description": desc,
                "color": 0x3B82F6,
                "fields": [
                    {
                        "name": "💻 Host CPU Usage",
                        "value": format!("`{}` `{:.1}%`", cpu_bar, cpu_usage),
                        "inline": true
                    },
                    {
                        "name": "🧠 Host RAM Usage",
                        "value": format!("`{}` `{:.1}%` ({:.1}/{:.1} GB)", ram_bar, ram_usage, ram_used_gb, ram_total_gb),
                        "inline": true
                    },
                    {
                        "name": "👥 Active Survivors",
                        "value": format!("**{}** / **{}** online", total_online_players, total_capacity),
                        "inline": true
                    }
                ],
                "footer": {
                    "text": "ARK: Survival Ascended Server Manager 2.0 • Realtime Dashboard"
                }
            }],
            "components": components
        });

        Ok(payload)
    }

    /// Build Quick Actions panel when an admin selects a specific server
    pub async fn build_server_controls_response(
        app_handle: &AppHandle,
        server_id: i64,
    ) -> Result<(serenity::all::CreateEmbed, Vec<serenity::all::CreateActionRow>), String> {
        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        
        let server_info: Option<(String, String, String, i32, Option<String>)> = {
            let db_opt = state.db.lock().ok();
            db_opt.and_then(|db| {
                let conn = db.get_connection().ok()?;
                conn.query_row(
                    "SELECT name, status, map_name, max_players, last_started FROM servers WHERE id = ?1",
                    [server_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
                ).ok()
            })
        };

        let (name, status, map_name, max_players, last_started) = server_info.ok_or_else(|| format!("Server #{} not found", server_id))?;
        
        let player_count = state.player_intelligence.get_player_counts().await.get(&server_id).copied().unwrap_or(0);

        let (status_icon, status_color) = match status.as_str() {
            "online" | "running" => ("🟢", 0x22C55E),
            "starting" => ("🟡", 0xF59E0B),
            "stopped" => ("🔴", 0xEF4444),
            "crashed" => ("💥", 0xDC2626),
            "updating" | "updates" => ("🔄", 0x3B82F6),
            "restarting" => ("🔁", 0x8B5CF6),
            _ => ("⚪", 0x6B7280),
        };

        let is_running = status == "online" || status == "running";

        let uptime_display: String = if is_running {
            if let Some(started_at_str) = last_started {
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&started_at_str, "%Y-%m-%d %H:%M:%S") {
                    let ts_str: String = format!("<t:{}:R>", dt.and_utc().timestamp());
                    ts_str
                } else {
                    "Online".to_string()
                }
            } else {
                "Online".to_string()
            }
        } else {
            status.to_uppercase()
        };

        let desc = format!(
            "{} **Server #{} — {}**\n\n\
            • **Map:** `{}`\n\
            • **Status:** `{}`\n\
            • **Survivors Online:** `{}/{}`\n\
            • **Uptime:** {}\n\n\
            *Select an administrative action below to manage this server remotely:*",
            status_icon, server_id, name, map_name, status.to_uppercase(), player_count, max_players, uptime_display
        );

        let embed = serenity::all::CreateEmbed::new()
            .title(format!("⚙️ Control Panel — {}", name))
            .description(desc)
            .color(status_color)
            .footer(serenity::all::CreateEmbedFooter::new("ARK Server Manager 2.0 • Remote Operations"))
            .timestamp(serenity::model::Timestamp::now());

        let mut buttons = Vec::new();

        if is_running {
            buttons.push(serenity::all::CreateButton::new(format!("srv_stop_{}", server_id))
                .label("🛑 Stop")
                .style(serenity::all::ButtonStyle::Danger));
            buttons.push(serenity::all::CreateButton::new(format!("srv_restart_{}", server_id))
                .label("🔄 Restart")
                .style(serenity::all::ButtonStyle::Primary));
            buttons.push(serenity::all::CreateButton::new(format!("srv_backup_{}", server_id))
                .label("📦 Backup Now")
                .style(serenity::all::ButtonStyle::Success));
            buttons.push(serenity::all::CreateButton::new(format!("srv_bcast_{}", server_id))
                .label("📢 Broadcast")
                .style(serenity::all::ButtonStyle::Secondary));
        } else {
            buttons.push(serenity::all::CreateButton::new(format!("srv_start_{}", server_id))
                .label("🚀 Start")
                .style(serenity::all::ButtonStyle::Success));
            buttons.push(serenity::all::CreateButton::new(format!("srv_update_{}", server_id))
                .label("⬇️ Update Files")
                .style(serenity::all::ButtonStyle::Primary));
            buttons.push(serenity::all::CreateButton::new(format!("srv_backup_{}", server_id))
                .label("📦 Backup Now")
                .style(serenity::all::ButtonStyle::Secondary));
        }

        let action_row = serenity::all::CreateActionRow::Buttons(buttons);
        Ok((embed, vec![action_row]))
    }

    /// Build a 2-step confirmation prompt for destructive actions
    pub fn build_confirmation_prompt(
        action_id: &str,
        action_name: &str,
        target_description: &str,
    ) -> (serenity::all::CreateEmbed, serenity::all::CreateActionRow) {
        let embed = serenity::all::CreateEmbed::new()
            .title("⚠️ Action Confirmation Required")
            .description(format!(
                "Are you sure you want to execute **{}** on **{}**?\n\n\
                *This confirmation will expire in 60 seconds.*",
                action_name, target_description
            ))
            .color(0xF59E0B)
            .footer(serenity::all::CreateEmbedFooter::new("Safety Guard • Two-Step Verification"));

        let buttons = vec![
            serenity::all::CreateButton::new(format!("confirm_{}", action_id))
                .label("✅ Confirm & Execute")
                .style(serenity::all::ButtonStyle::Danger),
            serenity::all::CreateButton::new(format!("cancel_{}", action_id))
                .label("❌ Cancel")
                .style(serenity::all::ButtonStyle::Secondary),
        ];

        let row = serenity::all::CreateActionRow::Buttons(buttons);
        (embed, row)
    }
}