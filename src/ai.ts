import { type Board, type Mood, legalMoves, moodOf, render } from "./game";

/**
 * Dois provedores: `ollama` (dev local) e `openai` (LiteLLM do cluster, API
 * compativel com OpenAI). O que muda entre eles esta so em `chat()`.
 */
const PROVIDER = (process.env.AI_PROVIDER ?? "ollama") as "ollama" | "openai";

// OLLAMA_HOST costuma vir sem esquema (ex.: "127.0.0.1:11434") — fetch() rejeita assim.
const RAW_HOST = process.env.OLLAMA_HOST?.trim() || "127.0.0.1:11434";
const HOST = (/^https?:\/\//.test(RAW_HOST) ? RAW_HOST : `http://${RAW_HOST}`).replace(/\/+$/, "");

const OPENAI_BASE = (process.env.OPENAI_BASE_URL ?? "http://litellm.ai.svc.cluster.local:4000/v1").replace(/\/+$/, "");
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const MODEL =
  PROVIDER === "openai"
    ? (process.env.OPENAI_MODEL ?? "cloud/llama-8b")
    : (process.env.OLLAMA_MODEL ?? "qwen-fast:latest");

type ChatOpts = { temperature: number; maxTokens: number; timeoutMs: number };

/** Uma chamada de chat, normalizada: devolve o texto da resposta. */
async function chat(messages: Array<{ role: string; content: string }>, o: ChatOpts): Promise<string> {
  const signal = AbortSignal.timeout(o.timeoutMs);

  if (PROVIDER === "openai") {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: o.temperature,
        // Modelos de raciocinio gastam o orcamento pensando e voltam content
        // vazio com finish_reason=length; 300 e folgado para {"move","zoeira"}.
        max_tokens: o.maxTokens,
        response_format: { type: "json_object" },
        // Bypass do cache Redis do gateway. Sem isto o mesmo tabuleiro devolve
        // sempre a MESMA zoeira (hit em ~40ms) e a graca acaba na 2a partida.
        // O bypass e no corpo: nao existe header x-litellm-no-cache.
        cache: { "no-cache": true },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`litellm ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return d.choices?.[0]?.message?.content ?? "";
  }

  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format: "json",
      // qwen-fast e um modelo "thinking": sem think:false ele gasta todo o
      // orcamento de tokens raciocinando e devolve content vazio.
      think: false,
      keep_alive: KEEP_ALIVE,
      options: { temperature: o.temperature, num_predict: o.maxTokens },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = (await res.json()) as { message?: { content?: string } };
  return d.message?.content ?? "";
}

export type MoveResult = {
  move: number;
  taunt: string | null;
  source: "model" | "fallback";
  raw?: string;
  error?: string;
  ms: number;
};

const SYSTEM = `Voce joga jogo da velha como "O". O humano e "X".
O tabuleiro e um array de 9 posicoes indexadas 0..8 (linha 0: 0,1,2 / linha 1: 3,4,5 / linha 2: 6,7,8).
Escolha a MELHOR jogada para O: primeiro vencer, senao bloquear X, senao ocupar centro/canto.

Alem da jogada, escreva uma zoeira curta em portugues do Brasil provocando o humano pela jogada
que ele acabou de fazer. Maximo 90 caracteres, sem xingamento pesado, sem ofensa pessoal, sem emoji.
O TOM muda conforme o humor informado no pedido.

Responda SOMENTE JSON: {"move": <indice livre>, "zoeira": "<texto>"}`;

const TONE: Record<Mood, string> = {
  calma: "HUMOR: confiante. Deboche leve e tranquilo, como quem ja ganhou.",
  nervosa:
    "HUMOR: nervosa. O humano esta perto de fechar uma linha. Perca a compostura aos poucos: fique defensiva, diga que estava distraida, que foi sorte dele.",
  raiva:
    "HUMOR: FURIOSA. Voce percebeu que vai perder e surtou. Escreva irritada e dramatica, com ALGUMAS PALAVRAS EM CAIXA ALTA, culpando fatores externos (a quantizacao de 2 bits, a GPU, a temperatura, lag, o gato no teclado) e acusando o humano de ter dado sorte. Nada de xingamento pesado.",
};

function userPrompt(board: Board): string {
  const free = legalMoves(board);
  const taken = board.map((c, i) => (c ? `${i}=${c}` : null)).filter(Boolean);
  return `Tabuleiro atual (numero = casa livre):
${render(board)}

Array: ${JSON.stringify(board)}
Casas ja ocupadas (PROIBIDAS): ${taken.length ? taken.join(", ") : "nenhuma"}
Casas livres (escolha uma destas): ${JSON.stringify(free)}
${TONE[moodOf(board)]}
Sua vez (O). Responda so o JSON.`;
}

const MAX_TAUNT = 120;

function cleanTaunt(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length < 3) return null;
  if (t.length <= MAX_TAUNT) return t;
  // O modelo ignora o limite de caracteres; cortar no meio da palavra fica
  // pior que cortar na ultima fronteira de palavra.
  const cut = t.slice(0, MAX_TAUNT);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 60 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, "")}…`;
}

function parseReply(text: string, free: number[]): { move: number; taunt: string | null } | null {
  const candidates: number[] = [];
  let taunt: string | null = null;
  const json = text.match(/\{[^{}]*\}/g) ?? [];
  for (const j of json) {
    try {
      const o = JSON.parse(j);
      taunt ??= cleanTaunt(o?.zoeira ?? o?.taunt);
      const v = o?.move;
      if (typeof v === "number") candidates.push(v);
      else if (typeof v === "string" && /^\d$/.test(v.trim())) candidates.push(Number(v.trim()));
    } catch {}
  }
  // JSON torto: ainda tenta achar um indice livre solto no texto.
  candidates.push(...(text.match(/\d/g) ?? []).map(Number));
  const move = candidates.find((n) => free.includes(n));
  return move === undefined ? null : { move, taunt };
}

/** Mantem o modelo residente: carregar 9 GB a frio leva minutos e estoura o timeout. */
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? "30m";

/**
 * No boot: ollama carrega o modelo (cold start de 9 GB nao pode cair na 1a
 * jogada); no LiteLLM e uma chamada real, que valida chave e allowlist de
 * modelo na subida em vez de falhar so quando alguem jogar.
 */
export async function warmup(): Promise<string> {
  const t0 = performance.now();
  if (PROVIDER === "openai") {
    await chat([{ role: "user", content: 'Responda {"ok":true}' }], {
      temperature: 0,
      maxTokens: 300,
      timeoutMs: 60_000,
    });
  } else {
    const res = await fetch(`${HOST}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: [], keep_alive: KEEP_ALIVE }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  }
  return `${Math.round((performance.now() - t0) / 1000)}s`;
}

/** Comentario de fim de jogo (o humano fecha a partida, entao nao ha jogada a pedir). */
export async function askEndTaunt(board: Board, result: "derrota" | "empate"): Promise<string | null> {
  // Prompt curto de proposito: medido, a versao longa faz o llama-8b devolver
  // content VAZIO de forma deterministica (3/3), enquanto a curta acerta 6/6.
  const cenario =
    result === "derrota"
      ? "Voce (O) PERDEU e esta FURIOSA: use CAIXA ALTA, culpe a GPU e o lag, exija revanche."
      : "Deu EMPATE e voce esta irritada por nao ter vencido. Avise que na proxima nao pega leve.";
  // Os modelos free do gateway devolvem content vazio de vez em quando
  // (medido: acontece com este prompt longo). Sem retry, toda derrota caia
  // na frase local.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const content = await chat(
        [
          {
            role: "user",
            content: `Voce e uma IA rival num jogo da velha. Tabuleiro final: ${JSON.stringify(board)}.
${cenario}
Maximo 90 caracteres, pt-BR, sem xingamento e sem emoji.
Responda SOMENTE JSON: {"zoeira": "<texto>"}`,
          },
        ],
        { temperature: 0.95, maxTokens: 300, timeoutMs: 25_000 },
      );
      for (const j of content.match(/\{[^{}]*\}/g) ?? []) {
        try {
          const t = cleanTaunt(JSON.parse(j)?.zoeira);
          if (t) return t;
        } catch {}
      }
      console.error(`zoeira final sem JSON util (tentativa ${attempt + 1}): ${JSON.stringify(content).slice(0, 120)}`);
    } catch (err) {
      console.error(`zoeira final falhou: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }
  return null;
}

/** Pede a jogada ao modelo; tenta 3x antes de cair no fallback tatico. */
export async function askModel(board: Board, timeoutMs = 45_000): Promise<Omit<MoveResult, "ms">> {
  const free = legalMoves(board);
  let lastRaw = "";
  let lastError = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const retryHint =
        attempt === 0
          ? ""
          : `\nSua resposta anterior (${JSON.stringify(lastRaw).slice(0, 120)}) nao era um indice livre. Escolha um de ${JSON.stringify(free)}.`;
      // temperatura alta de proposito: a zoeira precisa variar entre partidas.
      lastRaw = await chat(
        [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(board) + retryHint },
        ],
        { temperature: attempt === 0 ? 0.85 : 0.4, maxTokens: 300, timeoutMs },
      );
      const parsed = parseReply(lastRaw, free);
      if (parsed) return { ...parsed, source: "model", raw: lastRaw };
      lastError = "resposta sem jogada legal";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // timeout/queda: repetir so empilha mais espera — cai direto no fallback.
      break;
    }
  }
  return { move: -1, taunt: null, source: "fallback", raw: lastRaw, error: lastError };
}

export const MODEL_NAME = MODEL;
