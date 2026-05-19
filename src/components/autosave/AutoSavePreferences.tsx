import React, { useState, useEffect } from 'react';
import { AutosavePreferences, UpdatePreferencesRequest } from '@/types/autosave';
import { updatePreferences } from '@/utils/autoSaveApi';
import toast from 'react-hot-toast';
import { Save, Settings, Database, RefreshCw, Shield, Trash2, Archive } from 'lucide-react';

interface AutoSavePreferencesProps {
  serverId: number;
  initialPreferences: AutosavePreferences | null;
  onPreferencesUpdated: (prefs: AutosavePreferences) => void;
}

export const AutoSavePreferencesPanel: React.FC<AutoSavePreferencesProps> = ({
  serverId,
  initialPreferences,
  onPreferencesUpdated
}) => {
  const [preferences, setPreferences] = useState<AutosavePreferences | null>(initialPreferences);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPreferences(initialPreferences);
  }, [initialPreferences]);

  const handleChange = (field: keyof UpdatePreferencesRequest, value: any) => {
    if (!preferences) return;
    setPreferences({ ...preferences, [field]: value } as AutosavePreferences);
  };

  const handleSave = async () => {
    if (!preferences) return;
    setIsSaving(true);
    try {
      const updateReq: UpdatePreferencesRequest = {
        serverId,
        autoIndexEnabled: preferences.autoIndexEnabled,
        autoValidateEnabled: preferences.autoValidateEnabled,
        autoCompressOldSaves: preferences.autoCompressOldSaves,
        compressAfterDays: preferences.compressAfterDays,
        autoCleanupEnabled: preferences.autoCleanupEnabled,
        cleanupAfterDays: preferences.cleanupAfterDays,
        keepMinimumSaves: preferences.keepMinimumSaves,
        createRestorePoints: preferences.createRestorePoints,
        restorePointFrequency: preferences.restorePointFrequency,
        notifyOnRestore: preferences.notifyOnRestore,
        notifyOnCorruption: preferences.notifyOnCorruption,
        indexMetadata: preferences.indexMetadata,
      };
      
      const updated = await updatePreferences(updateReq);
      onPreferencesUpdated(updated);
      toast.success('Auto-save preferences updated successfully.');
    } catch (error) {
      toast.error(`Failed to update preferences: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!preferences) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mb-4 text-blue-400" />
        <p className="font-semibold text-slate-300">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-400" /> Auto-Save Preferences
        </h2>
        <p className="text-slate-400 font-medium">Configure how auto-saves are managed, validated, and cleaned up automatically.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Core Settings */}
        <div className="bg-slate-900/40 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-md">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" /> Indexing & Metadata
          </h3>
          
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.autoIndexEnabled}
                onChange={(e) => handleChange('autoIndexEnabled', e.target.checked)}
                className="mt-1 w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
              />
              <div>
                <div className="text-sm font-semibold text-slate-200">Enable Auto-Indexing</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Automatically track new saves when they appear in the saved directory.</div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.indexMetadata}
                onChange={(e) => handleChange('indexMetadata', e.target.checked)}
                className="mt-1 w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
              />
              <div>
                <div className="text-sm font-semibold text-slate-200">Deep Index Metadata</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Parse mods, player counts, and settings out of the save files (slower).</div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.autoValidateEnabled}
                onChange={(e) => handleChange('autoValidateEnabled', e.target.checked)}
                className="mt-1 w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
              />
              <div>
                <div className="text-sm font-semibold text-slate-200">Auto-Validate Saves</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Check save files for corruption and size anomalies immediately after indexing.</div>
              </div>
            </label>
          </div>
        </div>

        {/* Cleanup Settings */}
        <div className="bg-slate-900/40 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-md">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-rose-400" /> Retention & Cleanup
          </h3>
          
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.autoCleanupEnabled}
                onChange={(e) => handleChange('autoCleanupEnabled', e.target.checked)}
                className="mt-1 w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
              />
              <div>
                <div className="text-sm font-semibold text-slate-200">Enable Auto-Cleanup</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Delete old saves automatically to free up disk space.</div>
              </div>
            </label>

            <div className={`pl-7 space-y-3 transition-all duration-300 ${preferences.autoCleanupEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-semibold">Delete saves older than (days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={preferences.cleanupAfterDays}
                  onChange={(e) => handleChange('cleanupAfterDays', parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                />
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-semibold">Minimum saves to keep</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={preferences.keepMinimumSaves}
                  onChange={(e) => handleChange('keepMinimumSaves', parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Archival Settings */}
        <div className="bg-slate-900/40 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-md">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Archive className="w-5 h-5 text-amber-400" /> Compression & Archival
          </h3>
          
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.autoCompressOldSaves}
                onChange={(e) => handleChange('autoCompressOldSaves', e.target.checked)}
                className="mt-1 w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
              />
              <div>
                <div className="text-sm font-semibold text-slate-200">Auto-Compress Old Saves</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Zip saves automatically after a certain number of days to save space.</div>
              </div>
            </label>

            <div className={`pl-7 space-y-3 transition-all duration-300 ${preferences.autoCompressOldSaves ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-semibold">Compress saves older than (days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={preferences.compressAfterDays}
                  onChange={(e) => handleChange('compressAfterDays', parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Restore Points & Notifications */}
        <div className="bg-slate-900/40 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-md">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" /> Protection & Alerts
          </h3>
          
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.createRestorePoints}
                onChange={(e) => handleChange('createRestorePoints', e.target.checked)}
                className="mt-1 w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
              />
              <div>
                <div className="text-sm font-semibold text-slate-200">Scheduled Restore Points</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Automatically mark specific saves as protected restore points based on a schedule.</div>
              </div>
            </label>

            <div className={`pl-7 transition-all duration-300 ${preferences.createRestorePoints ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <label className="text-xs text-slate-400 block mb-1 font-semibold">Frequency</label>
              <select
                value={preferences.restorePointFrequency}
                onChange={(e) => handleChange('restorePointFrequency', e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div className="border-t border-slate-800/60 pt-4 mt-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.notifyOnRestore}
                  onChange={(e) => handleChange('notifyOnRestore', e.target.checked)}
                  className="mt-1 w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
                />
                <span className="text-sm font-semibold text-slate-200">Notify on Restores</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.notifyOnCorruption}
                  onChange={(e) => handleChange('notifyOnCorruption', e.target.checked)}
                  className="mt-1 w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
                />
                <span className="text-sm font-semibold text-slate-200">Notify on Corrupted Saves</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-800/80">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/20 font-bold hover:scale-[1.02]"
        >
          {isSaving ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          <span>{isSaving ? 'Saving...' : 'Save Preferences'}</span>
        </button>
      </div>
    </div>
  );
};

export default AutoSavePreferencesPanel;
