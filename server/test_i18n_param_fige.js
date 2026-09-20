/* ════════════════════════════════════════════════════════════════════════════════════════════
   UN `t()` DANS LES PARAMÈTRES D'UN `J()` FIGE LA PHRASE EN FRANÇAIS.
   ────────────────────────────────────────────────────────────────────────────────────────────
   `J('journal.raid', '… {v} …', {v: t('journal.production_pillee','production de {n} pillée')})`
   a l'air correct : les deux bouts ont une clé. Mais l'argument est ÉVALUÉ TOUT DE SUITE — sur le
   serveur, qui n'a pas de dictionnaire — donc `p.v` part sur le fil comme une chaîne française
   définitive. Le client re-rend la phrase extérieure et recolle le bout français dedans : rien ne
   peut plus le rattraper. C'est ce que Marc voyait le 20/09 (« production de Lune pillée » au
   milieu d'une ligne anglaise, « ✗ non connectée », « colonie prise »).

   LA FORME CORRECTE est un `J()` imbriqué : `{v: J('journal.production_pillee', …)}`. L'objet
   {k,fr,p} voyage jusqu'au lecteur, et `_i18nParam` (moteur) comme `tL` (serveur) le rendent dans
   SA langue au dernier moment.

   Ce banc lit le moteur avec un analyseur syntaxique (pas une expression régulière : `t(` apparaît
   dans des centaines de contextes légitimes) et signale chaque `t()` situé dans les paramètres d'un
   `J()` ou d'un `t()`.  Usage : node test_i18n_param_fige.js   → 0 attendu.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path');
const acorn = require('acorn');

const fichier = process.argv[2] || path.join(__dirname, '..', 'moteur.js');
const src = fs.readFileSync(fichier, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, locations: true });

const directs = [], concat = [];
const estAppel = (n, nom) => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === nom;
const APPELS = ['J', 't', 'K'];
const estMsg = n => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && APPELS.includes(n.callee.name);

/* La VALEUR d'un paramètre : on descend dans les ternaires et les `||`, pas dans les `+`.
   Un `t()` pris dans une concaténation ne peut pas être dégelé (le `+` rend la chaîne tout de
   suite) : c'est légitime quand la phrase est écrite directement dans le DOM du lecteur, et ça
   demande une refonte de la phrase quand elle part en ligne. On le signale sans faire échouer. */
function valeur(v, ctx, dansConcat) {
  if (!v || typeof v !== 'object') return;
  if (estAppel(v, 't')) {
    const cle = (v.arguments[0] && v.arguments[0].value) || '?';
    (dansConcat ? concat : directs).push({ ligne: v.loc.start.line, cle, ctx });
    marche(v); return;
  }
  if (v.type === 'ConditionalExpression') { marche(v.test); valeur(v.consequent, ctx, dansConcat); valeur(v.alternate, ctx, dansConcat); return; }
  if (v.type === 'LogicalExpression') { valeur(v.left, ctx, dansConcat); valeur(v.right, ctx, dansConcat); return; }
  if (v.type === 'BinaryExpression' && v.operator === '+') { valeur(v.left, ctx, true); valeur(v.right, ctx, true); return; }
  if (v.type === 'TemplateLiteral') { v.expressions.forEach(e => valeur(e, ctx, true)); return; }
  marche(v);
}
function marche(n) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach(marche); return; }
  if (!n.type) return;
  if (estMsg(n)) {
    const cle = (n.arguments[0] && n.arguments[0].value) || '?';
    for (let i = 0; i < n.arguments.length; i++) {
      const a = n.arguments[i];
      if (i >= 2 && a && a.type === 'ObjectExpression') { for (const pr of a.properties) valeur(pr.value, n.callee.name + "('" + cle + "')", false); }
      else marche(a);
    }
    return;
  }
  for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end') continue; marche(n[k]); }
}
marche(ast);

if (concat.length) {
  console.log('ℹ️ ' + concat.length + " t() pris dans une concatenation (a revoir si la phrase part en ligne) :");
  for (const f of concat) console.log('   ligne ' + f.ligne + " - t('" + f.cle + "') dans " + f.ctx);
}
if (!directs.length) { console.log('✅ aucun t() fige en parametre direct - ' + path.basename(fichier)); process.exit(0); }
console.log('❌ ' + directs.length + ' t() fige(s) en francais dans des parametres (' + path.basename(fichier) + ') :');
for (const f of directs) console.log('   ligne ' + f.ligne + " - t('" + f.cle + "') dans " + f.ctx);
console.log("\n   Remplace chacun par J(...) : l'objet {k,fr,p} voyage et se rend dans la langue du lecteur.");
process.exit(1);
