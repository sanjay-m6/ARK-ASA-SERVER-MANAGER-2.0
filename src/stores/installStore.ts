import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import type { ServerType } from '../types';
import { toast } from 'react-hot-toast';

export interface InstallProgressData {
    installPath: string;
    stage: string;
    progress: number;
    message: string;
    isComplete: boolean;
    isError: boolean;
}

export interface ConsoleOutputData {
    installPath: string;
    line: string;
    lineType: string;
    timestamp: string;
}

export interface InstallTask {
    installPath: string;
    name: string;
    mapName: string;
    serverType: ServerType;
    progress: number;
    stage: string;
    message: string;
    isComplete: boolean;
    isError: boolean;
    logs: ConsoleOutputData[];
}

interface InstallStore {
    activeInstalls: Record<string, InstallTask>;
    currentlyViewingPath: string | null;
    startInstall: (installPath: string, name: string, mapName: string, serverType: ServerType) => void;
    updateProgress: (installPath: string, progress: InstallProgressData) => void;
    addLog: (installPath: string, log: ConsoleOutputData) => void;
    removeInstall: (installPath: string) => void;
    clearCompleted: () => void;
    setViewingPath: (installPath: string | null) => void;
}

export const useInstallStore = create<InstallStore>((set) => ({
    activeInstalls: {},
    currentlyViewingPath: null,

    startInstall: (installPath, name, mapName, serverType) => set((state) => ({
        activeInstalls: {
            ...state.activeInstalls,
            [installPath]: {
                installPath,
                name,
                mapName,
                serverType,
                progress: 0,
                stage: 'preparing',
                message: 'Preparing installation...',
                isComplete: false,
                isError: false,
                logs: [],
            }
        }
    })),

    updateProgress: (installPath, progressData) => set((state) => {
        const task = state.activeInstalls[installPath];
        if (!task) return {};

        // Trigger toast on status changes
        if (progressData.isComplete && !task.isComplete) {
            toast.success(`Server "${task.name}" installed successfully!`, { duration: 5000 });
        } else if (progressData.isError && !task.isError) {
            toast.error(`Server "${task.name}" installation failed: ${progressData.message || 'Unknown error'}`, { duration: 6000 });
        }

        return {
            activeInstalls: {
                ...state.activeInstalls,
                [installPath]: {
                    ...task,
                    progress: progressData.progress,
                    stage: progressData.stage,
                    message: progressData.message,
                    isComplete: progressData.isComplete,
                    isError: progressData.isError,
                }
            }
        };
    }),

    addLog: (installPath, logData) => set((state) => {
        const task = state.activeInstalls[installPath];
        if (!task) return {};
        return {
            activeInstalls: {
                ...state.activeInstalls,
                [installPath]: {
                    ...task,
                    logs: [...task.logs.slice(-500), logData], // Limit to last 500 logs
                }
            }
        };
    }),

    removeInstall: (installPath) => set((state) => {
        const activeInstalls = { ...state.activeInstalls };
        delete activeInstalls[installPath];
        return {
            activeInstalls,
            currentlyViewingPath: state.currentlyViewingPath === installPath ? null : state.currentlyViewingPath,
        };
    }),

    clearCompleted: () => set((state) => {
        const activeInstalls = { ...state.activeInstalls };
        Object.keys(activeInstalls).forEach((path) => {
            if (activeInstalls[path].isComplete || activeInstalls[path].isError) {
                delete activeInstalls[path];
            }
        });
        return { activeInstalls };
    }),

    setViewingPath: (installPath) => set({ currentlyViewingPath: installPath }),
}));

// Listeners helper for Tauri events
let listenersInitialized = false;

export const initializeInstallListeners = () => {
    if (listenersInitialized) return;
    listenersInitialized = true;

    // Listen for progress updates
    listen<InstallProgressData>('install-progress', (event) => {
        const { installPath } = event.payload;
        if (installPath) {
            useInstallStore.getState().updateProgress(installPath, event.payload);
        }
    }).catch(console.error);

    // Listen for console outputs
    listen<ConsoleOutputData>('install-console', (event) => {
        const { installPath } = event.payload;
        if (installPath) {
            useInstallStore.getState().addLog(installPath, event.payload);
        }
    }).catch(console.error);
};
