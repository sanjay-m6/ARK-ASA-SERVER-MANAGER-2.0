import { create } from 'zustand';
import type {
  ServerFolder,
  ServerArchive,
  ServerCustomization,
  DashboardLayout,
  ServerGroup,
  ServerTag,
  ServerActivityStats,
  DashboardStatistics,
  ServerOrganizationSnapshot,
  ServerFilter,
  ServerSortOptions,
} from '../types/server-organization';

interface ServerOrganizationStore {
  // Folders
  folders: ServerFolder[];
  selectedFolder: ServerFolder | null;
  setFolders: (folders: ServerFolder[]) => void;
  addFolder: (folder: ServerFolder) => void;
  updateFolder: (folder: ServerFolder) => void;
  deleteFolder: (folderId: number) => void;
  setSelectedFolder: (folder: ServerFolder | null) => void;

  // Server Customization
  customizations: Map<number, ServerCustomization>;
  getServerCustomization: (serverId: number) => ServerCustomization | null;
  updateServerCustomization: (customization: ServerCustomization) => void;
  toggleServerPin: (serverId: number) => void;
  toggleServerMinimize: (serverId: number) => void;
  toggleServerFavorite: (serverId: number) => void;
  addServerTag: (serverId: number, tag: string) => void;
  removeServerTag: (serverId: number, tag: string) => void;
  setServerColor: (serverId: number, color: string) => void;

  // Archive
  archivedServers: Map<number, ServerArchive>;
  isServerArchived: (serverId: number) => boolean;
  archiveServer: (serverId: number, reason?: string, notes?: string) => void;
  restoreServer: (serverId: number) => void;
  setArchivedServers: (archives: ServerArchive[]) => void;

  // Layouts
  layouts: DashboardLayout[];
  activeLayout: DashboardLayout | null;
  addLayout: (layout: DashboardLayout) => void;
  updateLayout: (layout: DashboardLayout) => void;
  deleteLayout: (layoutId: number) => void;
  setActiveLayout: (layout: DashboardLayout) => void;

  // Groups
  groups: ServerGroup[];
  setGroups: (groups: ServerGroup[]) => void;
  addGroup: (group: ServerGroup) => void;
  updateGroup: (group: ServerGroup) => void;
  deleteGroup: (groupId: number) => void;

  // Filtering and Sorting
  currentFilter: ServerFilter;
  currentSort: ServerSortOptions;
  setFilter: (filter: ServerFilter) => void;
  setSort: (sort: ServerSortOptions) => void;

  // Tags
  availableTags: ServerTag[];
  setAvailableTags: (tags: ServerTag[]) => void;
  addTag: (tag: ServerTag) => void;
  removeTag: (tagId: string) => void;

  // Activity & Statistics
  activityStats: Map<number, ServerActivityStats>;
  dashboardStats: DashboardStatistics | null;
  setActivityStats: (serverId: number, stats: ServerActivityStats) => void;
  setDashboardStats: (stats: DashboardStatistics) => void;
  clearActivityStats: () => void;

  // Organization Snapshot
  snapshot: ServerOrganizationSnapshot | null;
  setSnapshot: (snapshot: ServerOrganizationSnapshot) => void;

  // UI State
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useServerOrganizationStore = create<ServerOrganizationStore>((set, get) => ({
  // Folders
  folders: [],
  selectedFolder: null,
  
  setFolders: (folders) => set({ folders }),
  
  addFolder: (folder) => set((state) => ({
    folders: [...state.folders, folder],
  })),
  
  updateFolder: (folder) => set((state) => ({
    folders: state.folders.map((f) =>
      f.id === folder.id ? folder : f
    ),
  })),
  
  deleteFolder: (folderId) => set((state) => ({
    folders: state.folders.filter((f) => f.id !== folderId),
    selectedFolder: state.selectedFolder?.id === folderId ? null : state.selectedFolder,
  })),
  
  setSelectedFolder: (folder) => set({ selectedFolder: folder }),

  // Server Customization
  customizations: new Map(),
  
  getServerCustomization: (serverId) => {
    return get().customizations.get(serverId) || null;
  },
  
  updateServerCustomization: (customization) => set((state) => {
    const newCustomizations = new Map(state.customizations);
    newCustomizations.set(customization.serverId, customization);
    return { customizations: newCustomizations };
  }),
  
  toggleServerPin: (serverId) => set((state) => {
    const customization = state.customizations.get(serverId);
    if (!customization) return state;
    
    const newCustomizations = new Map(state.customizations);
    newCustomizations.set(serverId, {
      ...customization,
      isPinned: !customization.isPinned,
    });
    return { customizations: newCustomizations };
  }),
  
  toggleServerMinimize: (serverId) => set((state) => {
    const customization = state.customizations.get(serverId);
    if (!customization) return state;
    
    const newCustomizations = new Map(state.customizations);
    newCustomizations.set(serverId, {
      ...customization,
      isMinimized: !customization.isMinimized,
    });
    return { customizations: newCustomizations };
  }),
  
  toggleServerFavorite: (serverId) => set((state) => {
    const customization = state.customizations.get(serverId);
    if (!customization) return state;
    
    const newCustomizations = new Map(state.customizations);
    newCustomizations.set(serverId, {
      ...customization,
      favorite: !customization.favorite,
    });
    return { customizations: newCustomizations };
  }),
  
  addServerTag: (serverId, tag) => set((state) => {
    const customization = state.customizations.get(serverId);
    if (!customization) return state;
    
    const newTags = [...customization.tags];
    if (!newTags.includes(tag)) {
      newTags.push(tag);
    }
    
    const newCustomizations = new Map(state.customizations);
    newCustomizations.set(serverId, {
      ...customization,
      tags: newTags,
    });
    return { customizations: newCustomizations };
  }),
  
  removeServerTag: (serverId, tag) => set((state) => {
    const customization = state.customizations.get(serverId);
    if (!customization) return state;
    
    const newCustomizations = new Map(state.customizations);
    newCustomizations.set(serverId, {
      ...customization,
      tags: customization.tags.filter((t) => t !== tag),
    });
    return { customizations: newCustomizations };
  }),
  
  setServerColor: (serverId, color) => set((state) => {
    const customization = state.customizations.get(serverId);
    if (!customization) return state;
    
    const newCustomizations = new Map(state.customizations);
    newCustomizations.set(serverId, {
      ...customization,
      colorTag: color,
    });
    return { customizations: newCustomizations };
  }),

  // Archive
  archivedServers: new Map(),
  
  isServerArchived: (serverId) => {
    return get().archivedServers.has(serverId);
  },
  
  archiveServer: (serverId, reason, notes) => set((state) => {
    const newArchived = new Map(state.archivedServers);
    newArchived.set(serverId, {
      id: serverId,
      serverId: serverId,
      archivedAt: new Date().toISOString(),
      archiveReason: reason,
      archivedBy: undefined,
      notes,
    });
    return { archivedServers: newArchived };
  }),
  
  restoreServer: (serverId) => set((state) => {
    const newArchived = new Map(state.archivedServers);
    newArchived.delete(serverId);
    return { archivedServers: newArchived };
  }),
  
  setArchivedServers: (archives) => set(() => {
    const map = new Map(archives.map((a) => [a.serverId, a]));
    return { archivedServers: map };
  }),

  // Layouts
  layouts: [],
  activeLayout: null,
  
  addLayout: (layout) => set((state) => ({
    layouts: [...state.layouts, layout],
  })),
  
  updateLayout: (layout) => set((state) => ({
    layouts: state.layouts.map((l) =>
      l.id === layout.id ? layout : l
    ),
  })),
  
  deleteLayout: (layoutId) => set((state) => ({
    layouts: state.layouts.filter((l) => l.id !== layoutId),
    activeLayout: state.activeLayout?.id === layoutId ? null : state.activeLayout,
  })),
  
  setActiveLayout: (layout) => set({ activeLayout: layout }),

  // Groups
  groups: [],
  
  setGroups: (groups) => set({ groups }),
  
  addGroup: (group) => set((state) => ({
    groups: [...state.groups, group],
  })),
  
  updateGroup: (group) => set((state) => ({
    groups: state.groups.map((g) =>
      g.id === group.id ? group : g
    ),
  })),
  
  deleteGroup: (groupId) => set((state) => ({
    groups: state.groups.filter((g) => g.id !== groupId),
  })),

  // Filtering and Sorting
  currentFilter: {
    searchQuery: undefined,
    status: undefined,
    mapName: undefined,
    folderId: undefined,
    groupId: undefined,
    tags: undefined,
    isFavorite: undefined,
    isArchived: undefined,
    isPinned: undefined,
  },
  
  currentSort: {
    sortBy: 'name',
    sortOrder: 'asc',
  },
  
  setFilter: (filter) => set({ currentFilter: filter }),
  
  setSort: (sort) => set({ currentSort: sort }),

  // Tags
  availableTags: [],
  
  setAvailableTags: (tags) => set({ availableTags: tags }),
  
  addTag: (tag) => set((state) => ({
    availableTags: [...state.availableTags, tag],
  })),
  
  removeTag: (tagId) => set((state) => ({
    availableTags: state.availableTags.filter((t) => t.id !== tagId),
  })),

  // Activity & Statistics
  activityStats: new Map(),
  dashboardStats: null,
  
  setActivityStats: (serverId, stats) => set((state) => {
    const newStats = new Map(state.activityStats);
    newStats.set(serverId, stats);
    return { activityStats: newStats };
  }),
  
  setDashboardStats: (stats) => set({ dashboardStats: stats }),
  
  clearActivityStats: () => set({ activityStats: new Map() }),

  // Organization Snapshot
  snapshot: null,
  
  setSnapshot: (snapshot) => set({ snapshot }),

  // UI State
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  error: null,
  setError: (error) => set({ error }),
}));
