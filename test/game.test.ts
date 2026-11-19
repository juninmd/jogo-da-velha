import { describe, expect, test } from "bun:test";
import { parseReply } from "../src/ai";
import { type Board, fallbackMove, isDraw, legalMoves, moodOf, threats, winner } from "../src/game";

const b = (s: string): Board => [...s].map((c) => (c === "." ? null : (c as "X" | "O")));

describe("game", () => {
  test("winner returns the player and the winning line", () => {
    expect(winner(b("XXXOO...."))).toEqual({ player: "X", line: [0, 1, 2] });
    expect(winner(b("O.X.OX..O"))?.player).toBe("O");
    expect(winner(b("........."))).toBeNull();
  });

  test("a full board without a line is a draw", () => {
    expect(isDraw(b("XOXXOOOXX"))).toBe(true);
    expect(isDraw(b("XXXOO...."))).toBe(false);
  });

  test("moodOf: the AI only rages when X has two threats and O cannot win now", () => {
    expect(moodOf(b("XX.O....."))).toBe("nervosa");
    expect(moodOf(b("XX.XO...O"))).toBe("raiva");
    expect(moodOf(b("OO.XX...."))).toBe("calma");
  });

  test("fallbackMove always returns a free square", () => {
    // every reachable-looking board with X to have played last
    const walk = (board: Board) => {
      if (winner(board) || isDraw(board)) return;
      const o = board.filter((c) => c === "O").length;
      const x = board.filter((c) => c === "X").length;
      if (x === o + 1) expect(legalMoves(board)).toContain(fallbackMove(board));
      for (const i of legalMoves(board)) {
        const next = [...board];
        next[i] = x === o ? "X" : "O";
        walk(next);
      }
    };
    walk(b("........."));
  });

  test("fallbackMove wins first, then blocks", () => {
    expect(fallbackMove(b("OO.XX...."))).toBe(2);
    expect(fallbackMove(b("XX.O....."))).toBe(2);
    expect(threats(b("XX.O....."), "X")).toEqual([2]);
  });
});

describe("parseReply", () => {
  const free = [0, 1, 2, 5, 8];

  test("reads move and taunt from JSON", () => {
    expect(parseReply('{"move": 5, "zoeira": "Boa tentativa, humano"}', free)).toEqual({
      move: 5,
      taunt: "Boa tentativa, humano",
    });
  });

  test("accepts a numeric string and skips occupied squares", () => {
    expect(parseReply('{"move": "3"} {"move": 8}', free)?.move).toBe(8);
  });

  test("digits inside the taunt are not moves", () => {
    expect(parseReply('{"move": 7, "zoeira": "culpa dos 2 bits"}', free)).toBeNull();
  });

  test("a multi-digit number in loose text is not split into squares", () => {
    expect(parseReply("jogada 12", free)).toBeNull();
    expect(parseReply("jogue na casa 8", free)?.move).toBe(8);
  });
});
