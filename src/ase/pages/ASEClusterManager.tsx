import { useState } from 'react';
import { Network, Plus, FolderOpen, Link, Unlink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { createAseCluster } from '../utils/aseCommands';
import type { AseCluster } from '../types/ase.types';
import { getAseMapDisplayName } from '../data/aseMaps';

export default function ASEClusterManager() {
  const { servers } = useAseServerStore();
  const [clusters, setClusters] = useState<AseCluster[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [clusterName, setClusterName] = useState('');
  const [clusterDir, setClusterDir] = useState('');

  const handleCreate = async () => {
    if (!clusterName.trim()) return;
    try {
      const cluster = await createAseCluster(clusterName, clusterDir || `C:\\clusters\\${clusterName.replace(/\s+/g, '_')}`);
      setClusters(prev => [...prev, cluster]);
      toast.success('Cluster created');
      setShowCreate(false); setClusterName(''); setClusterDir('');
    } catch (e) { toast.error(`${e}`); }
  };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><div className="p-2.5 bg-amber-500/10 rounded-xl"><Network className="w-6 h-6 text-amber-400" /></div>ASE Cluster Manager</h1><p className="text-sm text-slate-400 mt-1">Link servers for cross-map transfers using clusterid</p></div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all focus:outline-none"><Plus className="w-4 h-4" />Create Cluster</button>
      </div>

      <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
        <Network className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="text-xs text-amber-300">ASE clustering uses <code className="bg-amber-500/10 px-1 rounded">-clusterid=name</code> and <code className="bg-amber-500/10 px-1 rounded">-ClusterDirOverride="path"</code> launch arguments. All servers in a cluster must share the same clusterid.</span>
      </div>

      {showCreate && (
        <div className="glass-panel rounded-2xl p-6 space-y-4 border border-amber-500/20">
          <h3 className="text-lg font-bold text-white">New Cluster</h3>
          <label className="block"><span className="text-sm text-slate-300 mb-1 block">Cluster Name</span><input type="text" value={clusterName} onChange={e => setClusterName(e.target.value)} placeholder="mycluster" className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 font-mono" /></label>
          <label className="block"><span className="text-sm text-slate-300 mb-1 block">Cluster Directory</span><input type="text" value={clusterDir} onChange={e => setClusterDir(e.target.value)} placeholder={`C:\\clusters\\${clusterName || 'cluster'}`} className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 font-mono text-xs" /></label>
          <div className="flex gap-2"><button onClick={handleCreate} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold transition-all focus:outline-none">Create</button><button onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-slate-400 hover:text-white border border-white/10 rounded-xl text-sm transition-colors focus:outline-none">Cancel</button></div>
        </div>
      )}

      {clusters.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-white/10 rounded-2xl"><Network className="w-16 h-16 text-slate-600 mx-auto mb-4" /><h3 className="text-xl font-semibold text-slate-300 mb-2">No Clusters</h3><p className="text-slate-500 text-sm">Create a cluster to link multiple ASE servers for cross-map transfers</p></div>
      ) : (
        <div className="space-y-4">{clusters.map(c => (
          <div key={c.id} className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-white">{c.name}</h3><span className="text-xs text-slate-500 font-mono">clusterid={c.name}</span></div>
            <p className="text-xs text-slate-500 mb-3"><FolderOpen className="w-3 h-3 inline mr-1" />{c.clusterDir}</p>
            <div className="space-y-2">{servers.filter(s => c.serverIds.includes(s.id)).map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl"><div className="flex items-center gap-3"><Link className="w-4 h-4 text-amber-400" /><span className="text-sm text-white">{s.name}</span><span className="text-xs text-slate-500">{getAseMapDisplayName(s.mapName)}</span></div><button className="text-xs text-slate-500 hover:text-rose-400 transition-colors focus:outline-none"><Unlink className="w-4 h-4" /></button></div>
            ))}</div>
          </div>
        ))}</div>
      )}
    </motion.div>
  );
}
