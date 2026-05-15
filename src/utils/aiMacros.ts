// AI Command Macros — Pre-defined and user-saveable multi-step workflows

const CUSTOM_MACROS_KEY = 'ai_custom_macros';

export interface AiMacro {
    id: string;
    name: string;
    icon: string;
    description: string;
    prompt: string;
    isBuiltIn: boolean;
}

// Built-in macros that ship with the application
export const BUILT_IN_MACROS: AiMacro[] = [
    {
        id: 'health_report',
        name: 'Health Report',
        icon: '📊',
        description: 'Full fleet health check with system resources',
        prompt: 'Run a complete health report: check all server statuses, get system resource usage (CPU, RAM, disk), and provide a summary of the fleet health with any recommendations.',
        isBuiltIn: true,
    },
    {
        id: 'morning_routine',
        name: 'Morning Routine',
        icon: '🌅',
        description: 'Backup all servers, check for updates',
        prompt: 'Execute my morning routine: First, check all server statuses. Then create a backup for each running server. Finally, check if any server updates are available and report the summary.',
        isBuiltIn: true,
    },
    {
        id: 'lockdown',
        name: 'Lockdown',
        icon: '🔒',
        description: 'Save all worlds and stop all servers',
        prompt: 'Execute emergency lockdown: First broadcast a shutdown warning "Server shutting down in 1 minute" to all running servers. Then create a backup of each running server. Finally stop all running servers. Report each step.',
        isBuiltIn: true,
    },
    {
        id: 'event_mode',
        name: 'Event Mode',
        icon: '🎮',
        description: 'Boost rates for a special event',
        prompt: 'Help me set up event mode: What server should I boost? I want to double XP, taming speed, and harvest rates for a limited-time event. Show me the current rates first, then suggest the boosted values.',
        isBuiltIn: true,
    },
    {
        id: 'cleanup',
        name: 'Cleanup',
        icon: '🧹',
        description: 'Clean old backups and check disk space',
        prompt: 'Run a cleanup operation: Check current disk usage, then list all backups for each server. Recommend which old backups can be safely deleted to free space. Show me how much space we could recover.',
        isBuiltIn: true,
    },
    {
        id: 'crash_investigation',
        name: 'Crash Investigation',
        icon: '🔍',
        description: 'Analyze recent crashes and log anomalies',
        prompt: 'Investigate recent server issues: Analyze crash logs, check server status, review system resources, and identify any patterns or root causes. Provide a diagnostic report with recommended fixes.',
        isBuiltIn: true,
    },
];

// Load user's custom macros
export function loadCustomMacros(): AiMacro[] {
    try {
        const data = localStorage.getItem(CUSTOM_MACROS_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// Save a custom macro
export function saveCustomMacro(macro: AiMacro): void {
    const macros = loadCustomMacros();
    const existing = macros.findIndex(m => m.id === macro.id);
    if (existing >= 0) {
        macros[existing] = macro;
    } else {
        macros.push(macro);
    }
    localStorage.setItem(CUSTOM_MACROS_KEY, JSON.stringify(macros));
}

// Delete a custom macro
export function deleteCustomMacro(id: string): void {
    const macros = loadCustomMacros().filter(m => m.id !== id);
    localStorage.setItem(CUSTOM_MACROS_KEY, JSON.stringify(macros));
}

// Get all macros (built-in + custom)
export function getAllMacros(): AiMacro[] {
    return [...BUILT_IN_MACROS, ...loadCustomMacros()];
}
