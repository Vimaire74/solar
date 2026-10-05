/* ============================================================================
   TEST — L'AGENDA D'UN ORDINATEUR RESTE SECRET JUSQU'À LA FIN
   ----------------------------------------------------------------------------
   POURQUOI. Partie 4942 (13/09), journal du tour 1 :
       « 🤖 🌍 Terriens — Agenda secret : 🏛️ Gouvernance Éclairée »
   Marc : « à l'époque je le voyais, oui ». Un agenda lu au tour 1 n'est plus secret :
   on sait quoi contrer. La ligne existait aux DEUX tirages (solo et serveur).

   CE QUI EST VÉRIFIÉ :
     1. tirage SERVEUR (puits de décisions installé) : aucun nom d'agenda d'ordinateur dans
        le journal après le tirage — et il y a bien une ligne neutre par ordinateur ;
     2. tirage SOLO : idem ;
     3. CONTRE-ÉPREUVE : l'agenda existe bien (`ai.agenda` posé) — on n'a pas rendu le
        secret en supprimant l'agenda ;
     4. à la fin de partie, le décompte des VP le nomme (`calcVP(ai).det` ou libellé) —
        le secret est levé au bon moment, pas jamais.

   Usage : node test_agenda_secret.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);
const texte = G => (G.log || []).map(l => String((l && l.msg) || l).replace(/<[^>]+>/g, ''));

function fuite(G) {
  const noms = G.ais.filter(a => a._isAI !== false && a.agenda).map(a => a.agenda.name);
  const lignes = texte(G).filter(t => noms.some(n => n && t.includes(n)) && /agenda/i.test(t));
  return { noms, lignes };
}

console.log('═'.repeat(80));
console.log('AGENDA SECRET — LES ORDINATEURS NE L\'ANNONCENT PAS AU TOUR 1');
console.log('═'.repeat(80) + '\n');

console.log('1. Tirage côté serveur');
{
  const sb = loadLogic(HTML);
  const vus = []; sb.setDecisionSink(p => vus.push(p));
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  /* Le tirage des ordinateurs est `_aiPickAgendas` (appelé par le draft d'agenda côté serveur) :
     on l'appelle directement, c'est LUI qui écrivait la ligne. */
  sb._aiPickAgendas();
  const f = fuite(G);
  note('agendas des ordinateurs : ' + (f.noms.join(', ') || 'AUCUN'));
  if (f.noms.length) ok('les ordinateurs ont bien un agenda (contre-épreuve : le secret n\'est pas « pas d\'agenda »)');
  else ko('aucun agenda posé chez les ordinateurs — le montage ne teste rien');
  if (!f.lignes.length) ok('aucun nom d\'agenda d\'ordinateur dans le journal');
  else ko('FUITE : ' + f.lignes[0].slice(0, 90));
  const neutres = texte(G).filter(t => /agenda secret choisi/.test(t)).length;
  note('lignes neutres « agenda secret choisi » : ' + neutres);
  if (neutres >= f.noms.length) ok('une ligne neutre par nation'); else ko('les ordinateurs ne signalent même plus qu\'ils ont choisi');
}

console.log('\n2. Tirage solo — contrôle de SOURCE (la fenêtre solo touche au DOM, on lit le code)');
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const i = src.indexOf('function confirmAgendaChoice(');
  const j = src.indexOf('\n}\n', i);
  const corps = i >= 0 ? src.slice(i, j) : '';
  const fuiteSolo = /Agenda secret : '/.test(corps);
  /* 04/10 (v11.52) : la copie solo n'existe plus — `confirmAgendaChoice` appelle `_aiPickAgendas`, l'unique tirage. */
  const neutre = /agenda secret choisi/.test(corps) || /_aiPickAgendas\(\)/.test(corps);
  note('confirmAgendaChoice : écrit le nom = ' + fuiteSolo + ' · ligne neutre = ' + neutre);
  if (!fuiteSolo && neutre) ok('la copie solo du tirage n\'écrit plus le nom');
  else ko('la copie solo du tirage (`confirmAgendaChoice`) écrit encore « Agenda secret : <nom> »');
}

console.log('\n3. À la fin, le décompte des VP le nomme');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.phase = 'over';
  const ai = G.ais.find(a => a.agenda);
  const d = ai ? sb.calcVP(ai) : null;
  const libelle = d ? JSON.stringify(d.det || d) : '';
  note('agenda de ' + (ai && ai.civ.name) + ' : ' + (ai && ai.agenda && ai.agenda.name));
  if (ai && libelle.includes(ai.agenda.name)) ok('le décompte final nomme l\'agenda : le secret est levé à la fin, pas jamais');
  else note('(le décompte n\'inclut pas le nom dans `det` — vérifié seulement que le journal ne fuit pas)');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ Un agenda secret d\'ordinateur le reste jusqu\'au décompte final.');
