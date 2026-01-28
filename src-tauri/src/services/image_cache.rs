//! Image caching service for notification hero images.
//!
//! Downloads images from URLs and caches them locally for use in Windows
//! toast notifications, which require local file paths.

use pulldown_cmark::{Event, Parser, Tag};
use std::path::PathBuf;
use tokio::fs;

/// Represents the orientation of an image for notification display.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageOrientation {
    /// Width >= Height (landscape or square) - suitable for hero images
    Landscape,
    /// Height > Width (portrait) - better displayed as inline image
    Portrait,
}

/// Result of downloading and caching an image.
#[derive(Debug, Clone)]
pub struct CachedImage {
    /// Local file path to the cached image
    pub path: PathBuf,
    /// Orientation of the image
    pub orientation: ImageOrientation,
}

/// Determines the orientation of an image file.
fn get_image_orientation(path: &std::path::Path) -> ImageOrientation {
    // Try to read image dimensions
    if let Ok(reader) = image::ImageReader::open(path) {
        if let Ok(dimensions) = reader.into_dimensions() {
            let (width, height) = dimensions;
            if height > width {
                return ImageOrientation::Portrait;
            }
        }
    }
    // Default to landscape if we can't determine
    ImageOrientation::Landscape
}

/// Extracts the first image URL from markdown text.
///
/// Parses the markdown and returns the URL of the first image found.
pub fn extract_first_image_from_markdown(text: &str) -> Option<String> {
    let parser = Parser::new(text);

    for event in parser {
        if let Event::Start(Tag::Image { dest_url, .. }) = event {
            let url = dest_url.to_string();
            if !url.is_empty() {
                return Some(url);
            }
        }
    }

    None
}

/// Returns the cache directory for notification images.
fn get_cache_dir() -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push("ntfier");
    path.push("image_cache");
    path
}

/// Generates a cache filename from a URL.
///
/// Uses a hash of the URL to create a unique filename while preserving
/// the original extension if possible.
fn get_cache_filename(url: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    let hash = hasher.finish();

    // Try to extract extension from URL
    let extension = url
        .rsplit('/')
        .next()
        .and_then(|filename| filename.rsplit('.').next())
        .filter(|ext| {
            let ext_lower = ext.to_lowercase();
            matches!(
                ext_lower.as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp"
            )
        })
        .unwrap_or("png");

    format!("{hash:x}.{extension}")
}

/// Downloads an image from URL and caches it locally.
///
/// Returns the cached image info including path and orientation if successful.
/// Images are cached in the system temp directory under `ntfier/image_cache/`.
pub async fn download_and_cache_image(url: &str) -> Option<CachedImage> {
    let cache_dir = get_cache_dir();

    // Create cache directory if it doesn't exist
    if let Err(e) = fs::create_dir_all(&cache_dir).await {
        log::error!("Failed to create image cache directory: {e}");
        return None;
    }

    let filename = get_cache_filename(url);
    let cache_path = cache_dir.join(&filename);

    // Check if already cached
    if cache_path.exists() {
        log::debug!("Image already cached: {}", cache_path.display());
        let orientation = get_image_orientation(&cache_path);
        return Some(CachedImage {
            path: cache_path,
            orientation,
        });
    }

    // Download the image
    log::info!("Downloading image: {url}");

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to create HTTP client: {e}");
            return None;
        }
    };

    let response = match client.get(url).send().await {
        Ok(r) => r,
        Err(e) => {
            log::error!("Failed to download image from {url}: {e}");
            return None;
        }
    };

    if !response.status().is_success() {
        log::error!(
            "Failed to download image from {url}: HTTP {}",
            response.status()
        );
        return None;
    }

    // Check content type to verify it's an image
    if let Some(content_type) = response.headers().get("content-type") {
        if let Ok(ct) = content_type.to_str() {
            if !ct.starts_with("image/") {
                log::warn!("URL {url} is not an image (content-type: {ct})");
                return None;
            }
        }
    }

    let bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            log::error!("Failed to read image bytes from {url}: {e}");
            return None;
        }
    };

    // Validate image size (max 10MB)
    if bytes.len() > 10 * 1024 * 1024 {
        log::warn!("Image too large: {} bytes", bytes.len());
        return None;
    }

    // Write to cache
    if let Err(e) = fs::write(&cache_path, &bytes).await {
        log::error!("Failed to write image to cache: {e}");
        return None;
    }

    log::info!("Cached image: {}", cache_path.display());

    let orientation = get_image_orientation(&cache_path);
    Some(CachedImage {
        path: cache_path,
        orientation,
    })
}

/// Gets the notification image with orientation info.
///
/// Priority:
/// 1. First image attachment (if MIME type starts with "image/")
/// 2. First image URL found in the message markdown
///
/// Returns `None` if no image is available or download fails.
pub async fn get_notification_image(
    attachments: &[crate::models::Attachment],
    message: &str,
) -> Option<CachedImage> {
    // First, try to get an image from attachments
    let image_attachment = attachments
        .iter()
        .find(|a| a.attachment_type.starts_with("image/"));

    if let Some(attachment) = image_attachment {
        if let Some(cached) = download_and_cache_image(&attachment.url).await {
            return Some(cached);
        }
    }

    // Fallback: extract image URL from markdown message
    if let Some(image_url) = extract_first_image_from_markdown(message) {
        if let Some(cached) = download_and_cache_image(&image_url).await {
            return Some(cached);
        }
    }

    None
}

/// Cleans up old cached images.
///
/// Removes images older than the specified max age.
pub async fn cleanup_old_images(max_age_secs: u64) {
    let cache_dir = get_cache_dir();

    let entries = match fs::read_dir(&cache_dir).await {
        Ok(e) => e,
        Err(_) => return,
    };

    let now = std::time::SystemTime::now();
    let max_age = std::time::Duration::from_secs(max_age_secs);

    let mut entries = entries;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();

        if let Ok(metadata) = fs::metadata(&path).await {
            if let Ok(modified) = metadata.modified() {
                if let Ok(age) = now.duration_since(modified) {
                    if age > max_age {
                        log::debug!("Removing old cached image: {}", path.display());
                        let _ = fs::remove_file(&path).await;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_image_from_markdown() {
        let markdown = "Hello ![alt text](https://example.com/image.png) world";
        let url = extract_first_image_from_markdown(markdown);
        assert_eq!(url, Some("https://example.com/image.png".to_string()));
    }

    #[test]
    fn test_extract_image_no_image() {
        let markdown = "Hello world, no images here";
        let url = extract_first_image_from_markdown(markdown);
        assert_eq!(url, None);
    }

    #[test]
    fn test_extract_first_image_multiple() {
        let markdown = "![first](https://a.com/1.png) and ![second](https://b.com/2.png)";
        let url = extract_first_image_from_markdown(markdown);
        assert_eq!(url, Some("https://a.com/1.png".to_string()));
    }

    #[test]
    fn test_cache_filename() {
        let url = "https://example.com/path/to/image.jpg";
        let filename = get_cache_filename(url);
        assert!(filename.ends_with(".jpg"));

        let url2 = "https://example.com/image.png?query=1";
        let filename2 = get_cache_filename(url2);
        // Should still work, though extension might not be perfect
        assert!(!filename2.is_empty());
    }
}
