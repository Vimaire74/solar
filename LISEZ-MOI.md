# Lot 17 — ce qu'on met en ligne, et rien d'autre

Dossier prêt à envoyer. Version **v9.94** (`sw.js` **v115**).

> ### Ce qui rend ce lot particulier : les IA réfléchissent, et en réfléchissant elles ont réveillé un défaut vieux de plusieurs versions
>
> Les IA ne suivent plus une recette. Le cerveau `tacticien` **joue chaque coup possible pour de
> faux**, note la position obtenue, et rejoue le meilleur — sans aucune note préalable sur ce qu'un
> coup « vaut ». En tête-à-tête contre l'ancienne IA, il gagne **11 parties sur 16** avec **+27 % de
> points de victoire**.
>
> En devenant le cerveau par défaut, il a fait tomber `test_equivalence` — le banc qui rejoue la
> même partie en ne changeant QUE l'identité de la nation active et exige un résultat identique.
> **10 états sur 12 divergeaient.**
>
> La cause : `attackColony` savait parfaitement qui attaque — il venait de lui débiter son action et
> ses jetons — et passait quand même l'assaut à `playerAssaultColony` **sans le dire**. Faute de
> troisième argument, la fonction retombait sur la nation active : guerre ouverte, combat livré,
> pertes et capture portés au compte de **qui regardait l'écran**.
>
> Ce défaut est ancien. Il n'a jamais éclaté parce que l'ancienne IA n'assaillait presque jamais :
> le chemin fautif n'était pas emprunté. **Un banc qui devient rouge après un changement de
> comportement n'accuse pas toujours le changement — ici il a révélé ce que l'ancien dissimulait.**
>
> Trouvé par bissection (`diag_equivalence_coups.js`), pas à la lecture : en retirant les familles
> de coups une à une, `assaut` seul ramenait la divergence de 10/12 à **0/12**. La relecture, elle,
> avait échoué — `simulerCoup`, `coupsPossibles` et `appliquerCoup` ne mentionnent jamais `G.player`.
>
> Effet de bord : `test_guerre4_ws`, rouge et accepté comme tel depuis l'usure de guerre à −4, est
> repassé au vert. L'usure frappait les mauvais belligérants.

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
- **les bancs d'essai** (`test_*.js`, `diag_*.js`, `mesure_*.js`, `selftest.js`, `playthrough.js`) —
  développement seulement.
- **`server/temoin_v9.69/`** — témoin gelé, jamais mis à jour, jamais publié.
- **aucune clé, aucun secret.** `ADMIN_KEY` se règle dans Coolify et nulle part ailleurs.

⚠️ **`/data` ne doit JAMAIS être effacé au redéploiement** — les parties en cours y vivent.

⚠️ **`ADMIN_KEY` reste à changer avant l'ouverture au public.**

## Ce qui change pour le joueur

- **Les IA réfléchissent coup par coup.** Elles évaluent l'ensemble de leurs options à chaque
  action, au lieu d'appliquer un classement figé. Mesuré : elles construisent jusqu'au tour 6, puis
  basculent vers l'attaque — donc elles s'adaptent au lieu de suivre un calendrier.
- **Un assaut d'IA est enfin porté au compte de l'IA.** En solo la différence était invisible ; à
  plusieurs, l'assaut d'une IA pouvait ouvrir une guerre au nom d'un autre joueur.
- **Le rapport de fin de partie contient une ANALYSE**, plus seulement le journal : trajectoire tour
  par tour de chaque nation (VP, ressources, moral, colonies, guerres) et décisions des IA avec le
  coup choisi, sa note, le dauphin et l'écart. C'est ce qui permet de comprendre *pourquoi* une IA a
  joué ce qu'elle a joué.
- **Chaque nœud de la carte affiche son rendement aux trois niveaux** (`Nv1 · Nv2 · Nv3`).
- **Tyrannie plafonne le moral à 6, Domination des Corporations à 7.**
- **Les cartes ont enfin la couleur de leur branche.**

## Ce qu'il faut savoir avant de jouer

- **Les tempéraments d'IA (bâtisseur, conquérant, opportuniste…) n'ont plus d'effet sur le jeu.**
  Ce sont des poids qui inclinaient l'ancien classement ; le tacticien n'a pas de classement. Ils
  restent stockés et affichés. À trancher plus tard : les rebrancher, ou les retirer.
- **Une partie contre les IA est plus lente à calculer** — elles simulent avant de choisir.

## Après l'envoi

Vider le cache du navigateur ou attendre que le service worker bascule (**v115**). L'écran de
connexion affiche les trois versions (`HTML`, `JS`, `moteur`) : elles doivent toutes dire **v9.94**.
