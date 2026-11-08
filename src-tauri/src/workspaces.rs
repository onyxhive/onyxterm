use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::{Db, new_id};
use crate::error::{AppError, AppResult};

const DEFAULT_WORKSPACE_NAME: &str = "Personal";
const MAX_NAME_LENGTH: usize = 80;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub workspace_id: String,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub projects: Vec<Project>,
}

pub fn ensure_default_workspace(connection: &Connection) -> AppResult<()> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }
    insert_workspace(connection, DEFAULT_WORKSPACE_NAME)?;
    Ok(())
}

fn validated_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_NAME_LENGTH {
        return Err(AppError::Invalid(format!("name must be 1 to {MAX_NAME_LENGTH} characters")));
    }
    Ok(trimmed.to_string())
}

fn insert_workspace(connection: &Connection, name: &str) -> AppResult<Workspace> {
    let position: i64 =
        connection.query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM workspaces", [], |row| row.get(0))?;
    let workspace = Workspace { id: new_id(), name: name.to_string(), position, projects: Vec::new() };
    connection.execute(
        "INSERT INTO workspaces (id, name, position) VALUES (?1, ?2, ?3)",
        params![workspace.id, workspace.name, workspace.position],
    )?;
    Ok(workspace)
}

fn projects_of(connection: &Connection, workspace_id: &str) -> AppResult<Vec<Project>> {
    let mut statement = connection
        .prepare("SELECT id, workspace_id, path, name FROM projects WHERE workspace_id = ?1 ORDER BY name")?;
    let projects = statement
        .query_map([workspace_id], |row| {
            Ok(Project { id: row.get(0)?, workspace_id: row.get(1)?, path: row.get(2)?, name: row.get(3)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(projects)
}

pub fn workspaces(connection: &Connection) -> AppResult<Vec<Workspace>> {
    let mut statement = connection.prepare("SELECT id, name, position FROM workspaces ORDER BY position")?;
    let rows = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|(id, name, position)| {
            let projects = projects_of(connection, &id)?;
            Ok(Workspace { id, name, position, projects })
        })
        .collect()
}

pub fn project(connection: &Connection, project_id: &str) -> AppResult<Project> {
    connection
        .query_row("SELECT id, workspace_id, path, name FROM projects WHERE id = ?1", [project_id], |row| {
            Ok(Project { id: row.get(0)?, workspace_id: row.get(1)?, path: row.get(2)?, name: row.get(3)? })
        })
        .optional()?
        .ok_or(AppError::NotFound("project"))
}

fn rename(connection: &Connection, workspace_id: &str, name: &str) -> AppResult<()> {
    let changed = connection.execute("UPDATE workspaces SET name = ?2 WHERE id = ?1", params![workspace_id, name])?;
    if changed == 0 {
        return Err(AppError::NotFound("workspace"));
    }
    Ok(())
}

fn folder_name(path: &Path) -> String {
    path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_else(|| path.display().to_string())
}

fn insert_project(connection: &Connection, workspace_id: &str, path: &Path) -> AppResult<Project> {
    let path_text = path.to_string_lossy().into_owned();
    let existing = connection
        .query_row(
            "SELECT id FROM projects WHERE workspace_id = ?1 AND path = ?2",
            params![workspace_id, path_text],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if let Some(project_id) = existing {
        return project(connection, &project_id);
    }
    let created =
        Project { id: new_id(), workspace_id: workspace_id.to_string(), path: path_text, name: folder_name(path) };
    connection.execute(
        "INSERT INTO projects (id, workspace_id, path, name) VALUES (?1, ?2, ?3, ?4)",
        params![created.id, created.workspace_id, created.path, created.name],
    )?;
    Ok(created)
}

#[tauri::command]
pub fn list_workspaces(db: State<'_, Db>) -> AppResult<Vec<Workspace>> {
    workspaces(&db.connection())
}

#[tauri::command]
pub fn create_workspace(db: State<'_, Db>, name: String) -> AppResult<Workspace> {
    insert_workspace(&db.connection(), &validated_name(&name)?)
}

#[tauri::command]
pub fn rename_workspace(db: State<'_, Db>, workspace_id: String, name: String) -> AppResult<()> {
    rename(&db.connection(), &workspace_id, &validated_name(&name)?)
}

#[tauri::command]
pub async fn add_project(app: AppHandle, db: State<'_, Db>, workspace_id: String) -> AppResult<Option<Project>> {
    let picked = app.dialog().file().set_title("Add project").blocking_pick_folder();
    let Some(folder) = picked else {
        return Ok(None);
    };
    let path: PathBuf = folder.into_path().map_err(|error| AppError::Invalid(error.to_string()))?;
    if !path.is_dir() {
        return Err(AppError::Invalid("the picked path is not a folder".into()));
    }
    insert_project(&db.connection(), &workspace_id, &path).map(Some)
}

#[tauri::command]
pub fn remove_project(db: State<'_, Db>, project_id: String) -> AppResult<()> {
    db.connection().execute("DELETE FROM projects WHERE id = ?1", [project_id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_run_creates_one_personal_workspace_without_projects() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        ensure_default_workspace(&connection).unwrap();
        ensure_default_workspace(&connection).unwrap();
        let all = workspaces(&connection).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "Personal");
        assert!(all[0].projects.is_empty());
    }

    #[test]
    fn adding_the_same_folder_twice_keeps_one_project() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let workspace = insert_workspace(&connection, "Work").unwrap();
        let first = insert_project(&connection, &workspace.id, Path::new("/tmp/geo-svc")).unwrap();
        let second = insert_project(&connection, &workspace.id, Path::new("/tmp/geo-svc")).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.name, "geo-svc");
        assert_eq!(workspaces(&connection).unwrap()[0].projects.len(), 1);
    }

    #[test]
    fn names_are_trimmed_and_must_not_be_blank() {
        assert_eq!(validated_name("  Harbor ").unwrap(), "Harbor");
        assert!(validated_name("   ").is_err());
    }
}
