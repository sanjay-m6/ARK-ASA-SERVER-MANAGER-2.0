// Auto-Save Browser Component
// Main interface for browsing, searching, and managing auto-saves

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Search,
  Plus,
  Trash2,
  Shield,
  Star,
  Clock,
  HardDrive,
  AlertTriangle,
  Grid3x3,
  List,
  MoreVertical,
  Download,
  Zap,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { useAutoSaveStore, selectFilteredAndSortedSaves } from '@/stores/autoSaveStore';
import { AutoSave, SaveBrowserViewMode } from '@/types/autosave';
import { formatFileSize, formatDate, formatRelativeTime } from '@/utils/autoSaveApi';

interface AutoSaveBrowserProps {
  serverId: number;
  onRestoreClick: (save: AutoSave) => void;
  onRefresh?: () => void;
}

export const AutoSaveBrowser: React.FC<AutoSaveBrowserProps> = ({
  serverId,
  onRestoreClick,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMap, setSelectedMap] = useState<string | null>(null);

  const {
    saves,
    filters,
    sortOptions,
    setFilters,
    setSortOptions,
    selectedSaveIds,
    toggleSaveSelection,
    statistics,
    healthStatus,
  } = useAutoSaveStore();

  const saves_array = Array.from(saves.values());
  const savesForServer = useMemo(
    () => saves_array.filter((s) => s.serverId === serverId),
    [saves_array, serverId]
  );

  const filteredSaves = useMemo(() => {
    return selectFilteredAndSortedSaves(serverId, filters, sortOptions);
  }, [serverId, filters, sortOptions]);

  const uniqueMaps = useMemo(() => {
    return Array.from(new Set(savesForServer.map((s) => s.mapName).filter(Boolean)));
  }, [savesForServer]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setFilters({ ...filters, searchQuery: query });
  };

  const handleStatusFilter = (status: string) => {
    const current = filters.status || [];
    const updated = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    setFilters({ ...filters, status: updated.length > 0 ? updated : undefined });
  };

  const handleSort = (sortBy: string) => {
    if (sortOptions.sortBy === sortBy) {
      setSortOptions({
        ...sortOptions,
        sortOrder: sortOptions.sortOrder === 'asc' ? 'desc' : 'asc',
      });
    } else {
      setSortOptions({ sortBy, sortOrder: 'desc' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/10 backdrop-blur-xl">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/40 backdrop-blur-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/10 border border-blue-500/20 rounded-xl">
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Auto-Saves</h2>
              <p className="text-xs text-slate-400 font-medium">
                {savesForServer.length} saves • {statistics && formatFileSize(statistics.totalStorageUsed)}
              </p>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-slate-850/60 rounded-xl transition text-slate-400 hover:text-white"
          >
            <Zap className="w-5 h-5 text-blue-400" />
          </button>
        </div>

        {/* Search and Controls */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search saves..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950/40 border border-slate-800/80 rounded-xl
                       text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50
                       transition"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-xl border transition ${
              showFilters
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                : 'bg-slate-950/40 text-slate-400 border-slate-800/80 hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <div className="flex gap-1 border-l border-slate-800/80 pl-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-xl border transition ${
                viewMode === 'grid'
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-slate-950/40 text-slate-400 border-slate-800/80 hover:bg-slate-800/40 hover:text-white'
              }`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-xl border transition ${
                viewMode === 'list'
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-slate-950/40 text-slate-400 border-slate-800/80 hover:bg-slate-800/40 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-slate-800/80"
            >
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {/* Status Filters */}
                <div>
                  <p className="text-xs font-bold text-slate-400 mb-2">Status</p>
                  <div className="space-y-2">
                    {['valid', 'corrupted', 'protected', 'favorite'].map((status) => (
                      <label key={status} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.status?.includes(status) || false}
                          onChange={() => handleStatusFilter(status)}
                          className="w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
                        />
                        <span className="text-sm text-slate-300 capitalize">{status}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Map Filter */}
                {uniqueMaps.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 mb-2">Map</p>
                    <select
                      value={selectedMap || ''}
                      onChange={(e) => {
                        const map = e.target.value || null;
                        setSelectedMap(map);
                        setFilters({
                          ...filters,
                          mapNames: map ? [map] : undefined,
                        });
                      }}
                      className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800/80 rounded-xl
                               text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                    >
                      <option value="">All Maps</option>
                      {uniqueMaps.map((map) => (
                        <option key={map} value={map}>
                          {map}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Sort Options */}
                <div>
                  <p className="text-xs font-bold text-slate-400 mb-2">Sort By</p>
                  <select
                    value={sortOptions.sortBy}
                    onChange={(e) => handleSort(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800/80 rounded-xl
                             text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                  >
                    <option value="date">Date</option>
                    <option value="size">Size</option>
                    <option value="players">Players</option>
                    <option value="uptime">Uptime</option>
                    <option value="name">Name</option>
                  </select>
                </div>

                {/* Clear Filters */}
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedMap(null);
                      setFilters({ searchQuery: '' });
                    }}
                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800/80 hover:bg-slate-800/40 hover:text-white rounded-xl
                             text-slate-300 text-sm transition font-semibold"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Health Status Bar */}
      {healthStatus && (
        <div
          className={`px-4 py-2.5 border-b border-slate-800/80 flex items-center gap-3 ${
            healthStatus.status === 'critical' ? 'bg-red-950/20' : 'bg-slate-950/30'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <div className="flex-1">
            <p className="text-sm text-slate-300 font-medium">
              <span className="font-semibold capitalize">{healthStatus.status}</span>
              {' health • '}
              {healthStatus.issuesCount > 0 && (
                <span>{healthStatus.issuesCount} issues detected</span>
              )}
            </p>
          </div>
          <div
            className={`text-xs font-bold px-3 py-1 rounded-full ${
              healthStatus.healthScore >= 75
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
          >
            {Math.round(healthStatus.healthScore)}%
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {filteredSaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 font-medium">
            <Clock className="w-12 h-12 mb-4 opacity-40 text-blue-400" />
            <p className="text-lg font-bold text-slate-300">No saves found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            <AnimatePresence>
              {filteredSaves.map((save) => (
                <SaveCard
                  key={save.id}
                  save={save}
                  isSelected={selectedSaveIds.has(save.id)}
                  onSelect={() => toggleSaveSelection(save.id)}
                  onRestore={() => onRestoreClick(save)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            <AnimatePresence>
              {filteredSaves.map((save) => (
                <SaveRow
                  key={save.id}
                  save={save}
                  isSelected={selectedSaveIds.has(save.id)}
                  onSelect={() => toggleSaveSelection(save.id)}
                  onRestore={() => onRestoreClick(save)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Save Card Component (Grid View)
// ============================================================================

interface SaveCardProps {
  save: AutoSave;
  isSelected: boolean;
  onSelect: () => void;
  onRestore: () => void;
}

const SaveCard: React.FC<SaveCardProps> = ({
  save,
  isSelected,
  onSelect,
  onRestore,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`relative p-4 rounded-2xl border transition-all duration-300 group cursor-pointer ${
        isSelected
          ? 'bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-500/5'
          : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700/60 hover:bg-slate-900/60'
      }`}
      onClick={onSelect}
    >
      {/* Checkbox */}
      <div className="absolute top-2 right-2 flex gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 hover:bg-slate-800/60 rounded-lg transition opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Header */}
      <div className="mb-3 pr-8">
        <div className="flex items-start gap-2 mb-2">
          {save.isProtected && <Shield className="w-4 h-4 text-amber-400 mt-0.5" />}
          {save.isFavorite && <Star className="w-4 h-4 text-yellow-400 mt-0.5 fill-yellow-400" />}
        </div>
        <h3 className="font-semibold text-white truncate">{save.customLabel || save.fileName}</h3>
        <p className="text-xs text-slate-400 mt-1 font-medium">{formatRelativeTime(save.createdAt)}</p>
      </div>

      {/* Status Badge */}
      {save.isCorrupted && (
        <div className="mb-3 inline-block px-2.5 py-1 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 font-bold">
          Corrupted
        </div>
      )}

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-3 font-medium">
        <div className="flex items-center gap-1">
          <HardDrive className="w-3.5 h-3.5 text-slate-500" />
          {formatFileSize(save.fileSize)}
        </div>
        {save.playerCount !== undefined && (
          <div className="flex items-center gap-1 text-slate-300">
            👥 {save.playerCount} players
          </div>
        )}
        {save.mapName && (
          <div className="col-span-2 text-slate-300 font-semibold">{save.mapName}</div>
        )}
      </div>

      {/* Action Buttons */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRestore();
        }}
        className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold
                 rounded-xl shadow-lg shadow-blue-500/15 transition-all duration-300 hover:scale-[1.02]"
      >
        Restore
      </button>
    </motion.div>
  );
};

// ============================================================================
// Save Row Component (List View)
// ============================================================================

interface SaveRowProps {
  save: AutoSave;
  isSelected: boolean;
  onSelect: () => void;
  onRestore: () => void;
}

const SaveRow: React.FC<SaveRowProps> = ({
  save,
  isSelected,
  onSelect,
  onRestore,
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className={`px-4 py-3 flex items-center gap-4 hover:bg-slate-900/40 transition-all duration-200 ${
        isSelected ? 'bg-blue-600/10 border-l-2 border-blue-500' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        className="w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {save.isProtected && <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />}
          {save.isFavorite && (
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
          )}
          <span className="font-semibold text-white truncate">
            {save.customLabel || save.fileName}
          </span>
        </div>
        <div className="text-xs text-slate-400 mt-1 flex gap-4 flex-wrap font-medium">
          <span>{formatDate(save.createdAt)}</span>
          <span>{formatFileSize(save.fileSize)}</span>
          {save.mapName && <span className="text-slate-300">{save.mapName}</span>}
          {save.playerCount !== undefined && <span className="text-slate-300">👥 {save.playerCount}</span>}
        </div>
      </div>

      {save.isCorrupted && (
        <div className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-lg">
          Corrupted
        </div>
      )}

      <button
        onClick={onRestore}
        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold
                 rounded-xl shadow-lg shadow-blue-500/15 transition-all duration-300 hover:scale-[1.02] whitespace-nowrap"
      >
        Restore
      </button>
    </motion.div>
  );
};

export default AutoSaveBrowser;
