# Ntfier

Desktop notification client for [ntfy](https://ntfy.sh).

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
cargo lint
```

## License

MIT
