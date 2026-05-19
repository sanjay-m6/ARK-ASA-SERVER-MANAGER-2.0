import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pin,
  Star,
  Archive,
  Edit2,
  MoreVertical,
  Minimize2,
  Maximize2,
  Zap,
  Tag,
  FileText,
  Trash2,
  RotateCw,
  Square,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useServerOrganizationStore } from '../../stores/serverOrganizationStore';
import type { Server } from '../../types';
import { cn } from '../../utils/helpers';

interface EnhancedServerCardProps {
  server: Server;
  isArchived?: boolean;
  isDragging?: boolean;
  onOpenServer?: (server: Server) => void;
  onStartServer?: (serverId: number) => void;
  onStopServer?: (serverId: number) => void;
  onRestartServer?: (serverId: number) => void;
  onDeleteServer?: (serverId: number) => void;
  onArchive?: (serverId: number) => void;
  onRestore?: (serverId: number) => void;
}

export const EnhancedServerCard: React.FC<EnhancedServerCardProps> = ({
  server,
  isArchived = false,
  isDragging = false,
  onOpenServer,
  onStartServer,
  onStopServer,
  onRestartServer,
  onDeleteServer,
  onArchive,
  onRestore,
}) => {
  const { customizations, updateServerCustomization } = useServerOrganizationStore();
  const customization = customizations.get(server.id);
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(customization?.displayName || server.name);
  const [showNotes, setShowNotes] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = customization?.displayName || server.name;
  const isMinimized = customization?.isMinimized ?? false;
  const isPinned = customization?.isPinned ?? false;
  const isFavorite = customization?.favorite ?? false;
  const tags = customization?.tags ?? [];
  const colorTag = customization?.colorTag;
  const notes = customization?.notes;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'running':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'starting':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'stopped':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'crashed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const handleTogglePin = () => {
    updateServerCustomization({
      ...(customization || {
        serverId: server.id,
        displayName: server.name,
        colorTag: undefined,
        isPinned: false,
        pinOrder: 0,
        isMinimized: false,
        tags: [],
        favorite: false,
        notes: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      isPinned: !isPinned,
    });
    toast.success(isPinned ? 'Server unpinned' : 'Server pinned to top');
  };

  const handleToggleFavorite = () => {
    updateServerCustomization({
      ...(customization || {
        serverId: server.id,
        displayName: server.name,
        colorTag: undefined,
        isPinned: false,
        pinOrder: 0,
        isMinimized: false,
        tags: [],
        favorite: false,
        notes: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      favorite: !isFavorite,
    });
    toast.success(isFavorite ? 'Removed from favorites' : 'Added to favorites');
  };

  const handleToggleMinimize = () => {
    updateServerCustomization({
      ...(customization || {
        serverId: server.id,
        displayName: server.name,
        colorTag: undefined,
        isPinned: false,
        pinOrder: 0,
        isMinimized: false,
        tags: [],
        favorite: false,
        notes: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      isMinimized: !isMinimized,
    });
  };

  const handleRename = () => {
    if (renameValue && renameValue !== customization?.displayName) {
      updateServerCustomization({
        ...(customization || {
          serverId: server.id,
          displayName: renameValue,
          colorTag: undefined,
          isPinned: false,
          pinOrder: 0,
          isMinimized: false,
          tags: [],
          favorite: false,
          notes: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        displayName: renameValue,
      });
      toast.success('Server renamed');
    }
    setIsRenaming(false);
  };

  const handleAddTag = (tag: string) => {
    if (!tags.includes(tag)) {
      const newTags = [...tags, tag];
      updateServerCustomization({
        ...(customization || {
          serverId: server.id,
          displayName: server.name,
          colorTag: undefined,
          isPinned: false,
          pinOrder: 0,
          isMinimized: false,
          tags: [],
          favorite: false,
          notes: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        tags: newTags,
      });
    }
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    updateServerCustomization({
      ...(customization || {
        serverId: server.id,
        displayName: server.name,
        colorTag: undefined,
        isPinned: false,
        pinOrder: 0,
        isMinimized: false,
        tags: [],
        favorite: false,
        notes: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      tags: newTags,
    });
  };

  const cardContent = (
    <motion.div
      layout
      className={cn(
        'group relative rounded-lg border backdrop-blur-sm transition-all duration-300',
        isDragging ? 'opacity-50' : 'opacity-100',
        isArchived ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600/50 hover:bg-slate-800/60',
        colorTag && `border-[${colorTag}]/40 bg-[${colorTag}]/5`,
        'shadow-lg hover:shadow-xl'
      )}
    >
      {/* Background Banner */}
      {customization?.customBanner && (
        <div
          className="absolute inset-x-0 top-0 h-24 rounded-t-lg bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${customization.customBanner})` }}
        />
      )}

      {/* Pinned Indicator */}
      {isPinned && (
        <div className="absolute -right-2 -top-2 z-10 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 p-2 shadow-lg">
          <Pin className="h-4 w-4 text-white" fill="white" />
        </div>
      )}

      <div className="relative p-4">
        {/* Header Section */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') setIsRenaming(false);
                  }}
                  className="flex-1 rounded bg-slate-700/50 px-2 py-1 text-sm text-white outline-none ring-1 ring-purple-500/50"
                  autoFocus
                />
                <button
                  onClick={handleRename}
                  className="rounded px-2 py-1 text-sm font-medium text-green-400 hover:bg-green-500/20"
                >
                  ✓
                </button>
              </div>
            ) : (
              <h3
                className="truncate text-lg font-bold text-white cursor-pointer hover:text-purple-400 transition-colors"
                onClick={() => isRenaming || onOpenServer?.(server)}
              >
                {displayName}
              </h3>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleToggleFavorite}
              className={cn(
                'p-1.5 rounded transition-colors',
                isFavorite ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
              )}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleToggleMinimize}
              className="p-1.5 rounded bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 transition-colors"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleTogglePin}
              className={cn(
                'p-1.5 rounded transition-colors',
                isPinned ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
              )}
              title={isPinned ? 'Unpin' : 'Pin to top'}
            >
              <Pin className="h-4 w-4" fill={isPinned ? 'currentColor' : 'none'} />
            </motion.button>

            <div className="relative" ref={menuRef}>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1.5 rounded bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 transition-colors"
              >
                <MoreVertical className="h-4 w-4" />
              </motion.button>

              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute right-0 z-50 w-48 rounded-lg border border-slate-600 bg-slate-800 shadow-lg"
                  >
                    <button
                      onClick={() => {
                        setIsRenaming(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                      Quick Rename
                    </button>
                    {!isArchived ? (
                      <button
                        onClick={() => {
                          onArchive?.(server.id);
                          setIsMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-amber-400 transition-colors"
                      >
                        <Archive className="h-4 w-4" />
                        Archive Server
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onRestore?.(server.id);
                          setIsMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-green-400 transition-colors"
                      >
                        <Archive className="h-4 w-4" />
                        Restore Server
                      </button>
                    )}
                    <button
                      onClick={() => setIsMenuOpen(false)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-blue-400 transition-colors"
                    >
                      <Tag className="h-4 w-4" />
                      Add Tags
                    </button>
                    <button
                      onClick={() => {
                        setShowNotes(!showNotes);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-green-400 transition-colors"
                    >
                      <FileText className="h-4 w-4" />
                      Edit Notes
                    </button>
                    <div className="my-1 border-t border-slate-700" />
                    <button
                      onClick={() => {
                        onDeleteServer?.(server.id);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Server
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {!isMinimized ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <span className={cn('px-2 py-1 rounded text-xs font-medium border', getStatusColor(server.status))}>
                  {server.status.toUpperCase()}
                </span>
                {isArchived && (
                  <span className="px-2 py-1 rounded text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-400">
                    ARCHIVED
                  </span>
                )}
              </div>

              {/* Server Info Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-slate-700/50 p-2">
                  <p className="text-slate-400">Map</p>
                  <p className="font-medium text-white truncate">{server.config.mapName}</p>
                </div>
                <div className="rounded bg-slate-700/50 p-2">
                  <p className="text-slate-400">Players</p>
                  <p className="font-medium text-white">
                    0/{server.config.maxPlayers}
                  </p>
                </div>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <motion.span
                      key={tag}
                      whileHover={{ scale: 1.05 }}
                      className="flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-1 text-xs text-purple-300 border border-purple-500/30 cursor-pointer hover:bg-purple-500/30"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      {tag}
                      <span className="text-purple-400">×</span>
                    </motion.span>
                  ))}
                </div>
              )}

              {/* Notes Section */}
              <AnimatePresence>
                {(showNotes || notes) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded bg-slate-700/30 p-2"
                  >
                    {showNotes && !notes ? (
                      <textarea
                        className="w-full h-20 rounded bg-slate-700 text-white text-xs p-2 outline-none ring-1 ring-purple-500/30"
                        placeholder="Add notes about this server..."
                        defaultValue={notes || ''}
                        onBlur={(e) => {
                          if (e.currentTarget.value !== notes) {
                            updateServerCustomization({
                              ...(customization || {
                                serverId: server.id,
                                displayName: server.name,
                                colorTag: undefined,
                                isPinned: false,
                                pinOrder: 0,
                                isMinimized: false,
                                tags: [],
                                favorite: false,
                                notes: undefined,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                              }),
                              notes: e.currentTarget.value,
                            });
                            setShowNotes(false);
                          }
                        }}
                      />
                    ) : (
                      <p className="text-xs text-slate-300">{notes}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {server.status === 'stopped' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onStartServer?.(server.id)}
                    className="flex-1 flex items-center justify-center gap-1 rounded bg-green-600/20 py-1.5 text-xs font-medium text-green-400 border border-green-500/30 hover:bg-green-600/30 transition-colors"
                  >
                    <Zap className="h-3 w-3" />
                    Start
                  </motion.button>
                )}
                {(server.status === 'running' || server.status === 'online') && (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onRestartServer?.(server.id)}
                      className="flex-1 flex items-center justify-center gap-1 rounded bg-yellow-600/20 py-1.5 text-xs font-medium text-yellow-400 border border-yellow-500/30 hover:bg-yellow-600/30 transition-colors"
                    >
                      <RotateCw className="h-3 w-3" />
                      Restart
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onStopServer?.(server.id)}
                      className="flex-1 flex items-center justify-center gap-1 rounded bg-red-600/20 py-1.5 text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-600/30 transition-colors"
                    >
                      <Square className="h-3 w-3" />
                      Stop
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between text-xs"
            >
              <span className={cn('px-2 py-1 rounded font-medium border', getStatusColor(server.status))}>
                {server.status.toUpperCase()}
              </span>
              <span className="text-slate-400">{server.config.mapName}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  return cardContent;
};

export default EnhancedServerCard;
