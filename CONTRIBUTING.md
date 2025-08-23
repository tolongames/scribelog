# Contributing to Scribelog

Thanks for your interest in contributing! This guide explains how to set up the project locally, coding style rules, how to run tests, and how to propose changes.

- License: see [LICENSE](LICENSE)
- Security policy: see [SECURITY.md](SECURITY.md)
- CI workflow: [.github/workflows/node.js.yml](.github/workflows/node.js.yml)

## Prerequisites

- Node.js LTS or Current (CI runs on 18.x, 20.x, 22.x)
- npm (recommended) or yarn/pnpm
- Git

## Quick start

1) Fork the repo and clone your fork:
- git clone https://github.com/<your-username>/scribelog.git
- cd scribelog

2) Install dependencies:
- npm ci

3) Run tests to verify your setup:
- npm test

4) Optional: run formatting & lint locally:
- npm run format:check
- npm run lint

You’re ready to contribute.

## Project structure

- Source code: [src/](src)
  - Logger core: [src/logger.ts](src/logger.ts), types: [src/types.ts](src/types.ts), levels: [src/levels.ts](src/levels.ts), formats: [src/format.ts](src/format.ts)
  - Transports: [src/transports/](src/transports)
  - Adapters: [src/adapters/](src/adapters)
  - Public API: [src/index.ts](src/index.ts)
- Tests: [test/](test)
- Docs: [README.md](README.md), [DOCUMENTATION.md](DOCUMENTATION.md)
- Lint/format config: [eslint.config.mjs](eslint.config.mjs), [.prettierrc.json](/.prettierrc.json)
- CI: [.github/workflows/node.js.yml](.github/workflows/node.js.yml)

## Scripts

- Format (check/fix):
  - npm run format:check
  - npm run format
- Lint (check/fix):
  - npm run lint
  - npm run lint:fix
- Tests:
  - npm test
  - Jest filters: npx jest test/logger.test.ts -t "pattern"

The CI pipeline runs format:check, lint, and tests (see [.github/workflows/node.js.yml](.github/workflows/node.js.yml)).

## Coding style

- Use Prettier and ESLint. The repo is configured via [eslint.config.mjs](eslint.config.mjs) and [.prettierrc.json](/.prettierrc.json).
- Fix formatting/lint before pushing:
  - npm run format
  - npm run lint:fix
- Tests should accompany changes, especially for:
  - Log parsing/formatting rules in [src/format.ts](src/format.ts)
  - Logger behavior in [src/logger.ts](src/logger.ts)
  - New transports/adapters behavior under [test/](test)

## Commit messages and branches

- Use Conventional Commits:
  - feat(scope): add new HTTP transport option
  - fix(logger): handle null metadata gracefully
  - docs: update profiling docs
  - test: add adapter tests
  - chore: deps and CI tweaks
- Work on feature branches (e.g., feat/async-batch-improve), then open a PR to main.

## Pull Request checklist

- [ ] Code is formatted (npm run format) and linted (npm run lint)
- [ ] All tests pass (npm test)
- [ ] Added/updated tests for new behavior
- [ ] Docs updated where relevant: [README.md](README.md), [DOCUMENTATION.md](DOCUMENTATION.md)
- [ ] For public API changes, updated examples and types in [src/types.ts](src/types.ts) and re-export in [src/index.ts](src/index.ts)

## Adding a new transport

1) Create a file in [src/transports/](src/transports) (e.g., http/tcp/udp/websocket already exist).
2) Implement the [`Transport`](src/types.ts) interface.
3) Prefer accepting a `format?: LogFormat` and default to JSON via [`format.defaultJsonFormat`](src/format.ts).
4) Export it in the public API:
   - Add import and entry to `transports` object in [src/index.ts](src/index.ts)
   - Export the options type from [src/index.ts](src/index.ts)
5) Add tests under [test/](test). See AsyncBatch tests for patterns.
6) Document usage in [DOCUMENTATION.md](DOCUMENTATION.md), Transports section.

## Adding/adjusting formatters

- Implement formatter functions in [src/format.ts](src/format.ts).
- Ensure they compose correctly with [`format.combine`](src/format.ts).
- Keep performance in mind: avoid unnecessary object cloning on hot paths.
- Update docs in [DOCUMENTATION.md](DOCUMENTATION.md) (Formatting section) and add tests.

## Logger changes (core)

- Public API is exposed from [src/index.ts](src/index.ts). Update types in [src/types.ts](src/types.ts) and add re-exports in [src/index.ts](src/index.ts).
- Profiling/timers live in [`logger.Scribelog`](src/logger.ts):
  - Concurrency-safe handles
  - Clean-up TTL and maxActiveProfiles
  - Fast-path when profiling is effectively disabled
  - Configurable tags/fields and metrics hook
- When changing behavior, add/expand tests in [test/logger.test.ts](test/logger.test.ts) and update docs in [DOCUMENTATION.md](DOCUMENTATION.md).

## Adapters (Express/Koa/Fastify/Nest/Next)

- Adapters are in [src/adapters/](src/adapters). Keep:
  - requestId propagation via [`runWithRequestContext`](src/requestContext.ts)
  - request/response logs with durationMs, method, url, statusCode
  - header redaction support
- Add/adjust tests in [test/logger.test.ts](test/logger.test.ts), “Framework adapters” section.

## Running examples

- See [examples/](examples). You can run Node examples directly if they are JS, or with ts-node if TS (or transpile via tests). Keep examples minimal and consistent with README/Documentation.

## Security

- Do not disclose vulnerabilities publicly. Follow [SECURITY.md](SECURITY.md).
- Avoid introducing dependencies that weaken supply chain security.
- New features that touch network/file I/O should consider redaction/masking via [`format.maskSensitive`](src/format.ts).

## Release flow (maintainers)

- CI runs on pushes and PRs to main; publish is tied to GitHub Releases (see [.github/workflows/node.js.yml](.github/workflows/node.js.yml)).
- Prepare release notes and bump version according to changes (Conventional Commits help).

## Questions

Open a discussion or an issue with a clear description and reproduction
