/* ============================================================================
   TEST — LE PLAFOND DE MORAL IMPOSÉ PAR LA FORME DE GOUVERNEMENT
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 27/08, en dictant le passage des règles : « Si un maximum de moral par tour
   s'applique, notamment sur Tyrannie, votre moral ne peut pas monter au-delà de ce point quelles
   que soient vos technologies. Tyrannie −2 moral immédiat, maximum moral 6. Domination des corpo,
   −1 moral immédiat, maximum moral 7. »

   ⚠️ CETTE RÈGLE N'EXISTAIT PAS. En vérifiant avant d'écrire, `realResCap` rendait `morale: 10`
   pour tout le monde, sans jamais regarder la forme de gouvernement, et un `govForm` ne portait que
   `formPts`, `acBonus`, `adoptMorale`, `moralePerTurn` et `upkeep`. Les deux formes autoritaires
   n'avaient que leur malus ponctuel à l'adoption. Écrire le plafond dans les règles sans le coder
   aurait produit exactement le genre de mensonge que `test_regles.js` existe pour empêcher.

   CE QUI A ÉTÉ CODÉ, ET LE CHOIX QUE MARC A TRANCHÉ. Le plafond ne coupe RIEN au moment de
   l'adoption : c'est `enforceCaps()` qui écrête, au même instant que le plafond ordinaire de 10.
   Adopter la Tyrannie à 9❤️ laisse donc à 7 jusqu'à la fin du tour, puis ramène à 6 — la redescente
   se produit là où le joueur a déjà l'habitude de la voir.

   ⚠️ LE POINT LE PLUS FRAGILE EST LA LEVÉE DU PLAFOND. Le plafond est porté par la FORME, pas par
   la nation : en changer doit le lever à l'instant. Un plafond qui survivrait à la forme qui l'a
   posé serait une punition permanente pour avoir essayé la Tyrannie une fois — et personne ne
   comprendrait pourquoi son moral refuse de monter trois tours plus tard.

   Usage : node test_plafond_moral_gouvernement.js
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

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 4; G.phase = 'actions';
  return { sb, G, moi: G.player };
}
const carte = (sb, id) => vm.runInContext('CIVIC_MARKET', sb).find(c => c.id === id);

console.log('═'.repeat(80));
console.log('PLAFOND DE MORAL PAR FORME DE GOUVERNEMENT — TYRANNIE 6, CORPORATIONS 7');
console.log('═'.repeat(80) + '\n');

/* ── 1. LES DONNÉES PORTENT LE PLAFOND ────────────────────────────────────── */
console.log('1. Les deux formes autoritaires déclarent leur plafond');
{
  const m = partie();
  const attendu = { gov_tyrannie: 6, gov_corpo: 7 };
  for (const [id, cap] of Object.entries(attendu)) {
    const c = carte(m.sb, id);
    if (c && c.govForm && c.govForm.moraleCap === cap) ok(c.name + ' : plafond ' + cap);
    else ko(id + ' : plafond ' + (c && c.govForm && c.govForm.moraleCap) + ' au lieu de ' + cap);
    /* Le texte affiché sur la carte doit le dire : une règle invisible n'est pas une règle. */
    if (c && /plafonn/i.test(c.effect || '')) ok('   et la carte l\'annonce au joueur');
    else ko(c.name + ' : la carte ne mentionne pas son plafond');
  }
  /* CONTRE-ÉPREUVE : les formes non autoritaires n'en ont PAS. */
  for (const id of ['gov_senat', 'gov_democratie']) {
    const c = carte(m.sb, id);
    if (c && c.govForm && !c.govForm.moraleCap) ok(c.name + ' : aucun plafond — le malus n\'a pas débordé');
    else ko(c.name + ' a hérité d\'un plafond qu\'il ne devrait pas avoir');
  }
}

/* ── 2. LE PLAFOND MORD ───────────────────────────────────────────────────── */
console.log('\n2. Sous Tyrannie, le moral ne dépasse pas 6');
{
  const m = partie();
  m.sb.adoptGovForm(m.moi, carte(m.sb, 'gov_tyrannie'));
  note('plafond retenu par la nation : ' + m.moi.govFormMoraleCap);
  m.moi.res.morale = 10;                 // par un événement, un accord, une tech — peu importe la source
  m.sb.enforceCaps();
  note('moral porté à 10, puis écrêtage de fin de tour → ' + m.moi.res.morale);
  if (m.moi.res.morale === 6) ok('écrêté à 6, quelle qu\'ait été la source du gain');
  else ko('moral à ' + m.moi.res.morale + ' au lieu de 6 — le plafond ne mord pas');
  /* Les AUTRES plafonds doivent rester intacts : c'est le risque d'un `realResCap` retouché. */
  m.moi.res.energy = 99; m.moi.res.materials = 99; m.moi.res.science = 99;
  m.sb.enforceCaps();
  const r = m.moi.res;
  if (r.energy === 12 && r.materials === 20 && r.science === 10)
    ok('et 12⚡ / 20🪨 / 10🔬 sont toujours appliqués');
  else ko('les autres plafonds ont dérivé : ' + r.energy + '⚡ ' + r.materials + '🪨 ' + r.science + '🔬');
}

/* ── 3. L'ADOPTION N'ÉCRÊTE PAS : c'est la fin de tour qui le fait ─────────── */
console.log('\n3. Le choix de Marc — l\'écrêtage attend la fin du tour');
{
  /* « Rabaissé à 6 en fin de tour, au même moment où le plafond de 10 rabaisse la valeur
     d'habitude. » Adopter à 9❤️ : le −2 amène à 7, et 7 tient jusqu'à l'écrêtage. */
  const m = partie();
  m.moi.res.morale = 9;
  m.sb.adoptGovForm(m.moi, carte(m.sb, 'gov_tyrannie'));
  note('adoption à 9❤️, malus −2 → ' + m.moi.res.morale + ' (au-dessus du plafond 6)');
  if (m.moi.res.morale === 7) ok('l\'adoption applique le −2 et RIEN de plus');
  else ko('l\'adoption a écrêté immédiatement : moral ' + m.moi.res.morale + ' au lieu de 7');
  m.sb.enforceCaps();
  note('après l\'écrêtage de fin de tour → ' + m.moi.res.morale);
  if (m.moi.res.morale === 6) ok('et c\'est l\'écrêtage habituel qui ramène à 6');
  else ko('le moral reste à ' + m.moi.res.morale + ' après écrêtage');
}

/* ── 4. CONTRE-ÉPREUVE — sans forme autoritaire, le plafond reste 10 ───────── */
console.log('\n4. CONTRE-ÉPREUVE — hors forme autoritaire, rien ne change');
{
  /* Le risque d'un plafond lu dans `realResCap` : le rendre à 0 ou à 6 pour une nation qui n'a
     adopté aucune forme, et priver tout le monde de moral dès le premier tour. */
  const m = partie();
  note('forme de gouvernement : ' + (m.moi.govForm || 'aucune'));
  m.moi.res.morale = 10;
  m.sb.enforceCaps();
  if (m.moi.res.morale === 10) ok('sans forme adoptée, le moral tient à 10');
  else ko('moral écrêté à ' + m.moi.res.morale + ' sans aucune forme adoptée');
  /* Et une forme SANS plafond ne doit rien changer non plus. */
  m.sb.adoptGovForm(m.moi, carte(m.sb, 'gov_senat'));
  m.moi.res.morale = 10;
  m.sb.enforceCaps();
  if (m.moi.res.morale === 10) ok('sous Sénat Solaire non plus');
  else ko('le Sénat Solaire plafonne le moral à ' + m.moi.res.morale);
}

/* ── 5. CONTRE-ÉPREUVE — changer de forme LÈVE le plafond ──────────────────── */
console.log('\n5. CONTRE-ÉPREUVE — quitter la Tyrannie lève son plafond');
{
  const m = partie();
  m.sb.adoptGovForm(m.moi, carte(m.sb, 'gov_tyrannie'));
  const moralApresTyrannie = m.moi.res.morale;
  m.sb.adoptGovForm(m.moi, carte(m.sb, 'gov_senat'));
  note('Tyrannie → Sénat Solaire · plafond retenu : ' + (m.moi.govFormMoraleCap || 'aucun'));
  m.moi.res.morale = 10;
  m.sb.enforceCaps();
  if (m.moi.res.morale === 10) ok('le moral remonte librement à 10');
  else ko('le plafond survit à la forme qui l\'a posé — moral bloqué à ' + m.moi.res.morale);
  /* Mais le moral PERDU ne revient pas : c'est écrit dans les règles, il faut que ce soit vrai. */
  const m2 = partie();
  const avant = m2.moi.res.morale;
  m2.sb.adoptGovForm(m2.moi, carte(m2.sb, 'gov_tyrannie'));
  const creux = m2.moi.res.morale;
  m2.sb.adoptGovForm(m2.moi, carte(m2.sb, 'gov_senat'));
  note('moral ' + avant + ' → ' + creux + ' (adoption) → ' + m2.moi.res.morale + ' (changement)');
  if (m2.moi.res.morale === creux) ok('et le −2 de la Tyrannie n\'est pas remboursé au départ');
  else ko('changer de forme a rendu le moral perdu — « ne sont jamais récupérées » devient faux');
}

/* ── 6. LE PLAFOND SURVIT À UNE SAUVEGARDE ────────────────────────────────── */
console.log('\n6. Le plafond traverse une sauvegarde / reprise');
{
  /* En ligne la partie vit dans un fichier : un champ oublié à la sérialisation, et le plafond
     disparaît au premier redémarrage du serveur, sans que rien ne le signale. */
  const m = partie();
  m.sb.adoptGovForm(m.moi, carte(m.sb, 'gov_corpo'));
  const brut = JSON.parse(JSON.stringify(m.sb.serializeGame ? m.sb.serializeGame() : m.G,
    (k, v) => (v instanceof Map ? [...v] : (v instanceof Set ? [...v] : v))));
  const moiRelu = (brut.player || (brut.players || [])[0] || {});
  note('champ relu : govFormMoraleCap = ' + moiRelu.govFormMoraleCap);
  if (moiRelu.govFormMoraleCap === 7) ok('le plafond des Corporations est bien sauvegardé');
  else ko('govFormMoraleCap absent de la sauvegarde — le plafond s\'évapore à la reprise');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Tyrannie plafonne le moral à 6, les Corporations à 7 ; l\'écrêtage attend la fin du');
console.log('   tour, changer de forme lève le plafond, et le moral perdu ne revient pas.');
console.log('═'.repeat(80));
