# Solar Conquest — Résumé de session 2026-06-28 (pour reprise)

**Fichier de référence (le seul modifié) : `solar_conquest_carte.html`.**
Les autres HTML (index, small_screen, game, interleaved_full) ne sont PLUS mis à jour (décision : économie de tokens) — gardés comme référence.
Règles Word à jour : `regles/Regles_Solar_Conquest_v17.docx`.
Backups `.bak_*` créés à chaque gros changement.

---

## Ce qui a été fait aujourd'hui

### 1. Refonte de l'Accord Commercial (code + Word v17)
- **Coût** : plus de savoir → **1 AC + 2 matériaux DONNÉS** à l'autre nation (toi −2, elle +2).
- **Tension −3 des DEUX côtés** à la signature (avant : un seul côté).
- Le bouton « Accord commercial » ouvre une **fenêtre explicative** (`showAccordInfo`) avant de confirmer.
- **Guerre** avec une nation → annule **ses** accords sur **toutes ses colonies** (par nation, plus « tous »). Un **raid n'annule pas**.
- **Routes en guerre** : une route saute seulement si **aucun bout n'est à moi** ET au moins un bout = nation en guerre → **jeton Force rendu** ; les routes me touchant **tiennent**.
- **Colonie Extra-Solaire** sur un nœud de la nation en guerre → **elle saute** (avant la rupture des routes).
- **Désenclavement** : on peut construire des routes **depuis/entre les nœuds sous accord** (transit) ; la connectivité suit les routes (`uiMapMarkers` : nœuds d'accord ajoutés comme origines).
- **Protection alliée** : route protégée des pirates si un allié a déjà un jeton sur le même segment (`advancePirates`).
- **Nettoyage de reliquats obsolètes** : plus de colonisation partagée hors Extra-Solaire (`doColonize` bloque les nœuds occupés ; bouton « Coloniser (Accord) » remplacé par « Rompre l'accord & Attaquer ») ; suppression du **+2 tension « nœud partagé »** (`updateTension`).

### 2. Bug guerre — annulation d'assaut (corrigé + simulé)
- Refuser la paix → choisir une colonie → annuler donnait une **action fantôme** (remboursait un AC jamais dépensé). Désormais : annuler depuis le **flux décision paix/guerre** ne rembourse rien et **revient à la modale paix/guerre** (`G._warDecisionAssault`, `_warBackToPeace`). Le remboursement reste correct pour une attaque lancée depuis la carte.
- Le **sélecteur d'assaut** affiche maintenant les **jetons Force disponibles** et grise les colonies inattaquables.

### 3. UI mobile
- **Popups** : remplissent 100 % de la **bande centrale**, alignées en haut, **scrollables H+V**, carte interne pleine largeur.
- **Barre du haut compactée** : label « ⚡ Actions » retiré, « Capacité »→« Cap. », « Annuler »→« Ann. », « Tour X/10 » / « X/X AC » / gouvernement réduits.
- **Fin de Tour** réellement masqué pendant agenda + stratégie (le vrai bug : `offsetParent` est null pour `position:fixed` → la détection échouait ; corrigé via la classe `hidden`).
- **VP dans la barre du haut** : il était écrasé par `uiFillIncome` → VP ajouté dans `uiFillIncome` (s'affiche enfin, 🏆 doré à droite des ressources).
- La barre du haut passe **au-dessus des modales** (z-index 400) pour ne plus être recouverte.

### 4. Carte GLOBALE (1ʳᵉ carte)
- `global.png` = nouvelle image peinte de l'utilisateur (système solaire avec noms + 2 ceintures). On n'y touche pas.
- Les **noms SVG ont été retirés** (les noms sont dans l'image) ; seules restent les **10 zones cliquables invisibles**.
- **Recalibrage** des 10 zones via un outil de calibrage temporaire (taper chaque planète → coordonnées exactes), **puis l'outil a été retiré**. Coordonnées finales (repère 400×600) : Mercure 144,190 · Vénus 114,228 · Terre 182,324 · Mars 269,323 · Jupiter 336,227 · Saturne 106,386 · Uranus 119,92 · Neptune 314,457 · Ceinture 66,245 · Kuiper 199,65.

### 5. Carte DÉTAILLÉE (2ᵉ carte, scrollable, viewBox 980×320)
- Les nœuds dessinés (cercles+emoji) ont été **remplacés par les images** de l'utilisateur (`assets/map/<nœud>.png`) — `renderSystemMap`.
- **Planètes décor** (`PLANETS_DECO`) : Vénus/Saturne/Uranus/Neptune passées en images ; ellipse d'anneau de Saturne retirée (déjà dans `saturne.png`).
- **Jupiter en double corrigé** : `jorbital1` (Station Jupiter) = petit marqueur ; la grosse Jupiter reste le décor.
- **Tailles** ajustées : lunes `ir = node.r×1,4` (plafond 11) ; décor Jupiter 33, **Saturne 42** (son image a un globe minuscule dans de larges anneaux — mesuré : contenu 48 % de hauteur), Uranus 21, Neptune 20, Terre 14, Vénus 13, Mars 9.
- **Lune rapprochée de la Terre** (nœud lune y 128→162).

### Abandonné / autre
- Tentative de **retoucher l'image** (retirer un doublon Vénus + une lune par inpainting cv2) : pas assez propre, **abandonné** (l'utilisateur refait l'image lui-même). Fichier `assets/map/solar_system_name_fixed.png` et dossier `_calib`/`_grid.png`/`_top.png`/`_bot.png` à la racine = **à supprimer** (pas les droits pour le faire côté agent).
- Réécriture d'un **prompt ChatGPT** image pour faire apparaître les 2 ceintures (les remonter en tête du prompt).

---

## À REPRENDRE DEMAIN — la carte n'est PAS à l'échelle

- **Tailles** et **distances** des planètes/lunes = échelle **artistique compressée**, pas réaliste. L'utilisateur veut s'en rapprocher.
- Vraies contraintes : rapports énormes (Jupiter ≈11× Terre, Phobos ≈0,002× ; distances Lune↔Éris ≈ ×100). Le vrai à l'échelle est illisible → viser une **échelle compressée mais proportionnée** (ex. compression log/racine des tailles, et espacement croissant vers l'extérieur mais borné).
- Points liés déjà signalés par l'utilisateur : « trop collé par endroits » (aérer), tailles relatives à revoir, distances à revoir.
- Pistes : (a) recalculer les `ir` selon les **vrais diamètres compressés** ; (b) repositionner les nœuds (`NODES x,y`) et les décors (`PLANETS_DECO x,y`) pour des **distances proportionnées** ; (c) éventuellement élargir le viewBox 980×320 pour gagner de la place. À faire d'un bloc (ça repositionne tout).

## Tester / déployer
- Tester en double-cliquant `solar_conquest_carte.html`.
- Déploiement serveur : mettre `solar_conquest_carte.html` (en `index.html`) + `sw.js` + dossier `assets/` (map, cards, pwa). Bumper le cache `sw.js` si la version ne se met pas à jour sur mobile.
