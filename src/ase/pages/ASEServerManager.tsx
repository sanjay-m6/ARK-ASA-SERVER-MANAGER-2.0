import { useEffect, useState } from 'react';
import { Server, Plus, Play, Square, RotateCw, Trash2, Search, Settings, Terminal, Globe, Shield, RefreshCw, Download, Save, ChevronDown, ChevronUp, FolderOpen, Users, PenLine, Cpu, Network, GripVertical } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { cn } from '../../utils/helpers';
import { startAseServer, stopAseServer, deleteAseServer, updateAseServer } from '../utils/aseCommands';
import { getAseMapDisplayName } from '../data/aseMaps';
import ASEInstallWizard from '../components/install/ASEInstallWizard';
import ASEResetDialog from '../components/server/ASEResetDialog';
import ASEImportServerDialog from '../components/server/ASEImportServerDialog';
import ASEImportSaveDialog from '../components/server/ASEImportSaveDialog';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function ASEServerManager() {
  const { servers, setServers, updateServerStatus, refreshServers, removeServer } = useAseServerStore();
  const [showInstall, setShowInstall] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportSave, setShowImportSave] = useState(false);
  const [resetServer, setResetServer] = useState<{id: number, name: string} | null>(null);
  const [serverToDelete, setServerToDelete] = useState<{id: number, name: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServers, setSelectedServers] = useState<number[]>([]);
  const [collapsedCards, setCollapsedCards] = useState<Record<number, boolean>>({});
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Drag-and-drop order persistence
  const [serverOrder, setServerOrder] = useState<number[]>(() => {
    const saved = localStorage.getItem('aseServerOrder');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('aseServerOrder', JSON.stringify(serverOrder));
  }, [serverOrder]);

  const orderedServers = [...servers].sort((a, b) => {
    const indexA = serverOrder.indexOf(a.id);
    const indexB = serverOrder.indexOf(b.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    if (searchQuery.trim() !== '') {
      toast.error('Cannot reorder servers while searching.');
      return;
    }
    const currentOrder = orderedServers.map(s => s.id);
    const [reorderedItem] = currentOrder.splice(result.source.index, 1);
    currentOrder.splice(result.destination.index, 0, reorderedItem);
    setServerOrder(currentOrder);
  };

  const handleToggleAseAutomation = async (serverId: number, field: 'autoStart' | 'autoStop' | 'intelligentMode', current: boolean) => {
    try {
      await updateAseServer(serverId, { [field]: !current });
      toast.success(current ? t('serverManager.automationDisabled', 'Automation disabled') : t('serverManager.automationEnabled', 'Automation enabled'));
      setServers(servers.map(s => s.id === serverId ? { ...s, [field]: !current } : s));
    } catch (error) {
      console.error('Failed to toggle ASE automation:', error);
      toast.error(t('serverManager.automationFailed', 'Failed to toggle automation'));
    }
  };

  useEffect(() => {
    // Initial load and periodic refresh
    refreshServers();
    const intervalId = setInterval(refreshServers, 3000);

    // Listen for backend status change events
    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('server-status-change', (event) => {
        const { server_id, status } = event.payload as { server_id: number; status: string };
        updateServerStatus(server_id, status as any);
      });
      return unlisten;
    };
    let unlistenPromise = setupListener();

    return () => {
      clearInterval(intervalId);
      // Cleanup event listener
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleStart = async (id: number) => { 
    try { 
      updateServerStatus(id, 'starting'); 
      await startAseServer(id); 
      toast.success('ASE server starting...'); 
    } catch (e) { 
      updateServerStatus(id, 'stopped'); 
      toast.error(`${e}`); 
    } 
  };

  const handleStop = async (id: number) => { 
    try { 
      await stopAseServer(id); 
      updateServerStatus(id, 'stopped'); 
      toast.success('ASE server stopped'); 
    } catch (e) { 
      toast.error(`${e}`); 
    } 
  };

  const handleDelete = (id: number, name: string) => {
    setServerToDelete({id, name});
  };

  const confirmDelete = async () => {
    if (!serverToDelete) return;
    setIsDeleting(true);
    try { 
      await deleteAseServer(serverToDelete.id); 
      removeServer(serverToDelete.id); 
      toast.success('Server deleted'); 
      setServerToDelete(null);
    } catch (e) { 
      toast.error(`${e}`); 
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectServer = (serverId: number) => {
    setSelectedServers(prev =>
      prev.includes(serverId) ? prev.filter(id => id !== serverId) : [...prev, serverId]
    );
  };

  const handleSelectAll = () => {
    if (selectedServers.length === servers.length && servers.length > 0) {
      setSelectedServers([]);
    } else {
      setSelectedServers(servers.map(s => s.id));
    }
  };

  const handleBulkStart = async () => {
    const serversToStart = servers.filter(s => selectedServers.includes(s.id) && (s.status === 'stopped' || s.status === 'crashed'));
    if (serversToStart.length === 0) {
      toast.error('No startable servers selected.');
      return;
    }
    toast.success(`Starting ${serversToStart.length} servers...`);
    for (const server of serversToStart) {
      handleStart(server.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setSelectedServers([]);
  };

  const handleStartAll = async () => {
    const stopps = servers.filter(s => s.status === 'stopped' || s.status === 'crashed');
    if (stopps.length === 0) return toast.error('No stopped servers to start');
    toast.success(`Starting ${stopps.length} servers...`);
    for (const s of stopps) { handleStart(s.id); await new Promise(r => setTimeout(r, 500)); }
  };

  const handleBulkStop = async () => {
    const serversToStop = servers.filter(s => selectedServers.includes(s.id) && (s.status === 'running' || s.status === 'online' || s.status === 'starting'));
    if (serversToStop.length === 0) {
      toast.error('No running servers selected.');
      return;
    }
    toast.success(`Stopping ${serversToStop.length} servers...`);
    for (const server of serversToStop) {
      handleStop(server.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setSelectedServers([]);
  };

  const handleStopAll = async () => {
    const runnings = servers.filter(s => s.status === 'running' || s.status === 'online');
    if (runnings.length === 0) return toast.error('No running servers to stop');
    toast.success(`Stopping ${runnings.length} servers...`);
    for (const s of runnings) { handleStop(s.id); await new Promise(r => setTimeout(r, 500)); }
  };

  const filtered = orderedServers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.mapName.toLowerCase().includes(searchQuery.toLowerCase()));

  const toggleCollapse = (serverId: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.no-collapse') || target.closest('input') || target.closest('button')) return;
    setCollapsedCards(prev => ({ ...prev, [serverId]: !prev[serverId] }));
  };

  return (
    <motion.div className="space-y-8 animate-in fade-in duration-500" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 flex items-center gap-3">
            ASE Server Manager
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Deploy, configure, and manage your ARK: Survival Evolved servers</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center space-x-2 px-5 py-3 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 hover:border-slate-600/50 text-slate-200 rounded-xl transition-all font-medium focus:outline-none"
          >
            <Download className="w-5 h-5 text-slate-400" />
            <span>{t('serverManager.buttons.importExisting', 'Import Server')}</span>
          </button>
          <button
            onClick={() => setShowImportSave(true)}
            className="flex items-center space-x-2 px-5 py-3 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl transition-all font-medium focus:outline-none"
          >
            <Save className="w-5 h-5" />
            <span>{t('serverManager.buttons.importSave', 'Import Save')}</span>
          </button>
          <button onClick={() => setShowInstall(true)} className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl transition-all shadow-lg shadow-amber-500/20 font-medium group focus:outline-none">
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            <span>{t('serverManager.buttons.deployServer', 'Deploy Server')}</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search servers by name or map..." className="w-full pl-12 pr-4 py-3.5 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all shadow-inner" />
      </div>

      {/* Bulk Actions Bar */}
      {/* Bulk Actions Bar - Glassmorphic Pill */}
      {servers.length > 0 && (
        <div className="sticky top-4 z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between glass-panel rounded-xl p-4 mt-2 mb-6 gap-4 shadow-xl shadow-black/20">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors select-none">
              <input
                type="checkbox"
                checked={servers.length > 0 && selectedServers.length === servers.length}
                onChange={handleSelectAll}
                className="w-5 h-5 rounded-full border-slate-600/50 bg-slate-900/50 text-amber-500 focus:ring-amber-500/50 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer transition-all shadow-inner hover:bg-slate-800/50 hover:border-amber-500/50"
              />
              <span className="font-medium">
                {selectedServers.length > 0
                  ? `${selectedServers.length} Selected`
                  : 'Select All'}
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto bg-slate-900/50 backdrop-blur-md rounded-full border border-slate-700/50 shadow-inner p-1">
            <button
              onClick={handleBulkStart}
              disabled={selectedServers.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 hover:bg-green-500/20 text-green-500 rounded-full transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Selected</span>
            </button>
            <button
              onClick={handleStartAll}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 hover:bg-amber-500/20 text-amber-400 rounded-full transition-all font-medium"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start All</span>
            </button>
            <div className="w-px h-6 bg-slate-700/50 hidden sm:block mx-1"></div>
            <button
              onClick={handleBulkStop}
              disabled={selectedServers.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 hover:bg-red-500/20 text-red-400 rounded-full transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Selected</span>
            </button>
            <button
              onClick={handleStopAll}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 hover:bg-rose-500/20 text-rose-400 rounded-full transition-all font-medium"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop All</span>
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center border-2 border-dashed border-slate-700/50">
          <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Server className="w-10 h-10 text-slate-500" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">{servers.length === 0 ? 'No ASE Servers Installed' : 'No Results Found'}</h3>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            {servers.length === 0 ? 'Deploy your first ASE server to get started managing ARK: Survival Evolved servers.' : 'Try a different search term.'}
          </p>
          {servers.length === 0 && (
            <div className="flex items-center justify-center gap-4">
              <button onClick={() => setShowImport(true)} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors border border-slate-700 focus:outline-none">
                Import Existing Server
              </button>
              <button onClick={() => setShowInstall(true)} className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl transition-all shadow-lg shadow-amber-500/20 font-medium focus:outline-none">
                Deploy ASE Server
              </button>
            </div>
          )}
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="ase-server-list">
            {(provided) => (
              <div className="grid gap-6" {...provided.droppableProps} ref={provided.innerRef}>
                {filtered.map((srv, index) => (
                  <Draggable key={srv.id.toString()} draggableId={srv.id.toString()} index={index} isDragDisabled={searchQuery.trim() !== ''}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={{ ...provided.draggableProps.style, zIndex: snapshot.isDragging ? 50 : 'auto' }}
                        className={cn(
                          "glass-panel rounded-2xl p-6 transition-all duration-300 group relative overflow-hidden cursor-pointer",
                          snapshot.isDragging
                            ? "shadow-2xl shadow-amber-500/20 ring-2 ring-amber-500/50 cursor-grabbing scale-[1.02]"
                            : "hover:border-amber-500/50 hover:shadow-[0_8px_30px_rgba(245,158,11,0.15)] hover:-translate-y-1"
                        )}
                        onClick={(e) => toggleCollapse(srv.id, e)}
                      >
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-500/5 to-transparent rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
              
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start space-x-4">
                  {/* Drag Handle */}
                  <div
                    {...provided.dragHandleProps}
                    className="flex items-center h-full pt-1 cursor-grab text-slate-500 hover:text-white transition-colors no-collapse"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="w-5 h-5" />
                  </div>
                  {/* Round Glassmorphic Checkbox */}
                  <div className="flex items-center h-full pt-1.5 no-collapse">
                    <input
                      type="checkbox"
                      checked={selectedServers.includes(srv.id)}
                      onChange={() => handleSelectServer(srv.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 rounded-full border-slate-600/50 bg-slate-900/50 text-amber-500 focus:ring-amber-500/50 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer transition-all shadow-inner hover:bg-slate-800/50 hover:border-amber-500/50"
                    />
                  </div>
                  {/* Status Indicator */}
                  <div className="relative mt-1">
                    <div className={cn(
                        'w-4 h-4 rounded-full',
                        srv.status === 'running' && 'bg-amber-500 animate-pulse',
                        srv.status === 'online' && 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]',
                        srv.status === 'stopped' && 'bg-slate-500',
                        srv.status === 'crashed' && 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]',
                        srv.status === 'starting' && 'bg-amber-500 animate-pulse',
                        srv.status === 'updating' && 'bg-blue-500 animate-pulse'
                    )} />
                    {srv.status === 'online' && (
                        <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">
                        {srv.name}
                      </h3>
                      <span className={cn(
                          'px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-inner',
                          srv.status === 'online' && 'bg-green-500/10 text-green-400 border-green-500/20',
                          srv.status === 'running' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                          srv.status === 'stopped' && 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                          srv.status === 'crashed' && 'bg-red-500/10 text-red-400 border-red-500/20',
                          srv.status === 'starting' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                          srv.status === 'updating' && 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      )}>
                          {(srv.status === 'running' || srv.status === 'starting' || srv.status === 'updating') && (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                          )}
                          {srv.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Metadata Pills */}
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/40 rounded-lg shadow-inner border border-slate-700/30">
                          <Globe className="w-3.5 h-3.5 text-amber-500/70" />
                          <span className="text-xs">{getAseMapDisplayName(srv.mapName)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/40 rounded-lg shadow-inner border border-slate-700/30">
                          <Terminal className="w-3.5 h-3.5 text-amber-500/70" />
                          <span className="font-mono text-xs">Port {srv.port}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/40 rounded-lg shadow-inner border border-slate-700/30">
                          <Shield className="w-3.5 h-3.5 text-amber-500/70" />
                          <span className="text-xs">ASE Server</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons + Collapse Toggle */}
                <div className="flex items-center gap-2 no-collapse">
                  {srv.status === 'stopped' || srv.status === 'crashed' ? (
                    <button onClick={()=>handleStart(srv.id)} className="p-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-inner" title="Start Server">
                      <Play className="w-5 h-5 fill-current" />
                    </button>
                  ) : (
                    <button onClick={()=>handleStop(srv.id)} className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-inner" title="Stop Server">
                      <Square className="w-5 h-5 fill-current" />
                    </button>
                  )}

                  <button
                      onClick={() => navigate('/ase/config', { state: { serverId: srv.id } })}
                      className="p-2.5 bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600/30 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-inner"
                      title="Server Settings"
                  >
                      <Settings className="w-5 h-5" />
                  </button>

                  <button
                      onClick={() => navigate('/ase/rcon', { state: { serverId: srv.id } })}
                      className="p-2.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-inner"
                      title="RCON Console"
                  >
                      <Terminal className="w-5 h-5" />
                  </button>

                  <div className="w-px h-8 bg-slate-700/50 mx-1"></div>

                  <button
                      onClick={() => setResetServer({id: srv.id, name: srv.name})}
                      className="p-2.5 bg-slate-700/30 hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 border border-slate-600/30 hover:border-orange-500/20 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-inner"
                      title="Reset Server Data"
                  >
                      <RotateCw className="w-5 h-5" />
                  </button>

                  <button
                      onClick={() => handleDelete(srv.id, srv.name)}
                      className="p-2.5 bg-slate-700/30 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-600/30 hover:border-red-500/20 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-inner"
                      title="Delete Server"
                  >
                      <Trash2 className="w-5 h-5" />
                  </button>

                  {/* Collapse/Expand chevron */}
                  <button
                      onClick={(e) => { e.stopPropagation(); setCollapsedCards(prev => ({ ...prev, [srv.id]: !prev[srv.id] })); }}
                      className="p-2 text-slate-500 hover:text-white transition-colors"
                  >
                      {collapsedCards[srv.id] ? (
                          <ChevronDown className="w-4 h-4" />
                      ) : (
                          <ChevronUp className="w-4 h-4" />
                      )}
                  </button>
                </div>
              </div>

              {/* Collapsible Server Details */}
              {!collapsedCards[srv.id] && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                  {/* Server Details Grid - Glassmorphic */}
                  <div className="mt-5 pt-4 border-t border-slate-700/30">
                    <div className="bg-slate-900/40 backdrop-blur-sm rounded-xl border border-slate-700/30 p-4 shadow-inner">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <FolderOpen className="w-3.5 h-3.5 text-amber-500/60" />
                                <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">{t('serverManager.serverDetails.installPath', 'Install Path')}</p>
                            </div>
                            <p className="text-slate-300 font-mono text-xs truncate" title={srv.installPath}>{srv.installPath}</p>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Users className="w-3.5 h-3.5 text-amber-500/60" />
                                <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">{t('serverManager.serverDetails.maxPlayers', 'Max Players')}</p>
                            </div>
                            <p className="text-slate-300">{srv.maxPlayers} {t('serverManager.serverDetails.survivors', 'Survivors')}</p>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <PenLine className="w-3.5 h-3.5 text-amber-500/60" />
                                <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">{t('serverManager.serverDetails.sessionName', 'Session Name')}</p>
                            </div>
                            <p className="text-slate-300 truncate">{srv.sessionName}</p>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Network className="w-3.5 h-3.5 text-amber-500/60" />
                                <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">{t('serverManager.serverDetails.connection', 'Connection')}</p>
                            </div>
                            <p className="text-slate-300 font-mono text-xs">
                                {srv.port} (Game) / {srv.queryPort} (Query)
                            </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Automation Controls - Glassmorphic */}
                  <div className="mt-3">
                    <div className="bg-slate-900/40 backdrop-blur-sm rounded-xl border border-slate-700/30 p-4 shadow-inner">
                      <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-amber-500/60" />
                            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">{t('serverManager.serverDetails.automation', 'Automation')}</span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer group/toggle no-collapse">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={srv.autoStart || false}
                                    onChange={() => handleToggleAseAutomation(srv.id, 'autoStart', srv.autoStart || false)}
                                />
                                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                            </div>
                            <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStart', 'Auto-Start')}</span>
                        </label>

                        {srv.autoStart && (
                            <div className="flex items-center gap-3 bg-slate-800/40 px-3 py-1 rounded-lg border border-slate-700/50 animate-in fade-in duration-200 text-xs no-collapse">
                                <div className="flex items-center gap-1.5 text-slate-400">
                                    <span>{t('serverManager.serverDetails.delay', 'Delay')}:</span>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={srv.startupDelay !== undefined ? srv.startupDelay : ''}
                                        onChange={async (e) => {
                                            const delay = parseInt(e.target.value) || 0;
                                            try {
                                                await updateAseServer(srv.id, { startupDelay: delay });
                                                setServers(servers.map(s => s.id === srv.id ? { ...s, startupDelay: delay } : s));
                                            } catch (err) {
                                                console.error('Failed to update delay:', err);
                                            }
                                        }}
                                        className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white font-mono text-center focus:outline-none focus:border-amber-500"
                                    />
                                    <span>s</span>
                                </div>
                                <div className="w-px h-3 bg-slate-700"></div>
                                <div className="flex items-center gap-1.5 text-slate-400">
                                    <span>{t('serverManager.serverDetails.priority', 'Priority')}:</span>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={srv.startupPriority !== undefined ? srv.startupPriority : ''}
                                        onChange={async (e) => {
                                            const priority = parseInt(e.target.value) || 0;
                                            try {
                                                await updateAseServer(srv.id, { startupPriority: priority });
                                                setServers(servers.map(s => s.id === srv.id ? { ...s, startupPriority: priority } : s));
                                            } catch (err) {
                                                console.error('Failed to update priority:', err);
                                            }
                                        }}
                                        className="w-10 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white font-mono text-center focus:outline-none focus:border-amber-500"
                                    />
                                </div>
                            </div>
                        )}

                        <label className="flex items-center gap-2 cursor-pointer group/toggle no-collapse">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={srv.autoStop || false}
                                    onChange={() => handleToggleAseAutomation(srv.id, 'autoStop', srv.autoStop || false)}
                                />
                                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStop', 'Auto-Stop')}</span>
                                <span className="text-[10px] text-slate-500">{t('serverManager.serverDetails.onConfigChange', 'On config change')}</span>
                            </div>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer group/toggle ml-auto lg:ml-0 no-collapse">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={srv.intelligentMode || false}
                                    onChange={() => handleToggleAseAutomation(srv.id, 'intelligentMode', srv.intelligentMode || false)}
                                />
                                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.intelligentMode', 'Intelligent Mode')}</span>
                                <span className="text-[10px] text-slate-500">{t('serverManager.serverDetails.autoRestartOnCrash', 'Auto-restart on crash')}</span>
                            </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                    )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {showInstall && <ASEInstallWizard onClose={() => { setShowInstall(false); refreshServers(); }} />}
      {showImport && <ASEImportServerDialog onClose={() => { setShowImport(false); refreshServers(); }} />}
      {showImportSave && <ASEImportSaveDialog onClose={() => { setShowImportSave(false); refreshServers(); }} servers={servers} />}
      {resetServer && <ASEResetDialog isOpen={true} serverId={resetServer.id} serverName={resetServer.name} onClose={() => setResetServer(null)} onSuccess={refreshServers} />}
      
      <ConfirmDialog
        isOpen={serverToDelete !== null}
        onClose={() => setServerToDelete(null)}
        onConfirm={confirmDelete}
        title={t('serverManager.deleteTitle', 'Delete ASE Server')}
        message={serverToDelete ? t('serverManager.deleteConfirmMessage', `Delete ASE server "${serverToDelete.name}"? This cannot be undone.`, { name: serverToDelete.name }) : ''}
        confirmText={t('dialogs.confirm.delete', 'Delete')}
        variant="danger"
        isLoading={isDeleting}
      />
    </motion.div>
  );
}
