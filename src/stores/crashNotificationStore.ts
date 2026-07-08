import { create } from 'zustand';
import { useAiStore } from './aiStore';
import { sendAiMessage, generateMessageId } from '../utils/aiAgent';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';

interface CachedAnomaly {
    anomalyType: string;
    details: string;
    timestamp: number;
}

const latestLogAnomalies = new Map<number, CachedAnomaly>();

function errorTypeToFriendlyName(type: string): string | null {
    if (type === 'CFCore_NoMachineId') return 'CurseForge Machine ID Missing';
    if (type === 'CFCore_LibraryLoadFailed') return 'CurseForge Library Load Failed';
    if (type === 'CFCore_ModLoadFailed') return 'Mod Installation Failed';
    if (type === 'Fatal Error') return 'Fatal Error';
    if (type === 'Crash') return 'Crash Anomaly';
    if (type === 'Exception') return 'Exception Warning';
    return null;
}

// Severity types
export type NotificationSeverity = 'info' | 'warning' | 'critical';

// AI Analysis States
export type AnalysisStatus = 'Pending' | 'Queued' | 'Analyzing' | 'Generating Fix' | 'Completed' | 'Resolved' | 'Archived';

// Diagnosis Interface
export interface CrashDiagnosis {
    rootCause: string;
    confidenceScore: number;
    recommendedFix: string;
}

// Notification Interface
export interface CrashNotification {
    id: string;
    serverId: number;
    serverName: string;
    crashReason: string;
    exceptionType: string;
    stackTrace: string;
    executableName: string;
    crashHash: string;
    timestamp: number;
    lastSeen: number;
    status: AnalysisStatus;
    occurrences: number;
    severity: NotificationSeverity;
    diagnosis: CrashDiagnosis | null;
    dismissed: boolean;
}

// Simple Mutex for thread-safety / concurrent execution lock in JS
class Mutex {
    private promise: Promise<void> = Promise.resolve();

    async lock(): Promise<() => void> {
        let resolve: () => void;
        const nextPromise = new Promise<void>((res) => {
            resolve = res;
        });
        const currentPromise = this.promise;
        this.promise = nextPromise;
        await currentPromise;
        return () => { resolve(); };
    }
}

const storeMutex = new Mutex();

interface CrashNotificationStore {
    activeNotifications: CrashNotification[];
    archive: CrashNotification[];
    isArchiveOpen: boolean;

    setArchiveOpen: (open: boolean) => void;
    handleCrashEvent: (event: {
        serverId: number;
        serverName?: string;
        anomalyType: string; // e.g. Crash Reason
        details: string; // Log lines or exception trace
    }) => Promise<void>;
    resolveNotification: (id: string) => void;
    dismissNotification: (id: string) => void;
    clearArchive: () => void;
}

// Helper to generate a unique crash signature hash
function generateCrashSignature(
    serverId: number,
    crashReason: string,
    exceptionType: string,
    stackTrace: string,
    executableName: string
): string {
    const raw = `${serverId}|${crashReason}|${exceptionType}|${stackTrace.trim()}|${executableName}`;
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
        hash = (hash * 33) ^ raw.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

// Helper to parse log details and extract exception details
function parseLogDetails(details: string, anomalyType: string) {
    let executableName = 'ShooterGame.exe';
    const exeMatch = details.match(/([a-zA-Z0-9_\-]+\.exe)/i);
    if (exeMatch) {
        executableName = exeMatch[1];
    }

    let exceptionType = anomalyType || 'Crash';
    const exceptionMatch = details.match(/(access violation|assertion failed|exception|fatal error)/i);
    if (exceptionMatch) {
        exceptionType = exceptionMatch[1].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    let stackTrace = details;
    return { executableName, exceptionType, stackTrace };
}

// Keep track of active timers for memory management and closing notifications
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

// AI Queue processor to execute AI analysis sequentially
let isProcessingQueue = false;
const aiAnalysisQueue: string[] = [];

async function processAiQueue(store: ReturnType<typeof useCrashNotificationStore.getState>) {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (aiAnalysisQueue.length > 0) {
        const notifId = aiAnalysisQueue.shift();
        if (!notifId) continue;

        const notif = store.activeNotifications.find(n => n.id === notifId);
        if (!notif || notif.status !== 'Pending') continue;

        // Transition to Queued
        console.log(`🤖 AI Co-Pilot: Queued crash analysis for notification ${notifId}`);
        updateNotificationStatus(notifId, 'Queued');

        // Transition to Analyzing
        console.log(`🤖 AI Co-Pilot: Analyzing crash logs for notification ${notifId}`);
        updateNotificationStatus(notifId, 'Analyzing');

        // Transition to Generating Fix
        console.log(`🤖 AI Co-Pilot: Generating fix for notification ${notifId}`);
        updateNotificationStatus(notifId, 'Generating Fix');

        try {
            const prompt = `You are a crash diagnosis agent. Analyze the following crash report for Server "${notif.serverName}" and provide a diagnosis:
Executable: ${notif.executableName}
Crash Reason: ${notif.crashReason}
Exception: ${notif.exceptionType}
Log Details / Stack Trace:
\`\`\`
${notif.stackTrace}
\`\`\`

You MUST respond strictly in the following JSON format:
{
  "rootCause": "Direct root cause explanation",
  "confidenceScore": 85,
  "recommendedFix": "Step-by-step recommendation on how to resolve the crash"
}`;

            const response = await sendAiMessage([
                { role: 'system', content: 'You are an AI Co-Pilot crash assistant. Provide highly accurate diagnoses in JSON format.' },
                { role: 'user', content: prompt }
            ], 'gemini-2.5-flash');

            let diagnosis: CrashDiagnosis = {
                rootCause: 'Failed to pinpoint root cause.',
                confidenceScore: 50,
                recommendedFix: 'Restart the server and check the logs.'
            };

            if (response && response.content) {
                try {
                    const jsonMatch = response.content.match(/\{[\s\S]*?\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        diagnosis = {
                            rootCause: parsed.rootCause || diagnosis.rootCause,
                            confidenceScore: Number(parsed.confidenceScore) || diagnosis.confidenceScore,
                            recommendedFix: parsed.recommendedFix || diagnosis.recommendedFix
                        };
                    }
                } catch (e) {
                    console.error('Failed to parse AI JSON response:', e);
                }
            }

            // Save completed diagnosis
            console.log(`🤖 AI Co-Pilot: Analysis completed for notification ${notifId}`);
            updateNotificationDiagnosis(notifId, diagnosis);

            // Add completed analysis to Global AI Assistant history
            const aiStore = useAiStore.getState();
            aiStore.addMessage({
                id: generateMessageId(),
                role: 'assistant',
                content: `🚨 **[Automated Diagnosis: ${notif.serverName}]**\n\n**Root Cause:** ${diagnosis.rootCause}\n**Confidence Score:** ${diagnosis.confidenceScore}%\n**Recommended Fix:** ${diagnosis.recommendedFix}\n\n*Crash Signature:* \`${notif.crashHash}\``,
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('AI Crash analysis failed:', error);
            updateNotificationStatus(notifId, 'Completed');
        }
    }

    isProcessingQueue = false;
}

function updateNotificationStatus(id: string, status: AnalysisStatus) {
    useCrashNotificationStore.setState((s) => ({
        activeNotifications: s.activeNotifications.map(n => n.id === id ? { ...n, status } : n)
    }));
}

function updateNotificationDiagnosis(id: string, diagnosis: CrashDiagnosis) {
    useCrashNotificationStore.setState((s) => ({
        activeNotifications: s.activeNotifications.map(n => n.id === id ? { ...n, diagnosis, status: 'Completed' } : n)
    }));
}

export const useCrashNotificationStore = create<CrashNotificationStore>((set, get) => ({
    activeNotifications: [],
    archive: [],
    isArchiveOpen: false,

    setArchiveOpen: (open) => set({ isArchiveOpen: open }),

    handleCrashEvent: async (event) => {
        // Acquire lock for thread safety
        const release = await storeMutex.lock();
        console.log('🤖 AI Co-Pilot: Processing incoming crash event');

        try {
            const { serverId, anomalyType, details } = event;
            let serverName = event.serverName;

            // Fetch server name if not provided
            if (!serverName) {
                try {
                    const servers = await invoke<{ id: number, name: string }[]>('get_all_servers').catch(() => []);
                    const s = servers.find(srv => srv.id === serverId);
                    serverName = s ? s.name : `Server ${serverId}`;
                } catch {
                    serverName = `Server ${serverId}`;
                }
            }

            const now = Date.now();

            // Check current server status
            let currentStatus = 'stopped';
            try {
                const servers = await invoke<{ id: number, status: string }[]>('get_all_servers').catch(() => []);
                const s = servers.find(srv => srv.id === serverId);
                if (s) {
                    currentStatus = s.status;
                }
            } catch {
                currentStatus = 'stopped';
            }

            const isActive = ['starting', 'running', 'online', 'updating', 'restarting', 'stopping'].includes(currentStatus);

            if (anomalyType !== 'Status watchdog' && anomalyType !== 'Watchdog Anomaly') {
                // This is a log-based anomaly or mod load failure from the log watcher
                // Store it in the cache for future crash diagnostics
                latestLogAnomalies.set(serverId, {
                    anomalyType,
                    details,
                    timestamp: now,
                });

                if (isActive) {
                    console.log(`🤖 AI Co-Pilot: Server ${serverId} is active (${currentStatus}). Caching log anomaly but skipping crash notification.`);
                    
                    // Show a non-intrusive toast warning instead of a critical crash card
                    // Only show toast warnings for actual CurseForge mod loading errors (CFCore_*)
                    if (anomalyType.startsWith('CFCore_')) {
                        const friendlyName = errorTypeToFriendlyName(anomalyType);
                        if (friendlyName) {
                            toast(`⚠️ [${serverName}] Mod Warning: ${friendlyName}. The server is still running, but some mods may fail to load.`, {
                                duration: 8000,
                                id: `mod_warning_${serverId}_${anomalyType}`
                            });
                        }
                    }
                    return;
                }
            }

            // If we are handling a status watchdog crash check if we have a recent log anomaly to use
            let finalAnomalyType = anomalyType;
            let finalDetails = details;

            if (anomalyType === 'Status watchdog' || anomalyType === 'Watchdog Anomaly') {
                const cached = latestLogAnomalies.get(serverId);
                if (cached && (now - cached.timestamp < 45000)) {
                    console.log(`🤖 AI Co-Pilot: Found cached log anomaly '${cached.anomalyType}' within 45s window. Using it for crash diagnosis.`);
                    finalAnomalyType = cached.anomalyType;
                    finalDetails = cached.details;
                    latestLogAnomalies.delete(serverId);
                }
            }

            // Normalize and clean stack trace details (strip timestamps, memory addresses, thread/process IDs)
            const cleanTrace = (trace: string): string => {
                let cleaned = trace.replace(/\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]/g, '');
                cleaned = cleaned.replace(/\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/g, '');
                cleaned = cleaned.replace(/0x[0-9a-fA-F]+/g, '');
                cleaned = cleaned.replace(/\[\s*\]/g, '');
                cleaned = cleaned.replace(/\b(PID|Thread|Process|thread|pid)\s*[:=]?\s*\d+\b/gi, '');
                return cleaned.trim();
            };

            const cleanedDetails = cleanTrace(finalDetails);
            const { executableName, exceptionType, stackTrace } = parseLogDetails(cleanedDetails, finalAnomalyType);
            const crashHash = generateCrashSignature(serverId, finalAnomalyType, exceptionType, stackTrace, executableName);

            const windowLimit = now - 60000; // 60s deduplication window

            // Check if there is an active crash notification for the SAME server within the window
            const existingNotifIndex = get().activeNotifications.findIndex(n => 
                n.serverId === serverId && 
                n.lastSeen > windowLimit
            );

            if (existingNotifIndex !== -1) {
                // Duplicate or related crash event detected on the same server
                console.log('🤖 AI Co-Pilot: Duplicate/Related Crash Detected. Updating Existing Notification');
                const existing = get().activeNotifications[existingNotifIndex];
                
                // If the new event has detailed stack trace logs but the existing one is a generic watchdog alert, enrich it!
                const isIncomingDetailed = finalAnomalyType !== 'Status watchdog' && finalAnomalyType !== 'Watchdog Anomaly';
                const isExistingGeneric = existing.crashReason === 'Status watchdog' || existing.crashReason === 'Watchdog Anomaly';
                const hasMoreDetails = isIncomingDetailed && (isExistingGeneric || stackTrace.length > existing.stackTrace.length);

                const updated = [...get().activeNotifications];
                updated[existingNotifIndex] = {
                    ...existing,
                    occurrences: existing.occurrences + 1,
                    lastSeen: now,
                    // Enrich details if incoming has more info
                    crashReason: hasMoreDetails ? finalAnomalyType : existing.crashReason,
                    exceptionType: hasMoreDetails ? exceptionType : existing.exceptionType,
                    stackTrace: hasMoreDetails ? stackTrace : existing.stackTrace,
                    executableName: hasMoreDetails ? executableName : existing.executableName,
                    crashHash: hasMoreDetails ? crashHash : existing.crashHash,
                };

                console.log(`🤖 AI Co-Pilot: Occurrence Count Increased to ${existing.occurrences + 1}. Last Seen Updated.`);
                set({ activeNotifications: updated });

                // If we just enriched a generic card with detailed logs, re-trigger AI analysis on the new details
                if (hasMoreDetails && (existing.status === 'Pending' || existing.status === 'Completed' || existing.status === 'Queued')) {
                    console.log('🤖 AI Co-Pilot: Enriched generic card with logs. Triggering/updating AI analysis.');
                    updateNotificationStatus(existing.id, 'Pending');
                    if (!aiAnalysisQueue.includes(existing.id)) {
                        aiAnalysisQueue.push(existing.id);
                    }
                    processAiQueue(get());
                } else {
                    console.log('🤖 AI Co-Pilot: Analysis Already Running or diagnosis complete. Skipping duplicate trigger.');
                }
                return;
            }

            // Otherwise, it's a new unique crash event!
            console.log('🤖 AI Co-Pilot: New Crash Event Detected. Creating Notification.');

            const id = `crash_${serverId}_${now}`;
            const severity: NotificationSeverity = 'critical';

            const newNotif: CrashNotification = {
                id,
                serverId,
                serverName,
                crashReason: finalAnomalyType,
                exceptionType,
                stackTrace,
                executableName,
                crashHash,
                timestamp: now,
                lastSeen: now,
                status: 'Pending',
                occurrences: 1,
                severity,
                diagnosis: null,
                dismissed: false,
            };

            // Check for predefined diagnoses to display immediately with 100% confidence
            let predefinedDiagnosis: CrashDiagnosis | null = null;
            if (finalAnomalyType === 'CFCore_NoMachineId') {
                predefinedDiagnosis = {
                    rootCause: 'CFCore Mod Launcher is missing a registered Machine ID. This typically occurs when the manager is run without administrator privileges.',
                    confidenceScore: 100,
                    recommendedFix: '1. Close the server.\n2. Exit the Server Manager.\n3. Right-click the Server Manager icon and select "Run as Administrator" to allow CFCore to register the ID on startup.'
                };
            } else if (finalAnomalyType === 'CFCore_LibraryLoadFailed') {
                predefinedDiagnosis = {
                    rootCause: 'The CurseForge mod loading library (CFCore) failed to load from the disk.',
                    confidenceScore: 100,
                    recommendedFix: '1. Open the ARK game client and accept the CurseForge Terms & Conditions in the Mod List menu.\n2. In the Server Manager, clear the mod cache via Server Actions -> Clear Mod Cache, then restart the server.'
                };
            } else if (finalAnomalyType === 'CFCore_ModLoadFailed') {
                predefinedDiagnosis = {
                    rootCause: 'CurseForge failed to download or install one or more active mods.',
                    confidenceScore: 95,
                    recommendedFix: '1. Navigate to Server Actions -> Clear Mod Cache.\n2. Verify that all mod IDs in your active list are valid and currently available on CurseForge.\n3. Restart the server to let it re-download all mods.'
                };
            }

            if (predefinedDiagnosis) {
                newNotif.status = 'Completed';
                newNotif.diagnosis = predefinedDiagnosis;

                // Add to active notifications
                const active = [newNotif, ...get().activeNotifications].slice(0, 5);
                set({ activeNotifications: active });

                // Also push message to Global AI Assistant history
                const aiStore = useAiStore.getState();
                aiStore.addMessage({
                    id: generateMessageId(),
                    role: 'assistant',
                    content: `🚨 **[Automated Diagnosis: ${newNotif.serverName}]**\n\n**Root Cause:** ${predefinedDiagnosis.rootCause}\n**Confidence Score:** ${predefinedDiagnosis.confidenceScore}%\n**Recommended Fix:** ${predefinedDiagnosis.recommendedFix}\n\n*Crash Signature:* \`${newNotif.crashHash}\``,
                    timestamp: now
                });
            } else {
                // Queue AI analysis for the new crash
                aiAnalysisQueue.push(id);

                // Add notification at the top of the stack (maximum 5 visible)
                const active = [newNotif, ...get().activeNotifications].slice(0, 5);
                set({ activeNotifications: active });

                // Trigger AI Queue Processor
                processAiQueue(get());
            }

        } finally {
            // Release lock
            release();
        }
    },

    resolveNotification: (id) => {
        // Find notification
        const notif = get().activeNotifications.find(n => n.id === id);
        if (!notif) return;

        console.log(`🤖 AI Co-Pilot: Notification Resolved for ${id}`);

        // Dispose timers for this notification
        if (activeTimers.has(id)) {
            clearTimeout(activeTimers.get(id));
            activeTimers.delete(id);
        }

        // Archive it
        const archivedNotif: CrashNotification = {
            ...notif,
            status: 'Resolved',
        };

        set(state => ({
            activeNotifications: state.activeNotifications.filter(n => n.id !== id),
            archive: [archivedNotif, ...state.archive]
        }));
    },

    dismissNotification: (id) => {
        // Dispose timers for this notification
        if (activeTimers.has(id)) {
            clearTimeout(activeTimers.get(id));
            activeTimers.delete(id);
        }

        set(state => {
            const notif = state.activeNotifications.find(n => n.id === id);
            const active = state.activeNotifications.filter(n => n.id !== id);
            const archive = notif ? [{ ...notif, status: 'Archived' as const }, ...state.archive] : state.archive;
            return { activeNotifications: active, archive };
        });
    },

    clearArchive: () => {
        set({ archive: [] });
    }
}));
