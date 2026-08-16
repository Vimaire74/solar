# Lot 16 — ce qu'on met en ligne, et rien d'autre

> ### 2026-08-16 — une régression a été introduite puis corrigée ici même
>
> Pendant quelques heures, ce dossier a contenu un moteur qui **cassait la reprise de partie** :
> une partie sauvegardée puis restaurée ne repartait plus, deux fois sur trois. Sur ce serveur qui
> garde les parties sur `/data` et les reprend au redémarrage, cela aurait effacé les parties de
> tout le monde au premier redéploiement.
>
> Cause : pour qu'une nation tenue par l'ordinateur puisse répondre aux fenêtres de guerre, la
> continuation était appelée **en direct** dans `moteur.js`. Or une partie n'est reprenable que
> parce que chaque question EXISTE dans `G._flux` avec sa suite rangée sous forme de nom — court-
> circuiter revient à ne jamais la poser, donc à ne jamais la sauvegarder.
> Corrigé : c'est le **pilote** (`driver.js`, `_reponseIA`) qui répond pour les IA, après que la
> question a été posée normalement. `test_serialisation` et `test_reprise` : 6 essais sur 6 chacun.
>
> Gardé ici parce que le raccourci était tentant et le restera : **ne jamais appeler une
> continuation en direct pour contourner une fenêtre**.

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

**1. Changer `ADMIN_KEY`.** La clé en service actuellement est courte, lisible et construite sur le
nom du projet — elle se devine. Remplace-la par une trentaine de caractères au hasard, range-la dans
un gestionnaire de mots de passe, et enregistre les URL complètes en favoris plutôt que de la
retaper. Elle ne se définit QUE dans les variables d'environnement de Coolify, jamais dans un
fichier. Ce qu'elle protège : la liste des parties en cours et leurs codes, les archives, l'envoi de
courrier depuis le domaine, et la **remise à zéro complète** (`/admin/reset`, qui efface comptes,
parties et archives sans confirmation).

**2. Vérifier qu'elle n'a jamais été écrite dans un fichier envoyé sur GitHub.** Une clé publiée une
fois reste dans l'historique du dépôt même après suppression.

> ⚠️ Ce paragraphe **écrivait lui-même la clé en clair**, dans un fichier rangé sous « Pour
> uploader », deux lignes au-dessus du conseil de ne jamais faire ça. Le dépôt étant public, la
> publier ici revenait exactement à ce que le point 2 met en garde de faire. La valeur a été
> retirée : ne la réécris nulle part, y compris pour l'expliquer.

**3. Envisager de désactiver `/admin/reset` en production.** Même sous clé, une adresse qui efface
tout d'un seul appel n'a pas grand-chose à faire sur un serveur ouvert.
