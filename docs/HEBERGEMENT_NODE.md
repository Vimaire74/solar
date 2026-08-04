# Hébergement backend Node (futur serveur autoritaire) — recherche 2026-07-06

> 🛑 **RECHERCHE HISTORIQUE (2026-07).** Hetzner était le 1er choix mais était en rupture de stock → **choix final = OVH VPS-1, en service**. État actuel : `docs/OVH_SETUP_JOURNAL.md`. Ce fichier est conservé comme trace de la comparaison des hébergeurs.

## ✅ DÉCISION MARC (2026-07-06) : cible = HETZNER
- Hébergeur retenu pour la future bascule : **Hetzner Cloud** (le moins cher, échelle complète chez
  un seul fournisseur : VPS → dédié → grappe + load balancer ; on ajoute des serveurs, on ne migre pas).
- **Données en Europe** voulu par Marc : épingler les serveurs en **Allemagne (Falkenstein/Nuremberg)
  ou Finlande (Helsinki)** → RGPD + souveraineté des données UE, hors juridiction US. (Hetzner a aussi
  USA/Singapour, à ne PAS utiliser pour rester UE.)
- Deux assurances anti-verrouillage / prêt-à-scaler à mettre dès le 1er jour du backend :
  (1) **Docker** (backend portable, pas de lock-in) ; (2) **état des parties dans la base/Redis**,
  jamais dans la mémoire d'un seul serveur (backend « sans mémoire » → scaling horizontal facile).
- Reste option B pour MAINTENANT (modèle hôte/PHP gratuit) ; Hetzner = quand Marc lance le vrai produit.


> Contexte : décision Marc = option B (garder le modèle hôte pour l'instant). Ce doc note les
> pistes d'hébergement pour la future bascule vers un backend Node autoritaire. Rien n'est acheté.

## ⚠️ Idée reçue à corriger
Apple et Google ne « valident » PAS un hébergeur. Ils examinent l'**APPLICATION**, pas où est
le backend. Pour passer les stores il faut surtout : **HTTPS/TLS** (App Transport Security côté
Apple), une politique de confidentialité, la suppression de compte, une gestion correcte des
données. → **N'importe quel hébergeur réputé avec HTTPS convient.** Le critère = fiabilité + prix.

## Recommandation
**1er choix — Hetzner Cloud (Allemagne/Finlande/USA)** : la référence prix/fiabilité chez les
techs. ~99,96 % d'uptime mesuré sur 12 mois, note 4,4/5 (VPSRated). Plans dès **~4 €/mois**
(cost-optimized) ; le « workhorse » CPX22 ~**8 €/mois**. Réseau EU excellent, 20 To de trafic inclus.
- Limites : pas de base de données managée (on gère Postgres/SQLite soi-même), pas de SLA formel
  côté cloud, écosystème plus « brut » → un peu de DevOps. **Coolify** (gratuit, à installer sur le
  VPS) donne du déploiement type Git + SSL auto + backups, ce qui gomme l'essentiel de cette friction.
- Idéal pour notre cas : jeu tour-par-tour, peu de joueurs → le plus petit plan suffit largement.

**Alternatives « zéro DevOps » (plus chères mais clé en main)** :
- **Render** : orienté fiabilité production, Postgres managé, WebSocket OK. ~7–25 $/mois. « Set and forget ».
- **Railway** : déploiement le plus rapide (push repo → URL), Postgres intégré, WebSocket OK. Un conteneur 1 vCPU/1 Go 24/7 ≈ 30 $/mois.
- **Fly.io** : déploiement « edge » mondial (Docker), bien pour joueurs multi-continents ; ~8–25 $/mois après la fin du palier gratuit.

## Synthèse pour Marc
- **Le moins cher + très réputé, un peu de setup** → **Hetzner (+ Coolify)** ~4–8 €/mois.
- **Le plus simple, un peu plus cher** → **Render** (ou Railway) ~7–25 $/mois.
- Pour démarrer le produit avec quelques joueurs : Hetzner petit plan = amplement suffisant.
- À faire au moment de la bascule : HTTPS/TLS obligatoire (Let's Encrypt gratuit), + politique de
  confidentialité et suppression de compte pour les stores.

## ✅ Vérifié sur les sites officiels (2026-07-06)
Nos besoins : Node long-running + WebSocket + une base + HTTPS + fiable + pas cher.
- **Hetzner Cloud** (VPS brut, root complet) : annonce désormais un **SLA 99,9 %** + support e-mail 24/7 + certifs **ISO 27001 / C5 / GDPR** ; **Coolify ET Docker en one-click app** (déploiement Git + SSL auto) ; datacenters DE/FI/**Singapour**/USA ; gros trafic inclus ; firewalls/réseaux privés/DNS gratuits. → couvre 100 % de nos besoins ; on installe Node + la base + TLS soi-même (Coolify enlève l'essentiel du boulot). Le moins cher.
- **Render** (PaaS managé) : **Web Service Node** déployé depuis Git en quelques clics ; **WebSockets supportés** (page doc dédiée) ; **Postgres managé** (backups, haute-dispo, pooling) + Key-Value type Redis ; **TLS gratuit auto** ; **palier gratuit** pour tester ; SSH, health checks, DDoS, conformité. → couvre 100 %, zéro admin serveur. Un peu plus cher à l'échelle.
- **Verdict** : pour un jeu tour-par-tour à quelques joueurs, les DEUX sont largement suffisants. Comme c'est MOI qui configure, le « DevOps » d'Hetzner n'est pas un frein pour toi.

## Sources
- Better Stack — Hetzner Cloud Review 2026
- VPSRated — Hetzner (4,4/5), pricing
- DevToolReviews / PkgPulse / TECHSY — Railway vs Render vs Fly.io 2026
- ExpressTech — alternatives Fly.io 2026 (fin du palier gratuit)
