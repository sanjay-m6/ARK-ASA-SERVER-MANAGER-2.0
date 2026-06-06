-- ARK Server Manager Database Schema

-- Servers table
CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    server_type TEXT NOT NULL DEFAULT 'ASA' CHECK(server_type IN ('ASA', 'ASE')),
    install_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('stopped', 'starting', 'running', 'online', 'crashed', 'updating', 'restarting', 'stopping', 'startup_timeout')),
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
    auto_start INTEGER DEFAULT 0,
    auto_stop INTEGER DEFAULT 0,
    intelligent_mode INTEGER DEFAULT 0,
    startup_delay INTEGER DEFAULT 0,
    startup_priority INTEGER DEFAULT 100,
    auto_restart INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_started TIMESTAMP,
    battleye INTEGER NOT NULL DEFAULT 1,
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
    server_type TEXT NOT NULL DEFAULT 'ASA' CHECK(server_type IN ('ASA', 'ASE')),
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
    label TEXT,
    notes TEXT,
    is_protected INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed',
    hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
);

-- Backup policies table
CREATE TABLE IF NOT EXISTS backup_policies (
    server_id INTEGER PRIMARY KEY,
    enabled BOOLEAN DEFAULT 0,
    interval_hours INTEGER DEFAULT 24,
    retention_days INTEGER DEFAULT 7,
    retention_count INTEGER DEFAULT 10,
    storage_quota_gb REAL DEFAULT 50.0,
    backup_before_update BOOLEAN DEFAULT 1,
    backup_before_restart BOOLEAN DEFAULT 1,
    compression_enabled BOOLEAN DEFAULT 1,
    cloud_sync_enabled BOOLEAN DEFAULT 0,
    discord_webhook TEXT,
    FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
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

-- Cluster settings table (key-value store for cluster-level settings)
CREATE TABLE IF NOT EXISTS cluster_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES clusters (id) ON DELETE CASCADE,
    UNIQUE(cluster_id, key)
);

-- Discord bridge configuration per cluster
CREATE TABLE IF NOT EXISTS discord_bridge_config (
    cluster_id INTEGER PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    bot_token TEXT,
    guild_id TEXT,
    channel_id TEXT,
    game_to_discord INTEGER DEFAULT 1,
    discord_to_game INTEGER DEFAULT 1,
    server_list_enabled INTEGER DEFAULT 0,
    server_list_channel_id TEXT,
    server_list_message_id TEXT,
    player_list_enabled INTEGER DEFAULT 0,
    player_list_channel_id TEXT,
    player_list_message_id TEXT,
    show_tribe_names INTEGER DEFAULT 1,
    show_playtime INTEGER DEFAULT 1,
    admin_channel_id TEXT DEFAULT '',
    notifications_channel_id TEXT DEFAULT '',
    notify_player_join_leave INTEGER DEFAULT 1,
    notify_server_crashes INTEGER DEFAULT 1,
    notify_server_recovery INTEGER DEFAULT 1,
    notify_scheduled_restarts INTEGER DEFAULT 1,
    notify_backup_completion INTEGER DEFAULT 1,
    notify_performance_alerts INTEGER DEFAULT 1,
    notify_mod_watchdog INTEGER DEFAULT 1,
    notify_anti_cheat INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE CASCADE
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
    is_banned INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0
);

-- Scheduled tasks table
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    task_name TEXT,
    task_type TEXT NOT NULL CHECK(task_type IN ('restart', 'backup', 'rcon-command', 'announcement', 'save-world', 'destroy-wild-dinos', 'AutoUpdateMods')),
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

-- Anti-Cheat Configuration
CREATE TABLE IF NOT EXISTS anti_cheat_config (
    server_id INTEGER PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    sensitivity REAL DEFAULT 1.0,
    log_only INTEGER DEFAULT 1,
    kick_enabled INTEGER DEFAULT 0,
    ban_enabled INTEGER DEFAULT 0,
    discord_alert INTEGER DEFAULT 0,
    rules_json TEXT, -- detailed rule override
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Anti-Cheat Violation Logs
CREATE TABLE IF NOT EXISTS anti_cheat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    steam_id TEXT NOT NULL,
    violation_type TEXT NOT NULL,
    severity REAL NOT NULL, -- 0.0 to 1.0+
    details TEXT,
    action_taken TEXT, -- "Logged", "Discord Alert", "Kicked"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);


-- Scheduler Settings (Basic vs Advanced Mode)
CREATE TABLE IF NOT EXISTS scheduler_settings (
    server_id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL DEFAULT 'disabled', -- 'basic', 'advanced', 'disabled'
    basic_interval_hours INTEGER DEFAULT 24,
    basic_warning_minutes TEXT DEFAULT '30,15,10,5,1',
    next_run_basic TIMESTAMP,
    advanced_time TEXT,
    advanced_days TEXT,
    advanced_warning_minutes TEXT,
    advanced_shutdown INTEGER DEFAULT 0,
    advanced_update INTEGER DEFAULT 0,
    advanced_restart INTEGER DEFAULT 0,
    advanced_dino_wipe INTEGER DEFAULT 0,
    FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Discord Users mapping
CREATE TABLE IF NOT EXISTS discord_users (
    discord_id TEXT PRIMARY KEY,
    steam_id TEXT NOT NULL UNIQUE,
    discord_username TEXT NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(steam_id) REFERENCES player_stats(steam_id) ON DELETE CASCADE
);

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT,
    steam_id TEXT,
    issue_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Hardware Allocation (CPU Affinity & Priority)
CREATE TABLE IF NOT EXISTS hardware_allocation (
    server_id INTEGER PRIMARY KEY,
    use_all_cores INTEGER DEFAULT 1,
    cpu_affinity TEXT, -- JSON array of logical core indices
    process_priority TEXT DEFAULT 'Normal', -- 'Normal', 'AboveNormal', 'High', 'RealTime', 'BelowNormal', 'Idle'
    FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Add points to player_stats (migration will handle if missing, but for new schemas)
-- SQLite requires ALTER TABLE for existing, but for fresh installs:
-- In db/mod.rs we will run the ALTER TABLE script for migrations.

-- Initial settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('startup_timeout', '1800');
INSERT OR IGNORE INTO settings (key, value) VALUES ('global_auto_start_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('global_boot_delay', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('start_minimized_to_tray', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('silent_headless_startup', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('windows_startup_shortcut', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('loop_prevention_max_crashes', '3');
INSERT OR IGNORE INTO settings (key, value) VALUES ('loop_prevention_time_window_mins', '15');

-- Persistent Discord sent messages (echo-prevention across restarts)
CREATE TABLE IF NOT EXISTS discord_sent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id INTEGER NOT NULL,
    message_hash TEXT NOT NULL,
    excerpt TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discord_sent_messages_hash ON discord_sent_messages(message_hash);
CREATE INDEX IF NOT EXISTS idx_discord_sent_messages_created_at ON discord_sent_messages(created_at);

-- Discord rate limit configuration per cluster
CREATE TABLE IF NOT EXISTS discord_rate_limits (
    cluster_id INTEGER PRIMARY KEY,
    max_messages_per_window INTEGER DEFAULT 5,
    window_seconds INTEGER DEFAULT 10,
    enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discord_rate_limits_cluster ON discord_rate_limits(cluster_id);

-- ASE module tables
CREATE TABLE IF NOT EXISTS ase_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    install_path TEXT NOT NULL DEFAULT '',
    map_name TEXT NOT NULL DEFAULT 'TheIsland',
    port INTEGER NOT NULL DEFAULT 7777,
    query_port INTEGER NOT NULL DEFAULT 27015,
    rcon_port INTEGER NOT NULL DEFAULT 27020,
    rcon_password TEXT NOT NULL DEFAULT '',
    max_players INTEGER NOT NULL DEFAULT 70,
    server_password TEXT NOT NULL DEFAULT '',
    admin_password TEXT NOT NULL DEFAULT '',
    session_name TEXT NOT NULL DEFAULT 'ARK Server',
    active_mods TEXT NOT NULL DEFAULT '',
    cluster_id TEXT NOT NULL DEFAULT '',
    battleye INTEGER NOT NULL DEFAULT 1,
    extra_args TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'stopped',
    process_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    auto_start INTEGER NOT NULL DEFAULT 0,
    auto_stop INTEGER NOT NULL DEFAULT 0,
    intelligent_mode INTEGER NOT NULL DEFAULT 0,
    startup_delay INTEGER NOT NULL DEFAULT 0,
    startup_priority INTEGER NOT NULL DEFAULT 100,
    branch TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS ase_mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    workshop_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Unknown Mod',
    version TEXT NOT NULL DEFAULT '1.0',
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    enabled INTEGER NOT NULL DEFAULT 1,
    load_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    author TEXT,
    preview_url TEXT,
    subscribers TEXT,
    file_size TEXT,
    time_updated TEXT,
    time_created TEXT,
    tags TEXT,
    FOREIGN KEY(server_id) REFERENCES ase_servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ase_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(server_id) REFERENCES ase_servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ase_scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'restart',
    cron_expr TEXT NOT NULL DEFAULT '0 */6 * * *',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run TEXT,
    FOREIGN KEY(server_id) REFERENCES ase_servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ase_clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cluster_dir TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ase_cluster_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id INTEGER NOT NULL,
    server_id INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES ase_clusters (id) ON DELETE CASCADE,
    FOREIGN KEY (server_id) REFERENCES ase_servers (id) ON DELETE CASCADE,
    UNIQUE(cluster_id, server_id)
);

CREATE TABLE IF NOT EXISTS ase_cluster_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES ase_clusters (id) ON DELETE CASCADE,
    UNIQUE(cluster_id, key)
);

CREATE INDEX IF NOT EXISTS idx_ase_mods_server_id ON ase_mods(server_id);
CREATE INDEX IF NOT EXISTS idx_ase_backups_server_id ON ase_backups(server_id);
CREATE INDEX IF NOT EXISTS idx_ase_servers_status ON ase_servers(status);
CREATE INDEX IF NOT EXISTS idx_ase_cluster_servers_cluster ON ase_cluster_servers(cluster_id);
CREATE INDEX IF NOT EXISTS idx_ase_cluster_servers_server ON ase_cluster_servers(server_id);


-- ASE Discord bridge configuration per cluster
CREATE TABLE IF NOT EXISTS ase_discord_bridge_config (
    cluster_id INTEGER PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    bot_token TEXT,
    guild_id TEXT,
    channel_id TEXT,
    game_to_discord INTEGER DEFAULT 1,
    discord_to_game INTEGER DEFAULT 1,
    server_list_enabled INTEGER DEFAULT 0,
    server_list_channel_id TEXT,
    server_list_message_id TEXT,
    player_list_enabled INTEGER DEFAULT 0,
    player_list_channel_id TEXT,
    player_list_message_id TEXT,
    show_tribe_names INTEGER DEFAULT 1,
    show_playtime INTEGER DEFAULT 1,
    admin_channel_id TEXT DEFAULT '',
    notifications_channel_id TEXT DEFAULT '',
    notify_player_join_leave INTEGER DEFAULT 1,
    notify_server_crashes INTEGER DEFAULT 1,
    notify_server_recovery INTEGER DEFAULT 1,
    notify_scheduled_restarts INTEGER DEFAULT 1,
    notify_backup_completion INTEGER DEFAULT 1,
    notify_performance_alerts INTEGER DEFAULT 1,
    notify_mod_watchdog INTEGER DEFAULT 1,
    notify_anti_cheat INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES ase_clusters(id) ON DELETE CASCADE
);

-- ASE Discord rate limit configuration per cluster
CREATE TABLE IF NOT EXISTS ase_discord_rate_limits (
    cluster_id INTEGER PRIMARY KEY,
    max_messages_per_window INTEGER DEFAULT 5,
    window_seconds INTEGER DEFAULT 10,
    enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES ase_clusters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ase_discord_rate_limits_cluster ON ase_discord_rate_limits(cluster_id);

CREATE TABLE IF NOT EXISTS ase_discord_sent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id INTEGER NOT NULL,
    message_hash TEXT NOT NULL,
    excerpt TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cluster_id) REFERENCES ase_clusters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ase_discord_sent_messages_hash ON ase_discord_sent_messages(message_hash);
CREATE INDEX IF NOT EXISTS idx_ase_discord_sent_messages_created_at ON ase_discord_sent_messages(created_at);
