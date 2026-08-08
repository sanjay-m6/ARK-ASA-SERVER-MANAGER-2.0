import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { Copy, Bell, Loader2, AlertCircle, RefreshCw, ChevronDown, Plus, Server, Users, Check, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/helpers';
import { useServerStore } from '../../stores/serverStore';
import { useAseServerStore } from '../../ase/stores/aseServerStore';
import { useInstallStore } from '../../stores/installStore';
import { useGameStore } from '../../stores/gameStore';
import { usePublicIP } from '../../hooks/usePublicIP';
import { UpdateInfo, manualCheckForUpdates } from '../UpdateChecker';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import ServerOverviewModal from '../server/ServerOverviewModal';

export default function TopBar() {
    const asaServers = useServerStore((state) => state.servers);
    const aseServers = useAseServerStore((state) => state.servers);
    const activeAsaServer = useServerStore((state) => state.activeServer);
    const activeAseServer = useAseServerStore((state) => state.activeServer);
    const { activeGame } = useGameStore();
    const isASE = activeGame === 'ASE';
    const servers = isASE ? aseServers : asaServers;
    const activeServer = isASE ? activeAseServer : activeAsaServer;
    const { t } = useTranslation();
    const [appVersion, setAppVersion] = useState<string>('?.?.?');
    const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [isOverviewOpen, setIsOverviewOpen] = useState(false);

    // IP Hook
    const { data: publicIp, isLoading: isLoadingIp, isError: isErrorIp, refetch: refetchIp } = usePublicIP();


    // Helper accessors supporting both ASA (Server) and ASE (AseServer) types
    const getGamePort = (srv: any) => srv?.ports?.gamePort ?? srv?.port ?? 7777;
    const getMapName = (srv: any) => srv?.config?.mapName ?? srv?.mapName ?? 'TheIsland';
    const getMaxPlayers = (srv: any) => srv?.config?.maxPlayers ?? srv?.maxPlayers ?? 70;
    const getPlayerCount = (srv: any) => srv?.players?.length ?? srv?.playerCount ?? 0;

    // Server Status Logic
    const runningServers = servers.filter((s: any) => 
        s.status === 'running' || 
        s.status === 'online' || 
        s.status === 'starting' || 
        s.status === 'updating' || 
        s.status === 'restarting' || 
        s.status === 'stopping'
    ).length;
    const isAnyServerRunning = runningServers > 0;

    useEffect(() => {
        getVersion().then(setAppVersion).catch(() => setAppVersion('?.?.?'));

        let unlistenUpdate: UnlistenFn | null = null;

        const setupUpdateListener = async () => {
            // Listen for updates found by the UpdateChecker component
            unlistenUpdate = await listen<UpdateInfo>('update-found', (event) => {
                setUpdateAvailable(event.payload);
            });
        };

        setupUpdateListener();

        return () => {
            if (unlistenUpdate) unlistenUpdate();
        };
    }, []);

    const handleCopyIp = () => {
        if (publicIp) {
            navigator.clipboard.writeText(publicIp);
            toast.success(t('dashboard.copiedToClipboard', { address: publicIp }), {
                icon: '📋',
            });
        }
    };

    const handleUpdateClick = () => {
        // Trigger existing update checker UI or handle download
        window.dispatchEvent(new Event('show-update-banner'));
    };

    const handleManualCheck = async () => {
        if (isChecking) return;
        setIsChecking(true);
        try {
            const result = await manualCheckForUpdates();
            if (result.available && result.update) {
                toast.success(t('settings.updatesTab.updateAvailable', `Update v${result.update.version} is available!`));
                window.dispatchEvent(new Event('show-update-banner'));
            } else if (result.error) {
                toast.error(result.error);
            } else {
                toast.success(t('settings.updatesTab.latestVersion', 'You are on the latest version'));
            }
        } catch (err) {
            console.error('Failed to check for updates:', err);
            toast.error(t('settings.updatesTab.checkFailed', 'Failed to check for updates'));
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div className="flex items-center justify-between w-full h-[76px] glass-panel static-panel border-b border-white/10 px-6 flex-shrink-0 z-40 relative">
            {/* Background glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-sky-500/5 via-violet-500/5 to-transparent rounded-full blur-3xl -mr-48 -mt-48 pointer-events-none"></div>

            {/* LEFT: Quick Cluster Stats & Active Server Selector */}
            <div className="flex items-center gap-3 z-10 flex-shrink-0">
                {/* Quick Cluster Stats Pill */}
                <div className="hidden lg:flex items-center gap-3 bg-slate-900/80 border border-white/10 rounded-xl h-10 px-3.5 text-xs font-medium backdrop-blur-md shadow-sm">
                    <div className="flex items-center gap-1.5 text-slate-300">
                        <Server className="w-3.5 h-3.5 text-sky-400" />
                        <span className="font-bold text-white">{runningServers}</span>
                        <span className="text-slate-400 text-[11px] font-semibold">Active</span>
                    </div>
                    <div className="w-px h-3.5 bg-slate-700/80"></div>
                    <div className="flex items-center gap-1.5 text-slate-300">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-bold text-white">
                            {servers.reduce((acc: number, s: any) => acc + getPlayerCount(s), 0)}
                        </span>
                        <span className="text-slate-400 text-[11px] font-semibold">Players</span>
                    </div>
                </div>

                {/* Active Server Instance Selector */}
                <Menu as="div" className="relative">
                    {({ open }) => (
                        <>
                            <Menu.Button className={cn(
                                "flex items-center gap-3 h-10 px-3.5 rounded-xl border transition-all duration-200 outline-none shadow-sm group",
                                isASE
                                    ? open
                                        ? "bg-slate-900 border-amber-500 text-white shadow-amber-500/10"
                                        : "bg-slate-900/80 border-amber-500/30 hover:border-amber-400 text-slate-200"
                                    : open
                                        ? "bg-slate-900 border-sky-500 text-white shadow-sky-500/10"
                                        : "bg-slate-900/80 border-sky-500/30 hover:border-sky-400 text-slate-200"
                            )}>
                                <div className={cn(
                                    "w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all",
                                    activeServer?.status === 'running' || activeServer?.status === 'online'
                                        ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse"
                                        : activeServer?.status === 'starting' || activeServer?.status === 'updating'
                                        ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)] animate-pulse"
                                        : "bg-slate-500"
                                )}></div>
                                <div className="flex flex-col items-start leading-tight">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-sky-400 flex items-center gap-1">
                                        EDITING TARGET
                                    </span>
                                    <span className="text-xs font-extrabold text-white max-w-[150px] truncate">
                                        {activeServer ? activeServer.name : 'No Active Server'}
                                    </span>
                                </div>
                                {activeServer && (
                                    <span className="hidden sm:inline-flex text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/5">
                                        :{getGamePort(activeServer)}
                                    </span>
                                )}
                                <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ml-0.5 group-hover:text-white", open ? "rotate-180 text-sky-400" : "")} />
                            </Menu.Button>

                            <Transition
                                as={Fragment}
                                enter="transition ease-out duration-100"
                                enterFrom="transform opacity-0 scale-95"
                                enterTo="transform opacity-100 scale-100"
                                leave="transition ease-in duration-75"
                                leaveFrom="transform opacity-100 scale-100"
                                leaveTo="transform opacity-0 scale-95"
                            >
                                <Menu.Items className="absolute left-0 mt-2.5 w-[380px] max-w-[calc(100vw-2.5rem)] origin-top-left rounded-2xl bg-slate-950/95 border border-slate-700/80 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl focus:outline-none overflow-hidden z-50 p-4 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
                                    {/* Header */}
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                                        <div className="flex items-center gap-2.5">
                                            <div className={cn(
                                                "p-2 rounded-xl border shadow-sm",
                                                isASE ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-sky-500/10 border-sky-500/20 text-sky-400"
                                            )}>
                                                <Server className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                                                    Server Switcher
                                                    <span className={cn(
                                                        "text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider",
                                                        isASE ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "bg-sky-500/15 border-sky-500/30 text-sky-300"
                                                    )}>
                                                        {isASE ? 'ASE' : 'ASA'}
                                                    </span>
                                                </h3>
                                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Select a server instance to edit settings</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-mono bg-slate-900 border border-slate-800 text-sky-400 px-2.5 py-0.5 rounded-full font-black shadow-inner">
                                            {servers.length} {servers.length === 1 ? 'Server' : 'Servers'}
                                        </span>
                                    </div>

                                    {/* Active Server Spotlight Card */}
                                    {activeServer ? (
                                        <div className={cn(
                                            "p-3.5 rounded-xl border relative overflow-hidden transition-all shadow-md",
                                            isASE
                                                ? "bg-slate-900/90 border-amber-500/30"
                                                : "bg-slate-900/90 border-sky-500/30"
                                        )}>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className={cn(
                                                            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                                            activeServer.status === 'running' || activeServer.status === 'online' ? "bg-emerald-400" : "bg-sky-400"
                                                        )}></span>
                                                        <span className={cn(
                                                            "relative inline-flex rounded-full h-2 w-2",
                                                            activeServer.status === 'running' || activeServer.status === 'online' ? "bg-emerald-400" : "bg-slate-400"
                                                        )}></span>
                                                    </span>
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-sky-400">CURRENTLY EDITING SERVER</span>
                                                </div>
                                                <span className={cn(
                                                    "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide",
                                                    activeServer.status === 'running' || activeServer.status === 'online'
                                                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                        : activeServer.status === 'starting' || activeServer.status === 'updating'
                                                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                                        : "bg-slate-800 text-slate-400 border border-slate-700"
                                                )}>
                                                    {activeServer.status || 'STOPPED'}
                                                </span>
                                            </div>

                                            <div className="flex items-baseline justify-between mb-2.5">
                                                <h4 className="text-base font-black text-white truncate pr-2 tracking-wide">{activeServer.name}</h4>
                                                <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">ID: {activeServer.id}</span>
                                            </div>

                                            {/* Specs Grid */}
                                            <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-800 text-[10px]">
                                                <div className="bg-slate-950/80 p-2 rounded-xl border border-white/5 shadow-inner">
                                                    <span className="text-slate-500 font-bold block text-[9px] uppercase tracking-wider">MAP</span>
                                                    <span className="text-slate-200 font-mono font-bold truncate block mt-0.5">{getMapName(activeServer)}</span>
                                                </div>
                                                <div className="bg-slate-950/80 p-2 rounded-xl border border-white/5 shadow-inner">
                                                    <span className="text-slate-500 font-bold block text-[9px] uppercase tracking-wider">GAME PORT</span>
                                                    <span className="text-sky-400 font-mono font-bold block mt-0.5">{getGamePort(activeServer)}</span>
                                                </div>
                                                <div className="bg-slate-950/80 p-2 rounded-xl border border-white/5 shadow-inner">
                                                    <span className="text-slate-500 font-bold block text-[9px] uppercase tracking-wider">PLAYERS</span>
                                                    <span className="text-emerald-400 font-mono font-bold block mt-0.5">
                                                        {getPlayerCount(activeServer)} / {getMaxPlayers(activeServer)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Full Overview & Things We Know Modal Trigger */}
                                            <button
                                                onClick={() => setIsOverviewOpen(true)}
                                                className="w-full mt-3 py-2 bg-gradient-to-r from-sky-500/20 via-sky-500/15 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 text-sky-300 border border-sky-500/40 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2 shadow-md group tracking-wide"
                                            >
                                                <Info className="w-4 h-4 group-hover:scale-110 transition-transform text-sky-400" />
                                                <span>View Full Server Overview & Details</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                                            No server selected for editing. Pick one below.
                                        </div>
                                    )}

                                    {/* All Servers List */}
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                SELECT SERVER TO EDIT
                                            </span>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                                            {servers.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                                                    No servers created yet
                                                </div>
                                            ) : (
                                                servers.map((srv: any) => {
                                                    const isSelected = activeServer?.id === srv.id;
                                                    return (
                                                        <Menu.Item key={srv.id}>
                                                            {({ active }) => (
                                                                <button
                                                                    onClick={() => {
                                                                        if (isASE) {
                                                                            useAseServerStore.getState().setActiveServer(srv);
                                                                        } else {
                                                                            useServerStore.getState().setActiveServer(srv);
                                                                        }
                                                                        toast.success(`Active Server: ${srv.name} (Port: ${getGamePort(srv)})`, {
                                                                            icon: '⚙️',
                                                                            style: { background: '#0f172a', color: '#fff', border: '1px solid #38bdf8' }
                                                                        });
                                                                    }}
                                                                    className={cn(
                                                                        "w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group border cursor-pointer",
                                                                        isSelected
                                                                            ? "bg-sky-500/15 border-sky-500/50 text-white shadow-md shadow-sky-500/10 ring-1 ring-sky-500/30"
                                                                            : active
                                                                            ? "bg-slate-900 border-slate-700 text-slate-200"
                                                                            : "bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700"
                                                                    )}
                                                                >
                                                                    <div className="flex items-center gap-3 min-w-0 pr-2">
                                                                        <div className={cn(
                                                                            "w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors shadow-sm",
                                                                            isSelected
                                                                                ? "bg-sky-500 text-slate-950 font-bold"
                                                                                : "bg-slate-800/90 text-slate-400 group-hover:text-slate-200 border border-white/5"
                                                                        )}>
                                                                            {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : <Server className="w-4 h-4" />}
                                                                        </div>
                                                                        <div className="flex flex-col truncate">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-xs font-black truncate text-white">{srv.name}</span>
                                                                                {isSelected && (
                                                                                    <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-sky-500/20 text-sky-300 rounded-full border border-sky-500/40 tracking-wider">
                                                                                        EDITING NOW
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                                                                                Port: <strong className="text-slate-300">{getGamePort(srv)}</strong> | Map: <strong className="text-slate-300">{getMapName(srv)}</strong>
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <span className={cn(
                                                                        "text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 ml-1.5 shadow-sm border",
                                                                        srv.status === 'running' || srv.status === 'online'
                                                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                                                            : srv.status === 'starting' || srv.status === 'updating'
                                                                            ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                                                            : "bg-slate-800 text-slate-400 border-slate-700"
                                                                    )}>
                                                                        {srv.status || 'stopped'}
                                                                    </span>
                                                                </button>
                                                            )}
                                                        </Menu.Item>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer Button */}
                                    <div className="pt-2.5 border-t border-slate-800/80">
                                        <Menu.Item>
                                            {({ active }) => (
                                                <button
                                                    onClick={() => {
                                                        useInstallStore.getState().setDraftOpen(true);
                                                    }}
                                                    className={cn(
                                                        "w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]",
                                                        active
                                                            ? "bg-gradient-to-r from-sky-500 to-sky-400 text-white shadow-sky-500/25"
                                                            : "bg-gradient-to-r from-sky-600 to-sky-500 text-white shadow-sky-500/20"
                                                    )}
                                                >
                                                    <Plus className="w-4 h-4 stroke-[3]" />
                                                    <span>Create New Server</span>
                                                </button>
                                            )}
                                        </Menu.Item>
                                    </div>
                                </Menu.Items>
                            </Transition>
                        </>
                    )}
                </Menu>
            </div>

            {/* RIGHT: Status indicators, IP, Version, Discord, Notifications */}
            <div className="flex items-center gap-2.5 z-10">
                {/* Public IP Display Pill */}
                <div className="flex items-center gap-2 h-10 bg-slate-900/80 border border-white/10 rounded-xl px-3.5 backdrop-blur-md shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('dashboard.publicIpAddress', 'IP')}:</span>
                    <div className="flex items-center">
                        {isLoadingIp ? (
                            <div className="flex items-center gap-1.5 text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> <span className="text-xs font-mono">Detecting...</span></div>
                        ) : isErrorIp ? (
                            <span className="text-xs font-mono text-slate-400 italic flex items-center gap-1 cursor-pointer hover:text-white transition-colors" onClick={() => refetchIp()} title="Click to retry">
                                <AlertCircle className="w-3 h-3 text-amber-400" /> N/A
                            </span>
                        ) : (
                            <span className="text-xs font-mono font-bold text-slate-200">{publicIp}</span>
                        )}
                    </div>
                    <button
                        onClick={handleCopyIp}
                        disabled={!publicIp}
                        className="ml-1 p-1 hover:bg-slate-800 rounded-md transition-all text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed group"
                        title={t('dashboard.copyIp', 'Copy IP Address')}
                    >
                        <Copy className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    </button>
                </div>

                {/* Version & Update Button Pill */}
                <div className="flex items-center gap-2 h-10 bg-slate-900/80 border border-white/10 rounded-xl px-3.5 backdrop-blur-md shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('common.version', 'VER')}:</span>
                    <span className="text-xs font-bold text-slate-200 font-mono">v{appVersion.replace('-0', '-beta')}</span>
                    {(appVersion.includes('beta') || appVersion.includes('-0')) && (
                        <span className={cn(
                            "px-1.5 py-0.5 text-[8px] font-extrabold tracking-wider rounded border uppercase backdrop-blur-sm leading-none",
                            isASE
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                        )}>
                            Beta
                        </span>
                    )}
                    <button
                        onClick={handleManualCheck}
                        disabled={isChecking}
                        className={cn(
                            "ml-0.5 p-1 hover:bg-slate-800 rounded-md transition-all text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed group",
                            isASE ? "hover:text-amber-400" : "hover:text-cyan-400"
                        )}
                        title={t('settings.updatesTab.checkForUpdates', 'Check for Updates')}
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5 group-hover:scale-110 transition-transform", isChecking ? "animate-spin" : "")} />
                    </button>
                </div>

                {/* Divider */}
                <div className="w-px h-5 bg-white/10 mx-0.5"></div>

                {/* Global System Status Pill — visible only when online */}
                {(() => {
                    const status = activeServer?.status || (isAnyServerRunning ? 'running' : 'offline');
                    const isOnline = status === 'running' || status === 'online';

                    if (!isOnline) return null;

                    return (
                        <div className="flex items-center gap-2 h-10 px-3.5 rounded-xl border backdrop-blur-md shadow-sm transition-all duration-300 bg-emerald-500/10 border-emerald-500/30 text-emerald-400 animate-in fade-in duration-300">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></div>
                            <span className="text-xs font-bold tracking-wider uppercase">ONLINE</span>
                        </div>
                    );
                })()}

                {/* Discord Link Pill */}
                <button
                    onClick={() => openUrl('https://discord.gg/9CF8hRX8rr')}
                    className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/30 text-[#5865F2] hover:text-white transition-all group outline-none font-bold text-xs shadow-sm"
                    title={t('dashboard.discordCommunity', 'Bugs & Updates')}
                >
                    <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 group-hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(88,101,242,0.4)]">
                        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                    </svg>
                    <span>Discord</span>
                </button>

                {/* Notification Bell Menu */}
                <Menu as="div" className="relative">
                    {({ open }) => (
                        <>
                            <Menu.Button className={cn(
                                "relative flex items-center justify-center w-10 h-10 rounded-xl border transition-all outline-none shadow-sm",
                                open
                                    ? "bg-slate-800 border-white/20 text-white"
                                    : "bg-slate-900/80 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                            )}>
                                <Bell className="w-4 h-4" />
                                {updateAvailable && (
                                    <span className="absolute top-2 right-2 w-2 h-2 bg-sky-500 rounded-full border border-slate-900 shadow-[0_0_8px_rgba(14,165,233,0.8)] animate-pulse"></span>
                                )}
                            </Menu.Button>
                            <Transition
                                as={Fragment}
                                enter="transition ease-out duration-100"
                                enterFrom="transform opacity-0 scale-95"
                                enterTo="transform opacity-100 scale-100"
                                leave="transition ease-in duration-75"
                                leaveFrom="transform opacity-100 scale-100"
                                leaveTo="transform opacity-0 scale-95"
                            >
                                <Menu.Items className="absolute right-0 mt-2 w-80 origin-top-right rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/60 focus:outline-none overflow-hidden z-50">
                                    <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
                                        <h3 className="font-bold text-white text-sm">Notifications</h3>
                                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider bg-slate-800 px-2 py-0.5 rounded-full">
                                            {updateAvailable ? '1 New' : 'Zero'}
                                        </span>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto">
                                        {updateAvailable ? (
                                            <Menu.Item>
                                                {({ active }) => (
                                                    <div className={cn(
                                                        "p-4 border-b border-slate-800/50 transition-colors cursor-pointer",
                                                        active ? "bg-slate-800/50" : ""
                                                    )} onClick={handleUpdateClick}>
                                                        <div className="flex items-start gap-3">
                                                            <div className="mt-0.5 p-2 bg-sky-500/10 rounded-lg text-sky-400 border border-sky-500/20">
                                                                <Bell className="w-4 h-4" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex justify-between items-start mb-1">
                                                                    <h4 className="font-bold text-sky-400 text-sm leading-tight">New Version {updateAvailable.version} Available</h4>
                                                                </div>
                                                                <p className="text-xs text-slate-400 line-clamp-2 mt-1 mb-3">
                                                                    {updateAvailable.body || "A new update is available to download and install."}
                                                                </p>
                                                                <button className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-sky-500/20 transition-all uppercase tracking-wide">
                                                                    Review & Update
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </Menu.Item>
                                        ) : (
                                            <div className="p-8 text-center flex flex-col items-center justify-center text-slate-500">
                                                <Bell className="w-8 h-8 opacity-20 mb-3" />
                                                <p className="text-sm font-medium">You're all caught up!</p>
                                                <p className="text-xs mt-1">Version v{appVersion} is up to date.</p>
                                            </div>
                                        )}
                                    </div>
                                </Menu.Items>
                            </Transition>
                        </>
                    )}
                </Menu>
            </div>

            {/* Server Overview & All Known Specs Modal */}
            <ServerOverviewModal
                isOpen={isOverviewOpen}
                onClose={() => setIsOverviewOpen(false)}
                server={activeServer}
                publicIp={publicIp}
            />
        </div>
    );
}
