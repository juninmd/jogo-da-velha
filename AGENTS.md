# AGENTS.md

Tic-tac-toe where the player is **X** and an LLM plays **O**, with a short taunt generated on each move. A Bun
server serves one HTML page and a JSON API; the model is reached through Ollama or an OpenAI-compatible gateway (LiteLLM).

## Stack

- Bun only, standard library. No runtime dependencies, no `node_modules`, no frontend build: `src/index.html` is served by the server.
- TypeScript with `"type": "module"`. Tests use `bun test`.
- Docker image `oven/bun:1`, runs as the `bun` user, `PORT=3000` and `AI_PROVIDER=openai` by default.

## Commands

```sh
bun run start        # bun run src/server.ts; prints the model and the URL (http://localhost:3737 by default)
bun run dev          # same, with reload on change
bun test             # unit tests (game rules, mood, fallback)
bun run smoke        # plays a whole match against a running server (BASE, default http://localhost:3737)
docker build -t jogo-da-velha .
```

## Structure

- `src/server.ts`: `Bun.serve` routes `/`, `/health`, `POST /api/move`, `POST /api/endgame`
- `src/game.ts`: board rules (`winner`, `legalMoves`, `isDraw`), `moodOf` (calm, nervous, rage), `fallbackMove`
- `src/ai.ts`: providers (`ollama` and `openai`), request bodies, warmup, retry with lower temperature and a hint
- `src/taunts.ts`: local taunt phrases used by the fallback and when the model returns no usable text
- `src/index.html`: the whole UI
- `test/game.test.ts`: unit tests for the rules
- `scripts/smoke.ts`: end-to-end match against the HTTP API; needs the server up
- `docs/readme/`: README images (the banner is a mockup with fictitious data)

## Conventions

- User-facing text is pt-BR: the UI, the taunts and the README. Code and identifiers follow the existing files.
- The README is the reference for routes, board format and environment variables. Update it in the same change.
- Keep one model call per move: the taunt comes in the same JSON as the move, so there is no second inference.
- Environment variables are read where they are used (`src/ai.ts`, `src/server.ts`); document defaults in the README table.

## Gotchas

- Secrets: `OPENAI_API_KEY` is the only credential. Never print it, log it or commit it.
- The OpenAI body carries `cache: { "no-cache": true }` on purpose: LiteLLM caches responses, and without the bypass the same
  board returns the same taunt instantly. The bypass has to be in the body; there is no header for it.
- Ollama requests run one at a time, and `qwen-fast` is a thinking model: without `think: false` it returns empty content.
- Ports differ by environment: local `3737`, Docker `3000`. Check the one you are testing against.
- An illegal move from the model is retried up to three times; after that the server falls back to `fallbackMove()`.
  Do not treat a fallback response as a model success in tests (`source: "fallback"`).
- `bun run smoke` needs a live server, and its results depend on the model in use. Do not add it to `bun test`.

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.