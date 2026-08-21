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
      <div className="glass-panel p-2.5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-2 flex-wrap overflow-x-auto py-0.5 max-w-full">
          <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-r border-[var(--border)] mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-sky-500" />
            <span>Categories</span>
          </div>

          <button
            onClick={() => handleFolderSelect(null)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-sm",
              activeFolderId === null
                ? "bg-sky-500 hover:bg-sky-600 text-white border border-sky-500 shadow-sky-500/25"
                : "bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Servers</span>
            <span className="ml-1 px-1.5 py-0.5 bg-black/15 dark:bg-white/20 rounded-full text-[10px] font-mono leading-none">
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
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-sm",
                  isSelected
                    ? "bg-purple-600 hover:bg-purple-700 text-white border border-purple-600 shadow-purple-600/25"
                    : "bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
                )}
              >
                <FolderOpen className="w-3.5 h-3.5" style={{ color: isSelected ? '#ffffff' : (folder.color || '#a855f7') }} />
                <span>{folder.name}</span>
                <span className="ml-1 px-1.5 py-0.5 bg-black/15 dark:bg-white/20 rounded-full text-[10px] font-mono leading-none">
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
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 hover:border-sky-500/50 text-sky-600 dark:text-sky-400 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            title="Open full Server Organization page"
          >
            <Folder className="w-3.5 h-3.5 text-sky-500" />
            <span>Server Organization</span>
            <Sparkles className="w-3 h-3 text-sky-500 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
