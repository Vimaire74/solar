/* ============================================================================
   TEST — ARMADA SOLAIRE : CE QU'ON COMPTE
   ----------------------------------------------------------------------------
   Partie 083E : deux nations sur trois avaient cet agenda, elles ont fini à 9 et à 0 jetons.
   Marc, 05/09 : « On doit compter tous les jetons, on ignore ceux en cooldown, on ne compte pas ceux
   qui sont perdus au combat, on ne compte pas les défenses de colonies, mais on compte ceux bloqués
   sur les routes, on compte le bonus empathe. Comme ça c'est moins dur. Compter le cooldown c'est
   salaud. »

   RÈGLE VERROUILLÉE ICI — `armadaCompte` = réserve + récupération + jetons posés sur les routes
   + bonus de combat des cartes empathes.
     1. la récupération compte (c'est le point de départ : un jeton qui revient n'est pas perdu) ;
     2. les jetons posés sur les routes comptent — ils existent, ils sont simplement occupés ;
     3. le bonus empathe compte, bien que ce ne soient pas des jetons : décision de Marc, pour
        rendre l'agenda atteignable ;
     4. CONTRE-ÉPREUVE — les garnisons de colonies ne comptent PAS (elles ne sortent jamais de la
        réserve : les ajouter reviendrait à compter deux fois), et un jeton DÉTRUIT au combat ne
        compte pas non plus ;
     5. l'agenda et le compte lisent la MÊME fonction : à 15, +8 VP ; à 14, rien.

   Usage : node test_armada.js
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
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const p = G.player;
  p._isAI = false;
  p.forceTokens = 6; p.forceCooldown = []; p.routes = [];
  vm.runInContext("G.player.agenda=AGENDAS_POOL.find(a=>a.id==='ag4');", sb);
  return { sb, G, p };
}
const compte = m => m.sb.armadaCompte(m.p);
const vp = m => m.p.agenda.score(m.p);

console.log('═'.repeat(84));
console.log('ARMADA SOLAIRE — RÉSERVE + RÉCUPÉRATION + ROUTES + BONUS EMPATHE');
console.log('═'.repeat(84) + '\n');

/* ── 1. Les quatre postes ──────────────────────────────────────────────────── */
console.log('1. Les quatre postes comptent, et chacun se voit');
{
  const m = montage();
  note('réserve seule (6) → ' + compte(m));
  if (compte(m) === 6) ok('réserve : 6');
  else ko('réserve seule comptée ' + compte(m));

  m.p.forceCooldown.push({ count: 4, returnTurn: 10 });
  note('+ 4 en récupération → ' + compte(m));
  if (compte(m) === 10) ok('la récupération compte — « compter le cooldown c\'est salaud »');
  else ko('avec récupération : ' + compte(m) + ' au lieu de 10');

  m.p.routes.push({ from: 'lune', to: 'vesta', tokens: 1 }, { from: 'lune', to: 'ceres', tokens: 2 });
  note('+ 3 posés sur des routes → ' + compte(m));
  if (compte(m) === 13) ok('les jetons posés sur les routes comptent');
  else ko('avec routes : ' + compte(m) + ' au lieu de 13');

  vm.runInContext("G.player.cards.push(CARDS_POOL.find(c=>c.id==='liens1'))", m.sb);
  note('+ Liens Empathes (+2) → ' + compte(m));
  if (compte(m) === 15) ok('le bonus empathe compte : 15 atteint');
  else ko('avec Liens Empathes : ' + compte(m) + ' au lieu de 15');
  if (vp(m) === 8) ok('et l\'agenda paie ses +8 VP — il lit la même fonction');
  else ko('agenda à ' + vp(m) + ' VP alors que le compte est ' + compte(m));
}

/* ── 2. CONTRE-ÉPREUVE — ce qui ne compte pas ─────────────────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — garnisons de colonies et jetons détruits ne comptent pas');
{
  const m = montage();
  m.p.forceCooldown.push({ count: 9, returnTurn: 10 });        // 6 + 9 = 15
  const avant = compte(m);
  m.p.colonies.push({ nodeId: 'ceres', level: 2, connected: true }, { nodeId: 'vesta', level: 1, connected: true });
  note('deux colonies de plus (donc deux garnisons) : ' + avant + ' → ' + compte(m));
  if (compte(m) === avant) ok('les garnisons n\'ajoutent rien — elles ne sortent jamais de la réserve');
  else ko('les garnisons gonflent le compte (' + avant + ' → ' + compte(m) + ')');

  /* Un combat perdu détruit définitivement la moitié des jetons engagés : ils ne doivent
     réapparaître nulle part. On passe par la vraie fonction du moteur. */
  const av2 = compte(m);
  m.p.res.materials = 10; m.p.res.energy = 10;
  m.sb.applyCombatEngage(m.p, 4, false);                        // 4 engagés, combat PERDU
  const ap = compte(m);
  note('4 jetons engagés dans un combat perdu : ' + av2 + ' → ' + ap);
  if (ap < av2) ok('le compte baisse de ' + (av2 - ap) + ' : les jetons détruits ne comptent plus');
  else ko('un combat perdu n\'a rien retiré du compte (' + av2 + ' → ' + ap + ')');
  if (ap >= av2 - 4) ok('mais les rescapés, eux, sont toujours là (en récupération)');
  else ko('trop de jetons retirés : ' + (av2 - ap) + ' pour 4 engagés');
}

/* ── 3. Le seuil ───────────────────────────────────────────────────────────── */
console.log('\n3. Le seuil est bien 15 : 14 ne paie pas');
{
  const m = montage();
  m.p.forceTokens = 14;
  note('14 → ' + compte(m) + ' · agenda ' + vp(m) + ' VP');
  if (vp(m) === 0) ok('14 : rien');
  else ko('14 jetons paient déjà ' + vp(m) + ' VP');
  m.p.forceTokens = 15;
  note('15 → ' + compte(m) + ' · agenda ' + vp(m) + ' VP');
  if (vp(m) === 8) ok('15 : +8 VP');
  else ko('15 jetons paient ' + vp(m) + ' VP');
}

/* ── 4. Ce que la règle écrite annonce ─────────────────────────────────────── */
console.log('\n4. La carte et les règles annoncent ce que le code compte');
{
  const m = montage();
  const desc = String(m.p.agenda.desc || '');
  note('carte : ' + desc);
  const dit = k => new RegExp(k, 'i').test(desc);
  if (dit('routes') && dit('empathe') && dit('récupération')) ok('la carte cite les trois postes ajoutés');
  else ko('la carte n\'annonce pas ce qu\'elle compte : « ' + desc + ' »');
  const fs = require('fs');
  const regles = fs.readFileSync(path.join(__dirname, '..', 'regles.html'), 'utf8');
  const ligne = (regles.split('\n').find(l => /Armada solaire/i.test(l)) || '');
  if (/routes/i.test(ligne) && /empathe/i.test(ligne) && /garnison/i.test(ligne)) ok('regles.html dit la même chose, y compris ce qui ne compte pas');
  else ko('regles.html : « ' + ligne.replace(/<[^>]+>/g, ' ').trim().slice(0, 110) + ' »');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Armada Solaire compte la flotte qu\'on a vraiment construite — pas celle qu\'on a perdue.');
console.log('═'.repeat(84));
