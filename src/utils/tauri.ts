// Frontend wrapper for Tauri commands
import { invoke } from '@tauri-apps/api/core';
import type {
    Server,
    SystemInfo,
    ModInfo,
    Backup,
    Cluster,
    ClusterStatus,
    ServerType,
    PlayerStats,
    PlayerSession,
} from '../types';

// ============================================================================
// System Commands
// ============================================================================

export async function getSystemInfo(): Promise<SystemInfo> {
    return await invoke('get_system_info');
}

export async function selectFolder(title: string): Promise<string | null> {
    return await invoke('select_folder', { title });
}

export async function selectFile(title: string, extensions?: string[]): Promise<string | null> {
    return await invoke('select_file', { title, extensions });
}

export async function getSetting(key: string): Promise<string | null> {
    return await invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
    return await invoke('set_setting', { key, value });
}

// ============================================================================
// Server Commands
// ============================================================================

export async function getAllServers(): Promise<Server[]> {
    return await invoke('get_all_servers');
}

export async function getServerById(serverId: number): Promise<Server | null> {
    return await invoke('get_server_by_id', { serverId });
}

export interface InstallServerParams {
    serverType: ServerType;
    installPath: string;
    name: string;
    sessionName?: string; // Public name shown in ARK server browser
    mapName: string;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    pveMode?: boolean; // true = PvE, false = PvP
    crossplay?: boolean; // true = Enable crossplay for PC/Console players
}

export async function installServer(params: InstallServerParams): Promise<Server> {
    return await invoke('install_server', {
        serverType: params.serverType,
        installPath: params.installPath,
        name: params.name,
        mapName: params.mapName,
        gamePort: params.gamePort,
        queryPort: params.queryPort,
        rconPort: params.rconPort,
    });
}

export async function startServer(serverId: number): Promise<void> {
    return await invoke('start_server', { serverId });
}

export async function startServerNoMods(serverId: number): Promise<void> {
    return await invoke('start_server_no_mods', { serverId });
}

export async function stopServer(serverId: number): Promise<void> {
    return await invoke('stop_server', { serverId });
}

export async function restartServer(serverId: number): Promise<void> {
    return await invoke('restart_server', { serverId });
}

export async function deleteServer(serverId: number): Promise<void> {
    return await invoke('delete_server', { serverId });
}

export async function updateServer(serverId: number): Promise<void> {
    return await invoke('update_server', { serverId });
}

export async function cloneServer(serverId: number): Promise<Server> {
    return await invoke('clone_server', { sourceServerId: serverId });
}

export async function importServer(installPath: string, name: string): Promise<Server> {
    return await invoke('import_server', { installPath, name });
}

export async function toggleServerAutomation(serverId: number, toggleType: 'auto_start' | 'auto_stop' | 'intelligent_mode', enabled: boolean): Promise<void> {
    return await invoke('toggle_automation', { serverId, toggleType, enabled });
}

export async function importNonDedicatedSave(serverId: number, sourcePath: string, importType: 'file' | 'folder'): Promise<string> {
    return await invoke('import_non_dedicated_save', { serverId, sourcePath, importType });
}

export async function transferSettings(sourceServerId: number, targetServerId: number): Promise<void> {
    return await invoke('transfer_settings', { sourceServerId, targetServerId });
}

export async function extractSaveData(sourceServerId: number, targetServerId: number): Promise<void> {
    return await invoke('extract_save_data', { sourceServerId, targetServerId });
}

export interface UpdateServerSettingsParams {
    serverId: number;
    maxPlayers?: number;
    serverPassword?: string;
    adminPassword?: string;
    mapName?: string;
    sessionName?: string;
    gamePort?: number;
    queryPort?: number;
    rconPort?: number;
    ipAddress?: string;
    customArgs?: string;
}

export async function updateServerSettings(params: UpdateServerSettingsParams): Promise<void> {
    return await invoke('update_server_settings', {
        ...params,
        custom_args: params.customArgs
    });
}

export async function checkServerReachability(serverId: number, port: number): Promise<'Public' | 'LAN' | 'Unknown' | 'Offline'> {
    return await invoke('check_server_reachability', { serverId, port });
}

export async function startLogWatcher(serverId: number, installPath: string): Promise<void> {
    return await invoke('start_log_watcher', { serverId, installPath });
}

export async function showServerConsole(serverId: number): Promise<void> {
    return await invoke('show_server_console', { serverId });
}

// ============================================================================
// Mod Commands
// ============================================================================

export async function searchMods(query: string, serverType: ServerType): Promise<ModInfo[]> {
    return await invoke('search_mods', { query, serverType });
}

export async function getModDescription(modId: string): Promise<string> {
    return await invoke('get_mod_description', { modId });
}

export async function installMod(serverId: number, modInfo: ModInfo): Promise<void> {
    return await invoke('install_mod', { serverId, modInfo });
}

export async function getInstalledMods(serverId: number): Promise<ModInfo[]> {
    return await invoke('get_installed_mods', { serverId });
}

export async function uninstallMod(serverId: number, modId: string): Promise<void> {
    return await invoke('uninstall_mod', { serverId, modId });
}

export async function updateModOrder(serverId: number, modIds: string[]): Promise<void> {
    return await invoke('update_mod_order', { serverId, modIds });
}

export async function toggleMod(serverId: number, modId: string, enabled: boolean): Promise<void> {
    return await invoke('toggle_mod', { serverId, modId, enabled });
}

export interface ModValidationResult {
    valid: boolean;
    mod_id: string;
    error?: string;
}

export interface ModConfigPreview {
    ini_section: string;
    startup_command: string;
    mod_count: number;
    validation_errors: string[];
}

export async function validateModIds(modIds: string[]): Promise<ModValidationResult[]> {
    return await invoke('validate_mod_ids', { modIds });
}

export async function generateModConfig(serverId: number): Promise<ModConfigPreview> {
    return await invoke('generate_mod_config', { serverId });
}

export async function applyModsToServer(serverId: number): Promise<ModConfigPreview> {
    return await invoke('apply_mods_to_server', { serverId });
}

export async function getModInstallInstructions(): Promise<string[]> {
    return await invoke('get_mod_install_instructions');
}

export async function hardcoreRetryMods(serverId: number): Promise<void> {
    return await invoke('hardcore_retry_mods', { serverId });
}

export async function copyModsToServer(sourceServerId: number, targetServerId: number): Promise<void> {
    return await invoke('copy_mods_to_server', { sourceServerId, targetServerId });
}


// ============================================================================
// Config Commands
// ============================================================================

export async function readConfig(serverId: number, configType: string): Promise<string> {
    return await invoke('read_config', { serverId, configType });
}

export async function saveConfig(serverId: number, configType: string, content: string): Promise<void> {
    return await invoke('save_config', { serverId, configType, content });
}

// ============================================================================
// Backup Commands
// ============================================================================

export async function createBackup(serverId: number, backupType: 'auto' | 'manual' | 'pre-update'): Promise<Backup> {
    return await invoke('create_backup', { serverId, backupType });
}

export async function getBackups(serverId: number): Promise<Backup[]> {
    return await invoke('get_backups', { serverId });
}

export async function restoreBackup(backupId: number): Promise<void> {
    return await invoke('restore_backup', { backupId });
}

export async function deleteBackup(backupId: number): Promise<void> {
    return await invoke('delete_backup', { backupId });
}

export async function verifyBackup(backupId: number): Promise<boolean> {
    return await invoke('verify_backup', { backupId });
}

export async function getBackupContents(backupId: number): Promise<string[]> {
    return await invoke('get_backup_contents', { backupId });
}

// ============================================================================
// Cluster Commands
// ============================================================================

export async function createCluster(name: string, serverIds: number[]): Promise<Cluster> {
    return await invoke('create_cluster', { name, serverIds });
}

export async function getClusters(): Promise<Cluster[]> {
    return await invoke('get_clusters');
}

export async function deleteCluster(clusterId: number): Promise<void> {
    return await invoke('delete_cluster', { clusterId });
}

export async function getClusterStatus(clusterId: number): Promise<ClusterStatus> {
    return await invoke('get_cluster_status', { clusterId });
}

export async function startCluster(clusterId: number): Promise<void> {
    return await invoke('start_cluster', { clusterId });
}

export async function stopCluster(clusterId: number): Promise<void> {
    return await invoke('stop_cluster', { clusterId });
}

// ============================================================================
// Player Intelligence Commands
// ============================================================================

export async function getPlayerStats(steamId: string): Promise<PlayerStats> {
    return await invoke('get_player_stats', { steamId });
}

export async function getAllPlayers(limit?: number, offset?: number): Promise<PlayerStats[]> {
    return await invoke('get_all_players', { limit, offset });
}

export async function getPlayerSessions(steamId: string, limit?: number): Promise<PlayerSession[]> {
    return await invoke('get_player_sessions', { steamId, limit });
}

export async function updatePlayerNotes(steamId: string, notes?: string): Promise<void> {
    return await invoke('update_player_notes', { steamId, notes });
}

export async function setPlayerWhitelist(steamId: string, whitelisted: boolean): Promise<void> {
    return await invoke('set_player_whitelist', { steamId, whitelisted });
}

export async function setPlayerBan(steamId: string, banned: boolean): Promise<void> {
    return await invoke('set_player_ban', { steamId, banned });
}

export async function searchPlayers(query: string): Promise<PlayerStats[]> {
    return await invoke('search_players', { query });
}

// ============================================================================
// Plugin Commands
// ============================================================================

import type { PluginInfo } from '../types';

export async function checkAsaApiInstalled(serverId: number): Promise<boolean> {
    return await invoke('check_asa_api_installed', { serverId });
}

export async function getPluginDirectory(serverId: number): Promise<string> {
    return await invoke('get_plugin_directory', { serverId });
}

export async function selectPluginArchive(): Promise<string | null> {
    return await invoke('select_plugin_zip');
}

export async function importPluginArchive(serverId: number, archivePath: string): Promise<PluginInfo> {
    return await invoke('import_plugin_archive', { serverId, archivePath });
}

export async function getInstalledPlugins(serverId: number): Promise<PluginInfo[]> {
    return await invoke('get_installed_plugins', { serverId });
}

export async function uninstallPlugin(serverId: number, pluginId: string): Promise<void> {
    return await invoke('uninstall_plugin', { serverId, pluginId });
}

export async function togglePlugin(serverId: number, pluginId: string, enabled: boolean): Promise<void> {
    return await invoke('toggle_plugin', { serverId, pluginId, enabled });
}
