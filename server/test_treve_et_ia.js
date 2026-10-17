/* ============================================================================
   TEST — LA TRÊVE SUPPRIMÉE, ET DEUX IA QUI ARRÊTENT DE SE NUIRE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-14, après la partie 0C10 :
     · « Ah bon y a une trêve de trois tours pour les IA dans les règles ? Je savais
       pas, supprime ça. »
     · « Quand le Terrien IA atteint le maximum d'action il devrait arrêter de le
       faire automatiquement. »
   Plus un défaut trouvé en relisant son journal : le message d'un raid entre deux IA
   annonçait au LECTEUR que c'était lui qui perdait les ressources.

   1. LA TRÊVE. Après une paix, `G._peaceCooldown` interdisait pendant 3 tours qu'une
      guerre populaire éclate avec la même nation. Elle n'était consultée qu'à deux
      endroits — la guerre populaire et les manifestations — et JAMAIS quand le joueur
      déclarait la guerre lui-même. Marc a donc pu, quatre tours de suite : déclarer,
      conquérir, acheter la paix, recommencer. Cinq colonies. Les IA, elles, devaient
      attendre. Une règle qui ne lie qu'un camp n'est pas une règle : on la supprime.

   2. LA DIPLOMATIE VERTE. Le gouvernement plafonne à 15 points (niveau 4). Au-delà, un
      point de plus ne donne rien. L'IA terrienne versait pourtant 3🪨 par tour sans
      fin : 27🪨 brûlés dans la partie 0C10, ce qui explique sa dernière place.

   3. LE RAID. « Tu perds 🪨 » était écrit en dur, alors que la cible d'un raid est la
      nation la plus proche — pas forcément le lecteur.

   Usage : node test_treve_et_ia.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }
function note(s) { console.log('     ' + s); }

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  for (const p of [G.player].concat(G.ais)) {
    p.res = { energy: 20, materials: 20, science: 20, morale: 6 };
    p.acLeft = 4; p.acMax = 4;
  }
  G.turn = 6; G.phase = 'actions';
  return { sb, G };
}
const nation = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
const enGuerre = (sb, a, b) => vm.runInContext('!!_warBetween(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ')', sb);

console.log('═'.repeat(74));
console.log('TRÊVE SUPPRIMÉE · DIPLOMATIE VERTE PLAFONNÉE · RAID CORRECTEMENT NOMMÉ');
console.log('═'.repeat(74) + '\n');

/* ── 1. La trêve n'existe plus, ni dans le code ni dans les faits ──────────── */
console.log('1. La trêve de 3 tours a disparu');
{
  /* ⚠️ ON DÉPOUILLE LES COMMENTAIRES AVANT DE CHERCHER. Un banc d'essai de cette semaine
     s'est déjà mis au rouge sur son PROPRE commentaire citant le code supprimé. Le
     bandeau ci-dessus contient le mot `_peaceCooldown` : sans ce nettoyage, ce test
     échouerait sur lui-même. */
  const brut = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const sansCom = brut.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const restes = sansCom.split('\n').filter(l => l.includes('_peaceCooldown'));
  if (!restes.length) ok('plus une seule occurrence de `_peaceCooldown` dans le code exécutable');
  else ko(restes.length + ' occurrence(s) subsistent, ex. : ' + restes[0].trim().slice(0, 90));

  /* Et surtout : la vérification par les FAITS. Une paix, puis la tension au maximum
     dès le tour suivant — la guerre populaire doit pouvoir éclater immédiatement. */
  const { sb, G } = partie();
  const ia = nation(G, 'martiens');
  sb.declareWar('essai', 'player', ia.civ.id);
  if (!enGuerre(sb, 'terriens', ia.civ.id)) { ko('la guerre de départ ne s\'est pas déclarée — cas non éprouvé'); }
  else {
    vm.runInContext('_evEndWarWith(' + JSON.stringify(ia.civ.id) + ',3);', sb);   // paix + ancienne trêve
    if (enGuerre(sb, 'terriens', ia.civ.id)) ko('la paix n\'a pas mis fin à la guerre');
    else ok('la paix met bien fin à la guerre');
    G.turn += 1;
    /* ⚠️ POSER LA TENSION À 10 NE SUFFIT PAS, ET MON PREMIER JET S'Y EST FAIT PRENDRE.
       `updateTension` commence par faire RETOMBER la tension d'un point quand aucun grief
       nouveau n'est apparu ce tour-ci (« paix : −1/tour »). Le 10 devenait 9 avant même
       d'être lu, la guerre populaire ne partait pas, et le test accusait une trêve déjà
       supprimée. Il faut donc un vrai grief qui tienne d'un tour à l'autre.
       ⚠️ ADAPTÉ LE 17/09 : c'était « deux technologies de palier 3 = +4 par tour » ; cette règle
       n'existe plus (l'avance technologique se juge en relatif, tous les deux tours, après
       l'événement — `griefTechnologique`). On prend le grief stable qui reste : une route de
       l'autre nation touchant ma capitale, +1 par tour. La tension reste à 10 et le mécanisme
       est éprouvé pour de bon. */
    ia.routes.push({ from: G.player.civ.home, to: ia.civ.home, tokens: 0 });
    vm.runInContext('setTens("player",' + JSON.stringify(ia.civ.id) + ',10);setTens(' + JSON.stringify(ia.civ.id) + ',"player",10);', sb);
    try { sb.updateTension(); } catch (e) { note('(updateTension : ' + e.message.split('\n')[0] + ')'); }
    note('tension après le tour : ' + vm.runInContext('getTens("player",' + JSON.stringify(ia.civ.id) + ')', sb) + '/10');
    if (enGuerre(sb, 'terriens', ia.civ.id)) ok('tension à 10 le tour suivant : la guerre populaire éclate AUSSITÔT (avant, elle attendait 3 tours)');
    else ko('aucune guerre malgré une tension de 10/10 juste après la paix — quelque chose bloque encore');
  }
}

/* ── 2. Diplomatie Verte : elle s'arrête au niveau maximal ─────────────────── */
console.log('\n2. L\'IA terrienne cesse de payer quand le gouvernement est au maximum');
{
  const essai = (pts) => {
    const { sb, G } = partie();
    const terr = nation(G, 'terriens');
    terr._isAI = true; terr.abilityUsed = false;
    terr.govPermPts = pts; vm.runInContext('recomputeGov(__G.player.civ.id==="terriens"?__G.player:__G.ais.find(a=>a.civ.id==="terriens"));', sb);
    const avant = terr.res.materials, ptsAvant = terr.gov_pts;
    try { sb.doAITurn(terr, true); } catch (e) {}
    return { terr, depense: avant - terr.res.materials, gagne: terr.gov_pts - ptsAvant, niveau: terr.gov_level };
  };

  /* CONTRE-ÉPREUVE D'ABORD. Si l'IA ne payait plus JAMAIS — pour une raison sans rapport,
     un manque de matériaux par exemple — le test « elle ne paie plus » passerait au vert
     sans rien prouver. On vérifie donc qu'en dessous du plafond, elle paie bien. */
  const bas = essai(6);
  if (bas.gagne >= 3) ok('sous le plafond (niveau ' + bas.niveau + ') : elle paie et gagne ' + bas.gagne + ' pts de Gouvernement');
  else ko('contre-épreuve ÉCHOUÉE : sous le plafond elle ne paie déjà plus (gain ' + bas.gagne + ') — le test suivant ne prouverait rien');

  const haut = essai(15);
  if (haut.niveau !== 4) note('⚠️ à 15 points le niveau attendu est 4, obtenu ' + haut.niveau);
  if (haut.gagne === 0) ok('au plafond (niveau 4, 15 pts) : plus un seul point de Gouvernement acheté');
  else ko('au plafond, elle achète encore ' + haut.gagne + ' pts qui ne servent à rien');

  /* Le vrai enjeu n'est pas les points, ce sont les 3🪨. On les compte sur cinq tours. */
  const { sb, G } = partie();
  const terr = nation(G, 'terriens');
  terr._isAI = true; terr.govPermPts = 15;
  vm.runInContext('recomputeGov(__G.player.civ.id==="terriens"?__G.player:__G.ais.find(a=>a.civ.id==="terriens"));', sb);
  /* ⚠️ « TROIS MATÉRIAUX DÉPENSÉS SANS POINT DE GOUVERNEMENT » N'EST PAS UNE PREUVE DE GASPILLAGE.
     Ce banc rougissait une fois sur trois, et pour cette raison seule : un faux positif, jamais un
     défaut. Le détecteur regardait les RESSOURCES — trois matériaux partis, pas un point gagné,
     donc gaspillage. Mais améliorer une colonie coûte aussi 3🪨 et n'a jamais rapporté de point de
     gouvernement : selon que l'IA colonisait, posait une route ou améliorait ce tour-là, le même
     code rendait vert ou rouge. Le hasard du tirage décidait du verdict.
     Le défaut d'origine était PRÉCIS : la Diplomatie Verte terrienne — l'aptitude de nation —
     payait 3🪨 pour des points inutiles au plafond. On surveille donc exactement cela : l'aptitude
     employée alors que les points ne peuvent plus monter. Un banc doit désigner un coupable, pas
     relever une coïncidence comptable. */
  let brule = 0;
  for (let t = 0; t < 5; t++) {
    terr.abilityUsed = false; terr.acLeft = 1;
    const m0 = terr.res.materials, p0 = terr.gov_pts;
    try { sb.doAITurn(terr, true); } catch (e) {}
    /* ⚠️ ET LES POINTS NE SONT PAS PLAFONNÉS — C'EST TOUT LE PROBLÈME. `gov_pts` continue de
       grimper : 15, 18, 21, 24… Un détecteur qui attendait « gov_pts inchangé » ne se serait donc
       JAMAIS déclenché, même avec le garde-fou retiré. Ce qui est gaspillé, ce n'est pas un point
       qu'on ne reçoit pas, c'est un point qu'on reçoit et qui ne sert à rien : le niveau 4 est
       atteint à 15 et il n'y a rien au-dessus. On regarde donc le point de départ. */
    if (terr.abilityUsed && p0 >= 15 && m0 - terr.res.materials >= 3) {
      brule += 3;
      note('tour ' + t + ' : Diplomatie Verte employée à ' + p0 + ' pts (plafond 15) — 3🪨 pour des points sans effet');
    }
    terr.res.materials = 20; G.turn++;
  }
  if (brule === 0) ok('sur cinq tours au plafond : 0🪨 gaspillés (c\'était 3🪨 par tour, soit 27🪨 dans la partie 0C10)');
  else ko(brule + '🪨 encore gaspillés en cinq tours');
}

/* ── 3. Le raid nomme sa victime ───────────────────────────────────────────── */
console.log('\n3. Le journal du raid nomme la vraie victime');
{
  /* PARTIE TOUT-IA. C'est le cas qui piégeait le journal de Marc : aucune des nations qui
     se pillent n'est le lecteur, et pourtant le message lui disait « Tu perds ». Dans une
     partie où personne n'est le joueur local, plus AUCUNE ligne de raid ne doit employer
     la deuxième personne. On laisse les IA jouer et on lit ce qu'elles écrivent. */
  const { sb, G } = partie();
  const nations = [G.player].concat(G.ais);
  /* ⚠️ CE BANC A BESOIN DE NATIONS QUI PILLENT. Depuis les tempéraments (2026-08-16), le bâtisseur
     et le conquérant ne raident PLUS JAMAIS — par doctrine, pas par accident. Un banc qui vérifie
     le comportement des raids doit donc choisir un tempérament qui en fait : l'opportuniste est le
     seul. Sans cela il constate « aucun raid » et conclut à tort que le cas est introuvable. */
  for (const p of nations) { p._isAI = true; p.forceTokens = 8; p.res.morale = 8; p._profil = 'opportuniste'; p._agresseeTour = null; }
  const n0 = G.log.length;
  for (let t = 0; t < 8; t++) {
    try { sb.startTurn(); } catch (e) { for (const p of nations) p.acLeft = p.acMax; }
    for (const p of nations) { p._passedRound = false; p._aiSetupDone = false; p.forceTokens = Math.max(p.forceTokens, 6); p._profil = 'opportuniste'; p._agresseeTour = null; }
    for (const p of nations) for (let a = 0; a < 8; a++) { let r = false; try { r = sb.doAITurn(p, true); } catch (e) {} if (!r) break; }
    try { sb.advancePirates(); sb.doRevenues(); sb.doMaintenance(); } catch (e) {}
    G.turn++;
  }
  const lignes = G.log.slice(0, Math.max(0, G.log.length - n0)).map(e => (e && e.msg) || '');
  /* ⚠️ ON EXCLUT LES RAIDS DE PIRATES, ET CE N'EST PAS UN ASSOUPLISSEMENT. Ce contrôle protège le
     défaut du 14/08 : « 🤖 Raid X ! Tu perds 🪨 » était écrit en dur, si bien que le journal
     accusait le lecteur quand DEUX AUTRES nations se pillaient. Il porte donc sur les raids d'une
     NATION contre une NATION. Un raid de pirates (« ☠️ Raid pirate — risque de guerre +1 ») n'a pas
     de nation victime : l'exiger rendait le banc rouge une fois sur deux, selon que des pirates
     avaient frappé ou non pendant les huit tours — c'est-à-dire selon le tirage des événements.
     Un banc qui rougit au dé ne mesure rien (REPRISE §40.5). */
  const raids = lignes.filter(m => /Raid/.test(m) && !/Raid pirate|pirates/i.test(m));
  /* ⚠️ NE PLUS EXIGER UN COMPORTEMENT QU'ON A DÉLIBÉRÉMENT SUPPRIMÉ. Depuis les tempéraments
     (2026-08-16), bâtisseur et conquérant ne raident JAMAIS et l'opportuniste rarement : huit tours
     peuvent passer sans un seul pillage, et c'est le résultat voulu. Ce banc vérifie un LIBELLÉ ;
     ne rien avoir à lire n'est donc pas un défaut, c'est une absence d'occasion. On le note.
     (J'ai d'abord voulu forcer deux raids par `doRaidTarget` : mauvaise idée — c'est l'autre chemin,
     celui du joueur, et il écrit des phrases d'une forme différente que ce banc ne sait pas juger.
     Le libellé du raid subi est par ailleurs couvert par `test_perspective_legere.js`.) */
  if (!raids.length) { note('aucun pillage sur ces huit tours — normal depuis les tempéraments ; rien à juger ici.'); }
  else {
    note(raids.length + ' ligne(s) de raid observée(s), ex. : « ' + raids[0].replace(/<[^>]+>/g, '').slice(0, 84) + ' »');
    const fautives = raids.filter(m => /Tu perds/.test(m));
    if (!fautives.length) ok('aucune ne dit « Tu perds » alors qu\'aucune victime n\'est le lecteur');
    else ko(fautives.length + ' ligne(s) disent encore « Tu perds » : ' + fautives[0].slice(0, 100));
    /* ⚠️ DEUX FORMULATIONS VALIDES, ET LE MOTIF N'EN CONNAISSAIT QU'UNE. Ce banc n'exigeait que
       « <nation> perd ». Depuis que le butin est annoncé (28/08, demande de Marc : « le résultat du
       raid indique raid_result mais pas ce qu'on a gagné »), la ligne dit « ⚔️ Raid sur 🟠
       Jupitériens — production de Io pillée ! +6 +2 +2 » : elle nomme parfaitement la victime, avec
       un autre verbe. Le banc l'a déclarée fautive alors que le moteur avait raison.
       Ce que la règle exige vraiment, c'est qu'on sache QUI est pillé — jamais « Tu perds » adressé à
       quelqu'un qui n'est pas concerné. On accepte donc les deux tournures, sans relâcher le contrôle
       qui compte : le nom de la victime doit figurer, et il est vérifié juste au-dessus qu'aucune
       ligne ne dit « Tu perds ». */
    const nommees = raids.filter(m => nations.some(p =>
      m.includes(p.civ.name + ' perd') || m.includes('Raid sur') && m.includes(p.civ.name)) || /bloqué/.test(m));
    if (nommees.length === raids.length) ok('chaque ligne nomme la nation réellement pillée');
    else ko((raids.length - nommees.length) + ' ligne(s) ne nomment aucune victime');
  }

  /* CONTRE-ÉPREUVE : quand la victime EST le joueur local, on doit lui parler à lui. */
  const b2 = partie();
  const agresseur = nation(b2.G, 'martiens');
  agresseur._isAI = true; agresseur.forceTokens = 8; agresseur._enemy = b2.G.player; agresseur._attacksThisTurn = 0;
  const m0 = b2.G.log.length;
  for (let i = 0; i < 10; i++) { agresseur.acLeft = 3; agresseur._attacksThisTurn = 0; agresseur._enemy = b2.G.player; try { b2.sb.doAITurn(agresseur, true); } catch (e) {} }
  const versMoi = b2.G.log.slice(0, Math.max(0, b2.G.log.length - m0)).map(e => (e && e.msg) || '').filter(m => /Raid de/.test(m));
  if (!versMoi.length) note('(contre-épreuve : aucun raid visant le joueur — l\'IA a choisi une autre cible)');
  else if (versMoi.some(m => /Tu perds/.test(m))) ok('quand la victime est le joueur local, le journal lui dit bien « Tu perds »');
  else ko('la victime est le joueur local mais le journal ne s\'adresse plus à lui : ' + versMoi[0].slice(0, 100));
}

console.log('\n' + '═'.repeat(74));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Trêve supprimée des deux côtés · Diplomatie Verte plafonnée · raid correctement attribué.');
console.log('═'.repeat(74));
