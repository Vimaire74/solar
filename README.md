# Lot 18-28 — CE LOT EST EN **v11.79** · cache `sw.js` **v300** · 2026-10-24 — SERVEUR À REDÉPLOYER

- Jetons temporaires (Military Surge, renforts) engagés en premier ; ils disparaissent au lieu de partir en récupération
- Expiration : seuls les jetons temporaires encore inutilisés sont retirés (plus de jetons permanents perdus)
- Routes : un jeton temporaire ne peut pas être posé sur une route
- Guerre : refuser la paix n'ouvre plus d'assaut supplémentaire ; chaque camp a un seul combat de fin de tour
- Guerre : quand l'adversaire ne peut pas attaquer, une fenêtre le dit tout de suite
- Fenêtre de combat de fin de tour : titre « tu frappes en premier » / « à toi de frapper » au lieu de « Tour de guerre 2/2 »
- Prolifération pirate : « Impact négatif » pour la nation visée (au lieu de « Ta civilisation en bénéficie »)
- Traductions : « contre » (fenêtres de combat et de paix) et « (renseignement — exact) » traduits en anglais
- Rapports de diagnostic : plus de caractères abîmés (« �� ») à la réception par le serveur
- Rapport de partie : plus de « def / att / en » devant les noms de cartes, d'agendas et de tempéraments
- Journal : ligne « ↳ paie » sous les raids du joueur, avec les jetons Force
- Bancs du serveur : témoin v9.69 de nouveau trouvé ; nouveau banc test_jetons_temporaires.js
