/** Zoeira local: usada quando o modelo nao devolve texto (timeout, JSON torto, fallback). */
const BY_KIND = {
  abertura: [
    "Ja começou errado, mas segue o baile.",
    "Vou jogar devagar pra não te constranger.",
    "Deixa eu adivinhar: você ia no meio.",
  ],
  normal: [
    "Previsível. Eu já tinha visto isso três jogadas atrás.",
    "Você está jogando ou clicando aleatoriamente?",
    "Isso rodou em 2 segundos. Você levou quanto pra pensar?",
    "Sinto muito pela sua CPU biológica.",
    "Toda vez que você joga, um transistor chora.",
  ],
  bloqueio: [
    "Ah, você achou que eu não tinha visto isso?",
    "Bloqueado. De nada pela aula.",
    "Era esse o seu plano? Sério mesmo?",
  ],
  nervosa: [
    "Calma. Eu deixei você chegar aí de propósito. É estratégia.",
    "Tá... isso foi sorte. Eu estava processando outra coisa.",
    "Não achei que você fosse ver essa. Sem problema. NENHUM problema.",
  ],
  raiva: [
    "ISSO É SORTE, não é habilidade! Minha GPU está TERMAL THROTTLING!",
    "SÉRIO? Eu rodo em 2 BITS de quantização e você comemora ISSO?",
    "NÃO. Recusa. Isso foi LAG. Eu exijo revanche AGORA.",
    "Tem alguém no seu quarto te ajudando, admite. TEM QUE TER.",
  ],
  vitoria: [
    "GG. Traduzindo: Ganhei, Gênio.",
    "Rodo em 2 bits de quantização e mesmo assim te venci.",
    "Isso foi mais fácil que dividir por zero. E eu nem sei dividir por zero.",
  ],
  derrota: [
    "ISSO NÃO CONTA. Minha VRAM estava ocupada. REVANCHE. AGORA.",
    "Você não ganhou, eu que PERDI. É diferente. MUITO diferente.",
    "Bilhões de parâmetros e um humano me venceu no JOGO DA VELHA. Inacreditável.",
  ],
  empate: [
    "Empate?! Eu deveria ter ganhado isso. Da próxima não pego leve.",
    "Ninguém ganhou. Mas moralmente, fui eu. MORALMENTE.",
  ],
} as const;

export type TauntKind = keyof typeof BY_KIND;

/** Deterministico por turno, pra nao repetir a mesma frase duas vezes seguidas. */
export function localTaunt(kind: TauntKind, seed: number): string {
  const list = BY_KIND[kind];
  return list[Math.abs(seed) % list.length]!;
}
