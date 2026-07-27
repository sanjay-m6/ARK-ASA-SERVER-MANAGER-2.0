#[cfg(test)]
mod tests {
    use super::super::*;

    #[test]
    fn test_operating_system_detection() {
        let os = OperatingSystem::current();
        assert_ne!(os, OperatingSystem::Unknown);

        if cfg!(target_os = "windows") {
            assert!(os.is_windows());
            assert_eq!(os.as_str(), "windows");
        } else if cfg!(target_os = "linux") {
            assert!(os.is_linux());
            assert_eq!(os.as_str(), "linux");
        }
    }

    #[test]
    fn test_executable_name_resolution() {
        if cfg!(target_os = "windows") {
            assert_eq!(Platform::executable_name("ArkAscendedServer"), "ArkAscendedServer.exe");
            assert_eq!(Platform::executable_name("ShooterGameServer.exe"), "ShooterGameServer.exe");
            assert_eq!(Platform::steamcmd_executable_name(), "steamcmd.exe");
        } else {
            assert_eq!(Platform::executable_name("ArkAscendedServer"), "ArkAscendedServer");
            assert_eq!(Platform::executable_name("ShooterGameServer.exe"), "ShooterGameServer");
            assert_eq!(Platform::steamcmd_executable_name(), "steamcmd.sh");
        }
    }

    #[test]
    fn test_default_paths() {
        let backup_dir = Platform::default_backup_dir();
        let cluster_dir = Platform::default_cluster_dir();

        assert!(!backup_dir.as_os_str().is_empty());
        assert!(!cluster_dir.as_os_str().is_empty());

        if cfg!(target_os = "windows") {
            assert_eq!(backup_dir.to_str().unwrap(), "C:/ASA_Backups");
            assert_eq!(cluster_dir.to_str().unwrap(), "C:/ASA_Clusters");
        }
    }

    #[test]
    fn test_creation_flags() {
        let flags = Platform::creation_flags();
        if cfg!(target_os = "windows") {
            assert_eq!(flags, 0x08000000);
        } else {
            assert_eq!(flags, 0);
        }
    }
}
