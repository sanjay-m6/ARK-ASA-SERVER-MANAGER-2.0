import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { getAseScheduledTasks, createAseScheduledTask, toggleAseScheduledTask, deleteAseScheduledTask } from '../utils/aseCommands';
import type { AseScheduledTask } from '../types/ase.types';
import ServerSelect from '../../components/ui/ServerSelect';

export default function ASEScheduler() {
  const { servers, refreshServers } = useAseServerStore();
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [tasks, setTasks] = useState<AseScheduledTask[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState<AseScheduledTask['taskType']>('restart');
  const [newCron, setNewCron] = useState('0 */6 * * *');

  useEffect(() => {
    refreshServers();
  }, []);

  useEffect(() => {
    if (servers.length > 0 && selectedServer === null) {
      setSelectedServer(servers[0].id);
    }
  }, [servers, selectedServer]);

  useEffect(() => {
    if (selectedServer) {
      loadTasks(selectedServer);
    }
  }, [selectedServer]);

  const loadTasks = async (id: number) => {
    try {
      const t = await getAseScheduledTasks(id);
      setTasks(t);
    } catch {
      setTasks([]);
    }
  };

  const handleCreate = async () => {
    if (!selectedServer) return;
    try { const t = await createAseScheduledTask({ serverId: selectedServer, taskType: newType, cronExpr: newCron, enabled: true }); setTasks(prev => [...prev, t]); setShowCreate(false); toast.success('Task created'); } catch (e) { toast.error(`${e}`); }
  };
  const handleToggle = async (id: number, enabled: boolean) => { try { await toggleAseScheduledTask(id, !enabled); setTasks(prev => prev.map(t => t.id === id ? { ...t, enabled: !enabled } : t)); } catch (e) { toast.error(`${e}`); } };
  const handleDelete = async (id: number) => { try { await deleteAseScheduledTask(id); setTasks(prev => prev.filter(t => t.id !== id)); toast.success('Task deleted'); } catch (e) { toast.error(`${e}`); } };

  const typeLabels: Record<string, string> = { restart: '🔄 Restart', update: '📥 Update', backup: '💾 Backup', wipe_dinos: '🦕 Wipe Dinos' };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><div className="p-2.5 bg-amber-500/10 rounded-xl"><Clock className="w-6 h-6 text-amber-400" /></div>ASE Scheduler</h1><p className="text-sm text-slate-400 mt-1">Automated tasks for ASE servers</p></div>
        <div className="flex items-center gap-3">
          <ServerSelect value={selectedServer} onChange={setSelectedServer} servers={servers} accentColor="amber" />
          <button onClick={() => setShowCreate(true)} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all focus:outline-none"><Plus className="w-4 h-4" />Add Task</button>
        </div>
      </div>

      {showCreate && (
        <div className="glass-panel rounded-2xl p-6 space-y-4 border border-amber-500/20">
          <h3 className="text-lg font-bold text-white">New Scheduled Task</h3>
          <label className="block"><span className="text-sm text-slate-300 mb-1 block">Task Type</span><select value={newType} onChange={e => setNewType(e.target.value as any)} className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-500/30">{Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="text-sm text-slate-300 mb-1 block">Cron Expression</span><input type="text" value={newCron} onChange={e => setNewCron(e.target.value)} placeholder="0 */6 * * *" className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-amber-500/30" /><p className="text-xs text-slate-500 mt-1">Example: 0 */6 * * * = every 6 hours</p></label>
          <div className="flex gap-2"><button onClick={handleCreate} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold transition-all focus:outline-none">Create</button><button onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-slate-400 hover:text-white border border-white/10 rounded-xl text-sm transition-colors focus:outline-none">Cancel</button></div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-white/10 rounded-2xl"><Clock className="w-16 h-16 text-slate-600 mx-auto mb-4" /><h3 className="text-xl font-semibold text-slate-300 mb-2">No Scheduled Tasks</h3><p className="text-slate-500 text-sm">Set up automated restarts, backups, and updates</p></div>
      ) : (
        <div className="space-y-3">{tasks.map(t => (
          <div key={t.id} className="glass-panel rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4"><div className="text-lg">{typeLabels[t.taskType]?.split(' ')[0] || '⏰'}</div><div><p className="text-sm font-medium text-white">{typeLabels[t.taskType]?.split(' ').slice(1).join(' ') || t.taskType}</p><p className="text-xs text-slate-500 font-mono mt-0.5">{t.cronExpr}{t.lastRun ? ` • Last: ${new Date(t.lastRun).toLocaleString()}` : ''}</p></div></div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleToggle(t.id, t.enabled)} className={`p-2 rounded-lg transition-colors focus:outline-none ${t.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>{t.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}</button>
              <button onClick={() => handleDelete(t.id)} className="p-2 text-slate-500 hover:text-rose-400 transition-colors focus:outline-none"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}</div>
      )}
    </motion.div>
  );
}
