//! Custom error types for ASA Server Manager

use thiserror::Error;

#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum AsaError {
    #[error("Server is currently running. Stop the server before performing this operation.")]
    ServerRunning,

    #[error("Configuration file not found: {0}")]
    ConfigNotFound(String),

    #[error("Save file not found: {0}")]
    SaveNotFound(String),

    #[error("Mod not found: {0}")]
    ModNotFound(String),

    #[error("CurseForge API error: {0}")]
    CurseForgeError(String),

    #[error("Write permission denied: {0}")]
    PermissionDenied(String),

    #[error("Invalid INI format: {0}")]
    InvalidIni(String),

    #[error("Backup failed: {0}")]
    BackupFailed(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}
