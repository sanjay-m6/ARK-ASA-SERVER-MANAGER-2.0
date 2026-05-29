import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Activity, Cpu, HardDrive, Zap, Terminal, Puzzle,
  Play, Square, RotateCw, Clock, Database, FileEdit, TrendingUp,
  Folder, FolderOpen, Heart, Bookmark, Search, Globe
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, Variants } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../utils/helpers';
import { getSystemInfo } from '../../utils/tauri';
import { startAseServer, stopAseServer } from '../utils/aseCommands';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import PerformanceMonitor from '../../components/performance/PerformanceMonitor';
import SponsorBanner from '../../components/ui/SponsorBanner';
import { getAseMapDisplayName } from '../data/aseMaps';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function ASEDashboard() {
  const { servers, updateServerStatus, refreshServers } = useAseServerStore();
  const { systemInfo, setSystemInfo } = useUIStore();
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([]);
  const navigate = useNavigate();

  // Organization States
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchOrgSnapshot = async () => {
    try {
      const snap = await import('../../utils/serverOrganization').then(m => m.getOrganizationSnapshot());
      setSnapshot(snap);
    } catch (e) {
      console.error('Failed to load organization snapshot:', e);
    }
  };

  useEffect(() => {
    fetchOrgSnapshot();
  }, [servers]);

  const filteredServers = servers.filter(server => {
    const isArchived = snapshot?.servers?.find((s: any) => s.id === server.id)?.archiveInfo;
    if (isArchived) return false;

    // Search query
    const cust = snapshot?.servers?.find((s: any) => s.id === server.id)?.customization;
    const displayName = cust?.display_name || server.name;
    const matchesSearch = displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (server.mapName || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Folder category
    if (selectedFolderId !== null) {
      const serverFolderIds = snapshot?.servers?.find((s: any) => s.id === server.id)?.folderIds || [];
      if (!serverFolderIds.includes(selectedFolderId)) return false;
    }

    return true;
  });

  const handleStart = async (id: number) => {
    try { updateServerStatus(id, 'starting'); await startAseServer(id); toast.success('Server started'); }
    catch (e) { updateServerStatus(id, 'stopped'); toast.error(`Failed: ${e}`); }
  };
  const handleStop = async (id: number) => {
    try { await stopAseServer(id); updateServerStatus(id, 'stopped'); toast.success('Server stopped'); }
    catch (e) { toast.error(`Failed: ${e}`); }
  };

  useEffect(() => {
    refreshServers();
    const fetchSys = async () => {
      try {
        const info = await getSystemInfo();
        setSystemInfo(info);
        // Compute total player count from backend player intelligence service
        let totalPlayers = 0;
        try {
          const counts = await invoke<Record<string, number>>('get_player_counts');
          totalPlayers = Object.values(counts).reduce((sum: number, count: number) => sum + count, 0);
        } catch (e) {
          console.error("Failed to fetch player counts", e);
        }

        setPerformanceHistory(prev => {
          const now = new Date();
          const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
          const pt = { time: t, cpu: Math.round(info.cpuUsage*10)/10, memory: Math.round((info.ramUsage/info.ramTotal)*1000)/10, players: totalPlayers };
          const h = [...prev, pt]; if (h.length > 60) h.shift(); return h;
        });
      } catch {}
    };
    fetchSys();
    let unsub: () => void;
    listen<{ server_id: number; status: any }>('ase-server-status-change', (e) => { updateServerStatus(e.payload.server_id, e.payload.status); }).then(u => { unsub = u; });
    const i1 = setInterval(fetchSys, 10000);
    const i2 = setInterval(refreshServers, 3000);
    return () => { clearInterval(i1); clearInterval(i2); if (unsub) unsub(); };
  }, []);

  const running = servers.filter(s => s.status === 'running' || s.status === 'online').length;
  const stopped = servers.filter(s => s.status === 'stopped').length;
  const memPct = systemInfo ? (systemInfo.ramUsage / systemInfo.ramTotal) * 100 : 0;
  const diskPct = systemInfo ? (systemInfo.diskUsage / systemInfo.diskTotal) * 100 : 0;

  const actions = [
    { name: 'Deploy Server', icon: Zap, path: '/ase/servers', color: 'amber' },
    { name: 'Server Manager', icon: Server, path: '/ase/servers', color: 'emerald' },
    { name: 'Config Editor', icon: FileEdit, path: '/ase/config', color: 'orange' },
    { name: 'RCON Console', icon: Terminal, path: '/ase/rcon', color: 'cyan' },
    { name: 'Mod Manager', icon: Puzzle, path: '/ase/mods', color: 'pink' },
    { name: 'Backups', icon: Database, path: '/ase/backups', color: 'teal' },
    { name: 'Scheduler', icon: Clock, path: '/ase/scheduler', color: 'rose' },
    { name: 'Environment', icon: Globe, path: '/ase/environment', color: 'lime' },
  ];

  const cMap: Record<string,string> = { amber:'hover:border-amber-500/50 hover:bg-amber-500/5', emerald:'hover:border-emerald-500/50 hover:bg-emerald-500/5', orange:'hover:border-orange-500/50 hover:bg-orange-500/5', cyan:'hover:border-cyan-500/50 hover:bg-cyan-500/5', pink:'hover:border-pink-500/50 hover:bg-pink-500/5', teal:'hover:border-teal-500/50 hover:bg-teal-500/5', rose:'hover:border-rose-500/50 hover:bg-rose-500/5', lime:'hover:border-lime-500/50 hover:bg-lime-500/5' };
  const iMap: Record<string,string> = { amber:'text-amber-400 bg-amber-500/10', emerald:'text-emerald-400 bg-emerald-500/10', orange:'text-orange-400 bg-orange-500/10', cyan:'text-cyan-400 bg-cyan-500/10', pink:'text-pink-400 bg-pink-500/10', teal:'text-teal-400 bg-teal-500/10', rose:'text-rose-400 bg-rose-500/10', lime:'text-lime-400 bg-lime-500/10' };

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">
      <div className="flex items-center gap-3 mb-2">
        <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
          <span className="text-xs font-bold text-amber-400 tracking-wider uppercase">ARK: Survival Evolved</span>
        </div>
        <span className="text-xs text-slate-500">UE4 • Steam Workshop • AppID 376030</span>
      </div>

      {/* Sponsor Banner */}
      <SponsorBanner />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label:'Total Servers', val: servers.length, icon: Server, color:'amber', sub:'ASE Instances' },
          { label:'Running', val: running, icon: Activity, color:'green', sub:'Online', valColor:'text-green-400' },
          { label:'Stopped', val: stopped, icon: Square, color:'slate', sub:'Offline', valColor:'text-slate-400' },
        ].map(s => (
          <div key={s.label} className={`glass-panel rounded-xl p-4 group hover:border-${s.color}-500/30 transition-all`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 bg-${s.color}-500/10 rounded-lg`}><s.icon className={`w-4 h-4 text-${s.color}-400`} /></div>
              <span className="text-xs text-slate-400 uppercase tracking-wider">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.valColor || 'text-white'}`}>{s.val}</p>
            <p className="text-xs text-slate-500 mt-1">{s.sub}</p>
          </div>
        ))}
        <div className="glass-panel rounded-xl p-4 group hover:border-violet-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-violet-500/10 rounded-lg"><Cpu className="w-4 h-4 text-violet-400" /></div><span className="text-xs text-slate-400 uppercase tracking-wider">CPU</span></div>
          <p className="text-2xl font-bold text-white">{systemInfo?.cpuUsage.toFixed(0) || 0}%</p>
          <div className="w-full bg-slate-700/50 rounded-full h-1 mt-2"><div className="bg-violet-500 h-1 rounded-full transition-all" style={{width:`${systemInfo?.cpuUsage||0}%`}}></div></div>
        </div>
        <div className="glass-panel rounded-xl p-4 group hover:border-pink-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-pink-500/10 rounded-lg"><TrendingUp className="w-4 h-4 text-pink-400" /></div><span className="text-xs text-slate-400 uppercase tracking-wider">RAM</span></div>
          <p className="text-2xl font-bold text-white">{memPct.toFixed(0)}%</p>
          <div className="w-full bg-slate-700/50 rounded-full h-1 mt-2"><div className="bg-pink-500 h-1 rounded-full transition-all" style={{width:`${memPct}%`}}></div></div>
        </div>
        <div className="glass-panel rounded-xl p-4 group hover:border-amber-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-amber-500/10 rounded-lg"><HardDrive className="w-4 h-4 text-amber-400" /></div><span className="text-xs text-slate-400 uppercase tracking-wider">Disk</span></div>
          <p className="text-2xl font-bold text-white">{diskPct.toFixed(0)}%</p>
          <div className="w-full bg-slate-700/50 rounded-full h-1 mt-2"><div className="bg-amber-500 h-1 rounded-full transition-all" style={{width:`${diskPct}%`}}></div></div>
        </div>
      </div>

      {/* Server Hub */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <span className="text-amber-400 font-mono font-black leading-none mt-0.5">{'>_'}</span>
            <span className="tracking-wide">ASE Server Control Hub</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search server..."
                className="pl-9 pr-4 py-1.5 bg-[#0A0F1C]/80 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/30 w-48"
              />
            </div>
            <button
              onClick={() => navigate('/ase/tools/organization')}
              className="text-xs font-semibold px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl transition-all"
            >
              Organize Nodes
            </button>
            <button
              onClick={() => navigate('/ase/servers')}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 focus:outline-none"
            >
              Manage All →
            </button>
          </div>
        </div>

        {/* Folders category filters */}
        {snapshot?.folders && snapshot.folders.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 p-2 bg-white/[0.01] border border-white/5 rounded-2xl">
            <button
              onClick={() => setSelectedFolderId(null)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none',
                selectedFolderId === null
                  ? 'bg-amber-500 text-slate-900'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
              )}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>All Nodes</span>
            </button>
            {snapshot.folders.map((folder: any) => {
              const isActive = selectedFolderId === folder.id;
              return (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none border border-transparent',
                    isActive
                      ? 'text-slate-900'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300'
                  )}
                  style={isActive ? { backgroundColor: folder.color } : { borderLeft: `3px solid ${folder.color}` }}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>{folder.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {filteredServers.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-xl">
            <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No ASE Servers</h3>
            <p className="text-slate-500 text-sm mb-4">Deploy your first ARK: Survival Evolved server</p>
            <button onClick={() => navigate('/ase/servers')} className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg transition-all text-sm font-medium focus:outline-none">Deploy ASE Server</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredServers.map(srv => {
              const cust = snapshot?.servers?.find((s: any) => s.id === srv.id)?.customization;
              const displayName = cust?.display_name || srv.name;
              const hasColor = !!cust?.color_tag;

              return (
                <div
                  key={srv.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all gap-4 lg:gap-0 relative overflow-hidden"
                >
                  {/* Custom Brand line indicator */}
                  {hasColor && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1"
                      style={{ backgroundColor: cust.color_tag }}
                    />
                  )}

                  <div className="flex items-center gap-4 pl-2">
                    <div className={cn('w-2.5 h-2.5 rounded-full', srv.status==='online'&&'bg-emerald-500', srv.status==='running'&&'bg-amber-500 animate-pulse', srv.status==='stopped'&&'bg-slate-500', srv.status==='crashed'&&'bg-rose-500', srv.status==='starting'&&'bg-amber-500 animate-pulse')} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-200">{displayName}</h3>
                        {cust?.favorite && <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                        {cust?.is_pinned && <Bookmark className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                        <p className="text-xs text-slate-400">{getAseMapDisplayName(srv.mapName)} • Game:{srv.port} • Query:{srv.queryPort} • RCON:{srv.rconPort}</p>
                        {cust?.tags && cust.tags.map((tg: string) => (
                          <span key={tg} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-slate-400 font-medium">
                            {tg}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {(srv.status==='stopped'||srv.status==='crashed') ? <button onClick={()=>handleStart(srv.id)} className="w-[34px] h-[34px] flex items-center justify-center bg-[#17302b] hover:bg-[#1f423b] text-emerald-400 border border-[#234c44] rounded transition-all focus:outline-none"><Play className="w-4 h-4 fill-current ml-0.5" /></button>
                    : (srv.status==='running'||srv.status==='online') ? <button onClick={()=>handleStop(srv.id)} className="w-[34px] h-[34px] flex items-center justify-center bg-[#311719] hover:bg-[#472224] text-rose-400 border border-[#5a2a2d] rounded transition-all focus:outline-none"><Square className="w-4 h-4 fill-current" /></button>
                    : <button disabled className="w-[34px] h-[34px] flex items-center justify-center bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded opacity-50 cursor-not-allowed focus:outline-none"><RotateCw className="w-4 h-4 animate-spin" /></button>}
                    <div className={cn("w-[85px] h-[34px] rounded text-[10px] font-bold tracking-[0.05em] border uppercase flex items-center justify-center", srv.status==='online'?'bg-[#17302b] text-emerald-400 border-[#234c44]':srv.status==='running'?'bg-[#332514] text-amber-400 border-[#5c4324]':srv.status==='crashed'?'bg-[#311719] text-rose-400 border-[#5a2a2d]':'bg-[#1a202c] text-slate-400 border-white/5')}>{srv.status.toUpperCase()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="glass-panel rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-400" />Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {actions.map(a => { const I = a.icon; return (
            <button key={a.name} onClick={()=>navigate(a.path)} className={cn("p-4 glass-panel rounded-xl transition-all text-center group", cMap[a.color])}>
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform", iMap[a.color])}><I className="w-5 h-5" /></div>
              <p className="text-xs font-medium text-white whitespace-nowrap">{a.name}</p>
            </button>
          ); })}
        </div>
      </div>

      <PerformanceMonitor data={performanceHistory} />
    </motion.div>
  );
}
