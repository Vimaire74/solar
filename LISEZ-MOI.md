# Lot 17 — ce qu'on met en ligne, et rien d'autre

Dossier prêt à envoyer. Version **v9.87** (`sw.js` **v108**).

> ### Ce qui rend ce lot particulier : trois fois, le texte publié décrivait un jeu qui n'existait pas
>
> Les 26 et 27 août, trois règles ont été trouvées écrites quelque part — dans `regles.html`, dans
> un commentaire du code, ou dictées de mémoire — alors que **rien ne les appliquait**.
>
> 1. Le champ `type` d'une carte voulait dire deux choses selon la collection où on le lisait. Une
>    seule valeur était commune aux deux, `government`, avec deux sens sans rapport. Le 25/08 j'ai
>    « corrigé » un test qui portait sur une valeur morte, et retiré son exclusivité à une
>    technologie de rang 3 — pendant trois versions livrées.
> 2. Le **plafond de moral** des formes autoritaires (Tyrannie 6, Corporations 7) : il a été dicté
>    comme une règle existante. Elle n'existait nulle part. Elle existe maintenant.
> 3. Le **« hub technologique »** qui donnait le +1🔬/+2🔬 : aucun nœud n'a jamais porté cette
>    marque, le bonus a toujours été universel. Le commentaire du code disait « Hub technologique »
>    et les règles l'avaient recopié.
>
> Les trois ont été trouvées de la même façon : **en vérifiant le code avant d'écrire le texte**,
> jamais en relisant le texte. C'est pour cela que trois bancs neufs les surveillent désormais
> (`test_vocabulaire_cartes`, `test_plafond_moral_gouvernement`, `test_rendement_colonies`), et que
> `test_regles.js` compare maintenant aussi les plafonds publiés à ceux du code.

## Ce qu'il contient — et pourquoi seulement ça

| Fichier | Va où | Pourquoi |
|---|---|---|
| `index.html` `moteur.js` `online.js` `sw.js` `tutorial.html` `tutorial.js` `regles.html` | **solar-game.com** (site statique) | le jeu et ses pages |
| `assets/map/` | **solar-game.com** | le fond de carte |
| `server/server.js` `driver.js` `game-core.js` `bot.js` `package.json` `Dockerfile` | **live.solar-game.com** (serveur Node) | le serveur multijoueur |

⚠️ Le serveur a AUSSI besoin de `index.html` et `moteur.js` : les règles du jeu vivent dans
`moteur.js`, et il les lit comme source de vérité. C'est le `Dockerfile` qui s'en occupe
(`COPY index.html moteur.js ./`) — à condition que le contexte de build soit la RACINE du dépôt.

## Ce qui n'est PAS ici, et ne doit jamais y être

- **`docs/`** — notes de travail et journaux de chantier. Ils décrivent le fonctionnement interne du
  serveur ; le dépôt est public, autant ne pas les publier.
- **les bancs d'essai** (`test_*.js`, `selftest.js`, `playthrough.js`) — développement seulement.
- **`server/temoin_v9.69/`** — témoin gelé, jamais mis à jour, jamais publié.
- **aucune clé, aucun secret.** `ADMIN_KEY` se règle dans Coolify et nulle part ailleurs.

⚠️ **`/data` ne doit JAMAIS être effacé au redéploiement** — les parties en cours y vivent.

## Ce qui change pour le joueur

- **Chaque nœud de la carte affiche son rendement aux trois niveaux** (`Nv1 · Nv2 · Nv3`), lu dans
  la fonction qui verse réellement les ressources. On voit enfin qu'Io et Cérès décollent au niveau
  2 alors qu'Europe, Encelade, Triton et Pluton ne gagnent que le ❤️ et le 🔬 — le ×1,5 étant
  arrondi vers le bas.
- **Tyrannie plafonne le moral à 6, Domination des Corporations à 7.** L'écrêtage se fait en fin de
  tour, au même moment que le plafond ordinaire de 10 ; changer de forme lève le plafond aussitôt,
  mais le moral déjà perdu ne revient pas.
- **Les cartes ont enfin la couleur de leur branche.** Quatre branches sortaient du même bleu.
- **`regles.html`** : pénalités de moral, rendement par niveau et formes de gouvernement corrigés.

## Après l'envoi

Vider le cache du navigateur ou attendre que le service worker bascule (`v108`). L'écran de
connexion affiche les trois versions (`HTML`, `JS`, `moteur`) : elles doivent toutes dire **v9.87**.
