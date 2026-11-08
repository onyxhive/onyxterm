use std::collections::HashMap;

use rusqlite::params;
use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};

const MAX_KEY_LENGTH: usize = 64;
const MAX_VALUE_LENGTH: usize = 4096;

#[tauri::command]
pub fn get_settings(db: State<'_, Db>) -> AppResult<HashMap<String, String>> {
    let connection = db.connection();
    let mut statement = connection.prepare("SELECT key, value FROM settings")?;
    let settings =
        statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<Result<HashMap<_, _>, _>>()?;
    Ok(settings)
}

#[tauri::command]
pub fn set_setting(db: State<'_, Db>, key: String, value: String) -> AppResult<()> {
    if key.is_empty() || key.len() > MAX_KEY_LENGTH || value.len() > MAX_VALUE_LENGTH {
        return Err(AppError::Invalid("setting key or value is too long".into()));
    }
    db.connection().execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}
