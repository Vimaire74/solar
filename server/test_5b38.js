/* ============================================================================
   TEST — PARTIE 5B38 (07/09) : les six correctifs
   ----------------------------------------------------------------------------
   1. La copie par Télépathie compte comme possession : agenda « Empire Énergétique » rempli,
      et la carte copiée ne peut plus être rachetée.
   2. « Exiger la paix » (guerre populaire) contre un HUMAIN pose la question au lieu de lui
      prendre un tribut d'office.
   3. Guerre populaire suivie d'une paix immédiate : aucune pénalité de moral.
   4. Le coût de défense annoncé tient compte de l'IA de Navigation (journal + fenêtre).
   5. Union Sacrée : un humain n'est pas étiqueté « IA ».
   6. Une route ne compte (VP, revenus) que si ses deux bouts sont à soi, ou un bout libre.
   Usage : node test_5b38.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);
const vm = require('vm');
function partie(civs) {
  const sb = loadLogic(HTML);
  sb.initGame(civs[0], civs.slice(1));
  const G = sb.__G; G.turn = 6; G.phase = 'actions';
  const par = id => [G.player].concat(G.ais).find(p => p.civ.id === id);
  return { sb, G, par };
}
const carte = (sb, id) => vm.runInContext('CARDS_POOL', sb).find(c => c.id === id);

console.log('═'.repeat(80)); console.log('PARTIE 5B38 — SIX CORRECTIFS'); console.log('═'.repeat(80));

console.log('\n1. Télépathie : la copie compte pour l\'agenda, et interdit le rachat');
{
  const { sb, G, par } = partie(['ceinturiens', 'jupiteriens', 'martiens']);
  const moi = G.player, jup = par('jupiteriens');
  for (const id of ['exploit1', 'extract2']) moi.cards.push(carte(sb, id));
  jup.cards.push(carte(sb, 'dyson3'));
  moi.cards.push(vm.runInContext('CARDS_POOL', sb).find(c => c.spec === 'empath_tele'));
  G.branchTiers = G.branchTiers || {}; G.branchTiers.mines_energie = 2;   // branche ouverte jusqu'au rang 3
  const ag = vm.runInContext('AGENDAS_POOL', sb).find(a => a.id === 'ag13');
  const avant = ag.score(moi);
  const copie = sb.copieEmpathe(moi, 'dyson3');
  const apres = ag.score(moi);
  note('agenda avant copie : ' + avant + ' · après : ' + apres + ' · copie : ' + (copie ? copie.id : 'aucune'));
  if (avant === 0 && apres === 12) ok('Empire Énergétique passe à +12 avec la Sphère de Dyson copiée'); else ko('agenda ' + avant + ' → ' + apres);
  if (sb.possedeCarte(moi, 'dyson3')) ok('possedeCarte reconnaît la copie'); else ko('possedeCarte ignore la copie');
  moi.res.science = 30; moi.res.materials = 30; moi.res.energy = 30; moi.acLeft = 5;
  const n = moi.cards.length; const av = (G.log || []).length;
  sb.buyTech('dyson3');
  const lignes = (G.log || []).slice(0, (G.log || []).length - av).map(l => String(l.msg));
  if (moi.cards.length === n && lignes.some(t => /déjà cette carte|Carte déjà possédée/.test(t))) ok('le rachat de la carte copiée est refusé, et dit'); else ko('rachat accepté ou muet (cartes ' + n + ' → ' + moi.cards.length + ')');
}

console.log('\n2. « Exiger la paix » contre un humain : question posée, tribut seulement s\'il accepte');
{
  const montage = () => {
    const { sb, G, par } = partie(['martiens', 'jupiteriens', 'ceinturiens']);
    const moi = G.player, ami = par('ceinturiens'); ami._isAI = false; par('jupiteriens')._isAI = true;
    ami.res.materials = 10; ami.res.energy = 10; moi.res.materials = 5; moi.res.energy = 5; moi.forceTokens = 8; ami.forceTokens = 3;
    sb.setDecisionSink(function () {}); G._pendings = [];
    sb.declarerGuerre(moi, ami, 'Guerre Populaire Forcée — test', 'other'); G.warWith = 'ceinturiens'; G._pendings = [];
    sb.forcedWarDemandPeace();
    return { sb, G, moi, ami };
  };
  const a = montage();
  const q = (a.G._pendings || []).find(p => p.kind === 'peace_answer');
  note('question : ' + (q ? q.nation + ' · « ' + String(q.payload.title) + ' »' : 'aucune') + ' · 🪨 de l\'ami : ' + a.ami.res.materials);
  if (q && q.nation === 'ceinturiens') ok('l\'ami reçoit la question'); else ko('pas de question à l\'ami (tribut pris d\'office ?)');
  if (a.ami.res.materials === 10 && a.ami.res.energy === 10) ok('rien n\'est prélevé avant sa réponse'); else ko('tribut prélevé avant la réponse');
  if (q) a.sb.resolveDecision(q.id, { value: 'no' });
  if (a.sb._warBetween('martiens', 'ceinturiens') && a.ami.res.materials === 10) ok('il refuse : la guerre continue, rien payé'); else ko('refus : guerre ' + !!a.sb._warBetween('martiens', 'ceinturiens') + ', 🪨 ' + a.ami.res.materials);
  const b = montage();
  const q2 = (b.G._pendings || []).find(p => p.kind === 'peace_answer');
  if (q2) b.sb.resolveDecision(q2.id, { value: 'yes' });
  /* v10.70 (17/09) : le tribut vaut 3, pris d'abord sur les matériaux (voir test_tribut.js). */
  if (!b.sb._warBetween('martiens', 'ceinturiens') && b.ami.res.materials === 7 && b.moi.res.materials === 8) ok('il accepte : 3🪨 passent de lui à Marc, la guerre s\'arrête'); else ko('acceptation : guerre ' + !!b.sb._warBetween('martiens', 'ceinturiens') + ', ami 🪨 ' + b.ami.res.materials + ', Marc 🪨 ' + b.moi.res.materials);
  /* Contre-épreuve : contre un ordinateur, la règle d'avant tient (il cède s'il n'est pas plus fort). */
  const c = partie(['martiens', 'jupiteriens', 'ceinturiens']);
  const jup = c.par('jupiteriens'); jup._isAI = true; jup.res.materials = 10; jup.res.energy = 10; jup.forceTokens = 2; c.G.player.forceTokens = 8;
  c.sb.setDecisionSink(function () {}); c.G._pendings = [];
  c.sb.declarerGuerre(c.G.player, jup, 'test', 'other'); c.G.warWith = 'jupiteriens'; c.G._pendings = [];
  c.sb.forcedWarDemandPeace();
  if (!(c.G._pendings || []).some(p => p.kind === 'peace_answer') && jup.res.materials === 7) ok('contre-épreuve : un ordinateur cède sans question, comme avant (3🪨)'); else ko('contre-épreuve : ordinateur — fenêtre ' + (c.G._pendings || []).some(p => p.kind === 'peace_answer') + ', 🪨 ' + jup.res.materials);
}

console.log('\n3. Guerre populaire : pas de malus si la paix est faite sans combat ; malus dès qu\'elle a lieu');
{
  const { sb, G, par } = partie(['terriens', 'martiens', 'jupiteriens']);
  const x = par('martiens'), y = par('jupiteriens'); x.res.morale = 8; y.res.morale = 8;
  const w = sb.guerrePopulaireEntre(x, y);
  note('après déclaration — moral martiens ' + x.res.morale + ', jupitériens ' + y.res.morale + ' · différé : ' + !!(w && w.penalitesDifferees));
  if (w && x.res.morale === 8 && y.res.morale === 8) ok('à la déclaration, rien n\'est prélevé'); else ko('malus prélevés à la déclaration (' + x.res.morale + '/' + y.res.morale + ')');
  /* Paix le soir même : la guerre disparaît, la fin de tour ne trouve rien à encaisser. */
  const i = sb._warIndexBetween('martiens', 'jupiteriens'); if (i >= 0) G.wars.splice(i, 1);
  sb.encaisserPenalitesPopulairesRestantes();
  if (x.res.morale === 8 && y.res.morale === 8) ok('paix immédiate : aucun malus, pour aucun des deux'); else ko('malus malgré la paix immédiate');
  /* Contre-épreuve A : la guerre tient jusqu'à la fin du tour → SEUL le −2 populaire tombe.
     ⚠️ CHANGEMENT DE RÈGLE DU 16/09 (§134, décision de Marc) : l'usure de −4 ne se paie plus dans le
     tour de la déclaration, mais à l'OUVERTURE DU TOUR SUIVANT, et seulement si la guerre tient
     encore (`usureDesGuerres`, seul point de prélèvement). Ce banc attendait 2/2 = 8 − 4 − 2 ; il
     attend maintenant 6/6 en fin de tour, puis 2/2 au matin. Banc dédié : test_usure_tour_suivant.js */
  const w2 = sb.guerrePopulaireEntre(x, y);
  sb.encaisserPenalitesPopulairesRestantes(); sb.encaisserPenalitesPopulairesRestantes();
  note('guerre maintenue en fin de tour — moral martiens ' + x.res.morale + ', jupitériens ' + y.res.morale);
  if (x.res.morale === 6 && y.res.morale === 6) ok('guerre maintenue : −2 populaire seulement, une seule fois'); else ko('guerre maintenue : moral ' + x.res.morale + '/' + y.res.morale + ' (attendu 6/6)');
  { const av = x.res.morale; G.turn++; sb.usureDesGuerres();
    if (av - x.res.morale === 4) ok('… et l\'usure de −4 tombe à l\'ouverture du tour suivant (' + av + ' → ' + x.res.morale + ')');
    else ko('usure du tour suivant : −' + (av - x.res.morale) + ' au lieu de −4'); }
  /* Contre-épreuve B : un combat le jour même encaisse aussitôt, même si la paix suit. */
  const j = sb._warIndexBetween('martiens', 'jupiteriens'); if (j >= 0) G.wars.splice(j, 1);
  x.res.morale = 8; y.res.morale = 8;
  const w3 = sb.guerrePopulaireEntre(x, y);
  sb.noterAssautDuTour(w3, 'martiens');
  /* Idem : le combat déclenche le −2 populaire tout de suite ; l'usure, elle, attend le matin (§134). */
  if (x.res.morale === 6 && y.res.morale === 6) ok('un combat : le −2 populaire tombe tout de suite'); else ko('combat : moral ' + x.res.morale + '/' + y.res.morale + ' (attendu 6/6)');
}

console.log('\n4. Coût de défense annoncé = coût prélevé, IA de Navigation comprise');
{
  const { sb, G, par } = partie(['martiens', 'jupiteriens', 'ceinturiens']);
  const moi = G.player, jup = par('jupiteriens'); jup._isAI = true; moi._isAI = false;
  moi.cards.push(carte(sb, 'nav2')); moi.forceTokens = 20; moi.res.materials = 30; moi.res.energy = 30;
  jup.forceTokens = 8; jup.res.materials = 10; jup.res.energy = 10; jup.res.morale = 8; moi.res.morale = 8;
  sb.setDecisionSink(function () {}); G._pendings = [];
  sb.appliquerCoup(jup, { type: 'assaut', node: moi.civ.home });
  const q = (G._pendings || []).find(p => p.kind === 'defense');
  if (q && q.payload.navDemi) ok('la fenêtre annonce la remise (navDemi)'); else ko('fenêtre sans mention de la remise');
  const mAv = moi.res.materials, eAv = moi.res.energy, av = (G.log || []).length;
  if (q) sb.resolveDecision(q.id, { defTokens: 16, cruiser: false });
  const l = (G.log || []).slice(0, (G.log || []).length - av).map(x => String(x.msg).replace(/<[^>]+>/g, '')).find(t => /Défense : 16/.test(t)) || '—';
  note('journal : ' + l.slice(0, 90) + ' · prélevé : 🪨 ' + (mAv - moi.res.materials) + ' ⚡ ' + (eAv - moi.res.energy));
  if (/−8.*−8/.test(l) && (mAv - moi.res.materials) === 8) ok('« −8 −8 » annoncé, 8 et 8 prélevés'); else ko('annonce « ' + l.slice(0, 60) + ' » pour un prélèvement de ' + (mAv - moi.res.materials));
}

console.log('\n5. Union Sacrée : un humain n\'est pas « IA »');
{
  const { sb, G, par } = partie(['martiens', 'jupiteriens', 'ceinturiens']);
  const ami = par('ceinturiens'); ami._isAI = false; par('jupiteriens')._isAI = true;
  const inv = vm.runInContext('INVESTMENT_CARDS_2', sb).find(c => /Union Sacrée/.test(c.name));
  const av = (G.log || []).length;
  G.turn = 7; if (inv && inv.applyBenefit) { try { inv.applyBenefit(G, ami); } catch (e) { note('apply : ' + e.message); } }
  const l = (G.log || []).slice(0, (G.log || []).length - av).map(x => String(x.msg)).find(t => /Union Sacrée : branche/.test(t)) || '—';
  note(l.slice(0, 100));
  if (/Ceinturiens/.test(l) && !/IA \(/.test(l) && !/ordinateur/.test(l)) ok('l\'ami est nommé sans étiquette « IA »'); else ko('étiquette : ' + l.slice(0, 80));
}

console.log('\n6. Une route ne compte que si elle est à soi');
{
  const { sb, G, par } = partie(['martiens', 'jupiteriens', 'ceinturiens']);
  const moi = G.player, jup = par('jupiteriens');
  const home = moi.civ.home; const NODES = vm.runInContext('NODES', sb);
  const voisins = NODES[home].conn.filter(v => NODES[v] && !NODES[v].decorative && !NODES[v].noColonize);
  const libre = voisins[0], mienne = voisins[1], etrangere = voisins[2] || voisins[1];
  moi.colonies.push({ nodeId: mienne, level: 1, connected: true });
  jup.colonies.push({ nodeId: etrangere, level: 1, connected: true });
  moi.routes = [{ from: home, to: mienne, tokens: 0 }, { from: home, to: libre, tokens: 0 }, { from: home, to: etrangere, tokens: 0 }];
  const c = moi.routes.map(r => sb.routeCompte(moi, r));
  note('à soi ' + c[0] + ' · vers nœud libre ' + c[1] + ' · vers colonie étrangère ' + c[2] + ' (' + libre + ', ' + mienne + ', ' + etrangere + ')');
  if (c[0] && c[1] && !c[2]) ok('à soi et vers un nœud libre : oui ; vers une colonie étrangère : non'); else ko('routeCompte : ' + c.join(','));
  const v = sb.calcVP(moi);
  if (v.routeVP === 2) ok('VP de routes : 2 sur 3'); else ko('VP de routes : ' + v.routeVP);
  moi.res.energy = 10; moi.res.materials = 0;
  sb.doMaintenance();
  note('après entretien : ⚡ ' + moi.res.energy + ' · 🪨 ' + moi.res.materials);
  if (moi.res.energy <= 7 && moi.res.materials === 2) ok('entretien : 3⚡ payés pour trois routes, 2🪨 reçus (la route étrangère ne rapporte rien)'); else ko('entretien : ⚡ ' + moi.res.energy + ' 🪨 ' + moi.res.materials + ' (attendu ≤7 / 2)');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ 5B38 : les correctifs tiennent.'); console.log('═'.repeat(80));
