use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatEvent {
    pub event: String,
    pub attacker: String,
    pub tribe: String,
    pub target: String,
    pub damage: f32,
    pub timestamp: u64,
}

pub struct CombatMetricsServerService {
    app_handle: AppHandle,
    shutdown_tx: broadcast::Sender<()>,
}

impl CombatMetricsServerService {
    pub fn new(app_handle: AppHandle) -> Self {
        let (shutdown_tx, _) = broadcast::channel(1);
        Self {
            app_handle,
            shutdown_tx,
        }
    }

    /// Starts the TCP listener on 127.0.0.1:30100 in a background async task.
    pub fn start(&self) {
        let app_handle = self.app_handle.clone();
        let mut shutdown_rx = self.shutdown_tx.subscribe();
        
        tauri::async_runtime::spawn(async move {
            let addr = "127.0.0.1:30100";
            let listener = match TcpListener::bind(addr).await {
                Ok(l) => {
                    log::info!("[CombatMetrics] TCP server listening on {}", addr);
                    l
                }
                Err(e) => {
                    log::error!("[CombatMetrics] Failed to bind TCP server on {}: {}", addr, e);
                    return;
                }
            };

            loop {
                tokio::select! {
                    accept_res = listener.accept() => {
                        match accept_res {
                            Ok((socket, client_addr)) => {
                                log::info!("[CombatMetrics] Connection accepted from game server: {}", client_addr);
                                let app_handle_clone = app_handle.clone();
                                let mut client_shutdown = shutdown_rx.resubscribe();

                                // Spawn task to read from this connection
                                tauri::async_runtime::spawn(async move {
                                    let mut reader = BufReader::new(socket);
                                    let mut line = String::new();

                                    loop {
                                        line.clear();
                                        tokio::select! {
                                            read_res = reader.read_line(&mut line) => {
                                                match read_res {
                                                    Ok(0) => {
                                                        log::info!("[CombatMetrics] Client disconnected: {}", client_addr);
                                                        break;
                                                    }
                                                    Ok(_) => {
                                                        let trimmed = line.trim();
                                                        if trimmed.is_empty() {
                                                            continue;
                                                        }
                                                        
                                                        // Attempt to parse combat event JSON
                                                        if let Ok(event) = serde_json::from_str::<CombatEvent>(trimmed) {
                                                            // Emit to Tauri frontend
                                                            let _ = app_handle_clone.emit("combat_event", event);
                                                        } else {
                                                            log::warn!("[CombatMetrics] Failed to parse event payload: {}", trimmed);
                                                        }
                                                    }
                                                    Err(e) => {
                                                        log::error!("[CombatMetrics] Error reading socket: {}", e);
                                                        break;
                                                    }
                                                }
                                            }
                                            _ = client_shutdown.recv() => {
                                                log::info!("[CombatMetrics] Shutting down client socket for {}", client_addr);
                                                break;
                                            }
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                log::error!("[CombatMetrics] Error accepting connection: {}", e);
                            }
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        log::info!("[CombatMetrics] Shutting down TCP listener");
                        break;
                    }
                }
            }
        });
    }

    /// Stops the TCP listener and terminates client connections.
    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(());
        log::info!("[CombatMetrics] Sent shutdown signal to server.");
    }
}
