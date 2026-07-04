// TypeScript types for the application

export type ServerType = 'ASA' | 'ASE';

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'crashed' | 'updating' | 'restarting' | 'online' | 'repairing' | 'startup_timeout';

export interface ServerStartupProgressEvent {
    server_id: number;
    elapsed_seconds: number;
    startup_confirmed: boolean;
}

export interface Server {
    id: number;
    name: string;
    serverType: ServerType;
    installPath: string;
    status: ServerStatus;
    config: ServerConfig;
    ports: ServerPorts;
    ipAddress?: string;
    createdAt: string;
    lastStarted?: string;
    reachability?: 'Public' | 'LAN' | 'Unknown';
    autoStart?: boolean;
    autoStop?: boolean;
    intelligentMode?: boolean;
    startupDelay?: number;
    startupPriority?: number;
}

export interface ServerPorts {
    gamePort: number;
    queryPort: number;
    rconPort: number;
}

export interface ServerConfig {
    maxPlayers: number;
    serverPassword?: string;
    adminPassword: string;
    mapName: string;
    sessionName: string;
    motd?: string;
    custom_args?: string;

    // Structure & Events
    structure_damage_multiplier?: number;
    structure_resistance_multiplier?: number;
    structure_decay_multiplier?: number;
    override_structure_platform_prevention?: boolean;
    global_item_stack_size_multiplier?: number;
    custom_resource_harvesting_multiplier?: number;

    // Advanced
    xp_multiplier?: number;
    harvest_amount_multiplier?: number;
    taming_speed_multiplier?: number;
    pve_mode?: boolean;
    allow_tek_suit_powers_in_genesis?: boolean;
}

export interface SystemInfo {
    cpuUsage: number;
    ramUsage: number;
    ramTotal: number;
    diskUsage: number;
    diskTotal: number;
}

export interface PerformanceMetrics {
    serverId: number;
    cpuUsage: number;
    memoryUsage: number;
    playerCount: number;
    uptime: number;
    timestamp: string;
}

export interface ModInfo {
    id: string;
    name: string;
    version?: string;
    author?: string;
    description?: string;
    thumbnailUrl?: string;
    downloads?: string;
    compatible?: boolean;
    workshopUrl?: string; // Legacy steam
    curseforge_url?: string; // New ASA
    serverType?: ServerType;
    enabled?: boolean;
    loadOrder?: number;
}

export interface Backup {
    id: number;
    serverId: number;
    backupType: 'auto' | 'manual' | 'pre-update' | 'pre-restart';
    filePath: string;
    size: number;
    createdAt: string;
    includesConfigs: boolean;
    includesMods: boolean;
    includesSaves: boolean;
    includesCluster: boolean;
    verified?: boolean;
    label?: string;
    notes?: string;
    isProtected?: boolean;
    status?: string;
    hash?: string;
}

export interface BackupPolicy {
    serverId: number;
    enabled: boolean;
    intervalHours: number;
    retentionDays: number;
    retentionCount: number;
    storageQuotaGb: number;
    backupBeforeUpdate: boolean;
    backupBeforeRestart: boolean;
    compressionEnabled: boolean;
    cloudSyncEnabled: boolean;
    discordWebhook?: string;
}


export interface Cluster {
    id: number;
    name: string;
    serverIds: number[];
    clusterPath: string;
    createdAt: string;
}

export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'debug';
    message: string;
    source?: string;
}

export interface ConfigTemplate {
    id: string;
    name: string;
    description: string;
    gameMode: 'PvE' | 'PvP' | 'RP' | 'Hardcore' | 'Beginner' | 'No-Meta';
    settings: Record<string, any>;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface PlayerStats {
    steamId: string;
    displayName: string;
    firstSeen: string;
    lastSeen: string;
    totalPlaytimeMinutes: number;
    totalSessions: number;
    notes?: string;
    isWhitelisted: boolean;
    isBanned: boolean;
}

export interface PlayerSession {
    id: number;
    serverId: number;
    steamId: string;
    playerName: string;
    joinedAt: string;
    leftAt?: string;
}

export interface ClusterStatus {
    clusterId: number;
    clusterName: string;
    totalServers: number;
    runningServers: number;
    totalPlayers: number;
    serverStatuses: ServerStatusInfo[];
}

export interface ServerStatusInfo {
    serverId: number;
    serverName: string;
    status: ServerStatus;
    playerCount: number;
}

export interface PluginInfo {
    id: string;
    name: string;
    version?: string;
    description?: string;
    author?: string;
    asaVersionCompatible?: string;
    enabled: boolean;
    installPath: string;
}

export interface AseInstalledMod {
    id: number;
    serverId: number;
    workshopId: string;
    name: string;
    version: string;
    installedAt: string;
    enabled: boolean;
    loadOrder: number;
    description?: string;
    author?: string;
    previewUrl?: string;
    cachedImageUrl?: string;
    workshopUrl?: string;
    subscribers?: number;
    fileSize?: number;
    timeUpdated?: number;
    timeCreated?: number;
    tags?: string[];
    modStatus?: string;
    downloadStatus?: string;
    healthStatus?: string;
    dependencies?: string[];
}

export interface WorkshopSearchResult {
    workshopId: string;
    title: string;
    description: string;
    previewUrl: string;
    subscriptions: number;
    fileSize: number;
    timeUpdated: number;
    author: string;
    workshopUrl: string;
    tags: string[];
}

export interface ModValidationReport {
    workshopId: string;
    isValid: boolean;
    issues: string[];
    fileCount: number;
    totalSize: number;
    modDir: string;
    hasUcas: boolean;
    hasUtoc: boolean;
    hasModFile: boolean;
    hasModInfo: boolean;
    hasModmetaInfo: boolean;
    hasAssets: boolean;
    hasActiveModsEntry: boolean;
    hasUnextractedZ: boolean;
}

