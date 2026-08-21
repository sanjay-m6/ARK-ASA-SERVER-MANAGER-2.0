import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare, Bell, Send, CheckCircle, Loader2, AlertTriangle,
    Users, RefreshCw, Shield, Webhook, Bot, Server as ServerIcon,
    Activity, Zap, Clock, Radio, Eye, PlayCircle, StopCircle, Settings2,
    History, Wifi, WifiOff, Link, MessageCircle, List, Plus,
    Copy, UserCheck, UserX, Sparkles, Terminal, Search, ExternalLink,
    Trash2, Sliders, Check, Layers
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

import { cn } from '../utils/helpers';
import {
    getSetting, setSetting,
    getDiscordBridgeConfig, saveDiscordBridgeConfig,
    startDiscordBridge, stopDiscordBridge, testDiscordConnection,
    generateBotInviteUrl,
    getDiscordPlayerLinks, unlinkDiscordPlayer,
    getDiscordAuditLogs, clearDiscordAuditLogs,
    getDiscordDiagnostics, triggerDiscordSetup, refreshDiscordDashboard,
    getDiscordRateLimitConfig, setDiscordRateLimitConfig,
    type DiscordBridgeConfig, type DiscordPlayerLink,
    type DiscordAuditLogEntry, type DiscordDiagnosticsInfo,
    getClusters, createCluster
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
    const [activeSection, setActiveSection] = useState<'webhook' | 'bot' | 'admin' | 'players' | 'audit' | 'diagnostics' | 'alerts' | 'activity'>('webhook');
    const [bridgeConfig, setBridgeConfig] = useState<DiscordBridgeConfig>({
        cluster_id: 1,
        enabled: false,
        bot_token: '',
        guild_id: '',
        channel_id: '',
        admin_channel_id: '',
        notifications_channel_id: '',
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
        show_playtime: true,
        status_update_interval: 60
    });
    const [isBridgeTesting, setIsBridgeTesting] = useState(false);
    const [isCopyingInvite, setIsCopyingInvite] = useState(false);

    const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
    const [isCreatingCluster, setIsCreatingCluster] = useState(false);

    // Setup Wizard state
    const [isTriggeringSetup, setIsTriggeringSetup] = useState(false);

    // Dashboard refresh state
    const [isRefreshingDashboard, setIsRefreshingDashboard] = useState(false);

    // Player Linking state
    const [linkedPlayers, setLinkedPlayers] = useState<DiscordPlayerLink[]>([]);
    const [isLoadingLinks, setIsLoadingLinks] = useState(false);
    const [playerSearchQuery, setPlayerSearchQuery] = useState('');

    // Audit Logs state
    const [auditLogs, setAuditLogs] = useState<DiscordAuditLogEntry[]>([]);
    const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
    const [auditActionFilter, setAuditActionFilter] = useState<string>('all');

    // Diagnostics state
    const [diagnostics, setDiagnostics] = useState<DiscordDiagnosticsInfo | null>(null);
    const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);

    // Rate Limiting state
    const [rateLimitMax, setRateLimitMax] = useState<number>(5);
    const [rateLimitWindow, setRateLimitWindow] = useState<number>(10);
    const [isSavingRateLimits, setIsSavingRateLimits] = useState(false);

    // Real-time connection check
    const checkConnection = useCallback(async () => {
        if (!webhookUrl) {
            setConnectionStatus('disconnected');
            return;
        }

        setConnectionStatus('checking');
        try {
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

    // Initial data load
    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            try {
                // Load servers
                await refreshServers();

                // Load Webhook URL
                const savedUrl = await getSetting('discord_webhook_url');
                if (savedUrl) {
                    setWebhookUrl(savedUrl);
                    setSavedWebhookUrl(savedUrl);
                }

                // Load Alert Config
                const savedAlerts = await getSetting('discord_alerts_config');
                if (savedAlerts) {
                    try {
                        const parsed = JSON.parse(savedAlerts);
                        setAlerts(prev => prev.map(a => ({
                            ...a,
                            enabled: parsed[a.key] !== undefined ? parsed[a.key] : a.enabled
                        })));
                    } catch (e) {
                        console.error('Failed to parse alerts config:', e);
                    }
                }

                // Load Clusters & Bridge Config
                const clustersList = await getClusters();
                if (clustersList.length > 0) {
                    const firstClusterId = clustersList[0].id;
                    setSelectedClusterId(firstClusterId);

                    const cfg = await getDiscordBridgeConfig(firstClusterId);
                    if (cfg) {
                        setBridgeConfig(cfg);
                    } else {
                        setBridgeConfig(prev => ({ ...prev, cluster_id: firstClusterId }));
                    }

                    // Load initial rate limit for cluster
                    try {
                        const rl = await getDiscordRateLimitConfig(firstClusterId);
                        if (rl) {
                            setRateLimitMax(rl[0]);
                            setRateLimitWindow(rl[1]);
                        }
                    } catch (e) {
                        console.error('Failed to load rate limits:', e);
                    }
                } else {
                    setSelectedClusterId(null);
                }

            } catch (error) {
                console.error('Error loading Discord data:', error);
                toast.error(t('discordBot.toasts.loadFailed'));
            } finally {
                setIsLoading(false);
            }
        };

        loadInitialData();
    }, [refreshServers, t]);

    // Listen for backend real-time Discord notifications
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let isMounted = true;

        listen('discord-notification', (event: { payload: { type?: string; message?: string; server?: string } }) => {
            if (!isMounted) return;
            const newNotification: RecentNotification = {
                id: Date.now().toString(),
                type: event.payload.type || 'Alert',
                message: event.payload.message || 'Notification sent to Discord',
                timestamp: new Date(),
                server: event.payload.server
            };
            setRecentNotifications(prev => [newNotification, ...prev].slice(0, 15));
        }).then(fn => {
            if (isMounted) unlisten = fn;
            else fn();
        }).catch(err => console.error('Failed to listen to discord-notification:', err));

        return () => {
            isMounted = false;
            if (unlisten) unlisten();
        };
    }, []);

    // Check connection on webhookUrl change
    useEffect(() => {
        if (webhookUrl) {
            checkConnection();
        } else {
            setConnectionStatus('disconnected');
        }
    }, [webhookUrl, checkConnection]);

    const loadLinkedPlayers = async () => {
        setIsLoadingLinks(true);
        try {
            const links = await getDiscordPlayerLinks(selectedClusterId || undefined);
            setLinkedPlayers(links);
        } catch (err) {
            console.error('Failed to load linked players:', err);
        } finally {
            setIsLoadingLinks(false);
        }
    };

    const handleUnlinkPlayer = async (discordUserId: string) => {
        try {
            await unlinkDiscordPlayer(discordUserId);
            toast.success('Player unlinked successfully');
            await loadLinkedPlayers();
        } catch (err) {
            toast.error(typeof err === 'string' ? err : 'Failed to unlink player');
        }
    };

    const loadAuditLogs = async () => {
        setIsLoadingAuditLogs(true);
        try {
            const logs = await getDiscordAuditLogs(100);
            setAuditLogs(logs);
        } catch (err) {
            console.error('Failed to load audit logs:', err);
        } finally {
            setIsLoadingAuditLogs(false);
        }
    };

    const handleClearAuditLogs = async () => {
        try {
            await clearDiscordAuditLogs();
            toast.success('Discord audit logs cleared');
            setAuditLogs([]);
        } catch (err) {
            toast.error(typeof err === 'string' ? err : 'Failed to clear audit logs');
        }
    };

    const loadDiagnostics = async () => {
        setIsLoadingDiagnostics(true);
        try {
            const diag = await getDiscordDiagnostics(selectedClusterId || bridgeConfig.cluster_id || 1);
            setDiagnostics(diag);
        } catch (err) {
            console.error('Failed to load diagnostics:', err);
        } finally {
            setIsLoadingDiagnostics(false);
        }
    };

    const handleSaveRateLimits = async () => {
        setIsSavingRateLimits(true);
        try {
            await setDiscordRateLimitConfig(selectedClusterId || bridgeConfig.cluster_id || 1, rateLimitMax, rateLimitWindow);
            toast.success('Rate limits updated successfully');
        } catch (err) {
            toast.error(typeof err === 'string' ? err : 'Failed to save rate limits');
        } finally {
            setIsSavingRateLimits(false);
        }
    };

    const handleTriggerSetup = async () => {
        if (!bridgeConfig.bot_token) {
            toast.error('Bot Token is required for automated setup');
            return;
        }
        if (!bridgeConfig.guild_id) {
            toast.error('Discord Server (Guild) ID is required');
            return;
        }
        setIsTriggeringSetup(true);
        try {
            await triggerDiscordSetup(selectedClusterId || bridgeConfig.cluster_id || 1, bridgeConfig.guild_id);
            toast.success('Discord channels provisioned and linked successfully!');
            // Re-fetch config to get all populated channel IDs
            if (selectedClusterId) {
                const updated = await getDiscordBridgeConfig(selectedClusterId);
                if (updated) setBridgeConfig(updated);
            }
        } catch (err) {
            toast.error(typeof err === 'string' ? err : 'Setup failed');
        } finally {
            setIsTriggeringSetup(false);
        }
    };

    const handleRefreshDashboard = async () => {
        setIsRefreshingDashboard(true);
        try {
            await refreshDiscordDashboard(selectedClusterId || bridgeConfig.cluster_id || 1);
            toast.success('Status dashboard embed refreshed in Discord!');
        } catch (err) {
            toast.error(typeof err === 'string' ? err : 'Failed to push dashboard update');
        } finally {
            setIsRefreshingDashboard(false);
        }
    };

    const copyInviteUrl = async () => {
        setIsCopyingInvite(true);
        try {
            const inviteUrl = await generateBotInviteUrl(bridgeConfig.bot_token);
            await navigator.clipboard.writeText(inviteUrl);
            toast.success('Discord Bot Invite URL copied to clipboard!');
        } catch (err) {
            toast.error('Failed to copy invite URL');
        } finally {
            setIsCopyingInvite(false);
        }
    };

    const openInviteUrl = async () => {
        try {
            const inviteUrl = await generateBotInviteUrl(bridgeConfig.bot_token);
            window.open(inviteUrl, '_blank');
        } catch (err) {
            toast.error('Failed to generate invite URL');
        }
    };

    const handleCreateDefaultCluster = async () => {
        setIsCreatingCluster(true);
        try {
            const newCluster = await createCluster("Main Cluster", []);
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

    const saveWebhook = async () => {
        const trimmed = webhookUrl.trim();
        if (!trimmed) {
            toast.error(t('discordBot.toasts.enterUrl'));
            return;
        }
        setIsSaving(true);
        try {
            await setSetting('discord_webhook_url', trimmed);
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

                if (webhookUrl !== savedWebhookUrl) {
                    await setSetting('discord_webhook_url', webhookUrl);
                    setSavedWebhookUrl(webhookUrl);
                }

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
                        title: `📢 ${type}`,
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
            let targetClusterId = bridgeConfig.cluster_id;

            const currentClusters = await getClusters();
            const clusterExists = currentClusters.some(c => c.id === targetClusterId);

            if (!clusterExists) {
                if (currentClusters.length > 0) {
                    targetClusterId = currentClusters[0].id;
                    setBridgeConfig(prev => ({ ...prev, cluster_id: targetClusterId }));
                    setSelectedClusterId(targetClusterId);
                } else {
                    const newCluster = await createCluster("Main Cluster", []);
                    targetClusterId = newCluster.id;
                    setBridgeConfig(prev => ({ ...prev, cluster_id: newCluster.id }));
                    setSelectedClusterId(newCluster.id);
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

    const featureToggles: Array<{ label: string; sub: string; key: 'game_to_discord' | 'discord_to_game' | 'show_tribe_names' | 'show_playtime' }> = [
        { label: t('discordBot.bot.features.gameToDiscord.label'), sub: t('discordBot.bot.features.gameToDiscord.sub'), key: 'game_to_discord' },
        { label: t('discordBot.bot.features.discordToGame.label'), sub: t('discordBot.bot.features.discordToGame.sub'), key: 'discord_to_game' },
        { label: t('discordBot.bot.features.showTribeNames.label'), sub: t('discordBot.bot.features.showTribeNames.sub'), key: 'show_tribe_names' },
        { label: t('discordBot.bot.features.showPlaytime.label'), sub: t('discordBot.bot.features.showPlaytime.sub'), key: 'show_playtime' },
    ];

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

                    <button
                        onClick={() => navigate('/tools/discord-control')}
                        className="flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all shadow-sm font-medium text-sm cursor-pointer"
                    >
                        <MessageSquare className="w-4 h-4" />
                        <span>Remote Control Panel</span>
                    </button>

                    <button
                        onClick={() => setLiveMode(!liveMode)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-full border transition-all cursor-pointer",
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
                    { key: 'admin', label: t('discordBot.tabs.admin', 'Admin & Security'), icon: Shield },
                    { key: 'players', label: t('discordBot.tabs.players', 'Linked Players'), icon: Users },
                    { key: 'audit', label: 'Audit Logs', icon: History },
                    { key: 'diagnostics', label: 'Diagnostics', icon: Activity },
                    { key: 'alerts', label: t('discordBot.tabs.alerts', 'Alerts'), icon: Bell },
                    { key: 'activity', label: t('discordBot.tabs.activity', 'Recent Events'), icon: Send }
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeSection === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => {
                                setActiveSection(tab.key as typeof activeSection);
                                if (tab.key === 'players') loadLinkedPlayers();
                                if (tab.key === 'audit') loadAuditLogs();
                                if (tab.key === 'diagnostics') loadDiagnostics();
                            }}
                            className={cn(
                                "flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 cursor-pointer select-none",
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
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50 font-medium cursor-pointer"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                    {hasUnsavedChanges ? t('discordBot.webhook.save') : t('discordBot.webhook.saved')}
                                </button>
                                <button
                                    onClick={testWebhook}
                                    disabled={isTesting || !webhookUrl}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors font-medium cursor-pointer",
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
                            <h4 className="font-semibold text-slate-300 mb-2">{t('discordBot.webhook.howToTitle')}</h4>
                            <ol className="list-decimal list-inside space-y-1 text-xs">
                                <li>{t('discordBot.webhook.step1')}</li>
                                <li>{t('discordBot.webhook.step2')}</li>
                                <li>{t('discordBot.webhook.step3')}</li>
                                <li>{t('discordBot.webhook.step4')}</li>
                            </ol>
                        </div>
                    </div>

                    <div className="glass-panel rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-500/10 rounded-xl">
                                <Zap className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">{t('discordBot.quickActions.title')}</h2>
                                <p className="text-sm text-slate-500">{t('discordBot.quickActions.subtitle')}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => sendQuickNotification('Server Alert', 'Server restart in 15 minutes')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left cursor-pointer"
                            >
                                <Clock className="w-5 h-5 text-amber-400 mb-2" />
                                <div className="font-medium text-white text-sm">{t('discordBot.quickActions.restartWarn.label')}</div>
                                <div className="text-xs text-slate-500">{t('discordBot.quickActions.restartWarn.desc')}</div>
                            </button>
                            <button
                                onClick={() => sendQuickNotification('Important Announcement', 'Server updates completed')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left cursor-pointer"
                            >
                                <Bell className="w-5 h-5 text-green-400 mb-2" />
                                <div className="font-medium text-white text-sm">{t('discordBot.quickActions.updateDone.label')}</div>
                                <div className="text-xs text-slate-500">{t('discordBot.quickActions.updateDone.desc')}</div>
                            </button>
                            <button
                                onClick={() => sendQuickNotification('Emergency', 'Immediate server reboot required')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left cursor-pointer"
                            >
                                <RefreshCw className="w-5 h-5 text-blue-400 mb-2" />
                                <div className="font-medium text-white text-sm">{t('discordBot.quickActions.restart.label')}</div>
                                <div className="text-xs text-slate-500">{t('discordBot.quickActions.restart.desc')}</div>
                            </button>
                            <button
                                onClick={() => sendQuickNotification('Maintenance', 'Scheduled maintenance beginning')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left cursor-pointer"
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
            {activeSection === 'bot' && (
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
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
                            >
                                {isCreatingCluster ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                {t('discordBot.bot.createDefault')}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 1-Click Discord Auto Setup Wizard Banner */}
                            <div className="lg:col-span-2 glass-panel rounded-2xl p-6 bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-blue-900/40 border border-indigo-500/30 shadow-xl relative overflow-hidden">
                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider border border-indigo-500/30">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Zero-Friction Discord Management Center
                                        </div>
                                        <h3 className="text-xl font-bold text-white tracking-wide">
                                            Automated Channel & Category Provisioning
                                        </h3>
                                        <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                                            Invite your Discord bot, then either click <strong className="text-white">Run Auto-Setup</strong> below or type <code className="bg-black/40 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold">/setup</code> inside Discord. We automatically create category permissions and provision all 5 dedicated channels:
                                        </p>

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {[
                                                { name: '#📊-status-dashboard', ok: !!bridgeConfig.server_list_channel_id },
                                                { name: '#👥-player-roster', ok: !!bridgeConfig.player_list_channel_id },
                                                { name: '#💬-cross-chat', ok: !!bridgeConfig.channel_id },
                                                { name: '#🚨-server-alerts', ok: !!bridgeConfig.notifications_channel_id },
                                                { name: '#🔒-admin-console', ok: !!bridgeConfig.admin_channel_id },
                                            ].map((ch, idx) => (
                                                <span key={idx} className={cn(
                                                    "inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg border",
                                                    ch.ok
                                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                                        : "bg-slate-800/80 border-slate-700 text-slate-400"
                                                )}>
                                                    {ch.ok ? <Check className="w-3 h-3 text-emerald-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                                                    {ch.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
                                        <button
                                            onClick={handleTriggerSetup}
                                            disabled={isTriggeringSetup || !bridgeConfig.bot_token || !bridgeConfig.guild_id}
                                            className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 disabled:opacity-50 cursor-pointer"
                                        >
                                            {isTriggeringSetup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            Run Auto-Setup
                                        </button>
                                        <button
                                            onClick={copyInviteUrl}
                                            disabled={isCopyingInvite || !bridgeConfig.bot_token}
                                            className="px-4 py-3 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 border border-indigo-500/30 disabled:opacity-50 cursor-pointer"
                                            title="Copy OAuth2 Invite Link"
                                        >
                                            {isCopyingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                                            Copy Invite
                                        </button>
                                        <button
                                            onClick={openInviteUrl}
                                            disabled={!bridgeConfig.bot_token}
                                            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                                            title="Open Bot Invite in Browser"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Bot Credentials & Status Card */}
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
                                                "w-12 h-7 rounded-full transition-all duration-300 relative flex items-center shrink-0 border cursor-pointer focus:outline-none",
                                                bridgeConfig.enabled
                                                    ? "bg-green-500 border-green-400 shadow-[0_0_12px_rgba(34,197,94,0.4)]"
                                                    : "bg-slate-800 border-slate-600"
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
                                                placeholder="e.g. 112233445566778899"
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                            />
                                        </div>

                                        <div className="flex gap-3 pt-2">
                                            <button
                                                onClick={saveBridgeConfig}
                                                disabled={isSaving}
                                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                            >
                                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                                {t('discordBot.bot.saveConfig')}
                                            </button>
                                            <button
                                                onClick={testBridge}
                                                disabled={isBridgeTesting}
                                                className="px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                            >
                                                {isBridgeTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />} {t('discordBot.bot.test')}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Live Embed Auto-Sync Settings */}
                                <div className="glass-panel rounded-2xl p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <Activity className="w-4 h-4 text-cyan-400" />
                                            Live Dashboard Auto-Sync
                                        </h3>
                                        <button
                                            onClick={handleRefreshDashboard}
                                            disabled={isRefreshingDashboard || !bridgeConfig.enabled}
                                            className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 rounded-lg border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                                        >
                                            {isRefreshingDashboard ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            Push Update Now
                                        </button>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between text-xs mb-2">
                                            <span className="text-slate-400">Update Interval: <strong className="text-white">{bridgeConfig.status_update_interval || 60}s</strong></span>
                                            <span className="text-slate-500">15s - 300s</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="15"
                                            max="300"
                                            step="5"
                                            value={bridgeConfig.status_update_interval || 60}
                                            onChange={e => setBridgeConfig(c => ({ ...c, status_update_interval: parseInt(e.target.value) || 60 }))}
                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                    </div>
                                </div>

                                {/* Features Toggles */}
                                <div className="glass-panel rounded-2xl p-6">
                                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                        <Settings2 className="w-4 h-4 text-indigo-400" />
                                        {t('discordBot.bot.features.title')}
                                    </h3>
                                    <div className="space-y-3">
                                        {featureToggles.map(opt => (
                                            <div key={opt.key} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                                <div>
                                                    <div className="text-sm font-medium text-white">{opt.label}</div>
                                                    <div className="text-xs text-slate-500">{opt.sub}</div>
                                                </div>
                                                <button
                                                    onClick={() => setBridgeConfig(c => ({ ...c, [opt.key]: !c[opt.key] }))}
                                                    className={cn(
                                                        "w-11 h-6 rounded-full transition-all duration-300 relative flex items-center shrink-0 border cursor-pointer",
                                                        bridgeConfig[opt.key]
                                                            ? "bg-indigo-500 border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                                                            : "bg-slate-800 border-slate-600"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm mx-1",
                                                        bridgeConfig[opt.key] ? "translate-x-5" : "translate-x-0"
                                                    )} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Dedicated Channels Mapping */}
                                <div className="glass-panel rounded-2xl p-6 space-y-4">
                                    <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                                        <MessageCircle className="w-4 h-4 text-pink-400" />
                                        Channel Routing & Provisioning IDs
                                    </h3>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                            💬 Cross-Chat Channel ID
                                        </label>
                                        <input
                                            type="text"
                                            value={bridgeConfig.channel_id}
                                            onChange={e => setBridgeConfig(c => ({ ...c, channel_id: e.target.value }))}
                                            placeholder="Channel ID for in-game & Discord talk"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500 font-mono text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                            🚨 Server Alerts Channel ID
                                        </label>
                                        <input
                                            type="text"
                                            value={bridgeConfig.notifications_channel_id || ''}
                                            onChange={e => setBridgeConfig(c => ({ ...c, notifications_channel_id: e.target.value }))}
                                            placeholder="Channel ID for restarts, crashes, backups"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                            🔒 Admin Console Channel ID
                                        </label>
                                        <input
                                            type="text"
                                            value={bridgeConfig.admin_channel_id}
                                            onChange={e => setBridgeConfig(c => ({ ...c, admin_channel_id: e.target.value }))}
                                            placeholder="Private channel for /rcon and audit alerts"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                                        />
                                    </div>

                                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <List className="w-4 h-4 text-cyan-400" />
                                                <span className="text-sm font-medium text-white">Interactive Live Dashboards</span>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs text-slate-400">📊 Status Dashboard Channel</label>
                                                <button
                                                    onClick={() => setBridgeConfig(c => ({ ...c, server_list_enabled: !c.server_list_enabled }))}
                                                    className={cn("text-xs font-medium cursor-pointer", bridgeConfig.server_list_enabled ? "text-green-400" : "text-slate-500")}
                                                >
                                                    {bridgeConfig.server_list_enabled ? t('enabled') : t('disabled')}
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={bridgeConfig.server_list_channel_id}
                                                onChange={e => setBridgeConfig(c => ({ ...c, server_list_channel_id: e.target.value }))}
                                                disabled={!bridgeConfig.server_list_enabled}
                                                placeholder="Channel ID for Status Dashboard"
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm disabled:opacity-50"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs text-slate-400">👥 Player Roster Channel</label>
                                                <button
                                                    onClick={() => setBridgeConfig(c => ({ ...c, player_list_enabled: !c.player_list_enabled }))}
                                                    className={cn("text-xs font-medium cursor-pointer", bridgeConfig.player_list_enabled ? "text-green-400" : "text-slate-500")}
                                                >
                                                    {bridgeConfig.player_list_enabled ? t('enabled') : t('disabled')}
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={bridgeConfig.player_list_channel_id}
                                                onChange={e => setBridgeConfig(c => ({ ...c, player_list_channel_id: e.target.value }))}
                                                disabled={!bridgeConfig.player_list_enabled}
                                                placeholder="Channel ID for Player Roster"
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm disabled:opacity-50"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Admin & Security Section */}
            {activeSection === 'admin' && (
                <div className="grid lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
                    <div className="glass-panel rounded-2xl p-6 space-y-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2.5 bg-red-500/10 rounded-xl">
                                <Shield className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Permissions & Security Tier Guard</h2>
                                <p className="text-sm text-slate-500">Configure role requirements and anti-spam limits for remote Discord commands</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Admin Role IDs (Full Control)
                                </label>
                                <input
                                    type="text"
                                    value={bridgeConfig.admin_role_ids.join(', ')}
                                    onChange={e => setBridgeConfig(c => ({ ...c, admin_role_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                                    placeholder="Role ID 1, Role ID 2"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                    Members with these Discord roles can perform destructive operations (RCON, Restarts, Backups, Updates).
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Moderator Role IDs (Moderation & Whitelist)
                                </label>
                                <input
                                    type="text"
                                    value={bridgeConfig.moderator_role_ids.join(', ')}
                                    onChange={e => setBridgeConfig(c => ({ ...c, moderator_role_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                                    placeholder="Role ID 1, Role ID 2"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                    Members with these roles can inspect players, whitelist, kick, and view dashboards.
                                </p>
                            </div>

                            {/* Rate Limiting Configuration Card */}
                            <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Sliders className="w-4 h-4 text-indigo-400" />
                                    <span className="text-sm font-semibold text-white">Rate Limiter Protection</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Max Requests</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="50"
                                            value={rateLimitMax}
                                            onChange={e => setRateLimitMax(parseInt(e.target.value) || 5)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Window (Seconds)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="300"
                                            value={rateLimitWindow}
                                            onChange={e => setRateLimitWindow(parseInt(e.target.value) || 10)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleSaveRateLimits}
                                    disabled={isSavingRateLimits}
                                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold rounded-lg border border-indigo-500/30 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                                >
                                    {isSavingRateLimits ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                    Save Rate Limit Settings
                                </button>
                            </div>

                            <button
                                onClick={saveBridgeConfig}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <CheckCircle className="w-4 h-4" /> Save Security Configuration
                            </button>
                        </div>
                    </div>

                    {/* Slash Command Documentation */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-indigo-400" />
                            Registered Discord Slash Commands
                        </h3>

                        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                            {[
                                { cmd: '/setup', desc: 'Auto-create channels & link Discord to server manager' },
                                { cmd: '/status', desc: 'Interactive server dashboard with real-time gauges & dropdown' },
                                { cmd: '/players', desc: 'List active online players across all cluster servers' },
                                { cmd: '/player [query]', desc: 'Inspect player dossier, total playtime, sessions & stats' },
                                { cmd: '/link [steam_id]', desc: 'Link player Discord profile to Steam/EOS account' },
                                { cmd: '/whitelist [steam_id]', desc: 'Add player to the cluster server whitelist' },
                                { cmd: '/backup [server_id]', desc: 'Save world and trigger immediate server backup' },
                                { cmd: '/rcon [server_id] [command]', desc: 'Execute remote RCON console command securely' },
                                { cmd: '/start [server_id]', desc: 'Start a specific server instance remotely' },
                                { cmd: '/stop [server_id]', desc: 'Gracefully shutdown a server instance' },
                                { cmd: '/restart [server_id]', desc: 'Restart a server instance remotely' },
                                { cmd: '/update [server_id]', desc: 'Trigger SteamCMD update for server instance' },
                                { cmd: '/kick [server_id] [steam_id]', desc: 'Kick a player from the server via RCON' },
                                { cmd: '/ban [server_id] [steam_id]', desc: 'Ban a player from the server' },
                            ].map((c, i) => (
                                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-800/30 rounded-lg border border-slate-700/30 hover:border-slate-600 transition-colors group">
                                    <code className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded font-mono">
                                        {c.cmd}
                                    </code>
                                    <span className="text-xs text-slate-400 group-hover:text-slate-300 ml-2 text-right">{c.desc}</span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-700/50">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Available Servers & IDs</h4>
                            <div className="space-y-2 bg-slate-900/50 p-3 rounded-lg max-h-36 overflow-y-auto custom-scrollbar">
                                {servers.map(server => (
                                    <div key={server.id} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full", server.status === 'running' || server.status === 'online' ? "bg-green-500" : "bg-slate-600")} />
                                            <span className="text-slate-300 font-medium truncate max-w-[180px]" title={server.name}>{server.name}</span>
                                        </div>
                                        <code className="bg-slate-800 px-2 py-0.5 rounded text-indigo-400 font-bold">ID: {server.id}</code>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Linked Players Section */}
            {activeSection === 'players' && (
                <div className="glass-panel rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                                <UserCheck className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Community Linked Accounts</h2>
                                <p className="text-sm text-slate-500">Players who linked their Discord to Steam/EOS using <code className="text-xs font-mono bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded">/link</code></p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={playerSearchQuery}
                                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                                    placeholder="Search by name, Steam ID, or Discord ID..."
                                    className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                                />
                            </div>
                            <button
                                onClick={() => loadLinkedPlayers()}
                                disabled={isLoadingLinks}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Refresh List"
                            >
                                <RefreshCw className={cn("w-4 h-4", isLoadingLinks && "animate-spin")} />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-700/60 text-slate-400 font-semibold uppercase tracking-wider">
                                    <th className="pb-3 px-3">Survivor / Steam</th>
                                    <th className="pb-3 px-3">Discord Profile</th>
                                    <th className="pb-3 px-3">Linked Date</th>
                                    <th className="pb-3 px-3">Status</th>
                                    <th className="pb-3 px-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {linkedPlayers
                                    .filter(p => {
                                        if (!playerSearchQuery.trim()) return true;
                                        const q = playerSearchQuery.toLowerCase();
                                        return (
                                            (p.player_name && p.player_name.toLowerCase().includes(q)) ||
                                            p.steam_id.toLowerCase().includes(q) ||
                                            p.discord_user_id.toLowerCase().includes(q)
                                        );
                                    })
                                    .map(player => (
                                        <tr key={player.discord_user_id} className="hover:bg-slate-800/30 transition-colors group">
                                            <td className="py-3 px-3">
                                                <div className="font-bold text-white text-sm">{player.player_name || 'Survivor'}</div>
                                                <div className="font-mono text-slate-400 text-[11px]">{player.steam_id}</div>
                                            </td>
                                            <td className="py-3 px-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded text-[11px] border border-indigo-500/20">
                                                        ID: {player.discord_user_id}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-3 text-slate-400">
                                                {player.linked_at || 'Just now'}
                                            </td>
                                            <td className="py-3 px-3">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                                                    player.verified
                                                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                                                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                                )}>
                                                    {player.verified ? 'Verified' : 'Pending'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-right">
                                                <button
                                                    onClick={() => handleUnlinkPlayer(player.discord_user_id)}
                                                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg border border-red-500/20 transition-all font-medium inline-flex items-center gap-1.5 text-xs cursor-pointer"
                                                >
                                                    <UserX className="w-3.5 h-3.5" />
                                                    Unlink
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>

                        {linkedPlayers.length === 0 && !isLoadingLinks && (
                            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl mt-4">
                                <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                                <p className="text-sm font-medium text-slate-300">No linked players yet</p>
                                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                                    Players can link their accounts anytime directly in Discord by running <code className="text-indigo-400 font-mono">/link steam_id:YOUR_STEAM_ID</code>.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Audit Logs Section */}
            {activeSection === 'audit' && (
                <div className="glass-panel rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                                <History className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Discord Remote Management Audit Log</h2>
                                <p className="text-sm text-slate-500">Immutable ledger of administrative actions, RCON commands, and remote operations</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <select
                                value={auditActionFilter}
                                onChange={e => setAuditActionFilter(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="all">All Actions</option>
                                <option value="rcon">RCON Commands</option>
                                <option value="restart">Server Restarts</option>
                                <option value="backup">Backups</option>
                                <option value="whitelist">Whitelist Changes</option>
                                <option value="kick">Kicks / Bans</option>
                            </select>

                            <button
                                onClick={loadAuditLogs}
                                disabled={isLoadingAuditLogs}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Refresh Logs"
                            >
                                <RefreshCw className={cn("w-4 h-4", isLoadingAuditLogs && "animate-spin")} />
                            </button>

                            <button
                                onClick={handleClearAuditLogs}
                                className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Clear History
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-700/60 text-slate-400 font-semibold uppercase tracking-wider">
                                    <th className="pb-3 px-3">Timestamp</th>
                                    <th className="pb-3 px-3">User</th>
                                    <th className="pb-3 px-3">Server</th>
                                    <th className="pb-3 px-3">Action</th>
                                    <th className="pb-3 px-3">Result</th>
                                    <th className="pb-3 px-3">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {auditLogs
                                    .filter(log => {
                                        if (auditActionFilter === 'all') return true;
                                        return log.actionType.toLowerCase().includes(auditActionFilter.toLowerCase());
                                    })
                                    .map(log => (
                                        <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="py-3 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                                                {log.createdAt}
                                            </td>
                                            <td className="py-3 px-3">
                                                <span className="font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded text-[11px]">
                                                    {log.discordUsername ? `@${log.discordUsername}` : log.discordUserId}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3">
                                                {log.serverId ? (
                                                    <span className="font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded text-[11px]">
                                                        Server #{log.serverId}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500 text-[11px]">Cluster-wide</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-3 font-semibold text-white">
                                                {log.actionType}
                                            </td>
                                            <td className="py-3 px-3">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                                                    log.result === 'SUCCESS' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                                                    log.result === 'DENIED' && "bg-red-500/10 text-red-400 border-red-500/30",
                                                    log.result === 'RATE_LIMITED' && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                                                    log.result === 'FAILED' && "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                                )}>
                                                    {log.result}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-slate-300 font-mono text-[11px] max-w-xs truncate" title={log.details || log.errorMessage || ''}>
                                                {log.details || log.errorMessage || '—'}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>

                        {auditLogs.length === 0 && !isLoadingAuditLogs && (
                            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl mt-4">
                                <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                                <p className="text-sm font-medium text-slate-300">No Discord administrative actions recorded yet</p>
                                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                                    All slash commands and button interactions executed via Discord are logged here automatically.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Diagnostics Section */}
            {activeSection === 'diagnostics' && (
                <div className="glass-panel rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-cyan-500/10 rounded-xl">
                                <Activity className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Discord Bridge Gateway Diagnostics</h2>
                                <p className="text-sm text-slate-500">Live WebSocket health, gateway metrics, and channel configuration status</p>
                            </div>
                        </div>

                        <button
                            onClick={loadDiagnostics}
                            disabled={isLoadingDiagnostics}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", isLoadingDiagnostics && "animate-spin")} />
                            Run Diagnostics Check
                        </button>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-1">
                            <div className="text-xs text-slate-400 uppercase font-semibold">Gateway Connection</div>
                            <div className="flex items-center gap-2 pt-1">
                                <div className={cn("w-3 h-3 rounded-full", diagnostics?.gatewayConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                                <div className="text-xl font-bold text-white">
                                    {diagnostics?.gatewayConnected ? 'Connected' : 'Disconnected'}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-1">
                            <div className="text-xs text-slate-400 uppercase font-semibold">Bot Process Uptime</div>
                            <div className="text-xl font-bold text-white pt-1">
                                {diagnostics ? `${Math.floor(diagnostics.uptimeSeconds / 3600)}h ${Math.floor((diagnostics.uptimeSeconds % 3600) / 60)}m` : '0h 0m'}
                            </div>
                        </div>

                        <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-1">
                            <div className="text-xs text-slate-400 uppercase font-semibold">Commands Executed</div>
                            <div className="text-xl font-bold text-white pt-1">
                                {diagnostics?.commandsProcessed ?? 0}
                            </div>
                        </div>
                    </div>

                    {/* Channels Health List */}
                    <div className="p-5 bg-slate-800/20 rounded-xl border border-slate-700/50 space-y-3">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-400" />
                            Channel Routing Integrity Check
                        </h4>

                        <div className="grid sm:grid-cols-2 gap-3">
                            {[
                                { name: 'Status Dashboard', id: bridgeConfig.server_list_channel_id, desc: 'Real-time embed gauges' },
                                { name: 'Player Roster', id: bridgeConfig.player_list_channel_id, desc: 'Active survivor table' },
                                { name: 'Cross-Chat', id: bridgeConfig.channel_id, desc: 'In-game bidirectional relay' },
                                { name: 'Server Alerts', id: bridgeConfig.notifications_channel_id, desc: 'Crash & restart alerts' },
                                { name: 'Admin Console', id: bridgeConfig.admin_channel_id, desc: 'Privileged commands & audit' },
                            ].map((ch, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                    <div>
                                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                                            {ch.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                                            {ch.name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{ch.id || 'Not configured'}</div>
                                    </div>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                                        ch.id ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                                    )}>
                                        {ch.id ? 'Ready' : 'Unset'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Alerts Section */}
            {activeSection === 'alerts' && (
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
                                className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/30 transition-colors cursor-pointer"
                            >
                                {t('discordBot.alerts.enableAll')}
                            </button>
                            <button
                                onClick={disableAllAlerts}
                                className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors cursor-pointer"
                            >
                                {t('discordBot.alerts.disableAll')}
                            </button>
                        </div>
                    </div>

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
            )}

            {/* Activity Section */}
            {activeSection === 'activity' && (
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
            )}
        </div>
    );
}
