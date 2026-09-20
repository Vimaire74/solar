/* ════════════════════════════════════════════════════════════════════════════════════════════
   UN NOM DE DONNÉE PASSÉ TEL QUEL EN PARAMÈTRE RESTE EN FRANÇAIS.
   ────────────────────────────────────────────────────────────────────────────────────────────
   `J('journal.x','… {v} …', {v: node.name})` envoie « Éris » — le nom tel qu'il est dans la table
   du serveur, c'est-à-dire en français. Le lecteur anglais reçoit la phrase traduite avec un mot
   français dedans. La forme correcte est `_i18nRef(node,'name')`, qui envoie « @noeud.eris.nom » :
   une référence que `_i18nParam` (moteur) et `tL` (serveur) résolvent dans la langue du lecteur.

   Ce banc signale chaque `X.name` / `X.civ.name` / `X.effect` / `X.desc` / `X.preview` utilisé
   directement comme valeur d'un paramètre de J()/t()/K().
   Usage : node test_i18n_nom_donnee.js   → 0 attendu.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), acorn = require('acorn');
const fichier = process.argv[2] || path.join(__dirname, '..', 'moteur.js');
const src = fs.readFileSync(fichier, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, locations: true });
const CHAMPS = ['name', 'effect', 'desc', 'preview'];
const APPELS = ['J', 't', 'K'];
const trouves = [];
const estMsg = n => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && APPELS.includes(n.callee.name);

function valeur(v, ctx) {
  if (!v || typeof v !== 'object') return;
  if (v.type === 'ConditionalExpression') { valeur(v.consequent, ctx); valeur(v.alternate, ctx); marche(v.test); return; }
  /* `(_e.name_i18n || _e.name)` est la forme CORRECTE : la clé d'abord, le français en secours.
     On ne signale donc pas le membre de droite quand la gauche est sa jumelle `_i18n`. */
  if (v.type === 'LogicalExpression') {
    const gauche = v.left && src.slice(v.left.start, v.left.end);
    const droite = v.right && src.slice(v.right.start, v.right.end);
    if (v.operator === '||' && gauche && droite && gauche === droite + '_i18n') return;
    valeur(v.left, ctx); valeur(v.right, ctx); return;
  }
  if (v.type === 'MemberExpression' && !v.computed && v.property.type === 'Identifier' && CHAMPS.includes(v.property.name)) {
    trouves.push({ ligne: v.loc.start.line, expr: src.slice(v.start, v.end), ctx });
    return;
  }
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
      if (i >= 2 && a && a.type === 'ObjectExpression') { for (const pr of a.properties) valeur(pr.value, n.callee.name + "('" + cle + "')"); }
      else marche(a);
    }
    return;
  }
  for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end') continue; marche(n[k]); }
}
marche(ast);
if (!trouves.length) { console.log('✅ aucun nom de donnée brut en paramètre — ' + path.basename(fichier)); process.exit(0); }
console.log('❌ ' + trouves.length + ' nom(s) de donnée passé(s) tel quel (' + path.basename(fichier) + ') :');
for (const f of trouves) console.log('   ligne ' + f.ligne + ' — ' + f.expr + '   dans ' + f.ctx);
console.log("\n   Remplace par _i18nRef(objet,'champ') : la référence voyage et se résout chez le lecteur.");
process.exit(1);
