import Database from 'better-sqlite3';
import path from 'path';

const appDataDir = process.env.APPDATA || process.env.HOME + '/AppData/Roaming';
const dbPath = path.join(appDataDir, 'com.asa-server-manager', 'asa_manager.db');

console.log('Opening DB at:', dbPath);
try {
    const db = new Database(dbPath);
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('discord_alerts_config');
    console.log('discord_alerts_config:', row ? row.value : 'NOT SET');

    const webhookRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('discord_webhook_url');
    console.log('discord_webhook_url length:', webhookRow ? webhookRow.value.length : 0);

    if (webhookRow && webhookRow.value) {
        console.log('Testing webhook send...');
        const url = webhookRow.value;
        const payload = {
            embeds: [{
                title: "🟢 Server Online",
                description: "**My ASA Server** is now online and accepting players!",
                color: 2278750,
                footer: { text: "ASA Server Manager 2.0" },
                timestamp: new Date().toISOString()
            }]
        };

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(res => {
            console.log('Discord webhook response status:', res.status, res.statusText);
            return res.text();
        }).then(text => {
            console.log('Discord response body:', text);
        }).catch(err => {
            console.error('Webhook fetch error:', err);
        });
    }

} catch (e) {
    console.error("Failed", e);
}
