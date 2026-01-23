use std::path::PathBuf;
use std::io::Cursor;
use tauri::AppHandle;
use tauri::Manager;
use anyhow::{Result, Context};

pub struct SteamCmdService {
    app_handle: AppHandle,
}

impl SteamCmdService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    pub fn get_steamcmd_dir(&self) -> Result<PathBuf> {
        let app_dir = self.app_handle.path().app_data_dir()?;
        Ok(app_dir.join("steamcmd"))
    }

    pub fn get_steamcmd_exe(&self) -> Result<PathBuf> {
        Ok(self.get_steamcmd_dir()?.join("steamcmd.exe"))
    }

    pub fn check_installation(&self) -> bool {
        match self.get_steamcmd_exe() {
            Ok(path) => path.exists(),
            Err(_) => false,
        }
    }

    pub async fn install(&self) -> Result<()> {
        let install_dir = self.get_steamcmd_dir()?;
        if !install_dir.exists() {
            std::fs::create_dir_all(&install_dir)?;
        }

        println!("Downloading SteamCMD...");
        let response = reqwest::get("https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip")
            .await
            .context("Failed to download SteamCMD")?;

        let bytes = response.bytes().await.context("Failed to get bytes from response")?;
        
        println!("Extracting SteamCMD...");
        let target_dir = install_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
            archive.extract(&target_dir)?;
            Ok(())
        }).await??;

        println!("SteamCMD installed successfully at {:?}", install_dir);
        Ok(())
    }
}
