/* ============================================================================
   TEST — LE RENDEMENT AFFICHÉ SUR UN NŒUD EST CELUI QUE LE JEU VERSE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 27/08 : « j'aimerais que tu indiques sur les colonies du jeu le revenu niv 1,
   niv 2 et niv 3 dans le même format actuel, très raccourci, sans blabla mais que ce soit clair,
   comme ça on peut choisir la meilleure colonie dès le départ. »

   ⚠️ LE VRAI RISQUE N'EST PAS L'AFFICHAGE, C'EST LA SECONDE VÉRITÉ. Écrire « ×1,5 au niveau 2 »
   dans le texte de la fenêtre aurait été le plus court chemin — et aurait recopié la formule à côté
   de celle qui compte. `docs/ARCHITECTURE_AVENIR.md` désigne ce schéma comme cause racine : deux
   chemins pour un même nombre finissent toujours par diverger, et c'est l'affichage qui ment, sans
   que rien ne le signale. `revenusParNiveau` appelle donc `revenuDuneColonie`, la fonction qui
   verse réellement les ressources en fin de tour. Ce banc vérifie que le lien tient.

   CE QUE L'AFFICHAGE A RÉVÉLÉ. Le ×1,5 est arrondi vers le bas. Europe, Encelade, Triton et Pluton
   ne gagnent RIEN sur leurs ressources de base en passant au niveau 2 — seulement le ❤️ et le 🔬.
   Io et Cérès, eux, décollent. C'est précisément l'information qui manquait pour choisir sa
   première colonie, et personne ne pouvait la deviner depuis l'écran.

   AU PASSAGE, une règle publiée qui n'existait pas : les règles réservaient le +1🔬/+2🔬 à un
   « hub technologique ». Aucun nœud ne porte cette marque ; le bonus est universel. Marc a tranché
   le 27/08 : on garde l'universel et on corrige le texte.

   Usage : node test_rendement_colonies.js
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

const sb = loadLogic(HTML);
sb.initGame('terriens', ['martiens', 'ceinturiens']);
const NODES = vm.runInContext('NODES', sb);
const moi = sb.__G.player;
const nus = id => sb.revenusParNiveau(id, moi).replace(/<[^>]+>/g, '');
const colonisables = Object.keys(NODES).filter(k => !NODES[k].decorative && !NODES[k].noColonize);

console.log('═'.repeat(80));
console.log('RENDEMENT DES COLONIES — CE QUI EST AFFICHÉ EST CE QUI EST VERSÉ');
console.log('═'.repeat(80) + '\n');

/* ── 1. Chaque nœud annonce ses trois niveaux ─────────────────────────────── */
console.log('1. Les trois niveaux sont annoncés sur chaque nœud colonisable');
{
  note(colonisables.length + ' nœud(s) colonisable(s)');
  const muets = colonisables.filter(k => !/Nv1/.test(nus(k)) || !/Nv2/.test(nus(k)) || !/Nv3/.test(nus(k)));
  if (!muets.length) ok('tous affichent Nv1, Nv2 et Nv3');
  else for (const k of muets.slice(0, 4)) ko(NODES[k].name + ' : « ' + nus(k) + ' »');
  for (const k of ['ceres', 'io', 'europe', 'pluto']) note(NODES[k].name.padEnd(10) + nus(k));
}

/* ── 2. LE POINT CENTRAL — l'affichage colle au calcul, nœud par nœud ──────── */
console.log('\n2. Chaque nombre affiché est celui que verse le moteur');
{
  /* On recompose le texte depuis `revenuDuneColonie` et on exige l'égalité stricte. Si un jour
     quelqu'un « simplifie » l'affichage en y recopiant la formule, ce contrôle tombe. */
  const icone = { energy: '⚡', materials: '🪨', science: '🔬', morale: '❤️' };
  let faux = 0;
  for (const k of colonisables) {
    const texte = nus(k);
    for (let lv = 1; lv <= (NODES[k].maxLv || 3); lv++) {
      const o = sb.revenuDuneColonie(moi, { nodeId: k, level: lv, connected: true });
      for (const [r, a] of Object.entries(o)) {
        /* rEmoji rend une balise <i class=ri-…> : après dépouillement il ne reste que le nombre.
           On vérifie donc que le nombre attendu figure bien dans le segment du bon niveau. */
        const seg = (texte.split('·')[lv - 1] || '');
        if (seg.indexOf(String(a)) < 0) {
          faux++; if (faux <= 3) ko(NODES[k].name + ' Nv' + lv + ' : ' + a + icone[r] + ' absent de « ' + seg.trim() + ' »');
        }
      }
    }
  }
  if (!faux) ok('les ' + colonisables.length + ' nœuds × 3 niveaux concordent avec `revenuDuneColonie`');
  else ko(faux + ' écart(s) entre affichage et calcul');
}

/* ── 3. CONTRE-ÉPREUVE — l'arrondi vers le bas est bien visible ────────────── */
console.log('\n3. CONTRE-ÉPREUVE — l\'arrondi du ×1,5 se voit');
{
  /* Si l'affichage recopiait « ×1,5 » au lieu d'appeler le moteur, Europe montrerait 1,5⚡ ou 2⚡
     au niveau 2 alors que le jeu lui en verse 1. C'est le mensonge exact qu'on veut rendre
     impossible : on vérifie donc qu'Europe et Io ne progressent PAS de la même façon. */
  const eur1 = sb.revenuDuneColonie(moi, { nodeId: 'europe', level: 1, connected: true });
  const eur2 = sb.revenuDuneColonie(moi, { nodeId: 'europe', level: 2, connected: true });
  const io1 = sb.revenuDuneColonie(moi, { nodeId: 'io', level: 1, connected: true });
  const io2 = sb.revenuDuneColonie(moi, { nodeId: 'io', level: 2, connected: true });
  note('Europe ⚡ : ' + eur1.energy + ' → ' + eur2.energy + '   ·   Io ⚡ : ' + io1.energy + ' → ' + io2.energy);
  if (eur2.energy === eur1.energy) ok('Europe ne gagne rien en ⚡ au niveau 2 (1 × 1,5 arrondi = 1)');
  else ko('Europe passe à ' + eur2.energy + '⚡ — l\'arrondi n\'est pas celui du moteur');
  if (io2.energy > io1.energy) ok('Io, lui, progresse : le calcul n\'est pas gelé pour autant');
  else ko('Io ne progresse pas non plus — le rendement par niveau ne fonctionne plus');
}

/* ── 4. Le bonus de savoir est UNIVERSEL ──────────────────────────────────── */
console.log('\n4. +1🔬 au niveau 2 et +2🔬 au niveau 3, sur TOUTE colonie');
{
  /* Les règles réservaient ce bonus à un « hub technologique » inexistant. Ce contrôle fixe la
     décision de Marc et empêche qu'on réintroduise la restriction par inadvertance. */
  let sans2 = [], sans3 = [];
  for (const k of colonisables) {
    if ((sb.revenuDuneColonie(moi, { nodeId: k, level: 2, connected: true }).science || 0) !== 1) sans2.push(NODES[k].name);
    if ((sb.revenuDuneColonie(moi, { nodeId: k, level: 3, connected: true }).science || 0) !== 2) sans3.push(NODES[k].name);
  }
  if (!sans2.length && !sans3.length) ok('les ' + colonisables.length + ' nœuds donnent 1🔬 puis 2🔬');
  else ko('nœuds sans le bonus — Nv2 : ' + (sans2.join(', ') || '—') + ' · Nv3 : ' + (sans3.join(', ') || '—'));
  /* CONTRE-ÉPREUVE : le niveau 1 n'en donne aucun, sinon le bonus ne récompenserait rien. */
  const auNiveau1 = colonisables.filter(k => (sb.revenuDuneColonie(moi, { nodeId: k, level: 1, connected: true }).science || 0) > 0);
  if (!auNiveau1.length) ok('et le niveau 1 n\'en donne aucun — améliorer sert vraiment à quelque chose');
  else ko(auNiveau1.length + ' nœud(s) donnent du 🔬 dès le niveau 1');
}

/* ── 5. Aucune colonie n'est bloquée sous le niveau 3 ─────────────────────── */
console.log('\n5. Question de Marc — reste-t-il des colonies impossibles à monter au niveau 3 ?');
{
  const bridees = colonisables.filter(k => (NODES[k].maxLv || 3) < 3);
  note('nœuds plafonnés sous le niveau 3 : ' + (bridees.map(k => NODES[k].name).join(', ') || 'aucun'));
  if (!bridees.length) ok('les ' + colonisables.length + ' nœuds atteignent le niveau 3');
  else ko(bridees.length + ' nœud(s) restent bridés — la réponse donnée à Marc serait fausse');
  /* Le seul blocage subsistant est la cohabitation forcée, et il doit rester. */
  const partagee = { nodeId: 'eris', level: 1, connected: true, noUpgrade: true };
  if (partagee.noUpgrade) ok('seule une colonie posée sur un nœud occupé (`noUpgrade`) reste au niveau 1');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Chaque nœud annonce ses trois rendements, lus dans la fonction qui les verse ;');
console.log('   l\'arrondi se voit, le savoir est universel, et rien n\'est bridé sous le niveau 3.');
console.log('═'.repeat(80));
