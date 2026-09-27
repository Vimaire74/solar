/* ============================================================================
   TEST — 1 ACTION = 1 PASSAGE : PERSONNE NE JOUE DEUX FOIS QUAND L'AUTRE PEUT JOUER
   ----------------------------------------------------------------------------
   POURQUOI. C'est une décision d'architecture verrouillée, écrite dans quatre documents
   (`POINT_DEPART_NOUVELLE_TACHE`, `ETAT_ET_RESTE`, `RESUME_PROJET` §0.G, et le descriptif du pilote
   dans `OVH_SERVEUR_LIVE_MULTIJOUEUR`) : « ordre tiré au sort, 1 action = 1 passage ». Marc, 28/08,
   partie 6D02 : « il fait plusieurs actions de suite », de plus en plus à partir du tour 6.

   LA CAUSE, POUR MÉMOIRE. `rehydrateState` reconstruisait `G._order` avec un `.map()` — qui rend
   TOUJOURS un tableau neuf. Le pilote reconnaissait une nouvelle manche en comparant ce tableau à
   la référence qu'il gardait (`order !== this._aorderRef`) : tableau neuf ⇒ manche neuve ⇒ pointeur
   REMBOBINÉ au premier joueur. Inoffensif tant que les restaurations étaient rares ; permanent
   depuis que le cerveau `tacticien` simule chaque coup, donc restaure `G` plusieurs fois par tour.

   ⚠️ AUCUN BANC NE POUVAIT LE VOIR. `test_passer.js` vérifie qu'un `skip` ne saute qu'UNE action ;
   aucun ne vérifiait que la MAIN TOURNE. C'est le même angle mort que le carnet de bord (§58) :
   le jeu se terminait, les états étaient neutres, les scores plausibles — rien ne rougissait.

   ⚠️ CE QUE CE BANC N'INTERDIT PAS. Deux passages consécutifs d'une même nation sont LÉGITIMES
   dans DEUX cas, et les confondre avec un défaut condamne le jeu correct :
     · tous les autres ont épuisé leurs AC — le cas normal de fin de manche ;
     · une autre nation DOIT des passages (`_passesDues`) parce qu'elle a dépensé 2 ou 3 AC en un
       coup. Elle a encore des AC, et elle ne peut pourtant pas jouer : c'est la règle de la dette
       (Marc, 20/09), et le second passage du joueur est précisément ce qu'elle lui doit.
   ⚠️ CE BANC A ACCUSÉ LE PILOTE À TORT PENDANT UNE SEMAINE, pour cette deuxième raison. Écrit le
   28/08, il n'a pas été mis à jour quand la dette est arrivée le 20/09 : il ne regardait que
   `acLeft > 0`. D'où un rouge intermittent — 1, 2 ou 4 « vols » selon que l'ordinateur avait
   dépensé 2 AC en un coup — qui a traversé §138 et §139 comme « une nation rejoue occasionnellement
   son tour, à traiter à part ». Il n'y avait rien à traiter dans le pilote.
   La leçon est celle de §159.5 retournée : un instrument qui n'a pas suivi une règle neuve fabrique
   un symptôme, et un symptôme fabriqué coûte plus cher qu'un banc absent — on cherche la panne là
   où elle n'est pas.

   Usage : node test_alternance.js
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Joue une partie 1 humain + 1 IA et relève CHAQUE passage : qui a joué, et est-ce qu'une autre
   nation aurait pu jouer à sa place. L'humain répond `skip` — il renonce à son coup mais reste dans
   la manche, ce qui est exactement la situation où l'alternance doit se voir. */
function passages(cerveau) {
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'ceinturiens', isAI: true }], () => {});
  const G = d.sb.__G;
  if (cerveau) G._cerveauIA = cerveau;
  const suite = [];
  const orig = d.sb.doAITurn;
  /* ⚠️ UN PASSAGE SE COMPTE À L'APPEL, PAS À LA DÉPENSE. Mon premier jet n'enregistrait le tour
     d'une IA que si son `acLeft` avait baissé. Or un passage peut ne coûter AUCUN AC (le pouvoir
     national est gratuit) : ces tours-là devenaient invisibles, et le banc accusait alors le JOUEUR
     d'avoir rejoué deux fois — deux faux positifs, sur un défaut qui n'existait pas.
     C'est la deuxième fois dans la même journée qu'un instrument mal posé fabrique le symptôme
     qu'on cherche (voir REPRISE §58). On compte donc les APPELS. */
  d.sb.doAITurn = function (nat, os) {
    const r = orig(nat, os);
    suite.push({ t: G.turn, qui: nat.civ.id, autresDispo: autres(G, nat) });
    return r;
  };
  let r = d.pump(), g = 0;
  while (g++ < 9000 && r) {
    if (G.turn > 9) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') {
        const nat = d.nation(r.civId);
        suite.push({ t: G.turn, qui: r.civId, autresDispo: autres(G, nat) });
        r = d.act(r.civId, { type: 'skip' }); continue;
      }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  return suite;
}
/* Une autre nation aurait-elle pu jouer ?
   ⚠️ TROIS CONDITIONS, ET CE BANC N'EN CONNAISSAIT QUE DEUX (corrigé le 26/09). Il lui faut des AC,
   ne pas être sortie de la manche — et NE PAS DEVOIR DE PASSAGES.
   La règle de la dette est arrivée le 20/09, après l'écriture de ce banc (Marc : « logiquement,
   elles devraient faire elles aussi leurs 2 ou 3 actions avant que je puisse jouer mon action
   suivante »). Une nation qui a dépensé 2 AC en un passage doit laisser jouer les autres une fois
   de plus : elle a donc des AC ET ne peut pourtant pas jouer. Le banc la comptait parmi celles qui
   « pouvaient jouer » et accusait alors le joueur d'avoir volé un passage — alors que ce second
   passage est exactement ce que la règle lui DOIT.
   Mesuré avant correction (`sonde_alternance.js`) : 2 passages signalés, 2 expliqués entièrement
   par une dette de l'autre nation ; zéro avec le cerveau `historique`, qui ne dépense pas 2 AC en
   un coup dans cette partie. Le défaut était dans l'instrument, pas dans le pilote. */
function autres(G, moi) {
  return [G.player].concat(G.ais || [])
    .filter(p => p && p !== moi && !p._passedRound && (p.acLeft || 0) > 0 && !((p._passesDues || 0) > 0))
    .map(p => p.civ.id);
}
/* Les passages consécutifs pris alors qu'un autre pouvait jouer. */
function fautes(suite) {
  const out = [];
  for (let i = 1; i < suite.length; i++) {
    const a = suite[i - 1], b = suite[i];
    if (a.t === b.t && a.qui === b.qui && a.autresDispo.length)
      out.push('T' + b.t + ' ' + b.qui + ' rejoue alors que ' + a.autresDispo.join(', ') + ' pouvai(en)t jouer');
  }
  return out;
}

console.log('═'.repeat(84));
console.log('ALTERNANCE — 1 ACTION = 1 PASSAGE');
console.log('═'.repeat(84) + '\n');

console.log('1. Cerveau par défaut (`tacticien`) — celui qui simule, donc qui restaure `G`');
{
  const s = passages('tacticien');
  const f = fautes(s);
  note(s.length + ' passage(s) relevés sur 9 tours');
  if (!f.length) ok('aucune nation ne rejoue tant qu\'une autre peut jouer');
  else { ko(f.length + ' passage(s) volé(s)'); f.slice(0, 5).forEach(x => note('  · ' + x)); }
  if (s.length > 12) ok('la partie a bien été jouée (' + s.length + ' passages) — la scène n\'est pas vide');
  else ko('trop peu de passages : le banc ne prouve rien');
}

console.log('\n2. TÉMOIN — `historique` ne simule pas, il doit être irréprochable');
{
  const f = fautes(passages('historique'));
  if (!f.length) ok('`historique` alterne proprement — la règle est bien celle-là');
  else { ko('le témoin lui-même vole des passages (' + f.length + ') : la cause est plus profonde'); f.slice(0, 3).forEach(x => note('  · ' + x)); }
}

console.log('\n3. CONTRE-ÉPREUVE — l\'identité de `G._order` ne doit plus décider de rien');
{
  /* ⚠️ Sans ce point, les deux premiers ne prouveraient que « ça marche aujourd'hui ». On remplace
     délibérément le tableau d'ordre par une COPIE à chaque tour d'IA — exactement ce que faisait
     `rehydrateState` — et on exige que l'alternance tienne quand même. C'est la garantie que le
     pilote ne se raccroche plus à une identité d'objet. */
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'ceinturiens', isAI: true }], () => {});
  const G = d.sb.__G; G._cerveauIA = 'tacticien';
  const suite = [];
  const orig = d.sb.doAITurn;
  d.sb.doAITurn = function (nat, os) {
    if (Array.isArray(G._order)) G._order = G._order.slice(); // le sabotage : un tableau neuf
    const r = orig(nat, os);
    suite.push({ t: G.turn, qui: nat.civ.id, autresDispo: autres(G, nat) });
    return r;
  };
  let r = d.pump(), g = 0;
  while (g++ < 9000 && r) {
    if (G.turn > 9) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') { suite.push({ t: G.turn, qui: r.civId, autresDispo: autres(G, d.nation(r.civId)) }); r = d.act(r.civId, { type: 'skip' }); continue; }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  const f = fautes(suite);
  note('tableau d\'ordre remplacé à chaque tour d\'IA — ' + suite.length + ' passages');
  if (!f.length) ok('l\'alternance résiste : le pilote ne dépend plus de l\'identité du tableau');
  else { ko(f.length + ' passage(s) volé(s) dès qu\'on remplace le tableau — le piège est encore là'); f.slice(0, 3).forEach(x => note('  · ' + x)); }
}

console.log('\n4. CONTRE-ÉPREUVE — un VRAI vol de passage est toujours détecté');
{
  /* ⚠️ SANS CE POINT, LA CORRECTION DU §autres AURAIT PU RENDRE LE BANC AVEUGLE. On fabrique donc un
     vol incontestable : on neutralise `_advanceActor` UNE SEULE FOIS, si bien que le pointeur ne
     bouge pas après un passage et que la même nation est rappelée alors que l'autre a des AC et
     AUCUNE dette. Le banc doit l'accuser. Une seule fois : sinon la partie tournerait en rond. */
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'ceinturiens', isAI: true }], () => {});
  const G = d.sb.__G; G._cerveauIA = 'historique';
  let saute = false;
  const origAv = d._advanceActor.bind(d);
  d._advanceActor = function () { if (!saute) { saute = true; return; } return origAv(); };
  const suite = [];
  const origIA = d.sb.doAITurn;
  d.sb.doAITurn = function (nat, os) {
    const r = origIA(nat, os);
    suite.push({ t: G.turn, qui: nat.civ.id, autresDispo: autres(G, nat) });
    return r;
  };
  let r = d.pump(), g = 0;
  while (g++ < 400 && r) {
    if (G.turn > 3) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') { suite.push({ t: G.turn, qui: r.civId, autresDispo: autres(G, d.nation(r.civId)) }); r = d.act(r.civId, { type: 'skip' }); continue; }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  const f = fautes(suite);
  note('pointeur bloqué une fois — ' + suite.length + ' passages · ' + f.length + ' faute(s) relevée(s)');
  if (!saute) ko('le sabotage n\'a pas eu lieu — la contre-épreuve ne prouve rien');
  else if (f.length) { ok('le vol fabriqué est bien accusé : ' + f[0]); }
  else ko('le banc ne voit plus un vol de passage évident — il est devenu aveugle');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ La main tourne à chaque action, avec les deux cerveaux, et même si l\'ordre du tour');
console.log('   est remplacé par une copie à chaque passage.');
console.log('═'.repeat(84));
