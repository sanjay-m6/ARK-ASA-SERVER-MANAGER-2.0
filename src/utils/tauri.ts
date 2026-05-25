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

export type {
    Server,
    SystemInfo,
    ModInfo,
    Backup,
    Cluster,
    ClusterStatus,
    ServerType,
    PlayerStats,
    PlayerSession,
};

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

// File Manager commands
export async function readDirectory(path: string): Promise<any[]> {
    return await invoke('read_directory', { path });
}

export async function readFileContent(path: string): Promise<string> {
    return await invoke('read_file_content', { path });
}

export async function getParentDirectory(path: string): Promise<string> {
    return await invoke('get_parent_directory', { path });
}

export async function getSetting(key: string): Promise<string | null> {
    return await invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
    return await invoke('set_setting', { key, value });
}

export async function checkIsAdmin(): Promise<boolean> {
    return await invoke('check_is_admin');
}

// ============================================================================
// SteamCMD Recovery Commands
// ============================================================================

export interface SteamCmdHealth {
    isHealthy: boolean;
    exeExists: boolean;
    exeSizeBytes: number;
    diskSpaceGb: number;
    hasStaleCache: boolean;
    installPath: string;
}

export async function repairSteamcmd(): Promise<void> {
    return await invoke('repair_steamcmd');
}

export async function clearSteamcmdCache(): Promise<void> {
    return await invoke('clear_steamcmd_cache');
}

export async function getSteamcmdHealth(): Promise<SteamCmdHealth> {
    return await invoke('get_steamcmd_health');
}

// ============================================================================
// Server Commands
// ============================================================================

export async function getAllServers(): Promise<Server[]> {
    return await invoke('get_all_servers');
}

export async function updateServerStatusInDb(serverId: number, status: string): Promise<void> {
    return await invoke('update_server_status_in_db', { serverId, status });
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
    maxPlayers?: number;
    adminPassword?: string;
    serverPassword?: string;
}

export async function installServer(params: InstallServerParams): Promise<Server> {
    return await invoke('install_server', {
        serverType: params.serverType,
        installPath: params.installPath,
        name: params.name,
        sessionName: params.sessionName ?? '',
        mapName: params.mapName,
        gamePort: params.gamePort,
        queryPort: params.queryPort,
        rconPort: params.rconPort,
        pveMode: params.pveMode ?? true,
        crossplay: params.crossplay ?? false,
        maxPlayers: params.maxPlayers ?? 70,
        adminPassword: params.adminPassword ?? '',
        serverPassword: params.serverPassword ?? '',
    });
}

export async function startServer(serverId: number, updateOnStart: boolean = false): Promise<void> {
    return await invoke('start_server', { serverId, updateOnStart });
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

export async function importServer(installPath: string, name: string, overrides?: Partial<ImportPreview>): Promise<Server> {
    return await invoke('import_server', { installPath, name, overrides: overrides || null });
}

export interface ImportPreview {
    mapName: string;
    sessionName: string;
    maxPlayers: number;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    rconEnabled: boolean;
    adminPassword: string;
    serverPassword: string;
    ipAddress: string | null;
    activeMods: string;
    customArgs: string;
    clusterId: string;
    warnings: string[];
    // Diagnostic & Preview additions
    detectedCommand: string | null;
    sourceFiles: Record<string, string>;
    confidenceLevels: Record<string, string>;
    rawIniGus: string | null;
    rawIniGame: string | null;
    // Phase 3 Save Metadata
    playerCount: number;
    tribeCount: number;
    saveFileSize: number;
    saveLastModified: string | null;
}

export async function previewImportSettings(installPath: string, serverType: 'ASA' | 'ASE'): Promise<ImportPreview> {
    return await invoke('preview_import_settings', { installPath, serverType });
}

export async function importAseServer(installPath: string, name: string, overrides?: Partial<ImportPreview>): Promise<any> {
    return await invoke('import_ase_server', { installPath, name, overrides: overrides || null });
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

export async function checkServerReachability(port: number, protocol: string): Promise<'Public' | 'LAN' | 'Unknown' | 'Offline'> {
    return await invoke('check_server_reachability', { port, protocol });
}

export async function getServerLogs(serverId: number, installPath: string): Promise<any[]> {
    return await invoke('get_server_logs', { serverId, installPath });
}

export async function showServerConsole(serverId: number): Promise<void> {
    return await invoke('show_server_console', { serverId });
}

export async function debugDatabaseCheck(): Promise<string> {
    return await invoke('debug_database_check');
}

export interface PortConflict {
    port_type: string;
    port_number: number;
    conflicting_server_name: string | null;
    is_running: boolean;
}

export interface ConflictCheckResult {
    has_active_conflicts: boolean;
    has_inactive_conflicts: boolean;
    conflicts: PortConflict[];
}

export async function checkPortConflicts(serverId: number): Promise<ConflictCheckResult> {
    return await invoke('check_port_conflicts', { serverId });
}

// ============================================================================
// Mod Commands
// ============================================================================

export interface CurseForgeCategory {
    id: number;
    name: string;
    iconUrl?: string;
}

export async function getModCategories(): Promise<CurseForgeCategory[]> {
    return await invoke('get_mod_categories');
}

export async function searchMods(
    query: string,
    serverType: ServerType,
    categoryId?: number,
    sortField?: number,
    sortOrder?: string
): Promise<ModInfo[]> {
    return await invoke('search_mods', {
        query,
        serverType,
        categoryId: categoryId || null,
        sortField: sortField || null,
        sortOrder: sortOrder || null
    });
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

// Mod Conflict Scanner
export interface ModConflict {
    mod_a_id: string;
    mod_a_name: string;
    mod_b_id: string;
    mod_b_name: string;
    reason: string;
    severity: 'critical' | 'warning' | 'info';
}

export async function checkModConflicts(serverId: number): Promise<ModConflict[]> {
    return await invoke('check_mod_conflicts', { serverId });
}

// Modpack Export / Import
export interface ModpackImportResult {
    modpack_name: string;
    total_mods: number;
    installed_count: number;
    skipped_count: number;
    failed_ids: string[];
}

export async function exportModpack(serverId: number, modpackName: string): Promise<string> {
    return await invoke('export_modpack', { serverId, modpackName });
}

export async function importModpack(serverId: number, modpackJson: string): Promise<ModpackImportResult> {
    return await invoke('import_modpack', { serverId, modpackJson });
}

// Ban-list Sync
export interface BanlistSyncResult {
    new_bans_added: number;
    total_bans: number;
    source_url: string;
}

export async function syncBanlist(serverId: number, url: string): Promise<BanlistSyncResult> {
    return await invoke('sync_banlist', { serverId, url });
}

// Tribe Log Viewer
export interface TribeLogEntry {
    timestamp: string;
    day: number;
    event_type: string;
    message: string;
    raw_line: string;
}

export interface TribeLogResult {
    server_name: string;
    entries: TribeLogEntry[];
    total_parsed: number;
    total_lines: number;
}

export async function getTribeLogs(serverId: number, limit?: number): Promise<TribeLogResult> {
    return await invoke('get_tribe_logs', { serverId, limit: limit || null });
}

// UPnP Port Forwarding
export interface UPnPGatewayInfo {
    gateway_address: string;
    external_ip: string;
    available: boolean;
}

export interface PortMappingResult {
    port: number;
    protocol: string;
    success: boolean;
    error: string | null;
}

export interface UPnPForwardResult {
    gateway: UPnPGatewayInfo;
    mappings: PortMappingResult[];
    all_success: boolean;
}

export async function discoverUpnpGateway(): Promise<UPnPGatewayInfo> {
    return await invoke('discover_upnp_gateway');
}

export async function forwardServerPorts(serverId: number, leaseDuration?: number): Promise<UPnPForwardResult> {
    return await invoke('forward_server_ports', { serverId, leaseDuration: leaseDuration || null });
}

export async function removeServerPortForwards(serverId: number): Promise<PortMappingResult[]> {
    return await invoke('remove_server_port_forwards', { serverId });
}

// ============================================================================
// Community Commands
// ============================================================================

export interface SupportTicket {
    id: number;
    discordUser_id?: string;
    steamId?: string;
    issueText: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    adminNotes?: string;
    createdAt: string;
    resolvedAt?: string;
}

export interface DiscordUser {
    discordId: string;
    steamId: string;
    discordUsername: string;
    linkedAt: string;
}

export interface PointsUpdateResult {
    success: boolean;
    newBalance: number;
    error?: string;
}

export async function getSupportTickets(statusFilter?: string): Promise<SupportTicket[]> {
    return await invoke('get_support_tickets', { statusFilter: statusFilter || null });
}

export async function updateTicketStatus(ticketId: number, status: string, adminNotes?: string): Promise<boolean> {
    return await invoke('update_ticket_status', { ticketId, status, adminNotes: adminNotes || null });
}

export async function getDiscordUsers(): Promise<DiscordUser[]> {
    return await invoke('get_discord_users');
}

export async function addPlayerPoints(steamId: string, points: number): Promise<PointsUpdateResult> {
    return await invoke('add_player_points', { steamId, points });
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

export async function createCluster(name: string, serverIds: number[], clusterPath?: string): Promise<Cluster> {
    return await invoke('create_cluster', { name, serverIds, clusterPath: clusterPath || null });
}

export async function getClusters(): Promise<Cluster[]> {
    return await invoke('get_clusters');
}

export async function deleteCluster(clusterId: number): Promise<void> {
    return await invoke('delete_cluster', { clusterId });
}

export async function updateCluster(clusterId: number, name?: string, newPath?: string, moveData?: boolean): Promise<void> {
    return await invoke('update_cluster', { clusterId, name: name || null, newPath: newPath || null, moveData: moveData || false });
}

export async function addServerToCluster(clusterId: number, serverId: number): Promise<void> {
    return await invoke('add_server_to_cluster', { clusterId, serverId });
}

export async function removeServerFromCluster(clusterId: number, serverId: number): Promise<void> {
    return await invoke('remove_server_from_cluster', { clusterId, serverId });
}

export async function validateClusterPath(path: string): Promise<{ valid: boolean; error?: string }> {
    return await invoke('validate_cluster_path', { path });
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

export async function toggleClusterCrossChat(clusterId: number, enabled: boolean): Promise<void> {
    return await invoke('toggle_cluster_cross_chat', { clusterId, enabled });
}

export async function getClusterCrossChatStatus(clusterId: number): Promise<boolean> {
    return await invoke('get_cluster_cross_chat_status', { clusterId });
}

export interface ClusterValidationIssue {
    server_id: number;
    server_name: string;
    level: 'error' | 'warning';
    message: string;
}

export interface ClusterValidationResult {
    cluster_id: number;
    cluster_name: string;
    cluster_path: string;
    issues: ClusterValidationIssue[];
}

export async function validateClusterConfiguration(clusterId: number): Promise<ClusterValidationResult> {
    return await invoke('validate_cluster_configuration', { clusterId });
}

// ============================================================================
// Discord Bridge Commands
// ============================================================================

export interface DiscordBridgeConfig {
    cluster_id: number;
    enabled: boolean;
    bot_token: string;
    guild_id: string;
    channel_id: string;
    admin_channel_id: string; // New field
    admin_role_ids: string[];
    moderator_role_ids: string[];
    game_to_discord: boolean;
    discord_to_game: boolean;
    server_list_enabled: boolean;
    server_list_channel_id: string;
    server_list_message_id: string;
    player_list_enabled: boolean;
    player_list_channel_id: string;
    player_list_message_id: string;
    show_tribe_names: boolean;
    show_playtime: boolean;
}

export async function saveDiscordBridgeConfig(config: DiscordBridgeConfig): Promise<void> {
    return await invoke('save_discord_bridge_config', { config });
}

export async function getDiscordBridgeConfig(clusterId: number): Promise<DiscordBridgeConfig | null> {
    return await invoke('get_discord_bridge_config', { clusterId });
}

export async function testDiscordConnection(botToken: string, channelId: string): Promise<string> {
    return await invoke('test_discord_bridge_connection', { botToken, channelId }); // Use correct backend command name
}

export async function generateBotInviteUrl(botToken: string): Promise<string> {
    return await invoke('generate_bot_invite_url', { botToken });
}

export async function startDiscordBridge(): Promise<void> {
    return await invoke('start_discord_bridge');
}

export async function stopDiscordBridge(): Promise<void> {
    return await invoke('stop_discord_bridge');
}

export async function sendDiscordStatusUpdate(): Promise<void> {
    return await invoke('send_discord_status_update');
}


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

// ============================================================================
// Plugin Commands
// ============================================================================

export async function checkPluginStatus(serverId: number, pluginName: string): Promise<boolean> {
    return await invoke('check_plugin_status', { serverId, pluginName });
}

export async function checkAsaApiInstalled(serverId: number): Promise<boolean> {
    return await invoke('check_asa_api_installed', { serverId });
}

export async function installAsaApi(serverId: number): Promise<string> {
    return await invoke('install_asa_api', { serverId });
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

// ============================================================================
// Optimization Commands
// ============================================================================

export async function optimizeMemory(): Promise<void> {
    return await invoke('optimize_memory');
}

export async function setProcessPriority(high: boolean): Promise<void> {
    return await invoke('set_process_priority', { high });
}

export async function toggleEcoMode(enable: boolean): Promise<void> {
    return await invoke('toggle_eco_mode', { enable });
}

// ============================================================================
// Anti-Cheat Commands
// ============================================================================

export interface AntiCheatConfig {
    enabled: boolean;
    sensitivity: number;
    actions: {
        log_only: boolean;
        kick_enabled: boolean;
        ban_enabled: boolean;
        discord_alert: boolean;
    };
    mesh_protection: {
        enabled: boolean;
        threshold: number;
        notify_player: boolean;
    };
    command_protection: {
        enabled: boolean;
        blacklisted_commands: string[];
        whitelist_admin_ids: string[];
    };
}

export interface ViolationEvent {
    server_id: number;
    player_name: string;
    steam_id: string;
    violation_type: string;
    severity: number;
    details: string;
    timestamp: number;
}

export async function getAntiCheatConfig(serverId: number): Promise<AntiCheatConfig> {
    return await invoke('get_anti_cheat_config', { serverId });
}

export async function saveAntiCheatConfig(serverId: number, config: AntiCheatConfig): Promise<void> {
    return await invoke('save_anti_cheat_config', { serverId, config });
}

export async function getAntiCheatLogs(serverId: number, limit: number = 50): Promise<ViolationEvent[]> {
    return await invoke('get_anti_cheat_logs', { serverId, limit });
}

// ============================================================================
// Scheduler Settings
// ============================================================================

export interface SchedulerSettings {
    serverId: number;
    mode: 'basic' | 'advanced' | 'disabled';
    basicIntervalHours: number;
    basicWarningMinutes: string;
    nextRunBasic?: string | null;
    // Advanced fields
    advancedTime?: string | null;
    advancedDays?: string | null;
    advancedWarningMinutes?: string | null;
    advancedShutdown?: boolean;
    advancedUpdate?: boolean;
    advancedRestart?: boolean;
    advancedDinoWipe?: boolean;
}

export interface ScheduledTask {
    id: number;
    serverId: number;
    taskName?: string;
    taskType: string;
    cronExpression: string;
    command?: string;
    message?: string;
    preWarningMinutes: number;
    enabled: boolean;
    lastRun?: string;
}

export async function getSchedulerSettings(serverId: number): Promise<SchedulerSettings> {
    return await invoke('get_scheduler_settings', { serverId });
}

export async function saveSchedulerSettings(settings: SchedulerSettings): Promise<void> {
    return await invoke('save_scheduler_settings', { settings });
}

export async function getScheduledTasks(serverId: number): Promise<ScheduledTask[]> {
    return await invoke('get_scheduled_tasks', { serverId });
}

export async function createScheduledTask(
    serverId: number,
    taskName: string | null,
    taskType: string,
    cronExpression: string,
    command: string | null,
    message: string | null,
    preWarningMinutes: number
): Promise<void> {
    return await invoke('create_scheduled_task', {
        request: {
            serverId,
            taskName,
            taskType,
            cronExpression,
            command,
            message,
            preWarningMinutes,
        }
    });
}

export async function toggleScheduledTask(taskId: number, enabled: boolean): Promise<void> {
    return await invoke('toggle_scheduled_task', { taskId, enabled });
}

export async function deleteScheduledTask(taskId: number): Promise<void> {
    return await invoke('delete_scheduled_task', { taskId });
}

// ============================================================================
// Auto-Start System Commands
// ============================================================================

export async function getAutoStartConfig(): Promise<any> {
    return await invoke('get_auto_start_config');
}

export async function setAutoStartConfig(config: any): Promise<void> {
    return await invoke('set_auto_start_config', { config });
}

export async function setServerStartupConfig(serverId: number, delay: number, priority: number): Promise<void> {
    return await invoke('set_server_startup_config', { serverId, delay, priority });
}

// --- ASE Cluster Commands ---

export async function createAseCluster(name: string, serverIds: number[], clusterDir?: string): Promise<Cluster> {
    return await invoke('create_ase_cluster', { name, serverIds, clusterDir: clusterDir || null });
}

export async function getAseClusters(): Promise<Cluster[]> {
    return await invoke('get_ase_clusters');
}

export async function deleteAseCluster(clusterId: number): Promise<void> {
    return await invoke('delete_ase_cluster', { clusterId });
}

export async function updateAseCluster(clusterId: number, name?: string, newPath?: string, moveData?: boolean): Promise<void> {
    return await invoke('update_ase_cluster', { clusterId, name: name || null, newPath: newPath || null, moveData: moveData || false });
}

export async function addServerToAseCluster(clusterId: number, serverId: number): Promise<void> {
    return await invoke('add_ase_server_to_cluster', { clusterId, serverId });
}

export async function removeServerFromAseCluster(clusterId: number, serverId: number): Promise<void> {
    return await invoke('remove_ase_server_from_cluster', { clusterId, serverId });
}

export async function getAseClusterStatus(clusterId: number): Promise<ClusterStatus> {
    return await invoke('get_ase_cluster_status', { clusterId });
}

export async function startAseCluster(clusterId: number): Promise<void> {
    return await invoke('start_ase_cluster', { clusterId });
}

export async function stopAseCluster(clusterId: number): Promise<void> {
    return await invoke('stop_ase_cluster', { clusterId });
}

export async function restartAseCluster(clusterId: number): Promise<void> {
    return await invoke('restart_ase_cluster', { clusterId });
}

export async function toggleAseClusterCrossChat(clusterId: number, enabled: boolean): Promise<void> {
    return await invoke('toggle_ase_cluster_cross_chat', { clusterId, enabled });
}

export async function getAseClusterCrossChatStatus(clusterId: number): Promise<boolean> {
    return await invoke('get_ase_cluster_cross_chat_status', { clusterId });
}

export async function validateAseClusterConfiguration(clusterId: number): Promise<ClusterValidationResult> {
    return await invoke('validate_ase_cluster_configuration', { clusterId });
}



// --- ASE Discord Bridge ---
export async function saveAseDiscordBridgeConfig(config: DiscordBridgeConfig): Promise<void> {
    return await invoke('save_ase_discord_bridge_config', { config });
}

export async function getAseDiscordBridgeConfig(clusterId: number): Promise<DiscordBridgeConfig | null> {
    return await invoke('get_ase_discord_bridge_config', { clusterId });
}

export async function testAseDiscordBridgeConnection(botToken: string, channelId: string): Promise<boolean> {
    return await invoke('test_ase_discord_bridge_connection', { botToken, channelId });
}

export async function startAseDiscordBridge(): Promise<void> {
    return await invoke('start_ase_discord_bridge');
}

export async function stopAseDiscordBridge(): Promise<void> {
    return await invoke('stop_ase_discord_bridge');
}

export async function getAseDiscordRateLimitConfig(clusterId: number): Promise<{ max_messages: number; window_seconds: number }> {
    return await invoke('get_ase_discord_rate_limit_config', { clusterId });
}

export async function setAseDiscordRateLimitConfig(clusterId: number, maxMessages: number, windowSeconds: number): Promise<void> {
    return await invoke('set_ase_discord_rate_limit_config', { clusterId, maxMessages, windowSeconds });
}
