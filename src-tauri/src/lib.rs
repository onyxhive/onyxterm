mod attachments;
mod branches;
mod chats;
mod checkpoints;
mod db;
mod desktop;
mod editors;
mod error;
mod explorer;
mod git;
mod process;
mod project_files;
mod project_rules;
mod protocol;
mod prs;
mod runtime;
mod scripts;
mod settings;
mod subagents;
mod subprocess;
mod terminals;
mod transcripts;
mod workspaces;
mod worktrees;

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
        .manage(project_files::ProjectFiles::default())
        .manage(branches::ProjectBranches::default())
        .manage(prs::GitHub::default())
        .manage(scripts::ScriptRuns::default())
        .manage(terminals::Terminals::default())
        .setup(|app| {
            let db = open_database(app)?;
            settings::apply_color_scheme(app.handle(), &db.connection())?;
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
            chats::remove_chat_worktree,
            settings::get_settings,
            settings::set_setting,
            runtime::send_message,
            runtime::interrupt_chat,
            runtime::update_chat_options,
            runtime::answer_permission,
            runtime::answer_question,
            runtime::discover_capabilities,
            transcripts::load_chat_history,
            project_files::list_project_files,
            branches::project_branch,
            git::git_status,
            git::git_branches,
            git::git_checkout,
            git::git_create_branch,
            git::git_diff,
            git::git_commit,
            git::git_push,
            checkpoints::git_turn_diff,
            checkpoints::git_checkpoint_turns,
            prs::pr_list,
            prs::pr_view,
            prs::pr_for_branch,
            prs::pr_checks,
            prs::pr_diff,
            prs::pr_create,
            prs::pr_merge,
            subagents::list_subagents,
            desktop::machine_name,
            desktop::reveal_project,
            editors::list_editors,
            editors::open_in_editor,
            scripts::list_scripts,
            scripts::add_script,
            scripts::remove_script,
            scripts::run_script,
            scripts::stop_script,
            terminals::terminal_open,
            terminals::terminal_write,
            terminals::terminal_resize,
            terminals::terminal_close,
            explorer::list_dir,
            explorer::read_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<AgentRuntime>().shutdown();
                app.state::<scripts::ScriptRuns>().stop_all();
                app.state::<terminals::Terminals>().close_all();
            }
        });
}
