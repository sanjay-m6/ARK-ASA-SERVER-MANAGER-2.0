import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    X, Folder, Download, CheckCircle, AlertCircle, Loader2,
    Server, MapPin, Settings, Zap, ArrowRight, ArrowLeft,
    HardDrive, Network, Shield, Terminal, ChevronDown, ChevronUp, Globe,
    Copy, ArrowDownToLine, Clock
} from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { installServer, InstallServerParams, selectFolder } from '../../utils/tauri';
import toast from 'react-hot-toast';
import type { ServerType } from '../../types';
import { listen } from '@tauri-apps/api/event';

import { useTranslation } from 'react-i18next';

// Map images
import mapTheIsland from '../../assets/maps/the_island.png';
import mapScorchedEarth from '../../assets/maps/scorched_earth.png';
import mapTheCenter from '../../assets/maps/the_center.png';
import mapAberration from '../../assets/maps/aberration.png';
import mapExtinction from '../../assets/maps/extinction.png';
import mapRagnarok from '../../assets/maps/ragnarok.png';
import mapValguero from '../../assets/maps/valguero.png';
import mapLostColony from '../../assets/maps/lost_colony.png';
import mapAstraeos from '../../assets/maps/astraeos.png';
import mapForglar from '../../assets/maps/forglar.png';
import mapGenesis from '../../assets/maps/genesis.png';
import mapGenesis2 from '../../assets/maps/genesis2.png';
import mapFjordur from '../../assets/maps/fjordur.png';
import mapCrystalIsles from '../../assets/maps/crystal_isles.png';
import mapLostIsland from '../../assets/maps/lost_island.png';
import mapArkClub from '../../assets/maps/ark_club.png';

interface Props {
    onClose: () => void;
}

interface InstallProgress {
    stage: string;
    progress: number;
    message: string;
    isComplete: boolean;
    isError: boolean;
}

interface ConsoleOutput {
    line: string;
    lineType: string;
    timestamp: string;
}

export default function InstallServerDialog({ onClose }: Props) {
    const { t } = useTranslation();
    const { addServer } = useServerStore();

    const STEPS = useMemo(() => [
        { id: 1, title: t('dialogs.installServer.steps.map'), icon: MapPin, description: t('dialogs.installServer.steps.mapDesc') },
        { id: 2, title: t('dialogs.installServer.steps.details'), icon: Server, description: t('dialogs.installServer.steps.detailsDesc') },
        { id: 3, title: t('dialogs.installServer.steps.network'), icon: Network, description: t('dialogs.installServer.steps.networkDesc') },
        { id: 4, title: t('dialogs.installServer.steps.install'), icon: Download, description: t('dialogs.installServer.steps.installDesc') },
    ], [t]);

    const MAPS_ASA = useMemo(() => ({
        released: [
            { id: 'TheIsland_WP', name: t('dialogs.installServer.maps.theIsland', 'The Island'), description: t('dialogs.installServer.mapDescriptions.original', 'The original ARK experience'), color: '#22c55e', icon: '🏝️', size: 'Large', image: mapTheIsland },
            { id: 'ScorchedEarth_WP', name: t('dialogs.installServer.maps.scorchedEarth', 'Scorched Earth'), description: t('dialogs.installServer.mapDescriptions.desert', 'Harsh desert survival'), color: '#f59e0b', icon: '🏜️', size: 'Medium', image: mapScorchedEarth },
            { id: 'TheCenter_WP', name: t('dialogs.installServer.maps.theCenter', 'The Center'), description: t('dialogs.installServer.mapDescriptions.massive', 'Massive open-world map'), color: '#3b82f6', icon: '🌊', size: 'Large', image: mapTheCenter },
            { id: 'Aberration_WP', name: t('dialogs.installServer.maps.aberration', 'Aberration'), description: t('dialogs.installServer.mapDescriptions.underground', 'Underground bioluminescent world'), color: '#a855f7', icon: '🍄', size: 'Medium', image: mapAberration },
            { id: 'Extinction_WP', name: t('dialogs.installServer.maps.extinction', 'Extinction'), description: t('dialogs.installServer.mapDescriptions.postApoc', 'Post-apocalyptic Earth'), color: '#64748b', icon: '🏚️', size: 'Large', image: mapExtinction },
            { id: 'Ragnarok_WP', name: t('dialogs.installServer.maps.ragnarok', 'Ragnarok'), description: t('dialogs.installServer.mapDescriptions.viking', 'Viking-themed mega map'), color: '#ef4444', icon: '⚔️', size: 'Large', image: mapRagnarok },
            { id: 'Valguero_WP', name: t('dialogs.installServer.maps.valguero', 'Valguero'), description: t('dialogs.installServer.mapDescriptions.community', 'Diverse biomes & underground'), color: '#10b981', icon: '🦖', size: 'Large', image: mapValguero },
            { id: 'ArkClub_WP', name: t('dialogs.installServer.maps.arkClub', 'Ark Club'), description: t('dialogs.installServer.mapDescriptions.arkClub', 'Community club map with tropical zones'), color: '#e11d48', icon: '🌴', size: 'Large', image: mapArkClub },
        ],
        dlc: [
            { id: 'LostColony_WP', name: t('dialogs.installServer.maps.lostColony', 'Lost Colony'), description: t('dialogs.installServer.mapDescriptions.dlc', 'Paid DLC expansion'), color: '#8b5cf6', icon: '🚀', size: 'Large', image: mapLostColony },
        ],
        premiumMods: [
            { id: 'Astraeos_WP', name: t('dialogs.installServer.maps.astraeos', 'Astraeos'), description: t('dialogs.installServer.mapDescriptions.premium', 'Premium community mod map'), color: '#ec4899', icon: '✨', size: 'Large', image: mapAstraeos },
            { id: 'Forglar_WP', name: t('dialogs.installServer.maps.forglar', 'Forglar'), description: t('dialogs.installServer.mapDescriptions.premium', 'Premium community mod map'), color: '#06b6d4', icon: '🌿', size: 'Medium', image: mapForglar },
        ],
        upcoming: [
            { id: 'Genesis_WP', name: t('dialogs.installServer.maps.genesis1', 'Genesis Part 1'), description: t('dialogs.installServer.mapDescriptions.comingSoon', { date: 'June 2026', defaultValue: 'Coming June 2026' }), color: '#14b8a6', icon: '🧬', size: 'Medium', image: mapGenesis },
            { id: 'Genesis2_WP', name: t('dialogs.installServer.maps.genesis2', 'Genesis Part 2'), description: t('dialogs.installServer.mapDescriptions.comingSoon', { date: '2026 TBC', defaultValue: 'Coming 2026' }), color: '#6366f1', icon: '🛸', size: 'Large', image: mapGenesis2 },
            { id: 'Fjordur_WP', name: t('dialogs.installServer.maps.fjordur', 'Fjordur'), description: t('dialogs.installServer.mapDescriptions.comingSoon', { date: '2026 TBC', defaultValue: 'Coming 2026' }), color: '#0ea5e9', icon: '❄️', size: 'Large', image: mapFjordur },
            { id: 'CrystalIsles_WP', name: t('dialogs.installServer.maps.crystalIsles', 'Crystal Isles'), description: t('dialogs.installServer.mapDescriptions.comingSoon', { date: '2026-2027 TBC', defaultValue: 'Coming 2026-2027' }), color: '#c084fc', icon: '💎', size: 'Large', image: mapCrystalIsles },
            { id: 'LostIsland_WP', name: t('dialogs.installServer.maps.lostIsland', 'Lost Island'), description: t('dialogs.installServer.mapDescriptions.comingSoon', { date: '2026-2027 TBC', defaultValue: 'Coming 2026-2027' }), color: '#fb923c', icon: '🌋', size: 'Large', image: mapLostIsland },
        ],
    }), [t]);

    const ALL_MAPS = useMemo(() => [...MAPS_ASA.released, ...MAPS_ASA.dlc, ...MAPS_ASA.premiumMods, ...MAPS_ASA.upcoming], [MAPS_ASA]);
    const [step, setStep] = useState(1);
    const [isInstalling, setIsInstalling] = useState(false);
    const [progress, setProgress] = useState<InstallProgress | null>(null);
    const [consoleLogs, setConsoleLogs] = useState<ConsoleOutput[]>([]);
    const [showConsole, setShowConsole] = useState(true);
    const consoleRef = useRef<HTMLDivElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    // New states for enhanced UX
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    const [showTimestamps, setShowTimestamps] = useState(true);
    const [stepDirection, setStepDirection] = useState<'forward' | 'backward'>('forward');
    const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

    const [formData, setFormData] = useState<InstallServerParams>({
        serverType: 'ASA' as ServerType,
        installPath: '', // Will be calculated
        name: 'My ASA Server',
        mapName: 'TheIsland_WP',
        gamePort: 7777,
        queryPort: 27015,
        rconPort: 32330,
    });

    // Base directory state (default to C:\ARKServers if empty)
    const [baseDir, setBaseDir] = useState('C:\\ARKServers');

    const sanitizeFolderName = (name: string) => {
        return name.replace(/[^a-zA-Z0-9_-]/g, '_');
    };

    // Effect: Update final install path whenever baseDir or name changes
    useEffect(() => {
        const sanitizedArg = sanitizeFolderName(formData.name);
        const separator = baseDir.endsWith('\\') ? '' : '\\';
        const finalPath = `${baseDir}${separator}${sanitizedArg}`;

        setFormData(prev => {
            // Only update if changed to avoid loops
            if (prev.installPath === finalPath) return prev;
            return { ...prev, installPath: finalPath };
        });
    }, [baseDir, formData.name]);

    const selectedMap = useMemo(() =>
        ALL_MAPS.find(m => m.id === formData.mapName) || ALL_MAPS[0],
        [formData.mapName]
    );

    // Listen for install progress events
    useEffect(() => {
        if (!isInstalling) return;
        const unlisten = listen<InstallProgress>('install-progress', (event) => {
            setProgress(event.payload);
            if (event.payload.isComplete) {
                toast.success(t('dialogs.installServer.success'));
            } else if (event.payload.isError) {
                toast.error(event.payload.message);
            }
        });
        return () => { unlisten.then(fn => fn()); };
    }, [isInstalling]);

    // Listen for console output events
    useEffect(() => {
        if (!isInstalling) return;
        const unlisten = listen<ConsoleOutput>('install-console', (event) => {
            setConsoleLogs(prev => [...prev.slice(-200), event.payload]); // Keep last 200 lines
        });
        return () => { unlisten.then(fn => fn()); };
    }, [isInstalling]);

    // Auto-scroll console to bottom (only when auto-scroll is enabled)
    useEffect(() => {
        if (consoleRef.current && showConsole && isAutoScrollEnabled) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [consoleLogs, showConsole, isAutoScrollEnabled]);

    // Detect scroll position for scroll-to-bottom button
    const handleConsoleScroll = useCallback(() => {
        if (!consoleRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
        setShowScrollToBottom(!isNearBottom);
        setIsAutoScrollEnabled(isNearBottom);
    }, []);

    // Scroll to bottom function
    const scrollToBottom = useCallback(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTo({
                top: consoleRef.current.scrollHeight,
                behavior: 'smooth'
            });
            setIsAutoScrollEnabled(true);
        }
    }, []);

    // Copy logs to clipboard
    const copyLogsToClipboard = useCallback(() => {
        const logText = consoleLogs.map(log =>
            showTimestamps ? `[${log.timestamp}] ${log.line}` : log.line
        ).join('\n');
        navigator.clipboard.writeText(logText);
        toast.success(t('dialogs.installServer.logsCopied'));
    }, [consoleLogs, showTimestamps]);

    // Keyboard accessibility - Escape to close, Enter to proceed
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isInstalling) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isInstalling, onClose]);

    const handleSelectFolder = async () => {
        try {
            const folder = await selectFolder('Select Base Directory (Servers will be created inside)');
            if (folder) {
                setBaseDir(folder);
            }
        } catch (error) {
            console.error('Failed to select folder:', error);
        }
    };

    const handleInstall = async () => {
        setIsInstalling(true);
        setConsoleLogs([]); // Clear previous logs
        setProgress({
            stage: 'preparing',
            progress: 0,
            message: `${t('dialogs.installServer.installing')} (${formData.installPath})...`,
            isComplete: false,
            isError: false,
        });
        try {
            const server = await installServer(formData);
            addServer(server);
            setTimeout(() => onClose(), 2000);
        } catch (error) {
            setProgress({
                stage: 'error',
                progress: 0,
                message: `${t('dialogs.installServer.installationFailed')}: ${error}`,
                isComplete: false,
                isError: true,
            });
        }
    };

    const canProceed = () => {
        if (step === 1) return !!formData.mapName;
        if (step === 2) return formData.name.length > 0 && formData.installPath.length > 0;
        if (step === 3) return formData.gamePort > 0 && formData.queryPort > 0 && formData.rconPort > 0;
        return true;
    };

    const nextStep = () => {
        setStepDirection('forward');
        if (step < 4) setStep(step + 1);
        else handleInstall();
    };

    const prevStep = () => {
        setStepDirection('backward');
        if (step > 1) setStep(step - 1);
        else onClose();
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-dialog-title"
            aria-describedby="install-dialog-description"
        >
            <div
                ref={dialogRef}
                className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            >
                {/* Header with Steps - Fixed at top */}
                <div className="relative flex-shrink-0">
                    {/* Close Button */}
                    {!isInstalling && (
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 z-10 p-2 hover:bg-white/10 rounded-xl transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/20"
                            aria-label="Close dialog"
                        >
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    )}

                    {/* Map Preview Banner - Compact on small screens */}
                    <div
                        className="h-24 sm:h-32 relative overflow-hidden transition-all duration-300"
                        style={{
                            background: `linear-gradient(135deg, ${selectedMap.color}30 0%, ${selectedMap.color}10 50%, transparent 100%)`
                        }}
                    >
                        <div className="absolute inset-0 flex items-center justify-between px-4 sm:px-8">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div
                                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center text-2xl sm:text-4xl shadow-lg transition-all duration-200 hover:scale-105"
                                    style={{ backgroundColor: `${selectedMap.color}30` }}
                                >
                                    {selectedMap.icon}
                                </div>
                                <div>
                                    <h2 id="install-dialog-title" className="text-lg sm:text-2xl font-bold text-white">{t('dialogs.installServer.title')}</h2>
                                    <p id="install-dialog-description" className="text-sm sm:text-base text-slate-400">{t('dialogs.installServer.subtitle', { map: selectedMap.name, desc: selectedMap.description })}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Step Indicators - Compact on small screens */}
                    {!isInstalling && (
                        <div className="flex justify-center -mt-4 sm:-mt-6 relative z-10 px-4 sm:px-8">
                            <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl sm:rounded-2xl p-1.5 sm:p-2 flex gap-1 sm:gap-2 border border-slate-700/50">
                                {STEPS.map((s) => {
                                    const Icon = s.icon;
                                    const isActive = step === s.id;
                                    const isCompleted = step > s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => {
                                                if (s.id < step) {
                                                    setStepDirection('backward');
                                                    setStep(s.id);
                                                }
                                            }}
                                            disabled={s.id > step}
                                            aria-label={`${s.title} - ${isCompleted ? 'Completed' : isActive ? 'Current step' : 'Not yet available'}`}
                                            aria-current={isActive ? 'step' : undefined}
                                            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-300 ${isActive
                                                ? 'bg-white/10 text-white scale-105'
                                                : isCompleted
                                                    ? 'text-emerald-400 hover:bg-white/5 hover:scale-102'
                                                    : 'text-slate-500'
                                                }`}
                                        >
                                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-300 ${isActive
                                                ? 'bg-white/10 animate-pulse'
                                                : isCompleted
                                                    ? 'bg-emerald-500/20'
                                                    : 'bg-slate-700/50'
                                                }`}>
                                                {isCompleted ? (
                                                    <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                                                ) : (
                                                    <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                                                )}
                                            </div>
                                            <div className="hidden md:block text-left">
                                                <div className="text-xs sm:text-sm font-medium">{s.title}</div>
                                                <div className="text-xs opacity-60">{s.description}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Content Area - Scrollable */}
                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                    <div
                        className={`p-4 sm:p-8 transition-all duration-300 ease-out ${stepDirection === 'forward' ? 'animate-slide-in-right' : 'animate-slide-in-left'
                            }`}
                        key={step} // Re-trigger animation on step change
                    >
                        {/* Screen reader announcement for progress */}
                        {progress && (
                            <div role="status" aria-live="polite" className="sr-only">
                                {progress.isComplete
                                    ? `${t('dialogs.installServer.success')}`
                                    : progress.isError
                                        ? `${t('dialogs.installServer.installationFailed')}: ${progress.message}`
                                        : `${t('dialogs.installServer.installing')}: ${Math.round(progress.progress)}% - ${progress.message}`
                                }
                            </div>
                        )}
                        {/* Step 1: Map Selection */}
                        {step === 1 && !isInstalling && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h3 className="text-xl font-bold text-white">{t('dialogs.installServer.chooseMap', 'Choose Your Map')}</h3>
                                    <p className="text-slate-400 mt-1">{t('dialogs.installServer.chooseMapDesc', 'Select the world you want to host')}</p>
                                </div>

                                {/* Released Official Maps */}
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                        {t('dialogs.installServer.officialMaps', 'Official Maps')}
                                        <span className="text-xs font-normal text-emerald-500/70 normal-case">({MAPS_ASA.released.length})</span>
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {MAPS_ASA.released.map((map) => (
                                            <button
                                                key={map.id}
                                                onClick={() => setFormData({ ...formData, mapName: map.id })}
                                                className={`rounded-xl border-2 transition-all text-left relative group overflow-hidden ${formData.mapName === map.id
                                                    ? 'border-white/40 scale-[1.02] ring-2 ring-white/20'
                                                    : 'border-slate-700/50 hover:border-slate-500 hover:scale-[1.01]'
                                                    }`}
                                                style={{ minHeight: '140px' }}
                                            >
                                                <img src={map.image} alt={map.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                                                <div className="absolute top-2 right-2">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-slate-300 font-medium">{map.size}</span>
                                                </div>
                                                {formData.mapName === map.id && (
                                                    <div className="absolute top-2 left-2">
                                                        <CheckCircle className="w-4 h-4 text-emerald-400 drop-shadow-lg" />
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                                    <div className="font-semibold text-white text-sm drop-shadow-lg">{map.name}</div>
                                                    <div className="text-[11px] text-slate-300/80 mt-0.5 drop-shadow-md">{map.description}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* DLC Maps */}
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-violet-500 rounded-full"></span>
                                        {t('dialogs.installServer.dlcMaps', 'DLC Expansions')}
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {MAPS_ASA.dlc.map((map) => (
                                            <button
                                                key={map.id}
                                                onClick={() => setFormData({ ...formData, mapName: map.id })}
                                                className={`rounded-xl border-2 transition-all text-left relative group overflow-hidden ${formData.mapName === map.id
                                                    ? 'border-white/40 scale-[1.02] ring-2 ring-violet-500/30'
                                                    : 'border-slate-700/50 hover:border-slate-500 hover:scale-[1.01]'
                                                    }`}
                                                style={{ minHeight: '140px' }}
                                            >
                                                <img src={map.image} alt={map.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                                                <div className="absolute top-2 right-2">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/40 backdrop-blur-sm text-violet-200 font-medium">DLC</span>
                                                </div>
                                                {formData.mapName === map.id && (
                                                    <div className="absolute top-2 left-2">
                                                        <CheckCircle className="w-4 h-4 text-emerald-400 drop-shadow-lg" />
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                                    <div className="font-semibold text-white text-sm drop-shadow-lg">{map.name}</div>
                                                    <div className="text-[11px] text-slate-300/80 mt-0.5 drop-shadow-md">{map.description}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Premium Mod Maps */}
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                                        {t('dialogs.installServer.premiumMaps', 'Premium Mod Maps')}
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {MAPS_ASA.premiumMods.map((map) => (
                                            <button
                                                key={map.id}
                                                onClick={() => setFormData({ ...formData, mapName: map.id })}
                                                className={`rounded-xl border-2 transition-all text-left relative group overflow-hidden ${formData.mapName === map.id
                                                    ? 'border-white/40 scale-[1.02] ring-2 ring-pink-500/30'
                                                    : 'border-slate-700/50 hover:border-slate-500 hover:scale-[1.01]'
                                                    }`}
                                                style={{ minHeight: '140px' }}
                                            >
                                                <img src={map.image} alt={map.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                                                <div className="absolute top-2 right-2">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-pink-500/40 backdrop-blur-sm text-pink-200 font-medium">MOD</span>
                                                </div>
                                                {formData.mapName === map.id && (
                                                    <div className="absolute top-2 left-2">
                                                        <CheckCircle className="w-4 h-4 text-emerald-400 drop-shadow-lg" />
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                                    <div className="font-semibold text-white text-sm drop-shadow-lg">{map.name}</div>
                                                    <div className="text-[11px] text-slate-300/80 mt-0.5 drop-shadow-md">{map.description}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Upcoming Maps */}
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                                        {t('dialogs.installServer.upcomingMaps', 'Coming Soon')}
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {MAPS_ASA.upcoming.map((map) => (
                                            <div
                                                key={map.id}
                                                className="rounded-xl border-2 border-slate-700/30 text-left relative overflow-hidden opacity-60 cursor-not-allowed"
                                                style={{ minHeight: '140px' }}
                                            >
                                                <img src={map.image} alt={map.name} className="absolute inset-0 w-full h-full object-cover grayscale" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30" />
                                                <div className="absolute top-2 right-2">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/30 backdrop-blur-sm text-amber-300 font-medium">SOON</span>
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                                    <div className="font-semibold text-slate-300 text-sm">{map.name}</div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5">{map.description}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom Map Option */}
                                <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
                                            <Settings className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-white">{t('dialogs.installServer.customMap', 'Custom Map')}</div>
                                            <input
                                                type="text"
                                                placeholder={t('dialogs.installServer.enterMapName', 'Enter map ID (e.g. MyCustomMap_WP)')}
                                                className="mt-1 w-full bg-transparent border-none text-slate-300 text-sm focus:outline-none placeholder-slate-600"
                                                onChange={(e) => e.target.value && setFormData({ ...formData, mapName: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Server Details */}
                        {step === 2 && !isInstalling && (
                            <div className="space-y-6 max-w-lg mx-auto">
                                <div className="text-center mb-6">
                                    <h3 className="text-xl font-bold text-white">{t('dialogs.installServer.serverDetails')}</h3>
                                    <p className="text-slate-400 mt-1">{t('dialogs.installServer.serverDetailsDesc')}</p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                                            <Server className="w-4 h-4" />
                                            {t('dialogs.installServer.serverName')}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-lg focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                            placeholder="My Awesome Server"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">{t('dialogs.installServer.internalNameDesc')}</p>
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                                            <Globe className="w-4 h-4" />
                                            {t('dialogs.installServer.sessionName')}
                                            <span className="text-xs text-emerald-500 font-normal">{t('dialogs.installServer.publicVisibility')}</span>
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={formData.sessionName ?? ''}
                                                onChange={(e) => setFormData({ ...formData, sessionName: e.target.value })}
                                                className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
                                                placeholder={formData.name || "[PvE] The Island - 10x Rates"}
                                            />
                                            <button
                                                onClick={() => setFormData({ ...formData, sessionName: formData.name })}
                                                className="px-3 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors text-xs text-slate-300"
                                                title="Copy from Server Name"
                                            >
                                                ↩️
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">🌐 {t('dialogs.installServer.sessionNameDesc')}</p>
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                                            <HardDrive className="w-4 h-4" />
                                            {t('dialogs.installServer.baseFolder')}
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={baseDir}
                                                onChange={(e) => setBaseDir(e.target.value)}
                                                className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                                placeholder="C:\ARKServers"
                                            />
                                            <button
                                                onClick={handleSelectFolder}
                                                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                                                title="Select Base Folder"
                                            >
                                                <Folder className="w-5 h-5 text-white" />
                                            </button>
                                        </div>

                                        {/* Path Preview */}
                                        <div className="mt-2 p-3 bg-slate-900/50 rounded-lg border border-slate-800 flex items-start gap-2">
                                            <div className="mt-0.5 text-slate-500">↳</div>
                                            <div className="text-xs font-mono text-slate-400 break-all">
                                                {t('dialogs.installServer.willInstallTo')} <span className="text-emerald-400">{formData.installPath}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">
                                            {t('dialogs.installServer.uniqueFolder')}
                                        </p>
                                    </div>

                                    {/* PvE/PvP Toggle */}
                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                            <Shield className="w-4 h-4" />
                                            {t('dialogs.installServer.gameMode')}
                                        </label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setFormData({ ...formData, pveMode: true })}
                                                className={`flex-1 flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 transition-all ${formData.pveMode !== false
                                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
                                                    }`}
                                            >
                                                <span className="text-2xl">🌿</span>
                                                <div className="text-left">
                                                    <div className="font-bold">{t('dialogs.installServer.pve')}</div>
                                                    <div className="text-xs opacity-70">{t('dialogs.installServer.pveDesc')}</div>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => setFormData({ ...formData, pveMode: false })}
                                                className={`flex-1 flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 transition-all ${formData.pveMode === false
                                                    ? 'bg-red-500/20 border-red-500 text-red-400'
                                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
                                                    }`}
                                            >
                                                <span className="text-2xl">⚔️</span>
                                                <div className="text-left">
                                                    <div className="font-bold">{t('dialogs.installServer.pvp')}</div>
                                                    <div className="text-xs opacity-70">{t('dialogs.installServer.pvpDesc')}</div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Crossplay Toggle */}
                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                            <Globe className="w-4 h-4" />
                                            {t('dialogs.installServer.crossplay')}
                                        </label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setFormData({ ...formData, crossplay: false })}
                                                className={`flex-1 flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 transition-all ${formData.crossplay !== true
                                                    ? 'bg-slate-500/20 border-slate-500 text-slate-300'
                                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
                                                    }`}
                                            >
                                                <span className="text-2xl">🖥️</span>
                                                <div className="text-left">
                                                    <div className="font-bold">{t('dialogs.installServer.pcOnly')}</div>
                                                    <div className="text-xs opacity-70">{t('dialogs.installServer.pcOnlyDesc')}</div>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => setFormData({ ...formData, crossplay: true })}
                                                className={`flex-1 flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 transition-all ${formData.crossplay === true
                                                    ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
                                                    }`}
                                            >
                                                <span className="text-2xl">🎮</span>
                                                <div className="text-left">
                                                    <div className="font-bold">{t('dialogs.installServer.crossplay')}</div>
                                                    <div className="text-xs opacity-70">{t('dialogs.installServer.crossplayDesc')}</div>
                                                </div>
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">
                                            🎮 {t('dialogs.installServer.crossplayInfo')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Network Configuration */}
                        {step === 3 && !isInstalling && (
                            <div className="space-y-6 max-w-lg mx-auto">
                                <div className="text-center mb-6">
                                    <h3 className="text-xl font-bold text-white">{t('dialogs.installServer.networkConfig')}</h3>
                                    <p className="text-slate-400 mt-1">{t('dialogs.installServer.configurePorts')}</p>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                                    <Zap className="w-5 h-5 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-white">{t('dialogs.installServer.gamePort')}</div>
                                                    <div className="text-xs text-slate-500">{t('dialogs.installServer.gamePortDesc')}</div>
                                                </div>
                                            </div>
                                            <input
                                                type="number"
                                                value={formData.gamePort}
                                                onChange={(e) => setFormData({ ...formData, gamePort: parseInt(e.target.value) || 0 })}
                                                className="w-24 px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-white/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                    <Network className="w-5 h-5 text-blue-400" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-white">{t('dialogs.installServer.queryPort')}</div>
                                                    <div className="text-xs text-slate-500">{t('dialogs.installServer.queryPortDesc')}</div>
                                                </div>
                                            </div>
                                            <input
                                                type="number"
                                                value={formData.queryPort}
                                                onChange={(e) => setFormData({ ...formData, queryPort: parseInt(e.target.value) || 0 })}
                                                className="w-24 px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-white/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                                    <Shield className="w-5 h-5 text-amber-400" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-white">{t('dialogs.installServer.rconPort')}</div>
                                                    <div className="text-xs text-slate-500">{t('dialogs.installServer.rconPortDesc')}</div>
                                                </div>
                                            </div>
                                            <input
                                                type="number"
                                                value={formData.rconPort}
                                                onChange={(e) => setFormData({ ...formData, rconPort: parseInt(e.target.value) || 0 })}
                                                className="w-24 px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-white/20"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-300/80">
                                        {t('dialogs.installServer.portsWarning')}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Installing */}
                        {(step === 4 || isInstalling) && progress && (
                            <div className="space-y-6 max-w-lg mx-auto">
                                {/* Server Card */}
                                <div
                                    className="p-5 rounded-2xl border"
                                    style={{
                                        backgroundColor: `${selectedMap.color}08`,
                                        borderColor: `${selectedMap.color}30`
                                    }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
                                            style={{ backgroundColor: `${selectedMap.color}20` }}
                                        >
                                            {selectedMap.icon}
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-white text-lg">{formData.name}</h4>
                                            <p className="text-sm text-slate-400">{selectedMap.name}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Progress Indicator */}
                                <div className="text-center py-8">
                                    {progress.isComplete ? (
                                        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500/20 mb-4">
                                            <CheckCircle className="w-12 h-12 text-emerald-400" />
                                        </div>
                                    ) : progress.isError ? (
                                        <div className="space-y-5">
                                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 mb-2">
                                                <AlertCircle className="w-10 h-10 text-red-400" />
                                            </div>
                                            <h3 className="text-xl font-bold text-white">{t('dialogs.installServer.installationFailed', 'Installation Failed')}</h3>
                                            <p className="text-red-300/80 text-sm max-w-md mx-auto bg-red-500/10 border border-red-500/20 rounded-xl p-3">{progress.message}</p>

                                            {/* Recovery Actions */}
                                            <div className="flex flex-wrap justify-center gap-3 pt-2">
                                                <button
                                                    onClick={() => { setIsInstalling(false); setProgress(null); handleInstall(); }}
                                                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20 text-sm"
                                                >
                                                    <Zap className="w-4 h-4" />
                                                    {t('dialogs.installServer.tryAgain', 'Try Again')}
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const { repairSteamcmd } = await import('../../utils/tauri');
                                                            toast.loading('Repairing SteamCMD...', { id: 'repair' });
                                                            await repairSteamcmd();
                                                            toast.success('SteamCMD repaired! Try installing again.', { id: 'repair' });
                                                        } catch (e) { toast.error(`Repair failed: ${e}`, { id: 'repair' }); }
                                                    }}
                                                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-amber-500/20 text-sm"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                    {t('dialogs.installServer.repairSteamcmd', 'Repair SteamCMD')}
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const { clearSteamcmdCache } = await import('../../utils/tauri');
                                                            toast.loading('Clearing cache...', { id: 'cache' });
                                                            await clearSteamcmdCache();
                                                            toast.success('Cache cleared! Try installing again.', { id: 'cache' });
                                                        } catch (e) { toast.error(`Clear cache failed: ${e}`, { id: 'cache' }); }
                                                    }}
                                                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all text-sm"
                                                >
                                                    <HardDrive className="w-4 h-4" />
                                                    {t('dialogs.installServer.clearCache', 'Clear Cache')}
                                                </button>
                                            </div>

                                            {/* Diagnostic Tips */}
                                            <div className="text-left bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-xs space-y-1.5 max-w-md mx-auto">
                                                <p className="text-slate-300 font-semibold mb-2">{t('dialogs.installServer.diagnosticTips', 'Troubleshooting Tips')}:</p>
                                                <p className="text-slate-400">• Ensure at least 60 GB of free disk space</p>
                                                <p className="text-slate-400">• Check that your antivirus isn't blocking SteamCMD</p>
                                                <p className="text-slate-400">• Verify stable internet connection</p>
                                                <p className="text-slate-400">• Try running the app as Administrator</p>
                                                <p className="text-slate-400">• Avoid special characters or spaces in install path</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-4"
                                            style={{ backgroundColor: `${selectedMap.color}20` }}
                                        >
                                            <Loader2
                                                className="w-12 h-12 animate-spin"
                                                style={{ color: selectedMap.color }}
                                            />
                                        </div>
                                    )}

                                    {!progress.isError && (
                                        <>
                                            <h3 className="text-xl font-bold text-white">
                                                {progress.isComplete ? t('dialogs.installServer.readyToPlay') : t('dialogs.installServer.installing')}
                                            </h3>
                                            <p className="text-slate-400 mt-2">{progress.message}</p>
                                        </>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                {!progress.isError && (
                                    <div>
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-slate-400 capitalize">{progress.stage}</span>
                                            <span className="text-white font-mono">{Math.round(progress.progress)}%</span>
                                        </div>
                                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${progress.progress}%`,
                                                    backgroundColor: progress.isComplete ? '#22c55e' : selectedMap.color
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Terminal Console - Enhanced */}
                                <div className="rounded-xl overflow-hidden border border-slate-700/50 bg-slate-950">
                                    <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-slate-800/50 border-b border-slate-700/50">
                                        <div className="flex items-center gap-2">
                                            <Terminal className="w-4 h-4 text-slate-400" />
                                            <span className="text-xs sm:text-sm font-medium text-slate-300">{t('dialogs.installServer.steamCmdOutput')}</span>
                                            <span className="text-xs text-slate-500 hidden sm:inline">({consoleLogs.length} {t('common.lines')})</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {/* Toggle Timestamps */}
                                            <button
                                                onClick={() => setShowTimestamps(!showTimestamps)}
                                                className={`p-1.5 rounded transition-all ${showTimestamps ? 'bg-white/10 text-slate-300' : 'hover:bg-white/10 text-slate-500'}`}
                                                title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
                                                aria-label={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
                                            >
                                                <Clock className="w-3.5 h-3.5" />
                                            </button>
                                            {/* Copy Logs */}
                                            <button
                                                onClick={copyLogsToClipboard}
                                                className="p-1.5 hover:bg-white/10 rounded transition-all text-slate-400 hover:text-slate-200 disabled:opacity-50"
                                                title="Copy logs to clipboard"
                                                aria-label="Copy logs to clipboard"
                                                disabled={consoleLogs.length === 0}
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                            {/* Toggle Console */}
                                            <button
                                                onClick={() => setShowConsole(!showConsole)}
                                                className="p-1.5 hover:bg-white/10 rounded transition-all"
                                                aria-label={showConsole ? 'Collapse console' : 'Expand console'}
                                            >
                                                {showConsole ? (
                                                    <ChevronUp className="w-4 h-4 text-slate-400" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    {showConsole && (
                                        <div className="relative">
                                            <div
                                                ref={consoleRef}
                                                onScroll={handleConsoleScroll}
                                                className="h-32 sm:h-48 overflow-y-auto p-2 sm:p-3 font-mono text-xs leading-relaxed custom-scrollbar"
                                            >
                                                {consoleLogs.length === 0 ? (
                                                    <div className="text-slate-600 italic flex items-center gap-2">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        {t('dialogs.installServer.waitingOutput')}
                                                    </div>
                                                ) : (
                                                    consoleLogs.map((log, idx) => (
                                                        <div key={idx} className="flex gap-2 hover:bg-white/5 px-1 -mx-1 rounded transition-colors">
                                                            {showTimestamps && (
                                                                <span className="text-slate-600 flex-shrink-0 text-xs">[{log.timestamp}]</span>
                                                            )}
                                                            <span className={
                                                                log.lineType === 'error' ? 'text-red-400' :
                                                                    log.lineType === 'success' ? 'text-emerald-400' :
                                                                        log.lineType === 'warning' ? 'text-amber-400' :
                                                                            log.lineType === 'progress' ? 'text-sky-400' :
                                                                                'text-slate-300'
                                                            }>
                                                                {log.line}
                                                            </span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                            {/* Scroll to Bottom FAB */}
                                            {showScrollToBottom && consoleLogs.length > 5 && (
                                                <button
                                                    onClick={scrollToBottom}
                                                    className="absolute bottom-2 right-2 p-2 bg-slate-700 hover:bg-slate-600 rounded-full shadow-lg transition-all hover:scale-110"
                                                    title="Scroll to bottom"
                                                    aria-label="Scroll to bottom of console"
                                                >
                                                    <ArrowDownToLine className="w-4 h-4 text-slate-300" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Buttons - Fixed at bottom */}
                <div className="p-4 sm:p-6 bg-slate-900 border-t border-slate-700/50 flex justify-between items-center relative z-20">
                    <button
                        onClick={prevStep}
                        className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isInstalling}
                    >
                        <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                        {step === 1 ? 'Cancel' : 'Back'}
                    </button>

                    <button
                        onClick={nextStep}
                        disabled={!canProceed() || isInstalling}
                        className={`flex items-center gap-2 px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl font-bold text-sm sm:text-base transition-all shadow-lg ${!canProceed() || isInstalling
                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20 hover:scale-105'
                            }`}
                    >
                        {isInstalling ? (
                            <>
                                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                                Installing...
                            </>
                        ) : step === 4 ? (
                            <>
                                <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                                {t('dialogs.installServer.install')}
                            </>
                        ) : (
                            <>
                                {t('common.next')}
                                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
