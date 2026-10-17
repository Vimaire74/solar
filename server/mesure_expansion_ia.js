/* ============================================================================
   MESURE — UNE IA RESTE-T-ELLE BLOQUÉE PAR UNE COLONIE EN TRAVERS DE SA ROUTE ?
   ----------------------------------------------------------------------------
   CE FICHIER NE CORRIGE RIEN. Marc, 2026-08-16 : « il faut que l'IA ne soit pas bloquée par une
   colonie en travers de son chemin au début du jeu ; si Cérès ou Vesta est prise, elle colonise
   plus loin et connecte ensuite par des routes. Je l'ai vu les bloquer depuis longtemps. »

   CE QU'ON MESURE. À chaque tour et pour chaque nation dirigée par l'ordinateur, on compte :
     · les nœuds libres ADJACENTS à une de ses colonies — ce que le code sait viser aujourd'hui ;
     · les nœuds libres à DEUX pas — ce qu'il ignore.
   Une nation qui a zéro voisin libre mais plusieurs nœuds à deux pas est une nation bloquée : elle
   a de la place devant elle et ne la voit pas.

   Usage : node mesure_expansion_ia.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const PARTIES = 6;

/* ⚠️ « COMBIEN DE FOIS UNE NATION EST BLOQUÉE » EST UNE MAUVAISE MESURE — elle varie du simple au
   triple d'une exécution à l'autre (4 %, 6 %, 11 % sur trois essais), parce qu'une nation qui
   s'étend plus loin finit dans des zones plus encerclées : le compteur monte alors qu'elle va
   mieux. On compte donc ce qui est DIRECT et non ambigu : les colonisations posées à DEUX SAUTS OU
   PLUS d'une colonie existante. Avant ce lot, le code ne regardait que les voisins immédiats —
   ce chiffre était donc structurellement nul. */
let loin = 0, colonisations = 0;
let bloquees = 0, observations = 0, coloniesFin = 0, nations = 0;
const detail = [];

for (let k = 0; k < PARTIES; k++) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.player._isAI = true;
  const NODES = vm.runInContext('NODES', sb);
  const tous = () => [G.player].concat(G.ais);
  const libre = (id, moi) => {
    const n = NODES[id];
    if (!n || n.decorative || n.noColonize) return false;
    return !tous().some(p => p.colonies.some(c => c.nodeId === id));
  };
  while (G.turn <= G.maxTurns) {
    try { sb.startTurn(); } catch (e) { for (const p of tous()) p.acLeft = p.acMax; }
    /* Photo AVANT que les nations jouent : c'est là que la question se pose. */
    for (const p of tous()) {
      const mien = new Set(p.colonies.map(c => c.nodeId));
      const adj = new Set(), deux = new Set();
      for (const c of p.colonies) for (const a of (NODES[c.nodeId]?.conn || [])) if (!mien.has(a)) adj.add(a);
      for (const a of adj) for (const b of (NODES[a]?.conn || [])) if (!mien.has(b) && !adj.has(b)) deux.add(b);
      const adjLibres = [...adj].filter(x => libre(x));
      const deuxLibres = [...deux].filter(x => libre(x));
      observations++;
      if (adjLibres.length === 0 && deuxLibres.length > 0) {
        bloquees++;
        if (detail.length < 6) detail.push('tour ' + G.turn + ' — ' + p.civ.name + ' : 0 voisin libre, '
          + deuxLibres.length + ' nœud(s) à deux pas (' + deuxLibres.slice(0, 3).map(x => NODES[x].name).join(', ') + ')');
      }
    }
    /* Photo des colonies AVANT le tour : ce qui apparaît après, et à quelle distance. */
    const avantTour = new Map();
    for (const p of tous()) avantTour.set(p, new Set(p.colonies.map(c => c.nodeId)));
    const ordre = tous().slice();
    for (const p of ordre) { p._passedRound = false; p._aiSetupDone = false; }
    let i = 0, g = 0;
    while (g++ < 2000) {
      if (ordre.every(p => p._passedRound)) break;
      const p = ordre[i % ordre.length];
      if (p._passedRound) { i++; continue; }
      let agi = false; try { agi = sb.doAITurn(p, true); } catch (e) { p._passedRound = true; }
      if (!agi || p.acLeft <= 0) p._passedRound = true;
      i++;
    }
    /* Distance de chaque nouvelle colonie au réseau que la nation avait en début de tour. */
    for (const p of tous()) {
      const avant = avantTour.get(p) || new Set();
      for (const c of p.colonies) {
        if (avant.has(c.nodeId)) continue;
        colonisations++;
        const dist = new Map(); const file = [];
        for (const id of avant) { dist.set(id, 0); file.push(id); }
        for (let i = 0; i < file.length && !dist.has(c.nodeId); i++) {
          const id = file[i], d = dist.get(id);
          if (d >= 5) continue;
          for (const v of (NODES[id]?.conn || [])) { if (dist.has(v)) continue; dist.set(v, d + 1); file.push(v); }
        }
        if ((dist.get(c.nodeId) || 99) >= 2) loin++;
        /* ⚠️ ON AJOUTE LA NOUVELLE COLONIE AU RÉSEAU DE RÉFÉRENCE. Sans cela, une seconde
           colonisation dans le même tour est mesurée par rapport au réseau du DÉBUT de tour : elle
           paraît lointaine alors qu'elle est collée à la première. Le chiffre était surévalué. */
        avant.add(c.nodeId);
      }
    }
    try { sb.advancePirates(); sb._applyMoraleFlags(); sb.doRevenues(); sb.doMaintenance(); } catch (e) {}
    try { sb.updateWarRisk(); sb.updateTension(); } catch (e) {}
    G.turn++;
  }
  for (const p of tous()) { coloniesFin += p.colonies.length; nations++; }
}

console.log('═'.repeat(80));
console.log('EXPANSION DES IA — SONT-ELLES ENFERMÉES PAR LEURS VOISINES ?');
console.log('═'.repeat(80) + '\n');
console.log('   observations (nation × tour)      : ' + observations);
console.log('   dont « bloquée » — aucun voisin libre, mais de la place à deux pas :');
console.log('     ' + bloquees + '  (' + (100 * bloquees / observations).toFixed(1) + ' %)');
if (detail.length) { console.log('\n   exemples :'); detail.forEach(d => console.log('     · ' + d)); }
console.log('\n   colonisations totales                 : ' + colonisations);
console.log('   dont posées à DEUX SAUTS ou plus      : ' + loin
  + (loin > 0 ? '   ✔ l\'IA sait désormais s\'étendre par-dessus un voisin'
              : '   ❌ aucune : elle reste enfermée par ses voisines'));
console.log('   colonies en fin de partie, par nation : ' + (coloniesFin / nations).toFixed(2));
console.log('\n' + '═'.repeat(80));
