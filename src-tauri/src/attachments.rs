use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::error::{AppError, AppResult};

const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_IMAGES_PER_MESSAGE: usize = 10;
const MAX_NAME_LENGTH: usize = 255;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ImageMediaType {
    #[serde(rename = "image/png")]
    Png,
    #[serde(rename = "image/jpeg")]
    Jpeg,
    #[serde(rename = "image/gif")]
    Gif,
    #[serde(rename = "image/webp")]
    Webp,
}

impl ImageMediaType {
    fn as_str(self) -> &'static str {
        match self {
            ImageMediaType::Png => "image/png",
            ImageMediaType::Jpeg => "image/jpeg",
            ImageMediaType::Gif => "image/gif",
            ImageMediaType::Webp => "image/webp",
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Attachment {
    pub media_type: ImageMediaType,
    pub data_base64: String,
    #[serde(default)]
    pub name: Option<String>,
}

impl Attachment {
    pub fn content_block(&self) -> Value {
        json!({
            "type": "image",
            "source": {"type": "base64", "media_type": self.media_type.as_str(), "data": self.data_base64},
        })
    }
}

fn decoded_size(data_base64: &str) -> AppResult<usize> {
    STANDARD
        .decode(data_base64)
        .map(|bytes| bytes.len())
        .map_err(|_| AppError::Invalid("an attached image is not valid base64".into()))
}

fn validated_attachment(attachment: &Attachment) -> AppResult<()> {
    if attachment.name.as_ref().is_some_and(|name| name.chars().count() > MAX_NAME_LENGTH) {
        return Err(AppError::Invalid(format!("image names may hold at most {MAX_NAME_LENGTH} characters")));
    }
    let size = decoded_size(&attachment.data_base64)?;
    if size == 0 || size > MAX_IMAGE_BYTES {
        return Err(AppError::Invalid("each attached image must be between 1 byte and 5 MB".into()));
    }
    Ok(())
}

pub fn validated(attachments: &[Attachment]) -> AppResult<()> {
    if attachments.len() > MAX_IMAGES_PER_MESSAGE {
        return Err(AppError::Invalid(format!("attach at most {MAX_IMAGES_PER_MESSAGE} images per message")));
    }
    attachments.iter().try_for_each(validated_attachment)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(data_base64: &str) -> Attachment {
        Attachment { media_type: ImageMediaType::Png, data_base64: data_base64.into(), name: None }
    }

    #[test]
    fn accepts_only_the_four_image_types_claude_reads() {
        for media_type in ["image/png", "image/jpeg", "image/gif", "image/webp"] {
            let json = json!({"mediaType": media_type, "dataBase64": "aGk="});
            assert!(serde_json::from_value::<Attachment>(json).is_ok(), "{media_type}");
        }
        for media_type in ["image/svg+xml", "application/pdf", "IMAGE/PNG", "image/avif"] {
            let json = json!({"mediaType": media_type, "dataBase64": "aGk="});
            assert!(serde_json::from_value::<Attachment>(json).is_err(), "{media_type}");
        }
        let extra = json!({"mediaType": "image/png", "dataBase64": "aGk=", "path": "/etc/passwd"});
        assert!(serde_json::from_value::<Attachment>(extra).is_err());
    }

    #[test]
    fn rejects_bad_base64_empty_or_oversized_images_and_too_many() {
        assert!(validated(&[png("aGk=")]).is_ok());
        assert!(validated(&[png("not base64!")]).is_err());
        assert!(validated(&[png("")]).is_err());
        assert!(validated(&[png(&STANDARD.encode(vec![0u8; MAX_IMAGE_BYTES]))]).is_ok());
        assert!(validated(&[png(&STANDARD.encode(vec![0u8; MAX_IMAGE_BYTES + 1]))]).is_err());
        assert!(validated(&vec![png("aGk="); MAX_IMAGES_PER_MESSAGE]).is_ok());
        assert!(validated(&vec![png("aGk="); MAX_IMAGES_PER_MESSAGE + 1]).is_err());
        let long_name = Attachment { name: Some("a".repeat(MAX_NAME_LENGTH + 1)), ..png("aGk=") };
        assert!(validated(&[long_name]).is_err());
    }

    #[test]
    fn builds_a_base64_image_block_for_claude() {
        let block = Attachment { media_type: ImageMediaType::Webp, ..png("aGk=") }.content_block();
        assert_eq!(
            block,
            json!({"type": "image", "source": {"type": "base64", "media_type": "image/webp", "data": "aGk="}})
        );
    }
}
