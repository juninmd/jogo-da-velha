/** Joga uma partida inteira contra o servidor, como X, e valida cada jogada do modelo. */
import { type Board, fallbackMove, isDraw, legalMoves, moodOf, winner } from "../src/game";

const BASE = process.env.BASE ?? "http://localhost:3737";

// logica de humor (sem modelo): garante que a raiva dispara ANTES da derrota
const MOOD_CASES: Array<[string, Board, string]> = [
  ["tabuleiro vazio", [null, null, null, null, null, null, null, null, null], "calma"],
  ["X ameaca 1 linha", ["X", "X", null, "O", null, null, null, null, null], "nervosa"],
  ["X com dois ataques (derrota certa)", ["X", "X", null, "X", "O", null, null, null, "O"], "raiva"],
  ["O fecha agora, sem drama", ["O", "O", null, "X", "X", null, null, null, null], "calma"],
];
let board: Board = Array(9).fill(null);
let fails = 0;

for (const [label, b, want] of MOOD_CASES) {
  const got = moodOf(b);
  if (got !== want) { console.error(`FALHA humor: ${label} -> ${got}, esperado ${want}`); fails++; }
  else console.log(`humor ok: ${label} -> ${got}`);
}
console.log("");

for (let turn = 0; turn < 9; turn++) {
  if (winner(board) || isDraw(board)) break;

  const x = fallbackMove(board.map((c) => (c === "X" ? "O" : c === "O" ? "X" : null)) as Board);
  board[x] = "X";
  console.log(`X -> ${x}`);
  if (winner(board) || isDraw(board)) break;

  const free = legalMoves(board);
  const res = await fetch(`${BASE}/api/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ board }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error}`);
  if (!free.includes(data.move)) {
    console.error(`FALHA: jogada ilegal ${data.move}, livres ${free}`);
    fails++;
  }
  if (typeof data.taunt !== "string" || data.taunt.length < 3) {
    console.error(`FALHA: zoeira ausente (${JSON.stringify(data.taunt)})`);
    fails++;
  }
  if (data.mood !== moodOf(board)) {
    console.error(`FALHA: humor divergente (api=${data.mood}, local=${moodOf(board)})`);
    fails++;
  }
  console.log(`O -> ${data.move} (${data.source}/${data.tauntSource}, ${data.ms}ms, humor=${data.mood})${data.error ? " err=" + data.error : ""}`);
  console.log(`   "${data.taunt}"`);
  board = data.board;
}

console.log("\nfinal:\n" + board.map((c) => c ?? ".").join("").replace(/(...)/g, "$1\n"));
const w = winner(board);
console.log(w ? `vencedor: ${w.player}` : "empate");

// comentario de fim de jogo (so quando a IA nao venceu)
if (w?.player !== "O") {
  const end = await fetch(`${BASE}/api/endgame`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ board }),
  });
  const d = await end.json();
  if (!end.ok || typeof d.taunt !== "string" || d.taunt.length < 3) {
    console.error(`FALHA: endgame sem zoeira (${end.status} ${JSON.stringify(d)})`);
    fails++;
  } else console.log(`fim (${d.tauntSource}, humor=${d.mood}): "${d.taunt}"`);
  if (w?.player === "X" && d.mood !== "raiva") {
    console.error(`FALHA: perdeu e nao ficou com raiva (${d.mood})`);
    fails++;
  }
}

// rejeicoes esperadas
const bad = await fetch(`${BASE}/api/move`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ board: ["X", "X", null, null, null, null, null, null, null] }),
});
if (bad.status !== 400) { console.error("FALHA: turno invalido nao rejeitado"); fails++; }

console.log(fails === 0 ? "\nSMOKE OK" : `\nSMOKE FALHOU (${fails})`);
process.exit(fails === 0 ? 0 : 1);
