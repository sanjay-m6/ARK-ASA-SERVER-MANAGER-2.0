import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare, Bell, Send, CheckCircle, Loader2, AlertTriangle,
    Users, RefreshCw, Shield, Webhook, Bot, Server as ServerIcon,
    Activity, Zap, Clock, Radio, Eye, PlayCircle, StopCircle, Settings2,
    TrendingUp, History, Wifi, WifiOff, Link, MessageCircle, List, Plus
} from 'lucide-react';

import { cn } from '../utils/helpers';
import {
    getSetting, setSetting,
    getDiscordBridgeConfig, saveDiscordBridgeConfig,
    startDiscordBridge, stopDiscordBridge, testDiscordConnection,
    sendDiscordStatusUpdate,
    type DiscordBridgeConfig,
    getClusters, createCluster, toggleClusterCrossChat
} from '../utils/tauri';
import { useServerStore } from '../stores/serverStore';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface AlertConfig {
    key: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    enabled: boolean;
    category: 'server' | 'player' | 'system';
}

interface RecentNotification {
    id: string;
    type: string;
    message: string;
    timestamp: Date;
    server?: string;
}

const DEFAULT_ALERTS: AlertConfig[] = [
    { key: 'serverStart', label: 'Server Start', description: 'Server comes online', icon: PlayCircle, enabled: true, category: 'server' },
    { key: 'serverStop', label: 'Server Stop', description: 'Server goes offline', icon: StopCircle, enabled: true, category: 'server' },
    { key: 'serverCrash', label: 'Server Crash', description: 'Unexpected shutdown', icon: AlertTriangle, enabled: true, category: 'server' },
    { key: 'serverUpdate', label: 'Server Update', description: 'Files updated via SteamCMD', icon: RefreshCw, enabled: true, category: 'server' },
    { key: 'playerJoin', label: 'Player Join', description: 'Player connects', icon: Users, enabled: false, category: 'player' },
    { key: 'playerLeave', label: 'Player Leave', description: 'Player disconnects', icon: Users, enabled: false, category: 'player' },
    { key: 'backupCompletion', label: 'Backup Complete', description: 'Backup finished', icon: Shield, enabled: true, category: 'system' },
    { key: 'serverRecovery', label: 'Server Recovery', description: 'Intelligent auto-recovery executed', icon: Shield, enabled: true, category: 'system' },
    { key: 'scheduledRestarts', label: 'Scheduled Tasks', description: 'Scheduled restarts and warnings', icon: Clock, enabled: true, category: 'system' },
];

export default function DiscordBot() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { servers, refreshServers } = useServerStore();
    const [webhookUrl, setWebhookUrl] = useState('');
    const [savedWebhookUrl, setSavedWebhookUrl] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alerts, setAlerts] = useState<AlertConfig[]>(DEFAULT_ALERTS);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
    const [recentNotifications, setRecentNotifications] = useState<RecentNotification[]>([]);
    const [liveMode, setLiveMode] = useState(true);
    const [activeSection, setActiveSection] = useState<'webhook' | 'bot' | 'alerts' | 'activity' | 'admin'>('webhook');
    const [bridgeConfig, setBridgeConfig] = useState<DiscordBridgeConfig>({
        cluster_id: 1,
        enabled: false,
        bot_token: '',
        guild_id: '',
        channel_id: '',
        admin_channel_id: '',
        admin_role_ids: [],
        moderator_role_ids: [],
        game_to_discord: true,
        discord_to_game: true,
        server_list_enabled: false,
        server_list_channel_id: '',
        server_list_message_id: '',
        player_list_enabled: false,
        player_list_channel_id: '',
        player_list_message_id: '',
        show_tribe_names: true,
        show_playtime: true
    });
    const [isBridgeTesting, setIsBridgeTesting] = useState(false);

    const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
    const [isCreatingCluster, setIsCreatingCluster] = useState(false);
    const autoSave = true;

    // Real-time connection check
    const checkConnection = useCallback(async () => {
        if (!webhookUrl) {
            setConnectionStatus('disconnected');
            return;
        }

        setConnectionStatus('checking');
        try {
            // Discord webhooks return 200 on GET with webhook info
            const response = await fetch(webhookUrl);
            if (response.ok) {
                setConnectionStatus('connected');
            } else {
                setConnectionStatus('disconnected');
            }
        } catch {
            setConnectionStatus('disconnected');
        }
    }, [webhookUrl]);

    useEffect(() => {
        loadSettings();
        refreshServers();
    }, []);

    // Real-time connection monitoring
    useEffect(() => {
        if (liveMode && savedWebhookUrl) {
            checkConnection();
            const interval = setInterval(checkConnection, 30000); // Check every 30s
            return () => clearInterval(interval);
        }
    }, [liveMode, savedWebhookUrl, checkConnection]);

    // Auto-save when alerts change
    useEffect(() => {
        if (autoSave && !isLoading && savedWebhookUrl) {
            const timeout = setTimeout(() => {
                saveAlertConfig();
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [alerts, autoSave, isLoading, savedWebhookUrl]);

    const loadSettings = async () => {
        try {
            const [webhook, alertConfig, notifications, fetchedClusters] = await Promise.all([
                getSetting('discord_webhook_url'),
                getSetting('discord_alerts_config'),
                getSetting('discord_recent_notifications'),
                getClusters()
            ]);

            if (webhook) {
                setWebhookUrl(webhook);
                setSavedWebhookUrl(webhook);
            }



            if (fetchedClusters.length > 0) {
                const firstClusterId = fetchedClusters[0].id;
                setSelectedClusterId(firstClusterId);

                const bridge = await getDiscordBridgeConfig(firstClusterId);
                if (bridge) {
                    setBridgeConfig(bridge);
                } else {
                    setBridgeConfig(prev => ({ ...prev, cluster_id: firstClusterId }));
                }
            } else {
                // No clusters found! Auto-create one for smoother UX
                try {
                    const newCluster = await createCluster("Main Cluster", []);
                    setSelectedClusterId(newCluster.id);
                    setBridgeConfig(prev => ({ ...prev, cluster_id: newCluster.id }));
                    toast.success('Initialized default cluster for Discord Bot');
                    toast.success(t('discordBot.toasts.initSuccess'));
                } catch (e) {
                    console.error("Failed to auto-create cluster", e);
                    toast.error(t('discordBot.toasts.initFailed'));
                }
            }

            if (alertConfig) {
                try {
                    const parsed = JSON.parse(alertConfig);
                    setAlerts(prev => prev.map(alert => ({
                        ...alert,
                        enabled: parsed[alert.key] ?? alert.enabled
                    })));
                } catch (e) {
                    console.error('Failed to parse alert config:', e);
                }
            }

            if (notifications) {
                try {
                    const parsed = JSON.parse(notifications);
                    setRecentNotifications(parsed.map((n: RecentNotification) => ({
                        ...n,
                        timestamp: new Date(n.timestamp)
                    })));
                } catch (e) {
                    console.error('Failed to parse notifications:', e);
                }
            }
        } catch (error) {
            console.error('Failed to load Discord settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateDefaultCluster = async () => {
        setIsCreatingCluster(true);
        try {
            const newCluster = await createCluster('Default Cluster', []);
            if (newCluster?.id) {
                await toggleClusterCrossChat(newCluster.id, true);
            }

            if (!newCluster) throw new Error("Cluster creation returned null");

            await refreshServers();
            setSelectedClusterId(newCluster.id);
            setBridgeConfig(prev => ({ ...prev, cluster_id: newCluster.id }));
            toast.success(t('discordBot.toasts.defaultCreated'));
        } catch (error) {
            toast.error(t('discordBot.toasts.defaultCreateFailed'));
            console.error(error);
        } finally {
            setIsCreatingCluster(false);
        }
    };

    const saveAlertConfig = async () => {
        try {
            const alertConfig = alerts.reduce((acc, alert) => {
                acc[alert.key] = alert.enabled;
                return acc;
            }, {} as Record<string, boolean>);
            await setSetting('discord_alerts_config', JSON.stringify(alertConfig));
        } catch (error) {
            console.error('Failed to save alert config:', error);
        }
    };

    const saveWebhook = async () => {
        const trimmed = webhookUrl.trim();
        if (!trimmed) {
            toast.error(t('discordBot.toasts.enterUrl'));
            return;
        }
        setIsSaving(true);
        try {
            await setSetting('discord_webhook_url', trimmed);
            // Read back from backend to confirm persistence
            const persisted = await getSetting('discord_webhook_url');
            if (persisted === trimmed) {
                setWebhookUrl(trimmed);
                setSavedWebhookUrl(trimmed);
                await checkConnection();
                toast.success(t('discordBot.toasts.webhookSaved'));
            } else {
                toast.error(t('discordBot.toasts.webhookPersistFailed'));
            }
        } catch (error) {
            toast.error(t('discordBot.toasts.saveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const toggleAlert = (key: string) => {
        setAlerts(prev => prev.map(alert =>
            alert.key === key ? { ...alert, enabled: !alert.enabled } : alert
        ));
    };

    const enableAllAlerts = () => {
        setAlerts(prev => prev.map(alert => ({ ...alert, enabled: true })));
        toast.success(t('discordBot.toasts.allEnabled'));
    };

    const disableAllAlerts = () => {
        setAlerts(prev => prev.map(alert => ({ ...alert, enabled: false })));
        toast.success(t('discordBot.toasts.allDisabled'));
    };

    const testWebhook = async () => {
        if (!webhookUrl) {
            toast.error(t('discordBot.toasts.enterUrlFirst'));
            return;
        }

        if (!webhookUrl.includes('discord.com/api/webhooks/')) {
            toast.error(t('discordBot.toasts.invalidUrl'));
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: t('discordBot.embeds.connectionEstablished'),
                        description: t('discordBot.embeds.workingPerfectly'),
                        color: 0x00d4aa,
                        timestamp: new Date().toISOString(),
                        footer: { text: 'ASA Server Manager', icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png' },
                        fields: [
                            { name: t('discordBot.embeds.status'), value: t('discordBot.embeds.active'), inline: true },
                            { name: t('discordBot.embeds.alerts'), value: `${alerts.filter(a => a.enabled).length} ${t('discordBot.embeds.enabled')}`, inline: true },
                            { name: t('discordBot.embeds.servers'), value: `${servers.length} ${t('discordBot.embeds.configured')}`, inline: true }
                        ],
                        thumbnail: { url: 'https://cdn.discordapp.com/embed/avatars/0.png' }
                    }]
                })
            });

            if (response.ok) {
                setTestResult('success');
                setConnectionStatus('connected');

                // Save if successful and not saved
                if (webhookUrl !== savedWebhookUrl) {
                    await setSetting('discord_webhook_url', webhookUrl);
                    setSavedWebhookUrl(webhookUrl);
                }

                // Add to recent notifications
                const newNotification: RecentNotification = {
                    id: Date.now().toString(),
                    type: 'test',
                    message: 'Test notification sent successfully',
                    timestamp: new Date()
                };
                setRecentNotifications(prev => [newNotification, ...prev].slice(0, 10));

                toast.success(t('discordBot.toasts.testSent'));
            } else {
                setTestResult('error');
                setConnectionStatus('disconnected');
                toast.error(t('discordBot.toasts.webhookFailed'));
            }
        } catch (error) {
            setTestResult('error');
            setConnectionStatus('disconnected');
            toast.error(t('discordBot.toasts.connFailed'));
        } finally {
            setIsTesting(false);
        }
    };

    const sendQuickNotification = async (type: string, message: string) => {
        if (!savedWebhookUrl) {
            toast.error(t('discordBot.toasts.configureFirst'));
            return;
        }

        try {
            await fetch(savedWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: `📢 ${type} `,
                        description: message,
                        color: 0x5865F2,
                        timestamp: new Date().toISOString(),
                        footer: { text: 'ASA Server Manager' }
                    }]
                })
            });
            toast.success(t('discordBot.toasts.notifSent'));
        } catch {
            toast.error(t('discordBot.toasts.sendFailed'));
        }
    };

    const saveBridgeConfig = async () => {
        try {
            setIsSaving(true);

            // Ensure we have a valid cluster ID
            let targetClusterId = bridgeConfig.cluster_id;

            // If ID is 0 or 1, verify it actually exists
            const currentClusters = await getClusters();
            const clusterExists = currentClusters.some(c => c.id === targetClusterId);

            if (!clusterExists) {
                if (currentClusters.length > 0) {
                    // Use first available cluster if configured one is missing
                    targetClusterId = currentClusters[0].id;
                    setBridgeConfig(prev => ({ ...prev, cluster_id: targetClusterId }));
                    setSelectedClusterId(targetClusterId);
                } else {
                    // No clusters at all? Create one now.
                    try {
                        const newCluster = await createCluster("Main Cluster", []);
                        targetClusterId = newCluster.id;
                        setBridgeConfig(prev => ({ ...prev, cluster_id: newCluster.id }));
                        setSelectedClusterId(newCluster.id);
                        toast.success(t('discordBot.toasts.createdForConfig'));
                    } catch (e) {
                        throw new Error(t('discordBot.toasts.createClusterFailed'));
                    }
                }
            }

            await saveDiscordBridgeConfig({ ...bridgeConfig, cluster_id: targetClusterId });
            toast.success(t('discordBot.toasts.configSaved'));
        } catch (error) {
            toast.error(typeof error === 'string' ? error : 'Failed to save config');
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleBridge = async () => {
        try {
            if (bridgeConfig.enabled) {
                await stopDiscordBridge();
                setBridgeConfig(prev => ({ ...prev, enabled: false }));
                await saveDiscordBridgeConfig({ ...bridgeConfig, enabled: false });
                toast.success(t('discordBot.toasts.bridgeStopped'));
            } else {
                await startDiscordBridge();
                setBridgeConfig(prev => ({ ...prev, enabled: true }));
                await saveDiscordBridgeConfig({ ...bridgeConfig, enabled: true });
                toast.success(t('discordBot.toasts.bridgeStarted'));
            }
        } catch (error) {
            toast.error(t('discordBot.toasts.toggleFailed'));
        }
    };

    const testBridge = async () => {
        if (!bridgeConfig.bot_token || !bridgeConfig.channel_id) {
            toast.error(t('discordBot.toasts.tokenRequired'));
            return;
        }
        setIsBridgeTesting(true);
        try {
            const result = await testDiscordConnection(bridgeConfig.bot_token, bridgeConfig.channel_id);
            toast.success(result);
        } catch (error) {
            toast.error(typeof error === 'string' ? error : t('discordBot.toasts.connFailedGeneric'));
        } finally {
            setIsBridgeTesting(false);
        }
    };

    const hasUnsavedChanges = webhookUrl !== savedWebhookUrl;
    const enabledCount = alerts.filter(a => a.enabled).length;
    const runningServers = servers.filter(s => s.status === 'running' || s.status === 'online').length;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center space-y-4">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
                    <p className="text-slate-400">{t('discordBot.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header with Live Status */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                        <Bot className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white">{t('discordBot.title')}</h1>
                        <p className="text-slate-400">{t('discordBot.subtitle')}</p>
                    </div>
                </div>

                {/* Live Status Indicators */}
                <div className="flex items-center gap-4">
                    {/* Connection Status */}
                    <div className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full border shadow-sm transition-colors",
                        connectionStatus === 'connected' && "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.15)]",
                        connectionStatus === 'disconnected' && "bg-red-500/10 border-red-500/30 text-red-500",
                        connectionStatus === 'checking' && "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    )}>
                        <div className="relative flex items-center justify-center">
                            {connectionStatus === 'connected' && (
                                <>
                                    <div className="absolute w-full h-full bg-emerald-400 rounded-full animate-ping opacity-20"></div>
                                    <Wifi className="w-4 h-4 relative z-10" />
                                </>
                            )}
                            {connectionStatus === 'disconnected' && <WifiOff className="w-4 h-4" />}
                            {connectionStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin" />}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider">{connectionStatus}</span>
                    </div>

                    {/* Control Panel Button */}
                    <button
                        onClick={() => navigate('/tools/discord-control')}
                        className="flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all shadow-sm font-medium text-sm"
                    >
                        <MessageSquare className="w-4 h-4" />
                        <span>Control Panel</span>
                    </button>

                    {/* Live Mode Toggle */}
                    <button
                        onClick={() => setLiveMode(!liveMode)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-full border transition-all",
                            liveMode
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-slate-800 border-slate-700 text-slate-400"
                        )}
                    >
                        <Radio className={cn("w-4 h-4", liveMode && "animate-pulse")} />
                        <span className="text-sm font-medium">{t('discordBot.live')}</span>
                    </button>
                </div>
            </div>

            {/* Quick Stats Bar */}
            <div className="grid grid-cols-4 gap-4">
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-indigo-500">
                    <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-indigo-400" />
                        <div>
                            <div className="text-2xl font-bold text-white">{enabledCount}</div>
                            <div className="text-xs text-slate-500">{t('discordBot.stats.activeAlerts')}</div>
                        </div>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-green-500">
                    <div className="flex items-center gap-3">
                        <ServerIcon className="w-5 h-5 text-green-400" />
                        <div>
                            <div className="text-2xl font-bold text-white">{runningServers}</div>
                            <div className="text-xs text-slate-500">{t('discordBot.stats.serversOnline')}</div>
                        </div>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-purple-500">
                    <div className="flex items-center gap-3">
                        <History className="w-5 h-5 text-purple-400" />
                        <div>
                            <div className="text-2xl font-bold text-white">{recentNotifications.length}</div>
                            <div className="text-xs text-slate-500">{t('discordBot.stats.recentSends')}</div>
                        </div>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-cyan-500">
                    <div className="flex items-center gap-3">
                        <Activity className="w-5 h-5 text-cyan-400" />
                        <div>
                            <div className="text-2xl font-bold text-white">{servers.length}</div>
                            <div className="text-xs text-slate-500">{t('discordBot.stats.totalServers')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section Tabs */}
            <div className="flex flex-wrap items-center gap-2 p-2 bg-[#0A0F1C]/80 rounded-2xl border border-white/10 shadow-lg shadow-black/40 backdrop-blur-xl w-fit">
                {[
                    { key: 'webhook', label: t('discordBot.tabs.webhook', 'Webhook'), icon: Webhook },
                    { key: 'bot', label: t('discordBot.tabs.bot', 'Bot Integration'), icon: Bot },
                    { key: 'admin', label: t('discordBot.tabs.admin', 'Admin Commands'), icon: Shield },
                    { key: 'alerts', label: t('discordBot.tabs.alerts', 'Alerts'), icon: Bell },
                    { key: 'activity', label: t('discordBot.tabs.activity', 'Activity'), icon: Activity }
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeSection === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveSection(tab.key as typeof activeSection)}
                            className={cn(
                                "flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 cursor-pointer select-none",
                                isActive
                                    ? "bg-gradient-to-r from-indigo-600/30 to-purple-600/30 text-indigo-200 border border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.25)]"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                            )}
                        >
                            <Icon className={cn("w-4 h-4 transition-colors", isActive ? "text-indigo-400" : "text-slate-500")} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Setup Section (Webhook) */}
            {activeSection === 'webhook' && (
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Webhook Configuration */}
                    <div className="glass-panel rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                                <Webhook className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">{t('discordBot.webhook.setupTitle')}</h2>
                                <p className="text-sm text-slate-500">{t('discordBot.webhook.setupDesc')}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="url"
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder={t('discordBot.webhook.placeholder')}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                            />

                            <div className="flex gap-2">
                                <button
                                    onClick={saveWebhook}
                                    disabled={isSaving || !hasUnsavedChanges}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50 font-medium"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                    {hasUnsavedChanges ? t('discordBot.webhook.save') : t('discordBot.webhook.saved')}
                                </button>
                                <button
                                    onClick={testWebhook}
                                    disabled={isTesting || !webhookUrl}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors font-medium",
                                        testResult === 'success' ? "bg-green-500/20 text-green-400" :
                                            testResult === 'error' ? "bg-red-500/20 text-red-400" :
                                                "bg-slate-700 hover:bg-slate-600 text-white",
                                        "disabled:opacity-50"
                                    )}
                                >
                                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    {t('discordBot.webhook.test')}
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-800/50 rounded-lg p-4 text-sm text-slate-400">
                            <p className="font-medium text-slate-300 mb-2">{t('discordBot.webhook.quickSetup.title')}</p>
                            <ol className="list-decimal list-inside space-y-1 text-xs">
                                <li>{t('discordBot.webhook.quickSetup.step1')}</li>
                                <li>{t('discordBot.webhook.quickSetup.step2')}</li>
                                <li>{t('discordBot.webhook.quickSetup.step3')}</li>
                            </ol>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="glass-panel rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-cyan-500/10 rounded-xl">
                                <Zap className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">{t('discordBot.quickActions.title')}</h2>
                                <p className="text-sm text-slate-500">{t('discordBot.quickActions.subtitle')}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => sendQuickNotification('Announcement', 'Server maintenance scheduled')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left"
                            >
                                <MessageSquare className="w-5 h-5 text-amber-400 mb-2" />
                                <div className="font-medium text-white text-sm">{t('discordBot.quickActions.announcement.label')}</div>
                                <div className="text-xs text-slate-500">{t('discordBot.quickActions.announcement.desc')}</div>
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await sendDiscordStatusUpdate();
                                        toast.success(t('discordBot.toasts.notifSent'));
                                    } catch {
                                        toast.error(t('discordBot.toasts.sendFailed'));
                                    }
                                }}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left"
                            >
                                <TrendingUp className="w-5 h-5 text-green-400 mb-2" />
                                <div className="font-medium text-white text-sm">{t('discordBot.quickActions.status.label')}</div>
                                <div className="text-xs text-slate-500">{t('discordBot.quickActions.status.desc')}</div>
                            </button>
                            <button
                                onClick={() => sendQuickNotification('Restart', 'Server restart in progress...')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left"
                            >
                                <RefreshCw className="w-5 h-5 text-blue-400 mb-2" />
                                <div className="font-medium text-white text-sm">{t('discordBot.quickActions.restart.label')}</div>
                                <div className="text-xs text-slate-500">{t('discordBot.quickActions.restart.desc')}</div>
                            </button>
                            <button
                                onClick={() => sendQuickNotification('Maintenance', 'Scheduled maintenance beginning')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left"
                            >
                                <Settings2 className="w-5 h-5 text-purple-400 mb-2" />
                                <div className="font-medium text-white text-sm">{t('discordBot.quickActions.maintenance.label')}</div>
                                <div className="text-xs text-slate-500">{t('discordBot.quickActions.maintenance.desc')}</div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bot Configuration Section */}
            {
                activeSection === 'bot' && (
                    <div className="grid lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
                        {!selectedClusterId ? (
                            <div className="lg:col-span-2 glass-panel rounded-2xl p-12 text-center space-y-6 flex flex-col items-center justify-center">
                                <div className="p-4 bg-amber-500/10 rounded-full border border-amber-500/20">
                                    <AlertTriangle className="w-10 h-10 text-amber-500" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-white">{t('discordBot.bot.clusterRequired')}</h3>
                                    <p className="text-slate-400 max-w-md mx-auto">
                                        {t('discordBot.bot.clusterRequiredDesc')}
                                    </p>
                                </div>
                                <button
                                    onClick={handleCreateDefaultCluster}
                                    disabled={isCreatingCluster}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isCreatingCluster ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                    {t('discordBot.bot.createDefault')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-6">
                                    {/* Status Card */}
                                    <div className="glass-panel rounded-2xl p-6">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("p-2.5 rounded-xl", bridgeConfig.enabled ? "bg-green-500/10" : "bg-slate-700/50")}>
                                                    <Bot className={cn("w-6 h-6", bridgeConfig.enabled ? "text-green-400" : "text-slate-400")} />
                                                </div>
                                                <div>
                                                    <h2 className="text-lg font-bold text-white">{t('discordBot.bot.bridgeStatus')}</h2>
                                                    <p className="text-sm text-slate-500">
                                                        {bridgeConfig.enabled ? t('discordBot.bot.active') : t('discordBot.bot.stopped')}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={toggleBridge}
                                                className={cn(
                                                    "w-12 h-7 rounded-full transition-all duration-300 relative flex items-center shrink-0 border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900",
                                                    bridgeConfig.enabled
                                                        ? "bg-green-500 border-green-400 shadow-[0_0_12px_rgba(34,197,94,0.4)] focus:ring-green-500"
                                                        : "bg-slate-800 border-slate-600 focus:ring-slate-500"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-5 h-5 bg-white rounded-full transition-transform duration-300 shadow-sm mx-1",
                                                    bridgeConfig.enabled ? "translate-x-5" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('discordBot.bot.token')}</label>
                                                <input
                                                    type="password"
                                                    value={bridgeConfig.bot_token}
                                                    onChange={e => setBridgeConfig(c => ({ ...c, bot_token: e.target.value }))}
                                                    placeholder="MTE..."
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('discordBot.bot.guildId')}</label>
                                                <input
                                                    type="text"
                                                    value={bridgeConfig.guild_id}
                                                    onChange={e => setBridgeConfig(c => ({ ...c, guild_id: e.target.value }))}
                                                    placeholder="Server ID"
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                                />
                                            </div>

                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    onClick={saveBridgeConfig}
                                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 font-medium transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle className="w-4 h-4" /> {t('discordBot.bot.saveConfig')}
                                                </button>
                                                <button
                                                    onClick={testBridge}
                                                    disabled={isBridgeTesting}
                                                    className="px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    {isBridgeTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />} {t('discordBot.bot.test')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Features Toggles */}
                                    <div className="glass-panel rounded-2xl p-6">
                                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                            <Settings2 className="w-4 h-4 text-indigo-400" />
                                            {t('discordBot.bot.features.title')}
                                        </h3>
                                        <div className="space-y-3">
                                            {[
                                                { label: t('discordBot.bot.features.gameToDiscord.label'), sub: t('discordBot.bot.features.gameToDiscord.sub'), key: 'game_to_discord' },
                                                { label: t('discordBot.bot.features.discordToGame.label'), sub: t('discordBot.bot.features.discordToGame.sub'), key: 'discord_to_game' },
                                                { label: t('discordBot.bot.features.showTribeNames.label'), sub: t('discordBot.bot.features.showTribeNames.sub'), key: 'show_tribe_names' },
                                                { label: t('discordBot.bot.features.showPlaytime.label'), sub: t('discordBot.bot.features.showPlaytime.sub'), key: 'show_playtime' },
                                            ].map(opt => (
                                                <div key={opt.key} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                                    <div>
                                                        <div className="text-sm font-medium text-white">{opt.label}</div>
                                                        <div className="text-xs text-slate-500">{opt.sub}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => setBridgeConfig(c => ({ ...c, [opt.key]: !(c as any)[opt.key] }))}
                                                        className={cn(
                                                            "w-11 h-6 rounded-full transition-all duration-300 relative flex items-center shrink-0 border",
                                                            (bridgeConfig as any)[opt.key]
                                                                ? "bg-indigo-500 border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                                                                : "bg-slate-800 border-slate-600"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm mx-1",
                                                            (bridgeConfig as any)[opt.key] ? "translate-x-5" : "translate-x-0"
                                                        )} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* Channel Configuration */}
                                    <div className="glass-panel rounded-2xl p-6">
                                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                            <MessageCircle className="w-4 h-4 text-pink-400" />
                                            {t('discordBot.channelConfig.title')}
                                        </h3>

                                        <div className="space-y-5">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('discordBot.channelConfig.label')}</label>
                                                <input
                                                    type="text"
                                                    value={bridgeConfig.channel_id}
                                                    onChange={e => setBridgeConfig(c => ({ ...c, channel_id: e.target.value }))}
                                                    placeholder={t('discordBot.channelConfig.placeholder')}
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500 font-mono text-sm"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">{t('discordBot.channelConfig.desc')}</p>
                                            </div>

                                            <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <List className="w-4 h-4 text-cyan-400" />
                                                        <span className="text-sm font-medium text-white">{t('discordBot.channelConfig.liveStats')}</span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="text-xs text-slate-400">{t('discordBot.channelConfig.serverList')}</label>
                                                        <button
                                                            onClick={() => setBridgeConfig(c => ({ ...c, server_list_enabled: !c.server_list_enabled }))}
                                                            className={cn("text-xs font-medium", bridgeConfig.server_list_enabled ? "text-green-400" : "text-slate-500")}
                                                        >
                                                            {bridgeConfig.server_list_enabled ? t('enabled') : t('disabled')}
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={bridgeConfig.server_list_channel_id}
                                                        onChange={e => setBridgeConfig(c => ({ ...c, server_list_channel_id: e.target.value }))}
                                                        disabled={!bridgeConfig.server_list_enabled}
                                                        placeholder={t('discordBot.channelConfig.placeholderServer')}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm disabled:opacity-50"
                                                    />
                                                </div>

                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="text-xs text-slate-400">{t('discordBot.channelConfig.playerList')}</label>
                                                        <button
                                                            onClick={() => setBridgeConfig(c => ({ ...c, player_list_enabled: !c.player_list_enabled }))}
                                                            className={cn("text-xs font-medium", bridgeConfig.player_list_enabled ? "text-green-400" : "text-slate-500")}
                                                        >
                                                            {bridgeConfig.player_list_enabled ? t('enabled') : t('disabled')}
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={bridgeConfig.player_list_channel_id}
                                                        onChange={e => setBridgeConfig(c => ({ ...c, player_list_channel_id: e.target.value }))}
                                                        disabled={!bridgeConfig.player_list_enabled}
                                                        placeholder={t('discordBot.channelConfig.placeholderPlayer')}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm disabled:opacity-50"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
                                        {t('discordBot.channelConfig.note')}
                                    </div>
                                </div>

                            </>
                        )}
                    </div>
                )
            }

            {/* Admin Commands Section */}
            {
                activeSection === 'admin' && (
                    <div className="grid lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
                        {/* Admin Channel Config */}
                        <div className="glass-panel rounded-2xl p-6 space-y-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-red-500/10 rounded-xl">
                                    <Shield className="w-5 h-5 text-red-500" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">{t('discordBot.admin.title')}</h2>
                                    <p className="text-sm text-slate-500">{t('discordBot.admin.subtitle')}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                        {t('discordBot.admin.label')}
                                    </label>
                                    <input
                                        type="text"
                                        value={bridgeConfig.admin_channel_id}
                                        onChange={e => setBridgeConfig(c => ({ ...c, admin_channel_id: e.target.value }))}
                                        placeholder={t('discordBot.admin.placeholder')}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                                    />
                                    <p className="text-xs text-slate-500 mt-2">
                                        <span dangerouslySetInnerHTML={{ __html: t('discordBot.admin.desc') }} />
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                        {t('discordBot.admin.adminRoles', 'Admin Role IDs (Comma separated)')}
                                    </label>
                                    <input
                                        type="text"
                                        value={bridgeConfig.admin_role_ids.join(', ')}
                                        onChange={e => setBridgeConfig(c => ({ ...c, admin_role_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                                        placeholder="Role ID 1, Role ID 2"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                                    />
                                    <p className="text-xs text-slate-500 mt-2">
                                        {t('discordBot.admin.adminRolesDesc', 'Roles that have full control over bot commands.')}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                        {t('discordBot.admin.modRoles', 'Moderator Role IDs (Comma separated)')}
                                    </label>
                                    <input
                                        type="text"
                                        value={bridgeConfig.moderator_role_ids.join(', ')}
                                        onChange={e => setBridgeConfig(c => ({ ...c, moderator_role_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                                        placeholder="Role ID 1, Role ID 2"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                                    />
                                    <p className="text-xs text-slate-500 mt-2">
                                        {t('discordBot.admin.modRolesDesc', 'Roles that can perform safe actions like broadcasts or status checks.')}
                                    </p>
                                </div>

                                <button
                                    onClick={saveBridgeConfig}
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <CheckCircle className="w-4 h-4" /> {t('discordBot.admin.save')}
                                </button>
                            </div>
                        </div>

                        {/* Command Reference */}
                        <div className="glass-panel rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                <List className="w-4 h-4 text-indigo-400" />
                                {t('discordBot.admin.commandsTitle')}
                            </h3>

                            <div className="space-y-2">
                                {[
                                    { cmd: '!list', desc: t('discordBot.commands.list') },
                                    { cmd: '!start <ServerID>', desc: t('discordBot.commands.start') },
                                    { cmd: '!stop <ServerID>', desc: t('discordBot.commands.stop') },
                                    { cmd: '!restart <ServerID>', desc: t('discordBot.commands.restart') },
                                    { cmd: '!update <ServerID>', desc: t('discordBot.commands.update') },
                                    { cmd: '!kick <ServerID> <SteamID>', desc: t('discordBot.commands.kick') },
                                    { cmd: '!broadcast <ServerID> <msg>', desc: t('discordBot.commands.broadcast') },
                                    { cmd: '!status', desc: t('discordBot.commands.status') },
                                ].map((c, i) => (
                                    <div key={i} className="flex items-center justify-between p-2.5 bg-slate-800/30 rounded-lg border border-slate-700/30 hover:border-slate-600 transition-colors group">
                                        <code className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">
                                            {c.cmd}
                                        </code>
                                        <span className="text-xs text-slate-400 group-hover:text-slate-300">{c.desc}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-700/50">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">{t('discordBot.admin.serverIdsTitle')}</h4>
                                <div className="space-y-2 bg-slate-900/50 p-3 rounded-lg max-h-40 overflow-y-auto custom-scrollbar">
                                    {servers.map(server => (
                                        <div key={server.id} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("w-2 h-2 rounded-full", server.status === 'running' || server.status === 'online' ? "bg-green-500" : "bg-slate-600")} />
                                                <span className="text-slate-300 font-medium truncate max-w-[180px]" title={server.name}>{server.name}</span>
                                            </div>
                                            <code className="bg-slate-800 px-2 py-0.5 rounded text-indigo-400 font-bold">ID: {server.id}</code>
                                        </div>
                                    ))}
                                    {servers.length === 0 && (
                                        <div className="text-xs text-slate-500 italic text-center py-2">{t('discordBot.admin.noServers')}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Alerts Section */}
            {
                activeSection === 'alerts' && (
                    <div className="glass-panel rounded-2xl p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/10 rounded-xl">
                                    <Bell className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">{t('discordBot.alerts.title')}</h2>
                                    <p className="text-sm text-slate-500">{t('discordBot.alerts.active', { count: enabledCount, total: alerts.length })}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={enableAllAlerts}
                                    className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/30 transition-colors"
                                >
                                    {t('discordBot.alerts.enableAll')}
                                </button>
                                <button
                                    onClick={disableAllAlerts}
                                    className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
                                >
                                    {t('discordBot.alerts.disableAll')}
                                </button>
                            </div>
                        </div>

                        {/* Grouped Alerts */}
                        {(['server', 'player', 'system'] as const).map(category => (
                            <div key={category} className="space-y-2">
                                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                                    {category === 'server' && t('discordBot.alerts.serverEvents')}
                                    {category === 'player' && t('discordBot.alerts.playerEvents')}
                                    {category === 'system' && t('discordBot.alerts.systemEvents')}
                                </h3>
                                <div className="grid sm:grid-cols-2 gap-3 pb-2">
                                    {alerts.filter(a => a.category === category).map((alert) => {
                                        const Icon = alert.icon;
                                        return (
                                            <div
                                                key={alert.key}
                                                className={cn(
                                                    "flex items-start justify-between p-4 rounded-2xl border transition-all duration-300 cursor-pointer relative overflow-hidden group hover:-translate-y-0.5",
                                                    alert.enabled
                                                        ? "bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border-indigo-500/30 shadow-[0_8px_20px_-6px_rgba(99,102,241,0.15)]"
                                                        : "bg-slate-800/40 border-slate-700/50 hover:border-slate-600/80 hover:bg-slate-800/60"
                                                )}
                                                onClick={() => toggleAlert(alert.key)}
                                            >
                                                {/* Background glow when active */}
                                                {alert.enabled && (
                                                    <div className="absolute top-0 right-0 p-16 bg-indigo-500/10 rounded-full blur-2xl -z-10 animate-pulse transition-opacity"></div>
                                                )}

                                                <div className="flex gap-4">
                                                    <div className={cn(
                                                        "p-3 rounded-xl transition-all duration-300 mt-0.5 border shadow-sm",
                                                        alert.enabled
                                                            ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30 shadow-indigo-500/10"
                                                            : "bg-slate-800/80 text-slate-400 border-slate-700/80"
                                                    )}>
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className={cn(
                                                            "font-bold text-sm tracking-wide mb-1 transition-colors",
                                                            alert.enabled ? "text-white" : "text-slate-300 group-hover:text-slate-200"
                                                        )}>
                                                            {alert.label}
                                                        </div>
                                                        <div className="text-xs text-slate-500 leading-relaxed pr-2">
                                                            {alert.description}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "w-11 h-6 rounded-full transition-all duration-300 relative flex items-center shrink-0 border",
                                                    alert.enabled
                                                        ? "bg-indigo-500 border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                                                        : "bg-slate-800 border-slate-600"
                                                )}>
                                                    <div className={cn(
                                                        "w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm mx-1",
                                                        alert.enabled ? "translate-x-5" : "translate-x-0"
                                                    )} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <Eye className="w-4 h-4" />
                                {t('discordBot.alerts.autoSave')}
                            </div>
                            <div className="text-xs text-slate-500">
                                {t('discordBot.alerts.autoSaveDesc')}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Activity Section */}
            {
                activeSection === 'activity' && (
                    <div className="glass-panel rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-500/10 rounded-xl">
                                <History className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">{t('discordBot.activity.title')}</h2>
                                <p className="text-sm text-slate-500">{t('discordBot.activity.subtitle')}</p>
                            </div>
                        </div>

                        {recentNotifications.length === 0 ? (
                            <div className="text-center py-12">
                                <History className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                                <p className="text-slate-400">{t('discordBot.activity.noRecent')}</p>
                                <p className="text-sm text-slate-500">{t('discordBot.activity.desc')}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {recentNotifications.map(notification => (
                                    <div
                                        key={notification.id}
                                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                                <Send className="w-4 h-4 text-indigo-400" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-white text-sm">{notification.type}</div>
                                                <div className="text-xs text-slate-500">{notification.message}</div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {notification.timestamp.toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            }
        </div>
    )
}

