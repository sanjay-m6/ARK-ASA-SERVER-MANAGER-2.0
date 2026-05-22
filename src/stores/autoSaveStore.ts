// Auto-Save Management Zustand Store
// Complete state management for auto-save browsing, restoration, and organization

import { create } from 'zustand';
import { useMemo } from 'react';
import {
  AutoSave,
  SaveFolder,
  SaveRestoreHistory,
  RestorePoint,
  SaveSearchFilter,
  SaveSortOptions,
  SaveBrowserViewMode,
  SaveStatistics,
  SaveHealthStatus,
  AutosavePreferences,
  TimelineEvent,
  AutoSaveStore,
} from '@/types/autosave';
import {
  syncAutoSaveState,
  restoreSave as restoreSaveApi,
  deleteSave as deleteSaveApi,
  toggleSaveProtection as toggleSaveProtectionApi,
  toggleFavorite as toggleFavoriteApi,
  updateSaveLabel as updateSaveLabelApi,
  updateSaveNotes as updateSaveNotesApi,
} from '@/utils/autoSaveApi';

const defaultViewMode: SaveBrowserViewMode = {
  type: 'grid',
  columnsPerRow: 3,
  itemsPerPage: 20,
};

const defaultFilters: SaveSearchFilter = {
  searchQuery: '',
};

const defaultSortOptions: SaveSortOptions = {
  sortBy: 'date',
  sortOrder: 'desc',
};

export const useAutoSaveStore = create<AutoSaveStore>((set) => ({
  // =========================================================================
  // State
  // =========================================================================

  saves: new Map(),
  folders: [],
  statistics: null,
  healthStatus: null,
  preferences: null,
  currentServerId: 0,
  selectedSaveIds: new Set(),
  viewMode: defaultViewMode,
  filters: defaultFilters,
  sortOptions: defaultSortOptions,
  isLoading: false,
  error: undefined,
  restoreHistory: [],
  restorePoints: [],
  restoreInProgress: false,
  timelineEvents: [],

  // =========================================================================
  // Save Management Actions
  // =========================================================================

  setSaves: (saves: AutoSave[]) => {
    set({
      saves: new Map(saves.map((save) => [save.id, save])),
    });
  },

  addSave: (save: AutoSave) => {
    set((state) => {
      const newSaves = new Map(state.saves);
      newSaves.set(save.id, save);
      return { saves: newSaves };
    });
  },

  removeSave: (saveId: number) => {
    set((state) => {
      const newSaves = new Map(state.saves);
      newSaves.delete(saveId);
      return { saves: newSaves };
    });
  },

  updateSave: (saveId: number, updates: Partial<AutoSave>) => {
    set((state) => {
      const newSaves = new Map(state.saves);
      const existing = newSaves.get(saveId);
      if (existing) {
        newSaves.set(saveId, { ...existing, ...updates });
      }
      return { saves: newSaves };
    });
  },

  // =========================================================================
  // Folder Management Actions
  // =========================================================================

  setFolders: (folders: SaveFolder[]) => {
    set({ folders });
  },

  // =========================================================================
  // Statistics and Health
  // =========================================================================

  setStatistics: (stats: SaveStatistics | null) => {
    set({ statistics: stats });
  },

  setHealthStatus: (status: SaveHealthStatus | null) => {
    set({ healthStatus: status });
  },

  setPreferences: (prefs: AutosavePreferences | null) => {
    set({ preferences: prefs });
  },

  // =========================================================================
  // Server and Selection
  // =========================================================================

  setCurrentServerId: (serverId: number) => {
    set({ currentServerId: serverId });
  },

  toggleSaveSelection: (saveId: number) => {
    set((state) => {
      const newSelected = new Set(state.selectedSaveIds);
      if (newSelected.has(saveId)) {
        newSelected.delete(saveId);
      } else {
        newSelected.add(saveId);
      }
      return { selectedSaveIds: newSelected };
    });
  },

  clearSelection: () => {
    set({ selectedSaveIds: new Set() });
  },

  // =========================================================================
  // UI State
  // =========================================================================

  setViewMode: (mode: SaveBrowserViewMode) => {
    set({ viewMode: mode });
  },

  setFilters: (filters: SaveSearchFilter) => {
    set({ filters });
  },

  setSortOptions: (options: SaveSortOptions) => {
    set({ sortOptions: options });
  },

  // =========================================================================
  // History and Points
  // =========================================================================

  setRestoreHistory: (history: SaveRestoreHistory[]) => {
    set({ restoreHistory: history });
  },

  setRestorePoints: (points: RestorePoint[]) => {
    set({ restorePoints: points });
  },

  // =========================================================================
  // Timeline
  // =========================================================================

  setTimelineEvents: (events: TimelineEvent[]) => {
    set({ timelineEvents: events });
  },

  // =========================================================================
  // Loading and Error
  // =========================================================================

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setError: (error?: string) => {
    set({ error });
  },
}));

// ============================================================================
// Selector Hooks for Performance
// ============================================================================

export const selectSavesForServer = (serverId: number) => {
  return useAutoSaveStore((state) => {
    return Array.from(state.saves.values()).filter(
      (save) => save.serverId === serverId
    );
  });
};

export const selectProtectedSaves = () => {
  return useAutoSaveStore((state) => {
    return Array.from(state.saves.values()).filter((save) => save.isProtected);
  });
};

export const selectFavoriteSaves = () => {
  return useAutoSaveStore((state) => {
    return Array.from(state.saves.values()).filter((save) => save.isFavorite);
  });
};

export const selectCorruptedSaves = () => {
  return useAutoSaveStore((state) => {
    return Array.from(state.saves.values()).filter((save) => save.isCorrupted);
  });
};

export const getFilteredAndSortedSaves = (
  saves: Map<number, AutoSave>,
  serverId: number,
  filters: SaveSearchFilter,
  sortOptions: SaveSortOptions
): AutoSave[] => {
  let filtered = Array.from(saves.values()).filter(
    (save) => save.serverId === serverId
  );

  // Apply search filter
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (save) =>
        save.fileName.toLowerCase().includes(query) ||
        save.customLabel?.toLowerCase().includes(query) ||
        save.notes?.toLowerCase().includes(query)
    );
  }

  // Apply status filters
  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter((save) => {
      return filters.status!.some((status) => {
        switch (status) {
          case 'corrupted':
            return save.isCorrupted;
          case 'protected':
            return save.isProtected;
          case 'favorite':
            return save.isFavorite;
          case 'valid':
            return save.isValid && !save.isCorrupted;
          default:
            return true;
        }
      });
    });
  }

  // Apply map filter
  if (filters.mapNames && filters.mapNames.length > 0) {
    filtered = filtered.filter(
      (save) => save.mapName && filters.mapNames!.includes(save.mapName)
    );
  }

  // Apply size filter
  if (filters.minSize !== undefined) {
    filtered = filtered.filter((save) => save.fileSize >= filters.minSize!);
  }
  if (filters.maxSize !== undefined) {
    filtered = filtered.filter((save) => save.fileSize <= filters.maxSize!);
  }

  // Apply player count filter
  if (filters.playerCountRange) {
    const [min, max] = filters.playerCountRange;
    filtered = filtered.filter((save) => {
      const count = save.playerCount || 0;
      return count >= min && count <= max;
    });
  }

  // Sort
  filtered.sort((a, b) => {
    let comparison = 0;

    switch (sortOptions.sortBy) {
      case 'date':
        comparison = new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime();
        break;
      case 'size':
        comparison = a.fileSize - b.fileSize;
        break;
      case 'players':
        comparison = (a.playerCount || 0) - (b.playerCount || 0);
        break;
      case 'uptime':
        comparison = (a.uptimeSeconds || 0) - (b.uptimeSeconds || 0);
        break;
      case 'name':
        comparison = a.fileName.localeCompare(b.fileName);
        break;
      default:
        comparison = 0;
    }

    return sortOptions.sortOrder === 'asc' ? comparison : -comparison;
  });

  return filtered;
};

export const selectFilteredAndSortedSaves = (
  serverId: number,
  filters: SaveSearchFilter,
  sortOptions: SaveSortOptions
) => {
  return useAutoSaveStore((state) =>
    getFilteredAndSortedSaves(state.saves, serverId, filters, sortOptions)
  );
};

export const selectSaveById = (saveId: number) => {
  return useAutoSaveStore((state) => state.saves.get(saveId));
};

export const selectSelectedSaveCount = () => {
  return useAutoSaveStore((state) => state.selectedSaveIds.size);
};

export const selectIsLoading = () => {
  return useAutoSaveStore((state) => state.isLoading);
};

export const selectError = () => {
  return useAutoSaveStore((state) => state.error);
};

export const selectStatistics = () => {
  return useAutoSaveStore((state) => state.statistics);
};

export const selectHealthStatus = () => {
  return useAutoSaveStore((state) => state.healthStatus);
};

export const selectPreferences = () => {
  return useAutoSaveStore((state) => state.preferences);
};

export const selectRestoreHistory = () => {
  return useAutoSaveStore((state) => state.restoreHistory);
};

export const selectRestorePoints = () => {
  return useAutoSaveStore((state) => state.restorePoints);
};

export const selectTimelineEvents = () => {
  return useAutoSaveStore((state) => state.timelineEvents);
};

// ============================================================================
// Utility Hooks
// ============================================================================

export const useAutoSaveActions = () => {
  return useMemo(() => ({
    loadSaves: async (serverId: number) => {
      const store = useAutoSaveStore.getState();
      store.setLoading(true);
      store.setError(undefined);
      store.setCurrentServerId(serverId);
      try {
        await syncAutoSaveState(store, serverId);
      } catch (error) {
        store.setError(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        store.setLoading(false);
      }
    },
    refreshStatistics: async (serverId: number) => {
      const store = useAutoSaveStore.getState();
      try {
        await syncAutoSaveState(store, serverId);
      } catch (error) {
        console.error('Failed to refresh statistics:', error);
      }
    },
    restoreSave: async (
      serverId: number,
      saveId: number,
      createBackup: boolean
    ) => {
      useAutoSaveStore.setState({ restoreInProgress: true, error: undefined });
      try {
        await restoreSaveApi({
          serverId,
          saveId,
          createBackup,
          restoreMethod: 'manual',
        });
        await syncAutoSaveState(useAutoSaveStore.getState(), serverId);
      } catch (error) {
        useAutoSaveStore.setState({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      } finally {
        useAutoSaveStore.setState({ restoreInProgress: false });
      }
    },
    deleteSave: async (saveId: number) => {
      const store = useAutoSaveStore.getState();
      try {
        await deleteSaveApi(saveId);
        store.removeSave(saveId);
      } catch (error) {
        console.error('Failed to delete save:', error);
        throw error;
      }
    },
    toggleProtection: async (saveId: number, isProtected: boolean) => {
      const store = useAutoSaveStore.getState();
      try {
        await toggleSaveProtectionApi(saveId, isProtected);
        store.updateSave(saveId, { isProtected });
      } catch (error) {
        console.error('Failed to toggle protection:', error);
        throw error;
      }
    },
    toggleFavorite: async (saveId: number, isFavorite: boolean) => {
      const store = useAutoSaveStore.getState();
      try {
        await toggleFavoriteApi(saveId, isFavorite);
        store.updateSave(saveId, { isFavorite });
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
        throw error;
      }
    },
    updateLabel: async (saveId: number, label: string) => {
      const store = useAutoSaveStore.getState();
      try {
        await updateSaveLabelApi(saveId, label);
        store.updateSave(saveId, { customLabel: label });
      } catch (error) {
        console.error('Failed to update label:', error);
        throw error;
      }
    },
    updateNotes: async (saveId: number, notes: string) => {
      const store = useAutoSaveStore.getState();
      try {
        await updateSaveNotesApi(saveId, notes);
        store.updateSave(saveId, { notes });
      } catch (error) {
        console.error('Failed to update notes:', error);
        throw error;
      }
    },
  }), []);
};

// ============================================================================
// State Synchronization Helpers
// ============================================================================

export const createAutoSaveSnapshot = () => {
  const state = useAutoSaveStore.getState();
  return {
    saves: Array.from(state.saves.values()),
    folders: state.folders,
    statistics: state.statistics,
    healthStatus: state.healthStatus,
    preferences: state.preferences,
    restoreHistory: state.restoreHistory,
    restorePoints: state.restorePoints,
    timelineEvents: state.timelineEvents,
  };
};

export const restoreAutoSaveSnapshot = (snapshot: ReturnType<typeof createAutoSaveSnapshot>) => {
  const store = useAutoSaveStore.getState();
  store.setSaves(snapshot.saves);
  store.setFolders(snapshot.folders);
  store.setStatistics(snapshot.statistics);
  store.setHealthStatus(snapshot.healthStatus);
  store.setPreferences(snapshot.preferences);
  store.setRestoreHistory(snapshot.restoreHistory);
  store.setRestorePoints(snapshot.restorePoints);
  store.setTimelineEvents(snapshot.timelineEvents);
};
