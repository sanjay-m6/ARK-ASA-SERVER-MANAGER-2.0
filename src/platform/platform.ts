import { invoke } from '@tauri-apps/api/core';
import { OperatingSystem, PlatformInfo } from './common/types';

let cachedPlatformInfo: PlatformInfo | null = null;

export async function getPlatformInfo(): Promise<PlatformInfo> {
  if (cachedPlatformInfo) {
    return cachedPlatformInfo;
  }

  try {
    const info = await invoke<PlatformInfo>('get_platform_info');
    cachedPlatformInfo = info;
    return info;
  } catch (e) {
    console.warn('Failed to fetch platform info from backend, using fallback:', e);
    const isWin = typeof window !== 'undefined' && window.navigator?.userAgent?.includes('Windows');
    const os: OperatingSystem = isWin ? 'windows' : 'linux';
    
    cachedPlatformInfo = {
      os,
      isWindows: isWin,
      isLinux: !isWin,
      defaultBackupDir: isWin ? 'C:/ASA_Backups' : '~/ASA_Backups',
      defaultClusterDir: isWin ? 'C:/ASA_Clusters' : '~/ASA_Clusters',
      steamcmdExecutable: isWin ? 'steamcmd.exe' : 'steamcmd.sh',
    };
    return cachedPlatformInfo;
  }
}

export function isWindowsOS(): boolean {
  return cachedPlatformInfo?.isWindows ?? (typeof window !== 'undefined' && window.navigator?.userAgent?.includes('Windows'));
}

export function isLinuxOS(): boolean {
  return cachedPlatformInfo?.isLinux ?? (!isWindowsOS());
}

export function formatPlatformPath(pathStr: string): string {
  if (!pathStr) return '';
  if (isWindowsOS()) {
    return pathStr.replace(/\//g, '\\');
  }
  return pathStr.replace(/\\/g, '/');
}
