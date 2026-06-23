import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { ServerType } from '../types';
import { toast } from 'react-hot-toast';
import { useServerStore } from './serverStore';

export const normalizePath = (path: string): string => {
    if (!path) return '';
    return path.replace(/\\/g, '/').replace(/\/$/, '').trim().toLowerCase();
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
        let task = state.activeInstalls[normalized];
        if (!task) {
            const servers = useServerStore.getState().servers;
            const matchingServer = servers.find(s => normalizePath(s.installPath) === normalized);
            task = {
                installPath,
                name: matchingServer?.name || 'ARK Server',
                mapName: matchingServer?.config.mapName || 'TheIsland_WP',
                serverType: matchingServer?.serverType || 'ASA',
                progress: progressData.progress,
                stage: progressData.stage,
                message: progressData.message,
                isComplete: progressData.isComplete,
                isError: progressData.isError,
                logs: [],
            };
        } else {
            // Trigger toast on status changes
            if (progressData.isComplete && !task.isComplete) {
                toast.success(`Server "${task.name}" installed successfully!`, { duration: 5000 });
            } else if (progressData.isError && !task.isError) {
                toast.error(`Server "${task.name}" installation failed: ${progressData.message || 'Unknown error'}`, { duration: 6000 });
            }
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
        let task = state.activeInstalls[normalized];
        if (!task) {
            const servers = useServerStore.getState().servers;
            const matchingServer = servers.find(s => normalizePath(s.installPath) === normalized);
            task = {
                installPath,
                name: matchingServer?.name || 'ARK Server',
                mapName: matchingServer?.config.mapName || 'TheIsland_WP',
                serverType: matchingServer?.serverType || 'ASA',
                progress: 0,
                stage: 'updating',
                message: 'Updating...',
                isComplete: false,
                isError: false,
                logs: [],
            };
        }
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

// Helper to write frontend logs to a file in the AppData directory for easy inspection
const appendDebugLog = async (message: string) => {
    try {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        const logPath = 'C:\\Users\\sanja\\AppData\\Roaming\\com.ark.asaservermanager\\debug_events.log';
        let currentLogs = '';
        try {
            currentLogs = await invoke<string>('read_file_content', { path: logPath });
        } catch {
            // File doesn't exist yet, start fresh
        }
        await invoke('write_file_content', { path: logPath, content: currentLogs + logLine });
    } catch (err) {
        console.error('Failed to write debug log to file:', err);
    }
};

// Listeners helper for Tauri events
let listenersInitialized = false;

export const initializeInstallListeners = () => {
    if (listenersInitialized) return;
    listenersInitialized = true;

    appendDebugLog('initializeInstallListeners called and active');

    // Listen for progress updates
    listen<InstallProgressData>('install-progress', (event) => {
        const { installPath, stage, progress, message, isComplete, isError } = event.payload;
        appendDebugLog(`install-progress event received: Path=${installPath}, Stage=${stage}, Progress=${progress}%, Message=${message}, Complete=${isComplete}, Error=${isError}`);
        
        if (installPath) {
            useInstallStore.getState().updateProgress(installPath, event.payload);
        } else {
            appendDebugLog('install-progress payload is missing installPath');
        }
    }).catch((err) => {
        appendDebugLog(`Error registering install-progress listener: ${err}`);
        console.error(err);
    });

    // Listen for console outputs
    listen<ConsoleOutputData>('install-console', (event) => {
        const { installPath, line, lineType, timestamp } = event.payload;
        appendDebugLog(`[${timestamp}] install-console event received: Path=${installPath}, Type=${lineType}, Line=${line}`);
        
        if (installPath) {
            useInstallStore.getState().addLog(installPath, event.payload);
        } else {
            appendDebugLog('install-console payload is missing installPath');
        }
    }).catch((err) => {
        appendDebugLog(`Error registering install-console listener: ${err}`);
        console.error(err);
    });
};
