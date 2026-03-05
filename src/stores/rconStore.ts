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

export interface ServerRconState {
    isConnected: boolean;
    isConnecting: boolean;
    commandHistory: CommandHistoryEntry[];
    players: RconPlayer[];
}

const defaultServerState: ServerRconState = {
    isConnected: false,
    isConnecting: false,
    commandHistory: [],
    players: [],
};

interface RconStore {
    selectedServerId: number | null;
    serverStates: Record<number, ServerRconState>;

    setSelectedServerId: (id: number | null) => void;
    setConnected: (serverId: number, isConnected: boolean) => void;
    setConnecting: (serverId: number, isConnecting: boolean) => void;
    addHistory: (serverId: number, entry: CommandHistoryEntry) => void;
    setPlayers: (serverId: number, players: RconPlayer[]) => void;
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

    clearServerState: (serverId) => set((state) => {
        const newStates = { ...state.serverStates };
        delete newStates[serverId];
        return { serverStates: newStates };
    }),
}));
