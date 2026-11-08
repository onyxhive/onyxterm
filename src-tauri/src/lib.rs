mod chats;
mod db;
mod error;
mod settings;
mod workspaces;

use tauri::Manager;

use crate::db::Db;

const DATABASE_FILE: &str = "onyx-hive.sqlite3";

fn open_database(app: &tauri::App) -> Result<Db, Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let db = Db::open(&data_dir.join(DATABASE_FILE))?;
    workspaces::ensure_default_workspace(&db.connection())?;
    Ok(db)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db = open_database(app)?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspaces::list_workspaces,
            workspaces::create_workspace,
            workspaces::rename_workspace,
            workspaces::add_project,
            workspaces::remove_project,
            chats::list_chats,
            chats::create_chat,
            chats::set_chat_state,
            settings::get_settings,
            settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
