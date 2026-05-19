// TypeScript types for Server Organization System

export interface ServerFolder {
  id: number;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  parentFolderId?: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children?: ServerFolder[];
  serverIds?: number[];
}

export interface ServerArchive {
  id: number;
  serverId: number;
  archivedAt: string;
  archiveReason?: string;
  archivedBy?: string;
  notes?: string;
}

export interface ServerCustomization {
  serverId: number;
  displayName?: string;
  customIcon?: string;
  customBanner?: string;
  colorTag?: string;
  isPinned: boolean;
  pinOrder: number;
  isMinimized: boolean;
  tags: string[];
  favorite: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardLayout {
  id: number;
  userId: string;
  name: string;
  description?: string;
  layoutType: 'grid' | 'list' | 'compact' | 'custom';
  viewMode: 'expanded' | 'compact' | 'minimized';
  isDefault: boolean;
  sections: LayoutSection[];
  filters: Record<string, any>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  showInactive: boolean;
  showArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutSection {
  id: string;
  name: string;
  sectionType: 'folder' | 'group' | 'favorites' | 'recent' | 'status';
  visible: boolean;
  position: number;
  width?: number;
  height?: number;
  config: Record<string, any>;
}

export interface ServerGroup {
  id: number;
  name: string;
  description?: string;
  groupingType: 'custom' | 'map' | 'cluster' | 'status';
  criteria: Record<string, any>;
  sortOrder: number;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerTag {
  id: string;
  name: string;
  color: string;
}

export interface ServerActivityStats {
  serverId: number;
  totalUptimeMinutes: number;
  avgPlayerCount: number;
  peakPlayerCount: number;
  lastActivity: string;
  activityCount: number;
  crashCount: number;
  restartCount: number;
}

export interface DashboardStatistics {
  totalServers: number;
  activeServers: number;
  archivedServers: number;
  totalPlayers: number;
  totalUptimeHours: number;
  avgCpuUsage: number;
  avgRamUsage: number;
  serverCountByStatus: Record<string, number>;
  serverCountByMap: Record<string, number>;
}

export interface ServerFilter {
  searchQuery?: string;
  status?: string[];
  mapName?: string[];
  folderId?: number;
  groupId?: number;
  tags?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
}

export interface ServerSortOptions {
  sortBy: 'name' | 'status' | 'activity' | 'uptime' | 'players' | 'created_at' | 'last_started';
  sortOrder: 'asc' | 'desc';
}

export interface ServerOrganizationSnapshot {
  servers: EnhancedServerInfo[];
  folders: ServerFolder[];
  groups: ServerGroup[];
  statistics: DashboardStatistics;
  layouts: DashboardLayout[];
}

export interface EnhancedServerInfo {
  id: number;
  name: string;
  status: string;
  customization?: ServerCustomization;
  archiveInfo?: ServerArchive;
  activityStats?: ServerActivityStats;
  folderIds?: number[];
  groupIds?: number[];
  tags?: ServerTag[];
}

export interface BulkActionOptions {
  actionType: 'move' | 'archive' | 'delete' | 'enable' | 'disable' | 'tag' | 'color';
  serverIds: number[];
  actionData: Record<string, any>;
}

export interface ServerCardProps {
  serverId: number;
  name: string;
  status: string;
  customization?: ServerCustomization;
  isArchived?: boolean;
  isMinimized?: boolean;
  onPin?: (serverId: number) => void;
  onMinimize?: (serverId: number) => void;
  onFavorite?: (serverId: number) => void;
  onMove?: (serverId: number, folderId: number) => void;
  onArchive?: (serverId: number) => void;
  onRename?: (serverId: number, newName: string) => void;
  isDragging?: boolean;
  isDragSource?: boolean;
}

export interface DragItem {
  type: 'server' | 'folder';
  id: number;
  name: string;
  sourceId?: number;
}

export interface DragCollectedProps {
  isDragging: boolean;
  isDragSource: boolean;
}
