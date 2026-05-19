-- Auto-Save Management System Database Schema
-- Comprehensive tables for auto-save browsing, restoration, and management

-- Auto-saves table (core auto-save metadata)
CREATE TABLE IF NOT EXISTS auto_saves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    checksum TEXT,
    created_at TIMESTAMP NOT NULL,
    save_timestamp TIMESTAMP,
    is_valid INTEGER DEFAULT 1,
    is_corrupted INTEGER DEFAULT 0,
    corruption_reason TEXT,
    player_count INTEGER,
    uptime_seconds INTEGER,
    server_version TEXT,
    mod_count INTEGER,
    map_name TEXT,
    is_protected INTEGER DEFAULT 0,
    custom_label TEXT,
    notes TEXT,
    is_favorite INTEGER DEFAULT 0,
    folder_id INTEGER REFERENCES save_folders(id),
    created_by TEXT,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    UNIQUE(server_id, file_path)
);

-- Save folder organization
CREATE TABLE IF NOT EXISTS save_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#8B5CF6',
    parent_folder_id INTEGER REFERENCES save_folders(id),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Save restore history (audit log of all restores)
CREATE TABLE IF NOT EXISTS save_restore_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    from_save_id INTEGER,
    to_save_id INTEGER NOT NULL,
    restored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    restored_by TEXT,
    restore_duration_seconds INTEGER,
    restore_method TEXT DEFAULT 'manual', -- manual, automatic, scheduled, emergency
    success INTEGER DEFAULT 1,
    error_message TEXT,
    notes TEXT,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (from_save_id) REFERENCES auto_saves(id),
    FOREIGN KEY (to_save_id) REFERENCES auto_saves(id)
);

-- Backup of saves before restore (for safety)
CREATE TABLE IF NOT EXISTS save_backup_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    restore_history_id INTEGER,
    backup_path TEXT NOT NULL,
    backup_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_valid INTEGER DEFAULT 1,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (restore_history_id) REFERENCES save_restore_history(id)
);

-- Save metadata and detailed info
CREATE TABLE IF NOT EXISTS save_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auto_save_id INTEGER NOT NULL UNIQUE,
    game_mode TEXT,
    difficulty_level TEXT,
    max_players INTEGER,
    current_players_list TEXT, -- JSON array of player names
    mods_list TEXT, -- JSON array of mod details
    server_settings TEXT, -- JSON of important settings
    world_statistics TEXT, -- JSON of world stats
    creatures_count INTEGER,
    structures_count INTEGER,
    items_count INTEGER,
    parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auto_save_id) REFERENCES auto_saves(id) ON DELETE CASCADE
);

-- Save validation status and checks
CREATE TABLE IF NOT EXISTS save_validation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auto_save_id INTEGER NOT NULL,
    check_type TEXT NOT NULL, -- integrity, corruption, completeness, compatibility
    check_status TEXT, -- passed, failed, warning, skipped
    details TEXT, -- JSON with detailed results
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auto_save_id) REFERENCES auto_saves(id) ON DELETE CASCADE
);

-- Scheduled restore points
CREATE TABLE IF NOT EXISTS restore_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    auto_save_id INTEGER NOT NULL,
    point_name TEXT NOT NULL,
    description TEXT,
    point_type TEXT DEFAULT 'manual', -- manual, scheduled, critical, post-crash
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_protected INTEGER DEFAULT 0,
    created_by TEXT,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (auto_save_id) REFERENCES auto_saves(id) ON DELETE CASCADE
);

-- Save comparison cache (for faster comparisons)
CREATE TABLE IF NOT EXISTS save_comparison_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id_1 INTEGER NOT NULL,
    save_id_2 INTEGER NOT NULL,
    comparison_data TEXT, -- JSON with differences
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (save_id_1) REFERENCES auto_saves(id) ON DELETE CASCADE,
    FOREIGN KEY (save_id_2) REFERENCES auto_saves(id) ON DELETE CASCADE,
    UNIQUE(save_id_1, save_id_2)
);

-- Auto-save preferences and settings
CREATE TABLE IF NOT EXISTS autosave_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL UNIQUE,
    auto_index_enabled INTEGER DEFAULT 1,
    auto_validate_enabled INTEGER DEFAULT 1,
    auto_compress_old_saves INTEGER DEFAULT 0,
    compress_after_days INTEGER DEFAULT 30,
    auto_cleanup_enabled INTEGER DEFAULT 1,
    cleanup_after_days INTEGER DEFAULT 90,
    keep_minimum_saves INTEGER DEFAULT 10,
    create_restore_points INTEGER DEFAULT 1,
    restore_point_frequency TEXT DEFAULT 'daily', -- hourly, daily, weekly, manual
    notify_on_restore INTEGER DEFAULT 1,
    notify_on_corruption INTEGER DEFAULT 1,
    index_metadata INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Save timeline events (for visual timeline)
CREATE TABLE IF NOT EXISTS save_timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    event_type TEXT NOT NULL, -- save_created, restored, protected, deleted, validated
    auto_save_id INTEGER,
    restore_history_id INTEGER,
    event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    metadata TEXT, -- JSON with event details
    importance_level TEXT DEFAULT 'normal', -- low, normal, high, critical
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (auto_save_id) REFERENCES auto_saves(id),
    FOREIGN KEY (restore_history_id) REFERENCES save_restore_history(id)
);

-- Compression and archive tracking
CREATE TABLE IF NOT EXISTS save_archives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    archive_path TEXT NOT NULL,
    archive_size INTEGER,
    save_ids TEXT, -- JSON array of archived save IDs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_verified INTEGER DEFAULT 0,
    last_accessed TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Cloud sync status for auto-saves
CREATE TABLE IF NOT EXISTS save_cloud_sync (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auto_save_id INTEGER NOT NULL UNIQUE,
    cloud_path TEXT,
    sync_status TEXT DEFAULT 'pending', -- pending, syncing, synced, failed
    last_sync_at TIMESTAMP,
    sync_error TEXT,
    cloud_version TEXT,
    FOREIGN KEY (auto_save_id) REFERENCES auto_saves(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_auto_saves_server ON auto_saves(server_id);
CREATE INDEX IF NOT EXISTS idx_auto_saves_created ON auto_saves(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_saves_protected ON auto_saves(is_protected);
CREATE INDEX IF NOT EXISTS idx_auto_saves_favorite ON auto_saves(is_favorite);
CREATE INDEX IF NOT EXISTS idx_auto_saves_corrupted ON auto_saves(is_corrupted);
CREATE INDEX IF NOT EXISTS idx_auto_saves_folder ON auto_saves(folder_id);
CREATE INDEX IF NOT EXISTS idx_restore_history_server ON save_restore_history(server_id);
CREATE INDEX IF NOT EXISTS idx_restore_history_to_save ON save_restore_history(to_save_id);
CREATE INDEX IF NOT EXISTS idx_restore_history_date ON save_restore_history(restored_at DESC);
CREATE INDEX IF NOT EXISTS idx_save_metadata_save ON save_metadata(auto_save_id);
CREATE INDEX IF NOT EXISTS idx_save_validation_save ON save_validation_logs(auto_save_id);
CREATE INDEX IF NOT EXISTS idx_restore_points_server ON restore_points(server_id);
CREATE INDEX IF NOT EXISTS idx_restore_points_save ON restore_points(auto_save_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_server ON save_timeline_events(server_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_time ON save_timeline_events(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_save_cloud_sync_status ON save_cloud_sync(sync_status);
