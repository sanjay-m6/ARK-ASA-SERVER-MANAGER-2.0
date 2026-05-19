import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  Grid3x3,
  List,
  Zap,
  Archive,
  LayoutGrid,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useServerStore } from '../../stores/serverStore';
import { useServerOrganizationStore } from '../../stores/serverOrganizationStore';
import EnhancedServerCard from './EnhancedServerCard';
import ServerFolder from './ServerFolder';
import type { Server } from '../../types';
import { cn } from '../../utils/helpers';

interface EnhancedDashboardProps {
  onServerSelect?: (server: Server) => void;
  onStartServer?: (serverId: number) => void;
  onStopServer?: (serverId: number) => void;
  onRestartServer?: (serverId: number) => void;
  onDeleteServer?: (serverId: number) => void;
  onArchiveServer?: (serverId: number) => void;
  onRestoreServer?: (serverId: number) => void;
}

export const EnhancedDashboard: React.FC<EnhancedDashboardProps> = ({
  onServerSelect,
  onStartServer,
  onStopServer,
  onRestartServer,
  onDeleteServer,
  onArchiveServer,
  onRestoreServer,
}) => {
  const { servers } = useServerStore();
  const {
    folders,
    selectedFolder,
    archivedServers,
    customizations,
    currentSort,
    archiveServer,
    restoreServer,
  } = useServerOrganizationStore();

  // UI State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  // Filter and Sort Logic
  const filteredServers = useMemo(() => {
    let result = servers.filter((server) => {
      // Archive filter
      const isArchived = archivedServers.has(server.id);
      if (showArchived && !isArchived) return false;
      if (!showArchived && isArchived) return false;

      // Folder filter
      if (selectedFolder) {
        const isInFolder = selectedFolder.serverIds?.includes(server.id) ?? false;
        if (!isInFolder) return false;
      }

      // Search filter
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        const serverName = (customizations.get(server.id)?.displayName || server.name).toLowerCase();
        if (!serverName.includes(lowerQuery)) return false;
      }

      // Status filter
      if (selectedStatuses.length > 0) {
        if (!selectedStatuses.includes(server.status)) return false;
      }

      return true;
    });

    // Sort
    result.sort((a, b) => {
      const aCustom = customizations.get(a.id);
      const bCustom = customizations.get(b.id);

      const aName = aCustom?.displayName || a.name;
      const bName = bCustom?.displayName || b.name;

      let comparison = 0;
      if (currentSort.sortBy === 'name') {
        comparison = aName.localeCompare(bName);
      } else if (currentSort.sortBy === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else if (currentSort.sortBy === 'created_at') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      return currentSort.sortOrder === 'asc' ? comparison : -comparison;
    });

    // Pin servers to top
    return result.sort((a, b) => {
      const aIsPinned = customizations.get(a.id)?.isPinned ?? false;
      const bIsPinned = customizations.get(b.id)?.isPinned ?? false;
      if (aIsPinned !== bIsPinned) {
        return aIsPinned ? -1 : 1;
      }
      return 0;
    });
  }, [servers, archivedServers, selectedFolder, searchQuery, selectedStatuses, customizations, currentSort, showArchived]);

  // Pinned and regular servers
  const pinnedServers = filteredServers.filter((s) => customizations.get(s.id)?.isPinned);
  const regularServers = filteredServers.filter((s) => !customizations.get(s.id)?.isPinned);

  // Statistics
  const stats = useMemo(() => {
    const total = servers.length;
    const archived = servers.filter((s) => archivedServers.has(s.id)).length;
    const online = servers.filter((s) => s.status === 'online' || s.status === 'running').length;
    const offline = servers.filter((s) => s.status === 'stopped').length;
    
    return { total, archived, online, offline };
  }, [servers, archivedServers]);

  const handleArchiveServer = useCallback(
    (serverId: number) => {
      archiveServer(serverId, 'Manual archive');
      onArchiveServer?.(serverId);
      toast.success('Server archived');
    },
    [archiveServer, onArchiveServer]
  );

  const handleRestoreServer = useCallback(
    (serverId: number) => {
      restoreServer(serverId);
      onRestoreServer?.(serverId);
      toast.success('Server restored');
    },
    [restoreServer, onRestoreServer]
  );

  const getStatusOptions = () => {
    const statuses = new Set(servers.map((s) => s.status));
    return Array.from(statuses).sort();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-lg">
        <div className="space-y-4 px-6 py-4">
          {/* Title and Controls */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Server Manager</h1>
              <p className="text-sm text-slate-400 mt-1">
                {stats.total} servers • {stats.online} online • {stats.archived} archived
              </p>
            </div>

            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className={cn(
                  'p-2 rounded transition-colors',
                  viewMode === 'grid'
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                    : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:border-slate-500/50'
                )}
              >
                {viewMode === 'grid' ? (
                  <Grid3x3 className="h-5 w-5" />
                ) : (
                  <List className="h-5 w-5" />
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowArchived(!showArchived)}
                className={cn(
                  'p-2 rounded transition-colors',
                  showArchived
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:border-slate-500/50'
                )}
              >
                <Archive className="h-5 w-5" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'p-2 rounded transition-colors',
                  showFilters
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:border-slate-500/50'
                )}
              >
                <Filter className="h-5 w-5" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded bg-purple-600 text-white border border-purple-500/50 hover:bg-purple-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
              </motion.button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search servers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
              />
            </div>

            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50 transition-colors"
              >
                <span className="text-sm">Sort by: {currentSort.sortBy}</span>
                <ChevronDown className="h-4 w-4" />
              </motion.button>
            </div>
          </div>

          {/* Filter Tags */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400">Status Filter</label>
                  <div className="flex flex-wrap gap-2">
                    {getStatusOptions().map((status) => (
                      <motion.button
                        key={status}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (selectedStatuses.includes(status)) {
                            setSelectedStatuses(selectedStatuses.filter((s) => s !== status));
                          } else {
                            setSelectedStatuses([...selectedStatuses, status]);
                          }
                        }}
                        className={cn(
                          'px-3 py-1 rounded text-xs font-medium border transition-all',
                          selectedStatuses.includes(status)
                            ? 'bg-purple-600/20 text-purple-400 border-purple-500/30'
                            : 'bg-slate-700/30 text-slate-400 border-slate-600/30 hover:border-slate-500/30'
                        )}
                      >
                        {status}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-300px)]">
        {/* Sidebar - Folders */}
        <motion.div
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="w-64 border-r border-slate-700/50 bg-slate-900/50 overflow-y-auto p-4 space-y-2"
        >
          <h2 className="text-sm font-semibold text-slate-300 px-3 py-2">Folders</h2>
          {folders.length > 0 ? (
            folders.map((folder) => (
              <ServerFolder
                key={folder.id}
                folder={folder}
                servers={servers}
                onSelectFolder={() => {}}
                onDeleteFolder={onDeleteServer}
              />
            ))
          ) : (
            <p className="text-xs text-slate-500 px-3">No folders yet</p>
          )}
        </motion.div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Pinned Servers Section */}
          <AnimatePresence mode="wait">
            {pinnedServers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-8"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="h-5 w-5 text-yellow-400" />
                  <h3 className="text-lg font-semibold text-white">Pinned Servers</h3>
                  <span className="text-sm text-slate-400">({pinnedServers.length})</span>
                </div>

                <div
                  className={cn(
                    'gap-4',
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                      : 'space-y-3'
                  )}
                >
                  {pinnedServers.map((server) => (
                    <motion.div
                      key={server.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      onClick={() => onServerSelect?.(server)}
                    >
                      <EnhancedServerCard
                        server={server}
                        isArchived={archivedServers.has(server.id)}
                        onOpenServer={onServerSelect}
                        onStartServer={onStartServer}
                        onStopServer={onStopServer}
                        onRestartServer={onRestartServer}
                        onDeleteServer={onDeleteServer}
                        onArchive={handleArchiveServer}
                        onRestore={handleRestoreServer}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Regular Servers Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <LayoutGrid className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">
                {showArchived ? 'Archived Servers' : 'Active Servers'}
              </h3>
              <span className="text-sm text-slate-400">({regularServers.length})</span>
            </div>

            {regularServers.length > 0 ? (
              <motion.div
                layout
                className={cn(
                  'gap-4',
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    : 'space-y-3'
                )}
              >
                <AnimatePresence mode="popLayout">
                  {regularServers.map((server) => (
                    <motion.div
                      key={server.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      onClick={() => onServerSelect?.(server)}
                    >
                      <EnhancedServerCard
                        server={server}
                        isArchived={archivedServers.has(server.id)}
                        onOpenServer={onServerSelect}
                        onStartServer={onStartServer}
                        onStopServer={onStopServer}
                        onRestartServer={onRestartServer}
                        onDeleteServer={onDeleteServer}
                        onArchive={handleArchiveServer}
                        onRestore={handleRestoreServer}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <div className="text-center">
                  <p className="text-slate-400 mb-2">
                    {showArchived ? 'No archived servers' : 'No servers found'}
                  </p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-purple-400 hover:text-purple-300 transition-colors text-sm"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedDashboard;
