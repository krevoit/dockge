# Contributing

Bug reports, fixes and improvements are welcome. For larger changes or new features, open an issue first so we can agree on the approach before you spend time on it.

## Development

Requirements: Node.js 24, Docker with the Compose plugin.

```bash
npm ci
npm run dev          # backend on :5001 and the Vite dev server with hot reload on :5000
```

Before opening a pull request:

```bash
npm run lint
npm run check-ts
npm run build:frontend
```

To build and run the image locally (amd64):

```bash
npm run build:docker   # docker buildx bake, tagged krevoit/dockge:local
npm run start-docker
```

## Guidelines

- Keep pull requests focused: one fix or feature per pull request.
- Match the style of the surrounding code; `npm run fmt` fixes most formatting.
- New UI text goes through `$t("...")` with an English entry in `frontend/src/lang/en.json`.
- Anything that runs `docker` or touches the filesystem must validate its input (see `assertSafeStackName`, `assertSafePath` and `assertSafeServiceName` in `backend/stack.ts`) and pass user input as arguments, never through a shell.
- Report security issues privately, see [SECURITY.md](SECURITY.md).
