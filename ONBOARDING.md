# R'a Core Onboarding

## Local setup

1. Install Bun and Node.js
2. Copy `.env.example` to `.env`
3. Set `OPENAI_API_KEY` if you want OpenAI/Codex ready on first launch
4. Run `bun install`
5. Run `bun run dev:cli`

## Local app data

R'a Core stores runtime data in `~/.racore/`:

- `auth.json`
- `config.json`
- `preferences.json`
- `sessions/*.json`

## Prepare for npm publish

1. Confirm the scoped package name `@loai/racore-cli` is available on npm
2. Run `npm login`
3. Make sure `packages/cli/package.json` has the right repository URLs
4. Build with `bun run build:cli`
5. Publish from the repo root with `npm publish --workspace @loai/racore-cli --access public`

## Versioning

Use one of these from the repo root:

- `npm run version:patch`
- `npm run version:minor`
- `npm run version:major`

Then update `CHANGELOG.md` with the release description before publishing.

## Auto-update expectation

The CLI checks the npm registry for the latest published `@loai/racore-cli` version and can surface an update notice inside the app.
