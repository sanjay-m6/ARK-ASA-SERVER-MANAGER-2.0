// AI Watchdog — Proactive background health monitoring
// Runs on an interval, checks for issues, and pushes alerts to the copilot

import { invoke } from '@tauri-apps/api/core';

export interface WatchdogAlert {
    id: string;
    type: 'crash' | 'resource' | 'backup' | 'update' | 'performance';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    timestamp: number;
    dismissed: boolean;
}

interface ServerSnapshot {
    id: number;
    name: string;
    status: string;
}

let previousSnapshot: ServerSnapshot[] = [];
let watchdogInterval: ReturnType<typeof setInterval> | null = null;

// Check for issues and return new alerts
export async function runHealthCheck(): Promise<WatchdogAlert[]> {
    const alerts: WatchdogAlert[] = [];

    try {
        // 1. Check server statuses — detect crashes
        const servers = await invoke<ServerSnapshot[]>('get_all_servers').catch(() => []);
        
        for (const server of servers) {
            const prev = previousSnapshot.find(s => s.id === server.id);
            
            // Crash detection: was running, now stopped/crashed
            if (prev && (prev.status === 'running' || prev.status === 'online') && 
                (server.status === 'stopped' || server.status === 'crashed')) {
                alerts.push({
                    id: `crash_${server.id}_${Date.now()}`,
                    type: 'crash',
                    severity: 'critical',
                    title: `Server "${server.name}" crashed`,
                    message: `Server was running but is now ${server.status}. Check logs for crash details.`,
                    timestamp: Date.now(),
                    dismissed: false,
                });
            }
        }
        
        previousSnapshot = servers;

        // 2. Check system resources
        const sysInfo = await invoke<{
            cpuUsage: number;
            ramUsage: number;
            ramTotal: number;
            diskUsage: number;
            diskTotal: number;
        }>('get_system_info').catch(() => null);

        if (sysInfo) {
            const ramPct = (sysInfo.ramUsage / sysInfo.ramTotal) * 100;
            const diskPct = (sysInfo.diskUsage / sysInfo.diskTotal) * 100;

            if (ramPct > 90) {
                alerts.push({
                    id: `ram_high_${Date.now()}`,
                    type: 'resource',
                    severity: 'critical',
                    title: 'RAM usage critical',
                    message: `RAM is at ${ramPct.toFixed(0)}%. Consider stopping unused servers.`,
                    timestamp: Date.now(),
                    dismissed: false,
                });
            } else if (ramPct > 80) {
                alerts.push({
                    id: `ram_warn_${Date.now()}`,
                    type: 'resource',
                    severity: 'warning',
                    title: 'RAM usage high',
                    message: `RAM is at ${ramPct.toFixed(0)}%. Monitor closely.`,
                    timestamp: Date.now(),
                    dismissed: false,
                });
            }

            if (diskPct > 90) {
                alerts.push({
                    id: `disk_critical_${Date.now()}`,
                    type: 'resource',
                    severity: 'critical',
                    title: 'Disk space critical',
                    message: `Disk is ${diskPct.toFixed(0)}% full. Clean up old backups or logs.`,
                    timestamp: Date.now(),
                    dismissed: false,
                });
            } else if (diskPct > 80) {
                alerts.push({
                    id: `disk_warn_${Date.now()}`,
                    type: 'resource',
                    severity: 'warning',
                    title: 'Disk space low',
                    message: `Disk is ${diskPct.toFixed(0)}% full.`,
                    timestamp: Date.now(),
                    dismissed: false,
                });
            }

            if (sysInfo.cpuUsage > 90) {
                alerts.push({
                    id: `cpu_high_${Date.now()}`,
                    type: 'performance',
                    severity: 'warning',
                    title: 'CPU usage very high',
                    message: `CPU at ${sysInfo.cpuUsage.toFixed(0)}%. Servers may experience lag.`,
                    timestamp: Date.now(),
                    dismissed: false,
                });
            }
        }
    } catch {
        // Silently fail — watchdog should never crash the app
    }

    return alerts;
}

// Start the watchdog with the given callback
export function startWatchdog(onAlert: (alert: WatchdogAlert) => void, intervalMs = 60000): void {
    // Don't start if already running
    if (watchdogInterval) return;

    // Initial snapshot
    invoke<ServerSnapshot[]>('get_all_servers')
        .then(servers => { previousSnapshot = servers; })
        .catch(() => {});

    watchdogInterval = setInterval(async () => {
        // Only run when app is visible
        if (document.visibilityState === 'hidden') return;

        const alerts = await runHealthCheck();
        alerts.forEach(onAlert);
    }, intervalMs);
}

// Stop the watchdog
export function stopWatchdog(): void {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
}
