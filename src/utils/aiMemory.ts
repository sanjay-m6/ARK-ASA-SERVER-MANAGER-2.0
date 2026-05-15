// AI Memory System — Persistent user preference storage
// Stores user preferences, facts, and recent context across sessions

const AI_MEMORY_KEY = 'ai_memory';
const MAX_FACTS = 20;

export interface AiMemory {
    preferences: Record<string, string>;
    facts: string[];
    recentServers: string[];
    savedAt: number;
}

function getDefaultMemory(): AiMemory {
    return {
        preferences: {},
        facts: [],
        recentServers: [],
        savedAt: Date.now(),
    };
}

export function loadMemory(): AiMemory {
    try {
        const data = localStorage.getItem(AI_MEMORY_KEY);
        return data ? JSON.parse(data) : getDefaultMemory();
    } catch {
        return getDefaultMemory();
    }
}

export function saveMemory(memory: AiMemory): void {
    memory.savedAt = Date.now();
    memory.facts = memory.facts.slice(-MAX_FACTS);
    try {
        localStorage.setItem(AI_MEMORY_KEY, JSON.stringify(memory));
    } catch { /* quota exceeded */ }
}

export function addFact(fact: string): void {
    const memory = loadMemory();
    // Avoid duplicates
    if (!memory.facts.some(f => f.toLowerCase() === fact.toLowerCase())) {
        memory.facts.push(fact);
        saveMemory(memory);
    }
}

export function setPreference(key: string, value: string): void {
    const memory = loadMemory();
    memory.preferences[key] = value;
    saveMemory(memory);
}

export function trackServer(serverName: string): void {
    const memory = loadMemory();
    memory.recentServers = [serverName, ...memory.recentServers.filter(s => s !== serverName)].slice(0, 5);
    saveMemory(memory);
}

export function clearMemory(): void {
    localStorage.removeItem(AI_MEMORY_KEY);
}

// Format memory as context for the system prompt
export function formatMemoryForPrompt(): string {
    const memory = loadMemory();
    const parts: string[] = [];

    if (Object.keys(memory.preferences).length > 0) {
        parts.push('User Preferences:');
        for (const [k, v] of Object.entries(memory.preferences)) {
            parts.push(`  - ${k}: ${v}`);
        }
    }

    if (memory.facts.length > 0) {
        parts.push('Known Facts About User:');
        memory.facts.forEach(f => parts.push(`  - ${f}`));
    }

    if (memory.recentServers.length > 0) {
        parts.push(`Recently Managed Servers: ${memory.recentServers.join(', ')}`);
    }

    return parts.length > 0 ? '\n\nAI MEMORY (from previous sessions):\n' + parts.join('\n') : '';
}
