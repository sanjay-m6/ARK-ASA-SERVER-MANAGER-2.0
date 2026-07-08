import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useCopilotStore } from '../../stores/copilotStore';
import { startWatchdog, stopWatchdog } from '../../utils/aiWatchdog';
import CopilotFAB from './CopilotFAB';
import CopilotPanel from './CopilotPanel';
import CrashNotificationCenter from './CrashNotificationCenter';
import CrashArchiveModal from './CrashArchiveModal';
import { useCrashNotificationStore } from '../../stores/crashNotificationStore';

/**
 * InfinityCopilot — Global orchestrator that renders the FAB + Panel.
 * Mount this once in AppLayout. It auto-detects the current route,
 * switches the copilot context, and runs the proactive health watchdog.
 */
export default function InfinityCopilot() {
    const location = useLocation();
    const setRoute = useCopilotStore((s) => s.setRoute);
    const addAlertMessage = useCopilotStore((s) => s.addAlertMessage);
    const handleCrashEvent = useCrashNotificationStore((s) => s.handleCrashEvent);

    // Sync current route into copilot store
    useEffect(() => {
        setRoute(location.pathname);
    }, [location.pathname, setRoute]);

    // Start background health watchdog
    useEffect(() => {
        startWatchdog((alert) => {
            if (alert.type === 'crash') {
                const serverId = Number(alert.id.split('_')[1]) || 0;
                handleCrashEvent({
                    serverId,
                    anomalyType: 'Status watchdog',
                    details: alert.message
                });
            } else {
                addAlertMessage(alert);
            }
        }, 60000); // Check every 60 seconds
        return () => stopWatchdog();
    }, [addAlertMessage, handleCrashEvent]);

    return (
        <>
            <CopilotPanel />
            <CopilotFAB />
            <CrashNotificationCenter />
            <CrashArchiveModal />
        </>
    );
}

