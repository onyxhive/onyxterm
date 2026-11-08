use serde::{Serialize, Serializer};

#[derive(Debug)]
pub enum AppError {
    Database(rusqlite::Error),
    Io(std::io::Error),
    NotFound(&'static str),
    Invalid(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Database(error) => write!(formatter, "database error: {error}"),
            AppError::Io(error) => write!(formatter, "io error: {error}"),
            AppError::NotFound(what) => write!(formatter, "{what} not found"),
            AppError::Invalid(reason) => write!(formatter, "invalid input: {reason}"),
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
