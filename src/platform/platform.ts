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
      defaultServerDir: isWin ? 'C:\\ARKServers' : '~/ASA-SERVERS',
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

export function getDefaultServerDir(): string {
  if (cachedPlatformInfo?.defaultServerDir) {
    return cachedPlatformInfo.defaultServerDir;
  }
  return isWindowsOS() ? 'C:\\ARKServers' : '~/ASA-SERVERS';
}

export function formatPlatformPath(pathStr: string): string {
  if (!pathStr) return '';
  if (isWindowsOS()) {
    return pathStr.replace(/\//g, '\\');
  }
  return pathStr.replace(/\\/g, '/');
}

export function joinPlatformPath(base: string, child: string): string {
  if (!base) return child;
  if (!child) return base;

  if (isWindowsOS()) {
    const cleanBase = base.endsWith('\\') || base.endsWith('/') ? base.slice(0, -1) : base;
    const cleanChild = child.startsWith('\\') || child.startsWith('/') ? child.slice(1) : child;
    return `${cleanBase}\\${cleanChild}`.replace(/\//g, '\\');
  } else {
    const cleanBase = base.endsWith('/') || base.endsWith('\\') ? base.slice(0, -1) : base;
    const cleanChild = child.startsWith('/') || child.startsWith('\\') ? child.slice(1) : child;
    return `${cleanBase}/${cleanChild}`.replace(/\\/g, '/');
  }
}
