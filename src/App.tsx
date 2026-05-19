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
import { initializeInstallListeners } from './stores/installStore';


// Lazy load pages for performance optimization
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ServerManager = lazy(() => import('./pages/ServerManager'));
const ModManager = lazy(() => import('./pages/ModManager'));
const ConfigEditor = lazy(() => import('./pages/ConfigEditor'));
const ClusterManager = lazy(() => import('./pages/ClusterManager'));
const Backups = lazy(() => import('./pages/Backups'));
const AutoSaves = lazy(() => import('./pages/AutoSaves'));
const LogsConsole = lazy(() => import('./pages/LogsConsole'));
const RconConsole = lazy(() => import('./pages/RconConsole'));
const Scheduler = lazy(() => import('./pages/Scheduler'));
const Settings = lazy(() => import('./pages/Settings'));
const DiscordBot = lazy(() => import('./pages/DiscordBot'));
const DiscordControlPanel = lazy(() => import('./pages/DiscordControlPanel'));
const AdvancedPage = lazy(() => import('./pages/tools/AdvancedPage'));
const PluginManager = lazy(() => import('./pages/PluginManager'));
const FileManager = lazy(() => import('./pages/FileManager'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const TribeLogViewer = lazy(() => import('./pages/tools/TribeLogViewer'));
const UPnPPanel = lazy(() => import('./pages/tools/UPnPPanel'));
const ServerOrganization = lazy(() => import('./pages/tools/ServerOrganization'));
const Hardware = lazy(() => import('./pages/Hardware'));
const Wiki = lazy(() => import('./pages/Wiki'));

// ASE Module Pages
const ASEDashboard = lazy(() => import('./ase/pages/ASEDashboard'));
const ASEServerManager = lazy(() => import('./ase/pages/ASEServerManager'));
const ASEModManager = lazy(() => import('./ase/pages/ASEModManager'));
const ASEConfigEditor = lazy(() => import('./ase/pages/ASEConfigEditor'));
const ASEClusterManager = lazy(() => import('./ase/pages/ASEClusterManager'));
const ASEBackups = lazy(() => import('./ase/pages/ASEBackups'));
const ASEAutoSaves = lazy(() => import('./ase/pages/ASEAutoSaves'));
const ASELogsConsole = lazy(() => import('./ase/pages/ASELogsConsole'));
const ASERconConsole = lazy(() => import('./ase/pages/ASERconConsole'));
const ASEScheduler = lazy(() => import('./ase/pages/ASEScheduler'));
const ASEHardware = lazy(() => import('./ase/pages/ASEHardware'));
const ASEFileManager = lazy(() => import('./ase/pages/ASEFileManager'));
const ASESettings = lazy(() => import('./ase/pages/ASESettings'));
const ASEDiscordBot = lazy(() => import('./ase/pages/ASEDiscordBot'));
const ASEProfileSync = lazy(() => import('./ase/pages/ASEProfileSync'));
const ASEAIAssistant = lazy(() => import('./ase/pages/ASEAIAssistant'));
const ASEAdvancedPage = lazy(() => import('./ase/pages/ASEAdvancedPage'));
const ASEPluginManager = lazy(() => import('./ase/pages/ASEPluginManager'));
const ASETribeLogViewer = lazy(() => import('./ase/pages/ASETribeLogViewer'));
const ASEUPnPPanel = lazy(() => import('./ase/pages/ASEUPnPPanel'));

function App() {
    const [appState, setAppState] = useState<'welcome' | 'app'>('welcome');

    // Check admin status on mount - just for warning, not blocking
    useEffect(() => {
        // Initialize global Tauri installation event listeners
        initializeInstallListeners();

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
                                <Route path="autosaves" element={<AutoSaves />} />
                                <Route path="rcon" element={<RconConsole />} />
                                <Route path="scheduler" element={<Scheduler />} />
                                <Route path="logs" element={<LogsConsole />} />
                                <Route path="tools/advanced" element={<AdvancedPage />} />
                                <Route path="tools/discord" element={<DiscordBot />} />
                                <Route path="tools/discord-control" element={<DiscordControlPanel />} />
                                <Route path="tools/plugins" element={<PluginManager />} />
                                <Route path="tools/files" element={<FileManager />} />
                                <Route path="tools/ai" element={<AIAssistant />} />
                                <Route path="tools/tribe-logs" element={<TribeLogViewer />} />
                                <Route path="tools/upnp" element={<UPnPPanel />} />
                                <Route path="tools/organization" element={<ServerOrganization />} />
                                <Route path="hardware" element={<Hardware />} />
                                <Route path="wiki" element={<Wiki />} />
                                <Route path="settings" element={<Settings />} />

                                {/* ASE Module Routes */}
                                <Route path="ase/dashboard" element={<ASEDashboard />} />
                                <Route path="ase/servers" element={<ASEServerManager />} />
                                <Route path="ase/mods" element={<ASEModManager />} />
                                <Route path="ase/config" element={<ASEConfigEditor />} />
                                <Route path="ase/clusters" element={<ASEClusterManager />} />
                                <Route path="ase/backups" element={<ASEBackups />} />
                                <Route path="ase/autosaves" element={<ASEAutoSaves />} />
                                <Route path="ase/logs" element={<ASELogsConsole />} />
                                <Route path="ase/rcon" element={<ASERconConsole />} />
                                <Route path="ase/scheduler" element={<ASEScheduler />} />
                                <Route path="ase/hardware" element={<ASEHardware />} />
                                <Route path="ase/files" element={<ASEFileManager />} />
                                <Route path="ase/settings" element={<ASESettings />} />
                                <Route path="ase/discord" element={<ASEDiscordBot />} />
                                <Route path="ase/profile-sync" element={<ASEProfileSync />} />
                                 <Route path="ase/tools/ai" element={<ASEAIAssistant />} />
                                 <Route path="ase/tools/advanced" element={<ASEAdvancedPage />} />
                                 <Route path="ase/tools/plugins" element={<ASEPluginManager />} />
                                 <Route path="ase/tools/tribe-logs" element={<ASETribeLogViewer />} />
                                 <Route path="ase/tools/upnp" element={<ASEUPnPPanel />} />
                                 <Route path="ase/tools/organization" element={<ServerOrganization />} />
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
