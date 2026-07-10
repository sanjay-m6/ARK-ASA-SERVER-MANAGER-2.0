# Advanced Server Organization and Dashboard Management System
## Implementation Guide

This document provides a comprehensive overview of the advanced server organization system for ARK ASA Server Manager.

## System Overview

The Advanced Server Organization System is a complete solution for managing large numbers of servers with:

- **Server Folders & Organization** - Create hierarchical folder structures to organize servers
- **Server Customization** - Rename, color-tag, pin, and add notes to servers
- **Archive System** - Archive inactive servers to declutter the main dashboard
- **Advanced Dashboard** - Grid/list views with real-time updates and animations
- **Search & Filtering** - Fast server discovery with multi-criteria filtering
- **Bulk Operations** - Perform actions on multiple servers at once
- **Dashboard Layouts** - Save and switch between custom dashboard configurations
- **Activity Analytics** - Track server activity and statistics
- **Drag-and-Drop** - Intuitive server organization with drag-and-drop support

## Architecture Overview

### Database Layer (`src-tauri/src/db/migrations.sql`)

New tables for organization:
- `server_folders` - Hierarchical folder structure
- `server_folder_members` - Server-to-folder associations
- `server_archive` - Archived/inactive servers
- `server_customization` - Per-server customization (display name, color, tags, etc.)
- `dashboard_layouts` - User dashboard configurations
- `server_groups` - Automatic server grouping
- `server_activity_log` - Server activity tracking
- `bulk_actions` - Track bulk operations

### Rust Backend Layer

#### Models (`src-tauri/src/models/server_organization.rs`)

Defines all data structures:
- `ServerFolder` - Folder structure with hierarchy
- `ServerArchive` - Archive information
- `ServerCustomization` - Per-server customization
- `DashboardLayout` - Dashboard configuration
- `ServerGroup` - Automatic grouping criteria
- `BulkAction` - Bulk operation tracking
- `ServerActivityStats` - Activity analytics
- `DashboardStatistics` - System-wide statistics

#### Services (`src-tauri/src/services/server_organization.rs`)

Core business logic:
- Folder management (CRUD, hierarchy)
- Archive operations (archive, restore, list)
- Customization updates
- Dashboard layout management
- Server grouping
- Activity logging
- Bulk operations
- Search and filtering

### Frontend Layer

#### State Management (`src/stores/serverOrganizationStore.ts`)

Zustand store managing:
- Folders and folder hierarchy
- Server customization states
- Archive states
- Dashboard layouts
- Server groups
- Current filters and sort options
- Activity statistics
- UI loading/error states

#### Components

1. **EnhancedServerCard** (`src/components/server/EnhancedServerCard.tsx`)
   - Displays server with all customization options
   - Pin/favorite/minimize toggles
   - Quick rename editing
   - Tag management
   - Notes display
   - Server control buttons
   - Animated transitions

2. **ServerFolder** (`src/components/server/ServerFolder.tsx`)
   - Hierarchical folder display
   - Drag-drop enabled
   - Folder management (create, rename, delete)
   - Server count display
   - Nested children support

3. **EnhancedDashboard** (`src/components/server/EnhancedDashboard.tsx`)
   - Main dashboard component
   - Grid/list view modes
   - Server pinning section
   - Active/archived filtering
   - Search integration
   - Responsive layout
   - Animated server cards

4. **ServerSearchFilter** (`src/components/server/ServerSearchFilter.tsx`)
   - Advanced search functionality
   - Multi-criteria filtering
   - Dynamic sort options
   - Filter UI with checkboxes
   - Results summary

#### Utilities (`src/utils/serverOrganization.ts`)

Tauri API wrapper functions:
- `createServerFolder()` - Create folders
- `archiveServer()` / `restoreServer()` - Archive management
- `updateServerCustomization()` - Customize servers
- `createDashboardLayout()` - Save layouts
- `bulkMoveServers()` - Bulk folder assignment
- `searchServers()` - Search functionality
- `getDashboardStatistics()` - Get system stats
- Helper functions for data transformation

#### Types (`src/types/server-organization.ts`)

TypeScript interfaces for type safety across the application.

## Integration Steps

### 1. Backend Integration

Add the service to your Tauri commands:

```rust
// In src-tauri/src/main.rs
use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![
        // Include migrations from migrations.sql
        Migration {
            version: 1001u32,
            description: "create_server_organization_tables",
            sql: include_str!("db/migrations.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default()
            .add_migrations("sqlite:server_manager.db", migrations)
            .build())
        // ... register other plugins and commands
        .invoke_handler(tauri::generate_handler![
            // ... existing commands
            // Add new organization commands
        ])
        .run(tauri_context!())
        .expect("error while running tauri application");
}
```

### 2. Add Tauri Commands

Create commands in `src-tauri/src/commands/server_organization.rs`:

```rust
use crate::services::server_organization::ServerOrganizationService;
use tauri::State;
use rusqlite::Connection;

#[tauri::command]
pub async fn create_folder(
    request: ServerFolderRequest,
    db: State<'_, Connection>,
) -> Result<ServerFolder, String> {
    ServerOrganizationService::create_folder(&db, &request)
        .map_err(|e| e.to_string())
}

// ... More commands for other operations
```

### 3. Update Tauri Configuration

Update `src-tauri/tauri.conf.json`:

```json
{
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev"
  },
  "plugins": {
    "sql": {
      "preventStatementSimplification": false
    }
  }
}
```

### 4. Frontend Integration

In your main Dashboard page (`src/pages/Dashboard.tsx`):

```typescript
import EnhancedDashboard from '../components/server/EnhancedDashboard';
import { useServerOrganizationStore } from '../stores/serverOrganizationStore';
import * as orgApi from '../utils/serverOrganization';

export default function Dashboard() {
  const { setFolders, setArchivedServers } = useServerOrganizationStore();

  useEffect(() => {
    // Load organization data on mount
    loadOrganizationData();
  }, []);

  const loadOrganizationData = async () => {
    try {
      const [folders, archived] = await Promise.all([
        orgApi.getAllFolders(),
        orgApi.getArchivedServers(),
      ]);
      
      setFolders(folders);
      setArchivedServers(archived);
    } catch (error) {
      console.error('Failed to load organization data:', error);
    }
  };

  return (
    <EnhancedDashboard
      onServerSelect={handleServerSelect}
      onStartServer={handleStartServer}
      onStopServer={handleStopServer}
      onRestartServer={handleRestartServer}
      onDeleteServer={handleDeleteServer}
      onArchiveServer={handleArchiveServer}
      onRestoreServer={handleRestoreServer}
    />
  );
}
```

### 5. Add Dependencies

```bash
npm install framer-motion lucide-react zustand react-hot-toast
```

## Feature Implementation Details

### Server Pinning

```typescript
// In EnhancedServerCard.tsx
const handleTogglePin = () => {
  updateServerCustomization({
    ...customization,
    is_pinned: !isPinned,
  });
  // Persisted to backend via API
};
```

Pinned servers automatically appear at the top of the dashboard.

### Server Archiving

```typescript
const handleArchiveServer = async (serverId: number) => {
  await archiveServer(serverId, 'Manual archive');
  archiveServer(serverId); // Update local state
  toast.success('Server archived');
};
```

Archived servers:
- Are hidden from the main dashboard
- Don't count toward active server count
- Can be restored with one click
- Are shown in a separate "Archived" section

### Bulk Operations

```typescript
// Move multiple servers to a folder
await bulkMoveServers([1, 2, 3], folderId);

// Archive multiple servers
await bulkArchiveServers([1, 2, 3], 'Batch archive');

// Tag multiple servers
await bulkTagServers([1, 2, 3], ['production', 'cluster-1']);
```

### Dashboard Layouts

Users can create multiple dashboard configurations:

```typescript
const layout: DashboardLayout = {
  name: 'Production Servers',
  layout_type: 'grid',
  view_mode: 'expanded',
  filters: { status: ['online', 'running'] },
  sort_by: 'name',
  show_inactive: false,
  show_archived: false,
};

await createDashboardLayout(userId, layout);
```

### Activity Tracking

Log server activities automatically:

```typescript
// When server status changes
await logServerActivity(
  serverId,
  'started',
  undefined,
  undefined,
  cpuUsage,
  ramUsage
);

// Get activity statistics
const stats = await getServerActivityStats(serverId);
```

## UI/UX Features

### Animations

- Smooth card transitions with Framer Motion
- Staggered folder expansion
- Card minimize/maximize animations
- Drag-drop visual feedback
- Filter panel slide-in/out

### Responsive Design

- Works on all screen sizes
- Adaptive grid layout
- Touch-friendly controls
- Collapsible sidebar

### Dark Mode

- Premium dark gaming UI
- Customizable color tags
- Gradient backgrounds
- Professional styling

### Accessibility

- Keyboard navigation
- ARIA labels
- Focus management
- Semantic HTML

## Performance Optimizations

### Frontend

- React.memo for card components
- Memoized filter/sort logic
- Virtualization for large lists (optional)
- Lazy loading of server details

### Backend

- Database indexes on frequently queried fields
- Connection pooling
- Prepared statements
- Efficient query patterns

### Caching

- Local Zustand state for UI
- Memoized computations
- Debounced API calls

## Security Considerations

1. **Permission Checks** - Validate user access to folders/servers
2. **Audit Logging** - Track all organization changes
3. **Data Validation** - Sanitize inputs on frontend and backend
4. **Safe Deletion** - Confirmation dialogs before destructive operations

## Testing

Example unit tests:

```typescript
describe('ServerOrganizationStore', () => {
  it('should pin a server', () => {
    const store = useServerOrganizationStore.getState();
    store.toggleServerPin(1);
    expect(store.customizations.get(1)?.is_pinned).toBe(true);
  });

  it('should archive a server', () => {
    const store = useServerOrganizationStore.getState();
    store.archiveServer(1, 'Test archive');
    expect(store.isServerArchived(1)).toBe(true);
  });
});
```

## Troubleshooting

### Migrations Not Applied

- Clear app data and reinstall
- Check database file permissions
- Verify migration SQL syntax

### Drag-Drop Not Working

- Ensure browser supports HTML5 drag-drop
- Check event handlers are attached
- Verify z-index values

### Performance Issues

- Enable React DevTools Profiler
- Check for unnecessary re-renders
- Consider virtualizing large lists
- Profile database queries

## Future Enhancements

1. **Cloud Sync** - Sync organization across devices
2. **Templates** - Save and apply folder templates
3. **Auto-Organization** - ML-based automatic grouping
4. **Webhooks** - Notify on organization changes
5. **Collaborative** - Share folders with other users
6. **Mobile App** - React Native version

## Process Control & Platform-Specific Safeguards (ASA API / Linux / Proton)

### 1. Hard Process Tree Terminations
* **Windows**: We use `taskkill /F /T /PID <pid>` to completely tear down the spawned process tree (parent/child loader and game servers).
* **Linux/Proton (Future Support)**: Native in-game or RCON restarts (`DoExit` / `plugins.unload`) under Proton/Wine frequently leave orphaned/defunct child processes running in the background. To support non-Windows hosts, the manager must use:
  ```rust
  // Kill the entire process group (negative PID = group)
  Command::new("kill")
      .args(["-9", &format!("-{}", pgid)])
      .output();
  ```
  This requires spawning the Wine/Proton wrapper process with a new process group (e.g., via `setsid` or equivalent Unix spawn options) so that orphaned children do not remain behind holding sockets/ports.

### 2. Port-Release Verification Loop
* When restarting or stopping a server, always verify that the server ports (Game Port, Query Port, RCON Port) are actually freed by the OS rather than just checking that the PID has exited. 
* Socket teardown inside Wine/Proton can lag behind process termination; starting the loader before the sockets are fully freed will result in binding conflicts and boot failures.

### 3. Folder & DLL Alignment Checks
* The folder name containing an Ark Server API plugin must exactly match the name of the plugin's `.dll` file (e.g. `ArkApi/Plugins/MyPlugin/MyPlugin.dll`). A folder/file name mismatch is the #1 cause of silent loader failures.

## Support and Documentation

- See `documentation/backend/ServerOrganization.md` for backend details
- See `documentation/frontend/ServerOrganization.md` for component API
- Check test files for usage examples

