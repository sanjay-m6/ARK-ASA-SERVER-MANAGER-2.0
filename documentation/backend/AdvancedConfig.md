# ⚙️ Advanced Config Service

The Advanced Config service manages high-level server mechanics, specifically focusing on temporal game events and cross-server transfer policies for clustered environments.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/advanced_config.rs`
- **Core Functionality**: Event Profiles, Transfer Policies, Schema Management.
- **Key Use Case**: Automating server "Weekend Events" and regulating Cluster economies.

## 🚀 Key Features

### 1. Event Profile Management (🎟️)
- **Dynamic Overrides**: Allows administrators to create named profiles (e.g., "Triple Harvest Weekend") that temporarily override base server multipliers.
- **Switchable State**: Implements an activation logic that ensures only one event profile is active per server, allowing for rapid switching between "Normal" and "Event" modes.
- **Multiplier Coverage**:
    - **Harvesting**: Global resource yield boost.
    - **Stack Sizes**: Modified item stacking logic.
    - **Structures**: Tunable damage and resistance for base defense balancing.

### 2. Transfer Policies (🚀)
- **Cluster Control**: Provides granular rules for what can be moved between servers in a cluster.
- **Item Whitelisting**: Restricted list of specific item class names allowed for upload/download.
- **Dino Whitelisting**: Controlled list of creature types that can be transferred across maps.
- **Quantity Caps**: Hard limits on the number of items or creatures that can be stored in the cluster cloud.

### 3. Database Persistence
- **SQLite Storage**: All profiles and policies are persisted in the local `ark_manager.db`.
- **Relational Integrity**: Uses foreign key constraints to link configurations to specific server instances.

## 🛠️ Technical Details

### Event Profile Model
```rust
pub struct EventProfile {
    pub profile_name: String,
    pub harvest_multiplier: f32,
    pub stack_size_multiplier: f32,
    pub structure_resistance: f32,
    pub structure_damage: f32,
    pub is_active: bool,
}
```

### Activation Logic
The service uses an atomic "deactivate-then-activate" pattern to prevent multiple conflicting event profiles from being applied simultaneously to the same INI file during generation.

## 🎨 Developer Notes
- **Extensibility**: The transfer policy system is designed to be expanded with "Item Blacklists" and "Quality Restrictions" in future updates.
- **Initialization**: The `init_tables` method is called during the application's startup sequence to ensure the SQLite schema is ready for configuration storage.
