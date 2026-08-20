import { type Board, fallbackMove, isDraw, legalMoves, moodOf, winner } from "./game";
import { MODEL_NAME, askEndTaunt, askModel, warmup } from "./ai";
import { type TauntKind, localTaunt } from "./taunts";

const PORT = Number(process.env.PORT ?? 3737);
const html = await Bun.file(new URL("./index.html", import.meta.url)).text();

function validBoard(b: unknown): b is Board {
  if (!Array.isArray(b) || b.length !== 9) return false;
  if (!b.every((c) => c === "X" || c === "O" || c === null)) return false;
  const x = b.filter((c) => c === "X").length;
  const o = b.filter((c) => c === "O").length;
  return x === o || x === o + 1;
}

function state(b: Board) {
  const w = winner(b);
  return { over: !!w || isDraw(b), winner: w?.player ?? null, line: w?.line ?? null, draw: isDraw(b) };
}

/** Contexto da zoeira: humor primeiro, depois o que aconteceu nesta jogada. */
function tauntKind(before: Board, after: Board, move: number): TauntKind {
  if (winner(after)?.player === "O") return "vitoria";
  const mood = moodOf(before);
  if (mood !== "calma") return mood; // perdendo: raiva vence qualquer outro contexto
  const probe = [...before];
  probe[move] = "X";
  if (winner(probe)?.player === "X") return "bloqueio";
  return before.filter(Boolean).length <= 1 ? "abertura" : "normal";
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response(html.replace("__MODEL__", MODEL_NAME), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, model: MODEL_NAME });
    }

    if (url.pathname === "/api/move" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as { board?: unknown } | null;
      const board = body?.board;
      if (!validBoard(board)) return Response.json({ error: "tabuleiro invalido" }, { status: 400 });

      const s = state(board);
      if (s.over) return Response.json({ error: "partida encerrada", ...s }, { status: 400 });
      if (legalMoves(board).length === 0) return Response.json({ error: "sem jogadas" }, { status: 400 });
      if (board.filter((c) => c === "X").length !== board.filter((c) => c === "O").length + 1)
        return Response.json({ error: "nao e a vez do O" }, { status: 400 });

      const t0 = performance.now();
      const r = await askModel(board);
      const move = r.source === "model" ? r.move : fallbackMove(board);
      const next: Board = [...board];
      next[move] = "O";

      const kind = tauntKind(board, next, move);
      const taunt = r.taunt ?? localTaunt(kind, board.filter(Boolean).length + move);

      return Response.json({
        move,
        taunt,
        mood: moodOf(board),
        tauntSource: r.taunt ? "model" : "local",
        source: r.source,
        error: r.error,
        ms: Math.round(performance.now() - t0),
        board: next,
        ...state(next),
      });
    }

    if (url.pathname === "/api/endgame" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as { board?: unknown } | null;
      const board = body?.board;
      if (!validBoard(board)) return Response.json({ error: "tabuleiro invalido" }, { status: 400 });

      const s = state(board);
      if (!s.over) return Response.json({ error: "partida nao terminou" }, { status: 400 });
      if (s.winner === "O") return Response.json({ error: "vitoria da IA ja e comentada na jogada" }, { status: 400 });

      const kind: TauntKind = s.draw ? "empate" : "derrota";
      const modelTaunt = await askEndTaunt(board, kind);
      return Response.json({
        taunt: modelTaunt ?? localTaunt(kind, board.filter(Boolean).length),
        mood: kind === "derrota" ? "raiva" : "nervosa",
        tauntSource: modelTaunt ? "model" : "local",
      });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`jogo da velha vs ${MODEL_NAME} -> http://localhost:${server.port}`);
for (const ifaces of Object.values(await import("node:os").then((os) => os.networkInterfaces())))
  for (const i of ifaces ?? [])
    if (i.family === "IPv4" && !i.internal) console.log(`  na rede local -> http://${i.address}:${server.port}`);

warmup()
  .then((t) => console.log(`modelo ${MODEL_NAME} carregado em ${t}`))
  .catch((e) => console.error(`warmup falhou (o jogo segue com fallback): ${e.message}`));
