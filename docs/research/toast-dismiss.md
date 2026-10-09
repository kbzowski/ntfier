# Can we dismiss or replace a shown Windows toast?

Ticket: #17 (map: #1)

## Answer

Yes, but not through `tauri-winrt-notification`. Windows can do both things if a toast was
shown with a `Tag` and `Group`:

- **Replace:** show a new toast with the same Tag and Group. Windows swaps it in and moves it to
  the top of Notification Center.
- **Remove:** `ToastNotificationManager::History()?.RemoveGroupedTagWithId(tag, group, aumid)`.

ntfy's `sequence_id` fits as the Tag as-is: ntfy allows `[-_A-Za-z0-9]{1,64}`, and Windows
allows Tags up to 64 characters. The topic fits as the Group under the same rule.

The problem is that the crate never sets Tag or Group on a normal toast, in 0.7.3 or in the
latest 0.8.1. It also gives us no hook to do it ourselves: `create_template` is private, and
`show()` builds the toast and shows it in one step. The cheapest fix is to build the
`ToastNotification` ourselves with the `windows` crate. We already have windows 0.61.3 in the
lockfile through this crate, so it adds no new copy. We also need to keep the AUMID we already
pass (`com.ntfier.app`).

## Evidence

- Our call site: `src-tauri/src/services/connection_manager.rs:504-573`. The AUMID is always
  `app_handle.config().identifier`, which is `com.ntfier.app` (`src-tauri/tauri.conf.json:5`).
  We never fall back to `Toast::POWERSHELL_APP_ID`. The repo does not read `sequence_id` yet.
- `tauri-plugin-notification` 2.3.3 (`src/desktop.rs` l. 195-205) sets the AUMID only for an
  installed exe. Under `target/debug` or `target/release` it leaves the AUMID unset, and
  notify-rust then uses `Toast::POWERSHELL_APP_ID` (`notify-rust-4.18.0/src/windows.rs:79`). Our
  enhanced path does not do this. In `tauri dev` it uses `com.ntfier.app`, and no Start-menu
  shortcut is registered for that id. MS says a desktop app cannot raise toasts without such a
  shortcut. History and Remove behaviour in dev is untested.
  https://learn.microsoft.com/en-us/windows/win32/shell/enable-desktop-toast-with-appusermodelid
- `tauri-winrt-notification-0.7.3/src/lib.rs`
  ([docs.rs](https://docs.rs/tauri-winrt-notification/0.7.3/tauri_winrt_notification/struct.Toast.html)):
  - `create_template` (l. 576) is private.
  - `show` (l. 692-723) calls `SetTag` only when `.progress(...)` is set, and never calls
    `SetGroup`. `.progress` also adds a progress bar to the XML, so we can't use it to get a Tag.
  - The crate has no History, Remove, or Group API. The same is true of 0.8.1 on crates.io and
    of the `dev` branch of
    [tauri-apps/winrt-notification](https://github.com/tauri-apps/winrt-notification), where the
    only `SetTag` is the progress one.
- `ToastNotification.Tag`: "This API returns an exception if the property is set to `null` or
  the empty string. The tag can be maximum 16 characters long. However, the Creators Update
  (15063) extends this limit to 64 characters."
  https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag
- `ToastNotificationHistory.Remove(tag, group, applicationId)` "Removes an individual toast
  notification from action center, identified by the combination of tag label, group label and
  app ID."
  https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotificationhistory.remove
  In windows-rs 0.61.3 this overload is `ToastNotificationHistory::RemoveGroupedTagWithId`, and
  `ToastNotification` has `SetTag` and `SetGroup` (`windows-0.61.3/src/Windows/UI/Notifications/mod.rs`).
- Unpackaged apps must use the overloads that take an AUMID. Microsoft's own desktop compat
  layer (Community Toolkit `ToastNotificationHistoryCompat.cs`) calls
  `Remove(tag, group, aumid)` whenever it has an AUMID. For a toast with only a tag, it passes a
  placeholder group (`"toolkitGroupNull"`) rather than an empty string. So we should always set
  a non-empty Group.
  https://github.com/CommunityToolkit/WindowsCommunityToolkit/blob/main/Microsoft.Toolkit.Uwp.Notifications/Toasts/Compat/ToastNotificationHistoryCompat.cs
- Replace semantics: "You can **replace** a notification by sending a new notification with the
  same **Tag** and **Group**." It "Moves the notification to the top of Notification Center",
  can pop up again, and "is always sent regardless of whether the user dismissed the previous
  notification."
  https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-progress-bar#update-or-replace-a-notification
  This page is written for the Windows App SDK `AppNotification`. WinRT `ToastNotification` has
  the same Tag/Group model, but we have not tested this on a real build.
- ntfy: "When a notification is meant to be updated, cleared, or deleted, you publish a new
  message with the same sequence ID."
  https://github.com/binwiederhier/ntfy/blob/main/docs/publish.md#updating-deleting-notifications
  The server validates it with `sequenceIDRegex = topicRegex = ^[-_A-Za-z0-9]{1,64}$`
  (`server/server.go` l. 90, 102).

## Options

1. **Build the toast with `windows` directly (recommended).** Add
   `windows = { version = "0.61", features = ["UI_Notifications", "Data_Xml_Dom"] }` under
   `cfg(windows)`. Copy the XML template from the crate (around 60 lines, and fix the
   unescaped button attributes from #3 while we're there). Then: `CreateToastNotification`,
   `SetTag(sequence_id)`, `SetGroup(topic)`, `CreateToastNotifierWithId(aumid)`, `Show`. For
   dismissal, call `History()?.RemoveGroupedTagWithId`. We can then drop
   `tauri-winrt-notification` as a direct dependency, but it stays in the tree through
   notify-rust.
2. **Upstream PR adding `.tag()` / `.group()` to the crate.** That's a small change, but we are
   pinned to 0.7 to share windows 0.61 with notify-rust, so we'd also need a 0.7.x release or a
   `[patch]` fork until then.
3. **Fork with `[patch.crates-io]`.** Quick, but we'd have to maintain the fork.

## Not checked

- Nothing was run on a real machine. A hand test on an installed build should confirm both
  replace and remove for `com.ntfier.app`, and should check what happens in `tauri dev`.
