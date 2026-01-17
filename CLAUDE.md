# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ntfier** is a desktop notification client for ntfy (ntfy.sh). This is the UI layer built with React, designed to be wrapped by Tauri for native desktop functionality.

## Commands

```bash
pnpm dev          # Start dev server on port 3000
pnpm build        # Build for production
pnpm test         # Run tests with Vitest
pnpm lint         # Lint with Biome
pnpm format       # Format with Biome
pnpm check        # Lint + format check
```

Add shadcn components:
```bash
pnpm dlx shadcn@latest add <component>
```

## Architecture

### Tech Stack
- **Framework**: TanStack Start (React 19 + file-based routing)
- **Styling**: Tailwind CSS v4 + shadcn/ui (new-york style)
- **Icons**: Lucide React
- **Linting/Formatting**: Biome

### Key Directories
- `src/routes/` - File-based routing (TanStack Router)
- `src/components/ui/` - shadcn/ui components (auto-generated)
- `src/components/layout/` - App layout (AppLayout, Sidebar components)
- `src/components/notifications/` - Notification display components
- `src/components/dialogs/` - Modal dialogs (Settings, AddSubscription)
- `src/themes/` - Theme system with presets
- `src/hooks/` - Custom React hooks for state management
- `src/types/` - TypeScript type definitions

### Theme System
Themes are defined in `src/themes/presets/`. To add a new theme:
1. Create `src/themes/presets/<name>.ts` with a `ThemeDefinition` object
2. Export it from `src/themes/presets/index.ts` and add to `themes` array
3. Theme appears automatically in Settings UI

Themes use OKLch color space and are applied dynamically via CSS variables.

### State Management
Currently using React hooks with mock data (`src/data/mock-data.ts`). No API integration yet - designed for future Tauri backend connection.

### Layout
- Drawer-based sidebar (Sheet component) for subscriptions list
- Main content area shows notifications for selected topic
- Header with menu button, logo, and settings access

### Path Aliases
`@/*` maps to `src/*` (configured in tsconfig.json)
