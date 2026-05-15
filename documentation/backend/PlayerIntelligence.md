# 🧠 Player Intelligence Service

The Player Intelligence service is the behavioral analytics engine for the server manager, responsible for tracking player sessions, calculating playtime, and maintaining real-time occupancy data across the cluster.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/player_intelligence.rs`
- **Mechanism**: State-Persistent Session Mapping.
- **Core Functionality**: Playtime Tracking, Session Lifecycle Management, Per-Server Occupancy Metrics.

## 🚀 Key Features

### 1. Real-time Session Tracking (⏱️)
- **Cluster-Wide Memory**: Maintains a live map of every player currently connected to any server in the manager's fleet.
- **Join/Leave Events**: Captures precise timestamps for player joins and departures, allowing for sub-minute accuracy in session tracking.
- **Deduplication**: Uses SteamID as the primary key to ensure that a player moving between servers in a cluster is tracked correctly as they transition.

### 2. Playtime Analytics
- **Duration Calculation**: Automatically calculates the length of each session (in minutes) upon a player's departure.
- **Historical Context**: Facilitates the tracking of "Total Playtime" and "Last Seen" metrics, which are stored in the persistent database for administrative auditing.
- **Session Archiving**: Converts active memory-based sessions into permanent database records for use in the "Players" dashboard.

### 3. Occupancy Metrics (📈)
- **Live Counters**: Provides an instantaneous count of active players per server ID.
- **Cluster Aggregation**: Powers the global status reports used by the Discord Bridge, providing a "Total Players Online" metric across all maps.

### 4. Graceful Cleanup Logic
- **Server Shutdown Protection**: Implements a bulk-cleanup method that gracefully terminates all active sessions associated with a server if that server is stopped or crashes unexpectedly. This prevents "Ghost Players" from appearing in the dashboard.

## 🛠️ Technical Details

### Player Session Model
```rust
pub struct PlayerSession {
    pub server_id: i64,
    pub steam_id: String,
    pub player_name: String,
    pub joined_at: String, // RFC3339 Timestamp
    pub left_at: Option<String>,
}
```

### Memory-State Management
The service uses an asynchronous mutex to protect the session map, ensuring thread-safety when being accessed by the RCON polling loop and the Discord Bridge simultaneously.
```rust
active_sessions: Arc<Mutex<HashMap<String, (i64, String, chrono::DateTime<chrono::Local>)>>>,
```

## 🎨 Developer Notes
- **Extensibility**: The service is designed to be the foundation for future "Player Reputation" and "Engagement Scoring" features.
- **Integration**: Works in tandem with the `AntiCheatService` to correlate player behavior with session longevity.
