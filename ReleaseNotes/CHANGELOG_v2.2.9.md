# ASA Server Manager - Patch Notes (v2.2.9 Hotfixes)

## Bug Fixes & Stability

* **Discord Webhook Reliability**: Fixed a major issue where `serverStart`, `playerJoin`, and `serverCrash` discord notifications were failing to send. The notification triggers have been synchronized with the live console output to ensure they fire instantly and reliably when the server comes online.
* **Game.ini Data Loss Prevented**: Resolved a critical bug where custom `Game.ini` configurations (such as `OverridePlayerLevelEngramPoints`, `NPCReplacements`, and other array-based settings) were being silently deleted. The internal configuration parser has been rewritten to safely preserve arrays and duplicate keys exactly as initialized.
* **Cluster Status Accuracy**: The Cluster Manager UI will now accurately display real-time live server counts (e.g., "2/2 Active") instead of falling out of sync or displaying stale database information.
* **Infinite Loading Screen Fix**: Repaired a race condition scenario that caused servers to get permanently stuck on "STARTING..." in the UI even when the server had successfully booted and was online.
* **Database Startup Crash**: Fixed a critical schema mismatch relating to the Task Scheduler that prevented the application from starting entirely for some users.

## Features & UI Improvements

* **Cross-Chat Discord Bridge**: Heavily improved the Discord Bot Bridge. Cross-server chat is now fully operational, properly bridging in-game chat to discord and relaying Discord messages back into the game seamlessly.
* **Force Stop UI Enhancement**: Removed the ugly, native OS popup window when clicking "Force Stop". It has been replaced with the premium, styled in-app confirmation modal for a much cleaner user experience.
