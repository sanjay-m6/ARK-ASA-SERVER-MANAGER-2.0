# Patch Notes v2.3.0

## What's New
- **Config Hot-Reloading** — Config changes now selectively update `Game.ini` and `GameUserSettings.ini` in real-time, completely skipping the unnecessary full database rewrite.
- **Restart Notification Control** — Running servers now gracefully prompt a dismissable "Restart required" toast instead of forcefully reloading the database when saving config changes.
- **Enhanced Performance Metrics** — Charts now use rounded memory values, display formatted tooltips, and poll every 10 seconds for a smoother monitoring experience.

## Bug Fixes
- **CPU Tracking** — Fixed CPU usage measurement system returning 0% by utilizing a targeted `refresh_cpu_usage` mechanism over `refresh_all()`.
- **Build Stability** — Removed extraneous `test_sys.rs` binary configuration causing build conflict errors (`cargo run`).
