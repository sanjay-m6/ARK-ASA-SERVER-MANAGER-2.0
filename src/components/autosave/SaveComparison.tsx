import React from 'react';
import { motion } from 'framer-motion';
import { AutoSave, SaveComparison as SaveComparisonType } from '@/types/autosave';
import { formatFileSize, formatRelativeTime } from '@/utils/autoSaveApi';
import { ArrowRight, HardDrive, Clock, Users, Zap, Shield, AlertTriangle } from 'lucide-react';

interface SaveComparisonProps {
  save1: AutoSave;
  save2: AutoSave;
  comparison?: SaveComparisonType;
  onClose: () => void;
  onRestore: (save: AutoSave) => void;
}

export const SaveComparison: React.FC<SaveComparisonProps> = ({
  save1,
  save2,
  comparison,
  onClose,
  onRestore
}) => {
  // Determine older vs newer for visual flow
  const isSave1Older = new Date(save1.createdAt) < new Date(save2.createdAt);
  const olderSave = isSave1Older ? save1 : save2;
  const newerSave = isSave1Older ? save2 : save1;

  const sizeDiff = newerSave.fileSize - olderSave.fileSize;
  const sizeDiffText = sizeDiff > 0 ? `+${formatFileSize(sizeDiff)}` : sizeDiff < 0 ? `-${formatFileSize(Math.abs(sizeDiff))}` : 'No change';
  const sizeDiffColor = sizeDiff > 0 ? 'text-amber-400' : sizeDiff < 0 ? 'text-green-400' : 'text-slate-400';

  const renderSaveCard = (save: AutoSave, title: string) => (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">{title}</div>
          <h3 className="text-lg font-bold text-white truncate max-w-[200px]" title={save.customLabel || save.fileName}>
            {save.customLabel || save.fileName}
          </h3>
        </div>
        {save.isCorrupted ? (
          <div className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded border border-red-500/50 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Corrupted
          </div>
        ) : (
          <div className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/50 flex items-center gap-1">
            <Shield className="w-3 h-3" /> Valid
          </div>
        )}
      </div>

      <div className="space-y-4 flex-1">
        <div className="flex items-center gap-3 text-sm">
          <Clock className="w-4 h-4 text-slate-400" />
          <div>
            <div className="text-slate-200">{new Date(save.createdAt).toLocaleString()}</div>
            <div className="text-slate-500 text-xs">{formatRelativeTime(save.createdAt)}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 text-sm">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <span className="text-slate-200">{formatFileSize(save.fileSize)}</span>
        </div>

        {save.playerCount !== undefined && (
          <div className="flex items-center gap-3 text-sm">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-slate-200">{save.playerCount} players active</span>
          </div>
        )}
        
        {save.uptimeSeconds !== undefined && (
          <div className="flex items-center gap-3 text-sm">
            <Zap className="w-4 h-4 text-slate-400" />
            <span className="text-slate-200">{Math.floor(save.uptimeSeconds / 3600)}h {(Math.floor(save.uptimeSeconds / 60) % 60)}m uptime</span>
          </div>
        )}
      </div>

      <button
        onClick={() => onRestore(save)}
        className="mt-6 w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition"
      >
        Restore This Version
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-full"
      >
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Compare Saves
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            Close
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="grid md:grid-cols-[1fr,auto,1fr] gap-6 items-stretch">
            {renderSaveCard(olderSave, "Older Save")}
            
            <div className="flex flex-col items-center justify-center text-slate-500 hidden md:flex">
              <div className="h-full w-px bg-slate-700 mb-4" />
              <ArrowRight className="w-6 h-6 text-slate-400" />
              <div className="h-full w-px bg-slate-700 mt-4" />
            </div>

            {renderSaveCard(newerSave, "Newer Save")}
          </div>

          {/* Diff Summary */}
          <div className="mt-8 bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h4 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Change Summary</h4>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Time Elapsed</div>
                <div className="font-medium text-slate-200">
                  {comparison ? 
                    `${Math.abs(Math.floor(comparison.timestampDifferenceSeconds / 3600))}h ${Math.abs(Math.floor(comparison.timestampDifferenceSeconds / 60) % 60)}m` 
                    : 'Unknown'}
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Size Difference</div>
                <div className={`font-medium ${sizeDiffColor}`}>
                  {sizeDiffText}
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Player Count</div>
                <div className="font-medium text-slate-200">
                  {newerSave.playerCount !== undefined && olderSave.playerCount !== undefined 
                    ? (() => {
                        const diff = newerSave.playerCount - olderSave.playerCount;
                        return diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : 'No change';
                      })()
                    : 'N/A'}
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Map</div>
                <div className="font-medium text-slate-200">
                  {newerSave.mapName === olderSave.mapName ? 'Unchanged' : `${olderSave.mapName} → ${newerSave.mapName}`}
                </div>
              </div>
            </div>

            {comparison && comparison.modChanges && (comparison.modChanges.addedMods.length > 0 || comparison.modChanges.removedMods.length > 0) && (
              <div className="mt-6">
                <h5 className="text-sm text-slate-300 mb-2">Mod Changes</h5>
                <div className="space-y-2">
                  {comparison.modChanges.addedMods.map((m: string) => <div key={m} className="text-sm text-green-400">+ Added: {m}</div>)}
                  {comparison.modChanges.removedMods.map((m: string) => <div key={m} className="text-sm text-red-400">- Removed: {m}</div>)}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SaveComparison;
