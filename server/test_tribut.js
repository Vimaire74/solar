/* ============================================================================
   TEST — LE TRIBUT DE PAIX VAUT 3, ET ON N'ACHÈTE PAS LA PAIX AVEC RIEN
   ----------------------------------------------------------------------------
   Partie 3092 (Marc, 17/09) : guerre populaire Terriens → Martiens, « Exiger la paix ». Le journal
   écrit « 🔴 Martiens cède à la pression et achète la paix : tribut +0 matériaux +0 énergie » —
   les Martiens étaient à sec, et le tribut valait `min(2, ce qu'ils ont)` des deux côtés. « Il faut
   que ce soit minimum 3, soit énergie, soit matériel » (Marc). RÈGLE : exactement 3 unités, prises
   d'abord sur les matériaux et complétées en énergie ; en dessous de 3 au total, la nation ne peut
   PAS acheter la paix et la guerre continue. Même règle pour un adversaire humain, avec le montant
   recalculé au moment du versement.
   Usage : node test_tribut.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G; G.turn = 8; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  G.player.res = { energy: 5, materials: 5, science: 5, morale: 8 };
  G.player.forceTokens = 12;
  const par = id => [G.player, ...G.ais].find(p => p.civ.id === id);
  return { sb, G, moi: G.player, par };
}
function enGuerre(a) {
  a.sb.declarerGuerre(a.moi, a.par('martiens'), 'Guerre Populaire Forcée — test', 'other');
  a.G.warWith = 'martiens';
}
const journal = (G, n) => (G.log || []).slice(0, n).map(l => String(l.msg)).join(' | ');   /* le journal est rangé du plus récent au plus ancien */

console.log('§1 Une nation qui a de quoi payer verse 3 matériaux');
{
  const a = partie(); const mar = a.par('martiens');
  mar.res = { energy: 9, materials: 9, science: 0, morale: 5 }; mar.forceTokens = 2;
  enGuerre(a);
  a.sb.forcedWarDemandPeace();
  note('martiens : ' + mar.res.materials + '🪨 ' + mar.res.energy + '⚡ · moi : ' + a.moi.res.materials + '🪨 ' + a.moi.res.energy + '⚡');
  if (mar.res.materials === 6 && mar.res.energy === 9) ok('3🪨 prélevés, énergie intacte'); else ko('prélèvement : ' + mar.res.materials + '🪨 ' + mar.res.energy + '⚡ (attendu 6 et 9)');
  if (a.moi.res.materials === 8) ok('les 3🪨 arrivent chez le demandeur'); else ko('reçu : ' + a.moi.res.materials + '🪨 (attendu 8)');
  if (!a.sb._warBetween('terriens', 'martiens')) ok('la guerre s\'arrête'); else ko('la guerre continue malgré le tribut payé');
}

console.log('§2 Peu de matériaux : le reste est pris en énergie (1🪨 + 2⚡)');
{
  const a = partie(); const mar = a.par('martiens');
  mar.res = { energy: 6, materials: 1, science: 0, morale: 5 }; mar.forceTokens = 2;
  enGuerre(a);
  a.sb.forcedWarDemandPeace();
  if (mar.res.materials === 0 && mar.res.energy === 4) ok('1🪨 + 2⚡ prélevés'); else ko('prélèvement : ' + mar.res.materials + '🪨 ' + mar.res.energy + '⚡ (attendu 0 et 4)');
  if (a.moi.res.materials === 6 && a.moi.res.energy === 7) ok('le demandeur reçoit 1🪨 et 2⚡'); else ko('reçu : ' + a.moi.res.materials + '🪨 ' + a.moi.res.energy + '⚡');
}

console.log('§3 Le cas de la partie 3092 : à sec, elle NE PEUT PAS acheter la paix');
{
  const a = partie(); const mar = a.par('martiens');
  mar.res = { energy: 1, materials: 1, science: 9, morale: 5 }; mar.forceTokens = 2;
  enGuerre(a);
  a.sb.forcedWarDemandPeace();
  const j = journal(a.G, 3);
  note(j.slice(0, 150));
  if (mar.res.materials === 1 && mar.res.energy === 1) ok('rien n\'est prélevé'); else ko('des ressources ont été prises alors qu\'elle ne peut pas payer');
  if (a.sb._warBetween('terriens', 'martiens')) ok('la guerre continue'); else ko('la paix a été achetée avec moins de 3 — le défaut de la partie 3092');
  if (/pas de quoi payer|trop pauvre/.test(j)) ok('le journal dit pourquoi'); else ko('journal muet sur la raison');
  if (!/tribut \+0|tribut rien/.test(j)) ok('plus de « tribut +0 »'); else ko('le journal annonce encore un tribut vide');
}

console.log('§4 Une nation plus forte refuse, quelles que soient ses réserves');
{
  const a = partie(); const mar = a.par('martiens');
  mar.res = { energy: 20, materials: 20, science: 0, morale: 5 }; mar.forceTokens = 30;
  enGuerre(a);
  a.sb.forcedWarDemandPeace();
  if (mar.res.materials === 20 && a.sb._warBetween('terriens', 'martiens')) ok('elle refuse, rien n\'est pris'); else ko('la plus forte a cédé');
  if (/refuse de payer/.test(journal(a.G, 2))) ok('le journal le dit'); else ko('journal muet');
}

console.log('§5 Contre un HUMAIN : question posée, rien prélevé avant la réponse, 3 à l\'acceptation');
{
  const montage = () => {
    const a = partie(); const ami = a.par('martiens');
    ami._isAI = false; ami.res = { energy: 10, materials: 10, science: 0, morale: 5 }; ami.forceTokens = 2;
    a.sb.setDecisionSink(function () { }); a.G._pendings = [];
    enGuerre(a); a.G._pendings = [];
    a.sb.forcedWarDemandPeace();
    return { a, ami };
  };
  const x = montage();
  const q = (x.a.G._pendings || []).find(p => p.kind === 'peace_answer');
  if (q) ok('l\'humain reçoit la question'); else ko('pas de question à l\'humain');
  if (q && /3🪨/.test(String(q.payload.texte))) ok('la fenêtre annonce le montant exact (3🪨)'); else ko('montant absent de la fenêtre : ' + (q ? String(q.payload.texte).slice(0, 80) : '—'));
  if (x.ami.res.materials === 10) ok('rien n\'est prélevé avant sa réponse'); else ko('tribut prélevé d\'avance');
  if (q) x.a.sb.resolveDecision(q.id, { value: 'yes' });
  if (x.ami.res.materials === 7 && !x.a.sb._warBetween('terriens', 'martiens')) ok('il accepte : 3🪨 versés, la guerre s\'arrête'); else ko('acceptation : ' + x.ami.res.materials + '🪨, guerre ' + !!x.a.sb._warBetween('terriens', 'martiens'));
  const y = montage();
  const q2 = (y.a.G._pendings || []).find(p => p.kind === 'peace_answer');
  if (q2) y.a.sb.resolveDecision(q2.id, { value: 'no' });
  if (y.ami.res.materials === 10 && y.a.sb._warBetween('terriens', 'martiens')) ok('il refuse : rien payé, la guerre continue'); else ko('refus mal traité');
}

console.log('§6 Un humain ruiné entre la question et sa réponse ne paie pas la paix');
{
  const a = partie(); const ami = a.par('martiens');
  ami._isAI = false; ami.res = { energy: 10, materials: 10, science: 0, morale: 5 }; ami.forceTokens = 2;
  a.sb.setDecisionSink(function () { }); a.G._pendings = [];
  enGuerre(a); a.G._pendings = [];
  a.sb.forcedWarDemandPeace();
  const q = (a.G._pendings || []).find(p => p.kind === 'peace_answer');
  ami.res.materials = 1; ami.res.energy = 1;
  if (q) a.sb.resolveDecision(q.id, { value: 'yes' });
  if (a.sb._warBetween('terriens', 'martiens')) ok('la paix ne se fait pas : la guerre continue'); else ko('paix conclue avec moins de 3');
  if (ami.res.materials === 1 && ami.res.energy === 1) ok('rien n\'est prélevé'); else ko('prélèvement malgré tout');
}

console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ le tribut vaut 3, et une nation à sec ne peut pas acheter la paix');
process.exit(ecarts.length ? 1 : 0);
