/* ============================================================================
   TEST — CARTES STRATÉGIE « INITIATIVE » ET « INITIATIVE PLANIFIÉE » (Marc, 06/09)
   ----------------------------------------------------------------------------
   🥇 Initiative : « Tu joues en premier ce tour, mais tu es 2ᵉ si un joueur a choisi Initiative
   planifiée le tour précédent. »   📅 Initiative planifiée : « Tu joueras en premier le tour
   prochain. » La prise est annoncée à tous ; le tour suivant, le rappel est en tête du choix des
   cartes Stratégie. Les autres nations restent tirées au sort derrière.

   RÈGLES VERROUILLÉES ICI :
     1. les deux cartes existent dans le paquet, avec les textes de Marc ;
     2. ordre du tour : planifié (tour précédent) › Initiative (ce tour) › les autres au hasard —
        vingt tirages : les deux premiers ne bougent jamais, le reste bouge ;
     3. sans planifié, Initiative est première ; sans rien, tout le monde est tiré au sort ;
     4. la prise est écrite au journal et annoncée à TOUS les humains (notice) ;
     5. au tour suivant, la fenêtre de choix des cartes porte le rappel (payload `rappel`), et le
        journal d'initiative étiquette chacun : (planifié) / (Initiative) / (tirage) ;
     6. IA (tacticien) : si elle peut acheter une tech de rang 3 encore libre qu'un rival peut aussi
        prendre ce tour, elle préfère Initiative à Mobilisation ; si elle ne pourra l'acheter
        qu'au tour suivant, Initiative planifiée ; CONTRE-ÉPREUVE : sans course, Mobilisation
        d'abord, comme avant.

   Usage : node test_initiative.js
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
  sb.initGame('ceinturiens', ['jupiteriens', 'terriens', 'martiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const [marc, jup, lau, mar] = [G.player, G.ais[0], G.ais[1], G.ais[2]];
  marc._isAI = false; lau._isAI = false; jup._isAI = true; mar._isAI = true;
  for (const n of [marc, jup, lau, mar]) { n.res.energy = 10; n.res.materials = 10; n.res.science = 10; n.res.morale = 8; n.acLeft = 3; n.acMax = 3; }
  sb.setDecisionSink(function () {});
  G._pendings = [];
  return { sb, G, marc, jup, lau, mar };
}
/* Les constantes du moteur (`const`) ne sont pas des propriétés du bac à sable : on les lit DANS
   le contexte, comme les autres bancs. */
const carte = (sb, id) => vm.runInContext("STRATEGY_CARDS.find(c=>c.id==='" + id + "')||null", sb);
const cartePool = (sb, expr) => vm.runInContext("CARDS_POOL.find(c=>" + expr + ")||null", sb);
const noms = o => o.map(n => n.civ.name).join(' › ');

console.log('═'.repeat(84));
console.log('INITIATIVE — JOUER PREMIER CE TOUR, OU LE PROCHAIN');
console.log('═'.repeat(84) + '\n');

console.log('1. Les deux cartes existent, avec les textes de Marc');
{
  const m = montage();
  const a = carte(m.sb, 'st10'), b = carte(m.sb, 'st11');
  note((a ? a.emoji + ' ' + a.name + ' — ' + a.desc : 'st10 absente') + '\n     ' + (b ? b.emoji + ' ' + b.name + ' — ' + b.desc : 'st11 absente'));
  if (a && a.name === 'Initiative' && /premier ce tour/.test(a.desc) && /2/.test(a.desc)) ok('🥇 Initiative');
  else ko('Initiative absente ou texte différent');
  if (b && b.name === 'Initiative planifiée' && /premier le tour prochain/.test(b.desc)) ok('📅 Initiative planifiée');
  else ko('Initiative planifiée absente ou texte différent');
}

console.log('\n2. Ordre du tour : planifié › Initiative › tirage (20 tirages)');
{
  const m = montage();
  m.lau._initiativePlanifieeTour = 5;   // Laurent l\'a planifiée au tour 4
  m.jup._initiativeTour = 5;            // le Jupitérien prend Initiative ce tour
  const restes = new Set(); let fixes = 0;
  for (let i = 0; i < 20; i++) {
    const o = typeof m.sb.ordreDuTour === 'function' ? m.sb.ordreDuTour().ordre : [];
    if (o.length === 4 && o[0] === m.lau && o[1] === m.jup) fixes++;
    restes.add(o.slice(2).map(n => n.civ.id).join('>'));
  }
  note('deux premiers fixes : ' + fixes + '/20 · arrangements des deux derniers : ' + [...restes].join(' | '));
  if (fixes === 20) ok('Laurent (planifié) puis Jupitériens (Initiative), vingt fois sur vingt');
  else ko('l\'ordre ne respecte pas planifié › Initiative (' + fixes + '/20)');
  if (restes.size >= 2) ok('les autres restent tirés au sort');
  else ko('les autres ne sont plus tirés au sort');
}

console.log('\n3. Sans planifié : Initiative première ; sans rien : hasard');
{
  const m = montage();
  m.jup._initiativeTour = 5;
  let ok1 = 0; for (let i = 0; i < 10; i++) { const o = m.sb.ordreDuTour().ordre; if (o[0] === m.jup) ok1++; }
  if (ok1 === 10) ok('Initiative seule : première, dix fois sur dix'); else ko('Initiative seule : ' + ok1 + '/10');
  const m2 = montage();
  const premiers = new Set(); for (let i = 0; i < 30; i++) premiers.add(m2.sb.ordreDuTour().ordre[0].civ.id);
  if (premiers.size >= 2) ok('sans carte : le premier varie (hasard)'); else ko('sans carte : toujours le même premier');
}

console.log('\n4. La prise est écrite au journal et annoncée à tous les humains');
{
  const m = montage();
  const av = (m.G.log || []).length;
  m.G._pendings = [];
  m.sb._applyStratTo(m.jup, carte(m.sb, 'st11'));
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  note('journal : ' + (j.find(t => /premier/.test(t)) || '—').slice(0, 100));
  if (m.jup._initiativePlanifieeTour === 6) ok('planifiée pour le tour 6'); else ko('drapeau : ' + m.jup._initiativePlanifieeTour);
  if (j.some(t => /Jupitériens/.test(t) && /premier/.test(t) && /tour 6/.test(t))) ok('le journal le dit, avec le tour'); else ko('rien au journal');
  const dest = (m.G._pendings || []).filter(p => p.kind === 'raid_hit' && /premier/.test(String(p.payload.body))).map(p => p.nation);
  note('notices : ' + dest.join(', '));
  if (dest.includes('ceinturiens') && dest.includes('terriens')) ok('les deux humains sont prévenus'); else ko('annonce incomplète (' + dest.join(', ') + ')');
  m.sb._applyStratTo(m.marc, carte(m.sb, 'st10'));
  if (m.marc._initiativeTour === 5) ok('Initiative : marquée pour CE tour'); else ko('Initiative : ' + m.marc._initiativeTour);
}

console.log('\n5. Tour suivant : rappel dans la fenêtre de choix, étiquettes au journal d\'initiative');
{
  const m = montage();
  m.jup._initiativePlanifieeTour = 6; m.G.turn = 6;
  m.G._pendings = [];
  m.sb.runStrategyDraft();
  const q = (m.G._pendings || []).find(p => p.kind === 'strategy');
  const r = q && q.payload && q.payload.rappel;
  note('fenêtre Stratégie chez ' + (q ? q.nation : 'personne') + ' · rappel : ' + (r ? String(r).slice(0, 110) : 'absent'));
  if (r && /Jupitériens/.test(r) && /premier/.test(r)) ok('le rappel nomme le Jupitérien'); else ko('pas de rappel dans la fenêtre');
  /* Le journal d'initiative. */
  m.marc._initiativeTour = 6;
  const av = (m.G.log || []).length;
  m.sb.startInterleaved();
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  const li = j.find(t => /Initiative du tour 6/.test(t)) || '—';
  note(li.slice(0, 140));
  if (/Jupitériens \(planifié\)/.test(li) && /Ceinturiens \(Initiative\)/.test(li) && /\(tirage\)/.test(li)) ok('chacun est étiqueté : planifié / Initiative / tirage');
  else ko('étiquettes absentes');
  if (m.G._order[0] === m.jup && m.G._order[1] === m.marc) ok('et `G._order` (ce que le serveur suit) est dans cet ordre'); else ko('G._order : ' + noms(m.G._order));
}

console.log('\n6. IA tacticien : Initiative quand une tech de rang 3 est disputée');
{
  const m = montage();
  const pool = ['st6', 'st10', 'st11', 'st3', 'st4'].map(id => carte(m.sb, id)).filter(Boolean);
  /* Jupitériens et Martiens ont tous deux le rang 2 d'une même branche ; le rang 3 est libre. */
  const t2 = cartePool(m.sb, 'c.branch&&c.tier===2');
  const t3 = cartePool(m.sb, "c.branch==='" + t2.branch + "'&&c.tier===3");
  m.G.branchTiers = m.G.branchTiers || {}; m.G.branchTiers[t2.branch] = 2;
  for (const n of [m.jup, m.mar]) { n.cards.push(Object.assign({}, t2)); n.res.energy = 20; n.res.materials = 20; n.res.science = 20; n.acLeft = 3; }
  note('branche ' + t2.branch + ' · rang 3 : ' + t3.name + ' · les deux IA ont ' + t2.name);
  const c1 = m.sb._aiBestStratFromPool(m.jup, pool);
  if (c1 && c1.id === 'st10') ok('elle prend Initiative : jouer avant le rival pour ' + t3.name); else ko('elle prend ' + (c1 && c1.name) + ' au lieu d\'Initiative');
  /* Pas les moyens ce tour (0 science), mais le rival oui : elle planifie. */
  m.jup.res.science = 0;
  const c2 = m.sb._aiBestStratFromPool(m.jup, pool);
  if (c2 && c2.id === 'st11') ok('sans les moyens ce tour : Initiative planifiée'); else ko('sans moyens : ' + (c2 && c2.name));
  /* CONTRE-ÉPREUVE : pas de rival sur la branche → Mobilisation, comme avant. */
  m.jup.res.science = 20; m.mar.cards = m.mar.cards.filter(c => c.id !== t2.id);
  const c3 = m.sb._aiBestStratFromPool(m.jup, pool);
  if (c3 && c3.id === 'st6') ok('CONTRE-ÉPREUVE : sans course, Mobilisation d\'abord'); else ko('sans course : ' + (c3 && c3.name));
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Initiative et Initiative planifiée : l\'ordre du tour obéit, tout le monde le sait, l\'IA s\'en sert.');
console.log('═'.repeat(84));
