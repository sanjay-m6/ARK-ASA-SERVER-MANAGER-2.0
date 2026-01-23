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

// All official ARK: Survival Ascended maps (as of January 2026)
const MAPS_ASA = {
    released: [
        { id: 'TheIsland_WP', name: 'The Island', description: 'The original ARK experience', color: '#22c55e', icon: '🏝️' },
        { id: 'ScorchedEarth_WP', name: 'Scorched Earth', description: 'Desert survival expansion', color: '#f59e0b', icon: '🏜️' },
        { id: 'TheCenter_WP', name: 'The Center', description: 'Massive expansion map', color: '#3b82f6', icon: '🌊' },
        { id: 'Aberration_WP', name: 'Aberration', description: 'Underground alien world', color: '#a855f7', icon: '🍄' },
        { id: 'Extinction_WP', name: 'Extinction', description: 'Post-apocalyptic Earth', color: '#64748b', icon: '🏚️' },
        { id: 'Ragnarok_WP', name: 'Ragnarok', description: 'Viking-themed expansion', color: '#ef4444', icon: '⚔️' },
        { id: 'Valguero_WP', name: 'Valguero', description: 'Community map', color: '#10b981', icon: '🦖' },
        { id: 'LostColony_WP', name: 'Lost Colony', description: 'New canonical DLC', color: '#8b5cf6', icon: '🚀' },
    ],
    premiumMods: [
        { id: 'Astraeos_WP', name: 'Astraeos', description: 'Premium mod map', color: '#ec4899', icon: '✨' },
        { id: 'Forglar_WP', name: 'Forglar', description: 'Premium mod map', color: '#06b6d4', icon: '🌿' },
    ],
    upcoming: [
        { id: 'Genesis_WP', name: 'Genesis Part 1', description: 'Coming April 2026', color: '#14b8a6', icon: '🧬' },
        { id: 'Genesis2_WP', name: 'Genesis Part 2', description: 'Coming August 2026', color: '#6366f1', icon: '🛸' },
        { id: 'Fjordur_WP', name: 'Fjordur', description: 'Coming December 2026', color: '#0ea5e9', icon: '❄️' },
    ],
};

const ALL_MAPS = [...MAPS_ASA.released, ...MAPS_ASA.premiumMods, ...MAPS_ASA.upcoming];

const STEPS = [
    { id: 1, title: 'Choose Map', icon: MapPin, description: 'Select your world' },
    { id: 2, title: 'Server Details', icon: Server, description: 'Name & location' },
    { id: 3, title: 'Network Config', icon: Network, description: 'Ports setup' },
    { id: 4, title: 'Install', icon: Download, description: 'Deploy server' },
];

export default function InstallServerDialog({ onClose }: Props) {
    const { addServer } = useServerStore();
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

    // Helper to sanitize folder name
    const sanitizeFolderName = (name: string) => {
        return name.replace(/[^a-zA-Z0-9_\-]/g, '_');
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
                toast.success('Server installed successfully!');
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
        toast.success('Logs copied to clipboard!');
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
            message: `Creating server at ${formData.installPath}...`,
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
                message: `Installation failed: ${error}`,
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
                                    <h2 id="install-dialog-title" className="text-lg sm:text-2xl font-bold text-white">Deploy New Server</h2>
                                    <p id="install-dialog-description" className="text-sm sm:text-base text-slate-400">{selectedMap.name} • {selectedMap.description}</p>
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
                                    ? 'Server installation complete!'
                                    : progress.isError
                                        ? `Installation failed: ${progress.message}`
                                        : `Installing: ${Math.round(progress.progress)}% - ${progress.message}`
                                }
                            </div>
                        )}
                        {/* Step 1: Map Selection */}
                        {step === 1 && !isInstalling && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h3 className="text-xl font-bold text-white">Choose Your Map</h3>
                                    <p className="text-slate-400 mt-1">Select the world you want to explore</p>
                                </div>

                                {/* Released Maps */}
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                        Official Maps
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {MAPS_ASA.released.map((map) => (
                                            <button
                                                key={map.id}
                                                onClick={() => setFormData({ ...formData, mapName: map.id })}
                                                className={`p-4 rounded-xl border-2 transition-all text-left ${formData.mapName === map.id
                                                    ? 'border-white/30 bg-white/10'
                                                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                                                    }`}
                                            >
                                                <div className="text-2xl mb-2">{map.icon}</div>
                                                <div className="font-semibold text-white text-sm">{map.name}</div>
                                                <div className="text-xs text-slate-500 mt-1">{map.description}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Premium Mod Maps */}
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                                        Premium Mod Maps
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {MAPS_ASA.premiumMods.map((map) => (
                                            <button
                                                key={map.id}
                                                onClick={() => setFormData({ ...formData, mapName: map.id })}
                                                className={`p-4 rounded-xl border-2 transition-all text-left ${formData.mapName === map.id
                                                    ? 'border-white/30 bg-white/10'
                                                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                                                    }`}
                                            >
                                                <div className="text-2xl mb-2">{map.icon}</div>
                                                <div className="font-semibold text-white text-sm">{map.name}</div>
                                                <div className="text-xs text-slate-500 mt-1">{map.description}</div>
                                            </button>
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
                                            <div className="text-sm font-medium text-white">Custom Map</div>
                                            <input
                                                type="text"
                                                placeholder="Enter custom map name..."
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
                                    <h3 className="text-xl font-bold text-white">Server Details</h3>
                                    <p className="text-slate-400 mt-1">Give your server a name and location</p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                                            <Server className="w-4 h-4" />
                                            Server Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-lg focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                            placeholder="My Awesome Server"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Internal name to organize servers in this app</p>
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                                            <Globe className="w-4 h-4" />
                                            Session Name
                                            <span className="text-xs text-emerald-500 font-normal">(Public)</span>
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
                                        <p className="text-xs text-slate-500 mt-1">🌐 Visible to players in the ARK server browser</p>
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                                            <HardDrive className="w-4 h-4" />
                                            Base Installation Folder
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
                                                Will install to: <span className="text-emerald-400">{formData.installPath}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">
                                            A unique folder will be created automatically for this server.
                                        </p>
                                    </div>

                                    {/* PvE/PvP Toggle */}
                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                            <Shield className="w-4 h-4" />
                                            Game Mode
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
                                                    <div className="font-bold">PvE</div>
                                                    <div className="text-xs opacity-70">Peaceful</div>
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
                                                    <div className="font-bold">PvP</div>
                                                    <div className="text-xs opacity-70">Combat</div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Crossplay Toggle */}
                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                            <Globe className="w-4 h-4" />
                                            Crossplay
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
                                                    <div className="font-bold">PC Only</div>
                                                    <div className="text-xs opacity-70">Steam/Epic</div>
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
                                                    <div className="font-bold">Crossplay</div>
                                                    <div className="text-xs opacity-70">PC + Console</div>
                                                </div>
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">
                                            🎮 Enable crossplay to allow Xbox, PlayStation, and PC players to join together
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Network Configuration */}
                        {step === 3 && !isInstalling && (
                            <div className="space-y-6 max-w-lg mx-auto">
                                <div className="text-center mb-6">
                                    <h3 className="text-xl font-bold text-white">Network Configuration</h3>
                                    <p className="text-slate-400 mt-1">Configure your server ports</p>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                                    <Zap className="w-5 h-5 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-white">Game Port</div>
                                                    <div className="text-xs text-slate-500">Main connection port</div>
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
                                                    <div className="font-medium text-white">Query Port</div>
                                                    <div className="text-xs text-slate-500">Server browser discovery</div>
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
                                                    <div className="font-medium text-white">RCON Port</div>
                                                    <div className="text-xs text-slate-500">Remote administration</div>
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
                                        Make sure these ports are open in your firewall and forwarded on your router.
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
                                        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-500/20 mb-4">
                                            <AlertCircle className="w-12 h-12 text-red-400" />
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

                                    <h3 className="text-xl font-bold text-white">
                                        {progress.isComplete ? 'Ready to Play!' :
                                            progress.isError ? 'Installation Failed' :
                                                'Installing...'}
                                    </h3>
                                    <p className="text-slate-400 mt-2">{progress.message}</p>
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
                                            <span className="text-xs sm:text-sm font-medium text-slate-300">SteamCMD Output</span>
                                            <span className="text-xs text-slate-500 hidden sm:inline">({consoleLogs.length} lines)</span>
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
                                                        Waiting for output...
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
                                Install Server
                            </>
                        ) : (
                            <>
                                Next
                                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
