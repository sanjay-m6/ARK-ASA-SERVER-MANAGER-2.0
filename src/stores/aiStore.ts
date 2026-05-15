import { create } from 'zustand';
import {
    type AiMessage,
    type AiToolCall,
    DEFAULT_MODEL,
} from '../utils/aiAgent';
import {
    type ChatSession,
    getAllSessions,
    createSession,
    loadSession,
    saveSessionMessages,
    deleteSession,
    renameSession,
    togglePinSession,
    getLastSessionId,
    migrateOldHistory,
} from '../utils/aiChatSessions';

interface AiStore {
    // Current session
    activeSessionId: string | null;
    messages: AiMessage[];
    sessions: ChatSession[];

    // UI state
    isStreaming: boolean;
    pendingToolCall: (AiToolCall & { messageId: string }) | null;
    model: string;
    streamingContent: string;
    sidebarOpen: boolean;

    // Actions — Messages
    addMessage: (msg: AiMessage) => void;
    updateLastAssistantContent: (content: string) => void;
    clearMessages: () => void;
    setStreaming: (v: boolean) => void;
    setStreamingContent: (v: string) => void;
    appendStreamingContent: (chunk: string) => void;
    setPendingToolCall: (tc: (AiToolCall & { messageId: string }) | null) => void;
    setModel: (model: string) => void;
    loadHistory: () => void;

    // Actions — Sessions
    createNewChat: () => void;
    switchSession: (id: string) => void;
    deleteChat: (id: string) => void;
    renameChat: (id: string, title: string) => void;
    pinChat: (id: string) => void;
    refreshSessions: () => void;
    toggleSidebar: () => void;
}

export const useAiStore = create<AiStore>((set, get) => ({
    activeSessionId: null,
    messages: [],
    sessions: [],
    isStreaming: false,
    pendingToolCall: null,
    model: DEFAULT_MODEL,
    streamingContent: '',
    sidebarOpen: false,

    addMessage: (msg) => {
        set((state) => {
            const updated = [...state.messages, msg];
            // Save to active session
            if (state.activeSessionId) {
                saveSessionMessages(state.activeSessionId, updated);
            }
            return { messages: updated, sessions: getAllSessions() };
        });
    },

    updateLastAssistantContent: (content) => {
        set((state) => {
            const msgs = [...state.messages];
            for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === 'assistant') {
                    msgs[i] = { ...msgs[i], content };
                    break;
                }
            }
            if (state.activeSessionId) {
                saveSessionMessages(state.activeSessionId, msgs);
            }
            return { messages: msgs };
        });
    },

    clearMessages: () => {
        const { activeSessionId } = get();
        if (activeSessionId) {
            saveSessionMessages(activeSessionId, []);
        }
        set({ messages: [], streamingContent: '' });
    },

    setStreaming: (v) => set({ isStreaming: v }),
    setStreamingContent: (v) => set({ streamingContent: v }),
    appendStreamingContent: (chunk) => set((state) => ({
        streamingContent: state.streamingContent + chunk,
    })),

    setPendingToolCall: (tc) => set({ pendingToolCall: tc }),

    setModel: (model) => {
        localStorage.setItem('ai_model', model);
        set({ model });
    },

    loadHistory: () => {
        // Migrate old single-chat history if present
        const migratedId = migrateOldHistory();

        const model = localStorage.getItem('ai_model') || DEFAULT_MODEL;

        // Determine which session to load
        let sessionId = migratedId || getLastSessionId();

        // If no sessions exist, create a fresh one
        if (!sessionId) {
            sessionId = createSession('New Chat');
        }

        const session = loadSession(sessionId);

        set({
            activeSessionId: sessionId,
            messages: session?.messages || [],
            sessions: getAllSessions(),
            model,
        });
    },

    // ── Session Management ─────────────────────────────────

    createNewChat: () => {
        const id = createSession('New Chat');
        set({
            activeSessionId: id,
            messages: [],
            streamingContent: '',
            pendingToolCall: null,
            sessions: getAllSessions(),
        });
    },

    switchSession: (id) => {
        const session = loadSession(id);
        if (session) {
            set({
                activeSessionId: id,
                messages: session.messages,
                streamingContent: '',
                pendingToolCall: null,
            });
        }
    },

    deleteChat: (id) => {
        const { activeSessionId } = get();
        deleteSession(id);
        const sessions = getAllSessions();

        // If we deleted the active session, switch to most recent or create new
        if (id === activeSessionId) {
            if (sessions.length > 0) {
                const session = loadSession(sessions[0].id);
                set({
                    activeSessionId: sessions[0].id,
                    messages: session?.messages || [],
                    sessions,
                    streamingContent: '',
                    pendingToolCall: null,
                });
            } else {
                const newId = createSession('New Chat');
                set({
                    activeSessionId: newId,
                    messages: [],
                    sessions: getAllSessions(),
                    streamingContent: '',
                    pendingToolCall: null,
                });
            }
        } else {
            set({ sessions });
        }
    },

    renameChat: (id, title) => {
        renameSession(id, title);
        set({ sessions: getAllSessions() });
    },

    pinChat: (id) => {
        togglePinSession(id);
        set({ sessions: getAllSessions() });
    },

    refreshSessions: () => {
        set({ sessions: getAllSessions() });
    },

    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
