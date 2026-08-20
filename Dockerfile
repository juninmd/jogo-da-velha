FROM oven/bun:1

WORKDIR /app

# Sem dependencias de runtime: o jogo usa so a stdlib do Bun. Copiamos o
# package.json mesmo assim para o `bun run start` resolver o script.
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production \
    PORT=3000 \
    AI_PROVIDER=openai

EXPOSE 3000
USER bun

CMD ["bun", "run", "src/server.ts"]
