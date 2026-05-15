import { useEffect, lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { optimizeMemory } from '../../utils/tauri';

// Lazy-load copilot to avoid impacting initial page load
const InfinityCopilot = lazy(() => import('../ai/InfinityCopilot'));

export default function AppLayout() {
    useEffect(() => {
        // Aggressive memory optimization: Trim working set every 10 seconds
        // This keeps the visible RAM usage low ("locked" behavior requested by user)
        const trimMemory = () => optimizeMemory().catch(() => { });

        trimMemory();
        const interval = setInterval(trimMemory, 10000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex h-screen overflow-hidden bg-dark-950">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden bg-dark-950">
                <TopBar />
                <div className="flex-1 overflow-y-auto">
                    <div className="container mx-auto p-6 max-w-7xl">
                        <Outlet />
                    </div>
                </div>
            </main>

            {/* Global AI Copilot — floating panel on every page */}
            <Suspense fallback={null}>
                <InfinityCopilot />
            </Suspense>
        </div>
    );
}
