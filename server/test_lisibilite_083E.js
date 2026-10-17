/* ============================================================================
   TEST — CE QUE LA PARTIE 083E A RENDU ILLISIBLE
   ----------------------------------------------------------------------------
   Quatre remarques de Marc, même partie, même nature : le jeu DISAIT quelque chose de faux ou ne
   disait rien du tout. Aucune ne change une règle ; toutes changent ce qu'on peut comprendre.

     1. LE VERT DU JOURNAL. « Pourquoi au tour 9 des informations apparaissent en vert dans le
        journal (ma couleur, terrien) comme achat de flotte de chasseurs alors que ce sont les
        Jupitériens ? » Le vert est la couleur « achat réussi », et les Terriens sont verts. Un achat
        d'ordinateur écrivait TROIS lignes dont celle-là. Elle ne s'écrit plus que pour un humain.
        CONTRE-ÉPREUVE : l'achat de l'IA reste journalisé (🤖 / ↳) — on n'a pas effacé l'information.

     2. LIENS EMPATHES. La carte annonçait « +2 tokens combat » : c'est `combatBonus:2`, une
        PUISSANCE permanente. Le mot « tokens » était l'erreur.

     3. TENSIONS CROISÉES. « Il faut que la popup montre aussi les tensions relatives entre la nation
        et les autres nations, sinon ça sert à rien. » Elles n'existaient nulle part dans le jeu.

     4. TEMPÉRAMENTS. « J'aimerais savoir à la fin quel style d'IA ont joué les nations. »
        L'information était au tour 1 du journal, six cents lignes avant la fin.

   Usage : node test_lisibilite_083E.js
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

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const moi = G.player;
  moi._isAI = false;
  for (const a of G.ais) { a._isAI = true; a.acLeft = 3; a.res.energy = 20; a.res.materials = 20; a.res.science = 20; }
  moi.acLeft = 3; moi.res.energy = 20; moi.res.materials = 20; moi.res.science = 20;
  /* ⚠️ SANS CECI, `buyTech` REFUSE TOUT et le banc mesure le vide : « branche non encore
     débloquée ». Une carte de rang 1 exige le rang 0 de sa branche. Erreur commise en écrivant ce
     banc : trois points au rouge qui n'accusaient pas le code mais le montage. */
  vm.runInContext("for(const b in TECH_BRANCHES) G.branchTiers[b]=3;", sb);
  /* La branche Empathes a en plus sa règle d'Union Sacrée (`isEmpathesAvailableFor`) : sans
     fondateur, `liens1` est refusée quel que soit le rang de branche. */
  vm.runInContext("G.empathesFounder={civIds:new Set(allPlayers().map(n=>n.civ.id)), openAtTurn:1};", sb);
  return { sb, G, moi, ia: G.ais[0], ia2: G.ais[1] };
}
const lignes = m => (m.G.log || []).map(l => ({ txt: (l && l.msg) || String(l), cls: (l && l.cls) || '' }));

console.log('═'.repeat(84));
console.log('LISIBILITÉ — LE JEU DIT CE QUI EST, ET LE DIT À LA BONNE PERSONNE');
console.log('═'.repeat(84) + '\n');

/* ── 1. Le vert n'est plus écrit pour une nation d'ordinateur ──────────────── */
console.log('1. Un achat d\'ordinateur n\'écrit plus de ligne verte — mais reste journalisé');
{
  const m = montage();
  const av = (m.G.log || []).length;
  /* ⚠️ ON PASSE PAR LE VRAI CHEMIN DE L'IA (`appliquerCoup`), pas par `buyTech` en direct : ce sont
     `appliquerCoup` / `_aiRec` qui écrivent « 🤖 X achète » et « ↳ X paie ». Appeler `buyTech` seul
     mesurerait un chemin que l'IA n'emprunte jamais — et ferait croire que l'information a disparu. */
  m.G.aiActions = [];
  m.sb.appliquerCoup(m.ia, { type: 'tech', card: 'bio1' });
  const nouv = lignes(m).slice(0, Math.max(0, (m.G.log || []).length - av));
  const vertes = nouv.filter(l => l.cls === 'green');
  note('lignes écrites : ' + nouv.length + ' · dont vertes : ' + vertes.length);
  for (const l of nouv) note('   [' + (l.cls || '—') + '] ' + l.txt.replace(/<[^>]+>/g, '').slice(0, 70));
  if (!vertes.length) ok('aucune ligne verte pour l\'achat d\'une IA — le vert cesse de désigner les Terriens');
  else ko('ligne verte écrite pour une IA : « ' + vertes[0].txt.slice(0, 60) + ' »');
  /* ⚠️ CE N'EST PAS `buyTech` QUI ÉCRIT « 🤖 X achète » ET « ↳ X paie », c'est `_aiRec` à la fin du
     tour de l'IA, à partir de `G.aiActions` — que `buyTech` alimente toujours par `addAction`.
     C'est donc CELA qu'il faut mesurer : la matière du journal existe encore. Vérifier les lignes
     ici ne mesurerait qu'un tour d'IA qu'on n'a pas joué. */
  const inscrit = (m.G.aiActions || []).some(a => /Biosphère/i.test(a.name || ''));
  note('action enregistrée pour le journal de fin de tour : ' + inscrit);
  if (inscrit) ok('l\'achat reste inscrit (🤖 / ↳ seront écrits) — on a retiré du bruit, pas de l\'information');
  else ko('l\'achat de l\'IA ne sera plus journalisé du tout');
  if (m.ia.cards.some(c => c.id === 'bio1')) ok('et la carte est bien acquise');
  else ko('la carte n\'a pas été achetée : le point ne mesure rien');
}

/* ── 2. CONTRE-ÉPREUVE — l'humain, lui, garde sa ligne verte ───────────────── */
console.log('\n2. CONTRE-ÉPREUVE — l\'achat de l\'humain garde sa confirmation verte');
{
  const m = montage();
  const av = (m.G.log || []).length;
  m.sb.buyTech('bio1', m.moi);
  const nouv = lignes(m).slice(0, Math.max(0, (m.G.log || []).length - av));
  const vertes = nouv.filter(l => l.cls === 'green');
  note('vertes : ' + vertes.length + (vertes.length ? ' → « ' + vertes[0].txt.replace(/<[^>]+>/g, '').slice(0, 60) + ' »' : ''));
  if (vertes.length) ok('« ✅ … » en vert pour son propre achat — la confirmation qu\'il attend');
  else ko('l\'humain a perdu sa ligne de confirmation : on a corrigé au-delà du défaut');
}

/* ── 3. Liens Empathes : puissance, pas jetons ─────────────────────────────── */
console.log('\n3. Liens Empathes : +2 de PUISSANCE permanente, et le texte de la carte le dit');
{
  const m = montage();
  const carte = vm.runInContext("JSON.stringify(CARDS_POOL.find(c=>c.id==='liens1'))", m.sb);
  const c = JSON.parse(carte);
  note('effet annoncé : ' + String(c.effect).replace(/<[^>]+>/g, ''));
  if (c.combatBonus === 2) ok('la carte donne bien +2 de puissance (`combatBonus`)');
  else ko('combatBonus = ' + c.combatBonus);
  if (!/token/i.test(c.effect || '')) ok('le mot « token » a disparu du texte — c\'était la source de la confusion');
  else ko('le texte parle encore de « tokens » alors que ce sont des points de puissance');
  const jAvant = m.moi.forceTokens;
  m.sb.buyTech('liens1', m.moi);
  const bonus = m.sb.bonusCombatCartes(m.moi);
  note('jetons avant/après : ' + jAvant + ' → ' + m.moi.forceTokens + ' · bonus de combat : +' + bonus);
  if (bonus === 2) ok('+2 comptés dans la puissance de combat');
  else ko('bonus de combat = ' + bonus);
  if (m.moi.forceTokens === jAvant) ok('et AUCUN jeton ajouté — la carte n\'en donne pas, contrairement à ce qu\'elle disait');
  else ko('la carte a modifié le nombre de jetons (' + jAvant + ' → ' + m.moi.forceTokens + ')');
}

/* ── 4. Tensions croisées ──────────────────────────────────────────────────── */
console.log('\n4. Les tensions entre DEUX AUTRES nations sont lisibles, et dans le bon sens');
{
  const m = montage();
  m.sb.setTens(m.ia.civ.id, m.ia2.civ.id, 9);      // Martiens → Jupitériens
  m.sb.setTens(m.ia2.civ.id, m.ia.civ.id, 2);      // Jupitériens → Martiens
  m.sb.setTens(m.ia.civ.id, m.moi.civ.id, 7);      // Martiens → moi (ne doit PAS figurer)
  const l = m.sb.tensionsCroisees(m.ia, m.moi);
  note('vu depuis les Martiens (observateur = moi) : ' + JSON.stringify(l));
  const j = l.find(x => x.id === m.ia2.civ.id);
  if (j && j.vers === 9 && j.de === 2) ok('9 envers les Jupitériens, 2 en retour — les deux sens, pas un seul');
  else ko('sens faux ou absent : ' + JSON.stringify(j));
  if (!l.some(x => x.id === m.moi.civ.id)) ok('ma propre paire n\'est pas répétée (elle est déjà affichée en grand)');
  else ko('la fenêtre répète la tension qui me concerne');
  const t = m.sb.tensionsCroiseesTexte(m.ia, m.moi);
  if (/9\/2/.test(t)) ok('le texte partagé (fenêtre solo, en ligne, onglet Diplomatie) porte bien « 9/2 »');
  else ko('texte inattendu : ' + t);
  /* La charge utile envoyée au joueur en ligne doit les transporter, sinon la fenêtre en ligne
     reste aveugle — c'était le cas : elle n'affichait même pas la tension qui bouge. */
  m.G._pendings = [];
  m.sb.setDecisionSink(function () {});
  m.sb._resolveStratChoice(m.moi, 'st9');
  const q = (m.G._pendings || []).find(p => p.kind === 'strategy_calm');
  const opt = q && (q.payload.options || [])[0];
  note('charge utile en ligne : ' + JSON.stringify(opt));
  if (opt && opt.tension !== undefined && opt.reciproque !== undefined && Array.isArray(opt.croisees)) ok('le joueur en ligne reçoit la tension, sa réciproque et les croisées');
  else ko('la fenêtre en ligne ne reçoit pas de quoi décider');
}

/* ── 5. Tempéraments en tête du rapport ────────────────────────────────────── */
console.log('\n5. Le rapport de fin nomme le tempérament de chaque nation d\'ordinateur, et le cerveau');
{
  const m = montage();
  m.sb.attribuerProfilsIA();
  const txt = m.sb._profilsTexte().join('\n');
  note(txt.split('\n').filter(Boolean).slice(0, 6).join('\n     '));
  if (/TEMPÉRAMENTS/.test(txt)) ok('la section existe');
  else ko('aucune section tempéraments dans le rapport');
  const nommees = m.G.ais.filter(a => new RegExp(a.civ.name).test(txt)).length;
  if (nommees === m.G.ais.length) ok('les ' + nommees + ' nations d\'ordinateur y sont nommées');
  else ko(nommees + ' nation(s) sur ' + m.G.ais.length + ' seulement');
  if (/cerveau\s*:/.test(txt)) ok('le cerveau utilisé est indiqué');
  else ko('le cerveau n\'est pas indiqué');
  if (!new RegExp('\\b' + m.moi.civ.name + '\\b').test(txt)) ok('la nation humaine n\'y figure pas — son tempérament n\'est jamais lu');
  else ko('la nation humaine est listée avec un tempérament qui ne sert à rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le journal, les cartes, les tensions et le rapport disent ce qui est.');
console.log('═'.repeat(84));
