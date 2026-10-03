/* ============================================================================
   TEST — EXTRA-SOLAIRE : JAMAIS SUR UNE CAPITALE, ET L'OCCUPANT EST PRÉVENU ;
          UNE CARTE RÉPÉTABLE NE VAUT SON VP QU'UNE FOIS (Marc, 02/10)
   ----------------------------------------------------------------------------
   Partie Ceinturiens (02/10, v11.20) : les Terriens achètent Exploration Extra-Solaire au T8 ;
   Éris, Pluton et Triton sont tous à Marc, l'ordinateur prend le premier — ÉRIS, sa CAPITALE —
   en « accord forcé », et le journal ne le dit qu'en gris. Marc : « pas dingue qu'Éris puisse
   être partagée, on va supprimer ça ; surtout aucun message du jeu pour me le dire. »
   Et : les Jupitériens ont acheté deux fois Investissements militaires, comptée deux fois en VP —
   « une carte répétable ne vaut 1 VP qu'une fois ».

   CE QUE CE BANC VERROUILLE :
     §1 l'IA ne colonise jamais une capitale par l'Extra-Solaire : Éris exclue, Pluton (colonie
        ordinaire de Marc) prise en accord forcé — et Marc reçoit un AVIS ;
     §2 le joueur n'a pas non plus la capitale d'un autre dans ses choix ;
     §3 si les trois destinations sont des capitales/exclues : rien, et rien ne casse ;
     §4 une carte achetée deux fois ne compte qu'une fois dans « Cartes » (VP et détail).
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { Engine } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const eng = new Engine(HTML);
  const sb = eng.sb;
  sb.initGame('ceinturiens', ['terriens', 'martiens']);
  const G = sb.__G; G.turn = 8; G.phase = 'actions';
  const hum = G.player, ter = G.ais[0], mar = G.ais[1];
  hum._isAI = false; ter._isAI = true; mar._isAI = true;
  for (const p of [hum, ter, mar]) { p.res.materials = 20; p.res.energy = 20; p.res.science = 20; }
  const vus = [];
  sb.setDecisionSink(q => vus.push(q));
  return { eng, sb, G, hum, ter, mar, vus };
}

console.log('═'.repeat(84));
console.log('EXTRA-SOLAIRE — pas de capitale, occupant prévenu · carte répétable : 1 VP');
console.log('═'.repeat(84) + '\n');

console.log('§1 l\'IA achète l\'Extra-Solaire, Éris/Pluton/Triton à Marc (Éris = sa capitale)');
{
  const m = montage();
  m.hum.colonies.push({ nodeId: 'pluto', level: 1, connected: true }, { nodeId: 'triton', level: 2, connected: true });
  const c = vm.runInContext("CARDS_POOL.find(x=>x.spec==='extrasolar')", m.sb);
  // cinq technologies pour l'IA (condition du +8 et de la colonisation)
  m.ter.cards = [{ id: 'a', branch: 'x' }, { id: 'b', branch: 'x' }, { id: 'c', branch: 'x' }, { id: 'd', branch: 'x' }, { id: 'e', branch: 'x' }];
  m.sb.applyCard(c, m.ter);
  const chezTer = (m.ter.colonies || []).map(x => x.nodeId);
  note('colonies terriennes : ' + chezTer.join(', '));
  if (!chezTer.includes('eris')) ok('Éris (capitale) jamais prise'); else ko('Éris, capitale de Marc, colonisée par l\'IA');
  if (chezTer.includes('pluto') || chezTer.includes('triton')) ok('une colonie ordinaire de Marc est partagée (accord forcé)'); else ko('aucune destination prise alors que Pluton/Triton étaient possibles');
  const avis = m.vus.filter(q => q.notice && q.nation === m.hum.civ.id);
  if (avis.length) ok('Marc reçoit un avis : ' + JSON.stringify(avis[0]).replace(/\\/g, '').slice(0, 160)); else ko('aucun avis à l\'occupant');
}

console.log('\n§2 le joueur n\'a pas la capitale d\'un autre dans ses choix');
{
  const m = montage();
  // Marc est Ceinturien (capitale Éris) : on fait jouer un Terrien humain à la place
  m.sb._activateNation(m.ter); m.ter._isAI = false; m.hum._isAI = true;
  m.ter.cards = [{ id: 'a', branch: 'x' }, { id: 'b', branch: 'x' }, { id: 'c', branch: 'x' }, { id: 'd', branch: 'x' }, { id: 'e', branch: 'x' }];
  const c = vm.runInContext("CARDS_POOL.find(x=>x.spec==='extrasolar')", m.sb);
  m.sb.applyCard(c, m.ter);
  const cand = m.G._pendingExtraSolar || [];
  note('choix proposés : ' + cand.join(', '));
  if (!cand.includes('eris')) ok('Éris absente des choix'); else ko('Éris proposée au joueur');
  if (cand.includes('pluto') && cand.includes('triton')) ok('Pluton et Triton proposés'); else ko('Pluton/Triton manquent');
}

console.log('\n§3 rien de possible : rien ne casse');
{
  const m = montage();
  m.ter.colonies.push({ nodeId: 'pluto', level: 1, connected: true }, { nodeId: 'triton', level: 1, connected: true });
  m.ter.cards = [{ id: 'a', branch: 'x' }, { id: 'b', branch: 'x' }, { id: 'c', branch: 'x' }, { id: 'd', branch: 'x' }, { id: 'e', branch: 'x' }];
  const c = vm.runInContext("CARDS_POOL.find(x=>x.spec==='extrasolar')", m.sb);
  let err = null; try { m.sb.applyCard(c, m.ter); } catch (e) { err = e; }
  if (!err && !(m.ter.colonies || []).some(x => x.nodeId === 'eris')) ok('aucune colonie sur Éris, aucune erreur'); else ko('erreur ou Éris prise : ' + (err && err.message));
}

console.log('\n§4 une carte répétable achetée deux fois ne compte qu\'une fois');
{
  const m = montage();
  m.hum.cards = [{ id: 'invest_mil', name: 'Investissements militaires', vp: 1, tier: 1 }, { id: 'invest_mil', name: 'Investissements militaires', vp: 1, tier: 1 }, { id: 'cruiser', name: 'Supercroiseur', vp: 5, tier: 2 }];
  const v = m.sb.calcVP(m.hum);
  note('Cartes : ' + v.cardsVP + ' · lignes du détail : ' + (v.det && v.det.cartes ? v.det.cartes.length : '?'));
  if (v.cardsVP === 6) ok('6 VP (1 + 5), pas 7'); else ko('cartes VP = ' + v.cardsVP);
  if (v.det && v.det.cartes && v.det.cartes.length === 2) ok('deux lignes dans le détail'); else ko('détail : ' + (v.det && v.det.cartes ? v.det.cartes.length : '?') + ' ligne(s)');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); }
console.log('✅ Aucun écart'); process.exit(0);
