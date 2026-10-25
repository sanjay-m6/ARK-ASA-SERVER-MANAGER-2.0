import { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Shield, Key, Copy, Check, Terminal, Gamepad2, Monitor, 
    Search, AlertTriangle
} from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { cn } from '../../utils/helpers';
import { toast } from 'react-hot-toast';

interface InGameAdminModalProps {
    isOpen: boolean;
    onClose: () => void;
    adminPassword?: string;
    serverName?: string;
    gameType?: 'ASA' | 'ASE';
    installPath?: string;
}

interface AdminCommandItem {
    id: string;
    command: string;
    syntax: string;
    desc: string;
    category: 'player' | 'dino' | 'world' | 'utility';
    recommended?: boolean;
}

const ADMIN_COMMANDS: AdminCommandItem[] = [
    {
        id: 'gcm',
        command: 'Creative Mode (GCM)',
        syntax: 'cheat gcm',
        desc: 'Toggles Creative Mode (God mode, infinite weight, all engrams unlocked, instant free crafting).',
        category: 'player',
        recommended: true
    },
    {
        id: 'god',
        command: 'God Mode',
        syntax: 'cheat god',
        desc: 'Grants full invulnerability to player damage.',
        category: 'player',
        recommended: true
    },
    {
        id: 'fly',
        command: 'Fly Mode',
        syntax: 'cheat fly',
        desc: 'Allows player to fly freely through the air.',
        category: 'player',
        recommended: true
    },
    {
        id: 'walk',
        command: 'Walk (Cancel Fly/Ghost)',
        syntax: 'cheat walk',
        desc: 'Cancels fly/ghost mode and restores standard walking physics.',
        category: 'player'
    },
    {
        id: 'ghost',
        command: 'Ghost (Noclip)',
        syntax: 'cheat ghost',
        desc: 'Allows flying and clipping through walls, rocks, structures, and terrain.',
        category: 'player'
    },
    {
        id: 'infiniteStats',
        command: 'Infinite Stats',
        syntax: 'cheat infinitestats',
        desc: 'Refills and locks health, stamina, oxygen, food, water, and removes torpor.',
        category: 'player'
    },
    {
        id: 'doTame',
        command: 'Instant Tame (Target)',
        syntax: 'cheat DoTame',
        desc: 'Instantly tames the creature in crosshairs with full taming effectiveness.',
        category: 'dino',
        recommended: true
    },
    {
        id: 'forceTame',
        command: 'Force Tame (Ride without Saddle)',
        syntax: 'cheat ForceTame',
        desc: 'Instantly tames targeted dino and lets you ride it even without a saddle.',
        category: 'dino'
    },
    {
        id: 'destroyWildDinos',
        command: 'Dino Wipe (Destroy Wild Dinos)',
        syntax: 'cheat DestroyWildDinos',
        desc: 'Kills all untamed wild dinos across the entire map to allow fresh level spawns.',
        category: 'world',
        recommended: true
    },
    {
        id: 'saveWorld',
        command: 'Save World',
        syntax: 'cheat SaveWorld',
        desc: 'Forces the dedicated server to write an immediate world save to disk.',
        category: 'world',
        recommended: true
    },
    {
        id: 'setNoon',
        command: 'Set Daytime (Noon)',
        syntax: 'cheat SetTimeOfDay 12:00',
        desc: 'Sets the in-game daylight clock immediately to 12:00 PM.',
        category: 'world'
    },
    {
        id: 'setMidnight',
        command: 'Set Nighttime (Midnight)',
        syntax: 'cheat SetTimeOfDay 00:00',
        desc: 'Sets the in-game clock immediately to 12:00 AM midnight.',
        category: 'world'
    },
    {
        id: 'broadcast',
        command: 'Broadcast Alert',
        syntax: 'cheat Broadcast <YourMessageHere>',
        desc: 'Displays a prominent centered on-screen announcement banner to all connected players.',
        category: 'utility'
    },
    {
        id: 'teleport',
        command: 'Teleport Forward',
        syntax: 'cheat Teleport',
        desc: 'Teleports your character in the direction your crosshair is pointing.',
        category: 'utility'
    },
    {
        id: 'destroyMyTarget',
        command: 'Kill Target',
        syntax: 'cheat DestroyMyTarget',
        desc: 'Instantly destroys and deletes the structure or creature in your crosshair without death bag.',
        category: 'utility'
    },
    {
        id: 'giveCreative',
        command: 'Give Creative Mode to Player',
        syntax: 'cheat GiveCreativeModeToTarget',
        desc: 'Grants Creative Mode to the targeted player survivor.',
        category: 'player'
    }
];

export default function InGameAdminModal({
    isOpen,
    onClose,
    adminPassword,
    serverName,
    gameType = 'ASA',
    installPath: _installPath
}: InGameAdminModalProps) {
    const { t } = useTranslation();
    const [platformTab, setPlatformTab] = useState<'pc' | 'xbox' | 'playstation'>('pc');
    const [activeSection, setActiveSection] = useState<'auth' | 'cheatsheet' | 'whitelist'>('auth');
    const [searchQuery, setSearchQuery] = useState('');
    const [commandCategory, setCommandCategory] = useState<'all' | 'player' | 'dino' | 'world' | 'utility'>('all');
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

    if (!isOpen) return null;

    const cleanPassword = adminPassword && adminPassword !== 'N/A' && adminPassword !== 'None' ? adminPassword : '';
    const authCommand = cleanPassword ? `enablecheats ${cleanPassword}` : 'enablecheats <ServerAdminPassword>';

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopiedCmd(text);
        toast.success(t('inGameAdmin.copied', { defaultValue: 'Copied {{label}} to clipboard!', label }), {
            icon: '📋',
            style: {
                borderRadius: '12px',
                background: '#0f172a',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.2)'
            }
        });
        setTimeout(() => setCopiedCmd(null), 2500);
    };

    const cmdName = (cmd: AdminCommandItem) => t(`inGameAdmin.cmd.${cmd.id}.name`, cmd.command);
    const cmdDesc = (cmd: AdminCommandItem) => t(`inGameAdmin.cmd.${cmd.id}.desc`, cmd.desc);

    const filteredCommands = ADMIN_COMMANDS.filter(cmd => {
        const matchesCategory = commandCategory === 'all' || cmd.category === commandCategory;
        const matchesSearch = !searchQuery || 
            cmdName(cmd).toLowerCase().includes(searchQuery.toLowerCase()) ||
            cmd.syntax.toLowerCase().includes(searchQuery.toLowerCase()) ||
            cmdDesc(cmd).toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return createPortal(
        <div 
            className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Bar */}
                <div className="shrink-0 relative p-5 bg-slate-900/95 border-b border-slate-800">
                    <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-amber-500/10 via-sky-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-md flex-shrink-0">
                                <Key className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-black text-white tracking-wide">{t('inGameAdmin.title', 'In-Game Administrator Setup')}</h2>
                                    <span className={cn(
                                        "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border",
                                        gameType === 'ASE' ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-sky-500/20 text-sky-300 border-sky-500/30"
                                    )}>
                                        {gameType}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {serverName ? t('inGameAdmin.serverLabel', { defaultValue: 'Server: {{name}}', name: serverName }) : t('inGameAdmin.subtitle', 'How to set yourself as Admin and run cheats in ARK')}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors border border-white/5"
                            title={t('common.close', 'Close')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Section Switcher Tabs */}
                    <div className="flex p-1 mt-4 rounded-xl bg-slate-950/80 border border-slate-800 gap-1">
                        <button
                            onClick={() => setActiveSection('auth')}
                            className={cn(
                                "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                                activeSection === 'auth'
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <Key className="w-3.5 h-3.5" />
                            <span>1. {t('inGameAdmin.tabs.login', 'In-Game Login')} (`enablecheats`)</span>
                        </button>
                        <button
                            onClick={() => setActiveSection('cheatsheet')}
                            className={cn(
                                "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                                activeSection === 'cheatsheet'
                                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <Terminal className="w-3.5 h-3.5" />
                            <span>2. {t('inGameAdmin.tabs.cheatsheet', 'Admin Cheatsheet')}</span>
                        </button>
                        <button
                            onClick={() => setActiveSection('whitelist')}
                            className={cn(
                                "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                                activeSection === 'whitelist'
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <Shield className="w-3.5 h-3.5" />
                            <span>3. {t('inGameAdmin.tabs.whitelist', 'Auto-Admin Whitelist')}</span>
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div className="p-5 overflow-y-auto space-y-5 flex-1 min-h-0 custom-scrollbar">

                    {/* SECTION 1: IN-GAME AUTH */}
                    {activeSection === 'auth' && (
                        <div className="space-y-4">
                            {/* Hero Copy Command Card */}
                            <div className="p-4 bg-gradient-to-r from-amber-500/10 via-slate-950 to-slate-950 border border-amber-500/30 rounded-2xl shadow-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                {t('inGameAdmin.consoleCommand', 'Console Command')}
                                            </span>
                                            <span className="text-xs text-slate-400">{t('inGameAdmin.stepToGain', 'Step to gain Admin in-game:')}</span>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <code className="text-base sm:text-lg font-mono font-black text-amber-300 tracking-wide bg-black/60 px-3 py-1.5 rounded-xl border border-amber-500/20 select-all break-all">
                                                {authCommand}
                                            </code>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                                        <button
                                            onClick={() => handleCopy(authCommand, t('inGameAdmin.enablecheatsCommand', 'enablecheats Command'))}
                                            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 active:scale-95"
                                        >
                                            {copiedCmd === authCommand ? <Check className="w-4 h-4 text-emerald-950" /> : <Copy className="w-4 h-4" />}
                                            <span>{copiedCmd === authCommand ? t('inGameAdmin.copiedCommand', 'Copied Command!') : t('inGameAdmin.copyCommand', 'Copy Command')}</span>
                                        </button>
                                    </div>
                                </div>

                                {!cleanPassword && (
                                    <div className="mt-3 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
                                        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                                        <span><Trans i18nKey="inGameAdmin.noPassword" defaults="No Admin Password is set for this server yet. Please set <strong>ServerAdminPassword</strong> in Server Settings / Config Editor first." components={{ strong: <strong /> }} /></span>
                                    </div>
                                )}
                            </div>

                            {/* Platform-Specific Step by Step */}
                            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
                                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                                        <Monitor className="w-4 h-4 text-sky-400" />
                                        {t('inGameAdmin.howToOpen', 'How to open console & login by platform')}
                                    </h3>

                                    {/* Platform selector */}
                                    <div className="flex p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                                        <button
                                            onClick={() => setPlatformTab('pc')}
                                            className={cn(
                                                "px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1.5",
                                                platformTab === 'pc' ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "text-slate-400 hover:text-slate-200"
                                            )}
                                        >
                                            <Monitor className="w-3.5 h-3.5" />
                                            <span>PC / Steam</span>
                                        </button>
                                        <button
                                            onClick={() => setPlatformTab('xbox')}
                                            className={cn(
                                                "px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1.5",
                                                platformTab === 'xbox' ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-slate-400 hover:text-slate-200"
                                            )}
                                        >
                                            <Gamepad2 className="w-3.5 h-3.5" />
                                            <span>Xbox</span>
                                        </button>
                                        <button
                                            onClick={() => setPlatformTab('playstation')}
                                            className={cn(
                                                "px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1.5",
                                                platformTab === 'playstation' ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "text-slate-400 hover:text-slate-200"
                                            )}
                                        >
                                            <Gamepad2 className="w-3.5 h-3.5" />
                                            <span>PlayStation</span>
                                        </button>
                                    </div>
                                </div>

                                {platformTab === 'pc' && (
                                    <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.pc.step1Title', 'Enable Console Access (ASA only):')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.pc.step1" defaults="In ARK Survival Ascended, press <kbd>ESC</kbd> → <strong>Settings</strong> → <strong>Advanced</strong> tab → Turn <strong>Console Access</strong> to <strong>ON</strong>." components={{ kbd: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px] border border-slate-700" />, strong: <strong /> }} /></p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.pc.step2Title', 'Open the Console Bar:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.pc.step2" defaults="Press <kbd>~</kbd> (Tilde), <kbd>`</kbd>, or <kbd>Tab</kbd> to open the in-game console input line at the bottom of the screen." components={{ kbd: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px] border border-slate-700" /> }} /></p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.pc.step3Title', 'Authenticate with Admin Password:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.pc.step3" defaults="Paste or type <code>{{command}}</code> and press <kbd>Enter</kbd>." values={{ command: authCommand }} components={{ code: <code className="text-amber-300 font-mono bg-black/40 px-1 py-0.5 rounded" />, kbd: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px] border border-slate-700" /> }} /></p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">4</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.pc.step4Title', 'Run Cheats:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.pc.step4" defaults="You are now authenticated for this game session! Prefix any command with <code>cheat</code> (e.g. <ex>cheat gcm</ex>, <ex>cheat fly</ex>)." components={{ code: <code className="text-sky-300 font-mono bg-black/40 px-1 py-0.5 rounded" />, ex: <code className="text-emerald-300 font-mono bg-black/40 px-1 py-0.5 rounded" /> }} /></p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {platformTab === 'xbox' && (
                                    <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.console.pauseTitle', 'Pause Game:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.console.pressButton" defaults="Press the <kbd>{{button}}</kbd> button on your controller." values={{ button: 'Menu / Start' }} components={{ kbd: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px] border border-slate-700" /> }} /></p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.console.openBarTitle', 'Open Admin Command Bar:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.console.xboxCombo" defaults="Press <strong>LB + RB + X + Y</strong> simultaneously. A text box will appear at the top." components={{ strong: <strong className="text-emerald-400 font-mono" /> }} /></p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.console.authTitle', 'Authenticate:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.console.auth" defaults="Type <code>{{command}}</code> and select <strong>Request Admin</strong>." values={{ command: authCommand }} components={{ code: <code className="text-amber-300 font-mono bg-black/40 px-1 py-0.5 rounded" />, strong: <strong /> }} /></p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {platformTab === 'playstation' && (
                                    <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.console.pauseTitle', 'Pause Game:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.console.pressButton" defaults="Press the <kbd>{{button}}</kbd> button on your controller." values={{ button: 'Options' }} components={{ kbd: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px] border border-slate-700" /> }} /></p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.console.openBarTitle', 'Open Admin Command Bar:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.console.psCombo" defaults="Press <strong>L1 + R1 + Square + Triangle</strong> simultaneously." components={{ strong: <strong className="text-blue-400 font-mono" /> }} /></p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                                            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                                            <div>
                                                <strong className="text-white">{t('inGameAdmin.console.authTitle', 'Authenticate:')}</strong>
                                                <p className="text-slate-400 mt-0.5"><Trans i18nKey="inGameAdmin.console.auth" defaults="Type <code>{{command}}</code> and select <strong>Request Admin</strong>." values={{ command: authCommand }} components={{ code: <code className="text-amber-300 font-mono bg-black/40 px-1 py-0.5 rounded" />, strong: <strong /> }} /></p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* SECTION 2: COMMANDS CHEATSHEET */}
                    {activeSection === 'cheatsheet' && (
                        <div className="space-y-4">
                            {/* Search & Filter Toolbar */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                    <input
                                        type="text"
                                        placeholder={t('inGameAdmin.searchPlaceholder', 'Search admin commands (e.g. fly, god, gcm, tame, wipe)...')}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition-colors"
                                    />
                                </div>

                                <div className="flex p-0.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] overflow-x-auto">
                                    <button
                                        onClick={() => setCommandCategory('all')}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg font-bold transition-all",
                                            commandCategory === 'all' ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
                                        )}
                                    >
                                        {t('inGameAdmin.cat.all', 'All')}
                                    </button>
                                    <button
                                        onClick={() => setCommandCategory('player')}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg font-bold transition-all",
                                            commandCategory === 'player' ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
                                        )}
                                    >
                                        {t('inGameAdmin.cat.player', 'Player')}
                                    </button>
                                    <button
                                        onClick={() => setCommandCategory('dino')}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg font-bold transition-all",
                                            commandCategory === 'dino' ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
                                        )}
                                    >
                                        {t('inGameAdmin.cat.dinos', 'Dinos')}
                                    </button>
                                    <button
                                        onClick={() => setCommandCategory('world')}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg font-bold transition-all",
                                            commandCategory === 'world' ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
                                        )}
                                    >
                                        {t('inGameAdmin.cat.world', 'World')}
                                    </button>
                                    <button
                                        onClick={() => setCommandCategory('utility')}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg font-bold transition-all",
                                            commandCategory === 'utility' ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
                                        )}
                                    >
                                        {t('inGameAdmin.cat.utility', 'Utility')}
                                    </button>
                                </div>
                            </div>

                            {/* Commands Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {filteredCommands.map((cmd) => (
                                    <div
                                        key={cmd.syntax}
                                        className="p-3 bg-slate-950/70 border border-slate-800 hover:border-sky-500/30 rounded-xl transition-all flex flex-col justify-between group"
                                    >
                                        <div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors">
                                                    {cmdName(cmd)}
                                                </span>
                                                {cmd.recommended && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                                                        {t('inGameAdmin.popular', 'Popular')}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed line-clamp-2">
                                                {cmdDesc(cmd)}
                                            </p>
                                        </div>

                                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                                            <code className="text-xs font-mono font-bold text-sky-300 bg-slate-900 px-2 py-1 rounded-md border border-slate-800 truncate">
                                                {cmd.syntax}
                                            </code>
                                            <button
                                                onClick={() => handleCopy(cmd.syntax, cmdName(cmd))}
                                                className="px-2.5 py-1 bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-slate-300 rounded-lg text-xs font-bold transition-all border border-white/5 flex items-center gap-1 shrink-0"
                                                title={t('inGameAdmin.copyCommand', 'Copy Command')}
                                            >
                                                {copiedCmd === cmd.syntax ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                <span>{t('common.copy', 'Copy')}</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* SECTION 3: PERMANENT WHITELIST */}
                    {activeSection === 'whitelist' && (
                        <div className="space-y-4 text-xs leading-relaxed text-slate-300">
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-emerald-400" />
                                    <span><Trans i18nKey="inGameAdmin.whitelist.title" defaults="Bypass <code>enablecheats</code> with Permanent Whitelist" components={{ code: <code className="text-xs bg-black/40 px-1 py-0.5 rounded text-emerald-300 font-mono" /> }} /></span>
                                </h3>
                                <p className="text-slate-300 mt-1.5">
                                    {t('inGameAdmin.whitelist.desc', 'You can whitelist your account ID in the server files. Whitelisted players are automatically granted server administration privileges upon connecting without typing passwords.')}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-sky-400 uppercase">ARK: Survival Ascended (ASA)</span>
                                    </div>
                                    <p className="text-slate-400">
                                        <Trans i18nKey="inGameAdmin.whitelist.asaUses" defaults="Uses 32-character <strong>EOS Account IDs</strong>:" components={{ strong: <strong /> }} />
                                    </p>
                                    <div className="p-2.5 bg-black/50 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 select-all">
                                        ShooterGame\Saved\AllowedCheaterAccountIDs.txt
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                        {t('inGameAdmin.whitelist.asaHint', 'Add one 32-character EOS ID per line in this file, then restart the server.')}
                                    </p>
                                </div>

                                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-amber-400 uppercase">ARK: Survival Evolved (ASE)</span>
                                    </div>
                                    <p className="text-slate-400">
                                        <Trans i18nKey="inGameAdmin.whitelist.aseUses" defaults="Uses 17-digit <strong>Steam64 IDs</strong>:" components={{ strong: <strong /> }} />
                                    </p>
                                    <div className="p-2.5 bg-black/50 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 select-all">
                                        ShooterGame\Saved\AllowedCheaterSteamIDs.txt
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                        <Trans i18nKey="inGameAdmin.whitelist.aseHint" defaults="Add one Steam64 ID per line in this file or use the built-in <strong>Player Management</strong> tab." components={{ strong: <strong /> }} />
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer Bar */}
                <div className="shrink-0 p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 font-mono">
                    <div className="flex items-center gap-2">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('inGameAdmin.commandLabel', 'Command')}: <code className="text-amber-300">{authCommand}</code></span>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all"
                    >
                        {t('common.close', 'Close')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
