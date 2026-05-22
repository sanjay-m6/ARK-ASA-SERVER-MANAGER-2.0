- `src/components/server/EnhancedServerCard.tsx` (or equivalent Server Card components)
- `src/components/server/EnhancedDashboard.tsx`
- `src/pages/ServerManager.tsx` / `Dashboard.tsx` (Server list and Drag & Drop Context)
- `src/stores/serverStore.ts` (Store logic for custom server ordering and renaming)

## Task Breakdown

### Task 1: Inline Server Renaming
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `react-patterns`
- **Priority:** High
- **Dependencies:** None
- **INPUT→OUTPUT→VERIFY:** 
  - Input: Server name double-click event.
  - Output: Input field appears, allows renaming, saves on blur/Enter.
  - Verify: Changing the name updates the store and persists the new name without breaking folder references.

### Task 2: Expand/Collapse Server Cards
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`
- **Priority:** High
- **Dependencies:** None
- **INPUT→OUTPUT→VERIFY:** 
  - Input: Click on the highlighted server card outline.
  - Output: Toggles `isExpanded` state; Framer Motion animates the height to reveal Install Path, Max Players, and other secondary details.
  - Verify: Clicking collapses/expands the details section smoothly.

### Task 3: Dropdown Menus for Server Actions
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `react-patterns`
- **Priority:** Medium
- **Dependencies:** None
- **INPUT→OUTPUT→VERIFY:** 
  - Input: Update Server and Server Settings icons.
  - Output: Refactored into Dropdown components. "Update on Start" placed under "Update Server" (turns green if active). "Clone" and "Delete" under "Server Settings".
  - Verify: The UI is cleaner, and dropdown actions work identically to the previous inline buttons.

### Task 4: Drag and Drop Reordering
- **Agent:** `frontend-specialist`
- **Skills:** `react-patterns`
- **Priority:** Medium
- **Dependencies:** Decision on DnD library.
- **INPUT→OUTPUT→VERIFY:** 
  - Input: User drags a server card up or down the list.
  - Output: List visually reorders; backend updates the custom order index.
  - Verify: The order is preserved upon closing and reopening the app.

## Phase X: Verification
- [ ] Run `npm run lint && npx tsc --noEmit`
- [ ] Execute UX Audit script: `python .agent/skills/frontend-design/scripts/ux_audit.py .`
- [ ] Verify no template layouts or purple/violet colors are used.
- [ ] Confirm all features behave as expected manually.
