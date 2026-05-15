# 📜 Tribe Log Viewer Page

The Tribe Log Viewer is a specialized diagnostic tool that parses and visualizes in-game tribe history, providing server admins with a clear timeline of player and tribe activities.

## 📝 Component Overview
- **File Path**: `src/pages/tools/TribeLogViewer.tsx`
- **Associated Service**: `getTribeLogs` (Backend)
- **Features**: Event Timeline, Categorized Filtering, Statistics Dashboard, In-game Day Grouping.

## 🚀 Key Features

### 1. Event Timeline (📅)
- **Day-based Grouping**: Events are automatically grouped by the in-game Day (e.g., Day 450, Day 451), making it easy to track historical progression.
- **Visual Cues**: Each event type features a unique color-coded icon (Skull for deaths, Heart for tames, Hammer for structures).
- **Precise Timestamps**: When available, in-game timestamps are displayed alongside the event message.

### 2. Intelligent Event Categorization
The viewer recognizes and prioritizes several critical event types:
- **Deaths**: Tamed dinos killed, tribe members killed, or enemies neutralized.
- **Tames**: Successful creature tames and claims.
- **Structures**: Structures destroyed by enemies or demolished by the tribe.
- **Personnel**: New members joining or existing members leaving the tribe.
- **Misc**: Tribe name changes and server transfers.

### 3. Statistics Dashboard
Real-time summary cards at the top of the page provide an instant overview of:
- **Total Entries**: Number of events parsed in the current session.
- **Deaths Counter**: Aggregated count of all kill events.
- **Tame Counter**: Total count of all taming events.
- **Destruction Counter**: Combined count of destroyed and demolished structures.

### 4. Advanced Filtering
- **Type Filtering**: Quickly toggle between event categories (e.g., show only deaths).
- **Live Search**: Search through event messages to find specific player names, dino types, or location keywords.

## 🛠️ Technical Details

### Event Configuration
The UI uses a central `EVENT_CONFIG` mapping to maintain visual consistency:
```typescript
const EVENT_CONFIG = {
    tamed: { icon: Heart, color: 'text-pink-400', label: 'Tamed' },
    killed: { icon: Skull, color: 'text-red-400', label: 'Killed' },
    // ...
};
```

### Performance
The viewer is optimized to handle large logs (up to 500 entries at once) without impacting UI responsiveness, using efficient grouping logic.

## 🎨 UI/UX Patterns
- **Timeline Thread**: A vertical line connects events within a day, reinforcing the chronological flow.
- **Glassmorphic Stats**: High-prestige cards with subtle background blurs and vivid icons.
- **Responsive Badges**: Event type badges change color dynamically based on severity (Red for critical loss, Cyan for growth).
