# Lot 18 — ce qu'on met en ligne, et rien d'autre

<!-- BANDEAU-VERSION : monté par le même mouvement que les estampilles du code, et VÉRIFIÉ par
     server/test_versions.js. Ne pas l'éditer à la main : un README qui annonce une version
     fausse est pire que pas de README.

     ⚠️ FORME DE CE FICHIER — RÈGLE DE MARC, 27/09 : le numéro de la nouvelle version, puis la liste
     des changements, UNE LIGNE PAR CHANGEMENT — pas de paragraphe, pas de récit. Le détail va dans
     docs/REPRISE.md.

     Lot 18 ouvert le 30/09/2026 (v11.07). Les dossiers lot17 et lot17_maj sont des ARCHIVES : on ne
     les met plus à jour.

     ⚠️ RÈGLE DE MARC (14/09, rappelée le 01/10) : CE DOSSIER NE CONTIENT QUE LES FICHIERS QUI ONT
     CHANGÉ depuis le dernier envoi — JAMAIS un miroir complet (84 Mo : « trop lourd pour GitHub »).
     Le 01/10 il a été ramené de 84 Mo à 3,5 Mo (36 fichiers). Un fichier identique à ce qui est déjà
     en ligne n'a rien à faire ici ; une image ou un banc nouveau ou modifié, oui. -->

## 📦 CE LOT EST EN **v11.40** · cache `sw.js` **v261** · 2026-10-03

> Pour savoir ce qui est EN LIGNE : ouvre solar-game.com, la version est écrite sur l'écran de
> connexion. Si elle ne dit pas **v11.40**, l'envoi ou le redéploiement n'a pas pris.
> ⚠️ **Les DEUX ressources Coolify** doivent être redéployées : le site ET le serveur.

**v11.40 — 03/10/2026** — REDÉPLOYER AUSSI LE SERVEUR (moteur.js) — `docs/REPRISE.md` §208
- Ordinateurs : les technologies de rang 3 sont visées selon leur levier (IA Défensive 10, Hyperpropulsion 8, Sphère de Dyson 8, Télépathie 8, Terraformation 6, Éveil Collectif 6, Extra-Solaire 4).
- Ordinateurs : une colonie isolée ne vaut que ce qu'on pourra en tirer une fois reliée (routes à poser, nations en travers du chemin, tours restants) ; plusieurs colonies isolées sont pénalisées.

**v11.39 — 03/10/2026** — REDÉPLOYER AUSSI LE SERVEUR (moteur.js, server/driver.js) — `docs/REPRISE.md` §206
- Réponses des ordinateurs (paix, accords, défense, cibles…) : une seule version, la même dans l'appli et sur le serveur.
- En ligne, un ordinateur qui se défend calcule ses jetons comme dans l'appli (il engageait toujours 2 jetons).

**v11.38 — 03/10/2026** — REDÉPLOYER AUSSI LE SERVEUR (moteur.js) — `docs/REPRISE.md` §205
- Fenêtre « Action impossible » : les ressources manquantes sont écrites en toutes lettres (« il faut des matériaux et de l'énergie ») au lieu d'un blanc.
- Rapport de partie : un accord commercial proposé par un ordinateur n'apparaît plus comme « [object Object] ».

**v11.37 — 03/10/2026** — REDÉPLOYER AUSSI LE SERVEUR (moteur.js) — `docs/REPRISE.md` §204
- Attaque lancée puis annulée pendant tes actions : plus de guerre ouverte, accords et tensions intacts, AC rendu — comme si rien n'avait eu lieu.
- Bouton ↩ (annuler une action) : remet TOUTE la partie en l'état (tensions des autres nations, parts de Sphère de Dyson, journal, rapport), plus seulement ta nation.

**v11.36 — 03/10/2026** — REDÉPLOYER AUSSI LE SERVEUR (moteur.js) — `docs/REPRISE.md` §203
- Guerre de fin de tour : « Annuler — revenir au choix » sur une attaque ramène au choix de guerre au lieu de clore le combat et de passer à la fin de tour.

**v11.35 — 03/10/2026** — REDÉPLOYER AUSSI LE SERVEUR (moteur.js)
- Résumé des investissements actifs : petite illustration de la carte à la place de l'émoji, pour toi et les autres nations.

**v11.34 — 03/10/2026** — site seulement
- Règles (fr + en) : emblèmes des nations à la place des émojis, grandes illustrations des cartes d'investissement.

**v11.33 — 03/10/2026** — site seulement
- Cartes d'investissement : l'illustration ne chevauche plus le texte au téléphone.

**v11.32 — 03/10/2026** — site seulement, le serveur n'a pas changé
- Cartes d'investissement : illustrations à la place des émojis dans les fenêtres de choix.
- Grandes illustrations des cartes d'investissement (assets/invest/grand/) : archivées en ligne, pas encore affichées.

**v11.31 — 03/10/2026** — `docs/REPRISE.md` §201 — site ET serveur
- Commerce avec les pirates : le gain s'affiche dans une fenêtre, comme celui d'une colonisation (en ligne : fenêtre verte « Gain »).
- Barre du haut : « POUVOIR » reste écrit sur grand écran ; l'icône seule ne sert qu'au téléphone.
- Cartes Investissement : cartouches pleine largeur, l'une sous l'autre, coût mis en avant, sans triangle ⚠️.
- Bouton « Valider ce choix » → « VALIDER », dans la police des autres boutons.

**v11.30 — 03/10/2026** — `docs/REPRISE.md` §200 — site ET serveur
- « Copier le log », « Envoyer par email », « Télécharger » : le journal exporté est exactement le journal affiché (mêmes lignes, même ordre).
- « Envoyer par email » sans partage disponible (appli Android) : ouvre « Envoyer le rapport » au lieu d'un lien e-mail qui bloquait.
- Rapport de problème : description en haut, puis trois boutons (Retour, Copier le rapport, Envoyer le rapport), explications ensuite.
- Rapport envoyé au serveur : journal affiché + rapport de partie + état complet de la partie (plafond 2 Mo, serveur compris).
- Sphère de Dyson : la ligne « N nation(s) acceptent le monopole (+3/tour chacune) » n'est plus signée par le bâtisseur.

**v11.29 — 03/10/2026** — `docs/REPRISE.md` §199 — site ET serveur
- Rapport : la route du joueur indique le jeton posé (« 1 jetons Force → 1⚔️ déployé »), comme pour les ordinateurs.
- Sphère de Dyson : ligne au journal pour le bâtisseur (« +5 énergie/tour ») ; bandeau ✓/↩ avec le gain.
- Rapport : la ligne de colonisation indique le gain de la découverte (« découverte Gisement Riche : +2 matériaux »).

**v11.28 — 03/10/2026** — `docs/REPRISE.md` §197 — site ET serveur
- « Ordre du tour » (Initiative) : fenêtre « Nouvelles » à part, avant la première action ; plus jamais dans « On t'attaque ».
- Les avis du début de tour (ordre du tour, pirates) s'affichent avant que quiconque ne joue.
- Nouvelles et attaques ne se mélangent plus : une fenêtre par série, dans l'ordre d'arrivée.
- Une fenêtre d'avis attend que la fenêtre ouverte (investissements activés, bilan…) soit fermée : plus deux fenêtres l'une sur l'autre.
- Ton espionnage réussi : fenêtre « Nouvelles » juste après ton choix, avant le bilan (plus en rouge au tour suivant).
- Sphère de Dyson construite par un ordinateur : la partie attend ta réponse avant de continuer.

**v11.27 — 03/10/2026** — `docs/REPRISE.md` §195 — site ET serveur (le texte de l'avis en ligne vient du moteur)
- Avis de pillage : « Ceinturiens pillent Io — Tu perds +1 énergie sur ton prochain revenu. Tension +3. » (colonie nommée, solo et en ligne).

**v11.26 — 03/10/2026** — site seulement, le serveur n'a pas changé
- Barre du haut avec PASSER : Pouvoir réduit à son icône ✦, « À TOI » jamais coupé, Passer plus petit.

**v11.25 — 03/10/2026** — site seulement, le serveur n'a pas changé
- Barre du haut : quand PASSER est affiché, Pouvoir et À TOI rétrécissent pour que tout tienne dans l'écran.

**v11.24 — 03/10/2026** — site seulement, le serveur n'a pas changé — `docs/REPRISE.md` §194
- Journal : plus aucun émoji décoratif ; restent ☠️ (pirates) et la pastille de chaque nation. Les émojis de ressource deviennent l'icône de ressource.
- Appli (partie hors ligne) : bouton PASSER rétabli à côté de « À TOI » — renonce à une action (−1 AC), comme sur le site.

**v11.23 — 03/10/2026** — site seulement, le serveur n'a pas changé — `docs/REPRISE.md` §193
- Fenêtre « Investissements activés » : une ligne par nation rivale, avec son emblème (avant : une seule nation, sans nom).
- Ceinturiens : l'émoji ☠️ est remplacé par 🟣 dans tous les textes (journal, avis, règles, tutoriel) ; ☠️ ne désigne plus que les pirates.

**v11.22 — 03/10/2026** — site seulement, le serveur n'a pas changé
- Titres de fenêtre trop longs pour le téléphone (« DÉVELOPPEMENT TECHNOLOGIQUE ») : réduits pour tenir dans le cadre.

**v11.21 — 02/10/2026** — `docs/REPRISE.md` §190
- Ultimatum d'un tour : à 10/10 de tension en fin de tour, la guerre populaire n'est plus déclarée tout de suite ; fenêtre « Ton peuple exige la guerre contre X » avec les griefs, un tour pour ramener la tension sous 10, guerre à la fin du tour suivant si elle y est encore. Même règle pour les ordinateurs (entre eux et envers toi : « Le peuple de X exige la guerre contre toi »).
- Pendant un ultimatum, la baisse passive « aucun grief : −1 » ne joue pas — il faut un acte (Calmer la population, accord, pacte, Diplomatie).
- Chaque hausse de tension garde sa cause (espionnage, raid, blocage de chemin, routes, dominance, étouffement, assaut, pirates, avance technologique) ; l'ultimatum les récapitule.
- Règles fr/en §12.3 (ligne 10 et texte « seul chemin vers la guerre ») et aide de l'onglet Diplomatie mises à jour.
- Exploration Extra-Solaire : jamais sur une capitale (Éris, capitale des Ceinturiens, ne se partage plus) ; l'occupant d'un nœud partagé reçoit un avis quand une nation s'installe à côté de lui.
- Points de victoire : une carte répétable (Investissements militaires…) ne compte qu'une fois dans « Cartes ».
- Règles fr/en §6.5, carte Extra-Solaire et tableau des VP mis à jour.
- Exploration Extra-Solaire : Éris n'est plus une destination (Pluton ou Triton seulement) — carte, règles fr/en, code.
- Rappel du pouvoir national : n'apparaît plus par-dessus une fenêtre en cours (jeton de route, combat, résultat) ; il attend qu'elle soit fermée.
- Les ordinateurs ne jouent plus pendant que le joueur choisit son jeton de route ou lit un résultat (l'ancienne attente s'arrêtait à 6 s).
- Raid du joueur en solo : fenêtre de résultat (colonie pillée, butin, jetons, tension), réductible.
- Raid : seule la colonie choisie est pillée, jamais une autre ; une colonie non reliée (qui ne produit rien) ne peut pas être raidée, rien n'est dépensé.
- Garde : la nation du joueur ne peut plus être jouée par l'ordinateur (vue restée sur une autre nation après une fin de tour) ; le rapport de diagnostic le signale si la garde agit.

**v11.20 — 02/10/2026** — `docs/REPRISE.md` §189
- Guerre en solo : plus de « défense fantôme » (fenêtre « Défense de 🏙️ Colonie … — choisis tes jetons », sans Supercroiseur, sans écran de résultat) ; la seule fenêtre de défense est celle du vrai assaut (force annoncée, garnison, Empathes, Supercroiseur proposé).
- Fenêtre de défense : « ta capitale » quand c'est la capitale, Empathes « sans coût », la règle exacte (égalité, victoire, défaite) à la place du conseil.
- Règle d'égalité au combat, identique par tous les chemins (joueur ou ordinateur, attaque ou défense) : le défenseur garde la place, la moitié des jetons de chacun part en récupération, rien n'est perdu, −1 moral chacun, aucun VP. Avant, un assaut d'ordinateur à égalité valait victoire du défenseur (+2 VP). Règles (fr/en) §14.5 mises à jour.
- Fenêtre d'assaut : ses boutons Annuler / Engager sont remis en place à chaque ouverture (la vieille fenêtre de défense les remplaçait par « Défendre », d'où « puissance DEFEND:2000 — égalité » à chaque attaque) ; un engagement reçu sous forme de texte est lu comme un nombre.

**v11.19 — 02/10/2026** — `docs/REPRISE.md` §188
- TOUTES les fenêtres du jeu sont réductibles (décisions comprises : agenda, stratégie, pactes, accords, paix, combat, défense, espionnage, Dyson, routes, Forge…) ; replier ne répond à rien, la pastille rend la fenêtre intacte.

**v11.18 — 02/10/2026** — `docs/REPRISE.md` §187
- Les fenêtres de choix d'investissement (niveaux 1 et 2) sont réductibles : « – » pour aller voir son empire, la pastille ramène la fenêtre sans rien avoir choisi.

**v11.17 — 02/10/2026** — `docs/REPRISE.md` §186
- Sonde : si un assaut d'ordinateur est résolu chez toi sans fenêtre de défense, une ligne rouge le dit au journal et le rapport de diagnostic note le chemin pris (non reproduit, partie Terriens/Ceinturiens du 01/10).

**v11.16 — 01/10/2026** — `docs/REPRISE.md` §183-184 — REDÉPLOYER AUSSI LE SERVEUR
- « Envoyer par email » : le log part entier, en pièce jointe, par la feuille de partage du téléphone (Gmail, WhatsApp…) — plus de courriel coupé au tour 2.
- Serveur : le courriel de diagnostic contient TOUT (commentaire, erreurs, journal entier) avec le rapport joint ; la page /stats liste les rapports avec leur contenu et un bouton Copier — plus d'adresse à composer avec la clé. REDÉPLOYER LE SERVEUR.

**v11.15 — 01/10/2026** — `docs/REPRISE.md` §182
- Fin de partie : le décompte n'est plus coupé par la barre du haut (titre et première nation visibles).
- Fin de partie : le gagnant en premier, puis par score décroissant.

**v11.14 — 01/10/2026** — `docs/REPRISE.md` §181
- Empire : un emblème devant le score de chaque adversaire (plus de « ~3/3/4 » sous trois émojis), et dans la section « Adversaire IA ».
- Empire : les quatre cases de ressources restent alignées aux grandes tailles de texte (le libellé ne passe plus sur deux lignes).

**v11.13 — 01/10/2026** — `docs/REPRISE.md` §180
- Cartes détaillées : plus de « ✓ Toi / Yours », ni « ∞ / GOV / 1× / Militaire » en grand sur l'illustration ; le rang T1/T2/T3 reste, petit, en haut à gauche.
- Cartes détaillées : l'illustration remplit son cadre (format 1184×864), plus de bande ni de coupe.
- Onglets du bas : plus de libellé coupé (« EMPI… », « JOURN… ») aux grandes tailles de texte.
- Diplomatie : l'étiquette Paix / Tensions / En guerre passe sous le nom de la nation.
- Anglais : « Military » sous les cartes militaires, « /turn » dans la tension.

**v11.12 — 01/10/2026** — `docs/REPRISE.md` §179
- Solo (appli) : le rappel du pouvoir gratuit arrive au dernier AC, une fois par tour, comme sur le site — plus à 0 AC.

**v11.11 — 01/10/2026** — `docs/REPRISE.md` §178
- Nouvelle icône du jeu (orbite en S autour du soleil) : site, appli et écran de démarrage.
- Emblèmes des quatre nations à la place des émojis dans les médailles : fenêtres, bandeau, scores, classement, diplomatie, choix de la nation, sièges.

**v11.10 — 01/10/2026** — `docs/REPRISE.md` §176 — REDÉPLOYER AUSSI LE SERVEUR
- Raid subi en solo (appli) : avis « X te pille » en rouge, et section « Pillage subi » au bilan avec la colonie dont la production ne rentre pas.
- Fenêtres d'information réductibles (bilan, événement, découverte, investissements, guerre déclarée, « attaqué par ») : un « – » replie, une pastille en bas à droite rend.
- Solo : aucune action pendant le tour des ordinateurs (« ⏳ Les autres nations jouent »), et ✓/↩ ferme la carte des dépêches pour arriver seul, directement après l'action.
- Appli en anglais : les fichiers de langue, les règles et la confidentialité en anglais partent dans l'appli (langue du téléphone, ou sélecteur FR · EN).
- Serveur : chaque rapport de diagnostic reçu envoie un courriel à contact@solar-game.com (réglable par DIAG_MAIL dans Coolify ; vide = aucun courriel).

**v11.09 — 01/10/2026** — `docs/REPRISE.md` §175 — REDÉPLOYER AUSSI LE SERVEUR
- Appli solo : une guerre entre deux IA ne passe plus par tes fenêtres, et ses VP vont aux belligérants.
- Règles (fr + en) : le raid coûte 2 jetons Force pour toutes les nations.

**v11.08 — 01/10/2026** — `docs/REPRISE.md` §174 — REDÉPLOYER AUSSI LE SERVEUR
- Rapport de partie : plus de `�` à la place des émojis de nation (🔴 🌍 🛡️).
- Les IA paient les cartes militaires au vrai prix en AC (Supercroiseur 3, Flottes 2), une fois par tour.
- Les IA ne proposent plus d'accord à une nation avec qui elles en ont déjà un.
- Appli solo : un accord ou un pacte proposé par une IA est désormais DEMANDÉ au joueur.
- Rapport : ton raid nomme la colonie pillée et compte les 2 jetons Force.

**v11.07 — 30/09/2026** — `docs/REPRISE.md` §172 — REDÉPLOYER AUSSI LE SERVEUR
- Plus aucune fenêtre verte (pouvoirs nationaux, raids des autres nations, pirates).
- Action refusée : une fenêtre « Action impossible » donne la raison, aussitôt après l'action.
- Tout choix dans une liste se valide : un toucher sélectionne, « Valider ce choix » confirme (investissements, copie télépathique, Forge, extra-solaire, apaisement, panneau générique).
- Investissements des autres nations cachés avant ton propre choix (niveaux 1 et 2).
- Espionnage en ligne : lignes à toucher au lieu de cases à cocher du navigateur.

**Versions précédentes** : voir `Pour uploader/lot17/README.md` (v11.06 et avant).
