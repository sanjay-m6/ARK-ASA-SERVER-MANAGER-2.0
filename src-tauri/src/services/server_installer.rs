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
    pub async fn install_server(&self, install_path: &PathBuf, server_type: &str, branch: Option<String>) -> Result<(), String> {
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

        // Bypass SteamCMD Stale Update Cache for ASA
        if server_type != "ASE" {
            let manifest_to_delete = install_path.join("steamapps").join("appmanifest_2430930.acf");
            if manifest_to_delete.exists() {
                self.emit_console("  🗑️ [ASA-FIX] Stale appmanifest_2430930.acf detected. Deleting to bypass SteamCMD update/cache loop...", "warning");
                let _ = std::fs::remove_file(&manifest_to_delete);
            }
        }

        // Check if server is already installed
        let server_exe = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join(server_exe_name);
        let manifest_file = install_path
            .join("steamapps")
            .join(format!("appmanifest_{}.acf", app_id));

        if server_exe.exists() && manifest_file.exists() {
            self.emit_console("", "info");
            self.emit_console(
                "═══════════════════════════════════════════════════════════",
                "warning",
            );
            self.emit_console("  Server files already exist in this directory!", "warning");
            self.emit_console(&format!("  Found: {}", server_exe.display()), "info");
            self.emit_console(
                "═══════════════════════════════════════════════════════════",
                "warning",
            );
            self.emit_console("", "info");
            self.emit_console(
                "Skipping full download - verifying existing installation...",
                "info",
            );
            self.emit_progress(
                "verifying",
                50.0,
                "Server already exists, verifying files...",
            );
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

        if !steamcmd_exe.exists() {
            self.emit_console(
                "SteamCMD not found! Please install SteamCMD first.",
                "error",
            );
            return Err("SteamCMD not installed".to_string());
        }

        self.emit_console(
            &format!("SteamCMD found: {}", steamcmd_exe.display()),
            "success",
        );
        self.emit_console("Checking for and terminating any background SteamCMD processes...", "info");
        let steamcmd_service = crate::services::steamcmd::SteamCmdService::new(self.app_handle.clone());
        let _ = steamcmd_service.kill_existing_processes();

        self.emit_progress("downloading", 15.0, "Starting SteamCMD...");

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
            if !b_trimmed.is_empty() && b_trimmed != "default" {
                steamcmd_args.push("-beta".to_string());
                steamcmd_args.push(b_trimmed.to_string());
            }
        }

        steamcmd_args.push("validate".to_string());
        steamcmd_args.push("+quit".to_string());

        let mut child = Command::new(&steamcmd_exe)
            .args(&steamcmd_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to start SteamCMD: {}", e))?;

        self.emit_progress(
            "downloading",
            20.0,
            "SteamCMD started, downloading server files...",
        );
        self.emit_console("SteamCMD process started", "success");
        self.emit_console("Connecting to Steam servers...", "info");

        // Spawn stderr reader concurrently to prevent pipe buffer deadlock.
        // If SteamCMD fills the stderr pipe buffer while we block on stdout,
        // the process hangs forever. Reading both streams concurrently avoids this.
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
                // Skip empty lines and clean up the output
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                // Determine line type and emit to console
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

                // Emit console line
                self.emit_console(trimmed, line_type);

                // Parse SteamCMD output for progress updates
                if line.contains("Update state") {
                    // Extract percentage from lines like "Update state (0x61) downloading, progress: 50.00 (12345678 / 24691356)"
                    if let Some(progress_str) = line.split("progress:").nth(1) {
                        if let Some(pct) = progress_str.split_whitespace().next() {
                            if let Ok(pct_float) = pct.parse::<f32>() {
                                // Use actual percentage from SteamCMD directly
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

        // Collect stderr lines from the background task and emit them
        if let Some(handle) = stderr_handle {
            if let Ok(stderr_lines) = handle.await {
                for line in &stderr_lines {
                    self.emit_console(line, "error");
                }
            }
        }

        // Wait for process to complete with timeout
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
                    Ok(())
                } else {
                    let code = status.code();
                    let error_msg = match code {
                        Some(8) => {
                            self.emit_console("  [AUTO-HEAL] SteamCMD Error (8) detected. Automatically terminating background processes and clearing SteamCMD download cache...", "warning");
                            let steamcmd_service = crate::services::steamcmd::SteamCmdService::new(self.app_handle.clone());
                            if let Err(e) = steamcmd_service.clear_cache() {
                                self.emit_console(&format!("  [AUTO-HEAL] Failed to clear SteamCMD cache: {}", e), "error");
                            } else {
                                self.emit_console("  [AUTO-HEAL] SteamCMD cache cleared successfully.", "success");
                            }
                            "SteamCMD Error (8): Download failed due to disk space, network, or permissions.\n\nType: Disk/Network Error\nFix:\n1. Check disk space (approx 60GB required)\n2. Ensure stable internet connection\n3. Run as Administrator\n4. SteamCMD cache has been automatically cleared. Please try running the update/install again.".to_string()
                        }
                        Some(7) => "SteamCMD Error (7): Command failure. The Steam servers might be busy or the command format is invalid.".to_string(),
                        Some(c) => format!("SteamCMD exited with unexpected code: {}", c),
                        None => "SteamCMD process terminated without an exit code.".to_string(),
                    };

                    self.emit_error(&error_msg);
                    Err(error_msg)
                }
            }
            Ok(Err(e)) => {
                let error_msg = format!("SteamCMD process failed: {}", e);
                self.emit_error(&error_msg);
                Err(error_msg)
            }
            Err(_) => {
                // Timeout occurred
                let _ = child.start_kill(); // Attempt to kill the process
                let _ = child.wait().await; // Clean up zombie process

                let error_msg = "SteamCMD operation timed out after 30 minutes.".to_string();
                self.emit_error(&error_msg);
                Err(error_msg)
            }
        }
    }

    /// Update an existing server
    pub async fn update_server(&self, install_path: &PathBuf, server_type: &str) -> Result<(), String> {
        self.emit_progress("updating", 5.0, "Starting server update...");
        self.emit_console("Starting server update process...", "info");

        // Use the same installation logic - SteamCMD handles updates
        self.install_server(install_path, server_type, None).await
    }
}
