# 🤖 AI Assistant Page

The AI Assistant (Infinity AI) is an agentic, multi-session management platform designed to help users troubleshoot, monitor, and control their ARK servers using natural language.

## 📝 Component Overview
- **File Path**: `src/pages/AIAssistant.tsx`
- **Engine**: Custom LLM orchestration layer with tool-calling capabilities (`src/utils/aiAgent.ts`).
- **Features**: Chat History, Persistent Memory, Real-time Tool Execution, Thinking/Reasoning visualization.

## 🚀 Key Features

### 1. Multi-Session Chat History
- **Isolation**: Each chat session is isolated, allowing users to manage multiple servers or troubleshooting threads simultaneously.
- **Persistence**: Sessions are saved to a local SQLite database and can be renamed, pinned, or deleted.
- **Context Management**: The assistant maintains context within a session but starts fresh for new chats.

### 2. Real-time Tool Execution (Agentic)
Infinity AI can perform actions on behalf of the user by calling local "Tools":
- **Execution Flow**: User asks -> AI reasons -> AI calls Tool -> Tool executes (with visual progress) -> AI reports result.
- **Visual Progress**: Each tool execution is displayed as a card with real-time status steps (e.g., "Connecting RCON", "Fetching list").
- **Safety**: Sensitive tools (like `delete_server` or `wipe_world`) require manual user confirmation via a banner before execution.

### 3. Log Anomaly Detection Integration
- **Direct Bridge**: When the Dashboard detects an error in the logs, it can pass that context directly to the AI Assistant.
- **Automated Root Cause Analysis**: The assistant can scan logs to identify exactly which mod or configuration is causing a server crash.

### 4. Persistent AI Memory
- **Learned Facts**: The AI remembers specific details about your setup (e.g., "My main server is on Port 7777").
- **Preferences**: Remembers user preferences for server management styles (e.g., "Always verify Steam files before updating").

## 🛠️ Tool Registry (Partial List)
The assistant has access to over 30+ specialized tools, including:
- `start_server`, `stop_server`, `update_server`
- `read_ini_config`, `save_ini_config`
- `list_players`, `kick_player`, `broadcast_message`
- `create_backup`, `restore_backup`
- `analyze_crash_log`

## 🎨 UI/UX Patterns
- **Thinking Indicators**: A "Reasoning" bubble shows the AI's thought process using neural-network animations while it's processing.
- **Typewriter Effect**: Responses are revealed word-by-word for a more natural, interactive feel.
- **Markdown Support**: Rich formatting for tables, code blocks, and highlighted warnings.
