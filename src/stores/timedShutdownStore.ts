import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import { rconBroadcast, rconCommand, stopServer } from '../utils/tauri';
import { aseRconBroadcast, aseRconCommand, stopAseServer } from '../ase/utils/aseCommands';

export interface ActiveShutdown {
    serverId: number;
    serverName: string;
    serverType: 'ASA' | 'ASE';
    totalSeconds: number;
    remainingSeconds: number;
    messageTemplate: string;
    saveWorld: boolean;
    intervalId?: number;
}

interface TimedShutdownStore {
    activeShutdowns: Record<number, ActiveShutdown>;
    startShutdown: (
        serverId: number,
        serverName: string,
        serverType: 'ASA' | 'ASE',
        durationSeconds: number,
        messageTemplate: string,
        saveWorld: boolean
    ) => void;
    cancelShutdown: (serverId: number) => void;
    formatTime: (seconds: number) => string;
}

export const useTimedShutdownStore = create<TimedShutdownStore>((set, get) => ({
    activeShutdowns: {},

    formatTime: (seconds: number) => {
        if (seconds >= 60) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            if (secs === 0) {
                return `${mins} minute${mins > 1 ? 's' : ''}`;
            }
            return `${mins}m ${secs}s`;
        }
        return `${seconds} second${seconds > 1 ? 's' : ''}`;
    },

    startShutdown: (serverId, serverName, serverType, durationSeconds, messageTemplate, saveWorld) => {
        // Cancel existing countdown if running
        get().cancelShutdown(serverId);

        const sendBroadcast = async (msg: string) => {
            try {
                if (serverType === 'ASE') {
                    await aseRconBroadcast(serverId, msg);
                } else {
                    await rconBroadcast(serverId, msg);
                }
            } catch (err) {
                console.warn(`[TimedShutdown] Failed to send broadcast to server ${serverId}:`, err);
            }
        };

        const sendSaveWorld = async () => {
            try {
                if (serverType === 'ASE') {
                    await aseRconCommand(serverId, 'SaveWorld');
                } else {
                    await rconCommand(serverId, 'SaveWorld');
                }
            } catch (err) {
                console.warn(`[TimedShutdown] Failed to send SaveWorld to server ${serverId}:`, err);
            }
        };

        const executeStop = async () => {
            try {
                if (serverType === 'ASE') {
                    await stopAseServer(serverId);
                } else {
                    await stopServer(serverId);
                }
                toast.success(`Server "${serverName}" has shut down safely.`);
            } catch (err) {
                toast.error(`Failed to stop server "${serverName}": ${err}`);
            }
        };

        const formatMessage = (sec: number) => {
            const formattedTime = get().formatTime(sec);
            if (messageTemplate.includes('{time}')) {
                return messageTemplate.replace(/\{time\}/g, formattedTime);
            }
            return `${messageTemplate} (${formattedTime} remaining)`;
        };

        // Initial broadcast announcement
        const initialMsg = formatMessage(durationSeconds);
        sendBroadcast(initialMsg);
        toast.success(`Timed shutdown started for "${serverName}" (${get().formatTime(durationSeconds)})`);

        let currentRemaining = durationSeconds;

        const intervalId = window.setInterval(async () => {
            currentRemaining -= 1;

            if (currentRemaining <= 0) {
                // Clear interval
                const state = get().activeShutdowns[serverId];
                if (state?.intervalId) {
                    clearInterval(state.intervalId);
                }

                // Final Broadcast & Shutdown sequence
                await sendBroadcast('⚠️ Server is shutting down NOW! Saving world data...');

                if (saveWorld) {
                    await sendSaveWorld();
                    // Small delay for world save write
                    await new Promise((res) => setTimeout(res, 2000));
                }

                await executeStop();

                set((state) => {
                    const next = { ...state.activeShutdowns };
                    delete next[serverId];
                    return { activeShutdowns: next };
                });
                return;
            }

            // Checkpoints for broadcasts:
            // 15m (900s), 10m (600s), 5m (300s), 3m (180s), 2m (120s), 1m (60s), 30s, 15s, 10s, 5s
            const checkpoints = [900, 600, 300, 180, 120, 60, 30, 15, 10, 5];
            if (checkpoints.includes(currentRemaining)) {
                const broadcastMsg = formatMessage(currentRemaining);
                sendBroadcast(broadcastMsg);
            }

            // Update remaining time in state
            set((state) => {
                const existing = state.activeShutdowns[serverId];
                if (!existing) return state;
                return {
                    activeShutdowns: {
                        ...state.activeShutdowns,
                        [serverId]: {
                            ...existing,
                            remainingSeconds: currentRemaining
                        }
                    }
                };
            });
        }, 1000);

        set((state) => ({
            activeShutdowns: {
                ...state.activeShutdowns,
                [serverId]: {
                    serverId,
                    serverName,
                    serverType,
                    totalSeconds: durationSeconds,
                    remainingSeconds: durationSeconds,
                    messageTemplate,
                    saveWorld,
                    intervalId
                }
            }
        }));
    },

    cancelShutdown: (serverId) => {
        const existing = get().activeShutdowns[serverId];
        if (existing) {
            if (existing.intervalId) {
                clearInterval(existing.intervalId);
            }
            // Send cancellation broadcast
            const cancelMsg = 'ℹ️ Scheduled server shutdown has been CANCELLED by server administrator.';
            if (existing.serverType === 'ASE') {
                aseRconBroadcast(serverId, cancelMsg).catch(() => {});
            } else {
                rconBroadcast(serverId, cancelMsg).catch(() => {});
            }

            toast.success(`Shutdown cancelled for "${existing.serverName}"`);

            set((state) => {
                const next = { ...state.activeShutdowns };
                delete next[serverId];
                return { activeShutdowns: next };
            });
        }
    }
}));
