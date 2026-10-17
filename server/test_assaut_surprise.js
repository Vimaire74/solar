/* ============================================================================
   TEST — UNE IA FRAPPE PAR SURPRISE, ELLE NE PRÉVIENT PAS
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-25, en découvrant le journal de la partie DF6A :

     « Ce qui est aberrant ce sont les messages du jeu qui te disent que la nation IA se prépare à
       t'attaquer !! Ça ne devrait jamais arriver. […] Soit on attaque une colonie par surprise et
       après l'autre te déclare la guerre — pas parce qu'il le veut mais parce que c'est une réponse
       obligatoire — soit on ne fait pas la guerre. Il faut que les joueurs et les IA soient traités
       sur pied d'égalité. »

   CE QU'IL Y AVAIT. `tryAssaultAI` avait deux comportements selon la cible :
     · contre une IA, le combat se résolvait sur-le-champ ;
     · contre un HUMAIN, elle DÉCLARAIT la guerre, écrivait « marche sur X — prépare ta défense »,
       et renvoyait l'assaut à la fin du tour.
   Trois conséquences, toutes vues dans le journal de Marc :
     1. une annonce qui n'existait que contre un humain ;
     2. une guerre déclarée AVANT le premier coup, à l'envers de la règle ;
     3. et une échappatoire : une guerre fraîche où l'on n'est pas l'agresseur ouvre d'abord la
        FENÊTRE DE PAIX. Marc a accepté la paix au tour 4 — l'assaut annoncé s'est évaporé sans
        qu'un seul jeton soit engagé, et le cycle a recommencé au tour 7.
   Prévenu, puis autorisé à annuler : aucune IA ne pouvait lui prendre quoi que ce soit.

   CE QUE CE BANC VÉRIFIE. Que l'assaut d'une IA sur un humain se comporte comme celui d'un humain
   sur une IA : frappe immédiate, fenêtre de DÉFENSE (et non préavis), combat résolu. Et l'inverse,
   qui compte tout autant : que l'annonce a bien DISPARU, et qu'une IA sans moyens ne frappe pas.

   ⚠️ ADAPTÉ LE 16/09 — LA CONSÉQUENCE DE L'ASSAUT A CHANGÉ (§134 étape 3, volonté de Marc).
   Ce banc exigeait qu'une GUERRE existe après l'assaut (« la réponse obligatoire »). Marc a
   tranché autrement le 16/09, en découvrant que l'attaque déclarait la guerre : « tout passe par
   la tension. Si elle est à 10, c'est la guerre populaire forcée, mais EN FIN DE TOUR, pas
   immédiatement à l'attaque d'une colonie. » L'assaut est désormais une ESCARMOUCHE qui fait
   monter la tension de l'agressé (8 si la place tombe, 6 si elle tient).
   CE QUI FAISAIT LE PRIX DE CE BANC RESTE, ET SE RENFORCE. L'échappatoire de la DF6A tenait à la
   fenêtre de PAIX d'une guerre « fraîche », qui laissait Marc annuler l'assaut annoncé. Il n'y a
   plus de guerre du tout à ce moment-là : la fenêtre ne peut plus s'ouvrir, et le coup est porté.
   On le vérifie donc directement — aucune guerre, aucune question en attente — au lieu de passer
   par le drapeau `justDeclared` qui n'a plus d'objet.

   Usage : node test_assaut_surprise.js
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

/* Un plateau où une IA a une colonie humaine à portée. `force` règle la garde de la victime. */
function montage(opts) {
  opts = opts || {};
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const humain = G.player, ia = G.ais[0];
  humain._isAI = false; ia._isAI = true;
  for (const n of [humain].concat(G.ais)) { n.routes = []; n.forceCooldown = []; n._attacksThisTurn = 0; }

  const NODES = vm.runInContext('NODES', sb);
  const pris = new Set();
  for (const n of [humain].concat(G.ais)) for (const c of n.colonies) pris.add(c.nodeId);
  /* Une colonie humaine collée à l'IA : c'est la cible naturelle. */
  const dep = ia.colonies[0].nodeId;
  const voisin = ((NODES[dep] || {}).conn || []).find(a => NODES[a] && !NODES[a].decorative
    && !NODES[a].noColonize && !pris.has(a));
  if (voisin) humain.colonies.push({ nodeId: voisin, level: 2, connected: true });

  ia.forceTokens = 8; ia.res.materials = 12; ia.res.energy = 12; ia.res.morale = 6;
  ia.acLeft = 4; ia._aiSetupDone = false; ia._profil = 'guerrier';
  /* ⚠️ CE BANC ÉPROUVE UN MÉCANISME, PAS UNE ENVIE D'ATTAQUER — d'où l'épinglage du cerveau.
     Le 28/08, `tacticien` est devenu le cerveau par défaut et ce banc est passé au rouge. J'ai
     d'abord cru à une régression, puis soupçonné que la simulation ne savait pas résoudre un combat
     contre un absent. `diag_assaut_humain.js` a réfuté les deux : le tacticien note l'assaut sur
     cette colonie sans défense à 5,03 — EXACTEMENT la même note que si la victime était une IA — et
     préfère simplement « Ordinateur Quantique » à 10,29. Il ne bute sur rien ; il a d'autres projets.
     C'est cohérent avec ce qu'on avait mesuré : le tacticien construit jusqu'au tour 6, puis attaque.
     Or ce que ce banc doit garantir n'a rien à voir avec ce choix : que l'assaut d'une IA contre un
     HUMAIN ouvre une fenêtre de DÉFENSE et laisse une trace au journal. Ce mécanisme appartient au
     moteur, pas au cerveau. On le sollicite donc avec le cerveau qui attaque volontiers, faute de
     quoi le banc ne mesurerait plus que l'humeur stratégique du jour. */
  G._cerveauIA = 'historique';
  humain.forceTokens = (opts.forceHumaine !== undefined) ? opts.forceHumaine : 0;
  humain.res.materials = (opts.resHumaine !== undefined) ? opts.resHumaine : 0;
  humain.res.energy = (opts.resHumaine !== undefined) ? opts.resHumaine : 0;
  /* Le renseignement complet : sans lui l'IA ne PEUT pas voir que la place est vide (§14.7), et le
     banc mesurerait le brouillard au lieu de mesurer le comportement d'assaut. */
  const reseau = vm.runInContext("CARDS_POOL.find(c=>c.spec==='intel_2')", sb);
  ia.cards = (ia.cards || []).concat([reseau]);
  return { sb, G, humain, ia, cible: voisin };
}
const journal = G => (G.log || []).map(l => String((l && (l.msg || l.t)) || l));
const enAttente = sb => (typeof sb.fluxQuestionsEnAttente === 'function') ? sb.fluxQuestionsEnAttente() : [];

console.log('═'.repeat(80));
console.log('ASSAUT SURPRISE — PAS DE PRÉAVIS, PAS DE PAIX AVANT LE PREMIER COUP');
console.log('═'.repeat(80) + '\n');

/* ── 1. L'IA frappe, et c'est une fenêtre de DÉFENSE qui s'ouvre ───────────── */
console.log('1. L\'IA assaille un humain : fenêtre de défense, pas préavis');
{
  const m = montage();
  if (!m.cible) ko('aucun nœud libre voisin de l\'IA — scénario invalide');
  else {
    m.sb.setDecisionSink(() => {});
    for (let i = 0; i < 4 && !enAttente(m.sb).some(q => q.kind === 'defense'); i++) {
      try { m.sb.doAITurn(m.ia, true); } catch (e) { note('exception : ' + e.message); break; }
    }
    const j = journal(m.G);
    const q = enAttente(m.sb).find(x => x.kind === 'defense');
    note('fenêtres en attente : ' + (enAttente(m.sb).map(x => x.kind).join(', ') || 'aucune'));
    if (q) ok('une fenêtre de DÉFENSE est ouverte chez l\'assailli');
    else ko('aucune fenêtre de défense : l\'humain n\'a pas la main sur son propre combat');
    if (j.some(x => /par surprise/.test(x))) ok('le journal parle d\'une frappe surprise');
    else ko('rien dans le journal ne dit qu\'un assaut a eu lieu');
    /* ⚠️ LE CŒUR DE LA DEMANDE DE MARC. */
    if (!j.some(x => /prépare ta défense|marche sur/.test(x))) ok('AUCUN préavis : « marche sur… prépare ta défense » a disparu');
    else ko('le préavis est toujours là — c\'est précisément ce que Marc appelle aberrant');
    if (q && q.payload && q.payload.maxDef !== undefined && q.payload.threat !== undefined)
      ok('la fenêtre annonce la menace et les jetons engageables (' + q.payload.threat + '⚔️ · max ' + q.payload.maxDef + ')');
    else if (q) ko('la fenêtre de défense ne dit ni la menace ni ce qu\'on peut engager');
  }
}

/* ── 2. Le combat se résout, et la guerre suit comme conséquence ───────────── */
console.log('\n2. Le combat se résout dans la foulée, la guerre est la conséquence');
{
  const m = montage();
  if (!m.cible) ko('scénario invalide');
  else {
    m.sb.setDecisionSink(() => {});
    for (let i = 0; i < 4 && !enAttente(m.sb).some(q => q.kind === 'defense'); i++) {
      try { m.sb.doAITurn(m.ia, true); } catch (e) {}
    }
    const q = enAttente(m.sb).find(x => x.kind === 'defense');
    const avant = m.humain.colonies.length;
    if (!q) ko('pas de fenêtre de défense — le cas ne peut pas être joué');
    else {
      m.sb.resolveDecision(q.id, { defTokens: 0, cruiser: false });   // l'humain n'a rien à engager
      const apres = m.humain.colonies.length;
      const j = journal(m.G);
      note('colonies humaines ' + avant + ' → ' + apres);
      if (apres < avant || j.some(x => /CAPTURÉE/.test(x))) ok('la colonie change de main : le combat a bien eu lieu');
      else ko('le combat ne s\'est pas résolu — l\'assaut s\'évapore encore');
      const guerre = m.sb._warBetween(m.ia.civ.id, m.humain.civ.id);
      if (!guerre) ok('aucune guerre ouverte : l\'assaut est une escarmouche (§134 étape 3)');
      else ko('l\'assaut a ouvert une guerre — la règle de Marc est cassée');
      /* ⚠️ CONTRE-ÉPREUVE DÉCISIVE, VERSION 16/09. L'échappatoire de la DF6A était la fenêtre de
         PAIX d'une guerre fraîche. Sans guerre, elle n'a plus de raison de s'ouvrir : on vérifie
         qu'aucune question ne reste posée après le combat — ni paix, ni rien. */
      /* On ne compte que les QUESTIONS. `war_result` est une NOTICE — le compte rendu du combat,
         envoyé aux deux camps ; elle n'attend pas de réponse et n'annule rien. */
      const _restes = enAttente(m.sb).filter(x => !(x && x.notice));
      if (!_restes.length) ok('et aucune question en attente : pas de fenêtre de paix pour annuler le coup');
      else ko('questions encore posées après le combat : ' + _restes.map(x => x.kind).join(', '));
      /* Ce que l'agression laisse derrière elle : la rancune de l'agressé. */
      const _tv = m.sb.getTens(m.humain.civ.id, m.ia.civ.id);
      if (_tv >= 6) ok('la tension de l\'agressé est montée à ' + _tv + '/10');
      else ko('tension de l\'agressé : ' + _tv + ' (attendu 8 si la colonie tombe, 6 sinon)');
    }
  }
}

/* ── 3. CONTRE-ÉPREUVE — une place bien gardée n'est pas attaquée ──────────── */
console.log('\n3. CONTRE-ÉPREUVE — devant une défense sérieuse, l\'IA ne frappe pas');
{
  /* Sans ce cas, les deux précédents passeraient au vert même si l'on avait fait attaquer l'IA
     en toutes circonstances. Ce qu'on veut, c'est une IA qui frappe QUAND elle peut gagner. */
  const m = montage({ forceHumaine: 14, resHumaine: 20 });
  if (!m.cible) ko('scénario invalide');
  else {
    m.sb.setDecisionSink(() => {});
    for (let i = 0; i < 4; i++) { try { m.sb.doAITurn(m.ia, true); } catch (e) {} }
    const q = enAttente(m.sb).find(x => x.kind === 'defense');
    const j = journal(m.G);
    note('humain à 14 jetons armés — fenêtre de défense : ' + (q ? 'ouverte' : 'aucune'));
    if (!q && !j.some(x => /par surprise/.test(x))) ok('l\'IA renonce : la garde est trop forte');
    else ko('l\'IA a attaqué une position solide — la garde d\'assaut ne joue plus');
  }
}

/* ── 4. SYMÉTRIE — quand c'est l'humain qui frappe, même déroulé ───────────── */
console.log('\n4. SYMÉTRIE — l\'humain qui assaille ouvre lui aussi le combat sur-le-champ');
{
  /* « Il faut que les joueurs et les IA soient traités sur pied d'égalité. » Ce cas fige la
     référence : c'est le chemin humain qui a toujours été correct, et c'est sur lui qu'on s'est
     aligné. S'il change un jour, les deux comportements divergeront de nouveau — et ce banc le dira. */
  const m = montage();
  if (!m.cible) ko('scénario invalide');
  else {
    const victime = m.ia, col = victime.colonies.find(c => c.nodeId !== victime.civ.home) || victime.colonies[0];
    m.humain.forceTokens = 8; m.humain.res.materials = 12; m.humain.res.energy = 12; m.humain.acLeft = 4;
    m.sb.setDecisionSink(() => {});
    const avantGuerre = !!m.sb._warBetween(m.humain.civ.id, victime.civ.id);
    /* ⚠️ L'EXCEPTION ATTENDUE N'EST PAS UN DÉFAUT. `playerAssaultColony` finit par ouvrir la vraie
       modale de combat (`document.getElementById('war-combat-modal')`), qui n'existe pas hors
       navigateur. Tout ce qui NOUS intéresse — la guerre ouverte, ses drapeaux — est posé avant.
       On l'avale donc en le disant, plutôt que de laisser croire à un incident. */
    try { m.sb.playerAssaultColony(col.nodeId, victime, m.humain); }
    catch (e) { note('(fenêtre de combat absente hors navigateur : ' + e.message + ' — sans effet sur ce qui suit)'); }
    /* ⚠️ ADAPTÉ LE 16/09 (voir le bandeau). Ce que l'on compare ici, c'est que les DEUX CHEMINS —
       l'humain qui assaille, l'ordinateur qui assaille — font la même chose. Ils la faisaient en
       ouvrant une guerre ; ils la font maintenant en ouvrant une escarmouche. L'important n'a pas
       changé : pas de divergence entre les deux.
       ⚠️ L'enregistrement est encore là à cet instant précis parce que la modale de combat lève
       avant la résolution (voir la note ci-dessus) : c'est justement ce qui permet de le REGARDER
       et de vérifier qu'il porte bien la marque `escarmouche`, et non celle d'une guerre. */
    const guerre = m.sb._warBetween(m.humain.civ.id, victime.civ.id);
    note('avant : ' + avantGuerre + ' · après : ' + (guerre ? (guerre.escarmouche ? 'escarmouche' : 'GUERRE') : 'rien'));
    if (!avantGuerre && guerre && guerre.escarmouche) ok('l\'assaut humain ouvre une escarmouche, pas une guerre — même chemin que l\'ordinateur');
    else if (guerre) ko('l\'assaut humain ouvre une VRAIE guerre — les deux chemins divergent');
    else ko('l\'assaut humain n\'engage rien du tout');
    const _j = journal(m.G);
    if (!_j.some(x => /GUERRE DÉCLARÉE/.test(x))) ok('et le journal n\'annonce aucune déclaration de guerre');
    else ko('le journal annonce encore une déclaration de guerre');
  }
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ L\'IA frappe par surprise et ouvre une fenêtre de défense — plus de préavis, plus de');
console.log('   paix avant le premier coup, et le même déroulé que lorsque c\'est toi qui attaques.');
console.log('═'.repeat(80));
