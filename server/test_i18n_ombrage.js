/* ============================================================================
   TEST — AUCUN `t(...)` SOUS UNE VARIABLE LOCALE NOMMÉE `t`
   ----------------------------------------------------------------------------
   POURQUOI. `t(cle, fr, params)` est la fonction de traduction (moteur.js). Le code du jeu utilise
   aussi `t` comme nom de variable locale — une tension (`const t=espTensionPour(pris)`), un nœud,
   un temps. Dans une telle fonction, `t('avis…')` appelle la VARIABLE : « t is not a function ».
   Trouvé le 20/09 par `test_actions` (1 partie sur 3) : `espPiller`, quand la tension atteignait
   10 — un joueur espionné en ligne voyait la partie se bloquer. Le vérificateur de la session
   précédente cherchait le bloc suivant la déclaration, pas la fonction englobante : il ne voyait
   rien. Celui-ci suit les portées réelles (paramètre et `var` = toute la fonction ; `let`/`const`
   = leur bloc ; `for` ; `catch`).
   Lancer : node server/test_i18n_ombrage.js  (acorn + acorn-walk, devDependencies)
   ========================================================================== */
const fs = require('fs'), path = require('path');
const acorn = require('acorn');
const FICHIERS = ['moteur.js', 'online.js', 'tutorial.js', 'i18n.js', 'server/server.js', 'server/driver.js', 'server/bot.js'];
function declT(d) { return d.type === 'VariableDeclarator' && d.id.type === 'Identifier' && d.id.name === 't'; }
function stmtsDeclareT(stmts, kinds) { for (const s of stmts || []) { if (s && s.type === 'VariableDeclaration' && kinds.includes(s.kind) && s.declarations.some(declT)) return true; } return false; }
function walkAll(node, fn) { if (!node || typeof node.type !== 'string') return; fn(node); for (const k in node) { const v = node[k]; if (Array.isArray(v)) v.forEach(c => { if (c && typeof c.type === 'string') walkAll(c, fn); }); else if (v && typeof v.type === 'string') walkAll(v, fn); } }
function varDeclaresT(body) { let f = false; walkAll(body, x => { if (x.type === 'VariableDeclaration' && x.kind === 'var' && x.declarations.some(declT)) f = true; }); return f; }
let total = 0;
for (const rel of FICHIERS) {
  const f = path.join(__dirname, '..', rel); if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8'); let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }); } catch (e) { console.log('   ✘ ' + rel + ' : illisible — ' + e.message); total++; continue; }
  let n = 0; const seen = new Set();
  function visit(node, sh) {
    if (!node || typeof node.type !== 'string') return;
    let s = sh;
    if (/Function/.test(node.type)) s = node.params.some(p => p.type === 'Identifier' && p.name === 't') || (node.body.type === 'BlockStatement' && (varDeclaresT(node.body) || stmtsDeclareT(node.body.body, ['let', 'const'])));
    else if (node.type === 'BlockStatement') s = sh || stmtsDeclareT(node.body, ['let', 'const']);
    else if (/^For/.test(node.type) && node.init && node.init.type === 'VariableDeclaration' && node.init.declarations.some(declT)) s = true;
    else if (node.type === 'CatchClause' && node.param && node.param.type === 'Identifier' && node.param.name === 't') s = true;
    if (s && node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 't' && !seen.has(node.start)) { seen.add(node.start); n++; const line = src.slice(0, node.start).split('\n').length; if (n <= 20) console.log('   ✘ ' + rel + ':' + line + ' → ' + src.slice(node.start, node.start + 70).replace(/\n/g, ' ')); }
    for (const k in node) { const v = node[k]; if (Array.isArray(v)) v.forEach(c => { if (c && typeof c.type === 'string') visit(c, s); }); else if (v && typeof v.type === 'string') visit(v, s); }
  }
  visit(ast, false);
  console.log((n ? '   ✘ ' : '   ✔ ') + rel + ' — ' + n + ' appel(s) t() sous une variable t');
  total += n;
}
console.log(total ? '\n❌ ' + total + ' appel(s) t() masqué(s) par une variable locale — renommer la variable.' : '\n✅ Aucun t() masqué par une variable locale.');
process.exit(total ? 1 : 0);
