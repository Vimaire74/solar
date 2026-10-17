/* ============================================================================
   MESURE — QUAND DEUX ORDINATEURS SE FONT LA GUERRE, LE COMBAT A-T-IL LIEU ?
   ----------------------------------------------------------------------------
   Partie 083E, tours 5, 6 et 7, à l'identique :
       🚨 GUERRE DÉCLARÉE : Jupitériens contre Martiens — Assaut sur Phobos !
       ↳ Jupitériens paie : 1 AC (aucune ressource)
       … puis, en fin de tour :  🕊️ Paix acceptée par Martiens !
   Trois tours, trois déclarations, trois paix, et pas UN combat. Marc : « les conquêtes doivent
   être réalisées immédiatement, sans message pour prévenir l'autre, on a déjà corrigé ce défaut —
   même pour les IA entre elles ? »

   Ce que l'on sait déjà (mesuré) : un assaut de PHASE D'ACTIONS ne livre jamais le combat, pour
   personne — il déclare la guerre et désigne la cible ; le combat se joue à la fenêtre de fin de
   tour. C'est vrai pour l'humain aussi (son combat du tour 7 de 083E est arrivé après
   « Initiative de fin de tour »). Le soupçon porte donc ailleurs : sur l'ÉCHAPPATOIRE DE LA PAIX.
   Une guerre fraîche où l'on n'est pas l'agresseur ouvre d'abord la fenêtre de paix ; si l'adversaire
   accepte, l'assaut annoncé s'évapore. Ce défaut a été corrigé pour l'humain (test_assaut_surprise) ;
   la question est de savoir s'il subsiste entre deux ordinateurs.

   Ce fichier NE CORRIGE RIEN : il déroule un tour complet et imprime, dans l'ordre, ce que le
   journal dit de la guerre. On regarde qui vient en premier — la paix ou le combat.

   Usage : node mesure_assaut_ia_ia.js
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const d = new GameDriver(HTML);
/* Un humain (nécessaire : quelqu'un doit pouvoir fermer les fenêtres bloquantes) et deux
   ordinateurs qui vont s'affronter. */
d.boot([{ civId: 'ceinturiens', isAI: false }, { civId: 'jupiteriens', isAI: true }, { civId: 'martiens', isAI: true }], () => {});
/* ⚠️ LE CAS QUI COMPTE EST CELUI OÙ LE DÉFENSEUR VEUT LA PAIX. Si l'assailli refuse, le combat a
   lieu et il n'y a rien à mesurer : c'est ce qu'a montré la première exécution. Le défaut soupçonné
   — « une guerre fraîche ouvre d'abord la fenêtre de paix, et l'assaut annoncé s'évapore » — ne peut
   se voir que si l'assailli ACCEPTE. On force donc son envie de paix, sans toucher au reste. */
if (process.env.PAIX !== 'non') {
  require('vm').runInContext("iaVeutLaPaix=function(){return true;};", d.sb);
  console.log('(défenseur forcé à vouloir la paix — mettre PAIX=non pour l\'inverse)');
}
const sb = d.sb, G = sb.__G;
let r = d.pump(), g = 0;
while (r && r.kind === 'decision' && g++ < 20) r = d.answer(r.pending.id, {});
G.turn = 6; G.phase = 'actions';

const jup = d.nation('jupiteriens'), mar = d.nation('martiens');
jup.acLeft = 2; jup.forceTokens = 12; jup.res.materials = 20; jup.res.energy = 20;
mar.forceTokens = 2; mar.res.materials = 2; mar.res.energy = 2;
if (!mar.colonies.some(c => c.nodeId === 'titan')) mar.colonies.push({ nodeId: 'titan', level: 2, connected: true });
jup.colonies.push({ nodeId: 'ganymede', level: 2, connected: true });

console.log('═'.repeat(84));
console.log('DEUX ORDINATEURS EN GUERRE — LA PAIX PASSE-T-ELLE AVANT LE COMBAT ?');
console.log('═'.repeat(84));
console.log('Jupitériens : ' + jup.forceTokens + ' jetons, ' + jup.res.materials + '🪨 ' + jup.res.energy + '⚡');
console.log('Martiens    : ' + mar.forceTokens + ' jetons, ' + mar.res.materials + '🪨 ' + mar.res.energy + '⚡ · Titan Nv.2');
console.log('');

const avantLog = (G.log || []).length;
const titanAvant = mar.colonies.some(c => c.nodeId === 'titan');

/* 1. L'assaut, pendant la phase d'actions. */
sb.appliquerCoup(jup, { type: 'assaut', node: 'titan' });
console.log('après l\'assaut de phase d\'actions :');
console.log('   guerre ouverte : ' + !!sb._warBetween('jupiteriens', 'martiens')
  + ' · Titan encore martienne : ' + mar.colonies.some(c => c.nodeId === 'titan'));

/* 2. La fin de tour, jouée pour de vrai par le pilote. */
for (const n of [d.nation('ceinturiens'), jup, mar]) { n._passedRound = true; n.acLeft = 0; }
try { sb.runEndOfRound(); } catch (e) { console.log('   exception : ' + e.message); }
let res = d.pump(), tours = 0;
while (res && res.kind === 'decision' && tours++ < 60) res = d.answer(res.pending.id, {});

/* 3. Ce que le journal a raconté, dans l'ordre (il s'écrit en tête : on le remet à l'endroit). */
const nouv = (G.log || []).slice(0, Math.max(0, (G.log || []).length - avantLog))
  .map(l => (l && l.msg) || String(l)).reverse()
  .map(t => String(t).replace(/<[^>]+>/g, ''))
  .filter(t => /guerre|paix|combat|assaut|captur|repouss|jeton|⚔️|🕊️|🏴|🛡️/i.test(t));
console.log('\njournal de guerre du tour, dans l\'ordre :');
for (const t of nouv) console.log('   ' + t.slice(0, 110));

/* ⚠️ « refuse la paix » CONTIENT LE MOT PAIX. Première version de ce fichier : il comptait cette
   ligne comme une paix conclue et rendait un verdict faux alors que le combat avait bien eu lieu.
   On ne cherche donc que la paix ACCEPTÉE. */
const iPaix = nouv.findIndex(t => /paix/i.test(t) && !/refuse/i.test(t));
const iCombat = nouv.findIndex(t => /vs |captur|repouss|Coût combat|engagé/i.test(t));
console.log('');
console.log('première mention de paix   : ' + (iPaix < 0 ? 'aucune' : ('ligne ' + (iPaix + 1))));
console.log('première mention de combat : ' + (iCombat < 0 ? 'AUCUNE' : ('ligne ' + (iCombat + 1))));
console.log('Titan : martienne avant = ' + titanAvant + ' · après = ' + mar.colonies.some(c => c.nodeId === 'titan')
  + ' · jupitérienne = ' + jup.colonies.some(c => c.nodeId === 'titan'));
console.log('');
if (iCombat < 0 && iPaix >= 0) console.log('→ CONFIRMÉ : la paix arrive, le combat n\'a jamais lieu. C\'est le défaut de 083E.');
else if (iCombat >= 0 && (iPaix < 0 || iCombat < iPaix)) console.log('→ Le combat a bien lieu (avant toute paix) : rien à corriger sur ce chemin.');
else console.log('→ La paix précède le combat : l\'assaut annoncé s\'évapore.');
console.log('═'.repeat(84));
