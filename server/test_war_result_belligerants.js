/* ============================================================================
   TEST — LE RÉSULTAT D'UN COMBAT OU D'UNE PAIX NE VA QU'AUX DEUX CAMPS
   ----------------------------------------------------------------------------
   Marc, 997D (06/09) : « le message d'un combat perdu ou gagné est montré aux autres joueurs au
   lieu de seulement à toi ; il me montre aussi les paix conclues comme si c'était moi, pareil pour
   Laurent qui voit mes fenêtres. » La fenêtre `war_result` est écrite « tu » pour son propriétaire
   et le serveur la diffusait à toute la table (fenêtre collective depuis le 07/08).

   RÈGLES VERROUILLÉES ICI :
     1. le moteur nomme les deux camps dans la fenêtre (`payload.civs`) et qui parle (`ownerName`) ;
     2. le serveur (`sendWindowToAll`, lu dans server.js) ne l'envoie qu'aux sièges des deux camps :
        le tiers ne reçoit rien ;
     3. l'autre camp la reçoit avec le titre préfixé « Vu par <propriétaire> » ;
     4. CONTRE-ÉPREUVE — le bilan de fin de tour (`eot`) va toujours à tout le monde.

   Usage : node test_war_result_belligerants.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

console.log('═'.repeat(84));
console.log('RÉSULTAT DE GUERRE — AUX DEUX CAMPS, ET À EUX SEULS');
console.log('═'.repeat(84) + '\n');

/* ── 1. Le moteur nomme les camps ─────────────────────────────────────────── */
console.log('1. Assaut d\'un ordinateur sur Marc : la fenêtre de résultat nomme les deux camps');
let payloadMoteur = null;
{
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['jupiteriens', 'terriens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const marc = G.player, jup = G.ais[0], lau = G.ais[1];
  marc._isAI = false; jup._isAI = true; lau._isAI = false;
  for (const n of [marc, jup, lau]) { n.res.energy = 20; n.res.materials = 20; n.res.morale = 8; n.acLeft = 3; }
  jup.forceTokens = 4; marc.forceTokens = 6;
  marc.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  sb.setDecisionSink(function () {});
  G._pendings = [];
  sb.appliquerCoup(jup, { type: 'assaut', node: 'titan' });
  const q = (G._pendings || []).find(p => p.kind === 'defense');
  if (q) sb.resolveDecision(q.id, { tokens: 2, cruiser: false });
  const r = (G._pendings || []).find(p => p.kind === 'war_result');
  payloadMoteur = r && r.payload;
  note('fenêtre war_result : ' + (r ? ('chez ' + r.nation + ' · civs=' + JSON.stringify(payloadMoteur.civs) + ' · ownerName=' + payloadMoteur.ownerName) : 'absente'));
  if (r && Array.isArray(payloadMoteur.civs) && payloadMoteur.civs.includes('ceinturiens') && payloadMoteur.civs.includes('jupiteriens') && payloadMoteur.civs.length === 2)
    ok('les deux camps sont nommés : Ceinturiens et Jupitériens');
  else ko('les camps ne sont pas nommés');
  if (r && /Ceinturiens/.test(payloadMoteur.ownerName || '')) ok('et celui qui parle est nommé');
  else ko('ownerName absent');
}

/* ── 2 & 3 & 4. La diffusion du serveur, lue dans server.js ───────────────── */
console.log('\n2. `sendWindowToAll` (server.js) : le tiers ne reçoit rien, l\'autre camp lit « Vu par … »');
{
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const i = src.indexOf('function sendWindowToAll(');
  const j = src.indexOf('\n}\n', i);
  const fn = src.slice(i, j + 2);
  const envois = [];
  const sendTo = (ws, obj) => envois.push({ ws, obj });
  const sendWindowToAll = new Function('sendTo', fn + '\nreturn sendWindowToAll;')(sendTo);
  const g = { seats: [
    { civId: 'ceinturiens', ai: false, ws: 'ws-marc' },
    { civId: 'jupiteriens', ai: true, ws: null },
    { civId: 'terriens', ai: false, ws: 'ws-laurent' },
  ] };
  /* Cas 997D inversé pour la mesure : Marc parle, Laurent est tiers. Propriétaire = ceinturiens
     (il reçoit la sienne par la décision, pas ici). */
  sendWindowToAll(g, 'war_result', payloadMoteur || { title: 't', civs: ['ceinturiens', 'jupiteriens'], ownerName: '☠️ Ceinturiens' }, 'ceinturiens');
  note('envois : ' + envois.map(e => e.ws + ' ← ' + e.obj.kind).join(', ') + (envois.length ? '' : '(aucun)'));
  if (!envois.some(e => e.ws === 'ws-laurent')) ok('le tiers (Laurent) ne reçoit pas la fenêtre de Marc');
  else ko('Laurent reçoit encore la fenêtre de Marc (le défaut de 997D)');
  /* Guerre entre deux humains : l'autre camp la reçoit, préfixée. */
  envois.length = 0;
  sendWindowToAll(g, 'war_result', { title: '⚔️ Combat contre 🌍 Terriens', body: '…', civs: ['ceinturiens', 'terriens'], ownerName: '☠️ Ceinturiens' }, 'ceinturiens');
  const l = envois.find(e => e.ws === 'ws-laurent');
  note('Laurent (belligérant) reçoit : ' + (l ? l.obj.payload.title : 'rien'));
  if (l && /^👁️ Vu par ☠️ Ceinturiens — ⚔️ Combat/.test(l.obj.payload.title)) ok('l\'autre camp la reçoit, préfixée « Vu par ☠️ Ceinturiens »');
  else ko('l\'autre camp ne la reçoit pas, ou sans préfixe');
  if (!envois.some(e => e.ws === 'ws-marc')) ok('le propriétaire ne la reçoit pas deux fois');
  else ko('le propriétaire la reçoit en double');
  /* CONTRE-ÉPREUVE : le bilan va à tous. */
  envois.length = 0;
  sendWindowToAll(g, 'eot', { turn: 8, html: '<b>bilan</b>' }, 'ceinturiens');
  if (envois.some(e => e.ws === 'ws-laurent')) ok('CONTRE-ÉPREUVE : le bilan de fin de tour va toujours à tout le monde');
  else ko('le bilan n\'atteint plus Laurent');
}

/* ── 4. LA PAIX AUSSI (F04B, 07/09) — la réponse d'un humain arrive quand le pivot est un tiers */
console.log('\n4. Paix acceptée / refusée entre deux autres nations : la fenêtre va au proposant, pas au pivot');
{
  const montage = () => {
    const sb = loadLogic(HTML);
    sb.initGame('terriens', ['jupiteriens', 'ceinturiens']);
    const G = sb.__G; G.turn = 8; G.phase = 'actions';
    const [jup, marc] = G.ais; jup._isAI = true; marc._isAI = false; G.player._isAI = false;
    sb.setDecisionSink(function () {}); G._pendings = [];
    sb.declarerGuerre(jup, marc, 'test', 'ai'); G._pendings = [];
    return { sb, G, jup, marc };
  };
  const a = montage();
  a.sb._paixAppliquer(a.jup, a.marc, { materials: 2 });
  const wa = (a.G._pendings || []).find(p => p.kind === 'war_result');
  note('paix acceptée — pivot ' + a.G.player.civ.id + ' · fenêtre chez ' + (wa ? wa.nation + ' ' + JSON.stringify(wa.payload.civs) : 'personne'));
  if (wa && wa.nation === 'jupiteriens' && wa.payload.civs.includes('ceinturiens') && !wa.payload.civs.includes('terriens')) ok('« Paix acceptée » chez le proposant, adressée au couple');
  else ko('« Paix acceptée » chez « ' + (wa ? wa.nation : '—') + ' » civs ' + JSON.stringify(wa && wa.payload.civs));
  const lp = (a.G.log || []).find(l => /Paix conclue entre/.test(String(l.msg)));
  if (lp && lp.civ === 'jupiteriens') ok('la ligne « Paix conclue » est signée du proposant'); else ko('« Paix conclue » signée « ' + (lp ? lp.civ : '—') + ' »');
  /* Refus : par la réponse humaine rangée dans le flux. */
  const b = montage();
  const d = b.sb.fluxDonnees(); d.paixProposant = 'jupiteriens'; d.paixDestinataire = 'ceinturiens'; d.paixOffre = { materials: 0, energy: 0, science: 0 };
  b.sb.stPaixReponse({ id: 'no' });
  const wb = (b.G._pendings || []).find(p => p.kind === 'war_result');
  note('paix refusée — fenêtre chez ' + (wb ? wb.nation + ' ' + JSON.stringify(wb.payload.civs) : 'personne'));
  if (wb && wb.nation === 'jupiteriens' && wb.payload.civs.includes('ceinturiens') && !wb.payload.civs.includes('terriens')) ok('« Paix refusée » chez le proposant, adressée au couple');
  else ko('« Paix refusée » chez « ' + (wb ? wb.nation : '—') + ' »');
}

/* ── 5. LES TIERS SONT PRÉVENUS (Marc, 07/09) — guerre et paix entre deux autres nations */
console.log('\n5. Un tiers humain reçoit « X et Y sont en guerre », puis « X et Y ont fait la paix »');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['jupiteriens', 'ceinturiens', 'martiens']);
  const G = sb.__G; G.turn = 8; G.phase = 'actions';
  const [jup, marc, mars] = G.ais; jup._isAI = false; marc._isAI = false; mars._isAI = true; G.player._isAI = false;
  sb.setDecisionSink(function () {}); G._pendings = [];
  sb.declarerGuerre(jup, marc, 'Assaut surprise sur Titan !', 'other');
  const texte = p => String((p.payload.title || '') + ' ' + (p.payload.body || '')).replace(/<[^>]+>/g, '');
  const notes = (G._pendings || []).filter(p => p.kind === 'raid_hit');
  const tiers = notes.filter(p => p.nation === 'terriens' && /Guerre/.test(texte(p)));
  const chezBellig = notes.filter(p => (p.nation === 'jupiteriens' || p.nation === 'ceinturiens') && /sont en guerre/.test(texte(p)));
  const chezIA = notes.filter(p => p.nation === 'martiens');
  note('notice guerre — tiers humain : ' + tiers.length + ' · belligérants : ' + chezBellig.length + ' · IA : ' + chezIA.length);
  if (tiers.length === 1 && /Jupitériens/.test(texte(tiers[0])) && /Ceinturiens/.test(texte(tiers[0]))) ok('le tiers humain apprend qui est en guerre avec qui');
  else ko('notice de guerre chez le tiers : ' + tiers.length);
  if (!chezBellig.length) ok('les belligérants ne la reçoivent pas (ils ont leurs fenêtres)'); else ko('la notice de tiers part aussi chez un belligérant');
  if (!chezIA.length) ok('aucune notice chez une IA'); else ko('notice chez une IA');
  G._pendings = [];
  sb._paixAppliquer(jup, marc, { energy: 3 });
  const paix = (G._pendings || []).filter(p => p.kind === 'raid_hit' && p.nation === 'terriens' && /Paix/.test(texte(p)));
  note('notice paix — tiers humain : ' + paix.length + (paix[0] ? ' · « ' + texte(paix[0]).slice(0, 80) + ' »' : ''));
  if (paix.length === 1 && /ont fait la paix/.test(texte(paix[0]))) ok('… puis qu\'ils ont fait la paix'); else ko('notice de paix chez le tiers : ' + paix.length);
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Un résultat de guerre n\'appartient qu\'aux deux camps ; l\'autre sait qui parle.');
console.log('═'.repeat(84));
