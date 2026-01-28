import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import ServerManager from './pages/ServerManager';
import ModManager from './pages/ModManager';
import ConfigEditor from './pages/ConfigEditor';
import ClusterManager from './pages/ClusterManager';
import Backups from './pages/Backups';
import LogsConsole from './pages/LogsConsole';
import RconConsole from './pages/RconConsole';
import Scheduler from './pages/Scheduler';
import Settings from './pages/Settings';
import DiscordBot from './pages/DiscordBot';
import SplashScreen from './components/layout/SplashScreen';
import WelcomeOverlay from './components/layout/WelcomeOverlay';
import UpdateChecker from './components/UpdateChecker';

import AdvancedPage from './pages/tools/AdvancedPage';
import PluginManager from './pages/PluginManager';
import FileManager from './pages/FileManager';

function App() {
    const [appState, setAppState] = useState<'splash' | 'welcome' | 'app'>('splash');

    if (appState === 'splash') {
        return <SplashScreen onComplete={() => setAppState('welcome')} />;
    }

    if (appState === 'welcome') {
        return <WelcomeOverlay onComplete={() => setAppState('app')} />;
    }

    return (
        <>
            <BrowserRouter>
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

                        {/* Tools Section */}
                        <Route path="tools/advanced" element={<AdvancedPage />} />
                        <Route path="tools/discord" element={<DiscordBot />} />
                        <Route path="tools/plugins" element={<PluginManager />} />
                        <Route path="tools/files" element={<FileManager />} />

                        <Route path="settings" element={<Settings />} />
                    </Route>
                </Routes>
            </BrowserRouter>
            <UpdateChecker />
        </>
    );
}

export default App;
