use rusqlite::{Connection, Result};

fn main() -> Result<()> {
    let conn = Connection::open("D:/project/ARK-ASA-SERVER-MANAGER-2.0-main/src-tauri/data.db")?;

    let mut stmt = conn
        .prepare("SELECT id, name, admin_password, server_password FROM servers WHERE id = 69")?;
    let server_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;

    for server in server_iter {
        let (id, name, admin_pw, server_pw) = server?;
        println!("ID: {}", id);
        println!("Name: '{}'", name);
        println!("Admin Password: '{:?}'", admin_pw);
        println!("Server Password: '{:?}'", server_pw);

        if let Some(pw) = admin_pw {
            print!("Admin Password bytes: ");
            for b in pw.bytes() {
                print!("{} ", b);
            }
            println!();
        }
    }

    Ok(())
}
