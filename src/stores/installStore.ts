import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import type { ServerType } from '../types';
import { toast } from 'react-hot-toast';
import i18n from '../i18n';
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
                    message: i18n.t('installStore.preparing', 'Preparing installation...'),
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
            // Trigger toast on status changes with unique ID to avoid duplicate floating toasts
            const toastId = `install-toast-${normalized}`;
            if (progressData.isComplete && !task.isComplete) {
                const msg = progressData.message && progressData.message !== 'Update complete' 
                    ? i18n.t('installStore.updatedWithMessage', { defaultValue: 'Server "{{name}}" updated: {{message}}', name: task.name, message: progressData.message })
                    : i18n.t('installStore.updatedSuccess', { defaultValue: 'Server "{{name}}" updated successfully!', name: task.name });
                toast.success(msg, { id: toastId, duration: 5000 });
                // Force refresh server versions so the "Update Available" warning badge vanishes instantly!
                useServerStore.getState().fetchAllServerVersions(true);
                useServerStore.getState().refreshServers();
            } else if (progressData.isError && !task.isError) {
                toast.error(i18n.t('installStore.installFailed', { defaultValue: 'Server "{{name}}" installation failed: {{error}}', name: task.name, error: progressData.message || i18n.t('installStore.unknownError', 'Unknown error') }), { id: toastId, duration: 8000 });
            } else if (!progressData.isError && task.isError) {
                // Progress resumed/retried after error — dismiss stale error toast
                toast.dismiss(toastId);
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
                message: i18n.t('installStore.updating', 'Updating...'),
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
        } else {
            console.debug('install-progress payload is missing installPath');
        }
    }).catch((err) => {
        console.error(err);
    });

    // Listen for console outputs
    listen<ConsoleOutputData>('install-console', (event) => {
        const { installPath } = event.payload;

        if (installPath) {
            useInstallStore.getState().addLog(installPath, event.payload);
        } else {
            console.debug('install-console payload is missing installPath');
        }
    }).catch((err) => {
        console.error(err);
    });
};
