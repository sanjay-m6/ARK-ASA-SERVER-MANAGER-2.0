# 📂 File Manager

The File Manager is the application's native-grade filesystem orchestration hub. It provides direct, high-performance access to your server's physical storage, allowing for rapid file manipulation, configuration editing, and storage auditing without leaving the manager.

## 📝 Page Overview
- **Route**: `/tools/files`
- **Purpose**: Physical disk management, directory navigation, integrated text editing, and filesystem maintenance.
- **Aesthetic**: Technical "Cyan & Black" interface featuring glassmorphism panels, interactive storage gauges, and a native-style navigation suite.

## 🚀 Key Modules

### 1. Native Drive Discovery (💽)
Monitor and navigate your physical infrastructure:
- **Disk Health Gauges**: The manager automatically identifies all connected physical drives, mount points, and real-time storage availability, visualizing disk pressure with interactive progress bars.
- **Intelligent Path Navigation**: A robust address bar system that supports manual path entry, recursive directory jumping, and historical navigation (Back/Forward) just like a native OS explorer.
- **Quick Access Bookmarks**: One-click shortcuts to critical server locations (e.g., `ARK Servers`, `Users`), allowing you to bypass complex directory structures.

### 2. Integrated Content Editor (📝)
Modify server configurations with zero friction:
- **In-App Text Suite**: Open and edit any text-based file (INI, JSON, LOG, BAT) directly within the application. No external text editors required.
- **Secure Write-Back**: Save your changes directly to the disk with one click. The manager handles all filesystem permissions and encoding automatically.
- **Forensic Metadata View**: Toggle between "Grid View" for visual organization and "List View" for technical audits, including file sizes and "Last Modified" timestamps.

### 3. Filesystem Operations Suite (🛠️)
Full administrative control over your data:
- **Dynamic Action Bar**: Selecting any file or folder reveals a context-aware action bar, providing instant access to rename, delete, or move operations.
- **Folder Orchestration**: Easily create new directory structures for mod staging, backup organization, or custom script storage.
- **External Explorer Bridge**: Instantly open any folder in the Windows File Explorer if you need to perform complex external operations or drag-and-drop file transfers.

### 4. Productivity & Search (🔍)
Locate and manage data at scale:
- **Real-Time Directory Filter**: Instantly filter hundreds of files in a directory to find specific logs or configuration snippets using the live search engine.
- **Parent Directory Jumping**: Navigate up the folder hierarchy with a single click using the intelligent "Level Up" control.
- **Technical Footer Audit**: View precise item counts and specific metadata for your current selection, including accurate byte-to-GB size conversions.

## 🛠️ Interface Controls
- **Address Bar [Monitor]**: View and manually edit the current filesystem path.
- **New Folder [Plus]**: Create a new directory at the current location.
- **Open in Explorer [External]**: Launch the current path in Windows File Explorer.
- **View Toggle [Grid/List]**: Switch between visual and technical display modes.
- **Save Changes [Save]**: Commit edits from the built-in text editor to the physical disk.

## 🎨 Design Notes
- **Infrastructure Aesthetic**: Uses vibrant cyan accents and deep black panels to distinguish the "Core Storage" layer of the application.
- **Interactive Feedback**: Features smooth transitions, pulsing loading indicators, and high-contrast monospaced fonts for technical accuracy.
- **Glassmorphism Detail**: Modals and sidebars use semi-transparent blurred backgrounds to maintain visual depth and premium feel.
