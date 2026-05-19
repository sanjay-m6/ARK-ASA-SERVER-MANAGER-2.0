// Tauri backend integration utilities for server organization

import { invoke } from '@tauri-apps/api/core';
import type {
  ServerFolder,
  ServerArchive,
  ServerCustomization,
  DashboardLayout,
  ServerGroup,
  ServerActivityStats,
  DashboardStatistics,
} from '../types/server-organization';

// ============================================================================
// Folder Management
// ============================================================================

export async function createServerFolder(request: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parentFolderId?: number;
}): Promise<ServerFolder> {
  return await invoke('plugin:server-org|create_folder', { request });
}

export async function getAllFolders(): Promise<ServerFolder[]> {
  return await invoke('plugin:server-org|get_all_folders');
}

export async function getFolderHierarchy(folderId: number): Promise<ServerFolder> {
  return await invoke('plugin:server-org|get_folder_hierarchy', { folderId });
}

export async function updateServerFolder(
  folderId: number,
  updates: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
  }
): Promise<void> {
  return await invoke('plugin:server-org|update_folder', {
    folderId,
    ...updates,
  });
}

export async function deleteServerFolder(folderId: number): Promise<void> {
  return await invoke('plugin:server-org|delete_folder', { folderId });
}

export async function addServerToFolder(serverId: number, folderId: number): Promise<void> {
  return await invoke('plugin:server-org|add_server_to_folder', {
    serverId,
    folderId,
  });
}

export async function removeServerFromFolder(serverId: number, folderId: number): Promise<void> {
  return await invoke('plugin:server-org|remove_server_from_folder', {
    serverId,
    folderId,
  });
}

export async function getServerFolders(serverId: number): Promise<ServerFolder[]> {
  return await invoke('plugin:server-org|get_server_folders', { serverId });
}

// ============================================================================
// Archive Management
// ============================================================================

export async function archiveServer(
  serverId: number,
  reason?: string,
  notes?: string
): Promise<ServerArchive> {
  return await invoke('plugin:server-org|archive_server', {
    serverId,
    reason,
    notes,
  });
}

export async function restoreServer(serverId: number): Promise<void> {
  return await invoke('plugin:server-org|restore_server', { serverId });
}

export async function isServerArchived(serverId: number): Promise<boolean> {
  return await invoke('plugin:server-org|is_server_archived', { serverId });
}

export async function getArchivedServers(): Promise<ServerArchive[]> {
  return await invoke('plugin:server-org|get_archived_servers');
}

// ============================================================================
// Server Customization
// ============================================================================

export async function updateServerCustomization(request: {
  serverId: number;
  displayName?: string;
  customIcon?: string;
  customBanner?: string;
  colorTag?: string;
  isPinned?: boolean;
  tags?: string[];
  favorite?: boolean;
  notes?: string;
}): Promise<ServerCustomization> {
  return await invoke('plugin:server-org|update_server_customization', { request });
}

export async function getServerCustomization(serverId: number): Promise<ServerCustomization | null> {
  return await invoke('plugin:server-org|get_server_customization', { serverId });
}

// ============================================================================
// Dashboard Layouts
// ============================================================================

export async function createDashboardLayout(
  userId: string,
  request: {
    name: string;
    description?: string;
    layoutType?: string;
    viewMode?: string;
    sections?: any[];
    filters?: Record<string, any>;
    sortBy?: string;
    sortOrder?: string;
    showInactive?: boolean;
    showArchived?: boolean;
  }
): Promise<DashboardLayout> {
  return await invoke('plugin:server-org|create_dashboard_layout', {
    userId,
    request,
  });
}

export async function getUserDashboardLayouts(userId: string): Promise<DashboardLayout[]> {
  return await invoke('plugin:server-org|get_user_layouts', { userId });
}

export async function deleteDashboardLayout(layoutId: number): Promise<void> {
  return await invoke('plugin:server-org|delete_layout', { layoutId });
}

// ============================================================================
// Server Groups
// ============================================================================

export async function createServerGroup(request: {
  name: string;
  description?: string;
  groupingType?: string;
  criteria?: Record<string, any>;
  color?: string;
}): Promise<ServerGroup> {
  return await invoke('plugin:server-org|create_server_group', { request });
}

export async function getAllServerGroups(): Promise<ServerGroup[]> {
  return await invoke('plugin:server-org|get_all_server_groups');
}

// ============================================================================
// Activity Logging and Statistics
// ============================================================================

export async function logServerActivity(
  serverId: number,
  activityType: string,
  playerCount?: number,
  uptimeSeconds?: number,
  cpuUsage?: number,
  ramUsage?: number,
  description?: string
): Promise<void> {
  return await invoke('plugin:server-org|log_server_activity', {
    serverId,
    activityType,
    playerCount,
    uptimeSeconds,
    cpuUsage,
    ramUsage,
    description,
  });
}

export async function getServerActivityStats(serverId: number): Promise<ServerActivityStats | null> {
  return await invoke('plugin:server-org|get_server_activity_stats', { serverId });
}

export async function getDashboardStatistics(): Promise<DashboardStatistics> {
  return await invoke('plugin:server-org|get_dashboard_statistics');
}

// ============================================================================
// Bulk Operations
// ============================================================================

export async function bulkMoveServers(serverIds: number[], targetFolderId: number): Promise<void> {
  return await invoke('plugin:server-org|bulk_move_servers', {
    serverIds,
    targetFolderId,
  });
}

export async function bulkArchiveServers(serverIds: number[], reason?: string): Promise<void> {
  return await invoke('plugin:server-org|bulk_archive_servers', {
    serverIds,
    reason,
  });
}

export async function bulkTagServers(serverIds: number[], tags: string[]): Promise<void> {
  return await invoke('plugin:server-org|bulk_tag_servers', {
    serverIds,
    tags,
  });
}

export async function bulkColorServers(serverIds: number[], color: string): Promise<void> {
  return await invoke('plugin:server-org|bulk_color_servers', {
    serverIds,
    color,
  });
}

// ============================================================================
// Search and Filtering
// ============================================================================

export async function searchServers(query: string, filters?: any): Promise<any[]> {
  return await invoke('plugin:server-org|search_servers', {
    query,
    filters,
  });
}

export async function getServersByStatus(status: string): Promise<any[]> {
  return await invoke('plugin:server-org|get_servers_by_status', { status });
}

export async function getServersByMap(mapName: string): Promise<any[]> {
  return await invoke('plugin:server-org|get_servers_by_map', { mapName });
}

export async function getServersByGroup(groupId: number): Promise<any[]> {
  return await invoke('plugin:server-org|get_servers_by_group', { groupId });
}

export async function getServersByTag(tag: string): Promise<any[]> {
  return await invoke('plugin:server-org|get_servers_by_tag', { tag });
}

export async function getActiveServers(): Promise<any[]> {
  return await invoke('plugin:server-org|get_active_servers');
}

export async function getInactiveServers(): Promise<any[]> {
  return await invoke('plugin:server-org|get_inactive_servers');
}

// ============================================================================
// Advanced Organization
// ============================================================================

export async function getOrganizationSnapshot(): Promise<any> {
  return await invoke('plugin:server-org|get_organization_snapshot');
}

export async function exportServerOrganization(): Promise<string> {
  return await invoke('plugin:server-org|export_server_organization');
}

export async function importServerOrganization(data: string): Promise<void> {
  return await invoke('plugin:server-org|import_server_organization', { data });
}

export async function reorderServers(
  serverIds: number[],
  folderId?: number
): Promise<void> {
  return await invoke('plugin:server-org|reorder_servers', {
    serverIds,
    folderId,
  });
}

export async function assignServerPriority(serverId: number, priority: number): Promise<void> {
  return await invoke('plugin:server-org|assign_server_priority', {
    serverId,
    priority,
  });
}

export async function autoArchiveInactiveServers(inactiveDays: number): Promise<number> {
  return await invoke('plugin:server-org|auto_archive_inactive_servers', {
    inactiveDays,
  });
}

export async function getServerComparisonStats(
  serverId1: number,
  serverId2: number
): Promise<any> {
  return await invoke('plugin:server-org|get_server_comparison_stats', {
    serverId1,
    serverId2,
  });
}

// ============================================================================
// Error Handling Wrapper
// ============================================================================

export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    console.error('Server organization API error:', error);
    return fallback;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

export function groupServersByStatus(servers: any[]): Record<string, any[]> {
  return servers.reduce((acc, server) => {
    if (!acc[server.status]) {
      acc[server.status] = [];
    }
    acc[server.status].push(server);
    return acc;
  }, {} as Record<string, any[]>);
}

export function groupServersByMap(servers: any[]): Record<string, any[]> {
  return servers.reduce((acc, server) => {
    const map = server.config?.mapName || 'Unknown';
    if (!acc[map]) {
      acc[map] = [];
    }
    acc[map].push(server);
    return acc;
  }, {} as Record<string, any[]>);
}

export function calculateServerHealth(server: any): {
  health: number;
  status: 'healthy' | 'warning' | 'critical';
} {
  let health = 100;

  if (server.status !== 'online' && server.status !== 'running') {
    health -= 50;
  }

  // Add more health metrics as needed
  const status = health >= 80 ? 'healthy' : health >= 50 ? 'warning' : 'critical';

  return { health, status };
}

export function formatServerMetrics(server: any): {
  uptime: string;
  players: string;
  load: string;
} {
  return {
    uptime: 'N/A',
    players: `0/${server.config?.maxPlayers || 0}`,
    load: 'N/A',
  };
}
