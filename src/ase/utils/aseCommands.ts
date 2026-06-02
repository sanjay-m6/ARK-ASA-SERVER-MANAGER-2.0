import { invoke } from '@tauri-apps/api/core';
import type {
    AseServer,
    AseInstalledMod,
    AseWorkshopMod,
    AseBackup,
    AseCluster,
    AseGameConfig,
    AseScheduledTask,
    ModValidationReport,
    AseSchedulerSettings,
    AseDiagnostics,
} from '../types/ase.types';

// ─── Server Commands ────────────────────────────────────────────────

export async function getAseServers(): Promise<AseServer[]> {
    return invoke('get_ase_servers');
}

export async function getAseServerById(serverId: number): Promise<AseServer> {
    return invoke('get_ase_server_by_id', { serverId });
}

export async function createAseServer(server: Partial<AseServer>): Promise<AseServer> {
    return invoke('create_ase_server', { server });
}

export async function deleteAseServer(serverId: number): Promise<void> {
    return invoke('delete_ase_server', { serverId });
}

export async function updateAseServer(serverId: number, updates: Partial<AseServer>): Promise<void> {
    return invoke('update_ase_server', { serverId, updates });
}

export async function updateAseServerInstall(serverId: number): Promise<void> {
    return invoke('update_ase_server_install', { serverId });
}

export async function installAseServer(
    name: string,
    installPath: string,
    mapName: string,
    gamePort: number,
    queryPort: number,
    rconPort: number,
    adminPassword: string,
    sessionName: string,
    branch?: string,
): Promise<AseServer> {
    return invoke('install_ase_server', {
        name,
        installPath,
        mapName,
        gamePort,
        queryPort,
        rconPort,
        adminPassword,
        sessionName,
        branch: branch || null,
    });
}

export async function startAseServer(serverId: number): Promise<void> {
    return invoke('start_ase_server', { serverId });
}

export async function stopAseServer(serverId: number): Promise<void> {
    return invoke('stop_ase_server', { serverId });
}

export async function getAseServerStatus(serverId: number): Promise<string> {
    return invoke('get_ase_server_status', { serverId });
}

// ─── Mod Commands ───────────────────────────────────────────────────

export async function searchWorkshop(query: string): Promise<AseWorkshopMod[]> {
    const rawResults = await invoke<any[]>('search_ase_workshop', { query });
    return rawResults.map(r => ({
        workshopId: r.workshopId,
        name: r.title, // Map backend 'title' to frontend 'name'
        description: r.description,
        fileSize: r.fileSize,
        lastUpdated: new Date(r.timeUpdated * 1000).toLocaleDateString(),
        subscriberCount: r.subscriptions,
        previewUrl: r.previewUrl,
        tags: [],
        isInstalled: false
    }));
}

export async function getAseWorkshopDetails(workshopIds: string[]): Promise<AseWorkshopMod[]> {
    const rawResults = await invoke<any[]>('get_ase_workshop_details', { workshopIds });
    return rawResults.map(r => ({
        workshopId: r.workshopId,
        name: r.title,
        description: r.description,
        fileSize: r.fileSize,
        lastUpdated: new Date(r.timeUpdated * 1000).toLocaleDateString(),
        subscriberCount: r.subscriptions,
        previewUrl: r.previewUrl,
        tags: r.tags || [],
        isInstalled: false
    }));
}

export async function downloadWorkshopMod(serverId: number, workshopId: string, modName: string): Promise<AseInstalledMod> {
    return invoke('download_ase_workshop_mod', { serverId, workshopId, modName });
}

export async function removeWorkshopMod(serverId: number, workshopId: string): Promise<void> {
    return invoke('remove_ase_workshop_mod', { serverId, workshopId });
}

export async function getInstalledAseMods(serverId: number): Promise<AseInstalledMod[]> {
    return invoke('get_installed_ase_mods', { serverId });
}

export async function toggleAseMod(serverId: number, workshopId: string, enabled: boolean): Promise<void> {
    return invoke('toggle_ase_mod', { serverId, workshopId, enabled });
}

export async function updateAseModOrder(serverId: number, workshopIds: string[]): Promise<void> {
    return invoke('update_ase_mod_order', { serverId, workshopIds });
}

// ─── Config Commands ────────────────────────────────────────────────

export async function readAseConfig(serverId: number): Promise<AseGameConfig> {
    return invoke('read_ase_config', { serverId });
}

export async function writeAseConfig(serverId: number, config: AseGameConfig): Promise<void> {
    return invoke('write_ase_config', { serverId, config });
}

export async function readAseIniRaw(serverId: number, filename: string): Promise<string> {
    return invoke('read_ase_ini_raw', { serverId, filename });
}

export async function writeAseIniRaw(serverId: number, filename: string, content: string): Promise<void> {
    return invoke('write_ase_ini_raw', { serverId, filename, content });
}

export async function createAseConfigBackup(serverId: number): Promise<string> {
    return invoke('create_ase_config_backup', { serverId });
}

export interface AseConfigBackupInfo {
    filename: string;
    sizeBytes: number;
    createdAt: string;
}

export async function listAseConfigBackups(serverId: number): Promise<AseConfigBackupInfo[]> {
    return invoke('list_ase_config_backups', { serverId });
}

export async function restoreAseConfigBackup(serverId: number, filename: string): Promise<void> {
    return invoke('restore_ase_config_backup', { serverId, filename });
}

// ─── Backup Commands ────────────────────────────────────────────────

export async function createAseBackup(serverId: number): Promise<AseBackup> {
    return invoke('create_ase_backup', { serverId });
}

export async function listAseBackups(serverId: number): Promise<AseBackup[]> {
    return invoke('list_ase_backups', { serverId });
}

export async function restoreAseBackup(backupId: number): Promise<void> {
    return invoke('restore_ase_backup', { backupId });
}

export async function deleteAseBackup(backupId: number): Promise<void> {
    return invoke('delete_ase_backup', { backupId });
}

// ─── Cluster Commands ───────────────────────────────────────────────

export async function createAseCluster(name: string, clusterDir: string): Promise<AseCluster> {
    return invoke('create_ase_cluster', { name, clusterDir });
}

export async function getAseClusters(): Promise<AseCluster[]> {
    return invoke('get_ase_clusters');
}

// ─── RCON Commands ──────────────────────────────────────────────────

export async function connectAseRcon(serverId: number): Promise<void> {
    return invoke('connect_ase_rcon', { serverId });
}

export async function sendAseRcon(serverId: number, command: string): Promise<string> {
    return invoke('send_ase_rcon', { serverId, command });
}

// ─── Scheduler Commands ─────────────────────────────────────────────

export async function getAseScheduledTasks(serverId: number): Promise<AseScheduledTask[]> {
    return invoke('get_ase_scheduled_tasks', { serverId });
}

export async function createAseScheduledTask(task: Partial<AseScheduledTask>): Promise<AseScheduledTask> {
    const id = await invoke<number>('create_ase_scheduled_task', { 
        serverId: task.serverId,
        taskType: task.taskType,
        cronExpr: task.cronExpr,
        enabled: task.enabled
    });
    return { ...task, id } as AseScheduledTask;
}

export async function toggleAseScheduledTask(taskId: number, enabled: boolean): Promise<void> {
    return invoke('toggle_ase_scheduled_task', { taskId, enabled });
}

export async function deleteAseScheduledTask(taskId: number): Promise<void> {
    return invoke('delete_ase_scheduled_task', { taskId });
}

export async function getAseSchedulerSettings(serverId: number): Promise<AseSchedulerSettings> {
    return invoke('get_ase_scheduler_settings', { serverId });
}

export async function saveAseSchedulerSettings(settings: AseSchedulerSettings): Promise<void> {
    return invoke('save_ase_scheduler_settings', { settings });
}

// ─── Tools / Parity Commands and Types ───────────────────────────────

export interface AsePluginInfo {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    enabled: boolean;
    source: 'uMod' | 'ArkApi';
}

export interface AseTribeLogEntry {
    timestamp: string;
    day: number;
    eventType: string;
    message: string;
    rawLine: string;
}

export interface AseTribeLogResult {
    serverName: string;
    entries: AseTribeLogEntry[];
    totalParsed: number;
    totalLines: number;
}

export interface AseUPnPGatewayInfo {
    gatewayAddress: string;
    externalIp: string;
    available: boolean;
}

export interface AsePortMappingResult {
    port: number;
    protocol: string;
    success: boolean;
    error?: string;
}

export interface AseUPnPForwardResult {
    gateway: AseUPnPGatewayInfo;
    mappings: AsePortMappingResult[];
    allSuccess: boolean;
}

export async function checkAseApiInstalled(serverId: number): Promise<boolean> {
    return invoke('check_ase_api_installed', { serverId });
}

export async function getInstalledAsePlugins(serverId: number): Promise<AsePluginInfo[]> {
    return invoke('get_installed_ase_plugins', { serverId });
}

export async function getAseTribeLogs(serverId: number, limit?: number): Promise<AseTribeLogResult> {
    return invoke('get_ase_tribe_logs', { serverId, limit });
}

export async function discoverAseUPnPGateway(): Promise<AseUPnPGatewayInfo> {
    return invoke('discover_ase_upnp_gateway');
}

export async function forwardAseServerPorts(serverId: number, leaseDuration?: number): Promise<AseUPnPForwardResult> {
    return invoke('forward_ase_server_ports', { serverId, leaseDuration });
}

export async function removeAseServerPortForwards(serverId: number): Promise<AsePortMappingResult[]> {
    return invoke('remove_ase_server_port_forwards', { serverId });
}

// ─── Mod Recovery Commands ──────────────────────────────────────────

export async function validateAseMod(serverId: number, workshopId: string): Promise<ModValidationReport> {
    return invoke('validate_ase_mod', { serverId, workshopId });
}

export async function repairAseMod(serverId: number, workshopId: string): Promise<ModValidationReport> {
    return invoke('repair_ase_mod', { serverId, workshopId });
}

export async function forceReinstallAseMod(serverId: number, workshopId: string): Promise<AseInstalledMod> {
    return invoke('force_reinstall_ase_mod', { serverId, workshopId });
}

export async function forceDownloadAseMod(serverId: number, workshopId: string): Promise<AseInstalledMod> {
    return invoke('force_download_ase_mod', { serverId, workshopId });
}

export async function getAseLaunchArguments(serverId: number): Promise<string[]> {
    return invoke('get_ase_launch_arguments', { serverId });
}

export async function syncAseServerFromIni(serverId: number): Promise<void> {
    return invoke('sync_ase_server_from_ini', { serverId });
}

export async function getAseConfigDiagnostics(serverId: number): Promise<AseDiagnostics> {
    return invoke('get_ase_config_diagnostics', { serverId });
}

