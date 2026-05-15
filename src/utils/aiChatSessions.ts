// AI Chat Sessions — Multi-conversation persistence engine
// Manages multiple named chat conversations with auto-titling

const SESSIONS_INDEX_KEY = 'ai_chat_sessions';
const SESSION_PREFIX = 'ai_chat_session_';
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 100;

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    preview: string; // First user message or summary
    pinned: boolean;
}

export interface ChatSessionFull extends ChatSession {
    messages: import('../utils/aiAgent').AiMessage[];
}

// ── Index Management ───────────────────────────────────────────────────

function loadIndex(): ChatSession[] {
    try {
        const data = localStorage.getItem(SESSIONS_INDEX_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveIndex(sessions: ChatSession[]): void {
    try {
        localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
    } catch { /* quota exceeded */ }
}

// ── Public API ─────────────────────────────────────────────────────────

/** Get all sessions sorted by most recent first */
export function getAllSessions(): ChatSession[] {
    return loadIndex().sort((a, b) => {
        // Pinned first, then by updatedAt
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
    });
}

/** Create a new empty session and return its ID */
export function createSession(title = 'New Chat'): string {
    const id = crypto.randomUUID();
    const session: ChatSession = {
        id,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        preview: '',
        pinned: false,
    };
    const index = loadIndex();
    index.unshift(session);
    saveIndex(index);
    // Store empty messages
    localStorage.setItem(SESSION_PREFIX + id, JSON.stringify([]));
    return id;
}

/** Load a full session with messages */
export function loadSession(id: string): ChatSessionFull | null {
    const index = loadIndex();
    const meta = index.find(s => s.id === id);
    if (!meta) return null;

    try {
        const data = localStorage.getItem(SESSION_PREFIX + id);
        const messages = data ? JSON.parse(data) : [];
        return { ...meta, messages };
    } catch {
        return { ...meta, messages: [] };
    }
}

/** Save messages to a session (updates index metadata too) */
export function saveSessionMessages(id: string, messages: import('../utils/aiAgent').AiMessage[]): void {
    const trimmed = messages.slice(-MAX_MESSAGES_PER_SESSION);

    try {
        localStorage.setItem(SESSION_PREFIX + id, JSON.stringify(trimmed));
    } catch { /* quota */ }

    // Update index metadata
    const index = loadIndex();
    const meta = index.find(s => s.id === id);
    if (meta) {
        meta.updatedAt = Date.now();
        meta.messageCount = trimmed.length;

        // Auto-title from first user message if still default
        if (meta.title === 'New Chat' && trimmed.length > 0) {
            const firstUser = trimmed.find(m => m.role === 'user');
            if (firstUser) {
                meta.title = firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '...' : '');
                meta.preview = firstUser.content.slice(0, 120);
            }
        }

        // Update preview with latest user message
        const lastUser = [...trimmed].reverse().find(m => m.role === 'user');
        if (lastUser) {
            meta.preview = lastUser.content.slice(0, 120);
        }

        saveIndex(index);
    }
}

/** Rename a session */
export function renameSession(id: string, title: string): void {
    const index = loadIndex();
    const meta = index.find(s => s.id === id);
    if (meta) {
        meta.title = title;
        saveIndex(index);
    }
}

/** Pin/unpin a session */
export function togglePinSession(id: string): void {
    const index = loadIndex();
    const meta = index.find(s => s.id === id);
    if (meta) {
        meta.pinned = !meta.pinned;
        saveIndex(index);
    }
}

/** Delete a session */
export function deleteSession(id: string): void {
    const index = loadIndex().filter(s => s.id !== id);
    saveIndex(index);
    localStorage.removeItem(SESSION_PREFIX + id);
}

/** Delete all sessions */
export function deleteAllSessions(): void {
    const index = loadIndex();
    for (const s of index) {
        localStorage.removeItem(SESSION_PREFIX + s.id);
    }
    saveIndex([]);
}

/** Get the most recent session ID (or null if none) */
export function getLastSessionId(): string | null {
    const sessions = getAllSessions();
    return sessions.length > 0 ? sessions[0].id : null;
}

/** Migrate old single-chat history to new session system */
export function migrateOldHistory(): string | null {
    const OLD_KEY = 'ai_chat_history';
    const oldData = localStorage.getItem(OLD_KEY);
    if (!oldData) return null;

    try {
        const messages = JSON.parse(oldData);
        if (!Array.isArray(messages) || messages.length === 0) return null;

        // Create a session from old history
        const id = createSession('Migrated Chat');
        saveSessionMessages(id, messages);

        // Remove old key
        localStorage.removeItem(OLD_KEY);
        return id;
    } catch {
        return null;
    }
}

// ── Time Formatting ────────────────────────────────────────────────────

export function formatSessionTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}
