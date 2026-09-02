use rusqlite::{params, Connection};
use crate::error::AppResult;

pub struct ModRepository;

impl ModRepository {
    pub fn get_enabled_mod_ids_for_server(conn: &Connection, server_id: i64) -> AppResult<Vec<String>> {
        let mut stmt = conn.prepare(
            "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        )?;
        let rows = stmt.query_map(params![server_id], |row| row.get::<_, String>(0))?;
        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    pub fn get_enabled_ase_mod_ids_for_server(conn: &Connection, server_id: i64) -> AppResult<Vec<String>> {
        let mut stmt = conn.prepare(
            "SELECT workshop_id FROM ase_mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        )?;
        let rows = stmt.query_map(params![server_id], |row| row.get::<_, String>(0))?;
        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    pub fn delete_mod(conn: &Connection, server_id: i64, mod_id: &str) -> AppResult<usize> {
        let rows_affected = conn.execute(
            "DELETE FROM mods WHERE server_id = ?1 AND mod_id = ?2",
            params![server_id, mod_id],
        )?;
        Ok(rows_affected)
    }
}
