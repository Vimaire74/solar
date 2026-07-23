# Solar Conquest — serveur multijoueur (Node + WebSocket)
# Contexte de build = RACINE du dépôt (il faut index.html, la source unique des règles).
# Dans Coolify : Build Pack "Dockerfile", Dockerfile Location = /server/Dockerfile, Base Directory = /
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/
RUN cd server && npm install --omit=dev --no-fund --no-audit
COPY index.html ./
COPY server/server.js server/driver.js server/game-core.js server/bot.js server/
ENV GAME_HTML=/app/index.html \
    DATA_DIR=/data \
    PORT=8080
VOLUME /data
EXPOSE 8080
CMD ["node", "server/server.js"]
