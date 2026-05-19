import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Folder,
  MoreVertical,
  Edit2,
  Trash2,
  FolderPlus,
  Hash,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useServerOrganizationStore } from '../../stores/serverOrganizationStore';
import type { ServerFolder } from '../../types/server-organization';
import { cn } from '../../utils/helpers';

interface ServerFolderComponentProps {
  folder: ServerFolder;
  level?: number;
  servers?: any[];
  onSelectFolder?: (folder: ServerFolder) => void;
  onDeleteFolder?: (folderId: number) => void;
  onRenameFolder?: (folderId: number, newName: string) => void;
  onAddServerToFolder?: (serverId: number, folderId: number) => void;
  onCreateSubfolder?: (parentId: number) => void;
  isDraggingOver?: boolean;
  onDrop?: (folderId: number) => void;
}

export const ServerFolderComponent: React.FC<ServerFolderComponentProps> = ({
  folder,
  level = 0,
  servers = [],
  onSelectFolder,
  onDeleteFolder,
  onRenameFolder,
  onAddServerToFolder,
  onCreateSubfolder,
  isDraggingOver = false,
  onDrop,
}) => {
  const { selectedFolder, setSelectedFolder } = useServerOrganizationStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const [showMenu, setShowMenu] = useState(false);

  const isSelected = selectedFolder?.id === folder.id;
  const serverCount = folder.serverIds?.length ?? 0;
  const hasChildren = (folder.children?.length ?? 0) > 0;
  const paddingLeft = level * 16;

  const handleSelect = () => {
    setSelectedFolder(folder);
    onSelectFolder?.(folder);
  };

  const handleRename = () => {
    if (renameValue && renameValue !== folder.name) {
      onRenameFolder?.(folder.id, renameValue);
      toast.success('Folder renamed');
    }
    setIsRenaming(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const data = e.dataTransfer.getData('application/json');
    try {
      const { type, id } = JSON.parse(data);
      if (type === 'server') {
        onAddServerToFolder?.(id, folder.id);
        toast.success('Server moved to folder');
      }
    } catch (error) {
      console.error('Failed to handle drop:', error);
    }
    onDrop?.(folder.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="space-y-1">
      <motion.div
        layout
        onClick={handleSelect}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'group flex items-center gap-2 rounded-lg px-3 py-2 transition-all duration-200',
          'cursor-pointer hover:bg-slate-700/50',
          isSelected && 'bg-purple-600/20 border-l-2 border-purple-500',
          isDraggingOver && 'bg-purple-500/20 border-l-2 border-purple-400'
        )}
        style={{ paddingLeft: `calc(${paddingLeft}px + 0.75rem)` }}
      >
        {/* Expand/Collapse Button */}
        {hasChildren && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5"
          >
            <motion.div animate={{ rotate: isExpanded ? 0 : -90 }}>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </motion.div>
          </motion.button>
        )}
        {!hasChildren && <div className="w-4" />}

        {/* Folder Icon */}
        <div className="flex-shrink-0">
          <div
            className="rounded p-1"
            style={{ backgroundColor: `${folder.color}20` }}
          >
            <Folder
              className="h-4 w-4"
              style={{ color: folder.color }}
            />
          </div>
        </div>

        {/* Folder Name */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              type="text"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded bg-slate-700/50 px-2 py-1 text-sm text-white outline-none ring-1 ring-purple-500/50"
            />
          ) : (
            <span className="text-sm font-medium text-white truncate">
              {folder.name}
            </span>
          )}
        </div>

        {/* Server Count */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs text-slate-400">
            <Hash className="h-3 w-3 inline mr-0.5" />
            {serverCount}
          </span>

          {/* Action Buttons */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              onCreateSubfolder?.(folder.id);
            }}
            className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-slate-300 transition-colors"
            title="Create subfolder"
          >
            <FolderPlus className="h-4 w-4" />
          </motion.button>

          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-slate-300 transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </motion.button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute right-0 z-50 w-40 rounded-lg border border-slate-600 bg-slate-800 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRenaming(true);
                      setShowMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <Edit2 className="h-4 w-4" />
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFolder?.(folder.id);
                      setShowMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Child Folders */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {folder.children?.map((child) => (
              <ServerFolderComponent
                key={child.id}
                folder={child}
                level={level + 1}
                servers={servers}
                onSelectFolder={onSelectFolder}
                onDeleteFolder={onDeleteFolder}
                onRenameFolder={onRenameFolder}
                onAddServerToFolder={onAddServerToFolder}
                onCreateSubfolder={onCreateSubfolder}
                isDraggingOver={isDraggingOver}
                onDrop={onDrop}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ServerFolderComponent;
