# Can Windows toast buttons call back into the app?

Ticket: #3 (map: #1, unblocks #11)

## Answer

Yes, as long as ntfier is running. The crate we already use, `tauri-winrt-notification` 0.7.3,
has `Toast::on_activated(|arguments| ...)`. It hooks the WinRT `ToastNotification.Activated`
event, and the closure receives the clicked button's `arguments` string. Inside that closure we
can do anything in Rust: send the `http` request with `reqwest`, write to the clipboard for
`copy`, or open the URL for `view`. We need no new crate.

Two catches:

1. **Our buttons may not open URLs today.** The crate puts the URL into the button's
   `arguments` and sets no `activationType`, so Windows uses the default, `foreground`.
   Per the schema, a `foreground` button activates our own app and does not open the URL. We
   never register `on_activated`, so the URL in `arguments` is never used. Test this by hand
   on an installed build.
2. **The callback is in-process only.** If the app has quit, nobody is listening. A
   callback that survives a restart needs a COM activator (`INotificationActivationCallback`
   plus a `ToastActivatorCLSID` on the Start-menu shortcut). Tauri's NSIS installer does not
   set that CLSID, and neither crate implements the activator. ntfier lives in the tray, so
   in normal use it is running when a toast is clicked.

## Evidence

- Our call site: `src-tauri/src/services/connection_manager.rs:543-549` passes `action.url`
  as the button's `action`. The AUMID is the bundle id `com.ntfier.app`
  (`connection_manager.rs:521`, `src-tauri/tauri.conf.json:5`). The repo has no
  `on_activated` call anywhere.
- Crate version: `src-tauri/Cargo.toml:73` (`tauri-winrt-notification = "0.7"`). The lockfile
  resolves it to 0.7.3.
- Crate source, `tauri-winrt-notification-0.7.3/src/lib.rs`
  ([crates.io](https://crates.io/crates/tauri-winrt-notification/0.7.3),
  [docs.rs](https://docs.rs/tauri-winrt-notification/0.7.3/tauri_winrt_notification/struct.Toast.html)):
  - `add_button` (l. 489-498) says in its doc comment that `action` "will be sent as an
    argument [to] on_activated when the button is clicked".
  - `on_activated` (l. 508-530) takes `FnMut(Option<String>) + Send + 'static` and reads
    `ToastActivatedEventArgs.Arguments()`.
  - `create_template` (l. 596-607) writes `<action content='{}' arguments='{}'/>` with no
    `activationType` and **no XML escaping** of label or URL. Titles and images are escaped
    elsewhere (l. 362, 424). An `&` or `'` in a URL makes `LoadXml` fail, and we then fall back
    to the plain notification (`connection_manager.rs:568-572`).
  - `show` (l. 692-723) attaches the handler to that one `ToastNotification` object, so it only
    lives as long as our process.
- Toast schema, `<action>`: `activationType` defaults to `foreground` ("Your foreground app is
  launched"). `protocol` "launch[es] a different app using protocol activation".
  https://learn.microsoft.com/en-us/uwp/schemas/tiles/toastschema/element-action
- Activation from Action Center after the app has quit goes through
  `INotificationActivationCallback`, a COM interface for desktop apps.
  https://learn.microsoft.com/en-us/windows/win32/api/notificationactivationcallback/nn-notificationactivationcallback-inotificationactivationcallback
- A desktop app needs a Start-menu shortcut with its AUMID before it can raise toasts.
  https://learn.microsoft.com/en-us/windows/win32/shell/enable-desktop-toast-with-appusermodelid
  Tauri's NSIS installer sets the AUMID (`SetLnkAppUserModelId`) but no
  `ToastActivatorCLSID`.
  https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi
  (l. ~949-953)

## Alternatives

- **tauri-plugin-notification**: no help here. Its Actions API (`registerActionTypes`,
  `onAction`) is mobile only, and on Windows it "only works for installed apps".
  https://v2.tauri.app/plugin/notification/
- **notify-rust 4.18** (a dependency of the plugin): its Windows backend wraps the same
  `Toast` and uses `on_activated` the same way (`src/windows.rs:22-27`). It brings nothing
  new.
- **The `windows` crate directly** (`ToastNotification::Activated`): this is the API our crate
  already wraps. It only pays off if we want `activationType="protocol"` (the OS opens a
  `view` URL even if we have quit) or a COM activator. Both mean building the toast XML
  ourselves.
- **win-toast-notify** and similar crates: not evaluated in depth. They still need a COM
  activator to handle clicks after the app has quit.

## Unpackaged / dev caveat

Toasts are tied to the AUMID. In `tauri dev`, or for a portable exe with no installed
shortcut, Windows either drops the toast or shows it as coming from PowerShell. Activation
callbacks need the installed build. Test from the NSIS install, not from `tauri dev`.

## Recommendation

Do all three action types through `on_activated` and leave the OS out of it:

1. Put a short key in the button's `arguments`, such as the action's index or id, not the raw
   URL. The crate does not escape `arguments`, so this also fixes the XML-escaping problem.
   XML-escape the label ourselves before passing it.
2. Register `.on_activated(move |arg| ...)` with a cloned `AppHandle` plus the notification's
   actions. Dispatch on the action type: `view` opens the URL (`tauri-plugin-shell` is already
   a dependency), `http` sends the request with `reqwest`, `copy` writes to the clipboard.
   Run the work on the async runtime, not on the WinRT callback thread.
3. `NotificationAction` (`src-tauri/src/models/notification.rs:67`) currently drops ntfy's
   `action` type, `headers`, `body` and the copy `value`. #11 has to carry them through.
4. Accept that a toast clicked after ntfier has quit does nothing. Revisit with a COM activator
   only if users report it.

Not verified: whether the in-process `Activated` event fires for a toast clicked in Action
Center while the app is still running. Check this by hand on the installed build.
