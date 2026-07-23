import { useState, useCallback, useEffect } from 'react';
import { X, FolderOpen, Server, Loader2, CheckCircle, AlertCircle, Eye, MapPin, Users, Wifi, Shield, Package, Terminal } from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { useAseServerStore } from '../../ase/stores/aseServerStore';
import { importServer, importAseServer, previewImportSettings, selectFolder } from '../../utils/tauri';
import type { ImportPreview } from '../../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface Props {
    onClose: () => void;
    initialType?: 'ASA' | 'ASE';
}

export default function ImportServerDialog({ onClose, initialType = 'ASA' }: Props) {
    const { t } = useTranslation();
    const { addServer } = useServerStore();
    const { addServer: addAseServer } = useAseServerStore();
    const [installPath, setInstallPath] = useState('');
    const [serverName, setServerName] = useState(t('dialogs.importServer.namePlaceholder', 'My ARK Server'));
    const [serverType, setServerType] = useState<'ASA' | 'ASE'>(initialType);
    const [isImporting, setIsImporting] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<ImportPreview | null>(null);

    const handlePreview = useCallback(async (targetPath: string, targetType: 'ASA' | 'ASE') => {
        if (!targetPath || !targetPath.trim()) return;

        setIsPreviewing(true);
        setError(null);
        try {
            const result = await previewImportSettings(targetPath, targetType);
            setPreview(result);
            // Auto-fill session name if detected
            if (result.sessionName && result.sessionName.trim()) {
                setServerName(result.sessionName);
            }
        } catch (err) {
            console.error('Failed to preview settings:', err);
            setPreview(null);
        } finally {
            setIsPreviewing(false);
        }
    }, []);

    // Auto-preview settings when path or serverType changes
    useEffect(() => {
        if (!installPath || !installPath.trim()) {
            setPreview(null);
            return;
        }

        const timer = setTimeout(() => {
            handlePreview(installPath, serverType);
        }, 500); // Debounce manual typing / changes

        return () => clearTimeout(timer);
    }, [installPath, serverType, handlePreview]);

    const handleSelectFolder = async () => {
        try {
            const folder = await selectFolder(t('dialogs.importServer.selectFolder', 'Select Server Folder'));
            if (folder) {
                setInstallPath(folder);
                setError(null);
                setPreview(null);
                // Try to extract name from folder path
                const folderName = folder.split('\\').pop() || folder.split('/').pop();
                if (folderName) {
                    setServerName(folderName);
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

        try {
            if (serverType === 'ASE') {
                const aseServer = await importAseServer(installPath, serverName);
                addAseServer(aseServer);
                toast.success(t('dialogs.importServer.success', { name: aseServer.name || serverName }));
            } else {
                const server = await importServer(installPath, serverName);
                addServer(server);
                toast.success(t('dialogs.importServer.success', { name: server.name }));
            }
            onClose();
        } catch (err) {
            setError(String(err));
            toast.error(t('dialogs.importServer.error', 'Import failed.'));
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && !isImporting && onClose()}
        >
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="relative p-6 border-b border-slate-700/50 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                            <FolderOpen className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{t('dialogs.importServer.title', 'Import Existing Server')}</h2>
                            <p className="text-sm text-slate-400">{t('dialogs.importServer.subtitle', 'Import an existing ARK server installation')}</p>
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

                {/* Content */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Server Type Selector */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                            <Server className="w-4 h-4" />
                            Server Type
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setServerType('ASA'); setPreview(null); }}
                                disabled={isImporting}
                                className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                                    serverType === 'ASA'
                                        ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:border-slate-600'
                                }`}
                            >
                                ARK: Survival Ascended
                            </button>
                            <button
                                onClick={() => { setServerType('ASE'); setPreview(null); }}
                                disabled={isImporting}
                                className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                                    serverType === 'ASE'
                                        ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:border-slate-600'
                                }`}
                            >
                                ARK: Survival Evolved
                            </button>
                        </div>
                    </div>

                    {/* Folder Selection */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                            <FolderOpen className="w-4 h-4" />
                            {t('dialogs.importServer.folderLabel', 'Server Installation Folder')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={installPath}
                                onChange={(e) => setInstallPath(e.target.value)}
                                placeholder={t('dialogs.importServer.folderPlaceholder', 'Select the server installation folder...')}
                                className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                disabled={isImporting}
                            />
                            <button
                                onClick={handleSelectFolder}
                                disabled={isImporting}
                                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl transition-colors"
                            >
                                <FolderOpen className="w-5 h-5 text-white" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            {t('dialogs.importServer.folderHint', 'Select the root folder containing ShooterGame/')}
                        </p>
                    </div>

                    {/* Server Name */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                            <Server className="w-4 h-4" />
                            {t('dialogs.importServer.nameLabel', 'Server Profile Name')}
                        </label>
                        <input
                            type="text"
                            value={serverName}
                            onChange={(e) => setServerName(e.target.value)}
                            placeholder={t('dialogs.importServer.namePlaceholder', 'server1')}
                            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            disabled={isImporting}
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            {t('dialogs.importServer.nameHint', 'A friendly profile name for this server in the manager')}
                        </p>
                    </div>

                    {/* Preview Panel */}
                    {isPreviewing && (
                        <div className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                            <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                            <span className="text-sm text-slate-300">Detecting server settings...</span>
                        </div>
                    )}

                    {preview && !isPreviewing && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                                <Eye className="w-4 h-4 text-amber-400" />
                                Detected Settings
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl text-xs">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span className="text-slate-400">Map:</span>
                                    <span className="text-white font-medium truncate">{preview.mapName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                    <span className="text-slate-400">Players:</span>
                                    <span className="text-white font-medium">{preview.maxPlayers}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Wifi className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                                    <span className="text-slate-400">Game Port:</span>
                                    <span className="text-white font-medium">{preview.gamePort}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Wifi className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                                    <span className="text-slate-400">Query Port:</span>
                                    <span className="text-white font-medium">{preview.queryPort}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                                    <span className="text-slate-400">RCON Port:</span>
                                    <span className="text-white font-medium">{preview.rconPort}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Shield className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                                    <span className="text-slate-400">Admin Pass:</span>
                                    <span className="text-white font-medium">{preview.adminPassword ? '••••••' : 'Not set'}</span>
                                </div>
                                {preview.ipAddress && (
                                    <div className="flex items-center gap-2 col-span-2">
                                        <Wifi className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                                        <span className="text-slate-400">IP Address:</span>
                                        <span className="text-white font-medium">{preview.ipAddress}</span>
                                    </div>
                                )}
                                {preview.activeMods && (
                                    <div className="flex items-center gap-2 col-span-2">
                                        <Package className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                                        <span className="text-slate-400">Active Mods:</span>
                                        <span className="text-white font-medium">
                                            {preview.activeMods.split(',').filter(Boolean).length} mod(s)
                                        </span>
                                    </div>
                                )}
                                {preview.clusterId && (
                                    <div className="flex items-center gap-2 col-span-2">
                                        <Server className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                                        <span className="text-slate-400">Cluster ID:</span>
                                        <span className="text-white font-medium truncate">{preview.clusterId}</span>
                                    </div>
                                )}
                            </div>

                            {/* Warnings */}
                            {preview.warnings.length > 0 && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl space-y-1">
                                    {preview.warnings.map((w, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs text-yellow-300/80">
                                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                            <span>{w}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}

                    {/* Info Box */}
                    <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                        <CheckCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-300/80">
                            <p className="font-medium mb-1">{t('dialogs.importServer.whatImports', 'What will be imported:')}</p>
                            <ul className="list-disc list-inside text-xs space-y-0.5 opacity-80">
                                <li>Map name, session name, and player count</li>
                                <li>{t('dialogs.importServer.importDetails.ports', 'Game, Query, and RCON ports')}</li>
                                <li>{t('dialogs.importServer.importDetails.admin', 'Admin and server passwords')}</li>
                                <li>Active mods and cluster settings</li>
                                <li>IP address and custom launch arguments</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-700/50 flex gap-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isImporting}
                        className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl transition-colors font-medium"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isImporting || !installPath || !serverName}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium"
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
        </div>
    );
}
