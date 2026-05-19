// Auto-Save Management System - TypeScript Type Definitions

// ============================================================================
// Core Auto-Save Types
// ============================================================================

export interface AutoSave {
  id: number;
  serverId: number;
  fileName: string;
  filePath: string;
  fileSize: number;
  checksum?: string;
  createdAt: string;
  saveTimestamp?: string;
  isValid: boolean;
  isCorrupted: boolean;
  corruptionReason?: string;
  playerCount?: number;
  uptimeSeconds?: number;
  serverVersion?: string;
  modCount?: number;
  mapName?: string;
  isProtected: boolean;
  customLabel?: string;
  notes?: string;
  isFavorite: boolean;
  folderId?: number;
  createdBy?: string;
  indexedAt: string;
  updatedAt: string;
}

export interface AutoSaveRequest {
  serverId: number;
  fileName: string;
  filePath: string;
  fileSize: number;
  playerCount?: number;
  uptimeSeconds?: number;
  serverVersion?: string;
  modCount?: number;
  mapName?: string;
}

// ============================================================================
// Save Folder Types
// ============================================================================

export interface SaveFolder {
  id: number;
  name: string;
  description?: string;
  color: string;
  parentFolderId?: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children?: SaveFolder[];
  saveCount?: number;
}

export interface SaveFolderRequest {
  name: string;
  description?: string;
  color?: string;
  parentFolderId?: number;
}

// ============================================================================
// Save Restore Types
// ============================================================================

export interface SaveRestoreHistory {
  id: number;
  serverId: number;
  fromSaveId?: number;
  toSaveId: number;
  restoredAt: string;
  restoredBy?: string;
  restoreDurationSeconds?: number;
  restoreMethod: string; // manual, automatic, scheduled, emergency
  success: boolean;
  errorMessage?: string;
  notes?: string;
}

export interface RestoreRequest {
  serverId: number;
  saveId: number;
  createBackup: boolean;
  restoreMethod: string;
  skipRestart?: boolean;
}

export interface SaveBackupSnapshot {
  id: number;
  serverId: number;
  restoreHistoryId?: number;
  backupPath: string;
  backupSize: number;
  createdAt: string;
  isValid: boolean;
}

// ============================================================================
// Save Metadata Types
// ============================================================================

export interface SaveMetadata {
  id: number;
  autoSaveId: number;
  gameMode?: string;
  difficultyLevel?: string;
  maxPlayers?: number;
  currentPlayersList: string[];
  modsList: ModInfo[];
  serverSettings: Record<string, any>;
  worldStatistics: Record<string, any>;
  creaturesCount?: number;
  structuresCount?: number;
  itemsCount?: number;
  parsedAt: string;
}

export interface ModInfo {
  name: string;
  version?: string;
  modId?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface SaveValidationLog {
  id: number;
  autoSaveId: number;
  checkType: string; // integrity, corruption, completeness, compatibility
  checkStatus: string; // passed, failed, warning, skipped
  details: Record<string, string>;
  checkedAt: string;
}

export interface SaveValidationResult {
  isValid: boolean;
  isCorrupted: boolean;
  corruptionReason?: string;
  warnings: string[];
  errors: string[];
  fileSizeOk: boolean;
  checksumOk?: boolean;
  compatible: boolean;
}

// ============================================================================
// Restore Points Types
// ============================================================================

export interface RestorePoint {
  id: number;
  serverId: number;
  autoSaveId: number;
  pointName: string;
  description?: string;
  pointType: string; // manual, scheduled, critical, post-crash
  createdAt: string;
  isProtected: boolean;
  createdBy?: string;
}

export interface CreateRestorePointRequest {
  serverId: number;
  saveId: number;
  pointName: string;
  description?: string;
  pointType?: string;
}

// ============================================================================
// Save Comparison Types
// ============================================================================

export interface SaveComparison {
  saveId1: number;
  saveId2: number;
  sizeDifference: number;
  timestampDifferenceSeconds: number;
  playerCountDifference: number;
  uptimeDifferenceSeconds: number;
  modChanges: ModChanges;
  settingChanges: SettingChange[];
  hasCorruptionChange: boolean;
}

export interface ModChanges {
  addedMods: string[];
  removedMods: string[];
  updatedMods: ModUpdate[];
}

export interface ModUpdate {
  modName: string;
  oldVersion: string;
  newVersion: string;
}

export interface SettingChange {
  settingName: string;
  oldValue: string;
  newValue: string;
}

// ============================================================================
// Timeline Types
// ============================================================================

export interface TimelineEvent {
  id: number;
  serverId: number;
  eventType: string; // save_created, restored, protected, deleted, validated
  autoSaveId?: number;
  restoreHistoryId?: number;
  eventTime: string;
  description: string;
  metadata: Record<string, string>;
  importanceLevel: string; // low, normal, high, critical
  createdAt: string;
}

export interface TimelineResponse {
  events: TimelineEvent[];
  totalEvents: number;
  serverId: number;
}

// ============================================================================
// Archive and Compression Types
// ============================================================================

export interface SaveArchive {
  id: number;
  serverId: number;
  archivePath: string;
  archiveSize: number;
  saveIds: number[];
  createdAt: string;
  isVerified: boolean;
  lastAccessed?: string;
}

export interface CompressionRequest {
  serverId: number;
  saveIds: number[];
  compressionLevel?: number;
}

// ============================================================================
// Cloud Sync Types
// ============================================================================

export interface SaveCloudSync {
  id: number;
  autoSaveId: number;
  cloudPath?: string;
  syncStatus: string; // pending, syncing, synced, failed
  lastSyncAt?: string;
  syncError?: string;
  cloudVersion?: string;
}

// ============================================================================
// Preferences Types
// ============================================================================

export interface AutosavePreferences {
  id: number;
  serverId: number;
  autoIndexEnabled: boolean;
  autoValidateEnabled: boolean;
  autoCompressOldSaves: boolean;
  compressAfterDays: number;
  autoCleanupEnabled: boolean;
  cleanupAfterDays: number;
  keepMinimumSaves: number;
  createRestorePoints: boolean;
  restorePointFrequency: string; // hourly, daily, weekly, manual
  notifyOnRestore: boolean;
  notifyOnCorruption: boolean;
  indexMetadata: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePreferencesRequest {
  serverId: number;
  autoIndexEnabled?: boolean;
  autoValidateEnabled?: boolean;
  autoCompressOldSaves?: boolean;
  compressAfterDays?: number;
  autoCleanupEnabled?: boolean;
  cleanupAfterDays?: number;
  keepMinimumSaves?: number;
  createRestorePoints?: boolean;
  restorePointFrequency?: string;
  notifyOnRestore?: boolean;
  notifyOnCorruption?: boolean;
  indexMetadata?: boolean;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface SaveStatistics {
  serverId: number;
  totalSaves: number;
  protectedSaves: number;
  corruptedSaves: number;
  totalStorageUsed: number;
  oldestSaveDate?: string;
  newestSaveDate?: string;
  averageSaveSize: number;
  totalRestores: number;
  lastRestoreDate?: string;
  favoriteCount: number;
}

export interface SaveHealthStatus {
  healthScore: number; // 0-100
  status: string; // excellent, good, fair, poor, critical
  issuesCount: number;
  warnings: string[];
  recommendations: string[];
}

// ============================================================================
// Bulk Operation Types
// ============================================================================

export interface BulkSaveOperation {
  operationType: string; // delete, protect, tag, compress, export
  saveIds: number[];
  operationData: Record<string, any>;
}

export interface BulkOperationResult {
  operationId: number;
  status: string; // pending, in-progress, completed, failed
  processedCount: number;
  errorCount: number;
  startedAt: string;
  completedAt?: string;
  errors: string[];
}

// ============================================================================
// Search and Filter Types
// ============================================================================

export interface SaveSearchFilter {
  searchQuery?: string;
  serverId?: number;
  dateRange?: DateRange;
  status?: string[]; // valid, corrupted, protected, favorite
  mapNames?: string[];
  minSize?: number;
  maxSize?: number;
  playerCountRange?: [number, number];
}

export interface DateRange {
  start: string;
  end: string;
}

export interface SaveSortOptions {
  sortBy: string; // date, size, players, uptime, name
  sortOrder: string; // asc, desc
}

// ============================================================================
// Restore Progress Types
// ============================================================================

export interface RestoreProgress {
  restoreId: number;
  progressPercent: number;
  currentStage: string;
  stageProgress: number;
  totalStages: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
  bytesProcessed: number;
  bytesTotal: number;
}

export interface RestoreResult {
  restoreId: number;
  success: boolean;
  durationSeconds: number;
  message: string;
  restoredSaveId: number;
  backupCreatedPath?: string;
  warnings: string[];
}

// ============================================================================
// UI Component Types
// ============================================================================

export interface SaveBrowserViewMode {
  type: 'grid' | 'list' | 'timeline' | 'compact';
  columnsPerRow?: number;
  itemsPerPage?: number;
}

export interface SaveBrowserState {
  currentServerid: number;
  saves: AutoSave[];
  selectedSaveIds: number[];
  filters: SaveSearchFilter;
  sortOptions: SaveSortOptions;
  viewMode: SaveBrowserViewMode;
  isLoading: boolean;
  error?: string;
}

export interface RestoreDialogState {
  isOpen: boolean;
  selectedSaveId?: number;
  backupCreated: boolean;
  willCreateBackup: boolean;
  isRestoring: boolean;
  progress?: RestoreProgress;
  error?: string;
}

export interface AutoSaveStore {
  // Save Management
  saves: Map<number, AutoSave>;
  folders: SaveFolder[];
  statistics: SaveStatistics | null;
  healthStatus: SaveHealthStatus | null;
  preferences: AutosavePreferences | null;

  // UI State
  currentServerId: number;
  selectedSaveIds: Set<number>;
  viewMode: SaveBrowserViewMode;
  filters: SaveSearchFilter;
  sortOptions: SaveSortOptions;
  isLoading: boolean;
  error?: string;

  // Restore State
  restoreHistory: SaveRestoreHistory[];
  restorePoints: RestorePoint[];
  restoreInProgress: boolean;

  // Timeline State
  timelineEvents: TimelineEvent[];

  // Actions
  setSaves: (saves: AutoSave[]) => void;
  addSave: (save: AutoSave) => void;
  removeSave: (saveId: number) => void;
  updateSave: (saveId: number, updates: Partial<AutoSave>) => void;
  setFolders: (folders: SaveFolder[]) => void;
  setStatistics: (stats: SaveStatistics | null) => void;
  setHealthStatus: (status: SaveHealthStatus | null) => void;
  setPreferences: (prefs: AutosavePreferences | null) => void;
  setCurrentServerId: (serverId: number) => void;
  toggleSaveSelection: (saveId: number) => void;
  setViewMode: (mode: SaveBrowserViewMode) => void;
  setFilters: (filters: SaveSearchFilter) => void;
  setSortOptions: (options: SaveSortOptions) => void;
  setRestoreHistory: (history: SaveRestoreHistory[]) => void;
  setRestorePoints: (points: RestorePoint[]) => void;
  setTimelineEvents: (events: TimelineEvent[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  clearSelection: () => void;
}

// ============================================================================
// Drag and Drop Types
// ============================================================================

export interface DragItem {
  type: 'save' | 'save-multiple';
  saveIds: number[];
  sourceFolder?: number;
}

export interface DropItem {
  type: 'folder';
  folderId?: number;
}
