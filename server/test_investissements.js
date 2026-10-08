/* ============================================================================
   TEST — INVESTISSEMENTS : DURÉE RÉELLE, ET RIEN DE GRATUIT
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-09 : « Recherche intensive ne donne pas le bonus science
   escompté pendant les trois tours » et « il faudrait aussi que le jeu évalue la
   possibilité de les payer au moment du choix et bloquer ce qui peut pas être payé ».

   Deux défauts distincts se cachaient là :

   1. LA DURÉE. Le décompte de fin d'investissement remettait à zéro `matX2`, `sciX2`,
      `matHalf` et `moraleBonus` — mais PAS `matBonus` (Industrialisation) ni `sciBonus`
      (Recherche Intensive). Ces deux-là ne s'arrêtaient donc jamais. Trois versions de la
      même règle cohabitaient : le texte des cartes disait « T3→T5 », le journal disait
      « actifs jusqu'au tour 10 », le code disait « pour toujours ». Marc a tranché :
      trois tours.

   2. LE PAIEMENT. Chaque `applyCost` retirait sa contrepartie en `Math.max(0, …)` : sans
      les ressources, le compteur s'arrêtait à zéro et le bénéfice était encaissé
      GRATUITEMENT. C'est le point le plus grave des deux — il récompensait la pauvreté.

   CE QUE CE TEST VÉRIFIE :
     · le coût déclaré (`cout`) correspond à ce que `applyCost` prélève réellement — sans
       quoi le grisage mentirait au joueur ;
     · `investPayable` dit non quand il manque une ressource, oui sinon ;
     · une carte impayable n'a AUCUN effet : ni bénéfice, ni prélèvement partiel ;
     · les bonus de revenu s'éteignent bien après trois tours.

   Usage : node test_investissements.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }

const RES = ['energy', 'materials', 'science', 'morale'];
function nation(res) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const p = sb.__G.player;
  p.res = Object.assign({ energy: 20, materials: 20, science: 20, morale: 8 }, res || {});
  return { sb, p };
}
/* Les deux jeux de cartes vivent dans le contexte (ce sont des `const` de moteur.js). */
function cartes(sb, niveau) {
  return vm.runInContext('(' + (niveau === 2 ? 'INVESTMENT_CARDS_2' : 'INVESTMENT_CARDS')
    + ').map(c=>({id:c.id,name:c.name,cout:c.cout||{}}))', sb);
}

console.log('═'.repeat(74));
console.log('INVESTISSEMENTS — DURÉE ET PAIEMENT');
console.log('═'.repeat(74) + '\n');

/* ── 1. Le coût DÉCLARÉ est-il le coût PRÉLEVÉ ? ──────────────────────────── */
console.log('1. Le coût déclaré correspond-il au prélèvement réel ?');
for (const niveau of [1, 2]) {
  const ref = nation();
  for (const c of cartes(ref.sb, niveau)) {
    const { sb, p } = nation();                       // large provision : rien ne plafonne à 0
    const av = {}; for (const r of RES) av[r] = p.res[r] || 0;
    vm.runInContext('(' + (niveau === 2 ? 'INVESTMENT_CARDS_2' : 'INVESTMENT_CARDS')
      + ').find(x=>x.id===' + JSON.stringify(c.id) + ').applyCost(G,G.player)', sb);
    const pris = {}; for (const r of RES) { const d = av[r] - (p.res[r] || 0); if (d) pris[r] = d; }
    // Colonies Avancées (07/10) : −8🪨 −3⚡ prélevés et déclarés — plus d'exception.
    const declare = c.cout || {};
    const memes = Object.keys(pris).length === Object.keys(declare).length
      && Object.keys(pris).every(r => pris[r] === declare[r]);
    if (memes) ok(c.name + ' — déclaré ' + JSON.stringify(declare) + ', prélevé ' + JSON.stringify(pris));
    else ko(c.name + ' — DÉCLARÉ ' + JSON.stringify(declare) + ' mais PRÉLEVÉ ' + JSON.stringify(pris)
      + ' : le grisage mentirait au joueur');
  }
}

/* ── 2. investPayable ─────────────────────────────────────────────────────── */
console.log('\n2. « Peut-on payer ? »');
{
  const riche = nation({ materials: 20, energy: 20, science: 20, morale: 8 });
  const pauvre = nation({ materials: 0, energy: 0, science: 0, morale: 0 });
  const carteDe = (o, id, niv) => vm.runInContext(
    '(' + (niv === 2 ? 'INVESTMENT_CARDS_2' : 'INVESTMENT_CARDS') + ').find(x=>x.id===' + JSON.stringify(id) + ')', o.sb);

  const rec = carteDe(riche, 'inv_rec', 1);
  if (riche.sb.investPayable(rec, riche.p)) ok('Recherche Intensive : payable avec 20🪨 20⚡');
  else ko('Recherche Intensive jugée impayable alors que tout est là');

  const recP = carteDe(pauvre, 'inv_rec', 1);
  if (!pauvre.sb.investPayable(recP, pauvre.p)) ok('Recherche Intensive : impayable à sec');
  else ko('Recherche Intensive jugée payable à 0 ressource');

  const juste = nation({ materials: 3, energy: 1, science: 0, morale: 0 });
  if (juste.sb.investPayable(carteDe(juste, 'inv_rec', 1), juste.p)) ok('exactement 3🪨 1⚡ : payable (pile le compte)');
  else ko('3🪨 1⚡ jugés insuffisants pour un coût de 3🪨 1⚡');

  const presque = nation({ materials: 2, energy: 1 });
  const m = presque.sb.investManque(carteDe(presque, 'inv_rec', 1), presque.p).join(' ');
  if (m) ok('le manque est chiffré : « ' + m.replace(/<[^>]*>/g, '') + ' »');
  else ko('aucun manque annoncé alors qu\'il manque 1🪨');

  const esp = carteDe(pauvre, 'inv_esp', 1);
  if (pauvre.sb.investPayable(esp, pauvre.p)) ok('Espionnage : payable même à sec (il ne coûte que de la tension)');
  else ko('Espionnage bloqué alors qu\'il n\'a aucun coût en ressources');
}

/* ── 3. Une carte impayable ne fait RIEN ──────────────────────────────────── */
console.log('\n3. Une carte impayable n\'a aucun effet');
{
  const { sb, p } = nation({ materials: 1, energy: 0, science: 5, morale: 5 });
  const carte = vm.runInContext('INVESTMENT_CARDS.find(x=>x.id==="inv_rec")', sb);
  const av = {}; for (const r of RES) av[r] = p.res[r] || 0;
  const applique = sb.investAppliquer(carte, p);
  const bouge = RES.filter(r => (p.res[r] || 0) !== av[r]);
  if (!applique) ok('investAppliquer refuse la carte');
  else ko('la carte a été appliquée alors qu\'elle est impayable');
  if (!bouge.length) ok('aucune ressource prélevée (pas de paiement partiel)');
  else ko('des ressources ont bougé : ' + bouge.join(', '));
  if (!(p.investBonus && p.investBonus.sciBonus)) ok('aucun bénéfice accordé');
  else ko('LE BÉNÉFICE A ÉTÉ ACCORDÉ GRATUITEMENT (sciBonus=' + p.investBonus.sciBonus + ')');

  // Et le cas normal, pour ne pas prouver seulement que la fonction refuse tout.
  const riche = nation();
  const c2 = vm.runInContext('INVESTMENT_CARDS.find(x=>x.id==="inv_rec")', riche.sb);
  if (riche.sb.investAppliquer(c2, riche.p) && riche.p.investBonus && riche.p.investBonus.sciBonus === 3)
    ok('avec les ressources, la même carte s\'applique normalement (+3🔬/tour)');
  else ko('la carte ne s\'applique pas alors que les ressources sont là');
}

/* ── 4. Trois tours, puis extinction ──────────────────────────────────────── */
console.log('\n4. Les bonus s\'éteignent après trois tours');
for (const [champ, valeur, nom] of [['sciBonus', 3, 'Recherche Intensive'], ['matBonus', 4, 'Industrialisation'],
                                    ['moraleBonus', 2, 'Agriculture Durable']]) {
  const { sb, p } = nation();
  p.investBonus = { turnsLeft: 4 }; p.investBonus[champ] = valeur;   // 4 = ce que pose applyInvestments
  const vus = [];
  for (let t = 0; t < 5; t++) {
    // Un tour = un décompte. On reproduit exactement le décompte de `_startTurnBegin`.
    if (p.investBonus.turnsLeft !== undefined) {
      p.investBonus.turnsLeft--;
      if (p.investBonus.turnsLeft === 0) {   // `===` et non `<=` : sinon le message d'expiration
                                             // se répète à chaque tour suivant (journal de Marc,
                                             // partie CC36 : trois fois « Niv.1 expiré »).
        p.investBonus.matX2 = false; p.investBonus.sciX2 = false; p.investBonus.matHalf = false;
        p.investBonus.moraleBonus = 0; p.investBonus.matBonus = 0; p.investBonus.sciBonus = 0;
      }
    }
    vus.push(p.investBonus[champ] || 0);
  }
  // T3, T4, T5 actifs ; éteint ensuite.
  const attendu = [valeur, valeur, valeur, 0, 0];
  if (vus.join(',') === attendu.join(',')) ok(nom + ' : ' + vus.join(' → ') + ' (trois tours, puis rien)');
  else ko(nom + ' : ' + vus.join(' → ') + ' au lieu de ' + attendu.join(' → '));
}
/* Le décompte ci-dessus est une COPIE de celui du moteur : il prouve la règle, pas le code.
   On vérifie donc aussi que le moteur remet bien ces deux champs à zéro — c'est la ligne
   exacte qui manquait. */
{
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  /* On délimite le bloc par ses deux bornes RÉELLES : l'ouverture du test d'expiration et la
     ligne de journal qui le clôt. Un `[\s\S]*?\}` s'arrêtait au premier `}` venu — celui d'un
     commentaire — et le test échouait sur du code pourtant correct. */
  const i0 = src.indexOf('if(p.investBonus.turnsLeft===0){');
  const i1 = src.indexOf('Niv.1 expiré', i0);   // le texte a changé (la nation est nommée) : on borne sur la partie stable
  const txt = (i0 >= 0 && i1 > i0) ? src.slice(i0, i1) : '';
  if (/matBonus\s*=\s*0/.test(txt) && /sciBonus\s*=\s*0/.test(txt))
    ok('le moteur remet bien matBonus ET sciBonus à zéro à l\'expiration');
  else ko('le moteur n\'éteint pas matBonus/sciBonus : les bonus dureraient toute la partie');
}

console.log('\n' + '═'.repeat(74));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Investissements : coûts honnêtes, rien de gratuit, trois tours puis extinction.');
console.log('═'.repeat(74));
