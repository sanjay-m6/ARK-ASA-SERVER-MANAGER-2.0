import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
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
                className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[#030712] text-white overflow-hidden p-8"
                exit={{ opacity: 0, filter: "blur(20px)" }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
            >
                {/* Background ambient liquid glows */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Left glow (ASE - Warm Amber/Orange) */}
                    <div 
                        className={`absolute -left-1/4 -top-1/4 w-[60%] h-[80%] rounded-full bg-amber-500/10 blur-[150px] transition-all duration-1000 ease-out ${
                            hoveredCard === 'ASE' ? 'opacity-100 scale-110 bg-amber-500/20' : 'opacity-40'
                        } ${selectedGame === 'ASE' ? 'opacity-100 scale-125 bg-amber-500/30 blur-[180px]' : ''}`}
                    />
                    {/* Right glow (ASA - Futuristic Cyan/Blue) */}
                    <div 
                        className={`absolute -right-1/4 -bottom-1/4 w-[60%] h-[80%] rounded-full bg-cyan-500/10 blur-[150px] transition-all duration-1000 ease-out ${
                            hoveredCard === 'ASA' ? 'opacity-100 scale-110 bg-cyan-500/20' : 'opacity-40'
                        } ${selectedGame === 'ASA' ? 'opacity-100 scale-125 bg-cyan-500/30 blur-[180px]' : ''}`}
                    />
                </div>

                {/* Header */}
                <header className="relative z-10 text-center pt-10 select-none">
                    <motion.p
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="text-[10px] font-black tracking-[0.4em] text-slate-500 uppercase mb-2"
                    >
                        {t('welcome.headerBrand', 'ARK INFINITY')}
                    </motion.p>
                    <motion.h1
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
                        className="text-2xl md:text-3xl font-extrabold tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-white to-slate-400 uppercase drop-shadow-[0_2px_10px_rgba(255,255,255,0.05)]"
                    >
                        {t('welcome.headerTitle', 'SERVER MANAGER')}
                    </motion.h1>
                </header>

                {/* Main Card Selectors */}
                <div className="relative z-10 flex flex-col md:flex-row gap-8 md:gap-12 w-full max-w-4xl justify-center items-center my-auto">
                    {/* Left Card (ASE) */}
                    <motion.div
                        initial={{ opacity: 0, x: -60 }}
                        animate={{ 
                            opacity: selectedGame === 'ASA' ? 0.05 : 1,
                            x: 0,
                            scale: selectedGame === 'ASE' ? 1.04 : 1,
                            filter: selectedGame === 'ASA' ? 'blur(4px)' : 'blur(0px)'
                        }}
                        transition={{ type: 'spring', stiffness: 80, damping: 15 }}
                        onMouseEnter={() => !selectedGame && setHoveredCard('ASE')}
                        onMouseLeave={() => !selectedGame && setHoveredCard(null)}
                        onClick={() => !selectedGame && handleSelectGame('ASE')}
                        aria-label="Select ARK: Survival Evolved"
                        className={`group relative w-72 md:w-80 p-8 rounded-[2rem] cursor-pointer select-none transition-all duration-500 ease-out border ${
                            selectedGame === 'ASE' 
                                ? 'bg-amber-500/10 border-amber-400/40 shadow-[0_0_50px_rgba(245,158,11,0.25)] backdrop-blur-xl' 
                                : hoveredCard === 'ASA'
                                    ? 'bg-slate-950/20 border-white/5 opacity-30 grayscale-[50%] scale-95 blur-[1px]'
                                    : 'bg-slate-950/40 border-white/5 hover:border-amber-500/35 hover:bg-slate-950/65 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_0_40px_rgba(245,158,11,0.15)] backdrop-blur-md'
                        }`}
                    >
                        {/* Glow element inside border */}
                        <div className="absolute inset-0 rounded-[2rem] transition-opacity duration-500 opacity-0 group-hover:opacity-100 border border-amber-500/10 pointer-events-none" />

                        <div className="flex flex-col items-center text-center space-y-6">
                            {/* Logo with interactive hover animations */}
                            <div className="relative w-28 h-28 md:w-32 md:h-32 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                                <div className="absolute inset-0 rounded-full blur-2xl opacity-20 group-hover:opacity-50 transition-all duration-500 bg-amber-500/25" />
                                <img 
                                    src={aseLogo} 
                                    alt="ARK Survival Evolved" 
                                    className="w-full h-full object-contain filter drop-shadow-[0_8px_16px_rgba(245,158,11,0.15)] select-none pointer-events-none"
                                />
                            </div>

                            {/* Game Info */}
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold tracking-wide text-slate-100 group-hover:text-amber-400 transition-colors duration-300">
                                    ARK: Survival Evolved
                                </h2>
                                <p className="text-xs text-slate-400 tracking-wider font-medium">
                                    {t('welcome.evolvedSubtitle', 'Manage Evolved Servers')}
                                </p>
                            </div>

                            {/* Custom Action Button */}
                            <div className={`mt-2 px-6 py-2 rounded-xl text-[10px] font-black tracking-[0.2em] uppercase border transition-all duration-300 ${
                                selectedGame === 'ASE'
                                    ? 'bg-amber-400 border-amber-300 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                                    : 'bg-transparent border-white/10 text-slate-400 group-hover:border-amber-500/40 group-hover:text-amber-400 group-hover:bg-amber-500/10'
                            }`}>
                                {selectedGame === 'ASE' ? t('welcome.launching', 'Launching...') : t('welcome.select', 'Select')}
                            </div>
                        </div>
                    </motion.div>

                    {/* Divider vertical rule */}
                    <div className="hidden md:block w-[1px] h-36 bg-gradient-to-b from-transparent via-white/5 to-transparent" />

                    {/* Right Card (ASA) */}
                    <motion.div
                        initial={{ opacity: 0, x: 60 }}
                        animate={{ 
                            opacity: selectedGame === 'ASE' ? 0.05 : 1,
                            x: 0,
                            scale: selectedGame === 'ASA' ? 1.04 : 1,
                            filter: selectedGame === 'ASE' ? 'blur(4px)' : 'blur(0px)'
                        }}
                        transition={{ type: 'spring', stiffness: 80, damping: 15 }}
                        onMouseEnter={() => !selectedGame && setHoveredCard('ASA')}
                        onMouseLeave={() => !selectedGame && setHoveredCard(null)}
                        onClick={() => !selectedGame && handleSelectGame('ASA')}
                        aria-label="Select ARK: Survival Ascended"
                        className={`group relative w-72 md:w-80 p-8 rounded-[2rem] cursor-pointer select-none transition-all duration-500 ease-out border ${
                            selectedGame === 'ASA' 
                                ? 'bg-cyan-500/10 border-cyan-400/40 shadow-[0_0_50px_rgba(6,182,212,0.25)] backdrop-blur-xl' 
                                : hoveredCard === 'ASE'
                                    ? 'bg-slate-950/20 border-white/5 opacity-30 grayscale-[50%] scale-95 blur-[1px]'
                                    : 'bg-slate-950/40 border-white/5 hover:border-cyan-500/35 hover:bg-slate-950/65 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_0_40px_rgba(6,182,212,0.15)] backdrop-blur-md'
                        }`}
                    >
                        {/* Glow element inside border */}
                        <div className="absolute inset-0 rounded-[2rem] transition-opacity duration-500 opacity-0 group-hover:opacity-100 border border-cyan-500/10 pointer-events-none" />

                        <div className="flex flex-col items-center text-center space-y-6">
                            {/* Logo with interactive hover animations */}
                            <div className="relative w-28 h-28 md:w-32 md:h-32 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                                <div className="absolute inset-0 rounded-full blur-2xl opacity-20 group-hover:opacity-50 transition-all duration-500 bg-cyan-500/25" />
                                <img 
                                    src={asaLogo} 
                                    alt="ARK Survival Ascended" 
                                    className="w-full h-full object-contain filter drop-shadow-[0_8px_16px_rgba(6,182,212,0.15)] select-none pointer-events-none"
                                />
                            </div>

                            {/* Game Info */}
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold tracking-wide text-slate-100 group-hover:text-cyan-400 transition-colors duration-300">
                                    ARK: Survival Ascended
                                </h2>
                                <p className="text-xs text-slate-400 tracking-wider font-medium">
                                    {t('welcome.ascendedSubtitle', 'Manage Next-Gen Ascended Servers')}
                                </p>
                            </div>

                            {/* Custom Action Button */}
                            <div className={`mt-2 px-6 py-2 rounded-xl text-[10px] font-black tracking-[0.2em] uppercase border transition-all duration-300 ${
                                selectedGame === 'ASA'
                                    ? 'bg-cyan-400 border-cyan-300 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                                    : 'bg-transparent border-white/10 text-slate-400 group-hover:border-cyan-500/40 group-hover:text-cyan-400 group-hover:bg-cyan-500/10'
                            }`}>
                                {selectedGame === 'ASA' ? t('welcome.launching', 'Launching...') : t('welcome.select', 'Select')}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
