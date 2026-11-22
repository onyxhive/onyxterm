use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{Db, new_id};
use crate::error::{AppError, AppResult};

const MAX_TAG_NAME_LENGTH: usize = 32;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ColorTone {
    Sky,
    Violet,
    Emerald,
    Amber,
    Rose,
    Teal,
    Indigo,
    Orange,
}

impl ColorTone {
    fn as_str(self) -> &'static str {
        match self {
            ColorTone::Sky => "sky",
            ColorTone::Violet => "violet",
            ColorTone::Emerald => "emerald",
            ColorTone::Amber => "amber",
            ColorTone::Rose => "rose",
            ColorTone::Teal => "teal",
            ColorTone::Indigo => "indigo",
            ColorTone::Orange => "orange",
        }
    }

    fn parse(text: &str) -> ColorTone {
        match text {
            "violet" => ColorTone::Violet,
            "emerald" => ColorTone::Emerald,
            "amber" => ColorTone::Amber,
            "rose" => ColorTone::Rose,
            "teal" => ColorTone::Teal,
            "indigo" => ColorTone::Indigo,
            "orange" => ColorTone::Orange,
            _ => ColorTone::Sky,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: ColorTone,
}

fn tag_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag { id: row.get(0)?, name: row.get(1)?, color: ColorTone::parse(&row.get::<_, String>(2)?) })
}

fn validated_tag_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_TAG_NAME_LENGTH {
        return Err(AppError::Invalid(format!("tag names must be 1 to {MAX_TAG_NAME_LENGTH} characters")));
    }
    Ok(trimmed.to_string())
}

pub fn tags(connection: &Connection) -> AppResult<Vec<Tag>> {
    let mut statement = connection.prepare("SELECT id, name, color FROM tags ORDER BY name")?;
    let all = statement.query_map([], tag_from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(all)
}

pub fn tags_of(connection: &Connection, workspace_id: &str) -> AppResult<Vec<Tag>> {
    let mut statement = connection.prepare(
        "SELECT tags.id, tags.name, tags.color FROM tags \
         JOIN workspace_tags ON workspace_tags.tag_id = tags.id \
         WHERE workspace_tags.workspace_id = ?1 ORDER BY tags.name",
    )?;
    let attached = statement.query_map([workspace_id], tag_from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(attached)
}

fn insert_tag(connection: &Connection, name: &str, color: ColorTone) -> AppResult<Tag> {
    let name = validated_tag_name(name)?;
    let existing = connection
        .query_row("SELECT id FROM tags WHERE name = ?1", [&name], |row| row.get::<_, String>(0))
        .optional()?;
    if existing.is_some() {
        return Err(AppError::Invalid(format!("a tag named {name} already exists")));
    }
    let created = Tag { id: new_id(), name, color };
    connection.execute(
        "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
        params![created.id, created.name, created.color.as_str()],
    )?;
    Ok(created)
}

fn recolor(connection: &Connection, tag_id: &str, color: ColorTone) -> AppResult<()> {
    let changed = connection.execute("UPDATE tags SET color = ?2 WHERE id = ?1", params![tag_id, color.as_str()])?;
    if changed == 0 {
        return Err(AppError::NotFound("tag"));
    }
    Ok(())
}

fn exists(connection: &Connection, table: &'static str, id: &str) -> AppResult<bool> {
    let found = connection.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |_| Ok(())).optional()?;
    Ok(found.is_some())
}

fn attach(connection: &Connection, workspace_id: &str, tag_id: &str) -> AppResult<()> {
    if !exists(connection, "workspaces", workspace_id)? {
        return Err(AppError::NotFound("workspace"));
    }
    if !exists(connection, "tags", tag_id)? {
        return Err(AppError::NotFound("tag"));
    }
    connection.execute(
        "INSERT OR IGNORE INTO workspace_tags (workspace_id, tag_id) VALUES (?1, ?2)",
        params![workspace_id, tag_id],
    )?;
    Ok(())
}

fn detach(connection: &Connection, workspace_id: &str, tag_id: &str) -> AppResult<()> {
    connection
        .execute("DELETE FROM workspace_tags WHERE workspace_id = ?1 AND tag_id = ?2", params![workspace_id, tag_id])?;
    Ok(())
}

#[tauri::command]
pub fn list_tags(db: State<'_, Db>) -> AppResult<Vec<Tag>> {
    tags(&db.connection())
}

#[tauri::command]
pub fn create_tag(db: State<'_, Db>, name: String, color: ColorTone) -> AppResult<Tag> {
    insert_tag(&db.connection(), &name, color)
}

#[tauri::command]
pub fn set_tag_color(db: State<'_, Db>, tag_id: String, color: ColorTone) -> AppResult<()> {
    recolor(&db.connection(), &tag_id, color)
}

#[tauri::command]
pub fn attach_tag(db: State<'_, Db>, workspace_id: String, tag_id: String) -> AppResult<()> {
    attach(&db.connection(), &workspace_id, &tag_id)
}

#[tauri::command]
pub fn detach_tag(db: State<'_, Db>, workspace_id: String, tag_id: String) -> AppResult<()> {
    detach(&db.connection(), &workspace_id, &tag_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace_id(connection: &Connection, name: &str) -> String {
        let id = new_id();
        connection
            .execute("INSERT INTO workspaces (id, name, position) VALUES (?1, ?2, 0)", params![id, name])
            .unwrap();
        id
    }

    #[test]
    fn shares_one_tag_across_workspaces_and_detaches_it_per_workspace() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let work = workspace_id(&connection, "Work");
        let lab = workspace_id(&connection, "Lab");
        let tag = insert_tag(&connection, "  client ", ColorTone::Rose).unwrap();
        assert_eq!(tag.name, "client");
        attach(&connection, &work, &tag.id).unwrap();
        attach(&connection, &work, &tag.id).unwrap();
        attach(&connection, &lab, &tag.id).unwrap();
        assert_eq!(tags_of(&connection, &work).unwrap(), std::slice::from_ref(&tag));
        detach(&connection, &work, &tag.id).unwrap();
        assert!(tags_of(&connection, &work).unwrap().is_empty());
        assert_eq!(tags_of(&connection, &lab).unwrap(), [tag]);
    }

    #[test]
    fn rejects_blank_long_or_duplicate_names_regardless_of_case() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        insert_tag(&connection, "Client", ColorTone::Sky).unwrap();
        assert!(insert_tag(&connection, "client", ColorTone::Teal).is_err());
        assert!(insert_tag(&connection, "   ", ColorTone::Teal).is_err());
        assert!(insert_tag(&connection, &"a".repeat(MAX_TAG_NAME_LENGTH + 1), ColorTone::Teal).is_err());
        assert_eq!(tags(&connection).unwrap().len(), 1);
    }

    #[test]
    fn changes_a_tag_color_and_accepts_only_the_palette() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let tag = insert_tag(&connection, "infra", ColorTone::Sky).unwrap();
        recolor(&connection, &tag.id, ColorTone::Amber).unwrap();
        assert_eq!(tags(&connection).unwrap()[0].color, ColorTone::Amber);
        assert!(recolor(&connection, "ghost", ColorTone::Amber).is_err());
        assert!(serde_json::from_value::<ColorTone>(serde_json::json!("teal")).is_ok());
        assert!(serde_json::from_value::<ColorTone>(serde_json::json!("red")).is_err());
        assert!(serde_json::from_value::<ColorTone>(serde_json::json!("bg-sky-500")).is_err());
    }

    #[test]
    fn refuses_unknown_workspaces_or_tags_and_cleans_up_with_the_workspace() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let work = workspace_id(&connection, "Work");
        let tag = insert_tag(&connection, "infra", ColorTone::Sky).unwrap();
        assert!(attach(&connection, "ghost", &tag.id).is_err());
        assert!(attach(&connection, &work, "ghost").is_err());
        attach(&connection, &work, &tag.id).unwrap();
        connection.execute("DELETE FROM workspaces WHERE id = ?1", [&work]).unwrap();
        let links: i64 = connection.query_row("SELECT COUNT(*) FROM workspace_tags", [], |row| row.get(0)).unwrap();
        assert_eq!(links, 0);
    }
}
