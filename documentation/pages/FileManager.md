# 📂 File Manager Page

The File Manager provides a Windows-like explorer interface for managing server files, configuration backups, and local storage directly within the application.

## 📝 Component Overview
- **File Path**: `src/pages/FileManager.tsx`
- **Tauri Commands**: `read_directory`, `read_file_content`, `write_file_content`, `create_directory`, `delete_item`.
- **Features**: Multi-drive Support, Built-in Text Editor, File Lifecycle Operations, Navigation History.

## 🚀 Key Features

### 1. Integrated File Explorer
- **Multi-Drive Access**: Automatically detects all local disk drives (C:, D:, etc.) and provides real-time storage capacity indicators.
- **Navigation Controls**: Back, Forward, and Up navigation buttons with path history.
- **View Modes**: Toggle between a **Grid View** (large icons) and a **List View** (detailed metadata like size and last modified date).
- **Quick Access**: Sidebar shortcuts for common server directories and user folders.

### 2. Built-in Text Editor
- **Direct Editing**: Open any text-based file (INI, JSON, CFG, TXT) in a monospaced editor without leaving the application.
- **Syntax Awareness**: Designed for clean editing of server configuration files.
- **Save & Refresh**: Save changes directly to disk via Tauri's high-privilege backend.

### 3. Core File Operations
- **Creation & Management**: Create new folders, rename files/directories, and delete items.
- **Search**: Instant local filtering of files within the current directory.
- **Explorer Handoff**: "Open in Explorer" button to launch the standard Windows File Explorer at the current path.

### 4. Storage Insights
- **Drive Health**: Visual progress bars showing used vs. available space for every connected drive.
- **File Metadata**: Displays exact file sizes and precise modification timestamps.

## 🛠️ Technical Details

### File Entry Structure
The frontend processes file data from Rust using this interface:
```typescript
interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    size: number;
    last_modified: number;
}
```

### Safety Policy
Deletion commands require explicit user confirmation via a modal to prevent accidental data loss.

## 🎨 UI/UX Patterns
- **Glassmorphic Sidebar**: Semi-transparent sidebar for quick navigation using the "Liquid Glass" design system.
- **Status Context Bar**: When a file is selected, a top-mounted "Context Bar" appears with relevant actions (Rename, Delete).
- **Responsive Layout**: Automatically adjusts the grid density based on the window size.
