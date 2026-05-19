# Quick Reference: Server Organization System

## File Structure

```
src-tauri/src/
├── db/
│   ├── schema.sql (existing)
│   └── migrations.sql (NEW) - Database schema additions
├── models/
│   └── server_organization.rs (NEW) - All data structures
└── services/
    └── server_organization.rs (NEW) - Business logic (40+ methods)

src/
├── components/server/
│   ├── EnhancedServerCard.tsx (NEW) - Server card UI
│   ├── ServerFolder.tsx (NEW) - Folder hierarchy
│   ├── EnhancedDashboard.tsx (NEW) - Main dashboard
│   └── ServerSearchFilter.tsx (NEW) - Search & filter
├── stores/
│   ├── serverStore.ts (existing)
│   └── serverOrganizationStore.ts (NEW) - Zustand state
├── types/
│   └── server-organization.ts (NEW) - TypeScript types
└── utils/
    └── serverOrganization.ts (NEW) - Tauri API wrappers
```

## Core Concepts

### Folders
```typescript
// Create folder
const folder = await createServerFolder({
  name: 'Production Servers',
  color: '#8B5CF6',
  description: 'All production environments'
});

// Add server to folder
await addServerToFolder(serverId, folderId);

// Get folder hierarchy
const hierarchy = await getFolderHierarchy(folderId);
```

### Archive
```typescript
// Archive inactive server
await archiveServer(serverId, 'Unused for 30 days');

// Check if archived
const isArchived = await isServerArchived(serverId);

// Restore
await restoreServer(serverId);
```

### Customization
```typescript
// Customize server
await updateServerCustomization({
  server_id: serverId,
  display_name: 'Prod-Alpha',
  color_tag: '#FF6B6B',
  tags: ['production', 'cluster-1'],
  is_pinned: true,
  favorite: true,
  notes: 'Critical server'
});
```

### Dashboard Layouts
```typescript
// Create layout
const layout = await createDashboardLayout('user@example.com', {
  name: 'Production Only',
  layout_type: 'grid',
  view_mode: 'expanded',
  filters: { status: ['online', 'running'] },
  sort_by: 'name'
});

// List user's layouts
const layouts = await getUserDashboardLayouts('user@example.com');
```

### Bulk Operations
```typescript
// Move multiple servers to folder
await bulkMoveServers([1, 2, 3], targetFolderId);

// Archive multiple
await bulkArchiveServers([1, 2, 3], 'Unused');

// Tag multiple
await bulkTagServers([1, 2, 3], ['staging', 'test']);
```

### Search & Filter
```typescript
// Search servers
const results = await searchServers('alpha', {
  status: ['online'],
  map_name: 'TheIsland'
});

// Get by status
const online = await getServersByStatus('online');

// Get by tag
const prodServers = await getServersByTag('production');
```

## State Management

```typescript
import { useServerOrganizationStore } from '../stores/serverOrganizationStore';

const MyComponent = () => {
  const {
    folders,
    archivedServers,
    customizations,
    currentFilter,
    currentSort,
    updateServerCustomization,
    toggleServerPin,
    archiveServer,
    addTag
  } = useServerOrganizationStore();

  // Use functions
  const handlePin = () => {
    toggleServerPin(serverId);
  };

  // Access state
  const isPinned = customizations.get(serverId)?.is_pinned;
  const isArchived = archivedServers.has(serverId);
};
```

## Component Usage

### Enhanced Server Card
```typescript
<EnhancedServerCard
  server={server}
  isArchived={isArchived}
  onOpenServer={(server) => console.log(server)}
  onStartServer={(id) => startServer(id)}
  onStopServer={(id) => stopServer(id)}
  onRestartServer={(id) => restartServer(id)}
  onDeleteServer={(id) => deleteServer(id)}
  onArchive={(id) => archiveServer(id)}
  onRestore={(id) => restoreServer(id)}
/>
```

### Enhanced Dashboard
```typescript
<EnhancedDashboard
  onServerSelect={(server) => navigate(`/server/${server.id}`)}
  onStartServer={handleStart}
  onStopServer={handleStop}
  onRestartServer={handleRestart}
  onDeleteServer={handleDelete}
  onArchiveServer={handleArchive}
  onRestoreServer={handleRestore}
/>
```

### Server Folder
```typescript
<ServerFolder
  folder={folder}
  servers={servers}
  onSelectFolder={(folder) => setSelected(folder)}
  onDeleteFolder={(id) => deleteFolder(id)}
  onRenameFolder={(id, name) => renameFolder(id, name)}
  onAddServerToFolder={(sid, fid) => addToFolder(sid, fid)}
/>
```

### Search Filter
```typescript
<ServerSearchFilter
  servers={servers}
  onFiltered={(filtered) => setFiltered(filtered)}
  onFilterChange={(filter) => console.log(filter)}
  onSortChange={(sort) => console.log(sort)}
  showAdvanced={true}
/>
```

## Common Patterns

### Initialize on Mount
```typescript
useEffect(() => {
  const loadData = async () => {
    const folders = await getAllFolders();
    const archived = await getArchivedServers();
    setFolders(folders);
    setArchivedServers(archived);
  };
  loadData();
}, []);
```

### Handle Errors
```typescript
try {
  await createServerFolder({ name: 'New Folder' });
  toast.success('Folder created');
} catch (error) {
  toast.error(`Failed: ${error.message}`);
}
```

### Filter and Sort
```typescript
const filtered = useMemo(() => {
  let result = servers;

  // Apply filters
  if (filter.status?.length) {
    result = result.filter(s => filter.status.includes(s.status));
  }

  // Apply sort
  result.sort((a, b) => {
    if (sort.sort_by === 'name') {
      return sort.sort_order === 'asc' 
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    }
    return 0;
  });

  return result;
}, [servers, filter, sort]);
```

## State Patterns

### Pin Server
```typescript
const { customizations, updateServerCustomization } = useServerOrganizationStore();

const handlePin = (serverId: number) => {
  const current = customizations.get(serverId);
  updateServerCustomization({
    ...(current || createDefault()),
    is_pinned: !current?.is_pinned,
  });
};
```

### Archive Server
```typescript
const { archiveServer, restoreServer } = useServerOrganizationStore();

const handleArchive = (serverId: number) => {
  archiveServer(serverId, 'Manual archive', 'No longer needed');
};

const handleRestore = (serverId: number) => {
  restoreServer(serverId);
};
```

### Add Tag
```typescript
const { addServerTag } = useServerOrganizationStore();

const handleTag = (serverId: number, tag: string) => {
  addServerTag(serverId, tag);
};
```

## Performance Tips

1. **Memoize computations**
   ```typescript
   const filtered = useMemo(() => filterServers(servers, filter), [servers, filter]);
   ```

2. **Use Map for lookups**
   ```typescript
   const customization = customizations.get(serverId); // O(1)
   ```

3. **Batch updates**
   ```typescript
   await bulkMoveServers([1, 2, 3], folderId); // 1 request for 3 servers
   ```

4. **Lazy load details**
   ```typescript
   // Only load when needed, not on mount
   const handleExpandServer = async (serverId) => {
     const stats = await getServerActivityStats(serverId);
   };
   ```

## Debugging

### Enable Logging
```typescript
// In utils/serverOrganization.ts
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  try {
    console.debug('API call starting...');
    const result = await fn();
    console.debug('API call succeeded:', result);
    return result;
  } catch (error) {
    console.error('API call failed:', error);
    return fallback;
  }
}
```

### Check Store State
```typescript
// In console
const store = require('./stores/serverOrganizationStore').useServerOrganizationStore.getState();
console.log('Folders:', store.folders);
console.log('Archived:', store.archivedServers);
```

### Monitor Re-renders
```typescript
import { Profiler } from 'react';

<Profiler id="dashboard" onRender={onRenderCallback}>
  <EnhancedDashboard {...props} />
</Profiler>
```

## API Reference Quick Lookup

| Function | Purpose | Returns |
|----------|---------|---------|
| `createServerFolder()` | Create new folder | `ServerFolder` |
| `getAllFolders()` | List all folders | `ServerFolder[]` |
| `getFolderHierarchy()` | Get folder with children | `ServerFolder` |
| `addServerToFolder()` | Add server to folder | `void` |
| `archiveServer()` | Archive inactive server | `ServerArchive` |
| `restoreServer()` | Restore from archive | `void` |
| `updateServerCustomization()` | Customize display | `ServerCustomization` |
| `createDashboardLayout()` | Save layout preset | `DashboardLayout` |
| `bulkMoveServers()` | Move multiple servers | `void` |
| `searchServers()` | Full-text search | `any[]` |
| `getDashboardStatistics()` | Get system stats | `DashboardStatistics` |

## Troubleshooting

### Servers not updating
- Check if `setServers()` is called after API changes
- Verify store is initialized on mount
- Look for console errors

### Archive not working
- Ensure database migration is applied
- Check Tauri permissions
- Verify server ID exists

### Folder hierarchy not showing
- Check `parent_folder_id` is set correctly
- Verify `getFolderHierarchy()` recursion
- Test with simple folder first

### Performance slow
- Use React DevTools Profiler
- Check for unnecessary re-renders
- Enable memoization
- Review database indexes

---

For more details, see:
- **IMPLEMENTATION_GUIDE.md** - Full integration guide
- **SERVER_ORGANIZATION_SUMMARY.md** - Complete overview
- Source code comments for detailed explanations
