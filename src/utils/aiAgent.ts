// AI Agent utilities — tool definitions, system prompt, tool execution
import { invoke } from '@tauri-apps/api/core';
import { formatMemoryForPrompt } from './aiMemory';

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
${formatMemoryForPrompt()}

You have full access to the ASM application through tool functions. Use them proactively when relevant.

When performing multi-step tasks, chain multiple tool calls in sequence. After each tool result, decide if another tool call is needed to complete the user's request. Do not stop after a single tool call if the task requires more steps.`;
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

    // ── Config Engine Tools ────────────────────────────────────────────

    read_ini_config: {
        name: 'read_ini_config',
        label: 'Read INI Config',
        description: 'Reads the contents of a server INI configuration file',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('read_config', {
                serverId: Number(args.server_id),
                configType: (args.config_type as string) || 'GameUserSettings',
            });
        },
    },
    save_ini_config: {
        name: 'save_ini_config',
        label: 'Save INI Config',
        description: 'Writes content to a server INI configuration file',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('save_config', {
                serverId: Number(args.server_id),
                configType: (args.config_type as string) || 'GameUserSettings',
                content: args.content as string,
            });
        },
    },
    load_server_config: {
        name: 'load_server_config',
        label: 'Load Server Config',
        description: 'Loads the full parsed server configuration with all multipliers and settings',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('load_server_config', {
                serverId: Number(args.server_id),
            });
        },
    },
    backup_ini_config: {
        name: 'backup_ini_config',
        label: 'Backup INI Config',
        description: 'Creates a timestamped backup of a config file before making changes',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('backup_config', {
                serverId: Number(args.server_id),
                configType: (args.config_type as string) || 'GameUserSettings',
            });
        },
    },

    // ── Backup Management Tools ────────────────────────────────────────

    list_backups: {
        name: 'list_backups',
        label: 'List Backups',
        description: 'Lists all backups for a server',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('get_backups', {
                serverId: Number(args.server_id),
            });
        },
    },
    restore_backup: {
        name: 'restore_backup',
        label: 'Restore Backup',
        description: 'Restores a server from a backup by backup ID',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('restore_backup', {
                backupId: Number(args.backup_id),
            });
        },
    },
    delete_backup: {
        name: 'delete_backup',
        label: 'Delete Backup',
        description: 'Deletes a specific backup by its ID',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('delete_backup', {
                backupId: Number(args.backup_id),
            });
        },
    },
    cleanup_old_backups: {
        name: 'cleanup_old_backups',
        label: 'Cleanup Old Backups',
        description: 'Removes old backups keeping only the most recent N backups',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('cleanup_old_backups', {
                serverId: Number(args.server_id),
                keepCount: Number(args.keep_count) || 5,
            });
        },
    },

    // ── Player Management Tools ────────────────────────────────────────

    list_players: {
        name: 'list_players',
        label: 'List Online Players',
        description: 'Lists all currently online players on a server via RCON',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('rcon_send_command', {
                serverId: Number(args.server_id),
                command: 'ListPlayers',
            });
        },
    },
    kick_player: {
        name: 'kick_player',
        label: 'Kick Player',
        description: 'Kicks a player from the server by their Steam ID or name',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('rcon_send_command', {
                serverId: Number(args.server_id),
                command: `KickPlayer ${args.player_id}`,
            });
        },
    },
    ban_player: {
        name: 'ban_player',
        label: 'Ban Player',
        description: 'Bans a player from the server by their Steam ID',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('rcon_send_command', {
                serverId: Number(args.server_id),
                command: `BanPlayer ${args.player_id}`,
            });
        },
    },

    // ── Scheduler Tools ────────────────────────────────────────────────

    create_scheduled_task: {
        name: 'create_scheduled_task',
        label: 'Create Scheduled Task',
        description: 'Creates a new scheduled task (backup, restart, update, or RCON command)',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('create_scheduled_task', {
                task: args,
            });
        },
    },
    delete_scheduled_task: {
        name: 'delete_scheduled_task',
        label: 'Delete Scheduled Task',
        description: 'Deletes a scheduled task by its ID',
        requiresConfirmation: true,
        execute: async (args) => {
            return await invoke('delete_scheduled_task', {
                taskId: Number(args.task_id),
            });
        },
    },

    // ── Navigation Tool ───────────────────────────────────────────────

    navigate_to_page: {
        name: 'navigate_to_page',
        label: 'Navigate to Page',
        description: 'Navigates the user to a specific page in the application',
        requiresConfirmation: false,
        execute: async (args) => {
            // This is handled specially in the frontend — the router navigates
            return { navigateTo: args.path as string, success: true };
        },
    },

    // ── Mod Manager Tools ─────────────────────────────────────────────

    search_mods: {
        name: 'search_mods',
        label: 'Search Mods',
        description: 'Searches for ARK mods on Steam Workshop or CurseForge',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('search_mods', {
                query: args.query as string,
                source: (args.source as string) || 'curseforge',
            });
        },
    },
    get_installed_mods: {
        name: 'get_installed_mods',
        label: 'Get Installed Mods',
        description: 'Gets the list of mods installed on a server',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('get_server_mods', {
                serverId: Number(args.server_id),
            });
        },
    },
    save_world: {
        name: 'save_world',
        label: 'Save World',
        description: 'Saves the current world state via RCON SaveWorld command',
        requiresConfirmation: false,
        execute: async (args) => {
            return await invoke('rcon_send_command', {
                serverId: Number(args.server_id),
                command: 'SaveWorld',
            });
        },
    },
};

// Maximum tool turns for agentic loop
export const MAX_TOOL_TURNS = 5;

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
