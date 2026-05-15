# Task Scheduler

The Task Scheduler allows you to automate repetitive administrative actions, ensuring your server remains updated, backed up, and optimized without manual intervention.

## Creating Scheduled Tasks

Tasks are configured with a specific action and a recurring schedule (Cron-style or simple intervals).

### Common Automation Scenarios
- **Daily Restarts**: Perform a server restart at 4:00 AM to clear memory and apply pending updates.
- **Hourly Backups**: Automatically snapshot the world data every 60 minutes.
- **Message Broadcasts**: Send automated announcements (e.g., "Discord: discord.gg/example") every 30 minutes.
- **Dino Wipes**: Execute `DestroyWildDinos` once a week to keep creature spawns fresh.

## Execution Rules

- **Pre-Execution Warnings**: For tasks involving a restart, you can configure a "Warning Sequence" (e.g., broadcasts at 10m, 5m, and 1m before shutdown).
- **Conditionals**: Set tasks to only run if specific conditions are met (e.g., "Only restart if player count is zero").
- **Retry Logic**: If a task fails (e.g., backup fails due to disk space), the scheduler can attempt a retry after a set delay.

## Monitoring & Logs

The Scheduler page provides a visual timeline of:
- **Upcoming Tasks**: See exactly when the next automation will trigger.
- **Run History**: A detailed log of past executions, including timestamps and success/failure status.
- **Manual Trigger**: Need to run a daily task right now? Click the "Run Now" button to execute it immediately without affecting the schedule.

## Global Settings

- **Paused Mode**: Temporarily disable all scheduled tasks across all servers (useful during major maintenance or game updates).
- **Concurrent Tasks**: Limit how many automated tasks can run at once to prevent system performance spikes.

---
*Tip: Use the "Smart Update" action to combine a backup, update, and restart into a single automated workflow.*
