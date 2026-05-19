# Server Organization Database Schema Documentation

## Overview

This document describes the database tables and relationships for the Advanced Server Organization System.

## Tables

### server_folders
Hierarchical folder structure for organizing servers.

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY | Unique folder identifier |
| `name` | TEXT | NOT NULL | Folder display name |
| `description` | TEXT | | Optional folder description |
| `color` | TEXT | DEFAULT '#8B5CF6' | Hex color for folder icon |
| `icon` | TEXT | | Optional icon identifier |
| `parent_folder_id` | INTEGER | FK → server_folders | Parent folder (hierarchical) |
| `sort_order` | INTEGER | DEFAULT 0 | Display order |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Indexes:**
- `idx_server_folders_parent` - Fast parent lookups

**Example:**
```sql
INSERT INTO server_folders (name, color, parent_folder_id)
VALUES ('Production Cluster', '#10B981', NULL);
```

---

### server_folder_members
Maps servers to folders (many-to-many relationship).

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY | Unique relationship ID |
| `server_id` | INTEGER | FK → servers | Server being organized |
| `folder_id` | INTEGER | FK → server_folders | Target folder |
| `added_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When added to folder |

**Indexes:**
- `idx_server_folder_members_server` - Find folders for a server
- `idx_server_folder_members_folder` - Find servers in a folder
- UNIQUE(server_id, folder_id) - Prevent duplicates

**Example:**
```sql
INSERT INTO server_folder_members (server_id, folder_id)
VALUES (1, 5);
```

---

### server_archive
Tracks archived/inactive servers.

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY | Unique archive entry |
| `server_id` | INTEGER | FK → servers UNIQUE | Server being archived |
| `archived_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Archive timestamp |
| `archive_reason` | TEXT | | Why server was archived |
| `archived_by` | TEXT | | Username of archiver |
| `notes` | TEXT | | Additional notes |

**Indexes:**
- `idx_server_archive_server` - Lookup if archived
- `idx_server_archive_date` - Find recently archived

**Queries:**
```sql
-- Check if server is archived
SELECT id FROM server_archive WHERE server_id = ?;

-- Get archived servers with reasons
SELECT * FROM server_archive ORDER BY archived_at DESC;

-- Restore server
DELETE FROM server_archive WHERE server_id = ?;
```

---

### server_customization
Per-server customization settings.

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `server_id` | INTEGER | PK, FK → servers | Server being customized |
| `display_name` | TEXT | | Custom display name |
| `custom_icon` | TEXT | | Custom icon path |
| `custom_banner` | TEXT | | Custom banner image URL |
| `color_tag` | TEXT | | Hex color for tagging |
| `is_pinned` | INTEGER | DEFAULT 0 | Pinned to top? (bool) |
| `pin_order` | INTEGER | DEFAULT 0 | Pin position order |
| `is_minimized` | INTEGER | DEFAULT 0 | Collapsed view? (bool) |
| `tags` | TEXT | | JSON array of tags |
| `favorite` | INTEGER | DEFAULT 0 | Marked as favorite? (bool) |
| `notes` | TEXT | | Server notes/comments |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last modification |

**Indexes:**
- `idx_server_customization_pinned` - Find pinned servers

**Example:**
```sql
INSERT INTO server_customization 
  (server_id, display_name, color_tag, is_pinned, tags, favorite)
VALUES (1, 'Prod-Alpha', '#FF6B6B', 1, '["production","cluster-1"]', 1);

-- Get customization
SELECT * FROM server_customization WHERE server_id = 1;
```

---

### dashboard_layouts
User dashboard layout configurations.

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY | Layout ID |
| `user_id` | TEXT | NOT NULL | User identifier |
| `name` | TEXT | NOT NULL | Layout name |
| `description` | TEXT | | Optional description |
| `layout_type` | TEXT | DEFAULT 'grid' | 'grid', 'list', 'compact', 'custom' |
| `view_mode` | TEXT | DEFAULT 'expanded' | 'expanded', 'compact', 'minimized' |
| `is_default` | INTEGER | DEFAULT 0 | Default layout? (bool) |
| `sections` | TEXT | DEFAULT '[]' | JSON array of sections |
| `filters` | TEXT | DEFAULT '{}' | JSON filter object |
| `sort_by` | TEXT | DEFAULT 'name' | Sort field |
| `sort_order` | TEXT | DEFAULT 'asc' | 'asc' or 'desc' |
| `show_inactive` | INTEGER | DEFAULT 0 | Show inactive servers? |
| `show_archived` | INTEGER | DEFAULT 0 | Show archived? |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last modification |

**Indexes:**
- `idx_dashboard_layouts_user` - Get user's layouts

**Constraints:**
- UNIQUE(user_id, name) - One name per user

**Example:**
```sql
INSERT INTO dashboard_layouts 
  (user_id, name, layout_type, filters, sort_by)
VALUES (
  'user@example.com',
  'Production Only',
  'grid',
  '{"status":["online","running"]}',
  'name'
);
```

---

### server_groups
Automatic server grouping/categorization.

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY | Group ID |
| `name` | TEXT | NOT NULL UNIQUE | Group name |
| `description` | TEXT | | Optional description |
| `grouping_type` | TEXT | DEFAULT 'custom' | 'custom', 'map', 'cluster', 'status' |
| `criteria` | TEXT | | JSON criteria for grouping |
| `sort_order` | INTEGER | DEFAULT 0 | Display order |
| `color` | TEXT | DEFAULT '#8B5CF6' | Group color |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last modification |

**Indexes:**
- `idx_server_groups_type` - Find by type

**Example:**
```sql
-- Auto-group by map
INSERT INTO server_groups 
  (name, grouping_type, criteria, color)
VALUES (
  'TheIsland Servers',
  'map',
  '{"map_name":"TheIsland"}',
  '#3B82F6'
);

-- Auto-group by status
INSERT INTO server_groups 
  (name, grouping_type, criteria)
VALUES ('Online Servers', 'status', '{"status":"online"}');
```

---

### server_activity_log
Track server events and activity over time.

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY | Log entry ID |
| `server_id` | INTEGER | FK → servers | Server involved |
| `activity_type` | TEXT | NOT NULL | Event type |
| `player_count` | INTEGER | | Player count at time |
| `uptime_seconds` | INTEGER | | Uptime in seconds |
| `cpu_usage` | REAL | | CPU usage percentage |
| `ram_usage` | REAL | | RAM usage percentage |
| `description` | TEXT | | Event description |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Event timestamp |

**Indexes:**
- `idx_server_activity_server` - Events for a server
- `idx_server_activity_date` - Recent events

**Activity Types:**
- 'started', 'stopped', 'restarted', 'updated'
- 'crash', 'player_join', 'player_leave'

**Example:**
```sql
-- Log server start
INSERT INTO server_activity_log 
  (server_id, activity_type, player_count, uptime_seconds, cpu_usage)
VALUES (1, 'started', 0, 0, 5.2);

-- Get activity stats
SELECT 
  activity_type,
  COUNT(*) as count,
  AVG(player_count) as avg_players
FROM server_activity_log
WHERE server_id = 1
GROUP BY activity_type;
```

---

### bulk_actions
Track bulk operation executions.

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY | Action ID |
| `action_type` | TEXT | NOT NULL | Operation type |
| `server_ids` | TEXT | NOT NULL | JSON array of server IDs |
| `action_data` | TEXT | | JSON with action details |
| `status` | TEXT | DEFAULT 'pending' | 'pending', 'in-progress', 'completed', 'failed' |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `executed_at` | TIMESTAMP | | Completion time |
| `error_message` | TEXT | | Error details if failed |

**Indexes:**
- `idx_bulk_actions_status` - Find pending/failed actions

**Action Types:**
- 'move', 'archive', 'delete', 'enable', 'disable'
- 'tag', 'color', 'rename'

**Example:**
```sql
-- Record bulk move operation
INSERT INTO bulk_actions 
  (action_type, server_ids, action_data, status)
VALUES (
  'move',
  '[1,2,3,4,5]',
  '{"target_folder_id":10}',
  'completed'
);
```

---

### server_org_preferences
User organization preferences.

| Column | Type | Constraints | Description |
|--------|------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY | Preference ID |
| `user_id` | TEXT | NOT NULL UNIQUE | User identifier |
| `auto_archive_enabled` | INTEGER | DEFAULT 0 | Auto-archive inactive? |
| `auto_archive_days` | INTEGER | DEFAULT 30 | Days before auto-archive |
| `show_hints` | INTEGER | DEFAULT 1 | Show UI hints? |
| `animation_enabled` | INTEGER | DEFAULT 1 | Animations on? |
| `compact_mode` | INTEGER | DEFAULT 0 | Use compact view? |
| `show_statistics` | INTEGER | DEFAULT 1 | Show dashboard stats? |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last modification |

---

## Relationships

```
┌─────────────────┐
│  servers        │
│ (existing)      │
└────────┬────────┘
         │
         ├─► server_folder_members ◄─ server_folders
         │                              (hierarchical)
         │
         ├─► server_customization
         │   (display settings)
         │
         ├─► server_archive
         │   (inactive tracking)
         │
         └─► server_activity_log
             (history & stats)

┌──────────────────────┐
│ dashboard_layouts    │
│ (user config)        │
└──────────────────────┘

┌──────────────────────┐
│ server_groups        │
│ (categorization)     │
└──────────────────────┘

┌────────────────────────┐
│ bulk_actions           │
│ (operation tracking)   │
└────────────────────────┘

┌────────────────────────┐
│ server_org_preferences │
│ (user settings)        │
└────────────────────────┘
```

## Key Queries

### Get folder hierarchy with servers
```sql
WITH RECURSIVE folder_tree AS (
  SELECT id, name, parent_folder_id, 0 as level
  FROM server_folders
  WHERE parent_folder_id IS NULL
  
  UNION ALL
  
  SELECT f.id, f.name, f.parent_folder_id, ft.level + 1
  FROM server_folders f
  JOIN folder_tree ft ON f.parent_folder_id = ft.id
)
SELECT ft.*, sfm.server_id
FROM folder_tree ft
LEFT JOIN server_folder_members sfm ON ft.id = sfm.folder_id
ORDER BY ft.level, ft.name;
```

### Get server summary
```sql
SELECT 
  s.id,
  s.name,
  sc.display_name,
  sc.is_pinned,
  sc.favorite,
  sc.tags,
  CASE WHEN sa.id IS NOT NULL THEN 1 ELSE 0 END as is_archived,
  GROUP_CONCAT(DISTINCT sf.id) as folder_ids
FROM servers s
LEFT JOIN server_customization sc ON s.id = sc.server_id
LEFT JOIN server_archive sa ON s.id = sa.server_id
LEFT JOIN server_folder_members sfm ON s.id = sfm.server_id
LEFT JOIN server_folders sf ON sfm.folder_id = sf.id
GROUP BY s.id;
```

### Get dashboard statistics
```sql
SELECT 
  COUNT(*) as total_servers,
  SUM(CASE WHEN sa.id IS NULL THEN 1 ELSE 0 END) as active_servers,
  SUM(CASE WHEN sa.id IS NOT NULL THEN 1 ELSE 0 END) as archived_servers,
  COUNT(DISTINCT CASE WHEN s.status IN ('online','running') THEN s.id END) as online_servers
FROM servers s
LEFT JOIN server_archive sa ON s.id = sa.server_id;
```

### Find servers by multiple filters
```sql
SELECT DISTINCT s.*
FROM servers s
LEFT JOIN server_customization sc ON s.id = sc.server_id
LEFT JOIN server_folder_members sfm ON s.id = sfm.server_id
WHERE 
  (s.name LIKE ? OR sc.display_name LIKE ?)
  AND s.status IN (?, ?)
  AND sfm.folder_id = ?
ORDER BY sc.is_pinned DESC, s.name ASC;
```

## Performance Considerations

### Indexing Strategy
1. **Primary Keys** - Automatically indexed
2. **Foreign Keys** - Create indexes for faster joins
3. **Status Columns** - Indexed for common filters
4. **User Columns** - Indexed for multi-tenancy
5. **Date Columns** - Indexed for time-based queries

### Query Optimization
- Use EXPLAIN to analyze queries
- Prefer indexed columns in WHERE clauses
- Use GROUP_CONCAT for aggregations
- Limit result sets with pagination

### Maintenance
- Vacuum database periodically
- Archive old activity logs
- Update statistics after bulk operations
- Monitor query performance

## Migration Path

For existing installations:

1. **Backup database**
   ```bash
   cp server_manager.db server_manager.backup.db
   ```

2. **Run migrations**
   ```sql
   -- Load all tables from migrations.sql
   ```

3. **Verify schema**
   ```sql
   SELECT name FROM sqlite_master 
   WHERE type='table' 
   AND name LIKE 'server_%';
   ```

4. **Initialize default values**
   ```sql
   INSERT INTO server_org_preferences (user_id, auto_archive_days)
   VALUES ('default_user', 30);
   ```

## Backup and Recovery

### Backup
```bash
# Full backup
sqlite3 server_manager.db ".backup backup.db"

# Export to SQL
sqlite3 server_manager.db ".dump" > backup.sql
```

### Recovery
```bash
# From backup
sqlite3 server_manager.db ".restore backup.db"

# From SQL dump
sqlite3 server_manager.db < backup.sql
```

## Best Practices

1. **Always use transactions for bulk operations**
   ```sql
   BEGIN TRANSACTION;
   -- Multiple operations
   COMMIT;
   ```

2. **Use parameterized queries** to prevent SQL injection
3. **Keep JSON fields normalized** for better queries
4. **Archive old activity logs** to manage database size
5. **Regular backups** before major operations
6. **Test migrations** in development first

---

For API usage, see `QUICK_REFERENCE.md`
For integration steps, see `IMPLEMENTATION_GUIDE.md`
