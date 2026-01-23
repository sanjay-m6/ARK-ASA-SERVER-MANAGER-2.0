import { create } from 'zustand';
import type { Server, ServerStatus } from '../types';

interface ServerStore {
    servers: Server[];
    activeServer: Server | null;
    setServers: (servers: Server[]) => void;
    addServer: (server: Server) => void;
    removeServer: (serverId: number) => void;
    updateServerStatus: (serverId: number, status: ServerStatus) => void;
    setActiveServer: (server: Server | null) => void;
    checkReachability: (serverId: number, gamePort: number) => Promise<void>;
    refreshServers: () => Promise<void>;
}

export const useServerStore = create<ServerStore>((set) => ({
    servers: [],
    activeServer: null,

    setServers: (servers) => set({ servers }),

    addServer: (server) => set((state) => ({
        servers: [...state.servers, server],
    })),

    removeServer: (serverId) => set((state) => ({
        servers: state.servers.filter((s) => s.id !== serverId),
        activeServer: state.activeServer?.id === serverId ? null : state.activeServer,
    })),

    updateServerStatus: (serverId, status) => set((state) => ({
        servers: state.servers.map((server) =>
            server.id === serverId ? { ...server, status } : server
        ),
        activeServer: state.activeServer?.id === serverId
            ? { ...state.activeServer, status }
            : state.activeServer,
    })),

    setActiveServer: (server) => set({ activeServer: server }),

    checkReachability: async (serverId: number, port: number) => {
        try {
            // Import dynamically or assume it's available since we are in the store
            const { checkServerReachability } = await import('../utils/tauri');
            const status = await checkServerReachability(serverId, port);

            // Assume "Offline" or other strings map to 'Unknown' or handled strictly
            let reachability: 'Public' | 'LAN' | 'Unknown' = 'Unknown';
            if (status === 'Public') reachability = 'Public';
            else if (status === 'LAN') reachability = 'LAN';

            set((state) => ({
                servers: state.servers.map((s) =>
                    s.id === serverId ? { ...s, reachability: reachability } : s
                )
            }));
        } catch (error) {
            console.error('Failed to check reachability:', error);
        }
    },

    refreshServers: async () => {
        try {
            const { getAllServers } = await import('../utils/tauri');
            const servers = await getAllServers();
            set({ servers });
        } catch (error) {
            console.error('Failed to refresh servers:', error);
        }
    }
}));
