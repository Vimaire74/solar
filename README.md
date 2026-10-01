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

## 📦 CE LOT EST EN **v11.16** · cache `sw.js` **v237** · 2026-10-01

> Pour savoir ce qui est EN LIGNE : ouvre solar-game.com, la version est écrite sur l'écran de
> connexion. Si elle ne dit pas **v11.16**, l'envoi ou le redéploiement n'a pas pris.
> ⚠️ **Les DEUX ressources Coolify** doivent être redéployées : le site ET le serveur.

**v11.16 — 01/10/2026** — `docs/REPRISE.md` §183
- « Envoyer par email » : le log part entier, en pièce jointe, par la feuille de partage du téléphone (Gmail, WhatsApp…) — plus de courriel coupé au tour 2.

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
