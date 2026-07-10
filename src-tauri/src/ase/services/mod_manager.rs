use tauri::{AppHandle, State, Emitter};
use crate::AppState;
use crate::ase::models::AseInstalledMod;
use std::path::{Path, PathBuf};
use crate::ase::ini_parser::IniDocument;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::io::{Read as _, Write as _};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use std::process::Stdio;

/// Result of searching Steam libraries for an ASE mod's .mod file and assets folder.
struct SteamModSource {
    mod_file: PathBuf,
    assets_dir: PathBuf,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModValidationReport {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub issues: Vec<String>,
}

pub struct AseModManager;

// Helper to recursively sum the size of all files in a folder
fn get_dir_size(path: &Path) -> std::io::Result<u64> {
    let mut total_size = 0;
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            if metadata.is_dir() {
                total_size += get_dir_size(&entry.path()).unwrap_or(0);
            } else {
                total_size += metadata.len();
            }
        }
    } else {
        total_size = path.metadata()?.len();
    }
    Ok(total_size)
}

// Helper to copy directory contents recursively while emitting progress updates
fn copy_dir_all_with_progress(
    src: &Path,
    dst: &Path,
    total_bytes: u64,
    copied_bytes: &mut u64,
    app_handle: &AppHandle,
    workshop_id: &str,
) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all_with_progress(&src_path, &dst_path, total_bytes, copied_bytes, app_handle, workshop_id)?;
        } else {
            let size = entry.metadata()?.len();
            std::fs::copy(&src_path, &dst_path)?;
            *copied_bytes += size;
            
            if total_bytes > 0 {
                // Scale extraction progress dynamically from 95.0% to 99.5%
                let progress = 95.0 + ((*copied_bytes as f32 / total_bytes as f32) * 4.5);
                let percentage = (progress * 10.0).round() / 10.0;
                emit_mod_progress(app_handle, workshop_id, "extracting", percentage, &format!("Extracting/Copying assets... {:.1}%", percentage));
            }
        }
    }
    Ok(())
}

fn read_ue4_string<R: std::io::Read>(reader: &mut R) -> std::io::Result<String> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let length = i32::from_le_bytes(len_buf);

    if length == 0 {
        return Ok(String::new());
    }

    if length > 0 {
        let mut buf = vec![0u8; length as usize];
        reader.read_exact(&mut buf)?;
        let str_len = if buf.last() == Some(&0) { buf.len() - 1 } else { buf.len() };
        String::from_utf8(buf[..str_len].to_vec())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    } else {
        let char_count = -length;
        let byte_count = (char_count * 2) as usize;
        let mut buf = vec![0u8; byte_count];
        reader.read_exact(&mut buf)?;
        let u16_len = if byte_count >= 2 && buf[byte_count - 1] == 0 && buf[byte_count - 2] == 0 {
            (byte_count - 2) / 2
        } else {
            byte_count / 2
        };
        let u16_chars: Vec<u16> = (0..u16_len)
            .map(|i| u16::from_le_bytes([buf[i * 2], buf[i * 2 + 1]]))
            .collect();
        String::from_utf16(&u16_chars)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }
}

fn write_ue4_string<W: std::io::Write>(writer: &mut W, val: &str) -> std::io::Result<()> {
    let bytes = val.as_bytes();
    let length = (bytes.len() + 1) as i32;
    writer.write_all(&length.to_le_bytes())?;
    writer.write_all(bytes)?;
    writer.write_all(&[0u8])?;
    Ok(())
}

fn generate_mod_file(
    workshop_id: &str,
    download_dir: &Path,
    target_mod_file: &Path,
) -> Result<(), String> {
    let mut base_dir = download_dir.to_path_buf();
    if !download_dir.join("mod.info").exists() && download_dir.join("WindowsNoEditor").exists() {
        base_dir = download_dir.join("WindowsNoEditor");
    }

    let mod_info_path = base_dir.join("mod.info");
    if !mod_info_path.exists() {
        return Err(format!("mod.info not found at {:?}", mod_info_path));
    }

    let mut map_names = Vec::new();
    {
        let file = std::fs::File::open(&mod_info_path)
            .map_err(|e| format!("Failed to open mod.info: {}", e))?;
        let mut reader = std::io::BufReader::new(file);

        let _ = read_ue4_string(&mut reader)
            .map_err(|e| format!("Failed to read header in mod.info: {}", e))?;

        let mut map_count_buf = [0u8; 4];
        reader.read_exact(&mut map_count_buf)
            .map_err(|e| format!("Failed to read map count in mod.info: {}", e))?;
        let map_count = i32::from_le_bytes(map_count_buf);

        for _ in 0..map_count {
            let map_name = read_ue4_string(&mut reader)
                .map_err(|e| format!("Failed to read map name in mod.info: {}", e))?;
            if !map_name.is_empty() {
                map_names.push(map_name);
            }
        }
    }

    let mod_meta_path = base_dir.join("modmeta.info");
    if !mod_meta_path.exists() {
        return Err(format!("modmeta.info not found at {:?}", mod_meta_path));
    }

    let mut meta_data = std::collections::BTreeMap::new();
    {
        let file = std::fs::File::open(&mod_meta_path)
            .map_err(|e| format!("Failed to open modmeta.info: {}", e))?;
        let mut reader = std::io::BufReader::new(file);

        let mut total_pairs_buf = [0u8; 4];
        reader.read_exact(&mut total_pairs_buf)
            .map_err(|e| format!("Failed to read total pairs in modmeta.info: {}", e))?;
        let total_pairs = i32::from_le_bytes(total_pairs_buf);

        for _ in 0..total_pairs {
            let key = read_ue4_string(&mut reader)
                .map_err(|e| format!("Failed to read meta key: {}", e))?;
            let value = read_ue4_string(&mut reader)
                .map_err(|e| format!("Failed to read meta value: {}", e))?;
            if !key.is_empty() && !value.is_empty() {
                meta_data.insert(key, value);
            }
        }
    }

    let file = std::fs::File::create(target_mod_file)
        .map_err(|e| format!("Failed to create .mod file: {}", e))?;
    let mut writer = std::io::BufWriter::new(file);

    let mod_id_num: u32 = workshop_id.parse::<u32>()
        .map_err(|e| format!("Invalid workshop ID integer: {}", e))?;
    writer.write_all(&mod_id_num.to_le_bytes())
        .map_err(|e| format!("Failed to write mod ID: {}", e))?;
    writer.write_all(&[0u8; 4])
        .map_err(|e| format!("Failed to write padding: {}", e))?;

    write_ue4_string(&mut writer, "ModName")
        .map_err(|e| format!("Failed to write 'ModName': {}", e))?;

    write_ue4_string(&mut writer, "")
        .map_err(|e| format!("Failed to write empty string: {}", e))?;

    let map_count = map_names.len() as i32;
    writer.write_all(&map_count.to_le_bytes())
        .map_err(|e| format!("Failed to write map count: {}", e))?;

    for map_name in &map_names {
        write_ue4_string(&mut writer, map_name)
            .map_err(|e| format!("Failed to write map name: {}", e))?;
    }

    writer.write_all(&4280483635u32.to_le_bytes())
        .map_err(|e| format!("Failed to write constant 4280483635: {}", e))?;

    writer.write_all(&2i32.to_le_bytes())
        .map_err(|e| format!("Failed to write constant 2: {}", e))?;

    writer.write_all(&[0u8])
        .map_err(|e| format!("Failed to write mod type byte: {}", e))?;

    let meta_len = meta_data.len() as i32;
    writer.write_all(&meta_len.to_le_bytes())
        .map_err(|e| format!("Failed to write meta data length: {}", e))?;

    for (k, v) in &meta_data {
        write_ue4_string(&mut writer, k)
            .map_err(|e| format!("Failed to write meta key: {}", e))?;
        write_ue4_string(&mut writer, v)
            .map_err(|e| format!("Failed to write meta value: {}", e))?;
    }

    Ok(())
}

fn emit_mod_log(app_handle: &AppHandle, workshop_id: &str, line: &str) {
    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
    let payload = serde_json::json!({
        "workshopId": workshop_id,
        "timestamp": timestamp,
        "line": line.to_string(),
    });
    let _ = app_handle.emit("ase-mod-download-log", payload);
}

fn emit_mod_progress(app_handle: &AppHandle, workshop_id: &str, status: &str, progress: f32, message: &str) {
    emit_mod_progress_bytes(app_handle, workshop_id, status, progress, message, 0, 0);
}

fn emit_mod_progress_bytes(app_handle: &AppHandle, workshop_id: &str, status: &str, progress: f32, message: &str, downloaded_bytes: u64, total_bytes: u64) {
    let payload = serde_json::json!({
        "workshopId": workshop_id,
        "status": status.to_string(),
        "progress": progress,
        "message": message.to_string(),
        "downloadedBytes": downloaded_bytes,
        "totalBytes": total_bytes,
    });
    let _ = app_handle.emit("ase-mod-download-progress", payload);
}

// Helper to check case-insensitive value in parsed INI document
fn ini_get_str(doc: &IniDocument, section: &str, key: &str, default: &str) -> String {
    doc.get_value(section, key).unwrap_or_else(|| default.to_string())
}

/// Discover all Steam library folders on this machine.
///
/// 1. Reads HKCU\Software\Valve\Steam -> SteamPath from the Windows Registry.
/// 2. Parses `<SteamPath>/steamapps/libraryfolders.vdf` for additional library paths.
/// 3. Falls back to common default locations if the registry key is missing.
fn find_steam_library_paths() -> Vec<PathBuf> {
    let mut libs: Vec<PathBuf> = Vec::new();

    // Step 1: Read Steam install path from the Windows Registry via `reg query`.
    let primary_steam = std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "SteamPath",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .ok()
        .and_then(|out| {
            let stdout = String::from_utf8_lossy(&out.stdout);
            // Output line format: "    SteamPath    REG_SZ    C:/Program Files (x86)/Steam"
            for line in stdout.lines() {
                if let Some(idx) = line.find("REG_SZ") {
                    let val = line[idx + "REG_SZ".len()..].trim();
                    if !val.is_empty() {
                        return Some(PathBuf::from(val.replace('/', "\\")));
                    }
                }
            }
            None
        });

    if let Some(ref steam_dir) = primary_steam {
        if steam_dir.exists() {
            libs.push(steam_dir.clone());
        }
    }

    // Step 2: Parse libraryfolders.vdf for additional Steam library folders.
    let vdf_candidates: Vec<PathBuf> = {
        let mut c = Vec::new();
        if let Some(ref steam_dir) = primary_steam {
            c.push(steam_dir.join("steamapps").join("libraryfolders.vdf"));
            c.push(steam_dir.join("config").join("libraryfolders.vdf"));
        }
        c
    };

    for vdf_path in &vdf_candidates {
        if let Ok(content) = std::fs::read_to_string(vdf_path) {
            // libraryfolders.vdf uses Valve's KeyValue format. We parse "path" values.
            // Format example:
            //   "0"  { "path"  "C:\\Program Files (x86)\\Steam" ... }
            //   "1"  { "path"  "D:\\SteamLibrary" ... }
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('"') {
                    let lower = trimmed.to_lowercase();
                    if lower.contains("\"path\"") {
                        // Extract the value after the second quoted string
                        let parts: Vec<&str> = trimmed.split('"').collect();
                        // parts: ["", "path", "\t\t", "D:\\SteamLibrary", ""]
                        if parts.len() >= 4 {
                            let path_str = parts[3].replace("\\\\", "\\");
                            let lib_path = PathBuf::from(&path_str);
                            if lib_path.exists() && !libs.iter().any(|p| p == &lib_path) {
                                libs.push(lib_path);
                            }
                        }
                    }
                }
            }
            break; // Only need to parse one successful VDF
        }
    }

    // Step 3: Fallback — scan common default locations.
    let fallback_paths = [
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
    ];
    for path in &fallback_paths {
        let p = PathBuf::from(path);
        if p.exists() && !libs.iter().any(|l| l == &p) {
            libs.push(p);
        }
    }

    // Also check drive roots for SteamLibrary folders (D:\, E:\, etc.)
    for letter in b'D'..=b'Z' {
        let drive_lib = PathBuf::from(format!("{}:\\SteamLibrary", letter as char));
        if drive_lib.exists() && !libs.iter().any(|l| l == &drive_lib) {
            libs.push(drive_lib);
        }
    }

    println!("[INFO] [ASE Mod Manager] Discovered {} Steam library path(s)", libs.len());
    for lib in &libs {
        println!("[INFO] [ASE Mod Manager]   - {:?}", lib);
    }

    libs
}

/// Search all Steam library paths for the given mod's .mod file and assets folder
/// inside `steamapps/common/ARK/ShooterGame/Content/Mods/`.
fn find_ase_mod_in_steam_libraries(workshop_id: &str) -> Option<SteamModSource> {
    let libs = find_steam_library_paths();

    for lib_path in &libs {
        let mods_dir = lib_path
            .join("steamapps")
            .join("common")
            .join("ARK")
            .join("ShooterGame")
            .join("Content")
            .join("Mods");

        let mod_file = mods_dir.join(format!("{}.mod", workshop_id));
        let assets_dir = mods_dir.join(workshop_id);

        if mod_file.exists() {
            println!(
                "[INFO] [ASE Mod Manager] Found .mod file at {:?}",
                mod_file
            );
            // Assets folder is optional — some mods only have the .mod descriptor
            return Some(SteamModSource {
                mod_file,
                assets_dir,
            });
        }
    }

    println!(
        "[WARN] [ASE Mod Manager] No .mod file found for workshop id {} in any Steam library",
        workshop_id
    );
    None
}

impl AseModManager {
    pub async fn download_mod_with_retry(
        _app_handle: &AppHandle,
        server_id: i64,
        workshop_id: &str,
        mod_name: &str,
        _state: &State<'_, AppState>,
        _retries: u32,
    ) -> Result<AseInstalledMod, String> {
        // Resolve SteamCMD path (supports custom path override)
        let steamcmd_base = crate::services::resolve_steamcmd_dir_from_state(_state, _app_handle)?;
        let steamcmd_exe = steamcmd_base.join("steamcmd.exe");
        if !steamcmd_exe.exists() {
            let err_msg = "steamcmd.exe not found. Please install SteamCMD in settings.".to_string();
            emit_mod_progress(_app_handle, workshop_id, "failed", 0.0, &err_msg);
            return Err(err_msg);
        }

        let install_path: String = {
            let db = _state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0)
            ).map_err(|e| format!("Failed to find server install path: {}", e))?
        };

        let download_dir = steamcmd_base
            .join("steamapps")
            .join("workshop")
            .join("content")
            .join("346110")
            .join(workshop_id);

        // Clear any leftover download/lock files to prevent "failed (Locking Failed)" errors
        let downloads_dir = steamcmd_base
            .join("steamapps")
            .join("workshop")
            .join("downloads");
        let mod_downloads_dir = downloads_dir.join("346110").join(workshop_id);
        if mod_downloads_dir.exists() {
            let _ = std::fs::remove_dir_all(&mod_downloads_dir);
        }
        let patch_file = downloads_dir.join(format!("state_346110_346110_{}.patch", workshop_id));
        if patch_file.exists() {
            let _ = std::fs::remove_file(&patch_file);
        }

        let mut success = false;
        let mut last_err = String::new();

        for attempt in 1..=(_retries.max(1)) {
            println!("[INFO] [ASE Mod Manager] Downloading mod {} (attempt {}/{})", workshop_id, attempt, _retries);
            
            emit_mod_progress(_app_handle, workshop_id, "downloading", 0.0, &format!("Starting download (attempt {}/{})...", attempt, _retries));
            emit_mod_log(_app_handle, workshop_id, &format!("Starting download for Mod ID: {} (attempt {}/{})", workshop_id, attempt, _retries));

            let child = tokio::process::Command::new(&steamcmd_exe)
                .args(&[
                    "+login", "anonymous",
                    "+workshop_download_item", "346110", workshop_id, "validate",
                    "+quit"
                ])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn();

            let mut child = match child {
                Ok(c) => c,
                Err(e) => {
                    last_err = format!("Failed to spawn SteamCMD: {}", e);
                    emit_mod_log(_app_handle, workshop_id, &format!("Error: Failed to spawn SteamCMD: {}", e));
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    continue;
                }
            };

            let stdout = child.stdout.take().unwrap();
            let mut reader = TokioBufReader::new(stdout).lines();

            let stderr = child.stderr.take().unwrap();
            let mut err_reader = TokioBufReader::new(stderr).lines();

            let app_handle_clone = _app_handle.clone();
            let w_id = workshop_id.to_string();
            let err_task = tokio::spawn(async move {
                while let Ok(Some(line)) = err_reader.next_line().await {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        emit_mod_log(&app_handle_clone, &w_id, &format!("[SteamCMD stderr] {}", trimmed));
                    }
                }
            });

            let mut stdout_stuck = false;
            loop {
                // 10-minute timeout for large mods — SteamCMD can be silent for
                // extended periods while validating multi-GB workshop content
                let next_line = tokio::time::timeout(
                    tokio::time::Duration::from_secs(600),
                    reader.next_line()
                ).await;

                match next_line {
                    Ok(Ok(Some(line))) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        emit_mod_log(_app_handle, workshop_id, trimmed);

                        // Parse real byte-level progress from SteamCMD output:
                        // "Update state (0x61) downloading, progress: 45.23 (156789012 / 346789012)"
                        if trimmed.contains("Update state") {
                            if let Some(progress_str) = trimmed.split("progress:").nth(1) {
                                let progress_str = progress_str.trim();
                                // Try parsing byte counts: "45.23 (downloaded / total)"
                                let mut pct_float: f32 = 0.0;
                                let mut dl_bytes: u64 = 0;
                                let mut total_b: u64 = 0;

                                if let Some(pct) = progress_str.split_whitespace().next() {
                                    pct_float = pct.parse::<f32>().unwrap_or(0.0);
                                }

                                // Extract byte counts from parentheses: (downloaded / total)
                                if let Some(paren_start) = progress_str.find('(') {
                                    if let Some(paren_end) = progress_str.find(')') {
                                        let inner = &progress_str[paren_start + 1..paren_end];
                                        let parts: Vec<&str> = inner.split('/').collect();
                                        if parts.len() == 2 {
                                            dl_bytes = parts[0].trim().parse::<u64>().unwrap_or(0);
                                            total_b = parts[1].trim().parse::<u64>().unwrap_or(0);
                                        }
                                    }
                                }

                                let msg = if total_b > 0 {
                                    let dl_mb = dl_bytes as f64 / 1_048_576.0;
                                    let total_mb = total_b as f64 / 1_048_576.0;
                                    format!("Downloading... {:.1}% ({:.1} MB / {:.1} MB) [Attempt {}/{}]", pct_float, dl_mb, total_mb, attempt, _retries)
                                } else {
                                    format!("Downloading... {:.1}% [Attempt {}/{}]", pct_float, attempt, _retries)
                                };
                                emit_mod_progress_bytes(_app_handle, workshop_id, "downloading", pct_float, &msg, dl_bytes, total_b);
                            }
                        } else if trimmed.contains("Logging in") {
                            emit_mod_progress(_app_handle, workshop_id, "downloading", 10.0, &format!("Logging into Steam anonymously... [Attempt {}/{}]", attempt, _retries));
                        } else if trimmed.contains("Downloading") {
                            emit_mod_progress(_app_handle, workshop_id, "downloading", 20.0, &format!("Downloading workshop content... [Attempt {}/{}]", attempt, _retries));
                        } else if trimmed.contains("Validating") || trimmed.contains("verifying") {
                            emit_mod_progress(_app_handle, workshop_id, "downloading", 85.0, &format!("Validating mod files... [Attempt {}/{}]", attempt, _retries));
                        }
                    }
                    Ok(Ok(None)) => {
                        break;
                    }
                    Ok(Err(e)) => {
                        emit_mod_log(_app_handle, workshop_id, &format!("[WARNING] Error reading SteamCMD output: {}", e));
                        break;
                    }
                    Err(_) => {
                        emit_mod_log(_app_handle, workshop_id, &format!("[WARNING] No download activity detected for 10 minutes (attempt {}/{}). Restarting SteamCMD to resume from cache...", attempt, _retries));
                        stdout_stuck = true;
                        break;
                    }
                }
            }

            if stdout_stuck {
                let _ = child.start_kill();
                let _ = child.wait().await;
                let _ = err_task.await;
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                continue;
            }

            let _ = err_task.await;
            let status = child.wait().await;

            match status {
                Ok(stat) => {
                    if stat.success() {
                        emit_mod_log(_app_handle, workshop_id, "SteamCMD reported success.");
                        if download_dir.exists() {
                            let has_content = std::fs::read_dir(&download_dir)
                                .map(|rd| rd.flatten().next().is_some())
                                .unwrap_or(false);
                            if has_content {
                                println!("[INFO] [ASE Mod Manager] Found downloaded mod content for workshop id {}", workshop_id);
                                emit_mod_log(_app_handle, workshop_id, "Workshop content verification passed.");
                                success = true;
                                break;
                            }
                        }
                        last_err = "SteamCMD reported success but files were not found in download folder.".to_string();
                    } else {
                        last_err = format!("SteamCMD exited with status {}", stat);
                    }
                }
                Err(e) => {
                    last_err = format!("Failed to execute SteamCMD: {}", e);
                }
            }

            // Exponential backoff: 2s → 4s → 8s → 10s (capped)
            let delay_secs = std::cmp::min(2u64.pow(attempt), 10);
            emit_mod_log(_app_handle, workshop_id, &format!("Attempt {}/{} failed. Error: {}. Retrying in {} seconds...", attempt, _retries, last_err, delay_secs));
            
            // Clear lock/download files for the next retry attempt
            let downloads_dir = steamcmd_base
                .join("steamapps")
                .join("workshop")
                .join("downloads");
            let mod_downloads_dir = downloads_dir.join("346110").join(workshop_id);
            if mod_downloads_dir.exists() {
                let _ = std::fs::remove_dir_all(&mod_downloads_dir);
            }
            let patch_file = downloads_dir.join(format!("state_346110_346110_{}.patch", workshop_id));
            if patch_file.exists() {
                let _ = std::fs::remove_file(&patch_file);
            }

            // Clean stale ACF manifest to prevent "Content Servers Unreachable" or
            // "Locking Failed" errors on subsequent SteamCMD invocations
            let workshop_dir = steamcmd_base
                .join("steamapps")
                .join("workshop");
            let acf_file = workshop_dir.join("appworkshop_346110.acf");
            if acf_file.exists() {
                let _ = std::fs::remove_file(&acf_file);
                emit_mod_log(_app_handle, workshop_id, "Cleared stale ACF manifest for clean retry.");
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
        }

        if !success {
            let err_msg = format!("Failed to download mod {} after {} retries: {}", workshop_id, _retries, last_err);
            emit_mod_progress(_app_handle, workshop_id, "failed", 100.0, &err_msg);
            return Err(err_msg);
        }

        let mods_parent_dir = PathBuf::from(&install_path).join("ShooterGame").join("Content").join("Mods");
        if !mods_parent_dir.exists() {
            std::fs::create_dir_all(&mods_parent_dir).map_err(|e| format!("Failed to create mods parent dir: {}", e))?;
        }

        emit_mod_progress(_app_handle, workshop_id, "extracting", 95.0, "Extracting mod assets & preparing .mod file...");

        let steam_source = find_ase_mod_in_steam_libraries(workshop_id);
        let target_mod_file = mods_parent_dir.join(format!("{}.mod", workshop_id));
        let target_assets_dir = mods_parent_dir.join(workshop_id);

        if let Some(ref source) = steam_source {
            emit_mod_log(_app_handle, workshop_id, &format!("Found local Steam library installation: {:?}", source.mod_file));
            std::fs::copy(&source.mod_file, &target_mod_file)
                .map_err(|e| format!("Failed to copy .mod file to server: {}", e))?;
            println!("[INFO] [ASE Mod Manager] Copied .mod file from Steam client: {:?} -> {:?}", source.mod_file, target_mod_file);
            emit_mod_log(_app_handle, workshop_id, "Copied .mod descriptor file successfully.");

            if target_assets_dir.exists() {
                let _ = std::fs::remove_dir_all(&target_assets_dir);
            }

            if source.assets_dir.exists() && source.assets_dir.is_dir() {
                emit_mod_log(_app_handle, workshop_id, "Copying assets from local Steam client...");
                std::fs::create_dir_all(&target_assets_dir)
                    .map_err(|e| format!("Failed to create target assets dir: {}", e))?;
                let total_bytes = get_dir_size(&source.assets_dir).unwrap_or(0);
                let mut copied_bytes = 0;
                copy_dir_all_with_progress(&source.assets_dir, &target_assets_dir, total_bytes, &mut copied_bytes, _app_handle, workshop_id)
                    .map_err(|e| format!("Failed to copy mod assets from Steam client: {}", e))?;
                println!("[INFO] [ASE Mod Manager] Copied mod assets from Steam client: {:?}", source.assets_dir);
            } else {
                emit_mod_log(_app_handle, workshop_id, "Local Steam assets folder missing. Falling back to copy from SteamCMD workshop download...");
                std::fs::create_dir_all(&target_assets_dir)
                    .map_err(|e| format!("Failed to create target assets dir: {}", e))?;
                Self::copy_workshop_assets(_app_handle, &download_dir, &target_assets_dir, workshop_id)?;
            }
        } else {
            emit_mod_log(_app_handle, workshop_id, "Local Steam library installation not found. Auto-generating .mod file from downloaded workshop content...");
            
            let mut base_dir = download_dir.clone();
            if !download_dir.join("mod.info").exists() && !download_dir.join("modmeta.info").exists() {
                if download_dir.join("WindowsNoEditor").exists() {
                    base_dir = download_dir.join("WindowsNoEditor");
                }
            }

            if !base_dir.join("mod.info").exists() || !base_dir.join("modmeta.info").exists() {
                let err_msg = "Missing mod.info or modmeta.info in downloaded content. Cannot generate .mod file.".to_string();
                emit_mod_progress(_app_handle, workshop_id, "failed", 100.0, &err_msg);
                emit_mod_log(_app_handle, workshop_id, &format!("Error: {}", err_msg));
                return Err(err_msg);
            }

            if let Err(e) = generate_mod_file(workshop_id, &download_dir, &target_mod_file) {
                let err_msg = format!("Failed to generate .mod file: {}", e);
                emit_mod_progress(_app_handle, workshop_id, "failed", 100.0, &err_msg);
                emit_mod_log(_app_handle, workshop_id, &format!("Error: {}", err_msg));
                return Err(err_msg);
            }

            emit_mod_log(_app_handle, workshop_id, "Successfully generated .mod file.");

            if target_assets_dir.exists() {
                let _ = std::fs::remove_dir_all(&target_assets_dir);
            }
            std::fs::create_dir_all(&target_assets_dir)
                .map_err(|e| format!("Failed to create target assets dir: {}", e))?;
            emit_mod_log(_app_handle, workshop_id, "Copying workshop assets to server mods folder...");
            Self::copy_workshop_assets(_app_handle, &download_dir, &target_assets_dir, workshop_id)?;
        }

        emit_mod_progress(_app_handle, workshop_id, "completed", 100.0, "Installation complete!");
        emit_mod_log(_app_handle, workshop_id, "Installation complete!");

        // Insert/update in database
        let now = chrono::Utc::now().to_rfc3339();
        let next_load_order;
        
        {
            let db = _state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            
            let max_load_order: i32 = conn.query_row(
                "SELECT COALESCE(MAX(load_order), -1) FROM ase_mods WHERE server_id = ?1",
                [server_id],
                |row| row.get(0)
            ).unwrap_or(-1);
            
            next_load_order = max_load_order + 1;

            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM ase_mods WHERE server_id = ?1 AND workshop_id = ?2)",
                rusqlite::params![server_id, workshop_id],
                |row| row.get(0),
            ).unwrap_or(false);

            if exists {
                conn.execute(
                    "UPDATE ase_mods SET name = ?1, installed_at = ?2, enabled = 1 WHERE server_id = ?3 AND workshop_id = ?4",
                    rusqlite::params![mod_name, now, server_id, workshop_id]
                ).map_err(|e| format!("Failed to update existing mod record: {}", e))?;
            } else {
                conn.execute(
                    "INSERT INTO ase_mods (server_id, workshop_id, name, version, installed_at, enabled, load_order)
                     VALUES (?1, ?2, ?3, '1.0', ?4, 1, ?5)",
                    rusqlite::params![server_id, workshop_id, mod_name, now, next_load_order]
                ).map_err(|e| format!("Failed to insert mod record: {}", e))?;
            }
        }

        Ok(AseInstalledMod {
            id: 0,
            server_id,
            workshop_id: workshop_id.to_string(),
            name: mod_name.to_string(),
            version: "1.0".to_string(),
            installed_at: now,
            enabled: true,
            load_order: next_load_order,
            description: None,
            author: None,
            preview_url: None,
            cached_image_url: None,
            workshop_url: Some(format!("https://steamcommunity.com/sharedfiles/filedetails/?id={}", workshop_id)),
            subscribers: None,
            file_size: None,
            time_updated: None,
            time_created: None,
            tags: None,
            mod_status: Some("installed".to_string()),
            download_status: Some("completed".to_string()),
            health_status: Some("healthy".to_string()),
            dependencies: None,
        })
    }

    /// Copy mod assets from the SteamCMD workshop download folder to the target directory.
    /// Handles WindowsNoEditor layout and flat/mixed folder structures.
    fn copy_workshop_assets(app_handle: &AppHandle, download_dir: &PathBuf, target_assets_dir: &PathBuf, workshop_id: &str) -> Result<(), String> {
        let windows_no_editor_dir = download_dir.join("WindowsNoEditor");
        if windows_no_editor_dir.exists() && windows_no_editor_dir.is_dir() {
            // Correct ASE layout: The contents of WindowsNoEditor go directly into the mod ID folder.
            let total_bytes = get_dir_size(&windows_no_editor_dir).unwrap_or(0);
            let mut copied_bytes = 0;
            copy_dir_all_with_progress(&windows_no_editor_dir, target_assets_dir, total_bytes, &mut copied_bytes, app_handle, workshop_id)
                .map_err(|e| format!("Failed to copy mod assets from WindowsNoEditor: {}", e))?;
        } else {
            // Fallback for differently structured mods
            if let Ok(entries) = std::fs::read_dir(download_dir) {
                let mut total_bytes = 0;
                let mut paths_to_copy = Vec::new();

                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|ext| ext == "mod").unwrap_or(false) {
                        continue;
                    }
                    total_bytes += get_dir_size(&path).unwrap_or(0);
                    paths_to_copy.push((path, entry.file_name()));
                }

                let mut copied_bytes = 0;
                for (path, file_name) in paths_to_copy {
                    // If there's a folder named exactly like the workshop ID, copy its contents
                    if path.is_dir() && file_name.to_string_lossy() == workshop_id {
                        copy_dir_all_with_progress(&path, target_assets_dir, total_bytes, &mut copied_bytes, app_handle, workshop_id)
                            .map_err(|e| format!("Failed to copy mod subdirectory assets: {}", e))?;
                        continue;
                    }

                    let dest = target_assets_dir.join(&file_name);
                    if path.is_dir() {
                        copy_dir_all_with_progress(&path, &dest, total_bytes, &mut copied_bytes, app_handle, workshop_id)
                            .map_err(|e| format!("Failed to copy mod assets folder {:?}: {}", file_name, e))?;
                    } else {
                        let size = path.metadata().map(|m| m.len()).unwrap_or(0);
                        std::fs::copy(&path, &dest)
                            .map_err(|e| format!("Failed to copy mod asset file {:?}: {}", file_name, e))?;
                        copied_bytes += size;
                        if total_bytes > 0 {
                            let progress = 95.0 + ((copied_bytes as f32 / total_bytes as f32) * 4.5);
                            let percentage = (progress * 10.0).round() / 10.0;
                            emit_mod_progress(app_handle, workshop_id, "extracting", percentage, &format!("Extracting/Copying assets... {:.1}%", percentage));
                        }
                    }
                }
            }
        }
        println!("[INFO] [ASE Mod Manager] Copied workshop assets to {:?}", target_assets_dir);
        Ok(())
    }

    pub fn update_active_mods(install_path: &str, workshop_id: &str, enable: bool) -> Result<(), String> {
        let config_dir = PathBuf::from(install_path)
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join("WindowsServer");
        let gus_path = config_dir.join("GameUserSettings.ini");
        if !gus_path.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(&gus_path)
            .map_err(|e| format!("Failed to read GameUserSettings.ini: {}", e))?;
        let mut gus_doc = IniDocument::parse(&content);

        let existing_active_mods = ini_get_str(&gus_doc, "ServerSettings", "ActiveMods", "");
        let mut mod_ids: Vec<String> = existing_active_mods
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if enable {
            if !mod_ids.contains(&workshop_id.to_string()) {
                mod_ids.push(workshop_id.to_string());
            }
        } else {
            mod_ids.retain(|id| id != workshop_id);
        }

        let new_active_mods = mod_ids.join(",");
        gus_doc.set_value("ServerSettings", "ActiveMods", &new_active_mods);

        let gus_content = gus_doc.serialize();
        let tmp_path = config_dir.join("GameUserSettings.ini.tmp");
        if let Err(e) = std::fs::write(&tmp_path, &gus_content) {
            println!("[WARNING] Failed to write temporary GameUserSettings.ini during update_active_mods: {}. Falling back to direct write.", e);
            std::fs::write(&gus_path, gus_content)
                .map_err(|err| format!("Failed to write GameUserSettings.ini: {}", err))?;
        } else {
            if let Err(e) = std::fs::rename(&tmp_path, &gus_path) {
                println!("[WARNING] Failed to rename GameUserSettings.ini.tmp during update_active_mods: {}. Falling back to direct write.", e);
                std::fs::write(&gus_path, gus_content)
                    .map_err(|err| format!("Failed to write GameUserSettings.ini: {}", err))?;
            }
        }

        Ok(())
    }

    pub fn sync_ase_mods_to_ini(install_path: &str, enabled_workshop_ids: &[String]) -> Result<(), String> {
        let config_dir = PathBuf::from(install_path)
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join("WindowsServer");
        if !config_dir.exists() {
            std::fs::create_dir_all(&config_dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let gus_path = config_dir.join("GameUserSettings.ini");
        let mut gus_doc = if gus_path.exists() {
            let content = std::fs::read_to_string(&gus_path)
                .map_err(|e| format!("Failed to read GameUserSettings.ini: {}", e))?;
            IniDocument::parse(&content)
        } else {
            IniDocument::new()
        };

        let active_mods_val = enabled_workshop_ids.join(",");
        gus_doc.set_value("ServerSettings", "ActiveMods", &active_mods_val);

        let gus_content = gus_doc.serialize();
        let tmp_path = config_dir.join("GameUserSettings.ini.tmp");
        
        if let Err(e) = std::fs::write(&tmp_path, &gus_content) {
            println!("[WARNING] Failed to write temporary GameUserSettings.ini during mod sync: {}. Falling back to direct write.", e);
            std::fs::write(&gus_path, gus_content)
                .map_err(|err| format!("Failed to write GameUserSettings.ini during mod sync: {}", err))?;
        } else {
            if let Err(e) = std::fs::rename(&tmp_path, &gus_path) {
                println!("[WARNING] Failed to rename GameUserSettings.ini.tmp during mod sync: {}. Falling back to direct write.", e);
                std::fs::write(&gus_path, gus_content)
                    .map_err(|err| format!("Failed to write GameUserSettings.ini during mod sync: {}", err))?;
            }
        }
        
        println!("[INFO] [ASE Mod Manager] Synced active mods ({}) to GameUserSettings.ini", active_mods_val);
        Ok(())
    }

    pub async fn clean_failed_download(_app_handle: &AppHandle, workshop_id: &str, _server_id: i64, _state: &State<'_, AppState>) -> Result<(), String> {
        let steamcmd_base = crate::services::resolve_steamcmd_dir_from_state(_state, _app_handle)?;
        let steamcmd_workshop = steamcmd_base.join("steamapps").join("workshop");
        
        let content_dir = steamcmd_workshop.join("content").join("346110").join(workshop_id);
        if content_dir.exists() {
            let _ = std::fs::remove_dir_all(&content_dir);
        }

        let download_dir = steamcmd_workshop.join("downloads").join("346110").join(workshop_id);
        if download_dir.exists() {
            let _ = std::fs::remove_dir_all(&download_dir);
        }

        Ok(())
    }

    pub async fn validate_mod(server_id: i64, workshop_id: String, state: &State<'_, AppState>) -> Result<ModValidationReport, String> {
        let install_path: String = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0)
            ).map_err(|e| format!("Server not found: {}", e))?
        };

        let mods_dir = PathBuf::from(&install_path).join("ShooterGame").join("Content").join("Mods");
        let mod_file = mods_dir.join(format!("{}.mod", workshop_id));
        let mod_folder = mods_dir.join(&workshop_id);

        let mut errors = Vec::new();
        let warnings = Vec::new();
        let mut issues = Vec::new();

        if !mod_file.exists() {
            errors.push(format!("Missing mod descriptor file: {}.mod", workshop_id));
        } else {
            if let Ok(meta) = std::fs::metadata(&mod_file) {
                if meta.len() == 0 {
                    errors.push(format!("Mod descriptor file {}.mod is empty (0 bytes)", workshop_id));
                }
            }
        }

        if !mod_folder.exists() {
            errors.push(format!("Missing mod assets folder: {}", workshop_id));
        } else if !mod_folder.is_dir() {
            errors.push(format!("Mod assets path exists but is not a directory: {}", workshop_id));
        } else {
            if let Ok(entries) = std::fs::read_dir(&mod_folder) {
                if entries.count() == 0 {
                    errors.push(format!("Mod assets folder is empty: {}", workshop_id));
                }
            } else {
                errors.push(format!("Cannot read mod assets folder: {}", workshop_id));
            }
        }

        let is_valid = errors.is_empty();
        if !is_valid {
            issues.extend(errors.clone());
        }

        Ok(ModValidationReport {
            is_valid,
            errors,
            warnings,
            issues,
        })
    }

    pub async fn repair_mod(app_handle: AppHandle, server_id: i64, workshop_id: String, state: &State<'_, AppState>) -> Result<ModValidationReport, String> {
        println!("[INFO] [ASE Mod Manager] Repairing mod {} for server {}", workshop_id, server_id);
        
        let report = Self::validate_mod(server_id, workshop_id.clone(), state).await?;
        if report.is_valid {
            println!("[INFO] [ASE Mod Manager] Mod {} is already healthy", workshop_id);
            return Ok(report);
        }

        let install_path: String = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0)
            ).map_err(|e| format!("Server not found: {}", e))?
        };

        let mods_dir = PathBuf::from(&install_path).join("ShooterGame").join("Content").join("Mods");
        let mod_file = mods_dir.join(format!("{}.mod", workshop_id));
        let mod_folder = mods_dir.join(&workshop_id);

        if mod_file.exists() {
            let _ = std::fs::remove_file(&mod_file);
        }
        if mod_folder.exists() {
            let _ = std::fs::remove_dir_all(&mod_folder);
        }

        let _ = Self::clean_failed_download(&app_handle, &workshop_id, server_id, state).await;

        let mod_name = format!("Workshop Mod {}", workshop_id);
        let _ = Self::download_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, state, 5).await?;

        Self::validate_mod(server_id, workshop_id, state).await
    }
}