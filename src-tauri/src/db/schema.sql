-- ARK Server Manager Database Schema

-- Servers table
CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    server_type TEXT NOT NULL DEFAULT 'ASA' CHECK(server_type IN ('ASA')),
    install_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('stopped', 'starting', 'running', 'crashed', 'updating', 'restarting')),
    game_port INTEGER NOT NULL,
    query_port INTEGER NOT NULL,
    rcon_port INTEGER NOT NULL,
    max_players INTEGER DEFAULT 70,
    server_password TEXT,
    admin_password TEXT NOT NULL,
    map_name TEXT NOT NULL,
    session_name TEXT NOT NULL,
    motd TEXT,
    mods TEXT,
    custom_args TEXT,
    rcon_enabled INTEGER DEFAULT 1,
    ip_address TEXT,
    cluster_id INTEGER REFERENCES clusters(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_started TIMESTAMP,
    UNIQUE(name)
);

-- Migration for existing databases: add missing columns if they don't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a workaround

-- Mods table
CREATE TABLE IF NOT EXISTS mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    mod_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT,
    author TEXT,
    description TEXT,
    workshop_url TEXT,
    server_type TEXT NOT NULL DEFAULT 'ASA' CHECK(server_type IN ('ASA')),
    enabled BOOLEAN DEFAULT 1,
    load_order INTEGER NOT NULL,
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
    UNIQUE(server_id, mod_id)
);

-- Backups table
CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    backup_type TEXT NOT NULL CHECK(backup_type IN ('auto', 'manual', 'pre-update', 'pre-restart')),
    file_path TEXT NOT NULL,
    size INTEGER NOT NULL,
    includes_configs BOOLEAN DEFAULT 1,
    includes_mods BOOLEAN DEFAULT 1,
    includes_saves BOOLEAN DEFAULT 1,
    includes_cluster BOOLEAN DEFAULT 0,
    verified BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
);

-- Clusters table
CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    cluster_path TEXT NOT NULL,
    server_ids TEXT NOT NULL, -- JSON array of server IDs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cluster-Server relationship table
CREATE TABLE IF NOT EXISTS cluster_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id INTEGER NOT NULL,
    server_id INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES clusters (id) ON DELETE CASCADE,
    FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
    UNIQUE(cluster_id, server_id)
);

-- Player sessions table (tracks join/leave events)
CREATE TABLE IF NOT EXISTS player_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    steam_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
);

-- Player stats table (aggregated player data)
CREATE TABLE IF NOT EXISTS player_stats (
    steam_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_playtime_minutes INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    notes TEXT,
    is_whitelisted INTEGER DEFAULT 0,
    is_banned INTEGER DEFAULT 0
);

-- Scheduled tasks table
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    task_type TEXT NOT NULL CHECK(task_type IN ('restart', 'backup', 'rcon-command', 'announcement', 'save-world', 'destroy-wild-dinos')),
    cron_expression TEXT NOT NULL,
    command TEXT,
    message TEXT,
    pre_warning_minutes INTEGER DEFAULT 5,
    enabled INTEGER DEFAULT 1,
    last_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mods_server_id ON mods(server_id);
CREATE INDEX IF NOT EXISTS idx_backups_server_id ON backups(server_id);
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_cluster_servers_cluster ON cluster_servers(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_servers_server ON cluster_servers(server_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_server ON player_sessions(server_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_steam ON player_sessions(steam_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_last_seen ON player_stats(last_seen);
