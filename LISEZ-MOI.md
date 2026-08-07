# Lot 16 — ce qu'on met en ligne, et rien d'autre

Dossier prêt à envoyer. Version **v8.3** (`sw.js` v14).

## Ce qu'il contient — et pourquoi seulement ça

| Fichier | Va où | Pourquoi |
|---|---|---|
| `index.html` `moteur.js` `online.js` `sw.js` `tutorial.html` `tutorial.js` `regles.html` | **solar-game.com** (site statique) | le jeu et sa page |
| `server/server.js` `driver.js` `game-core.js` `bot.js` `package.json` `Dockerfile` | **live.solar-game.com** (serveur Node) | le serveur multijoueur |

⚠️ Le serveur a AUSSI besoin de `index.html` et `moteur.js` : les règles du jeu vivent dans
`moteur.js`, et il les lit comme source de vérité. C'est le `Dockerfile` qui s'en occupe
(`COPY index.html moteur.js ./`) — à condition que le contexte de build soit la RACINE du dépôt.
C'est exactement ce qui avait produit le `MOTEUR INTROUVABLE : /app/moteur.js`.

## Ce qui a été RETIRÉ par rapport au lot 15

- **`docs/`** — notes de travail, journaux de chantier, historique des défauts. Rien de tout cela
  n'est utile au jeu, et ces fichiers décrivent en détail le fonctionnement interne du serveur :
  autant ne pas les publier.
- **les bancs d'essai** (`test_*.js`, `selftest.js`, `playthrough.js`, `tutorial-sync.js`) — ils ne
  servent qu'au développement. Ils restent dans le dossier de travail.
- **`node_modules/`** — reconstruit par `npm install` dans l'image Docker.

## Réglages Coolify

| Réglage | Valeur |
|---|---|
| Build Pack | `Dockerfile` |
| Dockerfile Location | `/server/Dockerfile` |
| Base Directory | `/` |
| Volume persistant | `/data` |
| Variable d'environnement | `ADMIN_KEY` = ta clé (défaut : `marci`) |

⚠️ **Le volume `/data` ne doit JAMAIS être effacé à un redéploiement** : il contient les comptes,
les sessions et les **parties en cours** (`/data/games/`).

## Les pages de service sont sous clé

Depuis ce lot, toutes les adresses qui ne servent pas le jeu exigent `?key=…` et renvoient
« page inexistante » sans clé valable :

    https://live.solar-game.com/debug?key=marci      → parties en cours
    https://live.solar-game.com/stats?key=marci      → archives et statistiques
    https://live.solar-game.com/mailtest?key=marci   → diagnostic des emails
    https://live.solar-game.com/bot?code=XXXX&key=marci   → inviter le bot dans une partie
    https://live.solar-game.com/admin/reset?key=marci     → remise à zéro (efface tout)

Seul `/health` reste ouvert : Coolify s'en sert pour savoir si le serveur est vivant, et il ne
révèle que le nombre de parties.

> **`marci` est une clé de rodage.** Elle se devine en quelques essais. Avant d'ouvrir le jeu à des
> inconnus, pose une vraie valeur dans `ADMIN_KEY` (une trentaine de caractères au hasard) — c'est
> une ligne à changer dans Coolify, rien à toucher dans le code.
