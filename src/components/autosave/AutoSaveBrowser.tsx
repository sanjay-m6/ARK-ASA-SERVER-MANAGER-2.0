// Auto-Save Browser Component
// Main interface for browsing, searching, and managing auto-saves

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Search,
  Shield,
  Star,
  Clock,
  HardDrive,
  AlertTriangle,
  Grid3x3,
  List,
  MoreVertical,
  Zap,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from 'lucide-react';
import { useAutoSaveStore, getFilteredAndSortedSaves } from '@/stores/autoSaveStore';
import { AutoSave } from '@/types/autosave';
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
  const [sizeFilter, setSizeFilter] = useState<string>('');
  const [playersFilter, setPlayersFilter] = useState<string>('');

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

  const savesForServer = useMemo(
    () => Array.from(saves.values()).filter((s) => s.serverId === serverId),
    [saves, serverId]
  );

  const filteredSaves = useMemo(() => {
    return getFilteredAndSortedSaves(saves, serverId, filters, sortOptions);
  }, [saves, serverId, filters, sortOptions]);

  const uniqueMaps = useMemo(() => {
    return Array.from(new Set(savesForServer.map((s) => s.mapName).filter(Boolean)));
  }, [savesForServer]);

  // Stable callbacks to prevent child re-renders
  const handleSelectSave = useCallback((id: number) => {
    toggleSaveSelection(id);
  }, [toggleSaveSelection]);

  const handleRestoreSave = useCallback((save: AutoSave) => {
    onRestoreClick(save);
  }, [onRestoreClick]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setFilters({ ...filters, searchQuery: query });
  }, [filters, setFilters]);

  const handleStatusFilter = useCallback((status: string) => {
    const current = filters.status || [];
    const updated = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    setFilters({ ...filters, status: updated.length > 0 ? updated : undefined });
  }, [filters, setFilters]);

  const handleSizeFilterChange = useCallback((val: string) => {
    setSizeFilter(val);
    let minSize: number | undefined = undefined;
    let maxSize: number | undefined = undefined;

    if (val === 'small') {
      maxSize = 50 * 1024 * 1024;
    } else if (val === 'medium') {
      minSize = 50 * 1024 * 1024;
      maxSize = 200 * 1024 * 1024;
    } else if (val === 'large') {
      minSize = 200 * 1024 * 1024;
    }

    setFilters({
      ...filters,
      minSize,
      maxSize,
    });
  }, [filters, setFilters]);

  const handlePlayersFilterChange = useCallback((val: string) => {
    setPlayersFilter(val);
    let playerCountRange: [number, number] | undefined = undefined;

    if (val === 'empty') {
      playerCountRange = [0, 0];
    } else if (val === 'active') {
      playerCountRange = [1, 10];
    } else if (val === 'high') {
      playerCountRange = [11, 9999];
    }

    setFilters({
      ...filters,
      playerCountRange,
    });
  }, [filters, setFilters]);

  const toggleSortOrder = useCallback(() => {
    setSortOptions({
      ...sortOptions,
      sortOrder: sortOptions.sortOrder === 'asc' ? 'desc' : 'asc',
    });
  }, [sortOptions, setSortOptions]);

  const handleSort = useCallback((sortBy: string) => {
    if (sortOptions.sortBy === sortBy) {
      setSortOptions({
        ...sortOptions,
        sortOrder: sortOptions.sortOrder === 'asc' ? 'desc' : 'asc',
      });
    } else {
      setSortOptions({ sortBy, sortOrder: 'desc' });
    }
  }, [sortOptions, setSortOptions]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedMap(null);
    setSizeFilter('');
    setPlayersFilter('');
    setFilters({ searchQuery: '' });
  }, [setFilters]);

  return (
    <div className="flex flex-col h-full bg-slate-900/10">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/40 p-4">
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
              <div className="flex flex-col gap-6">
                {/* Filters Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Status Filters (Left Column - 4 cols span) */}
                  <div className="md:col-span-4 bg-slate-950/20 p-4 rounded-xl border border-slate-800/40">
                    <p className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                      Status Filter
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {['valid', 'corrupted', 'protected', 'favorite'].map((status) => {
                        const isChecked = filters.status?.includes(status) || false;
                        return (
                          <label
                            key={status}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-200 ${
                              isChecked
                                ? 'bg-blue-600/10 border-blue-500/30 text-white'
                                : 'bg-slate-900/30 border-slate-850 hover:bg-slate-900/60 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleStatusFilter(status)}
                              className="w-4 h-4 rounded bg-slate-950/60 border-slate-800/80 text-blue-500 focus:ring-blue-500/40 cursor-pointer"
                            />
                            <span className="text-sm font-medium capitalize">{status}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dropdowns (Right Column - 8 cols span) */}
                  <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4">
                    {/* Map Filter */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Map</p>
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
                        className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl
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

                    {/* Size Filter */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">File Size</p>
                      <select
                        value={sizeFilter}
                        onChange={(e) => handleSizeFilterChange(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl
                                 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                      >
                        <option value="">All Sizes</option>
                        <option value="small">Small (&lt; 50MB)</option>
                        <option value="medium">Medium (50MB - 200MB)</option>
                        <option value="large">Large (&gt; 200MB)</option>
                      </select>
                    </div>

                    {/* Players Filter */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Player Activity</p>
                      <select
                        value={playersFilter}
                        onChange={(e) => handlePlayersFilterChange(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl
                                 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                      >
                        <option value="">Any Player Count</option>
                        <option value="empty">Empty (0 players)</option>
                        <option value="active">Active (1 - 10 players)</option>
                        <option value="high">High Activity (10+ players)</option>
                      </select>
                    </div>

                    {/* Sort Options & Toggle Row */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Sort By</p>
                      <div className="flex gap-2">
                        <select
                          value={sortOptions.sortBy}
                          onChange={(e) => handleSort(e.target.value)}
                          className="flex-1 px-3 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl
                                   text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                        >
                          <option value="date">Date</option>
                          <option value="size">Size</option>
                          <option value="players">Players</option>
                          <option value="uptime">Uptime</option>
                          <option value="name">Name</option>
                        </select>
                        <button
                          type="button"
                          onClick={toggleSortOrder}
                          title={`Sort Order: ${sortOptions.sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
                          className="px-3.5 bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/80 hover:border-slate-700 rounded-xl transition text-blue-400 hover:text-white flex items-center justify-center shrink-0"
                        >
                          {sortOptions.sortOrder === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Action Row (Perfect Alignment & Summary) */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800 bg-slate-900/10 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">
                    {Object.values(filters).some(v => v !== undefined && v !== '') ? (
                      <span className="flex items-center gap-1.5 text-blue-400/90 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        Filters active • Found {filteredSaves.length} saves matching criteria
                      </span>
                    ) : (
                      <span>No filters active • Showing all saves</span>
                    )}
                  </div>
                  
                  <button
                    onClick={handleClearFilters}
                    className="px-5 py-2 bg-slate-950/45 border border-slate-800 hover:bg-slate-850/60 hover:text-white hover:border-slate-700 rounded-xl
                             text-slate-300 text-xs transition font-bold uppercase tracking-wider shadow-inner"
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
                  onSelect={handleSelectSave}
                  onRestore={handleRestoreSave}
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
                  onSelect={handleSelectSave}
                  onRestore={handleRestoreSave}
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
  onSelect: (id: number) => void;
  onRestore: (save: AutoSave) => void;
}

const SaveCard = React.memo<SaveCardProps>(function SaveCard({
  save,
  isSelected,
  onSelect,
  onRestore,
}) {
  const [showMenu, setShowMenu] = useState(false);

  const handleClick = useCallback(() => onSelect(save.id), [onSelect, save.id]);
  const handleRestore = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRestore(save);
  }, [onRestore, save]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`relative p-4 rounded-2xl border transition-colors duration-200 group cursor-pointer ${
        isSelected
          ? 'bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-500/5'
          : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700/60 hover:bg-slate-900/60'
      }`}
      onClick={handleClick}
    >
      {/* Checkbox */}
      <div className="absolute top-2 right-2 flex gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleClick}
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
        onClick={handleRestore}
        className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold
                 rounded-xl shadow-lg shadow-blue-500/15 transition-all duration-300 hover:scale-[1.02]"
      >
        Restore
      </button>
    </motion.div>
  );
});

// ============================================================================
// Save Row Component (List View)
// ============================================================================

interface SaveRowProps {
  save: AutoSave;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onRestore: (save: AutoSave) => void;
}

const SaveRow = React.memo<SaveRowProps>(function SaveRow({
  save,
  isSelected,
  onSelect,
  onRestore,
}) {
  const handleSelect = useCallback(() => onSelect(save.id), [onSelect, save.id]);
  const handleRestore = useCallback(() => onRestore(save), [onRestore, save]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className={`px-4 py-3 flex items-center gap-4 hover:bg-slate-900/40 transition-colors duration-200 ${
        isSelected ? 'bg-blue-600/10 border-l-2 border-blue-500' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={handleSelect}
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
        onClick={handleRestore}
        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold
                 rounded-xl shadow-lg shadow-blue-500/15 transition-all duration-300 hover:scale-[1.02] whitespace-nowrap"
      >
        Restore
      </button>
    </motion.div>
  );
});

export default AutoSaveBrowser;
