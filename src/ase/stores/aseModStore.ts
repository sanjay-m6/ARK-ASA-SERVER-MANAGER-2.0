import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import type { AseInstalledMod, AseWorkshopMod } from '../types/ase.types';

export interface InstallingModState {
    workshopId: string;
    modName: string;
    status: 'queued' | 'downloading' | 'extracting' | 'completed' | 'failed';
    progress: number;
    error?: string;
    modImage?: string;
}

interface AseModStore {
    installedMods: AseInstalledMod[];
    searchResults: AseWorkshopMod[];
    isSearching: boolean;
    isInstalling: string | null; // workshopId being installed
    installingQueue: Record<string, InstallingModState>;
    downloadLogs: Record<string, { timestamp: string; line: string }[]>;
    setInstalledMods: (mods: AseInstalledMod[]) => void;
    setSearchResults: (mods: AseWorkshopMod[]) => void;
    setIsSearching: (val: boolean) => void;
    setIsInstalling: (workshopId: string | null) => void;
    
    // Queue Actions
    addToQueue: (workshopId: string, modName: string, modImage?: string) => void;
    updateQueueStatus: (workshopId: string, status: InstallingModState['status'], error?: string) => void;
    updateQueueProgress: (workshopId: string, progress: number, status?: InstallingModState['status'], error?: string) => void;
    updateQueueModDetails: (workshopId: string, modName: string, modImage?: string) => void;
    removeFromQueue: (workshopId: string) => void;
    clearQueue: () => void;

    // Logs Actions
    addDownloadLog: (workshopId: string, line: string, timestamp?: string) => void;
    clearDownloadLogs: (workshopId: string) => void;

    addInstalledMod: (mod: AseInstalledMod) => void;
    removeInstalledMod: (modId: number) => void;
    refreshInstalledMods: (serverId: number) => Promise<void>;
}

export const useAseModStore = create<AseModStore>((set) => ({
    installedMods: [],
    searchResults: [],
    isSearching: false,
    isInstalling: null,
    installingQueue: {},
    downloadLogs: {},

    setInstalledMods: (mods) => set({ installedMods: mods }),
    setSearchResults: (mods) => set({ searchResults: mods }),
    setIsSearching: (val) => set({ isSearching: val }),
    setIsInstalling: (workshopId) => set({ isInstalling: workshopId }),

    addToQueue: (workshopId, modName, modImage) => set((state) => ({
        installingQueue: {
            ...state.installingQueue,
            [workshopId]: {
                workshopId,
                modName,
                status: 'queued',
                progress: 10,
                modImage,
            }
        }
    })),

    updateQueueStatus: (workshopId, status, error) => set((state) => {
        const item = state.installingQueue[workshopId];
        if (!item) return {};
        
        let progress = 0;
        if (status === 'queued') progress = 10;
        else if (status === 'downloading') progress = 40;
        else if (status === 'extracting') progress = 80;
        else if (status === 'completed') progress = 100;
        else if (status === 'failed') progress = 100;

        return {
            installingQueue: {
                ...state.installingQueue,
                [workshopId]: {
                    ...item,
                    status,
                    progress,
                    error,
                }
            }
        };
    }),

    updateQueueProgress: (workshopId, progress, status, error) => set((state) => {
        const item = state.installingQueue[workshopId];
        if (!item) return {};
        return {
            installingQueue: {
                ...state.installingQueue,
                [workshopId]: {
                    ...item,
                    progress,
                    status: status || item.status,
                    error: error !== undefined ? error : item.error,
                }
            }
        };
    }),

    updateQueueModDetails: (workshopId, modName, modImage) => set((state) => {
        const item = state.installingQueue[workshopId];
        if (!item) return {};
        return {
            installingQueue: {
                ...state.installingQueue,
                [workshopId]: {
                    ...item,
                    modName,
                    modImage: modImage || item.modImage,
                }
            }
        };
    }),

    removeFromQueue: (workshopId) => set((state) => {
        const newQueue = { ...state.installingQueue };
        delete newQueue[workshopId];
        return { installingQueue: newQueue };
    }),

    clearQueue: () => set({ installingQueue: {} }),

    addDownloadLog: (workshopId, line, timestamp) => set((state) => {
        const time = timestamp || new Date().toLocaleTimeString();
        const logs = state.downloadLogs[workshopId] || [];
        return {
            downloadLogs: {
                ...state.downloadLogs,
                [workshopId]: [...logs, { timestamp: time, line }]
            }
        };
    }),

    clearDownloadLogs: (workshopId) => set((state) => {
        const newLogs = { ...state.downloadLogs };
        delete newLogs[workshopId];
        return { downloadLogs: newLogs };
    }),

    addInstalledMod: (mod) => set((state) => ({
        installedMods: [...state.installedMods, mod],
    })),

    removeInstalledMod: (modId) => set((state) => ({
        installedMods: state.installedMods.filter((m) => m.id !== modId),
    })),

    refreshInstalledMods: async (serverId: number) => {
        try {
            const { getInstalledAseMods } = await import('../utils/aseCommands');
            const mods = await getInstalledAseMods(serverId);
            set({ installedMods: mods });
        } catch (error) {
            console.error('[ASE] Failed to refresh installed mods:', error);
        }
    },
}));

let listenersInitialized = false;

export const initializeAseModListeners = () => {
    if (listenersInitialized) return;
    listenersInitialized = true;

    listen<{ workshopId: string; status: InstallingModState['status']; progress: number; message: string }>(
        'ase-mod-download-progress',
        (event) => {
            const { workshopId, status, progress, message } = event.payload;
            if (workshopId) {
                const error = status === 'failed' ? message : undefined;
                useAseModStore.getState().updateQueueProgress(workshopId, progress, status, error);
            }
        }
    ).catch(console.error);

    listen<{ workshopId: string; timestamp: string; line: string }>(
        'ase-mod-download-log',
        (event) => {
            const { workshopId, timestamp, line } = event.payload;
            if (workshopId) {
                useAseModStore.getState().addDownloadLog(workshopId, line, timestamp);
            }
        }
    ).catch(console.error);
};

