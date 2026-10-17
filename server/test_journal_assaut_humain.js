/* ============================================================================
   TEST — LE RAPPORT DE PARTIE DOIT MONTRER LES ASSAUTS D'UN HUMAIN
   ----------------------------------------------------------------------------
   POURQUOI. Rapport de la partie 8280 (10/09), tour 10 : on y lit trois
   « Extraction d'He3 » de Marc et rien d'autre. Pourtant il a pris Éris, la
   capitale ceinturienne — le décompte final le crédite de « Capitale de
   Ceinturiens conquise : +10 » et d'un « Combat gagné ». Son assaut n'apparaît
   nulle part dans le déroulé.

   LA CAUSE. Le journal structuré (`G._journal`, celui que lit le rapport) est
   rempli par deux chemins : `addAction` pour un humain — qui sort d'office si
   l'acteur courant n'est pas `G.player` — et `_journalAdd` pour un ordinateur, à
   partir de `G.aiActions`. `playerAssaultColony` n'appelle NI l'un NI l'autre. Un
   assaut humain n'était donc jamais inscrit, ni depuis le plateau, ni depuis la
   fenêtre de guerre de fin de tour. On lisait un rapport qui laissait croire que
   Marc n'avait rien fait de son tour.

   CE QUI EST VÉRIFIÉ :
     1. un assaut lancé depuis le plateau est inscrit au nom de l'attaquant ;
     2. un combat de fin de tour (fenêtre de guerre, 0 AC) l'est aussi — c'est le
        cas exact de la 8280 ;
     3. CONTRE-ÉPREUVE — un assaut d'ORDINATEUR n'est pas inscrit deux fois : il a
        déjà son entrée par `G.aiActions`, et en ajouter une seconde ferait compter
        l'action en double dans le rapport et dans les bancs.

   Usage : node test_journal_assaut_humain.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { Engine, loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* ⚠️ `Engine.apply`, PAS `playerAssaultColony` tout seul, pour l'assaut du plateau :
   `playerAssaultColony` finit sur `_ouvrirFenetreAssaut`, qui est de l'AFFICHAGE — hors
   navigateur il n'émet rien du tout, et le combat n'a jamais lieu. C'est la couche d'actions
   du serveur qui enchaîne sur le choix des jetons. Mon premier montage mesurait donc un assaut
   qui ne s'était pas produit. */
function montage() {
  const eng = new Engine(HTML);
  const sb = eng.sb;
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  const moi = G.player;
  const cible = G.ais.find(a => a.civ.id === 'ceinturiens');
  const ia = G.ais.find(a => a.civ.id === 'jupiteriens');
  moi._isAI = false; cible._isAI = false; ia._isAI = true;
  G.turn = 9; G.phase = 'actions';
  moi.acLeft = 5; moi.forceTokens = 12; moi.res.materials = 15; moi.res.energy = 15;
  cible.forceTokens = 2; cible.res.materials = 4; cible.res.energy = 4;
  ia.forceTokens = 8; ia.res.materials = 10; ia.res.energy = 10;
  if (!cible.colonies.some(c => c.nodeId === 'titan')) cible.colonies.push({ nodeId: 'titan', level: 2, connected: true });
  const vus = [];
  sb.setDecisionSink(p => vus.push(p));
  return { eng, sb, G, moi, cible, ia, vus };
}
const entrees = (G, nat, motif) => (G._journal || [])
  .filter(e => e && e.nat === nat && motif.test(String(e.name || '')));

console.log('═'.repeat(80));
console.log('JOURNAL — LES ASSAUTS D\'UN HUMAIN DOIVENT FIGURER AU RAPPORT');
console.log('═'.repeat(80) + '\n');

/* ── 1. Assaut depuis le plateau ───────────────────────────────────────────── */
console.log('1. ASSAUT DEPUIS LE PLATEAU (1 AC)');
{
  const m = montage();
  m.eng.apply({ type: 'attack', node: 'titan', tokens: 4 });
  const def = m.vus.find(p => p.kind === 'defense');
  note('fenêtres émises : ' + (m.vus.map(p => p.kind).join(', ') || 'aucune'));
  if (def) m.sb.resolveDecision(def.id, { defTokens: 0 });
  const e = entrees(m.G, m.moi.civ.name, /Assaut sur/i);
  note('entrées « Assaut » au nom de ' + m.moi.civ.name + ' : ' + e.length
    + (e.length ? ' → ' + e.map(x => x.name + ' (' + (x.gain || '') + ')').join(' · ') : ''));
  if (e.length >= 1) ok('l\'assaut figure au rapport, au nom de l\'attaquant');
  else ko('l\'assaut n\'est inscrit nulle part : le rapport laisse croire qu\'il n\'a rien fait');
}

/* ── 2. Combat de fin de tour, par la fenêtre de guerre (0 AC) ─────────────── */
console.log('\n2. COMBAT DE FIN DE TOUR — la porte de la 8280');
{
  const m = montage();
  m.sb.declarerGuerre(m.moi, m.cible, 'banc', 'player');
  m.G.warWith = m.cible.civ.id;
  vm.runInContext('_warAttackColonyTarget="titan"', m.sb);
  const av = (m.G._journal || []).length;
  const res = m.sb.resolveWarCombat(5, m.moi);
  const e = entrees(m.G, m.moi.civ.name, /Assaut sur|Combat contre/i);
  note('puissances : ' + (res ? res.pPow + ' vs ' + res.aPow : '?')
    + ' · entrées ajoutées : ' + ((m.G._journal || []).length - av)
    + (e.length ? ' → ' + e.map(x => x.name + ' (' + (x.gain || '') + ')').join(' · ') : ''));
  if (e.length >= 1) ok('le combat de fin de tour figure au rapport');
  else ko('le combat de fin de tour n\'est inscrit nulle part — c\'est le trou de la 8280');
  if (e.some(x => x.war)) ok('… et il est marqué comme fait de guerre');
  else if (e.length) ko('inscrit, mais pas marqué « guerre » : il sortira du bon décompte');
}

/* ── 3. CONTRE-ÉPREUVE — l'ordinateur n'est pas inscrit deux fois ──────────── */
console.log('\n3. CONTRE-ÉPREUVE — un assaut d\'ordinateur reste inscrit UNE fois');
{
  const m = montage();
  m.ia.acLeft = 3;
  try { m.sb.appliquerCoup(m.ia, { type: 'assaut', node: 'titan' }); } catch (e) { note('appliquerCoup a levé : ' + e.message); }
  const j = entrees(m.G, m.ia.civ.name, /Assaut sur/i);
  const a = (m.G.aiActions || []).filter(x => x && /Assaut sur/i.test(String(x.name || '')));
  note('journal : ' + j.length + ' entrée(s) · aiActions : ' + a.length);
  if (j.length <= 1) ok('pas de doublon pour l\'ordinateur');
  else ko('l\'assaut de l\'ordinateur est inscrit ' + j.length + ' fois');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ Un rapport de partie montre ce que l\'humain a réellement fait.');
