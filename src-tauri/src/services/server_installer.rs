// Server Installation Service with Real-time Progress Events
// Handles SteamCMD-based server installation with progress reporting and console output

use crate::platform::CommandNoWindowExt;
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
        let _ = writeln!(
            file,
            "[{}] {}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            msg
        );
    }
}

impl ServerInstaller {
    pub fn new(app_handle: AppHandle, install_path: String) -> Self {
        log_to_file(&format!(
            "New ServerInstaller created with install_path: {}",
            install_path
        ));
        Self {
            app_handle,
            install_path,
        }
    }

    fn emit_progress(&self, stage: &str, progress: f32, message: &str) {
        log_to_file(&format!(
            "emit_progress: Stage={}, Progress={}, Msg={}, Path={}",
            stage, progress, message, self.install_path
        ));
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
    pub async fn install_server(
        &self,
        install_path: &PathBuf,
        server_type: &str,
        branch: Option<String>,
    ) -> Result<bool, String> {
        self.install_server_ext(install_path, server_type, branch, false)
            .await
    }

    /// Install or update ARK server with explicit force_update option
    pub async fn install_server_ext(
        &self,
        raw_install_path: &PathBuf,
        server_type: &str,
        branch: Option<String>,
        force_update: bool,
    ) -> Result<bool, String> {
        self.emit_progress("preparing", 5.0, "Preparing installation...");
        self.emit_console(
            &format!(
                "Starting ARK: Survival {} server update pipeline...",
                if server_type == "ASE" {
                    "Evolved"
                } else {
                    "Ascended"
                }
            ),
            "info",
        );

        // ---------------------------------------------------------
        // PATH AUDIT & PRE-FLIGHT VALIDATION
        // ---------------------------------------------------------
        let mut install_path = raw_install_path.clone();
        if install_path.file_name() == Some(std::ffi::OsStr::new("ShooterGame")) {
            if let Some(parent) = install_path.parent() {
                install_path = parent.to_path_buf();
            }
        }

        let normalized_path_str = install_path.to_string_lossy().to_string();
        let drive_comp = install_path.components().next();
        if drive_comp.is_none() {
            let err = format!(
                "Invalid target install path: '{}'. Path must contain a valid root drive.",
                normalized_path_str
            );
            self.emit_error(&err);
            return Err(err.to_string());
        }

        let root_drive_str = drive_comp
            .unwrap()
            .as_os_str()
            .to_string_lossy()
            .to_string();
        let root_drive_path = PathBuf::from(&root_drive_str);
        if !root_drive_path.exists() {
            let err = format!(
                "Target drive '{}' does not exist or is disconnected. Configured path: '{}'",
                root_drive_str, normalized_path_str
            );
            self.emit_error(&err);
            return Err(err.to_string());
        }

        // Prevent silent fallback to AppData / C: drive if server path was intended elsewhere
        if let Ok(app_dir) = self.app_handle.path().app_data_dir() {
            if install_path.starts_with(&app_dir) && !self.install_path.contains("AppData") {
                let err = format!("Path Mismatch Error: Server target path resolved to AppData ('{}') but configured path was '{}'. Aborting to prevent silent fallback.", install_path.display(), self.install_path);
                self.emit_error(&err);
                return Err(err.to_string());
            }
        }

        // Create install directory if it doesn't exist
        if !install_path.exists() {
            self.emit_console(
                &format!(
                    "Creating target server directory: {}",
                    install_path.display()
                ),
                "info",
            );
            std::fs::create_dir_all(&install_path).map_err(|e| {
                let err_msg = format!("Failed to create directory '{}': {}. Please check disk permissions or run as Administrator.", install_path.display(), e);
                self.emit_error(&err_msg);
                err_msg
            })?;
        }

        // Validate Write Permissions on Target Path
        let test_perm_file = install_path.join(".sm_write_perm_test");
        match std::fs::File::create(&test_perm_file) {
            Ok(_) => {
                let _ = std::fs::remove_file(&test_perm_file);
            }
            Err(e) => {
                let err_msg = format!(
                    "Permissions Error: Write test failed on '{}': {}. Ensure the folder is not read-only and run ARK Server Manager as Administrator.",
                    install_path.display(), e
                );
                self.emit_error(&err_msg);
                return Err(err_msg.to_string());
            }
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
        let local_build = get_local_build_id(&install_path, app_id);
        if server_exe.exists() && local_build.is_some() {
            let current_local = local_build.clone().unwrap();
            self.emit_console(
                "Checking Steam Web API for latest server build version...",
                "info",
            );
            if let Some(remote_build) = get_remote_build_id(app_id).await {
                self.emit_console(
                    &format!("  Current Local BuildID: {}", current_local),
                    "info",
                );
                self.emit_console(&format!("  Latest Steam BuildID: {}", remote_build), "info");

                if current_local == remote_build && !force_update {
                    self.emit_console("", "info");
                    self.emit_console(
                        "═══════════════════════════════════════════════════════════",
                        "success",
                    );
                    self.emit_console("  ✨ Server is already UP TO DATE!", "success");
                    self.emit_console(
                        &format!(
                            "  Local BuildID {} matches latest Steam release.",
                            current_local
                        ),
                        "success",
                    );
                    self.emit_console(
                        "═══════════════════════════════════════════════════════════",
                        "success",
                    );
                    self.emit_console("", "info");
                    self.emit_progress("finishing", 100.0, "Server up to date!");
                    self.emit_complete("Server up to date!");
                    return Ok(false);
                } else if current_local == remote_build && force_update {
                    self.emit_console(
                        &format!("  Current Local BuildID {} matches Steam API, but update/validation was explicitly requested. Executing SteamCMD...", current_local),
                        "info",
                    );
                } else {
                    self.emit_console(
                        &format!(
                            "  🚀 New update detected! Upgrading BuildID {} ➔ {}",
                            current_local, remote_build
                        ),
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

        // Get SteamCMD path (supports custom path override via settings & target-aware low-space fallback)
        let steamcmd_dir = {
            let app_dir = self
                .app_handle
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app dir: {}", e))?;

            if let Some(state) = self.app_handle.try_state::<crate::AppState>() {
                crate::services::resolve_steamcmd_dir_from_state_for_target(
                    &state,
                    &self.app_handle,
                    Some(&install_path),
                )
                .unwrap_or_else(|_| app_dir.join("steamcmd"))
            } else {
                app_dir.join("steamcmd")
            }
        };
        let steamcmd_exe = steamcmd_dir.join("steamcmd.exe");

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
        let _exec_guard = STEAMCMD_EXECUTION_LOCK.lock().await;

        // Ensure target install path directory exists before running SteamCMD
        let _ = std::fs::create_dir_all(&install_path);
        let _ = std::fs::create_dir_all(&steamcmd_dir);

        // Disk space audit on BOTH target drive and SteamCMD staging drive
        let install_drive_space =
            crate::services::steamcmd::get_available_disk_space(&install_path);
        let steamcmd_drive_space =
            crate::services::steamcmd::get_available_disk_space(&steamcmd_dir);

        // Sanitize path by converting backslashes to forward slashes and trimming trailing slashes.
        // SteamCMD on Windows requires forward slashes for +force_install_dir to prevent command line escaping bugs!
        let force_install_dir_val = install_path
            .to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_string();

        let cmd_preview = format!(
            "steamcmd.exe +force_install_dir \"{}\" +login anonymous +app_update {}{} +quit",
            force_install_dir_val,
            app_id,
            if force_update { " validate" } else { "" }
        );

        self.emit_console("", "info");
        self.emit_console(
            "═══════════════════════════════════════════════════════════",
            "info",
        );
        self.emit_console(
            &format!(
                "  PATH AUDIT & STEAMCMD LAUNCH REPORT ({})",
                if server_type == "ASE" { "ASE" } else { "ASA" }
            ),
            "info",
        );
        self.emit_console(
            "═══════════════════════════════════════════════════════════",
            "info",
        );
        self.emit_console(&format!("  • Server App ID        : {}", app_id), "info");
        self.emit_console(
            &format!("  • Configured Path     : {}", self.install_path),
            "info",
        );
        self.emit_console(
            &format!("  • Target Install Path : {}", install_path.display()),
            "info",
        );
        self.emit_console(
            &format!(
                "  • Target Drive Space  : {:.1} GB Free",
                install_drive_space
            ),
            if install_drive_space < 50.0 {
                "warning"
            } else {
                "info"
            },
        );
        self.emit_console(
            &format!("  • SteamCMD Directory  : {}", steamcmd_dir.display()),
            "info",
        );
        self.emit_console(
            &format!("  • SteamCMD Executable : {}", steamcmd_exe.display()),
            "info",
        );
        self.emit_console(
            &format!(
                "  • SteamCMD Drive Space: {:.1} GB Free",
                steamcmd_drive_space
            ),
            if steamcmd_drive_space < 50.0 {
                "warning"
            } else {
                "info"
            },
        );
        self.emit_console(
            &format!("  • Working Directory   : {}", steamcmd_dir.display()),
            "info",
        );
        self.emit_console(
            &format!("  • +force_install_dir  : \"{}\"", force_install_dir_val),
            "info",
        );
        self.emit_console(
            &format!("  • Command Line        : {}", cmd_preview),
            "info",
        );
        self.emit_console(
            "═══════════════════════════════════════════════════════════",
            "info",
        );
        self.emit_console("", "info");

        if steamcmd_drive_space < 50.0 {
            self.emit_console(
                "  ⚠️ WARNING: SteamCMD staging drive has < 50 GB free space. SteamCMD temporarily downloads patch files inside its installation folder.",
                "warning",
            );
            self.emit_console(
                "  👉 TIP: If SteamCMD fails with Error 8 / State 0x6, set a Custom SteamCMD Path in Settings to a drive with at least 60 GB free space.",
                "warning",
            );
        }
        if install_drive_space < 45.0 {
            self.emit_console("  ⚠️ WARNING: Target server drive has < 45 GB space. ASA server update requires ~60 GB disk space.", "warning");
        }

        // Build the SteamCMD command (+login anonymous MUST precede +force_install_dir)
        let mut steamcmd_args = vec![
            "+login".to_string(),
            "anonymous".to_string(),
            "+force_install_dir".to_string(),
            force_install_dir_val,
            "+app_update".to_string(),
            app_id.to_string(),
        ];

        if let Some(b) = &branch {
            let b_trimmed = b.trim();
            if !b_trimmed.is_empty()
                && b_trimmed != "default"
                && b_trimmed != "latest"
                && b_trimmed != "public"
            {
                steamcmd_args.push("-beta".to_string());
                steamcmd_args.push(b_trimmed.to_string());
            } else {
                clear_beta_from_manifest(&install_path, app_id);
            }
        } else {
            clear_beta_from_manifest(&install_path, app_id);
        }

        // Only append "validate" on forced updates or when an existing installation is present.
        // On fresh empty directory downloads, SteamCMD "validate" attempts to audit a non-existent appmanifest and throws Error 8!
        let is_existing_install = install_path.join("ShooterGame").exists();
        if force_update || is_existing_install {
            steamcmd_args.push("validate".to_string());
        }
        steamcmd_args.push("+quit".to_string());

        // Backup AsaApi and proxy DLLs so validate doesn't wipe installed plugins
        let api_backup = backup_plugins(&install_path);

        let mut last_error_msg = String::new();

        for attempt in 1..=3 {
            self.emit_console(
                &format!("Checking for and terminating any background SteamCMD processes (Attempt {}/3)...", attempt),
                "info",
            );
            let steamcmd_service = crate::services::steamcmd::SteamCmdService::with_custom_dir(
                self.app_handle.clone(),
                steamcmd_dir.clone(),
            );
            let _ = steamcmd_service.kill_existing_processes();

            // Clear stale downloading cache & target manifest ONLY on retry attempts
            if attempt > 1 {
                self.emit_console(
                    &format!("  🔄 [AUTO-HEAL] Clearing stale downloading cache & manifests (Attempt {}/3)...", attempt),
                    "warning",
                );
                if let Err(e) = steamcmd_service.clear_downloading_cache() {
                    self.emit_console(
                        &format!("  ⚠️ [AUTO-HEAL] Downloading cache clear notice: {}", e),
                        "warning",
                    );
                }
                if let Err(e) =
                    steamcmd_service.clear_target_manifest_and_cache(&install_path, app_id)
                {
                    self.emit_console(
                        &format!("  ⚠️ [AUTO-HEAL] Target manifest clear notice: {}", e),
                        "warning",
                    );
                }
                self.emit_console("  ✅ [AUTO-HEAL] Stale appmanifest & downloading folders cleared successfully.", "success");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }

            self.emit_progress(
                "downloading",
                15.0,
                &format!("Starting SteamCMD (Attempt {}/3)...", attempt),
            );

            let mut child = match Command::new(&steamcmd_exe)
                .current_dir(&steamcmd_dir)
                .args(&steamcmd_args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .no_window()
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
                &format!(
                    "SteamCMD started, downloading server files (Attempt {}/3)...",
                    attempt
                ),
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
                        self.emit_console(
                            "  Server installation completed successfully!",
                            "success",
                        );
                        self.emit_console(
                            "═══════════════════════════════════════════════════════════",
                            "success",
                        );
                        self.emit_complete("Server installed successfully!");
                        restore_plugins(&install_path, api_backup);
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
                                &format!("  ⚠️ [AUTO-HEAL] {} — Cleared SteamCMD cache & appmanifests, retrying attempt {}/3...", last_error_msg, attempt + 1),
                                "warning",
                            );
                            let steamcmd_service =
                                crate::services::steamcmd::SteamCmdService::with_custom_dir(
                                    self.app_handle.clone(),
                                    steamcmd_dir.clone(),
                                );
                            let _ = steamcmd_service.clear_cache();
                            let _ = steamcmd_service
                                .clear_target_manifest_and_cache(&install_path, app_id);

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
            "SteamCMD Update Failed for Server at {}\n\nDiagnostic Summary:\n• Target Server Path: {} ({:.1} GB Free)\n• SteamCMD Staging Dir: {} ({:.1} GB Free)\n• Error Details: {}\n\nActionable Fix Steps:\n1. Disk Space: Ensure at least 60 GB free space on both server drive and SteamCMD drive.\n2. Permissions: Verify the target directory is writeable and run ARK Server Manager as Administrator.\n3. Custom Path: Configure a Custom SteamCMD Path in Settings on a drive with ample disk space.\n4. Cache Recovery: Stale manifests and download caches have been auto-cleared.",
            self.install_path,
            install_path.display(),
            install_drive_space,
            steamcmd_dir.display(),
            steamcmd_drive_space,
            last_error_msg
        );
        restore_plugins(&install_path, api_backup);
        self.emit_error(&full_error);
        Err(full_error.to_string())
    }

    /// Update an existing server
    pub async fn update_server(
        &self,
        install_path: &PathBuf,
        server_type: &str,
    ) -> Result<bool, String> {
        self.emit_progress("updating", 5.0, "Starting server update...");
        self.emit_console("Starting server update process...", "info");

        // Use the installation logic with force_update=true to ensure SteamCMD runs file validation
        self.install_server_ext(install_path, server_type, None, true)
            .await
    }
}

/// Helper to extract local buildid from appmanifest file
pub(crate) fn get_local_build_id(install_path: &PathBuf, app_id: &str) -> Option<String> {
    let manifest_path = install_path
        .join("steamapps")
        .join(format!("appmanifest_{}.acf", app_id));
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
pub(crate) async fn get_remote_build_id(app_id: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;

    let url = format!("https://api.steamcmd.net/v1/info/{}", app_id);
    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(build_id) = json
                    .get("data")
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

/// Helper to clear beta branch settings from appmanifest to allow reverting to default branch
fn clear_beta_from_manifest(install_path: &std::path::Path, app_id: &str) {
    let manifest_path = install_path
        .join("steamapps")
        .join(format!("appmanifest_{}.acf", app_id));
    if manifest_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&manifest_path) {
            let mut new_lines = Vec::new();
            let mut modified = false;
            for line in content.lines() {
                if line.contains("\"BetaName\"") || line.contains("\"betakey\"") {
                    modified = true;
                    continue; // Skip these lines to clear the beta branch
                }
                new_lines.push(line);
            }
            if modified {
                let _ = std::fs::write(&manifest_path, new_lines.join("\n"));
                log_to_file("[SteamCMD Fix] Cleared beta branch configuration from appmanifest.");
            }
        }
    }
}

/// Helper to recursively copy directories for plugin backup/restore
fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    if let Ok(entries) = std::fs::read_dir(src) {
        for entry in entries.flatten() {
            let ty = entry.file_type()?;
            if ty.is_dir() {
                copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
            } else {
                std::fs::copy(entry.path(), dst.join(entry.file_name()))?;
            }
        }
    }
    Ok(())
}

/// Backup plugin loaders & AsaApi directory before SteamCMD validation
fn backup_plugins(install_path: &std::path::Path) -> Option<std::path::PathBuf> {
    let win64_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64");
    if !win64_dir.exists() {
        return None;
    }

    let backup_dir = install_path.join("steamapps").join("api_backup");
    let _ = std::fs::create_dir_all(&backup_dir);

    let proxy_dlls = [
        "version.dll",
        "version.dll.disabled",
        "winhttp.dll",
        "dxgi.dll",
        "psapi.dll",
    ];
    for dll in &proxy_dlls {
        let src = win64_dir.join(dll);
        if src.exists() {
            let _ = std::fs::copy(&src, backup_dir.join(dll));
        }
    }

    let asa_api_src = win64_dir.join("AsaApi");
    if asa_api_src.exists() {
        let _ = copy_dir_all(&asa_api_src, &backup_dir.join("AsaApi"));
    }

    Some(backup_dir)
}

/// Restore plugin loaders & AsaApi directory after SteamCMD completes.
/// Proxy DLLs are intentionally restored with .disabled extension to quarantine them until verified,
/// preventing updated server binaries from immediately crashing on startup due to stale memory offsets.
fn restore_plugins(install_path: &std::path::Path, backup_dir: Option<std::path::PathBuf>) {
    let Some(backup_dir) = backup_dir else { return };
    if !backup_dir.exists() {
        return;
    }

    let win64_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64");
    let _ = std::fs::create_dir_all(&win64_dir);

    let proxy_dlls = [
        "version.dll",
        "winhttp.dll",
        "dxgi.dll",
        "psapi.dll",
    ];
    for dll in &proxy_dlls {
        let backup_active = backup_dir.join(dll);
        let backup_disabled = backup_dir.join(format!("{}.disabled", dll));
        let target_disabled = win64_dir.join(format!("{}.disabled", dll));
        let target_active = win64_dir.join(dll);

        // If an active proxy DLL existed before update, remove active version from Win64 and save as .disabled
        if target_active.exists() {
            let _ = std::fs::remove_file(&target_active);
        }

        if backup_active.exists() {
            let _ = std::fs::copy(&backup_active, &target_disabled);
            println!("  🛡️ [AUTO-QUARANTINE] Stored proxy DLL {:?} as {:?} to prevent startup crash after game update.", dll, target_disabled.file_name().unwrap_or_default());
        } else if backup_disabled.exists() && !target_disabled.exists() {
            let _ = std::fs::copy(&backup_disabled, &target_disabled);
        }
    }

    let asa_api_backup = backup_dir.join("AsaApi");
    let asa_api_target = win64_dir.join("AsaApi");
    if asa_api_backup.exists() && !asa_api_target.exists() {
        let _ = copy_dir_all(&asa_api_backup, &asa_api_target);
    }

    let _ = std::fs::remove_dir_all(&backup_dir);
}
