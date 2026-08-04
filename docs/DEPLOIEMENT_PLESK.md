# Déploiement du mode en ligne — Kreativmedia (Plesk, PHP + MySQL)

Objectif : mettre Solar Conquest en ligne sur `solar.guerir.ch` **sans Node** (l'hébergement ne le permet pas).
Modèle : un joueur « hôte » fait tourner le moteur dans son navigateur ; PHP + MySQL relaient l'état et les coups.

---

## 1. Créer la base de données (Plesk)

1. Dans Plesk → **Bases de données** → **Ajouter une base de données**.
2. Note bien : **nom de la base**, **utilisateur**, **mot de passe** (tu en auras besoin à l'étape 3).
3. Ouvre **phpMyAdmin** (bouton dans la même page) → onglet **Importer** → choisis le fichier `server/php/schema.sql` → **Exécuter**.
   - Ça crée les 5 tables : `users`, `games`, `game_players`, `game_state`, `game_inputs`.

## 2. Déposer les fichiers (FTP ou gestionnaire de fichiers Plesk)

Dans le dossier web de `solar.guerir.ch` (souvent `httpdocs/`), crée cette structure :

```
httpdocs/
├── carte.html              ← le jeu (renomme solar_conquest_carte.html en index.html si tu veux)
├── online.js               ← le client en ligne (server/php/online.js)
└── api/                     ← tout le dossier server/php/ SAUF schema.sql
    ├── db.php
    ├── config.php           ← À CRÉER (étape 3)
    ├── register.php login.php logout.php me.php
    ├── create_game.php join_game.php game_info.php start_game.php
    └── get_state.php put_state.php submit_input.php pull_inputs.php
```

> Mets les fichiers `.php` dans un sous-dossier `api/`. Le client les appellera en `api/login.php`, etc.

## 3. Configurer la connexion MySQL

1. Copie `config.sample.php` en **`config.php`** (dans `api/`).
2. Remplis avec les identifiants de l'étape 1 :
   ```php
   return [
     'db_host' => 'localhost',
     'db_name' => 'ta_base',
     'db_user' => 'ton_utilisateur',
     'db_pass' => 'ton_mot_de_passe',
     'db_charset' => 'utf8mb4',
   ];
   ```
3. `config.php` contient ton mot de passe → ne le partage pas.

## 4. HTTPS

Dans Plesk → **Certificats SSL/TLS** (la capture indiquait « la sécurité peut être améliorée ») → installe un certificat **Let's Encrypt** (gratuit) pour `solar.guerir.ch`, et force la redirection HTTPS. Les cookies de session et le jeu marcheront mieux en HTTPS.

## 5. Tester l'API (avant même le jeu)

Depuis ton navigateur, va sur `https://solar.guerir.ch/api/me.php` → tu dois voir `{"user":null}`. Si tu vois une erreur `config_manquante`, l'étape 3 n'est pas faite ; une erreur `db_indisponible` = identifiants MySQL faux.

Pour un test complet de l'inscription (avec un outil comme la console du navigateur) :
```js
fetch('api/register.php',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({username:'marc',password:'secret123'})}).then(r=>r.json()).then(console.log)
```
→ doit renvoyer `{ok:true, user:{...}}`.

## 6. Jouer

1. Ouvre `https://solar.guerir.ch/` → écran de connexion (online.js).
2. Crée un compte, puis **Créer une partie** → choisis les nations (humaines/IA), tu obtiens un **code**.
3. Envoie le code à tes amis : ils se connectent, **Rejoindre**, entrent le code.
4. Quand tout le monde est là, **Démarrer**. Toi (l'hôte) gardes l'onglet ouvert : ton navigateur fait tourner la partie.

## Notes / limites

- **L'hôte doit garder son onglet ouvert** pendant la partie (c'est lui l'autorité). L'état est sauvegardé en base à chaque tour, donc en cas de coupure on peut reprendre au dernier tour.
- Rythme : le jeu interroge le serveur toutes les ~2 s — imperceptible au tour par tour.
- **Cron de ménage (optionnel)** : pour purger les vieilles parties, on pourra ajouter une tâche planifiée Plesk appelant un `cleanup.php` (à faire plus tard si besoin).
- Pas de Node = pas de WebSocket : on utilise du polling HTTP, suffisant ici.
