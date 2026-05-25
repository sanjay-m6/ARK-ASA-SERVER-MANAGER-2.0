import { useEffect, lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import GameTransitionHero from './GameTransitionHero';
import { optimizeMemory } from '../../utils/tauri';
import FloatingInstallCenter from '../server/FloatingInstallCenter';
import InstallServerDialog from '../server/InstallServerDialog';
import { useInstallStore } from '../../stores/installStore';
import { useGameStore } from '../../stores/gameStore';
import { cn } from '../../utils/helpers';

// Lazy-load copilot to avoid impacting initial page load
const InfinityCopilot = lazy(() => import('../ai/InfinityCopilot'));

export default function AppLayout() {
    const { activeInstalls, currentlyViewingPath, setViewingPath, isDraftOpen, setDraftOpen } = useInstallStore();
    const hasViewingTask = currentlyViewingPath && activeInstalls[currentlyViewingPath];
    const { activeGame } = useGameStore();
    const isASE = activeGame === 'ASE';

    useEffect(() => {
        // Aggressive memory optimization: Trim working set every 10 seconds
        // This keeps the visible RAM usage low ("locked" behavior requested by user)
        const trimMemory = () => optimizeMemory().catch(() => { });

        trimMemory();
        const interval = setInterval(trimMemory, 10000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className={cn("flex h-screen overflow-hidden bg-dark-950 transition-colors duration-500", isASE ? "theme-ase" : "theme-asa")}>
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden bg-[#020617] relative">
                <TopBar />
                <div className="flex-1 overflow-y-auto relative theme-scrollbar">
                    {/* Dynamic Cinematic Hero & Background Transition Engine */}
                    <GameTransitionHero />
                    
                    <div className="container mx-auto p-6 max-w-7xl relative z-10">
                        <Outlet />
                    </div>
                </div>
            </main>

            {/* Global AI Copilot — floating panel on every page */}
            <Suspense fallback={null}>
                <InfinityCopilot />
            </Suspense>

            {/* Floating concurrent server installation center */}
            <FloatingInstallCenter />

            {/* Global restore dialog when clicking 'View Logs' from background tasks OR setup drafts */}
            {(hasViewingTask || isDraftOpen) && (
                <InstallServerDialog onClose={() => {
                    setViewingPath(null);
                    setDraftOpen(false);
                }} />
            )}
        </div>
    );
}
