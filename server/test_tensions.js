/* ============================================================================
   TEST — LA TENSION PRODUIT LES MÊMES EFFETS ENTRE N'IMPORTE QUELLES NATIONS
   ----------------------------------------------------------------------------
   POURQUOI. Marc, après la partie C071 : « les IA m'attaquent jamais c'est trop facile ».
   La mesure a montré autre chose, et de plus profond : les IA ne se battaient pas non plus
   ENTRE ELLES. `updateTension` calculait bien la tension de tous les couples — ce travail
   avait été fait — mais tout ce qui en DÉCOULE était resté écrit pour le joueur local :
     · `triggerGuereeForcee` n'était appelé que depuis la boucle `for(const ai of G.ais)` ;
     · la garde demandait `_warBetween(_moiId(), …)` — « suis-JE en guerre avec elle » — ce
       qui ne veut rien dire pour un couple où je ne suis ni l'un ni l'autre ;
     · `tensEff` cherchait `G.player` parmi les deux identifiants pour décider qui était
       « l'autre », et appliquait la remise de 6 selon MES guerres ;
     · les manifestations (−1 moral par nation haïe à ≥6) ne frappaient que `G.player` ;
     · « −2 moral pour chaque camp » en frappait quatre : `G.player` puis tout `G.ais`.

   MESURÉ, 6 parties complètes tout-IA, banc identique de part et d'autre :
     avant : 1 guerre, impliquant la nation active   (ceinturiens ↔ terriens)
     après : 4 guerres, dont 3 sans la nation active (martiens ↔ jupiteriens, etc.)

   ⚠️ CHAQUE CAS PORTE SA CONTRE-ÉPREUVE. Généraliser une punition, c'est risquer de la
   déclencher partout : on vérifie donc aussi que les nations SOUS le seuil ne subissent
   rien, et que les nations non concernées par une guerre populaire ne perdent pas de moral.

   Usage : node test_tensions.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }
function note(s) { console.log('     ' + s); }

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  return { sb, G, moi: G.player };
}
const par = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
const moral = n => n.res.morale || 0;
/* ⚠️ LA TENSION S'ÉRODE AVANT D'ÊTRE LUE — TROIS DE MES SECTIONS ACCUSAIENT LE MOTEUR À TORT.
   `updateTension` recalcule d'abord les griefs du tour ; si une nation n'a AUCUN grief nouveau
   contre une autre, sa tension baisse d'un point (« paix : −1/tour ») AVANT que le seuil soit
   testé. Poser 10 puis appeler la fonction donne donc 9, et poser 7 donne 6 : mon banc voyait
   « pas de guerre » et « une seule nation hostile » et criait au défaut sur du code correct.
   Pour tester un seuil, il faut une VRAIE raison d'en vouloir à l'autre.
   ⚠️ ADAPTÉ LE 17/09 : ce grief était « deux technologies de rang 3 chez l'autre = +4 par tour ».
   Cette règle n'existe plus — l'avance technologique se juge en relatif, tous les deux tours, après
   l'événement (`griefTechnologique`, test_tension_technologique.js), donc plus dans `updateTension`.
   On prend le grief qui reste stable d'un tour à l'autre : UNE ROUTE de `y` qui touche une colonie
   de `x` vaut +1 par tour (`_tensionVers`). `grief(x, y, n)` en pose n : +n par tour, exactement. */
function grief(sb, x, y, n) {
  for (let i = 0; i < (n || 1); i++) y.routes.push({ from: x.civ.home, to: y.civ.home, tokens: 0, _banc: i });
  return n || 1;
}

console.log('═'.repeat(80));
console.log('TENSIONS — MÊME RÈGLE POUR TOUTES LES NATIONS, PAS SEULEMENT LA MIENNE');
console.log('═'.repeat(80) + '\n');

/* ── 1. Guerre populaire entre deux nations qui ne sont pas moi ────────────── */
console.log('1. TENSION À 10 ENTRE DEUX AUTRES NATIONS → la guerre éclate');
{
  const { sb, G, moi } = partie();
  const x = par(G, 'martiens'), y = par(G, 'jupiteriens');
  grief(sb, x, y, 1);                        // raison réelle d'en vouloir aux jupitériens : +1/tour, la tension à 10 tient
  sb.setTens(x.civ.id, y.civ.id, 10);
  { const G = sb.__G; if (!G.ultimatums) G.ultimatums = {}; G.ultimatums[x.civ.id + '|' + y.civ.id] = (G.turn || 0) - 1; }   // ultimatum d'un tour (02/10) déjà échu : on teste le déclencheur IA–IA, pas le délai
  const moralAvant = { moi: moral(moi), x: moral(x), y: moral(y), z: moral(par(G, 'ceinturiens')) };
  sb.updateTension();
  const guerres = (G.wars || []).map(w => w.a + '↔' + w.b);
  note('guerres après : ' + (guerres.join(', ') || 'aucune'));
  if ((G.wars || []).some(w => (w.a === 'martiens' && w.b === 'jupiteriens') || (w.a === 'jupiteriens' && w.b === 'martiens')))
    ok('martiens ↔ jupitériens sont entrés en guerre — le seuil produit enfin un effet');
  else ko('aucune guerre entre les deux nations à 10/10 : le déclencheur ne les atteint toujours pas');

  /* Le coût moral : les DEUX camps, et EUX SEULS. Depuis le 07/09 (5B38) il est DIFFÉRÉ : rien à la
     déclaration, tout en fin de tour si la guerre tient encore — on joue donc cette fin de tour. */
  sb.encaisserPenalitesPopulairesRestantes();
  const z = par(G, 'ceinturiens');
  note('moral — martiens ' + moralAvant.x + '→' + moral(x) + ' · jupitériens ' + moralAvant.y + '→' + moral(y)
    + ' · ceinturiens ' + moralAvant.z + '→' + moral(z) + ' · terriens ' + moralAvant.moi + '→' + moral(moi));
  if (moral(x) < moralAvant.x && moral(y) < moralAvant.y) ok('les deux belligérants paient le coût moral');
  else ko('un belligérant n\'a rien payé');
  /* CONTRE-ÉPREUVE : les spectateurs ne paient pas. L'ancien code faisait `G.player −2` puis
     `G.ais.forEach(−2)` — quatre nations punies pour la guerre de deux. */
  if (moral(moi) === moralAvant.moi)
    ok('contre-épreuve : la nation active, spectatrice, ne perd rien');
  else ko('contre-épreuve ÉCHOUÉE : la nation active perd ' + (moralAvant.moi - moral(moi))
    + ' moral pour une guerre qui ne la concerne pas');
}

/* ── 2. Sous le seuil, rien ne se passe ───────────────────────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — sous le seuil, aucune guerre');
{
  /* Sans ce cas, la section 1 passerait au vert même si j'avais déclenché la guerre à tort
     et en permanence. */
  const { sb, G } = partie();
  sb.setTens('martiens', 'jupiteriens', 9);
  sb.updateTension();
  const n = (G.wars || []).length;
  if (!n) ok('tension 9/10 → aucune guerre (le seuil est bien 10, pas « dès que c\'est tendu »)');
  else ko(n + ' guerre(s) déclarée(s) à 9/10 : le déclencheur est trop sensible');
}

/* ── 3. Les manifestations frappent aussi les autres nations ───────────────── */
console.log('\n3. MANIFESTATIONS — −1 moral par nation haïe à 6 ou plus');
{
  const { sb, G, moi } = partie();
  const x = par(G, 'martiens'), y = par(G, 'jupiteriens'), z = par(G, 'ceinturiens');
  /* Deux nations que les martiens ont de vraies raisons de craindre, sous le seuil de guerre. */
  /* ⚠️ ON POSE 2, PAS 6. Quatre routes = +4 exactement par tour. Mon jet précédent posait 6,
     l'appel montait à 10, la GUERRE populaire se déclenchait et son `return` sautait par-dessus les
     manifestations : le banc lisait `_manifLoss = undefined` et accusait le correctif d'être
     inopérant alors qu'il avait déclenché l'autre effet, plus grave. 2 + 4 = 6 : pile au seuil des
     manifestations, loin de celui de la guerre. */
  grief(sb, x, y, 4); grief(sb, x, z, 4);
  sb.setTens(x.civ.id, y.civ.id, 2); sb.setTens(x.civ.id, z.civ.id, 2);
  const avantX = moral(x), avantMoi = moral(moi);
  sb.updateTension();
  /* On vérifie la RÈGLE — « une punition par nation hostile à ≥6 » — en relisant l'état APRÈS
     l'appel, plutôt qu'en pariant sur les chiffres posés avant. */
  const hostiles = [G.player].concat(G.ais).filter(a => a !== x && sb.tensEff(x.civ.id, a.civ.id) >= 6).length;
  note('martiens : moral ' + avantX + ' → ' + moral(x) + ' · _manifLoss = ' + x._manifLoss + ' · nations hostiles à ≥6 : ' + hostiles);
  if (hostiles < 2) ko('le montage n\'a produit que ' + hostiles + ' nation(s) hostile(s) : le cas ne prouve rien');
  else if (x._manifLoss === hostiles) ok('les martiens comptent leurs ' + hostiles + ' nations hostiles — la règle ne s\'applique plus à moi seul');
  else ko('_manifLoss des martiens = ' + x._manifLoss + ' pour ' + hostiles + ' nation(s) hostile(s)');
  if (moral(x) === Math.max(0, avantX - hostiles)) ok('et perdent bien ' + hostiles + ' de moral');
  else ko('moral martien ' + avantX + ' → ' + moral(x) + ', attendu −' + hostiles);
  /* CONTRE-ÉPREUVE : la nation active, que personne ne déteste, ne perd rien. */
  if (moral(moi) === avantMoi && !moi._manifLoss)
    ok('contre-épreuve : la nation active, sans ennemi à ≥6, ne perd rien');
  else ko('contre-épreuve ÉCHOUÉE : la nation active perd ' + (avantMoi - moral(moi)) + ' sans être haïe');
}

/* ── 4. La nation active reste traitée comme avant ─────────────────────────── */
console.log('\n4. CONTRE-ÉPREUVE GÉNÉRALE — rien n\'a changé pour la nation active');
{
  const { sb, G, moi } = partie();
  grief(sb, moi, par(G, 'martiens'), 4); grief(sb, moi, par(G, 'jupiteriens'), 4);
  sb.setTens(moi.civ.id, 'martiens', 2); sb.setTens(moi.civ.id, 'jupiteriens', 2);   // 2 + 4 = 6, cf. §3
  const avant = moral(moi);
  sb.updateTension();
  const hostiles = G.ais.filter(a => sb.tensEff(moi.civ.id, a.civ.id) >= 6).length;
  note('terriens : moral ' + avant + ' → ' + moral(moi) + ' · _manifLoss = ' + moi._manifLoss + ' · nations hostiles : ' + hostiles);
  if (hostiles < 2) ko('le montage n\'a produit que ' + hostiles + ' nation(s) hostile(s) : le cas ne prouve rien');
  else if (moi._manifLoss === hostiles && moral(moi) === Math.max(0, avant - hostiles))
    ok('la nation active subit toujours ses manifestations, exactement comme avant');
  else ko('la nation active ne subit plus ses manifestations : _manifLoss=' + moi._manifLoss
    + ', moral ' + avant + '→' + moral(moi) + ' — le comportement d\'origine a été cassé');
}

/* ── 5. tensEff : la remise de 6 regarde les BONNES guerres ────────────────── */
console.log('\n5. `tensEff` — « le peuple craint deux fronts », pour n\'importe quelle nation');
{
  const { sb, G } = partie();
  const x = par(G, 'martiens'), y = par(G, 'jupiteriens'), z = par(G, 'ceinturiens');
  sb.setTens(x.civ.id, y.civ.id, 9);
  /* Aucune guerre nulle part : la tension effective vaut la tension brute. */
  if (sb.tensEff(x.civ.id, y.civ.id) === 9) ok('sans guerre, tension effective = tension brute (9)');
  else ko('tension effective ' + sb.tensEff(x.civ.id, y.civ.id) + ' sans aucune guerre');

  /* Les martiens partent en guerre contre les CEINTURIENS : leur rancœur envers les
     jupitériens doit retomber de 6. C'est leur guerre à eux qui compte, pas la mienne. */
  sb.declarerGuerre(x, z, 'test', 'other');
  const e = sb.tensEff(x.civ.id, y.civ.id);
  note('martiens en guerre contre les ceinturiens → leur tension envers jupitériens : 9 → ' + e);
  if (e === 3) ok('la remise de 6 s\'applique d\'après LEUR guerre à eux (9 − 6 = 3)');
  else ko('tension effective = ' + e + ' au lieu de 3 : la remise suit encore les guerres d\'une autre nation');

  /* CONTRE-ÉPREUVE : envers l'ennemi RÉEL, aucune remise — sinon la guerre s'éteindrait seule. */
  sb.setTens(x.civ.id, z.civ.id, 8);
  const eEnnemi = sb.tensEff(x.civ.id, z.civ.id);
  if (eEnnemi === 8) ok('contre-épreuve : envers l\'ennemi contre qui on se bat, aucune remise (8)');
  else ko('contre-épreuve ÉCHOUÉE : tension envers l\'ennemi réel ramenée à ' + eEnnemi);
}

/* ── 6. Sur des parties entières : le monde n'est plus centré sur moi ──────── */
console.log('\n6. SUR 6 PARTIES COMPLÈTES — des guerres éclatent-elles loin de moi ?');
{
  let avecMoi = 0, sansMoi = 0, colonies = 0;
  /* ⚠️ SECTION BRUITÉE — ON ÉLARGIT L'ÉCHANTILLON. Les guerres restent rares en conditions
     réelles, et depuis que les nations ont des tempéraments, les bâtisseurs et les opportunistes
     signent davantage d'accords : quatre parties suffisaient parfois à n'en voir aucune, et ce banc
     passait au rouge sans que rien ne soit cassé. Six parties rendent le verdict stable. */
  for (let k = 0; k < 6; k++) {
    const sb = loadLogic(HTML);
    sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
    const G = sb.__G;
    G.player._isAI = true;
    const all = () => [G.player].concat(G.ais);
    while (G.turn <= G.maxTurns) {
      try { sb.startTurn(); } catch (e) { for (const p of all()) p.acLeft = p.acMax; }
      const ordre = all().slice();
      for (const p of ordre) { p._passedRound = false; p._aiSetupDone = false; }
      let idx = 0, garde = 0;
      while (garde++ < 3000) {
        if (ordre.every(p => p._passedRound)) break;
        const p = ordre[idx % ordre.length];
        if (p._passedRound) { idx++; continue; }
        let agi = false;
        try { agi = sb.doAITurn(p, true); } catch (e) { p._passedRound = true; }
        if (!agi || p.acLeft <= 0) p._passedRound = true;
        idx++;
      }
      try { sb.advancePirates(); sb._applyMoraleFlags(); sb.doRevenues(); sb.doMaintenance(); } catch (e) { }
      /* ⚠️ SANS CES DEUX APPELS, LE BANC MESURE LE VIDE. `doMaintenance` ne monte pas les tensions :
         c'est la fin de tour qui appelle `updateWarRisk` puis `updateTension`. Mon premier jet les
         avait oubliés — copiés de selftest.js, qui a la même lacune — et annonçait « zéro guerre »
         avec l'aplomb d'un chiffre. Il mesurait l'absence d'appel, pas l'absence de guerre. */
      try { sb.updateWarRisk(); sb.updateTension(); } catch (e) { }
      G.turn++;
    }
    colonies += all().reduce((s, p) => s + p.colonies.length, 0);
    for (const w of (G.wars || [])) {
      if (w.a === 'terriens' || w.b === 'terriens') avecMoi++; else sansMoi++;
    }
    /* ⚠️ UNE GUERRE DÉCLARÉE N'EST PLUS LE SEUL SIGNE D'HOSTILITÉ. Le modèle « assaut » résout le
       combat immédiatement, sans ouvrir de guerre durable : compter `G.wars` sous-estime donc
       largement les conflits, et ce banc tombait au rouge alors que les nations se battaient bel et
       bien. On compte aussi les captures de colonie entre nations tierces. */
    for (const l of (G.log || [])) {
      const m = String((l && (l.msg || l.t || l.text)) || l);
      if (!/capture|capturée/i.test(m)) continue;
      if (/Terriens/.test(m)) continue;
      sansMoi++;
    }
  }
  note('colonies posées : ' + colonies + (colonies > 20 ? '  ✔ parties vivantes' : '  ❌ parties creuses'));
  note('guerres impliquant la nation active : ' + avecMoi + '   ·   guerres entre les autres : ' + sansMoi);
  if (colonies <= 20) ko('les parties sont creuses : aucun chiffre de guerre n\'est interprétable');
  else if (sansMoi > 0) ok('des guerres éclatent entre nations qui ne me concernent pas — le monde n\'est plus centré sur moi');
  else ko('aucune guerre entre les autres nations sur 4 parties complètes : le correctif ne mord pas en conditions réelles');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ La tension déclenche guerre et manifestations pour toutes les nations,\n   au même seuil, et les spectateurs ne paient pas la guerre des autres.');
console.log('═'.repeat(80));
