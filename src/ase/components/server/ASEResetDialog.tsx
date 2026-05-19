import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Trash2, X, AlertTriangle, FileText, Globe, Activity } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';

interface ASEResetDialogProps {
  isOpen: boolean;
  serverId: number;
  serverName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ASEResetDialog({ isOpen, serverId, serverName, onClose, onSuccess }: ASEResetDialogProps) {
  const [options, setOptions] = useState({
    wipe_save: false,
    wipe_config: false,
    wipe_logs: false,
  });
  const [isResetting, setIsResetting] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  if (!isOpen) return null;

  const isConfirmValid = confirmName === serverName;
  const hasSelection = Object.values(options).some(v => v);

  const handleReset = async () => {
    if (!hasSelection || !isConfirmValid) return;
    setIsResetting(true);
    try {
      await invoke('reset_ase_server', { serverId, options });
      toast.success('Server data wiped successfully.');
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(`Reset failed: ${e}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-rose-500/30 rounded-2xl shadow-2xl shadow-rose-900/20 w-full max-w-lg overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-rose-500/10">
            <h2 className="text-xl font-bold text-rose-400 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6" />
              Reset Server Data
            </h2>
            <button
              onClick={onClose}
              disabled={isResetting}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-200">
                <p className="font-semibold mb-1">Warning: Data Loss</p>
                <p>This action will permanently delete selected files for <span className="font-bold text-white">{serverName}</span>. This cannot be undone unless you have a backup.</p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-300">Select what to wipe:</h3>
              
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${options.wipe_save ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-800/50 border-white/5 hover:border-white/10'}`}>
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={options.wipe_save}
                    onChange={e => setOptions(o => ({ ...o, wipe_save: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 text-rose-500 focus:ring-rose-500 bg-slate-900"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-white mb-1">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    World Save Data & Player Profiles
                  </div>
                  <p className="text-xs text-slate-400">Deletes SavedArks and LocalProfiles. Resets the map, buildings, and player characters completely.</p>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${options.wipe_config ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-800/50 border-white/5 hover:border-white/10'}`}>
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={options.wipe_config}
                    onChange={e => setOptions(o => ({ ...o, wipe_config: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 text-rose-500 focus:ring-rose-500 bg-slate-900"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-white mb-1">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Server Configuration Files
                  </div>
                  <p className="text-xs text-slate-400">Deletes Game.ini and GameUserSettings.ini. Server settings will revert to default on next start.</p>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${options.wipe_logs ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-800/50 border-white/5 hover:border-white/10'}`}>
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={options.wipe_logs}
                    onChange={e => setOptions(o => ({ ...o, wipe_logs: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 text-rose-500 focus:ring-rose-500 bg-slate-900"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-white mb-1">
                    <Activity className="w-4 h-4 text-amber-400" />
                    Server Logs
                  </div>
                  <p className="text-xs text-slate-400">Deletes crash logs and console output logs.</p>
                </div>
              </label>
            </div>

            <div className="pt-4 border-t border-white/10">
              <label className="block text-sm text-slate-300 mb-2">
                Type <span className="font-mono text-rose-400 select-all bg-rose-500/10 px-1 rounded">{serverName}</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                placeholder={serverName}
                className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
              />
            </div>
          </div>

          <div className="p-6 border-t border-white/5 bg-slate-800/50 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isResetting}
              className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={!hasSelection || !isConfirmValid || isResetting}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-rose-900/20"
            >
              {isResetting ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {isResetting ? 'Wiping Data...' : 'Confirm Reset'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
