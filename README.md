# Jogo da Velha vs Ollama local

Você joga de **X**, o modelo `qwen-fast:latest` (Ollama local) joga de **O** — e te zoa a cada
jogada. A zoeira vem no **mesmo JSON** da jogada (`{"move", "zoeira"}`), sem inferência extra: o
Ollama serializa requisições, então um segundo call dobraria a espera por turno.

## Humor da IA

`moodOf()` (em `src/game.ts`) classifica o tabuleiro **antes** da jogada dela, contando as casas em
que o X fecha na próxima:

| ameaças do X | humor | efeito |
|---|---|---|
| ela fecha o jogo agora | `calma` | deboche tranquilo |
| 1 | `nervosa` | defensiva, culpa distração; balão âmbar tremendo |
| 2+ (não dá pra bloquear as duas) | `raiva` | surta em CAIXA ALTA culpando GPU/quantização/lag; balão vermelho tremendo, cara 🤬 |

Duas ameaças simultâneas = derrota matemática, então a raiva aparece **antes** de perder, não
depois. O humor entra no prompt (muda o tom do modelo), escolhe a lista de frases local no
fallback e vai no JSON pro cliente (`data-mood` no balão). A derrota no `/api/endgame` é sempre
`raiva`.

No fim da partida, se a IA **não** venceu, o cliente chama `/api/endgame` e ela comenta a própria
derrota/empate. Quando a IA vence, o comentário já veio junto da jogada final.

## Rodar

```powershell
bun run src/server.ts   # http://localhost:3737
```

Variáveis opcionais:

- `OLLAMA_HOST` (padrão `127.0.0.1:11434`, aceita com ou sem esquema)
- `OLLAMA_MODEL` (padrão `qwen-fast:latest`)
- `PORT` (padrão `3737`)
- `OLLAMA_KEEP_ALIVE` (padrão `30m`)

## Jogar pelo celular (mesma rede)

O servidor já escuta em todas as interfaces. Regra de firewall criada uma vez (precisa de admin,
limitada à sub-rede local):

```powershell
New-NetFirewallRule -DisplayName "jogo-da-velha 3737" -Direction Inbound -Protocol TCP `
  -LocalPort 3737 -Action Allow -Profile Any -RemoteAddress LocalSubnet
```

A URL da LAN é impressa no boot. Se o roteador tiver isolamento de clientes (AP isolation), o
celular não alcança o PC nem com a regra criada.

## Smoke

Com o servidor no ar:

```powershell
bun run scripts/smoke.ts
```

Joga uma partida inteira via HTTP e falha se o modelo devolver jogada ilegal ou se o
servidor aceitar um tabuleiro com turno inválido.

## Notas

- `qwen-fast` é um modelo *thinking*: sem `think: false` ele gasta o orçamento de tokens
  raciocinando e devolve `content` vazio. Com `think: false` responde em ~1–3 s.
- O modelo é pré-carregado no boot (`warmup`) e mantido residente com `keep_alive`. Sem isso, o
  cold start de 9,8 GB faz as primeiras jogadas levarem mais de 60 s e caírem no fallback.
- O servidor valida o tabuleiro (contagem X/O, partida encerrada) antes de chamar o modelo.
- Se o modelo errar 3 vezes seguidas (jogada ilegal, timeout, Ollama fora do ar), entra um
  fallback tático — a UI mostra `via fallback` junto com o erro, sem travar a partida.
