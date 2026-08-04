# Solar Conquest — Notes de Design & État du Projet (v6)

## État actuel
- **`solar_conquest_game.html`** : jeu **v6** complet, fonctionnel
- **`Regles_Solar_Conquest_v6.docx`** : règles v6 (style emoji cohérent)
- **`sim_4p.js`** : simulateur 4 factions (à jour v6)
- **`CONTEXTE_SESSION.md`** : contexte technique complet

---

## Le jeu en bref
- Humain vs 1–3 IAs, 10 tours, fichier HTML unique
- Carte SVG système solaire, 4 panneaux navigables (◀ ▶)
- Zone tech en bas, redimensionnable par drag

---

## Civilisations v6

| Civ | ⚡ | 🪨 | 🔬 | ❤️ | Force | Branche bonus | Base |
|---|---|---|---|---|---|---|---|
| 🌍 Terriens | 2 | 6 | 3 | 4 | 2 | Spiritualité & Nature | Lune |
| 🔴 Martiens | 4 | 4 | 2 | 3 | 4 | Expansion | Phobos |
| 🟠 Jupitériens | 5 | 2 | 3 | 3 | 4 | Mines & Énergie | J-α (orbital) |
| ☠️ Pirates | 6 | 4 | 1 | 2 | 5 | Navigation & Moteurs | Éris |

Passif Terriens : Moral ≥ 5 → +1 pt Gov/tour.

---

## Ressources
- ⚡ Énergie, 🪨 Matériaux, 🔬 Savoir, ❤️ Moral
- Plafonds : 12 pour ⚡ et 🪨 ; 8 pour 🔬 et ❤️

### Effets Moral v6
- Moral = 0 → guerre civile : aucun revenu + acLeft = ⌊acMax÷2⌋
- Moral = 1 → revenus ÷2 ce tour

---

## Arbre Tech v6 — 7 branches × 3 tiers

Déblocage **global partagé**. T3 coûte 2 AC. Chaque carte exclusive (1 acheteur max).

### Branches
| Branche | T1 | T2 | T3 |
|---|---|---|---|
| 🏗️ Expansion | Biosphère Autonome | Biosphère Avancée | Terraformation |
| ⚗️ Navigation | Propulsion Ionique | IA de Navigation | Hyperpropulsion |
| 🔍 IA & Renseignement | Drones Surveillance | Réseau Orbital | IA Défensive |
| 🧪 Sciences Exp. | Ordinateur Quantique | Robotisation Avancée | Exploration Extra-Solaire |
| 🕊️ Spiritualité | Végétalisation | Réseau Empathique | Éveil Collectif |
| ⛏️ Mines & Énergie | Exploitations Astéroïdes | Extracteurs Solaires | Sphère de Dyson |
| 🔮 Empathes* | Liens Empathes | Communications Instantanées | Télépathie |

*Empathes débloquée par Investissement Niv.2 « Union Sacrée »

---

## Investissements v6

### Niv.1 — Choix T2, effet T3→T5
- 🕵️ Espionnage, 🏭 Industrialisation, 🔬 Recherche Intensive, 🌾 Agriculture Durable, 🚀 Expansion Rapide

### Niv.2 — Fin T6, effet T7→T9
- ⚔️ Stratégie Guerrière (fastCooldown), 🕊️ Confort, 🏗️ Colonies Avancées, 🔮 Union Sacrée

---

## Tension Populaire v6

Accumulation par tour par paire de nations. Sources :
- +2 colonie partagée | +1 route adversaire sur colonie | +1 route défendue partagée
- +3 nation dominante (≥+2 colonies) | +6 nation suprême (≥+4 colonies)
- +4 si ≥2 techs T3 d'avance | +2 si raid subi
- −3 à la conclusion d'un Accord Commercial

Effets : ≥3 → −1❤️/tour | ≥6 → +1 warRisk/tour | =10 → guerre forcée

---

## Guerre v6

- Coût combat : 1🪨 + 1⚡ par jeton engagé (prélevé avant résolution)
- Durée 2 tours. Victoire combat : +2VP. Défaite : −jetons/2.
- Victoire globale : +5VP. Défaite globale : −2❤️ + indemnité.

---

## Agendas v6 — Individuels et secrets

| Agenda | Condition | VP |
|---|---|---|
| 🚀 Explorateur | 5+ colonies connectées | +8 |
| 🛤️ Maître des Routes | 4+ routes | +6 |
| ⚗️ Superpuissance Tech. | Plus de cartes Tech que toute autre nation | +8 |
| ⚔️ Armada Solaire | 10+ jetons Force | +8 |
| 🏛️ Gouvernance Éclairée | Gov Nv.4 ET ❤️≥7 | +8 |
| 🟠 Hub Jovien | 3+ colonies joviennes | +8 |
| ⚡ Empire Énergétique | Toutes cartes tech rGain.energy>0 | +12 |
| 🪨 Opulence Matérielle | Toutes cartes tech rGain.materials>0 | +12 |

---

## Score v6

| Catégorie | Formule |
|---|---|
| Colonies | VP base × niveau × 1 ou ×0.5 (isolée) |
| Routes | +1 VP/route |
| Cartes | VP inscrit sur la carte |
| Bonus Tech | +0.5 VP/carte tech (arrondi bas) |
| Bonus rpt | Par ressource : rpt>5→+2VP, rpt>10→+5VP |
| Agenda | Score de l'agenda propre uniquement |
| Force militaire | **Supprimé** |

---

## Pirates v6

NPC actifs seulement si aucun joueur/IA n'est Ceinturiens.
- Probabilité : 10% T1, +10%/tour
- Cible : colonie connectée aléatoire (hors base)
- Nv.2+ : rétrogradation. Nv.1 : −1❤️
- Immunité : carte IA Défensive

---

## Observations d'équilibre (post-simulations v5)

- Victoire joueur trop facile → IA passive, bonus colonisation précoce trop forts
- IA ne bloque pas efficacement les routes ni ne priorise les agendas
- Ceinturiens très forts en early (raids), faibles en late (peu de colonies)
- Jupitériens solides grâce aux stations orbitales mais manquent de 🪨 en départ v6
- Score moyen 35–45 VP sur 10 tours (référence simulation v5)

---

## À tester en v6
- Impact du coût combat 1🪨+1⚡ sur l'agressivité des parties
- Agendas Empire Énergétique / Opulence Matérielle — trop difficiles à compléter ?
- Équilibre des ressources de départ Jupitériens (5⚡ 2🪨 — fragile en T1)
- Tension populaire v6 — monte-t-elle trop vite ?
