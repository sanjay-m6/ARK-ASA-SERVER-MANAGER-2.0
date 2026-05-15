import { create } from 'zustand';
import type { AiMessage, AiToolCall } from '../utils/aiAgent';
import type { WatchdogAlert } from '../utils/aiWatchdog';

const COPILOT_HISTORY_KEY = 'copilot_history';
const MAX_COPILOT_MESSAGES = 30;
const MAX_ALERTS = 20;

interface CopilotStore {
    isOpen: boolean;
    messages: AiMessage[];
    isStreaming: boolean;
    streamingContent: string;
    pendingToolCall: (AiToolCall & { messageId: string }) | null;
    currentRoute: string;
    alertCount: number;
    alerts: WatchdogAlert[];

    toggle: () => void;
    open: () => void;
    close: () => void;
    setRoute: (route: string) => void;
    addMessage: (msg: AiMessage) => void;
    clearMessages: () => void;
    setStreaming: (v: boolean) => void;
    setStreamingContent: (v: string) => void;
    appendStreamingContent: (chunk: string) => void;
    setPendingToolCall: (tc: (AiToolCall & { messageId: string }) | null) => void;
    addAlert: () => void;
    clearAlerts: () => void;
    addAlertMessage: (alert: WatchdogAlert) => void;
    dismissAlert: (id: string) => void;
    loadHistory: () => void;
}

function saveHistory(messages: AiMessage[]): void {
    try {
        const trimmed = messages.slice(-MAX_COPILOT_MESSAGES);
        localStorage.setItem(COPILOT_HISTORY_KEY, JSON.stringify(trimmed));
    } catch { /* quota exceeded — silently drop */ }
}

function loadHistoryFromStorage(): AiMessage[] {
    try {
        const data = localStorage.getItem(COPILOT_HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

export const useCopilotStore = create<CopilotStore>((set) => ({
    isOpen: false,
    messages: [],
    isStreaming: false,
    streamingContent: '',
    pendingToolCall: null,
    currentRoute: '/dashboard',
    alertCount: 0,
    alerts: [],

    toggle: () => set((s) => {
        if (!s.isOpen) return { isOpen: true, alertCount: 0 };
        return { isOpen: false };
    }),
    open: () => set({ isOpen: true, alertCount: 0 }),
    close: () => set({ isOpen: false }),

    setRoute: (route) => set({ currentRoute: route }),

    addMessage: (msg) => set((state) => {
        const updated = [...state.messages, msg].slice(-MAX_COPILOT_MESSAGES);
        saveHistory(updated);
        return { messages: updated };
    }),

    clearMessages: () => {
        saveHistory([]);
        set({ messages: [], streamingContent: '' });
    },

    setStreaming: (v) => set({ isStreaming: v }),
    setStreamingContent: (v) => set({ streamingContent: v }),
    appendStreamingContent: (chunk) => set((s) => ({
        streamingContent: s.streamingContent + chunk,
    })),

    setPendingToolCall: (tc) => set({ pendingToolCall: tc }),

    addAlert: () => set((s) => ({ alertCount: s.alertCount + 1 })),
    clearAlerts: () => set({ alertCount: 0, alerts: [] }),

    addAlertMessage: (alert) => set((s) => {
        // Avoid duplicate alerts within 5 minutes
        const fiveMinAgo = Date.now() - 300000;
        const isDuplicate = s.alerts.some(a => a.type === alert.type && a.timestamp > fiveMinAgo);
        if (isDuplicate) return {};
        const updated = [...s.alerts, alert].slice(-MAX_ALERTS);
        return { alerts: updated, alertCount: s.alertCount + 1 };
    }),

    dismissAlert: (id) => set((s) => ({
        alerts: s.alerts.map(a => a.id === id ? { ...a, dismissed: true } : a),
    })),

    loadHistory: () => {
        const messages = loadHistoryFromStorage();
        set({ messages });
    },
}));
