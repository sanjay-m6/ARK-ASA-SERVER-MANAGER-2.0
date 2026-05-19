import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronDown, Filter as FilterIcon } from 'lucide-react';
import type { Server } from '../../types';
import type { ServerFilter, ServerSortOptions } from '../../types/server-organization';
import { cn } from '../../utils/helpers';

interface ServerSearchFilterProps {
  servers: Server[];
  onFiltered?: (servers: Server[]) => void;
  onFilterChange?: (filter: ServerFilter) => void;
  onSortChange?: (sort: ServerSortOptions) => void;
  showAdvanced?: boolean;
}

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'activity', label: 'Last Activity' },
  { value: 'uptime', label: 'Uptime' },
  { value: 'players', label: 'Player Count' },
  { value: 'created_at', label: 'Created Date' },
  { value: 'last_started', label: 'Last Started' },
];

export const ServerSearchFilter: React.FC<ServerSearchFilterProps> = ({
  servers,
  onFiltered,
  onFilterChange,
  onSortChange,
  showAdvanced = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<ServerFilter>({});
  const [sort, setSort] = useState<ServerSortOptions>({
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Get unique values for filters
  const uniqueStatuses = useMemo(() => {
    return Array.from(new Set(servers.map((s) => s.status))).sort();
  }, [servers]);

  const uniqueMaps = useMemo(() => {
    return Array.from(new Set(servers.map((s) => s.config.mapName))).sort();
  }, [servers]);

  // Filter servers
  const filteredServers = useMemo(() => {
    let result = servers;

    // Search query
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter((server) =>
        server.name.toLowerCase().includes(lowerQuery) ||
        server.config.mapName.toLowerCase().includes(lowerQuery) ||
        server.config.sessionName.toLowerCase().includes(lowerQuery)
      );
    }

    // Status filter
    if (filter.status && filter.status.length > 0) {
      result = result.filter((server) => filter.status!.includes(server.status));
    }

    // Map filter
    if (filter.mapName && filter.mapName.length > 0) {
      result = result.filter((server) => filter.mapName!.includes(server.config.mapName));
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sort.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'created_at':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'last_started':
          const aTime = a.lastStarted ? new Date(a.lastStarted).getTime() : 0;
          const bTime = b.lastStarted ? new Date(b.lastStarted).getTime() : 0;
          comparison = aTime - bTime;
          break;
        default:
          comparison = 0;
      }

      return sort.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [servers, searchQuery, filter, sort]);

  // Notify parent of changes
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      onFilterChange?.({ ...filter, searchQuery: query || undefined });
      onFiltered?.(filteredServers);
    },
    [filter, filteredServers, onFilterChange, onFiltered]
  );

  const handleStatusFilterChange = useCallback(
    (status: string, checked: boolean) => {
      const newStatuses = checked
        ? [...(filter.status || []), status]
        : (filter.status || []).filter((s) => s !== status);

      const newFilter = {
        ...filter,
        status: newStatuses.length > 0 ? newStatuses : undefined,
      };

      setFilter(newFilter);
      onFilterChange?.(newFilter);
    },
    [filter, onFilterChange]
  );

  const handleMapFilterChange = useCallback(
    (map: string, checked: boolean) => {
      const newMaps = checked
        ? [...(filter.mapName || []), map]
        : (filter.mapName || []).filter((m: string) => m !== map);

      const newFilter = {
        ...filter,
        mapName: newMaps.length > 0 ? newMaps : undefined,
      };

      setFilter(newFilter);
      onFilterChange?.(newFilter);
    },
    [filter, onFilterChange]
  );

  const handleSortChange = useCallback(
    (sortBy: string) => {
      const newSort: ServerSortOptions = {
        sortBy: sortBy as any,
        sortOrder: sort.sortOrder,
      };

      setSort(newSort);
      setShowSortMenu(false);
      onSortChange?.(newSort);
    },
    [sort, onSortChange]
  );

  const handleSortOrderChange = useCallback(() => {
    const newSort: ServerSortOptions = {
      ...sort,
      sortOrder: sort.sortOrder === 'asc' ? 'desc' : 'asc',
    };

    setSort(newSort);
    onSortChange?.(newSort);
  }, [sort, onSortChange]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setFilter({});
    onFilterChange?.({});
  }, [onFilterChange]);

  const activeFilterCount = useMemo(() => {
    let count = searchQuery ? 1 : 0;
    if (filter.status?.length) count++;
    if (filter.mapName?.length) count++;
    if (filter.tags?.length) count++;
    if (filter.isFavorite !== undefined) count++;
    if (filter.isArchived !== undefined) count++;
    return count;
  }, [filter, searchQuery]);

  return (
    <div className="space-y-3 rounded-lg bg-slate-800/40 p-4 border border-slate-700/50">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search servers by name, map, or session..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/30 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => handleSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter and Sort Controls */}
      <div className="flex items-center gap-2">
        {/* Sort Dropdown */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-sm text-slate-300 hover:bg-slate-700 hover:border-slate-500 transition-all"
          >
            <span>Sort: {SORT_OPTIONS.find((o) => o.value === sort.sortBy)?.label}</span>
            <ChevronDown className="h-4 w-4" />
          </motion.button>

          <AnimatePresence>
            {showSortMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute top-full left-0 z-50 mt-2 w-48 rounded-lg border border-slate-600 bg-slate-800 shadow-lg"
              >
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSortChange(option.value)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                      sort.sortBy === option.value
                        ? 'bg-purple-600/20 text-purple-300'
                        : 'text-slate-300 hover:bg-slate-700/50'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sort Order Toggle */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSortOrderChange}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-sm text-slate-300 hover:bg-slate-700 hover:border-slate-500 transition-all"
        >
          <span>{sort.sortOrder === 'asc' ? '↑' : '↓'}</span>
        </motion.button>

        {/* Advanced Filters Toggle */}
        {showAdvanced && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
              showFilterPanel
                ? 'bg-blue-600/20 border-blue-500/30 text-blue-300'
                : activeFilterCount > 0
                ? 'bg-purple-600/20 border-purple-500/30 text-purple-300'
                : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
            )}
          >
            <FilterIcon className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-current/30 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </motion.button>
        )}

        {/* Clear Button */}
        {activeFilterCount > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={clearFilters}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-sm text-slate-300 hover:bg-slate-700 hover:border-slate-500 transition-all"
          >
            <X className="h-4 w-4" />
            Clear
          </motion.button>
        )}
      </div>

      {/* Advanced Filter Panel */}
      <AnimatePresence>
        {showFilterPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 border-t border-slate-700/50 pt-3"
          >
            {/* Status Filter */}
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-2 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {uniqueStatuses.map((status) => (
                  <motion.label
                    key={status}
                    whileHover={{ scale: 1.05 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600 text-sm text-slate-300 cursor-pointer hover:bg-slate-700/70 transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={filter.status?.includes(status) ?? false}
                      onChange={(e) => handleStatusFilterChange(status, e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-purple-500 cursor-pointer"
                    />
                    <span className="capitalize">{status}</span>
                  </motion.label>
                ))}
              </div>
            </div>

            {/* Map Filter */}
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-2 block">Map</label>
              <div className="flex flex-wrap gap-2">
                {uniqueMaps.map((map) => (
                  <motion.label
                    key={map}
                    whileHover={{ scale: 1.05 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600 text-sm text-slate-300 cursor-pointer hover:bg-slate-700/70 transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={filter.mapName?.includes(map) ?? false}
                      onChange={(e) => handleMapFilterChange(map, e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-purple-500 cursor-pointer"
                    />
                    <span>{map.replace(/_/g, ' ')}</span>
                  </motion.label>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results Summary */}
      <div className="text-xs text-slate-400 flex items-center justify-between">
        <span>
          Showing <span className="font-semibold text-slate-300">{filteredServers.length}</span> of{' '}
          <span className="font-semibold text-slate-300">{servers.length}</span> servers
        </span>
      </div>
    </div>
  );
};

export default ServerSearchFilter;
