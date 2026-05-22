import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Folder, Plus, Edit, Trash2, Archive, CheckSquare, Info,
  FolderOpen, Server, Bookmark, Tag, LayoutGrid, Heart,
  RotateCcw, Sparkles, ArrowUpDown, RefreshCw, BarChart2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useServerStore } from '../../../stores/serverStore';
// import { useGameStore } from '../../../stores/gameStore';
import { cn } from '../../../utils/helpers';
import {
  createServerFolder,
  getAllFolders,
  updateServerFolder,
  deleteServerFolder,
  addServerToFolder,
  removeServerFromFolder,
  archiveServer,
  restoreServer,
  getArchivedServers,
  updateServerCustomization,
  bulkMoveServers,
  bulkArchiveServers,
  bulkTagServers,
  bulkColorServers,
  getOrganizationSnapshot,
  reorderServers
} from '../../../utils/serverOrganization';
import type {
  ServerFolder as FolderType,
  ServerArchive as ArchiveType
} from '../../../types/server-organization';

export default function ASEServerOrganization() {
  const { t } = useTranslation();
  const { servers } = useServerStore();
  // activeGame removed as it's hardcoded
  const isASE = true;

  // Branding constants matching existing design tokens
  const accentText = isASE ? 'text-amber-400' : 'text-cyan-400';
  const accentBtn = isASE
    ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 font-bold'
    : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-900 font-bold';
  const accentProgress = isASE ? 'bg-amber-500' : 'bg-cyan-500';

  // UI state
  const [activeTab, setActiveTab] = useState<'folders' | 'customizations' | 'bulk' | 'archive' | 'layouts'>('folders');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [archived, setArchived] = useState<ArchiveType[]>([]);
  const [loading, setLoading] = useState(true);

  // Folder modal & editing state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [folderForm, setFolderForm] = useState({
    name: '',
    description: '',
    color: '#8B5CF6',
    icon: 'folder'
  });

  // Customization state
  const [selectedCustomServer, setSelectedCustomServer] = useState<number | null>(null);
  const [customForm, setCustomForm] = useState({
    displayName: '',
    customIcon: '',
    customBanner: '',
    colorTag: '#3B82F6',
    isPinned: false,
    favorite: false,
    tags: [] as string[],
    notes: '',
    newTag: ''
  });

  // Bulk actions state
  const [selectedServers, setSelectedServers] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<'move' | 'archive' | 'tag' | 'color' | null>(null);
  const [bulkFolder, setBulkFolder] = useState<number>(0);
  const [bulkTags, setBulkTags] = useState<string>('');
  const [bulkColor, setBulkColor] = useState<string>('#EF4444');
  const [bulkArchiveReason, setBulkArchiveReason] = useState<string>('');

  // Custom premium modal states
  const [showDeleteFolderModal, setShowDeleteFolderModal] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<number | null>(null);

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [serverToArchive, setServerToArchive] = useState<number | null>(null);
  const [archiveReasonInput, setArchiveReasonInput] = useState('');

  // Fetch all initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getOrganizationSnapshot();
      setSnapshot(snap);
      const allFolders = await getAllFolders();
      setFolders(allFolders);
      const allArchived = await getArchivedServers();
      setArchived(allArchived);
    } catch (e) {
      console.error('Failed to load organization data:', e);
      toast.error('Failed to sync organization data from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [servers]);

  // Folder handlers
  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderForm.name.trim()) return;

    try {
      if (editingFolder) {
        await updateServerFolder(editingFolder.id, {
          name: folderForm.name,
          description: folderForm.description || undefined,
          color: folderForm.color,
          icon: folderForm.icon
        });
        toast.success(`Folder "${folderForm.name}" updated successfully.`);
      } else {
        await createServerFolder({
          name: folderForm.name,
          description: folderForm.description || undefined,
          color: folderForm.color,
          icon: folderForm.icon
        });
        toast.success(`Folder "${folderForm.name}" created successfully.`);
      }
      setShowFolderModal(false);
      setEditingFolder(null);
      setFolderForm({ name: '', description: '', color: '#8B5CF6', icon: 'folder' });
      fetchData();
    } catch (error: any) {
      toast.error(`Failed to save folder changes: ${error.message || error}`);
    }
  };

  const handleEditFolder = (folder: FolderType) => {
    setEditingFolder(folder);
    setFolderForm({
      name: folder.name,
      description: folder.description || '',
      color: folder.color,
      icon: folder.icon || 'folder'
    });
    setShowFolderModal(true);
  };

  const handleDeleteFolder = (id: number) => {
    setFolderToDelete(id);
    setShowDeleteFolderModal(true);
  };

  const confirmDeleteFolder = async () => {
    if (folderToDelete === null) return;
    try {
      await deleteServerFolder(folderToDelete);
      toast.success('Folder deleted successfully.');
      fetchData();
    } catch (e: any) {
      toast.error(`Failed to delete folder: ${e.message || e}`);
    } finally {
      setShowDeleteFolderModal(false);
      setFolderToDelete(null);
    }
  };

  // Add/Remove server from folder
  const handleToggleServerFolder = async (serverId: number, folderId: number, isAssigned: boolean) => {
    try {
      if (isAssigned) {
        await removeServerFromFolder(serverId, folderId);
        toast.success('Server removed from folder.');
      } else {
        await addServerToFolder(serverId, folderId);
        toast.success('Server assigned to folder.');
      }
      fetchData();
    } catch (e: any) {
      toast.error(`Failed to modify server folder allocation: ${e.message || e}`);
    }
  };

  // Customization selection
  const handleSelectCustomServer = async (serverId: number) => {
    setSelectedCustomServer(serverId);
    const server = snapshot?.servers.find((s: any) => s.id === serverId);
    const cust = server?.customization;

    setCustomForm({
      displayName: cust?.displayName || '',
      customIcon: cust?.customIcon || '',
      customBanner: cust?.customBanner || '',
      colorTag: cust?.colorTag || '#3B82F6',
      isPinned: cust?.isPinned || false,
      favorite: cust?.favorite || false,
      tags: cust?.tags || [],
      notes: cust?.notes || '',
      newTag: ''
    });
  };

  const handleSaveCustomization = async () => {
    if (!selectedCustomServer) return;
    try {
      await updateServerCustomization({
        serverId: selectedCustomServer,
        displayName: customForm.displayName || undefined,
        customIcon: customForm.customIcon || undefined,
        customBanner: customForm.customBanner || undefined,
        colorTag: customForm.colorTag,
        isPinned: customForm.isPinned,
        favorite: customForm.favorite,
        tags: customForm.tags,
        notes: customForm.notes || undefined
      });
      toast.success('Server customization settings saved.');
      fetchData();
    } catch (e) {
      toast.error('Failed to save customization settings.');
    }
  };

  // Tag helper
  const handleAddTag = () => {
    if (!customForm.newTag.trim()) return;
    if (customForm.tags.includes(customForm.newTag.trim())) return;
    setCustomForm({
      ...customForm,
      tags: [...customForm.tags, customForm.newTag.trim()],
      newTag: ''
    });
  };

  const handleRemoveTag = (tag: string) => {
    setCustomForm({
      ...customForm,
      tags: customForm.tags.filter(t => t !== tag)
    });
  };

  // Bulk actions
  const handleToggleSelectAll = () => {
    if (selectedServers.length === servers.length) {
      setSelectedServers([]);
    } else {
      setSelectedServers(servers.map(s => s.id));
    }
  };

  const handleToggleSelectServer = (id: number) => {
    if (selectedServers.includes(id)) {
      setSelectedServers(selectedServers.filter(s => s !== id));
    } else {
      setSelectedServers([...selectedServers, id]);
    }
  };

  const handleExecuteBulkAction = async () => {
    if (selectedServers.length === 0) {
      toast.error('Please select at least one server.');
      return;
    }

    try {
      if (bulkAction === 'move') {
        if (!bulkFolder) return;
        await bulkMoveServers(selectedServers, bulkFolder);
        toast.success(`Moved ${selectedServers.length} servers to target folder.`);
      } else if (bulkAction === 'archive') {
        await bulkArchiveServers(selectedServers, bulkArchiveReason || undefined);
        toast.success(`Archived ${selectedServers.length} servers.`);
      } else if (bulkAction === 'tag') {
        const tagsArr = bulkTags.split(',').map(t => t.trim()).filter(Boolean);
        await bulkTagServers(selectedServers, tagsArr);
        toast.success(`Applied tags to ${selectedServers.length} servers.`);
      } else if (bulkAction === 'color') {
        await bulkColorServers(selectedServers, bulkColor);
        toast.success(`Applied color branding to ${selectedServers.length} servers.`);
      }
      setSelectedServers([]);
      setBulkAction(null);
      fetchData();
    } catch (e) {
      toast.error('Failed to complete bulk operation.');
    }
  };

  // Archiving
  const handleArchiveSingleServer = (id: number) => {
    setServerToArchive(id);
    setArchiveReasonInput('');
    setShowArchiveModal(true);
  };

  const confirmArchiveServer = async () => {
    if (serverToArchive === null) return;
    try {
      await archiveServer(serverToArchive, archiveReasonInput || undefined);
      toast.success('Server archived successfully.');
      fetchData();
    } catch (e) {
      toast.error('Failed to archive server.');
    } finally {
      setShowArchiveModal(false);
      setServerToArchive(null);
      setArchiveReasonInput('');
    }
  };

  const handleRestoreSingleServer = async (id: number) => {
    try {
      await restoreServer(id);
      toast.success('Server restored and returned to active dashboard.');
      fetchData();
    } catch (e) {
      toast.error('Failed to restore server.');
    }
  };

  // Reordering
  const handleMoveOrder = async (serverId: number, direction: 'up' | 'down') => {
    const activeServers = snapshot?.servers || [];
    const index = activeServers.findIndex((s: any) => s.id === serverId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= activeServers.length) return;

    const ids = activeServers.map((s: any) => s.id);
    const temp = ids[index];
    ids[index] = ids[newIndex];
    ids[newIndex] = temp;

    try {
      await reorderServers(ids);
      toast.success('Sorting order updated.');
      fetchData();
    } catch (e) {
      toast.error('Failed to update reordering sequence.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 tracking-wide font-display">
            <Folder className={cn('w-7 h-7', accentText)} />
            <span>{t('sidebar.serverOrganization', 'Server Organization')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Group, customize display cards, pin favorite nodes, perform transaction-safe bulk editing, and audit server health.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all rounded-xl focus:outline-none flex items-center gap-2 text-sm text-slate-300"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Database</span>
        </button>
      </div>

      {/* Modern Glassmorphic Tabs */}
      <div className="flex p-1.5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-md w-max shadow-inner gap-1 mb-6 flex-wrap">
        {[
          { id: 'folders', label: 'Folders & Placement', icon: FolderOpen },
          { id: 'customizations', label: 'Branding & Details', icon: Sparkles },
          { id: 'bulk', label: 'Bulk Safe Operations', icon: CheckSquare },
          { id: 'archive', label: 'Archival Logs', icon: Archive },
          { id: 'layouts', label: 'Layout Metrics', icon: BarChart2 }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                isActive
                  ? `${accentText} bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50`
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className={cn('w-8 h-8 animate-spin', accentText)} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* FOLDERS TAB */}
          {activeTab === 'folders' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Folder List & Hierarchy */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-200">Hierarchy Trees</h3>
                  <button
                    onClick={() => {
                      setEditingFolder(null);
                      setFolderForm({ name: '', description: '', color: '#8B5CF6', icon: 'folder' });
                      setShowFolderModal(true);
                    }}
                    className={cn('px-4 py-2 rounded-xl flex items-center gap-1.5 text-sm transition-all focus:outline-none', accentBtn)}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Category</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {folders.length === 0 ? (
                    <div className="text-center py-12 bg-white/[0.01] border border-white/5 rounded-2xl">
                      <Folder className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <h4 className="text-sm font-semibold text-slate-400">No Folders Registered</h4>
                      <p className="text-xs text-slate-500 mt-1">Create a folder category first to arrange your nodes.</p>
                    </div>
                  ) : (
                    folders.map(folder => (
                      <div
                        key={folder.id}
                        className="glass-panel border-white/5 rounded-2xl overflow-hidden"
                      >
                        {/* Folder Header */}
                        <div
                          className="flex items-center justify-between p-4 bg-white/[0.02] border-b border-white/5"
                          style={{ borderLeft: `4px solid ${folder.color}` }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl" style={{ backgroundColor: `${folder.color}15` }}>
                              <FolderOpen className="w-4 h-4" style={{ color: folder.color }} />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white tracking-wide">{folder.name}</h4>
                              {folder.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{folder.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditFolder(folder)}
                              className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteFolder(folder.id)}
                              className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Folder Servers Grid */}
                        <div className="p-4 bg-[#070b13]/40">
                          <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-3">Assigned Nodes</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {servers.map(server => {
                              const isAssigned = snapshot?.servers.find((s: any) => s.id === server.id)?.folderIds?.includes(folder.id);
                              return (
                                <div
                                  key={server.id}
                                  className={cn(
                                    'p-3 border rounded-xl flex items-center justify-between transition-all bg-white/[0.01]',
                                    isAssigned ? 'border-white/10' : 'border-white/5 opacity-50'
                                  )}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <Server className="w-4 h-4 text-slate-400" />
                                    <div>
                                      <span className="text-xs font-semibold text-white">
                                        {snapshot?.servers.find((s: any) => s.id === server.id)?.customization?.displayName || server.name}
                                      </span>
                                      <span className="text-[10px] text-slate-500 ml-2">({server.status})</span>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => handleToggleServerFolder(server.id, folder.id, !!isAssigned)}
                                    className={cn(
                                      'px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg focus:outline-none transition-all',
                                      isAssigned
                                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
                                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                                    )}
                                  >
                                    {isAssigned ? 'Eject' : 'Assign'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Side Info */}
              <div className="space-y-6">
                <div className="glass-panel border-white/5 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-1.5">
                    <Info className={cn('w-4 h-4', accentText)} />
                    <span>Arrangement Guidelines</span>
                  </h3>
                  <div className="text-xs text-slate-400 space-y-3 leading-relaxed">
                    <p>Creating clear categorical folders makes it simple to manage extensive cluster networks.</p>
                    <ul className="list-disc pl-4 space-y-2">
                      <li>Assign nodes to multiple folders depending on administrative hierarchies.</li>
                      <li>Select unique colors per category folder to customize dashboard headers.</li>
                      <li>Deleting folders will not modify or purge the underlying server files.</li>
                    </ul>
                  </div>
                </div>

                <div className="glass-panel border-white/5 rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                    <ArrowUpDown className={cn('w-4 h-4', accentText)} />
                    <span>Global Startup Order</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Adjust the sequence for startup priorities across nodes. The Sequential Auto-Start Engine starts nodes from top to bottom.
                  </p>

                  <div className="space-y-2">
                    {snapshot?.servers.map((server: any, idx: number) => (
                      <div key={server.id} className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-500">{idx + 1}.</span>
                          <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">
                            {server.customization?.displayName || server.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMoveOrder(server.id, 'up')}
                            disabled={idx === 0}
                            className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => handleMoveOrder(server.id, 'down')}
                            disabled={idx === snapshot.servers.length - 1}
                            className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CUSTOMIZATIONS TAB */}
          {activeTab === 'customizations' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Server List */}
              <div className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-400">Select Server Node</h3>
                <div className="space-y-2">
                  {servers.map(server => {
                    const cust = snapshot?.servers.find((s: any) => s.id === server.id)?.customization;
                    const isSelected = selectedCustomServer === server.id;

                    return (
                      <button
                        key={server.id}
                        onClick={() => handleSelectCustomServer(server.id)}
                        className={cn(
                          'w-full p-4 border rounded-2xl flex items-center justify-between text-left transition-all focus:outline-none',
                          isSelected
                            ? `bg-white/[0.04] border-${isASE ? 'amber-500/40' : 'cyan-500/40'}`
                            : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.02]'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cust?.colorTag || '#64748B' }}
                          />
                          <div>
                            <h4 className="text-sm font-bold text-white">{cust?.displayName || server.name}</h4>
                            <p className="text-[10px] text-slate-500 mt-0.5">Original Name: {server.name}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {cust?.favorite && <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                          {cust?.isPinned && <Bookmark className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editing Form */}
              <div className="lg:col-span-2">
                {selectedCustomServer ? (
                  <div className="glass-panel border-white/5 rounded-3xl p-6 space-y-6">
                    <div className="border-b border-white/5 pb-4">
                      <h3 className="text-lg font-bold text-slate-200">Card Customization</h3>
                      <p className="text-xs text-slate-400 mt-1">Configure metadata, color-coded tags, and customized banners for this server node.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Display name */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Display Name Override</label>
                        <input
                          type="text"
                          value={customForm.displayName}
                          onChange={e => setCustomForm({ ...customForm, displayName: e.target.value })}
                          className="w-full px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none focus:border-sky-500/30 text-white text-sm"
                          placeholder="e.g. [US] PVP Crystal Isles Cluster"
                        />
                      </div>

                      {/* Color code */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Color Indicator Tag</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={customForm.colorTag}
                            onChange={e => setCustomForm({ ...customForm, colorTag: e.target.value })}
                            className="w-12 h-11 bg-transparent border-0 cursor-pointer rounded"
                          />
                          <input
                            type="text"
                            value={customForm.colorTag}
                            onChange={e => setCustomForm({ ...customForm, colorTag: e.target.value })}
                            className="flex-1 px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none text-white text-sm font-mono"
                          />
                        </div>
                      </div>

                      {/* Custom Icon url */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Custom Icon URL</label>
                        <input
                          type="text"
                          value={customForm.customIcon}
                          onChange={e => setCustomForm({ ...customForm, customIcon: e.target.value })}
                          className="w-full px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none focus:border-sky-500/30 text-white text-sm"
                          placeholder="https://example.com/icon.png"
                        />
                      </div>

                      {/* Custom Banner url */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Custom Banner Card URL</label>
                        <input
                          type="text"
                          value={customForm.customBanner}
                          onChange={e => setCustomForm({ ...customForm, customBanner: e.target.value })}
                          className="w-full px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none focus:border-sky-500/30 text-white text-sm"
                          placeholder="https://example.com/banner.png"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-6 p-4 bg-white/[0.01] border border-white/5 rounded-2xl">
                      {/* Pinned toggle */}
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customForm.isPinned}
                          onChange={e => setCustomForm({ ...customForm, isPinned: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                        />
                        <div>
                          <span className="text-xs font-semibold text-white block">Pin Favorite to Top</span>
                          <span className="text-[10px] text-slate-500">Node will always stay locked above regular lists.</span>
                        </div>
                      </label>

                      {/* Favorite toggle */}
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customForm.favorite}
                          onChange={e => setCustomForm({ ...customForm, favorite: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                        />
                        <div>
                          <span className="text-xs font-semibold text-white block">Heart Node</span>
                          <span className="text-[10px] text-slate-500">Mark node with a special quick status highlight.</span>
                        </div>
                      </label>
                    </div>

                    {/* Tag list */}
                    <div className="space-y-3">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Custom Tags</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {customForm.tags.length === 0 ? (
                          <span className="text-xs text-slate-600 italic">No tags assigned. Add some below.</span>
                        ) : (
                          customForm.tags.map(t => (
                            <span key={t} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 flex items-center gap-1.5">
                              <span>{t}</span>
                              <button
                                onClick={() => handleRemoveTag(t)}
                                className="text-slate-500 hover:text-slate-200 transition-colors"
                              >
                                &times;
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customForm.newTag}
                          onChange={e => setCustomForm({ ...customForm, newTag: e.target.value })}
                          className="px-4 py-2 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none focus:border-sky-500/30 text-white text-xs"
                          placeholder="e.g. cluster-alpha"
                          onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }}
                        />
                        <button
                          type="button"
                          onClick={handleAddTag}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-white"
                        >
                          Add Tag
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Internal Admin Notes</label>
                      <textarea
                        value={customForm.notes}
                        onChange={e => setCustomForm({ ...customForm, notes: e.target.value })}
                        className="w-full h-24 px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none text-white text-sm"
                        placeholder="Write setup schedules, cluster notes, map keys..."
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                      <button
                        onClick={handleSaveCustomization}
                        className={cn('px-6 py-2.5 rounded-xl text-sm transition-all focus:outline-none', accentBtn)}
                      >
                        Save Configuration
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-24 bg-white/[0.01] border border-white/5 rounded-3xl flex flex-col justify-center items-center">
                    <Sparkles className="w-12 h-12 text-slate-600 mb-3" />
                    <h3 className="text-sm font-semibold text-slate-400">Select a Node to Edit Customization</h3>
                    <p className="text-xs text-slate-500 max-w-xs mt-1">Configure individual server labels, custom banners, custom tag styles, and admin internal notes logs.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BULK OPERATIONS TAB */}
          {activeTab === 'bulk' && (
            <div className="space-y-6">
              <div className="glass-panel border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-200">Bulk Server Selection</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Select multiple servers and apply bulk actions securely under transactional rollback protection.</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleToggleSelectAll}
                      className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-all rounded-xl text-xs text-white"
                    >
                      {selectedServers.length === servers.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                </div>

                {/* Server checklist grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {servers.map(server => {
                    const isChecked = selectedServers.includes(server.id);
                    return (
                      <label
                        key={server.id}
                        className={cn(
                          'p-3 border rounded-xl flex items-center gap-3 cursor-pointer transition-all bg-white/[0.01]',
                          isChecked
                            ? `border-${isASE ? 'amber-500/40' : 'cyan-500/40'} bg-white/[0.02]`
                            : 'border-white/5 hover:bg-white/[0.01]'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectServer(server.id)}
                          className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <div>
                          <span className="text-xs font-semibold text-white block">
                            {snapshot?.servers.find((s: any) => s.id === server.id)?.customization?.displayName || server.name}
                          </span>
                          <span className="text-[10px] text-slate-500">Status: {server.status}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {selectedServers.length > 0 && (
                <div className="glass-panel border-white/5 rounded-2xl p-6 space-y-6">
                  <div className="border-b border-white/5 pb-4">
                    <h3 className="text-base font-bold text-slate-200">Configure Bulk Action</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Apply updates to all {selectedServers.length} selected nodes.</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'move', label: 'Move to Category Folder', icon: FolderOpen },
                      { id: 'tag', label: 'Apply Tags', icon: Tag },
                      { id: 'color', label: 'Apply Color indicator', icon: Sparkles },
                      { id: 'archive', label: 'Archive Nodes', icon: Archive }
                    ].map(act => (
                      <button
                        key={act.id}
                        onClick={() => setBulkAction(act.id as any)}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all focus:outline-none',
                          bulkAction === act.id
                            ? `bg-white/[0.04] border-${isASE ? 'amber-500' : 'cyan-500'} ${accentText}`
                            : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/[0.08]'
                        )}
                      >
                        <act.icon className="w-4 h-4" />
                        <span>{act.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Bulk configurations */}
                  {bulkAction === 'move' && (
                    <div className="space-y-1.5 max-w-sm">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Target Folder Category</label>
                      <select
                        value={bulkFolder}
                        onChange={e => setBulkFolder(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none text-white text-sm"
                      >
                        <option value={0}>-- Select target category --</option>
                        {folders.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {bulkAction === 'tag' && (
                    <div className="space-y-1.5 max-w-sm">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Custom Tags (comma separated)</label>
                      <input
                        type="text"
                        value={bulkTags}
                        onChange={e => setBulkTags(e.target.value)}
                        className="w-full px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none text-white text-sm"
                        placeholder="e.g. cluster-beta, new-season, pvp"
                      />
                    </div>
                  )}

                  {bulkAction === 'color' && (
                    <div className="space-y-1.5 max-w-sm">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Color Indicator</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={bulkColor}
                          onChange={e => setBulkColor(e.target.value)}
                          className="w-12 h-11 bg-transparent border-0 cursor-pointer rounded"
                        />
                        <input
                          type="text"
                          value={bulkColor}
                          onChange={e => setBulkColor(e.target.value)}
                          className="flex-1 px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none text-white text-sm font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {bulkAction === 'archive' && (
                    <div className="space-y-1.5 max-w-md">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Reason for Archiving</label>
                      <input
                        type="text"
                        value={bulkArchiveReason}
                        onChange={e => setBulkArchiveReason(e.target.value)}
                        className="w-full px-4 py-3 bg-[#080d16] border border-white/10 rounded-xl focus:outline-none text-white text-sm"
                        placeholder="e.g. End of PVP Season 3, merging with Cluster Beta"
                      />
                    </div>
                  )}

                  {bulkAction && (
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                      <button
                        onClick={handleExecuteBulkAction}
                        className={cn('px-6 py-2.5 rounded-xl text-sm transition-all focus:outline-none', accentBtn)}
                      >
                        Execute Operation Safely
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ARCHIVE LOGS TAB */}
          {activeTab === 'archive' && (
            <div className="space-y-6">
              {/* Active servers listing for quick archiving */}
              <div className="glass-panel border-white/5 rounded-2xl p-5">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-3">Quick Archival Manager</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {servers.map(server => (
                    <div
                      key={server.id}
                      className="p-3 border border-white/5 bg-white/[0.01] rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <span className="text-xs font-semibold text-white block">
                          {snapshot?.servers.find((s: any) => s.id === server.id)?.customization?.displayName || server.name}
                        </span>
                        <span className="text-[10px] text-slate-500">Original Node ID: {server.id}</span>
                      </div>

                      <button
                        onClick={() => handleArchiveSingleServer(server.id)}
                        className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                        title="Archive Server Node"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Archival registry */}
              <div className="glass-panel border-white/5 rounded-2xl p-6 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-200">Archived Servers Registry</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Archived servers have their auto-start sequences completely bypassed to save local memory.</p>
                </div>

                <div className="space-y-3">
                  {archived.length === 0 ? (
                    <div className="text-center py-12 bg-white/[0.01] border border-white/5 rounded-2xl">
                      <Archive className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <h4 className="text-sm font-semibold text-slate-400 text-slate-500">Archived Registry Clear</h4>
                      <p className="text-xs text-slate-600 mt-1">No server nodes are currently parked in the archives.</p>
                    </div>
                  ) : (
                    archived.map(arc => (
                      <div
                        key={arc.id}
                        className="p-4 bg-white/[0.01] border border-white/5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <span className="text-sm font-bold text-slate-200 block">
                            Server Node ID: {arc.serverId}
                          </span>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>Archived At: {arc.archivedAt}</span>
                            {arc.archiveReason && <span>Reason: {arc.archiveReason}</span>}
                            {arc.notes && <span>Notes: {arc.notes}</span>}
                          </div>
                        </div>

                        <button
                          onClick={() => handleRestoreSingleServer(arc.serverId)}
                          className={cn('px-4 py-2 rounded-xl text-xs font-semibold focus:outline-none flex items-center gap-1.5', accentBtn)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore Node</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LAYOUTS & STATS TAB */}
          {activeTab === 'layouts' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Statistics Summary */}
              <div className="lg:col-span-2 space-y-6">
                <div className="glass-panel border-white/5 rounded-2xl p-6">
                  <h3 className="text-base font-bold text-slate-200 mb-4">Dashboard Analytics Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white/[0.01] border border-white/5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Total Servers</span>
                      <span className="text-2xl font-bold text-white block mt-1">{snapshot?.statistics?.totalServers || servers.length}</span>
                    </div>

                    <div className="p-4 bg-white/[0.01] border border-white/5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Active Nodes</span>
                      <span className="text-2xl font-bold text-emerald-400 block mt-1">{snapshot?.statistics?.activeServers || servers.length}</span>
                    </div>

                    <div className="p-4 bg-white/[0.01] border border-white/5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Archived Nodes</span>
                      <span className="text-2xl font-bold text-rose-400 block mt-1">{snapshot?.statistics?.archivedServers || archived.length}</span>
                    </div>

                    <div className="p-4 bg-white/[0.01] border border-white/5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Active Uptime</span>
                      <span className="text-2xl font-bold text-sky-400 block mt-1">{snapshot?.statistics?.totalUptimeHours || 0} hrs</span>
                    </div>
                  </div>
                </div>

                <div className="glass-panel border-white/5 rounded-2xl p-6 space-y-4">
                  <h3 className="text-base font-bold text-slate-200">Active Map Distribution</h3>
                  <div className="space-y-2">
                    {Object.entries(snapshot?.statistics?.serverCountByMap || {}).map(([map, count]) => (
                      <div key={map} className="flex items-center justify-between p-2.5 bg-white/[0.01] border border-white/5 rounded-xl">
                        <span className="text-xs font-semibold text-slate-300">{String(map)}</span>
                        <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 text-xs font-bold rounded-lg">{String(count)} nodes</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Layout Config */}
              <div className="glass-panel border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <LayoutGrid className={cn('w-4 h-4', accentText)} />
                  <span>Dashboard Custom layouts</span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Select and save custom views for the main dashboard display cards.
                </p>

                <div className="space-y-2">
                  {[
                    { id: 'grid', label: 'Grid Matrix', desc: 'Detailed cards in modern grids.' },
                    { id: 'list', label: 'Classic List', desc: 'Chronological rows with action keys.' },
                    { id: 'compact', label: 'Compact Grid', desc: 'Minimized row widgets without banners.' }
                  ].map(lay => (
                    <div
                      key={lay.id}
                      className="p-3 border border-white/5 bg-white/[0.01] rounded-xl flex items-center justify-between hover:bg-white/[0.02] cursor-pointer"
                    >
                      <div>
                        <span className="text-xs font-semibold text-white block">{lay.label}</span>
                        <span className="text-[10px] text-slate-500">{lay.desc}</span>
                      </div>
                      <div className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center">
                        {lay.id === 'grid' && <div className={cn('w-2 h-2 rounded-full', accentProgress)} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE/EDIT FOLDER MODAL */}
      <AnimatePresence>
        {showFolderModal && (
          <div className="fixed inset-0 bg-[#020610]/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[#090f1d] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h4 className="text-base font-bold text-white">
                  {editingFolder ? 'Edit Folder category' : 'Create Folder category'}
                </h4>
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="text-slate-500 hover:text-white text-lg focus:outline-none"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveFolder} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Category Name</label>
                  <input
                    type="text"
                    required
                    value={folderForm.name}
                    onChange={e => setFolderForm({ ...folderForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-[#050912] border border-white/15 rounded-xl focus:outline-none focus:border-sky-500/30 text-white text-sm"
                    placeholder="e.g. Cluster Alpha PVP"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Description</label>
                  <input
                    type="text"
                    value={folderForm.description}
                    onChange={e => setFolderForm({ ...folderForm, description: e.target.value })}
                    className="w-full px-4 py-3 bg-[#050912] border border-white/15 rounded-xl focus:outline-none focus:border-sky-500/30 text-white text-sm"
                    placeholder="e.g. Primary cluster containing Crystal Isles"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Category Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={folderForm.color}
                      onChange={e => setFolderForm({ ...folderForm, color: e.target.value })}
                      className="w-12 h-11 bg-transparent border-0 cursor-pointer rounded"
                    />
                    <input
                      type="text"
                      value={folderForm.color}
                      onChange={e => setFolderForm({ ...folderForm, color: e.target.value })}
                      className="flex-1 px-4 py-3 bg-[#050912] border border-white/15 rounded-xl focus:outline-none text-white text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowFolderModal(false)}
                    className="px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={cn('px-5 py-2.5 rounded-xl text-sm transition-all focus:outline-none', accentBtn)}
                  >
                    Save Category
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showDeleteFolderModal && (
          <div className="fixed inset-0 bg-[#020610]/80 backdrop-blur-md z-[999] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[#090f1d]/90 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] p-6 space-y-6"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20 text-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white tracking-wide">Delete Category</h4>
                  <p className="text-xs text-slate-400 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed bg-[#050912]/50 p-4 border border-white/5 rounded-xl">
                Are you sure you want to delete this folder category? All servers currently assigned inside will be safely moved to the unassigned list. This will not delete any actual server files or configurations.
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteFolderModal(false);
                    setFolderToDelete(null);
                  }}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/5 rounded-xl text-sm font-semibold text-slate-300 transition-all focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteFolder}
                  className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 active:scale-[0.98] text-white font-bold rounded-xl text-sm transition-all shadow-[0_0_20px_rgba(239,68,68,0.15)] focus:outline-none"
                >
                  Delete Category
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showArchiveModal && (
          <div className="fixed inset-0 bg-[#020610]/80 backdrop-blur-md z-[999] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[#090f1d]/90 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] p-6 space-y-5"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/20 text-sky-400 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                  <Archive className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white tracking-wide">Archive Server Node</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Optimize active system capacity.</p>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed bg-[#050912]/50 p-4 border border-white/5 rounded-xl">
                Bypasses sequential startup routines for inactive periods. Please specify a reason for archiving below.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Reason (Optional)</label>
                <input
                  type="text"
                  value={archiveReasonInput}
                  onChange={e => setArchiveReasonInput(e.target.value)}
                  className="w-full px-4 py-3 bg-[#050912] border border-white/10 rounded-xl focus:outline-none focus:border-sky-500/30 text-white text-sm focus:ring-1 focus:ring-sky-500/20 placeholder-slate-600 transition-all"
                  placeholder="e.g. Inactive season, offline maintenance"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setShowArchiveModal(false);
                    setServerToArchive(null);
                    setArchiveReasonInput('');
                  }}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/5 rounded-xl text-sm font-semibold text-slate-300 transition-all focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmArchiveServer}
                  className={cn('px-5 py-2.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-all focus:outline-none shadow-[0_0_20px_rgba(6,182,212,0.1)]', accentBtn)}
                >
                  Archive Node
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
