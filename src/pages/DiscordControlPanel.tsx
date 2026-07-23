import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getClusters } from '../utils/tauri';
import { toast } from 'react-hot-toast';

interface ServerHealth {
  id: number;
  name: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  cpuUsage: number;
  ramUsage: number;
  fps: number;
  uptime: string;
  lastStarted: string | null;
  mods: string[];
  crashed: boolean;
}

interface PlayerInfo {
  steam_id: string;
  name: string;
  server_id: number;
  level: number;
  tribe: string;
  playtime_minutes: number;
  location: string;
  ping: number;
}

interface DiscordBridgeStatus {
  is_running: boolean;
  gateway_connected: boolean;
  uptime_seconds: number;
  commands_processed: number;
  last_command: string | null;
  last_command_user: string | null;
}

const DiscordControlPanel: React.FC<{ clusterId?: number }> = ({ clusterId: propClusterId }) => {
  const navigate = useNavigate();
  const [activeClusterId, setActiveClusterId] = useState<number | null>(propClusterId ?? null);
  const [clusters, setClusters] = useState<any[]>([]);
  const [servers, setServers] = useState<ServerHealth[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<DiscordBridgeStatus | null>(null);
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load clusters on mount if not provided as a prop
  useEffect(() => {
    if (propClusterId) {
      setActiveClusterId(propClusterId);
    } else {
      getClusters()
        .then((fetched) => {
          setClusters(fetched);
          if (fetched.length > 0) {
            setActiveClusterId(fetched[0].id);
          } else {
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('Failed to load clusters:', err);
          setLoading(false);
        });
    }
  }, [propClusterId]);

  // Fetch server health data
  const fetchServerHealth = async () => {
    if (activeClusterId === null) return;
    try {
      const result = await invoke<ServerHealth[]>('get_cluster_servers_health', {
        clusterId: activeClusterId,
      });
      setServers(result);
    } catch (err) {
      console.error('Failed to fetch server health:', err);
    }
  };

  // Fetch player list
  const fetchPlayers = async (serverId?: number) => {
    if (activeClusterId === null) return;
    try {
      const result = await invoke<PlayerInfo[]>('get_active_players', {
        serverId: serverId ?? null,
        clusterId: activeClusterId,
      });
      setPlayers(result);
    } catch (err) {
      console.error('Failed to fetch players:', err);
    }
  };

  // Fetch bridge status
  const fetchBridgeStatus = async () => {
    if (activeClusterId === null) return;
    try {
      const result = await invoke<DiscordBridgeStatus>(
        'get_discord_bridge_status',
        { clusterId: activeClusterId }
      );
      setBridgeStatus(result);
    } catch (err) {
      console.error('Failed to fetch bridge status:', err);
    }
  };

  // Initialize and set up auto-refresh
  useEffect(() => {
    if (activeClusterId === null) return;
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchServerHealth(), fetchPlayers(), fetchBridgeStatus()]);
      setLoading(false);
    };

    init();

    const interval = autoRefresh ? setInterval(init, 5000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeClusterId, autoRefresh]);

  // Listen for real-time events
  useEffect(() => {
    const unlistenPromises = [
      listen('server-health-update', async (event) => {
        console.log('[Discord] Server health update:', event.payload);
        await fetchServerHealth();
      }),
      listen('player-joined', async (event) => {
        console.log('[Discord] Player joined:', event.payload);
        await fetchPlayers();
      }),
      listen('player-left', async (event) => {
        console.log('[Discord] Player left:', event.payload);
        await fetchPlayers();
      }),
      listen('discord-command-executed', async (event) => {
        console.log('[Discord] Command executed:', event.payload);
        await fetchBridgeStatus();
      }),
    ];

    return () => {
      unlistenPromises.forEach((p) => p.then((unlisten) => unlisten?.()));
    };
  }, []);

  const handleStartServer = async (serverId: number) => {
    try {
      await invoke('start_server', { serverId, updateOnStart: false });
    } catch (err) {
      toast.error(`Failed to start server: ${err}`);
    }
  };

  const handleStopServer = async (serverId: number) => {
    try {
      await invoke('stop_server', { serverId });
    } catch (err) {
      toast.error(`Failed to stop server: ${err}`);
    }
  };

  const handleRestartServer = async (serverId: number) => {
    try {
      await invoke('restart_server', { serverId, wipeDinos: false });
    } catch (err) {
      toast.error(`Failed to restart server: ${err}`);
    }
  };

  const handleUpdateServer = async (serverId: number) => {
    try {
      await invoke('update_server', { serverId });
      toast.success(`Update command sent for server #${serverId}.`);
    } catch (err) {
      toast.error(`Failed to update server: ${err}`);
    }
  };

  const handleKickPlayer = async (serverId: number, steamId: string) => {
    try {
      await invoke('rcon_kick_player', {
        serverId,
        steamId,
        reason: 'Kicked from Discord Control Panel',
      });
      toast.success(`Successfully kicked player ${steamId}.`);
      await fetchPlayers(selectedServer ?? undefined);
    } catch (err) {
      toast.error(`Failed to kick player: ${err}`);
    }
  };

  const handleBanPlayer = async (serverId: number, steamId: string) => {
    try {
      await invoke('rcon_ban_player', {
        serverId,
        steamId,
      });
      toast.success(`Successfully banned player ${steamId}.`);
      await fetchPlayers(selectedServer ?? undefined);
    } catch (err) {
      toast.error(`Failed to ban player: ${err}`);
    }
  };

  // const handleTeleportPlayer = async (
  //   serverId: number,
  //   steamId: string,
  //   x: number,
  //   y: number,
  //   z: number
  // ) => {
  //   try {
  //     await invoke('teleport_player', { serverId, steamId, x, y, z });
  //   } catch (err) {
  //     toast.error(`Failed to teleport player: ${err}`);
  //   }
  // };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'running':
        return 'from-green-500 to-green-600';
      case 'starting':
        return 'from-yellow-500 to-yellow-600';
      case 'stopped':
        return 'from-red-500 to-red-600';
      case 'crashed':
        return 'from-red-700 to-red-800';
      case 'updating':
        return 'from-blue-500 to-blue-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'running':
        return '🟢';
      case 'starting':
        return '🟡';
      case 'stopped':
        return '🔴';
      case 'crashed':
        return '💥';
      case 'updating':
        return '🔄';
      default:
        return '⚪';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">🦖</div>
          <p className="text-gray-300">Loading Discord Control Panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/tools/discord')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/40 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700/40 transition-all font-medium text-sm group"
        >
          <span className="transform group-hover:-translate-x-0.5 transition-transform font-mono">←</span>
          <span>Back to Discord Bot</span>
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 mb-2">
            🦖 Discord Control Panel
          </h1>
          <p className="text-gray-400">Real-time ASA server and cluster management</p>
        </div>
        {clusters.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm font-medium">Active Cluster:</span>
            <select
              value={activeClusterId ?? ''}
              onChange={(e) => setActiveClusterId(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Bridge Status Card */}
      {bridgeStatus && (
        <div className="mb-8 p-6 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Bridge Status</h2>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-3 h-3 rounded-full ${
                  bridgeStatus.gateway_connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}
              ></span>
              <span className="text-sm text-gray-300">
                {bridgeStatus.gateway_connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-gray-400 text-sm">Uptime</p>
              <p className="text-xl font-bold text-white">
                {Math.floor(bridgeStatus.uptime_seconds / 3600)}h
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Commands</p>
              <p className="text-xl font-bold text-white">{bridgeStatus.commands_processed}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Last Command</p>
              <p className="text-sm text-gray-300 truncate">
                {bridgeStatus.last_command || 'None'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">By User</p>
              <p className="text-sm text-gray-300 truncate">
                {bridgeStatus.last_command_user || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Refresh Toggle */}
      <div className="mb-8 flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="w-5 h-5 rounded"
          />
          <span className="text-gray-300">Auto-refresh (5s)</span>
        </label>
        <button
          onClick={() => Promise.all([fetchServerHealth(), fetchPlayers(), fetchBridgeStatus()])}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          🔄 Refresh Now
        </button>
      </div>

      {/* Server Cards Grid */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-4">Server Status</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {servers.map((server) => (
            <div
              key={server.id}
              className={`p-6 bg-gradient-to-br ${getStatusColor(
                server.status
              )} rounded-lg shadow-xl cursor-pointer transition-transform hover:scale-105`}
              onClick={() => {
                setSelectedServer(server.id);
                fetchPlayers(server.id);
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    {getStatusIcon(server.status)} {server.name}
                  </h3>
                  <p className="text-sm text-gray-200">{server.status.toUpperCase()}</p>
                </div>
                {server.crashed && (
                  <span className="text-2xl animate-bounce" title="Server crashed">
                    ⚠️
                  </span>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-4 bg-black bg-opacity-30 p-3 rounded">
                <div>
                  <p className="text-xs text-gray-200">Players</p>
                  <p className="text-lg font-bold text-white">
                    {server.playerCount}/{server.maxPlayers}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-200">CPU</p>
                  <p className="text-lg font-bold text-white">{(server.cpuUsage ?? 0).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-200">RAM</p>
                  <p className="text-lg font-bold text-white">{(server.ramUsage ?? 0).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-200">FPS</p>
                  <p className="text-lg font-bold text-white">{(server.fps ?? 0).toFixed(1)}</p>
                </div>
              </div>

              {/* Uptime */}
              <div className="mb-4 text-sm text-gray-100">
                <p>⏱️ Uptime: {server.uptime}</p>
              </div>

              {/* Control Buttons */}
              <div className="flex gap-2 mt-4">
                {['stopped', 'crashed'].includes(server.status.toLowerCase()) && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartServer(server.id);
                      }}
                      className="flex-1 px-3 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs rounded-xl font-bold shadow-md shadow-emerald-950/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>▶️</span> Start
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateServer(server.id);
                      }}
                      className="flex-1 px-3 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs rounded-xl font-bold shadow-md shadow-blue-950/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>🔄</span> Update
                    </button>
                  </>
                )}
                {['online', 'running'].includes(server.status.toLowerCase()) && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestartServer(server.id);
                      }}
                      className="flex-1 px-3 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs rounded-xl font-bold shadow-md shadow-amber-950/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>🔄</span> Restart
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStopServer(server.id);
                      }}
                      className="flex-1 px-3 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs rounded-xl font-bold shadow-md shadow-rose-950/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>⏹️</span> Stop
                    </button>
                  </>
                )}
                {['starting', 'updating', 'stopping'].includes(server.status.toLowerCase()) && (
                  <div className="w-full py-2.5 bg-slate-800/40 border border-slate-700/50 rounded-xl text-slate-400 text-xs font-semibold text-center flex items-center justify-center gap-2 select-none">
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Server is {server.status.toLowerCase()}...</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Players List */}
      {(selectedServer || players.length > 0) && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            👥 Active Players {selectedServer ? '(Filtered)' : '(All Servers)'}
          </h2>
          {selectedServer && (
            <button
              onClick={() => {
                setSelectedServer(null);
                fetchPlayers();
              }}
              className="mb-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Clear Filter
            </button>
          )}
          {players.length === 0 ? (
            <p className="text-gray-400">No players online</p>
          ) : (
            <div className="space-y-2">
              {players.map((player) => (
                <div
                  key={`${player.server_id}-${player.steam_id}`}
                  className="p-4 bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white">{player.name}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-sm text-gray-300">
                        <div>
                          <span className="text-gray-500">SteamID</span>
                          <p className="font-mono text-xs">{player.steam_id}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Level</span>
                          <p className="text-white">{player.level}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Tribe</span>
                          <p className="text-white">{player.tribe || 'No Tribe'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Playtime</span>
                          <p className="text-white">{player.playtime_minutes}m</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Location</span>
                          <p className="text-white">{player.location}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Ping</span>
                          <p className={`${player.ping < 100 ? 'text-green-400' : player.ping < 200 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {player.ping}ms
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleKickPlayer(player.server_id, player.steam_id)}
                        title="Kick player"
                        className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                      >
                        👢
                      </button>
                      <button
                        onClick={() => handleBanPlayer(player.server_id, player.steam_id)}
                        title="Ban player"
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                      >
                        🚫
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiscordControlPanel;
