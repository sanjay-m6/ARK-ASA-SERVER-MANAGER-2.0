import { create } from 'zustand';
import type { AseInstalledMod, AseWorkshopMod } from '../types/ase.types';

export interface InstallingModState {
    workshopId: string;
    modName: string;
    status: 'queued' | 'downloading' | 'extracting' | 'completed' | 'failed';
    progress: number;
    error?: string;
}

interface AseModStore {
    installedMods: AseInstalledMod[];
    searchResults: AseWorkshopMod[];
    isSearching: boolean;
    isInstalling: string | null; // workshopId being installed
    installingQueue: Record<string, InstallingModState>;
    setInstalledMods: (mods: AseInstalledMod[]) => void;
    setSearchResults: (mods: AseWorkshopMod[]) => void;
    setIsSearching: (val: boolean) => void;
    setIsInstalling: (workshopId: string | null) => void;
    
    // Queue Actions
    addToQueue: (workshopId: string, modName: string) => void;
    updateQueueStatus: (workshopId: string, status: InstallingModState['status'], error?: string) => void;
    removeFromQueue: (workshopId: string) => void;
    clearQueue: () => void;

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

    setInstalledMods: (mods) => set({ installedMods: mods }),
    setSearchResults: (mods) => set({ searchResults: mods }),
    setIsSearching: (val) => set({ isSearching: val }),
    setIsInstalling: (workshopId) => set({ isInstalling: workshopId }),

    addToQueue: (workshopId, modName) => set((state) => ({
        installingQueue: {
            ...state.installingQueue,
            [workshopId]: {
                workshopId,
                modName,
                status: 'queued',
                progress: 10,
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

    removeFromQueue: (workshopId) => set((state) => {
        const newQueue = { ...state.installingQueue };
        delete newQueue[workshopId];
        return { installingQueue: newQueue };
    }),

    clearQueue: () => set({ installingQueue: {} }),

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

