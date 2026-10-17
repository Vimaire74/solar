/* ============================================================================
   TEST — L'ESPIONNAGE : LA SÉLECTION COCHÉE EST-ELLE APPLIQUÉE ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie du 16/08 : « espionnage déconne à nouveau, ça dure jusqu'à la fin et je
   peux jamais choisir ». Son journal écrit HUIT fois, aux tours 3 à 10 :

       🕵️ 🟠 Jupitériens — espionnage reporté : la fenêtre reviendra à la fin du tour prochain.

   Cette ligne ne s'écrit qu'à UN endroit : quand une réponse est arrivée et qu'aucune option
   valide n'a pu en être tirée. Le clic partait donc bien, et se faisait rejeter — huit fois.

   CE QUE LE BANC REJOUE. Exactement la réponse que construit `online.js` quand on coche des cases :
   `{nation, branch, ids}`, où `nation|branch` vient de `categorieCle` et `ids` des valeurs des
   cases. Rien n'est deviné : on lit la charge utile envoyée au client et on répond avec.

   ⚠️ CHAQUE CAS PORTE SA CONTRE-ÉPREUVE. Un banc qui ne saurait dire « oui » à tout ne prouverait
   rien : on vérifie donc aussi qu'une sélection FORGÉE (une carte que la victime ne possède pas)
   est refusée, et que le vol ne se produit qu'une fois.

   Usage : node test_espionnage.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Une partie au tour 3, joueur espion, deux nations pourvues de technologies volables. */
function montage(tour) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  /* ⚠️ CE BANC MESURE LE CHEMIN EN LIGNE — la QUESTION posée au client. Depuis le 28/09, en solo
     local (aucun émetteur installé) `stEspionnage` n'émet plus de question : il ouvre la fenêtre du
     jeu (voir `test_espionnage_solo_fenetre.js`). Sans émetteur, ce banc ne mesurait plus rien
     (« aucune fenêtre posée au tour 3 ») — leçon de REPRISE §164.6 : un banc suit la règle qu'il mesure. */
  sb.setDecisionSink(function(){});
  const G = sb.__G;
  G.turn = tour || 3; G.phase = 'actions';
  const moi = G.player;
  moi._isAI = false;
  moi._inv1 = 'inv_esp'; moi._espFait = false; moi._espTour = null;
  /* On donne aux voisins de VRAIES cartes de branche : ce sont elles que l'espionnage copie. */
  const parBranche = vm.runInContext(
    'CARDS_POOL.filter(c=>c.branch).slice(0,40).map(c=>({id:c.id,branch:c.branch,name:c.name,emoji:c.emoji,tier:c.tier}))', sb);
  const groupes = {};
  for (const c of parBranche) (groupes[c.branch] = groupes[c.branch] || []).push(c);
  const grosses = Object.keys(groupes).filter(b => groupes[b].length >= 2);
  if (grosses.length < 1) return null;
  /* La victime reçoit une catégorie ENTIÈRE (au moins deux cartes) : c'est le cas qui permet de
     cocher plusieurs technologies, celui que Marc utilisait. */
  const victime = G.ais[0];
  for (const c of groupes[grosses[0]]) if (!victime.cards.some(x => x.id === c.id)) victime.cards.push(c);
  if (grosses[1]) for (const c of groupes[grosses[1]]) if (!G.ais[1].cards.some(x => x.id === c.id)) G.ais[1].cards.push(c);
  return { sb, G, moi, victime };
}

/* La question posée au joueur, telle que le client la reçoit. */
function question(sb) {
  const liste = (typeof sb.fluxQuestionsEnAttente === 'function') ? sb.fluxQuestionsEnAttente() : [];
  return liste.find(p => p.kind === 'espionage') || null;
}

/* ⚠️ CE QUE LE CLIENT ENVOIE A CHANGÉ LE 2026-08-25, ET C'EST LE CŒUR DU CORRECTIF.
   Marc : « pour l'espionnage, ça me donne jamais la tech espionnée… on a vu que pour la Télépathie
   ça marchait, applique la même chose. » La Télépathie renvoie UN identifiant tiré de la liste
   affichée, rien d'autre. L'espionnage renvoyait un triplet `{nation, branch, ids-de-cartes}` dont
   deux champs ne figuraient dans aucune liste proposée — donc que chaque maillon devait
   comprendre, et que l'assainisseur du serveur a fini par jeter.
   Il renvoie désormais `{ids:[identifiants d'OPTIONS]}`. Les deux fonctions ci-dessous construisent
   l'une la forme COURANTE, l'autre l'ANCIENNE : on veut prouver que la première marche et que la
   seconde est encore acceptée (clients en cache, parties reprises). */
function reponseOptions(payload, combien) {
  const opts = (payload && payload.options) || [];
  const blocs = new Map();
  for (const o of opts) {
    if (o.kind !== 'une' || !o.categorieCle) continue;
    if (!blocs.has(o.categorieCle)) blocs.set(o.categorieCle, []);
    blocs.get(o.categorieCle).push(o);
  }
  for (const [, techs] of blocs) {
    if (techs.length < (combien || 1)) continue;
    const pris = techs.slice(0, combien || 1);
    return { ids: pris.map(t => t.id), noms: pris.map(t => t.name), cartes: pris.map(t => t.ids[0]) };
  }
  return null;
}
/* La réponse que construisait online.js AVANT le 25/08 (cases cochées d'un bloc nation|catégorie). */
function reponseCochee(payload, combien) {
  const opts = (payload && payload.options) || [];
  const blocs = new Map();
  for (const o of opts) {
    if (o.kind !== 'une' || !o.categorieCle) continue;
    if (!blocs.has(o.categorieCle)) blocs.set(o.categorieCle, []);
    blocs.get(o.categorieCle).push(o);
  }
  for (const [cle, techs] of blocs) {
    if (techs.length < (combien || 1)) continue;
    const [nation, branch] = cle.split('|');          // ← exactement ce que fait le client
    return { nation, branch, ids: techs.slice(0, combien || 1).map(t => t.ids[0]),
             noms: techs.slice(0, combien || 1).map(t => t.name) };
  }
  return null;
}

console.log('═'.repeat(80));
console.log('ESPIONNAGE — LE CHOIX COCHÉ DOIT ÊTRE APPLIQUÉ, ET LA FENÊTRE DOIT SE FERMER');
console.log('═'.repeat(80) + '\n');

/* ── 1. Cocher deux technologies d'une même catégorie ─────────────────────── */
console.log('1. SÉLECTION À COCHER — deux technologies chez une même nation');
{
  const m = montage(3);
  if (!m) ko('montage impossible : aucune branche avec deux cartes dans le jeu');
  else {
    m.sb.stEspionnage();
    const q = question(m.sb);
    if (!q) ko('aucune fenêtre d\'espionnage posée au tour 3');
    else {
      const rep = reponseCochee(q.payload, 2);
      if (!rep) ko('la charge utile ne propose aucune catégorie à deux technologies : le cas ne peut pas être joué');
      else {
        note('réponse envoyée : nation=' + rep.nation + ' · branch=' + rep.branch + ' · ids=' + rep.ids.join(','));
        const avant = m.moi.cards.length;
        m.sb.resolveDecision(q.id, { nation: rep.nation, branch: rep.branch, ids: rep.ids });
        const gagnees = m.moi.cards.length - avant;
        note('cartes du joueur : ' + avant + ' → ' + m.moi.cards.length + ' · _espFait = ' + m.moi._espFait);
        const rejet = (m.G.log || []).some(l => String((l && l.msg) || l).includes('NON APPLIQUÉ'));
        if (rejet) ko('la sélection a été REJETÉE — c\'est le défaut vécu par Marc');
        else if (gagnees !== 2) ko('sélection acceptée mais ' + gagnees + ' technologie(s) volée(s) au lieu de 2');
        else ok('les deux technologies cochées sont copiées');
        if (!m.moi._espFait) ko('`_espFait` reste faux : la fenêtre reviendra au tour suivant');
        else ok('l\'espionnage est marqué comme utilisé — la fenêtre ne reviendra pas');
      }
    }
  }
}

/* ── 2. CONTRE-ÉPREUVE — une sélection forgée doit être refusée ───────────── */
console.log('\n2. CONTRE-ÉPREUVE — une carte que la victime ne possède pas');
{
  /* Sans ce cas, la section 1 passerait au vert même si le moteur acceptait n'importe quoi :
     un client bricolé pourrait alors réclamer toutes les cartes de la partie. */
  const m = montage(3);
  m.sb.stEspionnage();
  const q = question(m.sb);
  const rep = reponseCochee(q && q.payload, 1);
  if (!q || !rep) ko('montage inexploitable');
  else {
    const avant = m.moi.cards.length;
    m.sb.resolveDecision(q.id, { nation: rep.nation, branch: rep.branch, ids: ['carte_qui_n_existe_pas'] });
    if (m.moi.cards.length !== avant) ko('une carte inexistante a été accordée (' + (m.moi.cards.length - avant) + ')');
    else ok('sélection forgée refusée — le moteur ne fait pas confiance au client');
    if (m.moi._espFait) ko('l\'espionnage est marqué utilisé alors que rien n\'a été volé');
    else ok('l\'occasion n\'est pas consommée : la fenêtre reviendra, à juste titre');
  }
}

/* ── 3. La fenêtre ne survit pas à l'investissement ───────────────────────── */
console.log('\n3. BORNE DE FIN — la fenêtre ne doit plus s\'ouvrir après le tour 5');
{
  /* Journal de Marc : la fenêtre revient jusqu'au tour 10, alors que l'investissement Niv.1
     n'est actif que de T3 à T5 et que le journal annonce lui-même son expiration au tour 6. */
  let ouvertes = [];
  for (const tour of [3, 4, 5, 6, 7, 10]) {
    const m = montage(tour);
    try { m.sb.stEspionnage(); } catch (e) {}
    if (question(m.sb)) ouvertes.push(tour);
  }
  note('fenêtre ouverte aux tours : ' + (ouvertes.join(', ') || 'aucun'));
  const tardives = ouvertes.filter(t => t > 5);
  if (tardives.length) ko('la fenêtre s\'ouvre encore au(x) tour(s) ' + tardives.join(', ') + ' — après expiration');
  else ok('aucune fenêtre après le tour 5');
  /* CONTRE-ÉPREUVE : si elle ne s'ouvrait JAMAIS, le point ci-dessus serait vert pour rien. */
  if (!ouvertes.includes(3) || !ouvertes.includes(5)) ko('la fenêtre ne s\'ouvre pas aux tours 3 à 5 : l\'investissement est devenu inutile');
  else ok('contre-épreuve : elle s\'ouvre bien pendant T3→T5');
}

/* ── 4. Le PANNEAU DE REPLI — celui qui rejetait tout ─────────────────────── */
console.log('\n4. PANNEAU DE REPLI — une option choisie par son identifiant');
{
  /* Quand la modale à cases à cocher ne peut pas s'ouvrir (client resté en cache, fenêtre absente),
     `online.js` affiche une liste générique. Elle renvoyait `{branch:'expansion'}` : le nom de la
     filière. Le moteur, lui, cherche une OPTION par son identifiant. D'où huit rejets d'affilée
     dans le journal de Marc. On rejoue les deux formes. */
  const m = montage(3);
  m.sb.stEspionnage();
  const q = question(m.sb);
  const opts = (q && q.payload && q.payload.options) || [];
  const uneOpt = opts.find(o => o.kind === 'une');
  const laBranche = uneOpt && uneOpt.branch;
  if (!uneOpt) ko('aucune option unitaire dans la charge utile');
  else {
    const avant = m.moi.cards.length;
    m.sb.resolveDecision(q.id, { id: uneOpt.id });          // ← ce que le repli envoie DÉSORMAIS
    if (m.moi.cards.length > avant) ok('réponse `{id:…}` appliquée (' + uneOpt.name + ')');
    else ko('réponse `{id:…}` rejetée : le panneau de repli reste inutilisable');
  }
  /* CONTRE-ÉPREUVE : la forme fautive doit, elle, rester sans effet — sinon on n'aurait pas
     mesuré le bon défaut, et « ça marche » viendrait d'une tolérance qui accepte n'importe quoi. */
  const m2 = montage(3);
  m2.sb.stEspionnage();
  const q2 = question(m2.sb);
  const avant2 = m2.moi.cards.length;
  m2.sb.resolveDecision(q2.id, { branch: laBranche || 'expansion' });
  if (m2.moi.cards.length === avant2) ok('contre-épreuve : `{branch:…}` seul ne vole rien (il ne dit pas chez qui)');
  else ko('`{branch:…}` a volé quelque chose : le moteur devine une cible, ce qu\'il ne devrait pas');
}

/* ── 5. Les deux clients demandent-ils la même chose ? ────────────────────── */
console.log('\n5. COHÉRENCE — online.js, bot.js et driver.js doivent parler de `id`');
{
  /* Ce défaut n'était pas dans le moteur : il vivait dans la table de correspondance des clients,
     recopiée en quatre exemplaires. Deux disaient `id`, deux disaient `branch`. */
  const fs = require('fs');
  for (const f of ['../online.js', 'bot.js', 'driver.js']) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    const m = src.match(/'espionage'\s*(?:\?|===[^?]*\?)\s*'(\w+)'/);
    const cle = m ? m[1] : null;
    if (cle === 'id') ok(f.replace('../', '') + ' → `id`');
    else ko(f.replace('../', '') + ' → `' + (cle || 'introuvable') + '` au lieu de `id`');
  }
}


/* ── 6. LA CHAÎNE ENTIÈRE — écran, assainisseur du serveur, moteur ────────── */
console.log('\n6. BOUT EN BOUT — la technologie choisie arrive-t-elle VRAIMENT dans ma main ?');
{
  /* ⚠️ C'EST LE BANC QUI MANQUAIT, ET SON ABSENCE A COÛTÉ TROIS DIAGNOSTICS.
     Les cas 1 à 5 appellent `resolveDecision` directement : ils sautent l'assainisseur du serveur,
     c'est-à-dire précisément le maillon qui jetait la réponse de Marc. Un banc côté moteur pouvait
     donc rester vert pendant que le jeu, lui, ne volait rien.
     Ici on rejoue la chaîne complète : la charge utile part à l'écran, l'écran coche, la réponse
     traverse `assainirReponse()` — la vraie, extraite de `server.js` — puis revient au moteur. Et
     on ne se contente pas de « la sélection est acceptée » : on vérifie que la CARTE est dans la
     main de l'espion et que son effet est appliqué. C'est la plainte de Marc, mot pour mot :
     « je la choisis mais elle n'est pas à moi ». */
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').split('\n');
  const d = src.findIndex(l => l.startsWith('function assainirReponse('));
  let f = d + 1; while (f < src.length && src[f] !== '}') f++;
  const assainir = new Function(src.slice(d, f + 1).join('\n') + '\nreturn assainirReponse;')();

  const m = montage(3);
  if (!m) ko('montage impossible');
  else {
    m.sb.stEspionnage();
    const q = question(m.sb);
    if (!q) ko('aucune fenêtre d\'espionnage posée au tour 3');
    else {
      const rep = reponseOptions(q.payload, 2);
      if (!rep) ko('aucune catégorie à deux technologies dans la charge utile');
      else {
        const envoye = { ids: rep.ids };
        const recu = assainir(null, q, envoye);
        note('écran → ' + JSON.stringify(envoye));
        note('après l\'assainisseur du serveur → ' + JSON.stringify(recu));
        if (Array.isArray(recu.ids) && recu.ids.length === envoye.ids.length)
          ok('la réponse traverse le serveur sans perdre de champ');
        else ko('le serveur a mutilé la réponse : ' + JSON.stringify(recu) + ' — c\'est le défaut DF6A');

        const avantCartes = m.moi.cards.length;
        const avantRpt = JSON.stringify(m.moi.rpt || {});
        m.sb.resolveDecision(q.id, recu);
        const gagnees = m.moi.cards.filter(c => c.espCopy);
        note('cartes ' + avantCartes + ' → ' + m.moi.cards.length
          + ' · volées : ' + (gagnees.map(c => c.name).join(', ') || 'aucune'));
        if (gagnees.length === 2) ok('les DEUX technologies cochées sont dans ma main');
        else ko('j\'ai ' + gagnees.length + ' technologie(s) volée(s) au lieu de 2 — « je la choisis mais elle n\'est pas à moi »');
        /* On compare sur les IDENTIFIANTS de cartes, pas sur les noms : le nom d'une OPTION porte
           l'emoji (« 🏗️ Biosphère Autonome ») alors que la carte, elle, ne l'a pas dans `name`.
           Comparer des libellés d'écran à des données, c'est se donner un faux rouge. */
        for (let i = 0; i < rep.cartes.length; i++) {
          const cid = rep.cartes[i];
          if (gagnees.some(c => c.id === cid + '_esp')) ok('« ' + rep.noms[i] + ' » m\'appartient');
          else ko('« ' + rep.noms[i] + ' » a été cochée mais ne m\'appartient pas');
        }
        const apresRpt = JSON.stringify(m.moi.rpt || {});
        if (apresRpt !== avantRpt) ok('et leurs effets récurrents sont appliqués (revenus par tour modifiés)');
        else note('⚠️ aucun effet récurrent visible — normal si les cartes tirées n\'en portent pas');
      }
    }
  }
}

/* ── 7. CONTRE-ÉPREUVE — une option forgée ne donne rien, même bien formée ── */
console.log('\n7. CONTRE-ÉPREUVE — un identifiant d\'option inventé ne vole rien');
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').split('\n');
  const d = src.findIndex(l => l.startsWith('function assainirReponse('));
  let f = d + 1; while (f < src.length && src[f] !== '}') f++;
  const assainir = new Function(src.slice(d, f + 1).join('\n') + '\nreturn assainirReponse;')();
  const m = montage(3);
  if (!m) ko('montage impossible');
  else {
    m.sb.stEspionnage();
    const q = question(m.sb);
    if (!q) ko('aucune fenêtre');
    else {
      const recu = assainir(null, q, { ids: ['une:martiens:CARTE_QUI_NEXISTE_PAS'] });
      m.sb.resolveDecision(q.id, recu);
      const volees = m.moi.cards.filter(c => c.espCopy).length;
      note('option inventée → ' + JSON.stringify(recu) + ' · technologies volées : ' + volees);
      if (volees === 0) ok('rien n\'est volé : le client ne décide pas de ce qui existe');
      else ko(volees + ' technologie(s) volée(s) avec un identifiant inventé');
    }
  }
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); for (const e of ecarts) console.log('   · ' + e); process.exit(1); }
console.log('✔ Espionnage : la sélection cochée est appliquée, les faux refusés, la fenêtre bornée.');
