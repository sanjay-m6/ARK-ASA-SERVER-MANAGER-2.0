import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { Sunrise, Sun, Moon, Copy, Bell, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/helpers';
import { useServerStore } from '../../stores/serverStore';
import { usePublicIP } from '../../hooks/usePublicIP';
import { manualCheckForUpdates, UpdateInfo } from '../UpdateChecker';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';

export default function TopBar() {
    const { servers } = useServerStore();
    const { t } = useTranslation();
    const [appVersion, setAppVersion] = useState<string>('?.?.?');
    const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);

    // IP Hook
    const { data: publicIp, isLoading: isLoadingIp, isError: isErrorIp, refetch: refetchIp } = usePublicIP();

    // Get greeting based on time of day
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return { text: t('dashboard.goodMorning', 'Good Morning'), icon: Sunrise, color: 'text-amber-400', bg: 'bg-amber-500/10' };
        if (hour < 18) return { text: t('dashboard.goodAfternoon', 'Good Afternoon'), icon: Sun, color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
        return { text: t('dashboard.goodEvening', 'Good Evening'), icon: Moon, color: 'text-indigo-400', bg: 'bg-indigo-500/10' };
    };

    const greeting = getGreeting();
    const GreetingIcon = greeting.icon;

    // Server Status Logic
    const runningServers = servers.filter((s) => s.status === 'running' || s.status === 'online').length;
    const isAnyServerRunning = runningServers > 0;

    useEffect(() => {
        getVersion().then(setAppVersion).catch(() => setAppVersion('?.?.?'));

        let unlistenUpdate: UnlistenFn | null = null;

        const setupUpdateListener = async () => {
            // Check for updates on mount
            const result = await manualCheckForUpdates();
            if (result.available && result.update) {
                setUpdateAvailable(result.update);
            }

            // Listen for updates found by the background interval checker
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
        // We can dispatch a custom event to open the UpdateChecker banner if we want
        window.dispatchEvent(new Event('show-update-banner'));
    };

    return (
        <div className="flex items-center justify-between w-full h-[88px] glass-panel border-b border-white/5 px-8 flex-shrink-0 z-40 relative">
            {/* Background glow similar to Dashboard.tsx */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-sky-500/5 via-violet-500/5 to-transparent rounded-full blur-3xl -mr-48 -mt-48 pointer-events-none"></div>

            {/* LEFT: Greeting */}
            <div className="flex items-center gap-4 z-10">
                <div className={cn("p-3.5 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 shadow-lg", greeting.color)}>
                    <GreetingIcon className="w-7 h-7" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3 tracking-tight">
                        {greeting.text}, {t('dashboard.commander', 'Commander')}
                    </h1>
                    <p className="text-sm text-slate-400 font-medium">
                        {isAnyServerRunning
                            ? t('dashboard.serversRunning', { count: runningServers, defaultValue: `${runningServers} systems active` })
                            : t('dashboard.allStandby', 'All systems standing by')
                        }
                    </p>
                </div>
            </div>

            {/* RIGHT: Status indicators, IP, Profile/Bell */}
            <div className="flex items-center gap-6 z-10">

                {/* Public IP Display Pill */}
                <div className="flex items-center bg-slate-900/40 border border-white/5 rounded-full pl-5 pr-2 py-1.5 shadow-inner">
                    <div className="flex flex-col justify-center mr-4">
                        <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{t('dashboard.publicIpAddress', 'PUBLIC IP ADDRESS')}</span>
                        <div className="flex items-center h-5">
                            {isLoadingIp ? (
                                <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> <span className="text-xs font-mono">Detecting...</span></div>
                            ) : isErrorIp ? (
                                <span className="text-xs font-mono text-slate-400 italic flex items-center gap-1 cursor-pointer hover:text-white transition-colors" onClick={() => refetchIp()} title="Click to retry">
                                    <AlertCircle className="w-3.5 h-3.5" /> Unavailable
                                </span>
                            ) : (
                                <span className="text-sm font-mono font-bold text-slate-200">{publicIp}</span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleCopyIp}
                        disabled={!publicIp}
                        className="p-2.5 bg-slate-800/80 hover:bg-slate-700 rounded-full transition-all text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed group"
                        title={t('dashboard.copyIp', 'Copy IP Address')}
                    >
                        <Copy className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </button>
                </div>

                {/* Version */}
                <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{t('common.version', 'VERSION')}</span>
                    <span className="text-sm font-bold text-slate-300">v{appVersion}</span>
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-slate-700 rounded-full opacity-50"></div>

                {/* Global System Status */}
                <div className={cn(
                    "flex items-center gap-2.5 px-4 py-2 rounded-full border shadow-lg transition-all duration-500",
                    isAnyServerRunning
                        ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 shadow-cyan-500/10"
                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-emerald-500/10"
                )}>
                    <div className={cn("w-2 h-2 rounded-full animate-pulse", isAnyServerRunning ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]")}></div>
                    <span className="text-xs font-bold tracking-wider uppercase">
                        {isAnyServerRunning ? 'ACTIVE' : 'ONLINE'}
                    </span>
                </div>

                {/* Notification Bell Menu */}
                <Menu as="div" className="relative ml-2">
                    {({ open }) => (
                        <>
                            <Menu.Button className={cn(
                                "relative p-3 rounded-xl transition-all outline-none",
                                open ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                            )}>
                                <Bell className="w-5 h-5" />
                                {updateAvailable && (
                                    <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-sky-500 rounded-full border-2 border-slate-900 shadow-[0_0_8px_rgba(14,165,233,0.8)] animate-pulse"></span>
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
                                <Menu.Items className="absolute right-0 mt-3 w-80 origin-top-right rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/60 focus:outline-none overflow-hidden z-50">
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
        </div>
    );
}
