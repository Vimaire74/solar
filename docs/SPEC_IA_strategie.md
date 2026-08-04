# SPEC — Stratégies des IA (Solar Conquest)

But : donner à chaque nation IA une **stratégie globale cohérente**, modulée par le contexte
(nombre d'adversaires, proximité, n° de tour). À implémenter dans le cerveau IA (`doAITurn`).
**Rien n'est codé pour l'instant** — ce document est la base de travail validée avec Marc.

---

## Décisions de cadrage (réponses de Marc)

1. **Où coder** : dans **les DEUX fichiers** — `solar_conquest_game.html` (desktop, source de vérité)
   ET `solar_conquest_small_screen.html` (mobile) — pour ne pas les faire diverger.
   → La logique IA doit rester identique entre les deux.
2. **Rythme** : tout d'un coup (pas de livraison morceau par morceau).
3. **Définition de la « proximité »** : basée sur la **distance entre les colonies existantes**
   et la **possibilité d'expansion** :
   - si **tous les nœuds colonisables proches sont déjà pris** → **cause de guerre** ;
   - si **un nœud proche colonisé bloque le passage** → **accord commercial** pour passer
     et aller coloniser plus loin.
4. **Validation** : OUI — équilibrage par **simulations en lot via `sim_4p.js`**
   (taux de victoire, scores moyens) avant de livrer.
5. **Spec d'abord** : ce document.

---

## Profils par civilisation

### 🟠 Jupitériens
- **Priorité absolue** : coloniser **autour de Jupiter** (nœuds joviens / stations orbitales)
  pour **verrouiller la zone** et empêcher les autres de s'y installer.
- Exploiter le passif (upgrade jovien gratuit en 🔬).
- Techs prioritaires : Mines & Énergie, Sciences.

### 🔴 Martiens & 🌍 Terriens (faible développement de départ)
- **Priorité** : coloniser + créer des **routes d'expansion** pour s'étendre.
- **Techs prioritaires** : celles qui **économisent sur les routes ou les colonies**
  (ex. Navigation `route_disc` = route à 0🪨, Expansion / Biosphère).
- **Attaquer** les nœuds qu'ils convoitent pour s'étendre (quand bloqués).

### ⚫ Ceinturiens
- **Tirage aléatoire** de tactique au début de partie :
  1. **Rush tech** : augmenter la 🔬 (science) d'abord, PUIS coloniser ;
  2. **Mixte** : mélange colonisation + tech dès le départ.
- Exploiter le passif raids (raid à 1 jeton + 1⚡).

### ☠️ Pirates (NPC)
- **Attaquer automatiquement les routes commerciales NON protégées** (routes sans jeton Force).
- (Comportement existant à conserver/renforcer ; cible = route non défendue.)

---

## Modulation selon le NOMBRE d'adversaires

- **2 nations** : pression de colonisation **moindre**, surtout si les deux bases sont **éloignées**.
  → La nation **priorise les TECH pendant les 2 premiers tours** pour compenser ses manques de ressources,
  avant de s'étendre.
- **3 nations** : **dépend de la proximité** des autres :
  - si **proches** → **rush colonies**, **raid & attaque** de la nation proche,
    OU **accord commercial** pour aller coloniser plus loin + routes ;
  - si éloignées → développement plus calme (tech puis expansion).
- **4 nations** : la **tension monte plus vite** → comportements plus agressifs/défensifs plus tôt.

---

## Règles de proximité / conflit (transversales)

- Calculer la proximité via la **distance entre colonies existantes** et les **nœuds d'expansion disponibles**.
- **Tous les nœuds proches colonisables sont pris** → **déclencher / privilégier la guerre**.
- **Un nœud proche bloque le passage** → **proposer un accord commercial** pour traverser,
  puis coloniser au-delà + établir des routes.

---

## Plan d'implémentation (pour plus tard)

1. Localiser `doAITurn` (et fonctions liées : colonisation IA, routes IA, achat tech IA, raids/guerre IA)
   dans les deux fichiers.
2. Introduire un **profil par civ** (poids de priorités) + une fonction de **contexte**
   (nb adversaires, proximité, tour) qui ajuste les poids.
3. Ajouter le **tirage de tactique** Ceinturiens (rush-tech / mixte) à l'init de partie.
4. Renforcer le comportement **Pirates** (cibler les routes non protégées).
5. **Tester en lot** avec `sim_4p.js` (N parties) → vérifier équilibre (victoires/scores),
   ajuster les poids, itérer.
6. Vérif Node/jsdom du fichier mobile (pas d'erreur, partie jouable de bout en bout).

---

## En attente (non tranché)
- **Cérès** : rendre la liaison Lune–Cérès **symétrique** (`ceres.conn` += `lune`) pour pouvoir
  créer/voir la route aussi depuis Cérès ? (micro-modif d'adjacence — à confirmer.)

_Dernière mise à jour : 2026-06-03._
