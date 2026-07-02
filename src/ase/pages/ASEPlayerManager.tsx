import { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  CheckCircle,
  Lock,
  Unlock,
  Users,
  Search,
  Plus,
  Trash2,
  Edit,
  Download,
  Upload,
  RefreshCw,
  ExternalLink,
  Copy
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { useAseRconStore } from '../../stores/aseRconStore';
import ServerSelect from '../../components/ui/ServerSelect';
import {
  getAsePlayers,
  saveAsePlayers,
  readAseConfig,
  writeAseConfig
} from '../utils/aseCommands';
import { useLocation } from 'react-router-dom';
import type { AsePlayer, AsePlayerLists, AseGameConfig } from '../types/ase.types';
import { cn } from '../../utils/helpers';

export default function ASEPlayerManager() {
  const { servers } = useAseServerStore();
  const location = useLocation();
  const [selectedServerId, setSelectedServerId] = useState<number | null>(
    location.state?.serverId || servers[0]?.id || null
  );

  useEffect(() => {
    if (location.state?.serverId && servers.some(s => s.id === location.state.serverId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedServerId(location.state.serverId);
    } else if (!selectedServerId && servers.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId, location.state]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rconState = useAseRconStore((state: any) =>
    selectedServerId ? state.serverStates[selectedServerId] : null
  );

  // States
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<AsePlayerLists>({
    admins: [],
    whitelist: [],
    exclusive: []
  });
  const [config, setConfig] = useState<AseGameConfig | null>(null);
  
  // Search terms for the three cards
  const [searchAdmins, setSearchAdmins] = useState('');
  const [searchWhitelist, setSearchWhitelist] = useState('');
  const [searchExclusive, setSearchExclusive] = useState('');

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTargetList, setDialogTargetList] = useState<'admins' | 'whitelist' | 'exclusive'>('admins');
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [editingSteamId, setEditingSteamId] = useState<string | null>(null);
  const [dialogPlayer, setDialogPlayer] = useState<Partial<AsePlayer>>({
    steamId: '',
    epicId: '',
    playerName: '',
    platform: 'Steam',
    notes: ''
  });

  // Load data
  const loadData = async (serverId: number) => {
    setLoading(true);
    try {
      const lists = await getAsePlayers(serverId);
      setPlayers(lists);

      const cfg = await readAseConfig(serverId);
      setConfig(cfg);
    } catch (e) {
      toast.error(`Failed to load player lists: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedServerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData(selectedServerId);
    }
  }, [selectedServerId]);

  // Handle Exclusive Join toggle
  const handleExclusiveJoinToggle = async (checked: boolean) => {
    if (!selectedServerId || !config) return;
    const updatedConfig = { ...config, enableExclusiveJoin: checked };
    setConfig(updatedConfig);
    try {
      await writeAseConfig(selectedServerId, updatedConfig);
      toast.success(checked ? 'Exclusive Join mode enabled (launch arg added)' : 'Exclusive Join mode disabled');
    } catch (e) {
      toast.error(`Failed to update configuration: ${e}`);
    }
  };

  // Helper to save to files and DB
  const saveLists = async (newLists: AsePlayerLists) => {
    if (!selectedServerId) return;
    try {
      await saveAsePlayers(
        selectedServerId,
        newLists.admins,
        newLists.whitelist,
        newLists.exclusive
      );
      setPlayers(newLists);
      toast.success('Player list synchronized successfully');
    } catch (e) {
      toast.error(`Failed to synchronize lists: ${e}`);
    }
  };

  // Validate SteamID64
  const validateSteamId = (id: string): boolean => {
    return id.length === 17 && id.startsWith('7656') && /^\d+$/.test(id);
  };

  // Open add player dialog
  const openAddDialog = (list: 'admins' | 'whitelist' | 'exclusive') => {
    setDialogTargetList(list);
    setDialogMode('add');
    setEditingSteamId(null);
    setDialogPlayer({
      steamId: '',
      epicId: '',
      playerName: '',
      platform: 'Steam',
      notes: ''
    });
    setDialogOpen(true);
  };

  // Open edit player dialog
  const openEditDialog = (list: 'admins' | 'whitelist' | 'exclusive', player: AsePlayer) => {
    setDialogTargetList(list);
    setDialogMode('edit');
    setEditingSteamId(player.steamId);
    setDialogPlayer({ ...player });
    setDialogOpen(true);
  };

  // Save Add/Edit
  const handleDialogSave = () => {
    const { steamId, playerName, platform, epicId, notes } = dialogPlayer;

    if (!steamId || !playerName) {
      toast.error('SteamID64 and Player Name are required');
      return;
    }

    if (!validateSteamId(steamId)) {
      toast.error('Invalid SteamID64. Must be a 17-digit number starting with 7656.');
      return;
    }

    const targetList = players[dialogTargetList];

    // Check for duplicates
    if (dialogMode === 'add') {
      const exists = targetList.some((p) => p.steamId === steamId);
      if (exists) {
        toast.error('A player with this Steam ID already exists in this list');
        return;
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const newPlayer: AsePlayer = {
      steamId,
      playerName,
      platform: platform || 'Steam',
      epicId: epicId || null,
      dateAdded: dialogMode === 'add' ? today : (dialogPlayer.dateAdded || today),
      notes: notes || null
    };

    let updatedList = [...targetList];
    if (dialogMode === 'add') {
      updatedList.push(newPlayer);
    } else {
      updatedList = updatedList.map((p) => (p.steamId === editingSteamId ? newPlayer : p));
    }

    const newLists = {
      ...players,
      [dialogTargetList]: updatedList
    };

    setDialogOpen(false);
    saveLists(newLists);
  };

  // Remove player
  const handleRemovePlayer = (list: 'admins' | 'whitelist' | 'exclusive', steamId: string) => {
    const updatedList = players[list].filter((p) => p.steamId !== steamId);
    const newLists = { ...players, [list]: updatedList };
    saveLists(newLists);
  };

  // Move player to another list
  const handleMovePlayer = (
    fromList: 'admins' | 'whitelist' | 'exclusive',
    toList: 'admins' | 'whitelist' | 'exclusive',
    player: AsePlayer
  ) => {
    const sourceList = players[fromList].filter((p) => p.steamId !== player.steamId);
    const destList = [...players[toList]];
    
    if (destList.some((p) => p.steamId === player.steamId)) {
      toast.error('Player is already in the target list');
      return;
    }

    destList.push(player);
    const newLists = {
      ...players,
      [fromList]: sourceList,
      [toList]: destList
    };
    saveLists(newLists);
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Import List (from file upload)
  const handleImport = (list: 'admins' | 'whitelist' | 'exclusive', file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        let importedPlayers: AsePlayer[] = [];
        const today = new Date().toISOString().split('T')[0];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            importedPlayers = parsed.map((item: any) => ({
              steamId: String(item.steamId || item.PlayerId || ''),
              playerName: String(item.playerName || item.PlayerName || 'Imported Player'),
              platform: String(item.platform || 'Steam'),
              epicId: item.epicId || null,
              dateAdded: item.dateAdded || today,
              notes: item.notes || null
            }));
          }
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n');
          importedPlayers = lines.map((line) => {
            const cols = line.split(',');
            return {
              steamId: cols[0]?.trim() || '',
              playerName: cols[1]?.trim() || 'Imported Player',
              platform: cols[2]?.trim() || 'Steam',
              dateAdded: cols[3]?.trim() || today,
              notes: cols[4]?.trim() || null
            };
          });
        } else {
          // Plain Text - one SteamID64 per line
          const lines = text.split('\n');
          importedPlayers = lines
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => ({
              steamId: line,
              playerName: `Player ${line}`,
              platform: 'Steam',
              dateAdded: today,
              notes: null
            }));
        }

        // Validate and de-duplicate
        const validPlayers = importedPlayers.filter((p) => validateSteamId(p.steamId));
        const uniquePlayers: AsePlayer[] = [];
        const seenIds = new Set<string>();

        for (const p of validPlayers) {
          if (!seenIds.has(p.steamId)) {
            seenIds.add(p.steamId);
            uniquePlayers.push(p);
          }
        }

        if (uniquePlayers.length === 0) {
          toast.error('No valid SteamID64s found in the file');
          return;
        }

        const newLists = {
          ...players,
          [list]: [...players[list], ...uniquePlayers.filter(up => !players[list].some(p => p.steamId === up.steamId))]
        };

        saveLists(newLists);
        toast.success(`Successfully imported ${uniquePlayers.length} players`);
      } catch (err) {
        toast.error(`Failed to parse file: ${err}`);
      }
    };
    reader.readAsText(file);
  };

  // Export List
  const handleExport = (list: 'admins' | 'whitelist' | 'exclusive', format: 'txt' | 'csv' | 'json') => {
    const listData = players[list];
    let fileContent = '';
    let mimeType = 'text/plain';
    const fileName = `${list}_export.${format}`;

    if (format === 'json') {
      fileContent = JSON.stringify(listData, null, 2);
      mimeType = 'application/json';
    } else if (format === 'csv') {
      const headers = 'SteamID64,Player Name,Platform,Date Added,Notes\n';
      const rows = listData.map(p => `"${p.steamId}","${p.playerName.replace(/"/g, '""')}","${p.platform}","${p.dateAdded}","${(p.notes || '').replace(/"/g, '""')}"`).join('\n');
      fileContent = headers + rows;
      mimeType = 'text/csv';
    } else {
      fileContent = listData.map(p => p.steamId).join('\n') + '\n';
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported list as ${format.toUpperCase()}`);
  };

  // Filter lists based on search queries
  const filteredAdmins = useMemo(() => {
    return players.admins.filter(p =>
      p.steamId.includes(searchAdmins) ||
      p.playerName.toLowerCase().includes(searchAdmins.toLowerCase())
    );
  }, [players.admins, searchAdmins]);

  const filteredWhitelist = useMemo(() => {
    return players.whitelist.filter(p =>
      p.steamId.includes(searchWhitelist) ||
      p.playerName.toLowerCase().includes(searchWhitelist.toLowerCase())
    );
  }, [players.whitelist, searchWhitelist]);

  const filteredExclusive = useMemo(() => {
    return players.exclusive.filter(p =>
      p.steamId.includes(searchExclusive) ||
      p.playerName.toLowerCase().includes(searchExclusive.toLowerCase())
    );
  }, [players.exclusive, searchExclusive]);

  return (
    <div className="space-y-6">
      {/* Top Header & Server Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-900/60 border border-slate-800 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-amber-400" />
            Player Management
          </h1>
          <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
            Manage server administrators, whitelisted players to bypass slot limits, and exclusive access joining rules.
          </p>
        </div>
        <div className="w-full md:w-72 shrink-0">
          <ServerSelect value={selectedServerId} onChange={setSelectedServerId} servers={servers} accentColor="amber" />
        </div>
      </div>

      {selectedServerId ? (
        <div className="space-y-6">
          {/* Main 3 Column Cards Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* 👑 ADMINISTRATORS CARD */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl shadow-xl flex flex-col h-[650px] relative overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Administrators</h2>
                    <p className="text-[10px] text-slate-500">AllowedCheaterSteamIDs.txt</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openAddDialog('admins')}
                    className="p-1.5 bg-slate-800/50 hover:bg-amber-500 hover:text-slate-950 text-slate-300 rounded-xl transition-all border border-white/5"
                    title="Add Admin"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <label className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <input
                      type="file"
                      accept=".txt,.csv,.json"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleImport('admins', e.target.files[0])}
                    />
                  </label>
                  <div className="relative group">
                    <button className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5">
                      <Download className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1.5 hidden group-focus-within:block group-hover:block bg-slate-950 border border-slate-800 rounded-xl py-1 z-30 shadow-2xl min-w-[120px]">
                      <button onClick={() => handleExport('admins', 'txt')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export TXT</button>
                      <button onClick={() => handleExport('admins', 'csv')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export CSV</button>
                      <button onClick={() => handleExport('admins', 'json')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export JSON</button>
                    </div>
                  </div>
                  <button
                    onClick={() => loadData(selectedServerId)}
                    className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5"
                    title="Reload"
                  >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="px-4 py-3 border-b border-white/5 shrink-0 bg-slate-950/20">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchAdmins}
                    onChange={(e) => setSearchAdmins(e.target.value)}
                    placeholder="Search admins by name or SteamID..."
                    className="w-full pl-9 pr-4 py-1.5 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Player list container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 scrollbar-thin">
                {filteredAdmins.length > 0 ? (
                  filteredAdmins.map((p) => (
                    <div key={p.steamId} className="group p-3.5 bg-slate-950/40 hover:bg-slate-950/80 border border-white/5 rounded-2xl flex items-center justify-between gap-4 transition-all">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200 text-xs truncate">{p.playerName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[8px] uppercase tracking-wider">{p.platform}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-1.5">
                          <span>{p.steamId}</span>
                          <button onClick={() => handleCopy(p.steamId, 'Steam ID')} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-opacity">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        {p.notes && <p className="text-[9px] text-slate-400 italic mt-1 truncate">"{p.notes}"</p>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditDialog('admins', p)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                          title="Edit Info"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={`https://steamcommunity.com/profiles/${p.steamId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                          title="Steam Profile"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleRemovePlayer('admins', p.steamId)}
                          className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16">
                    <Shield className="w-8 h-8 opacity-20 mb-2" />
                    <span className="text-xs">No admins configured</span>
                  </div>
                )}
              </div>
            </div>

            {/* ✅ WHITELIST CARD */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl shadow-xl flex flex-col h-[650px] relative overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Whitelist</h2>
                    <p className="text-[10px] text-slate-500">PlayersExclusiveJoinList.txt</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openAddDialog('whitelist')}
                    className="p-1.5 bg-slate-800/50 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 rounded-xl transition-all border border-white/5"
                    title="Add Whitelisted Player"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <label className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <input
                      type="file"
                      accept=".txt,.csv,.json"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleImport('whitelist', e.target.files[0])}
                    />
                  </label>
                  <div className="relative group">
                    <button className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5">
                      <Download className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1.5 hidden group-focus-within:block group-hover:block bg-slate-950 border border-slate-800 rounded-xl py-1 z-30 shadow-2xl min-w-[120px]">
                      <button onClick={() => handleExport('whitelist', 'txt')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export TXT</button>
                      <button onClick={() => handleExport('whitelist', 'csv')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export CSV</button>
                      <button onClick={() => handleExport('whitelist', 'json')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export JSON</button>
                    </div>
                  </div>
                  <button
                    onClick={() => loadData(selectedServerId)}
                    className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5"
                    title="Reload"
                  >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="px-4 py-3 border-b border-white/5 shrink-0 bg-slate-950/20">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchWhitelist}
                    onChange={(e) => setSearchWhitelist(e.target.value)}
                    placeholder="Search whitelisted players..."
                    className="w-full pl-9 pr-4 py-1.5 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Player list container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 scrollbar-thin">
                {filteredWhitelist.length > 0 ? (
                  filteredWhitelist.map((p) => (
                    <div key={p.steamId} className="group p-3.5 bg-slate-950/40 hover:bg-slate-950/80 border border-white/5 rounded-2xl flex items-center justify-between gap-4 transition-all">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200 text-xs truncate">{p.playerName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[8px] uppercase tracking-wider">{p.platform}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-1.5">
                          <span>{p.steamId}</span>
                          <button onClick={() => handleCopy(p.steamId, 'Steam ID')} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-opacity">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleMovePlayer('whitelist', 'admins', p)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                          title="Promote to Admin"
                        >
                          <Shield className="w-3.5 h-3.5 text-amber-400" />
                        </button>
                        <button
                          onClick={() => openEditDialog('whitelist', p)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                          title="Edit Info"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemovePlayer('whitelist', p.steamId)}
                          className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16">
                    <CheckCircle className="w-8 h-8 opacity-20 mb-2" />
                    <span className="text-xs">No whitelisted players</span>
                  </div>
                )}
              </div>
            </div>

            {/* 🔒 EXCLUSIVE JOIN CARD */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl shadow-xl flex flex-col h-[650px] relative overflow-hidden">
              <div className="p-5 border-b border-white/5 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4 text-sky-400" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">Exclusive Join</h2>
                      <p className="text-[10px] text-slate-500">PlayersJoinNoCheckList.txt</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openAddDialog('exclusive')}
                      className="p-1.5 bg-slate-800/50 hover:bg-sky-500 hover:text-slate-950 text-slate-300 rounded-xl transition-all border border-white/5"
                      title="Add Exclusive Player"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <label className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5 cursor-pointer">
                      <Upload className="w-4 h-4" />
                      <input
                        type="file"
                        accept=".txt,.csv,.json"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleImport('exclusive', e.target.files[0])}
                      />
                    </label>
                    <div className="relative group">
                      <button className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5">
                        <Download className="w-4 h-4" />
                      </button>
                      <div className="absolute right-0 top-full mt-1.5 hidden group-focus-within:block group-hover:block bg-slate-950 border border-slate-800 rounded-xl py-1 z-30 shadow-2xl min-w-[120px]">
                        <button onClick={() => handleExport('exclusive', 'txt')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export TXT</button>
                        <button onClick={() => handleExport('exclusive', 'csv')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export CSV</button>
                        <button onClick={() => handleExport('exclusive', 'json')} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-slate-800">Export JSON</button>
                      </div>
                    </div>
                    <button
                      onClick={() => loadData(selectedServerId)}
                      className="p-1.5 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-white/5"
                      title="Reload"
                    >
                      <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                  </div>
                </div>

                {/* Exclusive Join Toggle */}
                {config && (
                  <div className="mt-4 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between shadow-inner">
                    <div className="flex items-center gap-2">
                      {config.enableExclusiveJoin ? (
                        <Lock className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Unlock className="w-4 h-4 text-slate-500" />
                      )}
                      <div>
                        <span className="text-xs font-bold text-white">Enable Exclusive Join</span>
                        <p className="text-[9px] text-slate-500 mt-0.5">Launches server with -exclusivejoin</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableExclusiveJoin || false}
                        onChange={(e) => handleExclusiveJoinToggle(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                    </label>
                  </div>
                )}
              </div>

              {/* Search Bar */}
              <div className="px-4 py-3 border-b border-white/5 shrink-0 bg-slate-950/20">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchExclusive}
                    onChange={(e) => setSearchExclusive(e.target.value)}
                    placeholder="Search exclusive players..."
                    className="w-full pl-9 pr-4 py-1.5 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Player list container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 scrollbar-thin">
                {filteredExclusive.length > 0 ? (
                  filteredExclusive.map((p) => (
                    <div key={p.steamId} className="group p-3.5 bg-slate-950/40 hover:bg-slate-950/80 border border-white/5 rounded-2xl flex items-center justify-between gap-4 transition-all">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200 text-xs truncate">{p.playerName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[8px] uppercase tracking-wider">{p.platform}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-1.5">
                          <span>{p.steamId}</span>
                          <button onClick={() => handleCopy(p.steamId, 'Steam ID')} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-opacity">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditDialog('exclusive', p)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                          title="Edit Info"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemovePlayer('exclusive', p.steamId)}
                          className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16">
                    <Lock className="w-8 h-8 opacity-20 mb-2" />
                    <span className="text-xs">No exclusive join players</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* RCON Online Players Panel */}
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl backdrop-blur-md relative overflow-hidden">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Online Players (RCON)
            </h3>
            
            {rconState?.isConnected ? (
              <div className="mt-4 overflow-x-auto">
                {rconState.onlinePlayers && rconState.onlinePlayers.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-400 pb-2">
                        <th className="py-2.5 font-semibold">Player Name</th>
                        <th className="py-2.5 font-semibold">SteamID64</th>
                        <th className="py-2.5 font-semibold text-right">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rconState.onlinePlayers.map((player: { name: string; steamId: string }) => {
                        const isPlayerAdmin = players.admins.some(p => p.steamId === player.steamId);
                        const isPlayerWhitelisted = players.whitelist.some(p => p.steamId === player.steamId);
                        const isPlayerExclusive = players.exclusive.some(p => p.steamId === player.steamId);

                        const pObj: AsePlayer = {
                          steamId: player.steamId,
                          playerName: player.name,
                          platform: 'Steam',
                          dateAdded: new Date().toISOString().split('T')[0]
                        };

                        return (
                          <tr key={player.steamId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-3 font-medium text-slate-200">{player.name}</td>
                            <td className="py-3 font-mono text-slate-400">{player.steamId}</td>
                            <td className="py-3 text-right space-x-1.5">
                              <button
                                disabled={isPlayerAdmin}
                                onClick={() => handleMovePlayer('whitelist', 'admins', pObj)}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-bold transition-all border",
                                  isPlayerAdmin 
                                    ? "bg-amber-500/10 text-amber-400/50 border-amber-500/10" 
                                    : "bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-400 border-amber-500/20"
                                )}
                              >
                                {isPlayerAdmin ? 'Admin' : '+ Admin'}
                              </button>
                              <button
                                disabled={isPlayerWhitelisted}
                                onClick={() => handleMovePlayer('admins', 'whitelist', pObj)}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-bold transition-all border",
                                  isPlayerWhitelisted
                                    ? "bg-emerald-500/10 text-emerald-400/50 border-emerald-500/10"
                                    : "bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 border-emerald-500/20"
                                )}
                              >
                                {isPlayerWhitelisted ? 'Whitelisted' : '+ Whitelist'}
                              </button>
                              <button
                                disabled={isPlayerExclusive}
                                onClick={() => handleMovePlayer('admins', 'exclusive', pObj)}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-bold transition-all border",
                                  isPlayerExclusive
                                    ? "bg-sky-500/10 text-sky-400/50 border-sky-500/10"
                                    : "bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-sky-400 border-sky-500/20"
                                )}
                              >
                                {isPlayerExclusive ? 'Exclusive' : '+ Exclusive'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-slate-500 text-xs py-4 text-center">No players currently online.</p>
                )}
              </div>
            ) : (
              <div className="mt-4 p-4 bg-slate-950/40 border border-white/5 rounded-2xl flex items-center justify-between">
                <span className="text-slate-400 text-xs">Connect to RCON to monitor online players and manage them instantly.</span>
                <span className="px-2 py-1 bg-slate-800 text-slate-400 border border-white/5 rounded-lg text-[10px] font-bold uppercase">RCON Offline</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-slate-800 rounded-3xl min-h-[300px]">
          <Users className="w-12 h-12 text-slate-600 animate-pulse mb-3" />
          <span className="text-sm text-slate-400">Please select an ASE Server to begin.</span>
        </div>
      )}

      {/* Add / Edit Player Dialog Modal */}
      <AnimatePresence>
        {dialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 space-y-4"
            >
              <h3 className="text-sm font-bold text-white">
                {dialogMode === 'add' ? 'Add Player to ' : 'Edit Player in '}
                <span className="text-amber-400 capitalize">{dialogTargetList}</span>
              </h3>

              <div className="space-y-3.5 text-xs text-slate-300">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-400">SteamID64 (17 digits)</label>
                  <input
                    type="text"
                    disabled={dialogMode === 'edit'}
                    value={dialogPlayer.steamId || ''}
                    onChange={(e) => setDialogPlayer(prev => ({ ...prev, steamId: e.target.value }))}
                    placeholder="e.g. 76561198000000000"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/50 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-400">Epic Account ID (optional)</label>
                  <input
                    type="text"
                    value={dialogPlayer.epicId || ''}
                    onChange={(e) => setDialogPlayer(prev => ({ ...prev, epicId: e.target.value }))}
                    placeholder="e.g. 0002f23..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/50 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-400">Player Name</label>
                  <input
                    type="text"
                    value={dialogPlayer.playerName || ''}
                    onChange={(e) => setDialogPlayer(prev => ({ ...prev, playerName: e.target.value }))}
                    placeholder="e.g. John Doe"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/50 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-400">Platform</label>
                  <select
                    value={dialogPlayer.platform || 'Steam'}
                    onChange={(e) => setDialogPlayer(prev => ({ ...prev, platform: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/50 text-white"
                  >
                    <option value="Steam">Steam</option>
                    <option value="Epic">Epic Games</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-400">Notes / Reasons</label>
                  <textarea
                    value={dialogPlayer.notes || ''}
                    onChange={(e) => setDialogPlayer(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Add notes about this player..."
                    rows={3}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/50 text-white resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setDialogOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDialogSave}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl transition-colors text-xs font-bold"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
