import sqlite3
import os
import sys

def find_database():
    appdata = os.getenv('APPDATA')
    localappdata = os.getenv('LOCALAPPDATA')
    candidates = [
        # Standard Tauri v2 path
        os.path.join(appdata, 'com.asa-server-manager', 'asa_manager.db'),
        # Fallback path if configured differently
        os.path.join(appdata, 'asa-manager', 'asa_manager.db'),
        # Local AppData just in case
        os.path.join(localappdata, 'com.asa-server-manager', 'asa_manager.db'),
    ]

    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def remove_mod(db_path, mod_id):
    print(f"Connecting to database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if mod exists
        cursor.execute("SELECT id, name FROM mods WHERE mod_id = ?", (mod_id,))
        mod = cursor.fetchone()

        if mod:
            print(f"Found mod: {mod[1]} (Internal ID: {mod[0]}) with Mod ID: {mod_id}")
            
            # Delete mod
            cursor.execute("DELETE FROM mods WHERE mod_id = ?", (mod_id,))
            conn.commit()
            
            if cursor.rowcount > 0:
                print(f"Successfully deleted mod {mod_id} from database.")
            else:
                print(f"Failed to delete mod {mod_id}.")
        else:
            print(f"Mod {mod_id} not found in database.")

        # Verify mods table content
        cursor.execute("SELECT mod_id, name FROM mods")
        mods = cursor.fetchall()
        print("Remaining mods:")
        for m in mods:
            print(f" - {m[1]} ({m[0]})")
            
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    db_path = find_database()
    if db_path:
        # Stop the application first? The user might need to restart it anyway.
        # But SQLite WAL mode allows concurrent access usually.
        remove_mod(db_path, "1099949")
    else:
        print("Could not locate 'asa_manager.db'. Please check the application data directory.")
