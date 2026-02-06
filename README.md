<p align="center">
  <img src="assets/logo.png" alt="Ntfier Logo" width="200">
</p>

<h1 align="center">Ntfier</h1>

<p align="center">
  A modern desktop notification client for <a href="https://ntfy.sh">ntfy</a>
</p>

## Features

- Real-time notifications via WebSocket
- Connect to multiple ntfy servers at once
- Subscribe to and manage multiple topics
- System tray with background notifications
- Auto-start on login
- Notification history with search
- Markdown rendering in notifications
- Image previews and attachment downloads
- Priority level indicators
- Dark/light themes (follows system preference)
- Auto-updates
- Cross-platform via Tauri (Windows now, macOS/Linux planned)

## Screenshots

*Coming soon*

## Installation

Download the latest release from the [Releases](https://github.com/kbzowski/ntfier/releases) page.

## Upgrading

### v1.0.0 Breaking Changes

**Database migration required:** Version 1.0.0 switches from rusqlite to Diesel ORM with a new database schema. The old database is **not compatible** with this version.

**Before upgrading, you must delete the old database file:**

```
%APPDATA%\com.ntfier.app\ntfier.db
```

> **Note:** This will delete all your subscriptions and notification history. You will need to re-add your subscriptions after upgrading.

## Requirements

This project uses [proto](https://moonrepo.dev/proto) for toolchain management:
Install proto and run `proto install` to install the required toolchains.

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

Build outputs are located in `src-tauri/target/release/bundle/`.

## Project Structure

```
ntfy-desktop/
├── ui/           # React frontend (TanStack Router, Tailwind CSS)
└── src-tauri/    # Rust backend (Tauri 2)
```

## Linting & Formatting

### UI
```bash
pnpm ui:lint
pnpm --filter ui format
pnpm --filter ui check
```

### Backend (src-tauri)
```bash
cd src-tauri
cargo fmt
cargo clippy
```

## License

MIT
