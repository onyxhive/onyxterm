use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use crate::error::AppResult;

const MIGRATIONS: &[&str] = &[
    r#"
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE (workspace_id, path)
);
CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    command TEXT NOT NULL,
    model TEXT NOT NULL,
    effort TEXT NOT NULL,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX chats_by_workspace ON chats (workspace_id, updated_at);
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#,
    "ALTER TABLE chats ADD COLUMN branch TEXT;",
    r#"
CREATE TABLE project_scripts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE INDEX project_scripts_by_project ON project_scripts (project_id, position);
"#,
    "ALTER TABLE chats ADD COLUMN worktree_path TEXT;",
    "ALTER TABLE chats ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'default';",
];

pub struct Db(Mutex<Connection>);

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "foreign_keys", true)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        migrate(&connection)?;
        Ok(Db(Mutex::new(connection)))
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        let connection = Connection::open_in_memory()?;
        connection.pragma_update(None, "foreign_keys", true)?;
        migrate(&connection)?;
        Ok(Db(Mutex::new(connection)))
    }

    pub fn connection(&self) -> MutexGuard<'_, Connection> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn migrate(connection: &Connection) -> AppResult<()> {
    let applied: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    for (index, migration) in MIGRATIONS.iter().enumerate().skip(applied as usize) {
        connection.execute_batch(&format!("BEGIN; {migration} PRAGMA user_version = {}; COMMIT;", index + 1))?;
    }
    Ok(())
}

pub fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|elapsed| elapsed.as_millis() as i64).unwrap_or_default()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
