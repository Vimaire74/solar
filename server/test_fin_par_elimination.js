/* ============================================================================
   TEST — LA PARTIE S'ARRÊTE QUAND IL NE RESTE QU'UNE NATION
   ----------------------------------------------------------------------------
   POURQUOI. Marc, rapport de bug de la partie 821C (23/09) : « le jeu devrait s'arrêter à
   deux si j'élimine l'autre. Victoire totale par élimination. J'ai fait le tour 10 pour
   rien. » Le journal le montre : au tour 9 les Jupitériens perdent leur dernière colonie et
   le jeu écrit « cette nation ne joue plus », puis déroule un tour 10 entier où il ne reste
   qu'un joueur face à personne.

   LA RÈGLE POSÉE. Dès qu'il ne reste qu'UNE nation en jeu, la partie s'achève — victoire
   totale par élimination. L'arrêt se fait À LA FIN DU TOUR, pas au milieu : la surproduction
   et l'écrêtage du tour en cours sont dus, et couper une manche en deux laisserait des
   fenêtres en vol. Le tour où l'élimination a lieu se termine donc normalement ; c'est le
   SUIVANT qui n'a plus lieu d'être.

   CE QUE CE BANC VERROUILLE :
     · une seule nation encore en jeu à la fin d'un tour → `G.phase === 'over'`, et le tour
       n'avance pas ;
     · CONTRE-ÉPREUVE, deux nations vivantes → la partie continue, le tour avance ;
     · CONTRE-ÉPREUVE, à quatre nations dont une éliminée → la partie continue aussi (il en
       reste trois), sinon on aurait « corrigé » en arrêtant à la première élimination.

   Usage : node test_fin_par_elimination.js
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

/* `continueAfterEOT` commence par toucher la fenêtre de bilan. Sans écran, `getElementById`
   rend null et la fonction casserait avant d'arriver à la règle qu'on mesure. On pose donc un
   élément factice — c'est un détail de banc d'essai, pas une modification du jeu. */
function montage(adversaires) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', adversaires);
  const G = sb.__G;
  G.turn = 4; G.maxTurns = 10; G.phase = 'actions';
  G.player._isAI = false;
  vm.runInContext(`
    (function(){
      var vrai = document.getElementById;
      document.getElementById = function(id){
        var e = vrai.call(document, id);
        if (e) return e;
        return { classList:{add:function(){},remove:function(){},contains:function(){return false;}},
                 style:{}, dataset:{}, textContent:'', innerHTML:'', appendChild:function(){},
                 querySelector:function(){return null;}, remove:function(){} };
      };
    })();
  `, sb);
  return { sb, G };
}

/* Éliminer une nation, c'est lui retirer ses colonies — c'est la définition du moteur
   (`estEliminee` : plus aucune colonie). */
function eliminer(nat) { nat.colonies = []; }

function finDeTour(sb) {
  try { sb.continueAfterEOT(); } catch (e) { note('(exception pendant la fin de tour : ' + e.message + ')'); }
}

console.log('═'.repeat(84));
console.log('FIN DE PARTIE — UNE NATION SEULE NE JOUE PAS CONTRE PERSONNE');
console.log('═'.repeat(84) + '\n');

console.log('1. Deux nations, l\'adversaire est éliminé : la partie s\'achève');
{
  const { sb, G } = montage(['jupiteriens']);
  eliminer(G.ais[0]);
  const tourAvant = G.turn;
  note('nations encore en jeu : ' + sb.nationsEnJeu().length + ' · tour ' + tourAvant + '/' + G.maxTurns);
  finDeTour(sb);
  if (G.phase === 'over') ok('la partie est terminée (phase « over »)');
  else ko('la partie continue — phase « ' + G.phase + ' » au lieu de « over »');
  if (G.turn === tourAvant) ok('le tour n\'a pas avancé');
  else ko('le tour est passé de ' + tourAvant + ' à ' + G.turn + ' — un tour joué pour rien');
}

console.log('\n2. CONTRE-ÉPREUVE — deux nations vivantes : la partie continue');
{
  const { sb, G } = montage(['jupiteriens']);
  const tourAvant = G.turn;
  note('nations encore en jeu : ' + sb.nationsEnJeu().length);
  finDeTour(sb);
  if (G.phase === 'over') ko('la partie s\'est arrêtée alors que deux nations jouent encore');
  else ok('la partie continue, comme elle le doit');
  if (G.turn > tourAvant) ok('le tour est passé à ' + G.turn);
  else note('(le tour n\'a pas avancé : investissement ou bilan en attente — pas un écart)');
}

console.log('\n3. CONTRE-ÉPREUVE — quatre nations dont une éliminée : la partie continue');
{
  /* Sans ce point, on « corrigerait » en arrêtant dès la première élimination, et le §1
     serait vert pendant qu'une partie à quatre s'interromprait au premier éliminé. */
  const { sb, G } = montage(['martiens', 'jupiteriens', 'ceinturiens']);
  eliminer(G.ais[0]);
  note('nations encore en jeu : ' + sb.nationsEnJeu().length + ' (une éliminée sur quatre)');
  finDeTour(sb);
  if (G.phase === 'over') ko('la partie s\'est arrêtée alors qu\'il reste trois nations');
  else ok('la partie continue avec les trois nations restantes');
}

console.log('\n4. CONTRE-ÉPREUVE — le banc sait reconnaître une nation éliminée');
{
  /* Sans ce point, un §1 vert pourrait venir d'un montage qui n'élimine rien. */
  const { sb, G } = montage(['jupiteriens']);
  if (sb.nationsEnJeu().length !== 2) ko('au départ, les deux nations ne sont pas comptées en jeu');
  eliminer(G.ais[0]);
  if (sb.nationsEnJeu().length === 1) ok('retirer les colonies retire bien la nation du décompte');
  else ko('après élimination, ' + sb.nationsEnJeu().length + ' nation(s) comptée(s) au lieu d\'une');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Une nation seule ne joue plus de tour : la partie est close.');
console.log('═'.repeat(84));
