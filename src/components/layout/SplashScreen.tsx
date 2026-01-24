import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import introVideo from '../../assets/intro.mp4';

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.play().catch(err => {
                console.error("Video autoplay failed:", err);
                // If autoplay fails, fallback immediately
                onComplete();
            });
        }
    }, [onComplete]);

    const handleVideoEnd = () => {
        onComplete();
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onComplete();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onComplete]);

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden perspective-[1000px]"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
            >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.1)_0%,rgba(0,0,0,0.8)_80%)] pointer-events-none z-0" />

                <motion.div
                    className="relative w-full h-full"
                    style={{ transformStyle: "preserve-3d" }}
                    initial={{ scale: 1.1, rotateX: 5, rotateY: 5 }}
                    animate={{
                        scale: 1,
                        rotateX: [5, 0, 5],
                        rotateY: [5, -5, 5]
                    }}
                    transition={{
                        scale: { duration: 1.5, ease: "easeOut" },
                        rotateX: { duration: 8, repeat: Infinity, ease: "easeInOut" },
                        rotateY: { duration: 10, repeat: Infinity, ease: "easeInOut" }
                    }}
                >
                    <video
                        ref={videoRef}
                        src={introVideo}
                        className="w-full h-full object-cover"
                        autoPlay
                        // muted={false} 
                        playsInline
                        onEnded={handleVideoEnd}
                        onLoadedData={() => setIsVideoLoaded(true)}
                        style={{ backfaceVisibility: "hidden" }} // Optimization
                    />

                    {/* Cinematic Overlay Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />

                    {/* Floating UI Layer (3D Depth) */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-10" style={{ transform: "translateZ(60px)" }}>

                        {/* Header/Top Right */}
                        <div className="flex justify-end pointer-events-auto">
                            <button
                                onClick={onComplete}
                                className="text-white/30 hover:text-white/90 text-[10px] tracking-[0.2em] uppercase transition-all hover:scale-110 font-light border border-white/5 px-4 py-2 rounded-full hover:bg-white/5 backdrop-blur-sm shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                            >
                                Skip Intro [ESC]
                            </button>
                        </div>

                        {/* Footer/Loading */}
                        <div>
                            {isVideoLoaded ? (
                                <div className="space-y-3">
                                    {/* Text Indicator */}
                                    <div className="flex justify-between items-end">
                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 }}
                                            className="flex flex-col"
                                        >
                                            <span className="text-[10px] tracking-[0.3em] font-mono text-cyan-400 font-bold uppercase drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]">
                                                Secure Uplink
                                            </span>
                                            <span className="text-[8px] text-slate-400 font-mono tracking-widest">
                                                ESTABLISHING QUANTUM TUNNEL...
                                            </span>
                                        </motion.div>
                                        <motion.div
                                            className="text-2xl font-black font-mono text-white/90 flex items-center gap-2"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        >
                                            <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                                            <motion.span
                                                animate={{ opacity: [1, 0.6, 1] }}
                                                transition={{ duration: 0.5, repeat: Infinity }}
                                            >
                                                LOADING
                                            </motion.span>
                                        </motion.div>
                                    </div>

                                    {/* Bar Container */}
                                    <div className="h-2 w-full bg-slate-900/50 rounded-full overflow-hidden backdrop-blur-md border border-white/5 shadow-2xl">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-cyan-600 via-blue-500 to-violet-500 relative"
                                            initial={{ width: "0%" }}
                                            animate={{ width: "100%" }}
                                            transition={{
                                                duration: 8,
                                                ease: "linear"
                                            }}
                                        >
                                            {/* Glowing Head */}
                                            <div className="absolute right-0 top-0 bottom-0 w-12 bg-white blur-[10px] opacity-70" />
                                        </motion.div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center text-white font-mono animate-pulse tracking-widest text-sm">
                                    [ INITIALIZING ]
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
