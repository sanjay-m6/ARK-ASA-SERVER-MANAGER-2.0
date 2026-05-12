import { create } from 'zustand';

export interface RconPlayer {
    id: number;
    name: string;
    steamId: string;
}

export interface CommandHistoryEntry {
    command: string;
    response: string;
    timestamp: Date;
    success: boolean;
}

export interface ConnectionInfo {
    address: string;
    port: number;
    connectedSince: Date | null;
}

export interface ServerRconState {
    isConnected: boolean;
    isConnecting: boolean;
    commandHistory: CommandHistoryEntry[];
    players: RconPlayer[];
    lastError: string | null;
    connectionInfo: ConnectionInfo | null;
}

const defaultServerState: ServerRconState = {
    isConnected: false,
    isConnecting: false,
    commandHistory: [],
    players: [],
    lastError: null,
    connectionInfo: null,
};

interface RconStore {
    selectedServerId: number | null;
    serverStates: Record<number, ServerRconState>;

    setSelectedServerId: (id: number | null) => void;
    setConnected: (serverId: number, isConnected: boolean) => void;
    setConnecting: (serverId: number, isConnecting: boolean) => void;
    addHistory: (serverId: number, entry: CommandHistoryEntry) => void;
    setPlayers: (serverId: number, players: RconPlayer[]) => void;
    setLastError: (serverId: number, error: string | null) => void;
    setConnectionInfo: (serverId: number, info: ConnectionInfo | null) => void;
    clearServerState: (serverId: number) => void;
}

export const useRconStore = create<RconStore>((set) => ({
    selectedServerId: null,
    serverStates: {},

    setSelectedServerId: (id) => set({ selectedServerId: id }),

    setConnected: (serverId, isConnected) => set((state) => ({
        serverStates: {
            ...state.serverStates,
            [serverId]: {
                ...(state.serverStates[serverId] || defaultServerState),
                isConnected
            }
        }
    })),

    setConnecting: (serverId, isConnecting) => set((state) => ({
        serverStates: {
            ...state.serverStates,
            [serverId]: {
                ...(state.serverStates[serverId] || defaultServerState),
                isConnecting
            }
        }
    })),

    addHistory: (serverId, entry) => set((state) => {
        const serverState = state.serverStates[serverId] || defaultServerState;
        return {
            serverStates: {
                ...state.serverStates,
                [serverId]: {
                    ...serverState,
                    commandHistory: [...serverState.commandHistory, entry]
                }
            }
        };
    }),

    setPlayers: (serverId, players) => set((state) => ({
        serverStates: {
            ...state.serverStates,
            [serverId]: {
                ...(state.serverStates[serverId] || defaultServerState),
                players
            }
        }
    })),

    setLastError: (serverId, error) => set((state) => ({
        serverStates: {
            ...state.serverStates,
            [serverId]: {
                ...(state.serverStates[serverId] || defaultServerState),
                lastError: error
            }
        }
    })),

    setConnectionInfo: (serverId, info) => set((state) => ({
        serverStates: {
            ...state.serverStates,
            [serverId]: {
                ...(state.serverStates[serverId] || defaultServerState),
                connectionInfo: info
            }
        }
    })),

    clearServerState: (serverId) => set((state) => {
        const newStates = { ...state.serverStates };
        delete newStates[serverId];
        return { serverStates: newStates };
    }),
}));
