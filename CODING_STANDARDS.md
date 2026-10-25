# Coding standards

Read during review. Formatting, import order and lint rules are enforced by biome, rustfmt and clippy; they are not repeated here. Domain vocabulary lives in `GLOSSARY.md`.

## Rust (`src-tauri/`)

- Shared state goes in Tauri managed state: `app.manage(...)` in `lib.rs`, read through `State<'_, T>` in commands or `handle.state::<T>()` in services. No `static` globals holding app state.
- Map a `tauri::Error` to an `AppError` variant at the call site with `map_err`. No blanket `From<tauri::Error> for AppError`: it would label every future `?` on any Tauri call with one variant.
- Build windows from an `async` command or through `tauri::async_runtime::spawn`. Building one from a sync command or a menu handler can deadlock on Windows.
- After a command saves something another window shows, emit the event through the shared helper for it (e.g. `emit_settings_changed`), not an inline `app_handle.emit(...)` with the same name.

## Events between windows

- Event names a window filters for itself carry a feature prefix (`settings:changed`, `settings:edit-server`). A plain JS `listen()` also receives events targeted at other window labels, so a bare name can be picked up by the wrong window.
- Listeners refetch from Rust and update silently. Toasts belong to the action handler in the window that saved, never to a listener.

## UI (`ui/`)

- Branching logic worth testing is pulled into a pure function in `ui/src/lib/` with a vitest test beside it. There is no DOM test environment; components, hooks and event wiring stay untested by design.
- Tauri-only calls and listeners sit behind `isTauri()`, so every route still loads in the browser on mock data.
