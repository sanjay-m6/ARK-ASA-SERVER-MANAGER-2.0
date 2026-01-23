
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../../assets/logo.png';

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('Initializing System...');

    useEffect(() => {
        // Simulated loading sequence
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setTimeout(onComplete, 800); // Extended wait for exit animation
                    return 100;
                }

                // Random accelerate for realism
                const jump = Math.random() * 8;
                const next = Math.min(prev + jump, 100);

                if (next > 15 && next < 30) setStatusText('Decrypting SecuCode...');
                if (next > 30 && next < 55) setStatusText('Loading Modules...');
                if (next > 55 && next < 80) setStatusText('Connecting to Neural Net...');
                if (next > 80 && next < 95) setStatusText('Syncing Configuration...');
                if (next > 95) setStatusText('SYSTEM ONLINE');

                return next;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [onComplete]);

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050508] text-white overflow-hidden"
                exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
            >

                {/* 1. Animated Background Grids */}
                <div className="absolute inset-0 perspective-1000">
                    <motion.div
                        initial={{ opacity: 0, rotateX: 60, scale: 2 }}
                        animate={{ opacity: 0.2, rotateX: 60, scale: 1 }}
                        transition={{ duration: 2 }}
                        className="absolute inset-0 bg-[url('/bg-grid.png')] bg-center bg-repeat opacity-20"
                        style={{ transformOrigin: "center 80%" }}
                    />
                </div>

                {/* 2. Cybernetic Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-cyan-900/10 via-transparent to-violet-900/10 pointer-events-none" />
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000000_120%)]"
                />

                {/* 3. Logo Materialization */}
                <div className="relative z-10 p-10">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0, filter: "blur(20px)" }}
                        animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                        transition={{ duration: 1.2, ease: "circOut" }}
                        className="relative"
                    >
                        {/* Energy Ring Behind Logo */}
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            className="absolute -inset-10 border border-cyan-500/10 rounded-full border-dashed"
                        />
                        <motion.div
                            animate={{ rotate: -360 }}
                            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                            className="absolute -inset-16 border border-violet-500/10 rounded-full border-dashed"
                        />

                        {/* Main Logo */}
                        <img
                            src={logo}
                            alt="ASA Server Manager"
                            className="w-80 h-80 object-contain drop-shadow-[0_0_60px_rgba(6,182,212,0.6)]"
                        />

                        {/* Glitch Overlay Effect */}
                        <motion.div
                            animate={{
                                opacity: [0, 0.1, 0, 0.05, 0],
                                x: [0, -5, 5, -2, 0]
                            }}
                            transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
                            className="absolute inset-0 bg-cyan-500 mix-blend-color-dodge opacity-0"
                            style={{ maskImage: "url(/logo.png)", maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center" }}
                        />
                    </motion.div>
                </div>

                {/* 4. Progress & Status */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-8 w-96 space-y-4 relative z-10"
                >
                    <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-mono text-cyan-400 tracking-[0.2em] uppercase">
                            {statusText}
                        </span>
                        <span className="text-xs font-bold text-violet-400 font-mono">
                            {Math.round(progress).toString().padStart(3, '0')}%
                        </span>
                    </div>

                    {/* High-Tech Bar */}
                    <div className="h-1.5 w-full bg-slate-900/50 rounded-sm overflow-hidden border border-slate-800 backdrop-blur-sm relative">
                        {/* Grid Pattern on Bar */}
                        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:4px_100%] z-20 pointer-events-none opacity-50" />

                        <motion.div
                            className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-white relative z-10"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: "spring", stiffness: 200, damping: 30 }} // Bouncy mechanical feel
                        >
                            {/* Glow Head */}
                            <div className="absolute right-0 top-0 bottom-0 w-4 bg-white blur-[5px]" />
                        </motion.div>
                    </div>
                </motion.div>

                {/* 5. Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="absolute bottom-8 text-slate-700 text-[10px] tracking-[0.4em] font-light mix-blend-plus-lighter"
                >
                    INITIALIZING QUANTUM CORE
                </motion.div>

            </motion.div>
        </AnimatePresence>
    );
}
