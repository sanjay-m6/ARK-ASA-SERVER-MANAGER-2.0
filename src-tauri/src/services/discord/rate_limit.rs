// Sliding-window rate limiter for Discord interactions and commands
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct RateLimiter {
    // Maps "action:user_id" -> list of execution timestamps
    records: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            records: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Check if an action is allowed for a user within a time window.
    /// If allowed, registers the current timestamp and returns true.
    /// If exceeded, returns false.
    pub async fn check_and_record(
        &self,
        action: &str,
        user_id: &str,
        max_attempts: usize,
        window: Duration,
    ) -> bool {
        let key = format!("{}:{}", action, user_id);
        let now = Instant::now();
        let mut map = self.records.lock().await;

        let timestamps = map.entry(key).or_default();

        // Prune timestamps older than window
        timestamps.retain(|&t| now.duration_since(t) <= window);

        if timestamps.len() >= max_attempts {
            return false;
        }

        timestamps.push(now);
        true
    }

    /// Clean up expired entries periodically
    pub async fn prune(&self, max_age: Duration) {
        let now = Instant::now();
        let mut map = self.records.lock().await;
        map.retain(|_, timestamps| {
            timestamps.retain(|&t| now.duration_since(t) <= max_age);
            !timestamps.is_empty()
        });
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}
