use std::collections::HashMap;

use rusqlite::{Connection, OptionalExtension, params};
use tauri::{AppHandle, State, Theme};

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::worktrees::WORK_IN_WORKTREES_SETTING;

const MAX_KEY_LENGTH: usize = 64;
const MAX_VALUE_LENGTH: usize = 4096;
const MAX_BRANCH_PREFIX_LENGTH: usize = 32;
const BRANCH_PREFIX_SYMBOLS: [char; 4] = ['-', '_', '.', '/'];
pub const COLOR_SCHEME_SETTING: &str = "colorScheme";
pub const BRANCH_PREFIX_SETTING: &str = "worktreeBranchPrefix";
pub const START_FROM_REMOTE_SETTING: &str = "worktreesStartFromRemote";
const PERMISSION_MODE_SETTING: &str = "permissionMode";
const TOGGLE_VALUES: &[&str] = &["true", "false"];
const CHOICES: &[(&str, &[&str])] = &[
    (COLOR_SCHEME_SETTING, &["system", "light", "dark"]),
    ("chatWidth", &["comfortable", "wide", "full"]),
    ("diffColorScheme", &["red-green", "blue-orange"]),
    ("timestampFormat", &["locale", "12-hour", "24-hour"]),
    ("sendShortcut", &["enter", "mod-enter-multiline", "mod-enter"]),
    ("pullRequestMergeMethod", &["merge", "squash", "rebase"]),
    ("prAuthorFilter", &["everyone", "mine", "review-requested"]),
    ("inAppNotifications", TOGGLE_VALUES),
    (WORK_IN_WORKTREES_SETTING, TOGGLE_VALUES),
    (START_FROM_REMOTE_SETTING, TOGGLE_VALUES),
    (PERMISSION_MODE_SETTING, &["default", "acceptEdits", "auto", "plan", "bypassPermissions"]),
];

#[tauri::command]
pub fn get_settings(db: State<'_, Db>) -> AppResult<HashMap<String, String>> {
    let connection = db.connection();
    let mut statement = connection.prepare("SELECT key, value FROM settings")?;
    let settings =
        statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<Result<HashMap<_, _>, _>>()?;
    Ok(settings)
}

pub fn stored_setting(connection: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(connection.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| row.get(0)).optional()?)
}

pub fn is_valid_branch_prefix(prefix: &str) -> bool {
    prefix.len() <= MAX_BRANCH_PREFIX_LENGTH
        && !prefix.starts_with(BRANCH_PREFIX_SYMBOLS)
        && !prefix.contains("..")
        && !prefix.contains("//")
        && prefix
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || BRANCH_PREFIX_SYMBOLS.contains(&character))
}

fn validated_value(key: &str, value: &str) -> AppResult<()> {
    if key == BRANCH_PREFIX_SETTING && !is_valid_branch_prefix(value) {
        return Err(AppError::Invalid(format!("{value:?} is not a valid branch prefix")));
    }
    let Some((_, allowed)) = CHOICES.iter().find(|(choice, _)| *choice == key) else { return Ok(()) };
    if allowed.contains(&value) {
        return Ok(());
    }
    Err(AppError::Invalid(format!("{value:?} is not a valid {key} setting")))
}

pub fn store_setting(connection: &Connection, key: &str, value: &str) -> AppResult<()> {
    if key.is_empty() || key.len() > MAX_KEY_LENGTH || value.len() > MAX_VALUE_LENGTH {
        return Err(AppError::Invalid("setting key or value is too long".into()));
    }
    validated_value(key, value)?;
    connection.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

fn theme_of(scheme: Option<&str>) -> Option<Theme> {
    match scheme {
        Some("light") => Some(Theme::Light),
        Some("dark") => Some(Theme::Dark),
        _ => None,
    }
}

pub fn apply_color_scheme(app: &AppHandle, connection: &Connection) -> AppResult<()> {
    app.set_theme(theme_of(stored_setting(connection, COLOR_SCHEME_SETTING)?.as_deref()));
    Ok(())
}

#[tauri::command]
pub fn set_setting(app: AppHandle, db: State<'_, Db>, key: String, value: String) -> AppResult<()> {
    store_setting(&db.connection(), &key, &value)?;
    if key == COLOR_SCHEME_SETTING {
        app.set_theme(theme_of(Some(&value)));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_only_the_listed_choices_for_known_settings() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        store_setting(&connection, COLOR_SCHEME_SETTING, "dark").unwrap();
        assert!(store_setting(&connection, COLOR_SCHEME_SETTING, "purple").is_err());
        assert!(store_setting(&connection, WORK_IN_WORKTREES_SETTING, "yes").is_err());
        store_setting(&connection, "prAuthorFilter", "review-requested").unwrap();
        assert!(store_setting(&connection, "prAuthorFilter", "someone-else").is_err());
        store_setting(&connection, PERMISSION_MODE_SETTING, "bypassPermissions").unwrap();
        assert!(store_setting(&connection, PERMISSION_MODE_SETTING, "dontAsk").is_err());
        store_setting(&connection, "preferredEditor", "zed").unwrap();
        assert_eq!(stored_setting(&connection, COLOR_SCHEME_SETTING).unwrap().as_deref(), Some("dark"));
        assert_eq!(stored_setting(&connection, "missing").unwrap(), None);
    }

    #[test]
    fn allows_exactly_the_permission_modes_a_chat_can_run_in() {
        let (_, allowed) = CHOICES.iter().find(|(key, _)| *key == PERMISSION_MODE_SETTING).unwrap();
        for value in *allowed {
            let mode: crate::chats::PermissionMode = serde_json::from_value((*value).into()).unwrap();
            assert_eq!(mode.as_str(), *value);
        }
    }

    #[test]
    fn accepts_branch_prefixes_that_make_valid_branch_names() {
        for prefix in ["", "onyx/", "julius", "team/feature-", "v1.2_"] {
            assert!(is_valid_branch_prefix(prefix), "{prefix} should be accepted");
        }
        for prefix in ["-x", "/x", ".x", "a..b", "a//b", "a b", "a~b", "a:b", &"x".repeat(33)] {
            assert!(!is_valid_branch_prefix(prefix), "{prefix} should be rejected");
        }
    }

    #[test]
    fn maps_the_color_scheme_to_a_window_theme() {
        assert_eq!(theme_of(Some("light")), Some(Theme::Light));
        assert_eq!(theme_of(Some("dark")), Some(Theme::Dark));
        assert_eq!(theme_of(Some("system")), None);
        assert_eq!(theme_of(None), None);
    }
}
