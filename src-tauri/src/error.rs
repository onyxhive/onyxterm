use serde::{Serialize, Serializer};

pub const GH_NOT_INSTALLED: &str = "gh-not-installed: install the GitHub CLI (gh) to see pull requests";
pub const GH_NOT_LOGGED_IN: &str = "gh-not-logged-in: run `gh auth login` in a terminal first";

#[derive(Debug)]
pub enum AppError {
    Database(rusqlite::Error),
    Io(std::io::Error),
    NotFound(&'static str),
    Invalid(String),
    Agent(String),
    Git(String),
    GitHub(String),
    GhNotInstalled,
    GhNotLoggedIn,
    TimedOut(&'static str),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Database(error) => write!(formatter, "database error: {error}"),
            AppError::Io(error) => write!(formatter, "io error: {error}"),
            AppError::NotFound(what) => write!(formatter, "{what} not found"),
            AppError::Invalid(reason) => write!(formatter, "invalid input: {reason}"),
            AppError::Agent(reason) => write!(formatter, "{reason}"),
            AppError::Git(reason) => write!(formatter, "git: {reason}"),
            AppError::GitHub(reason) => write!(formatter, "gh: {reason}"),
            AppError::GhNotInstalled => write!(formatter, "{GH_NOT_INSTALLED}"),
            AppError::GhNotLoggedIn => write!(formatter, "{GH_NOT_LOGGED_IN}"),
            AppError::TimedOut(what) => write!(formatter, "{what} timed out"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        AppError::Database(error)
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::Io(error)
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
