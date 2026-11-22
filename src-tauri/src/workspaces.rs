use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::attachments::{ImageMediaType, decoded_size};
use crate::db::{Db, new_id};
use crate::error::{AppError, AppResult};
use crate::tags::{Tag, tags_of};

const DEFAULT_WORKSPACE_NAME: &str = "Personal";
const MAX_NAME_LENGTH: usize = 80;
const MAX_LOGO_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub workspace_id: String,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceLogo {
    pub media_type: ImageMediaType,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub projects: Vec<Project>,
    pub tags: Vec<Tag>,
    pub logo: Option<WorkspaceLogo>,
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
    let workspace = Workspace {
        id: new_id(),
        name: name.to_string(),
        position,
        projects: Vec::new(),
        tags: Vec::new(),
        logo: None,
    };
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

fn logo_from(media_type: Option<String>, data_base64: Option<String>) -> Option<WorkspaceLogo> {
    Some(WorkspaceLogo { media_type: ImageMediaType::parse(&media_type?)?, data_base64: data_base64? })
}

pub fn workspaces(connection: &Connection) -> AppResult<Vec<Workspace>> {
    let mut statement = connection
        .prepare("SELECT id, name, position, logo_media_type, logo_data_base64 FROM workspaces ORDER BY position")?;
    let rows = statement
        .query_map([], |row| {
            let logo = logo_from(row.get(3)?, row.get(4)?);
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?, logo))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|(id, name, position, logo)| {
            let projects = projects_of(connection, &id)?;
            let tags = tags_of(connection, &id)?;
            Ok(Workspace { id, name, position, projects, tags, logo })
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

fn validated_logo(logo: &WorkspaceLogo) -> AppResult<()> {
    let size = decoded_size(&logo.data_base64)?;
    if size == 0 || size > MAX_LOGO_BYTES {
        return Err(AppError::Invalid("a workspace logo must be between 1 byte and 1 MB".into()));
    }
    Ok(())
}

fn set_logo(connection: &Connection, workspace_id: &str, logo: Option<&WorkspaceLogo>) -> AppResult<()> {
    if let Some(logo) = logo {
        validated_logo(logo)?;
    }
    let changed = connection.execute(
        "UPDATE workspaces SET logo_media_type = ?2, logo_data_base64 = ?3 WHERE id = ?1",
        params![workspace_id, logo.map(|logo| logo.media_type.as_str()), logo.map(|logo| &logo.data_base64)],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("workspace"));
    }
    Ok(())
}

fn is_every_workspace_once(connection: &Connection, workspace_ids: &[String]) -> AppResult<bool> {
    let mut statement = connection.prepare("SELECT id FROM workspaces")?;
    let current = statement.query_map([], |row| row.get::<_, String>(0))?.collect::<Result<HashSet<_>, _>>()?;
    let requested: HashSet<&String> = workspace_ids.iter().collect();
    Ok(requested.len() == workspace_ids.len()
        && requested.len() == current.len()
        && requested.iter().all(|workspace_id| current.contains(*workspace_id)))
}

fn reorder(connection: &Connection, workspace_ids: &[String]) -> AppResult<()> {
    let transaction = connection.unchecked_transaction()?;
    if !is_every_workspace_once(&transaction, workspace_ids)? {
        return Err(AppError::Invalid("the new order must list every workspace exactly once".into()));
    }
    for (position, workspace_id) in workspace_ids.iter().enumerate() {
        transaction
            .execute("UPDATE workspaces SET position = ?2 WHERE id = ?1", params![workspace_id, position as i64])?;
    }
    transaction.commit()?;
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
pub fn set_workspace_logo(db: State<'_, Db>, workspace_id: String, logo: Option<WorkspaceLogo>) -> AppResult<()> {
    set_logo(&db.connection(), &workspace_id, logo.as_ref())
}

#[tauri::command]
pub fn reorder_workspaces(db: State<'_, Db>, workspace_ids: Vec<String>) -> AppResult<()> {
    reorder(&db.connection(), &workspace_ids)
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

    fn workspace_names(connection: &Connection) -> Vec<String> {
        workspaces(connection).unwrap().into_iter().map(|workspace| workspace.name).collect()
    }

    #[test]
    fn reorders_workspaces_by_the_given_ids() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let first = insert_workspace(&connection, "Personal").unwrap();
        let second = insert_workspace(&connection, "Work").unwrap();
        let third = insert_workspace(&connection, "Lab").unwrap();
        reorder(&connection, &[third.id, first.id, second.id]).unwrap();
        assert_eq!(workspace_names(&connection), ["Lab", "Personal", "Work"]);
    }

    #[test]
    fn rejects_an_order_that_is_not_exactly_the_current_workspaces() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let first = insert_workspace(&connection, "Personal").unwrap();
        let second = insert_workspace(&connection, "Work").unwrap();
        assert!(reorder(&connection, std::slice::from_ref(&second.id)).is_err());
        assert!(reorder(&connection, &[second.id.clone(), second.id.clone()]).is_err());
        assert!(reorder(&connection, &[second.id.clone(), first.id.clone(), "ghost".into()]).is_err());
        assert!(reorder(&connection, &[second.id.clone(), "ghost".into()]).is_err());
        assert_eq!(workspace_names(&connection), ["Personal", "Work"]);
    }

    fn png_logo(byte_count: usize) -> WorkspaceLogo {
        use base64::Engine;
        let data_base64 = base64::engine::general_purpose::STANDARD.encode(vec![0u8; byte_count]);
        WorkspaceLogo { media_type: ImageMediaType::Png, data_base64 }
    }

    #[test]
    fn stores_and_removes_a_workspace_logo() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let workspace = insert_workspace(&connection, "Work").unwrap();
        let logo = png_logo(16);
        set_logo(&connection, &workspace.id, Some(&logo)).unwrap();
        assert_eq!(workspaces(&connection).unwrap()[0].logo, Some(logo));
        set_logo(&connection, &workspace.id, None).unwrap();
        assert_eq!(workspaces(&connection).unwrap()[0].logo, None);
        assert!(set_logo(&connection, "ghost", None).is_err());
    }

    #[test]
    fn rejects_logos_that_are_empty_oversized_not_base64_or_not_an_image_type() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let workspace = insert_workspace(&connection, "Work").unwrap();
        assert!(set_logo(&connection, &workspace.id, Some(&png_logo(MAX_LOGO_BYTES))).is_ok());
        assert!(set_logo(&connection, &workspace.id, Some(&png_logo(MAX_LOGO_BYTES + 1))).is_err());
        assert!(set_logo(&connection, &workspace.id, Some(&png_logo(0))).is_err());
        let garbled = WorkspaceLogo { data_base64: "not base64!".into(), ..png_logo(1) };
        assert!(set_logo(&connection, &workspace.id, Some(&garbled)).is_err());
        let svg = serde_json::json!({"mediaType": "image/svg+xml", "dataBase64": "aGk="});
        assert!(serde_json::from_value::<WorkspaceLogo>(svg).is_err());
    }

    #[test]
    fn names_are_trimmed_and_must_not_be_blank() {
        assert_eq!(validated_name("  Harbor ").unwrap(), "Harbor");
        assert!(validated_name("   ").is_err());
    }
}
