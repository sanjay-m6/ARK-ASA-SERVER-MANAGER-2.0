// Server Installation Service with Real-time Progress Events
// Handles SteamCMD-based server installation with progress reporting and console output

use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Progress event payload for frontend
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub install_path: String,
    pub stage: String,
    pub progress: f32,
    pub message: String,
    pub is_complete: bool,
    pub is_error: bool,
}

/// Console output event for realtime log display
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleOutput {
    pub install_path: String,
    pub line: String,
    pub line_type: String, // "info", "progress", "warning", "error", "success"
    pub timestamp: String,
}

static STEAMCMD_EXECUTION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub struct ServerInstaller {
    app_handle: AppHandle,
    install_path: String,
}

fn log_to_file(msg: &str) {
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\Users\\sanja\\AppData\\Roaming\\com.ark.asaservermanager\\rust_debug.log")
    {
        use std::io::Write;
        let _ = writeln!(file, "[{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), msg);
    }
}

impl ServerInstaller {
    pub fn new(app_handle: AppHandle, install_path: String) -> Self {
        log_to_file(&format!("New ServerInstaller created with install_path: {}", install_path));
        Self { app_handle, install_path }
    }

    fn emit_progress(&self, stage: &str, progress: f32, message: &str) {
        log_to_file(&format!("emit_progress: Stage={}, Progress={}, Msg={}, Path={}", stage, progress, message, self.install_path));
        let res = self.app_handle.emit(
            "install-progress",
            InstallProgress {
                install_path: self.install_path.clone(),
                stage: stage.to_string(),
                progress,
                message: message.to_string(),
                is_complete: false,
                is_error: false,
            },
        );
        if let Err(e) = res {
            log_to_file(&format!("  ERROR emitting install-progress: {:?}", e));
        }
    }

    pub fn emit_console(&self, line: &str, line_type: &str) {
        let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
        log_to_file(&format!("emit_console: Type={}, Line={}", line_type, line));

        let res = self.app_handle.emit(
            "install-console",
            ConsoleOutput {
                install_path: self.install_path.clone(),
                line: line.to_string(),
                line_type: line_type.to_string(),
                timestamp,
            },
        );
        if let Err(e) = res {
            log_to_file(&format!("  ERROR emitting install-console: {:?}", e));
        }
    }

    pub fn emit_complete(&self, message: &str) {
        let _ = self.app_handle.emit(
            "install-progress",
            InstallProgress {
                install_path: self.install_path.clone(),
                stage: "complete".to_string(),
                progress: 100.0,
                message: message.to_string(),
                is_complete: true,
                is_error: false,
            },
        );
        self.emit_console("✓ Installation completed successfully!", "success");
    }

    fn emit_error(&self, message: &str) {
        let _ = self.app_handle.emit(
            "install-progress",
            InstallProgress {
                install_path: self.install_path.clone(),
                stage: "error".to_string(),
                progress: 0.0,
                message: message.to_string(),
                is_complete: false,
                is_error: true,
            },
        );
        self.emit_console(&format!("✗ Error: {}", message), "error");
    }

    /// Install ARK server via SteamCMD (ASA or ASE)
    pub async fn install_server(&self, install_path: &PathBuf, server_type: &str, branch: Option<String>) -> Result<bool, String> {
        self.emit_progress("preparing", 5.0, "Preparing installation...");
        self.emit_console(
            &format!("Starting ARK: Survival {} server installation...", if server_type == "ASE" { "Evolved" } else { "Ascended" }),
            "info",
        );

        // Create install directory if it doesn't exist
        if !install_path.exists() {
            self.emit_console(
                &format!("Creating directory: {}", install_path.display()),
                "info",
            );
            std::fs::create_dir_all(install_path)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        let (server_exe_name, app_id) = if server_type == "ASE" {
            ("ShooterGameServer.exe", "376030")
        } else {
            ("ArkAscendedServer.exe", "2430930")
        };

        // Check if server is already installed
        let server_exe = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join(server_exe_name);

        // Smart Up-To-Date Check: Verify local BuildID against Steam API
        let local_build = get_local_build_id(install_path, app_id);
        if server_exe.exists() && local_build.is_some() {
            let current_local = local_build.clone().unwrap();
            self.emit_console("Checking Steam Web API for latest server build version...", "info");
            if let Some(remote_build) = get_remote_build_id(app_id).await {
                self.emit_console(&format!("  Current Local BuildID: {}", current_local), "info");
                self.emit_console(&format!("  Latest Steam BuildID: {}", remote_build), "info");

                if current_local == remote_build {
                    self.emit_console("", "info");
                    self.emit_console(
                        "═══════════════════════════════════════════════════════════",
                        "success",
                    );
                    self.emit_console("  ✨ Server is already UP TO DATE!", "success");
                    self.emit_console(&format!("  Local BuildID {} matches latest Steam release.", current_local), "success");
                    self.emit_console(
                        "═══════════════════════════════════════════════════════════",
                        "success",
                    );
                    self.emit_console("", "info");
                    self.emit_progress("finishing", 100.0, "Server up to date!");
                    self.emit_complete("Server up to date!");
                    return Ok(false);
                } else {
                    self.emit_console(
                        &format!("  🚀 New update detected! Upgrading BuildID {} ➔ {}", current_local, remote_build),
                        "warning",
                    );
                }
            } else {
                self.emit_console("  ⚠️ Could not reach Steam API (timeout/offline). Proceeding with SteamCMD file validation...", "warning");
            }
        } else if server_exe.exists() {
            self.emit_console("", "info");
            self.emit_console(
                "Found partial installation, will validate and repair...",
                "warning",
            );
        } else {
            self.emit_console(
                "No existing installation found, starting fresh download...",
                "info",
            );
        }

        self.emit_progress("preparing", 10.0, "Finding SteamCMD...");
        self.emit_console("Locating SteamCMD executable...", "info");

        // Get SteamCMD path (supports custom path override via settings)
        let steamcmd_dir = {
            let app_dir = self
                .app_handle
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app dir: {}", e))?;

            // Try to read custom_steamcmd_path from settings DB
            if let Some(state) = self.app_handle.try_state::<crate::AppState>() {
                crate::services::resolve_steamcmd_dir_from_state(&state, &self.app_handle)
                    .unwrap_or_else(|_| app_dir.join("steamcmd"))
            } else {
                app_dir.join("steamcmd")
            }
        };
        let steamcmd_exe = steamcmd_dir.join("steamcmd.exe");

        // Self-heal: if SteamCMD isn't present in the resolved (possibly custom)
        // folder, provision it there now instead of failing. This covers the case
        // where the user set a custom SteamCMD path that hasn't been populated yet.
        if !steamcmd_exe.exists() {
            self.emit_console(
                &format!(
                    "SteamCMD not found in {}. Downloading and installing it now...",
                    steamcmd_dir.display()
                ),
                "info",
            );
            let provisioner = crate::services::steamcmd::SteamCmdService::with_custom_dir(
                self.app_handle.clone(),
                steamcmd_dir.clone(),
            );
            if let Err(e) = provisioner.install().await {
                self.emit_console(
                    &format!("Failed to install SteamCMD automatically: {}", e),
                    "error",
                );
                return Err(format!("SteamCMD installation failed: {}", e));
            }
            if !steamcmd_exe.exists() {
                self.emit_console(
                    "SteamCMD installation completed but steamcmd.exe is still missing.",
                    "error",
                );
                return Err("SteamCMD not installed".to_string());
            }
            self.emit_console("SteamCMD installed successfully.", "success");
        }

        self.emit_console(
            &format!("SteamCMD found: {}", steamcmd_exe.display()),
            "success",
        );

        // Acquire global lock to ensure server updates/installations execute sequentially
        // preventing concurrent SteamCMD file lock collisions and Error 8.
        let _exec_guard = STEAMCMD_EXECUTION_LOCK.lock().await;

        self.emit_console("", "info");
        self.emit_console(
            "═══════════════════════════════════════════════════════════",
            "info",
        );
        self.emit_console(
            &format!("  SteamCMD - ARK: Survival {} Dedicated Server", if server_type == "ASE" { "Evolved" } else { "Ascended" }),
            "info",
        );
        self.emit_console(&format!("  App ID: {}", app_id), "info");
        self.emit_console(&format!("  Target: {}", install_path.display()), "info");
        self.emit_console(
            "═══════════════════════════════════════════════════════════",
            "info",
        );
        self.emit_console("", "info");

        // Pre-flight disk space check
        let disks = sysinfo::Disks::new_with_refreshed_list();
        if let Some(disk) = disks.list().iter().find(|d| install_path.starts_with(d.mount_point())) {
            let free_gb = (disk.available_space() as f64) / (1024.0 * 1024.0 * 1024.0);
            self.emit_console(&format!("  💾 Available Disk Space on target drive: {:.1} GB", free_gb), if free_gb < 50.0 { "warning" } else { "info" });
            if free_gb < 45.0 {
                self.emit_console("  ⚠️ WARNING: ASA server requires ~60 GB disk space. Please ensure sufficient space.", "warning");
            }
        }

        // Build the SteamCMD command
        let mut steamcmd_args = vec![
            "+force_install_dir".to_string(),
            install_path.to_string_lossy().to_string(),
            "+login".to_string(),
            "anonymous".to_string(),
            "+app_update".to_string(),
            app_id.to_string(),
        ];

        if let Some(b) = &branch {
            let b_trimmed = b.trim();
            if !b_trimmed.is_empty() && b_trimmed != "default" && b_trimmed != "latest" {
                steamcmd_args.push("-beta".to_string());
                steamcmd_args.push(b_trimmed.to_string());
            } else {
                // Explicitly set "-beta public" to clear any previously cached beta key
                // (e.g. "preaquatica") from the appmanifest. Without this, SteamCMD
                // keeps reinstalling the old branch's build even after the user
                // switches back to Default / Latest in the UI.
                steamcmd_args.push("-beta".to_string());
                steamcmd_args.push("public".to_string());
            }
        } else {
            // No branch specified at all – still force public to be safe
            steamcmd_args.push("-beta".to_string());
            steamcmd_args.push("public".to_string());
        }

        steamcmd_args.push("validate".to_string());
        steamcmd_args.push("+quit".to_string());

        let mut last_error_msg = String::new();

        for attempt in 1..=3 {
            self.emit_console(
                &format!("Checking for and terminating any background SteamCMD processes (Attempt {}/3)...", attempt),
                "info",
            );
            let steamcmd_service = crate::services::steamcmd::SteamCmdService::new(self.app_handle.clone());
            let _ = steamcmd_service.kill_existing_processes();

            if attempt > 1 {
                self.emit_console(
                    &format!("  🔄 [AUTO-HEAL] Retrying SteamCMD operation (Attempt {}/3) after clearing download cache...", attempt),
                    "warning",
                );
                if let Err(e) = steamcmd_service.clear_cache() {
                    self.emit_console(&format!("  ⚠️ [AUTO-HEAL] Cache clear notice: {}", e), "warning");
                } else {
                    self.emit_console("  ✅ [AUTO-HEAL] SteamCMD appcache & downloading folders cleared successfully.", "success");
                }
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            }

            self.emit_progress("downloading", 15.0, &format!("Starting SteamCMD (Attempt {}/3)...", attempt));

            let mut child = match Command::new(&steamcmd_exe)
                .args(&steamcmd_args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn()
            {
                Ok(c) => c,
                Err(e) => {
                    last_error_msg = format!("Failed to start SteamCMD: {}", e);
                    continue;
                }
            };

            self.emit_progress(
                "downloading",
                20.0,
                &format!("SteamCMD started, downloading server files (Attempt {}/3)...", attempt),
            );
            self.emit_console("SteamCMD process started", "success");
            self.emit_console("Connecting to Steam servers...", "info");

            // Spawn stderr reader concurrently to prevent pipe buffer deadlock.
            let stderr_handle = if let Some(stderr) = child.stderr.take() {
                Some(tokio::spawn(async move {
                    let reader = BufReader::new(stderr);
                    let mut lines = reader.lines();
                    let mut stderr_lines: Vec<String> = Vec::new();
                    while let Ok(Some(line)) = lines.next_line().await {
                        let trimmed = line.trim().to_string();
                        if !trimmed.is_empty() {
                            println!("[SteamCMD ERROR] {}", trimmed);
                            stderr_lines.push(trimmed);
                        }
                    }
                    stderr_lines
                }))
            } else {
                None
            };

            // Read stdout and parse progress
            if let Some(stdout) = child.stdout.take() {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    let line_type = if line.contains("Error")
                        || line.contains("ERROR")
                        || line.contains("Failed")
                    {
                        "error"
                    } else if line.contains("Success")
                        || line.contains("success")
                        || line.contains("OK")
                    {
                        "success"
                    } else if line.contains("Warning") || line.contains("WARNING") {
                        "warning"
                    } else if line.contains("Update state") || line.contains("progress:") {
                        "progress"
                    } else {
                        "info"
                    };

                    self.emit_console(trimmed, line_type);

                    if line.contains("Update state") {
                        if let Some(progress_str) = line.split("progress:").nth(1) {
                            if let Some(pct) = progress_str.split_whitespace().next() {
                                if let Ok(pct_float) = pct.parse::<f32>() {
                                    self.emit_progress(
                                        "downloading",
                                        pct_float,
                                        &format!("Downloading... {:.1}%", pct_float),
                                    );
                                }
                            }
                        }
                    } else if line.contains("Logging in") {
                        self.emit_progress("connecting", 18.0, "Logging into Steam...");
                    } else if line.contains("Downloading") {
                        self.emit_progress("downloading", 25.0, "Downloading server files...");
                    } else if line.contains("Validating") || line.contains("verifying") {
                        self.emit_progress("verifying", 92.0, "Verifying installation...");
                    } else if line.contains("Success") {
                        self.emit_progress("finishing", 95.0, "Installation successful!");
                    }

                    println!("[SteamCMD] {}", line);
                }
            }

            if let Some(handle) = stderr_handle {
                if let Ok(stderr_lines) = handle.await {
                    for line in &stderr_lines {
                        self.emit_console(line, "error");
                    }
                }
            }

            let timeout_duration = std::time::Duration::from_secs(1800); // 30 minutes
            let status_result = tokio::time::timeout(timeout_duration, child.wait()).await;

            match status_result {
                Ok(Ok(status)) => {
                    self.emit_console("", "info");
                    if status.success() {
                        self.emit_console(
                            "═══════════════════════════════════════════════════════════",
                            "success",
                        );
                        self.emit_console("  Server installation completed successfully!", "success");
                        self.emit_console(
                            "═══════════════════════════════════════════════════════════",
                            "success",
                        );
                        self.emit_complete("Server installed successfully!");
                        return Ok(true);
                    } else {
                        let code = status.code();
                        last_error_msg = match code {
                            Some(8) => "SteamCMD Error (8): Download failed due to disk space, network, or permissions.".to_string(),
                            Some(7) => "SteamCMD Error (7): Command failure. Steam servers busy or invalid format.".to_string(),
                            Some(c) => format!("SteamCMD exited with code: {}", c),
                            None => "SteamCMD process terminated without exit code.".to_string(),
                        };

                        if attempt < 3 {
                            self.emit_console(
                                &format!("  ⚠️ [AUTO-HEAL] {} — Cleared SteamCMD cache, retrying attempt {}/3...", last_error_msg, attempt + 1),
                                "warning",
                            );
                            let steamcmd_service = crate::services::steamcmd::SteamCmdService::new(self.app_handle.clone());
                            let _ = steamcmd_service.clear_cache();
                            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                            continue;
                        }
                    }
                }
                Ok(Err(e)) => {
                    last_error_msg = format!("SteamCMD process failed: {}", e);
                }
                Err(_) => {
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    last_error_msg = "SteamCMD operation timed out after 30 minutes.".to_string();
                }
            }
        }

        let full_error = format!(
            "{}\n\nType: Disk/Network Error\nFix:\n1. Check disk space (approx 60GB required)\n2. Ensure stable internet connection\n3. Run as Administrator\n4. SteamCMD cache cleared automatically.",
            last_error_msg
        );
        self.emit_error(&full_error);
        Err(full_error)
    }

    /// Update an existing server
    pub async fn update_server(&self, install_path: &PathBuf, server_type: &str) -> Result<bool, String> {
        self.emit_progress("updating", 5.0, "Starting server update...");
        self.emit_console("Starting server update process...", "info");

        // Use the same installation logic - SteamCMD handles updates
        self.install_server(install_path, server_type, None).await
    }
}

/// Helper to extract local buildid from appmanifest file
fn get_local_build_id(install_path: &PathBuf, app_id: &str) -> Option<String> {
    let manifest_path = install_path.join("steamapps").join(format!("appmanifest_{}.acf", app_id));
    if !manifest_path.exists() {
        return None;
    }
    if let Ok(content) = std::fs::read_to_string(&manifest_path) {
        for line in content.lines() {
            if line.contains("\"buildid\"") {
                let parts: Vec<&str> = line.split('"').collect();
                if parts.len() >= 4 {
                    let build_id = parts[3].trim().to_string();
                    if !build_id.is_empty() {
                        return Some(build_id);
                    }
                }
            }
        }
    }
    None
}

/// Helper to fetch remote buildid from SteamCMD API or Steam Web API
async fn get_remote_build_id(app_id: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;

    let url = format!("https://api.steamcmd.net/v1/info/{}", app_id);
    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(build_id) = json.get("data")
                    .and_then(|d| d.get(app_id))
                    .and_then(|a| a.get("depots"))
                    .and_then(|dep| dep.get("branches"))
                    .and_then(|b| b.get("public"))
                    .and_then(|p| p.get("buildid"))
                {
                    if let Some(id_str) = build_id.as_str() {
                        return Some(id_str.to_string());
                    } else if let Some(id_num) = build_id.as_u64() {
                        return Some(id_num.to_string());
                    }
                }
            }
        }
    }
    None
}
