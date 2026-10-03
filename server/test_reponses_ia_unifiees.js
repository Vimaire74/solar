/* TEST — UNE SEULE COPIE DES RÉPONSES DES ORDINATEURS (03/10/2026)
   §1 le pilote du serveur rend exactement ce que rend le moteur (`_reponseSimulee`), question par question.
   §2 strategy_calm : la tension la plus forte (choix repris du serveur).
   §3 défense : calculée par `defenseIA` (le serveur répondait toujours 2), bornée par maxDef.
   §4 contre-épreuve : sans `_reponseSimulee` dans le moteur, l'ancienne copie répond encore. */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const d = new GameDriver(path.join(__dirname, '..', 'index.html'));
d.sb.initGame('terriens', ['martiens', 'jupiteriens']);
const G = d.sb.__G; const M = G.ais[0];
const Q = [
  { kind: 'peace_answer', nation: 'martiens', payload: {} },
  { kind: 'agenda', nation: 'martiens', payload: { options: [{ id: 'a1' }, { id: 'a2' }] } },
  { kind: 'strategy_calm', nation: 'martiens', payload: { options: [{ id: 'terriens', tension: 2 }, { id: 'jupiteriens', tension: 7 }] } },
  { kind: 'defense', nation: 'martiens', payload: { attacker: 'terriens', maxDef: 5, target: { node: M.civ.home } } },
  { kind: 'raid_target', nation: 'martiens', payload: { options: [{ id: 'x' }] } },
  { kind: 'inconnue', nation: 'martiens', payload: { options: [{ id: 'z' }] } },
];
console.log('§1 serveur = moteur');
for (const q of Q) { const a = JSON.stringify(d._reponseIA(q)), b = JSON.stringify(d.sb._reponseSimulee(q)); (a === b ? ok : ko)(q.kind + ' → ' + a + (a === b ? '' : ' ≠ ' + b)); }
console.log('§2 strategy_calm');
const sc = d._reponseIA(Q[2]); (sc.targetId === 'jupiteriens' ? ok : ko)('cible = tension la plus forte (' + sc.targetId + ')');
console.log('§3 défense');
const df = d._reponseIA(Q[3]); (typeof df.defTokens === 'number' && df.defTokens >= 0 && df.defTokens <= 5 ? ok : ko)('defTokens ' + df.defTokens + ' (borné par maxDef 5)');
console.log('§4 contre-épreuve');
const sauve = d.sb._reponseSimulee; d.sb._reponseSimulee = undefined;
const anc = d._reponseIA(Q[2]); (anc.targetId === 'jupiteriens' ? ok : ko)('ancienne copie encore active sans moteur récent');
d.sb._reponseSimulee = sauve;
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ test_reponses_ia_unifiees'); process.exit(ecarts.length ? 1 : 0);
