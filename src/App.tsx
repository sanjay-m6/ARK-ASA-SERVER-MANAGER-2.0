import { useState, Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import WelcomeOverlay from './components/layout/WelcomeOverlay';
import UpdateChecker from './components/UpdateChecker';
import { Loader2 } from 'lucide-react';
import { checkIsAdmin } from './utils/tauri';
import { toast } from 'react-hot-toast';
import ErrorBoundary from './components/ErrorBoundary';
import './i18n'; // Initialize i18n


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
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const TribeLogViewer = lazy(() => import('./pages/tools/TribeLogViewer'));
const UPnPPanel = lazy(() => import('./pages/tools/UPnPPanel'));
const Hardware = lazy(() => import('./pages/Hardware'));

function App() {
    const [appState, setAppState] = useState<'welcome' | 'app'>('welcome');

    // Check admin status on mount - just for warning, not blocking
    useEffect(() => {
        checkIsAdmin()
            .then(isAdmin => {
                if (!isAdmin) {
                    console.warn('[App] Running without Administrator privileges. Some features may not work.');
                    // Show a toast warning instead of blocking
                    setTimeout(() => {
                        toast('Running without Admin privileges. Some features may be limited.', {
                            icon: '⚠️',
                            duration: 6000,
                        });
                    }, 4000); // Delay to show after welcome screen
                }
            })
            .catch(err => {
                console.warn('[App] Could not check admin status:', err);
            });
    }, []);

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
                <ErrorBoundary>
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
                                <Route path="tools/ai" element={<AIAssistant />} />
                                <Route path="tools/tribe-logs" element={<TribeLogViewer />} />
                                <Route path="tools/upnp" element={<UPnPPanel />} />
                                <Route path="hardware" element={<Hardware />} />
                                <Route path="settings" element={<Settings />} />
                            </Route>
                        </Routes>
                    </Suspense>
                </ErrorBoundary>
            </BrowserRouter>
            <UpdateChecker />
        </>
    );
}

export default App;
