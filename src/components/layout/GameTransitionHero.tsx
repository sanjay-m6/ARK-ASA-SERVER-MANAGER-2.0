import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import asaHero from '../../assets/ASA.png';
import aseHero from '../../assets/ASE.png';

// Generate dynamic floating particles
const generateParticles = (count: number) => {
    return Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        size: `${Math.random() * 4 + 2}px`,
        delay: `${Math.random() * 10}s`,
        duration: `${Math.random() * 12 + 10}s`,
    }));
};

const ASA_PARTICLES = generateParticles(20);
const ASE_PARTICLES = generateParticles(15);

// Circuit tech nodes positions
const TECH_NODES = [
    { top: '15%', left: '20%', delay: '0.2s' },
    { top: '35%', left: '15%', delay: '1.2s' },
    { top: '25%', left: '80%', delay: '0.8s' },
    { top: '65%', left: '85%', delay: '2.1s' },
    { top: '80%', left: '10%', delay: '1.5s' },
    { top: '75%', left: '75%', delay: '2.8s' },
];

export default function GameTransitionHero() {
    const { activeGame } = useGameStore();
    const isASE = activeGame === 'ASE';
    
    const [assetsLoaded, setAssetsLoaded] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Preload heavy game hero graphics to achieve 100% flicker-free switching
    useEffect(() => {
        const preloadImages = async () => {
            const cache = [asaHero, aseHero];
            const promises = cache.map((src) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = src;
                    img.onload = resolve;
                    img.onerror = reject;
                });
            });

            try {
                await Promise.all(promises);
                setAssetsLoaded(true);
            } catch (err) {
                console.warn('Failed to pre-cache game hero images:', err);
                // Fallback to true so we still render
                setAssetsLoaded(true);
            }
        };

        preloadImages();
    }, []);

    // Monitor game state switches to trigger a sleek fullscreen AAA cinematic energy wipe
    useEffect(() => {
        setIsTransitioning(true);
        const timer = setTimeout(() => {
            setIsTransitioning(false);
        }, 700);

        return () => clearTimeout(timer);
    }, [activeGame]);

    if (!assetsLoaded) return null;

    return (
        <div className="absolute inset-0 w-full h-full game-backdrop-container z-0 pointer-events-none select-none">
            {/* Cinematic Fullscreen Screen Wipe / Bloom masking layer */}
            <AnimatePresence>
                {isTransitioning && (
                    <motion.div
                        initial={{ opacity: 0, scale: 1 }}
                        animate={{ 
                            opacity: [0, 0.95, 0.95, 0],
                            backdropFilter: ['blur(0px)', 'blur(12px)', 'blur(12px)', 'blur(0px)'],
                        }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.7, ease: "easeInOut" }}
                        className={`absolute inset-0 z-50 flex items-center justify-center pointer-events-none ${
                            isASE 
                                ? "bg-gradient-to-r from-amber-950/80 via-orange-900/90 to-red-950/80" 
                                : "bg-gradient-to-r from-cyan-950/80 via-blue-900/90 to-indigo-950/80"
                        }`}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1.05, opacity: 1 }}
                            exit={{ scale: 1.1, opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-center flex flex-col items-center justify-center"
                        >
                            {/* Cinematic Screen Wipe Hero Logo */}
                            <motion.div
                                initial={{ y: -20, opacity: 0, scale: 0.8 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                transition={{ delay: 0.1, duration: 0.4 }}
                                className="w-28 h-28 md:w-36 md:h-36 mb-4 flex items-center justify-center relative"
                            >
                                <div className={`absolute inset-0 rounded-full blur-2xl opacity-30 ${
                                    isASE ? 'bg-amber-500' : 'bg-cyan-500'
                                }`} />
                                <img
                                    src={isASE ? aseHero : asaHero}
                                    alt={isASE ? "ARK Survival Evolved" : "ARK Survival Ascended"}
                                    className={`w-full h-full object-contain pointer-events-none select-none relative z-10 filter drop-shadow-[0_0_20px_${
                                        isASE ? 'rgba(245,158,11,0.5)' : 'rgba(34,211,238,0.5)'
                                    }]`}
                                />
                            </motion.div>

                            <h2 className={`text-3xl font-black tracking-[0.3em] font-display uppercase ${
                                isASE ? "text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]" : "text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.6)]"
                            }`}>
                                {isASE ? "SURVIVAL EVOLVED" : "SURVIVAL ASCENDED"}
                            </h2>
                            <p className="text-xs text-slate-400 mt-2 font-mono tracking-widest uppercase">Initializing Interface Sync...</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Background Grid and Circuit Overlay */}
            <div className="absolute inset-0 cyber-grid-overlay opacity-60"></div>

            {/* Staggered Ambient Radial Bloom */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeGame}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0"
                >
                    {isASE ? (
                        /* ASE Amber, Green & Metallic Deep Glow */
                        <>
                            <div className="absolute top-[-10%] left-[30%] w-[550px] h-[550px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none"></div>
                            <div className="absolute bottom-[10%] right-[10%] w-[450px] h-[450px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none"></div>
                            <div className="absolute top-[40%] left-[10%] w-[350px] h-[350px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>
                        </>
                    ) : (
                        /* ASA Futuristic Blue & Cyan Intense Glow */
                        <>
                            <div className="absolute top-[-10%] left-[25%] w-[600px] h-[600px] bg-cyan-500/15 rounded-full blur-[150px] pointer-events-none"></div>
                            <div className="absolute bottom-[5%] right-[15%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[130px] pointer-events-none"></div>
                            <div className="absolute top-[30%] left-[5%] w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[110px] pointer-events-none"></div>
                        </>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Glowing Tech Nodes & Circuit Links (ASA exclusive sci-fi layout) */}
            {!isASE && (
                <div className="absolute inset-0 w-full h-full opacity-40">
                    {TECH_NODES.map((node, i) => (
                        <div
                            key={i}
                            className="tech-node"
                            style={{
                                top: node.top,
                                left: node.left,
                                animationDelay: node.delay,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Drifting Particle Emitters */}
            <div className="absolute inset-0 w-full h-full overflow-hidden opacity-30">
                <AnimatePresence mode="wait">
                    {isASE ? (
                        <motion.div 
                            key="ase-particles"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0"
                        >
                            {ASE_PARTICLES.map((p) => (
                                <div
                                    key={p.id}
                                    className="game-particle bg-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                                    style={{
                                        left: p.left,
                                        width: p.size,
                                        height: p.size,
                                        animationDelay: p.delay,
                                        animationDuration: p.duration,
                                    }}
                                />
                            ))}
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="asa-particles"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0"
                        >
                            {ASA_PARTICLES.map((p) => (
                                <div
                                    key={p.id}
                                    className="game-particle bg-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                                    style={{
                                        left: p.left,
                                        width: p.size,
                                        height: p.size,
                                        animationDelay: p.delay,
                                        animationDuration: p.duration,
                                    }}
                                />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Centerpiece Cinematic Hero Logo Graphic */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden py-16">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeGame}
                        initial={{ opacity: 0, scale: 0.85, y: 30, filter: 'blur(10px)' }}
                        animate={{ opacity: 0.15, scale: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 1.08, y: -30, filter: 'blur(12px)' }}
                        transition={{ 
                            type: "spring",
                            stiffness: 70,
                            damping: 18,
                            mass: 1.2
                        }}
                        className="w-[85vw] md:w-[60vw] max-w-[850px] aspect-video flex items-center justify-center hero-art-float"
                    >
                        <img
                            src={isASE ? aseHero : asaHero}
                            alt={isASE ? "ARK Survival Evolved" : "ARK Survival Ascended"}
                            className="w-full h-full object-contain pointer-events-none drop-shadow-[0_0_35px_rgba(0,0,0,0.8)]"
                        />
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
