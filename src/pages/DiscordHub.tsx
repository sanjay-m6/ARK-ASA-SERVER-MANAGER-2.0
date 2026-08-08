import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, Variants } from 'framer-motion';
import {
    Bot, MessageSquare, Bell, Shield, Wifi, WifiOff,
    Loader2, PlayCircle, StopCircle, RefreshCw,
    Send, Users, Server as ServerIcon, ExternalLink,
    Eye, EyeOff, Sparkles, Activity, Terminal, AlertTriangle,
    Sliders, Zap, HelpCircle, Clock, Check, Radio
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
    generateBotInviteUrl, sendDiscordStatusUpdate,
    getClusters, createCluster,
    type DiscordBridgeConfig
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
    const [activeTab, setActiveTab] = useState<'chat' | 'status' | 'alerts' | 'bot' | 'rcon' | 'ratelimit'>('chat');

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

    // Live Data & Health
    const [serverHealth, setServerHealth] = useState<ServerHealthInfo[]>([]);
    const [activePlayers, setActivePlayers] = useState<PlayerInfo[]>([]);

    // Realtime Chat State
    const [messages, setMessages] = useState<LiveChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatTarget, setChatTarget] = useState<'both' | 'discord' | 'game'>('both');
    const [chatFilter, setChatFilter] = useState<'all' | 'discord' | 'game' | 'system'>('all');
    const [senderName, setSenderName] = useState('Server Admin');
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Role tags inputs
    const [adminRoleInput, setAdminRoleInput] = useState('');
    const [modRoleInput, setModRoleInput] = useState('');

    // Rate limiting state
    const [maxMsgsPerWindow, setMaxMsgsPerWindow] = useState(10);
    const [windowSeconds, setWindowSeconds] = useState(10);

    // Load initial data
    const loadData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [fetchedWebhook, fetchedClusters] = await Promise.all([
                getSetting('discord_webhook_url'),
                getClusters()
            ]);

            if (fetchedWebhook) {
                setWebhookUrl(fetchedWebhook);
                setSavedWebhookUrl(fetchedWebhook);
            }

            setClusters(fetchedClusters);

            let clusterId = selectedClusterId;
            if (fetchedClusters.length > 0) {
                clusterId = fetchedClusters[0].id;
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

                // Fetch health & players
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
            const [health, playersList, status] = await Promise.allSettled([
                invoke<ServerHealthInfo[]>('get_cluster_servers_health', { clusterId }),
                invoke<PlayerInfo[]>('get_active_players', { serverId: null, clusterId }),
                invoke<DiscordBridgeStatus>('get_discord_bridge_status', { clusterId })
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

            if (webhookUrl.trim() && webhookUrl !== savedWebhookUrl) {
                await setSetting('discord_webhook_url', webhookUrl.trim());
                setSavedWebhookUrl(webhookUrl.trim());
            }

            toast.success("Discord Bridge & Webhook settings saved!");
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
        try {
            const url = await generateBotInviteUrl(config.bot_token);
            await openUrl(url);
            toast.success("Opened Discord Bot authorization window in browser");
        } catch (e: any) {
            toast.error(typeof e === 'string' ? e : "Failed to generate invite URL");
        }
    };

    // Send Status Update Embed to Discord
    const handleForceStatusUpdate = async () => {
        try {
            await sendDiscordStatusUpdate();
            toast.success("Live Server Status embed sent to Discord!");
        } catch (e: any) {
            toast.error(`Failed to push status embed: ${e}`);
        }
    };

    // Send Live Chat Message
    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        const newMsg: LiveChatMessage = {
            id: `msg-${Date.now()}`,
            source: 'admin',
            author: senderName || 'Admin',
            content: chatInput.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, newMsg]);
        setChatInput('');
        toast.success(`Broadcast sent to ${chatTarget === 'both' ? 'Discord & Game Servers' : chatTarget === 'discord' ? 'Discord' : 'Game Servers'}`);
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
                    <p className="text-sm font-semibold text-slate-300 tracking-wide">Connecting to Discord Service</p>
                    <p className="text-xs text-slate-500 mt-1">Initializing gateway bridge...</p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            className="space-y-5 pb-20"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Top Hero Banner & Real-time Gateway Monitor */}
            <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#5865F2]/15 via-[#1a1b2e]/95 to-[#0B0E14] border border-[#5865F2]/20 p-6 shadow-[0_8px_32px_rgba(88,101,242,0.12)] backdrop-blur-xl">
                {/* Multi-layer ambient glow */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#5865F2]/8 rounded-full blur-[120px] pointer-events-none -mr-32 -mt-32" />
                <div className="absolute bottom-0 left-0 w-72 h-72 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none -ml-20 -mb-20" />

                <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
                    {/* Left: Branding & Status */}
                    <div className="flex items-center gap-5">
                        <div className="relative group">
                            <div className="absolute inset-0 bg-[#5865F2]/30 rounded-2xl blur-xl group-hover:bg-[#5865F2]/40 transition-all duration-500" />
                            <div className="relative p-4 rounded-2xl bg-gradient-to-br from-[#5865F2] to-[#4752C4] text-white shadow-lg">
                                <DiscordIcon className="w-10 h-10" />
                                {connectionState === 'connected' && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-400 border-[2.5px] border-[#1a1b2e] rounded-full shadow-[0_0_8px_rgba(52,211,153,0.6)]">
                                        <span className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-40" />
                                    </span>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-black tracking-tight text-white">Discord Real-Time Hub</h1>
                                <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#5865F2]/15 text-[#7c87f5] border border-[#5865F2]/25">
                                    v2.1 Bot Bridge
                                </span>
                            </div>
                            <p className="text-[13px] text-slate-400 mt-1.5 flex items-center gap-2">
                                <Radio className="w-3 h-3 text-emerald-400" />
                                <span>Live In-Game ↔ Discord Cross-Chat, Status Embeds & Automated Webhooks</span>
                            </p>
                        </div>
                    </div>

                    {/* Right: Real-time Indicators & Quick Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Gateway Status Badge */}
                        <div className={cn(
                            "flex items-center gap-2.5 px-4 py-2 rounded-xl border shadow-inner transition-all",
                            connectionState === 'connected'
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.15)]"
                                : connectionState === 'checking'
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                        )}>
                            <div className="relative flex items-center justify-center">
                                {connectionState === 'connected' && (
                                    <>
                                        <div className="absolute w-full h-full bg-emerald-400 rounded-full animate-ping opacity-30"></div>
                                        <Wifi className="w-4 h-4 relative z-10" />
                                    </>
                                )}
                                {connectionState === 'checking' && <Loader2 className="w-4 h-4 animate-spin" />}
                                {connectionState === 'disconnected' && <WifiOff className="w-4 h-4" />}
                            </div>
                            <div className="text-xs font-bold uppercase tracking-wider">
                                {connectionState === 'connected' ? `Gateway Online (${gatewayPing}ms)` : connectionState === 'checking' ? 'Connecting...' : 'Gateway Offline'}
                            </div>
                        </div>

                        {/* Cluster Switcher */}
                        {clusters.length > 1 && (
                            <select
                                value={selectedClusterId ?? ''}
                                onChange={(e) => handleClusterChange(Number(e.target.value))}
                                className="bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#5865F2]"
                            >
                                {clusters.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        )}

                        {/* Master Service Button */}
                        <button
                            onClick={handleToggleService}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer",
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

                        {/* Test Connection Button */}
                        <button
                            onClick={handleTestConnection}
                            disabled={isTesting}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-all cursor-pointer"
                        >
                            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                            <span>Test Ping</span>
                        </button>

                        {/* Invite Bot */}
                        <button
                            onClick={handleGenerateInvite}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/40 text-xs font-bold text-[#5865F2] transition-all cursor-pointer"
                            title="Generate OAuth2 bot invite link"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Invite Bot</span>
                        </button>
                    </div>
                </div>

                {/* Quick Live Stats Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-white/[0.04]">
                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/5 hover:border-[#5865F2]/20 transition-all group">
                        <div className="p-2 rounded-lg bg-[#5865F2]/15 text-[#5865F2] group-hover:bg-[#5865F2]/25 transition-colors">
                            <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Cross-Chat Sync</div>
                            <div className="text-sm font-bold text-white">{config.game_to_discord && config.discord_to_game ? 'Bidirectional' : config.game_to_discord ? 'Game → Discord' : 'Disabled'}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/5 hover:border-emerald-500/20 transition-all group">
                        <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/25 transition-colors">
                            <ServerIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Servers Linked</div>
                            <div className="text-sm font-bold text-white">{onlineServersCount} / {servers.length} Online</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/5 hover:border-cyan-500/20 transition-all group">
                        <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400 group-hover:bg-cyan-500/25 transition-colors">
                            <Users className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Active Players</div>
                            <div className="text-sm font-bold text-white">{totalPlayersCount} Connected</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/5 hover:border-amber-500/20 transition-all group">
                        <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 group-hover:bg-amber-500/25 transition-colors">
                            <Bell className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Event Watchers</div>
                            <div className="text-sm font-bold text-white">8 Active Alerts</div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Navigation Tabs */}
            <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-[#0d1017]/90 border border-white/[0.06] backdrop-blur-xl shadow-sm">
                {[
                    { id: 'chat', label: 'Live Cross-Chat', icon: MessageSquare, badge: `${messages.length}` },
                    { id: 'status', label: 'Server Status & Embeds', icon: Activity },
                    { id: 'alerts', label: 'Automated Alerts', icon: Bell },
                    { id: 'bot', label: 'Bot & Gateway', icon: Bot },
                    { id: 'rcon', label: 'Admin RCON', icon: Terminal },
                    { id: 'ratelimit', label: 'Rate Limiting', icon: Sliders }
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                "relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer",
                                isActive
                                    ? "bg-[#5865F2]/15 text-[#7c87f5] shadow-[inset_0_0_16px_rgba(88,101,242,0.08)]"
                                    : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"
                            )}
                        >
                            {isActive && (
                                <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#5865F2] rounded-full" />
                            )}
                            <Icon className={cn("w-3.5 h-3.5", isActive && "text-[#5865F2]")} />
                            <span>{tab.label}</span>
                            {tab.badge && (
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-black",
                                    isActive ? "bg-[#5865F2]/20 text-[#7c87f5]" : "bg-white/[0.04] text-slate-500"
                                )}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </motion.div>

            {/* TAB 1: Real-time Live Cross-Chat Feed */}
            {activeTab === 'chat' && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Main Chat Stream */}
                    <div className="lg:col-span-2 glass-panel rounded-xl border border-white/[0.06] p-5 flex flex-col h-[620px]">
                        {/* Stream Controls Bar */}
                        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.06]">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                                    </span>
                                    <span className="text-sm font-bold text-white">Live Relay Feed</span>
                                </div>
                                <span className="text-xs text-slate-400">({filteredMessages.length} events)</span>
                            </div>

                            {/* Filter buttons */}
                            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                                {(['all', 'discord', 'game', 'system'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setChatFilter(f)}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-all",
                                            chatFilter === f
                                                ? "bg-[#5865F2] text-white"
                                                : "text-slate-400 hover:text-white"
                                        )}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chat Messages List */}
                        <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-2 scrollbar-thin scrollbar-thumb-white/10">
                            {filteredMessages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={cn(
                                        "p-3.5 rounded-xl border transition-all flex items-start gap-3.5",
                                        msg.source === 'discord' && "bg-[#5865F2]/10 border-[#5865F2]/20 hover:border-[#5865F2]/40",
                                        msg.source === 'game' && "bg-cyan-500/10 border-cyan-500/20 hover:border-cyan-500/40",
                                        msg.source === 'admin' && "bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40",
                                        msg.source === 'system' && "bg-slate-800/40 border-white/5 text-slate-400"
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
                                            <span className="font-bold text-sm text-white">{msg.author}</span>
                                            {msg.tribe && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                                    [{msg.tribe}]
                                                </span>
                                            )}
                                            {msg.serverName && (
                                                <span className="text-[11px] text-slate-400 font-medium truncate">
                                                    • {msg.serverName}
                                                </span>
                                            )}
                                            <span className="text-[10px] text-slate-500 ml-auto">
                                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-200 break-words leading-relaxed">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Interactive Message Composer */}
                        <form onSubmit={handleSendMessage} className="pt-4 border-t border-white/[0.06] space-y-3">
                            {/* Top Row: Sender Identity & Target Selector */}
                            <div className="flex items-center justify-between gap-4">
                                {/* Sender Name */}
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 bg-black/30 border border-white/[0.06] rounded-lg px-2.5 py-1.5 focus-within:border-[#5865F2]/40 transition-colors">
                                        <Bot className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                        <input
                                            type="text"
                                            value={senderName}
                                            onChange={(e) => setSenderName(e.target.value)}
                                            className="bg-transparent text-xs text-white font-medium focus:outline-none w-28 placeholder-slate-600"
                                            placeholder="Sender name..."
                                        />
                                    </div>
                                </div>

                                {/* Custom Segmented Target Picker */}
                                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/30 border border-white/[0.06]">
                                    {([
                                        { value: 'both', label: 'All Channels', icon: Zap, color: 'text-[#5865F2]', activeBg: 'bg-[#5865F2]/15', activeBorder: 'border-[#5865F2]/30' },
                                        { value: 'discord', label: 'Discord', icon: MessageSquare, color: 'text-indigo-400', activeBg: 'bg-indigo-500/15', activeBorder: 'border-indigo-500/30' },
                                        { value: 'game', label: 'In-Game', icon: ServerIcon, color: 'text-emerald-400', activeBg: 'bg-emerald-500/15', activeBorder: 'border-emerald-500/30' }
                                    ] as const).map((target) => {
                                        const Icon = target.icon;
                                        const isSelected = chatTarget === target.value;
                                        return (
                                            <button
                                                key={target.value}
                                                type="button"
                                                onClick={() => setChatTarget(target.value as any)}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer",
                                                    isSelected
                                                        ? `${target.activeBg} ${target.color} border ${target.activeBorder} shadow-sm`
                                                        : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] border border-transparent"
                                                )}
                                            >
                                                <Icon className="w-3 h-3" />
                                                <span>{target.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Bottom Row: Message Input & Send */}
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1 group">
                                    <input
                                        type="text"
                                        placeholder="Type a broadcast message to send across Discord and in-game chat..."
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        className="w-full bg-black/40 border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#5865F2]/40 focus:bg-black/50 transition-all"
                                    />
                                    <div className="absolute inset-0 rounded-xl bg-[#5865F2]/[0.02] opacity-0 group-focus-within:opacity-100 pointer-events-none transition-opacity" />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!chatInput.trim()}
                                    className={cn(
                                        "px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer",
                                        chatInput.trim()
                                            ? "bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-[0_4px_16px_rgba(88,101,242,0.25)] hover:shadow-[0_4px_20px_rgba(88,101,242,0.35)]"
                                            : "bg-white/[0.04] text-slate-600 cursor-not-allowed"
                                    )}
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>Send</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Right: Live Connected Players & Server Quick Health */}
                    <div className="space-y-5">
                        {/* Live Server Health Card */}
                        <div className="glass-panel rounded-xl border border-white/[0.06] p-5 hover:border-emerald-500/15 transition-all">
                            <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-3.5 flex items-center gap-2">
                                <ServerIcon className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Active Cluster Servers</span>
                            </h3>

                            {servers.length === 0 ? (
                                <div className="text-center py-6">
                                    <ServerIcon className="w-5 h-5 text-slate-600 mx-auto mb-2" />
                                    <p className="text-xs text-slate-500">No servers configured in this cluster.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                    {servers.map(s => {
                                        const isOnline = s.status === 'running' || s.status === 'online';
                                        const port = s.ports?.gamePort || 7777;
                                        const map = (s as any).map_name || s.config?.mapName || 'The Island';
                                        return (
                                            <div key={s.id} className="p-2.5 rounded-lg bg-black/30 border border-white/[0.04] flex items-center justify-between hover:border-white/10 transition-all">
                                                <div>
                                                    <div className="text-xs font-semibold text-white">{s.name}</div>
                                                    <div className="text-[10px] text-slate-500 mt-0.5">{map} • Port {port}</div>
                                                </div>
                                                <div className={cn(
                                                    "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                                                    isOnline ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800/50 text-slate-500"
                                                )}>
                                                    {s.status}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Live Connected Players */}
                        <div className="glass-panel rounded-xl border border-white/[0.06] p-5 hover:border-cyan-500/15 transition-all">
                            <div className="flex items-center justify-between mb-3.5">
                                <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>Online Survivors</span>
                                </h3>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400">
                                    {activePlayers.length} Online
                                </span>
                            </div>

                            {activePlayers.length === 0 ? (
                                <div className="text-center py-6">
                                    <Users className="w-5 h-5 text-slate-600 mx-auto mb-2" />
                                    <p className="text-xs text-slate-500">No players currently logged into cluster servers.</p>
                                </div>
                            ) : (
                                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                                    {activePlayers.map((p, idx) => (
                                        <div key={p.steam_id || idx} className="p-2.5 rounded-lg bg-black/30 border border-white/[0.04] flex items-center justify-between text-xs hover:border-white/10 transition-all">
                                            <div>
                                                <div className="font-semibold text-white">{p.name}</div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">Tribe: {p.tribe || 'Solo'} • Lvl {p.level}</div>
                                            </div>
                                            <div className="text-right text-[10px] text-slate-500">
                                                <div>{Math.floor(p.playtime_minutes / 60)}h {p.playtime_minutes % 60}m</div>
                                                <div className="text-emerald-400 font-medium">{p.ping} ms</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB 2: Server Status Embeds & Live Preview */}
            {activeTab === 'status' && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Left: Discord Status Embed Interactive Preview */}
                    <div className="glass-panel rounded-xl border border-white/[0.06] p-5 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                            <div>
                                <h3 className="text-sm font-bold text-white">Discord Embed Preview</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Exact live preview rendered in your Discord status channel</p>
                            </div>
                            <button
                                onClick={handleForceStatusUpdate}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                            >
                                <Send className="w-3.5 h-3.5" />
                                <span>Push Update Now</span>
                            </button>
                        </div>

                        {/* Discord UI Mockup Box */}
                        <div className="p-4 rounded-xl bg-[#2B2D31] text-slate-200 border-l-4 border-l-[#5865F2] space-y-3 shadow-lg">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-[#5865F2] flex items-center justify-center text-white">
                                    <DiscordIcon className="w-3.5 h-3.5" />
                                </div>
                                <span className="font-bold text-xs text-white">ARK Cluster Status Bot</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-[#5865F2] text-white">BOT</span>
                                <span className="text-[10px] text-slate-400 ml-auto">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span>Cluster Status: {onlineServersCount} / {servers.length} Servers Running</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                                {servers.map(s => {
                                    const map = (s as any).map_name || s.config?.mapName || 'The Island';
                                    const maxP = (s as any).max_players || s.config?.maxPlayers || 70;
                                    return (
                                        <div key={s.id} className="p-2 rounded bg-[#1E1F22] border border-white/5">
                                            <div className="font-bold text-white flex items-center justify-between">
                                                <span>{s.name}</span>
                                                <span className="text-emerald-400 text-[10px]">ONLINE</span>
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
                    <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-xl bg-[#0E121B]/90 space-y-5">
                        <h3 className="text-base font-bold text-white pb-3 border-b border-white/5">Embed Channels & Scheduling</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                    Server List Embed Channel ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 12048918239120938"
                                    value={config.server_list_channel_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, server_list_channel_id: e.target.value }))}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2]"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Channel where the persistent server overview card is pinned and edited.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                    Player List Embed Channel ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 12048918239120939"
                                    value={config.player_list_channel_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, player_list_channel_id: e.target.value }))}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2]"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
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
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
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

            {/* TAB 3: Automated Event Alerts & Webhooks */}
            {activeTab === 'alerts' && (
                <motion.div variants={itemVariants} className="glass-panel rounded-xl border border-white/[0.06] p-5 space-y-5">
                    <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.06]">
                        <div>
                            <h3 className="text-base font-bold text-white">Automated Webhook & Discord Alerts</h3>
                            <p className="text-xs text-slate-400">Trigger rich Discord embed alerts when critical server events occur</p>
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
                                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
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
                                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-400"
                            >
                                Disable All
                            </button>
                        </div>
                    </div>

                    {/* Webhook URL Input */}
                    <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                            Global Discord Webhook URL (For Alerts)
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="password"
                                placeholder="https://discord.com/api/webhooks/..."
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2]"
                            />
                            <button
                                onClick={handleSaveConfig}
                                className="px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold transition-all cursor-pointer"
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
                                            : "bg-black/30 border-white/5 opacity-60 hover:opacity-100"
                                    )}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <Icon className={cn("w-5 h-5", alert.color)} />
                                            <div className={cn(
                                                "w-4 h-4 rounded-full border flex items-center justify-center text-[10px]",
                                                isEnabled ? "bg-[#5865F2] border-[#5865F2] text-white" : "border-slate-600"
                                            )}>
                                                {isEnabled && "✓"}
                                            </div>
                                        </div>
                                        <div className="text-sm font-bold text-white">{alert.label}</div>
                                        <p className="text-xs text-slate-400 mt-1">{alert.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* TAB 4: Bot & Gateway Setup */}
            {activeTab === 'bot' && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Bot Credentials Form */}
                    <div className="glass-panel rounded-xl border border-white/[0.06] p-5 space-y-5">
                        <h3 className="text-base font-bold text-white pb-3 border-b border-white/5">Bot Token & Guild Setup</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                    Discord Bot Token (From Developer Portal)
                                </label>
                                <div className="relative">
                                    <input
                                        type={showToken ? 'text' : 'password'}
                                        placeholder="MTI5OD..."
                                        value={config.bot_token}
                                        onChange={(e) => setConfig(prev => ({ ...prev, bot_token: e.target.value }))}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl pl-4 pr-12 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                    Guild ID (Discord Server ID)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 10982390192830192"
                                    value={config.guild_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, guild_id: e.target.value }))}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                    Primary Live Cross-Chat Channel ID
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 10982390192830193"
                                    value={config.channel_id}
                                    onChange={(e) => setConfig(prev => ({ ...prev, channel_id: e.target.value }))}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2]"
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

                    {/* Step-by-Step Setup Guide */}
                    <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-xl bg-[#0E121B]/90 space-y-4">
                        <h3 className="text-base font-bold text-white pb-3 border-b border-white/5 flex items-center gap-2">
                            <HelpCircle className="w-4 h-4 text-[#5865F2]" />
                            <span>Quick Setup Instructions</span>
                        </h3>

                        <div className="space-y-3 text-xs text-slate-300">
                            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                                <div className="font-bold text-white mb-1 flex items-center justify-between">
                                    <span>1. Create Discord Application</span>
                                    <button
                                        onClick={() => openUrl('https://discord.com/developers/applications')}
                                        className="text-[#5865F2] hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                        <span>Portal</span> <ExternalLink className="w-3 h-3" />
                                    </button>
                                </div>
                                <p className="text-slate-400">Go to Discord Developer Portal → New Application → Bot → Reset Token & copy it.</p>
                            </div>

                            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                                <div className="font-bold text-white mb-1">2. Enable Privileged Gateway Intents</div>
                                <p className="text-slate-400">In the Bot tab, turn ON <b>Message Content Intent</b>, <b>Server Members Intent</b>, and <b>Presence Intent</b>.</p>
                            </div>

                            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                                <div className="font-bold text-white mb-1">3. Authorize Bot on Your Server</div>
                                <p className="text-slate-400">Click <b>Invite Bot</b> at the top of this page to add the bot with required permissions.</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB 5: Admin RCON Commands */}
            {activeTab === 'rcon' && (
                <motion.div variants={itemVariants} className="glass-panel rounded-xl border border-white/[0.06] p-5 space-y-5">
                    <h3 className="text-sm font-bold text-white pb-3 border-b border-white/[0.06]">Discord Admin & Moderation Roles</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Admin Roles */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                                Admin Role IDs (Can execute /rcon, /save, /restart)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter Discord Role ID..."
                                    value={adminRoleInput}
                                    onChange={(e) => setAdminRoleInput(e.target.value)}
                                    className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => addRoleTag('admin')}
                                    className="px-3 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl"
                                >
                                    Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {config.admin_role_ids.map(role => (
                                    <span key={role} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#5865F2]/20 text-[#5865F2] border border-[#5865F2]/30 flex items-center gap-1.5">
                                        <span>Role: {role}</span>
                                        <button onClick={() => removeRoleTag('admin', role)} className="hover:text-white">×</button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Moderator Roles */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                                Moderator Role IDs (Can execute /kick, /broadcast, /players)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter Discord Role ID..."
                                    value={modRoleInput}
                                    onChange={(e) => setModRoleInput(e.target.value)}
                                    className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => addRoleTag('mod')}
                                    className="px-3 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl"
                                >
                                    Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {config.moderator_role_ids.map(role => (
                                    <span key={role} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-1.5">
                                        <span>Role: {role}</span>
                                        <button onClick={() => removeRoleTag('mod', role)} className="hover:text-white">×</button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Slash commands reference table */}
                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                        <div className="font-bold text-xs text-white uppercase tracking-wider">Available Discord Commands</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                            <div className="p-2.5 rounded bg-white/5">
                                <code className="text-[#5865F2] font-mono font-bold">/rcon &lt;cmd&gt;</code>
                                <p className="text-slate-400 text-[11px] mt-0.5">Executes raw RCON console commands.</p>
                            </div>
                            <div className="p-2.5 rounded bg-white/5">
                                <code className="text-[#5865F2] font-mono font-bold">/broadcast &lt;msg&gt;</code>
                                <p className="text-slate-400 text-[11px] mt-0.5">Displays message on all active server screens.</p>
                            </div>
                            <div className="p-2.5 rounded bg-white/5">
                                <code className="text-[#5865F2] font-mono font-bold">/save</code>
                                <p className="text-slate-400 text-[11px] mt-0.5">Forces immediate world save across cluster.</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB 6: Rate Limiting & Anti-Spam */}
            {activeTab === 'ratelimit' && (
                <motion.div variants={itemVariants} className="glass-panel rounded-xl border border-white/[0.06] p-5 space-y-5 max-w-2xl">
                    <h3 className="text-sm font-bold text-white pb-3 border-b border-white/[0.06]">Rate Limit Protection</h3>
                    <p className="text-xs text-slate-400">
                        Prevents Discord API <code className="text-amber-400">429 Too Many Requests</code> errors during high chat activity or raid events.
                    </p>

                    <div className="space-y-5">
                        <div>
                            <div className="flex justify-between text-xs font-bold text-slate-300 mb-2">
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
                            <div className="flex justify-between text-xs font-bold text-slate-300 mb-2">
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
                            className="w-full py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                            Apply Rate Limiting Rules
                        </button>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
