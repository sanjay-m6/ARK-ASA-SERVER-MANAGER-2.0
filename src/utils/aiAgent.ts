// AI Agent utilities — tool definitions, system prompt, tool execution
import { invoke } from '@tauri-apps/api/core';

// ── Types ──────────────────────────────────────────────────────────────

export interface AiMessage {
    id: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: AiToolCall[];
    toolCallId?: string;
    timestamp: number;
}

export interface AiToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface AiResponse {
    content: string | null;
    tool_calls: AiToolCall[];
    finish_reason: string | null;
}

export interface ToolDefinition {
    name: string;
    label: string;
    description: string;
    requiresConfirmation: boolean;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ── Available Models ───────────────────────────────────────────────────

export const AI_MODELS = [
    { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'Fast & powerful' },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', description: 'Deep reasoning' },
    { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1', description: 'Strong reasoning' },
    { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', name: 'Nemotron Ultra 253B', description: 'Enterprise-grade' },
] as const;

export const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';

// ── System Prompt ──────────────────────────────────────────────────────

export function buildSystemPrompt(serverContext?: string): string {
    return `You are Infinity ASM AI Assistant.

You are a highly advanced AI assistant integrated directly inside the Ark ASA Server Manager application.

Your primary purpose is to assist users with:
- ARK Survival Ascended server management
- ASM application automation
- Server configuration
- INI file generation and optimization
- Mod configuration
- Cluster management
- Map intelligence (Svartalfheim, Amissa, Insaluna, Temptress Lagoon, Reverence, Astraeos, Forglar, Club ARK)
- Performance optimization
- Crash troubleshooting
- Server diagnostics
- Backup management
- Update management
- RCON automation
- Steam Workshop management
- Game settings explanation
- ARK gameplay mechanics
- Dino balancing
- Spawn configuration
- Player management
- AI automation inside the ASM application

You ONLY respond to topics related to:
- ARK Survival Ascended
- ARK server hosting
- ASM application features
- Server files
- GameUserSettings.ini
- Game.ini
- Engine.ini
- Mods
- Plugins
- Server performance
- Server automation
- AI-assisted server management
- Application controls
- Backup systems
- Cluster systems
- ARK gameplay systems
- ARK creatures
- Bosses
- Engrams
- Breeding
- Taming
- Progression
- PvE/PvP balancing

You must NEVER answer unrelated topics.

If the user asks unrelated questions:
- Politely redirect them back to ARK ASA or ASM-related topics.

Core Behavior:
- Behave like a premium enterprise AI assistant.
- Always provide professional technical responses.
- Automatically analyze server issues.
- Generate optimized configuration files.
- Explain server settings clearly.
- Recommend best practices.
- Detect invalid configurations.
- Suggest performance improvements.
- Help automate repetitive server tasks.
- Use intelligent reasoning.
- Prioritize server stability and uptime.
- Provide safe automation guidance.
- Explain changes before applying critical actions.
- Generate clean and production-ready configurations.

INI Configuration Intelligence:
You specialize in:
- Game.ini creation
- GameUserSettings.ini optimization
- Engine.ini tuning
- PvE balancing
- PvP balancing
- XP balancing
- Breeding settings
- Harvest multipliers
- Taming multipliers
- Spawn configuration
- Loot crate balancing
- Difficulty scaling
- Performance optimization
- Mod compatibility
- Cross-server clusters
- Anti-lag optimization
- Memory optimization
- CPU optimization
- Tick rate optimization

Automation Features:
You can assist with:
- Automatic backups
- Scheduled restarts
- Auto updates
- Crash recovery
- Auto mod updates
- Server monitoring
- AI diagnostics
- Performance alerts
- Smart optimization
- Real-time server analysis
- Automatic cleanup tasks
- Log analysis
- Automated notifications
- AI-generated maintenance plans

Application Access:
You have access to:
- ASM Capabilities:
- View and control ARK servers (start, stop, restart)
- Install and setup new ARK servers automatically
- Monitor system health (CPU, RAM, disk)
- Create server backups
- Read server logs
- Execute RCON commands
- Broadcast messages to players
- View scheduled tasks
- Trigger server updates

Response Style:
- Be highly technical and accurate.
- Use structured formatting.
- Generate clean code blocks.
- Explain important settings.
- Keep responses optimized and readable.
- Suggest improvements automatically.
- Focus on practical implementation.
- Behave like a professional server engineer.

When generating INI configurations:
- STRICT RULE: GameUserSettings.ini must use [ServerSettings] for general settings, and [/Script/ShooterGame.ShooterGameUserSettings] for graphics/session settings.
- STRICT RULE: Game.ini must use [/script/shootergame.shootergamemode] for game modes, multipliers, engrams, and level configurations.
- STRICT RULE: Use proper capitalization for booleans (True/False).
- STRICT RULE: Float values must be represented with a decimal point (e.g., 1.000000).
- STRICT RULE: Do not use quotes around string values unless explicitly required by a specific ARK property.
- Use optimized production-ready values.
- Include comments when necessary.
- Avoid unsafe settings.
- Ensure compatibility with ASA (Ark Survival Ascended).
- Prioritize performance and stability.

When troubleshooting:
- Analyze logs carefully.
- Identify root causes.
- Suggest step-by-step fixes.
- Recommend prevention methods.

When handling automation:
- Think like an autonomous AI system.
- Recommend the safest automation flow.
- Optimize server uptime.
- Reduce manual administration.

Goal:
Create the ultimate AI-powered ARK ASA server management experience with intelligent automation, professional server engineering, and advanced ASM integration.

${serverContext ? `\nCurrent Application Context:\n${serverContext}` : ''}

You have full access to the ASM application through tool functions. Use them proactively when relevant.`;
}

// ── Tool Registry ──────────────────────────────────────────────────────

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
    get_server_status: {
        name: 'get_server_status',
        label: 'Get Server Status',
        description: 'Fetches the status of all managed servers',
        requiresConfirmation: false,
        execute: async () => {
            return await invoke('get_all_servers');
        },
    },
    install_server: {
        name: 'install_server',
        label: 'Setup New Server',
        description: 'Installs and configures a new ARK server instance',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('install_server', {
                installPath: args.install_path as string || 'C:\\ARKServers\\AIServer',
                name: args.name as string || 'AI Managed Server',
                mapName: args.map_name as string || 'TheIsland_WP',
                gamePort: Number(args.game_port) || 7777,
                queryPort: Number(args.query_port) || 27015,
                rconPort: Number(args.rcon_port) || 27020,
            });
        },
    },
    start_server: {
        name: 'start_server',
        label: 'Start Server',
        description: 'Starts an ARK server',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('start_server', {
                serverId: args.server_id as number,
                skipModCheck: false,
            });
        },
    },
    stop_server: {
        name: 'stop_server',
        label: 'Stop Server',
        description: 'Stops a running ARK server',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('stop_server', {
                serverId: args.server_id as number,
            });
        },
    },
    restart_server: {
        name: 'restart_server',
        label: 'Restart Server',
        description: 'Restarts an ARK server',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('restart_server', {
                serverId: args.server_id as number,
            });
        },
    },
    create_backup: {
        name: 'create_backup',
        label: 'Create Backup',
        description: 'Creates a backup of server save data',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('create_backup', {
                serverId: args.server_id as number,
            });
        },
    },
    get_system_info: {
        name: 'get_system_info',
        label: 'System Info',
        description: 'Gets current system resource usage',
        requiresConfirmation: false,
        execute: async () => {
            return await invoke('get_system_info');
        },
    },
    get_server_logs: {
        name: 'get_server_logs',
        label: 'Server Logs',
        description: 'Gets recent server log entries',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('get_server_logs', {
                serverId: args.server_id as number,
            });
        },
    },
    rcon_command: {
        name: 'rcon_command',
        label: 'RCON Command',
        description: 'Executes an RCON command on the server',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('rcon_send_command', {
                serverId: args.server_id as number,
                command: args.command as string,
            });
        },
    },
    broadcast_message: {
        name: 'broadcast_message',
        label: 'Broadcast Message',
        description: 'Broadcasts a message to all players',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('rcon_broadcast', {
                serverId: args.server_id as number,
                message: args.message as string,
            });
        },
    },
    get_scheduled_tasks: {
        name: 'get_scheduled_tasks',
        label: 'Scheduled Tasks',
        description: 'Gets all configured scheduled tasks',
        requiresConfirmation: false,
        execute: async () => {
            return await invoke('get_scheduled_tasks');
        },
    },
    update_server: {
        name: 'update_server',
        label: 'Update Server',
        description: 'Updates an ARK server via SteamCMD',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('update_server', {
                serverId: args.server_id as number,
            });
        },
    },
    analyze_crash_log: {
        name: 'analyze_crash_log',
        label: 'Analyze Crash Logs',
        description: 'Fetches recent crash events and log anomalies to diagnose server instability',
        requiresConfirmation: false,
        execute: async () => {
            return await invoke('get_crash_log');
        },
    },
};

// ── Tool Execution ─────────────────────────────────────────────────────

export async function executeToolCall(
    toolCall: AiToolCall
): Promise<{ success: boolean; result: string }> {
    const tool = TOOL_REGISTRY[toolCall.name];
    if (!tool) {
        return {
            success: false,
            result: `Unknown tool: ${toolCall.name}`,
        };
    }

    try {
        const args = JSON.parse(toolCall.arguments || '{}');
        const result = await tool.execute(args);
        return {
            success: true,
            result: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        };
    } catch (err) {
        return {
            success: false,
            result: err instanceof Error ? err.message : String(err),
        };
    }
}

// ── AI API Call (via Rust backend) ─────────────────────────────────────

export async function sendAiMessage(
    messages: { role: string; content: string }[],
    model: string
): Promise<AiResponse> {
    return await invoke<AiResponse>('ai_chat', { messages, model });
}

// ── Chat History Persistence ───────────────────────────────────────────

const CHAT_HISTORY_KEY = 'ai_chat_history';
const MAX_HISTORY = 100;

export function loadChatHistory(): AiMessage[] {
    try {
        const data = localStorage.getItem(CHAT_HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

export function saveChatHistory(messages: AiMessage[]): void {
    const trimmed = messages.slice(-MAX_HISTORY);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
}

export function clearChatHistory(): void {
    localStorage.removeItem(CHAT_HISTORY_KEY);
}

// ── Helpers ────────────────────────────────────────────────────────────

export function generateMessageId(): string {
    return crypto.randomUUID();
}
