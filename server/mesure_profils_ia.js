/* ============================================================================
   MESURE — LES TROIS TEMPÉRAMENTS SE COMPORTENT-ILS DIFFÉREMMENT ?
   ----------------------------------------------------------------------------
   CE FICHIER NE CORRIGE RIEN. Il vérifie que les profils demandés par Marc (2026-08-16)
   produisent bien trois manières de jouer distinctes — et pas trois étiquettes sur le même
   comportement.

   ⚠️ CE QU'IL FAUT MESURER, C'EST L'ÉCART, PAS LA MOYENNE. Un profil « guerrier » qui raide
   autant qu'un « bâtisseur » n'est pas un profil. On compte donc, PAR TEMPÉRAMENT, ce que
   chaque nation a réellement fait sur des parties complètes.

   Usage : node mesure_profils_ia.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const PARTIES = 8;

const stat = {};   // profil → compteurs
const add = (p, k, n) => { (stat[p] = stat[p] || { parties:0, raids:0, guerres:0, colonies:0, techs:0, routes:0, vp:0, civic:0, intel:0, assauts:0 })[k] += (n||0)||((n===0)?0:1); };

for (let k = 0; k < PARTIES; k++) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.player._isAI = true;
  try { sb.attribuerProfilsIA(); } catch (e) {}
  const tous = () => [G.player].concat(G.ais);
  while (G.turn <= G.maxTurns) {
    try { sb.startTurn(); } catch (e) { for (const p of tous()) p.acLeft = p.acMax; }
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
    try { sb.advancePirates(); sb._applyMoraleFlags(); sb.doRevenues(); sb.doMaintenance(); } catch (e) {}
    try { sb.updateWarRisk(); sb.updateTension(); } catch (e) {}
    G.turn++;
  }
  /* On relit le journal une fois la partie finie : chaque ligne porte le nom de la nation. */
  const nomDe = {}; for (const n of tous()) nomDe[n.civ.name] = n._profil || '(aucun)';
  /* ⚠️ « X PILLE Y » CONTIENT DEUX NOMS. Mon premier jet prenait le premier nom trouvé dans l'ordre
     de la table des nations — pas celui qui agit. Bâtisseur et conquérant sortaient à 5,3 et 5,2
     raids, et j'ai failli conclure que les tempéraments ne mordaient pas. C'est l'AUTEUR qu'on
     veut : dans ces phrases, il est toujours cité en premier. On prend donc le nom dont la
     position dans la ligne est la plus à gauche. */
  const auteurDe = m => {
    let best = null, pos = 1e9;
    for (const nom of Object.keys(nomDe)) { const i = m.indexOf(nom); if (i >= 0 && i < pos) { pos = i; best = nom; } }
    return best;
  };
  for (const l of (G.log || [])) {
    const m = String((l && (l.msg || l.t || l.text)) || l);
    /* ⚠️ « IA DÉFENSIVE DE X : RAID DE Y BLOQUÉ » CITE LA VICTIME EN PREMIER. La règle « l'auteur est
       le nom le plus à gauche » vaut pour « X pille Y », pas pour ces lignes-là : on attribuait donc
       le raid à celui qui le subissait. Un bâtisseur qui ne pille plus du tout affichait encore 0,7
       raid par partie, et j'ai failli croire que le correctif ne prenait pas. Ici, l'auteur est le
       nom qui suit « raid de ». */
    const mBloque = m.match(/raid de\s+\S*\s*([A-ZÉÈÀÎÔ][\wéèàîôûç]+)/);
    if (mBloque) { const a3 = Object.keys(nomDe).find(n => n === mBloque[1]); if (a3) add(nomDe[a3], 'raids'); continue; }
    /* ⚠️ NE PAS COMPTER SA PROPRE DESCRIPTION. Le message d'annonce d'un tempérament contient
       « ne pille jamais » — et mon motif `/pille/` le comptait comme un pillage. Un bâtisseur qui
       n'en fait aucun affichait donc 0,7 raid par partie, et j'ai cherché le défaut dans le moteur
       pendant trois itérations avant de lire la ligne en entier. Le vrai message de pillage a une
       forme précise : « X pille Y : … ». */
    if (/tempérament/.test(m)) continue;
    const estRaid = /\spille\s/.test(m) && /:/.test(m), estGuerre = /GUERRE DÉCLARÉE/.test(m);
    const estAssaut = /capture|marche sur|frappe /i.test(m);
    if (estAssaut) { const a2 = auteurDe(m); if (a2) add(nomDe[a2], 'assauts'); }
    if (!estRaid && !estGuerre) continue;
    const nom = auteurDe(m); if (!nom) continue;
    if (estRaid) add(nomDe[nom], 'raids');
    if (estGuerre) add(nomDe[nom], 'guerres');
  }
  for (const n of tous()) {
    const prof = n._profil || '(aucun)';
    /* Le conquérant a besoin du Réseau Orbital pour voir les stocks des rivales : sans lui, il ne
       peut pas repérer une nation à sec, donc pas appliquer sa doctrine. On le compte. */
    if (n.cards.some(c => c.spec === 'intel_2' || c.spec2 === 'intel_2')) add(prof, 'intel');
    add(prof, 'assauts', (n._assautsPartie || 0));
    add(prof, 'parties'); add(prof, 'colonies', n.colonies.length);
    add(prof, 'techs', n.cards.filter(c => c.branch).length);
    add(prof, 'routes', n.routes.length);
    try { add(prof, 'vp', sb.calcVP(n).total); } catch (e) {}
  }
}

console.log('═'.repeat(80));
console.log('TEMPÉRAMENTS DES IA — ' + PARTIES + ' parties complètes');
console.log('═'.repeat(80) + '\n');
console.log('   profil'.padEnd(18) + 'parties'.padStart(8) + 'raids'.padStart(8) + 'guerres'.padStart(9)
  + 'colonies'.padStart(10) + 'techs'.padStart(7) + 'routes'.padStart(8) + 'VP moy.'.padStart(9)
  + 'assaut/intel'.padStart(12));
const moy = (o, k) => o.parties ? (o[k] / o.parties).toFixed(1) : '—';
for (const p of ['batisseur', 'guerrier', 'opportuniste', '(aucun)']) {
  const o = stat[p]; if (!o) continue;
  console.log('   ' + p.padEnd(15) + String(o.parties).padStart(8) + moy(o,'raids').padStart(8)
    + moy(o,'guerres').padStart(9) + moy(o,'colonies').padStart(10) + moy(o,'techs').padStart(7)
    + moy(o,'routes').padStart(8) + moy(o,'vp').padStart(9)
    + (String(o.assauts||0)+'/'+String(o.intel||0)).padStart(11));
}
console.log('\n   (valeurs moyennes par nation et par partie)');
const b = stat.batisseur, g = stat.guerrier;
if (b && g && b.parties && g.parties) {
  const rb = b.raids / b.parties, rg = g.raids / g.parties;
  console.log('\n   Écart décisif — raids : bâtisseur ' + rb.toFixed(1) + ' · conquérant ' + rg.toFixed(1)
    + (rg > rb * 1.5 ? '   ✔ les tempéraments divergent nettement'
                     : '   ⚠️ trop proches : les profils ne se distinguent pas'));
  const cb = b.colonies / b.parties, cg = g.colonies / g.parties;
  console.log('   Écart décisif — colonies : bâtisseur ' + cb.toFixed(1) + ' · conquérant ' + cg.toFixed(1));
}
console.log('\n' + '═'.repeat(80));
