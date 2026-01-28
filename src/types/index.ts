// TypeScript types for the application

export type ServerType = 'ASA';

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'crashed' | 'updating' | 'restarting' | 'online';

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
    backupType: 'auto' | 'manual' | 'pre-update';
    filePath: string;
    size: number;
    createdAt: string;
    includesConfigs: boolean;
    includesMods: boolean;
    includesSaves: boolean;
    includesCluster: boolean;
    verified?: boolean;
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

