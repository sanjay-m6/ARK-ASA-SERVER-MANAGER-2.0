import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw, Users, Shield, Loader2, Server, Check, ArrowRight,
  Calendar, HardDrive, Filter, AlertCircle
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ServerSelect from '../../components/ui/ServerSelect';

interface ASEServer {
  id: number;
  name: string;
  install_path: string;
  map_name: string;
  status: string;
}

interface ProfileInfo {
  file_name: String;
  file_size: number;
  last_modified: string;
  file_type: 'profile' | 'tribe';
}

export default function ASEProfileSync() {
  const [servers, setServers] = useState<ASEServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'admin'>('profile');

  const mappedServers = useMemo(() => servers.map(s => ({
    id: s.id,
    name: s.name,
    mapName: s.map_name,
    status: s.status
  })), [servers]);

  // Profile Migrator State
  const [sourceServer, setSourceServer] = useState<number | ''>('');
  const [targetServer, setTargetServer] = useState<number | ''>('');
  const targetOptions = useMemo(() => mappedServers.filter(s => s.id !== sourceServer), [mappedServers, sourceServer]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [isProfilesLoading, setIsProfilesLoading] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [profileSearch, setProfileSearch] = useState('');
  const [profileTypeFilter, setProfileTypeFilter] = useState<'all' | 'profile' | 'tribe'>('all');

  // Admin Lists Sync State
  const [adminSourceServer, setAdminSourceServer] = useState<number | ''>('');
  const [adminTargetServers, setAdminTargetServers] = useState<number[]>([]);
  const [syncWhitelist, setSyncWhitelist] = useState(true);
  const [syncAdmins, setSyncAdmins] = useState(true);
  const [syncBans, setSyncBans] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load servers on mount
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const data = await invoke<ASEServer[]>('get_ase_servers');
        setServers(data);
        if (data.length > 0) {
          setSourceServer(data[0].id);
          setAdminSourceServer(data[0].id);
          if (data.length > 1) {
            setTargetServer(data[1].id);
          }
        }
      } catch (err) {
        console.error('Failed to load ASE servers', err);
        toast.error('Failed to load server list');
      } finally {
        setIsLoading(false);
      }
    };
    fetchServers();
  }, []);

  // Fetch profiles when source server changes
  useEffect(() => {
    if (!sourceServer) {
      setProfiles([]);
      return;
    }

    const loadProfiles = async () => {
      setIsProfilesLoading(true);
      setSelectedProfiles([]);
      try {
        const data = await invoke<ProfileInfo[]>('list_ase_profiles', { serverId: sourceServer });
        setProfiles(data);
      } catch (err) {
        console.error(err);
        toast.error('Failed to retrieve server profile saves');
      } finally {
        setIsProfilesLoading(false);
      }
    };

    loadProfiles();
  }, [sourceServer]);

  const handleMigrate = async () => {
    if (!sourceServer) {
      toast.error('Please select a source server');
      return;
    }
    if (!targetServer) {
      toast.error('Please select a target server');
      return;
    }
    if (sourceServer === targetServer) {
      toast.error('Source and target server cannot be the same');
      return;
    }
    if (selectedProfiles.length === 0) {
      toast.error('Please select at least one file to migrate');
      return;
    }

    setIsMigrating(true);
    try {
      await invoke('copy_ase_profiles', {
        sourceServerId: sourceServer,
        targetServerId: targetServer,
        fileNames: selectedProfiles
      });
      toast.success(`Successfully migrated ${selectedProfiles.length} save files!`);
      setSelectedProfiles([]);
    } catch (err) {
      console.error(err);
      toast.error(`Migration failed: ${err}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSyncAdminLists = async () => {
    if (!adminSourceServer) {
      toast.error('Please select a source server');
      return;
    }
    if (adminTargetServers.length === 0) {
      toast.error('Please select at least one target server');
      return;
    }
    if (!syncWhitelist && !syncAdmins && !syncBans) {
      toast.error('Please select at least one list type to sync');
      return;
    }

    setIsSyncing(true);
    try {
      await invoke('sync_ase_lists', {
        sourceServerId: adminSourceServer,
        targetServerIds: adminTargetServers,
        syncWhitelist,
        syncAdmins,
        syncBans
      });
      toast.success('Successfully synchronized administrative lists!');
    } catch (err) {
      console.error(err);
      toast.error(`Sync failed: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleSelectProfile = (fileName: string) => {
    setSelectedProfiles(prev =>
      prev.includes(fileName) ? prev.filter(f => f !== fileName) : [...prev, fileName]
    );
  };

  const handleSelectAll = () => {
    if (selectedProfiles.length === filteredProfiles.length) {
      setSelectedProfiles([]);
    } else {
      setSelectedProfiles(filteredProfiles.map(p => String(p.file_name)));
    }
  };

  const toggleSelectTargetServer = (id: number) => {
    setAdminTargetServers(prev =>
      prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoStr: string): string => {
    if (!isoStr) return 'Unknown';
    try {
      const date = new Date(isoStr);
      return date.toLocaleString();
    } catch {
      return isoStr;
    }
  };

  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = p.file_name.toLowerCase().includes(profileSearch.toLowerCase());
    const matchesFilter = profileTypeFilter === 'all' || p.file_type === profileTypeFilter;
    return matchesSearch && matchesFilter;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 rounded-xl">
            <RefreshCw className="w-6 h-6 text-amber-400" />
          </div>
          Profile & Settings Sync
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Synchronize whitelist files, ban lists, admin settings, player profiles, and tribe saves between your ASE servers.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-900/50 border border-white/5 rounded-xl self-start w-fit">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'profile'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-4 h-4" />
          Player Profiles & Tribes
        </button>
        <button
          onClick={() => setActiveTab('admin')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'admin'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Shield className="w-4 h-4" />
          Settings & Lists Sync
        </button>
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        {activeTab === 'profile' ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Servers Selector bar */}
            <div className="bg-[#0A0F1C]/60 p-6 rounded-2xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-center backdrop-blur-xl transition-all duration-300">
              {/* Source Server */}
              <div className="lg:col-span-2 space-y-1.5">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Source Server</span>
                <ServerSelect
                  value={sourceServer === '' ? null : sourceServer}
                  onChange={val => setSourceServer(val ?? '')}
                  servers={mappedServers}
                  accentColor="amber"
                  className="w-full"
                />
              </div>

              {/* Arrow spacer */}
              <div className="flex justify-center text-amber-400 py-2 lg:py-0">
                <ArrowRight className="w-6 h-6 transform rotate-90 md:rotate-0" />
              </div>

              {/* Target Server */}
              <div className="lg:col-span-2 space-y-1.5">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Target Server</span>
                <ServerSelect
                  value={targetServer === '' ? null : targetServer}
                  onChange={val => setTargetServer(val ?? '')}
                  servers={targetOptions}
                  accentColor="amber"
                  className="w-full"
                />
              </div>
            </div>

            {/* Profile List Card */}
            <div className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[400px]">
              {/* Filter bar */}
              <div className="p-4 border-b border-white/5 bg-slate-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    value={profileSearch}
                    onChange={e => setProfileSearch(e.target.value)}
                    placeholder="Search files by SteamID or TribeID..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-white/5 rounded-xl text-xs focus:outline-none focus:border-amber-500/30 text-white"
                  />
                  <Filter className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setProfileTypeFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      profileTypeFilter === 'all' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Files
                  </button>
                  <button
                    onClick={() => setProfileTypeFilter('profile')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      profileTypeFilter === 'profile' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Player Profiles
                  </button>
                  <button
                    onClick={() => setProfileTypeFilter('tribe')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      profileTypeFilter === 'tribe' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tribes
                  </button>
                </div>
              </div>

              {/* Loader */}
              {isProfilesLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <span className="text-xs text-slate-400">Scanning SavedArks directory...</span>
                </div>
              ) : filteredProfiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center gap-3">
                  <AlertCircle className="w-10 h-10 text-slate-500" />
                  <div>
                    <h4 className="font-bold text-white text-sm">No Save Files Found</h4>
                    <p className="text-xs text-slate-400 mt-1">Make sure the source server has been started and has active player records.</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-left border-b border-white/5 bg-slate-900/30 text-xs font-bold text-slate-400 tracking-wider">
                        <th className="py-3 px-6 w-12">
                          <button
                            onClick={handleSelectAll}
                            className="w-4 h-4 rounded bg-slate-800 border border-white/10 flex items-center justify-center text-slate-950 focus:outline-none"
                          >
                            {selectedProfiles.length === filteredProfiles.length && (
                              <Check className="w-3.5 h-3.5 text-amber-400 stroke-[3]" />
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-4">Filename / ID</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Size</th>
                        <th className="py-3 px-4">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                      {filteredProfiles.map(p => {
                        const nameStr = String(p.file_name);
                        const isSelected = selectedProfiles.includes(nameStr);
                        return (
                          <tr
                            key={nameStr}
                            onClick={() => toggleSelectProfile(nameStr)}
                            className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                              isSelected ? 'bg-amber-500/[0.02]' : ''
                            }`}
                          >
                            <td className="py-3.5 px-6">
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                  isSelected ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-white/10 bg-slate-800'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-semibold text-white">
                              {nameStr}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                p.file_type === 'profile'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              }`}>
                                {p.file_type === 'profile' ? 'Player Profile' : 'Tribe Save'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 flex items-center gap-1.5">
                              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                              {formatBytes(p.file_size)}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-400">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                {formatDate(p.last_modified)}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sync bottom trigger bar */}
              {selectedProfiles.length > 0 && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="p-4 bg-slate-950/40 border-t border-amber-500/20 flex items-center justify-between"
                >
                  <span className="text-xs font-semibold text-amber-300">
                    {selectedProfiles.length} files selected for migration
                  </span>
                  <button
                    onClick={handleMigrate}
                    disabled={isMigrating}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl transition-all text-xs flex items-center gap-2 disabled:opacity-50"
                  >
                    {isMigrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Migrate Save Files
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="admin"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Configurations checklist */}
              <div className="lg:col-span-2 space-y-6">
                {/* Checkbox configs list */}
                <div className="glass-panel p-6 rounded-2xl space-y-6">
                  <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider border-b border-white/5 pb-3">Administrative Lists</h3>

                  <div className="space-y-4">
                    {/* Whitelist */}
                    <div
                      onClick={() => setSyncWhitelist(!syncWhitelist)}
                      className={`p-4 rounded-xl cursor-pointer border hover:border-white/20 transition-all flex items-start gap-4 ${
                        syncWhitelist ? 'border-amber-500/20 bg-amber-500/[0.02]' : 'border-white/5'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all mt-0.5 ${
                        syncWhitelist ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-white/10 bg-slate-800'
                      }`}>
                        {syncWhitelist && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                      <div className="space-y-1">
                        <span className="font-bold text-white text-sm">Player Whitelist</span>
                        <p className="text-xs text-slate-400">Synchronize whitelist file (<span className="font-mono text-slate-500 text-[10px]">PlayersExclusiveJoinList.txt</span>) to allow selected players joining.</p>
                      </div>
                    </div>

                    {/* Admin Access list */}
                    <div
                      onClick={() => setSyncAdmins(!syncAdmins)}
                      className={`p-4 rounded-xl cursor-pointer border hover:border-white/20 transition-all flex items-start gap-4 ${
                        syncAdmins ? 'border-amber-500/20 bg-amber-500/[0.02]' : 'border-white/5'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all mt-0.5 ${
                        syncAdmins ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-white/10 bg-slate-800'
                      }`}>
                        {syncAdmins && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                      <div className="space-y-1">
                        <span className="font-bold text-white text-sm">Server Admins List</span>
                        <p className="text-xs text-slate-400">Synchronize cheat permission list (<span className="font-mono text-slate-500 text-[10px]">AllowedCheaterSteamIDs.txt</span>) to grant admin access.</p>
                      </div>
                    </div>

                    {/* Ban List */}
                    <div
                      onClick={() => setSyncBans(!syncBans)}
                      className={`p-4 rounded-xl cursor-pointer border hover:border-white/20 transition-all flex items-start gap-4 ${
                        syncBans ? 'border-amber-500/20 bg-amber-500/[0.02]' : 'border-white/5'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all mt-0.5 ${
                        syncBans ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-white/10 bg-slate-800'
                      }`}>
                        {syncBans && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                      <div className="space-y-1">
                        <span className="font-bold text-white text-sm">Ban List</span>
                        <p className="text-xs text-slate-400">Synchronize ban records (<span className="font-mono text-slate-500 text-[10px]">BanList.txt</span>) to block problematic players across all nodes.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source/Targets Panel selectors */}
              <div className="space-y-6">
                {/* Source server */}
                <div className="bg-[#0A0F1C]/60 border border-white/5 rounded-2xl p-6 space-y-4 shadow-2xl backdrop-blur-xl">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Source Server</span>
                  <ServerSelect
                    value={adminSourceServer === '' ? null : adminSourceServer}
                    onChange={val => setAdminSourceServer(val ?? '')}
                    servers={mappedServers}
                    accentColor="amber"
                    className="w-full"
                  />
                </div>

                {/* Target servers multi-selector */}
                <div className="bg-[#0A0F1C]/60 border border-white/5 rounded-2xl p-6 space-y-4 shadow-2xl backdrop-blur-xl">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Target Servers</span>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto">
                    {servers.filter(s => s.id !== adminSourceServer).map(s => {
                      const isSelected = adminTargetServers.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => toggleSelectTargetServer(s.id)}
                          className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition-all hover:bg-white/[0.01] ${
                            isSelected ? 'border-amber-500/20 bg-amber-500/[0.01]' : 'border-white/5 bg-slate-900/30'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Server className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-white">{s.name}</span>
                              <span className="text-[10px] text-slate-400">{s.map_name}</span>
                            </div>
                          </div>
                          <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all ${
                            isSelected ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-white/10 bg-slate-800'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                    {servers.filter(s => s.id !== adminSourceServer).length === 0 && (
                      <span className="text-xs text-slate-500 italic block py-2">No other servers available</span>
                    )}
                  </div>
                </div>

                {/* Trigger Button */}
                <button
                  onClick={handleSyncAdminLists}
                  disabled={isSyncing}
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sync Administrative Settings
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
