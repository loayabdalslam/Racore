# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Overview

This repository contains the source for **R’a Core CLI**, a standalone terminal-based AI coding assistant.  
The project is structured as a **monorepo** with the main application implemented in:

```
packages/cli/
```

The CLI is built using:

- **Bun** (via a wrapper script `scripts/run-bun.mjs`)
- **React** (rendered via the OpenTUI framework)
- **TypeScript ES modules**
- **ai-sdk** and **OpenAI client** for model interactions
- **React Router** for screen navigation inside the TUI

The application compiles to a distributable CLI binary exposed as:

```
racore
```

## Key Development Commands

All commands are run from:

```
packages/cli/
```

### Development Mode (with file watching)

```
npm run dev
```

This uses Bun to run `src/index.tsx` in watch mode.

### Build

```
npm run build
```

Produces the CLI output in `packages/cli/dist/` for publishing.

### Run Tests

```
npm test
```

All tests are located at:

```
src/lib/*.test.ts
```

### Run a Single Test

```
node ../../scripts/run-bun.mjs test src/lib/<test-file>.test.ts
```

Replace `<test-file>` with the name of a test to run only that file.

## High-Level Architecture

### 1. Entry Point

```
packages/cli/src/index.tsx
```

This bootstraps:

- Providers (theme, dialogs, keyboard layer, toast, prompt config)
- The root layout
- The router for screen navigation

The CLI is effectively a **React application rendered in the terminal via OpenTUI**.

### 2. Screens (Application States)

Screens represent high-level flows:

```
src/screens/
  home.tsx
  config.tsx
  provider.tsx
  provider-screen.tsx
  new-session.tsx
  session.tsx
  onboarding.tsx
  releases.tsx
```

Each screen manages its own data loading and UI interactions.  
This is the primary place to make changes when altering user flows.

### 3. UI Components

Components live in:

```
src/components/
```

Important groups:

- **dialogs/**: Modal UI for configuration, provider selection, model selection, API keys, font size, theme, sessions, agents.
- **messages/**: User and bot message components for session rendering.
- **command-menu/**: UI and command definitions for palette-like features.
- **app-shell.tsx**: Global layout wrapper including header, status bar, and child routing.
- **input-bar.tsx**: The primary user input interaction component.
- **session-shell.tsx**: Handles rendering and streaming AI responses inside a session.

These components are built atop OpenTUI primitives.

### 4. Providers (App-wide State)

Under:

```
src/providers/
```

Key providers include:

- **theme/** — manages color theme and font sizing.
- **dialog/** — global modal stack.
- **keyboard-layer/** — keybinding layers (intercepts key events).
- **toast/** — notifications.
- **prompt-config/** — model + provider configuration used by session chat logic.

These act as React context providers and unify behavior across screens.

### 5. Core Logic (Chat, Config, Services)

Most non-UI logic lives in:

```
src/lib/
```

Notable files:

- **chat-service.ts** — Responsible for orchestrating model requests and streaming responses.
- **config-store.ts** — Reads/writes persistent CLI config (providers, keys, settings).
- **models.ts** — Defines available model configurations, providers, metadata, and validation.
- **tests** for corresponding modules.

This directory contains the bulk of the system’s behavior that integrates the API, session logic, and persisted user environment.

### 6. Build & Publish Infrastructure

The CLI uses:

```
scripts/run-bun.mjs
```

This wrapper ensures Bun commands run consistently across environments.

Publishing happens with:

```
npm publish
```

(after running the build script automatically via `prepublishOnly`)

### 7. Binary Entry Point

The published CLI exposes:

```
bin/racore
```

which executes the compiled script under `dist/`.

## Cursor / Copilot / Other Rules

There are **no .cursor rules, no .cursorrules, and no GitHub Copilot instruction files** in this repository at the time of generation, so nothing additional is required here.
