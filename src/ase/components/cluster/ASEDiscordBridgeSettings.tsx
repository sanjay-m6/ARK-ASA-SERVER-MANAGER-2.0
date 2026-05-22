import { useState, useEffect, useCallback } from 'react';
import { Settings, Eye, EyeOff, CheckCircle, XCircle, Loader2, ChevronDown, BookOpen, ExternalLink, Copy, Shield, Hash, Server as ServerIcon } from 'lucide-react';
import { cn } from '../../../utils/helpers';
import {
    saveAseDiscordBridgeConfig,
    getAseDiscordBridgeConfig,
    testAseDiscordBridgeConnection,
    generateBotInviteUrl,
    DiscordBridgeConfig,
} from '../../../utils/tauri';
import toast from 'react-hot-toast';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTranslation, Trans } from 'react-i18next';

interface DiscordBridgeSettingsProps {
    clusterId: number;
    clusterName: string;
}

export default function ASEDiscordBridgeSettings({ clusterId, clusterName }: DiscordBridgeSettingsProps) {
    const { t } = useTranslation();
    const [config, setConfig] = useState<DiscordBridgeConfig>({
        cluster_id: clusterId,
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
            const existingConfig = await getAseDiscordBridgeConfig(clusterId);
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
            toast.error(t('discord.tokenAndChannelReq'));
            return;
        }

        setIsTesting(true);
        setConnectionStatus('idle');
        try {
            const result = await testAseDiscordBridgeConnection(config.bot_token, config.channel_id);
            setConnectionStatus('success');
            setConnectionMessage(result ? 'Connection successful' : 'Connection failed');
            toast.success(result ? 'Connection successful' : 'Connection failed');
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
            await saveAseDiscordBridgeConfig({
                ...config,
                cluster_id: clusterId,
            });
            toast.success(t('discord.settingsSaved'));
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : String(error);
            toast.error(t('discord.saveFailed', { error: message }));
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
                            <h3 className="text-lg font-medium text-white">{t('discord.title')}</h3>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                {t('discord.native')}
                            </span>
                        </div>
                        <p className="text-sm text-slate-400">{t('discord.connectSubtitle', { clusterName })}</p>
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
                        {config.enabled ? t('common.active') : t('common.disabled', 'Disabled')}
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
                        <span className="text-sm font-medium text-slate-200">{t('discord.setupGuideTitle')}</span>
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
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">{t('discord.step1')}</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white">{t('discord.step1Title')}</p>
                                <p className="text-xs text-slate-400">
                                    <Trans
                                        i18nKey="discord.step1Desc"
                                        components={{
                                            1: <span onClick={() => openUrl('https://discord.com/developers/applications')} className="text-indigo-400 hover:text-indigo-300 cursor-pointer inline-flex items-center gap-1">Discord Developer Portal <ExternalLink className="w-3 h-3" /></span>,
                                            2: <span className="text-white font-medium" />
                                        }}
                                    />
                                </p>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">{t('discord.step2')}</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5"><Copy className="w-3.5 h-3.5 text-indigo-400" /> {t('discord.step2Title')}</p>
                                <p className="text-xs text-slate-400">
                                    <Trans
                                        i18nKey="discord.step2Desc"
                                        components={{
                                            1: <span className="text-white font-medium" />,
                                            2: <span className="text-white font-medium" />,
                                            3: <span className="text-white font-medium" />
                                        }}
                                    />
                                </p>
                                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-300">
                                    {t('discord.step2Warning')}
                                </div>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">{t('discord.step3')}</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-indigo-400" /> {t('discord.step3Title')}</p>
                                <p className="text-xs text-slate-400">
                                    <Trans
                                        i18nKey="discord.step3Desc"
                                        components={{
                                            1: <span className="text-white font-medium" />,
                                            2: <span className="text-white font-medium" />
                                        }}
                                    />
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[11px] rounded border border-indigo-500/20">{t('discord.step3Intents1')}</span>
                                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[11px] rounded border border-indigo-500/20">{t('discord.step3Intents2')}</span>
                                </div>
                            </div>
                        </div>

                        {/* Step 4 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">{t('discord.step4')}</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5"><ServerIcon className="w-3.5 h-3.5 text-indigo-400" /> {t('discord.step4Title')}</p>
                                <p className="text-xs text-slate-400">
                                    <Trans i18nKey="discord.step4Desc" components={{ 1: <span className="text-white font-medium" /> }} />
                                </p>
                                <div className="space-y-1.5 text-xs text-slate-400">
                                    <p><Trans i18nKey="discord.step4Scopes" components={{ 1: <span className="text-white" />, 2: <span className="text-indigo-300" /> }} /></p>
                                    <p><Trans i18nKey="discord.step4Perms" components={{ 1: <span className="text-white" /> }} /></p>
                                    <div className="flex flex-wrap gap-1.5 pl-3 pt-0.5">
                                        {(t('discord.step4PermsList', { returnObjects: true }) as unknown as string).split('\n').map((item, i) => (
                                            <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded">{item}</span>
                                        ))}
                                    </div>
                                    <p><Trans i18nKey="discord.step4GenUrl" components={{ 1: <span className="text-white" /> }} /></p>
                                </div>
                            </div>
                        </div>

                        {/* Step 5 */}
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">{t('discord.step5')}</div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-indigo-400" /> {t('discord.step5Title')}</p>
                                <p className="text-xs text-slate-400">
                                    <Trans i18nKey="discord.step5Desc" components={{ 1: <span className="text-white font-medium" /> }} />
                                </p>
                                <div className="space-y-1 text-xs text-slate-400">
                                    <p><Trans i18nKey="discord.step5ServerId" components={{ 1: <span className="text-white" />, 2: <span className="text-indigo-300" /> }} /></p>
                                    <p><Trans i18nKey="discord.step5ChannelId" components={{ 1: <span className="text-white" />, 2: <span className="text-indigo-300" /> }} /></p>
                                </div>
                            </div>
                        </div>

                        {/* Done */}
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span><Trans i18nKey="discord.guideDone" components={{ 1: <span className="font-medium" /> }} /></span>
                        </div>
                    </div>
                )}
            </div>

            {/* Configuration Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bot Token */}
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        {t('discord.botToken')}
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
                        <Trans i18nKey="discord.createBotLink" components={{ 1: <span onClick={() => openUrl('https://discord.com/developers/applications')} className="text-violet-400 hover:underline cursor-pointer" /> }} defaults="Create a bot at <1>Discord Developer Portal</1>" />
                    </p>
                </div>

                {/* Guild ID */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        {t('discord.guildId')}
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
                        {t('discord.channelId')}
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

                {/* Admin Channel ID */}
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-2">
                        {t('discord.adminChannelId', 'Admin Command Channel ID')}
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Safe & Secure
                        </span>
                    </label>
                    <input
                        type="text"
                        value={config.admin_channel_id}
                        onChange={(e) => setConfig({ ...config, admin_channel_id: e.target.value })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Channel ID for Admin Commands (!restart, !kick)"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent select-text cursor-text"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                        Commands like <code>!kick</code> and <code>!restart</code> will ONLY work in this channel.
                    </p>
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
                        {t('discord.gameToDiscord')}
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
                        {t('discord.discordToGame')}
                    </span>
                </label>
            </div>

            {/* Live Server List */}
            <div className="space-y-4 pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-semibold text-white">{t('discord.statusPanel')}</h4>
                        <p className="text-xs text-slate-400">{t('discord.statusPanelDesc')}</p>
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
                                {t('discord.channelId')}
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
                                {t('discord.messageId')}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={config.server_list_message_id}
                                    readOnly
                                    placeholder={t('discord.messageIdPlaceholder')}
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
                        <h4 className="text-sm font-semibold text-white">{t('discord.playerList')}</h4>
                        <p className="text-xs text-slate-400">{t('discord.playerListDesc')}</p>
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
                                {t('discord.channelId')}
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
                                <span className="text-xs text-slate-300">{t('discord.showTribes')}</span>
                            </label>
                            {/* Playtime toggle not implemented in backend yet fully but UI can have it */}
                        </div>

                        <div className="">
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                {t('discord.messageId')}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={config.player_list_message_id}
                                    readOnly
                                    placeholder={t('discord.messageIdPlaceholder')}
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
                            toast.error(t('discord.enterTokenFirst'));
                            return;
                        }
                        try {
                            const url = await generateBotInviteUrl(config.bot_token);
                            await openUrl(url);
                            toast.success(t('discord.inviteOpened'));
                        } catch (error) {
                            toast.error(String(error));
                        }
                    }}
                    disabled={!config.bot_token}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-500/20"
                >
                    <ExternalLink className="w-4 h-4" />
                    <span>{t('discord.generateInvite')}</span>
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
                    <span>{t('discord.testConnection')}</span>
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{t('common.saveSettings', 'Save Settings')}</span>
                </button>
            </div>
        </div>
    );
}

