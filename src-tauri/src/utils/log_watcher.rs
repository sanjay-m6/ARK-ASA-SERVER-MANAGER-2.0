use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};

#[derive(Clone, Debug)]
pub struct LogWatcherConfig {
    pub poll_interval_ms: u64,
}

impl Default for LogWatcherConfig {
    fn default() -> Self {
        Self {
            poll_interval_ms: 500,
        }
    }
}

pub struct LogWatcher {
    path: PathBuf,
    config: LogWatcherConfig,
    running: Arc<AtomicBool>,
}

impl LogWatcher {
    pub fn new(path: PathBuf, config: Option<LogWatcherConfig>) -> Self {
        Self {
            path,
            config: config.unwrap_or_default(),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self) -> mpsc::Receiver<String> {
        let (tx, rx) = mpsc::channel(100);
        let path = self.path.clone();
        let running = self.running.clone();
        let poll_interval = self.config.poll_interval_ms;

        running.store(true, Ordering::Relaxed);

        tokio::spawn(async move {
            let mut file = match File::open(&path) {
                Ok(f) => f,
                Err(e) => {
                    println!("❌ LogWatcher failed to open file {:?}: {}", path, e);
                    return;
                }
            };

            // Seek to end of file initially
            let _ = file.seek(SeekFrom::End(0));
            let mut pos = file.stream_position().unwrap_or(0);

            let mut reader = BufReader::new(file);

            while running.load(Ordering::Relaxed) {
                if let Ok(current_len) = std::fs::metadata(&path).map(|m| m.len()) {
                    if current_len < pos {
                        // File truncated/rotated
                        pos = 0;
                        let _ = reader.seek(SeekFrom::Start(0));
                    } else if current_len > pos {
                        let _ = reader.seek(SeekFrom::Start(pos));
                        let mut line = String::new();

                        while let Ok(bytes_read) = reader.read_line(&mut line) {
                            if bytes_read == 0 {
                                break;
                            }

                            // If we hit EOF before a newline, it's a partial line write.
                            // Break out and retry on the next poll when more data is appended.
                            if !line.ends_with('\n') {
                                break;
                            }

                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                let _ = tx.send(trimmed.to_string()).await;
                            }

                            pos += bytes_read as u64;
                            line.clear();
                        }
                    }
                }

                sleep(Duration::from_millis(poll_interval)).await;
            }
        });

        rx
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}
