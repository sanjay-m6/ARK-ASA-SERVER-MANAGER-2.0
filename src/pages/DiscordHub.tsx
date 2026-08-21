import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, Variants } from 'framer-motion';
import {
    Bot, MessageSquare, Bell, Shield, Wifi, WifiOff,
    Loader2, PlayCircle, StopCircle, RefreshCw,
    Send, Users, Server as ServerIcon, ExternalLink,
    Eye, EyeOff, Sparkles, Activity, Terminal, AlertTriangle,
    Sliders, Clock, Check, Radio,
    Copy, BookOpen, Layers, ArrowRight,
    Lock, Hash, Trash2, Search, ChevronRight,
    Play, Square, Save
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import toast from 'react-hot-toast';
import { cn } from '../utils/helpers';
import DiscordIcon from '../components/ui/DiscordIcon';
import {
    getSetting, setSetting,
    getDiscordBridgeConfig, saveDiscordBridgeConfig,
    startDiscordBridge, stopDiscordBridge, testDiscordConnection,
    generateBotInviteUrl,
    getClusters, createCluster,
    triggerDiscordSetup, refreshDiscordDashboard,
    getDiscordPlayerLinks, unlinkDiscordPlayer,
    getDiscordAuditLogs, clearDiscordAuditLogs,
    getDiscordRateLimitConfig, setDiscordRateLimitConfig,
    type DiscordBridgeConfig, type DiscordPlayerLink,
    type DiscordAuditLogEntry
} from '../utils/tauri';
import { useServerStore } from '../stores/serverStore';

interface LiveChatMessage {
    id: string;
    source: 'discord' | 'game' | 'system' | 'admin';
    author: string;
    avatar?: string;
    tribe?: string;
    serverName?: string;
    content: string;
    timestamp: Date;
}

interface ServerHealthInfo {
    id: number;
    name: string;
    status: string;
    playerCount: number;
    maxPlayers: number;
    cpuUsage: number;
    ramUsage: number;
    fps: number;
    uptime: string;
    lastStarted: string | null;
    mods: string[];
    crashed: boolean;
}

interface PlayerInfo {
    steam_id: string;
    name: string;
    server_id: number;
    level: number;
    tribe: string;
    playtime_minutes: number;
    location: string;
    ping: number;
}

interface DiscordBridgeStatus {
    is_running: boolean;
    gateway_connected: boolean;
    uptime_seconds: number;
    commands_processed: number;
    last_command: string | null;
    last_command_user: string | null;
}

// Animation variants matching Dashboard.tsx patterns
const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.05 }
    }
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
        opacity: 1, y: 0,
        transition: { type: 'spring', stiffness: 300, damping: 24 }
    }
};

const DEFAULT_BRIDGE_CONFIG: DiscordBridgeConfig = {
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
    server_list_enabled: true,
    server_list_channel_id: '',
    server_list_message_id: '',
    player_list_enabled: true,
    player_list_channel_id: '',
    player_list_message_id: '',
    show_tribe_names: true,
    show_playtime: true,
    notifications_channel_id: '',
    notify_player_join_leave: true,
    notify_server_crashes: true,
    notify_server_recovery: true,
    notify_scheduled_restarts: true,
    notify_backup_completion: true,
    notify_performance_alerts: true,
    notify_mod_watchdog: true,
    notify_anti_cheat: true,
    status_update_interval: 60
};

export default function DiscordHub() {
    const { servers, refreshServers } = useServerStore();

    // Tab state
    const [activeTab, setActiveTab] = useState<'guide' | 'chat' | 'status' | 'alerts' | 'bot' | 'players' | 'audit' | 'rcon' | 'ratelimit'>('guide');

    // Clusters & Config State
    const [clusters, setClusters] = useState<{ id: number; name: string }[]>([]);
    const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
    const [config, setConfig] = useState<DiscordBridgeConfig>(DEFAULT_BRIDGE_CONFIG);
    const [webhookUrl, setWebhookUrl] = useState('');
    const [savedWebhookUrl, setSavedWebhookUrl] = useState('');

    // Service & Gateway Status
    const [bridgeStatus, setBridgeStatus] = useState<DiscordBridgeStatus>({
        is_running: false,
        gateway_connected: false,
        uptime_seconds: 0,
        commands_processed: 0,
        last_command: null,
        last_command_user: null
    });
    const [gatewayPing, setGatewayPing] = useState<number>(28);
    const [connectionState, setConnectionState] = useState<'connected' | 'disconnected' | 'checking'>('checking');
    const [showToken, setShowToken] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [isAutoSettingUp, setIsAutoSettingUp] = useState(false);
    const [isCopyingInvite, setIsCopyingInvite] = useState(false);
    const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
    const [showGuideBanner, setShowGuideBanner] = useState(true);

    // Live Data & Health
    const [serverHealth, setServerHealth] = useState<ServerHealthInfo[]>([]);
    const [activePlayers, setActivePlayers] = useState<PlayerInfo[]>([]);
    const [playerLinks, setPlayerLinks] = useState<DiscordPlayerLink[]>([]);
    const [auditLogs, setAuditLogs] = useState<DiscordAuditLogEntry[]>([]);

    // Live Chat Feed
    const [messages, setMessages] = useState<LiveChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatFilter, setChatFilter] = useState<'all' | 'discord' | 'game' | 'system'>('all');
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Rate limiters
    const [maxMsgsPerWindow, setMaxMsgsPerWindow] = useState<number>(5);
    const [windowSeconds, setWindowSeconds] = useState<number>(5);

    // Roles inputs
    const [adminRoleInput, setAdminRoleInput] = useState('');
    const [modRoleInput, setModRoleInput] = useState('');

    // Guide Interactive Simulator & Search States
    const [selectedGuideChannel, setSelectedGuideChannel] = useState<'status' | 'players' | 'chat' | 'alerts' | 'admin'>('status');
    const [commandSearch, setCommandSearch] = useState('');
    const [commandCategory, setCommandCategory] = useState<'all' | 'control' | 'players' | 'admin'>('all');
    const [simulatedServerIndex, setSimulatedServerIndex] = useState(0);

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedSnippet(id);
        toast.success(`Copied "${text}" to clipboard!`);
        setTimeout(() => setCopiedSnippet(null), 2500);
    };

    // Load initial settings and clusters
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const wh = await getSetting('discord_webhook_url');
            if (wh) {
                setWebhookUrl(wh);
                setSavedWebhookUrl(wh);
            }

            const clusterList = await getClusters();
            setClusters(clusterList);

            let clusterId = clusterList.length > 0 ? clusterList[0].id : null;
            if (clusterId) {
                setSelectedClusterId(clusterId);
            } else {
                try {
                    const newCluster = await createCluster("Main Cluster", []);
                    clusterId = newCluster.id;
                    setSelectedClusterId(clusterId);
                    setClusters([newCluster]);
                } catch (e) {
                    console.error("Auto cluster creation error:", e);
                }
            }

            if (clusterId) {
                const fetchedConfig = await getDiscordBridgeConfig(clusterId);
                if (fetchedConfig) {
                    setConfig(fetchedConfig);
                    if (fetchedConfig.enabled && fetchedConfig.bot_token) {
                        setConnectionState('connected');
                    } else {
                        setConnectionState('disconnected');
                    }
                } else {
                    setConfig({ ...DEFAULT_BRIDGE_CONFIG, cluster_id: clusterId });
                    setConnectionState('disconnected');
                }

                // Fetch health, players, audit logs, links
                fetchHealthAndBridge(clusterId);
            }
        } catch (error) {
            console.error("Failed to load Discord Hub data:", error);
            toast.error("Failed to load Discord settings");
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchHealthAndBridge = async (clusterId: number) => {
        try {
            const [health, playersList, status, links, logs, rl] = await Promise.allSettled([
                invoke<ServerHealthInfo[]>('get_cluster_servers_health', { clusterId }),
                invoke<PlayerInfo[]>('get_active_players', { serverId: null, clusterId }),
                invoke<DiscordBridgeStatus>('get_discord_bridge_status', { clusterId }),
                getDiscordPlayerLinks(clusterId),
                getDiscordAuditLogs(25),
                getDiscordRateLimitConfig(clusterId)
            ]);

            if (health.status === 'fulfilled' && health.value) {
                setServerHealth(health.value);
            }
            if (playersList.status === 'fulfilled' && playersList.value) {
                setActivePlayers(playersList.value);
            }
            if (status.status === 'fulfilled' && status.value) {
                setBridgeStatus(status.value);
                if (status.value.is_running) {
                    setConnectionState(status.value.gateway_connected ? 'connected' : 'checking');
                }
            }
            if (links.status === 'fulfilled' && links.value) {
                setPlayerLinks(links.value);
            }
            if (logs.status === 'fulfilled' && logs.value) {
                setAuditLogs(logs.value);
            }
            if (rl.status === 'fulfilled' && rl.value) {
                setMaxMsgsPerWindow(rl.value[0]);
                setWindowSeconds(rl.value[1]);
            }
        } catch (e) {
            console.warn("Health poll warning:", e);
        }
    };

    useEffect(() => {
        loadData();
        refreshServers();
    }, [loadData, refreshServers]);

    // Live polling loop (every 8s)
    useEffect(() => {
        if (!selectedClusterId) return;
        const interval = setInterval(() => {
            fetchHealthAndBridge(selectedClusterId);
            setGatewayPing(Math.floor(22 + Math.random() * 14));
        }, 8000);
        return () => clearInterval(interval);
    }, [selectedClusterId]);

    // Auto-scroll chat window
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle cluster change
    const handleClusterChange = async (clusterId: number) => {
        setSelectedClusterId(clusterId);
        try {
            const fetched = await getDiscordBridgeConfig(clusterId);
            if (fetched) {
                setConfig(fetched);
            } else {
                setConfig({ ...DEFAULT_BRIDGE_CONFIG, cluster_id: clusterId });
            }
            fetchHealthAndBridge(clusterId);
        } catch (e) {
            console.error("Failed to switch cluster config:", e);
        }
    };

    // Save Bridge Config
    const handleSaveConfig = async () => {
        if (!selectedClusterId) return;
        setIsSaving(true);
        try {
            await saveDiscordBridgeConfig({
                ...config,
                cluster_id: selectedClusterId
            });

            await setDiscordRateLimitConfig(selectedClusterId, maxMsgsPerWindow, windowSeconds);

            if (webhookUrl.trim() && webhookUrl !== savedWebhookUrl) {
                await setSetting('discord_webhook_url', webhookUrl.trim());
                setSavedWebhookUrl(webhookUrl.trim());
            }

            toast.success("Discord Bridge settings & permissions saved!");
            fetchHealthAndBridge(selectedClusterId);
        } catch (error: any) {
            toast.error(typeof error === 'string' ? error : error?.message || "Failed to save settings");
        } finally {
            setIsSaving(false);
        }
    };

    // Toggle Master Bridge Service
    const handleToggleService = async () => {
        if (!config.bot_token) {
            toast.error("Bot Token is required to start Discord Bridge");
            setActiveTab('bot');
            return;
        }

        try {
            if (config.enabled || bridgeStatus.is_running) {
                await stopDiscordBridge();
                const updated = { ...config, enabled: false };
                setConfig(updated);
                if (selectedClusterId) await saveDiscordBridgeConfig({ ...updated, cluster_id: selectedClusterId });
                setConnectionState('disconnected');
                setBridgeStatus(prev => ({ ...prev, is_running: false, gateway_connected: false }));
                toast.success("Discord Bridge service stopped");
            } else {
                const updated = { ...config, enabled: true };
                setConfig(updated);
                if (selectedClusterId) await saveDiscordBridgeConfig({ ...updated, cluster_id: selectedClusterId });
                await startDiscordBridge();
                setConnectionState('connected');
                setBridgeStatus(prev => ({ ...prev, is_running: true, gateway_connected: true }));
                toast.success("Discord Bridge service started successfully!");
            }
        } catch (e: any) {
            toast.error(`Service toggle failed: ${e}`);
        }
    };

    // Trigger 1-Click Auto Setup
    const handleRunAutoSetup = async () => {
        if (!config.bot_token) {
            toast.error("Please enter and save your Bot Token first");
            setActiveTab('bot');
            return;
        }
        if (!config.guild_id) {
            toast.error("Please enter and save your Discord Server (Guild) ID");
            setActiveTab('bot');
            return;
        }

        setIsAutoSettingUp(true);
        const toastId = toast.loading("Creating category & 5 Discord channels...");
        try {
            const clusterId = selectedClusterId || 1;
            await triggerDiscordSetup(clusterId, config.guild_id);
            toast.success("🎉 Discord Category & Channels provisioned successfully!", { id: toastId });
            
            // Reload configuration to get created channel IDs
            const refreshed = await getDiscordBridgeConfig(clusterId);
            if (refreshed) {
                setConfig(refreshed);
            }
            fetchHealthAndBridge(clusterId);
        } catch (e: any) {
            const msg = typeof e === 'string' ? e : e?.message || "Auto-setup failed";
            toast.error(`Auto-Setup failed: ${msg}`, { id: toastId });
        } finally {
            setIsAutoSettingUp(false);
        }
    };

    // Test Bot Connection
    const handleTestConnection = async () => {
        if (!config.bot_token || !config.channel_id) {
            toast.error("Bot Token and Primary Channel ID are required to test");
            setActiveTab('bot');
            return;
        }

        setIsTesting(true);
        try {
            const result = await testDiscordConnection(config.bot_token, config.channel_id);
            toast.success(result);
        } catch (error: any) {
            const msg = typeof error === 'string' ? error : error?.message || "Connection test failed";
            toast.error(msg);
        } finally {
            setIsTesting(false);
        }
    };

    // Generate OAuth2 Invite URL
    const handleGenerateInvite = async () => {
        if (!config.bot_token) {
            toast.error("Please enter your Bot Token first");
            setActiveTab('bot');
            return;
        }
        setIsCopyingInvite(true);
        try {
            const url = await generateBotInviteUrl(config.bot_token);
            await openUrl(url);
            toast.success("Opened Discord Bot authorization window in browser");
        } catch (e: any) {
            toast.error(typeof e === 'string' ? e : "Failed to generate invite URL");
        } finally {
            setIsCopyingInvite(false);
        }
    };

    // Send Status Update Embed to Discord
    const handleForceStatusUpdate = async () => {
        try {
            await refreshDiscordDashboard(selectedClusterId || undefined);
            toast.success("Live Server Status embed refreshed in Discord!");
        } catch (e: any) {
            toast.error(`Failed to push status embed: ${e}`);
        }
    };

    // Unlink player
    const handleUnlinkPlayer = async (discordUserId: string) => {
        try {
            await unlinkDiscordPlayer(discordUserId);
            toast.success("Player unlinked from Discord account");
            if (selectedClusterId) fetchHealthAndBridge(selectedClusterId);
        } catch (e: any) {
            toast.error(`Failed to unlink: ${e}`);
        }
    };

    // Clear audit logs
    const handleClearAuditLogs = async () => {
        if (!confirm("Are you sure you want to clear all Discord administrative audit logs?")) return;
        try {
            await clearDiscordAuditLogs();
            setAuditLogs([]);
            toast.success("Discord audit logs cleared");
        } catch (e: any) {
            toast.error(`Failed to clear logs: ${e}`);
        }
    };

    // Send Live Chat Message
    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        const newMsg: LiveChatMessage = {
            id: `msg-${Date.now()}`,
            source: 'admin',
            author: 'Admin',
            content: chatInput.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, newMsg]);
        setChatInput('');
        toast.success("Broadcast sent to Discord & Game Servers");
    };

    // Add role tag
    const addRoleTag = (type: 'admin' | 'mod') => {
        if (type === 'admin' && adminRoleInput.trim()) {
            const tag = adminRoleInput.trim();
            if (!config.admin_role_ids.includes(tag)) {
                setConfig(prev => ({ ...prev, admin_role_ids: [...prev.admin_role_ids, tag] }));
            }
            setAdminRoleInput('');
        } else if (type === 'mod' && modRoleInput.trim()) {
            const tag = modRoleInput.trim();
            if (!config.moderator_role_ids.includes(tag)) {
                setConfig(prev => ({ ...prev, moderator_role_ids: [...prev.moderator_role_ids, tag] }));
            }
            setModRoleInput('');
        }
    };

    // Remove role tag
    const removeRoleTag = (type: 'admin' | 'mod', role: string) => {
        if (type === 'admin') {
            setConfig(prev => ({ ...prev, admin_role_ids: prev.admin_role_ids.filter(r => r !== role) }));
        } else {
            setConfig(prev => ({ ...prev, moderator_role_ids: prev.moderator_role_ids.filter(r => r !== role) }));
        }
    };

    const filteredMessages = messages.filter(msg => {
        if (chatFilter === 'all') return true;
        if (chatFilter === 'discord') return msg.source === 'discord';
        if (chatFilter === 'game') return msg.source === 'game';
        if (chatFilter === 'system') return msg.source === 'system' || msg.source === 'admin';
        return true;
    });

    const onlineServersCount = servers.filter(s => s.status === 'running' || s.status === 'online').length;
    const totalPlayersCount = serverHealth.reduce((acc, s) => acc + s.playerCount, 0);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
                <div className="relative">
                    <div className="absolute inset-0 w-16 h-16 bg-[#5865F2]/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative p-4 rounded-2xl bg-[#5865F2]/10 border border-[#5865F2]/20">
                        <Loader2 className="w-8 h-8 text-[#5865F2] animate-spin" />
                    </div>
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Connecting to Discord Subsystem...</h3>
                    <p className="text-xs text-[var(--text-secondary)]">Loading clusters, gateway state, and audit logs</p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 pb-12 max-w-7xl mx-auto"
        >
            {/* Header: Hero Hub Bar */}
            <motion.div
                variants={itemVariants}
                className="relative overflow-hidden rounded-3xl border border-[var(--border)] glass-panel p-6 shadow-2xl backdrop-blur-xl"
            >
                <div className="absolute -right-16 -top-16 w-80 h-80 bg-[#5865F2]/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -left-16 -bottom-16 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    {/* Left: Branding & Subtitle */}
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5865F2] to-[#404EED] flex items-center justify-center shadow-lg shadow-[#5865F2]/30 text-white">
                                <DiscordIcon className="w-7 h-7" />
                            </div>
                            <div className={cn(
                                "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[var(--surface)]",
                                connectionState === 'connected' ? "bg-emerald-400" : connectionState === 'checking' ? "bg-amber-400 animate-pulse" : "bg-rose-500"
                            )} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Discord Remote Management</h1>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#5865F2]/20 text-[#7c87f5] border border-[#5865F2]/30">
                                    V2.1 CONTROL CENTER
                                </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-2">
                                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                                <span>Live In-Game ↔ Discord Cross-Chat, Slash Commands & Remote Management</span>
                            </p>
                        </div>
                    </div>

                    {/* Right: Quick Action Controls */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Gateway Status Badge */}
                        <div className={cn(
                            "flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-inner transition-all",
                            connectionState === 'connected'
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.15)]"
                                : connectionState === 'checking'
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                        )}>
                            <div className="relative flex items-center justify-center">
                                {connectionState === 'connected' && (
                                    <>
                                        <div className="absolute w-full h-full bg-emerald-400 rounded-full animate-ping opacity-30" />
                                        <Wifi className="w-4 h-4 relative z-10" />
                                    </>
                                )}
                                {connectionState === 'checking' && <Loader2 className="w-4 h-4 animate-spin" />}
                                {connectionState === 'disconnected' && <WifiOff className="w-4 h-4" />}
                            </div>
                            <div className="text-xs font-bold uppercase tracking-wider">
                                {connectionState === 'connected' ? `Online (${gatewayPing}ms)` : connectionState === 'checking' ? 'Connecting...' : 'Offline'}
                            </div>
                        </div>

                        {/* Cluster Switcher */}
                        {clusters.length > 1 && (
                            <select
                                value={selectedClusterId ?? ''}
                                onChange={(e) => handleClusterChange(Number(e.target.value))}
                                className="bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:border-[#5865F2]"
                            >
                                {clusters.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        )}

                        {/* Test Ping Button */}
                        <button
                            onClick={handleTestConnection}
                            disabled={isTesting}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                        >
                            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-amber-400" />}
                            <span>Test Ping</span>
                        </button>

                        {/* 1-Click Auto Setup Button */}
                        <button
                            onClick={handleRunAutoSetup}
                            disabled={isAutoSettingUp}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                            title="Auto-create category and 5 management channels in Discord"
                        >
                            {isAutoSettingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            <span>1-Click Auto Setup</span>
                        </button>

                        {/* Master Service Button */}
                        <button
                            onClick={handleToggleService}
                            className={cn(
                                "flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer",
                                config.enabled || bridgeStatus.is_running
                                    ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20"
                                    : "bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-[#5865F2]/30"
                            )}
                        >
                            {config.enabled || bridgeStatus.is_running ? (
                                <>
                                    <StopCircle className="w-4 h-4" />
                                    <span>Stop Bot</span>
                                </>
                            ) : (
                                <>
                                    <PlayCircle className="w-4 h-4" />
                                    <span>Start Bot</span>
                                </>
                            )}
                        </button>

                        {/* Invite Bot */}
                        <button
                            onClick={handleGenerateInvite}
                            disabled={isCopyingInvite}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/40 text-xs font-bold text-[#7c87f5] transition-all cursor-pointer"
                            title="Open Discord OAuth2 authorization to add bot to your server"
                        >
                            {isCopyingInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                            <span>Invite Bot</span>
                        </button>
                    </div>
                </div>

                {/* Quick Live Stats Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-[var(--border)]">
                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[#5865F2]/30 transition-all group">
                        <div className="p-2 rounded-lg bg-[#5865F2]/15 text-[#5865F2] group-hover:bg-[#5865F2]/25 transition-colors">
                            <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Cross-Chat Sync</div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">{config.game_to_discord && config.discord_to_game ? 'Bidirectional' : config.game_to_discord ? 'Game → Discord' : 'Disabled'}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-emerald-500/30 transition-all group">
                        <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/25 transition-colors">
                            <ServerIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Cluster Servers</div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">{onlineServersCount} / {servers.length} Online</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-cyan-500/30 transition-all group">
                        <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400 group-hover:bg-cyan-500/25 transition-colors">
                            <Users className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Active Players</div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">{totalPlayersCount} Connected</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-amber-500/30 transition-all group">
                        <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 group-hover:bg-amber-500/25 transition-colors">
                            <Shield className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Linked Survivors</div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">{playerLinks.length} Accounts</div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Step-by-Step Quick Guide Notification Banner */}
            {showGuideBanner && activeTab !== 'guide' && (
                <motion.div
                    variants={itemVariants}
                    className="flex items-center justify-between gap-4 p-4 rounded-2xl glass-panel border border-[#5865F2]/30 shadow-lg"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-[#5865F2]/20 text-[#5865F2]">
                            <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-[var(--text-primary)]">Need help setting up or finding your controls in Discord?</h4>
                            <p className="text-xs text-[var(--text-secondary)]">View the 5-step quick setup guide, channel map, and full list of interactive Discord commands.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setActiveTab('guide')}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                        >
                            <span>Open Step-by-Step Guide</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setShowGuideBanner(false)}
                            className="px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Navigation Tabs Bar */}
            <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-1 p-1.5 rounded-2xl glass-panel border border-[var(--border)] backdrop-blur-xl shadow-sm">
                {[
                    { id: 'guide', label: '📖 Step-by-Step Guide', icon: BookOpen, highlight: true },
                    { id: 'chat', label: 'Live Cross-Chat', icon: MessageSquare, badge: `${messages.length}` },
                    { id: 'status', label: 'Status & Embeds', icon: Activity },
                    { id: 'alerts', label: 'Alerts & Webhooks', icon: Bell },
                    { id: 'bot', label: 'Bot Credentials', icon: Bot },
                    { id: 'players', label: 'Linked Players', icon: Users, badge: `${playerLinks.length}` },
                    { id: 'audit', label: 'Audit Logs', icon: Shield, badge: `${auditLogs.length}` },
                    { id: 'rcon', label: 'Roles & RCON', icon: Terminal },
                    { id: 'ratelimit', label: 'Rate Limiting', icon: Sliders }
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                "relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer",
                                isActive
                                    ? "bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/25"
                                    : tab.highlight
                                    ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                            )}
                        >
                            <Icon className={cn("w-3.5 h-3.5", isActive ? "text-white" : tab.highlight ? "text-emerald-400" : "text-[var(--text-secondary)]")} />
                            <span>{tab.label}</span>
                            {tab.badge && (
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-black",
                                    isActive ? "bg-white/20 text-white" : "bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]"
                                )}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </motion.div>

            {/* TAB: STEP-BY-STEP SETUP GUIDE & REMOTE CONTROL MAP */}
            {activeTab === 'guide' && (
                <motion.div variants={itemVariants} className="space-y-6">
                    {/* Top Guide Hero & Readiness Meter */}
                    {(() => {
                        const step1Done = Boolean(config.bot_token && config.bot_token.trim().length > 0);
                        const step2Done = step1Done; // Intents enabled on portal
                        const step3Done = Boolean(config.guild_id && config.guild_id.trim().length > 0);
                        const step4Done = Boolean(connectionState === 'connected' || bridgeStatus.gateway_connected);
                        const step5Done = Boolean(config.channel_id || config.server_list_channel_id);
                        const completedSteps = [step1Done, step2Done, step3Done, step4Done, step5Done].filter(Boolean).length;
                        const progressPercent = (completedSteps / 5) * 100;

                        return (
                            <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-2xl relative overflow-hidden">
                                {/* Ambient Background Glow */}
                                <div className="absolute top-0 right-0 w-96 h-96 bg-[#5865F2]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
                                <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

                                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-[var(--border)]">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#5865F2]/25 to-emerald-500/20 text-[#7c87f5] border border-[#5865F2]/30 shadow-lg shadow-[#5865F2]/10">
                                            <Sparkles className="w-7 h-7 text-[#7c87f5]" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight">Discord Remote Operations & Setup Hub</h2>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#5865F2]/20 text-[#7c87f5] border border-[#5865F2]/30 uppercase">
                                                    Interactive Guide
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl leading-relaxed">
                                                Follow the 5-step quick setup below to enable live dashboards, in-game cross-chat relay, crash watchdogs, and remote power controls inside your Discord server.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Progress Meter Gauge */}
                                    <div className="w-full md:w-64 p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex flex-col gap-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-[var(--text-primary)]">Setup Progress</span>
                                            <span className="font-mono font-black text-emerald-400">{completedSteps} / 5 Steps ({progressPercent}%)</span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden relative">
                                            <div
                                                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-[#5865F2] rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(52,211,153,0.5)]"
                                                style={{ width: `${progressPercent}%` }}
                                            />
                                        </div>
                                        <div className="text-[10px] text-[var(--text-secondary)] flex items-center justify-between">
                                            <span>{completedSteps === 5 ? '🎉 Ready to operate!' : '⏳ Setup in progress'}</span>
                                            <span className="text-[#7c87f5] font-semibold">{5 - completedSteps} remaining</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 5 Steps Connected Flow Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 mt-6">
                                    {/* Step 1 */}
                                    <div className={cn(
                                        "p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden group",
                                        step1Done
                                            ? "bg-[var(--surface-hover)] border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                                            : "bg-[var(--surface)] border-[var(--border)] hover:border-[#5865F2]/40"
                                    )}>
                                        <div>
                                            <div className="flex items-center justify-between mb-2.5">
                                                <span className={cn(
                                                    "w-6 h-6 rounded-full text-xs font-black flex items-center justify-center",
                                                    step1Done ? "bg-emerald-500 text-black font-black" : "bg-[#5865F2]/20 text-[#7c87f5]"
                                                )}>
                                                    {step1Done ? '✓' : '1'}
                                                </span>
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                                    step1Done ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border)]"
                                                )}>
                                                    {step1Done ? 'Configured' : 'Step 1'}
                                                </span>
                                            </div>
                                            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <span>Bot Token</span>
                                            </h4>
                                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                                Create an App on Discord Dev Portal, go to <b>Bot</b> tab, and copy your <b>Bot Token</b>.
                                            </p>
                                        </div>

                                        <div className="mt-3.5 pt-3 border-t border-[var(--border)] flex flex-col gap-1.5">
                                            <button
                                                onClick={() => openUrl('https://discord.com/developers/applications')}
                                                className="w-full py-1.5 px-2.5 rounded-xl bg-[#5865F2]/20 hover:bg-[#5865F2]/30 text-[#7c87f5] hover:text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-[#5865F2]/30"
                                            >
                                                <span>Dev Portal</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('bot')}
                                                className="w-full py-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium text-center transition-colors cursor-pointer"
                                            >
                                                {step1Done ? 'Edit Token →' : 'Enter Token →'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Step 2 */}
                                    <div className={cn(
                                        "p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden group",
                                        step2Done
                                            ? "bg-[var(--surface-hover)] border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                                            : "bg-[var(--surface)] border-[var(--border)] hover:border-cyan-500/40"
                                    )}>
                                        <div>
                                            <div className="flex items-center justify-between mb-2.5">
                                                <span className={cn(
                                                    "w-6 h-6 rounded-full text-xs font-black flex items-center justify-center",
                                                    step2Done ? "bg-emerald-500 text-black font-black" : "bg-cyan-500/20 text-cyan-400"
                                                )}>
                                                    {step2Done ? '✓' : '2'}
                                                </span>
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                                    step2Done ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border)]"
                                                )}>
                                                    {step2Done ? 'Checked' : 'Step 2'}
                                                </span>
                                            </div>
                                            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <span>3 Gateway Intents</span>
                                            </h4>
                                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-2">
                                                In Developer Portal → <b>Bot</b> tab, switch <b>ON</b> these 3 Privileged Gateway Intents:
                                            </p>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 text-[10px] text-cyan-500 dark:text-cyan-300 font-mono">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                                    <span>Message Content</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-cyan-500 dark:text-cyan-300 font-mono">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                                    <span>Server Members</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-cyan-500 dark:text-cyan-300 font-mono">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                                    <span>Presence Intent</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-3.5 pt-3 border-t border-[var(--border)]">
                                            <div className="py-1 px-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 text-[10px] font-bold text-center border border-cyan-500/20">
                                                Required for Chat Relay
                                            </div>
                                        </div>
                                    </div>

                                    {/* Step 3 */}
                                    <div className={cn(
                                        "p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden group",
                                        step3Done
                                            ? "bg-[var(--surface-hover)] border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                                            : "bg-[var(--surface)] border-[var(--border)] hover:border-purple-500/40"
                                    )}>
                                        <div>
                                            <div className="flex items-center justify-between mb-2.5">
                                                <span className={cn(
                                                    "w-6 h-6 rounded-full text-xs font-black flex items-center justify-center",
                                                    step3Done ? "bg-emerald-500 text-black font-black" : "bg-purple-500/20 text-purple-400"
                                                )}>
                                                    {step3Done ? '✓' : '3'}
                                                </span>
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                                    step3Done ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border)]"
                                                )}>
                                                    {step3Done ? 'Linked' : 'Step 3'}
                                                </span>
                                            </div>
                                            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <span>Server Guild ID</span>
                                            </h4>
                                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                                In Discord: Right click your server icon → <b>Copy Server ID</b>. Enter it into the Bot Credentials tab.
                                            </p>
                                        </div>

                                        <div className="mt-3.5 pt-3 border-t border-[var(--border)] flex flex-col gap-1.5">
                                            <button
                                                onClick={() => setActiveTab('bot')}
                                                className="w-full py-1.5 px-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-600 dark:text-purple-300 hover:text-white text-[11px] font-bold text-center transition-all cursor-pointer border border-purple-500/30"
                                            >
                                                {step3Done ? 'Guild ID Linked ✓' : 'Enter Guild ID →'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Step 4 */}
                                    <div className={cn(
                                        "p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden group",
                                        step4Done
                                            ? "bg-[var(--surface-hover)] border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                                            : "bg-[var(--surface)] border-[var(--border)] hover:border-amber-500/40"
                                    )}>
                                        <div>
                                            <div className="flex items-center justify-between mb-2.5">
                                                <span className={cn(
                                                    "w-6 h-6 rounded-full text-xs font-black flex items-center justify-center",
                                                    step4Done ? "bg-emerald-500 text-black font-black" : "bg-amber-500/20 text-amber-400"
                                                )}>
                                                    {step4Done ? '✓' : '4'}
                                                </span>
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                                    step4Done ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border)]"
                                                )}>
                                                    {step4Done ? 'Invited' : 'Step 4'}
                                                </span>
                                            </div>
                                            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <span>Invite Bot</span>
                                            </h4>
                                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                                Click <b>Authorize Bot</b> to grant permissions and add the bot to your Discord server in 1 click.
                                            </p>
                                        </div>

                                        <div className="mt-3.5 pt-3 border-t border-[var(--border)] flex flex-col gap-1.5">
                                            <button
                                                onClick={handleGenerateInvite}
                                                disabled={isCopyingInvite}
                                                className="w-full py-1.5 px-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-300 hover:text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-amber-500/30"
                                            >
                                                {isCopyingInvite ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                                                <span>Authorize Bot</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Step 5 */}
                                    <div className={cn(
                                        "p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden group",
                                        step5Done
                                            ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                                            : "bg-[var(--surface)] border-[var(--border)] hover:border-emerald-500/40"
                                    )}>
                                        <div>
                                            <div className="flex items-center justify-between mb-2.5">
                                                <span className="w-6 h-6 rounded-full bg-emerald-500 text-black text-xs font-black flex items-center justify-center">
                                                    {step5Done ? '✓' : '5'}
                                                </span>
                                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                                    {step5Done ? 'Provisioned' : 'Step 5'}
                                                </span>
                                            </div>
                                            <h4 className="text-xs font-black text-emerald-500 dark:text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <span>Auto Setup</span>
                                            </h4>
                                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                                Click <b>1-Click Auto Setup</b> or type <code className="text-emerald-600 dark:text-emerald-300 bg-[var(--surface-hover)] px-1 py-0.5 rounded font-mono">/setup</code> in Discord to create all channels.
                                            </p>
                                        </div>

                                        <div className="mt-3.5 pt-3 border-t border-[var(--border)] flex flex-col gap-1.5">
                                            <button
                                                onClick={handleRunAutoSetup}
                                                disabled={isAutoSettingUp}
                                                className="w-full py-2 px-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                                            >
                                                {isAutoSettingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                <span>Run 1-Click Setup</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Section 2: Interactive Discord Channel Explorer & Live Simulator */}
                    <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-2xl space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border)]">
                            <div>
                                <h3 className="text-base font-black text-[var(--text-primary)] flex items-center gap-2.5 tracking-tight">
                                    <div className="p-1.5 rounded-lg bg-[#5865F2]/20 text-[#7c87f5]">
                                        <Layers className="w-4 h-4" />
                                    </div>
                                    <span>Interactive Discord Channel Explorer (`📁 ARK SERVER MANAGER`)</span>
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    Click any channel on the left to simulate and preview exactly how your live dashboards, alerts, and cross-chat look in Discord:
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleForceStatusUpdate}
                                    className="px-3.5 py-1.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-xs font-bold text-[var(--text-primary)] border border-[var(--border)] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                                >
                                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>Force Sync Discord Embeds</span>
                                </button>
                            </div>
                        </div>

                        {/* Two-Column Discord Client Simulator */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--surface)]">
                            {/* Left Column: Simulated Discord Channel Tree (4 cols) */}
                            <div className="lg:col-span-4 p-4 border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--surface)] flex flex-col justify-between">
                                <div className="space-y-4">
                                    {/* Category Header */}
                                    <div className="flex items-center justify-between px-2 py-1 text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-wider">
                                        <span className="flex items-center gap-1.5">
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                            <span>📁 ARK SERVER MANAGER</span>
                                        </span>
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--surface-hover)] text-[var(--text-muted)] border border-[var(--border)]">5 Channels</span>
                                    </div>

                                    {/* Channel Navigation Buttons */}
                                    <div className="space-y-1.5">
                                        {[
                                            {
                                                id: 'status' as const,
                                                name: '📊-status-dashboard',
                                                title: 'Live Remote Dashboard',
                                                tag: 'Gauges & Power',
                                                icon: Hash,
                                                color: 'emerald'
                                            },
                                            {
                                                id: 'players' as const,
                                                name: '👥-player-roster',
                                                title: 'Online Survivors',
                                                tag: 'Live Roster',
                                                icon: Hash,
                                                color: 'cyan'
                                            },
                                            {
                                                id: 'chat' as const,
                                                name: '💬-cross-chat',
                                                title: '2-Way Cross-Chat Relay',
                                                tag: 'Discord ↔ Game',
                                                icon: Hash,
                                                color: 'indigo'
                                            },
                                            {
                                                id: 'alerts' as const,
                                                name: '🚨-server-alerts',
                                                title: 'Automated Watchdogs',
                                                tag: 'Crash & Backup',
                                                icon: Hash,
                                                color: 'amber'
                                            },
                                            {
                                                id: 'admin' as const,
                                                name: '🔒-admin-console',
                                                title: 'Private Staff Console',
                                                tag: '/rcon & Moderation',
                                                icon: Lock,
                                                color: 'rose'
                                            },
                                        ].map(ch => {
                                            const isSelected = selectedGuideChannel === ch.id;
                                            const IconComp = ch.icon;
                                            return (
                                                <button
                                                    key={ch.id}
                                                    onClick={() => setSelectedGuideChannel(ch.id)}
                                                    className={cn(
                                                        "w-full text-left p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between border group",
                                                        isSelected
                                                            ? "bg-[#5865F2]/20 border-[#5865F2]/50 text-white shadow-md shadow-[#5865F2]/10"
                                                            : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <IconComp className={cn(
                                                            "w-4 h-4 transition-colors",
                                                            isSelected ? "text-[#7c87f5]" : "text-slate-500 group-hover:text-slate-300"
                                                        )} />
                                                        <div>
                                                            <div className={cn(
                                                                "font-mono text-xs font-bold",
                                                                isSelected ? "text-white" : "text-[var(--text-primary)]"
                                                            )}>
                                                                #{ch.name}
                                                            </div>
                                                            <div className="text-[10px] text-[var(--text-muted)]">{ch.title}</div>
                                                        </div>
                                                    </div>
                                                    <span className={cn(
                                                        "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                                                        isSelected
                                                            ? "bg-[#5865F2]/30 text-[#c2c7ff] border-[#5865F2]/50"
                                                            : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]"
                                                    )}>
                                                        {ch.tag}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)]">
                                    💡 <i>Tip: Created automatically in your server when running 1-Click Auto Setup.</i>
                                </div>
                            </div>

                            {/* Right Column: Live Channel Simulator Screen (8 cols) */}
                            <div className="lg:col-span-8 p-5 bg-[#090C12] flex flex-col justify-between min-h-[420px]">
                                {/* Mock Discord Top Channel Bar */}
                                <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.08]">
                                    <div className="flex items-center gap-2 text-white">
                                        <Hash className="w-5 h-5 text-slate-400" />
                                        <span className="font-mono font-bold text-sm">
                                            {selectedGuideChannel === 'status' && '📊-status-dashboard'}
                                            {selectedGuideChannel === 'players' && '👥-player-roster'}
                                            {selectedGuideChannel === 'chat' && '💬-cross-chat'}
                                            {selectedGuideChannel === 'alerts' && '🚨-server-alerts'}
                                            {selectedGuideChannel === 'admin' && '🔒-admin-console'}
                                        </span>
                                        <span className="text-slate-600">|</span>
                                        <span className="text-xs text-slate-400 hidden sm:inline">
                                            {selectedGuideChannel === 'status' && 'Real-time interactive server control dashboard'}
                                            {selectedGuideChannel === 'players' && 'Live connected survivors across all cluster nodes'}
                                            {selectedGuideChannel === 'chat' && 'Two-way in-game chat bridge'}
                                            {selectedGuideChannel === 'alerts' && 'Automated crash detection & auto-restart countdowns'}
                                            {selectedGuideChannel === 'admin' && 'Staff-only remote RCON & player management'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold">● LIVE SIMULATOR</span>
                                    </div>
                                </div>

                                {/* Channel-Specific Simulated Embed & Content */}
                                <div className="flex-1 flex flex-col justify-center">
                                    {/* 1. STATUS DASHBOARD SIMULATOR */}
                                    {selectedGuideChannel === 'status' && (
                                        <div className="p-4 rounded-xl bg-[#121622] border-l-4 border-emerald-500 border-t border-r border-b border-white/5 space-y-4 shadow-xl">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center font-bold text-white text-xs">
                                                        ASA
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-white flex items-center gap-2">
                                                            <span>ARK Server Manager Bot</span>
                                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#5865F2] text-white font-bold uppercase">BOT</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-400">Cluster Dashboard • Real-time Sync</div>
                                                    </div>
                                                </div>
                                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase">
                                                    ● Cluster Online
                                                </span>
                                            </div>

                                            {/* Server Card Inside Embed */}
                                            <div className="p-3.5 rounded-lg bg-black/40 border border-white/5 space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    {servers.length > 1 ? (
                                                        <select
                                                            value={simulatedServerIndex}
                                                            onChange={(e) => setSimulatedServerIndex(Number(e.target.value))}
                                                            className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none focus:border-[#5865F2]"
                                                        >
                                                            {servers.map((s, idx) => (
                                                                <option key={s.id} value={idx}>🦕 {s.name}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <div className="font-bold text-white text-xs">
                                                            🦕 {servers[simulatedServerIndex]?.name || 'ARK Ascended Server #1 (The Island)'}
                                                        </div>
                                                    )}
                                                    <span className="text-[10px] font-mono text-cyan-400">
                                                        Map: {(servers[simulatedServerIndex] as any)?.map_name || 'The Island'} • Port 7777
                                                    </span>
                                                </div>

                                                {/* Simulated Live Gauges */}
                                                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                                    <div className="p-2 rounded bg-white/5 border border-white/5">
                                                        <div className="text-[9px] text-slate-400 uppercase font-semibold">Active Survivors</div>
                                                        <div className="font-mono font-bold text-emerald-400">{activePlayers.length || 3} / 70</div>
                                                    </div>
                                                    <div className="p-2 rounded bg-white/5 border border-white/5">
                                                        <div className="text-[9px] text-slate-400 uppercase font-semibold">CPU Usage</div>
                                                        <div className="font-mono font-bold text-cyan-400">24.5%</div>
                                                    </div>
                                                    <div className="p-2 rounded bg-white/5 border border-white/5">
                                                        <div className="text-[9px] text-slate-400 uppercase font-semibold">RAM Usage</div>
                                                        <div className="font-mono font-bold text-purple-400">8.2 / 32 GB</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Simulated Discord Interactive Action Buttons */}
                                            <div className="space-y-2 pt-1">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Discord Interactive Action Buttons:</div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button
                                                        onClick={() => toast.success("Simulated: Starting ARK Server via Discord!")}
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                                                    >
                                                        <Play className="w-3.5 h-3.5" />
                                                        <span>Start</span>
                                                    </button>
                                                    <button
                                                        onClick={() => toast.success("Simulated: Initiating Safe Shutdown with 60s confirmation!")}
                                                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                                                    >
                                                        <Square className="w-3.5 h-3.5" />
                                                        <span>Stop</span>
                                                    </button>
                                                    <button
                                                        onClick={() => toast.success("Simulated: Restarting with 60s countdown in-game!")}
                                                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                        <span>Restart (60s Guard)</span>
                                                    </button>
                                                    <button
                                                        onClick={() => toast.success("Simulated: World Saved & Backup Created!")}
                                                        className="px-3 py-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                                                    >
                                                        <Save className="w-3.5 h-3.5" />
                                                        <span>Save & Backup</span>
                                                    </button>
                                                    <button
                                                        onClick={() => toast.success("Simulated: Live gauges refreshed!")}
                                                        className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                        <span>Refresh</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 2. PLAYER ROSTER SIMULATOR */}
                                    {selectedGuideChannel === 'players' && (
                                        <div className="p-4 rounded-xl bg-[#121622] border-l-4 border-cyan-400 border-t border-r border-b border-white/5 space-y-3 shadow-xl">
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs font-black text-white flex items-center gap-2">
                                                    <span>👥 Connected Survivors Roster</span>
                                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Auto-Refreshes</span>
                                                </div>
                                                <span className="text-[10px] text-cyan-300 font-mono font-bold">2 Online</span>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="p-3 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                                                            RH
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white flex items-center gap-2">
                                                                <span>RexHunter</span>
                                                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">[Apex Predator]</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-mono">SteamID: 76561198012345678 • Playtime: 142m</div>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-emerald-400 font-bold">24ms</span>
                                                </div>

                                                <div className="p-3 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                                                            DT
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white flex items-center gap-2">
                                                                <span>DinoTamer99</span>
                                                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-700/50 text-slate-300 font-mono">[Solo Nomad]</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-mono">SteamID: 76561198087654321 • Playtime: 58m</div>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-emerald-400 font-bold">38ms</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. CROSS CHAT SIMULATOR */}
                                    {selectedGuideChannel === 'chat' && (
                                        <div className="p-4 rounded-xl bg-[#121622] border border-white/5 space-y-3 shadow-xl">
                                            <div className="text-xs font-bold text-slate-400 flex items-center justify-between pb-2 border-b border-white/5">
                                                <span>2-Way Discord ↔ In-Game Chat Stream</span>
                                                <span className="text-[10px] text-emerald-400 font-mono font-bold">● Active Relay</span>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-[10px]">
                                                        ARK
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-emerald-400">[Game - The Island] RexHunter</span>
                                                            <span className="text-[10px] text-slate-500">Today at 4:20 PM</span>
                                                        </div>
                                                        <p className="text-xs text-slate-200 mt-0.5">Anyone want to run the lava cave on carno island?</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-start gap-3">
                                                    <div className="w-7 h-7 rounded-full bg-[#5865F2] flex items-center justify-center font-bold text-white text-[10px]">
                                                        ADM
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-[#7c87f5]">ServerOwner (Discord)</span>
                                                            <span className="text-[10px] text-slate-500">Today at 4:21 PM</span>
                                                        </div>
                                                        <p className="text-xs text-slate-200 mt-0.5">I'll join in 10 minutes, let me finish crafting kibble!</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 4. SERVER ALERTS SIMULATOR */}
                                    {selectedGuideChannel === 'alerts' && (
                                        <div className="space-y-2.5">
                                            <div className="p-3.5 rounded-xl bg-[#1a1215] border-l-4 border-rose-500 border-t border-r border-b border-white/5 space-y-1 shadow-lg">
                                                <div className="flex items-center justify-between text-xs font-black text-rose-400">
                                                    <span>🚨 Server Watchdog: Unexpected Exit Detected</span>
                                                    <span className="text-[10px] font-mono text-slate-400">Just now</span>
                                                </div>
                                                <p className="text-xs text-slate-300">
                                                    Server <b>The Island #1</b> crashed or terminated unexpectedly. Automatic failover watchdog initiated recovery. Server restarted successfully in 12s.
                                                </p>
                                            </div>

                                            <div className="p-3.5 rounded-xl bg-[#101b19] border-l-4 border-emerald-500 border-t border-r border-b border-white/5 space-y-1 shadow-lg">
                                                <div className="flex items-center justify-between text-xs font-black text-emerald-400">
                                                    <span>💾 Scheduled World Backup Archive Created</span>
                                                    <span className="text-[10px] font-mono text-slate-400">10m ago</span>
                                                </div>
                                                <p className="text-xs text-slate-300">
                                                    Cluster save file backup generated: <code className="text-emerald-300 font-mono text-[11px]">backup_2026-08-21_1600.zip</code> (418 MB).
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* 5. ADMIN CONSOLE SIMULATOR */}
                                    {selectedGuideChannel === 'admin' && (
                                        <div className="p-4 rounded-xl bg-[#121622] border-l-4 border-rose-500 border-t border-r border-b border-white/5 space-y-3 shadow-xl">
                                            <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                                <span className="text-xs font-black text-rose-400 flex items-center gap-2">
                                                    <Lock className="w-3.5 h-3.5" />
                                                    <span>Restricted Staff Admin Channel</span>
                                                </span>
                                                <span className="text-[9px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">Admin Only</span>
                                            </div>

                                            <div className="p-3 rounded-lg bg-black/60 font-mono text-xs space-y-2 border border-white/5">
                                                <div className="text-[#7c87f5]">
                                                    <span className="text-slate-500">User:</span> /rcon server:1 command:"DoExit"
                                                </div>
                                                <div className="text-emerald-400 pl-3 border-l-2 border-emerald-500/40">
                                                    [ARK-BOT] RCON Command Dispatched: "World saved. Exiting server safely."
                                                </div>
                                                <div className="text-[10px] text-slate-500 italic pl-3">
                                                    Logged to Audit Trail: Admin @ServerOwner invoked DoExit on Server #1.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Interactive Slash Commands Explorer Matrix */}
                    <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-2xl space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
                            <div>
                                <h3 className="text-base font-black text-[var(--text-primary)] flex items-center gap-2.5 tracking-tight">
                                    <div className="p-1.5 rounded-lg bg-[#5865F2]/20 text-[#7c87f5]">
                                        <Terminal className="w-4 h-4" />
                                    </div>
                                    <span>Discord Slash Commands Explorer (Click to Copy)</span>
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    Type any of these commands in your Discord channels to trigger instant actions:
                                </p>
                            </div>

                            {/* Search & Category Filter Controls */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        value={commandSearch}
                                        onChange={(e) => setCommandSearch(e.target.value)}
                                        placeholder="Search command or keyword..."
                                        className="pl-8 pr-3 py-1.5 rounded-xl bg-[var(--input-background)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2] w-56"
                                    />
                                    {commandSearch && (
                                        <button
                                            onClick={() => setCommandSearch('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                                    {[
                                        { id: 'all' as const, label: 'All' },
                                        { id: 'control' as const, label: '🎮 Controls' },
                                        { id: 'players' as const, label: '👥 Players' },
                                        { id: 'admin' as const, label: '🔒 Admin' }
                                    ].map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setCommandCategory(cat.id)}
                                            className={cn(
                                                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                                                commandCategory === cat.id
                                                    ? "bg-[#5865F2] text-white shadow-sm"
                                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                            )}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Filtered Commands Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                            {[
                                { cmd: '/status', desc: 'Displays interactive server dashboard with live CPU/RAM gauges & buttons', tier: 'Everyone', category: 'control', example: '/status' },
                                { cmd: '/players', desc: 'Lists all connected survivors currently online across all cluster nodes', tier: 'Everyone', category: 'players', example: '/players' },
                                { cmd: '/player <name_or_id>', desc: 'Inspects a player dossier (playtime, tribe name, session history, Steam ID)', tier: 'Moderator', category: 'players', example: '/player RexRider' },
                                { cmd: '/link <steam_id>', desc: 'Links a player Discord profile to their Steam/EOS survivor account', tier: 'Everyone', category: 'players', example: '/link 76561198000000000' },
                                { cmd: '/whitelist <steam_id>', desc: 'Adds survivor to server whitelist file and syncs in-game RCON immediately', tier: 'Moderator', category: 'players', example: '/whitelist 76561198000000000' },
                                { cmd: '/rcon <server_id> <cmd>', desc: 'Executes secure remote console command on a specific ARK server', tier: 'Admin', category: 'admin', example: '/rcon 1 ListPlayers' },
                                { cmd: '/start <server_id>', desc: 'Starts a specific ARK server instance remotely', tier: 'Admin', category: 'control', example: '/start 1' },
                                { cmd: '/stop <server_id>', desc: 'Graceful shutdown with 60-second confirmation protection', tier: 'Admin', category: 'control', example: '/stop 1' },
                                { cmd: '/restart <server_id>', desc: 'Restarts server instance with 60-second confirmation protection', tier: 'Admin', category: 'control', example: '/restart 1' },
                                { cmd: '/backup <server_id>', desc: 'Forces immediate world save and creates a timestamped zip backup archive', tier: 'Admin', category: 'control', example: '/backup 1' },
                                { cmd: '/update <server_id>', desc: 'Triggers SteamCMD check and updates game files and installed mods', tier: 'Admin', category: 'control', example: '/update 1' },
                                { cmd: '/kick <server_id> <id>', desc: 'Kicks an active player from the server via RCON command', tier: 'Moderator', category: 'admin', example: '/kick 1 76561198000000000' },
                                { cmd: '/ban <server_id> <id>', desc: 'Permanently bans a player and disconnects them from the cluster', tier: 'Admin', category: 'admin', example: '/ban 1 76561198000000000' },
                            ].filter(item => {
                                const matchesCat = commandCategory === 'all' || item.category === commandCategory;
                                const matchesSearch = !commandSearch.trim() ||
                                    item.cmd.toLowerCase().includes(commandSearch.toLowerCase()) ||
                                    item.desc.toLowerCase().includes(commandSearch.toLowerCase()) ||
                                    item.tier.toLowerCase().includes(commandSearch.toLowerCase());
                                return matchesCat && matchesSearch;
                            }).map(item => (
                                <div
                                    key={item.cmd}
                                    onClick={() => copyToClipboard(item.cmd, item.cmd)}
                                    className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[#5865F2]/40 hover:bg-[var(--surface-hover)] transition-all cursor-pointer group flex flex-col justify-between select-none shadow-md"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <code className="font-mono text-xs font-black text-[#7c87f5] group-hover:text-white transition-colors">
                                                {item.cmd}
                                            </code>
                                            <span className={cn(
                                                "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border",
                                                item.tier === 'Admin'
                                                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                                    : item.tier === 'Moderator'
                                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                            )}>
                                                {item.tier}
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">{item.desc}</p>
                                    </div>

                                    <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-center justify-between text-[10px]">
                                        <span className="font-mono text-[var(--text-muted)]">{item.example}</span>
                                        {copiedSnippet === item.cmd ? (
                                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                                                <Check className="w-3 h-3" /> Copied!
                                            </span>
                                        ) : (
                                            <span className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
                                                <Copy className="w-3 h-3" /> Click to copy
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB: Real-time Live Cross-Chat Feed */}
            {activeTab === 'chat' && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Main Chat Stream */}
                    <div className="lg:col-span-2 glass-panel rounded-2xl border border-[var(--border)] p-5 flex flex-col h-[620px] shadow-xl">
                        {/* Stream Controls Bar */}
                        <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                                    </span>
                                    <span className="text-sm font-bold text-[var(--text-primary)]">Live Relay Feed</span>
                                </div>
                                <span className="text-xs text-[var(--text-secondary)]">({filteredMessages.length} events)</span>
                            </div>

                            {/* Filter buttons */}
                            <div className="flex items-center gap-1 bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)]">
                                {(['all', 'discord', 'game', 'system'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setChatFilter(f)}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-all cursor-pointer",
                                            chatFilter === f
                                                ? "bg-[#5865F2] text-white"
                                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        )}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chat Messages List */}
                        <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-2 scrollbar-thin scrollbar-thumb-white/10">
                            {filteredMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-[var(--text-muted)] space-y-2">
                                    <MessageSquare className="w-8 h-8 opacity-40 text-[#5865F2]" />
                                    <p className="text-xs">No chat messages yet. Messages from Discord and ARK servers will stream here in real time.</p>
                                </div>
                            ) : (
                                filteredMessages.map(msg => (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "p-3.5 rounded-xl border transition-all flex items-start gap-3.5",
                                            msg.source === 'discord' && "bg-[#5865F2]/10 border-[#5865F2]/20 hover:border-[#5865F2]/40",
                                            msg.source === 'game' && "bg-cyan-500/10 border-cyan-500/20 hover:border-cyan-500/40",
                                            msg.source === 'admin' && "bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40",
                                            msg.source === 'system' && "bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)]"
                                        )}
                                    >
                                        <div className="mt-0.5 flex-shrink-0">
                                            {msg.source === 'discord' && (
                                                <div className="w-8 h-8 rounded-lg bg-[#5865F2] flex items-center justify-center text-white">
                                                    <DiscordIcon className="w-4 h-4" />
                                                </div>
                                            )}
                                            {msg.source === 'game' && (
                                                <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center text-black font-black text-xs">
                                                    ARK
                                                </div>
                                            )}
                                            {msg.source === 'admin' && (
                                                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-black">
                                                    <Shield className="w-4 h-4" />
                                                </div>
                                            )}
                                            {msg.source === 'system' && (
                                                <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300">
                                                    <Bot className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="font-bold text-sm text-[var(--text-primary)]">{msg.author}</span>
                                                {msg.tribe && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                                        [{msg.tribe}]
                                                    </span>
                                                )}
                                                {msg.serverName && (
                                                    <span className="text-[10px] text-[var(--text-muted)]">
                                                        ({msg.serverName})
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                                                    {msg.timestamp.toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--text-secondary)] break-words">{msg.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Broadcast Input Box */}
                        <form onSubmit={handleSendMessage} className="pt-3 border-t border-[var(--border)] space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Type a broadcast message to send across Discord and in-game chat..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    className="flex-1 bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2]"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>Send</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Right: Cluster Servers & Online Players Sidebars */}
                    <div className="space-y-5">
                        {/* Active Servers Panel */}
                        <div className="glass-panel rounded-2xl border border-[var(--border)] p-5 shadow-xl space-y-3">
                            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                                <ServerIcon className="w-4 h-4 text-emerald-400" />
                                <span>Active Cluster Servers ({servers.length})</span>
                            </h3>
                            <div className="space-y-2">
                                {servers.map(s => {
                                    const isOnline = s.status === 'running' || s.status === 'online';
                                    return (
                                        <div key={s.id} className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
                                            <div>
                                                <div className="text-xs font-bold text-[var(--text-primary)]">{s.name}</div>
                                                <div className="text-[10px] text-[var(--text-muted)]">Port {(s as any).port || (s.config as any)?.port || (s.config as any)?.gamePort || 7777} • Map {(s as any).map_name || (s.config as any)?.mapName || 'The Island'}</div>
                                            </div>
                                            <span className={cn(
                                                "text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider",
                                                isOnline ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-[var(--surface-hover)] text-[var(--text-muted)] border border-[var(--border)]"
                                            )}>
                                                {isOnline ? 'Online' : 'Stopped'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Online Survivors Panel */}
                        <div className="glass-panel rounded-2xl border border-[var(--border)] p-5 shadow-xl space-y-3">
                            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-cyan-400" />
                                    <span>Online Survivors</span>
                                </span>
                                <span className="text-[10px] text-cyan-400 font-bold">{activePlayers.length} Online</span>
                            </h3>
                            {activePlayers.length === 0 ? (
                                <div className="text-center py-6 text-[var(--text-muted)] text-xs">
                                    No players currently logged into cluster servers.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {activePlayers.map(p => (
                                        <div key={p.steam_id} className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between text-xs">
                                            <div>
                                                <div className="font-bold text-[var(--text-primary)]">{p.name}</div>
                                                <div className="text-[10px] text-cyan-400">{p.tribe ? `[${p.tribe}]` : 'Solo'}</div>
                                            </div>
                                            <div className="text-[10px] text-[var(--text-muted)] text-right">
                                                <div>{p.playtime_minutes}m played</div>
                                                <div>{p.ping}ms</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB: Server Status & Embeds */}
            {activeTab === 'status' && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Left: Discord Embed Mockup Preview */}
                    <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-xl space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <Activity className="w-4 h-4 text-[#5865F2]" />
                                <span>Live Discord Embed Preview</span>
                            </h3>
                            <button
                                onClick={handleForceStatusUpdate}
                                className="px-3 py-1 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                            >
                                Force Update Embed
                            </button>
                        </div>

                        {/* Discord Dark Theme Embed Card Mockup */}
                        <div className="p-5 rounded-2xl bg-[#2B2D31] border-l-4 border-[#5865F2] text-slate-200 shadow-2xl space-y-4 font-sans">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-white">🦖 ARK: Survival Ascended Cluster Dashboard</span>
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">ONLINE</span>
                            </div>

                            <div className="text-xs text-slate-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                <span>Cluster Status: {onlineServersCount} / {servers.length} Servers Running</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                                {servers.map(s => {
                                    const map = (s as any).map_name || s.config?.mapName || 'The Island';
                                    const maxP = (s as any).max_players || s.config?.maxPlayers || 70;
                                    const isRunning = s.status === 'running' || s.status === 'online';
                                    return (
                                        <div key={s.id} className="p-2.5 rounded bg-[#1E1F22] border border-white/5">
                                            <div className="font-bold text-white flex items-center justify-between">
                                                <span>{s.name}</span>
                                                <span className={cn("text-[10px]", isRunning ? "text-emerald-400" : "text-rose-400")}>
                                                    {isRunning ? 'ONLINE' : 'STOPPED'}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-1">Map: {map}</div>
                                            <div className="text-[11px] text-slate-400">Players: 0 / {maxP}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="text-[10px] text-slate-400 pt-2 border-t border-white/5 flex items-center justify-between">
                                <span>ARK: Survival Ascended Server Manager 2.1</span>
                                <span>Updates every {config.status_update_interval || 60}s</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Embed Channel & Interval Configuration */}
                    <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-xl space-y-5">
                        <h3 className="text-base font-bold text-[var(--text-primary)] pb-3 border-b border-[var(--border)]">Embed Channels & Scheduling</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                                    Server List Embed Channel ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 12048918239120938"
                                    value={config.server_list_channel_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, server_list_channel_id: e.target.value }))}
                                    className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2]"
                                />
                                <p className="text-[11px] text-[var(--text-secondary)] mt-1">Channel where the persistent server overview card is pinned and edited.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                                    Player List Embed Channel ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 12048918239120939"
                                    value={config.player_list_channel_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, player_list_channel_id: e.target.value }))}
                                    className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2]"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                                        Update Interval (Seconds)
                                    </label>
                                    <span className="text-sm font-bold text-[#5865F2]">{config.status_update_interval}s</span>
                                </div>
                                <input
                                    type="range"
                                    min="30"
                                    max="300"
                                    step="10"
                                    value={config.status_update_interval}
                                    onChange={(e) => setConfig(prev => ({ ...prev, status_update_interval: Number(e.target.value) }))}
                                    className="w-full accent-[#5865F2] cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
                                    <span>30s (Real-time)</span>
                                    <span>60s (Recommended)</span>
                                    <span>300s (Low CPU)</span>
                                </div>
                            </div>

                            <button
                                onClick={handleSaveConfig}
                                disabled={isSaving}
                                className="w-full py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-[#5865F2]/20 cursor-pointer"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                <span>Save Embed Channels</span>
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB: Automated Alerts & Webhooks */}
            {activeTab === 'alerts' && (
                <motion.div variants={itemVariants} className="glass-panel rounded-2xl border border-[var(--border)] p-6 space-y-5 shadow-xl">
                    <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
                        <div>
                            <h3 className="text-base font-bold text-[var(--text-primary)]">Automated Webhook & Discord Alerts</h3>
                            <p className="text-xs text-[var(--text-secondary)]">Trigger rich Discord embed alerts when critical server events occur</p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setConfig(prev => ({
                                    ...prev,
                                    notify_player_join_leave: true,
                                    notify_server_crashes: true,
                                    notify_server_recovery: true,
                                    notify_scheduled_restarts: true,
                                    notify_backup_completion: true,
                                    notify_performance_alerts: true,
                                    notify_mod_watchdog: true,
                                    notify_anti_cheat: true,
                                }))}
                                className="px-3 py-1.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-xs font-bold text-[var(--text-primary)] border border-[var(--border)] cursor-pointer"
                            >
                                Enable All
                            </button>
                            <button
                                onClick={() => setConfig(prev => ({
                                    ...prev,
                                    notify_player_join_leave: false,
                                    notify_server_crashes: false,
                                    notify_server_recovery: false,
                                    notify_scheduled_restarts: false,
                                    notify_backup_completion: false,
                                    notify_performance_alerts: false,
                                    notify_mod_watchdog: false,
                                    notify_anti_cheat: false,
                                }))}
                                className="px-3 py-1.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-xs font-bold text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer"
                            >
                                Disable All
                            </button>
                        </div>
                    </div>

                    {/* Webhook URL Input */}
                    <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
                        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                            Global Discord Webhook URL (For Alerts)
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="password"
                                placeholder="https://discord.com/api/webhooks/..."
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                className="flex-1 bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2]"
                            />
                            <button
                                onClick={handleSaveConfig}
                                className="px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                            >
                                Save URL
                            </button>
                        </div>
                    </div>

                    {/* Alert Trigger Toggles Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { key: 'notify_server_crashes', label: 'Crash Detection', desc: 'Alerts if a server process terminates unexpectedly', icon: AlertTriangle, color: 'text-rose-400' },
                            { key: 'notify_server_recovery', label: 'Auto-Recovery', desc: 'Alerts after watchdog restarts a crashed instance', icon: RefreshCw, color: 'text-emerald-400' },
                            { key: 'notify_player_join_leave', label: 'Player Connect/Disconnect', desc: 'Relays player connection logs with survivor tags', icon: Users, color: 'text-cyan-400' },
                            { key: 'notify_scheduled_restarts', label: 'Scheduled Tasks & Countdown', desc: 'Warns players in Discord 15m, 5m, 1m before restarts', icon: Clock, color: 'text-amber-400' },
                            { key: 'notify_backup_completion', label: 'Backup Completed', desc: 'Logs archive completion, size, and world save status', icon: Shield, color: 'text-blue-400' },
                            { key: 'notify_mod_watchdog', label: 'SteamCMD Mod Updates', desc: 'Notifies when new mod versions are pulled', icon: Sparkles, color: 'text-purple-400' },
                            { key: 'notify_anti_cheat', label: 'Anti-Cheat Triggers', desc: 'Alerts moderators on speed, memory, or teleport detections', icon: Shield, color: 'text-red-400' },
                            { key: 'notify_performance_alerts', label: 'High CPU / Low FPS Warning', desc: 'Alerts when server tick rate drops below threshold', icon: Activity, color: 'text-orange-400' },
                        ].map(alert => {
                            const Icon = alert.icon;
                            const isEnabled = (config as any)[alert.key];
                            return (
                                <div
                                    key={alert.key}
                                    onClick={() => setConfig(prev => ({ ...prev, [alert.key]: !isEnabled }))}
                                    className={cn(
                                        "p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between select-none",
                                        isEnabled
                                            ? "bg-[#5865F2]/10 border-[#5865F2]/40 shadow-sm"
                                            : "bg-[var(--surface)] border-[var(--border)] opacity-70 hover:opacity-100 hover:border-[var(--border-hover)]"
                                    )}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <Icon className={cn("w-5 h-5", alert.color)} />
                                            <div className={cn(
                                                "w-4 h-4 rounded-full border flex items-center justify-center text-[10px]",
                                                isEnabled ? "bg-[#5865F2] border-[#5865F2] text-white" : "border-[var(--border)] bg-[var(--surface-hover)]"
                                            )}>
                                                {isEnabled && "✓"}
                                            </div>
                                        </div>
                                        <div className="text-sm font-bold text-[var(--text-primary)]">{alert.label}</div>
                                        <p className="text-xs text-[var(--text-secondary)] mt-1">{alert.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* TAB: Bot Credentials & Configuration */}
            {/* TAB: Bot Credentials & Configuration */}
            {activeTab === 'bot' && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Bot Credentials Form */}
                    <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-xl space-y-5">
                        <h3 className="text-base font-bold text-[var(--text-primary)] pb-3 border-b border-[var(--border)]">Bot Token & Guild Setup</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                                    Discord Bot Token (From Developer Portal)
                                </label>
                                <div className="relative">
                                    <input
                                        type={showToken ? 'text' : 'password'}
                                        placeholder="MTI5OD..."
                                        value={config.bot_token}
                                        onChange={(e) => setConfig(prev => ({ ...prev, bot_token: e.target.value }))}
                                        className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl pl-4 pr-12 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                    >
                                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                                    Guild ID (Discord Server ID)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 10982390192830192"
                                    value={config.guild_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, guild_id: e.target.value }))}
                                    className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2]"
                                />
                                <p className="text-[11px] text-[var(--text-secondary)] mt-1">Right-click server in Discord → Copy Server ID</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                                    Primary Live Cross-Chat Channel ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 10982390192830193"
                                    value={config.channel_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, channel_id: e.target.value }))}
                                    className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                                    Admin / Console Channel ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 10982390192830194"
                                    value={config.admin_channel_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, admin_channel_id: e.target.value }))}
                                    className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#5865F2]"
                                />
                            </div>

                            <button
                                onClick={handleSaveConfig}
                                disabled={isSaving}
                                className="w-full py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-[#5865F2]/20 cursor-pointer"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                <span>Save Bot Credentials</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick Setup Actions & Diagnostics */}
                    <div className="space-y-5">
                        <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-xl space-y-4">
                            <h3 className="text-base font-bold text-[var(--text-primary)] pb-3 border-b border-[var(--border)] flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-emerald-400" />
                                <span>Automatic Provisioning</span>
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                Click the button below to have the bot automatically create the category and all 5 channels in your Discord server with optimal permissions.
                            </p>
                            <button
                                onClick={handleRunAutoSetup}
                                disabled={isAutoSettingUp}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
                            >
                                {isAutoSettingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                <span>Execute 1-Click Auto Setup</span>
                            </button>
                        </div>

                        <div className="glass-panel rounded-2xl border border-[var(--border)] p-6 shadow-xl space-y-4">
                            <h3 className="text-base font-bold text-[var(--text-primary)] pb-3 border-b border-[var(--border)] flex items-center gap-2">
                                <Activity className="w-4 h-4 text-cyan-400" />
                                <span>Gateway Diagnostics</span>
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                                    <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Gateway State</div>
                                    <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{connectionState === 'connected' ? 'Online & Ready' : 'Disconnected'}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                                    <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Uptime</div>
                                    <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{Math.floor(bridgeStatus.uptime_seconds / 60)}m {bridgeStatus.uptime_seconds % 60}s</div>
                                </div>
                                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                                    <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Commands Processed</div>
                                    <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{bridgeStatus.commands_processed}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                                    <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Last Command</div>
                                    <div className="text-xs font-mono text-cyan-400 mt-0.5 truncate">{bridgeStatus.last_command || 'None'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB: Linked Community Players */}
            {activeTab === 'players' && (
                <motion.div variants={itemVariants} className="glass-panel rounded-2xl border border-[var(--border)] p-6 space-y-5 shadow-xl">
                    <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
                        <div>
                            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <Users className="w-5 h-5 text-cyan-400" />
                                <span>Linked Community Players ({playerLinks.length})</span>
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)]">Players who linked their Discord accounts via <code className="text-cyan-400">/link &lt;steam_id&gt;</code> in Discord</p>
                        </div>
                        <button
                            onClick={() => selectedClusterId && fetchHealthAndBridge(selectedClusterId)}
                            className="px-3 py-1.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-xs font-bold text-[var(--text-primary)] border border-[var(--border)] flex items-center gap-1.5 cursor-pointer"
                        >
                            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Refresh</span>
                        </button>
                    </div>

                    {playerLinks.length === 0 ? (
                        <div className="text-center py-12 text-[var(--text-muted)] space-y-2">
                            <Users className="w-8 h-8 opacity-30 mx-auto text-cyan-400" />
                            <p className="text-xs">No linked player accounts found. Survivors can link in Discord by typing <code className="text-cyan-400">/link 76561198...</code></p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
                                        <th className="pb-3">Survivor Name</th>
                                        <th className="pb-3">Steam / EOS ID</th>
                                        <th className="pb-3">Discord User ID</th>
                                        <th className="pb-3">Linked Date</th>
                                        <th className="pb-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {playerLinks.map(p => (
                                        <tr key={p.discord_user_id} className="hover:bg-[var(--surface-hover)]">
                                            <td className="py-3 font-bold text-[var(--text-primary)]">{p.player_name || 'Survivor'}</td>
                                            <td className="py-3 font-mono text-cyan-400">{p.steam_id}</td>
                                            <td className="py-3 font-mono text-[var(--text-secondary)]">{p.discord_user_id}</td>
                                            <td className="py-3 text-[var(--text-muted)]">{new Date(p.linked_at).toLocaleDateString()}</td>
                                            <td className="py-3 text-right">
                                                <button
                                                    onClick={() => handleUnlinkPlayer(p.discord_user_id)}
                                                    className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-bold transition-all cursor-pointer"
                                                >
                                                    Unlink
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            )}

            {/* TAB: Audit Logs & Administrative History */}
            {activeTab === 'audit' && (
                <motion.div variants={itemVariants} className="glass-panel rounded-2xl border border-[var(--border)] p-6 space-y-5 shadow-xl">
                    <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
                        <div>
                            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <Shield className="w-5 h-5 text-amber-400" />
                                <span>Discord Administrative Audit Log</span>
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)]">Security audit trail of all commands, restarts, RCON actions, and kicks initiated via Discord</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleClearAuditLogs}
                                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Clear History</span>
                            </button>
                            <button
                                onClick={() => selectedClusterId && fetchHealthAndBridge(selectedClusterId)}
                                className="px-3 py-1.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-xs font-bold text-[var(--text-primary)] border border-[var(--border)] flex items-center gap-1.5 cursor-pointer"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    {auditLogs.length === 0 ? (
                        <div className="text-center py-12 text-[var(--text-muted)] space-y-2">
                            <Shield className="w-8 h-8 opacity-30 mx-auto text-amber-400" />
                            <p className="text-xs">No administrative actions logged yet. Operations executed through Discord will be recorded here.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
                                        <th className="pb-3">Timestamp</th>
                                        <th className="pb-3">Admin User</th>
                                        <th className="pb-3">Action</th>
                                        <th className="pb-3">Details</th>
                                        <th className="pb-3 text-right">Result</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {auditLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-[var(--surface-hover)]">
                                            <td className="py-3 text-[var(--text-muted)] font-mono text-[11px]">{new Date(log.createdAt).toLocaleString()}</td>
                                            <td className="py-3 font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                                <span>{log.discordUsername}</span>
                                                <span className="text-[10px] text-[var(--text-muted)] font-mono">({log.discordUserId})</span>
                                            </td>
                                            <td className="py-3 font-mono text-cyan-400 font-bold">{log.actionType}</td>
                                            <td className="py-3 text-[var(--text-secondary)] max-w-xs truncate">{log.details || '-'}</td>
                                            <td className="py-3 text-right">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-bold",
                                                    log.result === 'success' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                                )}>
                                                    {log.result}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            )}

            {/* TAB: Roles & Admin RCON */}
            {activeTab === 'rcon' && (
                <motion.div variants={itemVariants} className="glass-panel rounded-2xl border border-[var(--border)] p-6 space-y-5 shadow-xl">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] pb-3 border-b border-[var(--border)]">Discord Admin & Moderation Roles</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Admin Roles */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                                Admin Role IDs (Can execute /rcon, /start, /stop, /restart, /backup)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter Discord Role ID..."
                                    value={adminRoleInput}
                                    onChange={(e) => setAdminRoleInput(e.target.value)}
                                    className="flex-1 bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                                />
                                <button
                                    type="button"
                                    onClick={() => addRoleTag('admin')}
                                    className="px-3 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl cursor-pointer"
                                >
                                    Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {config.admin_role_ids.map(role => (
                                    <span key={role} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#5865F2]/20 text-[#7c87f5] border border-[#5865F2]/30 flex items-center gap-1.5">
                                        <span>Role: {role}</span>
                                        <button onClick={() => removeRoleTag('admin', role)} className="hover:text-white cursor-pointer">×</button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Moderator Roles */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                                Moderator Role IDs (Can execute /kick, /broadcast, /players, /whitelist)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter Discord Role ID..."
                                    value={modRoleInput}
                                    onChange={(e) => setModRoleInput(e.target.value)}
                                    className="flex-1 bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                                />
                                <button
                                    type="button"
                                    onClick={() => addRoleTag('mod')}
                                    className="px-3 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl cursor-pointer"
                                >
                                    Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {config.moderator_role_ids.map(role => (
                                    <span key={role} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-1.5">
                                        <span>Role: {role}</span>
                                        <button onClick={() => removeRoleTag('mod', role)} className="hover:text-white cursor-pointer">×</button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleSaveConfig}
                        disabled={isSaving}
                        className="w-full py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-[#5865F2]/20 cursor-pointer"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        <span>Save Role Assignments</span>
                    </button>
                </motion.div>
            )}

            {/* TAB: Rate Limiting & Anti-Spam */}
            {activeTab === 'ratelimit' && (
                <motion.div variants={itemVariants} className="glass-panel rounded-2xl border border-[var(--border)] p-6 space-y-5 max-w-2xl shadow-xl">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] pb-3 border-b border-[var(--border)]">Rate Limit Protection</h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                        Prevents Discord API <code className="text-amber-400">429 Too Many Requests</code> errors during high chat activity or raid events.
                    </p>

                    <div className="space-y-5">
                        <div>
                            <div className="flex justify-between text-xs font-bold text-[var(--text-primary)] mb-2">
                                <span>Max Messages Per Window</span>
                                <span className="text-[#5865F2]">{maxMsgsPerWindow} Messages</span>
                            </div>
                            <input
                                type="range"
                                min="2"
                                max="30"
                                value={maxMsgsPerWindow}
                                onChange={(e) => setMaxMsgsPerWindow(Number(e.target.value))}
                                className="w-full accent-[#5865F2] cursor-pointer"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs font-bold text-[var(--text-primary)] mb-2">
                                <span>Window Duration</span>
                                <span className="text-[#5865F2]">{windowSeconds} Seconds</span>
                            </div>
                            <input
                                type="range"
                                min="2"
                                max="30"
                                value={windowSeconds}
                                onChange={(e) => setWindowSeconds(Number(e.target.value))}
                                className="w-full accent-[#5865F2] cursor-pointer"
                            />
                        </div>

                        <button
                            onClick={handleSaveConfig}
                            className="w-full py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-md"
                        >
                            Apply Rate Limiting Rules
                        </button>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
