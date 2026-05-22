#![allow(dead_code)]
// Server Organization Service
// Handles all server organization, folder management, archiving, and dashboard customization

use crate::models::server_organization::*;
use rusqlite::{params, Connection, Result as SqlResult};
use serde_json::json;
use std::collections::HashMap;

pub struct ServerOrganizationService;

impl ServerOrganizationService {
    // ============================================================================
    // Folder Management
    // ============================================================================

    /// Create a new server folder
    pub fn create_folder(conn: &Connection, request: &ServerFolderRequest) -> SqlResult<ServerFolder> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT DEFAULT '#8B5CF6',
                icon TEXT,
                parent_folder_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_folder_id) REFERENCES server_folders(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "INSERT INTO server_folders (name, description, color, icon, parent_folder_id, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
        )?;

        let now = chrono::Utc::now().to_rfc3339();
        let color = request.color.clone().unwrap_or_else(|| "#8B5CF6".to_string());

        stmt.insert(params![
            request.name,
            request.description,
            color,
            request.icon,
            request.parent_folder_id,
            0,
            now,
            now
        ])?;

        let folder_id = conn.last_insert_rowid();

        Ok(ServerFolder {
            id: folder_id,
            name: request.name.clone(),
            description: request.description.clone(),
            color,
            icon: request.icon.clone(),
            parent_folder_id: request.parent_folder_id,
            sort_order: 0,
            created_at: now.clone(),
            updated_at: now,
            children: Vec::new(),
            server_ids: Vec::new(),
        })
    }

    /// Get all folders
    pub fn get_all_folders(conn: &Connection) -> SqlResult<Vec<ServerFolder>> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT DEFAULT '#8B5CF6',
                icon TEXT,
                parent_folder_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_folder_id) REFERENCES server_folders(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Ensure members table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_folder_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                folder_id INTEGER NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                FOREIGN KEY (folder_id) REFERENCES server_folders(id) ON DELETE CASCADE,
                UNIQUE(server_id, folder_id)
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, description, color, icon, parent_folder_id, sort_order, created_at, updated_at
             FROM server_folders ORDER BY sort_order ASC, name ASC"
        )?;

        let mut folders = stmt.query_map([], |row| {
            Ok(ServerFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                parent_folder_id: row.get(5)?,
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                children: Vec::new(),
                server_ids: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        // Populate server_ids for each folder from the membership table
        for folder in &mut folders {
            if let Ok(mut member_stmt) = conn.prepare(
                "SELECT server_id FROM server_folder_members WHERE folder_id = ?1"
            ) {
                folder.server_ids = member_stmt
                    .query_map([folder.id], |r| r.get::<_, i64>(0))
                    .map(|rows| rows.flatten().collect::<Vec<i64>>())
                    .unwrap_or_default();
            }
        }

        Ok(folders)
    }

    /// Get folder with nested children and server members
    pub fn get_folder_hierarchy(conn: &Connection, folder_id: i64) -> SqlResult<ServerFolder> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT DEFAULT '#8B5CF6',
                icon TEXT,
                parent_folder_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_folder_id) REFERENCES server_folders(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, description, color, icon, parent_folder_id, sort_order, created_at, updated_at
             FROM server_folders WHERE id = ?1"
        )?;

        let mut folder = stmt.query_row([folder_id], |row| {
            Ok(ServerFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                parent_folder_id: row.get(5)?,
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                children: Vec::new(),
                server_ids: Vec::new(),
            })
        })?;

        // Get child folders
        let mut child_stmt = conn.prepare(
            "SELECT id FROM server_folders WHERE parent_folder_id = ?1 ORDER BY sort_order ASC"
        )?;

        let child_ids = child_stmt.query_map([folder_id], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        for child_id in child_ids {
            if let Ok(child) = Self::get_folder_hierarchy(conn, child_id) {
                folder.children.push(child);
            }
        }

        // Get server members
        let mut server_stmt = conn.prepare(
            "SELECT server_id FROM server_folder_members WHERE folder_id = ?1"
        )?;

        let server_ids = server_stmt.query_map([folder_id], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        folder.server_ids = server_ids;

        Ok(folder)
    }

    /// Update folder
    pub fn update_folder(
        conn: &Connection,
        folder_id: i64,
        name: Option<&str>,
        description: Option<Option<&str>>,
        color: Option<&str>,
        icon: Option<Option<&str>>,
    ) -> SqlResult<()> {
        let now = chrono::Utc::now().to_rfc3339();

        // Build the update dynamically using owned Option<String> to represent values and NULLs
        let mut set_clauses = vec!["updated_at = ?1".to_string()];
        let mut param_values: Vec<Option<String>> = vec![Some(now)];

        if let Some(n) = name {
            set_clauses.push(format!("name = ?{}", param_values.len() + 1));
            param_values.push(Some(n.to_string()));
        }
        if let Some(opt_d) = description {
            set_clauses.push(format!("description = ?{}", param_values.len() + 1));
            match opt_d {
                Some(d) => param_values.push(Some(d.to_string())),
                None => param_values.push(None),
            }
        }
        if let Some(c) = color {
            set_clauses.push(format!("color = ?{}", param_values.len() + 1));
            param_values.push(Some(c.to_string()));
        }
        if let Some(opt_i) = icon {
            set_clauses.push(format!("icon = ?{}", param_values.len() + 1));
            match opt_i {
                Some(i) => param_values.push(Some(i.to_string())),
                None => param_values.push(None),
            }
        }

        // Push folder_id for the WHERE clause
        let folder_id_str = folder_id.to_string();
        param_values.push(Some(folder_id_str));

        let query = format!(
            "UPDATE server_folders SET {} WHERE id = ?{}",
            set_clauses.join(", "),
            param_values.len()
        );

        let params_ref: Vec<&dyn rusqlite::ToSql> = param_values
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect();

        conn.execute(&query, rusqlite::params_from_iter(params_ref))?;
        Ok(())
    }

    /// Delete folder (cascade delete servers in folder if needed)
    pub fn delete_folder(conn: &Connection, folder_id: i64) -> SqlResult<()> {
        // First, remove all server associations
        conn.execute(
            "DELETE FROM server_folder_members WHERE folder_id = ?1",
            params![folder_id],
        )?;

        // Delete the folder
        conn.execute(
            "DELETE FROM server_folders WHERE id = ?1",
            params![folder_id],
        )?;

        Ok(())
    }

    // ============================================================================
    // Server-Folder Associations
    // ============================================================================

    /// Add server to folder
    pub fn add_server_to_folder(conn: &Connection, server_id: i64, folder_id: i64) -> SqlResult<()> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_folder_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                folder_id INTEGER NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                FOREIGN KEY (folder_id) REFERENCES server_folders(id) ON DELETE CASCADE,
                UNIQUE(server_id, folder_id)
            )",
            [],
        )?;

        conn.execute(
            "INSERT OR IGNORE INTO server_folder_members (server_id, folder_id, added_at)
             VALUES (?1, ?2, ?3)",
            params![server_id, folder_id, chrono::Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    /// Remove server from folder
    pub fn remove_server_from_folder(conn: &Connection, server_id: i64, folder_id: i64) -> SqlResult<()> {
        conn.execute(
            "DELETE FROM server_folder_members WHERE server_id = ?1 AND folder_id = ?2",
            params![server_id, folder_id],
        )?;
        Ok(())
    }

    /// Get folders for a server
    pub fn get_server_folders(conn: &Connection, server_id: i64) -> SqlResult<Vec<ServerFolder>> {
        // Ensure tables exist
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT DEFAULT '#8B5CF6',
                icon TEXT,
                parent_folder_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_folder_id) REFERENCES server_folders(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_folder_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                folder_id INTEGER NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                FOREIGN KEY (folder_id) REFERENCES server_folders(id) ON DELETE CASCADE,
                UNIQUE(server_id, folder_id)
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT sf.id, sf.name, sf.description, sf.color, sf.icon, sf.parent_folder_id, sf.sort_order, sf.created_at, sf.updated_at
             FROM server_folders sf
             JOIN server_folder_members sfm ON sf.id = sfm.folder_id
             WHERE sfm.server_id = ?1
             ORDER BY sf.sort_order ASC"
        )?;

        let folders = stmt.query_map(params![server_id], |row| {
            Ok(ServerFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                parent_folder_id: row.get(5)?,
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                children: Vec::new(),
                server_ids: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        Ok(folders)
    }

    // ============================================================================
    // Server Archive Management
    // ============================================================================

    /// Archive a server
    pub fn archive_server(conn: &Connection, request: &ArchiveRequest) -> SqlResult<ServerArchive> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL UNIQUE,
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                archive_reason TEXT,
                archived_by TEXT,
                notes TEXT,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO server_archive (server_id, archived_at, archive_reason, notes)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                request.server_id,
                now,
                request.reason,
                request.notes
            ],
        )?;

        Ok(ServerArchive {
            id: 1,
            server_id: request.server_id,
            archived_at: now,
            archive_reason: request.reason.clone(),
            archived_by: None,
            notes: request.notes.clone(),
        })
    }

    /// Restore server from archive
    pub fn restore_server(conn: &Connection, server_id: i64) -> SqlResult<()> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL UNIQUE,
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                archive_reason TEXT,
                archived_by TEXT,
                notes TEXT,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "DELETE FROM server_archive WHERE server_id = ?1",
            params![server_id],
        )?;
        Ok(())
    }

    /// Check if server is archived
    pub fn is_server_archived(conn: &Connection, server_id: i64) -> SqlResult<bool> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL UNIQUE,
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                archive_reason TEXT,
                archived_by TEXT,
                notes TEXT,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id FROM server_archive WHERE server_id = ?1"
        )?;

        let result = stmt.exists(params![server_id])?;
        Ok(result)
    }

    /// Get archived servers
    pub fn get_archived_servers(conn: &Connection) -> SqlResult<Vec<ServerArchive>> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL UNIQUE,
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                archive_reason TEXT,
                archived_by TEXT,
                notes TEXT,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, server_id, archived_at, archive_reason, archived_by, notes
             FROM server_archive
             ORDER BY archived_at DESC"
        )?;

        let archives = stmt.query_map([], |row| {
            Ok(ServerArchive {
                id: row.get(0)?,
                server_id: row.get(1)?,
                archived_at: row.get(2)?,
                archive_reason: row.get(3)?,
                archived_by: row.get(4)?,
                notes: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        Ok(archives)
    }

    // ============================================================================
    // Server Customization
    // ============================================================================

    /// Update server customization
    pub fn update_server_customization(
        conn: &Connection,
        request: &CustomizationRequest,
    ) -> SqlResult<ServerCustomization> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_customization (
                server_id INTEGER PRIMARY KEY,
                display_name TEXT,
                custom_icon TEXT,
                custom_banner TEXT,
                color_tag TEXT,
                is_pinned INTEGER DEFAULT 0,
                pin_order INTEGER DEFAULT 0,
                is_minimized INTEGER DEFAULT 0,
                tags TEXT DEFAULT '[]',
                favorite INTEGER DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let now = chrono::Utc::now().to_rfc3339();
        let tags_json = serde_json::to_string(&request.tags.clone().unwrap_or_default())
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        conn.execute(
            "INSERT OR REPLACE INTO server_customization
             (server_id, display_name, custom_icon, custom_banner, color_tag, is_pinned, tags, favorite, notes, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                request.server_id,
                request.display_name,
                request.custom_icon,
                request.custom_banner,
                request.color_tag,
                request.is_pinned.unwrap_or(false) as i32,
                tags_json,
                request.favorite.unwrap_or(false) as i32,
                request.notes,
                now
            ],
        )?;

        Ok(ServerCustomization {
            server_id: request.server_id,
            display_name: request.display_name.clone(),
            custom_icon: request.custom_icon.clone(),
            custom_banner: request.custom_banner.clone(),
            color_tag: request.color_tag.clone(),
            is_pinned: request.is_pinned.unwrap_or(false),
            pin_order: 0,
            is_minimized: false,
            tags: request.tags.clone().unwrap_or_default(),
            favorite: request.favorite.unwrap_or(false),
            notes: request.notes.clone(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Get server customization
    pub fn get_server_customization(conn: &Connection, server_id: i64) -> SqlResult<Option<ServerCustomization>> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_customization (
                server_id INTEGER PRIMARY KEY,
                display_name TEXT,
                custom_icon TEXT,
                custom_banner TEXT,
                color_tag TEXT,
                is_pinned INTEGER DEFAULT 0,
                pin_order INTEGER DEFAULT 0,
                is_minimized INTEGER DEFAULT 0,
                tags TEXT DEFAULT '[]',
                favorite INTEGER DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT server_id, display_name, custom_icon, custom_banner, color_tag, is_pinned, pin_order, is_minimized, tags, favorite, notes, created_at, updated_at
              FROM server_customization WHERE server_id = ?1"
        )?;

        let result = stmt.query_row(params![server_id], |row| -> SqlResult<ServerCustomization> {
            let tags_str: String = row.get(8)?;
            let tags = serde_json::from_str(&tags_str).unwrap_or_default();

            Ok(ServerCustomization {
                server_id: row.get(0)?,
                display_name: row.get(1)?,
                custom_icon: row.get(2)?,
                custom_banner: row.get(3)?,
                color_tag: row.get(4)?,
                is_pinned: row.get::<_, i32>(5)? != 0,
                pin_order: row.get(6)?,
                is_minimized: row.get::<_, i32>(7)? != 0,
                tags,
                favorite: row.get::<_, i32>(9)? != 0,
                notes: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        });

        match result {
            Ok(customization) => Ok(Some(customization)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    // ============================================================================
    // Dashboard Layouts
    // ============================================================================

    /// Create dashboard layout
    pub fn create_dashboard_layout(
        conn: &Connection,
        user_id: &str,
        request: &DashboardLayoutRequest,
    ) -> SqlResult<DashboardLayout> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS dashboard_layouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                layout_type TEXT DEFAULT 'grid',
                view_mode TEXT DEFAULT 'expanded',
                is_default INTEGER DEFAULT 0,
                sections TEXT DEFAULT '[]',
                filters TEXT DEFAULT '{}',
                sort_by TEXT DEFAULT 'name',
                sort_order TEXT DEFAULT 'asc',
                show_inactive INTEGER DEFAULT 0,
                show_archived INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, name)
            )",
            [],
        )?;

        let now = chrono::Utc::now().to_rfc3339();
        let sections_json = serde_json::to_string(&request.sections.clone().unwrap_or_default())
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let filters_json = serde_json::to_string(&request.filters.clone().unwrap_or_default())
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        conn.execute(
            "INSERT INTO dashboard_layouts
             (user_id, name, description, layout_type, view_mode, is_default, sections, filters, sort_by, sort_order, show_inactive, show_archived, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                user_id,
                request.name,
                request.description,
                request.layout_type.clone().unwrap_or_else(|| "grid".to_string()),
                request.view_mode.clone().unwrap_or_else(|| "expanded".to_string()),
                0,
                sections_json,
                filters_json,
                request.sort_by.clone().unwrap_or_else(|| "name".to_string()),
                request.sort_order.clone().unwrap_or_else(|| "asc".to_string()),
                request.show_inactive.unwrap_or(false) as i32,
                request.show_archived.unwrap_or(false) as i32,
                now,
                now
            ],
        )?;

        let layout_id = conn.last_insert_rowid();

        Ok(DashboardLayout {
            id: layout_id,
            user_id: user_id.to_string(),
            name: request.name.clone(),
            description: request.description.clone(),
            layout_type: request.layout_type.clone().unwrap_or_else(|| "grid".to_string()),
            view_mode: request.view_mode.clone().unwrap_or_else(|| "expanded".to_string()),
            is_default: false,
            sections: request.sections.clone().unwrap_or_default(),
            filters: request.filters.clone().unwrap_or_default(),
            sort_by: request.sort_by.clone().unwrap_or_else(|| "name".to_string()),
            sort_order: request.sort_order.clone().unwrap_or_else(|| "asc".to_string()),
            show_inactive: request.show_inactive.unwrap_or(false),
            show_archived: request.show_archived.unwrap_or(false),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Get user's dashboard layouts
    pub fn get_user_layouts(conn: &Connection, user_id: &str) -> SqlResult<Vec<DashboardLayout>> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS dashboard_layouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                layout_type TEXT DEFAULT 'grid',
                view_mode TEXT DEFAULT 'expanded',
                is_default INTEGER DEFAULT 0,
                sections TEXT DEFAULT '[]',
                filters TEXT DEFAULT '{}',
                sort_by TEXT DEFAULT 'name',
                sort_order TEXT DEFAULT 'asc',
                show_inactive INTEGER DEFAULT 0,
                show_archived INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, name)
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, user_id, name, description, layout_type, view_mode, is_default, sections, filters, sort_by, sort_order, show_inactive, show_archived, created_at, updated_at
              FROM dashboard_layouts WHERE user_id = ?1 ORDER BY is_default DESC, created_at DESC"
        )?;

        let layouts = stmt.query_map(params![user_id], |row| {
            let sections_str: String = row.get(7)?;
            let filters_str: String = row.get(8)?;
            
            Ok(DashboardLayout {
                id: row.get(0)?,
                user_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                layout_type: row.get(4)?,
                view_mode: row.get(5)?,
                is_default: row.get::<_, i32>(6)? != 0,
                sections: serde_json::from_str(&sections_str).unwrap_or_default(),
                filters: serde_json::from_str(&filters_str).unwrap_or_default(),
                sort_by: row.get(9)?,
                sort_order: row.get(10)?,
                show_inactive: row.get::<_, i32>(11)? != 0,
                show_archived: row.get::<_, i32>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        Ok(layouts)
    }

    /// Delete dashboard layout
    pub fn delete_layout(conn: &Connection, layout_id: i64) -> SqlResult<()> {
        conn.execute(
            "DELETE FROM dashboard_layouts WHERE id = ?1",
            params![layout_id],
        )?;
        Ok(())
    }

    // ============================================================================
    // Server Groups
    // ============================================================================

    /// Create server group
    pub fn create_server_group(
        conn: &Connection,
        request: &ServerGroupRequest,
    ) -> SqlResult<ServerGroup> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                grouping_type TEXT DEFAULT 'custom',
                criteria TEXT,
                sort_order INTEGER DEFAULT 0,
                color TEXT DEFAULT '#8B5CF6',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name)
            )",
            [],
        )?;

        let now = chrono::Utc::now().to_rfc3339();
        let criteria_json = serde_json::to_string(&request.criteria.clone().unwrap_or(json!({})))
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        conn.execute(
            "INSERT INTO server_groups
             (name, description, grouping_type, criteria, sort_order, color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                request.name,
                request.description,
                request.grouping_type.clone().unwrap_or_else(|| "custom".to_string()),
                criteria_json,
                0,
                request.color.clone().unwrap_or_else(|| "#8B5CF6".to_string()),
                now,
                now
            ],
        )?;

        let group_id = conn.last_insert_rowid();

        Ok(ServerGroup {
            id: group_id,
            name: request.name.clone(),
            description: request.description.clone(),
            grouping_type: request.grouping_type.clone().unwrap_or_else(|| "custom".to_string()),
            criteria: request.criteria.clone().unwrap_or(json!({})),
            sort_order: 0,
            color: request.color.clone().unwrap_or_else(|| "#8B5CF6".to_string()),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Get all server groups
    pub fn get_all_server_groups(conn: &Connection) -> SqlResult<Vec<ServerGroup>> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                grouping_type TEXT DEFAULT 'custom',
                criteria TEXT,
                sort_order INTEGER DEFAULT 0,
                color TEXT DEFAULT '#8B5CF6',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name)
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, description, grouping_type, criteria, sort_order, color, created_at, updated_at
              FROM server_groups ORDER BY sort_order ASC, name ASC"
        )?;

        let groups = stmt.query_map([], |row| {
            let criteria_str: String = row.get(4)?;
            
            Ok(ServerGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                grouping_type: row.get(3)?,
                criteria: serde_json::from_str(&criteria_str).unwrap_or(json!({})),
                sort_order: row.get(5)?,
                color: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        Ok(groups)
    }

    // ============================================================================
    // Bulk Actions
    // ============================================================================

    /// Create bulk action
    pub fn create_bulk_action(
        conn: &Connection,
        request: &BulkActionRequest,
    ) -> SqlResult<BulkAction> {
        let now = chrono::Utc::now().to_rfc3339();
        let server_ids_json = serde_json::to_string(&request.server_ids)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        conn.execute(
            "INSERT INTO bulk_actions (action_type, server_ids, action_data, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                request.action_type,
                server_ids_json,
                request.action_data.to_string(),
                "pending",
                now
            ],
        )?;

        let action_id = conn.last_insert_rowid();

        Ok(BulkAction {
            id: action_id,
            action_type: request.action_type.clone(),
            server_ids: request.server_ids.clone(),
            action_data: request.action_data.clone(),
            status: "pending".to_string(),
            created_at: now,
            executed_at: None,
            error_message: None,
        })
    }

    /// Execute bulk action
    pub fn execute_bulk_action(conn: &Connection, action_id: i64) -> SqlResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE bulk_actions SET status = ?1, executed_at = ?2 WHERE id = ?3",
            params!["completed", now, action_id],
        )?;
        Ok(())
    }

    // ============================================================================
    // Activity Logging
    // ============================================================================

    /// Log server activity
    pub fn log_server_activity(
        conn: &Connection,
        server_id: i64,
        activity_type: &str,
        player_count: Option<i32>,
        uptime_seconds: Option<i32>,
        cpu_usage: Option<f64>,
        ram_usage: Option<f64>,
        description: Option<&str>,
    ) -> SqlResult<()> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                activity_type TEXT NOT NULL,
                player_count INTEGER,
                uptime_seconds INTEGER,
                cpu_usage REAL,
                ram_usage REAL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "INSERT INTO server_activity_log
             (server_id, activity_type, player_count, uptime_seconds, cpu_usage, ram_usage, description, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                server_id,
                activity_type,
                player_count,
                uptime_seconds,
                cpu_usage,
                ram_usage,
                description,
                chrono::Utc::now().to_rfc3339()
            ],
        )?;
        Ok(())
    }

    /// Get server activity stats
    pub fn get_server_activity_stats(conn: &Connection, server_id: i64) -> SqlResult<Option<ServerActivityStats>> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                activity_type TEXT NOT NULL,
                player_count INTEGER,
                uptime_seconds INTEGER,
                cpu_usage REAL,
                ram_usage REAL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let mut stmt = conn.prepare(
            "SELECT
                server_id,
                COALESCE(SUM(uptime_seconds) / 60, 0) as total_uptime_minutes,
                COALESCE(AVG(player_count), 0) as avg_player_count,
                COALESCE(MAX(player_count), 0) as peak_player_count,
                MAX(created_at) as last_activity,
                COUNT(*) as activity_count,
                SUM(CASE WHEN activity_type = 'crash' THEN 1 ELSE 0 END) as crash_count,
                SUM(CASE WHEN activity_type = 'restarted' THEN 1 ELSE 0 END) as restart_count
            FROM server_activity_log
            WHERE server_id = ?1
            GROUP BY server_id"
        )?;

        let result = stmt.query_row(params![server_id], |row| {
            Ok(ServerActivityStats {
                server_id: row.get(0)?,
                total_uptime_minutes: row.get(1)?,
                avg_player_count: row.get(2)?,
                peak_player_count: row.get(3)?,
                last_activity: row.get(4)?,
                activity_count: row.get(5)?,
                crash_count: row.get(6)?,
                restart_count: row.get(7)?,
            })
        });

        match result {
            Ok(stats) => Ok(Some(stats)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Get dashboard statistics
    pub fn get_dashboard_statistics(conn: &Connection) -> SqlResult<DashboardStatistics> {
        // Ensure table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS server_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL UNIQUE,
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                archive_reason TEXT,
                archived_by TEXT,
                notes TEXT,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Total servers
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM servers")?;
        let total_servers: i32 = stmt.query_row([], |row| row.get(0))?;

        // Active servers (not archived)
        let mut stmt = conn.prepare(
            "SELECT COUNT(*) FROM servers WHERE id NOT IN (SELECT server_id FROM server_archive)"
        )?;
        let active_servers: i32 = stmt.query_row([], |row| row.get(0))?;

        // Archived servers
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM server_archive")?;
        let archived_servers: i32 = stmt.query_row([], |row| row.get(0))?;

        // Status distribution
        let mut status_map = HashMap::new();
        let mut stmt = conn.prepare(
            "SELECT status, COUNT(*) as count FROM servers GROUP BY status"
        )?;
        let status_rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
        })?;

        for status_row in status_rows {
            let (status, count) = status_row?;
            status_map.insert(status, count);
        }

        // Map distribution
        let mut map_map = HashMap::new();
        let mut stmt = conn.prepare(
            "SELECT map_name, COUNT(*) as count FROM servers GROUP BY map_name"
        )?;
        let map_rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
        })?;

        for map_row in map_rows {
            let (map, count) = map_row?;
            map_map.insert(map, count);
        }

        Ok(DashboardStatistics {
            total_servers,
            active_servers,
            archived_servers,
            total_players: 0,
            total_uptime_hours: 0,
            avg_cpu_usage: 0.0,
            avg_ram_usage: 0.0,
            server_count_by_status: status_map,
            server_count_by_map: map_map,
        })
    }
}
