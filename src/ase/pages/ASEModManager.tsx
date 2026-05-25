import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { convertFileSrc } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { 
  Puzzle, Search, Download, ExternalLink, Trash2, 
  CheckCircle2, AlertCircle, Loader2, X, Copy, ArrowUp, ArrowDown, 
  CheckSquare, Square, ChevronUp, ChevronDown, Sparkles, PlusCircle, RefreshCw,
  ShieldAlert, GripVertical, Undo, Redo, Pin, Wrench, Globe, Flame
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAseModStore } from '../stores/aseModStore';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { 
  searchWorkshop, downloadWorkshopMod, removeWorkshopMod, 
  toggleAseMod, updateAseModOrder 
} from '../utils/aseCommands';


const getModImageSrc = (mod: any) => {
  if (!mod) return '';
  if (mod.cachedImageUrl) {
    try {
      return convertFileSrc(mod.cachedImageUrl);
    } catch (e) {
      console.error("Failed to convert cached image path:", e);
    }
  }
  return mod.previewUrl || '';
};

const resolveModDetails = (mod: any) => {
  if (!mod) return { name: '', description: '', previewUrl: '' };
  
  let name = mod.name;
  if (!name || name.startsWith('Workshop Mod #')) {
    name = `Workshop Mod #${mod.workshopId}`;
  }
  
  const description = mod.description || 'No description available on Steam Workshop.';
  const previewUrl = getModImageSrc(mod);
  const author = mod.author || "Steam Mod Author";
  const fileSize = mod.fileSize || 0;
  const subscribers = mod.subscribers || mod.subscriberCount || 0;
  const tags = mod.tags || [];

  return {
    ...mod,
    name,
    description,
    previewUrl,
    author,
    fileSize,
    subscribers,
    tags
  };
};

const ModImage = ({ mod, className }: { mod: any; className?: string }) => {
  const [hasError, setHasError] = useState(false);
  const resolved = resolveModDetails(mod);
  const src = resolved.previewUrl;

  if (!src || hasError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950/80 relative overflow-hidden group">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.08),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px]" />
        <Puzzle className="w-4 h-4 text-slate-700/80 group-hover:text-amber-500/40 transition-colors" />
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt="" 
      className={className} 
      onError={() => setHasError(true)} 
    />
  );
};

export default function ASEModManager() {
  const { servers } = useAseServerStore();
  const { 
    installedMods, 
    searchResults, 
    isSearching, 
    setSearchResults, 
    setIsSearching, 
    refreshInstalledMods,
    installingQueue,
    addToQueue,
    updateQueueStatus,
    removeFromQueue,
    clearQueue,
    setIsInstalling
  } = useAseModStore();

  const [query, setQuery] = useState('');
  const [installedFilter, setInstalledFilter] = useState('');
  const [selectedServer, setSelectedServer] = useState<number | null>(servers[0]?.id || null);
  const [selectedModDetail, setSelectedModDetail] = useState<any | null>(null);

  const [activeTab, setActiveTab] = useState<'available' | 'installed'>('available');
  
  // Selection & Manual Mod installation states
  const [selectedModIds, setSelectedModIds] = useState<string[]>([]);
  const [manualModId, setManualModId] = useState('');
  const [isQueueExpanded, setIsQueueExpanded] = useState(true);
  const [discoverCategory, setDiscoverCategory] = useState<string>('Featured');

  // Real-time Steam storefront states
  const [storefrontMods, setStorefrontMods] = useState<any[]>([]);
  const [isLoadingStorefront, setIsLoadingStorefront] = useState(false);
  const [visibleModsCount, setVisibleModsCount] = useState(20);

  // Integrity check & Repair states
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<any | null>(null);

  // Drag and Drop reordering states (managed by @hello-pangea/dnd)

  // Undo/Redo stacks for load order
  const [undoHistory, setUndoHistory] = useState<string[][]>([]);
  const [redoHistory, setRedoHistory] = useState<string[][]>([]);

  // Sorting and Pinning (Favorite) states
  const [sortOrder, setSortOrder] = useState<'load_order' | 'name' | 'size'>('load_order');
  const [pinnedModIds, setPinnedModIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ase_pinned_mods');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [expandedModId, setExpandedModId] = useState<string | null>(null);

  const handleTogglePin = (workshopId: string) => {
    setPinnedModIds(prev => {
      const next = prev.includes(workshopId) 
        ? prev.filter(id => id !== workshopId) 
        : [...prev, workshopId];
      localStorage.setItem('ase_pinned_mods', JSON.stringify(next));
      return next;
    });
  };
  const [isRepairing, setIsRepairing] = useState(false);

  useEffect(() => {
    setValidationReport(null);
  }, [selectedModDetail]);

  const handleValidateMod = async (workshopId: string) => {
    if (!selectedServer) return;
    setIsValidating(true);
    try {
      const { validateAseMod } = await import('../utils/aseCommands');
      const report = await validateAseMod(selectedServer, workshopId);
      setValidationReport(report);
      if (report.isValid) {
        toast.success('Mod structure is healthy and fully valid!');
      } else {
        toast.error(`Mod validation failed! Found ${report.issues.length} issue(s).`);
      }
    } catch (error) {
      console.error('Failed to validate mod:', error);
      toast.error('Failed to validate mod files structure.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRepairMod = async (workshopId: string, forceRedownload: boolean = false) => {
    if (!selectedServer) return;
    setIsRepairing(true);
    try {
      if (forceRedownload) {
        const { forceDownloadAseMod } = await import('../utils/aseCommands');
        toast('Force redownloading and extracting mod files...');
        await forceDownloadAseMod(selectedServer, workshopId);
        toast.success('Mod successfully redownloaded and reinstalled!');
        setValidationReport(null);
        setSelectedModDetail(null);
        refreshInstalledMods(selectedServer);
      } else {
        const { repairAseMod } = await import('../utils/aseCommands');
        toast('Running rapid structural repair locally...');
        const report = await repairAseMod(selectedServer, workshopId);
        setValidationReport(report);
        if (report.isValid) {
          toast.success('Mod successfully repaired and re-validated!');
        } else {
          toast.error('Local repair completed, but some validation issues remain.');
        }
        refreshInstalledMods(selectedServer);
      }
    } catch (error) {
      console.error('Failed to repair mod:', error);
      toast.error('Failed to repair/reinstall mod.');
    } finally {
      setIsRepairing(false);
    }
  };

  const fetchStorefrontMods = async (category: string = 'Featured') => {
    setIsLoadingStorefront(true);
    setStorefrontMods([]); // Clear old list immediately to trigger premium skeleton shimmer!
    try {
      const { searchWorkshop } = await import('../utils/aseCommands');
      
      // Select best search term for real-time Steam Workshop loading based on the selected filter
      let queryTerm = "Ark";
      if (category === 'Structures') {
        queryTerm = "Structures";
      } else if (category === 'Dinos') {
        queryTerm = "Dino";
      } else if (category === 'Utilities') {
        queryTerm = "Utility";
      } else if (category === 'All') {
        queryTerm = "Mod"; // More generic search to get a wide variety of all mods
      }
      
      const details = await searchWorkshop(queryTerm);
      
      const mapped = details.slice(0, 20).map((item: any, index: number) => {
        const title = item.name || '';
        const desc = item.description || 'No description available.';
        
        // Dynamic categorization tags
        const tags: string[] = ['All'];
        const titleLower = title.toLowerCase();
        if (
          titleLower.includes('dino') || 
          titleLower.includes('pet') || 
          titleLower.includes('beast') ||
          titleLower.includes('addition') ||
          titleLower.includes('taming')
        ) {
          tags.push('Dinos');
        } else if (
          titleLower.includes('structure') || 
          titleLower.includes('build') || 
          titleLower.includes('platform') || 
          titleLower.includes('castle') || 
          titleLower.includes('pillar') ||
          titleLower.includes('saddle') ||
          titleLower.includes('decor') ||
          titleLower.includes('rp')
        ) {
          tags.push('Structures');
        } else {
          tags.push('Utilities');
        }
        
        // Force the active loaded category tag to exist so client filter doesn't filter it out
        if (category !== 'All' && !tags.includes(category)) {
          tags.push(category);
        }

        // The first 8 mods get "Featured" status dynamically
        if (index < 8) {
          tags.push('Featured');
        }

        return {
          ...item,
          description: desc.substring(0, 180) + (desc.length > 180 ? '...' : ''),
          tags: tags,
        };
      });

      const validMapped = mapped.filter((item: any) => item.name);
      if (validMapped.length > 0) {
        setStorefrontMods(validMapped);
      }
    } catch (error) {
      console.error('Failed to load real-time steam storefront mods:', error);
    } finally {
      setIsLoadingStorefront(false);
    }
  };

  useEffect(() => {
    fetchStorefrontMods('Featured');
  }, []);

  // Real-time debounced workshop search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      handleSearch();
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  // Refresh installed mods when server changes
  useEffect(() => {
    if (selectedServer) {
      refreshInstalledMods(selectedServer);
    }
  }, [selectedServer]);

  // Serial Queue Background Worker
  useEffect(() => {
    if (!selectedServer) return;
    const queueItems = Object.values(installingQueue);
    const hasQueued = queueItems.some(item => item.status === 'queued');
    const isCurrentlyProcessing = queueItems.some(item => item.status === 'downloading' || item.status === 'extracting');
    
    if (hasQueued && !isCurrentlyProcessing) {
      const nextMod = queueItems.find(item => item.status === 'queued');
      if (nextMod) {
        runQueueDownload(nextMod.workshopId, nextMod.modName);
      }
    }
  }, [installingQueue, selectedServer]);

  const runQueueDownload = async (workshopId: string, modName: string) => {
    if (!selectedServer) return;
    
    updateQueueStatus(workshopId, 'downloading');
    setIsInstalling(workshopId); // Keep for backwards compatibility
    
    try {
      // Decompressing extraction state simulation after 2 seconds
      const extractTimer = setTimeout(() => {
        updateQueueStatus(workshopId, 'extracting');
      }, 2500);

      await downloadWorkshopMod(selectedServer, workshopId, modName);
      clearTimeout(extractTimer);
      
      updateQueueStatus(workshopId, 'completed');
      toast.success(`Mod "${modName}" installed successfully!`);
      refreshInstalledMods(selectedServer);
    } catch (e) {
      updateQueueStatus(workshopId, 'failed', String(e));
      toast.error(`Failed to install "${modName}": ${e}`);
    } finally {
      setIsInstalling(null);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try { 
      const results = await searchWorkshop(query); 
      setSearchResults(results); 
    } catch (e) { 
      toast.error(`Search failed: ${e}`); 
    } finally { 
      setIsSearching(false); 
    }
  };

  const handleInstallSingle = (workshopId: string, modName: string) => {
    if (!selectedServer) { toast.error('Select a server first'); return; }
    if (isInstalled(workshopId)) { toast.error('Mod is already installed'); return; }
    
    addToQueue(workshopId, modName);
    toast.success(`Added "${modName}" to download queue!`);
  };

  const handleBulkInstall = () => {
    if (!selectedServer) { toast.error('Select a server first'); return; }
    if (selectedModIds.length === 0) return;

    let addedCount = 0;
    selectedModIds.forEach(id => {
      if (isInstalled(id)) return;
      const mod = searchResults.find(m => m.workshopId === id);
      const modName = mod ? mod.name : `Workshop Mod #${id}`;
      addToQueue(id, modName);
      addedCount++;
    });

    if (addedCount > 0) {
      toast.success(`Added ${addedCount} mods to download queue!`);
    } else {
      toast.error('Selected mods are already installed');
    }
    setSelectedModIds([]); // Clear selection
  };

  const handleManualInstall = () => {
    if (!selectedServer) { toast.error('Select a server first'); return; }
    if (!manualModId.trim()) return;
    
    const cleanId = manualModId.trim();
    if (isNaN(Number(cleanId))) {
      toast.error('Workshop ID must be a numeric value');
      return;
    }
    if (isInstalled(cleanId)) {
      toast.error('Mod is already installed');
      return;
    }

    addToQueue(cleanId, `Workshop Mod #${cleanId}`);
    toast.success(`Added Mod ID ${cleanId} to download queue!`);
    setManualModId('');
  };

  const handleRemove = async (workshopId: string) => {
    if (!selectedServer) return;
    if (!confirm('Remove this mod and delete its files?')) return;
    try { 
      await removeWorkshopMod(selectedServer, workshopId); 
      toast.success('Mod removed successfully'); 
      refreshInstalledMods(selectedServer); 
    } catch (e) { 
      toast.error(`${e}`); 
    }
  };

  const handleToggleModActive = async (workshopId: string, currentEnabled: boolean) => {
    if (!selectedServer) return;
    try {
      const { toggleAseMod } = await import('../utils/aseCommands');
      await toggleAseMod(selectedServer, workshopId, !currentEnabled);
      toast.success(currentEnabled ? 'Mod disabled in load order' : 'Mod enabled in load order');
      refreshInstalledMods(selectedServer);
    } catch (e) {
      toast.error(`Failed to toggle mod: ${e}`);
    }
  };

  const pushToUndoHistory = (ids: string[]) => {
    setUndoHistory(prev => [...prev.slice(-49), ids]);
    setRedoHistory([]);
  };

  const handleUndo = async () => {
    if (undoHistory.length === 0 || !selectedServer) return;
    const previousIds = undoHistory[undoHistory.length - 1];
    const currentIds = installedMods.map(m => m.workshopId);

    setUndoHistory(prev => prev.slice(0, -1));
    setRedoHistory(prev => [...prev, currentIds]);

    try {
      await updateAseModOrder(selectedServer, previousIds);
      toast.success('Undo: Reordered mods');
      refreshInstalledMods(selectedServer);
    } catch (e) {
      toast.error(`Undo failed: ${e}`);
    }
  };

  const handleRedo = async () => {
    if (redoHistory.length === 0 || !selectedServer) return;
    const nextIds = redoHistory[redoHistory.length - 1];
    const currentIds = installedMods.map(m => m.workshopId);

    setRedoHistory(prev => prev.slice(0, -1));
    setUndoHistory(prev => [...prev, currentIds]);

    try {
      await updateAseModOrder(selectedServer, nextIds);
      toast.success('Redo: Reordered mods');
      refreshInstalledMods(selectedServer);
    } catch (e) {
      toast.error(`Redo failed: ${e}`);
    }
  };

  const onDragEnd = async (result: any) => {
    if (!result.destination || !selectedServer) return;

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) return;

    const currentIds = installedMods.map(m => m.workshopId);
    pushToUndoHistory(currentIds);

    const newMods = [...installedMods];
    const [removed] = newMods.splice(sourceIndex, 1);
    newMods.splice(destinationIndex, 0, removed);

    const orderedIds = newMods.map(m => m.workshopId);

    try {
      await updateAseModOrder(selectedServer, orderedIds);
      toast.success('Load order updated');
      refreshInstalledMods(selectedServer);
    } catch (e) {
      toast.error(`Failed to update order: ${e}`);
    }
  };

  const handleMoveMod = async (index: number, direction: 'up' | 'down') => {
    if (!selectedServer) return;
    const newMods = [...installedMods];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newMods.length) return;
    
    const currentIds = installedMods.map(m => m.workshopId);
    pushToUndoHistory(currentIds);

    const temp = newMods[index];
    newMods[index] = newMods[targetIndex];
    newMods[targetIndex] = temp;
    
    const orderedIds = newMods.map(m => m.workshopId);
    
    try {
      await updateAseModOrder(selectedServer, orderedIds);
      toast.success('Load order updated');
      refreshInstalledMods(selectedServer);
    } catch (e) {
      toast.error(`Failed to update order: ${e}`);
    }
  };

  const handleBulkInstalledAction = async (action: 'enable_all' | 'disable_all' | 'uninstall_all') => {
    if (!selectedServer) return;
    
    if (action === 'uninstall_all') {
      if (!confirm('Are you absolutely sure you want to uninstall ALL mods? This will erase all mod assets.')) return;
      try {
        for (const mod of installedMods) {
          await removeWorkshopMod(selectedServer, mod.workshopId);
        }
        toast.success('All mods uninstalled');
        refreshInstalledMods(selectedServer);
      } catch (e) {
        toast.error(`Failed to uninstall mods: ${e}`);
      }
      return;
    }

    const enable = action === 'enable_all';
    try {
      for (const mod of installedMods) {
        if (mod.enabled !== enable) {
          await toggleAseMod(selectedServer, mod.workshopId, enable);
        }
      }
      toast.success(enable ? 'All mods enabled' : 'All mods disabled');
      refreshInstalledMods(selectedServer);
    } catch (e) {
      toast.error(`Bulk action failed: ${e}`);
    }
  };

  const toggleSelectMod = (id: string) => {
    setSelectedModIds(prev => 
      prev.includes(id) ? prev.filter(mId => mId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const uninstalledIds = searchResults
      .map(m => m.workshopId)
      .filter(id => id !== '0' && !isInstalled(id));
    setSelectedModIds(uninstalledIds);
  };

  const isInstalled = (id: string) => installedMods.some(m => m.workshopId === id);

  const filteredInstalledMods = [...installedMods]
    .filter(mod => 
      mod.name.toLowerCase().includes(installedFilter.toLowerCase()) ||
      mod.workshopId.includes(installedFilter)
    )
    .sort((a, b) => {
      // 1. Pinned mods always stay on top
      const aPinned = pinnedModIds.includes(a.workshopId);
      const bPinned = pinnedModIds.includes(b.workshopId);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      // 2. Secondary sorting strategy
      if (sortOrder === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortOrder === 'size') {
        const aSize = a.fileSize || 0;
        const bSize = b.fileSize || 0;
        return bSize - aSize;
      }
      return 0; // Default: load order
    });

  const activeQueueList = Object.values(installingQueue);
  const activeDownloadsCount = activeQueueList.filter(m => m.status === 'downloading' || m.status === 'extracting').length;
  const completedDownloadsCount = activeQueueList.filter(m => m.status === 'completed').length;
  const totalInQueue = activeQueueList.length;
  const baseModsList = storefrontMods;
  const displayMods = searchResults.length > 0 
    ? searchResults 
    : baseModsList.filter(mod => discoverCategory === 'All' || mod.tags.includes(discoverCategory));

  const slicedDisplayMods = displayMods.slice(0, visibleModsCount);

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl">
              <Puzzle className="w-6 h-6 text-amber-400" />
            </div>
            Mod Manager
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage Steam Workshop mods for ARK: Survival Evolved</p>
        </div>
        {servers.length > 0 && (
          <ServerSelect 
            value={selectedServer} 
            onChange={id => { 
              setSelectedServer(id); 
              refreshInstalledMods(id); 
            }} 
            servers={servers} 
            accentColor="amber" 
          />
        )}
      </div>

      {/* Info Banner */}
      <div className="flex items-start md:items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="mt-0.5 md:mt-0 p-1.5 bg-amber-500/20 rounded-lg shrink-0">
          <AlertCircle className="w-4 h-4 text-amber-400" />
        </div>
        <p className="text-sm text-amber-200/80 leading-relaxed">
          ASE mods are automatically downloaded via SteamCMD (App ID 346110) and extracted to the server. 
          The <code className="bg-amber-950/50 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20 text-xs">ActiveMods=</code> line in <code className="text-slate-300">GameUserSettings.ini</code> is managed for you automatically.
        </p>
      </div>

      {/* Search and Tabs Panel */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-[#0A0F1C]/60 p-5 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={activeTab === 'available' ? query : installedFilter}
            onChange={(e) => activeTab === 'available' ? setQuery(e.target.value) : setInstalledFilter(e.target.value)}
            placeholder={activeTab === 'available' ? "Search Steam Workshop..." : "Filter installed mods..."}
            className="w-full pl-11 pr-10 py-3 bg-[#0A0F1C]/80 border border-white/5 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500/30 focus:ring-4 focus:ring-amber-500/10 transition-all duration-300"
          />
          {((activeTab === 'available' && query) || (activeTab === 'installed' && installedFilter)) && (
            <button 
              onClick={() => activeTab === 'available' ? setQuery('') : setInstalledFilter('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 flex-shrink-0 w-full md:w-auto justify-between md:justify-end">
          {activeTab === 'available' && query.trim() && (
            <button 
              onClick={handleSearch} 
              disabled={isSearching}
              className="px-5 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300 focus:outline-none flex items-center gap-2 shadow-lg shadow-amber-500/20 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Search
            </button>
          )}

          <div className="flex p-1 bg-[#0A0F1C]/85 rounded-2xl border border-white/5 shrink-0">
            <button 
              onClick={() => setActiveTab('available')} 
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                activeTab === 'available' 
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Discover Mods
            </button>
            <button 
              onClick={() => setActiveTab('installed')} 
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
                activeTab === 'installed' 
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Installed Mods
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black font-mono transition-all duration-300 ${
                activeTab === 'installed' ? 'bg-slate-950/20 text-slate-900' : 'bg-slate-950 text-slate-500'
              }`}>
                {installedMods.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid / Content Area */}
      <div className="relative pb-24">
        <AnimatePresence mode="wait">
          {activeTab === 'available' ? (
            <motion.div 
              key="available"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Manual Mod ID Panel */}
              <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-xl">
                    <PlusCircle className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Quick Install by Workshop ID</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Directly download any unlisted or custom Steam Workshop mod</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <input
                    type="text"
                    value={manualModId}
                    onChange={e => setManualModId(e.target.value)}
                    placeholder="Enter Steam Workshop ID (e.g. 731604991)"
                    className="w-full md:w-72 px-4 py-2 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-all font-mono"
                  />
                  <button
                    onClick={handleManualInstall}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition-all shadow-md shadow-amber-500/10"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Install
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isSearching ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-32 gap-3">
                    <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                    <p className="text-sm text-slate-400 font-medium">Querying Steam Workshop API...</p>
                  </div>
                ) : !query.trim() || query.trim().length < 2 ? (
                  <>
                    {/* Steam Workshop Hub Header & Filter Strip */}
                    <div className="col-span-full mb-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4 mb-2 gap-4">
                        <div>
                          <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            Steam Workshop Storefront
                            {isLoadingStorefront ? (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400 font-bold tracking-wider uppercase animate-pulse shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                                Syncing Live
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 font-bold tracking-wider uppercase shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Live Steam API
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Explore recommended, popular, and featured Steam mods</p>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full scrollbar-none bg-slate-950/40 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md">
                          {[
                            { id: 'Featured', label: 'Featured', icon: Sparkles, color: 'amber' },
                            { id: 'Structures', label: 'Structures', icon: Puzzle, color: 'orange' },
                            { id: 'Dinos', label: 'Dinos', icon: Flame, color: 'emerald' },
                            { id: 'Utilities', label: 'Utilities', icon: Wrench, color: 'indigo' },
                            { id: 'All', label: 'All Mods', icon: Globe, color: 'sky' }
                          ].map((cat) => {
                            const IconComponent = cat.icon;
                            const isSelected = discoverCategory === cat.id;
                            
                            const colorMap: Record<string, { bg: string, text: string, border: string, shadow: string }> = {
                              amber: {
                                bg: 'bg-amber-500/10',
                                text: 'text-amber-400',
                                border: 'border-amber-500/30',
                                shadow: 'shadow-amber-500/5'
                              },
                              orange: {
                                bg: 'bg-orange-500/10',
                                text: 'text-orange-400',
                                border: 'border-orange-500/30',
                                shadow: 'shadow-orange-500/5'
                              },
                              emerald: {
                                bg: 'bg-emerald-500/10',
                                text: 'text-emerald-400',
                                border: 'border-emerald-500/30',
                                shadow: 'shadow-emerald-500/5'
                              },
                              indigo: {
                                bg: 'bg-indigo-500/10',
                                text: 'text-indigo-400',
                                border: 'border-indigo-500/30',
                                shadow: 'shadow-indigo-500/5'
                              },
                              sky: {
                                bg: 'bg-sky-500/10',
                                text: 'text-sky-400',
                                border: 'border-sky-500/30',
                                shadow: 'shadow-sky-500/5'
                              }
                            };
                            
                            const style = colorMap[cat.color] || colorMap.amber;
                            
                            return (
                              <button
                                key={cat.id}
                                onClick={() => {
                                  setDiscoverCategory(cat.id);
                                  fetchStorefrontMods(cat.id);
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-300 border flex items-center gap-2 hover:-translate-y-[1px] ${
                                  isSelected
                                    ? `${style.bg} ${style.text} ${style.border} ${style.shadow} shadow-md`
                                    : 'bg-slate-900/50 text-slate-400 hover:text-white border-transparent hover:bg-slate-800/60'
                                }`}
                              >
                                <IconComponent className={`w-3.5 h-3.5 transition-transform duration-300 ${isSelected ? 'scale-110' : 'opacity-70 group-hover:opacity-100'}`} />
                                {cat.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Popular Mods Map */}
                    {isLoadingStorefront && storefrontMods.length === 0 ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="glass-panel rounded-2xl overflow-hidden border border-white/5 bg-slate-900/10 p-5 space-y-4 animate-pulse">
                          <div className="h-40 bg-slate-950/80 rounded-xl relative overflow-hidden flex items-center justify-center">
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.02),transparent_50%)]" />
                            <Puzzle className="w-8 h-8 text-slate-800" />
                          </div>
                          <div className="h-4 bg-slate-800 rounded w-2/3" />
                          <div className="h-3 bg-slate-850 rounded w-full mt-2" />
                          <div className="h-3 bg-slate-850 rounded w-5/6 mt-1" />
                          <div className="flex justify-between items-center border-t border-white/5 pt-4 mt-4">
                            <div className="h-3 bg-slate-900 rounded w-1/4" />
                            <div className="h-3 bg-slate-900 rounded w-1/4" />
                          </div>
                        </div>
                      ))
                    ) : (
                      slicedDisplayMods.map((mod: any) => {
                        const workshopId = mod.workshopId;
                        const installed = isInstalled(workshopId);
                        const isQueuedOrDownloading = activeQueueList.some(item => item.workshopId === workshopId);
                        const isSelected = selectedModIds.includes(workshopId);

                        return (
                          <div 
                            key={workshopId}
                            onClick={() => setSelectedModDetail(mod)} 
                            className={`glass-panel rounded-2xl overflow-hidden group hover:border-amber-500/50 transition-all flex flex-col cursor-pointer relative ${
                              installed ? "border-amber-500/20 bg-amber-500/[0.02]" : "border-white/5"
                            } ${isSelected ? "border-amber-500 ring-1 ring-amber-500/30" : ""}`}
                          >
                            <div className="relative h-44 overflow-hidden shrink-0 bg-slate-950 border-b border-white/5">
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10" />
                              {getModImageSrc(mod) ? (
                                <img 
                                  src={getModImageSrc(mod)} 
                                  alt="" 
                                  loading="lazy" 
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90" 
                                />
                              ) : (
                                <div className="w-full h-full bg-slate-950 relative flex items-center justify-center overflow-hidden">
                                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.08),transparent_50%)]" />
                                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px]" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                                  <Puzzle className="w-10 h-10 text-slate-800/80 group-hover:text-amber-500/40 group-hover:scale-110 transition-all duration-500" />
                                </div>
                              )}

                              {/* Multi Selection Checkbox */}
                              {!installed && (
                                <div 
                                  className="absolute top-4 left-4 z-20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectMod(workshopId);
                                  }}
                                >
                                  <div className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 transition-colors">
                                    {isSelected ? (
                                      <CheckSquare className="w-4 h-4 text-amber-400" />
                                    ) : (
                                      <Square className="w-4 h-4 text-slate-400 hover:text-white" />
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Mod Status Badges (Top Right) */}
                              <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
                                {installed ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md">
                                    Installed
                                  </span>
                                ) : isQueuedOrDownloading ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md animate-pulse">
                                    Queued
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="p-5 flex flex-col flex-grow">
                              <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-1">{mod.name}</h3>
                              <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed flex-grow">{mod.description}</p>
                              
                              <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-4 text-[10px] font-medium text-slate-500">
                                <span>ID: {workshopId}</span>
                                <span>{mod.subscriberCount.toLocaleString()} subs</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                ) : searchResults.length === 0 ? (
                  <div className="col-span-full text-center py-24 bg-slate-900/20 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center p-6">
                    <Search className="w-14 h-14 text-slate-700 mb-4 animate-pulse" />
                    <h3 className="text-lg font-bold text-slate-300">No Mods Found</h3>
                    <p className="text-slate-500 text-xs mt-1 max-w-sm leading-relaxed">
                      We couldn't find any Steam Workshop mods matching "{query}". Double check your spelling or search by workshop ID directly.
                    </p>
                  </div>
                ) : (
                  searchResults.map((mod: any) => {
                    const workshopId = mod.workshopId || mod.id;
                    const installed = isInstalled(workshopId);
                    const isQueuedOrDownloading = activeQueueList.some(item => item.workshopId === workshopId);
                    const isSelected = selectedModIds.includes(workshopId);
                    
                    return (
                      <div 
                        key={workshopId}
                        onClick={() => setSelectedModDetail(mod)} 
                        className={`glass-panel rounded-2xl overflow-hidden group hover:border-amber-500/50 transition-all flex flex-col cursor-pointer relative ${
                          installed ? "border-amber-500/20 bg-amber-500/[0.02]" : "border-white/5"
                        } ${isSelected ? "border-amber-500 ring-1 ring-amber-500/30" : ""}`}
                      >
                        <div className="relative h-44 overflow-hidden shrink-0 bg-slate-950 border-b border-white/5">
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10" />
                          {getModImageSrc(mod) ? (
                            <img 
                              src={getModImageSrc(mod)} 
                              alt="" 
                              loading="lazy" 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90" 
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-950 relative flex items-center justify-center overflow-hidden">
                              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.08),transparent_50%)]" />
                              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px]" />
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                              <Puzzle className="w-10 h-10 text-slate-800/80 group-hover:text-amber-500/40 group-hover:scale-110 transition-all duration-500" />
                            </div>
                          )}

                          {/* Multi Selection Checkbox */}
                          {!installed && workshopId !== '0' && (
                            <div 
                              className="absolute top-4 left-4 z-20"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectMod(workshopId);
                              }}
                            >
                              <div className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 transition-colors">
                                {isSelected ? (
                                  <CheckSquare className="w-4.5 h-4.5 text-amber-400" />
                                ) : (
                                  <Square className="w-4.5 h-4.5 text-white/55 group-hover:text-white" />
                                )}
                              </div>
                            </div>
                          )}

                          <div className="absolute bottom-4 left-4 z-20 pr-4">
                            <h3 className="text-sm font-bold text-white truncate leading-tight drop-shadow-md group-hover:text-amber-400 transition-colors">
                              {mod.name}
                            </h3>
                            <p className="text-[10px] text-slate-400 mt-1 font-mono">ID: {workshopId}</p>
                          </div>
                        </div>
                        
                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <p className="text-slate-400 text-xs line-clamp-3 mb-5 opacity-80 leading-relaxed">
                            {mod.description || 'No description available on Steam Workshop.'}
                          </p>
                          
                          <div className="flex items-center justify-between pt-3.5 border-t border-white/5 mt-auto">
                            <span className="text-[10px] text-slate-500 font-mono">
                              {mod.subscriptions ? `${mod.subscriptions.toLocaleString()} subs` : mod.subscriberCount ? `${mod.subscriberCount.toLocaleString()} subs` : '0 subs'}
                            </span>
                            
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <a 
                                href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`} 
                                target="_blank" rel="noopener noreferrer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const url = `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`;
                                  openUrl(url).catch(err => {
                                    console.error("Failed to open workshop:", err);
                                    window.open(url, '_blank');
                                  });
                                }}
                                className="p-2 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-all"
                                title="View on Steam Workshop"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                              
                              {installed ? (
                                <div className="px-3.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Installed
                                </div>
                              ) : workshopId === '0' ? (
                                <div className="px-3.5 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5" /> Key Required
                                </div>
                              ) : isQueuedOrDownloading ? (
                                <div className="px-3.5 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-pulse">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> In Queue
                                </div>
                              ) : (
                                <button 
                                  onClick={() => handleInstallSingle(workshopId, mod.name)} 
                                  className="px-4 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/5 hover:border-amber-500"
                                >
                                  <Download className="w-3.5 h-3.5 animate-pulse" />
                                  Install
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }))}

                {displayMods.length > visibleModsCount && (
                  <div className="col-span-full flex justify-center mt-6">
                    <button
                      onClick={() => setVisibleModsCount(prev => prev + 20)}
                      className="px-6 py-3 bg-slate-900/60 hover:bg-amber-500 hover:text-slate-950 border border-white/5 hover:border-amber-500 text-slate-300 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
                    >
                      <PlusCircle className="w-4 h-4" />
                      View More Mods
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="installed"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="glass-panel rounded-2xl p-6 border-amber-500/10 flex flex-col space-y-4"
            >
              {/* Premium Bulk Installed Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-white/5">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-amber-400" />
                    Active Mod Load Order
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-bold ml-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Synced with INI
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">ASE load order is automatically synced into your GameUserSettings.ini file</p>
                </div>
                
                {installedMods.length > 0 && (
                  <div className="flex items-center gap-2">
                    {/* Undo / Redo controls */}
                    <div className="flex items-center gap-1 border-r border-white/5 pr-2 mr-2">
                      <button
                        onClick={handleUndo}
                        disabled={undoHistory.length === 0}
                        className="p-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 disabled:opacity-30 disabled:hover:bg-slate-900/60 text-slate-400 hover:text-white transition-colors"
                        title="Undo Reorder"
                      >
                        <Undo className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleRedo}
                        disabled={redoHistory.length === 0}
                        className="p-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 disabled:opacity-30 disabled:hover:bg-slate-900/60 text-slate-400 hover:text-white transition-colors"
                        title="Redo Reorder"
                      >
                        <Redo className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => handleBulkInstalledAction('enable_all')}
                      className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold transition-all"
                    >
                      Enable All
                    </button>
                    <button
                      onClick={() => handleBulkInstalledAction('disable_all')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-white/5 text-slate-300 rounded-xl text-xs font-bold transition-all"
                    >
                      Disable All
                    </button>
                    <button
                      onClick={() => handleBulkInstalledAction('uninstall_all')}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 text-rose-400 rounded-xl text-xs font-bold transition-all"
                    >
                      Uninstall All
                    </button>
                  </div>
                )}
              </div>

              {/* Premium Sub-Control bar for Sorting/Searching inside Active tab */}
              <div className="flex flex-col md:flex-row items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-white/5">
                <div className="relative w-full md:flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search active load order..."
                    value={installedFilter}
                    onChange={(e) => setInstalledFilter(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-white/5 focus:border-amber-500/55 hover:border-white/10 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition-all"
                  />
                  {installedFilter && (
                    <button
                      onClick={() => setInstalledFilter('')}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                  <span className="text-[10px] text-slate-500 uppercase font-bold shrink-0">Sort By</span>
                  <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-white/5 w-full md:w-auto justify-between gap-1">
                    <button
                      onClick={() => setSortOrder('load_order')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        sortOrder === 'load_order'
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Load Order
                    </button>
                    <button
                      onClick={() => setSortOrder('name')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        sortOrder === 'name'
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Name
                    </button>
                    <button
                      onClick={() => setSortOrder('size')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        sortOrder === 'size'
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Size
                    </button>
                  </div>
                </div>
              </div>

              {sortOrder !== 'load_order' && (
                <div className="px-3.5 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[10px] font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Drag-and-drop is disabled when custom sorting is active. Switch back to "Load Order" to rearrange mods.
                </div>
              )}

              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="ase-mod-list" isDropDisabled={sortOrder !== 'load_order'}>
                  {(provided) => (
                    <div 
                      className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin"
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                    >
                      {filteredInstalledMods.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center">
                      <div className="p-3 bg-slate-900 border border-white/5 rounded-2xl mb-3 shrink-0">
                        <Puzzle className="w-8 h-8 text-slate-700" />
                      </div>
                      <p className="font-bold text-slate-300">
                        {installedMods.length === 0 ? 'No active mods found' : 'No matching active mods'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
                        {installedMods.length === 0 
                          ? 'Go to the Discover tab to search and download Steam workshop mods.' 
                          : 'Try clearing your filter keyword.'}
                      </p>
                    </div>
                  ) : (
                    filteredInstalledMods.map((mod, i) => {
                      const isExpanded = expandedModId === mod.workshopId;
                      const resolved = resolveModDetails(mod);
                      return (
                        <Draggable key={mod.workshopId} draggableId={mod.workshopId} index={i} isDragDisabled={sortOrder !== 'load_order'}>
                          {(provided, snapshot) => (
                            <div 
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              style={{ ...provided.draggableProps.style, zIndex: snapshot.isDragging ? 50 : 'auto' }}
                              className={`mb-3 bg-slate-800/10 border rounded-2xl overflow-hidden transition-all shadow-sm relative group ${
                                !mod.enabled ? 'opacity-70 hover:opacity-100' : ''
                              } ${
                                snapshot.isDragging 
                                  ? 'border-amber-500/50 shadow-2xl shadow-amber-500/10 bg-slate-900/60 scale-[1.02] opacity-90' 
                                  : 'border-white/5 hover:border-amber-500/20 hover:-translate-y-[1px]'
                              }`}
                            >
                              {/* Card Header (Summary Row) */}
                              <div 
                                onClick={() => setExpandedModId(isExpanded ? null : mod.workshopId)}
                                className="flex items-center justify-between p-3.5 cursor-pointer select-none hover:bg-slate-800/30 transition-colors"
                              >
                                <div className="flex items-center gap-4 min-w-0">
                                  {sortOrder === 'load_order' && (
                                    <div 
                                      {...provided.dragHandleProps}
                                      className="cursor-grab active:cursor-grabbing p-1.5 text-slate-500 hover:text-amber-500 hover:bg-slate-800/40 rounded shrink-0 transition-all"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                  )}
                              <div className="w-8 h-8 flex items-center justify-center bg-slate-950 rounded-xl border border-white/5 text-xs text-amber-500 font-mono font-bold shrink-0">
                                {i + 1}
                              </div>
                              <div className="w-10 h-10 rounded-xl border border-white/5 bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center relative shadow-sm">
                                <ModImage mod={resolved} className="w-full h-full object-cover animate-in fade-in duration-300" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors truncate pr-4 flex items-center gap-2">
                                  {resolved.name}
                                  {pinnedModIds.includes(mod.workshopId) && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400 font-bold uppercase tracking-wider">Pinned</span>
                                  )}
                                  {!mod.enabled && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-white/5 text-[9px] text-slate-500 font-bold uppercase tracking-wider">Disabled</span>
                                  )}
                                </h4>
                                <p className="text-[10px] text-slate-500 mt-1 font-mono flex items-center gap-1.5">
                                  <span>ID: {mod.workshopId}</span>
                                  {mod.version && (
                                    <>
                                      <span className="text-slate-700">•</span>
                                      <span className="text-slate-400 font-sans font-medium">v{mod.version}</span>
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3 z-10" onClick={e => e.stopPropagation()}>
                              {/* Pin Toggle Button */}
                              <button
                                onClick={() => handleTogglePin(mod.workshopId)}
                                className={`p-1.5 rounded-xl border transition-all ${
                                  pinnedModIds.includes(mod.workshopId)
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                    : 'bg-slate-900/60 border-white/5 text-slate-500 hover:text-slate-350'
                                }`}
                                title={pinnedModIds.includes(mod.workshopId) ? "Unpin Mod" : "Pin to Top"}
                              >
                                <Pin className={`w-3.5 h-3.5 ${pinnedModIds.includes(mod.workshopId) ? 'fill-amber-400' : ''}`} />
                              </button>
                              
                              {/* Active / Inactive switch toggle */}
                              <div className="flex items-center gap-2 mr-1">
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={mod.enabled} 
                                    onChange={() => handleToggleModActive(mod.workshopId, mod.enabled)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-slate-950 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-amber-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500/20 border border-white/10 peer-checked:border-amber-500/30"></div>
                                </label>
                              </div>

                              {/* Re-order buttons */}
                              <div className="flex items-center bg-slate-950 rounded-xl border border-white/5 p-1">
                                <button
                                  disabled={i === 0 || sortOrder !== 'load_order'}
                                  onClick={() => handleMoveMod(i, 'up')}
                                  className="p-1 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-slate-500 text-slate-500 transition-colors rounded-lg"
                                  title="Move Up"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={i === installedMods.length - 1 || sortOrder !== 'load_order'}
                                  onClick={() => handleMoveMod(i, 'down')}
                                  className="p-1 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-slate-500 text-slate-500 transition-colors rounded-lg"
                                  title="Move Down"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <button 
                                onClick={() => handleRemove(mod.workshopId)} 
                                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all focus:outline-none opacity-0 group-hover:opacity-100 shrink-0"
                                title="Uninstall Mod"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>

                              {/* Expand chevron button */}
                              <button
                                onClick={() => setExpandedModId(isExpanded ? null : mod.workshopId)}
                                className="p-1.5 rounded-xl border bg-slate-900/60 border-white/5 text-slate-500 hover:text-slate-350 transition-all shrink-0"
                                title={isExpanded ? "Collapse Details" : "Expand Details"}
                              >
                                <ChevronDown className={`w-4 h-4 transform transition-transform duration-300 ${isExpanded ? 'rotate-180 text-amber-400' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {/* Expandable Sliding Drawer Detail Panel */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="border-t border-white/5 bg-slate-950/40 p-4"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="flex flex-col md:flex-row gap-5">
                                  {/* Left Column: Premium Preview Image */}
                                  <div className="w-full md:w-48 h-32 rounded-xl border border-white/10 overflow-hidden bg-slate-950 shrink-0 relative shadow-inner group/preview">
                                    <ModImage mod={resolved} className="w-full h-full object-cover group-hover/preview:scale-105 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none" />
                                  </div>
                                  
                                  {/* Right Column: Descriptions & Stats Grid */}
                                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                                    <div>
                                      <p className="text-xs text-slate-350 leading-relaxed line-clamp-3 mb-3 font-medium">
                                        {resolved.description || "This mod is successfully installed and active on your server. Config files are managed automatically."}
                                      </p>
                                      
                                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-500">
                                        {resolved.author && (
                                          <div>
                                            <span className="text-slate-600 font-bold uppercase tracking-wider mr-1">Author:</span>
                                            <span className="text-slate-400 font-bold">{resolved.author}</span>
                                          </div>
                                        )}
                                        {resolved.fileSize && (
                                          <div>
                                            <span className="text-slate-600 font-bold uppercase tracking-wider mr-1">Size:</span>
                                            <span className="text-slate-400 font-mono font-bold">{(resolved.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                                          </div>
                                        )}
                                        {resolved.subscribers !== undefined && (
                                          <div>
                                            <span className="text-slate-600 font-bold uppercase tracking-wider mr-1">Subscribers:</span>
                                            <span className="text-slate-450 font-mono font-bold">{resolved.subscribers.toLocaleString()}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Badges / Tags */}
                                    {resolved.tags && resolved.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-3">
                                        {resolved.tags.map((t: string) => (
                                          <span key={t} className="px-2 py-0.5 rounded bg-slate-900/80 border border-white/5 text-[9px] text-slate-400 font-bold uppercase font-mono">
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Actions / Recovery Tools Section */}
                                <div className="flex flex-wrap items-center gap-3 mt-4 pt-3.5 border-t border-white/5">
                                  <button
                                    onClick={() => {
                                      const url = resolved.workshopUrl || `https://steamcommunity.com/sharedfiles/filedetails/?id=${resolved.workshopId}`;
                                      openUrl(url);
                                    }}
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-white/20 text-slate-350 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    View on Workshop
                                  </button>
                                  
                                  <button
                                    onClick={() => handleValidateMod(resolved.workshopId)}
                                    disabled={isValidating}
                                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-1.5"
                                  >
                                    {isValidating ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <ShieldAlert className="w-3.5 h-3.5" />
                                    )}
                                    Validate Structure
                                  </button>
                                  
                                  <button
                                    onClick={() => handleRepairMod(resolved.workshopId, true)}
                                    disabled={isRepairing}
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-white/20 text-slate-350 rounded-xl text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-1.5"
                                  >
                                    {isRepairing ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    )}
                                    Force Redownload
                                  </button>
                                </div>

                                {/* Validation Diagnostic Panel */}
                                {validationReport && validationReport.workshopId === resolved.workshopId && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`mt-4 p-3.5 rounded-xl border ${
                                      validationReport.isValid 
                                        ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400' 
                                        : 'bg-rose-500/5 border-rose-500/10 text-rose-400'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 font-bold text-xs mb-1.5">
                                      {validationReport.isValid ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                      ) : (
                                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                                      )}
                                      Mod Diagnostic Integrity Status: {validationReport.isValid ? 'Healthy & Fully Intact' : 'Structure Corrupted!'}
                                    </div>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4 mt-2 text-[10px] font-mono text-slate-400 bg-black/25 p-2.5 rounded-lg border border-white/5">
                                      <div>
                                        <span className="text-slate-500 mr-1">Files count:</span>
                                        <span className="font-bold text-white">{validationReport.fileCount}</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-500 mr-1">Total size:</span>
                                        <span className="font-bold text-white">{(validationReport.totalSize / (1024 * 1024)).toFixed(1)} MB</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className={validationReport.hasModFile ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>●</span>
                                        <span className="text-slate-500">Parent .mod:</span>
                                        <span className={validationReport.hasModFile ? 'text-emerald-400' : 'text-rose-400'}>
                                          {validationReport.hasModFile ? 'Found' : 'Missing'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className={validationReport.hasModInfo ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>●</span>
                                        <span className="text-slate-500">mod.info:</span>
                                        <span className={validationReport.hasModInfo ? 'text-emerald-400' : 'text-rose-400'}>
                                          {validationReport.hasModInfo ? 'Found' : 'Missing'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className={validationReport.hasAssets ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>●</span>
                                        <span className="text-slate-500">Assets (.uasset):</span>
                                        <span className={validationReport.hasAssets ? 'text-emerald-400' : 'text-rose-400'}>
                                          {validationReport.hasAssets ? 'Found' : 'Missing'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className={validationReport.hasActiveModsEntry ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>●</span>
                                        <span className="text-slate-500">ActiveMods INI:</span>
                                        <span className={validationReport.hasActiveModsEntry ? 'text-emerald-400' : 'text-rose-400'}>
                                          {validationReport.hasActiveModsEntry ? 'Synced' : 'Not Sync'}
                                        </span>
                                      </div>
                                      {validationReport.hasUnextractedZ && (
                                        <div className="col-span-2 md:col-span-3 text-amber-400 flex items-center gap-1 text-[9px] mt-1 font-bold">
                                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                          Leftover .z compressed files detected! Extraction is incomplete.
                                        </div>
                                      )}
                                    </div>

                                    {!validationReport.isValid && validationReport.issues.length > 0 && (
                                      <div className="mt-2 text-[10px] text-rose-350/90 leading-relaxed font-mono">
                                        <div className="font-bold uppercase mb-1">Detected Structure Issues:</div>
                                        <ul className="list-disc pl-4 space-y-0.5">
                                          {validationReport.issues.map((issue: string, idx: number) => (
                                            <li key={idx}>{issue}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Action buttons for inline diagnostic */}
                                    <div className="flex gap-2 mt-3">
                                      <button 
                                        onClick={() => handleRepairMod(resolved.workshopId, false)}
                                        disabled={isRepairing}
                                        className="flex-1 py-1 bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/20 text-amber-400 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                                      >
                                        {isRepairing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                        Run Structural Repair
                                      </button>
                                      <button 
                                        onClick={async () => {
                                          try {
                                            const { invoke } = await import('@tauri-apps/api/core');
                                            await invoke('open_in_explorer', { path: validationReport.modDir });
                                          } catch (err) {
                                            toast.error('Failed to open folder: ' + err);
                                          }
                                        }}
                                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-350 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 border border-white/5"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        Open Folder
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                            </div>
                          )}
                        </Draggable>
                      );
                    })
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
              
              {installedMods.length > 0 && (
                <div className="pt-4 border-t border-white/5 text-xs text-slate-500 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Active mods load order matches the <code className="bg-slate-900 px-1 rounded text-slate-400">ActiveMods=</code> line injected into GameUserSettings.ini.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Premium Bottom Floating Bulk Installer Bar */}
      <AnimatePresence>
        {selectedModIds.length > 0 && activeTab === 'available' && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-amber-500/35 rounded-2xl p-4 shadow-2xl shadow-amber-500/10 backdrop-blur-md flex items-center justify-between gap-6 w-full max-w-xl pr-5"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4.5 h-4.5 text-amber-400 animate-pulse" />
              <div>
                <p className="text-xs font-bold text-white">{selectedModIds.length} Mod(s) Selected</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Ready to queue for download & extraction</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedModIds([])}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkInstall}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-amber-500/25 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Install Selection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COLLAPSIBLE MULTI-ITEM REAL-TIME DOWNLOAD DRAWER */}
      <AnimatePresence>
        {totalInQueue > 0 && (
          <div className="fixed bottom-6 right-6 z-40 w-full max-w-sm px-4 md:px-0">
            <motion.div
              initial={{ y: 50, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 50, scale: 0.95, opacity: 0 }}
              className="bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl shadow-black/85 backdrop-blur-md overflow-hidden flex flex-col border-amber-500/20"
            >
              {/* Drawer Header */}
              <div 
                className="bg-slate-950/80 p-3.5 flex items-center justify-between cursor-pointer border-b border-white/5 select-none"
                onClick={() => setIsQueueExpanded(!isQueueExpanded)}
              >
                <div className="flex items-center gap-2">
                  {activeDownloadsCount > 0 ? (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="text-xs font-bold text-white">
                    Mod Downloader Queue ({completedDownloadsCount}/{totalInQueue})
                  </span>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={clearQueue}
                    className="p-1 hover:bg-slate-800 text-slate-500 hover:text-white rounded transition-colors text-[10px] font-bold"
                    title="Clear All Completed"
                  >
                    Clear Queue
                  </button>
                  {isQueueExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 hover:text-white transition-colors" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-slate-400 hover:text-white transition-colors" />
                  )}
                </div>
              </div>

              {/* Collapsed / Expanded Content */}
              <AnimatePresence>
                {isQueueExpanded && (
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="max-h-64 overflow-y-auto p-4 space-y-3.5 scrollbar-thin"
                  >
                    {activeQueueList.map((item) => {
                      return (
                        <div key={item.workshopId} className="space-y-1.5 text-xs border-b border-white/5 pb-2.5 last:border-b-0 last:pb-0">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 pr-4">
                              <p className="font-bold text-slate-200 truncate">{item.modName}</p>
                              <p className="text-[9px] text-slate-500 font-mono mt-0.5">ID: {item.workshopId}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                item.status === 'queued' ? 'bg-slate-800 text-slate-400' :
                                item.status === 'downloading' ? 'bg-blue-500/10 text-blue-400 animate-pulse' :
                                item.status === 'extracting' ? 'bg-purple-500/10 text-purple-400 animate-pulse' :
                                item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                'bg-rose-500/10 text-rose-400'
                              }`}>
                                {item.status}
                              </span>
                              
                              {/* Cancel/Remove from Queue */}
                              {item.status === 'queued' && (
                                <button
                                  onClick={() => removeFromQueue(item.workshopId)}
                                  className="text-slate-500 hover:text-rose-400 transition-colors p-0.5"
                                  title="Cancel Download"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(item.status === 'completed' || item.status === 'failed') && (
                                <button
                                  onClick={() => removeFromQueue(item.workshopId)}
                                  className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Progress Line */}
                          <div className="relative h-1 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                item.status === 'queued' ? 'bg-slate-800' :
                                item.status === 'downloading' ? 'bg-blue-500 animate-pulse' :
                                item.status === 'extracting' ? 'bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse' :
                                item.status === 'completed' ? 'bg-emerald-500' :
                                'bg-rose-500'
                              }`} 
                              style={{ width: `${item.progress}%` }} 
                            />
                          </div>

                          {item.error && (
                            <p className="text-[9px] text-rose-400 leading-normal max-h-12 overflow-y-auto font-mono mt-1">
                              Error: {item.error}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mini Collapsed footer */}
              {!isQueueExpanded && (
                <div className="p-3 bg-slate-900 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                  <span>
                    {activeDownloadsCount > 0 
                      ? `Currently downloading mod...`
                      : 'All downloads in queue complete'
                    }
                  </span>
                  <span className="font-mono text-white font-bold">
                    {completedDownloadsCount} / {totalInQueue} Done
                  </span>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mod Details Modal */}
      <AnimatePresence>
        {selectedModDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl shadow-amber-500/5"
            >
              {/* Hero Banner with Fallback */}
              <div className="relative h-56 shrink-0 bg-slate-950 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent z-10" />
                {getModImageSrc(selectedModDetail) ? (
                  <img 
                    src={getModImageSrc(selectedModDetail)} 
                    alt="" 
                    className="w-full h-full object-cover opacity-80" 
                  />
                ) : (
                  <div className="w-full h-full bg-slate-950 relative flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.08),transparent_50%)]" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                    <Puzzle className="w-14 h-14 text-slate-800/80 animate-pulse" />
                  </div>
                )}
                
                {/* Close Button */}
                <button 
                  onClick={() => setSelectedModDetail(null)} 
                  className="absolute top-4 right-4 z-20 p-2 bg-black/40 hover:bg-black/60 rounded-full transition-colors focus:outline-none"
                >
                  <X className="w-5 h-5 text-white/80 hover:text-white" />
                </button>

                {/* Title & Author */}
                <div className="absolute bottom-5 left-6 z-20 pr-6">
                  <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-amber-500/30">
                    Steam Workshop Mod
                  </span>
                  <h3 className="text-xl font-bold text-white mt-2 leading-tight drop-shadow-md">
                    {selectedModDetail.name}
                  </h3>
                </div>
              </div>

              {/* Scrollable details */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin">
                {/* Metrics Badges */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Workshop ID</p>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedModDetail.workshopId);
                        toast.success('Mod ID copied to clipboard!');
                      }}
                      className="text-xs text-amber-400 font-mono font-bold mt-1 hover:text-amber-300 transition-colors flex items-center justify-center gap-1.5 w-full"
                      title="Copy ID"
                    >
                      {selectedModDetail.workshopId}
                      <Copy className="w-3 h-3 opacity-60" />
                    </button>
                  </div>
                  <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Subscribers</p>
                    <p className="text-xs text-white font-bold mt-1">
                      {selectedModDetail.subscriptions ? selectedModDetail.subscriptions.toLocaleString() : selectedModDetail.subscriberCount ? selectedModDetail.subscriberCount.toLocaleString() : 'N/A'}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Last Updated</p>
                    <p className="text-xs text-white font-bold mt-1">
                      {selectedModDetail.lastUpdated || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mod Description</h4>
                  <div className="bg-slate-950/50 border border-white/5 rounded-xl p-4 text-sm text-slate-300 leading-relaxed max-h-48 overflow-y-auto font-sans whitespace-pre-wrap scrollbar-thin">
                    {selectedModDetail.description || 'No description available on Steam Workshop.'}
                  </div>
                </div>

                {/* Validation & Health Section */}
                {selectedModDetail.isInstalled && (
                  <div className="space-y-3 bg-slate-950/40 border border-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Mod Integrity Check</h4>
                      </div>
                      <button
                        onClick={() => handleValidateMod(selectedModDetail.workshopId)}
                        disabled={isValidating || isRepairing}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1"
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Verify Integrity
                          </>
                        )}
                      </button>
                    </div>

                    {validationReport ? (
                      <div className="space-y-3 pt-2 border-t border-white/5 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Status:</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            validationReport.isValid 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {validationReport.isValid ? 'Healthy & Valid' : 'Corrupted / Missing Files'}
                          </span>
                        </div>

                        {/* File metrics */}
                        <div className="grid grid-cols-2 gap-2.5 text-[10px] font-mono text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-white/5">
                          <div>Files Count: <span className="text-white font-bold">{validationReport.fileCount}</span></div>
                          <div>Total Size: <span className="text-white font-bold">{(validationReport.totalSize / (1024 * 1024)).toFixed(2)} MB</span></div>
                          
                          <div className="flex items-center gap-1.5">
                            <span className={validationReport.hasModFile ? 'text-emerald-400' : 'text-rose-400'}>●</span>
                            .mod File: <span className={validationReport.hasModFile ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{validationReport.hasModFile ? 'Found' : 'Missing'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={validationReport.hasModInfo ? 'text-emerald-400' : 'text-rose-400'}>●</span>
                            mod.info: <span className={validationReport.hasModInfo ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{validationReport.hasModInfo ? 'Found' : 'Missing'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={validationReport.hasAssets ? 'text-emerald-400' : 'text-rose-400'}>●</span>
                            Assets (.uasset): <span className={validationReport.hasAssets ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{validationReport.hasAssets ? 'Found' : 'Missing'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={validationReport.hasActiveModsEntry ? 'text-emerald-400' : 'text-rose-400'}>●</span>
                            ActiveMods INI: <span className={validationReport.hasActiveModsEntry ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{validationReport.hasActiveModsEntry ? 'Synced' : 'Not Sync'}</span>
                          </div>
                          {validationReport.hasUnextractedZ && (
                            <div className="col-span-2 text-amber-400 flex items-center gap-1 text-[9px] mt-0.5 font-bold">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              Leftover .z files found: extraction is incomplete.
                            </div>
                          )}
                        </div>

                        {/* Issues List */}
                        {!validationReport.isValid && validationReport.issues && (
                          <div className="space-y-1 bg-rose-500/5 border border-rose-500/15 rounded-lg p-2.5">
                            <p className="text-[10px] font-bold text-rose-300">Detected Issues:</p>
                            <ul className="list-disc list-inside text-[10px] text-rose-400/90 leading-relaxed pl-1 space-y-0.5">
                              {validationReport.issues.map((issue: string, idx: number) => (
                                <li key={idx} className="truncate">{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Actions for validation result */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleRepairMod(selectedModDetail.workshopId, false)}
                            disabled={isRepairing}
                            className="flex-1 py-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1"
                          >
                            {isRepairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Quick Repair
                          </button>
                          <button
                            onClick={() => handleRepairMod(selectedModDetail.workshopId, true)}
                            disabled={isRepairing}
                            className="flex-1 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 text-rose-400 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1"
                          >
                            {isRepairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3 h-3" />}
                            Force Redownload
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const { invoke } = await import('@tauri-apps/api/core');
                                await invoke('open_in_explorer', { path: validationReport.modDir });
                              } catch (err) {
                                toast.error('Failed to open folder: ' + err);
                              }
                            }}
                            className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-350 border border-white/5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1"
                            title="Open Mod Folder"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open Folder
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic mt-1 leading-normal">
                        Click 'Verify Integrity' to scan the mod's local files, checking for missing .mod, mod.info, and compiled assets.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-white/5 bg-slate-950/80 flex items-center justify-between">
                <a 
                  href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${selectedModDetail.workshopId}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  onClick={(e) => {
                    e.preventDefault();
                    const url = `https://steamcommunity.com/sharedfiles/filedetails/?id=${selectedModDetail.workshopId}`;
                    openUrl(url).catch(err => {
                      console.error("Failed to open workshop:", err);
                      window.open(url, '_blank');
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all"
                >
                  <ExternalLink className="w-4 h-4" /> View on Workshop
                </a>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedModDetail(null)} 
                    className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Close
                  </button>
                  {selectedModDetail.workshopId === '0' ? (
                    <button 
                      disabled
                      className="px-5 py-2.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold cursor-not-allowed flex items-center gap-1.5"
                    >
                      <AlertCircle className="w-4 h-4 text-rose-400" /> API Key Required
                    </button>
                  ) : isInstalled(selectedModDetail.workshopId) ? (
                    <button 
                      onClick={() => {
                        handleRemove(selectedModDetail.workshopId);
                        setSelectedModDetail(null);
                      }}
                      className="px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" /> Uninstall Mod
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        handleInstallSingle(selectedModDetail.workshopId, selectedModDetail.name);
                        setSelectedModDetail(null);
                      }}
                      className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/25"
                    >
                      <Download className="w-4 h-4" />
                      Install Mod
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
