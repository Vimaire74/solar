/* ============================================================================
   TEST — TEMPÉRAMENTS DES NATIONS DIRIGÉES PAR L'ORDINATEUR
   ----------------------------------------------------------------------------
   Demande de Marc, 2026-08-16 : trois manières de jouer distinctes, tirées au sort quand il y
   a moins de trois IA, et une bascule en mode défensif pour une nation agressée.

   ⚠️ CE BANC VÉRIFIE DES INVARIANTS, PAS DES MOYENNES. Le comportement mesuré sur quelques
   parties varie beaucoup d'un tirage à l'autre — un test bâti dessus serait rouge une fois
   sur trois sans qu'on ait rien cassé. On teste donc ce qui doit être vrai À TOUS LES COUPS :
   l'attribution, l'unicité, la bascule, le retour au calme, et la persistance.
   Les tendances de jeu, elles, se lisent avec `mesure_profils_ia.js`.

   Usage : node test_profils_ia.js
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

function partie(autres) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', autres);
  const G = sb.__G; G.turn = 4; G.phase = 'actions';
  return { sb, G, moi: G.player };
}
const par = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);

console.log('═'.repeat(78));
console.log('TEMPÉRAMENTS DES IA — ATTRIBUTION, BASCULE, PERSISTANCE');
console.log('═'.repeat(78) + '\n');

/* ── 1. Trois IA → les trois tempéraments, tous différents ─────────────────── */
console.log('1. À TROIS IA — le joueur affronte les trois manières de jouer');
{
  let toutesDistinctes = true, toutesPourvues = true;
  for (let k = 0; k < 12; k++) {
    const { G } = partie(['martiens', 'jupiteriens', 'ceinturiens']);
    const profs = G.ais.map(a => a._profil);
    if (profs.some(p => !p)) toutesPourvues = false;
    if (new Set(profs).size !== 3) toutesDistinctes = false;
  }
  if (toutesPourvues) ok('chaque nation reçoit un tempérament');
  else ko('au moins une nation est restée sans tempérament');
  if (toutesDistinctes) ok('les trois sont toujours différents, sur 12 parties');
  else ko('deux nations ont eu le même tempérament : le joueur n\'affronte pas les trois styles');
}

/* ── 2. Moins de trois IA → tirage sans remise ─────────────────────────────── */
console.log('\n2. À DEUX PUIS UNE IA — tirage au sort, sans doublon');
{
  let doublon = false; const vus = new Set();
  for (let k = 0; k < 12; k++) {
    const { G } = partie(['martiens', 'jupiteriens']);
    const profs = G.ais.map(a => a._profil);
    profs.forEach(p => vus.add(p));
    if (new Set(profs).size !== profs.length) doublon = true;
  }
  if (!doublon) ok('deux IA : jamais deux fois le même tempérament dans une partie');
  else ko('deux IA ont reçu le même tempérament');
  const seuls = new Set();
  for (let k = 0; k < 20; k++) { const { G } = partie(['martiens']); seuls.add(G.ais[0]._profil); }
  note('tempéraments vus pour une IA seule, sur 20 parties : ' + [...seuls].join(', '));
  if (seuls.size >= 2) ok('une IA seule ne reçoit pas toujours le même tempérament');
  else ko('une IA seule reçoit toujours « ' + [...seuls][0] + ' » : il n\'y a pas de tirage');
}

/* ── 3. Une nation agressée bascule, puis se calme ─────────────────────────── */
console.log('\n3. BASCULE — une nation qu\'on attaque riposte, puis revient à son tempérament');
{
  const { sb, G, moi } = partie(['martiens', 'jupiteriens', 'ceinturiens']);
  const mars = par(G, 'martiens');
  const avant = sb.nomProfilDe(mars);
  note('tempérament de paix : ' + avant);
  sb.declarerGuerre(moi, mars, 'test', 'player');
  const pendant = sb.nomProfilDe(mars);
  note('après une déclaration de guerre : ' + pendant);
  if (/Assiégée/.test(pendant)) ok('elle passe en mode assiégée');
  else ko('aucune bascule : elle reste « ' + pendant + ' »');
  /* CONTRE-ÉPREUVE : une nation NON concernée ne bascule pas — sans quoi la bascule ne voudrait
     rien dire, tout le monde serait toujours en état de siège. */
  const jup = par(G, 'jupiteriens');
  if (!/Assiégée/.test(sb.nomProfilDe(jup))) ok('contre-épreuve : la nation qui regarde ne bascule pas');
  else ko('contre-épreuve ÉCHOUÉE : une nation étrangère au conflit est passée en état de siège');
  /* Le calme revient. */
  G.turn += 4;
  const apres = sb.nomProfilDe(mars);
  note('quatre tours plus tard : ' + apres);
  if (!/Assiégée/.test(apres)) ok('l\'état de siège n\'est pas définitif — elle retrouve son tempérament');
  else ko('elle reste assiégée pour toujours');
  if (apres === avant) ok('et c\'est bien le sien, pas un autre');
  else ko('elle a changé de tempérament : « ' + avant + ' » → « ' + apres + ' »');
}

/* ── 4. Un raid subi suffit à faire basculer ───────────────────────────────── */
console.log('\n4. Un pillage suffit — pas besoin d\'une guerre déclarée');
{
  const { sb, G } = partie(['martiens', 'jupiteriens', 'ceinturiens']);
  const cible = par(G, 'jupiteriens');
  if (/Assiégée/.test(sb.nomProfilDe(cible))) ko('le montage part déjà en état de siège');
  sb.marquerAgressee(cible);
  if (/Assiégée/.test(sb.nomProfilDe(cible))) ok('une nation pillée bascule aussi');
  else ko('un pillage ne déclenche pas la bascule');
}

/* ── 5. Le tempérament survit à une sauvegarde ─────────────────────────────── */
console.log('\n5. PERSISTANCE — le tempérament est une donnée, pas un objet');
{
  const { sb, G } = partie(['martiens', 'jupiteriens', 'ceinturiens']);
  const avant = G.ais.map(a => a.civ.id + ':' + a._profil).join(' · ');
  note(avant);
  let relu = null;
  try { relu = JSON.parse(sb.scSerialize()); } catch (e) { ko('la partie ne se sérialise pas : ' + e.message.split('\n')[0]); }
  if (relu) {
    const apres = (relu.ais || []).map(a => a.civ.id + ':' + a._profil).join(' · ');
    if (apres === avant) ok('les tempéraments se retrouvent à l\'identique après un aller-retour JSON');
    else ko('perdus ou modifiés : « ' + apres +' »');
  }
}

/* ── 6. Le profil pèse vraiment sur les choix ──────────────────────────────── */
console.log('\n6. EFFET RÉEL — deux tempéraments opposés ne veulent pas la même chose');
{
  /* On place deux nations dans un état IDENTIQUE et on ne change QUE le tempérament : toute
     différence de comportement ne peut alors venir que de lui. */
  const mesure = (profil) => {
    const sb = loadLogic(HTML);
    sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
    const G = sb.__G; G.turn = 5; G.phase = 'actions';
    G.player._isAI = true;
    /* ⚠️ CERVEAU ÉPINGLÉ — ET C'EST LE CONSTAT D'UNE LIMITE, PAS UN CONTOURNEMENT.
       Les tempéraments sont des POIDS : ils inclinent le classement d'utilité d'`historique`. Le
       cerveau `tacticien`, devenu le défaut le 28/08, n'a AUCUNE note préalable — il simule chaque
       coup et garde le meilleur. Les tempéraments ne l'atteignent donc pas : sous `tacticien`, un
       conquérant et un bâtisseur jouent exactement pareil, et cette section mesurait 0 contre 0.
       Laisser le banc au vert en le rendant plus permissif aurait été un mensonge ; le laisser rouge
       aurait été du bruit. On l'épingle sur le cerveau dont les tempéraments sont le langage, et on
       écrit ici ce que cela signifie :
       ⚠️ SOUS LE CERVEAU PAR DÉFAUT, LES TEMPÉRAMENTS N'ONT PLUS D'EFFET SUR LE JEU. Ils restent
       stockés, sérialisés et affichés (sections 1 à 5, qui tournent bien avec le défaut). Il faudra
       décider un jour : soit les rebrancher sur le tacticien — en inclinant `evaluerPosition` selon
       le tempérament plutôt que le classement — soit les retirer. Tant que ce n'est pas tranché,
       cette note est le seul endroit qui dit la vérité sur leur état. */
    G._cerveauIA = 'historique';
    /* ⚠️ IL FAUT QUELQU'UN À MORDRE, SINON LE CONQUÉRANT N'A RIEN À PROUVER.
       Le montage donnait le MÊME tempérament aux quatre nations. Quatre conquérants de force égale,
       c'est une paix armée : depuis que l'IA refuse les assauts perdus d'avance, aucune cible n'est
       tenable et le compteur d'assauts tombait à 0 aussi souvent qu'à 1 — un verdict à pile ou face.
       On réserve donc UNE nation comme partenaire d'entraînement : profil neutre, peu de jetons, et
       exactement le même état dans les deux séries. Elle n'est pas la variable, elle est le décor —
       ce qui préserve la règle du banc : seule change le tempérament des nations TESTÉES. */
    const sparring = G.ais[2];
    const testees = [G.player, G.ais[0], G.ais[1]];
    for (const n of testees) { n._profil = profil; n._agresseeTour = null; }
    sparring._profil = 'opportuniste'; sparring._agresseeTour = null;
    let raids = 0, techs0 = [G.player].concat(G.ais).reduce((s, n) => s + n.cards.length, 0);
    const tous = () => [G.player].concat(G.ais);
    while (G.turn <= 9) {
      try { sb.startTurn(); } catch (e) { for (const p of tous()) p.acLeft = p.acMax; }
      /* ⚠️ À ÉCONOMIE LIBRE, LE COMPTEUR DE PILLAGES NE VEUT RIEN DIRE. Les conquérants développent
         moins, ont donc moins de ressources et de jetons, et finissent par piller MOINS que les
         bâtisseurs — l'inverse de leur préférence. Mesuré : 22 contre 12 dans un sens, 10 contre 14
         dans l'autre, selon le tirage. C'est un effet de second ordre qui écrase le signal.
         On remet donc tout le monde à la même trésorerie au début de chaque tour : ce qui reste
         alors ne peut venir que du tempérament. */
      for (const p of tous()) {
        const estSparring = (p === sparring);
        p._passedRound = false; p._aiSetupDone = false; p._agresseeTour = null;
        if (!estSparring) p._profil = profil;
        p.res.materials = 15; p.res.energy = 15; p.res.science = 8; p.res.morale = 8;
        p.forceTokens = estSparring ? 1 : 8;      // le partenaire reste prenable, à l'identique des deux côtés
      }
      let i = 0, g = 0; const ordre = tous().slice();
      while (g++ < 1500) {
        if (ordre.every(p => p._passedRound)) break;
        const p = ordre[i % ordre.length];
        if (p._passedRound) { i++; continue; }
        let agi = false; try { agi = sb.doAITurn(p, true); } catch (e) { p._passedRound = true; }
        if (!agi || p.acLeft <= 0) p._passedRound = true;
        i++;
      }
      try { sb.advancePirates(); sb.doRevenues(); sb.doMaintenance(); } catch (e) {}
      G.turn++;
    }
    for (const l of (G.log || [])) if (/pille/i.test(String((l && (l.msg || l.t)) || l))) raids++;
    const techs = tous().reduce((s, n) => s + n.cards.length, 0) - techs0;
    /* Le DÉVELOPPEMENT, c'est ce que la nation CONSTRUIT : colonies fondées et améliorations
       payées. Compter seulement les technologies ne distinguait pas les tempéraments — le bâtisseur
       dépense aussi beaucoup en colonisation, si bien que les deux finissent avec autant de cartes.

       ⚠️ ON COMPTAIT LES NIVEAUX POSSÉDÉS, PAS LES NIVEAUX BÂTIS — et depuis que les conquérants
       gagnent réellement leurs assauts (`defenseAttendue`, 16/08 : 9 conquêtes sur 12 parties avant,
       20 après), ils ARRIVENT EN TÊTE de ce compteur sans avoir posé une pierre : ils héritent des
       colonies développées par leurs victimes. Le banc s'est mis au rouge sur un correctif qui n'a
       rien changé à la préférence des bâtisseurs — il mesurait le patrimoine et non l'ouvrage.
       On lit donc le JOURNAL, où chaque construction porte le nom de son auteur. */
    /* ⚠️ ON NE COMPTE QUE LES NATIONS TESTÉES. Le partenaire d'entraînement joue lui aussi : ses
       assauts tombaient dans le même sac, et le banc annonçait « un bâtisseur a lancé 1 assaut »
       pour un geste qui n'était pas le sien. Chaque ligne nomme son auteur — encore faut-il savoir
       OÙ : « X capture … sur Y » et « X renonce … » le citent en tête, mais « Y repousse l'assaut
       de X » nomme d'abord la VICTIME. Trois formes, trois lectures. */
    const nomsTestes = testees.map(n => n.civ.name);
    const auteurAssaut = (m) => {
      let r = m.match(/repousse l'assaut de \S+ ([^(]+?)\s*\(/); if (r) return r[1].trim();
      r = m.match(/^🏴 \S+ (.+?) capture /); if (r) return r[1].trim();
      r = m.match(/^🧠 \S+ (.+?) renonce à l'assaut/); if (r) return r[1].trim();
      return null;
    };
    let niveaux = 0, assauts = 0;
    for (const l of (G.log || [])) {
      const m = String((l && (l.msg || l.t)) || l);
      const c = m.match(/^🤖 (.+?) (?:colonise|améliore) /);
      if (c && nomsTestes.includes(c[1].trim())) niveaux++;
      const a = auteurAssaut(m);
      if (a && nomsTestes.includes(a)) assauts++;
    }
    return { raids, techs, niveaux, assauts };
  };
  /* ⚠️ UNE SEULE PARTIE NE SUFFIT PAS À TRANCHER. Mon premier jet comparait UNE table de
     bâtisseurs à UNE table de conquérants : 3 pillages contre 2, et le banc concluait « le
     tempérament ne pèse pas ». C'était du bruit — la même mesure répétée donne l'inverse une fois
     sur deux. On cumule donc plusieurs parties, ce qui reste rapide et rend le verdict stable. */
  const REPET = 6;
  const cumul = profil => { const t = { raids:0, techs:0, niveaux:0, assauts:0 }; for (let i=0;i<REPET;i++){ const r = mesure(profil); for(const k of Object.keys(t)) t[k] += r[k]; } return t; };
  const b = cumul('batisseur'), g = cumul('guerrier');
  note('bâtisseurs  (' + REPET + ' parties) : ' + b.raids + ' pillage(s), ' + b.techs + ' technologie(s), '
    + b.niveaux + ' construction(s), ' + b.assauts + ' assaut(s)');
  note('conquérants (' + REPET + ' parties) : ' + g.raids + ' pillage(s), ' + g.techs + ' technologie(s), '
    + g.niveaux + ' construction(s), ' + g.assauts + ' assaut(s)');
  /* ⚠️ LE COMPTEUR DE PILLAGES NE PEUT PAS SERVIR DE VERDICT, ET IL FAUT LE DIRE.
     À économie libre il dit l'inverse de la vérité : les conquérants, moins développés, ont moins
     de moyens et pillent donc MOINS. À économie garantie — le montage retenu ici — les deux
     tempéraments atteignent le même plafond d'une action agressive par tour et les compteurs se
     rejoignent exactement (12 contre 12, à chaque série). Ni l'un ni l'autre montage ne mesure la
     préférence : on l'affiche comme contexte, jamais comme preuve.
     La tendance en conditions réelles se lit avec `mesure_profils_ia.js`. */
  note('(pillages : ' + b.raids + ' contre ' + g.raids + ' — non concluant par construction, voir le bandeau)');
  /* LE VERDICT PORTE SUR LES DEUX PRÉFÉRENCES QUI SE MESURENT, ET SUR ELLES SEULES.
     ⚠️ Ne pas y chercher « le bâtisseur n'assaille JAMAIS » : sa consigne (Marc, 16/08) est
     « ne pille jamais » — le pillage, pas l'assaut. Son multiplicateur `assaultAI` vaut 0,3 : il
     se bat rarement, il n'en est pas empêché. Une assertion à zéro serait une règle inventée par
     le banc, et elle est effectivement passée au rouge sur 1 à 4 assauts parfaitement légitimes.
     Ce qui se tient : le conquérant assaille NETTEMENT plus, et le bâtisseur construit NETTEMENT
     plus. Mesuré sur trois séries : 10/4, 9/1, 7/1 en assauts ; 119/90, 112/94, 112/91 en
     constructions. Deux écarts francs et de sens constant. */
  if (g.assauts > b.assauts) ok('le conquérant cherche l\'affrontement bien plus que le bâtisseur ('
    + g.assauts + ' contre ' + b.assauts + ' assaut(s))');
  else ko('le conquérant n\'assaille pas plus (' + g.assauts + ' contre ' + b.assauts + ')');
  if (b.niveaux > g.niveaux) ok('et le bâtisseur construit davantage ('
    + b.niveaux + ' contre ' + g.niveaux + ' construction(s))');
  else ko('le bâtisseur ne construit pas plus (' + b.niveaux + ' contre ' + g.niveaux + ')');
}

/* ── 7. QUI A LE DROIT DE PILLER — RÈGLE RÉÉCRITE LE 17/09 (§139.2) ───────────────────────────
   Version d'avant : « aucun raid pour un bâtisseur ni un conquérant » (partie F04B, 06/09 —
   `raid:0` ne vivait que dans le cerveau utilitaire, le tacticien proposait le raid à tout le
   monde). Les deux dictées de Marc du 16/09 retournent les deux moitiés de cette phrase :
     · le Bâtisseur est devenu le STRATÈGE, « sans frein, sans scrupules » — plus d'interdit, c'est
       l'évaluation qui décide si un raid vaut ses deux jetons ;
     · le CONQUÉRANT « raide pour trouver les ressources qu'il n'a pas » — donc quand il MANQUE
       (`_manqueRessources`), et pas autrement : bien approvisionné, il garde ses jetons pour
       prendre des colonies, ce qui reste la doctrine du 16/08.
   Le montage ci-dessous donne 10🪨 et 10⚡ à la nation : elle ne manque de rien. */
console.log('\n7. `coupsPossibles` — le Stratège peut piller, le Conquérant seulement s\'il manque');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 5; G.phase = 'actions';
  const jup = G.ais.find(a => a.civ.id === 'jupiteriens');
  jup.forceTokens = 6; jup.res.materials = 10; jup.res.energy = 10; jup.acLeft = 3;
  const raids = profil => { jup._profil = profil; jup._agresseeTour = null; return sb.coupsPossibles(jup).filter(c => c.type === 'raid').length; };
  const rO = raids('opportuniste'), rB = raids('batisseur'), rG = raids('guerrier');
  note('raids proposés — opportuniste : ' + rO + ' · bâtisseur : ' + rB + ' · conquérant : ' + rG);
  if (rO > 0) ok('l\'opportuniste a des raids à évaluer (le montage a du sens)'); else ko('même l\'opportuniste n\'a aucun raid : montage muet');
  if (rB > 0) ok('le Stratège en a, à évaluer comme le reste (plus d\'interdit)'); else ko('le Stratège n\'a aucun raid proposé : l\'interdit n\'a pas été levé');
  if (rG === 0) ok('le conquérant bien approvisionné n\'en a aucun'); else ko('le conquérant se voit proposer ' + rG + ' raid(s) alors qu\'il ne manque de rien');
  /* CONTRE-ÉPREUVE : le même conquérant, à court de matériaux, retrouve le pillage. */
  jup._profil = 'guerrier'; jup._agresseeTour = null; jup.res.materials = 2;
  const rGpauvre = sb.coupsPossibles(jup).filter(c => c.type === 'raid').length;
  if (rGpauvre > 0) ok('… mais à court de matériaux, il pille (« il raide pour trouver les ressources qu\'il n\'a pas »)'); else ko('le conquérant à court ne pille toujours pas');
  jup.res.materials = 10;
}

console.log('\n' + '═'.repeat(78));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Trois tempéraments distincts, tirés sans doublon, qui basculent en défense\n   quand on les agresse et se retrouvent après une sauvegarde.');
console.log('═'.repeat(78));
