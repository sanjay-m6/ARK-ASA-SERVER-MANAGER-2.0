// Hook that builds live context from application state for the copilot
import { useServerStore } from '../../../stores/serverStore';
import { useUIStore } from '../../../stores/uiStore';

export function buildLiveContext(route: string): string {
    const servers = useServerStore.getState().servers;
    const systemInfo = useUIStore.getState().systemInfo;

    const runningCount = servers.filter(s => s.status === 'running' || s.status === 'online').length;
    const stoppedCount = servers.filter(s => s.status === 'stopped').length;
    const crashedCount = servers.filter(s => s.status === 'crashed').length;

    const lines: string[] = [];

    // Always include fleet overview
    lines.push(`Servers: ${servers.length} total (${runningCount} running, ${stoppedCount} stopped${crashedCount > 0 ? `, ${crashedCount} CRASHED` : ''})`);

    if (servers.length > 0) {
        lines.push('Server List:');
        servers.forEach(s => {
            lines.push(`  - [ID:${s.id}] "${s.name}" → ${s.status} | Map: ${s.config?.mapName || 'unknown'} | Port: ${s.ports?.gamePort || '?'}`);
        });
    }

    // System metrics
    if (systemInfo) {
        const ramPct = ((systemInfo.ramUsage / systemInfo.ramTotal) * 100).toFixed(0);
        const diskPct = ((systemInfo.diskUsage / systemInfo.diskTotal) * 100).toFixed(0);
        lines.push(`System: CPU ${systemInfo.cpuUsage.toFixed(0)}% | RAM ${ramPct}% (${(systemInfo.ramUsage / 1024).toFixed(1)}/${(systemInfo.ramTotal / 1024).toFixed(1)} GB) | Disk ${diskPct}%`);
    }

    lines.push(`Current Page: ${route}`);

    return lines.join('\n');
}
