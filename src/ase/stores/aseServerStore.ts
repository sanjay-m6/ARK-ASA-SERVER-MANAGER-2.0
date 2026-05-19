import { create } from 'zustand';
import type { AseServer, AseServerStatus } from '../types/ase.types';

interface AseServerStore {
    servers: AseServer[];
    activeServer: AseServer | null;
    setServers: (servers: AseServer[]) => void;
    addServer: (server: AseServer) => void;
    removeServer: (serverId: number) => void;
    updateServerStatus: (serverId: number, status: AseServerStatus) => void;
    setActiveServer: (server: AseServer | null) => void;
    refreshServers: () => Promise<void>;
}

export const useAseServerStore = create<AseServerStore>((set) => ({
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

    updateServerStatus: (serverId, status) => {
        set((state) => ({
            servers: state.servers.map((server) =>
                server.id === serverId ? { ...server, status } : server
            ),
            activeServer: state.activeServer?.id === serverId
                ? { ...state.activeServer, status }
                : state.activeServer,
        }));
    },

    setActiveServer: (server) => set({ activeServer: server }),

    refreshServers: async () => {
        try {
            const { getAseServers } = await import('../utils/aseCommands');
            const freshServers = await getAseServers();

            set((state) => {
                const currentStatusMap = new Map(
                    state.servers.map(s => [s.id, s.status])
                );
                const merged = freshServers.map(s => {
                    const currentStatus = currentStatusMap.get(s.id);
                    if (currentStatus === 'online' && (s.status === 'running' || s.status === 'starting')) {
                        return { ...s, status: 'online' as const };
                    }
                    return s;
                });
                return { servers: merged };
            });
        } catch (error) {
            console.error('[ASE] Failed to refresh servers:', error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Failed to load ASE servers: ${error}`);
            });
        }
    }
}));
