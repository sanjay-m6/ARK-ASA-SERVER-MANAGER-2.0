import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen, Server, Loader2, CheckCircle, AlertCircle, Eye, Wifi, Shield, Package, Terminal, Settings, AlertTriangle, Layers, MapPin } from 'lucide-react';
import { useAseServerStore } from '../../stores/aseServerStore';
import { importAseServer, previewImportSettings, selectFolder } from '../../../utils/tauri';
import type { ImportPreview } from '../../../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ASE_MAPS } from '../../data/aseMaps';

interface Props {
    onClose: () => void;
}

export default function ASEImportServerDialog({ onClose }: Props) {
    const { t } = useTranslation();
    const { servers, addServer } = useAseServerStore();
    const [installPath, setInstallPath] = useState('');
    const [serverName, setServerName] = useState(t('dialogs.importServer.namePlaceholder', 'My ASE Server'));
    const [isImporting, setIsImporting] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<ImportPreview | null>(null);

    // Tab state
    const [activeTab, setActiveTab] = useState<'overview' | 'diagnostics' | 'raw'>('overview');
    const [rawSubTab, setRawSubTab] = useState<'gus' | 'game' | 'command'>('gus');

    // Editable configurations state
    const [editableMapName, setEditableMapName] = useState('');
    const [editableSessionName, setEditableSessionName] = useState('');
    const [editableMaxPlayers, setEditableMaxPlayers] = useState(70);
    const [editableGamePort, setEditableGamePort] = useState(7777);
    const [editableQueryPort, setEditableQueryPort] = useState(27015);
    const [editableRconPort, setEditableRconPort] = useState(27020);
    const [editableRconEnabled, setEditableRconEnabled] = useState(true);
    const [editableAdminPassword, setEditableAdminPassword] = useState('');
    const [editableServerPassword, setEditableServerPassword] = useState('');
    const [editableClusterId, setEditableClusterId] = useState('');
    const [editableActiveMods, setEditableActiveMods] = useState('');

    const handlePreview = useCallback(async (targetPath: string) => {
        if (!targetPath || !targetPath.trim()) return;

        setIsPreviewing(true);
        setError(null);
        try {
            const result = await previewImportSettings(targetPath, 'ASE');
            setPreview(result);

            // Populate all editable fields
            setEditableMapName(result.mapName);
            setEditableSessionName(result.sessionName || 'My ASE Server');
            setEditableMaxPlayers(result.maxPlayers || 70);
            setEditableGamePort(result.gamePort || 7777);
            setEditableQueryPort(result.queryPort || 27015);
            setEditableRconPort(result.rconPort || 27020);
            setEditableRconEnabled(result.rconEnabled !== false);
            setEditableAdminPassword(result.adminPassword || '');
            setEditableServerPassword(result.serverPassword || '');
            setEditableClusterId(result.clusterId || '');
            setEditableActiveMods(result.activeMods || '');

            if (result.sessionName && result.sessionName.trim()) {
                setServerName(result.sessionName);
            }
        } catch (err) {
            console.error('Failed to preview settings:', err);
            setError(t('dialogs.importServer.previewError', 'Failed to inspect folder structure. Please verify the path.'));
            setPreview(null);
        } finally {
            setIsPreviewing(false);
        }
    }, [t]);

    useEffect(() => {
        if (!installPath || !installPath.trim()) {
            setPreview(null);
            return;
        }

        const timer = setTimeout(() => {
            handlePreview(installPath);
        }, 500);

        return () => clearTimeout(timer);
    }, [installPath, handlePreview]);

    const handleSelectFolder = async () => {
        try {
            const folder = await selectFolder(t('dialogs.importServer.selectFolder', 'Select ASE Server Folder'));
            if (folder) {
                setInstallPath(folder);
                setError(null);
                setPreview(null);
                const folderName = folder.split('\\').pop() || folder.split('/').pop();
                if (folderName) {
                    setServerName(folderName);
                    setEditableSessionName(folderName);
                }
            }
        } catch (err) {
            console.error('Failed to select folder:', err);
        }
    };

    const handleImport = async () => {
        if (!installPath || !serverName) {
            setError(t('dialogs.importServer.error', 'Please fill in all required fields.'));
            return;
        }

        setIsImporting(true);
        setError(null);

        // Gather all manual UI overrides to send to database, merging with the original preview to prevent missing field errors on the backend
        const overrides: ImportPreview = {
            mapName: editableMapName,
            sessionName: editableSessionName,
            maxPlayers: Number(editableMaxPlayers),
            gamePort: Number(editableGamePort),
            queryPort: Number(editableQueryPort),
            rconPort: Number(editableRconPort),
            rconEnabled: editableRconEnabled,
            adminPassword: editableAdminPassword,
            serverPassword: editableServerPassword,
            ipAddress: preview?.ipAddress ?? null,
            activeMods: editableActiveMods,
            customArgs: preview?.customArgs ?? '',
            clusterId: editableClusterId,
            warnings: preview?.warnings ?? [],
            detectedCommand: preview?.detectedCommand ?? null,
            sourceFiles: preview?.sourceFiles ?? {},
            confidenceLevels: preview?.confidenceLevels ?? {},
            rawIniGus: preview?.rawIniGus ?? null,
            rawIniGame: preview?.rawIniGame ?? null,
            importedValues: preview?.importedValues ?? {},
            missingSettings: preview?.missingSettings ?? [],
            playerCount: preview?.playerCount ?? 0,
            tribeCount: preview?.tribeCount ?? 0,
            saveFileSize: preview?.saveFileSize ?? 0,
            saveLastModified: preview?.saveLastModified ?? null,
        };

        try {
            const aseServer = await importAseServer(installPath, serverName, overrides);
            addServer(aseServer);
            toast.success(t('dialogs.importServer.success', 'Server imported successfully!'));
            onClose();
        } catch (err) {
            setError(String(err));
            toast.error(t('dialogs.importServer.error', 'Import failed.'));
        } finally {
            setIsImporting(false);
        }
    };

    // Diagnostics logic - Live Port Availability Checks
    const gamePortConflict = servers.some(s => s.port === Number(editableGamePort));
    const queryPortConflict = servers.some(s => s.queryPort === Number(editableQueryPort));
    const rconPortConflict = servers.some(s => s.rconPort === Number(editableRconPort));
    const hasAnyConflict = gamePortConflict || queryPortConflict || rconPortConflict;

    // Phase 3: Auto-Port Negotiator (One-Click Resolver)
    const handleAutoResolvePorts = () => {
        let proposedGamePort = Number(editableGamePort);
        let proposedQueryPort = Number(editableQueryPort);
        let proposedRconPort = Number(editableRconPort);

        while (servers.some(s => s.port === proposedGamePort)) {
            proposedGamePort += 2;
        }
        while (servers.some(s => s.queryPort === proposedQueryPort)) {
            proposedQueryPort += 2;
        }
        while (servers.some(s => s.rconPort === proposedRconPort)) {
            proposedRconPort += 1;
        }

        setEditableGamePort(proposedGamePort);
        setEditableQueryPort(proposedQueryPort);
        setEditableRconPort(proposedRconPort);
        toast.success(t('dialogs.importServer.portsResolved', 'Port conflicts successfully resolved!'));
    };

    // Cluster scan diagnostics logic
    const sameClusterServers = servers.filter(s => s.clusterId && s.clusterId === editableClusterId);

    const renderConfidenceBadge = (fieldName: string) => {
        if (!preview) return null;
        const confidence = preview.confidenceLevels?.[fieldName] || '';
        const source = preview.sourceFiles?.[fieldName] || '';

        let badgeBg = 'bg-slate-800 border-slate-700/50 text-slate-300';
        if (confidence.toLowerCase().includes('high')) {
            if (confidence.toLowerCase().includes('script')) {
                badgeBg = 'bg-amber-500/10 border-amber-500/30 text-amber-300';
            } else {
                badgeBg = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
            }
        } else if (confidence.toLowerCase().includes('low') || confidence.toLowerCase().includes('fallback')) {
            badgeBg = 'bg-rose-500/10 border-rose-500/30 text-rose-300';
        }

        return (
            <div className="flex flex-wrap justify-end items-center gap-1 mt-0.5">
                {source && (
                    <span className="whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-900 border border-slate-800/80 text-slate-400">
                        {source}
                    </span>
                )}
                {confidence && (
                    <span className={`whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeBg}`}>
                        {confidence}
                    </span>
                )}
            </div>
        );
    };

    return createPortal(
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4"
            onClick={(e) => e.target === e.currentTarget && !isImporting && onClose()}
        >
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
                
                {/* Header */}
                <div className="relative p-6 border-b border-slate-700/50 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                            <FolderOpen className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{t('dialogs.importServer.title', 'Import Existing Server')}</h2>
                            <p className="text-sm text-slate-400">{t('dialogs.importServer.aseSubtitle', 'Import an existing ARK: Survival Evolved server')}</p>
                        </div>
                    </div>
                    {!isImporting && (
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-xl transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    )}
                </div>

                {/* Main Tabs Navigation */}
                {preview && !isPreviewing && (
                    <div className="px-6 bg-slate-900/50 border-b border-slate-800/80 flex gap-2">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
                                activeTab === 'overview'
                                    ? 'border-amber-500 text-amber-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Settings className="w-4 h-4" />
                            Interactive Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('diagnostics')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 relative ${
                                activeTab === 'diagnostics'
                                    ? 'border-amber-500 text-amber-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <AlertTriangle className="w-4 h-4" />
                            Pre-Import Diagnostics
                            {hasAnyConflict && (
                                <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-2.5 right-1.5 animate-pulse" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('raw')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
                                activeTab === 'raw'
                                    ? 'border-amber-500 text-amber-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Terminal className="w-4 h-4" />
                            Raw Config Inspector
                        </button>
                    </div>
                )}

                {/* Content Workspace */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    
                    {/* Select Installation Path - Top Sticky Block */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
                        <div className="md:col-span-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                                <FolderOpen className="w-3.5 h-3.5" />
                                {t('dialogs.importServer.folderLabel', 'Server Installation Folder')}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={installPath}
                                    onChange={(e) => setInstallPath(e.target.value)}
                                    placeholder={t('dialogs.importServer.folderPlaceholder', 'Select the server installation folder...')}
                                    className="flex-1 px-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                    disabled={isImporting}
                                />
                                <button
                                    onClick={handleSelectFolder}
                                    disabled={isImporting}
                                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700/30 rounded-xl transition-colors"
                                >
                                    <FolderOpen className="w-4 h-4 text-white" />
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                                <Server className="w-3.5 h-3.5" />
                                {t('dialogs.importServer.nameLabel', 'Server Profile Name')}
                            </label>
                            <input
                                type="text"
                                value={serverName}
                                onChange={(e) => setServerName(e.target.value)}
                                placeholder={t('dialogs.importServer.namePlaceholder', 'My ASE Server')}
                                className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm"
                                disabled={isImporting}
                            />
                        </div>
                    </div>

                    {isPreviewing && (
                        <div className="flex items-center justify-center gap-3 p-8 bg-slate-900/30 border border-slate-800 rounded-xl">
                            <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                            <span className="text-sm text-slate-300 font-medium">Inspecting ARK directory, resolving script variables, and parsing configs...</span>
                        </div>
                    )}

                    {!preview && !isPreviewing && !installPath && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                            <FolderOpen className="w-12 h-12 mb-3 stroke-[1.25] text-slate-600" />
                            <p className="text-sm">{t('dialogs.importServer.aseSubtitle', 'Select an existing ARK: Survival Evolved server directory to begin.')}</p>
                        </div>
                    )}

                    {preview && !isPreviewing && (
                        <>
                            {/* TAB 1: OVERVIEW & EDITABLE SIDE-BY-SIDE CONFIG */}
                            {activeTab === 'overview' && (
                                <div className="space-y-6 animate-fadeIn">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                                        <Eye className="w-4 h-4 text-amber-400" />
                                        Interactive Configuration Overrides
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                        {/* General settings block */}
                                        <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-xl space-y-4">
                                            <h3 className="text-xs font-bold text-amber-400/80 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                                                <Layers className="w-3.5 h-3.5" />
                                                General Identity
                                            </h3>

                                            <div>
                                                <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                    <label className="text-xs font-medium text-slate-300">Map Name</label>
                                                    {renderConfidenceBadge('mapName')}
                                                </div>
                                                <input
                                                    type="text"
                                                    list="ase-maps"
                                                    value={editableMapName}
                                                    onChange={(e) => setEditableMapName(e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg text-white font-mono text-sm focus:ring-1 focus:ring-amber-500/50"
                                                />
                                                <datalist id="ase-maps">
                                                    {ASE_MAPS.map(map => (
                                                        <option key={map.serverArg} value={map.serverArg}>{map.name}</option>
                                                    ))}
                                                </datalist>
                                                <div className="mt-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-1.5 text-[11px] text-amber-300">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                                                    <span>
                                                        Map name may not sync perfectly from imports. Please verify the detected map and select/type the correct name manually if needed.
                                                    </span>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                    <label className="text-xs font-medium text-slate-300">In-Game Server Session Name</label>
                                                    {renderConfidenceBadge('sessionName')}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={editableSessionName}
                                                    onChange={(e) => setEditableSessionName(e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg text-white text-sm focus:ring-1 focus:ring-amber-500/50"
                                                />
                                            </div>

                                            <div>
                                                <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                    <label className="text-xs font-medium text-slate-300">Max Player Limit</label>
                                                    {renderConfidenceBadge('maxPlayers')}
                                                </div>
                                                <input
                                                    type="number"
                                                    value={editableMaxPlayers}
                                                    onChange={(e) => setEditableMaxPlayers(Number(e.target.value))}
                                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg text-white text-sm focus:ring-1 focus:ring-amber-500/50 font-mono"
                                                />
                                            </div>
                                        </div>

                                        {/* Networking block */}
                                        <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-xl space-y-4">
                                            <h3 className="text-xs font-bold text-amber-400/80 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                                                <Wifi className="w-3.5 h-3.5" />
                                                Connection & Networking
                                            </h3>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                        <label className="text-xs font-medium text-slate-300">Game Port</label>
                                                        {renderConfidenceBadge('gamePort')}
                                                    </div>
                                                    <input
                                                        type="number"
                                                        value={editableGamePort}
                                                        onChange={(e) => setEditableGamePort(Number(e.target.value))}
                                                        className={`w-full px-3 py-2 bg-slate-950/40 border rounded-lg text-white font-mono text-sm focus:ring-1 focus:ring-amber-500/50 ${
                                                            gamePortConflict ? 'border-rose-500/50 text-rose-300' : 'border-slate-800'
                                                        }`}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                        <label className="text-xs font-medium text-slate-300">Query Port</label>
                                                        {renderConfidenceBadge('queryPort')}
                                                    </div>
                                                    <input
                                                        type="number"
                                                        value={editableQueryPort}
                                                        onChange={(e) => setEditableQueryPort(Number(e.target.value))}
                                                        className={`w-full px-3 py-2 bg-slate-950/40 border rounded-lg text-white font-mono text-sm focus:ring-1 focus:ring-amber-500/50 ${
                                                            queryPortConflict ? 'border-rose-500/50 text-rose-300' : 'border-slate-800'
                                                        }`}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                    <label className="text-xs font-medium text-slate-300">RCON Console Port</label>
                                                    {renderConfidenceBadge('rconPort')}
                                                </div>
                                                <input
                                                    type="number"
                                                    value={editableRconPort}
                                                    onChange={(e) => setEditableRconPort(Number(e.target.value))}
                                                    className={`w-full px-3 py-2 bg-slate-950/40 border rounded-lg text-white font-mono text-sm focus:ring-1 focus:ring-amber-500/50 ${
                                                        rconPortConflict ? 'border-rose-500/50 text-rose-300' : 'border-slate-800'
                                                    }`}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between pt-1">
                                                <div>
                                                    <label className="text-xs font-medium text-slate-300 block">Enable RCON console</label>
                                                    <span className="text-[10px] text-slate-500">Allows remote administrator controls</span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={editableRconEnabled}
                                                    onChange={(e) => setEditableRconEnabled(e.target.checked)}
                                                    className="w-4 h-4 rounded text-amber-500 bg-slate-950/40 border-slate-800 focus:ring-amber-500/40 focus:ring-offset-slate-900"
                                                />
                                            </div>
                                        </div>

                                        {/* Passwords & Security */}
                                        <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-xl space-y-4">
                                            <h3 className="text-xs font-bold text-amber-400/80 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                                                <Shield className="w-3.5 h-3.5" />
                                                Passwords & Security
                                            </h3>

                                            <div>
                                                <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                    <label className="text-xs font-medium text-slate-300">Admin Console Password</label>
                                                    {renderConfidenceBadge('adminPassword')}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={editableAdminPassword}
                                                    onChange={(e) => setEditableAdminPassword(e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg text-white text-sm focus:ring-1 focus:ring-amber-500/50 font-mono"
                                                    placeholder="Set admin password..."
                                                />
                                            </div>

                                            <div>
                                                <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                    <label className="text-xs font-medium text-slate-300">Server Password (Join key)</label>
                                                    {renderConfidenceBadge('serverPassword')}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={editableServerPassword}
                                                    onChange={(e) => setEditableServerPassword(e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg text-white text-sm focus:ring-1 focus:ring-amber-500/50 font-mono"
                                                    placeholder="Optional private server join password..."
                                                />
                                            </div>
                                        </div>

                                        {/* Modding & Cluster */}
                                        <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-xl space-y-4">
                                            <h3 className="text-xs font-bold text-amber-400/80 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                                                <Package className="w-3.5 h-3.5" />
                                                Mods & Clustering
                                            </h3>

                                            <div>
                                                <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                    <label className="text-xs font-medium text-slate-300">Cluster ID</label>
                                                    {renderConfidenceBadge('clusterId')}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={editableClusterId}
                                                    onChange={(e) => setEditableClusterId(e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg text-white text-sm focus:ring-1 focus:ring-amber-500/50 font-mono"
                                                    placeholder="Optional Cluster ID string..."
                                                />
                                            </div>

                                            <div>
                                                <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 mb-1">
                                                    <label className="text-xs font-medium text-slate-300">Active Mod IDs (Comma-separated)</label>
                                                    {renderConfidenceBadge('activeMods')}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={editableActiveMods}
                                                    onChange={(e) => setEditableActiveMods(e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg text-white text-sm focus:ring-1 focus:ring-amber-500/50 font-mono"
                                                    placeholder="e.g. 7316447, 8432322..."
                                                />
                                            </div>
                                        </div>

                                        {/* Phase 3: World Save Directory State Card */}
                                        {preview.saveFileSize > 0 && (
                                            <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-xl space-y-4 col-span-1 md:col-span-2">
                                                <h3 className="text-xs font-bold text-amber-400/80 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                                                    <Layers className="w-3.5 h-3.5" />
                                                    World Save Directory State (ASE)
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                                                    <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-900 flex flex-col justify-center">
                                                        <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-1">Total Active Players</span>
                                                        <span className="text-sm font-bold text-slate-100 font-mono">{preview.playerCount} profiles</span>
                                                    </div>
                                                    <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-900 flex flex-col justify-center">
                                                        <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-1">Active Tribes</span>
                                                        <span className="text-sm font-bold text-slate-100 font-mono">{preview.tribeCount} tribes</span>
                                                    </div>
                                                    <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-900 flex flex-col justify-center col-span-1 sm:col-span-2 md:col-span-1">
                                                        <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-1">Map Save File Size</span>
                                                        <span className="text-sm font-bold text-slate-100 font-mono">
                                                            {(preview.saveFileSize / (1024 * 1024)).toFixed(2)} MB
                                                        </span>
                                                    </div>
                                                    {preview.saveLastModified && (
                                                        <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-900 col-span-1 sm:col-span-2 md:col-span-3 flex justify-between items-center">
                                                            <span className="text-slate-500 text-[10px] uppercase font-semibold">World Last Save Execution</span>
                                                            <span className="text-xs text-slate-300 font-mono font-medium">
                                                                {new Date(preview.saveLastModified).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Warnings */}
                                    {preview.warnings.length > 0 && (
                                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl space-y-1.5">
                                            <div className="text-xs font-semibold text-yellow-400 flex items-center gap-1 mb-1">
                                                <AlertTriangle className="w-4 h-4" />
                                                Warning Notifications
                                            </div>
                                            {preview.warnings.map((w, i) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-yellow-300/80">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                                                    <span>{w}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 2: DIAGNOSTICS & LIVE PORT VALIDATION */}
                            {activeTab === 'diagnostics' && (
                                <div className="space-y-6 animate-fadeIn">
                                    <div className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            Pre-Import Diagnostics Suite
                                        </div>
                                    </div>

                                    {/* Conflict warnings with Auto-Port Negotiator button */}
                                    {hasAnyConflict ? (
                                        <div className="p-5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-4">
                                            <div className="flex items-center gap-2 text-sm font-bold text-rose-400">
                                                <AlertTriangle className="w-5 h-5" />
                                                Critical Port Conflict Detected!
                                            </div>
                                            <p className="text-xs text-rose-300/90 leading-relaxed">
                                                One or more of the detected/edited networking ports are currently assigned to another server profile in the ARK manager. Starting both servers concurrently will cause collision crashes.
                                            </p>
                                            <div className="space-y-1.5 bg-slate-950/30 p-3 rounded-lg border border-slate-900/30">
                                                {gamePortConflict && (
                                                    <div className="text-xs text-rose-300 flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                        <span>Game Port <b>{editableGamePort}</b> is currently used by another profile.</span>
                                                    </div>
                                                )}
                                                {queryPortConflict && (
                                                    <div className="text-xs text-rose-300 flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                        <span>Query Port <b>{editableQueryPort}</b> is currently used by another profile.</span>
                                                    </div>
                                                )}
                                                {rconPortConflict && (
                                                    <div className="text-xs text-rose-300 flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                        <span>RCON Console Port <b>{editableRconPort}</b> is currently used by another profile.</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    onClick={handleAutoResolvePorts}
                                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow transition-all flex items-center gap-1.5 hover:shadow-lg hover:shadow-rose-600/10 active:scale-95"
                                                >
                                                    <Wifi className="w-3.5 h-3.5" />
                                                    Auto-Resolve Port Conflicts
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
                                            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <div className="text-sm font-bold text-emerald-400">All Ports Clear & Available</div>
                                                <p className="text-xs text-emerald-300/80 mt-1">
                                                    No port binding collisions detected with any registered servers. The server can safely run on these ports.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Phase 3: Cluster visual topology detector card */}
                                    {editableClusterId && (
                                        <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-5 space-y-3">
                                            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider pb-2 border-b border-slate-800 flex items-center gap-1.5">
                                                <Server className="w-3.5 h-3.5 text-amber-400" />
                                                Cluster Connection Diagnostics (ASE)
                                            </h3>
                                            {sameClusterServers.length > 0 ? (
                                                <div className="space-y-2">
                                                    <p className="text-xs text-slate-400">
                                                        This server will successfully link with the following active cluster profiles sharing the Cluster ID <b className="text-amber-400 font-mono">'{editableClusterId}'</b>:
                                                    </p>
                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        {sameClusterServers.map(s => (
                                                            <span key={s.id} className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                                                                <MapPin className="w-3 h-3 text-amber-400" />
                                                                {s.name} ({s.mapName})
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    No other registered servers are currently assigned to Cluster ID <b className="text-slate-400 font-mono">'{editableClusterId}'</b>. This server will act as the cluster origin mapping node.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Import Validation Summary Checklist */}
                                    {(() => {
                                        const importedKeys = Object.keys(preview.importedValues || {}).map(k => k.toLowerCase());
                                        const categories = [
                                            {
                                                name: 'General Configuration',
                                                keys: ['sessionname', 'maxplayers', 'serverpassword', 'serveradminpassword'],
                                                icon: Server
                                            },
                                            {
                                                name: 'Breeding & Maturation',
                                                keys: ['egghatchspeedmultiplier', 'babymaturespeedmultiplier', 'babycuddleintervalmultiplier', 'babyimprintamountmultiplier', 'matingintervalmultiplier'],
                                                icon: Layers
                                            },
                                            {
                                                name: 'XP & Leveling Multipliers',
                                                keys: ['xpmultiplier', 'killxpmultiplier', 'harvestxpmultiplier', 'craftxpmultiplier'],
                                                icon: Package
                                            },
                                            {
                                                name: 'Environment & Spoiling',
                                                keys: ['daycyclespeedscale', 'spoilingtimemultiplier', 'cropgrowthespeedmultiplier', 'layeggintervalmultiplier'],
                                                icon: MapPin
                                            },
                                            {
                                                name: 'Engram & Crafting Overrides',
                                                keys: ['overridenamedengramentries', 'configoverrideitemcraftingcosts'],
                                                icon: Terminal
                                            }
                                        ];

                                        return (
                                            <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-5 space-y-4 animate-fadeIn">
                                                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider pb-2 border-b border-slate-800">
                                                    Import Validation Checklist
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                    {categories.map((cat) => {
                                                        const matchedCount = cat.keys.filter(k => importedKeys.includes(k)).length;
                                                        const Icon = cat.icon;
                                                        const hasAny = matchedCount > 0;
                                                        return (
                                                            <div key={cat.name} className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                                                                hasAny
                                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                                                    : 'bg-slate-950/40 border-slate-800/80 text-slate-500'
                                                            }`}>
                                                                <div className={`p-2 rounded-lg ${hasAny ? 'bg-emerald-500/20' : 'bg-slate-900'}`}>
                                                                    <Icon className="w-4 h-4" />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <span className={`text-xs font-semibold block truncate ${hasAny ? 'text-slate-200' : 'text-slate-500'}`}>
                                                                        {cat.name}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-450">
                                                                        {hasAny ? `✓ ${matchedCount} settings found` : 'Not configured'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Missing Settings Warning Panel */}
                                    {preview.missingSettings && preview.missingSettings.length > 0 && (
                                        <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3 animate-fadeIn">
                                            <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
                                                <AlertTriangle className="w-4.5 h-4.5" />
                                                Missing Configurations Report (Falling Back to Defaults)
                                            </div>
                                            <p className="text-xs text-slate-400 leading-relaxed">
                                                The following settings were not detected in the imported configuration files. The server will initialize these parameters using standard game defaults:
                                            </p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[150px] overflow-y-auto pr-2 scrollbar-thin">
                                                {preview.missingSettings.map((key) => (
                                                    <div key={key} className="px-2.5 py-1.5 rounded-lg bg-slate-950/45 border border-slate-900/60 text-[11px] text-slate-350 font-mono flex items-center justify-between">
                                                        <span className="truncate pr-1">{key}</span>
                                                        <span className="text-[9px] text-slate-500 font-sans uppercase font-bold shrink-0">default</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Source vs Value Comparison Table */}
                                    {preview.importedValues && Object.keys(preview.importedValues).length > 0 && (
                                        <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-5 space-y-3 animate-fadeIn">
                                            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider pb-2 border-b border-slate-800 flex items-center justify-between">
                                                <span>Source vs Value Mapping</span>
                                                <span className="text-[10px] text-slate-400 normal-case font-normal">
                                                    Showing {Object.keys(preview.importedValues).length} imported parameters
                                                </span>
                                            </h3>
                                            <div className="border border-slate-800 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto scrollbar-thin">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-semibold sticky top-0 backdrop-blur-md">
                                                            <th className="py-2.5 px-4">Parameter Key</th>
                                                            <th className="py-2.5 px-4">Imported Value</th>
                                                            <th className="py-2.5 px-4">Origin File</th>
                                                            <th className="py-2.5 px-4 text-right">Confidence</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/40 text-slate-300 font-mono">
                                                        {Object.entries(preview.importedValues).map(([key, val]) => {
                                                            const source = preview.sourceFiles?.[key] || 'Unknown';
                                                            const confidence = preview.confidenceLevels?.[key] || 'Medium';
                                                            
                                                            let confidenceBadgeBg = 'bg-slate-800 text-slate-350 border-slate-700/50';
                                                            if (confidence.toLowerCase().includes('high')) {
                                                                confidenceBadgeBg = confidence.toLowerCase().includes('script')
                                                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                                                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
                                                            } else if (confidence.toLowerCase().includes('low') || confidence.toLowerCase().includes('fallback')) {
                                                                confidenceBadgeBg = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
                                                            }

                                                            return (
                                                                <tr key={key} className="hover:bg-slate-800/25 transition-colors">
                                                                    <td className="py-2 px-4 text-slate-200 font-semibold text-[11px] truncate max-w-[180px]">{key}</td>
                                                                    <td className="py-2 px-4 text-[11px] truncate max-w-[200px]" title={val}>{val || <em className="text-slate-500 font-sans">empty</em>}</td>
                                                                    <td className="py-2 px-4 text-[11px] text-slate-450 truncate max-w-[150px]">{source}</td>
                                                                    <td className="py-2 px-4 text-right">
                                                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-sans border ${confidenceBadgeBg}`}>
                                                                            {confidence}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Directory structure & file diagnostics */}
                                    <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-5 space-y-4">
                                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider pb-2 border-b border-slate-800">
                                            Path & Binary Validation Checks
                                        </h3>

                                        <div className="space-y-3.5">
                                            {/* GUS.ini Check */}
                                            <div className="flex items-start gap-3 text-xs">
                                                {preview.rawIniGus ? (
                                                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                ) : (
                                                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                                                )}
                                                <div>
                                                    <div className="font-semibold text-slate-200">GameUserSettings.ini Check</div>
                                                    <div className="text-slate-400 mt-0.5">
                                                        {preview.rawIniGus 
                                                            ? `File detected successfully (${(preview.rawIniGus.length / 1024).toFixed(1)} KB)` 
                                                            : 'GameUserSettings.ini is missing! Default values will be generated.'
                                                        }
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Game.ini Check */}
                                            <div className="flex items-start gap-3 text-xs">
                                                {preview.rawIniGame ? (
                                                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                ) : (
                                                    <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                                                )}
                                                <div>
                                                    <div className="font-semibold text-slate-200">Game.ini Custom Gameplay Multipliers</div>
                                                    <div className="text-slate-400 mt-0.5">
                                                        {preview.rawIniGame 
                                                            ? `Game.ini detected and will be imported (${(preview.rawIniGame.length / 1024).toFixed(1)} KB)` 
                                                            : 'No Game.ini custom multipliers detected. Default rates will apply.'
                                                        }
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Startup Script Check */}
                                            <div className="flex items-start gap-3 text-xs">
                                                {preview.detectedCommand ? (
                                                    <CheckCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                                ) : (
                                                    <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                                                )}
                                                <div>
                                                    <div className="font-semibold text-slate-200">Dedicated Server Launch Script Check</div>
                                                    <div className="text-slate-400 mt-0.5">
                                                        {preview.detectedCommand 
                                                            ? 'Startup script resolved successfully. Variables and launch command mapped.' 
                                                            : 'No startup launch script (.bat, .ps1, or .sh) found in directories.'
                                                        }
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: RAW CONFIG INSPECTOR */}
                            {activeTab === 'raw' && (
                                <div className="space-y-4 animate-fadeIn flex flex-col h-[45vh]">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 flex-shrink-0">
                                        <Terminal className="w-4 h-4 text-amber-500" />
                                        Configuration Inspector Console
                                    </div>

                                    {/* Raw Sub-Navigation */}
                                    <div className="flex gap-2 p-1 bg-slate-950/60 border border-slate-800/80 rounded-xl flex-shrink-0 w-max text-xs">
                                        <button
                                            onClick={() => setRawSubTab('gus')}
                                            className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                                                rawSubTab === 'gus' 
                                                    ? 'bg-slate-800 text-white shadow' 
                                                    : 'text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            GameUserSettings.ini
                                        </button>
                                        <button
                                            onClick={() => setRawSubTab('game')}
                                            className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                                                rawSubTab === 'game' 
                                                    ? 'bg-slate-800 text-white shadow' 
                                                    : 'text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            Game.ini
                                        </button>
                                        <button
                                            onClick={() => setRawSubTab('command')}
                                            className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                                                rawSubTab === 'command' 
                                                    ? 'bg-slate-800 text-white shadow' 
                                                    : 'text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            Resolved Command Line
                                        </button>
                                    </div>

                                    {/* Raw display console */}
                                    <div className="flex-1 bg-slate-950/70 border border-slate-800/80 rounded-xl overflow-hidden p-4 font-mono text-xs text-slate-300 flex flex-col">
                                        {rawSubTab === 'gus' && (
                                            <pre className="flex-1 overflow-auto whitespace-pre select-text select-all scrollbar-thin">
                                                {preview.rawIniGus || '; No GameUserSettings.ini file content detected.'}
                                            </pre>
                                        )}
                                        {rawSubTab === 'game' && (
                                            <pre className="flex-1 overflow-auto whitespace-pre select-text select-all scrollbar-thin">
                                                {preview.rawIniGame || '; No Game.ini file content detected.'}
                                            </pre>
                                        )}
                                        {rawSubTab === 'command' && (
                                            <div className="flex-1 overflow-auto space-y-4 select-text">
                                                <div>
                                                    <span className="text-[10px] text-amber-400 font-bold block mb-1 uppercase tracking-wider">Matched startup line:</span>
                                                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-slate-200 break-all select-all font-mono">
                                                        {preview.detectedCommand || 'No command line resolved from startup script files.'}
                                                    </div>
                                                </div>
                                                {preview.detectedCommand && (
                                                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                                                        <span className="text-[10px] text-emerald-400 font-bold block uppercase tracking-wider">Success</span>
                                                        <p className="text-[11px] text-slate-400 mt-1">
                                                            This launch arguments string was parsed using our startup variables state machine. Inline environment variables have been fully replaced.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-700/50 flex gap-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isImporting}
                        className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl border border-slate-700/30 transition-colors font-medium text-sm"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isImporting || !installPath || !serverName}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium text-sm shadow-lg shadow-amber-500/15"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {t('dialogs.importServer.importing', 'Importing...')}
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5" />
                                {t('dialogs.importServer.import', 'Import Server')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
