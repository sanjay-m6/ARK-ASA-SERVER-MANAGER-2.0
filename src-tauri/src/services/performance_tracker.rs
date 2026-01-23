use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceSnapshot {
    pub timestamp: DateTime<Utc>,
    pub cpu_usage: f32,
    pub memory_usage: f64,
    pub player_count: i32,
}

pub struct PerformanceTracker {
    snapshots: Mutex<VecDeque<PerformanceSnapshot>>,
    max_snapshots: usize,
}

impl PerformanceTracker {
    pub fn new(max_snapshots: usize) -> Self {
        PerformanceTracker {
            snapshots: Mutex::new(VecDeque::with_capacity(max_snapshots)),
            max_snapshots,
        }
    }

    pub fn record_snapshot(&self, snapshot: PerformanceSnapshot) {
        let mut snapshots = self.snapshots.lock().unwrap();

        if snapshots.len() >= self.max_snapshots {
            snapshots.pop_front();
        }

        snapshots.push_back(snapshot);
    }

    pub fn get_recent_snapshots(&self, count: usize) -> Vec<PerformanceSnapshot> {
        let snapshots = self.snapshots.lock().unwrap();
        snapshots.iter().rev().take(count).cloned().collect()
    }

    pub fn get_average_cpu(&self) -> f32 {
        let snapshots = self.snapshots.lock().unwrap();
        if snapshots.is_empty() {
            return 0.0;
        }

        let sum: f32 = snapshots.iter().map(|s| s.cpu_usage).sum();
        sum / snapshots.len() as f32
    }

    pub fn get_average_memory(&self) -> f64 {
        let snapshots = self.snapshots.lock().unwrap();
        if snapshots.is_empty() {
            return 0.0;
        }

        let sum: f64 = snapshots.iter().map(|s| s.memory_usage).sum();
        sum / snapshots.len() as f64
    }

    pub fn clear(&self) {
        let mut snapshots = self.snapshots.lock().unwrap();
        snapshots.clear();
    }
}

impl Default for PerformanceTracker {
    fn default() -> Self {
        Self::new(1000) // Keep last 1000 snapshots (about 16 minutes at 1s intervals)
    }
}
