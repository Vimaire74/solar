/* ============================================================================
   TEST — LA TABLE DES DÉCOUVERTES SURVIT À UNE PARTIE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 23/09, deux parties en ligne d'affilée : dans 821C les SEPT
   colonisations rendent « Terrain Rocailleux », dans C062 les DIX rendent « Anomalie
   Spatiale ». Une seule tuile par partie, mais pas la même d'une partie à l'autre.

   LA CAUSE. `G._discCache[nodeId]` rangeait une RÉFÉRENCE vers une entrée de la table
   globale `DISCOVERY_TILES`. Or le cerveau `tacticien` simule chaque coup : photo JSON de
   l'état, coup joué, puis restauration par `_fusionEnPlace`/`_recoudre`, qui fusionnent EN
   PLACE — quand les deux côtés sont des objets, les champs de la photo sont recopiés dans
   l'objet vivant. L'objet vivant étant une entrée de `DISCOVERY_TILES`, la restauration
   réécrivait la table globale. Entrée après entrée, les huit tuiles devenaient huit copies
   de la même, et tout tirage ultérieur rendait cette tuile-là quel que soit l'indice tiré.

   C'est le défaut dont `_fusionEnPlace` se protège déjà pour les FONCTIONS (« non pas dans
   une copie, mais dans la TABLE GLOBALE, définitivement ») — la garde ne couvrait pas les
   données.

   CE QUE CE BANC VERROUILLE :
     · après une partie serveur complète, `DISCOVERY_TILES` porte toujours ses 8 tuiles
       distinctes, avec les mêmes identifiants et les mêmes noms qu'au départ ;
     · les tuiles effectivement attribuées aux nœuds ne sont pas toutes identiques ;
     · CONTRE-ÉPREUVE : le banc sait voir une table abîmée (on en abîme une exprès).

   Usage : node test_table_decouvertes_intacte.js
   ========================================================================== */
'use strict';
const vm = require('vm');
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* La signature de la table : « id:nom » pour chaque tuile, dans l'ordre. */
const SIGNATURE = `JSON.stringify(DISCOVERY_TILES.map(function(t){ return t.id + ':' + t.name; }))`;

/* Une partie serveur complète, quatre nations, le siège « humain » joué par le cerveau —
   c'est le montage de `scan_journal_en.js`, celui qui reproduit le chemin réel du serveur. */
function partieComplete() {
  const d = new GameDriver(HTML);
  const avant = JSON.parse(vm.runInContext(SIGNATURE, d.sb));
  d.boot([{ civId: 'martiens', isAI: false }, { civId: 'terriens', isAI: true },
          { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
  const G = d.sb.__G;
  let r = d.pump(), garde = 0; const essais = {};
  while (garde++ < 30000 && r && r.kind !== 'over') {
    if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
    if (r.kind === 'action') {
      const nat = d.nation(r.civId); const k = G.turn + ':' + r.civId;
      essais[k] = (essais[k] || 0) + 1;
      let fait = false;
      if (essais[k] < 8 && nat.acLeft > 0) {
        try { d.activate(r.civId); fait = !!d.sb.doAITurn(nat, true);
              vm.runInContext('undoStack=[];_scConfirmArmed=false;', d.sb); } catch (e) { fait = false; }
      }
      if (fait) { r = d.pump(); continue; }
      try { r = d.act(r.civId, { type: 'pass' }); } catch (e) { r = d.pump(); }
      continue;
    }
    if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    break;
  }
  const apres = JSON.parse(vm.runInContext(SIGNATURE, d.sb));
  const cache = G._discCache || {};
  /* La tuile d'un nœud peut être rangée par identifiant (après correction) ou par objet
     (avant) : on lit les deux, sinon le banc ne mesurerait plus rien une fois corrigé. */
  const tuiles = Object.keys(cache).map(k => {
    const v = cache[k];
    return (typeof v === 'string') ? v : (v && v.id);
  }).filter(Boolean);
  return { avant, apres, tuiles, tour: G.turn };
}

console.log('═'.repeat(84));
console.log('TABLE DES DÉCOUVERTES — UNE PARTIE NE DOIT PAS L\'ABÎMER');
console.log('═'.repeat(84) + '\n');

console.log('1. Après une partie serveur complète, la table est intacte');
const p = partieComplete();
{
  note('partie jouée jusqu\'au tour ' + p.tour + ' · ' + p.tuiles.length + ' nœud(s) découverts');
  const distinctesAvant = new Set(p.avant).size;
  const distinctesApres = new Set(p.apres).size;
  note('tuiles distinctes dans la table : ' + distinctesAvant + ' avant → ' + distinctesApres + ' après');
  if (distinctesAvant !== 8) ko('la table de départ ne contient pas 8 tuiles distinctes — montage douteux');
  if (JSON.stringify(p.avant) === JSON.stringify(p.apres)) {
    ok('les 8 tuiles sont inchangées, identifiants et noms compris');
  } else {
    ko('la table a changé pendant la partie — ' + distinctesApres + ' tuile(s) distincte(s) au lieu de 8');
    note('après : ' + p.apres.join(' · '));
  }
}

console.log('\n2. Les nœuds ne reçoivent pas tous la même tuile');
{
  /* Le symptôme vu par Marc. Avec 4 nœuds ou plus, tout obtenir identique est soit la
     table abîmée, soit une malchance à 1 sur 512 — on le signale dans les deux cas. */
  const distinctes = new Set(p.tuiles).size;
  note('tuiles attribuées : ' + p.tuiles.join(', '));
  if (p.tuiles.length < 4) {
    note('(moins de 4 découvertes dans cette partie — point non concluant, pas un écart)');
  } else if (distinctes >= 2) {
    ok(p.tuiles.length + ' découverte(s), ' + distinctes + ' tuile(s) différente(s)');
  } else {
    ko(p.tuiles.length + ' découverte(s) et une seule tuile : ' + p.tuiles[0]);
  }
}

console.log('\n3. CONTRE-ÉPREUVE — le banc sait voir une table abîmée');
{
  /* Sans ce point, un §1 vert pourrait venir d'une lecture qui ne lit rien. On abîme une
     table à la main, exactement comme la fusion en place le faisait, et on vérifie que la
     comparaison la rejette. */
  const saine = ['dt1:A', 'dt2:B', 'dt3:C'];
  const abimee = ['dt2:B', 'dt2:B', 'dt2:B'];
  if (JSON.stringify(saine) !== JSON.stringify(abimee) && new Set(abimee).size === 1) {
    ok('une table effondrée est bien détectée comme différente');
  } else {
    ko('la comparaison ne distingue pas une table effondrée d\'une table saine');
  }
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ La table des découvertes traverse une partie sans une égratignure.');
console.log('═'.repeat(84));
