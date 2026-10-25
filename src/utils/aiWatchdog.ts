// AI Watchdog — Proactive background health monitoring
// Runs on an interval, checks for issues, and pushes alerts to the copilot

import { invoke } from '@tauri-apps/api/core';
import i18n from '../i18n';

export interface WatchdogAlert {
    id: string;
    type: 'crash' | 'resource' | 'backup' | 'update' | 'performance';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    timestamp: number;
    dismissed: boolean;
}

// Check for issues and return new alerts
export async function runHealthCheck(): Promise<WatchdogAlert[]> {
    const alerts: WatchdogAlert[] = [];

    try {
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
                    title: i18n.t('aiWatchdog.ramCriticalTitle', 'RAM usage critical'),
                    message: i18n.t('aiWatchdog.ramCritical', { defaultValue: 'RAM is at {{pct}}%. Consider stopping unused servers.', pct: ramPct.toFixed(0) }),
                    timestamp: Date.now(),
                    dismissed: false,
                });
            } else if (ramPct > 80) {
                alerts.push({
                    id: `ram_warn_${Date.now()}`,
                    type: 'resource',
                    severity: 'warning',
                    title: i18n.t('aiWatchdog.ramHighTitle', 'RAM usage high'),
                    message: i18n.t('aiWatchdog.ramHigh', { defaultValue: 'RAM is at {{pct}}%. Monitor closely.', pct: ramPct.toFixed(0) }),
                    timestamp: Date.now(),
                    dismissed: false,
                });
            }

            if (diskPct > 90) {
                alerts.push({
                    id: `disk_critical_${Date.now()}`,
                    type: 'resource',
                    severity: 'critical',
                    title: i18n.t('aiWatchdog.diskCriticalTitle', 'Disk space critical'),
                    message: i18n.t('aiWatchdog.diskCritical', { defaultValue: 'Disk is {{pct}}% full. Clean up old backups or logs.', pct: diskPct.toFixed(0) }),
                    timestamp: Date.now(),
                    dismissed: false,
                });
            } else if (diskPct > 80) {
                alerts.push({
                    id: `disk_warn_${Date.now()}`,
                    type: 'resource',
                    severity: 'warning',
                    title: i18n.t('aiWatchdog.diskLowTitle', 'Disk space low'),
                    message: i18n.t('aiWatchdog.diskLow', { defaultValue: 'Disk is {{pct}}% full.', pct: diskPct.toFixed(0) }),
                    timestamp: Date.now(),
                    dismissed: false,
                });
            }

            if (sysInfo.cpuUsage > 90) {
                alerts.push({
                    id: `cpu_high_${Date.now()}`,
                    type: 'performance',
                    severity: 'warning',
                    title: i18n.t('aiWatchdog.cpuHighTitle', 'CPU usage very high'),
                    message: i18n.t('aiWatchdog.cpuHigh', { defaultValue: 'CPU at {{pct}}%. Servers may experience lag.', pct: sysInfo.cpuUsage.toFixed(0) }),
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

let watchdogInterval: ReturnType<typeof setInterval> | null = null;

// Start the watchdog with the given callback
export function startWatchdog(onAlert: (alert: WatchdogAlert) => void, intervalMs = 60000): void {
    // Don't start if already running
    if (watchdogInterval) return;

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
