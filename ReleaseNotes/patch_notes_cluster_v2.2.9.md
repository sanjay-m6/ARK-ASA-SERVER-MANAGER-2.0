# 🌐 Cluster Patch Notes - v2.2.9

## 🐛 Bug Fixes

### 🗑️ Cluster Deletion — Now Works Correctly
Clusters were failing to delete, leaving orphaned entries in the database. The backend now correctly removes the cluster record and unlinks all associated servers in a single clean operation.

### 🟢 Server Status in Clusters — Fixed
Servers inside a cluster were always appearing **offline** (in Discord bot embeds and the Cluster Manager UI) even when actively running. The root cause was a broken column read in the backend query — `status`, `game_port`, `query_port`, `rcon_port`, and `ip_address` were all silently falling back to defaults. This is now fixed and status reflects reality in real-time.

### ✅ Cluster Validation Dialog — Now Visible
The **Validate** button was running checks but never displaying the result to the user. It now opens a proper modal dialog showing:
- ❌ **Errors** — e.g. duplicate ports across servers, missing cluster ID links
- ⚠️ **Warnings** — e.g. mismatched cluster configurations
- ✅ **All clear** — confirmation message when everything is healthy

---

*These changes affect the Cluster Manager page and all cluster-linked Discord bot status reports.*
