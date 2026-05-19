import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import asaLogo from '../../assets/ASA.png';
import aseLogo from '../../assets/ASE.png';

export default function WelcomeOverlay({ onComplete }: { onComplete: () => void }) {
    const { t } = useTranslation();

    useEffect(() => {
        const timer = setTimeout(() => {
            onComplete();
        }, 3500); // Display time

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-white overflow-hidden perspective-[1000px]"
                exit={{ opacity: 0, filter: "blur(20px)" }}
                transition={{ duration: 1, ease: "easeInOut" }}
            >
                {/* Background ambient light */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.2)_0%,black_70%)]"
                />

                {/* Brand Logos Segment */}
                <motion.div
                    className="flex items-center justify-center gap-6 mb-8 z-10"
                    initial={{ y: -30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.8, type: 'spring', stiffness: 50 }}
                >
                    {/* ASE Logo */}
                    <motion.div
                        className="relative group w-20 h-20 md:w-28 md:h-28 flex items-center justify-center"
                        animate={{ 
                            y: [0, -6, 0],
                        }}
                        transition={{ 
                            duration: 4, 
                            repeat: Infinity, 
                            ease: "easeInOut"
                        }}
                    >
                        <div className="absolute inset-0 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all duration-500" />
                        <img 
                            src={aseLogo} 
                            alt="ARK Survival Evolved" 
                            className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(245,158,11,0.3)] pointer-events-none select-none transform hover:scale-105 transition-transform duration-300"
                        />
                    </motion.div>

                    {/* Tech linking line */}
                    <motion.div 
                        className="w-6 h-[1px] bg-gradient-to-r from-amber-500/40 via-slate-500/40 to-cyan-500/40"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.5, duration: 0.6 }}
                    />

                    {/* ASA Logo */}
                    <motion.div
                        className="relative group w-20 h-20 md:w-28 md:h-28 flex items-center justify-center"
                        animate={{ 
                            y: [0, 6, 0],
                        }}
                        transition={{ 
                            duration: 4, 
                            repeat: Infinity, 
                            ease: "easeInOut",
                            delay: 0.5
                        }}
                    >
                        <div className="absolute inset-0 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all duration-500" />
                        <img 
                            src={asaLogo} 
                            alt="ARK Survival Ascended" 
                            className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(34,211,238,0.3)] pointer-events-none select-none transform hover:scale-105 transition-transform duration-300"
                        />
                    </motion.div>
                </motion.div>

                {/* Main Text Container */}
                <motion.div
                    className="relative z-10 text-center space-y-4"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                >
                    <motion.h1
                        className="text-4xl md:text-6xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500 uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                    >
                        {t('welcome.title')}
                    </motion.h1>

                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ delay: 1, duration: 1, ease: "circOut" }}
                        className="h-px bg-cyan-500/50 mx-auto glow-line"
                    />

                    <motion.p
                        className="text-cyan-400 font-mono tracking-[0.5em] text-sm uppercase"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.5, duration: 0.5 }}
                    >
                        {t('welcome.subtitle')}
                    </motion.p>
                </motion.div>

                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-cyan-900/10 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-violet-900/10 to-transparent pointer-events-none" />

            </motion.div>
        </AnimatePresence>
    );
}
