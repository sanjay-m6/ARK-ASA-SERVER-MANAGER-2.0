import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Database, Loader2, Sparkles, Check, Copy, Wifi, Layers, MessageSquare, Terminal, Wand2, CheckCircle2, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Cluster } from '../../types';
import {
    getClusterCrossChatConfig,
    saveClusterCrossChatConfig,
    toggleClusterCrossChat,
    getClusterCrossChatStatus,
    applyLaccModToCluster,
    installCrosschatAscendedPlugin,
    testMysqlConnection,
    ClusterCrossChatConfig
} from '../../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { useServerStore } from '../../stores/serverStore';

interface CrossChatConfigDialogProps {
    isOpen: boolean;
    cluster: Cluster;
    onClose: () => void;
    onSaved: (enabled: boolean) => void;
}

export default function CrossChatConfigDialog({
    isOpen,
    cluster,
    onClose,
    onSaved,
}: CrossChatConfigDialogProps) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'lacc' | 'asa_api' | 'native'>('lacc');
    const [isEnabled, setIsEnabled] = useState(false);
    const [config, setConfig] = useState<ClusterCrossChatConfig>({
        mode: 'lacc',
        host: 'localhost',
        user: 'root',
        pass: '',
        dbName: 'test',
        port: 3306,
        fetchInterval: 0.25,
        debug: false,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isTestingConn, setIsTestingConn] = useState(false);
    const [isApplyingMod, setIsApplyingMod] = useState(false);
    const [isInstallingPlugin, setIsInstallingPlugin] = useState(false);
    const [isPluginInstalled, setIsPluginInstalled] = useState(false);
    const [isLaccInstalled, setIsLaccInstalled] = useState(false);
    const [sqlCopied, setSqlCopied] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        if (isOpen && cluster) {
            const loadConfig = async () => {
                try {
                    const status = await getClusterCrossChatStatus(cluster.id);
                    setIsEnabled(status);

                    const data = await getClusterCrossChatConfig(cluster.id);
                    setConfig(data);
                    if (data.mode) {
                        setActiveTab(data.mode);
                    }
                    if (data.isPluginInstalled) setIsPluginInstalled(true);
                    if (data.isLaccInstalled) setIsLaccInstalled(true);
                } catch (error) {
                    console.error('Failed to load cross-chat configuration:', error);
                    toast.error(t('clusterManager.loadConfigFailed', 'Failed to load configuration'));
                }
            };
            loadConfig();
        }
    }, [isOpen, cluster]);

    if (!isOpen) return null;

    const handleApplyLaccMod = async () => {
        setIsApplyingMod(true);
        try {
            const updatedCount = await applyLaccModToCluster(cluster.id);
            await useServerStore.getState().refreshServers();
            setIsLaccInstalled(true);
            toast.success(`LACC Mod ID (928795) applied to ${updatedCount} servers in cluster!`);
        } catch (error) {
            console.error('Failed to apply LACC mod:', error);
            toast.error(`Failed to apply mod: ${error}`);
        } finally {
            setIsApplyingMod(false);
        }
    };

    const handleInstallCrosschatPlugin = async () => {
        setIsInstallingPlugin(true);
        try {
            const count = await installCrosschatAscendedPlugin(cluster.id, config);
            setIsPluginInstalled(true);
            toast.success(`CrosschatAscended plugin installed & configured on ${count} servers!`);
        } catch (error) {
            console.error('Failed to install AsaCrossChat plugin:', error);
            toast.error(`Plugin setup failed: ${error}`);
        } finally {
            setIsInstallingPlugin(false);
        }
    };

    const handleTestMysql = async () => {
        if (!config.host.trim() || !config.port) {
            toast.error('Please enter a valid Host and Port first.');
            return;
        }
        setIsTestingConn(true);
        try {
            await testMysqlConnection(config.host, config.port);
            toast.success(`Successfully reached MySQL service at ${config.host}:${config.port}!`);
        } catch (error) {
            toast.error(`Database reachability check failed: ${error}`);
        } finally {
            setIsTestingConn(false);
        }
    };

    const handleCopySql = () => {
        const sql = `CREATE DATABASE IF NOT EXISTS \`${config.dbName || 'test'}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE \`${config.dbName || 'test'}\`;\nCREATE TABLE IF NOT EXISTS \`chat_logs\` (\n  \`id\` INT AUTO_INCREMENT PRIMARY KEY,\n  \`server_key\` VARCHAR(64) NOT NULL,\n  \`player_name\` VARCHAR(128) NOT NULL,\n  \`message\` TEXT NOT NULL,\n  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
        navigator.clipboard.writeText(sql);
        setSqlCopied(true);
        toast.success('MySQL utf8mb4 schema script copied to clipboard!');
        setTimeout(() => setSqlCopied(false), 3000);
    };

    const handleSave = async () => {
        if (activeTab === 'asa_api') {
            if (!config.host.trim()) {
                toast.error(t('clusterManager.hostRequired', 'Database Host is required'));
                return;
            }
            if (!config.user.trim()) {
                toast.error(t('clusterManager.userRequired', 'Database User is required'));
                return;
            }
            if (!config.dbName.trim()) {
                toast.error(t('clusterManager.dbNameRequired', 'Database Name is required'));
                return;
            }
            if (config.port <= 0) {
                toast.error(t('clusterManager.portRequired', 'Valid Database Port is required'));
                return;
            }
        }

        setIsSaving(true);
        try {
            const updatedConfig = { ...config, mode: activeTab };
            await saveClusterCrossChatConfig(cluster.id, updatedConfig);
            await toggleClusterCrossChat(cluster.id, isEnabled);

            toast.success('Cross-chat mode and settings saved successfully!');
            onSaved(isEnabled);
            onClose();
        } catch (error) {
            console.error('Failed to save cross-chat configuration:', error);
            toast.error(t('clusterManager.saveConfigFailed', 'Failed to save configuration'));
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center pt-14 pb-6 px-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] my-auto">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10 bg-slate-950/80 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-emerald-500/20 to-sky-500/20 rounded-xl border border-emerald-500/30 shrink-0">
                            <MessageSquare className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                Cross-Server Chat Setup
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    {cluster.name}
                                </span>
                            </h3>
                            <p className="text-xs text-slate-400">Choose the optimal cross-chat mechanism for your ARK cluster</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close Dialog (Esc)"
                        aria-label="Close dialog"
                        className="p-2 bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-xl transition-all shadow-md group shrink-0"
                    >
                        <X className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {/* Master Enable Switch */}
                    <div className="flex items-center justify-between p-4 bg-slate-950/60 rounded-xl border border-white/10">
                        <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-emerald-400" />
                                Enable Cross-Server Chat
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">Relay global chat messages across all maps in this cluster</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={(e) => setIsEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>

                    {/* Mode Selection Tabs */}
                    <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                            Select Cross-Chat Method
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* Tab 1: CurseForge Mod (LACC) */}
                            <button
                                type="button"
                                onClick={() => setActiveTab('lacc')}
                                className={cn(
                                    "p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between",
                                    activeTab === 'lacc'
                                        ? "bg-emerald-500/10 border-emerald-500/50 text-white shadow-lg shadow-emerald-500/10"
                                        : "bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200"
                                )}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <Layers className="w-5 h-5 text-emerald-400" />
                                    {isLaccInstalled ? (
                                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                            <CheckCircle2 className="w-2.5 h-2.5" /> Mod Active
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                            Recommended
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-white">CurseForge Mod</div>
                                    <div className="text-[11px] text-slate-400 mt-1">LACC Mod ID: 928795. Works on PC + Xbox + PS5 Crossplay.</div>
                                </div>
                            </button>

                            {/* Tab 2: AsaApi Plugin */}
                            <button
                                type="button"
                                onClick={() => setActiveTab('asa_api')}
                                className={cn(
                                    "p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between",
                                    activeTab === 'asa_api'
                                        ? "bg-sky-500/10 border-sky-500/50 text-white shadow-lg shadow-sky-500/10"
                                        : "bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200"
                                )}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <Database className="w-5 h-5 text-sky-400" />
                                    {isPluginInstalled ? (
                                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                            <CheckCircle2 className="w-2.5 h-2.5" /> Installed
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                            Advanced
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-white">AsaApi Plugin</div>
                                    <div className="text-[11px] text-slate-400 mt-1">CrosschatAscended via MySQL database sync.</div>
                                </div>
                            </button>

                            {/* Tab 3: Native RCON Relay */}
                            <button
                                type="button"
                                onClick={() => setActiveTab('native')}
                                className={cn(
                                    "p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between",
                                    activeTab === 'native'
                                        ? "bg-purple-500/10 border-purple-500/50 text-white shadow-lg shadow-purple-500/10"
                                        : "bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200"
                                )}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <Terminal className="w-5 h-5 text-purple-400" />
                                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                        Vanilla
                                    </span>
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-white">Native RCON</div>
                                    <div className="text-[11px] text-slate-400 mt-1">Built-in Manager engine. 0 Mods / 0 Plugins needed.</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Tab 1 Body: CurseForge Mod (LACC) */}
                    {activeTab === 'lacc' && (
                        <div className="bg-slate-950/60 rounded-xl border border-emerald-500/20 p-5 space-y-4">
                            <div className="flex items-start gap-3">
                                <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                        1-Click LACC Mod Automation
                                        {isLaccInstalled && (
                                            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold rounded-full flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Active
                                            </span>
                                        )}
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                        LACC (Lily & Azure's Cluster Chat) is the premier mod for ARK: Survival Ascended. It connects all servers in your cluster across PC, PlayStation 5, and Xbox with zero database setup required.
                                    </p>
                                </div>
                            </div>

                            {isLaccInstalled && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                    <span><strong>Mod ID 928795</strong> is currently added to the active mod list for your cluster servers!</span>
                                </div>
                            )}

                            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-mono text-emerald-400 font-bold">Mod ID: 928795</div>
                                    <div className="text-[11px] text-slate-500">Auto-appends to active mods list for all cluster servers</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleApplyLaccMod}
                                    disabled={isApplyingMod}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50",
                                        isLaccInstalled
                                            ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-600/20 border border-emerald-400/30"
                                            : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20"
                                    )}
                                >
                                    {isApplyingMod ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : isLaccInstalled ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                    ) : (
                                        <Wand2 className="w-4 h-4" />
                                    )}
                                    <span>{isLaccInstalled ? 'Re-Apply LACC Mod ID' : 'Auto-Add LACC Mod ID'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tab 2 Body: AsaApi Plugin (MySQL) */}
                    {activeTab === 'asa_api' && (
                        <div className="space-y-4">
                            {/* Interactive Setup & Install Guide Banner */}
                            <div className="bg-slate-950/60 rounded-xl border border-sky-500/20 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setShowGuide(!showGuide)}
                                    className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <BookOpen className="w-4 h-4 text-sky-400" />
                                        <span className="text-xs font-bold text-white">CrosschatAscended (by Pelayori) — Installation Guide</span>
                                        <span className="px-2 py-0.5 bg-sky-500/20 text-sky-300 text-[10px] rounded font-semibold border border-sky-500/30">
                                            Setup Instructions
                                        </span>
                                    </div>
                                    {showGuide ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </button>

                                {showGuide && (
                                    <div className="p-4 pt-0 border-t border-white/5 space-y-3 text-xs text-slate-300 bg-slate-900/30">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
                                            <div className="p-3 bg-slate-950 border border-white/5 rounded-xl space-y-1">
                                                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                                                    <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[10px]">1</span>
                                                    Create MySQL DB
                                                </div>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    Create a MySQL / MariaDB database using <code>utf8mb4_unicode_ci</code> encoding to support all languages and emojis natively.
                                                </p>
                                            </div>

                                            <div className="p-3 bg-slate-950 border border-white/5 rounded-xl space-y-1">
                                                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                                                    <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[10px]">2</span>
                                                    Auto-Install Plugin
                                                </div>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    Click <strong>Auto-Install Plugin Files</strong> below. Manager provisions files directly to <code>ArkApi/Plugins/AsaCrossChat/</code>.
                                                </p>
                                            </div>

                                            <div className="p-3 bg-slate-950 border border-white/5 rounded-xl space-y-1">
                                                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                                                    <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[10px]">3</span>
                                                    Verify & Enable
                                                </div>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    Click <strong>Test Database Reachability</strong> to confirm connection, then hit <strong>Save & Enable</strong> below!
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* MySQL Form */}
                            <div className="bg-slate-950/60 rounded-xl border border-white/10 p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Database className="w-4 h-4 text-sky-400" />
                                        MySQL Database Credentials
                                    </h4>
                                    {isPluginInstalled && (
                                        <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-full flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Installed & Configured
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Database Host</label>
                                        <input
                                            type="text"
                                            value={config.host}
                                            onChange={(e) => setConfig({ ...config, host: e.target.value })}
                                            placeholder="localhost"
                                            className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Database Port</label>
                                        <input
                                            type="number"
                                            value={config.port}
                                            onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 3306 })}
                                            placeholder="3306"
                                            className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Database User</label>
                                        <input
                                            type="text"
                                            value={config.user}
                                            onChange={(e) => setConfig({ ...config, user: e.target.value })}
                                            placeholder="root"
                                            className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Database Password</label>
                                        <input
                                            type="password"
                                            value={config.pass}
                                            onChange={(e) => setConfig({ ...config, pass: e.target.value })}
                                            placeholder="••••••••"
                                            className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs text-slate-400 mb-1">Database Name</label>
                                        <input
                                            type="text"
                                            value={config.dbName}
                                            onChange={(e) => setConfig({ ...config, dbName: e.target.value })}
                                            placeholder="ark_crosschat"
                                            className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                                        />
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-white/5 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={handleTestMysql}
                                            disabled={isTestingConn}
                                            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-white/10 transition-colors disabled:opacity-50"
                                        >
                                            {isTestingConn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5 text-sky-400" />}
                                            <span>Test Database Reachability</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleCopySql}
                                            className="flex items-center gap-2 px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-semibold transition-colors"
                                        >
                                            {sqlCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                            <span>Copy utf8mb4 SQL Schema</span>
                                        </button>
                                    </div>

                                    {/* 1-Click Plugin Setup Box */}
                                    <div className={cn(
                                        "p-3.5 border rounded-xl flex items-center justify-between gap-4 transition-all",
                                        isPluginInstalled
                                            ? "bg-emerald-500/10 border-emerald-500/30"
                                            : "bg-sky-500/10 border-sky-500/20"
                                    )}>
                                        <div>
                                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                                {isPluginInstalled ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                ) : (
                                                    <Sparkles className="w-4 h-4 text-sky-400" />
                                                )}
                                                {isPluginInstalled ? 'Plugin Configured & Installed' : '1-Click Plugin Setup'}
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                {isPluginInstalled
                                                    ? 'Plugin files exist in ArkApi/Plugins/AsaCrossChat/ across all cluster servers.'
                                                    : 'Automatically creates AsaCrossChat/PluginInfo.json & config.json in ArkApi/Plugins/ for all servers.'}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleInstallCrosschatPlugin}
                                            disabled={isInstallingPlugin}
                                            className={cn(
                                                "flex items-center gap-2 px-4 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0",
                                                isPluginInstalled
                                                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20 border border-emerald-400/30"
                                                    : "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-sky-600/20"
                                            )}
                                        >
                                            {isInstallingPlugin ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : isPluginInstalled ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                                            ) : (
                                                <Wand2 className="w-3.5 h-3.5" />
                                            )}
                                            <span>{isPluginInstalled ? 'Re-Install Plugin Files' : 'Auto-Install Plugin Files'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab 3 Body: Native RCON Relay */}
                    {activeTab === 'native' && (
                        <div className="bg-slate-950/60 rounded-xl border border-purple-500/20 p-5 space-y-3">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-purple-400" />
                                Built-in Manager RCON Relay
                            </h4>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Uses the application's background engine to read in-game chat logs and broadcast messages to all cluster servers via RCON. Requires zero mods, zero plugins, and zero external databases.
                            </p>
                            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-[11px] text-purple-300">
                                ✨ <strong>Auto-Flag Injection</strong>: ARK Server Manager will automatically include <code>-servergamelog</code> when launching your cluster servers so in-game chat entries are captured cleanly.
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-slate-950/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        <span>Save & Enable</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
