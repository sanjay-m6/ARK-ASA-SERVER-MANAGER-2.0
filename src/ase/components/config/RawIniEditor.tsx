import { useEffect, useState } from 'react';
import { useAseConfigStore } from '../../stores/aseConfigStore';
import { Save, RotateCcw, FileText, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface RawIniEditorProps {
  serverId: number | null;
}

export default function RawIniEditor({ serverId }: RawIniEditorProps) {
  const {
    rawData,
    activeFile,
    isLoading,
    isDirty,
    setActiveFile,
    loadIni,
    saveIni,
    setRawData,
  } = useAseConfigStore();

  const [localContent, setLocalContent] = useState('');

  useEffect(() => {
    if (serverId) {
      loadIni(serverId, activeFile);
    }
  }, [serverId, activeFile, loadIni]);

  useEffect(() => {
    if (rawData !== null) {
      setLocalContent(rawData);
    }
  }, [rawData]);

  const handleFileChange = (filename: string) => {
    if (isDirty) {
      if (!confirm('You have unsaved changes. Switch file anyway?')) {
        return;
      }
    }
    setActiveFile(filename);
  };

  const handleTextChange = (val: string) => {
    setLocalContent(val);
    setRawData(val);
  };

  const handleSave = async () => {
    if (!serverId) return;
    try {
      await saveIni(serverId, true);
      toast.success(`${activeFile} saved successfully`);
    } catch (e) {
      toast.error(`Failed to save INI: ${e}`);
    }
  };

  const handleReset = async () => {
    if (!serverId) return;
    try {
      await loadIni(serverId, activeFile);
      toast.success('Configuration reloaded from server');
    } catch (e) {
      toast.error(`Failed to reload INI: ${e}`);
    }
  };

  if (!serverId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <FileText className="w-12 h-12 mb-3 stroke-1" />
        <p className="text-sm">Please select a server to edit configurations</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* File Selector and Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div className="flex gap-2">
          {['GameUserSettings.ini', 'Game.ini'].map((file) => (
            <button
              key={file}
              onClick={() => handleFileChange(file)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide uppercase transition-all ${
                activeFile === file
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-md'
                  : 'bg-slate-800/40 text-slate-400 border border-white/5 hover:border-white/10 hover:text-slate-300'
              }`}
            >
              {file}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="px-3.5 py-2 text-slate-400 hover:text-white bg-slate-800/60 border border-white/5 hover:border-white/10 rounded-xl text-xs font-medium transition-all flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reload
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || !isDirty}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-900 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-amber-500/10"
          >
            <Save className="w-3.5 h-3.5" />
            Save INI
          </button>
        </div>
      </div>

      {/* Editor Textarea */}
      <div className="relative flex-1 min-h-[350px] bg-slate-950/40 rounded-xl border border-white/5 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center text-slate-400 z-10">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
            <span className="text-sm font-medium">Loading raw configuration...</span>
          </div>
        ) : null}

        <textarea
          value={localContent}
          onChange={(e) => handleTextChange(e.target.value)}
          spellCheck={false}
          className="w-full flex-1 p-4 bg-transparent text-slate-200 font-mono text-xs leading-relaxed resize-none focus:outline-none custom-scrollbar overflow-y-auto"
          placeholder="; Add your configuration lines here..."
        />
      </div>

      {/* Quick Tips */}
      <div className="text-[11px] text-slate-500 flex items-center gap-2 px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 animate-pulse shrink-0"></span>
        <span>Tip: Direct manual edits override visual sliders. Ensure your syntax matches standard UE4 INI structures: <code>[SectionName]</code> followed by <code>Key=Value</code>.</span>
      </div>
    </div>
  );
}
