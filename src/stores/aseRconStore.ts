import { create } from 'zustand';

export interface LogEntry {
  type: 'cmd' | 'response' | 'error';
  text: string;
  time: string;
}

export interface LogStreamEntry {
  line: string;
  timestamp: Date;
}

export interface AsePlayer {
  name: string;
  steamId: string;
}

export interface AseServerRconState {
  isConnected: boolean;
  isConnecting: boolean;
  log: LogEntry[];
  history: string[];
  onlinePlayers: AsePlayer[];
  resolvedPlayerIds: Record<string, string>;
  isStreamingLogs: boolean;
  logStream: LogStreamEntry[];
}

export const defaultAseServerState: AseServerRconState = {
  isConnected: false,
  isConnecting: false,
  log: [],
  history: [],
  onlinePlayers: [],
  resolvedPlayerIds: {},
  isStreamingLogs: false,
  logStream: [],
};

interface AseRconStore {
  selectedServerId: number | null;
  serverStates: Record<number, AseServerRconState>;

  setSelectedServerId: (id: number | null) => void;
  setConnected: (serverId: number, isConnected: boolean) => void;
  setConnecting: (serverId: number, isConnecting: boolean) => void;
  addLog: (serverId: number, entry: LogEntry) => void;
  setLog: (serverId: number, log: LogEntry[]) => void;
  setHistory: (serverId: number, history: string[] | ((prev: string[]) => string[])) => void;
  setOnlinePlayers: (serverId: number, players: AsePlayer[]) => void;
  setResolvedPlayerIds: (serverId: number, ids: Record<string, string>) => void;
  setStreamingLogs: (serverId: number, isStreaming: boolean) => void;
  addLogStreamLine: (serverId: number, line: string) => void;
  clearLogStream: (serverId: number) => void;
  clearServerState: (serverId: number) => void;
}

export const useAseRconStore = create<AseRconStore>((set) => ({
  selectedServerId: null,
  serverStates: {},

  setSelectedServerId: (id) => set({ selectedServerId: id }),

  setConnected: (serverId, isConnected) => set((state) => ({
    serverStates: {
      ...state.serverStates,
      [serverId]: {
        ...(state.serverStates[serverId] || defaultAseServerState),
        isConnected
      }
    }
  })),

  setConnecting: (serverId, isConnecting) => set((state) => ({
    serverStates: {
      ...state.serverStates,
      [serverId]: {
        ...(state.serverStates[serverId] || defaultAseServerState),
        isConnecting
      }
    }
  })),

  addLog: (serverId, entry) => set((state) => {
    const serverState = state.serverStates[serverId] || defaultAseServerState;
    let cleanText = entry.text;
    if (cleanText && cleanText.trim() === 'Server received, But no response!!') {
      cleanText = 'Command executed successfully';
    }
    return {
      serverStates: {
        ...state.serverStates,
        [serverId]: {
          ...serverState,
          log: [...serverState.log, { ...entry, text: cleanText }]
        }
      }
    };
  }),

  setLog: (serverId, log) => set((state) => ({
    serverStates: {
      ...state.serverStates,
      [serverId]: {
        ...(state.serverStates[serverId] || defaultAseServerState),
        log
      }
    }
  })),

  setHistory: (serverId, historyUpdate) => set((state) => {
    const serverState = state.serverStates[serverId] || defaultAseServerState;
    const nextHistory = typeof historyUpdate === 'function' ? historyUpdate(serverState.history) : historyUpdate;
    return {
      serverStates: {
        ...state.serverStates,
        [serverId]: {
          ...serverState,
          history: nextHistory
        }
      }
    };
  }),

  setOnlinePlayers: (serverId, players) => set((state) => ({
    serverStates: {
      ...state.serverStates,
      [serverId]: {
        ...(state.serverStates[serverId] || defaultAseServerState),
        onlinePlayers: players
      }
    }
  })),

  setResolvedPlayerIds: (serverId, ids) => set((state) => ({
    serverStates: {
      ...state.serverStates,
      [serverId]: {
        ...(state.serverStates[serverId] || defaultAseServerState),
        resolvedPlayerIds: ids
      }
    }
  })),

  setStreamingLogs: (serverId, isStreamingLogs) => set((state) => ({
    serverStates: {
      ...state.serverStates,
      [serverId]: {
        ...(state.serverStates[serverId] || defaultAseServerState),
        isStreamingLogs
      }
    }
  })),

  addLogStreamLine: (serverId, line) => set((state) => {
    const serverState = state.serverStates[serverId] || defaultAseServerState;
    const nextStream = [...serverState.logStream, { line, timestamp: new Date() }].slice(-1000);
    return {
      serverStates: {
        ...state.serverStates,
        [serverId]: {
          ...serverState,
          logStream: nextStream
        }
      }
    };
  }),

  clearLogStream: (serverId) => set((state) => ({
    serverStates: {
      ...state.serverStates,
      [serverId]: {
        ...(state.serverStates[serverId] || defaultAseServerState),
        logStream: []
      }
    }
  })),

  clearServerState: (serverId) => set((state) => {
    const newStates = { ...state.serverStates };
    delete newStates[serverId];
    return { serverStates: newStates };
  }),
}));
