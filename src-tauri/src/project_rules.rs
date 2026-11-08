use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use serde_json::{Map, Value};

use crate::error::{AppError, AppResult};
use crate::git::{self, Git};

const SETTINGS_DIR: &str = ".claude";
const LOCAL_SETTINGS_FILE: &str = "settings.local.json";
const LOCAL_SETTINGS_PATH: &str = ".claude/settings.local.json";
const EXCLUDE_GIT_PATH: &str = "info/exclude";
const PERMISSIONS_KEY: &str = "permissions";
const DIRECTORIES_KEY: &str = "additionalDirectories";
const RULE_BEHAVIORS: [&str; 3] = ["allow", "deny", "ask"];
const DEFAULT_BEHAVIOR: &str = "allow";
const LAUNCH_PERMISSION_KEYS: [&str; 4] = ["allow", "deny", "ask", DIRECTORIES_KEY];

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn rule_strings(update: &Value) -> Vec<String> {
    let rules = update.get("rules").and_then(Value::as_array).into_iter().flatten();
    rules
        .filter_map(|rule| {
            let tool = text(rule, "toolName")?;
            Some(text(rule, "ruleContent").map_or_else(|| tool.to_string(), |content| format!("{tool}({content})")))
        })
        .collect()
}

fn directories(update: &Value) -> Vec<String> {
    let listed = update.get("directories").and_then(Value::as_array).into_iter().flatten();
    listed.filter_map(Value::as_str).map(String::from).collect()
}

fn behavior_of(update: &Value) -> &str {
    text(update, "behavior").filter(|behavior| RULE_BEHAVIORS.contains(behavior)).unwrap_or(DEFAULT_BEHAVIOR)
}

fn object_entry<'a>(object: &'a mut Map<String, Value>, key: &str) -> AppResult<&'a mut Map<String, Value>> {
    object
        .entry(key)
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| AppError::Invalid(format!("\"{key}\" in {LOCAL_SETTINGS_PATH} is not an object")))
}

fn add_unique(permissions: &mut Map<String, Value>, key: &str, entries: Vec<String>) -> AppResult<()> {
    let list = permissions
        .entry(key)
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| AppError::Invalid(format!("\"{key}\" in {LOCAL_SETTINGS_PATH} is not a list")))?;
    for entry in entries {
        if !list.iter().any(|existing| existing.as_str() == Some(entry.as_str())) {
            list.push(Value::String(entry));
        }
    }
    Ok(())
}

pub fn merged_settings(mut settings: Map<String, Value>, updates: &[Value]) -> AppResult<Map<String, Value>> {
    let permissions = object_entry(&mut settings, PERMISSIONS_KEY)?;
    for update in updates {
        match text(update, "type") {
            Some("addRules") => add_unique(permissions, behavior_of(update), rule_strings(update))?,
            Some("addDirectories") => add_unique(permissions, DIRECTORIES_KEY, directories(update))?,
            _ => {}
        }
    }
    Ok(settings)
}

fn read_settings(path: &Path) -> AppResult<Map<String, Value>> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let parsed: Value = serde_json::from_str(&fs::read_to_string(path)?).map_err(|_| {
        AppError::Invalid(format!("{LOCAL_SETTINGS_PATH} is not valid JSON; fix it before saving rules"))
    })?;
    match parsed {
        Value::Object(settings) => Ok(settings),
        _ => Err(AppError::Invalid(format!("{LOCAL_SETTINGS_PATH} is not a JSON object"))),
    }
}

fn keep_out_of_git(project_root: &Path) -> AppResult<()> {
    let repository = Git::at(project_root);
    if !git::is_repository(&repository) || repository.succeeds(&["check-ignore", "-q", LOCAL_SETTINGS_PATH])? {
        return Ok(());
    }
    let exclude = project_root.join(repository.output(&["rev-parse", "--git-path", EXCLUDE_GIT_PATH])?.trim());
    if let Some(folder) = exclude.parent() {
        fs::create_dir_all(folder)?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(exclude)?;
    writeln!(file, "/{LOCAL_SETTINGS_PATH}")?;
    Ok(())
}

pub fn save(project_root: &Path, updates: &[Value]) -> AppResult<()> {
    let folder = project_root.join(SETTINGS_DIR);
    let path = folder.join(LOCAL_SETTINGS_FILE);
    let settings = merged_settings(read_settings(&path)?, updates)?;
    fs::create_dir_all(&folder)?;
    let pretty =
        serde_json::to_string_pretty(&Value::Object(settings)).map_err(|error| AppError::Invalid(error.to_string()))?;
    fs::write(&path, format!("{pretty}\n"))?;
    keep_out_of_git(project_root)
}

fn string_list(value: &Value) -> Vec<Value> {
    value.as_array().into_iter().flatten().filter(|entry| entry.is_string()).cloned().collect()
}

fn launch_permissions_of(mut settings: Map<String, Value>) -> AppResult<Option<Value>> {
    let permissions = match settings.remove(PERMISSIONS_KEY) {
        None => return Ok(None),
        Some(Value::Object(permissions)) => permissions,
        Some(_) => return Err(AppError::Invalid(format!("\"{PERMISSIONS_KEY}\" is not an object"))),
    };
    let kept: Map<String, Value> = LAUNCH_PERMISSION_KEYS
        .iter()
        .filter_map(|key| Some((key.to_string(), string_list(permissions.get(*key)?))))
        .filter(|(_, entries)| !entries.is_empty())
        .map(|(key, entries)| (key, Value::Array(entries)))
        .collect();
    Ok((!kept.is_empty()).then_some(Value::Object(kept)))
}

pub fn launch_permissions(project_root: &Path) -> Option<Value> {
    let path = project_root.join(LOCAL_SETTINGS_PATH);
    match read_settings(&path).and_then(launch_permissions_of) {
        Ok(permissions) => permissions,
        Err(error) => {
            eprintln!("skipping project rules in {}: {error}", path.display());
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::process::{Command, Stdio};

    fn bash_rule(content: &str) -> Value {
        json!({"type": "addRules", "rules": [{"toolName": "Bash", "ruleContent": content}], "behavior": "allow",
            "destination": "session"})
    }

    fn scratch_folder() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("onyx-hive-rules-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn merges_rules_and_directories_without_duplicates_or_losing_other_keys() {
        let existing = json!({"model": "opus", "permissions": {"allow": ["Bash(ls:*)"], "deny": ["Read(.env)"]}});
        let Value::Object(existing) = existing else { unreachable!() };
        let directories = json!({"type": "addDirectories", "directories": ["/tmp/shared"], "destination": "session"});
        let mode = json!({"type": "setMode", "mode": "acceptEdits", "destination": "session"});
        let merged = merged_settings(existing, &[bash_rule("ls:*"), bash_rule("sed:*"), directories, mode]).unwrap();
        assert_eq!(
            Value::Object(merged),
            json!({"model": "opus", "permissions": {"allow": ["Bash(ls:*)", "Bash(sed:*)"], "deny": ["Read(.env)"],
                "additionalDirectories": ["/tmp/shared"]}})
        );
    }

    #[test]
    fn refuses_to_overwrite_settings_it_cannot_read() {
        let Value::Object(odd) = json!({"permissions": ["not", "an", "object"]}) else { unreachable!() };
        assert!(merged_settings(odd, &[bash_rule("ls:*")]).is_err());
        let root = scratch_folder();
        fs::create_dir_all(root.join(SETTINGS_DIR)).unwrap();
        fs::write(root.join(LOCAL_SETTINGS_PATH), "{ broken").unwrap();
        assert!(save(&root, &[bash_rule("ls:*")]).is_err());
        assert_eq!(fs::read_to_string(root.join(LOCAL_SETTINGS_PATH)).unwrap(), "{ broken");
    }

    #[test]
    fn hands_launches_only_the_permission_lists_and_skips_bad_files() {
        let root = scratch_folder();
        assert_eq!(launch_permissions(&root), None);
        fs::create_dir_all(root.join(SETTINGS_DIR)).unwrap();
        let settings = json!({"model": "opus", "permissions": {"allow": ["Bash(ls:*)", 7], "deny": [],
            "ask": ["WebFetch"], "defaultMode": "plan", "additionalDirectories": ["/tmp/shared"]}});
        fs::write(root.join(LOCAL_SETTINGS_PATH), settings.to_string()).unwrap();
        assert_eq!(
            launch_permissions(&root),
            Some(json!({"allow": ["Bash(ls:*)"], "ask": ["WebFetch"], "additionalDirectories": ["/tmp/shared"]}))
        );
        fs::write(root.join(LOCAL_SETTINGS_PATH), r#"{"permissions": ["Bash"]}"#).unwrap();
        assert_eq!(launch_permissions(&root), None);
        fs::write(root.join(LOCAL_SETTINGS_PATH), "{ broken").unwrap();
        assert_eq!(launch_permissions(&root), None);
    }

    #[test]
    fn writes_the_project_settings_and_keeps_them_out_of_git() {
        let root = scratch_folder();
        for arguments in [&["init"][..], &["config", "core.excludesFile", "/dev/null"]] {
            let status = Command::new("git").arg("-C").arg(&root).args(arguments).stdout(Stdio::null()).status();
            assert!(status.unwrap().success());
        }
        save(&root, &[bash_rule("ls:*")]).unwrap();
        save(&root, &[bash_rule("ls:*")]).unwrap();
        let written: Value =
            serde_json::from_str(&fs::read_to_string(root.join(LOCAL_SETTINGS_PATH)).unwrap()).unwrap();
        assert_eq!(written, json!({"permissions": {"allow": ["Bash(ls:*)"]}}));
        assert!(Git::at(&root).succeeds(&["check-ignore", "-q", LOCAL_SETTINGS_PATH]).unwrap());
        let exclude = fs::read_to_string(root.join(".git/info/exclude")).unwrap();
        assert_eq!(exclude.matches("/.claude/settings.local.json").count(), 1);
    }
}
