import { create } from 'zustand';
import type { Server, ServerStatus } from '../types';

interface ServerStore {
    servers: Server[];
    activeServer: Server | null;
    serverVersions: Record<number, string>;
    latestPublicVersion: string | null;
    setServers: (servers: Server[]) => void;
    addServer: (server: Server) => void;
    removeServer: (serverId: number) => void;
    updateServerStatus: (serverId: number, status: ServerStatus) => void;
    setActiveServer: (server: Server | null) => void;
    checkReachability: (serverId: number, gamePort: number) => Promise<void>;
    refreshServers: () => Promise<void>;
    fetchServerVersion: (serverId: number, force?: boolean) => Promise<string>;
    fetchAllServerVersions: (force?: boolean) => Promise<void>;
    fetchLatestPublicVersion: () => Promise<string | null>;
    isServerOutdated: (serverId: number) => boolean;
}

export const useServerStore = create<ServerStore>((set, get) => ({
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

        // Persist 'online' status to DB so refreshServers reads the correct state
        if (status === 'online') {
            import('../utils/tauri').then(({ updateServerStatusInDb }) => {
                updateServerStatusInDb(serverId, 'online').catch(console.error);
            });
        }
    },

    setActiveServer: (server) => {
        if (server) {
            localStorage.setItem('activeAsaServerId', server.id.toString());
        } else {
            localStorage.removeItem('activeAsaServerId');
        }
        set({ activeServer: server });
    },

    checkReachability: async (serverId: number, port: number) => {
        try {
            const { checkServerReachability } = await import('../utils/tauri');
            const status = await checkServerReachability(port, 'UDP');

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

    fetchServerVersion: async (serverId: number, force = false) => {
        const current = get().serverVersions[serverId];
        if (current && !force) return current;

        try {
            const { getServerVersion } = await import('../utils/tauri');
            const version = await getServerVersion(serverId);
            set((state) => ({
                serverVersions: { ...state.serverVersions, [serverId]: version }
            }));
            return version;
        } catch (err) {
            console.error(`Failed to get version for server ${serverId}:`, err);
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
            const { getLatestServerVersion } = await import('../utils/tauri');
            const latest = await getLatestServerVersion();
            set({ latestPublicVersion: latest });
            return latest;
        } catch (err) {
            console.error('Failed to fetch latest public version:', err);
            return null;
        }
    },

    isServerOutdated: (serverId: number) => {
        const { serverVersions, latestPublicVersion } = get();
        const localVer = serverVersions[serverId];
        if (!localVer || !latestPublicVersion) return false;
        if (localVer.startsWith('Build ')) {
            return !localVer.includes(latestPublicVersion);
        }
        return false;
    },

    refreshServers: async () => {
        try {
            const { getAllServers } = await import('../utils/tauri');
            const freshServers = await getAllServers();

            const savedActiveIdStr = localStorage.getItem('activeAsaServerId');
            const savedActiveId = savedActiveIdStr ? parseInt(savedActiveIdStr, 10) : null;

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

                // Auto-restore or maintain activeServer reference
                let newActive = state.activeServer ? merged.find(s => s.id === state.activeServer!.id) || state.activeServer : null;
                if (savedActiveId !== null) {
                    const found = merged.find(s => s.id === savedActiveId);
                    if (found) newActive = found;
                }
                if (!newActive && merged.length > 0) {
                    newActive = merged[0];
                    localStorage.setItem('activeAsaServerId', newActive.id.toString());
                }

                return { servers: merged, activeServer: newActive };
            });

            // Automatically trigger fetching server versions for newly refreshed servers
            get().fetchAllServerVersions();
        } catch (error) {
            console.error('Failed to refresh servers:', error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Failed to load servers: ${error}`);
            });
        }
    }
}));
