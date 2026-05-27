# R'a Core

A standalone terminal AI coding assistant built with Bun, OpenTUI, and React.

## Highlights

- CLI-only architecture
- Local sessions and config under `~/.racore/`
- OpenAI/Codex setup with API-key fallback
- OpenRouter OAuth PKCE connect flow
- In-app configuration, onboarding, releases, and npm update notifications

## Setup

```bash
bun install
cp .env.example .env
```

Optional `.env` values:

```bash
OPENAI_API_KEY=
OPENROUTER_API_KEY=
NPM_TOKEN=
RACORE_UPDATE_CHANNEL=latest
```

## Run

```bash
bun run dev:cli
```

## Link the CLI

```bash
bun run link:cli
racore
```

## Versioning

From the repo root:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

After bumping a version:

1. Update `CHANGELOG.md`
2. Build the CLI
3. Publish to npm

## Publish to npm

```bash
npm login
bun run build:cli
npm publish --workspace @loai/racore-cli --access public
```

## In-app release workflow

- `/onboarding` shows setup and publish steps
- `/releases` shows the current version and changelog notes
- startup checks npm directly for a newer published version of `@loai/racore-cli`

## Local Data

R'a Core stores local state in `~/.racore/`:

- `auth.json`
- `config.json`
- `preferences.json`
- `sessions/*.json`
