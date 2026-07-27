export type OperatingSystem = 'windows' | 'linux' | 'macos' | 'unknown';

export interface PlatformInfo {
  os: OperatingSystem;
  isWindows: boolean;
  isLinux: boolean;
  defaultBackupDir: string;
  defaultClusterDir: string;
  steamcmdExecutable: string;
}
