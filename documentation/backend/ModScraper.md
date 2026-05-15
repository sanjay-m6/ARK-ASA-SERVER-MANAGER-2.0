# 🔍 Mod Scraper Service

The Mod Scraper is the central discovery engine that bridges the manager with the CurseForge (Overwolf) ecosystem, allowing for seamless searching, metadata retrieval, and update monitoring of ARK: Survival Ascended mods.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/mod_scraper.rs`
- **Architecture**: REST API client (Reqwest) with Exponential Backoff.
- **Core Functionality**: Mod Discovery, Direct ID Lookup, Update Auditing, Category Management.

## 🚀 Key Features

### 1. CurseForge V1 Integration (🧶)
- **ASA Scope Enforcement**: Every request is hardcoded with `GameID: 83374`, ensuring that results are strictly filtered for ARK: Survival Ascended and never polluted by other titles.
- **Rich Metadata Acquisition**: Retrieves full mod profiles, including high-resolution thumbnails, download statistics, author information, and summary descriptions.
- **API Key Guard**: Features a robust key verification system that ensures administrators are informed of invalid or missing credentials directly within the mod browser UI.

### 2. Intelligent Search Heuristics
- **Direct ID Routing**: The scraper detects when a user enters a numerical ID (e.g., `928521`) and automatically bypasses keyword search to perform a direct, high-speed ID lookup.
- **Categorical Discovery**: Supports the retrieval and filtering of CurseForge categories, enabling users to browse by specific types like "Maps," "Creatures," or "Total Conversions."
- **Sorting & Ordering**: Allows for complex sorting based on Popularity, Total Downloads, Last Updated, and Featured status.

### 3. Update & Version Watchdog
- **Batch Verification**: Optimized to check for updates across dozens of mods in a single network request, minimizing API overhead and increasing system responsiveness.
- **Delta Detection**: Provides the technical foundation for the `SchedulerService` to detect "Out of Date" mods by comparing local installation timestamps with live repository data.

### 4. Network Resilience (🛡️)
- **Exponential Backoff**: Implements a 3-tier retry strategy for all network operations, gracefully handling transient API hiccups or rate-limiting (`429`) scenarios.
- **Timeout Safety**: Enforces a strict 10-15 second timeout on all requests to ensure the manager UI remains responsive even if the CurseForge backend is experiencing lag.

## 🛠️ Technical Details

### Mod Info Model
```rust
pub struct ModInfo {
    pub id: String,
    pub curseforge_id: Option<i64>,
    pub name: String,
    pub author: Option<String>,
    pub downloads: Option<i64>,
    pub thumbnail_url: Option<String>,
    pub last_updated: Option<String>,
}
```

### Search Logic Flow
1. Sanitize user input.
2. Check if input is a valid Integer (Trigger Direct ID Lookup).
3. If not, construct a multi-parameter search URL with `gameId`, `searchFilter`, and `sortField`.
4. Execute request with `x-api-key` headers and retry on failure.

## 🎨 Developer Notes
- **API Access**: Users must provide their own CurseForge API Key in the application settings to enable the scraper's functionality.
- **Data Persistence**: Search results are transient and are not saved to the local database unless a user explicitly clicks "Install" on a mod.
