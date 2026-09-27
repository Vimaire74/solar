/* ============================================================================
   TEST — UNE TECHNOLOGIE QUE TU POSSÈDES N'EST JAMAIS ATTÉNUÉE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, captures du 26/09 : « la tech hyperpropulsion est grisée dans la
   présentation en format réduit alors qu'elle est à moi, et que les autres tech à moi ont une
   présentation plus lumineuse ».

   CE N'ÉTAIT PAS HYPERPROPULSION, C'ÉTAIT LE RANG 3. `isTechExclusive` rend vrai dès
   `tier >= 3` : le rang 3 est réservé à son premier acheteur. Quand Marc achète une T3, c'est
   DONC SON PROPRE ACHAT qui remplit `G.techTaken`. La ligne compacte passait ensuite
   `bloque: _cornee || exclusiveTaken` — vrai — et recevait `.al-bloc`, c'est-à-dire
   `opacity:.55`. Les SEPT technologies de rang 3 étaient concernées, jamais les rangs 1 et 2 :
   exactement l'écart de luminosité que Marc décrit entre ses propres cartes.

   Le reste de la même ligne était pourtant juste : `compactStatus` et le prix testent
   `playerOwned` AVANT `exclusiveTaken`, et affichent bien « ✓ À toi ». Seul le drapeau
   d'atténuation avait été écrit sans cette précédence.

   LA RÈGLE, déjà écrite en commentaire dans `renderTechTree` (Marc, 08/08) : « une technologie
   déjà acquise garde ses propres marques (✓ et ⛔) — deux signalétiques sur la même carte se
   neutralisent ». Donc : possédée → jamais atténuée, quel que soit le rang. Prise par une AUTRE
   nation → atténuée, c'est son sens.

   CE QUE CE BANC VERROUILLE :
     · une T3 possédée porte `al-mien` et PAS `al-bloc` ;
     · une T1 possédée non plus (elle était déjà correcte — on ne la casse pas) ;
     · CONTRE-ÉPREUVE : une T3 prise par une autre nation EST atténuée ;
     · CONTRE-ÉPREUVE : une carte bloquée par un prérequis EST atténuée ;
     · CONTRE-ÉPREUVE : le banc sait distinguer les deux classes sur une ligne fabriquée.

   Usage : node test_tech_mienne_pas_grisee.js
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
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  G.player._isAI = false;
  G.player.acLeft = 4;
  G.player.res = { energy: 30, materials: 30, science: 30, morale: 8 };
  const pool = vm.runInContext('CARDS_POOL', sb);
  const parRang = (branche, rang) => pool.find(c => c.branch === branche && c.tier === rang);

  /* Ce que Marc a en main : une T3 (Hyperpropulsion) et une T1, toutes deux à lui. */
  const t3Mienne = parRang('navigation', 3);
  const t1Mienne = parRang('expansion', 1);
  /* Une T3 prise par l'adversaire, dont Marc a bien les prérequis : elle DOIT rester atténuée. */
  const t3Adverse = parRang('ia_renseignement', 3);
  /* Une carte dont le palier n'est pas ouvert : elle DOIT rester atténuée aussi. */
  const t3Fermee = parRang('mines_energie', 3);

  G.branchTiers.navigation = 3;
  G.branchTiers.expansion = 1;
  G.branchTiers.ia_renseignement = 2;
  G.branchTiers.mines_energie = 0;          // palier T3 fermé

  G.player.cards.push(t3Mienne, t1Mienne);
  G.techTaken.add(t3Mienne.id);             // c'est SON achat qui remplit la table
  G.techTaken.add(t1Mienne.id);
  G.ais[0].cards.push(t3Adverse);
  G.techTaken.add(t3Adverse.id);

  vm.runInContext('_aUnEcran = function(){ return true; };', sb);
  vm.runInContext('techCompactChoisi = function(){ return true; };', sb);   // format réduit
  return { sb, G, t3Mienne, t1Mienne, t3Adverse, t3Fermee };
}

/* Toutes les lignes compactes, avec leurs classes, lues dans le DOM. */
function lignes(sb) {
  try { sb.renderTechTree(); } catch (e) { note('(le dessin s\'interrompt : ' + e.message + ')'); }
  const el = sb.document.getElementById('tech-body');
  const html = String((el && el.innerHTML) || '');
  const out = [];
  const re = /<div class="(act-l[^"]*)"[^>]*>([\s\S]*?)(?=<div class="act-l|<\/div><\/div>|$)/g;
  let m;
  while ((m = re.exec(html))) out.push({ cls: m[1], corps: m[2] });
  return out;
}
/* ⚠️ ON REPÈRE LA LIGNE PAR SON NOM AFFICHÉ, PAS PAR LE MOT QUELQUE PART DEDANS. Premier jet :
   `corps.indexOf(nom)`, qui attrapait la ligne de la T1 de Navigation parce que SON EFFET cite
   « Hyperpropulsion » (« voir Hyperpropulsion pour le supprimer »). Le banc mesurait donc une
   carte non possédée et se trompait de diagnostic. Le nom vit dans `<span class="al-nom">`. */
const ligneDe = (ls, nom) => ls.find(l => l.corps.indexOf('class="al-nom">' + nom) !== -1);

console.log('═'.repeat(84));
console.log('FORMAT RÉDUIT — CE QUI EST À TOI RESTE EN PLEINE LUMIÈRE');
console.log('═'.repeat(84) + '\n');

const m = montage();
const ls = lignes(m.sb);

console.log('0. Le montage produit bien des lignes compactes');
{
  note('lignes trouvées : ' + ls.length);
  if (ls.length < 10) ko('trop peu de lignes — le format réduit n\'est pas actif, rien ne serait mesuré');
  else ok('le format réduit est actif');
}

console.log('\n1. Une technologie de rang 3 qui est à toi n\'est pas atténuée');
{
  const l = ligneDe(ls, m.t3Mienne.name);
  if (!l) { ko('ligne « ' + m.t3Mienne.name + ' » introuvable — le point ne mesure rien'); }
  else {
    note(m.t3Mienne.name + ' (T3) → classes : ' + l.cls);
    if (/\bal-bloc\b/.test(l.cls)) ko(m.t3Mienne.name + ' est atténuée alors qu\'elle est à toi — c\'est le défaut des captures du 26/09');
    else ok('pas d\'atténuation');
    if (/\bal-mien\b/.test(l.cls)) ok('et elle est marquée « à moi »');
    else ko('elle n\'est pas marquée « à moi »');
  }
}

console.log('\n2. Une technologie de rang 1 qui est à toi non plus (elle était déjà correcte)');
{
  const l = ligneDe(ls, m.t1Mienne.name);
  if (!l) { ko('ligne « ' + m.t1Mienne.name + ' » introuvable'); }
  else {
    note(m.t1Mienne.name + ' (T1) → classes : ' + l.cls);
    if (/\bal-bloc\b/.test(l.cls)) ko('le rang 1 possédé est devenu atténué — régression');
    else if (/\bal-mien\b/.test(l.cls)) ok('inchangée : à moi, pleine lumière');
    else ko('elle n\'est plus marquée « à moi »');
  }
}

console.log('\n3. CONTRE-ÉPREUVE — une T3 prise par une AUTRE nation reste atténuée');
{
  /* Sans ce point, on « corrigerait » en n'atténuant plus rien, et le joueur ne verrait plus
     qu'une technologie de rang 3 lui est définitivement fermée. */
  const l = ligneDe(ls, m.t3Adverse.name);
  if (!l) { ko('ligne « ' + m.t3Adverse.name + ' » introuvable'); }
  else {
    note(m.t3Adverse.name + ' (T3, prise par l\'adversaire) → classes : ' + l.cls);
    if (/\bal-mien\b/.test(l.cls)) ko('elle est marquée « à moi » alors qu\'elle est à l\'adversaire');
    else if (/\bal-bloc\b/.test(l.cls)) ok('atténuée : elle est bien fermée');
    else ko('elle n\'est plus atténuée — le joueur croira pouvoir l\'acheter');
  }
}

console.log('\n4. CONTRE-ÉPREUVE — une carte bloquée par un prérequis reste atténuée');
{
  const l = ligneDe(ls, m.t3Fermee.name);
  if (!l) { ko('ligne « ' + m.t3Fermee.name + ' » introuvable'); }
  else {
    note(m.t3Fermee.name + ' (T3, palier fermé) → classes : ' + l.cls);
    if (/\bal-bloc\b/.test(l.cls)) ok('atténuée : le palier n\'est pas ouvert');
    else ko('elle n\'est plus atténuée alors que son palier est fermé');
  }
}

console.log('\n5. CONTRE-ÉPREUVE — le banc sait distinguer les deux classes');
{
  const faux = '<div class="act-l al-bloc" style="--ac:#fff" onclick="x()"><span>Faux</span>';
  const lu = faux.match(/class="(act-l[^"]*)"/);
  if (lu && /\bal-bloc\b/.test(lu[1]) && !/\bal-mien\b/.test(lu[1])) ok('une ligne atténuée fabriquée est bien lue comme telle');
  else ko('la lecture des classes ne fonctionne pas — les points ci-dessus ne prouvent rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Toutes tes technologies se ressemblent, quel que soit leur rang.');
console.log('═'.repeat(84));
