# Lot 18-1 — CE LOT EST EN **v11.53** · cache `sw.js` **v274** · 2026-10-05 — SERVEUR À REDÉPLOYER

(Seulement les fichiers changés depuis l'envoi v11.51. Détail : docs/REPRISE.md §219.)

- Réflexe « relier une colonie isolée » des IA : la route passe par la porte unique (vrai coût, jeton selon la règle, plus de jeton sous technologie immunisante, garnison préservée)
- Défense d'une IA assaillie par une autre IA : règle `defenseIA` (Navigation coût ÷2, croiseur réservé) au lieu de « tout ce qui est payable »
- Journal : plus de ligne « X cherche la paix avec Y » sans effet ; cible de contre-attaque = adversaire de guerre
- Nettoyage : constante inutile retirée, tirage des agendas des IA en une seule fonction (solo = en ligne)
- Banc test_agenda_secret.js adapté
- Appli (solo) : un coup d'ordinateur à 2-3 PA lui coûte autant de passages du tour de table qu'en ligne (dette comptée par la différence de PA)
- Appli (solo) : une erreur pendant le tour d'un ordinateur ne fige plus la partie — manche passée, ligne au journal, erreur dans le rapport de diagnostic
- Solo, joueur éliminé : les guerres IA–IA de fin de tour se jouent jusqu'au bout (comme en ligne) ; banc test_guerre_ia_ia_appli §9
- lang : clé journal.erreur_tour_ia (fr, en)
- Colonie isolée : l'ancienne décote −0,5×VP est retirée, seul le barème §208 (raccordement) compte
- v11.53 : but « expansion » des IA (E1) — dès le tour 6, prime sur coloniser un nœud raccordable et rentable et sur les routes qui raccordent une colonie isolée, à hauteur du déficit de colonies reliées (2 au T6, 3 au T7, 4 dès T8) ; rien avant le tour 6
- Bancs : test_expansion_ia.js (nouveau), sonde_partie_lente.js (observation tour par tour)
- Agenda secret des IA (E4) : tiré au hasard parmi les agendas atteignables (Hub jovien réservé aux Jupitériens), imposé ; dès le tour 5 une prime croissante sur l'état fait avancer l'agenda (un coup qui l'éloigne perd la prime, sans interdiction) ; le siège « joueur » tenu par l'ordinateur reçoit aussi un agenda
- Banc : test_agenda_ia.js (nouveau)
- Gouvernement (E3) : un PA permanent gagné par un civique est noté sur tous les tours restants (moins l'entretien de la forme, Démocratie) — les IA prennent le gouvernement tôt au lieu de jamais
- Banc : test_gouvernement_ia.js (nouveau)
- Agendas secrets revalorisés (Marc, 05/10) : Explorateur 12, Routes 6, Superpuissance 12 (au moins autant suffit), Armada 10, Gouvernance 8, Hub 6, Empire énergétique 10
- Opulence matérielle redéfinie : surproduction de matériaux pendant 4 tours de la partie → +10 VP
- Nouvel agenda Pacifiste (+12 VP) : aucune guerre déclenchée, aucun assaut, jamais refusé la paix, au moins un apaisement ; jamais tiré par un Conquérant
- Règles fr + en (§16) et textes anglais mis à jour ; banc test_agenda_pacifiste.js
