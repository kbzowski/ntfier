<p align="center">
  <img src="assets/logo.png" alt="Ntfier Logo" width="200">
</p>

<h1 align="center">Ntfier</h1>

<p align="center">
  A modern desktop notification client for <a href="https://ntfy.sh">ntfy</a>
</p>

## Features

- **Real-time notifications** — Receive push notifications instantly via WebSocket
- **Multiple servers** — Connect to multiple ntfy servers simultaneously
- **Topic subscriptions** — Subscribe to multiple topics and manage them easily
- **System tray** — Minimize to tray and receive notifications in the background
- **Auto-start** — Launch automatically on system startup
- **Notification history** — Browse and search past notifications
- **Markdown support** — Rich text rendering for notification content
- **Attachments** — View images and download attachments
- **Priority levels** — Visual indicators for notification priority
- **Dark/Light themes** — Multiple theme presets with system preference support
- **Auto-updates** — Automatic update checking and installation
- **Cross-platform** — Built with Tauri for Windows (macOS and Linux planned)

## Screenshots

*Coming soon*

## Installation

Download the latest release from the [Releases](https://github.com/kbzowski/ntfier/releases) page.

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

**ui/**
```bash
pnpm ui:lint
pnpm --filter ui format
pnpm --filter ui check
```

**src-tauri/**
```bash
cd src-tauri
cargo fmt
cargo clippy
```

## License

MIT
