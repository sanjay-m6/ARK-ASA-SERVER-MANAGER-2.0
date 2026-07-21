import { useState, useEffect } from 'react';
import { Database, Plus, RotateCcw, Trash2, HardDrive } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { createAseBackup, listAseBackups, restoreAseBackup, deleteAseBackup } from '../utils/aseCommands';
import { formatBytes } from '../../utils/helpers';
import type { AseBackup } from '../types/ase.types';


export default function ASEBackups() {
  const { activeServer } = useAseServerStore();
  const [selectedServer, setSelectedServer] = useState<number | null>(() => activeServer?.id || null);
  const [backups, setBackups] = useState<AseBackup[]>([]);

  useEffect(() => {
    if (activeServer) {
      setSelectedServer(activeServer.id);
    }
  }, [activeServer]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => { if (selectedServer) loadBackups(selectedServer); }, [selectedServer]);
  const loadBackups = async (id: number) => { try { const b = await listAseBackups(id); setBackups(b); } catch { setBackups([]); } };
  const handleCreate = async () => { if (!selectedServer) return; setIsCreating(true); try { await createAseBackup(selectedServer); toast.success('Backup created'); loadBackups(selectedServer); } catch (e) { toast.error(`${e}`); } finally { setIsCreating(false); } };
  const handleRestore = async (id: number) => { if (!confirm('Restore this backup? Current save data will be overwritten.')) return; try { await restoreAseBackup(id); toast.success('Backup restored'); } catch (e) { toast.error(`${e}`); } };
  const handleDelete = async (id: number) => { if (!confirm('Delete this backup?')) return; try { await deleteAseBackup(id); setBackups(prev => prev.filter(b => b.id !== id)); toast.success('Backup deleted'); } catch (e) { toast.error(`${e}`); } };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><div className="p-2.5 bg-amber-500/10 rounded-xl"><Database className="w-6 h-6 text-amber-400" /></div>ASE Backups</h1><p className="text-sm text-slate-400 mt-1">Backup .ark save files, tribes, and profiles</p></div>
        <div className="flex items-center gap-3">

          <button onClick={handleCreate} disabled={isCreating || !selectedServer} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all focus:outline-none"><Plus className="w-4 h-4" />{isCreating ? 'Creating...' : 'Create Backup'}</button>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl"><HardDrive className="w-4 h-4 text-amber-400 flex-shrink-0" /><span className="text-xs text-amber-300">Backups include: SavedArks/ (.ark world saves, .arktribe, .arkprofile, .arktributetribute files)</span></div>

      {backups.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-white/10 rounded-2xl"><Database className="w-16 h-16 text-slate-600 mx-auto mb-4" /><h3 className="text-xl font-semibold text-slate-300 mb-2">No Backups</h3><p className="text-slate-500 text-sm">Create your first backup to protect your world data</p></div>
      ) : (
        <div className="space-y-3">{backups.map(b => (
          <div key={b.id} className="glass-panel rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4"><Database className="w-5 h-5 text-amber-400" /><div><p className="text-sm font-medium text-white">{new Date(b.createdAt).toLocaleString()}</p><p className="text-xs text-slate-500 mt-0.5">{formatBytes(b.sizeBytes)}</p></div></div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleRestore(b.id)} className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-bold flex items-center gap-1 transition-all focus:outline-none"><RotateCcw className="w-3.5 h-3.5" />Restore</button>
              <button onClick={() => handleDelete(b.id)} className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors focus:outline-none"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}</div>
      )}
    </motion.div>
  );
}
