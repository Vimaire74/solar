/* ============================================================================
   TEST — CE QUE VAUT UNE RESSOURCE AUX YEUX DE L'IA, ET LE MORAL PLAFONNÉ
   ----------------------------------------------------------------------------
   Règles de Marc, 04/09 :
     · « énergie première, science deuxième, matériaux troisième et moral dernière » — sur ce qu'on
       PRODUIT, pas sur ce qu'on garde (mesuré : compter l'énergie cher en stock faisait thésauriser
       l'IA, 40 % de colonisations en moins, 60,8 VP contre 89,4) ;
     · « multiplier par deux la pondération pour le manque jusqu'à ce qu'il n'y ait plus de danger » ;
     · « une fois qu'on a une production de +10 ça doit perdre la valeur, vrai pour toutes les
       ressources » ;
     · « la valeur thésaurisée de moral ne peut jamais dépasser 10, même pendant le tour ».

   Chaque point ci-dessous verrouille l'une de ces règles sur `evaluerPosition` / `plafonnerMoral`,
   avec sa contre-épreuve. Le gain de jeu, lui, est mesuré par `mesure_poids.js` (12 parties :
   7 victoires contre 4, VP 79,5 / 81,7 — neutre ; c'est le choix de conception de Marc).

   Usage : node test_poids_ressources.js
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

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 3; G.phase = 'actions';
  const moi = G.player;
  moi.res.materials = 8; moi.res.energy = 8; moi.res.science = 8; moi.res.morale = 8;
  moi.rpt = moi.rpt || {};
  return { sb, G, moi };
}
/* Note de position avec un revenu par tour AJOUTÉ sur une ressource (via `rpt`, lu par `revenusBruts`). */
function noteAvec(m, r, plus) {
  const av = m.moi.rpt[r] || 0;
  m.moi.rpt[r] = av + plus;
  const v = m.sb.evaluerPosition(m.moi);
  m.moi.rpt[r] = av;
  return v;
}

console.log('═'.repeat(84));
console.log('POIDS DES RESSOURCES ET MORAL PLAFONNÉ');
console.log('═'.repeat(84) + '\n');

/* ── 1. Ordre : énergie > savoir > matériaux > moral, sur la PRODUCTION ─────── */
console.log('1. +1 par tour d\'énergie vaut plus que +1 de savoir, qui vaut plus que +1 de matériaux, puis le moral');
{
  const m = montage();
  const base = m.sb.evaluerPosition(m.moi);
  const g = {};
  for (const r of ['energy', 'science', 'materials', 'morale']) g[r] = noteAvec(m, r, 1) - base;
  note(Object.keys(g).map(r => r + ' +' + g[r].toFixed(2)).join(' · '));
  if (g.energy > g.science && g.science > g.materials && g.materials > g.morale && g.morale >= 0) ok('l\'ordre demandé est respecté');
  else ko('ordre non respecté : ' + JSON.stringify(g));
}

/* ── 2. Le stock, lui, ne suit pas cet ordre — on ne thésaurise pas l'énergie ── */
console.log('\n2. CONTRE-ÉPREUVE — garder 1⚡ en stock ne vaut PAS plus que garder 1 savoir');
{
  /* Sans ce point, on « corrigerait » en comptant l'énergie cher partout — et l'IA cesserait de la
     dépenser. C'est exactement le défaut mesuré le 04/09. */
  const m = montage();
  const base = m.sb.evaluerPosition(m.moi);
  m.moi.res.energy += 1; const e = m.sb.evaluerPosition(m.moi) - base; m.moi.res.energy -= 1;
  m.moi.res.science += 1; const s = m.sb.evaluerPosition(m.moi) - base; m.moi.res.science -= 1;
  note('1⚡ en stock : +' + e.toFixed(3) + ' · 1 savoir en stock : +' + s.toFixed(3));
  if (e < s) ok('le stock d\'énergie vaut moins que le stock de savoir — pas de prime à thésauriser');
  else ko('l\'énergie en stock vaut ' + e.toFixed(3) + ' ≥ savoir ' + s.toFixed(3) + ' : l\'IA sera payée à la garder');
}

/* ── 3. Le manque double la valeur de la production ────────────────────────── */
console.log('\n3. En manque d\'énergie (≤ 3), +1⚡/tour vaut le DOUBLE');
{
  const m = montage();
  const gainAise = noteAvec(m, 'energy', 1) - m.sb.evaluerPosition(m.moi);
  m.moi.res.energy = 2;                     // en danger
  const gainManque = noteAvec(m, 'energy', 1) - m.sb.evaluerPosition(m.moi);
  note('à l\'aise : +' + gainAise.toFixed(2) + ' · en manque : +' + gainManque.toFixed(2) + ' (rapport ' + (gainManque / gainAise).toFixed(2) + ')');
  if (Math.abs(gainManque / gainAise - 2) < 0.01) ok('exactement ×2 sous le seuil de danger');
  else ko('rapport ' + (gainManque / gainAise).toFixed(2) + ' au lieu de 2');
  /* Et hors danger, plus de doublement (contre-épreuve). */
  m.moi.res.energy = 4;
  const gainSorti = noteAvec(m, 'energy', 1) - m.sb.evaluerPosition(m.moi);
  if (Math.abs(gainSorti - gainAise) < 0.001) ok('à 4⚡ le doublement cesse — « jusqu\'à ce qu\'il n\'y ait plus de danger »');
  else ko('le doublement persiste hors danger (' + gainSorti.toFixed(2) + ' contre ' + gainAise.toFixed(2) + ')');
}

/* ── 4. Au-delà de +10 par tour, une unité de plus vaut moins ──────────────── */
console.log('\n4. Au-delà de +10 par tour, la onzième unité vaut moins que la dixième — pour toute ressource');
{
  /* ⚠️ ON COMPARE 7→8 À 12→13, PAS 10→11. Le SCORE lui-même accorde des VP par paliers de revenu
     (« au-delà de 5/tour », « au-delà de 10/tour », `calcVP` → rptVP) : franchir 10 fait bondir la
     note pour une raison qui n'a rien à voir avec ce point. Mon premier jet mesurait 10→11 et
     lisait ce bond comme « la onzième unité vaut plein pot ». On se place de part et d'autre des
     paliers, dans des zones plates. */
  const m = montage();
  let tousOk = true;
  for (const r of ['energy', 'science', 'materials']) {
    const rev0 = (m.sb.revenusBruts(m.moi) || {})[r] || 0;
    const av = m.moi.rpt[r] || 0;
    const pose = tot => { m.moi.rpt[r] = av + (tot - rev0); return m.sb.evaluerPosition(m.moi); };
    /* Les paliers de VP se lisent sur `rpt` (cartes), pas sur le revenu total : on reste à rpt ≤ 5
       en dessous (rev0+1 → rev0+2) et à rpt > 10 au-dessus (13 → 14), sans franchir un palier. */
    const sous = pose(rev0 + 2) - pose(rev0 + 1), dessus = pose(14) - pose(13);
    m.moi.rpt[r] = av;
    note(r + ' : ' + (rev0 + 2) + 'ᵉ unité +' + sous.toFixed(2) + ' · 14ᵉ unité +' + dessus.toFixed(2));
    if (!(dessus < sous * 0.5 && dessus >= 0)) tousOk = false;
  }
  if (tousOk) ok('rendement décroissant au-delà de +10, sur les trois ressources');
  else ko('la production au-delà de +10 vaut encore plein pot');
}

/* ── 5. Le moral ne dépasse jamais son plafond, même en cours de tour ──────── */
console.log('\n5. Le moral est plafonné à tout instant (10, ou le plafond du gouvernement)');
{
  const m = montage();
  m.moi.res.morale = 10; m.moi.res.materials = 20; m.moi.res.science = 20; m.moi.res.energy = 20; m.moi.acLeft = 3;
  m.sb.buyTech('vegetal1', m.moi);          // +2 moral immédiat
  note('Végétalisation (+2) achetée à 10 de moral → ' + m.moi.res.morale);
  if (m.moi.res.morale === 10) ok('le +2 reçu à 10 est perdu, pas thésaurisé');
  else ko('moral à ' + m.moi.res.morale + ' en cours de tour');
  /* Plafond du gouvernement : Tyrannie 6. */
  m.moi.govFormMoraleCap = 6; m.moi.res.morale = 9;
  m.sb.plafonnerMoral();
  if (m.moi.res.morale === 6) ok('sous Tyrannie, ramené à 6');
  else ko('plafond de gouvernement ignoré (' + m.moi.res.morale + ')');
  /* Et il ne touche pas un moral SOUS le plafond (contre-épreuve). */
  m.moi.res.morale = 4; m.sb.plafonnerMoral();
  if (m.moi.res.morale === 4) ok('un moral sous le plafond n\'est pas touché');
  else ko('un moral de 4 a été modifié (' + m.moi.res.morale + ')');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Énergie > savoir > matériaux > moral sur la production, rien de plus sur le stock,');
console.log('   ×2 en manque, rendement décroissant au-delà de +10, moral plafonné à tout instant.');
console.log('═'.repeat(84));
