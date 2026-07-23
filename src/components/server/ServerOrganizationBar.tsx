import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Layers, FolderOpen, Sparkles, Filter } from 'lucide-react';
import { useServerOrganizationStore } from '../../stores/serverOrganizationStore';
import { getOrganizationSnapshot } from '../../utils/serverOrganization';
import { cn } from '../../utils/helpers';

interface Props {
  serversCount: number;
  onSelectFolderId?: (folderId: number | null) => void;
  selectedFolderId?: number | null;
  className?: string;
}

export default function ServerOrganizationBar({
  serversCount,
  onSelectFolderId,
  selectedFolderId: propSelectedFolderId,
  className
}: Props) {
  const navigate = useNavigate();
  const { folders, setFolders, setSnapshot, setSelectedFolder } = useServerOrganizationStore();
  const [internalFolderId, setInternalFolderId] = useState<number | null>(null);

  const activeFolderId = propSelectedFolderId !== undefined ? propSelectedFolderId : internalFolderId;

  const loadOrgData = async () => {
    try {
      const snap = await getOrganizationSnapshot();
      setSnapshot(snap);
      if (snap?.folders) {
        setFolders(snap.folders);
      }
    } catch (e) {
      console.error('Failed to load organization bar snapshot:', e);
    }
  };

  useEffect(() => {
    loadOrgData();
  }, []);

  const handleFolderSelect = (folderId: number | null) => {
    if (onSelectFolderId) {
      onSelectFolderId(folderId);
    } else {
      setInternalFolderId(folderId);
    }

    if (folderId === null) {
      setSelectedFolder(null);
    } else {
      const found = folders.find(f => f.id === folderId);
      setSelectedFolder(found || null);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 backdrop-blur-md p-3 rounded-2xl border border-slate-800">
        {/* Category Pills */}
        <div className="flex items-center gap-2 flex-wrap overflow-x-auto py-0.5 max-w-full">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-400 border-r border-slate-800 mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-sky-400" />
            <span>Categories</span>
          </div>

          <button
            onClick={() => handleFolderSelect(null)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer",
              activeFolderId === null
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10"
                : "bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:bg-slate-800 hover:text-slate-200"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Servers</span>
            <span className="ml-1 px-1.5 py-0.2 bg-white/10 rounded-full text-[10px] font-mono">
              {serversCount}
            </span>
          </button>

          {folders.map((folder) => {
            const isSelected = activeFolderId === folder.id;
            const nodeCount = folder.serverIds?.length || 0;
            return (
              <button
                key={folder.id}
                onClick={() => handleFolderSelect(folder.id)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer",
                  isSelected
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-500/10"
                    : "bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                <FolderOpen className="w-3.5 h-3.5" style={{ color: folder.color || '#a855f7' }} />
                <span>{folder.name}</span>
                <span className="ml-1 px-1.5 py-0.2 bg-white/10 rounded-full text-[10px] font-mono">
                  {nodeCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Direct Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/tools/organization')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-500/20 to-blue-500/20 hover:from-sky-500/30 hover:to-blue-500/30 border border-sky-500/30 text-sky-300 rounded-xl text-xs font-semibold transition-all shadow-md shadow-sky-500/10 cursor-pointer"
            title="Open full Server Organization page"
          >
            <Folder className="w-3.5 h-3.5 text-sky-400" />
            <span>Server Organization</span>
            <Sparkles className="w-3 h-3 text-sky-400 animate-pulse ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
