# Reference: Build, Tooling & Environment

- Last verified: 2026-07-09 · revision `1814ad0d`

## Commands (`package.json` scripts)

| Command | Does |
|---|---|
| `pnpm dev` | Vite dev server on `:5173`, host `0.0.0.0` |
| `pnpm build` | `run-s generate:typed-router "build:app"` — gen router types, then build |
| `pnpm build:app` | `run-p type-check "build-only"` — parallel type-check + vite build |
| `pnpm build-only` | `vite build` |
| `pnpm type-check` | `vue-tsc --build` |
| `pnpm test` | `node --test --experimental-strip-types tests/*.test.ts` |
| `pnpm format` | `prettier --write .` |
| `pnpm generate:typed-router` | `vite build --config scripts/typed-router.d.ts/config.ts` (writes `.d.ts` only) |
| `pnpm prepare` | `husky` |

Engines: Node `^20.19.0 || >=22.12.0`. Package manager: **pnpm** (lockfile + `pnpm-workspace.yaml`).

## Vite config (`vite.config.ts`)

- Dev server `port: 5173`, `host: "0.0.0.0"`. `build.manifest: true`.
- Plugins: `unpluginVueRouterInstance` (from `./scripts/typed-router.d.ts/shared`),
  `@vitejs/plugin-vue`, `@vitejs/plugin-vue-jsx`, `vite-plugin-vue-devtools`,
  `@tailwindcss/vite` (Tailwind v4), `versionPlugin`.
- **Alias `@` → `./src`** (`resolve.alias`). Mirrored in `tsconfig.json` + `tsconfig.app.json`
  (`paths: { "@/*": ["./src/*"] }`).

## `versionPlugin.ts` (post-build manifest hashing)

`closeBundle` hook (`:13`): reads `dist/.vite/manifest.json`, SHA-256 hashes its content, writes
`{ hash, timeStamp }` to `dist/.vite/version.json`. Consumed by `src/utils/detectUpdate.ts`
(30s poll, skipped in dev, persistent toast on change).

## TypeScript config (project references)

- `tsconfig.json` — root, `files: []`, references `tsconfig.node.json` + `tsconfig.app.json`;
  shared `baseUrl "."` + `paths "@/*"`.
- `tsconfig.app.json` — `extends @vue/tsconfig/tsconfig.dom.json`; includes `env.d.ts`,
  `src/**/*`, `src/**/*.vue`; excludes `src/**/__tests__/*`.
- `tsconfig.node.json` — for build/tooling files; `module: ESNext`, `moduleResolution: Bundler`,
  `types: ["node"]`, `noEmit`.

## File-based router type-gen (`scripts/typed-router.d.ts/`)

- `shared.ts` — exports `unpluginVueRouterInstance` (used by both `vite.config.ts` and the
  isolated gen build).
- `config.ts` — standalone Vite config (`build.write: false`, `rollupOptions.input` =
  `input.ts`) used **only** to generate `.d.ts` in isolation. Not part of the app build.
- Emits `src/types/typed-router.d.ts` (gitignored; generated at build/dev time).

## Lint / format / hooks

- `eslint.config.mjs` — flat config, `**/*.ts` (ignores `**/*.d.ts`), `@typescript-eslint/parser`;
  enforces only `semi: error`, `prefer-const: error`. Very minimal.
- `prettier.config.mjs` — `prettier-plugin-tailwindcss`,
  `tailwindStylesheet: "./src/style/app.css"`, `tailwindFunctions: ["cn","clsx","cva"]`.
- `.husky/pre-commit` → `pnpm lint-staged`.
- `lint-staged` (`package.json`): `*.{js,ts,vue,jsx,tsx}` → `prettier --write` then
  `eslint --fix`; `*.{css,scss,html}` → `prettier --write`.

## `components.json` (shadcn-vue)

`style: new-york`, `typescript: true`, `baseColor: zinc`, `cssVariables: true`, `iconLibrary: lucide`.
Aliases: `components → @/components`, `ui → @/components/ui`, `utils → @/lib/utils`,
`lib → @/lib`, `composables → @/composables`.
> ⚠️ `tailwind.css` recorded as `src/app.css` but actual file is `src/style/app.css` — affects
> shadcn codegen hints only.

## CI (`.github/workflows/build-nightly.yml`)

"Nightly Build": triggers on push/PR to `main` + `workflow_dispatch`. Node 24, pnpm 10,
`pnpm install --frozen-lockfile` (`HUSKY: 0`), `pnpm build`. Uploads `dist` as artifact; a
`release` job zips + tar.gz's `dist` and publishes a `nightly` prerelease GitHub Release via
`softprops/action-gh-release@v2`.

## Environment variables

| Var | Declared in | Used for |
|---|---|---|
| `VITE_BACKEND_WS` | `example.env.development` | Dev seed: full WebSocket URL (`wss://host/nodeget/rpc`) |
| `VITE_BACKEND_TOKEN` | `example.env.development` | Dev seed: NodeGet API token |
| `VITE_RPC_DEBUG_PANEL_ENABLED` | `env.d.ts`, `example.env.development` | Initial default for RPC debug panel capture (`true`/`false`); user changes override in localStorage |
| `VITE_BOOTSTRAP` | `.env` | (build-time; install bootstrap) |
| `VITE_INSTALL_URL` | `.env` | (build-time; agent install URL) |
| `VITE_RELEASE_REPO` | `.env` | (build-time; release repo) |

Dev-mode auto-seed: when `DEV && backends.empty && VITE_BACKEND_WS`, `useBackendStore` pushes a
`Dev` backend from `VITE_BACKEND_WS` + `VITE_BACKEND_TOKEN` (`:43-59`). In production, users add
backends via the `BackendSwitcher` dialog; stored in `localStorage` under `nodeget_backends` /
`nodeget_current_backend`.

## Key dependency versions (notable)

Vue 3.5, Pinia 3 (+ `pinia-plugin-persistedstate` 4.7), vue-router 4.6 (+ `unplugin-vue-router`),
vue-i18n 11, Tailwind 4 + `@tailwindcss/vite`/`@tailwindcss/typography`/`tw-animate-css`,
reka-ui + shadcn-vue, echarts 6, uplot, three, @xterm/xterm 6, codemirror 6 + lang pkgs,
markdown-it, compare-versions, diff, fflate, smol-toml, vue3-colorpicker, lucide-vue-next.
