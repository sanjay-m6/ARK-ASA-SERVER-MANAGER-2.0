# ASA Server Manager - Patch Notes (v2.3.1 Hotfix)

## Bug Fixes

* **Server Auto-Shutdown Prevention**: Fixed a critical bug where running servers would unexpectedly terminate without user action. The startup timeout monitor was incorrectly killing servers that temporarily dropped UDP query responses (e.g., during autosave or heavy load), misinterpreting them as stuck startups. Servers now correctly distinguish between an initial startup that never completed and a running server experiencing brief query timeouts.

* **Port Status Accuracy (Port Validator)**: Resolved a fundamental issue where all Game and Query ports were always reported as "Closed" in the Port Validator, even when the server was fully operational and reachable. The port check was using TCP connections to test UDP-only ports (Game Port 7777, Query Port 27015), which always fails. The validator now uses the correct A2S_INFO UDP protocol for game/query ports while still using TCP for RCON ports.

* **Firewall Status Clarity**: Renamed misleading "Open" / "Closed" labels in the Firewall Settings tab to "Configured" / "Unassigned". These labels reflect whether the ASA Server Manager has created Windows Firewall rules for a port — not whether the port is reachable on the network. This prevents confusion when users have manually configured firewall rules or port forwarding through other means.

## Technical Details

* Added `has_been_online` tracking flag to the server process monitor to prevent false-positive startup timeout kills
* Implemented protocol-aware port reachability checking (UDP A2S_INFO query for game/query ports, TCP connect for RCON)
* Updated all frontend-to-backend communication to pass protocol context for accurate port status reporting

## FAQ

**Q: Were there supposed to be Outbound firewall rules as well?**
A: No. ARK servers only require Inbound rules. Windows Firewall allows all outbound traffic by default, so no outbound rules are needed.
