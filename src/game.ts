export type Cell = "X" | "O" | null;
export type Board = Cell[];

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function winner(b: Board): { player: "X" | "O"; line: number[] } | null {
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a]!, line };
  }
  return null;
}

export function legalMoves(b: Board): number[] {
  return b.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
}

export function isDraw(b: Board): boolean {
  return !winner(b) && legalMoves(b).length === 0;
}

export function render(b: Board): string {
  const cell = (i: number) => b[i] ?? String(i);
  return [0, 3, 6].map((r) => `${cell(r)}|${cell(r + 1)}|${cell(r + 2)}`).join("\n-+-+-\n");
}

/** Casas onde `player` fecha o jogo na proxima jogada. */
export function threats(b: Board, player: "X" | "O"): number[] {
  return legalMoves(b).filter((i) => {
    const t = [...b];
    t[i] = player;
    return winner(t)?.player === player;
  });
}

/**
 * Humor da IA. Duas ameacas do X e derrota anunciada: ela so bloqueia uma.
 * `raiva` sai antes do fim justamente pra ela surtar ANTES de perder.
 */
export type Mood = "calma" | "nervosa" | "raiva";

export function moodOf(b: Board): Mood {
  if (threats(b, "O").length > 0) return "calma"; // ela fecha o jogo agora, sem drama
  const x = threats(b, "X").length;
  return x >= 2 ? "raiva" : x === 1 ? "nervosa" : "calma";
}

/** Melhor jogada tatica para O: ganhar, senao bloquear X, senao centro/canto. */
export function fallbackMove(b: Board): number {
  const free = legalMoves(b);
  for (const p of ["O", "X"] as const) {
    for (const i of free) {
      const t = [...b];
      t[i] = p;
      if (winner(t)?.player === p) return i;
    }
  }
  for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) if (free.includes(i)) return i;
  return free[0]!;
}
