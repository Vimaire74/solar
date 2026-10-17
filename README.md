# Lot 18-26 — CE LOT EST EN **v11.78** · cache `sw.js` **v299** · 2026-10-13 — SERVEUR À REDÉPLOYER

(Seulement les fichiers changés depuis la v11.77 — lot18-25. Détail : docs/REPRISE.md §247.)

- Nouvelle page d'accueil publique (index.html) : film, captures, quatre peuples, FR/EN, lien Google Play
- Le jeu s'appelle désormais play.html (ancien index.html)
- play.html protégé par un mot de passe des testeurs (acces.js) ; aucun effet dans l'appli Android
- Mot de passe vérifié par le serveur, à définir et changer dans /stats
- Connexions en ligne depuis le site refusées sans mot de passe ; rapports de bug de l'appli inchangés
- Dossier accueil/ : captures et emblèmes de la page d'accueil
- Serveur : Dockerfile et server.js lisent play.html
- sw.js, manifeste : play.html en page de jeu ; tutoriel « Vers le jeu » → play.html
- Bancs du serveur : index.html → play.html ; nouveau banc test_acces_site.js
