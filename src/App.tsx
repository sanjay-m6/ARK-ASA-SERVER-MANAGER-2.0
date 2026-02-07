import { useState, Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import WelcomeOverlay from './components/layout/WelcomeOverlay';
import UpdateChecker from './components/UpdateChecker';
import AdminBlocker from './components/layout/AdminBlocker';
import { Loader2 } from 'lucide-react';
import { checkIsAdmin } from './utils/tauri';


// Lazy load pages for performance optimization
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ServerManager = lazy(() => import('./pages/ServerManager'));
const ModManager = lazy(() => import('./pages/ModManager'));
const ConfigEditor = lazy(() => import('./pages/ConfigEditor'));
const ClusterManager = lazy(() => import('./pages/ClusterManager'));
const Backups = lazy(() => import('./pages/Backups'));
const LogsConsole = lazy(() => import('./pages/LogsConsole'));
const RconConsole = lazy(() => import('./pages/RconConsole'));
const Scheduler = lazy(() => import('./pages/Scheduler'));
const Settings = lazy(() => import('./pages/Settings'));
const DiscordBot = lazy(() => import('./pages/DiscordBot'));
const AdvancedPage = lazy(() => import('./pages/tools/AdvancedPage'));
const PluginManager = lazy(() => import('./pages/PluginManager'));
const FileManager = lazy(() => import('./pages/FileManager'));

function App() {
    const [appState, setAppState] = useState<'welcome' | 'app'>('welcome');
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null); // null = checking, true = admin, false = blocked

    useEffect(() => {
        console.log('[App] Starting admin check...');
        checkIsAdmin().then(isAdmin => {
            console.log('[App] Admin check result:', isAdmin);
            setIsAuthorized(isAdmin);
        }).catch(err => {
            console.error("[App] Failed to check admin status:", err);
            // Fail safe: show AdminBlocker if check fails
            setIsAuthorized(false);
        });
    }, []);

    // Show a loading spinner while checking admin status
    if (isAuthorized === null) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0f]">
                <Loader2 className="w-12 h-12 text-sky-500 animate-spin" />
            </div>
        );
    }

    if (!isAuthorized) {
        return <AdminBlocker />;
    }

    if (appState === 'welcome') {
        return <WelcomeOverlay onComplete={() => setAppState('app')} />;
    }

    // Loading component for Suspense
    const PageLoader = () => (
        <div className="flex items-center justify-center h-full w-full min-h-[400px]">
            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        </div>
    );

    return (
        <>
            <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        <Route path="/" element={<AppLayout />}>
                            <Route index element={<Navigate to="/dashboard" replace />} />
                            <Route path="dashboard" element={<Dashboard />} />
                            <Route path="servers" element={<ServerManager />} />
                            <Route path="mods" element={<ModManager />} />
                            <Route path="config" element={<ConfigEditor />} />
                            <Route path="clusters" element={<ClusterManager />} />
                            <Route path="backups" element={<Backups />} />
                            <Route path="rcon" element={<RconConsole />} />
                            <Route path="scheduler" element={<Scheduler />} />
                            <Route path="logs" element={<LogsConsole />} />
                            <Route path="tools/advanced" element={<AdvancedPage />} />
                            <Route path="tools/discord" element={<DiscordBot />} />
                            <Route path="tools/plugins" element={<PluginManager />} />
                            <Route path="tools/files" element={<FileManager />} />
                            <Route path="settings" element={<Settings />} />
                        </Route>
                    </Routes>
                </Suspense>
            </BrowserRouter>
            <UpdateChecker />
        </>
    );
}

export default App;
