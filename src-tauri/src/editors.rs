use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::desktop::open_with;
use crate::error::{AppError, AppResult};
use crate::git::{GitTarget, workdir};
use crate::settings::store_setting;
use crate::subprocess::in_background;

pub const PREFERRED_EDITOR_SETTING: &str = "preferredEditor";
const SYSTEM_FOLDERS: &[&str] = &["/Applications", "/Applications/Utilities", "/System/Applications/Utilities"];
const USER_FOLDERS: &[&str] = &["Applications", "Applications/JetBrains Toolbox"];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EditorId {
    Vscode,
    Cursor,
    Zed,
    Windsurf,
    SublimeText,
    Xcode,
    IntellijIdea,
    Webstorm,
    RustRover,
    Goland,
    Pycharm,
    Datagrip,
    Fleet,
    Nova,
    Terminal,
    Ghostty,
    Iterm,
    Warp,
}

struct KnownEditor {
    id: EditorId,
    name: &'static str,
    bundles: &'static [&'static str],
}

const KNOWN_EDITORS: &[KnownEditor] = &[
    KnownEditor { id: EditorId::Vscode, name: "VS Code", bundles: &["Visual Studio Code.app"] },
    KnownEditor { id: EditorId::Cursor, name: "Cursor", bundles: &["Cursor.app"] },
    KnownEditor { id: EditorId::Zed, name: "Zed", bundles: &["Zed.app"] },
    KnownEditor { id: EditorId::Windsurf, name: "Windsurf", bundles: &["Windsurf.app"] },
    KnownEditor { id: EditorId::SublimeText, name: "Sublime Text", bundles: &["Sublime Text.app"] },
    KnownEditor { id: EditorId::Xcode, name: "Xcode", bundles: &["Xcode.app"] },
    KnownEditor {
        id: EditorId::IntellijIdea,
        name: "IntelliJ IDEA",
        bundles: &["IntelliJ IDEA.app", "IntelliJ IDEA Ultimate.app", "IntelliJ IDEA CE.app"],
    },
    KnownEditor { id: EditorId::Webstorm, name: "WebStorm", bundles: &["WebStorm.app"] },
    KnownEditor { id: EditorId::RustRover, name: "RustRover", bundles: &["RustRover.app"] },
    KnownEditor { id: EditorId::Goland, name: "GoLand", bundles: &["GoLand.app"] },
    KnownEditor { id: EditorId::Pycharm, name: "PyCharm", bundles: &["PyCharm.app", "PyCharm CE.app"] },
    KnownEditor { id: EditorId::Datagrip, name: "DataGrip", bundles: &["DataGrip.app"] },
    KnownEditor { id: EditorId::Fleet, name: "Fleet", bundles: &["Fleet.app"] },
    KnownEditor { id: EditorId::Nova, name: "Nova", bundles: &["Nova.app"] },
    KnownEditor { id: EditorId::Terminal, name: "Terminal", bundles: &["Terminal.app"] },
    KnownEditor { id: EditorId::Ghostty, name: "Ghostty", bundles: &["Ghostty.app"] },
    KnownEditor { id: EditorId::Iterm, name: "iTerm", bundles: &["iTerm.app"] },
    KnownEditor { id: EditorId::Warp, name: "Warp", bundles: &["Warp.app"] },
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Editor {
    pub id: EditorId,
    pub name: String,
    pub app_path: String,
}

fn search_folders(home: Option<&Path>) -> Vec<PathBuf> {
    let user_folders = home.into_iter().flat_map(|home| USER_FOLDERS.iter().map(move |folder| home.join(folder)));
    SYSTEM_FOLDERS.iter().map(PathBuf::from).chain(user_folders).collect()
}

fn installed_path(known: &KnownEditor, folders: &[PathBuf]) -> Option<PathBuf> {
    folders
        .iter()
        .flat_map(|folder| known.bundles.iter().map(move |bundle| folder.join(bundle)))
        .find(|candidate| candidate.is_dir())
}

pub fn installed_editors(folders: &[PathBuf]) -> Vec<Editor> {
    KNOWN_EDITORS
        .iter()
        .filter_map(|known| {
            let path = installed_path(known, folders)?;
            Some(Editor { id: known.id, name: known.name.to_string(), app_path: path.to_string_lossy().into_owned() })
        })
        .collect()
}

fn editor_path(id: EditorId) -> AppResult<PathBuf> {
    let known = KNOWN_EDITORS.iter().find(|known| known.id == id).ok_or(AppError::NotFound("editor"))?;
    installed_path(known, &search_folders(dirs::home_dir().as_deref())).ok_or(AppError::NotFound("installed editor"))
}

fn setting_value(id: EditorId) -> AppResult<String> {
    let quoted = serde_json::to_string(&id).map_err(|error| AppError::Agent(error.to_string()))?;
    Ok(quoted.trim_matches('"').to_string())
}

#[tauri::command]
pub async fn list_editors() -> AppResult<Vec<Editor>> {
    in_background(|| Ok(installed_editors(&search_folders(dirs::home_dir().as_deref())))).await
}

#[tauri::command]
pub async fn open_in_editor(db: State<'_, Db>, target: GitTarget, editor_id: EditorId) -> AppResult<()> {
    let root = workdir(&db, &target)?.root;
    in_background(move || {
        let app = editor_path(editor_id)?;
        open_with(&[OsStr::new("-a"), app.as_os_str(), root.as_os_str()])
    })
    .await?;
    store_setting(&db.connection(), PREFERRED_EDITOR_SETTING, &setting_value(editor_id)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_only_allowlisted_apps_in_the_searched_folders() {
        let folder = std::env::temp_dir().join(format!("onyx-hive-apps-{}", uuid::Uuid::new_v4()));
        for bundle in ["Zed.app", "PyCharm CE.app", "Malware.app"] {
            std::fs::create_dir_all(folder.join(bundle)).unwrap();
        }
        let found = installed_editors(std::slice::from_ref(&folder));
        let ids: Vec<_> = found.iter().map(|editor| editor.id).collect();
        assert_eq!(ids, vec![EditorId::Zed, EditorId::Pycharm]);
        assert!(found[1].app_path.ends_with("PyCharm CE.app"));
    }

    #[test]
    fn accepts_only_known_editor_ids_at_the_boundary() {
        assert_eq!(serde_json::from_str::<EditorId>("\"rustRover\"").unwrap(), EditorId::RustRover);
        assert!(serde_json::from_str::<EditorId>("\"/Applications/Evil.app\"").is_err());
        assert_eq!(setting_value(EditorId::SublimeText).unwrap(), "sublimeText");
    }

    #[test]
    fn searches_user_and_toolbox_folders() {
        let folders = search_folders(Some(Path::new("/Users/someone")));
        assert!(folders.contains(&PathBuf::from("/Users/someone/Applications/JetBrains Toolbox")));
        assert!(folders.contains(&PathBuf::from("/System/Applications/Utilities")));
    }
}
