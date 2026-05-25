import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import type { ServerType } from '../types';
import { toast } from 'react-hot-toast';

const normalizePath = (path: string): string => {
    if (!path) return '';
    return path.replace(/\\/g, '/').toLowerCase();
};

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

export interface DraftSetup {
    step: number;
    formData: any; // We'll cast this to InstallServerParams in the component to avoid circular types if needed, or import InstallServerParams
    baseDir: string;
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
    draftSetup: DraftSetup | null;
    setDraftSetup: (draft: DraftSetup | null) => void;
    isDraftOpen: boolean;
    setDraftOpen: (open: boolean) => void;
}

export const useInstallStore = create<InstallStore>((set) => ({
    activeInstalls: {},
    currentlyViewingPath: null,
    draftSetup: null,
    isDraftOpen: false,

    setDraftSetup: (draftSetup) => set({ draftSetup }),
    setDraftOpen: (isDraftOpen) => set({ isDraftOpen }),

    startInstall: (installPath, name, mapName, serverType) => set((state) => {
        const normalized = normalizePath(installPath);
        return {
            activeInstalls: {
                ...state.activeInstalls,
                [normalized]: {
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
        };
    }),

    updateProgress: (installPath, progressData) => set((state) => {
        const normalized = normalizePath(installPath);
        const task = state.activeInstalls[normalized];
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
                [normalized]: {
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
        const normalized = normalizePath(installPath);
        const task = state.activeInstalls[normalized];
        if (!task) return {};
        return {
            activeInstalls: {
                ...state.activeInstalls,
                [normalized]: {
                    ...task,
                    logs: [...task.logs.slice(-500), logData], // Limit to last 500 logs
                }
            }
        };
    }),

    removeInstall: (installPath) => set((state) => {
        const normalized = normalizePath(installPath);
        const activeInstalls = { ...state.activeInstalls };
        delete activeInstalls[normalized];
        return {
            activeInstalls,
            currentlyViewingPath: state.currentlyViewingPath && normalizePath(state.currentlyViewingPath) === normalized ? null : state.currentlyViewingPath,
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

    setViewingPath: (installPath) => set({ currentlyViewingPath: installPath ? normalizePath(installPath) : null }),
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
