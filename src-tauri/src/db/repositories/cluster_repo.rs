use rusqlite::{params, Connection};
use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterRecord {
    pub id: i64,
    pub name: String,
    pub cluster_id_string: Option<String>,
}

pub struct ClusterRepository;

impl ClusterRepository {
    pub fn get_all(conn: &Connection) -> AppResult<Vec<ClusterRecord>> {
        let mut stmt = conn.prepare("SELECT id, name, cluster_id_string FROM clusters ORDER BY id ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(ClusterRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                cluster_id_string: row.get(2)?,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    pub fn get_by_id(conn: &Connection, id: i64) -> AppResult<Option<ClusterRecord>> {
        let mut stmt = conn.prepare("SELECT id, name, cluster_id_string FROM clusters WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ClusterRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                cluster_id_string: row.get(2)?,
            }))
        } else {
            Ok(None)
        }
    }
}
