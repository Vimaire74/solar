/* ============================================================================
   TEST — QUAND UNE PARTIE SE BLOQUE, LE MAIL DOIT DIRE POURQUOI
   ----------------------------------------------------------------------------
   POURQUOI. Partie 8280 (10/09). Le mail de blocage disait « Problèmes détectés :
   (aucun — la machine se croit saine, le blocage est ailleurs) ». Il disait vrai,
   et il était inutile. Or `driver.pump()` range depuis longtemps l'exception d'une
   fin de tour dans `this._eotErreur` — le champ qui dit POURQUOI le tour ne s'est
   pas soldé. PERSONNE ne le lisait, `diagnostiquer()` comprise. Le moteur avait
   peut-être déjà la réponse ; on a cherché à la main.

   CE QUI EST VÉRIFIÉ :
     1. (dynamique) une fin de tour qui lève remplit `_eotErreur` — message ET
        endroit — et `pump()` rend bien `idle` : c'est la situation du mail ;
     2. (dynamique) CONTRE-ÉPREUVE — un tour qui se solde normalement REMET le champ
        à zéro. Sans cela le mail accuserait une vieille exception sans rapport, ce
        qui est pire que pas de diagnostic du tout ;
     3. (statique) `diagnostiquer()` lit ce champ et le met dans le résumé ET dans
        le corps du mail. `server.js` n'exporte rien : ce point-là est un contrôle
        de source, et il est annoncé comme tel — il prouve le branchement, pas le
        texte reçu.

   Usage : node test_diagnostic_blocage.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const { GameDriver } = require('./driver.js');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);
const HTML = path.join(__dirname, '..', 'play.html');
const SERVER = path.join(__dirname, 'server.js');

console.log('═'.repeat(80));
console.log('DIAGNOSTIC DE BLOCAGE — LA CAUSE EST DÉJÀ ÉCRITE, IL FAUT LA LIRE');
console.log('═'.repeat(80) + '\n');

/* Une partie menée jusqu'à ce que tout le monde ait passé : le pilote clôt alors la
   manche et appelle `runEndOfRound`. C'est LÀ qu'on le fait échouer. */
/* ⚠️ `boot`, pas `setup` : c'est `boot` qui installe le puits de décisions. Sans lui,
   `_decisionActive()` est faux, `startInterleaved` prend le chemin SOLO, `_serverActionPhase`
   n'est jamais posé et `pump()` rend `idle` tout de suite — on croirait mesurer un blocage
   alors qu'on n'a pas même démarré la partie du serveur. */
function partiePrete() {
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'martiens', isAI: true },
          { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
  let r = d.pump();
  for (let i = 0; i < 80 && r.kind === 'decision'; i++) { r = d.answer(r.pending.id, {}); }
  return { d, r };
}
function passerToutLeMonde(d) {
  const G = d.sb.__G;
  for (const n of (G._order || d.roster)) n._passedRound = true;
}

console.log('1. Une fin de tour qui lève : le pilote retient la cause, et la partie se fige');
{
  const { d, r: depart } = partiePrete();
  let r = depart;
  note('phase d\'actions atteinte : pump rend « ' + r.kind + ' »');
  const vrai = d.sb.runEndOfRound;
  d.sb.runEndOfRound = function () { throw new Error('banc : la fin de tour a échoué'); };
  passerToutLeMonde(d);
  r = d.pump();
  const e = d._eotErreur;
  note('pump rend : ' + r.kind + ' · _eotErreur : ' + (e ? e.message : 'aucune')
     + (e && e.ou ? ' · ' + e.ou.slice(0, 60) : ''));
  if (e && /la fin de tour a échoué/.test(e.message)) ok('la cause est retenue dans `_eotErreur`');
  else ko('l\'exception de fin de tour n\'est retenue nulle part');
  if (e && e.ou) ok('… avec l\'endroit (première ligne de pile)');
  else ko('la cause est retenue sans dire OÙ — c\'est la moitié du diagnostic');
  if (r.kind === 'idle') ok('et `pump()` rend `idle` : c\'est exactement l\'état du mail de blocage');
  else note('pump a rendu « ' + r.kind +' » (pas idle) — le montage n\'est pas celui du mail, le point 1 reste valable');
  d.sb.runEndOfRound = vrai;
}

console.log('\n2. CONTRE-ÉPREUVE — un tour qui se solde remet le champ à zéro');
{
  const { d } = partiePrete();
  d._eotErreur = { tour: 3, message: 'vieille exception sans rapport' };
  passerToutLeMonde(d);
  let r = d.pump();
  for (let i = 0; i < 80 && r.kind === 'decision'; i++) { r = d.answer(r.pending.id, {}); }
  note('après une fin de tour normale, _eotErreur : ' + (d._eotErreur ? d._eotErreur.message : 'aucune'));
  if (!d._eotErreur) ok('le champ est remis à zéro : le mail ne peut plus accuser une vieille exception');
  else ko('une exception périmée survit à un tour soldé — le diagnostic mentirait');
}

console.log('\n3. CONTRÔLE DE SOURCE — `diagnostiquer()` lit bien ce champ');
{
  const src = fs.readFileSync(SERVER, 'utf8');
  const i = src.indexOf('function diagnostiquer(');
  const j = src.indexOf('\n}\n', i);
  const corps = i >= 0 ? src.slice(i, j) : '';
  const lu = /_eotErreur/.test(corps);
  const dansResume = /const resume =[\s\S]{0,400}eot \?/.test(corps);
  const dansTexte = /La fin de tour a LEVÉ une exception/.test(corps);
  note('lu par diagnostiquer : ' + lu + ' · dans le résumé : ' + dansResume + ' · dans le corps du mail : ' + dansTexte);
  if (lu && dansResume && dansTexte) ok('la cause part dans le résumé ET dans le mail complet');
  else ko('`_eotErreur` n\'arrive pas jusqu\'au mail : le champ existe toujours pour rien');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ Une partie bloquée dit maintenant ce qui l\'a bloquée.');
