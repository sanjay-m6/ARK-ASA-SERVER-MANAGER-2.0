import { useEffect, lazy, Suspense } from 'react';
import { useIdleAnimations } from '../../hooks/useIdleAnimations';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import TitleBar from './TitleBar';
import GameTransitionHero from './GameTransitionHero';
import { optimizeMemory } from '../../utils/tauri';
import FloatingInstallCenter from '../server/FloatingInstallCenter';
import InstallServerDialog from '../server/InstallServerDialog';
import ASEInstallWizard from '../../ase/components/install/ASEInstallWizard';
import { useInstallStore } from '../../stores/installStore';
import { useGameStore } from '../../stores/gameStore';
import { useServerStore } from '../../stores/serverStore';
import { useAseServerStore } from '../../ase/stores/aseServerStore';
import { cn } from '../../utils/helpers';

// Lazy-load copilot to avoid impacting initial page load
const InfinityCopilot = lazy(() => import('../ai/InfinityCopilot'));

export default function AppLayout() {
    useIdleAnimations();
    const location = useLocation();
    const navigate = useNavigate();
    const { activeInstalls, currentlyViewingPath, setViewingPath, isDraftOpen, setDraftOpen, draftSetup } = useInstallStore();
    const hasViewingTask = currentlyViewingPath && activeInstalls[currentlyViewingPath];
    const isAseTask = hasViewingTask && activeInstalls[currentlyViewingPath].serverType === 'ASE';
    const isAseDraft = isDraftOpen && draftSetup?.formData?.serverType === 'ASE';
    const isAseRestore = isAseTask || isAseDraft;
    const { activeGame } = useGameStore();
    const isASE = activeGame === 'ASE';

    const asaServers = useServerStore(state => state.servers);
    const aseServers = useAseServerStore(state => state.servers);
    const currentModeServers = isASE ? aseServers : asaServers;
    const hasInstalledServers = currentModeServers.length > 0;

    useEffect(() => {
        if (!hasInstalledServers) {
            const path = location.pathname;
            const isAllowed = path === '/servers' || path === '/ase/servers' || path === '/settings' || path === '/ase/settings' || path === '/wiki';
            if (!isAllowed) {
                navigate(isASE ? '/ase/servers' : '/servers', { replace: true });
            }
        }
    }, [hasInstalledServers, isASE, location.pathname, navigate]);

    useEffect(() => {
        // Memory optimization: Trim working set periodically without page-fault churn
        const trimMemory = () => optimizeMemory().catch(() => { });

        trimMemory();
        const interval = setInterval(trimMemory, 180000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className={cn("flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors duration-300", isASE ? "theme-ase" : "theme-asa")}>
            <TitleBar />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-primary)] relative transition-colors duration-300">
                    <TopBar />
                    <div className="flex-1 overflow-y-auto relative theme-scrollbar">
                        {/* Dynamic Cinematic Hero & Background Transition Engine */}
                        <GameTransitionHero />
                        
                        <div className="container mx-auto p-6 max-w-7xl relative z-10">
                            <Outlet />
                        </div>
                    </div>
                </main>
            </div>

            {/* Global AI Copilot — floating panel on every page */}
            <Suspense fallback={null}>
                <InfinityCopilot />
            </Suspense>

            {/* Floating concurrent server installation center */}
            <FloatingInstallCenter />

            {/* Global restore dialog when clicking 'View Logs' from background tasks OR setup drafts */}
            {(hasViewingTask || isDraftOpen) && (
                isAseRestore ? (
                    <ASEInstallWizard onClose={() => {
                        setViewingPath(null);
                        setDraftOpen(false);
                    }} />
                ) : (
                    <InstallServerDialog onClose={() => {
                        setViewingPath(null);
                        setDraftOpen(false);
                    }} />
                )
            )}
        </div>
    );
}
