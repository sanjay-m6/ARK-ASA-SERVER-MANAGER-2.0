import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function WelcomeOverlay({ onComplete }: { onComplete: () => void }) {

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
                        Welcome Back
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
                        Commander
                    </motion.p>
                </motion.div>

                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-cyan-900/10 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-violet-900/10 to-transparent pointer-events-none" />

            </motion.div>
        </AnimatePresence>
    );
}
