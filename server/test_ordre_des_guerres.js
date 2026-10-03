/* ============================================================================
   TEST — CHAQUE GUERRE SE RÉSOUT À SA PLACE, EN ENTIER, ET LE JOUEUR CHOISIT AU MOMENT DE FRAPPER
   ----------------------------------------------------------------------------
   POURQUOI. Partie 66C3 (Marc, 17/09), tour 7. Trois guerres populaires contre les Terriens le même
   soir. La fenêtre « ton peuple exige la guerre, choisis ta cible » s'ouvre chez Marc AVANT la file
   des guerres — c'est une ligne de `passTurn` : `if(G._forcedWarPending){…}` passe avant
   `stDysonPuisGuerres`. Il choisit Titan. Puis la file tourne : Martiens (ne frappent pas),
   Ceinturiens (PRENNENT Titan), Jupitériens — lui, en troisième. Sa guerre, déjà en file comme
   « fraîche », rouvre une fenêtre de combat qui recalcule les cibles : il ne reste que la Lune.
   Marc : « pourquoi j'ai pas pu attaquer Titan tout de suite après mon choix, y a un truc qui s'est
   intercalé entre les deux choix ? C'est pas dingue ça. » Puis sa règle : « il faut que chaque
   guerre se résolve dans l'ordre et en entier. »

   LA RÈGLE (Marc, 17/09) :
     · les guerres se résolvent une par une, en entier, dans un ordre fixé une fois pour toutes ;
     · une guerre pendante depuis un tour précédent passe avant toute guerre nouvelle ;
     · entre guerres nouvelles, l'ordre est celui de leur CAUSE dans le tour (un refus de Dyson à la
       première action passe avant une conquête faite à la troisième) ;
     · la guerre populaire du joueur n'est plus jouée AVANT la file : elle est jouée À SA PLACE dans
       la file — le choix de la cible et le coup au même instant, sur l'état du moment.

   CE QUI EST VÉRIFIÉ : l'ordre de la file (§1, §2), l'absence de fenêtre avant la file (§3), la
   fenêtre à sa place avec des cibles À JOUR — le scénario 66C3 rejoué : la colonie prise par une
   autre guerre n'est plus proposée (§4) —, et le message quand une cible choisie a tout de même
   changé de mains (§5).
   Usage : node test_ordre_des_guerres.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);
const nu = s => String(s || '').replace(/<[^>]+>/g, '');

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = 7; G.phase = 'actions';
  const jup = G.player, ter = G.ais[0], mar = G.ais[1], cei = G.ais[2];
  jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [jup, ter, mar, cei]) { n.res.morale = 8; n.forceTokens = 6; n.res.materials = 10; n.res.energy = 10; n.acLeft = 0; }
  const questions = [];
  sb.setDecisionSink(p => questions.push(p));
  return { sb, G, jup, ter, mar, cei, questions };
}
const file = sb => (sb.fluxDonnees().guerres || []).map(g => g.a + '↔' + g.b + (g.fraiche ? '' : ' (pendante)'));

console.log('§1 Deux guerres nouvelles : la file suit l\'ordre des CAUSES, pas l\'ordre des nations');
{
  const m = montage();
  /* La cause de la seconde guerre (Terriens ↔ Ceinturiens) survient AVANT celle de la première dans
     l'ordre du tableau des nations. On déclare dans l'ordre inverse de la cause pour le prouver. */
  m.sb.declarerGuerre(m.ter, m.cei, 'cause tardive', 'other');      // déclarée en premier…
  const w1 = m.sb._warBetween('terriens', 'ceinturiens');
  m.sb.declarerGuerre(m.mar, m.jup, 'cause précoce', 'other');      // …mais dont la cause est postérieure
  const w2 = m.sb._warBetween('martiens', 'jupiteriens');
  if (w1 && w2 && typeof w1.ordre === 'number' && typeof w2.ordre === 'number') ok('chaque guerre porte un numéro d\'ordre (' + w1.ordre + ', ' + w2.ordre + ')');
  else ko('les guerres ne portent pas de numéro d\'ordre');
  /* On force la cause : la guerre 2 a une cause plus ancienne que la guerre 1. */
  if (w1 && w2) { w1.ordre = 50; w2.ordre = 10; }
  vm.runInContext('guerresPreparer("stFinDeTour")', m.sb);
  const f = file(m.sb);
  note('file : ' + f.join(' · '));
  if (f[0] === 'martiens↔jupiteriens' && f[1] === 'terriens↔ceinturiens') ok('la cause la plus ancienne passe en premier, quel que soit l\'ordre de déclaration');
  else ko('ordre de la file : ' + f.join(' · '));
}

console.log('§2 Une guerre pendante depuis le tour précédent passe avant toute guerre nouvelle');
{
  const m = montage();
  m.sb.declarerGuerre(m.mar, m.jup, 'nouvelle', 'other');
  const neuve = m.sb._warBetween('martiens', 'jupiteriens'); if (neuve) neuve.ordre = 1;   // cause très ancienne dans le tour
  m.sb.declarerGuerre(m.ter, m.cei, 'ancienne', 'other');
  const vieille = m.sb._warBetween('terriens', 'ceinturiens');
  if (vieille) { vieille.justDeclared = false; vieille.tourDeclaration = 5; vieille.ordre = 99; }   // pendante depuis le tour 5
  vm.runInContext('guerresPreparer("stFinDeTour")', m.sb);
  const f = file(m.sb);
  note('file : ' + f.join(' · '));
  if (f[0] === 'terriens↔ceinturiens (pendante)') ok('la guerre pendante est servie d\'abord, même avec un numéro d\'ordre plus grand');
  else ko('la guerre pendante n\'est pas en tête : ' + f.join(' · '));
}

console.log('§3 La tension à 10 chez le joueur n\'ouvre plus de fenêtre AVANT la file');
{
  const m = montage();
  m.sb.setTens('player', 'terriens', 10);
  { const G = m.sb.__G; if (!G.ultimatums) G.ultimatums = {}; G.ultimatums[G.player.civ.id + '|terriens'] = (G.turn || 0) - 1; }   // ultimatum d'un tour (02/10) déjà échu : on teste l'ordre, pas le délai
  m.ter.routes.push({ from: 'lune', to: 'io', tokens: 0 });     // un grief qui tient la tension à 10
  m.sb.updateTension();
  const q = m.questions.filter(p => p.kind === 'forced_war');
  const w = m.sb._warBetween('jupiteriens', 'terriens');
  note('guerre déclarée : ' + !!w + ' · questions forced_war émises pendant updateTension : ' + q.length);
  if (w) ok('la guerre populaire est déclarée au moment du jugement (tension 10)'); else ko('aucune guerre déclarée à 10');
  if (w && w.populaireJoueur) ok('elle est marquée « populaire, choix du joueur à venir »'); else ko('la guerre ne porte pas la marque populaireJoueur');
  if (q.length === 0) ok('aucune fenêtre ouverte avant la file — le choix attendra la place de cette guerre');
  else ko(q.length + ' fenêtre(s) forced_war ouverte(s) avant la file (l\'ancien comportement)');
  if (!m.sb.fluxDonnees().guerrePopFenetre) ok('le drapeau « fenêtre ouverte » n\'est pas posé'); else ko('guerrePopFenetre posé sans fenêtre');
}

console.log('§4 LE SCÉNARIO 66C3 REJOUÉ — la fenêtre du joueur s\'ouvre à sa place, avec des cibles à jour');
{
  /* Terriens possèdent Titan et la Lune. Deux guerres populaires contre eux le même soir :
       · Ceinturiens → Terriens, cause ANCIENNE (ordre 1) : les Ceinturiens sont forts, ils prendront Titan ;
       · joueur → Terriens, cause RÉCENTE (ordre 2).
     Attendu : la file joue d'abord Ceinturiens ↔ Terriens (Titan tombe), PUIS ouvre la fenêtre du
     joueur — dont la liste ne contient plus Titan. Avant : la fenêtre s'ouvrait en premier avec
     Titan dedans, et le coup partait dans le vide. */
  const m = montage();
  m.ter.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  m.ter.colonies.push({ nodeId: 'ceres', level: 1, connected: true });            // une colonie ordinaire, prenable (la Lune est une capitale : 10 de garnison)
  m.ter.forceTokens = 0; m.ter.res.materials = 0; m.ter.res.energy = 0;           // Terriens sans défense
  m.cei.forceTokens = 12; m.cei.res.materials = 14; m.cei.res.energy = 14;         // Ceinturiens armés
  m.jup.forceTokens = 8;
  /* Titan est à portée des Ceinturiens (Éris–Pluton–Titan) ; on relie Pluton pour que la portée de
     guerre les y autorise (voisins → 4 nœuds). */
  m.cei.colonies.push({ nodeId: 'pluto', level: 1, connected: true });   // ⚠️ l'identifiant du nœud est « pluto », pas « pluton »
  vm.runInContext('updateConnections(G.ais[2]); updateConnections(G.ais[0]);', m.sb);
  m.sb.declarerGuerre(m.cei, m.ter, 'Guerre Populaire Forcée — le peuple exige vengeance !', 'other', { penalitesDifferees: true });
  const wCei = m.sb._warBetween('ceinturiens', 'terriens'); if (wCei) { wCei.ordre = 1; wCei.aiAggressor = true; }
  m.sb.declarerGuerre(m.jup, m.ter, 'Guerre Populaire Forcée — le peuple exige vengeance !', 'other', { penalitesDifferees: true });
  const wJup = m.sb._warBetween('jupiteriens', 'terriens'); if (wJup) { wJup.ordre = 2; wJup.populaireJoueur = true; }
  /* On lance la file de fin de tour directement. */
  vm.runInContext('stGuerres()', m.sb);
  /* Les fenêtres des ordinateurs sont posées comme des questions et c'est le PILOTE qui y répond
     (driver.js, `_reponseIA`). On rejoue ici ses réponses de guerre, mot pour mot : les Ceinturiens
     refusent la paix, frappent, et les Terriens défendent avec ce qu'ils ont (rien). */
  const repondreCommeLePilote = (p) => {
    const nat = m.sb.allPlayers().find(n => n.civ.id === p.nation);
    if (p.kind === 'peace_offer') return { accept: false };
    if (p.kind === 'war_initiative') return { id: 'attaque' };
    if (p.kind === 'war_combat') return m.sb.iaChoixDeCombat(nat);
    if (p.kind === 'defense') return { defTokens: 0 };
    if (p.kind === 'forced_war') return p.payload.colTarget ? { colony: p.payload.colTarget } : { peace: true };
    return {};
  };
  let garde = 0, q = null;
  while (garde++ < 30) {
    q = m.questions.find(p => p.kind === 'forced_war' && p.nation === 'jupiteriens' && !p._vue);
    if (q) break;
    const autre = m.questions.find(p => !p._vue && p.nation !== 'jupiteriens');
    if (!autre) break;
    autre._vue = true; try { m.sb.resolveDecision(autre.id, repondreCommeLePilote(autre)); } catch (e) { note('réponse pilote : ' + e.message.split('\n')[0]); break; }
  }
  const titanCei = m.cei.colonies.some(c => c.nodeId === 'titan');
  const titanTer = m.ter.colonies.some(c => c.nodeId === 'titan');
  note('Titan : ceinturienne ' + titanCei + ' · terrienne ' + titanTer + ' · fenêtre du joueur : ' + (q ? 'ouverte' : 'ABSENTE'));
  if (titanCei) ok('la guerre des Ceinturiens s\'est jouée en entier avant celle du joueur : Titan est tombée');
  else ko('Titan n\'est pas tombée avant la fenêtre du joueur — le montage ne rejoue pas le 66C3');
  if (q) ok('la fenêtre « choisis ta cible » du joueur s\'ouvre à SA place dans la file');
  else ko('la fenêtre du joueur ne s\'est pas ouverte dans la file');
  const cols = q ? (q.payload.cols || []).map(c => c.node) : [];
  note('cibles proposées : ' + (cols.join(', ') || 'aucune'));
  if (q && !cols.includes('titan')) ok('Titan, prise entre-temps, n\'est PAS proposée — la liste est calculée au moment du choix');
  else if (q) ko('Titan est proposée alors qu\'elle n\'est plus terrienne');
  if (q && cols.includes('ceres')) ok('Cérès, elle, l\'est'); else if (q) ko('Cérès manque : ' + cols.join(', '));
  /* Le joueur frappe Cérès : le coup part, et la file continue jusqu'au bout. */
  if (q) {
    q._vue = true; m.sb.resolveDecision(q.id, { colony: 'ceres' });
    /* En ligne (un puits de décisions est posé, comme sur le serveur), la question des JETONS part
       tout de suite au joueur, par la fenêtre de combat, avec la colonie choisie en tête. Avant le
       17/09 elle ne partait jamais : l'assaut restait armé et personne ne le résolvait. */
    const cible = vm.runInContext('_warAttackColonyTarget', m.sb);
    const combat = m.questions.find(p => p.kind === 'war_combat' && p.nation === 'jupiteriens' && !p._vue);
    const focus = combat && (combat.payload.cols || []).find(c => c.isFocus);
    note('après le choix : cible retenue = ' + cible + ' · question de combat : ' + (combat ? 'posée' : 'ABSENTE') + (focus ? ' · en tête : ' + focus.node : ''));
    if (cible === 'ceres' && combat) ok('le coup est armé sur Cérès et la question des jetons part tout de suite — choix et coup au même instant');
    else ko('après le choix : cible ' + cible + ', question de combat ' + (combat ? 'posée' : 'absente'));
    if (focus && focus.node === 'ceres') ok('la fenêtre de combat met Cérès en tête'); else ko('Cérès n\'est pas la cible mise en avant : ' + JSON.stringify(focus));
    const avant = m.ter.colonies.some(c => c.nodeId === 'ceres');
    if (combat) { combat._vue = true; try { m.sb.resolveDecision(combat.id, { action: 'attack', node: 'ceres', tokens: 6 }); } catch (e) { note('réponse : ' + e.message.split('\n')[0]); } }
    const apres = m.ter.colonies.some(c => c.nodeId === 'ceres');
    if (avant && !apres) ok('et le combat se résout dans la foulée : Cérès tombe');
    else ko('le combat ne s\'est pas résolu (Cérès terrienne avant ' + avant + ', après ' + apres + ')');
    /* Le compte rendu du combat est une NOTICE qui attend d'être lue ; sa fermeture joue la suite
       (`stWarResultFerme` → `stApresGuerrePopulaire` → `guerreSuivante`). On la ferme, comme un joueur. */
    
    for (const r of m.questions.filter(p => p.kind === 'war_result' && !p._vue)) { r._vue = true; try { m.sb.resolveDecision(r.id, {}); } catch (e) { note('fermeture : ' + String(e.stack).split('\n').slice(0,6).join(' ⏎ ')); } }
    const d = m.sb.fluxDonnees();
    note('file après : index ' + d.guerreIdx + ' / ' + (d.guerres || []).length);
    if ((d.guerreIdx || 0) >= (d.guerres || []).length) ok('la file est allée jusqu\'au bout — aucune seconde fenêtre pour cette guerre');
    else ko('la file s\'est arrêtée à ' + d.guerreIdx + ' / ' + (d.guerres || []).length);
  }
}

console.log('§5 Quand la cible choisie a tout de même changé de mains, on le DIT');
{
  const m = montage();
  m.ter.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  m.sb.declarerGuerre(m.jup, m.ter, 'banc', 'player');
  m.G.warWith = 'terriens';
  vm.runInContext('_warAttackColonyTarget="titan"', m.sb);
  /* Titan passe aux Ceinturiens entre le choix et le combat. */
  m.ter.colonies = m.ter.colonies.filter(c => c.nodeId !== 'titan');
  m.cei.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  const av = (m.G.log || []).length;
  const dit = vm.runInContext('cibleChangeeDeMains(G.player, "titan")', m.sb);
  const lignes = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(e => nu((e && e.msg) || e));
  note('retour : ' + JSON.stringify(dit) + ' · journal : ' + (lignes[0] || '—').slice(0, 100));
  if (dit && /Titan/.test(String(dit)) && /Ceinturiens/.test(String(dit))) ok('le message nomme la colonie ET celui qui l\'a prise');
  else ko('message absent ou incomplet : ' + JSON.stringify(dit));
  if (lignes.some(x => /changé de mains/.test(x))) ok('et il est écrit au journal'); else ko('rien au journal');
  const rien = vm.runInContext('cibleChangeeDeMains(G.player, "lune")', m.sb);
  if (!rien) ok('contre-épreuve : une cible encore ennemie ne déclenche aucun message'); else ko('faux positif sur la Lune : ' + rien);
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_ordre_des_guerres : les guerres se jouent dans l\'ordre, en entier, et le joueur choisit sur l\'état du moment.');
