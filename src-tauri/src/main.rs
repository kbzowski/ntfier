// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `pnpm types:create` passes this to regenerate bindings without starting the app.
    #[cfg(debug_assertions)]
    if std::env::args().any(|arg| arg == "--export-bindings") {
        ntfier_lib::export_bindings();
        return;
    }

    ntfier_lib::run();
}
