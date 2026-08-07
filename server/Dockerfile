# Solar Conquest — serveur multijoueur (Node + WebSocket)
# Contexte de build = RACINE du dépôt : le serveur a besoin des RÈGLES DU JEU.
# Dans Coolify : Build Pack "Dockerfile", Dockerfile Location = /server/Dockerfile, Base Directory = /
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/
RUN cd server && npm install --omit=dev --no-fund --no-audit

# ⚠️ LES DEUX FICHIERS CI-DESSOUS SONT INDISPENSABLES, PAS SEULEMENT index.html.
# Depuis la v7.2, toutes les règles du jeu vivent dans `moteur.js` — `index.html` n'est plus que la
# page. Le serveur lit `moteur.js` comme SOURCE DE VÉRITÉ des règles ; sans lui il démarre
# normalement, puis échoue à la CRÉATION d'une partie avec « MOTEUR INTROUVABLE : /app/moteur.js ».
# C'est exactement ce qui est arrivé au premier déploiement de la v7.4 : ce Dockerfile datait d'avant
# l'extraction et ne copiait qu'index.html.
COPY index.html moteur.js ./

COPY server/server.js server/driver.js server/game-core.js server/bot.js server/
ENV GAME_HTML=/app/index.html \
    DATA_DIR=/data \
    PORT=8080

# ⚠️ /data CONTIENT LES PARTIES EN COURS (dossier `games/`), les comptes et les jetons de session.
# Ce volume ne doit JAMAIS être effacé à un redéploiement : depuis la v7.4 les parties survivent au
# redémarrage du serveur, et c'est ici qu'elles vivent.
VOLUME /data
EXPOSE 8080

# GARDE-FOU AU DÉMARRAGE : mieux vaut refuser de démarrer que d'accepter des joueurs et les planter
# à la création de la première partie. Le message dit quoi faire, pas seulement ce qui manque.
CMD ["sh", "-c", "test -f /app/moteur.js || { echo 'DÉMARRAGE REFUSÉ : /app/moteur.js est absent de l image.'; echo 'Les règles du jeu vivent dans moteur.js depuis la v7.2. Vérifie que le Dockerfile contient'; echo '  COPY index.html moteur.js ./'; echo 'et que le contexte de build est bien la RACINE du dépôt (Base Directory = /).'; exit 1; }; exec node server/server.js"]
