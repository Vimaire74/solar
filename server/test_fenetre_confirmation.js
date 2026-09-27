/* ============================================================================
   TEST — PLUS AUCUNE FENÊTRE DU NAVIGATEUR POUR CONFIRMER
   ----------------------------------------------------------------------------
   POURQUOI. Marc, captures du 26/09, trois défauts sur la même fenêtre : « boutons à cliquer
   toujours pas bon, pas de formattage, et la fenêtre n'est pas réductible ce qui est un
   problème ». Ce sont les trois symptômes d'un `confirm()` natif, et ils tombent ensemble :
     · les boutons sont ceux du système — « OK » / « Annuler » ne disent pas ce qu'ils font, et
       rien ne distingue un abandon définitif d'un simple retour ;
     · aucun formatage : du texte brut, des `\n\n` en guise de paragraphes, pas un gras ;
     · la boîte n'est ni redimensionnable ni défilable — sur un téléphone en mode standard
       Samsung, un texte de six lignes est coupé sans recours.
   Sept `confirm()` traînaient encore : quitter une partie en ligne, renoncer, concéder,
   supprimer une partie, supprimer son compte, refuser la paix sans moyens, abandonner une
   partie solo. Tous des décisions IRRÉVERSIBLES, toutes posées dans la fenêtre la plus laide
   et la moins lisible du jeu.

   CE QUE CE BANC VERROUILLE :
     · plus un seul appel à `confirm()` dans `moteur.js` ni dans `online.js` ;
     · la fenêtre du jeu a un corps DÉFILABLE (c'est la réponse à « pas réductible ») ;
     · ses deux boutons sont NOMMÉS par ce qu'ils font, et font 44 px de haut ;
     · les paragraphes du texte deviennent de vrais paragraphes ;
     · elle rend `true` sur le bouton d'action, `false` sur l'autre ;
     · ⚠️ CONTRE-ÉPREUVE : Échap et un clic sur le voile rendent `false` — jamais `true`. Une
       action irréversible ne doit pas partir sur une fermeture accidentelle ;
     · CONTRE-ÉPREUVE : le banc sait voir un `confirm()` (il en détecte un faux).

   Usage : node test_fenetre_confirmation.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const RACINE = path.join(__dirname, '..');
const HTML = path.join(RACINE, 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Les appels à `confirm()` dans un fichier source. Les commentaires du code citent la fonction
   entre accents graves (« `confirm()` ») : on écarte donc ce qui est précédé d'un accent grave,
   et rien d'autre. Le §5 vérifie que ce filtre n'aveugle pas le banc. */
function appelsConfirm(fichier) {
  const src = fs.readFileSync(path.isAbsolute(fichier) ? fichier : path.join(RACINE, fichier), 'utf8');
  const out = [];
  const re = /(.?)confirm\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] === '`') continue;                       // une citation dans un commentaire
    if (/[A-Za-z0-9_$.]/.test(m[1])) continue;        // scDemander, _confirmerGuerre…, .confirm
    const ligne = src.slice(0, m.index).split('\n').length;
    out.push(fichier + ':' + ligne);
  }
  return out;
}

console.log('═'.repeat(84));
console.log("CONFIRMATIONS — LA FENÊTRE EST CELLE DU JEU, PLUS CELLE DU NAVIGATEUR");
console.log('═'.repeat(84) + '\n');

console.log('1. Plus un seul confirm() natif');
{
  const trouves = appelsConfirm('moteur.js').concat(appelsConfirm('online.js'));
  if (trouves.length) ko(trouves.length + ' appel(s) à confirm() subsistent : ' + trouves.join(', '));
  else ok('aucun appel à confirm() dans moteur.js ni online.js');
}

/* Le balisage réellement construit par la fenêtre. On le demande à la fonction qui le fabrique :
   le `document` des bancs est un décor incapable d'analyser du HTML (voir `game-core.js`), donc le
   lire dans le DOM ne mesurerait rien. Le comportement, lui, se pilote par les id. */
function bac() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  vm.runInContext('_aUnEcran = function(){ return true; };', sb);
  return sb;
}
const TEXTE = 'Première phrase, qui explique.\n\nDeuxième paragraphe, qui prévient.\n\nTroisième, qui demande.';
const OPTS = { titre: 'Quitter la partie', texte: TEXTE, ok: 'Quitter la partie', annuler: 'Rester', danger: true };
const balisage = sb => sb.scDemander(Object.assign({ __balisageSeulement: true }, OPTS));

const SB = bac();
const HTMLF = String(balisage(SB) || '');

console.log('\n2. Le corps de la fenêtre défile — « la fenêtre n\'est pas réductible »');
{
  if (!HTMLF.length) { ko('la fenêtre ne produit aucun balisage — rien n\'est mesuré'); }
  else {
    const defile = /overflow:\s*auto/.test(HTMLF);
    const borne = /max-height:/.test(HTMLF);
    note('overflow:auto ' + (defile ? 'présent' : 'ABSENT') + ' · max-height ' + (borne ? 'présent' : 'ABSENT'));
    if (defile && borne) ok('corps défilable et hauteur bornée : rien n\'est coupé sur un petit écran');
    else ko('le contenu peut encore dépasser l\'écran sans pouvoir défiler');
  }
}

console.log('\n3. Les boutons disent ce qu\'ils font, et se cliquent au doigt');
{
  const lab = id => { const m = HTMLF.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<')); return m ? m[1] : null; };
  const lOui = lab('sc-ask-oui'), lNon = lab('sc-ask-non');
  note('boutons : « ' + lOui + ' » · « ' + lNon + ' »');
  if (lOui === null || lNon === null) ko('les deux boutons ne sont pas dans le balisage');
  else if (/^(OK|Annuler)$/i.test(lOui)) ko('le bouton d\'action s\'appelle encore « OK » ou « Annuler »');
  else if (lOui === 'Quitter la partie' && lNon === 'Rester') ok('chaque bouton porte son action');
  else ko('les libellés fournis ne sont pas repris : ' + lOui + ' / ' + lNon);
  const hauteurs = (HTMLF.match(/min-height:\s*44px/g) || []).length;
  if (hauteurs >= 2) ok('les deux boutons font 44 px : la cible au doigt');
  else ko('seulement ' + hauteurs + ' bouton(s) à 44 px — cible trop petite au doigt');
}

console.log('\n4. Le texte est formaté en paragraphes');
{
  const paras = (HTMLF.match(/<p /g) || []).length;
  note('paragraphes produits : ' + paras + ' (le texte en comptait 3)');
  if (paras >= 3) ok('chaque paragraphe du texte en est un à l\'écran');
  else ko('le texte n\'est pas découpé en paragraphes — ' + paras + ' trouvé(s)');
  if (HTMLF.indexOf('\\n') !== -1) ko('des « \\n » bruts restent visibles dans la fenêtre');
  else ok('aucun « \\n » brut à l\'écran');
  if (HTMLF.indexOf('Deuxième paragraphe') !== -1) ok('le texte fourni est bien celui affiché');
  else ko('le texte fourni ne se retrouve pas dans la fenêtre');
}

console.log('\n5. Elle rend true sur l\'action, false sur le retour');
{
  const jouer = (id) => {
    const sb = bac();
    const p = sb.scDemander(OPTS);
    const b = sb.document.getElementById(id);
    if (!b || typeof b.onclick !== 'function') return Promise.resolve('AUCUN GESTIONNAIRE sur ' + id);
    b.onclick();
    return p;
  };
  Promise.all([jouer('sc-ask-oui'), jouer('sc-ask-non')]).then(function (r) {
    note('bouton d\'action → ' + r[0] + ' · bouton de retour → ' + r[1]);
    if (r[0] === true && r[1] === false) ok('les deux réponses sont les bonnes');
    else ko('réponses inattendues : ' + JSON.stringify(r));
    suite();
  });
}

function suite() {
  console.log('\n6. CONTRE-ÉPREUVE — Échap et le voile rendent false, jamais true');
  const sb = bac();
  const p = sb.scDemander(OPTS);
  const boite = sb.document.getElementById('sc-ask');
  if (!boite || typeof boite.onclick !== 'function') { ko('aucun gestionnaire sur le voile'); fin(); return; }
  boite.onclick({ target: boite });
  p.then(function (r) {
    note('clic sur le voile → ' + r);
    if (r === false) ok('un clic hors de la fenêtre annule');
    else ko('un clic hors de la fenêtre a répondu ' + r + ' — une action irréversible partirait par accident');
    /* Le décor des bancs ne pose pas d'écouteur clavier (`document.addEventListener` ne fait rien),
       donc Échap se vérifie à la lecture du code — et ce point le dit, plutôt que de faire croire
       à une mesure. */
    const src = fs.readFileSync(path.join(RACINE, 'moteur.js'), 'utf8');
    if (/e\.key===.Escape.[\s\S]{0,80}fermer\(false\)/.test(src)) ok('Échap est câblé sur « non » (vérifié à la lecture)');
    else ko('Échap n\'est pas câblé sur « non »');
    fin();
  });
}

function fin() {
  console.log('\n7. CONTRE-ÉPREUVE — le banc sait voir un confirm()');
  /* La sonde va dans le dossier temporaire du système, JAMAIS dans le dépôt : on ne laisse pas un
     fichier mort derrière un banc, et la suppression y est permise. */
  const tmp = path.join(require('os').tmpdir(), 'sc_sonde_confirm_' + process.pid + '.js');
  let vus = [];
  try {
    fs.writeFileSync(tmp, 'function f(){ if(!confirm("x")) return; }\nconst y = confirm("z");\n', 'utf8');
    vus = appelsConfirm(tmp);
  } catch (e) { note('(sonde impossible : ' + e.message + ')'); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  if (vus.length === 2) ok('deux confirm() fabriqués sont bien détectés — le §1 prouve donc quelque chose');
  else ko('le détecteur voit ' + vus.length + ' confirm() sur 2 dans la sonde — le §1 ne prouve rien');

  console.log('\n' + '═'.repeat(84));
  if (ecarts.length) {
    console.log('❌ ' + ecarts.length + ' écart(s) :');
    for (const e of ecarts) console.log('   · ' + e);
    process.exit(1);
  }
  console.log("✅ Les décisions irréversibles se prennent dans une fenêtre lisible, défilable,");
  console.log('   aux boutons nommés — et une fermeture accidentelle ne les déclenche pas.');
  console.log('═'.repeat(84));
}
