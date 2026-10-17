/* ============================================================================
   MESURE — QUI SE BAT VRAIMENT, ET QUE CROIT LE MOTEUR ?
   ----------------------------------------------------------------------------
   CE FICHIER NE CORRIGE RIEN. Il prépare le plus gros chantier restant de la
   « maladie de perspective » : `resolveWarCombat`, 115 lignes, 21 lectures de la nation
   active, 5 appelants.

   LA QUESTION À TRANCHER AVANT DE TOUCHER QUOI QUE CE SOIT. Ces 21 lectures peuvent être
   deux choses très différentes :
     · soit `resolveWarCombat` est la SEULE résolution de combat du jeu, et alors toute
       guerre entre deux autres nations est déjà résolue de travers — défaut grave ;
     · soit les combats qui ne me concernent pas passent ailleurs, et alors ces 21 lectures
       sont justes aujourd'hui et ne deviendront fausses qu'avec un deuxième humain — dette,
       pas incendie.
   On ne peut pas le savoir en lisant : il y a cinq appelants et plusieurs chemins d'IA.
   On instrumente donc le moteur et on FAIT JOUER des parties.

   ⚠️ CE QUE `G.warWins` RACONTE. C'est un objet `{player, ai}` : la structure de données
   elle-même ne connaît que deux camps, « moi » et « l'autre ». À quatre nations, deux
   guerres simultanées écrivent dans le même compteur. La mesure le vérifie plutôt que de
   le supposer.

   Usage : node mesure_guerre_perspective.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

console.log('═'.repeat(84));
console.log('GUERRE — QUI SE BAT, ET PAR QUEL CHEMIN LE MOTEUR LE RÉSOUT-IL ?');
console.log('═'.repeat(84));

/* ── Une partie tout-IA, entièrement instrumentée ─────────────────────────── */
function partieInstrumentee(nbTours) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  /* La nation active est pilotée par l'IA comme les autres : « l'IA est une nation comme une
     autre » (principe posé par Marc). Sans cela, la partie s'arrête à la première question. */
  G.player._isAI = true;

  /* On enveloppe les fonctions de combat pour SAVOIR qui les appelle et avec quoi.
     On ne modifie aucun comportement : chaque enveloppe rappelle l'originale. */
  const journal = { resolveWarCombat: [], aiAssault: [], guerres: new Set(), warWins: [] };
  vm.runInContext(`
    (function(){
      var _rwc = resolveWarCombat;
      resolveWarCombat = function(c){
        var e = G.warWith || null;
        __traceRWC({ actif: G.player.civ.id, warWith: e,
                     guerres: (G.wars||[]).map(function(w){return w.a+'|'+w.b+(w.live?'|live':'');}),
                     wins: JSON.parse(JSON.stringify(G.warWins||{})) });
        return _rwc.apply(this, arguments);
      };
      if (typeof aiAssaultPlayerColony === 'function') {
        var _aap = aiAssaultPlayerColony;
        aiAssaultPlayerColony = function(){ __traceAssaut('aiAssaultPlayerColony'); return _aap.apply(this, arguments); };
      }
      if (typeof defenseIA === 'function') {
        var _dia = defenseIA;
        defenseIA = function(){ __traceAssaut('defenseIA'); return _dia.apply(this, arguments); };
      }
    })();
  `, Object.assign(sb, {
    __traceRWC: o => journal.resolveWarCombat.push(o),
    __traceAssaut: nom => journal.aiAssault.push(nom),
  }));

  /* ⚠️ CETTE BOUCLE EST COPIÉE DE `selftest.js`, ET CE N'EST PAS UNE COMMODITÉ.
     Mon premier jet enchaînait `startTurn()` puis un `doAITurn(n)` par nation, et rendait ZÉRO
     guerre sur six parties. J'ai failli en conclure que les IA ne se battent jamais. La boucle
     était simplement morte : pas de rotation entre nations (une IA joue UNE action par passage, et
     il faut repasser tant qu'il lui reste des AC), pas de `doRevenues`, pas de `doMaintenance`,
     pas d'événements, et `G.turn` n'avançait jamais. Des nations sans revenus ne construisent rien,
     ne se touchent jamais, et ne se déclarent donc pas la guerre.
     C'est le même piège que `mesure_force_ia.js` en son temps : une mesure creuse ne rend pas
     d'erreur, elle rend un chiffre — et un chiffre faux se croit tout seul. */
  const all = () => [G.player].concat(G.ais);
  const melange = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  while (G.turn <= Math.min(nbTours, G.maxTurns)) {
    try { sb.startTurn(); } catch (e) { for (const p of all()) p.acLeft = p.acMax; }
    const ordre = melange(all());
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
    /* ⚠️ DEUXIÈME MESURE CREUSE, SUR UN AUTRE AXE. La boucle de `selftest.js` — dont celle-ci est
       copiée — n'appelle NI `updateWarRisk` NI `updateTension`. Or c'est là que vit tout ce qu'on
       cherche : la montée des tensions et le déclenchement de la guerre populaire. Sans ces deux
       lignes, mon « zéro guerre sur six parties » ne mesurait pas l'absence de guerre, il mesurait
       l'absence d'appel. La tension montait quand même — par les raids, l'espionnage, les cartes —
       ce qui rendait le chiffre crédible. Un résultat cohérent n'est pas un résultat juste.
       (Cela vaut aussi pour selftest.js : il ne voit jamais de guerre pour la même raison.) */
    try { sb.updateWarRisk(); sb.updateTension(); } catch (e) { }
    let ev = null; try { ev = sb.eventForTurn(G.turn); } catch (e) { }
    if (ev) { try { ev.resolve(G); } catch (e) { } }
    for (const w of (G.wars || [])) journal.guerres.add(w.a + ' ↔ ' + w.b);
    journal.warWins.push(JSON.parse(JSON.stringify(G.warWins || {})));
    G.turn++;
  }
  /* TENSIONS, SÉPARÉES SELON LE TYPE DE COUPLE. C'est la distinction décisive : `updateTension`
     calcule la tension pour TOUS les couples, mais n'en tire d'EFFET que pour ceux qui touchent la
     nation active. Mélanger les deux dans un seul maximum masquerait exactement ce qu'on cherche. */
  {
    const moi = G.player;
    let maxAvecMoi = 0, maxEntreAutres = 0;
    try {
      for (const a of all()) for (const b of all()) {
        if (a === b) continue;
        const t = sb.getTens(a.civ.id, b.civ.id) || 0;
        if (a === moi || b === moi) maxAvecMoi = Math.max(maxAvecMoi, t);
        else maxEntreAutres = Math.max(maxEntreAutres, t);
      }
      /* La nation active est aussi rangée sous la clé littérale `'player'` — deux clés pour une
         seule nation, ce qui fait partie du problème. On lit les deux. */
      for (const a of G.ais) {
        maxAvecMoi = Math.max(maxAvecMoi, sb.getTens('player', a.civ.id) || 0, sb.getTens(a.civ.id, 'player') || 0);
      }
    } catch (e) { }
    journal.tensions = { maxAvecMoi, maxEntreAutres };
  }
  /* CONTRÔLE DE VITALITÉ — sans lui, un « 0 guerre » ne veut rien dire. */
  journal.vitalite = {
    colonies: all().reduce((s, p) => s + p.colonies.length, 0),
    cartes: all().reduce((s, p) => s + p.cards.length, 0),
    tensionMax: (() => { let m = 0; try { for (const a of all()) for (const b of all()) if (a !== b) m = Math.max(m, sb.getTens(a.civ.id, b.civ.id) || 0); } catch (e) { } return m; })(),
    tour: G.turn,
  };
  return { sb, G, journal };
}

/* ── 1. Sur plusieurs parties : les combats passent-ils par resolveWarCombat ? ─ */
console.log('\n1. SUR 6 PARTIES TOUT-IA — par où passent les combats ?\n');
let totalRWC = 0, totalAssaut = 0, guerresVues = new Set(), rwcSansMoi = 0, rwcAvecMoi = 0;
const vit = { colonies: 0, cartes: 0, tensionMax: 0 };
for (let p = 0; p < 6; p++) {
  const { G, journal } = partieInstrumentee(99);
  vit.colonies += journal.vitalite.colonies; vit.cartes += journal.vitalite.cartes;
  vit.tensionMax = Math.max(vit.tensionMax, journal.vitalite.tensionMax);
  vit.avecMoi = Math.max(vit.avecMoi || 0, journal.tensions.maxAvecMoi);
  vit.entreAutres = Math.max(vit.entreAutres || 0, journal.tensions.maxEntreAutres);
  totalRWC += journal.resolveWarCombat.length;
  totalAssaut += journal.aiAssault.length;
  for (const g of journal.guerres) guerresVues.add(g);
  for (const c of journal.resolveWarCombat) {
    /* « Sans moi » = une guerre est en cours (`live`) où la nation active n'est pas partie. */
    const moi = c.actif;
    const ailleurs = c.guerres.some(s => { const [a, b, l] = s.split('|'); return l === 'live' && a !== moi && b !== moi; });
    if (ailleurs) rwcSansMoi++; else rwcAvecMoi++;
  }
}
/* ⚠️ LA VITALITÉ D'ABORD. Un « 0 guerre » ne vaut rien si les nations n'ont rien construit :
   la mesure serait creuse, et un chiffre creux se croit tout seul. */
console.log('   CONTRÔLE DE VITALITÉ — les parties ont-elles vraiment été jouées ?');
console.log('     colonies posées (6 parties)      : ' + vit.colonies + (vit.colonies > 30 ? '   ✔' : '   ❌ les nations n\'ont rien construit : la mesure est creuse'));
console.log('     technologies achetées            : ' + vit.cartes + (vit.cartes > 30 ? '   ✔' : '   ❌'));
console.log('     tension maximale atteinte        : ' + vit.tensionMax + '/10' + (vit.tensionMax >= 3 ? '   ✔ les nations se frottent' : '   ⚠️ aucune friction : la guerre n\'avait aucune raison d\'éclater'));
console.log('       · couples touchant la nation active : ' + vit.avecMoi + '/10   ← seuls ceux-ci déclenchent quelque chose');
console.log('       · couples entre les AUTRES nations  : ' + vit.entreAutres + '/10   ← calculés, mais sans aucun effet');
console.log('');
console.log('   appels à resolveWarCombat          : ' + totalRWC);
console.log('   appels aux chemins d\'assaut IA     : ' + totalAssaut);
console.log('   guerres distinctes observées       : ' + guerresVues.size + (guerresVues.size ? '  (' + [...guerresVues].join(', ') + ')' : ''));
console.log('\n   parmi les appels à resolveWarCombat :');
console.log('     · pendant une guerre où la nation active EST partie   : ' + rwcAvecMoi);
console.log('     · alors qu\'une guerre SANS elle est en cours          : ' + rwcSansMoi);

/* ── 2. Le compteur à deux camps face à deux guerres simultanées ──────────── */
console.log('\n2. `G.warWins` — un compteur `{player, ai}` pour COMBIEN de guerres ?\n');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  const par = id => [G.player].concat(G.ais).find(p => p.civ.id === id);
  /* Deux guerres qui n'ont RIEN à voir l'une avec l'autre. */
  sb.declarerGuerre(par('martiens'), par('jupiteriens'), 'guerre A', 'other');
  sb.declarerGuerre(par('terriens'), par('ceinturiens'), 'guerre B', 'other');
  console.log('   guerres ouvertes : ' + (G.wars || []).map(w => w.a + '↔' + w.b).join('  ·  '));
  console.log('   G.warWins        : ' + JSON.stringify(G.warWins) + '   ← un seul objet à deux cases');
  console.log('   G.warWith        : ' + G.warWith + '   ← un seul adversaire nommé');
  const wA = (G.wars || []).find(w => (w.a === 'martiens' || w.b === 'martiens') && (w.a === 'jupiteriens' || w.b === 'jupiteriens'));
  const wB = (G.wars || []).find(w => (w.a === 'terriens' || w.b === 'terriens') && (w.a === 'ceinturiens' || w.b === 'ceinturiens'));
  console.log('   chaque guerre porte-t-elle SON propre score ?');
  console.log('     guerre martiens↔jupiteriens : ' + (wA && wA.wins ? JSON.stringify(wA.wins) + '  ✔ oui' : 'aucun champ `wins`  ❌'));
  console.log('     guerre terriens↔ceinturiens : ' + (wB && wB.wins ? JSON.stringify(wB.wins) + '  ✔ oui' : 'aucun champ `wins`  ❌'));
  console.log('\n   Lecture : si chaque guerre porte son score, `G.warWins` n\'est qu\'un MIROIR pour');
  console.log('   l\'affichage local, et la migration consiste à cesser de le lire comme une vérité.');
}

/* ── 3. Ce que resolveWarCombat lit, ligne par ligne, classé par gravité ──── */
console.log('\n3. LES 21 LECTURES, CLASSÉES\n');
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const i = src.indexOf('function resolveWarCombat');
  const j = src.indexOf('\nfunction ', i + 10);
  const corps = src.slice(i, j > 0 ? j : i + 12000).split('\n');
  const cat = { attaquant: [], defenseur: [], compteur: [], affichage: [] };
  corps.forEach((l, n) => {
    if (!/G\.player|G\.ais|G\.war(State|With|Wins|TurnsLeft)|_moiId/.test(l)) return;
    const t = l.trim();
    if (/addLog|journalCombat|innerHTML|textContent|document\./.test(t)) cat.affichage.push(n + 1 + ' · ' + t.slice(0, 88));
    else if (/warWins|warTurnsLeft/.test(t)) cat.compteur.push(n + 1 + ' · ' + t.slice(0, 88));
    else if (/warEnemy|G\.warWith|G\.ais/.test(t)) cat.defenseur.push(n + 1 + ' · ' + t.slice(0, 88));
    else cat.attaquant.push(n + 1 + ' · ' + t.slice(0, 88));
  });
  const bloc = (titre, quoi, liste) => {
    console.log('   ' + titre + '  (' + liste.length + ')');
    console.log('     ' + quoi);
    liste.slice(0, 4).forEach(l => console.log('       ' + l));
    if (liste.length > 4) console.log('       … et ' + (liste.length - 4) + ' autre(s)');
    console.log('');
  };
  bloc('L\'ATTAQUANT est « moi »', 'À remplacer par un paramètre. C\'est le cœur du chantier.', cat.attaquant);
  bloc('LE DÉFENSEUR est cherché dans G.ais', 'Un humain distant y est aussi — mais le repli `G.ais[0]` est un tirage au sort.', cat.defenseur);
  bloc('LES COMPTEURS GLOBAUX', 'Miroirs d\'affichage si chaque guerre porte son score (voir §2).', cat.compteur);
  bloc('AFFICHAGE ET JOURNAL', 'Légitime : il faut bien tutoyer quelqu\'un. À router, pas à supprimer.', cat.affichage);
}

console.log('═'.repeat(84));
