import { create } from 'zustand';
import {
    type AiMessage,
    type AiToolCall,
    DEFAULT_MODEL,
    loadChatHistory,
    saveChatHistory,
} from '../utils/aiAgent';

interface AiStore {
    messages: AiMessage[];
    isStreaming: boolean;
    pendingToolCall: (AiToolCall & { messageId: string }) | null;
    model: string;
    streamingContent: string;

    addMessage: (msg: AiMessage) => void;
    updateLastAssistantContent: (content: string) => void;
    clearMessages: () => void;
    setStreaming: (v: boolean) => void;
    setStreamingContent: (v: string) => void;
    appendStreamingContent: (chunk: string) => void;
    setPendingToolCall: (tc: (AiToolCall & { messageId: string }) | null) => void;
    setModel: (model: string) => void;
    loadHistory: () => void;
}

export const useAiStore = create<AiStore>((set) => ({
    messages: [],
    isStreaming: false,
    pendingToolCall: null,
    model: DEFAULT_MODEL,
    streamingContent: '',

    addMessage: (msg) => {
        set((state) => {
            const updated = [...state.messages, msg];
            saveChatHistory(updated);
            return { messages: updated };
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
            saveChatHistory(msgs);
            return { messages: msgs };
        });
    },

    clearMessages: () => {
        saveChatHistory([]);
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
        const messages = loadChatHistory();
        const model = localStorage.getItem('ai_model') || DEFAULT_MODEL;
        set({ messages, model });
    },
}));
