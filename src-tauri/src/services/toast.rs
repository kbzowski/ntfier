//! Windows toasts built directly with the `windows` crate.
//!
//! tauri-winrt-notification can't set a toast's Tag and Group. With them, a toast for a
//! newer version of a message (same `sequence_id`) replaces the shown one, and a deleted
//! or cleared message's toast can be removed from the Action Center.

use std::fmt::Write;
use std::path::Path;
use windows::core::{IInspectable, Interface, Ref, HSTRING};
use windows::Data::Xml::Dom::XmlDocument;
use windows::Foundation::TypedEventHandler;
use windows::UI::Notifications::{
    ToastActivatedEventArgs, ToastNotification, ToastNotificationManager,
};

/// The `arguments` a body click sends to the activation handler.
pub const CLICK_ARGUMENT: &str = "click";

pub struct ToastButton {
    pub label: String,
    /// A URL for `protocol` buttons (opened by Windows), else a key for the handler.
    pub arguments: String,
    pub protocol: bool,
}

pub struct ToastContent<'a> {
    /// Replaces a shown toast with the same tag and group.
    pub tag: &'a str,
    pub group: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    pub hero_image: Option<&'a Path>,
    pub inline_image: Option<&'a Path>,
    pub app_logo: Option<&'a Path>,
    pub buttons: Vec<ToastButton>,
    /// Body clicks go to the handler with `CLICK_ARGUMENT`.
    pub clickable: bool,
    /// Shown even with Focus Assist on.
    pub alarm: bool,
    pub long: bool,
    /// `ms-winsoundevent:...`, or `None` for silence.
    pub sound: Option<&'a str>,
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn image(placement: &str, path: &Path) -> String {
    format!(
        r#"<image {placement}src="file:///{}"/>"#,
        escape(&path.display().to_string())
    )
}

/// The toast XML (schema: learn.microsoft.com, "Toast content schema").
pub fn xml(content: &ToastContent) -> String {
    let mut toast_attrs = String::new();
    if content.alarm {
        toast_attrs.push_str(r#" scenario="alarm""#);
    }
    if content.long {
        toast_attrs.push_str(r#" duration="long""#);
    }
    if content.clickable {
        let _ = write!(
            toast_attrs,
            r#" launch="{CLICK_ARGUMENT}" activationType="background""#
        );
    }

    let mut images = String::new();
    if let Some(path) = content.app_logo {
        images.push_str(&image(r#"placement="appLogoOverride" "#, path));
    }
    if let Some(path) = content.hero_image {
        images.push_str(&image(r#"placement="hero" "#, path));
    }
    if let Some(path) = content.inline_image {
        images.push_str(&image("", path));
    }

    let audio = content.sound.map_or_else(
        || r#"<audio silent="true"/>"#.to_string(),
        |src| format!(r#"<audio src="{}"/>"#, escape(src)),
    );

    let actions = content
        .buttons
        .iter()
        .take(3)
        .fold(String::new(), |mut out, b| {
            let _ = write!(
                out,
                r#"<action content="{}" arguments="{}" activationType="{}"/>"#,
                escape(&b.label),
                escape(&b.arguments),
                if b.protocol { "protocol" } else { "background" }
            );
            out
        });

    let actions = if actions.is_empty() {
        actions
    } else {
        format!("<actions>{actions}</actions>")
    };

    format!(
        r#"<toast{toast_attrs}><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text>{images}</binding></visual>{audio}{actions}</toast>"#,
        escape(content.title),
        escape(content.body),
    )
}

/// Shows the toast. `on_activated` gets the `arguments` of a body click or a
/// non-protocol button, while the app runs.
pub fn show(
    app_id: &str,
    content: &ToastContent,
    on_activated: impl Fn(String) + Send + 'static,
) -> windows::core::Result<()> {
    let doc = XmlDocument::new()?;
    doc.LoadXml(&HSTRING::from(xml(content)))?;
    let toast = ToastNotification::CreateToastNotification(&doc)?;
    toast.SetTag(&HSTRING::from(content.tag))?;
    toast.SetGroup(&HSTRING::from(content.group))?;
    toast.Activated(&TypedEventHandler::new(
        move |_, args: Ref<IInspectable>| {
            let arguments = args
                .as_ref()
                .and_then(|a| a.cast::<ToastActivatedEventArgs>().ok())
                .and_then(|a| a.Arguments().ok())
                .map(|a| a.to_string())
                .unwrap_or_default();
            if !arguments.is_empty() {
                on_activated(arguments);
            }
            Ok(())
        },
    ))?;
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?.Show(&toast)
}

/// Removes a shown toast (also from the Action Center).
pub fn remove(app_id: &str, tag: &str, group: &str) -> windows::core::Result<()> {
    ToastNotificationManager::History()?.RemoveGroupedTagWithId(
        &HSTRING::from(tag),
        &HSTRING::from(group),
        &HSTRING::from(app_id),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn content<'a>() -> ToastContent<'a> {
        ToastContent {
            tag: "seq",
            group: "sub",
            title: "Disk <full> & \"hot\"",
            body: "body",
            hero_image: None,
            inline_image: None,
            app_logo: None,
            buttons: vec![ToastButton {
                label: "Open's".to_string(),
                arguments: "https://x.io/?a=1&b=2".to_string(),
                protocol: true,
            }],
            clickable: true,
            alarm: false,
            long: false,
            sound: None,
        }
    }

    #[test]
    fn xml_escapes_text_and_parses() {
        let xml = xml(&content());
        assert!(xml.contains("Disk &lt;full&gt; &amp; &quot;hot&quot;"));
        assert!(xml.contains(r#"arguments="https://x.io/?a=1&amp;b=2" activationType="protocol""#));
        assert!(xml.contains(r#"<audio silent="true"/>"#));
        assert!(xml.contains(r#"launch="click""#));

        let doc = XmlDocument::new().unwrap();
        doc.LoadXml(&HSTRING::from(xml)).unwrap();
    }
}
