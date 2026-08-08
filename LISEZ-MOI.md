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
| Variable d’environnement | `ADMIN_KEY` = ta clé — **obligatoire**, aucun défaut dans le code |

⚠️ **Le volume `/data` ne doit JAMAIS être effacé à un redéploiement** : il contient les comptes,
les sessions et les **parties en cours** (`/data/games/`).

## Les pages de service sont sous clé

Toutes les adresses qui ne servent pas le jeu exigent `?key=…` et renvoient « page inexistante »
sans clé valable. Seul `/health` reste ouvert : Coolify s'en sert pour savoir si le serveur est
vivant, et il ne révèle que le nombre de parties.

    https://live.solar-game.com/debug?key=VOTRE_CLE      → parties en cours
    https://live.solar-game.com/stats?key=VOTRE_CLE      → archives et statistiques
    https://live.solar-game.com/mailtest?key=VOTRE_CLE   → diagnostic des emails
    https://live.solar-game.com/bot?code=XXXX&key=VOTRE_CLE   → inviter le bot dans une partie
    https://live.solar-game.com/admin/reset?key=VOTRE_CLE      → remise à zéro (efface tout)

**La clé vient UNIQUEMENT de la variable d'environnement `ADMIN_KEY`, dans Coolify.** Il n'y a
aucune valeur par défaut dans le code, et c'est délibéré : le dépôt est **public**, donc toute clé
écrite dans le code serait publiée sur GitHub. Sans `ADMIN_KEY` définie, ces pages sont
**totalement fermées** — aucune clé ne les ouvre. En cas de doute, fermé.

Après avoir changé `ADMIN_KEY`, il faut **redéployer ou redémarrer** l'application pour qu'elle soit
relue.

---

## ⚠️ À FAIRE AVANT D'OUVRIR LE JEU AU PUBLIC

Ces points sont acceptables pendant le rodage entre amis. Ils ne le sont plus dès que des inconnus
peuvent créer un compte.

**1. Changer `ADMIN_KEY`.** La clé actuelle (`Solar-RaZ-2026`) est courte, lisible et construite sur
le nom du projet — elle se devine. Remplace-la par une trentaine de caractères au hasard, range-la
dans un gestionnaire de mots de passe, et enregistre les URL complètes en favoris plutôt que de la
retaper. Ce qu'elle protège : la liste des parties en cours et leurs codes, les archives, l'envoi de
courrier depuis le domaine, et la **remise à zéro complète** (`/admin/reset`, qui efface comptes,
parties et archives sans confirmation).

**2. Vérifier qu'elle n'a jamais été écrite dans un fichier envoyé sur GitHub.** Une clé publiée une
fois reste dans l'historique du dépôt même après suppression.

**3. Envisager de désactiver `/admin/reset` en production.** Même sous clé, une adresse qui efface
tout d'un seul appel n'a pas grand-chose à faire sur un serveur ouvert.
