# Lot 17 — ce qu'on met en ligne, et rien d'autre

Dossier prêt à envoyer. Version **v10.02** (`sw.js` **v123**).

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

> ### Correctif v9.95 — le carnet de bord mélangeait tes actions et celles des IA
>
> Marc, en jouant la v9.94 : *« il me semble maintenant que l'IA joue toutes ses actions d'un coup
> avant ou après moi »*. Le déroulé du jeu était pourtant intact — mesuré : chaque tour d'IA ne
> consomme qu'un point d'action, et la main tourne correctement.
>
> Ce qui avait changé, c'est **à qui les actions étaient imputées**. Le cerveau `tacticien` appelle
> les fonctions du joueur (`doColonize`, `doUpgrade`, `buyTech`…) — c'est voulu, c'est ce qui garantit
> qu'une IA et un humain obéissent aux mêmes règles écrites une seule fois. Mais toutes se terminent
> par `addAction`, **le carnet de bord du joueur local**, qui code la nation active en dur. Chaque
> coup d'IA était donc inscrit dans TES actions, la ligne de journal signée de TON nom, un toast
> affiché sur TON écran — et en solo, la fonction programmait même le passage de TA main.
>
> Les deux carnets mélangés, seules les lignes `🤖` restaient identifiables : de quoi lire le journal
> comme si l'IA jouait en bloc.
>
> **Correctif** : une nation courante d'action, posée à UN SEUL endroit (`appliquerCoup`) et lue par
> `addAction` — le mécanisme exact de `logAuteur`, qui rend déjà ce service pour le journal. Ajouter
> un paramètre à `addAction` et le propager dans les huit fonctions appelantes aurait été la même
> règle maintenue à huit endroits, donc la divergence garantie.
>
> Banc neuf : **`test_carnet_du_joueur.js`**. Il vérifie qu'aucune action d'IA n'atterrit chez le
> joueur, que le joueur reste enregistré (sans quoi on « réparerait » en cassant tout), et il a été
> **vu rougir** — sans la protection, 8 actions d'IA retombent dans le carnet du joueur.

> ### Correctif v9.97 — l'IA construit d'abord, elle marque ensuite
>
> Doctrine dictée par Marc après la partie 6D02 (perdue 195 à 20 par l'IA) : *« viser les points de
> victoire dès le début est une erreur. D'abord on établit un système pour gagner des ressources,
> ensuite on améliore le système […] et à partir du milieu de la partie on veut plus de points. »*
>
> **Mesuré avant de toucher à quoi que ce soit** (`mesure_evaluation.js`, qui décompose la note de
> l'IA poste par poste et vérifie que sa somme retombe sur celle du moteur) : en début de partie, les
> VP déjà marqués pesaient **43 %** de la note contre 41 % à la production. L'IA jouait le score
> avant d'avoir une économie.
>
> Deux changements, tous deux dans `evaluerPosition` :
> · **le poids des VP monte avec la partie** (0,45 au tour 1 → ~0,95 au tour 10) au lieu d'être plein
>   dès le début. Le calcul du score n'est pas touché — seul change ce qu'il PÈSE dans la décision ;
> · **être à sec devient une falaise**, comme le moral l'était déjà. Engager un jeton coûte 1🪨+1⚡ :
>   une nation à 0 sur l'une des deux ne peut ni attaquer ni se défendre. Dans la partie de Marc, les
>   Ceinturiens étaient à 0⚡ des tours 8 à 10 → **0 jeton engagé en défense**, quatre colonies
>   perdues sans un combat. L'évaluation n'y voyait qu'un petit bonus manquant.
>
> Après : les VP pèsent **15 %** en début de partie, la production **52 %**.
>
> **Vérifié en tête-à-tête, 16 parties de chaque côté, mêmes graines, sièges permutés :**
>
> | | victoires | VP moyen IA | VP moyen témoin |
> |---|---|---|---|
> | sans les changements | 7 / 16 | 52,8 | 58,3 |
> | **avec** | **10 / 16** | 49,8 | **49,2** |
>
> Elle marque un peu moins dans l'absolu, et elle gagne nettement plus souvent — c'est exactement ce
> que la doctrine annonçait.
>
> ⚠️ **Au passage, un chiffre à corriger** : le « 11 victoires sur 16, +27 % de VP » annoncé pour le
> tacticien datait d'AVANT les trois correctifs du 28/08. Remesuré sur le code du jour, il était
> retombé à **7 sur 16**. Une bonne part de son avance venait de l'assaut mal attribué, corrigé
> depuis. Un chiffre de performance se remesure après chaque correctif ; sinon on livre une promesse
> périmée.

> ### v9.98 — l'IA essaie les investissements ; et un ajout mesuré puis RETIRÉ
>
> **Elle découvre Colonies Avancées au lieu qu'on la lui note.** Les investissements n'étaient pas
> des coups que l'IA simule : ils restaient choisis par un barème écrit à la main, où « Colonies
> Avancées » valait un poids parmi d'autres — sans rapport avec le fait qu'elle peut emporter la
> partie. Désormais l'IA JOUE chaque investissement pour de faux, note la position obtenue et garde
> le meilleur. Aucune connaissance du jeu n'est écrite : c'est la fonction qui applique vraiment
> l'effet qui est essayée. Le jour où un investissement change, l'IA le découvre seule.
>
> **Et une chose qui n'a PAS été livrée, parce que la mesure l'a condamnée.** « Empêcher l'autre de
> prendre la tech 3 » a été codé — la valeur des technologies encore atteignables — puis retiré :
>
> | | victoires | VP IA | VP témoin |
> |---|---|---|---|
> | sans | **10 / 16** | 49,8 | 49,2 |
> | avec, 1ʳᵉ version | 6 / 16 | 45,2 | 55,0 |
> | avec, version corrigée | 8 / 16 | 49,3 | 52,3 |
>
> La première version était à l'envers : en valorisant le fait d'AVOIR une T3 accessible, elle payait
> l'IA pour ne jamais la prendre — l'acheter faisait disparaître l'option. Corrigée (l'option ne
> compte que chez le rival, donc comme ce qu'on peut lui retirer), elle reste en dessous.
> **Retiré, code compris** — on ne garde pas de code mort « au cas où ». Le raisonnement est
> conservé dans le fichier pour ne pas refaire deux fois la même tentative.
>
> Ce que ça apprend : refuser une technologie à quelqu'un suppose de voir ce qu'il jouera ENSUITE.
> L'IA n'anticipe qu'un coup. C'est là qu'est la vraie limite, pas dans l'évaluation.

> ### v9.99 — l'IA ne triche plus, et elle joue mieux
>
> Marc, 28/08 : *« est-ce que les IA connaissent les règles du jeu au début du jeu ? »* En
> vérifiant, la réponse était pire que prévu : **elles en savaient trop**.
>
> Pour comparer sa position à celle des rivaux, l'IA évaluait chaque adversaire avec la même
> fonction que la sienne — qui lit ses ressources, son moral, sa force et ses revenus. Autrement dit
> **l'économie exacte de tout le monde**, alors que les règles (§14.7) la déclarent cachée sans le
> 📡 Réseau Orbital. Toi, tu ne la vois pas. Elle, si.
>
> Désormais un rival n'est jugé que sur ce qui est **public** : son score et sa carte — ses colonies,
> leurs niveaux, ses routes. Son économie n'apparaît qu'avec le Réseau Orbital, ce qui donne enfin à
> cette technologie la valeur que les règles lui promettent.
>
> **Et le résultat est le contraire de ce qu'on pouvait craindre.** Sur 20 parties en tête-à-tête,
> mêmes graines, sièges permutés :
>
> | | victoires | VP moyen IA | VP moyen témoin |
> |---|---|---|---|
> | en trichant | 10 / 16 | 49,8 | 49,2 |
> | **sans tricher** | 9 / 20 | **56,5** | 47,5 |
>
> Elle marque **19 % de plus**. En cessant de courir après la position exacte de l'adversaire, elle
> s'occupe de son propre développement — et c'est plus payant. Le compteur de victoires (meilleure
> nation d'un camp contre meilleure de l'autre) reste autour de la moitié ; les deux chiffres sont
> donnés tels quels, sans en choisir un.
>
> Banc neuf : **`test_brouillard_ia.js`**. Il ne compte pas des lignes de code — un renommage
> passerait au vert. Il MESURE : on bouleverse ce qui est censé être caché chez un rival et on exige
> que la note ne bouge pas ; puis, en contre-épreuve, qu'une colonie VISIBLE la fasse bouger (sans
> quoi une évaluation devenue aveugle à tout passerait aussi) ; puis qu'avec le Réseau Orbital elle
> voie ; puis qu'elle connaisse toujours sa propre situation.

> ### v10.00 — l'IA lit l'arbre technologique au démarrage
>
> Marc, 28/08 : *« il faut qu'elle connaisse toutes les tech en jeu au début du jeu […] elle doit
> lire ça pendant que les joueurs choisissent leur agenda secret. »*
>
> **Précision honnête sur ce que ça apporte.** Elle VOYAIT déjà toutes les cartes : l'arbre est une
> donnée publique, elle énumère celles qu'elle peut acheter et les essaie une par une. Une phase de
> lecture n'ajoute rien à ce qu'elle voit.
> Ce qui lui manquait est ailleurs, et l'intuition désignait juste : une technologie était valorisée
> sur son effet **immédiat** seulement. Sa valeur de **prérequis** — Biosphère Autonome ouvre
> Biosphère Avancée, qui ouvre Terraformation — était invisible, parce qu'elle ne regarde jamais un
> coup plus loin. Elle achetait un rang 1 pour ce qu'il rapporte tout de suite, jamais pour ce qu'il
> débloque.
>
> L'arbre est donc lu **une fois, au démarrage** (14 cartes ouvrent une suite), et ce que chaque
> carte débloque entre dans la décision. Un demi-pas de profondeur, là où il coûte le moins cher :
> calculé une seule fois par partie, pas à chaque coup. Le nombre n'est pas écrit à la main, il est
> déduit des données : changer un rang ou un VP dans l'arbre change la valeur sans toucher à l'IA.
>
> **Mesuré, et le signal est mitigé — les deux chiffres sont donnés :**
>
> | | victoires | VP moyen IA | VP moyen témoin |
> |---|---|---|---|
> | sans la lecture de l'arbre | 9 / 20 | 56,5 | 47,5 |
> | **avec** | **11 / 20** (1 nulle) | 57,7 | 51,3 |
>
> Elle gagne plus souvent (9 → 11 sur les mêmes graines), mais son avance en points se resserre
> (+9,0 → +6,4). Amélioration sur ce qui décide la partie, léger recul sur l'écart de score.

> ### v10.01 — trois défauts de la partie 4680
>
> **1. La fenêtre de Dyson s'ouvrait chez le mauvais joueur.** Marc : *« j'ai eu la fenêtre de Dyson
> pour choisir si je renonce alors que c'est l'IA qui l'a créée, et je l'ai refusée. »* Cette
> fenêtre-là appartient au **bâtisseur** : ouverte chez lui, elle lui faisait annuler l'achat d'une
> autre nation. Et la fenêtre qui lui revenait — accepter le monopole ou déclarer la guerre — n'était
> jamais posée. `buyTech` avait été rendue explicite côté RÈGLE, sa queue d'AFFICHAGE était restée
> écrite pour le joueur local. Les trois cartes à fenêtre étaient touchées : Télépathie,
> Extra-Solaire, Sphère de Dyson.
>
> **2. Une technologie volée pouvait être rachetée — et comptait deux fois.** L'espionnage range la
> carte sous `<id>_esp` ; le garde-fou comparait `<id>` et ne la voyait pas. Dans le décompte de la
> partie 4680, Extracteurs Solaires figure deux fois (+3 puis +3), et son bonus par tour s'appliquait
> deux fois lui aussi. L'espionnage était devenu une machine à dupliquer.
>
> **3. L'IA construisait la Sphère sans que personne ne soit consulté.** Le drapeau qui pose la
> question aux autres nations vivait dans l'ancienne enveloppe de l'IA, que le nouveau cerveau
> n'emprunte plus.
>
> ⚠️ **Les trois relèvent du même motif, et c'est la troisième fois qu'il se paie** (le carnet de
> bord, l'assaut, ici) : tout ce que faisaient les vieilles enveloppes de l'IA et qui n'est pas DANS
> la fonction de règle disparaît dès qu'on appelle la règle directement.
>
> Banc neuf : **`test_espionnage_dyson.js`**, six points dont trois contre-épreuves — un achat normal
> reste possible, le joueur garde ses propres fenêtres, et il ne s'en ouvre aucune quand c'est l'IA
> qui achète.

> ### v10.02 — une techno volée est enfin « prise » partout
>
> Marc : *« la tech elle-même n'est pas écrite comme prise comme c'est le cas si tu l'achètes toi,
> elle est toujours disponible comme achetable dans la rivière de cartes et dans le détail. »*
>
> Bloquer le rachat (v10.01) ne suffisait pas : tant que l'écran la présente comme disponible, on
> clique et on se fait refuser sans comprendre. La copie d'espionnage porte l'identifiant `<id>_esp`
> — voulu, pour qu'elle ne prenne pas l'exclusivité d'un achat — et **huit endroits** comparaient
> l'identifiant nu : la rivière, le détail de la carte, et les filtres de candidats des IA.
>
> Une seule fonction, `possedeCarte(nation, id)`, répond désormais à la question, et les huit sites
> l'appellent. Le jour où l'espionnage change de convention, il y a UN endroit à corriger — pas huit
> à retrouver.

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

Vider le cache du navigateur ou attendre que le service worker bascule (**v123**). L'écran de
connexion affiche les trois versions (`HTML`, `JS`, `moteur`) : elles doivent toutes dire **v10.02**.
