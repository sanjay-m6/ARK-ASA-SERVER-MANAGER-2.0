import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { ArrowRight, Zap } from 'lucide-react';
import asaLogo from '../../assets/ASA.png';
import aseLogo from '../../assets/ASE.png';

export default function WelcomeOverlay({ onComplete }: { onComplete: () => void }) {
    const { t } = useTranslation();
    const { setActiveGame, setShowAseMode } = useGameStore();
    const [hoveredCard, setHoveredCard] = useState<'ASE' | 'ASA' | null>(null);
    const [selectedGame, setSelectedGame] = useState<'ASE' | 'ASA' | null>(null);

    const handleSelectGame = (game: 'ASE' | 'ASA') => {
        setSelectedGame(game);
        setActiveGame(game);
        setShowAseMode(game === 'ASE');
        
        // Update URL path to load the correct route upon mounting
        const targetPath = game === 'ASE' ? '/ase/dashboard' : '/dashboard';
        window.history.pushState({}, '', targetPath);

        // Brief transition delay to let user see selection click state
        setTimeout(() => {
            onComplete();
        }, 850);
    };

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#06090f] text-white overflow-hidden select-none"
                exit={{ opacity: 0, scale: 1.02, filter: "blur(16px)" }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
                {/* Subtle ambient background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Soft radial vignette */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(15,23,42,0.5),rgba(6,9,15,1))]" />
                    
                    {/* Left ambient glow */}
                    <motion.div
                        animate={{ opacity: hoveredCard === 'ASE' ? 0.35 : 0.08 }}
                        transition={{ duration: 0.8 }}
                        className="absolute left-0 top-1/4 w-[500px] h-[500px] rounded-full bg-amber-500/20 blur-[180px]"
                    />
                    
                    {/* Right ambient glow */}
                    <motion.div
                        animate={{ opacity: hoveredCard === 'ASA' ? 0.35 : 0.08 }}
                        transition={{ duration: 0.8 }}
                        className="absolute right-0 bottom-1/4 w-[500px] h-[500px] rounded-full bg-sky-500/20 blur-[180px]"
                    />

                    {/* Subtle noise texture */}
                    <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjc1IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsdGVyPSJ1cmwoI2EpIi8+PC9zdmc+')]" />
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center w-full max-w-4xl px-6">
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="text-center mb-14"
                    >
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">
                            {t('welcome.headerTitle', 'Choose Your Game')}
                        </h1>
                        <p className="text-sm text-slate-400 font-medium">
                            {t('welcome.headerSubtitle', 'Select which ARK version you want to manage')}
                        </p>
                    </motion.div>

                    {/* Cards */}
                    <div className="flex flex-col md:flex-row gap-5 w-full justify-center items-stretch">
                        {/* ASE Card */}
                        <motion.button
                            initial={{ opacity: 0, y: 30 }}
                            animate={{
                                opacity: selectedGame === 'ASA' ? 0.15 : 1,
                                y: 0,
                                scale: selectedGame === 'ASE' ? 1.03 : selectedGame === 'ASA' ? 0.97 : 1,
                                filter: selectedGame === 'ASA' ? 'blur(4px)' : 'blur(0px)',
                            }}
                            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                            onMouseEnter={() => !selectedGame && setHoveredCard('ASE')}
                            onMouseLeave={() => !selectedGame && setHoveredCard(null)}
                            onClick={() => !selectedGame && handleSelectGame('ASE')}
                            aria-label="Select ARK: Survival Evolved"
                            className={`group relative flex-1 max-w-[380px] rounded-2xl cursor-pointer text-left transition-all duration-400 border overflow-hidden ${
                                selectedGame === 'ASE'
                                    ? 'bg-amber-500/10 border-amber-400/40 shadow-[0_0_40px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/30'
                                    : hoveredCard === 'ASA'
                                        ? 'bg-slate-900/30 border-white/5 opacity-50'
                                        : 'bg-slate-900/40 border-white/[0.06] hover:border-amber-500/30 hover:bg-slate-900/60'
                            }`}
                        >
                            {/* Top accent line */}
                            <div className={`h-[2px] w-full transition-all duration-500 ${
                                selectedGame === 'ASE' || hoveredCard === 'ASE'
                                    ? 'bg-gradient-to-r from-transparent via-amber-400 to-transparent'
                                    : 'bg-gradient-to-r from-transparent via-white/[0.06] to-transparent'
                            }`} />

                            <div className="p-7 pb-6">
                                {/* Logo & Info Row */}
                                <div className="flex items-center gap-5 mb-6">
                                    <div className="relative w-16 h-16 shrink-0">
                                        <div className={`absolute inset-0 rounded-xl blur-xl transition-opacity duration-500 ${
                                            hoveredCard === 'ASE' || selectedGame === 'ASE' ? 'opacity-40 bg-amber-500/30' : 'opacity-0'
                                        }`} />
                                        <img
                                            src={aseLogo}
                                            alt="ARK Survival Evolved"
                                            className="relative w-full h-full object-contain select-none pointer-events-none"
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-semibold tracking-widest uppercase text-amber-400/80 mb-1">
                                            Classic Engine
                                        </div>
                                        <h2 className="text-lg font-bold text-white leading-tight truncate">
                                            ARK: Survival Evolved
                                        </h2>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="text-[13px] text-slate-400 leading-relaxed mb-6">
                                    {t('welcome.evolvedDesc', 'Manage your classic ARK: Survival Evolved dedicated servers with full configuration control.')}
                                </p>

                                {/* Action */}
                                <div className={`flex items-center justify-between py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                                    selectedGame === 'ASE'
                                        ? 'bg-amber-500 text-slate-950'
                                        : 'bg-white/[0.04] text-slate-300 group-hover:bg-amber-500/10 group-hover:text-amber-300'
                                }`}>
                                    <span>{selectedGame === 'ASE' ? t('welcome.launching', 'Launching...') : t('welcome.select', 'Select')}</span>
                                    <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${
                                        selectedGame === 'ASE' ? 'translate-x-0.5' : 'group-hover:translate-x-1'
                                    }`} />
                                </div>
                            </div>
                        </motion.button>

                        {/* ASA Card */}
                        <motion.button
                            initial={{ opacity: 0, y: 30 }}
                            animate={{
                                opacity: selectedGame === 'ASE' ? 0.15 : 1,
                                y: 0,
                                scale: selectedGame === 'ASA' ? 1.03 : selectedGame === 'ASE' ? 0.97 : 1,
                                filter: selectedGame === 'ASE' ? 'blur(4px)' : 'blur(0px)',
                            }}
                            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            onMouseEnter={() => !selectedGame && setHoveredCard('ASA')}
                            onMouseLeave={() => !selectedGame && setHoveredCard(null)}
                            onClick={() => !selectedGame && handleSelectGame('ASA')}
                            aria-label="Select ARK: Survival Ascended"
                            className={`group relative flex-1 max-w-[380px] rounded-2xl cursor-pointer text-left transition-all duration-400 border overflow-hidden ${
                                selectedGame === 'ASA'
                                    ? 'bg-sky-500/10 border-sky-400/40 shadow-[0_0_40px_rgba(14,165,233,0.2)] ring-1 ring-sky-500/30'
                                    : hoveredCard === 'ASE'
                                        ? 'bg-slate-900/30 border-white/5 opacity-50'
                                        : 'bg-slate-900/40 border-white/[0.06] hover:border-sky-500/30 hover:bg-slate-900/60'
                            }`}
                        >
                            {/* Top accent line */}
                            <div className={`h-[2px] w-full transition-all duration-500 ${
                                selectedGame === 'ASA' || hoveredCard === 'ASA'
                                    ? 'bg-gradient-to-r from-transparent via-sky-400 to-transparent'
                                    : 'bg-gradient-to-r from-transparent via-white/[0.06] to-transparent'
                            }`} />

                            <div className="p-7 pb-6">
                                {/* Logo & Info Row */}
                                <div className="flex items-center gap-5 mb-6">
                                    <div className="relative w-16 h-16 shrink-0">
                                        <div className={`absolute inset-0 rounded-xl blur-xl transition-opacity duration-500 ${
                                            hoveredCard === 'ASA' || selectedGame === 'ASA' ? 'opacity-40 bg-sky-500/30' : 'opacity-0'
                                        }`} />
                                        <img
                                            src={asaLogo}
                                            alt="ARK Survival Ascended"
                                            className="relative w-full h-full object-contain select-none pointer-events-none"
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-semibold tracking-widest uppercase text-sky-400/80 mb-1">
                                            Unreal Engine 5
                                        </div>
                                        <h2 className="text-lg font-bold text-white leading-tight truncate">
                                            ARK: Survival Ascended
                                        </h2>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="text-[13px] text-slate-400 leading-relaxed mb-6">
                                    {t('welcome.ascendedDesc', 'Manage next-gen ARK: Survival Ascended servers powered by Unreal Engine 5.')}
                                </p>

                                {/* Action */}
                                <div className={`flex items-center justify-between py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                                    selectedGame === 'ASA'
                                        ? 'bg-sky-500 text-slate-950'
                                        : 'bg-white/[0.04] text-slate-300 group-hover:bg-sky-500/10 group-hover:text-sky-300'
                                }`}>
                                    <span>{selectedGame === 'ASA' ? t('welcome.launching', 'Launching...') : t('welcome.select', 'Select')}</span>
                                    <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${
                                        selectedGame === 'ASA' ? 'translate-x-0.5' : 'group-hover:translate-x-1'
                                    }`} />
                                </div>
                            </div>
                        </motion.button>
                    </div>

                    {/* Footer */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="mt-10 flex items-center gap-2 text-[11px] text-slate-500 font-medium"
                    >
                        <Zap className="w-3.5 h-3.5 text-emerald-500/70" />
                        <span>System Ready</span>
                    </motion.div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
