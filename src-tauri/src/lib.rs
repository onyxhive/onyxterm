mod chats;
mod db;
mod error;
mod process;
mod protocol;
mod runtime;
mod settings;
mod transcripts;
mod workspaces;

use tauri::{Manager, RunEvent};

use crate::db::Db;
use crate::runtime::AgentRuntime;

const DATABASE_FILE: &str = "onyx-hive.sqlite3";

fn open_database(app: &tauri::App) -> Result<Db, Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let db = Db::open(&data_dir.join(DATABASE_FILE))?;
    workspaces::ensure_default_workspace(&db.connection())?;
    chats::settle_orphaned_turns(&db.connection())?;
    Ok(db)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AgentRuntime::default())
        .setup(|app| {
            let db = open_database(app)?;
            app.manage(db);
            AgentRuntime::start_reaper(app.handle().clone());
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
            runtime::send_message,
            runtime::interrupt_chat,
            runtime::answer_permission,
            runtime::answer_question,
            runtime::discover_capabilities,
            transcripts::load_chat_history,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<AgentRuntime>().shutdown();
            }
        });
}
