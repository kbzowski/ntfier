//! Settings-related database queries.

use diesel::prelude::*;

use crate::db::connection::Database;
use crate::db::models::SettingRow;
use crate::db::schema::settings;
use crate::error::AppError;
use crate::models::{AppSettings, NotificationDisplayMethod, NotificationSettings, ThemeMode};

impl Database {
    /// Gets a string setting with a default fallback.
    fn get_setting_string(&self, key: &str, default: &str) -> Result<String, AppError> {
        let mut conn = self.conn()?;

        let result: Option<String> = settings::table
            .filter(settings::key.eq(key))
            .select(settings::value)
            .first(&mut *conn)
            .optional()?;

        Ok(result.unwrap_or_else(|| default.to_string()))
    }

    /// Gets a boolean setting with a default fallback.
    fn get_setting_bool(&self, key: &str, default: bool) -> Result<bool, AppError> {
        let mut conn = self.conn()?;

        let result: Option<String> = settings::table
            .filter(settings::key.eq(key))
            .select(settings::value)
            .first(&mut *conn)
            .optional()?;

        Ok(result.map_or(default, |v| v == "true"))
    }

    /// Gets notification-specific settings only (does not fetch server credentials).
    /// Use this when displaying notifications to avoid unnecessary credential lookups.
    pub fn get_notification_settings(&self) -> Result<NotificationSettings, AppError> {
        let notification_method_str = self.get_setting_string("notification_method", "native")?;
        let notification_method = match notification_method_str.as_str() {
            "windows_enhanced" => NotificationDisplayMethod::WindowsEnhanced,
            _ => NotificationDisplayMethod::Native,
        };
        let notification_force_display =
            self.get_setting_bool("notification_force_display", false)?;
        let notification_show_actions = self.get_setting_bool("notification_show_actions", true)?;
        let notification_show_images = self.get_setting_bool("notification_show_images", true)?;
        let notification_sound = self.get_setting_bool("notification_sound", true)?;

        Ok(NotificationSettings {
            notification_method,
            notification_force_display,
            notification_show_actions,
            notification_show_images,
            notification_sound,
        })
    }

    /// Gets the `start_minimized` setting.
    pub fn get_start_minimized(&self) -> Result<bool, AppError> {
        self.get_setting_bool("start_minimized", false)
    }

    /// Gets the `minimize_to_tray` setting.
    pub fn get_minimize_to_tray(&self) -> Result<bool, AppError> {
        self.get_setting_bool("minimize_to_tray", true)
    }

    /// Gets the `delete_local_only` setting.
    pub fn get_delete_local_only(&self) -> Result<bool, AppError> {
        self.get_setting_bool("delete_local_only", true)
    }

    /// Gets all application settings.
    pub fn get_settings(&self) -> Result<AppSettings, AppError> {
        let theme_str = self.get_setting_string("theme", "system")?;
        let theme = match theme_str.as_str() {
            "light" => ThemeMode::Light,
            "dark" => ThemeMode::Dark,
            _ => ThemeMode::System,
        };

        let minimize_to_tray = self.get_setting_bool("minimize_to_tray", true)?;
        let start_minimized = self.get_setting_bool("start_minimized", false)?;

        // Notification settings
        let notification_method_str = self.get_setting_string("notification_method", "native")?;
        let notification_method = match notification_method_str.as_str() {
            "windows_enhanced" => NotificationDisplayMethod::WindowsEnhanced,
            _ => NotificationDisplayMethod::Native,
        };
        let notification_force_display =
            self.get_setting_bool("notification_force_display", false)?;
        let notification_show_actions = self.get_setting_bool("notification_show_actions", true)?;
        let notification_show_images = self.get_setting_bool("notification_show_images", true)?;
        let notification_sound = self.get_setting_bool("notification_sound", true)?;

        // Message display settings
        let compact_view = self.get_setting_bool("compact_view", false)?;
        let expand_new_messages = self.get_setting_bool("expand_new_messages", true)?;

        // Deletion settings
        let delete_local_only = self.get_setting_bool("delete_local_only", true)?;

        // Favorites settings
        let favorites_enabled = self.get_setting_bool("favorites_enabled", false)?;

        let servers = self.get_servers_with_credentials()?;
        let default_server = self.get_default_server_url()?;

        Ok(AppSettings {
            theme,
            servers,
            default_server,
            minimize_to_tray,
            start_minimized,
            notification_method,
            notification_force_display,
            notification_show_actions,
            notification_show_images,
            notification_sound,
            compact_view,
            expand_new_messages,
            delete_local_only,
            favorites_enabled,
        })
    }

    /// Sets a setting value.
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        let setting = SettingRow {
            key: key.to_string(),
            value: value.to_string(),
        };

        diesel::replace_into(settings::table)
            .values(&setting)
            .execute(&mut *conn)?;

        Ok(())
    }
}
