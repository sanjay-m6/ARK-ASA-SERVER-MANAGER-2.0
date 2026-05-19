// Auto-Save Management API Utilities
// Tauri IPC wrappers for all backend operations

import { invoke } from '@tauri-apps/api/core';
import {
  AutoSave,
  AutoSaveRequest,
  SaveFolder,
  SaveFolderRequest,
  SaveRestoreHistory,
  RestoreRequest,
  SaveValidationResult,
  RestorePoint,
  CreateRestorePointRequest,
  SaveStatistics,
  SaveHealthStatus,
  AutosavePreferences,
  UpdatePreferencesRequest,
  TimelineEvent,
  BulkOperationResult,
  SaveSearchFilter,
} from '@/types/autosave';

// ============================================================================
// Error Handling Wrapper
// ============================================================================

async function withErrorHandling<T>(
  promise: Promise<T>,
  fallback?: T
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error('Auto-save API error:', error);
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

// ============================================================================
// Auto-Save Registration and Management
// ============================================================================

export async function registerAutoSave(
  request: AutoSaveRequest
): Promise<AutoSave> {
  return withErrorHandling(
    invoke('register_auto_save', { request })
  );
}

export async function getAutoSave(saveId: number): Promise<AutoSave> {
  return withErrorHandling(
    invoke('get_auto_save', { saveId })
  );
}

export async function listSavesForServer(
  serverId: number,
  limit: number = 100,
  offset: number = 0
): Promise<AutoSave[]> {
  return withErrorHandling(
    invoke('list_saves_for_server', {
      serverId,
      limit,
      offset,
    }),
    []
  );
}

export async function searchSaves(
  filter: SaveSearchFilter
): Promise<AutoSave[]> {
  return withErrorHandling(
    invoke('search_saves', { filter }),
    []
  );
}

export async function updateSaveLabel(
  saveId: number,
  label: string
): Promise<void> {
  return withErrorHandling(
    invoke('update_save_label', { saveId, label })
  );
}

export async function updateSaveNotes(
  saveId: number,
  notes: string
): Promise<void> {
  return withErrorHandling(
    invoke('update_save_notes', { saveId, notes })
  );
}

// ============================================================================
// Save Protection and Organization
// ============================================================================

export async function toggleSaveProtection(
  saveId: number,
  isProtected: boolean
): Promise<void> {
  return withErrorHandling(
    invoke('toggle_save_protection', {
      saveId,
      isProtected,
    })
  );
}

export async function toggleFavorite(
  saveId: number,
  isFavorite: boolean
): Promise<void> {
  return withErrorHandling(
    invoke('toggle_favorite', { saveId, isFavorite })
  );
}

export async function moveSaveToFolder(
  saveId: number,
  folderId?: number
): Promise<void> {
  return withErrorHandling(
    invoke('move_save_to_folder', { saveId, folderId })
  );
}

export async function deleteSave(saveId: number): Promise<void> {
  return withErrorHandling(
    invoke('delete_save', { saveId })
  );
}

export async function deleteOldSaves(
  serverId: number,
  daysOld: number,
  keepMinimum: number
): Promise<number> {
  return withErrorHandling(
    invoke('delete_old_saves', {
      serverId,
      daysOld,
      keepMinimum,
    }),
    0
  );
}

// ============================================================================
// Save Folders
// ============================================================================

export async function createSaveFolder(
  request: SaveFolderRequest
): Promise<SaveFolder> {
  return withErrorHandling(
    invoke('create_save_folder', { request })
  );
}

export async function getSaveFolders(): Promise<SaveFolder[]> {
  return withErrorHandling(
    invoke('get_save_folders'),
    []
  );
}

export async function updateSaveFolder(
  folderId: number,
  request: SaveFolderRequest
): Promise<SaveFolder> {
  return withErrorHandling(
    invoke('update_save_folder', { folderId, request })
  );
}

export async function deleteSaveFolder(folderId: number): Promise<void> {
  return withErrorHandling(
    invoke('delete_save_folder', { folderId })
  );
}

// ============================================================================
// Save Validation
// ============================================================================

export async function validateSaveFile(
  saveId: number,
  filePath: string
): Promise<SaveValidationResult> {
  return withErrorHandling(
    invoke('validate_save_file', { saveId, filePath })
  );
}

export async function validateAllSaves(
  serverId: number
): Promise<Record<number, SaveValidationResult>> {
  return withErrorHandling(
    invoke('validate_all_saves', { serverId }),
    {}
  );
}

export async function getValidationLogs(
  saveId: number
): Promise<Array<{ checkType: string; checkStatus: string; checkedAt: string }>> {
  return withErrorHandling(
    invoke('get_validation_logs', { saveId }),
    []
  );
}

// ============================================================================
// Save Restoration
// ============================================================================

export async function restoreSave(
  request: RestoreRequest
): Promise<{ restoreId: number; backupPath: string }> {
  return withErrorHandling(
    invoke('restore_save', { request })
  );
}

export async function getRestoreProgress(
  restoreId: number
): Promise<{
  progressPercent: number;
  currentStage: string;
  elapsedSeconds: number;
}> {
  return withErrorHandling(
    invoke('get_restore_progress', { restoreId }),
    {
      progressPercent: 0,
      currentStage: 'initializing',
      elapsedSeconds: 0,
    }
  );
}

export async function getRestoreHistory(
  serverId: number,
  limit: number = 50
): Promise<SaveRestoreHistory[]> {
  return withErrorHandling(
    invoke('get_restore_history', { serverId, limit }),
    []
  );
}

export async function getRestoreBackups(
  serverId: number
): Promise<Array<{ id: number; backupPath: string; createdAt: string }>> {
  return withErrorHandling(
    invoke('get_restore_backups', { serverId }),
    []
  );
}

// ============================================================================
// Restore Points
// ============================================================================

export async function createRestorePoint(
  request: CreateRestorePointRequest
): Promise<RestorePoint> {
  return withErrorHandling(
    invoke('create_restore_point', { request })
  );
}

export async function getRestorePoints(
  serverId: number
): Promise<RestorePoint[]> {
  return withErrorHandling(
    invoke('get_restore_points', { serverId }),
    []
  );
}

export async function deleteRestorePoint(pointId: number): Promise<void> {
  return withErrorHandling(
    invoke('delete_restore_point', { pointId })
  );
}

// ============================================================================
// Statistics and Health
// ============================================================================

export async function getSaveStatistics(
  serverId: number
): Promise<SaveStatistics | null> {
  return withErrorHandling(
    invoke('get_save_statistics', { serverId }),
    null
  );
}

export async function getSaveHealthStatus(
  serverId: number
): Promise<SaveHealthStatus | null> {
  return withErrorHandling(
    invoke('get_save_health_status', { serverId }),
    null
  );
}

// ============================================================================
// Preferences
// ============================================================================

export async function getPreferences(
  serverId: number
): Promise<AutosavePreferences> {
  return withErrorHandling(
    invoke('get_preferences', { serverId })
  );
}

export async function updatePreferences(
  request: UpdatePreferencesRequest
): Promise<AutosavePreferences> {
  return withErrorHandling(
    invoke('update_preferences', { request })
  );
}

// ============================================================================
// Timeline System
// ============================================================================

export async function getTimelineEvents(
  serverId: number,
  limit: number = 100
): Promise<TimelineEvent[]> {
  return withErrorHandling(
    invoke('get_timeline_events', { serverId, limit }),
    []
  );
}

export async function createTimelineEvent(
  serverId: number,
  eventType: string,
  description: string,
  saveId?: number,
  importanceLevel: string = 'normal'
): Promise<TimelineEvent> {
  return withErrorHandling(
    invoke('create_timeline_event', {
      serverId,
      eventType,
      description,
      saveId,
      importanceLevel,
    })
  );
}

// ============================================================================
// Bulk Operations
// ============================================================================

export async function bulkDeleteSaves(
  saveIds: number[]
): Promise<BulkOperationResult> {
  return withErrorHandling(
    invoke('bulk_delete_saves', { saveIds })
  );
}

export async function bulkProtectSaves(
  saveIds: number[],
  isProtected: boolean
): Promise<BulkOperationResult> {
  return withErrorHandling(
    invoke('bulk_protect_saves', { saveIds, isProtected })
  );
}

export async function bulkMoveSaves(
  saveIds: number[],
  folderId?: number
): Promise<BulkOperationResult> {
  return withErrorHandling(
    invoke('bulk_move_saves', { saveIds, folderId })
  );
}

export async function bulkCompressSaves(
  saveIds: number[],
  compressionLevel: number = 6
): Promise<BulkOperationResult> {
  return withErrorHandling(
    invoke('bulk_compress_saves', {
      saveIds,
      compressionLevel,
    })
  );
}

// ============================================================================
// Search and Filtering Utilities
// ============================================================================

export async function getAvailableMaps(
  serverId: number
): Promise<string[]> {
  return withErrorHandling(
    invoke('get_available_maps', { serverId }),
    []
  );
}

export async function getUniqueServerVersions(
  serverId: number
): Promise<string[]> {
  return withErrorHandling(
    invoke('get_unique_server_versions', { serverId }),
    []
  );
}

// ============================================================================
// Cloud Synchronization
// ============================================================================

export async function syncSaveToCloud(
  saveId: number,
  cloudProvider: string
): Promise<void> {
  return withErrorHandling(
    invoke('sync_save_to_cloud', { saveId, cloudProvider })
  );
}

export async function restoreFromCloud(
  serverId: number,
  cloudPath: string
): Promise<AutoSave> {
  return withErrorHandling(
    invoke('restore_from_cloud', { serverId, cloudPath })
  );
}

// ============================================================================
// Batch Loading Utilities
// ============================================================================

export async function loadServerAutoSaveData(
  serverId: number
): Promise<{
  saves: AutoSave[];
  statistics: SaveStatistics | null;
  healthStatus: SaveHealthStatus | null;
  preferences: AutosavePreferences | null;
  restoreHistory: SaveRestoreHistory[];
  restorePoints: RestorePoint[];
  timelineEvents: TimelineEvent[];
  folders: SaveFolder[];
}> {
  return withErrorHandling(
    invoke('load_server_data', { serverId }),
    {
      saves: [],
      statistics: null,
      healthStatus: null,
      preferences: null,
      restoreHistory: [],
      restorePoints: [],
      timelineEvents: [],
      folders: [],
    }
  );
}

// ============================================================================
// Export and Archive Utilities
// ============================================================================

export async function exportSaves(
  saveIds: number[],
  exportPath: string
): Promise<{ exportedCount: number; totalSize: number }> {
  return withErrorHandling(
    invoke('export_saves', { saveIds, exportPath }),
    { exportedCount: 0, totalSize: 0 }
  );
}

export async function importSaves(
  serverId: number,
  importPath: string
): Promise<{ importedCount: number; failureCount: number }> {
  return withErrorHandling(
    invoke('import_saves', { serverId, importPath }),
    { importedCount: 0, failureCount: 0 }
  );
}

// ============================================================================
// Formatting Utilities
// ============================================================================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return formatDate(dateString);
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function calculateHealthScore(
  _stats: SaveStatistics | null,
  healthStatus: SaveHealthStatus | null
): number {
  if (!healthStatus) return 50;
  return Math.round(healthStatus.healthScore);
}

// ============================================================================
// State Synchronization
// ============================================================================

export async function syncAutoSaveState(
  store: any,
  serverId: number
): Promise<void> {
  try {
    const data = await loadServerAutoSaveData(serverId);
    store.setSaves(data.saves);
    store.setFolders(data.folders);
    store.setStatistics(data.statistics);
    store.setHealthStatus(data.healthStatus);
    store.setPreferences(data.preferences);
    store.setRestoreHistory(data.restoreHistory);
    store.setRestorePoints(data.restorePoints);
    store.setTimelineEvents(data.timelineEvents);
  } catch (error) {
    console.error('Failed to sync auto-save state:', error);
    throw error;
  }
}

// ============================================================================
// Polling Utilities
// ============================================================================

export function createAutoSavePoller(
  serverId: number,
  store: any,
  intervalMs: number = 5000
): () => void {
  let isActive = true;

  const poll = async () => {
    while (isActive) {
      try {
        await syncAutoSaveState(store, serverId);
      } catch (error) {
        console.error('Poll error:', error);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  poll();

  return () => {
    isActive = false;
  };
}
