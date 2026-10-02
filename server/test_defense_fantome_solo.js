/* ============================================================================
   TEST — PLUS DE DÉFENSE FANTÔME EN SOLO (Marc, 02/10)
   ----------------------------------------------------------------------------
   Marc (appli mobile, guerre contre les Jupitériens) : « Défense de Colonie … choisis tes
   jetons », deux icônes, un conseil, « ⚠️ L'IA en profite pour attaquer pendant que tu
   recules », pas de Supercroiseur proposé alors qu'il en avait un payable — puis, après
   validation, AUCUN écran de résultat et la fin de tour qui arrive.

   CAUSE. En SOLO, `showWarCombatModal` tirait encore une POSTURE AU HASARD pour l'ordinateur
   (`Math.random()>0.35` → « attack ») et une CIBLE AU HASARD, affichait « Répondre à
   l'attaque — l'IA menace X », et « Tenir position » ouvrait `warDefendTarget` : la vieille
   fenêtre sans garnison, sans Empathes, sans Supercroiseur. Sa réponse « DEFEND:n » arrivait
   dans `guerreCombatLiveChoisi`, qui la traite comme « tenir » — rien n'est résolu, rien n'est
   affiché. Le VRAI assaut de l'ordinateur se décide après (`maybeAiAssaultPlayer`), avec SA
   fenêtre (garnison, Empathes, Supercroiseur). Le même fantôme avait été retiré EN LIGNE le
   05/09 (partie 09A0) — pas en solo.

   CE QUE CE BANC VERROUILLE (guerre `live`, tirage forcé vers « attack ») :
     · la posture de l'ordinateur reste « hold » et aucune cible n'est tirée ;
     · la fenêtre ne propose plus « Répondre à l'attaque » ;
     · « Tenir position » répond STANDOFF (pas DEFEND:n) et n'ouvre pas la vieille fenêtre ;
     · CONTRE-ÉPREUVE : le même montage avec l'ancien tirage produit bien le fantôme.

   Usage : node test_defense_fantome_solo.js
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

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['jupiteriens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.materials = 20; moi.res.energy = 20; moi.forceTokens = 8;
  moi.colonies.push({ nodeId: 'io', level: 2, connected: true });
  ia.forceTokens = 6; ia.res.materials = 20; ia.res.energy = 20;
  G.warWith = ia.civ.id;
  G.wars = [{ a: moi.civ.id, b: ia.civ.id, turnsLeft: 99, live: true, declaredBy: 'other', agresseurCiv: ia.civ.id, wins: { player: 0, ai: 0 }, winsBy: {} }];
  G.warState = 'active'; G.warTurnsLeft = 99;
  vm.runInContext(`_aUnEcran = function(){ return true; };`, sb);
  // Le décor n'a ni parent ni classes : on lui prête ce que le dessin touche.
  sb.document.getElementById('wcm-slider').parentElement = sb.document.getElementById('__wcm-slider-parent');
  const wcm = sb.document.getElementById('war-combat-modal'); wcm._cachee = null;
  wcm.classList.add = c => { if (c === 'hidden') wcm._cachee = true; };
  wcm.classList.remove = c => { if (c === 'hidden') wcm._cachee = false; };
  // Tirage FORCÉ : l'ancien code choisissait « attack » dès que random > .35
  vm.runInContext(`Math.random = function(){ return 0.9; };`, sb);
  // La suite du choix ne doit pas dérouler toute la guerre : on l'observe seulement.
  vm.runInContext(`var __reponses=[]; _combatSuiteLire = function(){ return function(v){ __reponses.push(String(v)); }; };`, sb);
  return { sb, G, moi, ia };
}
function texte(sb, id) {
  const el = sb.document.getElementById(id);
  return String((el && (el.innerHTML || el.textContent)) || '').replace(/<[^>]+>/g, '');
}

console.log('═'.repeat(84));
console.log('DÉFENSE FANTÔME EN SOLO — la vieille fenêtre ne doit plus s\'ouvrir');
console.log('═'.repeat(84) + '\n');

console.log('1. Guerre live, tirage forcé vers « attack » : la fenêtre de combat ne menace pas');
const m = montage();
try { m.sb.showWarCombatModal('guerreCombatLiveChoisi'); } catch (e) { note('(dessin interrompu : ' + e.message + ')'); }
const info = texte(m.sb, 'wcm-info');
if ((m.G._aiWarStance || 'hold') === 'hold') ok('posture de l\'ordinateur : hold'); else ko('posture tirée au hasard : ' + m.G._aiWarStance);
if (!m.G._aiWarTarget) ok('aucune cible fantôme tirée'); else ko('cible fantôme : ' + JSON.stringify(m.G._aiWarTarget));
if (!/Répondre à l'attaque|menace/.test(info)) ok('pas de « Répondre à l\'attaque » dans la fenêtre'); else ko('la fenêtre menace encore : ' + info.slice(0, 160));

console.log('\n2. « Tenir position » répond STANDOFF et n\'ouvre pas la vieille fenêtre de défense');
try { m.sb.warHoldPosition(); } catch (e) { note('(interrompu : ' + e.message + ')'); }
const reps = vm.runInContext('__reponses', m.sb);
if (reps.length === 1 && reps[0] === 'STANDOFF') ok('réponse : STANDOFF'); else ko('réponse(s) : ' + JSON.stringify(reps));
const sub = texte(m.sb, 'wcm-sub');
if (!/Défense de/.test(sub)) ok('pas de « Défense de … » (vieille fenêtre)'); else ko('vieille fenêtre ouverte : ' + sub);
if (m.sb.document.getElementById('war-combat-modal')._cachee === true) ok('fenêtre de combat refermée'); else ko('fenêtre de combat encore ouverte');

console.log('\n3. CONTRE-ÉPREUVE : l\'ancien tirage produit bien le fantôme');
const c = montage();
vm.runInContext(`G._aiWarStance='attack'; G._aiWarTarget={type:'colony',name:'Io',obj:G.player.colonies.find(x=>x.nodeId==='io')};`, c.sb);
try { c.sb.warHoldPosition(); } catch (e) { note('(interrompu : ' + e.message + ')'); }
const subC = texte(c.sb, 'wcm-sub');
if (/Défense de/.test(subC)) ok('le banc sait voir la vieille fenêtre : « ' + subC.slice(0, 60) + ' »'); else ko('la contre-épreuve ne voit pas la vieille fenêtre : ' + subC);

console.log('\n4. Après la vieille fenêtre, la fenêtre d\'ASSAUT retrouve son bouton « Engager » (Marc : « bouton Défendre au lieu d\'attaquer »)');
{
  const m = montage();
  const btns = m.sb.document.getElementById('__atk-btns');
  m.sb.document.getElementById('war-combat-modal').querySelector = () => btns;
  btns.innerHTML = '<button onclick="confirmWarDefense()">Défendre avec ces jetons</button>';   // ce que laissait warDefendTarget
  vm.runInContext(`_warSliderMode='defend'; _warAttackColonyTarget='io';`, m.sb);
  m.G.warWith = m.ia.civ.id; m.ia.colonies.push({ nodeId: 'callisto', level: 1, connected: true });
  try { m.sb._warSelectColonyTarget('callisto'); } catch (e) { note('(dessin interrompu : ' + e.message + ')'); }
  if (/confirmWarCombat/.test(btns.innerHTML) && !/confirmWarDefense/.test(btns.innerHTML)) ok('boutons Annuler / Engager remis en place'); else ko('boutons encore en mode défense : ' + btns.innerHTML.slice(0, 120));
  if (vm.runInContext('_warSliderMode', m.sb) === 'attack') ok('curseur en mode attaque'); else ko('curseur resté en mode ' + vm.runInContext('_warSliderMode', m.sb));
}

console.log('\n5. « DEFEND:2 » arrivant au combat vaut 2 jetons, pas « DEFEND:2000 »');
{
  const m = montage();
  m.ia.colonies.push({ nodeId: 'callisto', level: 1, connected: true });
  m.moi.forceTokens = 6; m.ia.forceTokens = 1;
  vm.runInContext(`_warAttackColonyTarget='callisto';`, m.sb);
  m.G._aiWarCommitted = 1;
  const r = m.sb.resolveWarCombat('DEFEND:5', m.moi);
  note('puissance : ' + (r && r.pPow) + ' contre ' + (r && r.aPow) + ' → ' + (r && r.cls));
  if (r && typeof r.pPow === 'number' && r.pPow === 5) ok('5 jetons engagés'); else ko('puissance lue : ' + JSON.stringify(r && r.pPow));
  if (r && r.cls === 'win') ok('victoire 5 contre 2, pas « égalité » par comparaison de chaînes'); else ko('résultat : ' + (r && r.cls));
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); }
console.log('✅ Aucun écart'); process.exit(0);
