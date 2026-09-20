# lang/ — les langues du jeu

**Principe** (Marc, 18/09/2026) : les traductions sont séparées du jeu, chargées selon la langue du
joueur, et ajouter une langue ne demande qu'un fichier.

## Comment le jeu choisit la langue
1. `?lang=xx` dans l'adresse (un lien à envoyer, les bancs, le tutoriel sous jsdom) — sans rien mémoriser ;
2. sinon `localStorage.sc_lang` — le sélecteur « FR · EN » de l'accueil et de l'écran de connexion ;
3. sinon la langue du navigateur / du téléphone (`navigator.language`, deux premières lettres) ;
4. sinon le français.
Tout ça vit dans `i18n.js`, chargé dans le `<head>` d'index.html AVANT les autres scripts. Changer
de langue recharge la page.

## Comment un texte est écrit dans le code
```js
t('lobby.tour', 'tour {n}', {n: 7})          // → « tour 7 » en français, « turn 7 » en anglais
```
- La **clé** (`lobby.tour`) : `ecran.chose`, en minuscules, sans accent. Un mot commun va dans `commun.*`.
- Le **français** reste dans le code : c'est le texte par défaut. Sans dictionnaire (serveur, hors
  ligne, clé pas encore traduite) il s'affiche tel quel. Une traduction manquante se voit — elle
  reste en français — au lieu de casser quoi que ce soit.
- Les **paramètres** `{n}` sont remplacés tels quels. Même jeu de paramètres dans chaque langue.
- Dans le HTML statique d'index.html : `data-i18n="cle"` (le texte), `data-i18n-ph="cle"`
  (placeholder), `data-i18n-title="cle"` (title). Le français reste dans la balise.
- `t()` est défini dans **moteur.js** (le serveur charge moteur.js seul) ; i18n.js ne fait que le
  choix de langue, le chargement et les `data-i18n`.

## Le journal, les fenêtres et le serveur : la clé qui voyage (v10.78)
Une ligne de journal est rendue chez CHAQUE joueur dans SA langue — deux joueurs, deux langues.
Pour ça, la clé et ses paramètres voyagent avec le texte français :
```js
addLog(J('journal.colonise', '{civ} colonise {noeud}', {civ:_i18nRef(civ,'name'), noeud:_i18nRef(node,'name')}), 'gold');
```
- `J(k, fr, p)` (moteur.js) rend un objet `{k, fr, p}` qui s'affiche en français par `toString()` :
  tout ce qui ne connaît pas J le voit comme une chaîne. `addLog` garde `msg` (français) et, à côté,
  `k` et `p` ; `_logTexte(e)` re-rend `t(k, msg, p)` — c'est lui que lisent le Journal, les dépêches
  et online.js.
- `_i18nRef(obj, 'name')` rend `'@carte.bio1.nom'` : une référence à une DONNÉE, résolue à l'affichage
  dans la langue du lecteur (dictionnaire, sinon le français des tables). Un paramètre peut aussi être
  un J imbriqué. Jamais de nom traduit en dur dans un paramètre.
- Fenêtres en ligne : `_i18nAplatir` (moteur.js, dans `_emitDecision`) transforme les J d'une charge
  utile en `champ` (français) + `champ_i18n = {k, fr, p}` ; le client `_i18nHydrater` (online.js,
  `handle`) les re-rend. Le serveur n'a rien à savoir.
- Serveur (server/server.js) : `K(k, fr, p)` est le J du serveur ; `tL(lang, k, fr, p)` rend dans une
  langue donnée à partir des dictionnaires `DICTS` (chargés de `lang/*.js` au démarrage) ;
  `aplatirK` (dans `sendTo`) aplatit comme `_i18nAplatir`. La langue d'un joueur vient du `hello`
  (`lang:`) et est gardée dans `users[u].lang` : le courriel de fin de partie est rédigé dans la
  langue de chaque destinataire (`corpsRapport(entry, lang)`) ; la copie de l'éditeur reste en français.
- server/driver.js : les lignes qu'il écrit passent par `sb.J`.
- Vérification : `node server/test_i18n.js`, `node server/test_simulation_sans_fenetre.js`,
  `node server/test_i18n_ombrage.js` (aucun `t(...)` sous une variable locale nommée `t` — sinon
  « t is not a function », vu en v10.78 dans `espPiller`), et l'extracteur (il relève aussi `J(`,
  `K(`, `T(` et `tL(lang,`).
- Trois règles : un message qui entre dans l'ÉTAT sauvegardé reste `t()` (un J relu d'un JSON perd
  son `toString`) ou est lu par `_i18nTexte()` ; jamais de `join`/`+=` sur des J (la concaténation
  rend le français tout de suite) — des paramètres imbriqués à la place ; les noms de données dans
  un paramètre sont des références `_i18nRef(obj,'name')`, plusieurs `@refs` peuvent cohabiter dans
  une chaîne (`'@carte.a.nom, @carte.b.nom'`).

## Les pages traduites à part (règles, confidentialité)
`regles.html` → `regles.en.html`, `confidentialite.html` → `confidentialite.en.html` : une page par
langue, à côté de la française. `i18nPage('regles.html')` (i18n.js) rend le nom à ouvrir dans la
langue courante ; les liens sont réécrits au chargement (`data-i18n` et `a[href]`) et au clic (liens
fabriqués par online.js). Table `I18N_PAGES` dans i18n.js : y ajouter le code d'une langue quand sa
page existe, et la page au `SHELL` de sw.js. Le tutoriel est UNE page qui se traduit par le
dictionnaire. Le PDF des règles reste en français.

## Ajouter une langue (allemand, espagnol, chinois…)
1. `node scripts/i18n_extract.js` → `lang/_source.fr.json` : toutes les clés avec leur français.
   C'est ce fichier qu'on donne à traduire.
2. Écrire `lang/de.js` sur le modèle de `lang/en.js` : `window.SOLAR_LANG_DICT = { "cle": "texte" }`.
3. Ajouter `'de'` à `SUPPORTED` dans `i18n.js` (et son nom dans `NOMS`), et `./lang/de.js` au
   pré-cache `SHELL` de `sw.js`. Le serveur charge tout `lang/*.js` tout seul (courriels, fenêtres).
   Pour les règles et la confidentialité : `regles.de.html`, `confidentialite.de.html`, et `'de'`
   dans `I18N_PAGES` (i18n.js) + `SHELL` (sw.js).
4. `node scripts/i18n_extract.js` dit ce qui manque, ce qui est obsolète, et si un `{param}` diffère.
5. Monter les estampilles (index.html, online.js, moteur.js, sw.js) — `test_versions.js`.

## Les données du jeu (cartes, nations, nœuds…)
Elles restent en français dans moteur.js et sont **retraduites en place au chargement**
(`i18nTraduireDonnees()`, spec dans `_i18nDonneesSpec()`). Les clés sont dérivées de la table et
de l'ID : `carte.bio1.nom`, `carte.bio1.effet`, `nation.terriens.pouvoir_desc`, `noeud.eris.desc`,
`planete.saturne.nom`, `evenement.<id>.apercu`, `strategie.<id>.desc`… L'extracteur les relève
tout seul : ajouter une carte, c'est ajouter ses clés dans `_source.fr.json` au prochain
`node scripts/i18n_extract.js`. Règle qui en découle : **jamais de comparaison de code sur un
nom de donnée** (`card.name==='…'`) — toujours sur l'ID.

## Ce qui est traduit, et ce qui reste à faire
Voir `docs/REPRISE.md` §148. Fait (v10.79, **2132 clés**) : accueil, connexion, lobby, création de
partie, salle d'attente, suppression de compte (tranche 0) ; toute l'interface du plateau (tranche 1) ;
les données affichées — cartes, civiques, nations, nœuds, planètes, événements, agendas,
investissements, découvertes, stratégies, tempéraments (tranche 2) ; le journal, les toasts, les
fenêtres et notices en ligne, avec la clé qui voyage (tranche 3) ; le tutoriel, les messages du
serveur, le rapport de fin et les courriels dans la langue de chaque joueur (tranche 4) ; les pages
règles et confidentialité (tranche 5). Reste : le PDF des règles, et la carte peinte de l'accueil
(`global2.webp`) dont les noms de planètes sont dans l'image.
