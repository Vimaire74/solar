/* ============================================================================
   TEST — L'ASSAUT D'UN ORDINATEUR SUR UN AUTRE SE RÉSOUT SUR-LE-CHAMP
   ----------------------------------------------------------------------------
   Marc, 05/09 : « les conquêtes doivent être réalisées immédiatement, sans message pour prévenir
   l'autre — même pour les IA entre elles ? » MESURÉ (`mesure_assaut_ia_ia.js`) : 5 fois sur 8,
   l'assaut d'une IA sur une autre IA ne produisait AUCUN combat — guerre déclarée, paix acceptée en
   fin de tour, l'assaut s'évaporait. C'est le journal de 083E (Jupitériens contre Martiens, trois
   tours de suite).

   CAUSE — HUITIÈME OCCURRENCE DU MOTIF §64. La résolution immédiate existait, mais enfermée dans
   `tryAssaultAI()`, fonction interne de `doAITurn` (l'enveloppe de l'ancien cerveau). Le tacticien,
   lui, applique `{type:'assaut'}` par `appliquerCoup` → `attackColony` → `playerAssaultColony` :
   le chemin HUMAIN, qui ouvre la guerre et remet le combat à la fenêtre de fin de tour. Et le
   correctif du 25/08 était écrit `if(best._isAI===false)` — pour la cible humaine seulement.

   LA PORTE UNIQUE : `resoudreAssautIA(ai, nodeId)`. Appelée par `attackColony` quand l'assaillant
   est un ordinateur, ET par l'ancien cerveau — une seule règle, deux appelants.

   RÈGLES VERROUILLÉES ICI :
     1. par le chemin du tacticien (`appliquerCoup`), l'assaut IA → IA livre le combat TOUT DE SUITE :
        capture si la force y est, dans le même appel, sans question en attente ;
     2. il coûte ce qu'il doit : les actions du barème de distance (§136), des jetons engagés
        (coût + récupération), et il fait monter la TENSION de l'assailli — sans ouvrir de guerre ;
     3. CONTRE-ÉPREUVE — devant une défense trop forte, l'IA RENONCE sans rien dépenser (ni AC, ni
        jeton) : la porte n'est pas un piège à jetons ;
     4. CONTRE-ÉPREUVE — cible humaine : la fenêtre de défense est posée à l'humain (pas de préavis,
        pas de combat sans lui) — le chemin du 25/08 est conservé, par la même porte ;
     5. CONTRE-ÉPREUVE — un assaillant HUMAIN n'est pas touché : son chemin (fenêtre de combat) reste
        celui d'avant ;
     6. UNE SEULE PORTE : le corps du combat IA → IA n'existe qu'une fois dans le moteur.

   Usage : node test_assaut_ia_ia.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const MOTEUR = path.join(__dirname, '..', 'moteur.js');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Jupitériens (IA, forts) contre Martiens (IA, faibles) — la paire de 083E — plus un humain
   (Terriens) pour les contre-épreuves. */
function montage(o) {
  o = o || {};
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['jupiteriens', 'martiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const hum = G.player, jup = G.ais[0], mar = G.ais[1];
  hum._isAI = false; jup._isAI = true; mar._isAI = true;
  jup.acLeft = 3; jup.forceTokens = (o.jetons === undefined ? 12 : o.jetons);
  jup.res.materials = 20; jup.res.energy = 20; jup.res.science = 5;
  /* ⚠️ Le moral compte : déclarer la guerre coûte −4 d'usure sur-le-champ, et une nation à 0 de
     moral « n'a pas les moyens d'attaquer » (`maybeAiAssaultPlayer`). Les Jupitériens partent à 3 :
     sans cette ligne, le point 3 mesurait une IA démoralisée, pas le chemin de l'assaut. */
  jup.res.morale = 8;
  mar.forceTokens = (o.defJetons === undefined ? 2 : o.defJetons);
  mar.res.materials = mar.forceTokens; mar.res.energy = mar.forceTokens;
  if (!mar.colonies.some(c => c.nodeId === 'titan')) mar.colonies.push({ nodeId: 'titan', level: 2, connected: true });
  jup.colonies.push({ nodeId: 'ganymede', level: 2, connected: true });
  hum.colonies.push({ nodeId: 'europe', level: 2, connected: true });
  hum.forceTokens = 3; hum.res.materials = 10; hum.res.energy = 10;
  sb.setDecisionSink(function () {});
  return { sb, G, hum, jup, mar };
}
const journal = (m, av) => (m.G.log || []).slice(0, Math.max(0, (m.G.log || []).length - av))
  .map(l => String((l && l.msg) || l).replace(/<[^>]+>/g, ''));

console.log('═'.repeat(84));
console.log('ASSAUT IA → IA — LE COMBAT A LIEU TOUT DE SUITE, PAR LA MÊME PORTE QUE L\'ANCIEN CERVEAU');
console.log('═'.repeat(84) + '\n');

/* ── 1 & 2. Le chemin du tacticien livre le combat ────────────────────────── */
console.log('1. Par `appliquerCoup`, une IA forte assaille une IA faible : capture immédiate');
{
  const m = montage();
  const av = (m.G.log || []).length;
  const ac = m.jup.acLeft, jet = m.jup.forceTokens;
  const guerreAvant = !!m.sb._warBetween('jupiteriens', 'martiens');
  m.G._pendings = [];
  const r = m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'titan' });
  const j = journal(m, av);
  const pris = m.jup.colonies.some(c => c.nodeId === 'titan') && !m.mar.colonies.some(c => c.nodeId === 'titan');
  /* ⚠️ UNE NOTICE N'EST PAS UNE QUESTION, et depuis §102 ter il en part une aux TIERS à chaque
     guerre (`annoncerAuxTiers` → `raid_hit`). Le pilote du vrai serveur les acquitte tout seul
     (`_isNotice`) : les compter comme des blocages faisait rougir ce banc pour un message
     d'information parfaitement voulu. On ne garde donc que ce qui attend vraiment une réponse. */
  const questions = (m.G._pendings || []).filter(p => p && !p.notice);
  const notices = (m.G._pendings || []).filter(p => p && p.notice);
  note('coup accepté : ' + r + ' · Titan capturée : ' + pris + ' · questions en attente : ' + questions.length
    + (notices.length ? ' (+ ' + notices.length + ' notice(s) : ' + notices.map(p => p.kind).join(', ') + ', acquittées par le pilote)' : ''));
  for (const t of j.filter(t => /vs|captur|repouss|GUERRE|renonce/i.test(t))) note('   ' + t.slice(0, 100));
  if (pris) ok('Titan change de mains dans le même appel — pas de fin de tour à attendre');
  else ko('Titan n\'est pas prise : l\'assaut n\'a pas livré le combat (le défaut de 083E)');
  if (!questions.length) ok('aucune question en attente : rien ne dépend d\'une fenêtre');
  else ko('une question reste en attente : ' + questions.map(p => p.kind).join(', '));
  /* ⚠️ ADAPTÉ LE 16/09, LA RÈGLE A CHANGÉ VOLONTAIREMENT (§136). L'assaut coûtait 1 action quelle
     que soit la distance ; il suit maintenant le temps de voyage (moins de 60 j → 1, 60–150 → 2,
     au-delà → 3). Ce chemin-ci, IA contre IA, était d'ailleurs le SEUL à ne pas l'appliquer : il
     payait encore 1 en dur, et `test_assaut_sans_guerre.js` §5 l'a montré. On n'écrit donc pas un
     nombre en dur ici non plus — on demande au moteur le prix de CE trajet, et on vérifie qu'il
     est prélevé. */
  const _coutAttendu = m.sb.coutAssautAC(m.jup, 'titan');
  if (m.jup.acLeft === ac - _coutAttendu) ok(_coutAttendu + ' AC dépensé(s) — le barème de distance');
  else ko('AC : ' + ac + ' → ' + m.jup.acLeft + ' (attendu −' + _coutAttendu + ')');
  if (m.jup.forceTokens < jet) ok('des jetons ont été engagés (' + jet + ' → ' + m.jup.forceTokens + ' en réserve)');
  else ko('aucun jeton engagé : le combat n\'a pas eu lieu');
  /* ⚠️ ADAPTÉ LE 16/09, LA RÈGLE A CHANGÉ VOLONTAIREMENT (§134 étape 3, volonté de Marc).
     CE BANC EXIGEAIT L'INVERSE DE CE QU'IL EXIGE AUJOURD'HUI, et il faut dire pourquoi. Le 05/09,
     la question était : « l'assaut d'une IA sur une IA livre-t-il le combat, ou s'évapore-t-il ? ».
     La réponse retenue alors — calquer le chemin humain, donc ouvrir la guerre dans l'assaut — a
     réglé ce défaut-là. Mais elle a aussi gravé une règle que Marc n'avait jamais voulue : il a
     découvert le 16/09 qu'attaquer déclarait la guerre, et a tranché : « tout passe par la tension.
     Si elle est à 10, c'est la guerre populaire forcée, mais EN FIN DE TOUR, pas immédiatement à
     l'attaque d'une colonie. »
     Ce qui est vérifié ici reste donc l'essentiel du 05/09 — LE COMBAT A LIEU TOUT DE SUITE (§1
     ci-dessus, inchangé) — et ce qui change est la conséquence : de la tension, pas une guerre.
     La guerre, elle, garde son banc : `test_assaut_sans_guerre.js` §7. */
  const _tens = m.sb.getTens(m.mar.civ.id, m.jup.civ.id);
  if (_tens === 8) ok('tension de l\'assailli portée à 8 — la colonie est tombée');
  else ko('tension ' + _tens + ' au lieu de 8 (colonie prise)');
  if (!m.sb._warBetween('jupiteriens', 'martiens')) ok('et aucune guerre ouverte : l\'assaut n\'est plus une déclaration');
  else ko('l\'assaut a ouvert une guerre — la règle de Marc est cassée');
}

/* ── 3. CONTRE-ÉPREUVE — défense trop forte : on renonce sans payer ────────── */
console.log('\n2. CONTRE-ÉPREUVE — défense trop forte : l\'IA renonce, sans dépenser AC ni jeton');
{
  /* 3 jetons dont 1 de garnison (Ganymède connectée) = 2 engageables. Depuis le 13/09 la garnison
     n'est plus engageable : avec 2 jetons bruts, l'assaut serait refusé à la porte (« besoin d'au
     moins 2 jetons engageables »), ce qui n'est plus le scénario « défense trop forte » testé ici. */
  const m = montage({ jetons: 3, defJetons: 8 });
  const ac = m.jup.acLeft, jet = m.jup.forceTokens, mat = m.jup.res.materials;
  const av = (m.G.log || []).length;
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'titan' });
  const j = journal(m, av);
  note('AC ' + ac + ' → ' + m.jup.acLeft + ' · jetons ' + jet + ' → ' + m.jup.forceTokens + ' · Titan martienne : ' + m.mar.colonies.some(c => c.nodeId === 'titan'));
  if (m.mar.colonies.some(c => c.nodeId === 'titan')) ok('Titan reste martienne');
  else ko('Titan prise avec 2 jetons contre 8 : l\'arithmétique est fausse');
  if (m.jup.acLeft === ac && m.jup.forceTokens === jet && m.jup.res.materials === mat) ok('renoncer ne coûte rien — ni AC, ni jeton, ni ressource');
  else ko('un assaut auquel on renonce a coûté quelque chose (AC ' + ac + '→' + m.jup.acLeft + ', jetons ' + jet + '→' + m.jup.forceTokens + ')');
  if (j.some(t => /renonce/i.test(t))) ok('et le journal dit pourquoi');
  else ko('aucune trace du renoncement dans le journal');
}

/* ── 4. CONTRE-ÉPREUVE — cible humaine : fenêtre de défense, pas de préavis ── */
console.log('\n3. CONTRE-ÉPREUVE — cible HUMAINE : la fenêtre de défense lui est posée, sans préavis');
{
  const m = montage();
  m.G._pendings = [];
  const av = (m.G.log || []).length;
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'europe' });
  const q = (m.G._pendings || []).find(p => p.kind === 'defense');
  const j = journal(m, av);
  note('question posée : ' + (q ? (q.kind + '@' + q.nation) : 'aucune'));
  if (q && q.nation === m.hum.civ.id) ok('l\'humain reçoit sa fenêtre de défense — il choisit ses jetons');
  else ko('pas de fenêtre de défense pour l\'humain assailli');
  if (!j.some(t => /prépare ta défense|marche sur/i.test(t))) ok('et aucun préavis dans le journal (règle du 25/08 conservée)');
  else ko('un préavis est réapparu');
  if (q) {
    m.sb.resolveDecision(q.id, { defTokens: 0, cruiser: false });
    const prise = m.jup.colonies.some(c => c.nodeId === 'europe');
    note('après la défense (0 jeton) : Europe jupitérienne = ' + prise);
    if (prise) ok('le combat se résout à la réponse, dans le même tour');
    else ko('la réponse de défense n\'a pas livré le combat');
  }
}

/* ── 5. CONTRE-ÉPREUVE — l'assaillant humain garde son chemin ─────────────── */
console.log('\n4. CONTRE-ÉPREUVE — un assaillant HUMAIN garde sa fenêtre de combat (chemin inchangé)');
{
  const m = montage();
  m.hum.forceTokens = 10;
  const av = (m.G.log || []).length;
  m.sb.appliquerCoup(m.hum, { type: 'assaut', node: 'titan' });
  const j = journal(m, av);
  note('Titan martienne : ' + m.mar.colonies.some(c => c.nodeId === 'titan') + ' · cible retenue pour la fenêtre : ' + (m.G._flux && m.G._flux.donnees && m.G._flux.donnees.assautCible));
  if (m.mar.colonies.some(c => c.nodeId === 'titan')) ok('rien n\'est résolu à sa place : l\'humain choisit ses jetons dans sa fenêtre');
  else ko('le combat de l\'humain a été résolu automatiquement — on a changé son chemin');
  if (m.G._flux && m.G._flux.donnees && m.G._flux.donnees.assautCible === 'titan') ok('sa cible est bien enregistrée pour la fenêtre de combat');
  else ko('cible de l\'humain perdue');
}

/* ── 6. UNE SEULE PORTE ────────────────────────────────────────────────────── */
console.log('\n5. Le combat IA → IA n\'est écrit qu\'une fois dans le moteur');
{
  const src = fs.readFileSync(MOTEUR, 'utf8');
  /* v10.78 : la ligne passe par J('journal.capture_vs_nv', …) — une clé, un seul corps. */
  const n = (src.match(/J\('journal\.capture_vs_nv'/g) || []).length;
  const appels = (src.match(/resoudreAssautIA\(/g) || []).length;
  note('corps du combat (ligne « capture … sur ») : ' + n + ' · appels à resoudreAssautIA : ' + appels);
  if (n === 1) ok('un seul corps de combat IA → IA');
  else ko(n + ' corps de combat : la règle vit à plusieurs endroits');
  if (appels >= 3) ok('la porte est appelée depuis les deux chemins (définition + ancien cerveau + attackColony)');
  else ko('resoudreAssautIA n\'est pas appelée depuis les deux chemins (' + appels + ' occurrences)');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Un ordinateur qui assaille un autre ordinateur frappe tout de suite — et par la même porte que tout le monde.');
console.log('═'.repeat(84));
