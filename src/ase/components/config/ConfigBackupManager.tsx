import { useEffect, useState, useCallback } from 'react';
import {
  listAseConfigBackups,
  createAseConfigBackup,
  restoreAseConfigBackup,
  type AseConfigBackupInfo
} from '../../utils/aseCommands';
import { Archive, Plus, RotateCcw, Loader2, Calendar, HardDrive, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ConfigBackupManagerProps {
  serverId: number | null;
}

export default function ConfigBackupManager({ serverId }: ConfigBackupManagerProps) {
  const [backups, setBackups] = useState<AseConfigBackupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    if (!serverId) return;
    setIsLoading(true);
    try {
      const data = await listAseConfigBackups(serverId);
      setBackups(data);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load configuration backups');
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleCreateBackup = async () => {
    if (!serverId) return;
    setIsCreating(true);
    try {
      const filename = await createAseConfigBackup(serverId);
      toast.success(`Backup ${filename} created successfully`);
      fetchBackups();
    } catch (e) {
      toast.error(`Failed to create backup: ${e}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!serverId) return;
    if (!confirm(`Are you absolutely sure you want to restore the backup "${filename}"? This will overwrite all your current configurations.`)) {
      return;
    }

    setRestoringFilename(filename);
    try {
      await restoreAseConfigBackup(serverId, filename);
      toast.success('Configuration restored successfully');
      // Proactively trigger app state update or notification
    } catch (e) {
      toast.error(`Failed to restore backup: ${e}`);
    } finally {
      setRestoringFilename(null);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoString: string): string => {
    if (!isoString) return 'Unknown Date';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return isoString;
    }
  };

  if (!serverId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Archive className="w-12 h-12 mb-3 stroke-1" />
        <p className="text-sm">Please select a server to manage config backups</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header and Create Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div>
          <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider">Config Backup History</h3>
          <p className="text-xs text-slate-500 mt-0.5">Restore previously saved configuration bundles</p>
        </div>

        <button
          onClick={handleCreateBackup}
          disabled={isCreating || isLoading}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-900 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-amber-500/10 self-start sm:self-auto"
        >
          {isCreating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Create Backup
        </button>
      </div>

      {/* Backup List */}
      <div className="flex-1 min-h-[350px] relative overflow-y-auto pr-1 custom-scrollbar">
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-950/20 rounded-xl">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
            <span className="text-sm font-medium">Fetching backups...</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 border-2 border-dashed border-white/5 rounded-2xl">
            <Archive className="w-10 h-10 mb-2.5 stroke-[1.25]" />
            <p className="text-xs font-medium">No configuration backups found</p>
            <p className="text-[10px] text-slate-600 mt-1 max-w-[240px] text-center">Create a backup to protect your custom difficulty offsets, dino multipliers, and server rules.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.filename}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-900/40 border border-white/5 hover:border-white/10 rounded-2xl transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200 truncate max-w-[280px] md:max-w-md">
                      {backup.filename}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-medium border border-white/5">
                      ZIP Archive
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-600" />
                      {formatDate(backup.createdAt)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-slate-600" />
                      {formatSize(backup.sizeBytes)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                  <button
                    onClick={() => handleRestoreBackup(backup.filename)}
                    disabled={restoringFilename !== null}
                    className="px-3.5 py-2 text-amber-400 hover:text-amber-300 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/15 hover:border-amber-500/25 rounded-xl text-xs font-semibold transition-all flex items-center gap-2"
                  >
                    {restoringFilename === backup.filename ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Safety Notice */}
      <div className="bg-slate-950/20 border border-amber-500/10 rounded-xl p-3 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-amber-500/80 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold text-amber-500/95">Safe Operations Only</p>
          <p className="text-[10px] text-slate-500 leading-normal">Restoring a backup only edits configuration files. Player character databases and save-game structures will not be modified.</p>
        </div>
      </div>
    </div>
  );
}
