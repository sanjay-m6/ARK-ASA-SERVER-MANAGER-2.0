import { useEffect, useState } from 'react';
import { Server, Plus, Play, Square, RotateCw, Trash2, Search, Settings, Terminal, Globe, Shield, RefreshCw, Download, Save, ChevronDown, ChevronUp, FolderOpen, Users, PenLine, Cpu, Network, GripVertical, GitBranch, Loader2, Copy, AlertTriangle, FileText, Timer } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { useInstallStore, normalizePath } from '../../stores/installStore';
import { suggestNextAsePorts } from '../utils/aseLaunchArgs';
import { cn } from '../../utils/helpers';
import { startAseServer, stopAseServer, restartAseServer, deleteAseServer, updateAseServer, updateAseServerInstall, cloneAseServer, transferAseSettings, extractAseSaveData, joinAseServer, getAseServerVersion } from '../utils/aseCommands';
import { getAseMapDisplayName, ASE_BRANCHES } from '../data/aseMaps';
import ASEResetDialog from '../components/server/ASEResetDialog';
import ASEImportServerDialog from '../components/server/ASEImportServerDialog';
import ASEImportSaveDialog from '../components/server/ASEImportSaveDialog';
import ASECloneOptionsModal from '../components/server/ASECloneOptionsModal';
import { TimedShutdownModal } from '../../components/server/TimedShutdownModal';
import { ServerTimedShutdownBanner } from '../../components/server/ServerTimedShutdownBanner';
import { AseServer } from '../types/ase.types';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ServerStatusBar from '../../components/server/ServerStatusBar';
import MoveServerDialog from '../../components/server/MoveServerDialog';
import { moveServer } from '../../utils/tauri';
import { open } from '@tauri-apps/plugin-dialog';

export default function ASEServerManager() {
  const { servers, setServers, updateServerStatus, refreshServers, removeServer, isServerOutdated } = useAseServerStore();
  const { setDraftOpen, setDraftSetup } = useInstallStore();
  const [showImport, setShowImport] = useState(false);

  const handleDeployServer = () => {
    const suggested = suggestNextAsePorts(servers);
    setDraftSetup({
      step: 1,
      formData: {
        serverType: 'ASE',
        name: '',
        mapName: 'TheIsland',
        branch: 'default',
        gamePort: suggested.gamePort,
        queryPort: suggested.queryPort,
        rconPort: suggested.rconPort,
        adminPassword: '',
        sessionName: '',
        installPath: '',
        maxPlayers: 70
      },
      baseDir: 'C:\\ARKServerManager\\ase'
    });
    setDraftOpen(true);
  };
  const [showImportSave, setShowImportSave] = useState(false);
  const [resetServer, setResetServer] = useState<{id: number, name: string} | null>(null);
  const [serverToDelete, setServerToDelete] = useState<{id: number, name: string} | null>(null);
  const [cloneModalServer, setCloneModalServer] = useState<AseServer | null>(null);
  const [timedShutdownServer, setTimedShutdownServer] = useState<AseServer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServers, setSelectedServers] = useState<number[]>([]);
  const [collapsedCards, setCollapsedCards] = useState<Record<number, boolean>>({});
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [editServerName, setEditServerName] = useState('');
  const [serverVersions, setServerVersions] = useState<Record<number, string>>({});
  
  // Move Server State
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveServerTarget, setMoveServerTarget] = useState<AseServer | null>(null);
  const [moveServerPath, setMoveServerPath] = useState<string>('');
  const [isBulkMove, setIsBulkMove] = useState(false);
  
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Active SteamCMD update states
  const [activeUpdates, setActiveUpdates] = useState<Record<number, { stage: string; progress: number; message: string; isComplete: boolean; isError: boolean }>>({});
  const [updateConsoleLogs, setUpdateConsoleLogs] = useState<Record<number, Array<{ timestamp: string; line: string; lineType: string }>>>({});
  const [showUpdateConsole, setShowUpdateConsole] = useState<Record<number, boolean>>({});

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
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') refreshServers();
    }, 10000);

    // Listen for backend status change events
    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      
      const unlistenStatus = await listen('server-status-change', (event) => {
        const { server_id, status } = event.payload as { server_id: number; status: string };
        updateServerStatus(server_id, status as any);
      });

      const unlistenProgress = await listen<any>('install-progress', (event) => {
        const payload = event.payload;
        const currentServers = useAseServerStore.getState().servers;
        const server = currentServers.find(s => normalizePath(s.installPath) === normalizePath(payload.installPath));
        if (server) {
          setActiveUpdates(prev => ({
            ...prev,
            [server.id]: {
              stage: payload.stage,
              progress: payload.progress,
              message: payload.message,
              isComplete: payload.isComplete,
              isError: payload.isError
            }
          }));
          if (payload.isComplete) {
            // Clear progress state after a small delay on completion
            setTimeout(() => {
              setActiveUpdates(prev => {
                const next = { ...prev };
                delete next[server.id];
                return next;
              });
            }, 3000);
          }
        }
      });

      const unlistenConsole = await listen<any>('install-console', (event) => {
        const payload = event.payload;
        const currentServers = useAseServerStore.getState().servers;
        const server = currentServers.find(s => normalizePath(s.installPath) === normalizePath(payload.installPath));
        if (server) {
          setUpdateConsoleLogs(prev => {
            const logs = prev[server.id] || [];
            return {
              ...prev,
              [server.id]: [...logs, {
                timestamp: payload.timestamp,
                line: payload.line,
                lineType: payload.lineType
              }]
            };
          });
        }
      });

      return () => {
        unlistenStatus();
        unlistenProgress();
        unlistenConsole();
      };
    };
    let unlistenPromise = setupListener();

    return () => {
      clearInterval(intervalId);
      // Cleanup event listener
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'install') {
      handleDeployServer();
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [servers]);

  useEffect(() => {
    const fetchVersions = async () => {
      const targets = servers.filter(
        (s) => (s.status === 'online' || s.status === 'running') && !serverVersions[s.id]
      );
      if (targets.length === 0) return;
      for (const srv of targets) {
        try {
          const version = await getAseServerVersion(srv.id);
          setServerVersions(prev => ({ ...prev, [srv.id]: version }));
        } catch (err) {
          console.error(`Failed to get version for server ${srv.id}:`, err);
        }
      }
    };
    fetchVersions();
  }, [servers, serverVersions]);

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

  const handleRestartAseServer = async (id: number, wipeDinos?: boolean) => {
    try {
      updateServerStatus(id, 'starting');
      await restartAseServer(id, wipeDinos);
      toast.success(wipeDinos ? 'ASE server restarting with dino wipe...' : 'ASE server restarting...');
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
      await deleteAseServer(serverToDelete.id, true); 
      removeServer(serverToDelete.id); 
      toast.success(`ASE Server instance "${serverToDelete.name}" and all files on disk deleted.`); 
      setServerToDelete(null);
    } catch (e) { 
      toast.error(`${e}`); 
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameStart = (server: AseServer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingServerId(server.id);
    setEditServerName(server.name);
  };

  const handleRenameSave = async (server: AseServer) => {
    if (editingServerId === server.id) {
      const trimmed = editServerName.trim();
      if (!trimmed) {
        toast.error(t('serverManager.errors.emptyName', 'Server name cannot be empty.'));
        setEditingServerId(null);
        return;
      }
      try {
        await updateAseServer(server.id, { name: trimmed });
        setServers(servers.map(s => s.id === server.id ? { ...s, name: trimmed } : s));
        toast.success(t('serverManager.nameUpdated', 'Server name updated successfully.'));
      } catch (err) {
        console.error('Failed to rename server:', err);
        toast.error(t('serverManager.renameFailed', 'Failed to rename server.'));
      } finally {
        setEditingServerId(null);
      }
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, server: AseServer) => {
    if (e.key === 'Enter') {
      handleRenameSave(server);
    } else if (e.key === 'Escape') {
      setEditingServerId(null);
    }
  };

  const handleCloneServer = async () => {
    if (!cloneModalServer) return;
    try {
      const newServer = await cloneAseServer(cloneModalServer.id);
      setServers([...servers, newServer]);
      toast.success(t('serverManager.serverCloned', 'Server cloned successfully: {{name}}', { name: newServer.name }));
      setCloneModalServer(null);
    } catch (error) {
      toast.error(t('serverManager.cloneFailed', 'Clone failed: {{error}}', { error }));
    }
  };

  const handleTransferSettings = async (targetServerId: number) => {
    if (!cloneModalServer) return;
    try {
      await transferAseSettings(cloneModalServer.id, targetServerId);
      toast.success(t('dashboard.settingsTransferred', 'Settings transferred successfully'));
    } catch (error) {
      toast.error(t('dashboard.failedTransfer', 'Failed to transfer settings: {{error}}', { error }));
    }
  };

  const handleExtractData = async (targetServerId: number) => {
    if (!cloneModalServer) return;
    try {
      await extractAseSaveData(cloneModalServer.id, targetServerId);
      toast.success(t('dashboard.saveDataExtracted', 'Save data extracted successfully'));
    } catch (error) {
      toast.error(t('dashboard.failedExtract', 'Failed to extract save data: {{error}}', { error }));
    }
  };

  const handleMoveServer = async (serverId: number) => {
    try {
      const server = servers.find(s => s.id === serverId);
      if (!server) return;
      
      if (server.status !== 'stopped' && server.status !== 'crashed') {
        toast.error(t('serverManager.move.mustBeStopped', 'Server must be stopped before moving.'));
        return;
      }

      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: t('serverManager.move.selectFolder', 'Select New Server Directory')
      });

      if (selectedPath && !Array.isArray(selectedPath)) {
        setMoveServerTarget(server);
        setMoveServerPath(selectedPath as string);
        setIsBulkMove(false);
        setShowMoveDialog(true);
      }
    } catch (error) {
      console.error('Failed to prepare move server:', error);
      toast.error(t('serverManager.move.failed', 'Failed to prepare move server.'));
    }
  };

  const confirmMoveServer = async () => {
    if (!moveServerPath) return;

    if (isBulkMove) {
      try {
        toast.success(t('serverManager.move.startedBulk', { count: selectedServers.length, defaultValue: `Moving ${selectedServers.length} servers...` }));
        
        let successCount = 0;
        for (const serverId of selectedServers) {
          try {
            const server = servers.find(s => s.id === serverId);
            if (server) {
              toast.loading(t('serverManager.move.movingServer', { name: server.name, defaultValue: `Moving ${server.name}...` }), { id: 'bulk-move-ase' });
              await moveServer(serverId, moveServerPath, true); // true for isAse
              successCount++;
            }
          } catch (err) {
            console.error(`Failed to move server ${serverId}:`, err);
            toast.error(t('serverManager.move.bulkFailedOne', { defaultValue: 'Failed to move a server.' }));
          }
        }
        
        if (successCount > 0) {
          toast.success(t('serverManager.move.bulkSuccess', { count: successCount, defaultValue: `Successfully moved ${successCount} servers!` }), { id: 'bulk-move-ase' });
        } else {
          toast.dismiss('bulk-move-ase');
        }
        
        refreshServers();
        setSelectedServers([]);
      } catch (error) {
        console.error('Failed to bulk move servers:', error);
        toast.error(t('serverManager.move.failed', 'Failed to move servers.'));
        toast.dismiss('bulk-move-ase');
      }
    } else if (moveServerTarget) {
      try {
        toast.success(t('serverManager.move.started', 'Moving server...'));
        
        await moveServer(moveServerTarget.id, moveServerPath, true); // true for isAse
        
        toast.success(t('serverManager.move.success', 'Server moved successfully!'));
        refreshServers();
      } catch (error) {
        console.error('Failed to move server:', error);
        toast.error(t('serverManager.move.failed', 'Failed to move server.'));
        refreshServers();
      }
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
    const runnings = servers.filter(s => s.status !== 'stopped');
    if (runnings.length === 0) return toast.error('No active servers to stop');
    toast.success(`Stopping ${runnings.length} servers...`);
    await Promise.all(runnings.map(s => handleStop(s.id)));
  };

  const handleBulkMoveServers = async () => {
    try {
      if (selectedServers.length === 0) return;

      // Validate that all selected servers are stopped
      const selectedServerObjs = servers.filter(s => selectedServers.includes(s.id));
      const runningServers = selectedServerObjs.filter(s => s.status !== 'stopped' && s.status !== 'crashed');
      
      if (runningServers.length > 0) {
        toast.error(t('serverManager.move.bulkMustBeStopped', 'All selected servers must be stopped before moving.'));
        return;
      }

      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: t('serverManager.move.selectFolder', 'Select New Server Directory')
      });

      if (selectedPath && !Array.isArray(selectedPath)) {
        setMoveServerPath(selectedPath as string);
        setIsBulkMove(true);
        setShowMoveDialog(true);
      }
    } catch (error) {
      console.error('Failed to bulk move servers:', error);
      toast.error(t('serverManager.move.failed', 'Failed to prepare move servers.'));
    }
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">{t('serverManager.title', 'Server Manager')}</h1>
          <p className="text-slate-400 mt-2 text-lg">Deploy, configure, and manage your ARK: Survival Evolved servers</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 hover:border-slate-600/50 text-slate-200 rounded-xl transition-all font-medium focus:outline-none whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="whitespace-nowrap">{t('serverManager.buttons.importExisting', 'Import Server')}</span>
          </button>
          <button
            onClick={() => setShowImportSave(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl transition-all font-medium focus:outline-none whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">{t('serverManager.buttons.importSave', 'Import Save')}</span>
          </button>
          <button onClick={handleDeployServer} className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl transition-all shadow-lg shadow-amber-500/20 font-medium group focus:outline-none whitespace-nowrap shrink-0 cursor-pointer">
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform shrink-0" />
            <span className="whitespace-nowrap">{t('serverManager.buttons.deployServer', 'Deploy Server')}</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search servers by name or map..." className="w-full pl-12 pr-4 py-3.5 bg-[var(--surface-hover)] backdrop-blur-sm border border-[var(--border)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all shadow-inner" />
      </div>

      {/* Bulk Actions Bar - Glassmorphic Pill */}
      {servers.length > 0 && (
        <div className="sticky top-4 z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-2xl p-4 mt-2 mb-6 gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none">
              <input
                type="checkbox"
                checked={servers.length > 0 && selectedServers.length === servers.length}
                onChange={handleSelectAll}
                className="w-5 h-5 rounded-md border-[var(--border)] bg-[var(--surface-hover)] text-amber-500 focus:ring-amber-500/50 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer transition-all shadow-inner hover:border-amber-500/50"
              />
              <span className="font-semibold">
                {selectedServers.length > 0
                  ? `${selectedServers.length} Selected`
                  : 'Select All'}
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto bg-[var(--surface-hover)] rounded-2xl border border-[var(--border)] p-2 shadow-inner">
            {/* Start Actions */}
            <button
              onClick={handleBulkStart}
              disabled={selectedServers.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 rounded-full transition-all text-xs font-bold disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Selected</span>
            </button>
            <button
              onClick={handleStartAll}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 rounded-full transition-all text-xs font-bold cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start All</span>
            </button>

            <div className="w-px h-5 bg-[var(--border)] hidden sm:block mx-1.5"></div>

            {/* Stop Actions */}
            <button
              onClick={handleBulkStop}
              disabled={selectedServers.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 rounded-full transition-all text-xs font-bold disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Selected</span>
            </button>
            <button
              onClick={handleStopAll}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 rounded-full transition-all text-xs font-bold cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop All</span>
            </button>

            <div className="w-px h-5 bg-[var(--border)] hidden sm:block mx-1.5"></div>

            {/* Manage Actions */}
            <button
              onClick={handleBulkMoveServers}
              disabled={selectedServers.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 rounded-full transition-all text-xs font-bold disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title={t('serverManager.move.bulkTitle', 'Move selected servers to a new directory')}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Move Selected</span>
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
              <button onClick={handleDeployServer} className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl transition-all shadow-lg shadow-amber-500/20 font-medium focus:outline-none">
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
                        style={{
                            ...provided.draggableProps.style,
                            zIndex: snapshot.isDragging ? 100 : (orderedServers.length - index) * 10
                        }}
                        className={cn(
                          "bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-2xl p-6 group relative cursor-pointer hover:z-50 z-10 shadow-lg transition-all duration-300",
                          snapshot.isDragging
                            ? "shadow-2xl shadow-amber-500/20 ring-2 ring-amber-500/50 cursor-grabbing scale-[1.02] z-[100]"
                            : "hover:border-amber-500/50 hover:shadow-[0_8px_30px_rgba(245,158,11,0.15)] hover:-translate-y-0.5"
                        )}
                        onClick={(e) => toggleCollapse(srv.id, e)}
                      >
                        {/* Decorative background gradient clipped inside the card */}
                        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-500/5 to-transparent rounded-full blur-3xl -mr-32 -mt-32"></div>
                        </div>
              
                <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div className="flex items-start space-x-4">
                  {/* Drag Handle */}
                  <div
                    {...provided.dragHandleProps}
                    className="flex items-center h-full pt-1 cursor-grab text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors no-collapse"
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
                      className="w-5 h-5 rounded-md border-[var(--border)] bg-[var(--surface-hover)] text-amber-500 focus:ring-amber-500/50 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer transition-all shadow-inner hover:border-amber-500/50"
                    />
                  </div>
                  {/* Status Indicator */}
                  <div className="relative mt-1">
                    <div className={cn(
                        'w-4 h-4 rounded-full',
                        srv.status === 'running' && 'bg-amber-500 animate-pulse',
                        srv.status === 'online' && 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]',
                        srv.status === 'stopped' && 'bg-slate-500',
                        srv.status === 'crashed' && 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]',
                        srv.status === 'starting' && 'bg-amber-500 animate-pulse',
                        srv.status === 'updating' && 'bg-sky-500 animate-pulse'
                    )} />
                    {srv.status === 'online' && (
                        <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      {editingServerId === srv.id ? (
                        <input
                          type="text"
                          value={editServerName}
                          onChange={(e) => setEditServerName(e.target.value)}
                          onKeyDown={(e) => handleRenameKeyDown(e, srv)}
                          onBlur={() => handleRenameSave(srv)}
                          autoFocus
                          className="no-collapse text-xl font-bold bg-[var(--surface-hover)] border border-amber-500/50 rounded-xl px-2 py-0.5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500/50 min-w-[200px]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <h3
                          className="text-xl font-bold text-[var(--text-primary)] group-hover:text-amber-500 transition-colors"
                          onDoubleClick={(e) => handleRenameStart(srv, e)}
                          title={t('serverManager.tooltips.doubleClickToRename', 'Double-click to rename')}
                        >
                          {srv.name}
                        </h3>
                      )}
                      <span className={cn(
                          'px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-inner',
                          srv.status === 'online' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                          srv.status === 'running' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                          srv.status === 'stopped' && 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30',
                          srv.status === 'crashed' && 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
                          srv.status === 'starting' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                          srv.status === 'updating' && 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30'
                      )}>
                          {(srv.status === 'running' || srv.status === 'starting' || srv.status === 'updating') && (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                          )}
                          {srv.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Metadata Pills */}
                    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface-hover)] rounded-xl shadow-inner border border-[var(--border)]">
                          <Globe className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs">{getAseMapDisplayName(srv.mapName)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface-hover)] rounded-xl shadow-inner border border-[var(--border)]">
                          <Terminal className="w-3.5 h-3.5 text-amber-500" />
                          <span className="font-mono text-xs">Port {srv.port}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface-hover)] rounded-xl shadow-inner border border-[var(--border)]">
                          <Shield className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-semibold">ASE Server</span>
                      </div>
                      {serverVersions[srv.id] && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface-hover)] rounded-xl shadow-inner border border-[var(--border)]" title="Server Executable Build Timestamp">
                            <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="font-mono text-xs text-indigo-600 dark:text-indigo-300">{serverVersions[srv.id]}</span>
                        </div>
                      )}
                      {isServerOutdated(srv.id) && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 rounded-xl shadow-inner border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold" title="New update available on Steam! Click Update Server to install.">
                            <Download className="w-3.5 h-3.5 text-amber-500 animate-bounce" />
                            <span className="text-xs">Update Available</span>
                        </div>
                      )}
                      {(() => {
                        if (!srv.clusterId || !serverVersions[srv.id]) return null;
                        const clusterServers = servers.filter(s => s.clusterId === srv.clusterId && s.id !== srv.id);
                        const hasMismatch = clusterServers.some(other => serverVersions[other.id] && serverVersions[other.id] !== serverVersions[srv.id]);
                        if (!hasMismatch) return null;
                        return (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/15 rounded-xl shadow-inner border border-rose-500/30 text-rose-700 dark:text-rose-400 font-bold" title="Version mismatch detected among clustered servers! Ensure all servers are updated.">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                              <span className="text-xs">Cluster Mismatch</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Action Buttons + Collapse Toggle */}
                {/* Action Pod Toolbar */}
                <div 
                    onClick={(e) => e.stopPropagation()}
                    className="relative flex items-center gap-2.5 px-3 py-1.5 bg-[var(--surface-active)] backdrop-blur-xl border border-[var(--border)] rounded-full shadow-lg hover:border-amber-500/40 transition-all duration-300 xl:mr-4 shrink-0 no-collapse w-fit mx-auto xl:mx-0 self-center xl:self-auto"
                >
                  {srv.status === 'updating' ? (
                    <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-[0_0_12px_rgba(56,189,248,0.25)]" title="Updating Files...">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    </div>
                  ) : srv.status === 'stopped' || srv.status === 'crashed' ? (
                    <button 
                      onClick={()=>handleStart(srv.id)} 
                      className="relative flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 border border-emerald-500/35 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group/btn" 
                      title="Start Server"
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                  ) : (
                    <>
                      <div className="relative group/stop">
                        <button
                          onClick={() => setTimedShutdownServer(srv)}
                          className="relative flex items-center justify-center w-10 h-10 rounded-full bg-rose-500/15 hover:bg-rose-500/30 text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 border border-rose-500/35 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group/btn"
                          title="Stop / Shutdown Options"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>

                        {/* Stop Options Dropdown */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 xl:left-auto xl:right-0 xl:translate-x-0 mt-3 w-56 bg-[var(--surface)] backdrop-blur-2xl border border-[var(--border)] rounded-2xl shadow-2xl opacity-0 invisible group-hover/stop:opacity-100 group-hover/stop:visible transition-all duration-200 z-50 overflow-hidden origin-top xl:origin-top-right scale-95 group-hover/stop:scale-100 p-1.5 space-y-1">
                          <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-rose-600 dark:text-rose-400">Shutdown Options</div>
                          <button
                            onClick={() => setTimedShutdownServer(srv)}
                            className="w-full text-left px-3 py-2.5 hover:bg-amber-500/15 text-[var(--text-secondary)] hover:text-amber-700 dark:hover:text-amber-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-semibold group/item cursor-pointer"
                          >
                            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500 group-hover/item:scale-110 transition-transform">
                              <Timer className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold">Timed Shutdown</span>
                              <span className="text-[10px] text-[var(--text-muted)] font-normal">Countdown with broadcasts</span>
                            </div>
                          </button>
                          <button
                            onClick={() => handleStop(srv.id)}
                            className="w-full text-left px-3 py-2.5 hover:bg-rose-500/15 text-[var(--text-secondary)] hover:text-rose-700 dark:hover:text-rose-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-semibold group/item cursor-pointer border-t border-[var(--border)] pt-2"
                          >
                            <div className="w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-500 group-hover/item:scale-110 transition-transform">
                              <Square className="w-3.5 h-3.5 fill-current" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold">Immediate Stop</span>
                              <span className="text-[10px] text-[var(--text-muted)] font-normal">Halt process immediately</span>
                            </div>
                          </button>
                        </div>
                      </div>

                      <div className="relative group/dropdown">
                        <button 
                          className="relative flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 border border-amber-500/30 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group/btn" 
                          title="Restart Options"
                        >
                          <RotateCw className="w-4 h-4 group-hover/btn:rotate-180 transition-transform duration-500" />
                        </button>
                        
                        {/* Dropdown Menu */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 xl:left-auto xl:right-0 xl:translate-x-0 mt-3 w-56 bg-[var(--surface)] backdrop-blur-2xl border border-[var(--border)] rounded-2xl shadow-2xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50 overflow-hidden origin-top xl:origin-top-right scale-95 group-hover/dropdown:scale-100 p-1.5 space-y-1">
                          <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400">Restart Control</div>
                          <button
                            onClick={() => handleRestartAseServer(srv.id)}
                            className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                          >
                            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500 group-hover/item:scale-110 transition-transform">
                              <RotateCw className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold">{t('serverManager.buttons.normalRestart', 'Normal Restart')}</span>
                              <span className="text-[10px] text-[var(--text-muted)] font-normal">Graceful server restart</span>
                            </div>
                          </button>
                          <button
                            onClick={() => handleRestartAseServer(srv.id, true)}
                            className="w-full text-left px-3 py-2.5 hover:bg-amber-500/15 text-[var(--text-secondary)] hover:text-amber-700 dark:hover:text-amber-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer border-t border-[var(--border)] pt-2"
                            title="Gracefully restart the server and wipe all wild dinosaurs"
                          >
                            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500 group-hover/item:scale-110 transition-transform">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold">{t('serverManager.buttons.restartWipeDinos', 'Restart & Wipe Dinos')}</span>
                              <span className="text-[10px] text-[var(--text-muted)] font-normal">DestroyWildDinos on boot</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  <button
                      onClick={() => navigate('/ase/rcon', { state: { serverId: srv.id } })}
                      disabled={srv.status === 'updating' || srv.status === 'stopped'}
                      className="relative flex items-center justify-center w-10 h-10 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 border border-cyan-500/30 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer group/btn"
                      title="RCON Console"
                  >
                      <Terminal className="w-4 h-4" />
                  </button>

                  <button
                      onClick={async (e) => { e.stopPropagation(); try { await joinAseServer(srv.id); toast.success(t('serverManager.joiningServer', 'Launching ARK and connecting...')); } catch (err) { toast.error(`${err}`); } }}
                      disabled={srv.status !== 'online' && srv.status !== 'running'}
                      className="relative flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 border border-indigo-500/30 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer group/btn"
                      title="Join Server (Direct Connect)"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                  </button>

                  <div className="w-[1.5px] h-5 bg-[var(--border)] mx-0.5 shrink-0" />

                  {/* Settings & Tools Dropdown */}
                  <div className="relative group/settings">
                    <button
                        onClick={() => navigate('/ase/config', { state: { serverId: srv.id } })}
                        disabled={srv.status === 'updating'}
                        className="relative flex items-center justify-center w-10 h-10 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-amber-500/50 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer group/btn"
                        title="Server Settings & Options"
                    >
                        <Settings className="w-4 h-4 group-hover/btn:rotate-45 transition-transform duration-300" />
                    </button>

                    {/* Settings Dropdown Menu */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 xl:left-auto xl:right-0 xl:translate-x-0 mt-2 w-60 bg-[var(--surface)] backdrop-blur-2xl border border-[var(--border)] rounded-2xl shadow-2xl opacity-0 invisible group-hover/settings:opacity-100 group-hover/settings:visible transition-all duration-200 z-50 overflow-hidden origin-top xl:origin-top-right scale-95 group-hover/settings:scale-100 p-1.5 space-y-0.5">
                        <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400">Management & Config</div>
                        <button
                            onClick={() => navigate('/ase/config', { state: { serverId: srv.id } })}
                            className="w-full text-left px-3 py-2 hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                        >
                            <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500 group-hover/item:scale-110 transition-transform">
                                <Settings className="w-3.5 h-3.5" />
                            </div>
                            <span>Visual Config Editor</span>
                        </button>
                        <button
                            onClick={() => navigate('/ase/config', { state: { serverId: srv.id, initialMode: 'gus' } })}
                            className="w-full text-left px-3 py-2 hover:bg-amber-500/15 text-[var(--text-secondary)] hover:text-amber-700 dark:hover:text-amber-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                        >
                            <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500 group-hover/item:scale-110 transition-transform">
                                <FileText className="w-3.5 h-3.5" />
                            </div>
                            <span>Edit Files Manually (IDE)</span>
                        </button>
                        <button
                            onClick={() => setCloneModalServer(srv)}
                            className="w-full text-left px-3 py-2 hover:bg-sky-500/15 text-[var(--text-secondary)] hover:text-sky-700 dark:hover:text-sky-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                        >
                            <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-500 group-hover/item:scale-110 transition-transform">
                                <Copy className="w-3.5 h-3.5" />
                            </div>
                            <span>Clone Server</span>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleMoveServer(srv.id); }}
                            disabled={srv.status !== 'stopped' && srv.status !== 'crashed'}
                            className="w-full text-left px-3 py-2 hover:bg-purple-500/15 text-[var(--text-secondary)] hover:text-purple-700 dark:hover:text-purple-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                        >
                            <div className="w-6 h-6 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-500 group-hover/item:scale-110 transition-transform">
                                <FolderOpen className="w-3.5 h-3.5" />
                            </div>
                            <span>Move Server</span>
                        </button>
                        <button
                            onClick={() => setResetServer({id: srv.id, name: srv.name})}
                            className="w-full text-left px-3 py-2 hover:bg-orange-500/15 text-[var(--text-secondary)] hover:text-orange-700 dark:hover:text-orange-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                        >
                            <div className="w-6 h-6 rounded-lg bg-orange-500/15 flex items-center justify-center text-orange-500 group-hover/item:scale-110 transition-transform">
                                <RotateCw className="w-3.5 h-3.5" />
                            </div>
                            <span>Reset Server Data</span>
                        </button>
                        <div className="border-t border-[var(--border)] my-1"></div>
                        <button
                            onClick={() => handleDelete(srv.id, srv.name)}
                            className="w-full text-left px-3 py-2 hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                        >
                            <div className="w-6 h-6 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-500 group-hover/item:scale-110 transition-transform">
                                <Trash2 className="w-3.5 h-3.5" />
                            </div>
                            <span>Delete Server</span>
                        </button>
                    </div>
                  </div>
                </div>

                {/* Collapse/Expand chevron */}
                <button
                    onClick={(e) => { e.stopPropagation(); setCollapsedCards(prev => ({ ...prev, [srv.id]: !prev[srv.id] })); }}
                    className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                    {collapsedCards[srv.id] ? (
                        <ChevronDown className="w-4 h-4" />
                    ) : (
                        <ChevronUp className="w-4 h-4" />
                    )}
                </button>
              </div>

              {/* Collapsible Server Details */}
              {!collapsedCards[srv.id] && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                  {/* Server Details Grid - Glassmorphic */}
                  <div className="mt-5 pt-4 border-t border-[var(--border)]">
                    <div className="bg-[var(--surface-hover)] backdrop-blur-md rounded-2xl border border-[var(--border)] p-5 shadow-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6 text-sm">
                        <div className="space-y-2 group/field">
                            <div className="flex items-center gap-2 text-[var(--text-muted)] group-hover/field:text-[var(--text-primary)] transition-colors">
                                <FolderOpen className="w-4 h-4 text-amber-500" />
                                <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.installPath', 'Install Path')}</p>
                            </div>
                            <p className="text-[var(--text-secondary)] font-mono text-xs truncate bg-[var(--surface)] p-2.5 rounded-xl border border-[var(--border)] transition-colors shadow-inner" title={srv.installPath}>{srv.installPath}</p>
                        </div>
                        <div className="space-y-2 group/field">
                            <div className="flex items-center gap-2 text-[var(--text-muted)] group-hover/field:text-[var(--text-primary)] transition-colors">
                                <Users className="w-4 h-4 text-amber-500" />
                                <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.maxPlayers', 'Max Players')}</p>
                            </div>
                            <p className="text-[var(--text-secondary)] text-xs bg-[var(--surface)] p-2.5 rounded-xl border border-[var(--border)] transition-colors shadow-inner truncate">{srv.maxPlayers} {t('serverManager.serverDetails.survivors', 'Survivors')}</p>
                        </div>
                        <div className="space-y-2 group/field">
                            <div className="flex items-center gap-2 text-[var(--text-muted)] group-hover/field:text-[var(--text-primary)] transition-colors">
                                <PenLine className="w-4 h-4 text-amber-500" />
                                <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.sessionName', 'Session Name')}</p>
                            </div>
                            <p className="text-[var(--text-secondary)] text-xs truncate bg-[var(--surface)] p-2.5 rounded-xl border border-[var(--border)] transition-colors shadow-inner">{srv.sessionName}</p>
                        </div>
                        <div className="space-y-2 group/field">
                            <div className="flex items-center gap-2 text-[var(--text-muted)] group-hover/field:text-[var(--text-primary)] transition-colors">
                                <Network className="w-4 h-4 text-amber-500" />
                                <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.connection', 'Connection')}</p>
                            </div>
                            <p className="text-[var(--text-secondary)] font-mono text-xs bg-[var(--surface)] p-2.5 rounded-xl border border-[var(--border)] transition-colors shadow-inner truncate">
                                {srv.port} (Game) / {srv.queryPort} (Query)
                            </p>
                        </div>
                        <div className="space-y-2 group/field no-collapse">
                            <div className="flex items-center gap-2 text-[var(--text-muted)] group-hover/field:text-[var(--text-primary)] transition-colors">
                                <GitBranch className="w-4 h-4 text-amber-500" />
                                <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.branch', 'Server Version')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={srv.branch || 'default'}
                                    onChange={async (e) => {
                                        const newBranch = e.target.value;
                                        try {
                                            await updateAseServer(srv.id, { branch: newBranch });
                                            setServers(servers.map(s => s.id === srv.id ? { ...s, branch: newBranch } : s));
                                            toast.success(t('serverManager.branchUpdated', 'Server version updated. Click the download icon to validate/apply.'));
                                        } catch (err) {
                                            console.error('Failed to update branch:', err);
                                            toast.error(t('serverManager.branchUpdateFailed', 'Failed to update version/branch'));
                                        }
                                    }}
                                    disabled={srv.status === 'starting' || srv.status === 'running' || srv.status === 'online' || srv.status === 'updating'}
                                    className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-[var(--text-primary)] text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full min-w-[130px] max-w-[180px]"
                                >
                                    {ASE_BRANCHES.map(b => (
                                        <option key={b.id} value={b.id} className="bg-[var(--surface)] text-[var(--text-primary)]">{b.name}</option>
                                    ))}
                                </select>
                                
                                <button
                                    onClick={async () => {
                                        if (srv.status === 'running' || srv.status === 'online') {
                                            toast.error(t('serverManager.stopServerFirst', 'Please stop the server before updating files.'));
                                            return;
                                        }
                                        const proceed = window.confirm(t('serverManager.updateConfirm', 'This will run SteamCMD to validate or change the server version. Continue?'));
                                        if (!proceed) return;

                                        try {
                                            toast.success(t('serverManager.updateStarted', 'Updating server files in the background...'));
                                            setServers(servers.map(s => s.id === srv.id ? { ...s, status: 'updating' } : s));
                                            await updateAseServerInstall(srv.id);
                                            toast.success(t('serverManager.updateSuccess', 'Server updated successfully!'));
                                            refreshServers();
                                        } catch (err) {
                                            console.error('Failed to update server:', err);
                                            toast.error(t('serverManager.updateFailed', `Update failed: ${err}`));
                                            refreshServers();
                                        }
                                    }}
                                    disabled={srv.status === 'starting' || srv.status === 'running' || srv.status === 'online' || srv.status === 'updating'}
                                    className="p-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
                                    title={t('serverManager.updateFilesTooltip', 'Update / Verify Server Files via SteamCMD')}
                                >
                                    <Download className={cn("w-4 h-4", srv.status === 'updating' && "animate-bounce")} />
                                </button>
                            </div>
                            {serverVersions[srv.id] && (
                                <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1.5">
                                    Build: <span className="text-[var(--text-secondary)]">{serverVersions[srv.id]}</span>
                                </p>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Update Progress Panel */}
                  {(srv.status === 'updating' || activeUpdates[srv.id]) && (
                    <div className="mt-4 bg-[var(--surface-hover)] backdrop-blur-sm rounded-xl border border-sky-500/30 p-4 shadow-inner animate-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
                          <span className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                            SteamCMD Update Mode: {activeUpdates[srv.id]?.stage || 'Connecting'}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400">
                          {activeUpdates[srv.id] ? `${Math.round(activeUpdates[srv.id].progress)}%` : '0%'}
                        </span>
                      </div>
                      
                      {/* Premium animated progress bar */}
                      <div className="w-full bg-[var(--surface)] rounded-full h-2 overflow-hidden border border-[var(--border)] shadow-inner">
                        <div 
                          className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                          style={{ width: `${activeUpdates[srv.id]?.progress || 0}%` }}
                        />
                      </div>

                      <p className="text-xs text-[var(--text-muted)] mt-2 italic">
                        {activeUpdates[srv.id]?.message || 'Starting SteamCMD wrapper process...'}
                      </p>

                      {/* Collapsible Console View */}
                      <div className="mt-3 border-t border-[var(--border)] pt-3">
                        <button
                          onClick={() => setShowUpdateConsole(prev => ({ ...prev, [srv.id]: !prev[srv.id] }))}
                          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors select-none font-semibold uppercase tracking-wider"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>{showUpdateConsole[srv.id] ? 'Hide Console Logs' : 'Show Console Logs'}</span>
                          <span className="text-[10px] bg-[var(--surface)] border border-[var(--border)] px-1.5 py-0.5 rounded text-[var(--text-muted)] font-mono">
                            {updateConsoleLogs[srv.id]?.length || 0} lines
                          </span>
                        </button>

                        {showUpdateConsole[srv.id] && (
                          <div className="mt-2.5 bg-[var(--surface)] rounded-lg p-3 font-mono text-[11px] h-48 overflow-y-auto border border-[var(--border)] shadow-inner space-y-1 scrollbar-thin select-text">
                            {(updateConsoleLogs[srv.id] || []).length === 0 ? (
                              <div className="text-[var(--text-muted)] italic">Waiting for SteamCMD stream output...</div>
                            ) : (
                              (updateConsoleLogs[srv.id] || []).map((log, i) => (
                                <div key={i} className="flex gap-2.5 items-start leading-relaxed">
                                  <span className="text-[var(--text-muted)] select-none shrink-0">{log.timestamp}</span>
                                  <span className={cn(
                                    "break-all",
                                    log.lineType === 'error' && 'text-rose-600 dark:text-rose-400 font-bold',
                                    log.lineType === 'success' && 'text-emerald-600 dark:text-emerald-400 font-bold',
                                    log.lineType === 'warning' && 'text-amber-600 dark:text-amber-400',
                                    log.lineType === 'progress' && 'text-sky-600 dark:text-sky-400',
                                    log.lineType === 'info' && 'text-[var(--text-secondary)]'
                                  )}>
                                    {log.line}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                   {/* Automation Controls - Glassmorphic */}
                   <div className="mt-4">
                     <div className="bg-[var(--surface-hover)] backdrop-blur-md rounded-2xl border border-[var(--border)] p-5 shadow-sm">
                       <div className="flex flex-wrap items-center gap-6">
                         <div className="flex items-center gap-2">
                             <Cpu className="w-4 h-4 text-amber-500" />
                             <span className="text-[var(--text-muted)] text-xs font-bold uppercase tracking-wider">{t('serverManager.serverDetails.automation', 'Automation')}</span>
                         </div>
                         <label className="flex items-center gap-2.5 cursor-pointer group/toggle no-collapse select-none">
                             <div className="relative">
                                 <input
                                     type="checkbox"
                                     className="sr-only peer"
                                     checked={srv.autoStart || false}
                                     onChange={() => handleToggleAseAutomation(srv.id, 'autoStart', srv.autoStart || false)}
                                 />
                                 <div className="relative w-10 h-6 bg-slate-955/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] rtl:peer-checked:after:-translate-x-[16px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-emerald-400 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-emerald-500/20 peer-checked:border-emerald-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(52,211,153,0.5)] transition-all"></div>
                             </div>
                             <span className="text-[var(--text-secondary)] text-sm font-bold group-hover/toggle:text-[var(--text-primary)] transition-colors">{t('serverManager.serverDetails.autoStart', 'Auto-Start')}</span>
                         </label>

                         {srv.autoStart && (
                             <div className="flex items-center gap-3 bg-[var(--surface)] px-3 py-1.5 rounded-xl border border-[var(--border)] animate-in fade-in duration-200 text-xs no-collapse shadow-inner">
                                 <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                                     <span className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">{t('serverManager.serverDetails.delay', 'Delay')}:</span>
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
                                         className="w-12 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-1.5 py-0.5 text-[var(--text-primary)] font-mono text-center focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                                     />
                                     <span className="text-[var(--text-muted)]">s</span>
                                 </div>
                                 <div className="w-px h-3.5 bg-[var(--border)]"></div>
                                 <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                                     <span className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">{t('serverManager.serverDetails.priority', 'Priority')}:</span>
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
                                         className="w-10 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-1.5 py-0.5 text-[var(--text-primary)] font-mono text-center focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                                     />
                                 </div>
                             </div>
                         )}

                         <label className="flex items-center gap-2.5 cursor-pointer group/toggle no-collapse select-none">
                             <div className="relative">
                                 <input
                                     type="checkbox"
                                     className="sr-only peer"
                                     checked={srv.autoStop || false}
                                     onChange={() => handleToggleAseAutomation(srv.id, 'autoStop', srv.autoStop || false)}
                                 />
                                 <div className="relative w-10 h-6 bg-slate-955/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] rtl:peer-checked:after:-translate-x-[16px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-rose-400 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-rose-500/20 peer-checked:border-rose-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(244,63,94,0.5)] transition-all"></div>
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-[var(--text-secondary)] text-sm font-bold group-hover/toggle:text-[var(--text-primary)] transition-colors">{t('serverManager.serverDetails.autoStop', 'Auto-Stop')}</span>
                                 <span className="text-[10px] text-[var(--text-muted)]">{t('serverManager.serverDetails.onConfigChange', 'On config change')}</span>
                             </div>
                         </label>

                         <label className="flex items-center gap-2.5 cursor-pointer group/toggle ml-auto lg:ml-0 no-collapse select-none">
                             <div className="relative">
                                 <input
                                     type="checkbox"
                                     className="sr-only peer"
                                     checked={srv.intelligentMode || false}
                                     onChange={() => handleToggleAseAutomation(srv.id, 'intelligentMode', srv.intelligentMode || false)}
                                 />
                                 <div className="relative w-10 h-6 bg-slate-955/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] rtl:peer-checked:after:-translate-x-[16px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-amber-400 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-amber-500/20 peer-checked:border-amber-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(245,158,11,0.5)] transition-all"></div>
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-[var(--text-secondary)] text-sm font-bold group-hover/toggle:text-[var(--text-primary)] transition-colors">{t('serverManager.serverDetails.intelligentMode', 'Intelligent Mode')}</span>
                                 <span className="text-[10px] text-[var(--text-muted)]">{t('serverManager.serverDetails.autoRestartOnCrash', 'Auto-restart on crash')}</span>
                             </div>
                         </label>
                       </div>
                     </div>
                   </div>
                   <ServerTimedShutdownBanner serverId={srv.id} className="mt-3" />
                   <ServerStatusBar serverId={srv.id} serverType="ASE" />
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

      {cloneModalServer && (
        <ASECloneOptionsModal
          isOpen={true}
          onClose={() => setCloneModalServer(null)}
          sourceServer={cloneModalServer}
          allServers={servers}
          onCloneServer={handleCloneServer}
          onTransferSettings={handleTransferSettings}
          onExtractData={handleExtractData}
        />
      )}

      <MoveServerDialog
        isOpen={showMoveDialog}
        onClose={() => setShowMoveDialog(false)}
        onConfirm={confirmMoveServer}
        isBulk={isBulkMove}
        serverCount={selectedServers.length}
        serverName={moveServerTarget?.name}
      />

      {timedShutdownServer && (
        <TimedShutdownModal
          isOpen={!!timedShutdownServer}
          onClose={() => setTimedShutdownServer(null)}
          serverId={timedShutdownServer.id}
          serverName={timedShutdownServer.name}
          serverType="ASE"
          onImmediateStop={() => handleStop(timedShutdownServer.id)}
        />
      )}
    </motion.div>
  );
}
