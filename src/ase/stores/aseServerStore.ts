import { create } from 'zustand';
import type { AseServer, AseServerStatus } from '../types/ase.types';

interface AseServerStore {
    servers: AseServer[];
    activeServer: AseServer | null;
    serverVersions: Record<number, string>;
    latestPublicVersion: string | null;
    setServers: (servers: AseServer[]) => void;
    addServer: (server: AseServer) => void;
    removeServer: (serverId: number) => void;
    updateServerStatus: (serverId: number, status: AseServerStatus) => void;
    setActiveServer: (server: AseServer | null) => void;
    refreshServers: () => Promise<void>;
    fetchServerVersion: (serverId: number, force?: boolean) => Promise<string>;
    fetchAllServerVersions: (force?: boolean) => Promise<void>;
    fetchLatestPublicVersion: () => Promise<string | null>;
    isServerOutdated: (serverId: number) => boolean;
}

export const useAseServerStore = create<AseServerStore>((set, get) => ({
    servers: [],
    activeServer: null,
    serverVersions: {},
    latestPublicVersion: null,

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

    fetchServerVersion: async (serverId: number, force = false) => {
        const current = get().serverVersions[serverId];
        if (current && !force) return current;

        try {
            const { getAseServerVersion } = await import('../utils/aseCommands');
            const version = await getAseServerVersion(serverId);
            set((state) => ({
                serverVersions: { ...state.serverVersions, [serverId]: version }
            }));
            return version;
        } catch (err) {
            console.error(`[ASE] Failed to get version for server ${serverId}:`, err);
            const fallback = 'Unknown';
            set((state) => ({
                serverVersions: { ...state.serverVersions, [serverId]: fallback }
            }));
            return fallback;
        }
    },

    fetchAllServerVersions: async (force = false) => {
        const { servers, fetchServerVersion } = get();
        await Promise.all(servers.map(s => fetchServerVersion(s.id, force)));
    },

    fetchLatestPublicVersion: async () => {
        try {
            const { getLatestAseServerVersion } = await import('../utils/aseCommands');
            const latest = await getLatestAseServerVersion();
            set({ latestPublicVersion: latest });
            return latest;
        } catch (err) {
            console.error('[ASE] Failed to fetch latest public version:', err);
            return null;
        }
    },

    isServerOutdated: (serverId: number) => {
        const { serverVersions, latestPublicVersion } = get();
        const localVer = serverVersions[serverId];
        if (!localVer || !latestPublicVersion) return false;
        const match = localVer.match(/Build\s+(\d+)/i);
        if (match && match[1]) {
            return match[1].trim() !== latestPublicVersion.trim();
        }
        if (localVer.startsWith('Build ')) {
            return !localVer.includes(latestPublicVersion.trim());
        }
        return false;
    },

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

            get().fetchAllServerVersions();
            get().fetchLatestPublicVersion().catch(console.error);
        } catch (error) {
            console.error('[ASE] Failed to refresh servers:', error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Failed to load ASE servers: ${error}`);
            });
        }
    }
}));

// Automatic background update checking every 10 minutes for ASE
if (typeof window !== 'undefined') {
    setInterval(() => {
        const store = useAseServerStore.getState();
        store.fetchLatestPublicVersion().catch(console.error);
        store.fetchAllServerVersions(true).catch(console.error);
    }, 600000);
}
