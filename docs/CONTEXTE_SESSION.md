# Contexte Solar Conquest — v6 (mai 2026)

## Le projet
Jeu de stratégie HTML single-file : **`solar_conquest_game.html`** (dans `/Desktop/star conquest/`).
Tour par tour, 10 tours. Thème : conquête du système solaire.
Inspiré de Through the Ages + Brass : Lancashire.

---

## Conventions
- **"mémorise"** = noter sans agir immédiatement.
- Toujours modifier directement le HTML, pas de nouveau fichier.
- JS vérifié avec `node -e "new Function(js)"` après chaque modif.

---

## Architecture du jeu

### Fichier unique
`solar_conquest_game.html` — HTML + CSS + JS.

### État global `G`
- `G.player` — joueur humain
- `G.ais[]` — tableau des IAs (refactoring multijoueur fait)
- `allPlayers()` = `[G.player, ...G.ais]`
- `G.turn` — tour actuel (1–10)
- `G.warRisk` — jauge 0–10
- `G.tensions{}` — par civ ID
- `G.playerTension`, `G.aiTension` — tension populaire
- `G.commercialAccords[]` — nodeIds partagés
- `G.branchTiers{}` — max tier acheté par branche (global)
- `G.techTaken` — Set des IDs de cartes achetées

### Fonctions clés
- `allPlayers()` → `[G.player, ...G.ais]`
- `hasSpec(p, s)` → vérifie `c.spec===s || c.spec2===s`
- `isTechAvailable(card, p)` → tier + prérequis T2 perso pour T3
- `isTechExclusive(card)` → T3 et génériques = 1 seul acheteur
- `applyCard(card, p)` → applique effets à l'achat
- `getEffCost(card, p)` → coût avec rabais civ
- `getCooldownTurn(p)` → G.turn+1 (fastCooldown) ou G.turn+2
- `doRevenues()` → revenus fin de tour
- `updateTension()` → tension populaire v6
- `calcVP(p)` → score estimé en temps réel

---

## Civs v6 — Ressources de départ

| Civ | ⚡ | 🪨 | 🔬 | ❤️ | Force | Home |
|---|---|---|---|---|---|---|
| 🌍 Terriens | 2 | 6 | 3 | 4 | 2 | lune |
| 🔴 Martiens | 4 | 4 | 2 | 3 | 4 | phobos |
| 🟠 Jupitériens | 5 | 2 | 3 | 3 | 4 | jorbital1 |
| ☠️ Ceinturiens | 6 | 4 | 1 | 2 | 5 | eris |

Passif Terriens : Moral ≥ **5** → +1 pt Gov/tour.
Bonus civ = branche avec −1🔬 : Terriens→spiritualite_nature, Martiens→expansion, Jupitériens→mines_energie, Ceinturiens→navigation.

---

## CARDS_POOL v6 — 21 cartes branches + génériques

### Expansion
- bio1 (T1) : col_e_disc — colo −1⚡
- bio2 (T2) : bio2_bonus — +1🪨/tour colonies, supprime malus moral
- terra3 (T3) : terra3 — +1🪨+1❤️/tour par colonie du joueur

### Navigation
- prop1 (T1) : route_disc — routes −1🪨
- nav2 (T2) : nav2_war — +2 jetons, guerre ÷2 coût
- hyper3 (T3) : route_force_free — +3 pts Gov, routes gratuites, +3 jetons

### IA & Renseignement
- drones1 (T1) : intel_1 — +1🔬/tour, raids subis −1
- reseau2 (T2) : intel_2 — +1🔬/tour, info nations
- iadef3 (T3) : ia_immune + storm_immune — +4 jetons, immunité raids/pirates

### Sciences Exp.
- quant1 (T1) : +2🔬/tour, −1⚡/tour
- robo2 (T2) : wormhole — colo non-adjacente 1×, +2 jetons
- extra3 (T3) : extrasolar + gas_unlock — +8VP si ≥5 tech, colo auto Éris/Pluton/Triton

### Spiritualité & Nature
- vegetal1 (T1) : +2❤️ immédiat, +1❤️/tour
- empathic2 (T2) : +2❤️/tour, +2 pts Gov
- eveil3 (T3) : colony_vp — +2🔬/tour, +1VP/colonie connectée (final)

### Mines & Énergie
- exploit1 (T1) : +2🪨/tour
- extract2 (T2) : +3⚡/tour
- dyson3 (T3) : dyson3 — +5⚡/tour, nations refusantes → guerre

### Empathes (débloquée par Union Sacrée)
- liens1 (T1) : empath_routes — routes sans jeton, +1⚡/2 routes, +2 combat
- comm2 (T2) : +2❤️/tour, +1🔬/tour
- tele3 (T3) : empath_tele — copie tech, +2 combat, −2❤️/tour si guerre, +3🔬/tour

---

## Investissements v6

### Niv.1 — Choix au T2, effet T3→T5 (turnsLeft=4)
| ID | Bénéfice | Contrepartie |
|---|---|---|
| inv_esp | Copie branche ennemie | +8 warRisk |
| inv_ind | 🪨 ×2 | −4❤️ |
| inv_rec | 🔬 ×2 | −3🪨 −1⚡ |
| inv_agr | +2❤️/tour | −3🪨 |
| inv_exp | 1 colo + 1 route gratuites | −2❤️ |

### Niv.2 — Fin T6, effet T7→T9 (turnsLeft=4)
| ID | Bénéfice | Contrepartie |
|---|---|---|
| inv2_war | fastCooldown (retour jetons en 1 tour) | −5🪨 |
| inv2_comfort | ❤️ gains ×2 | −2🪨 −2⚡ |
| inv2_colonies | Toutes colonies → nv.max, entretien gratuit | 🪨÷2 −3⚡ |
| inv2_union | Débloque Empathes (exclusivité 3 tours) | −4🪨 −2⚡ |

---

## Tension Populaire v6

Sources (par tour) :
- +2 par colonie partagée (Accord Commercial actif)
- +1 par route IA touchant une colonie joueur sans accord
- +1 par route partagée avec jeton de défense adverse
- +3 si nation dominante (≥+2 colonies connectées)
- +6 si nation suprême (≥+4 colonies connectées)
- +4 si adversaire a ≥2 techs T3 de plus
- +2 si raid subi (dans tryRaid/doRaid)
- −3 à la conclusion d'un Accord Commercial

Effets : ≥3 → −1❤️/tour | ≥6 → +1 warRisk/tour | =10 → guerre forcée

---

## Guerre v6

- Coût combat : 1🪨 + 1⚡ par jeton engagé (prélevé avant résolution)
- Durée : 2 tours
- Victoire combat : +2VP, adversaire −2 jetons −1❤️
- Défaite : −jetons engagés (moitié), −1❤️
- Victoire globale : +5VP. Défaite globale : −2❤️ + indemnité 3🪨 3⚡ 3🔬

---

## Agendas v6 — Sélection individuelle (secrète)

Chaque joueur choisit 1 agenda parmi 5 proposés aléatoirement. Chaque IA choisit indépendamment.
Score : `p.agenda.score(p)` uniquement (pas tous les agendas).

| ID | Nom | Condition | VP |
|---|---|---|---|
| ag1 | Explorateur | 5+ colonies connectées | +8 |
| ag2 | Maître des Routes | 4+ routes | +6 |
| ag3 | Superpuissance Tech. | Plus de cartes Tech que toute autre nation | +8 |
| ag4 | Armada Solaire | 10+ jetons Force | +8 |
| ag6 | Gouvernance Éclairée | Gov Nv.4 ET ❤️≥7 | +8 |
| ag8 | Hub Jovien | 3+ colonies joviennes | +8 |
| ag13 | Empire Énergétique | Toutes cartes tech rGain.energy>0 | +12 |
| ag14 | Opulence Matérielle | Toutes cartes tech rGain.materials>0 | +12 |

---

## Score v6

| Catégorie | Formule |
|---|---|
| Colonies | VP base × niveau × 1 (connectée) ou ×0.5 (isolée) |
| Routes | +1 VP par route |
| Cartes | VP inscrit (T1=1, T2=3, T3=5) |
| Bonus Tech | +0.5 VP par carte tech (arrondi bas) |
| Bonus rpt | Par ressource : rpt>5→+2VP, rpt>10→+5VP |
| Agendas | Agenda propre du joueur uniquement |
| Événements | VP temporaires guerre |
| Bonus spéciaux | extrasolar, colony_vp... |

Force militaire : **supprimée du score**.

---

## Pirates v6

Actifs seulement si aucun joueur/IA n'est Ceinturiens.
Probabiliste : 10% au T1, +10%/tour. Si attaque : colonie connectée aléatoire (hors base).
- Nv.2+ : rétrogradation −1. Nv.1 : −1❤️.
- Après attaque : +1 tension Ceinturiens (si IA) ou +1 warRisk.
- IA Défensive = immunité totale.

---

## Moral v6

- Moral = 0 : guerre civile, aucun revenu + acLeft = ⌊acMax÷2⌋
- Moral = 1 : revenus ÷2 ce tour

---

## Fichiers dans /Desktop/star conquest/

- `solar_conquest_game.html` — jeu complet v6
- `Regles_Solar_Conquest_v6.docx` — règles complètes v6 (style emoji cohérent)
- `CONTEXTE_SESSION.md` — ce fichier
- `NOTES_DESIGN.md` — notes de design et équilibrage
- `sim_4p.js` — simulateur Node.js 4 factions (à mettre à jour pour v6)
