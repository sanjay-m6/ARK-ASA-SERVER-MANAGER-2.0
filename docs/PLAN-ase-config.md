# PLAN: Comprehensive ASE Server Configuration System Upgrade

This project plan details the roadmap for a comprehensive upgrade of the ARK: Survival Evolved (ASE) Configuration Editor. It integrates 22 new advanced parameters across chat/voice, PvP/PvE rules, platform structures, harvesting rates, decay, and environment/flyers. It also includes modernizing the visual interface with the official **Amber/Gold theme (`#fbbf24` / `amber-500`)** in a premium glassmorphic dark design, and resolving any layout or rendering performance lag.

## Project Type
- **WEB** (React, TypeScript, Vite, Tauri Rust Backend)

---

## Success Criteria
1. **End-to-End Integration**: All 22 new configuration keys successfully parsed from and written to `GameUserSettings.ini` and `Game.ini` by the Tauri backend.
2. **TypeScript Integrity**: Strict typing matches across the Tauri Rust models and frontend types.
3. **UI Modernization**: 
   - Clean, amber-themed, glassmorphic layout aligning labels, descriptions, and inputs.
   - Smooth, micro-animated sliding toggle switches replacing raw text buttons.
   - Fluid grid spacing with optimized vertical flow.
4. **Performance optimization**: Stutter-free rendering and zero-lag typing, utilizing memoized components.
5. **Robust Backwards Compatibility**: Ensuring unmapped keys inside existing `GameUserSettings.ini` and `Game.ini` are never destroyed during write operations.

---

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons, Zustand (state management)
- **Backend**: Rust, Tauri, `ini` parser/formatter library, SQLite (metadata syncing)

---

## File Structure
No new files will be created in the main application logic; we will modify existing config pipeline structures.

- [MODIFY] [models.rs](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/ase/models.rs) - Expand `AseGameConfig` struct and defaults.
- [MODIFY] [config.rs](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/src/ase/commands/config.rs) - Update INI parser/writer loops.
- [MODIFY] [ase.types.ts](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src/ase/types/ase.types.ts) - Expose new TS interfaces.
- [MODIFY] [ASEConfigEditor.tsx](file:///d:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src/ase/pages/ASEConfigEditor.tsx) - Implement new schema, custom sliding switches, responsive alignment, and React performance optimization.

---

## User Review Required & Socratic Gate

Before beginning execution, we need your feedback on the following design choices:

> [!IMPORTANT]
> **1. Collapsible Card Groups vs. Dense Lists**:
> With 22 new options, some tabs will contain over 30 options. Do you prefer grouping them into **collapsible visual cards** (keeps layout clean) or an **all-open dense grid layout** (exposes everything at once)?
> 
> **2. Quick Multiplier Presets**:
> Should we add quick scale presets (e.g. `2x`, `5x`, `10x`) at the top of the "Rates & Multipliers" tab to automatically scale core XP, taming, breeding, and harvest rates in one click?
> 
> **3. Map-Specific Visibility Rules**:
> Should we dynamically hide map-specific controls (e.g., Ragnarok volcano parameters) unless the server is actively running that map, or always display them under a dedicated "Map Features" card?
> 
> **4. Validation Safety Banner**:
> Would you like a warning header that alerts the user of conflicting options (e.g., enabling both `serverPve` and `pvpStructureDecay`) to prevent server launch bugs?

---

## Proposed Tasks & Task Breakdown

### Phase 1: Rust Backend Upgrade
- **Task ID**: `ASE-CONF-RUST-01`
- **Name**: Expand Rust Configuration Model & Defaults
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`, `api-patterns`
- **Priority**: High
- **Dependencies**: None
- **Description**: Add the 22 new fields (chat/voice, PvP/PvE rules, platform structure bounds, harvesting multipliers) to `AseGameConfig` inside `src-tauri/src/ase/models.rs`. Implement standard defaults in the `Default` trait.
- **INPUT**: `src-tauri/src/ase/models.rs`
- **OUTPUT**: Updated `AseGameConfig` struct and default values.
- **VERIFY**: Rust project builds cleanly.
- **ROLLBACK**: Revert changes in `models.rs` via Git.

- **Task ID**: `ASE-CONF-RUST-02`
- **Name**: Update Tauri INI Reading/Writing Commands
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`
- **Priority**: High
- **Dependencies**: `ASE-CONF-RUST-01`
- **Description**: Modify `src-tauri/src/ase/commands/config.rs`. Update `read_ase_config` to read the new properties from `GameUserSettings.ini` and `Game.ini`. Update `build_game_user_settings` and `build_game_ini` to serialize them with six-decimal precision (`{:.6}`).
- **INPUT**: `src-tauri/src/ase/commands/config.rs`
- **OUTPUT**: Fully expanded serializer and deserializer loops.
- **VERIFY**: Check parser tests or build compiles without error.
- **ROLLBACK**: Revert `config.rs` changes.

### Phase 2: TypeScript & IPC Types Update
- **Task ID**: `ASE-CONF-TS-01`
- **Name**: Synchronize TypeScript Interfaces
- **Agent**: `frontend-specialist`
- **Skills**: `clean-code`
- **Priority**: Medium
- **Dependencies**: `ASE-CONF-RUST-02`
- **Description**: Modify `src/ase/types/ase.types.ts` to add the 22 new camelCase configuration keys matching the Rust struct serialized format.
- **INPUT**: `src/ase/types/ase.types.ts`
- **OUTPUT**: Expanded `AseGameConfig` TS interface.
- **VERIFY**: Run type compiler checking: `npx tsc --noEmit`.
- **ROLLBACK**: Revert `ase.types.ts`.

### Phase 3: Visual Design & Responsive UI Build
- **Task ID**: `ASE-CONF-UI-01`
- **Name**: Refactor React Configuration Editor Schema & Default Config
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`, `react-patterns`
- **Priority**: Medium
- **Dependencies**: `ASE-CONF-TS-01`
- **Description**: Add the new settings' default values to `defaultConfig` and insert descriptive entries in the visual `schema` array in `src/ase/pages/ASEConfigEditor.tsx`.
- **INPUT**: `src/ase/pages/ASEConfigEditor.tsx`
- **OUTPUT**: Config schema updated with modern titles, descriptions, and step rules.
- **VERIFY**: Run `npm run dev` and check that the tabs display the new options.
- **ROLLBACK**: Revert `ASEConfigEditor.tsx`.

- **Task ID**: `ASE-CONF-UI-02`
- **Name**: Implement Premium Custom Sliding Switches & Theme Styling
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`, `brand-guidelines-community`
- **Priority**: High
- **Dependencies**: `ASE-CONF-UI-01`
- **Description**: Replace basic Toggle buttons with micro-animated slider switches colored in gold/amber (`#fbbf24`). Clean up alignment of number inputs, textboxes, and borders for a premium finish. Ensure HSL dark panel shadows are utilized.
- **INPUT**: Toggle component in `src/ase/pages/ASEConfigEditor.tsx`
- **OUTPUT**: Sliding toggle switches with fluid state transitions.
- **VERIFY**: Visually test toggle clicks to check for smooth ease-in-out animations.
- **ROLLBACK**: Restore original buttons.

- **Task ID**: `ASE-CONF-UI-03`
- **Name**: Rendering Optimization & Typing Lag Fix
- **Agent**: `frontend-specialist`
- **Skills**: `react-component-performance`
- **Priority**: High
- **Dependencies**: `ASE-CONF-UI-02`
- **Description**: Optimize form fields. Memoize input components (`TextInput`, `NumberInput`, `Toggle`) and group lists to prevent full-page re-renders during state mutations.
- **INPUT**: `src/ase/pages/ASEConfigEditor.tsx`
- **OUTPUT**: High performance editor.
- **VERIFY**: Verify typing inputs feel responsive and immediate.
- **ROLLBACK**: Revert performance tweaks.

---

## Phase X: Final Verification

### Automated Verifications
1. **Type checking**:
   ```bash
   npx tsc --noEmit
   ```
2. **Rust application compile check**:
   ```bash
   npm run tauri build -- --no-bundle
   ```
3. **Audit Suite Run**:
   ```bash
   python .agent/scripts/verify_all.py .
   ```

### Rule Compliance (Manual Checklist)
- [ ] Visual identity strictly matches the Amber/Gold theme (`#fbbf24`).
- [ ] No purple/violet accents are present on the ASE view.
- [ ] Micro-animations for toggles are fluid and GPU-optimized.
- [ ] BACKWARDS COMPATIBILITY: Unmapped INI keys remain intact.
