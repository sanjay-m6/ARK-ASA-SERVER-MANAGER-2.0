import { useState, useEffect, useCallback } from 'react';
import { Settings, Eye, EyeOff, CheckCircle, XCircle, Loader2, ArrowRight, ArrowLeft, ChevronDown, BookOpen, ExternalLink, Copy, Shield, Hash, Server as ServerIcon } from 'lucide-react';
import { cn } from '../../utils/helpers';
import {
    saveDiscordBridgeConfig,
    getDiscordBridgeConfig,
    testDiscordConnection,
    generateBotInviteUrl,
    DiscordBridgeConfig,
} from '../../utils/tauri';
import toast from 'react-hot-toast';
import { openUrl } from '@tauri-apps/plugin-opener';

interface DiscordBridgeSettingsProps {
    clusterId: number;
    clusterName: string;
}

export default function DiscordBridgeSettings({ clusterId, clusterName }: DiscordBridgeSettingsProps) {
    const [config, setConfig] = useState<DiscordBridgeConfig>({
        cluster_id: clusterId,
        enabled: false,
        bot_token: '',
        guild_id: '',
        channel_id: '',
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
    });

    const [showToken, setShowToken] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [connectionMessage, setConnectionMessage] = useState('');
    const [showGuide, setShowGuide] = useState(false);

    const loadConfig = useCallback(async () => {
        try {
            const existingConfig = await getDiscordBridgeConfig(clusterId);
            if (existingConfig) {
                setConfig(existingConfig);
            }
        } catch (error) {
            console.error('Failed to load Discord config:', error);
        }
    }, [clusterId]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const handleTestConnection = async () => {
        if (!config.bot_token || !config.channel_id) {
            toast.error('Bot token and channel ID are required');
            return;
        }

        setIsTesting(true);
        setConnectionStatus('idle');
        try {
            const result = await testDiscordConnection(config.bot_token, config.channel_id);
            setConnectionStatus('success');
            setConnectionMessage(result);
            toast.success(result);
        } catch (error) {
            setConnectionStatus('error');
            setConnectionMessage(String(error));
            toast.error(String(error));
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveDiscordBridgeConfig({
                ...config,
                cluster_id: clusterId,
            });
            toast.success('Discord bridge settings saved');
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : String(error);
            toast.error(`Failed to save settings: ${message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-slate-900/50 rounded-xl border border-violet-500/30 p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                        <Settings className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-medium text-white">Discord Bridge</h3>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                NATIVE
                            </span>
                        </div>
                        <p className="text-sm text-slate-400">Connect {clusterName} to Discord</p>
                    </div>
                </div>

                {/* Enable Toggle */}
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border",
                        config.enabled
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                    )}>
                        {config.enabled ? 'Active' : 'Disabled'}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>
            </div>

            {/* Setup Guide */}
            <div className="border border-slate-700/50 rounded-lg overflow-hidden">
                <button
                    onClick={() => setShowGuide(!showGuide)}
                    className="w-full flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 transition-colors text-left"
                >
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm font-medium text-slate-200">How to Set Up Your Discord Bot</span>
                    </div>
                    <ChevronDown className={cn(
                        "w-4 h-4 text-slate-400 transition-transform duration-200",
                        showGuide && "rotate-180"
                    )} />
                </button>

                {showGuide && (
                    <div className="p-4 pt-2 space-y-4 border-t border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-200">

                        {/* Step 1 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">1</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white">Create a Discord Application</p>
                                <p className="text-xs text-slate-400">
                                    Go to the <span onClick={() => openUrl('https://discord.com/developers/applications')} className="text-indigo-400 hover:text-indigo-300 cursor-pointer inline-flex items-center gap-1">Discord Developer Portal <ExternalLink className="w-3 h-3" /></span> and click <span className="text-white font-medium">"New Application"</span>. Give it a name (e.g., "ARK Server Bot").
                                </p>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">2</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5"><Copy className="w-3.5 h-3.5 text-indigo-400" /> Copy the Bot Token</p>
                                <p className="text-xs text-slate-400">
                                    In the left sidebar, click <span className="text-white font-medium">"Bot"</span>. Click <span className="text-white font-medium">"Reset Token"</span> and copy it. Paste it in the <span className="text-white font-medium">Bot Token</span> field above.
                                </p>
                                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-300">
                                    ⚠️ Keep your token secret! Never share it publicly.
                                </div>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">3</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-indigo-400" /> Enable Gateway Intents</p>
                                <p className="text-xs text-slate-400">
                                    On the same <span className="text-white font-medium">"Bot"</span> page, scroll down to <span className="text-white font-medium">"Privileged Gateway Intents"</span> and enable:
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[11px] rounded border border-indigo-500/20">✅ MESSAGE CONTENT INTENT</span>
                                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[11px] rounded border border-indigo-500/20">✅ SERVER MEMBERS INTENT</span>
                                </div>
                            </div>
                        </div>

                        {/* Step 4 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">4</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5"><ServerIcon className="w-3.5 h-3.5 text-indigo-400" /> Invite the Bot to Your Server</p>
                                <p className="text-xs text-slate-400">
                                    Go to <span className="text-white font-medium">"OAuth2" → "URL Generator"</span> in the sidebar.
                                </p>
                                <div className="space-y-1.5 text-xs text-slate-400">
                                    <p>• Under <span className="text-white">Scopes</span>, check: <span className="text-indigo-300">bot</span></p>
                                    <p>• Under <span className="text-white">Bot Permissions</span>, check:</p>
                                    <div className="flex flex-wrap gap-1.5 pl-3 pt-0.5">
                                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded">View Channels</span>
                                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded">Send Messages</span>
                                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded">Read Message History</span>
                                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded">Manage Messages</span>
                                    </div>
                                    <p>• Copy the <span className="text-white">Generated URL</span> at the bottom, open it in your browser, and select your server.</p>
                                </div>
                            </div>
                        </div>

                        {/* Step 5 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">5</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-indigo-400" /> Get Server & Channel IDs</p>
                                <p className="text-xs text-slate-400">
                                    In Discord, go to <span className="text-white font-medium">User Settings → Advanced → Enable Developer Mode</span>.
                                </p>
                                <div className="space-y-1 text-xs text-slate-400">
                                    <p>• <span className="text-white">Server ID</span>: Right-click your server name → <span className="text-indigo-300">Copy Server ID</span></p>
                                    <p>• <span className="text-white">Channel ID</span>: Right-click the channel → <span className="text-indigo-300">Copy Channel ID</span></p>
                                </div>
                            </div>
                        </div>

                        {/* Done */}
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Once you've completed all steps, paste your Bot Token, Guild ID, and Channel ID above, then click <span className="font-medium">Test Connection</span>.</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Configuration Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bot Token */}
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Bot Token
                    </label>
                    <div className="relative">
                        <input
                            type={showToken ? 'text' : 'password'}
                            value={config.bot_token}
                            onChange={(e) => setConfig({ ...config, bot_token: e.target.value })}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder="Enter your Discord bot token"
                            className="w-full px-4 py-2.5 pr-12 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent select-text cursor-text"
                        />
                        <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Create a bot at <span onClick={() => openUrl('https://discord.com/developers/applications')} className="text-violet-400 hover:underline cursor-pointer">Discord Developer Portal</span>
                    </p>
                </div>

                {/* Guild ID */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Server (Guild) ID
                    </label>
                    <input
                        type="text"
                        value={config.guild_id}
                        onChange={(e) => setConfig({ ...config, guild_id: e.target.value })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="e.g., 123456789012345678"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent select-text cursor-text"
                    />
                </div>

                {/* Channel ID */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Channel ID
                    </label>
                    <input
                        type="text"
                        value={config.channel_id}
                        onChange={(e) => setConfig({ ...config, channel_id: e.target.value })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="e.g., 987654321098765432"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent select-text cursor-text"
                    />
                </div>
            </div>

            {/* Direction Toggles */}
            <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={config.game_to_discord}
                        onChange={(e) => setConfig({ ...config, game_to_discord: e.target.checked })}
                        className="sr-only"
                    />
                    <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        config.game_to_discord
                            ? "bg-violet-600 border-violet-500"
                            : "bg-slate-800 border-slate-600 group-hover:border-slate-500"
                    )}>
                        {config.game_to_discord && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-sm text-slate-300 flex items-center gap-1">
                        Game <ArrowRight className="w-3 h-3" /> Discord
                    </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={config.discord_to_game}
                        onChange={(e) => setConfig({ ...config, discord_to_game: e.target.checked })}
                        className="sr-only"
                    />
                    <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        config.discord_to_game
                            ? "bg-violet-600 border-violet-500"
                            : "bg-slate-800 border-slate-600 group-hover:border-slate-500"
                    )}>
                        {config.discord_to_game && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-sm text-slate-300 flex items-center gap-1">
                        Discord <ArrowLeft className="w-3 h-3" /> Game
                    </span>
                </label>
            </div>

            {/* Live Server List */}
            <div className="space-y-4 pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-semibold text-white">Cluster Status Panel</h4>
                        <p className="text-xs text-slate-400">Live updating server list message</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.server_list_enabled}
                            onChange={(e) => setConfig({ ...config, server_list_enabled: e.target.checked })}
                            className="sr-only"
                        />
                        <div className={cn(
                            "w-9 h-5 rounded-full transition-colors relative",
                            config.server_list_enabled ? "bg-violet-600" : "bg-slate-700"
                        )}>
                            <div className={cn(
                                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                                config.server_list_enabled && "translate-x-4"
                            )} />
                        </div>
                    </label>
                </div>

                {config.server_list_enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                Channel ID
                            </label>
                            <input
                                type="text"
                                value={config.server_list_channel_id}
                                onChange={(e) => setConfig({ ...config, server_list_channel_id: e.target.value })}
                                onMouseDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder="Channel ID for Status Panel (can be same as chat)"
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 select-text cursor-text"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                Message ID (Auto-filled)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={config.server_list_message_id}
                                    readOnly
                                    placeholder="Will appear after first update..."
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-500 cursor-not-allowed"
                                />
                                <button
                                    onClick={() => setConfig({ ...config, server_list_message_id: '' })}
                                    className="px-3 py-1 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-xs text-slate-400 rounded border border-slate-700 transition"
                                    title="Reset to force new message"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Live Player List */}
            <div className="space-y-4 pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-semibold text-white">Live Player List</h4>
                        <p className="text-xs text-slate-400">Real-time list of online players</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.player_list_enabled}
                            onChange={(e) => setConfig({ ...config, player_list_enabled: e.target.checked })}
                            className="sr-only"
                        />
                        <div className={cn(
                            "w-9 h-5 rounded-full transition-colors relative",
                            config.player_list_enabled ? "bg-violet-600" : "bg-slate-700"
                        )}>
                            <div className={cn(
                                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                                config.player_list_enabled && "translate-x-4"
                            )} />
                        </div>
                    </label>
                </div>

                {config.player_list_enabled && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="">
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                Channel ID
                            </label>
                            <input
                                type="text"
                                value={config.player_list_channel_id}
                                onChange={(e) => setConfig({ ...config, player_list_channel_id: e.target.value })}
                                onMouseDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder="Channel ID for Player List"
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 select-text cursor-text"
                            />
                        </div>

                        {/* Optional Toggles */}
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.show_tribe_names}
                                    onChange={(e) => setConfig({ ...config, show_tribe_names: e.target.checked })}
                                    className="rounded border-slate-700 bg-slate-800 text-violet-600 focus:ring-violet-500"
                                />
                                <span className="text-xs text-slate-300">Show Tribes</span>
                            </label>
                            {/* Playtime toggle not implemented in backend yet fully but UI can have it */}
                        </div>

                        <div className="">
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                Message ID (Auto-filled)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={config.player_list_message_id}
                                    readOnly
                                    placeholder="Will appear after first update..."
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-500 cursor-not-allowed"
                                />
                                <button
                                    onClick={() => setConfig({ ...config, player_list_message_id: '' })}
                                    className="px-3 py-1 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-xs text-slate-400 rounded border border-slate-700 transition"
                                    title="Reset to force new message"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Connection Status */}
            {connectionStatus !== 'idle' && (
                <div className={cn(
                    "flex items-center gap-2 p-3 rounded-lg",
                    connectionStatus === 'success' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                )}>
                    {connectionStatus === 'success' ? (
                        <CheckCircle className="w-5 h-5" />
                    ) : (
                        <XCircle className="w-5 h-5" />
                    )}
                    <span className="text-sm">{connectionMessage}</span>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
                <button
                    onClick={async () => {
                        if (!config.bot_token) {
                            toast.error('Enter your bot token first');
                            return;
                        }
                        try {
                            const url = await generateBotInviteUrl(config.bot_token);
                            await openUrl(url);
                            toast.success('Invite link opened! Select your server and authorize.');
                        } catch (error) {
                            toast.error(String(error));
                        }
                    }}
                    disabled={!config.bot_token}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-500/20"
                >
                    <ExternalLink className="w-4 h-4" />
                    <span>Generate Invite Link</span>
                </button>
                <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !config.bot_token || !config.channel_id}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Settings className="w-4 h-4" />
                    )}
                    <span>Test Connection</span>
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Save Settings</span>
                </button>
            </div>
        </div>
    );
}
