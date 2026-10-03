/* ============================================================================
   TEST — UNE CAPITALE PARTAGÉE EST DÉFENDUE PAR SON PROPRIÉTAIRE
   ----------------------------------------------------------------------------
   Partie 997D (06/09), tour 8. Laurent (Terriens) a une colonie Extra-Solaire sur Éris, la
   capitale de Marc (Ceinturiens). Le Jupitérien assaille Éris : la guerre est déclarée à LAURENT,
   la fenêtre de défense va à LAURENT, la garnison comptée est celle de LAURENT (1) — et Marc,
   propriétaire de la capitale, n'est ni consulté ni compté. « Éris CAPTURÉE (1🛡️ vs 7⚔️) », les
   deux cohabitants expulsés, +10 VP au Jupitérien.

   CAUSE. `defenseurPrincipal` prend le plus DÉVELOPPÉ sur le nœud, et à égalité le premier de la
   liste. Une capitale se défend à 10 : son propriétaire est le seul défenseur qui ait un sens.

   RÈGLES VERROUILLÉES ICI :
     1. sur un nœud partagé, le propriétaire de la CAPITALE est le défenseur principal, quel que
        soit le niveau des colonies en présence et l'ordre de la liste ;
     2. par la porte unique (`resoudreAssautIA`), c'est donc LUI qui reçoit la fenêtre de défense,
        et la menace y est confrontée à SA garnison (10) — la fenêtre annonce cette garnison ;
     3. le cohabitant humain est PRÉVENU (notice), puis CONSULTÉ À SON TOUR (règle de Marc, 07/09,
        partie F04B : « le propriétaire initial PUIS l'hôte, chacun dit ce qu'il investit, on
        additionne ») — ce qu'il engage, il le paie ; ce qu'il n'engage pas ne lui coûte rien ;
     4. CONTRE-ÉPREUVE — sans capitale en jeu, la règle d'avant tient : le plus développé défend.

   Usage : node test_capitale_partagee.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* L'ordre de 997D : Terriens (Laurent) en premier, Ceinturiens (Marc) en dernier. */
function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const lau = G.player, jup = G.ais[0], marc = G.ais[1];
  lau._isAI = false; jup._isAI = true; marc._isAI = false;
  for (const n of [lau, jup, marc]) { n.res.energy = 20; n.res.materials = 20; n.res.science = 5; n.res.morale = 8; n.acLeft = 3; }
  jup.forceTokens = 7; lau.forceTokens = 6; marc.forceTokens = 6;
  /* Laurent cohabite sur Éris (Extra-Solaire), au même niveau que la capitale de Marc. */
  lau.colonies.push({ nodeId: 'eris', level: 1, connected: true, extrasolar: true });
  jup.colonies.push({ nodeId: 'pluto', level: 2, connected: true });
  sb.setDecisionSink(function () {});
  G._pendings = [];
  return { sb, G, lau, jup, marc };
}
const texte = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log('═'.repeat(84));
console.log('CAPITALE PARTAGÉE — SON PROPRIÉTAIRE LA DÉFEND, À 10, ET LE COHABITANT EST PRÉVENU');
console.log('═'.repeat(84) + '\n');

/* ── 1. Le défenseur principal ─────────────────────────────────────────────── */
console.log('1. `defenseurPrincipal(eris)` : le propriétaire de la capitale, pas le premier de la liste');
{
  const m = montage();
  const d = m.sb.defenseurPrincipal('eris', m.jup);
  note('défenseur principal : ' + (d ? d.civ.name : 'aucun') + ' · occupants : ' + m.sb.occupantsDuNoeud('eris').map(n => n.civ.name).join(', '));
  if (d === m.marc) ok('Ceinturiens — c\'est SA capitale');
  else ko('défenseur principal = ' + (d ? d.civ.name : 'aucun') + ' (le cohabitant, comme dans 997D)');
  /* Même avec une colonie cohabitante PLUS développée : la capitale prime. */
  m.lau.colonies.find(c => c.nodeId === 'eris').level = 3;
  const d2 = m.sb.defenseurPrincipal('eris', m.jup);
  if (d2 === m.marc) ok('même face à une colonie cohabitante Nv.3 : la capitale prime sur le niveau');
  else ko('une colonie Nv.3 cohabitante passe devant la capitale');
}

/* ── 2 & 3. La fenêtre de défense va au propriétaire, avec sa garnison ; le cohabitant est prévenu */
console.log('\n2. Par la porte unique : fenêtre chez le propriétaire (garnison 10 annoncée), notice chez le cohabitant');
{
  const m = montage();
  const av = (m.G.log || []).length;
  const r = m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'eris' });
  const q = (m.G._pendings || []).find(p => p.kind === 'defense');
  const dest = q && q.nation;
  note('coup accepté : ' + r + ' · fenêtre de défense chez : ' + (dest || 'personne') + ' · garnison annoncée : ' + (q && q.payload ? q.payload.garrison : '—'));
  if (dest === 'ceinturiens') ok('la fenêtre de défense va au propriétaire de la capitale');
  else ko('la fenêtre de défense va à « ' + dest + ' » (997D : Laurent)');
  if (q && q.payload && q.payload.garrison === 10) ok('la fenêtre annonce la garnison de capitale : 10');
  else ko('garnison annoncée : ' + (q && q.payload ? q.payload.garrison : 'absente') + ' au lieu de 10');
  const w = m.sb._warBetween('jupiteriens', 'ceinturiens');
  if (w) ok('la guerre est déclarée à Ceinturiens, pas au cohabitant');
  else ko('guerre Jupitériens ↔ Ceinturiens absente (déclarée à ' + (m.sb._warBetween('jupiteriens', 'terriens') ? 'Terriens' : 'personne') + ')');
  const notices = (m.G._pendings || []).filter(p => p.kind === 'raid_hit' && p.nation === 'terriens').map(p => texte((p.payload.title || '') + ' ' + (p.payload.body || '')));
  note('notice chez Terriens : ' + (notices[0] || 'aucune').slice(0, 110));
  if (notices.some(t => /Éris/.test(t) && /Ceinturiens/.test(t))) ok('le cohabitant est prévenu : qui attaque, où, et qui défend');
  else ko('le cohabitant n\'est pas prévenu');
  const mat = m.lau.res.materials, jet = m.lau.forceTokens;
  /* Le propriétaire répond : 0 jeton — sa garnison seule (10) doit repousser 7. */
  if (q) m.sb.resolveDecision(q.id, { tokens: 0, cruiser: false });
  /* 07/09 : le combat ATTEND l'hôte. Une seconde fenêtre « defense » marquée renfort va à Terriens. */
  const q2 = (m.G._pendings || []).find(p => p.kind === 'defense' && p.id !== (q && q.id));
  note('seconde fenêtre : ' + (q2 ? (q2.nation + (q2.payload && q2.payload.renfort ? ' (renfort, principal : ' + q2.payload.principal + ')' : ' (SANS marque renfort)')) : 'aucune'));
  if (q2 && q2.nation === 'terriens' && q2.payload && q2.payload.renfort) ok('l\'hôte est consulté APRÈS le propriétaire, fenêtre marquée renfort');
  else ko('l\'hôte n\'est pas consulté après le propriétaire');
  if (q2) m.sb.resolveDecision(q2.id, { defTokens: 0 });
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  /* ⚠️ « repoussé » apparaît maintenant DEUX fois au journal : la ligne de combat, et la ligne de
     tension ajoutée le 16/09 (« assaut repoussé », §134 étape 3) — écrite après, donc lue en premier.
     On écarte explicitement la ligne de tension : c'est le COMBAT qu'on cherche. */
  const combat = j.find(t => /repouss|CAPTUR/.test(t) && !/tension envers|Tension/i.test(t)) || '—';
  note('combat : ' + combat.slice(0, 90));
  if (m.marc.colonies.some(c => c.nodeId === 'eris') && /repouss/.test(combat)) ok('la capitale tient avec sa seule garnison (10 contre 7)');
  else ko('la capitale tombe ou le combat ne s\'est pas joué sur sa garnison');
  if (m.lau.res.materials === mat && m.lau.forceTokens === jet) ok('l\'hôte qui n\'engage rien ne paie rien');
  else ko('l\'hôte a payé sans rien engager (🪨 ' + mat + '→' + m.lau.res.materials + ', jetons ' + jet + '→' + m.lau.forceTokens + ')');
}

/* ── 2 bis. LA SOMME — l'hôte engage, ses jetons s'ajoutent, il paie ; s'ils perdent, les deux tombent */
console.log('\n2 bis. La somme des deux défenses (F04B, 07/09) — et la chute commune');
{
  /* Titan (pas une capitale) : Marc propriétaire Nv.1, Laurent hôte extra-solaire. Jupitérien à 7. */
  const m = montage();
  m.marc.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  m.lau.colonies.push({ nodeId: 'titan', level: 1, connected: true, noUpgrade: true });
  const d = m.sb.defenseurPrincipal('titan', m.jup);
  if (d === m.marc) ok('hors capitale, le propriétaire INITIAL (sans noUpgrade) est le principal, pas l\'hôte');
  else ko('défenseur principal de Titan : ' + (d ? d.civ.name : 'aucun') + ' au lieu de Ceinturiens');
  const av = (m.G.log || []).length;
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'titan' });
  const q = (m.G._pendings || []).find(p => p.kind === 'defense' && p.nation === 'ceinturiens');
  if (!q) ko('pas de fenêtre de défense chez le propriétaire');
  const jetAv = m.jup.forceTokens;
  /* Propriétaire 3 + hôte 3 + garnison 1 = 7 contre 7 → égalité au défenseur : la place tient. */
  if (q) m.sb.resolveDecision(q.id, { defTokens: 3, cruiser: false });
  const q2 = (m.G._pendings || []).find(p => p.kind === 'defense' && p.nation === 'terriens' && p.payload && p.payload.renfort);
  if (q2) ok('l\'hôte Terriens reçoit sa fenêtre de renfort'); else ko('pas de fenêtre de renfort chez l\'hôte');
  const matL = m.lau.res.materials, jetL = m.lau.forceTokens;
  if (q2) m.sb.resolveDecision(q2.id, { defTokens: 3 });
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  const combat = j.find(t => /repouss|CAPTUR|Égalité/.test(t) && !/tension envers|Tension/i.test(t)) || '—';
  const renfort = j.find(t => /aux côtés de/.test(t)) || '—';
  note('renfort : ' + renfort.slice(0, 90)); note('combat : ' + combat.slice(0, 90));
  if (/\+3⚔️/.test(renfort)) ok('l\'hôte ajoute exactement ce qu\'il a dit : +3⚔️'); else ko('renfort de l\'hôte absent ou différent de 3');
  if (/7🛡️/.test(combat) && /repouss|Égalité/.test(combat) && m.marc.colonies.some(c => c.nodeId === 'titan')) ok('défense totale 3 + 3 + 1 = 7 : la place tient (égalité, règle du 02/10)');
  else ko('la somme n\'est pas 7 ou la place tombe : ' + combat.slice(0, 60));
  if (m.lau.forceTokens < jetL) ok('l\'hôte a payé ses 3 jetons (' + jetL + ' → ' + m.lau.forceTokens + ')'); else ko('l\'hôte n\'a rien payé alors qu\'il a engagé 3');
  if (m.lau.res.materials < matL) ok('… et leurs matériaux'); else ko('… sans matériaux prélevés');
  /* F04B (#113) : la fenêtre de résultat et les lignes de journal appartiennent au DÉFENSEUR, pas au
     pivot (`G.player` = Terriens ici). Marc lisait « Tes positions tiennent » pour Titan, colonie
     de Claude, et le rapport signait la défense « Terriens ». */
  const wr = (m.G._pendings || []).find(p => p.kind === 'war_result');
  note('war_result chez : ' + (wr ? wr.nation + ' · civs ' + JSON.stringify(wr.payload && wr.payload.civs) : 'aucune'));
  if (wr && wr.nation === 'ceinturiens') ok('la fenêtre de résultat va au défenseur, pas au pivot');
  else ko('war_result chez « ' + (wr ? wr.nation : 'personne') + ' » (pivot : ' + m.G.player.civ.id + ')');
  if (wr && wr.payload && Array.isArray(wr.payload.civs) && wr.payload.civs.includes('ceinturiens') && wr.payload.civs.includes('jupiteriens') && !wr.payload.civs.includes('terriens'))
    ok('… adressée aux deux belligérants seulement');
  else ko('… civs = ' + JSON.stringify(wr && wr.payload && wr.payload.civs));
  const ligneDef = (m.G.log || []).find(l => /Défense : 3 jeton/.test(String(l.msg)));
  note('ligne « Défense : 3 jetons » signée : ' + (ligneDef ? ligneDef.civ : 'absente'));
  if (ligneDef && ligneDef.civ === 'ceinturiens') ok('le journal signe la défense du nom du défenseur');
  else ko('la défense est signée « ' + (ligneDef ? ligneDef.civ : '—') + ' »');

  /* Même montage, mais l'hôte n'engage qu'1 : 3 + 1 + 1 = 5 < 7 → Titan tombe, LES DEUX sont chassés. */
  const n = montage();
  n.marc.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  n.lau.colonies.push({ nodeId: 'titan', level: 1, connected: true, noUpgrade: true });
  n.sb.appliquerCoup(n.jup, { type: 'assaut', node: 'titan' });
  const r1 = (n.G._pendings || []).find(p => p.kind === 'defense' && p.nation === 'ceinturiens');
  if (r1) n.sb.resolveDecision(r1.id, { defTokens: 3, cruiser: false });
  const r2 = (n.G._pendings || []).find(p => p.kind === 'defense' && p.nation === 'terriens' && p.payload && p.payload.renfort);
  if (r2) n.sb.resolveDecision(r2.id, { defTokens: 1 });
  const marcLa = n.marc.colonies.some(c => c.nodeId === 'titan'), lauLa = n.lau.colonies.some(c => c.nodeId === 'titan'), jupLa = n.jup.colonies.some(c => c.nodeId === 'titan');
  note('après 3+1+1=5 contre 7 — Ceinturiens : ' + (marcLa ? 'encore là' : 'chassé') + ' · Terriens : ' + (lauLa ? 'encore là' : 'chassé') + ' · Jupitériens : ' + (jupLa ? 'installé' : 'absent'));
  if (!marcLa && !lauLa && jupLa) ok('la place tombe : les DEUX occupants sont chassés, l\'assaillant s\'installe');
  else ko('chute partielle ou absente');
}

/* ── 2 ter. ASSAUT D'UN HUMAIN sur un nœud partagé : même règle par l'autre porte ──────────── */
console.log('\n2 ter. Assaut HUMAIN sur Titan partagé — propriétaire humain questionné, hôte ordinateur via le pilote');
{
  const { Engine } = require('./game-core.js');
  const eng = new Engine(HTML); const sb = eng.sb;
  sb.initGame('terriens', ['jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 8; G.phase = 'actions';
  const lau = G.player, jup = G.ais[0], marc = G.ais[1];
  lau._isAI = false; jup._isAI = true; marc._isAI = false;
  for (const n of [lau, jup, marc]) { n.res.energy = 20; n.res.materials = 20; n.res.morale = 8; n.acLeft = 3; }
  lau.forceTokens = 8; marc.forceTokens = 6; jup.forceTokens = 6;
  /* Titan : Marc propriétaire, le Jupitérien hôte (extra-solaire). Laurent attaque avec 4. */
  marc.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  jup.colonies.push({ nodeId: 'titan', level: 1, connected: true, noUpgrade: true });
  jup.colonies.push({ nodeId: 'ceres', level: 2, connected: true });   // 3 colonies : le pilote n'est plus « dos au mur »
  const vus = []; sb.setDecisionSink(p => vus.push(p)); G._pendings = [];
  const av = (G.log || []).length;
  eng.apply({ type: 'attack', node: 'titan', tokens: 4 });
  const q = (G._pendings || []).find(p => p.kind === 'defense');
  note('fenêtre de défense chez : ' + (q ? q.nation : 'personne'));
  if (q && q.nation === 'ceinturiens') ok('le propriétaire humain est questionné en premier'); else ko('défense chez « ' + (q ? q.nation : '—') + ' »');
  const jetJ = jup.forceTokens;
  if (q) sb.resolveDecision(q.id, { defTokens: 2 });
  const q2 = (G._pendings || []).find(p => p.kind === 'defense' && q && p.id !== q.id);
  if (!q2) ok('l\'hôte ordinateur n\'a pas de fenêtre : le pilote répond pour lui'); else ko('une fenêtre est partie chez « ' + q2.nation + ' » pour un hôte ordinateur');
  const j = (G.log || []).slice(0, (G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  const renfort = j.find(t => /aux côtés de/.test(t)) || '—';
  const combat = j.find(t => /repouss|captur|CAPTUR|tient|Tu prends|Victoire|Défaite/i.test(t)) || '—';
  note('renfort : ' + renfort.slice(0, 90)); note('combat : ' + combat.slice(0, 90));
  const n = (renfort.match(/\+(\d+)⚔️/) || [])[1];
  const attendu = sb.defenseIA(jup, lau, 'titan');
  if (n !== undefined && Number(n) === attendu && attendu < jetJ) ok('l\'hôte ajoute ' + n + '⚔️ — ce que le pilote (defenseIA) a décidé, pas tout son stock (' + jetJ + ')');
  else ko('renfort de l\'hôte : ' + renfort.slice(0, 60));
  if (jup.forceTokens < jetJ) ok('l\'hôte a payé ce qu\'il a engagé (' + jetJ + ' → ' + jup.forceTokens + ')'); else ko('l\'hôte n\'a rien payé');
  const wr = (G._pendings || []).find(p => p.kind === 'war_result');
  if (wr && wr.nation === 'terriens') ok('la fenêtre de résultat reste chez l\'attaquant, qui la lit'); else ko('war_result chez « ' + (wr ? wr.nation : '—') + ' »');
}

/* ── 4. CONTRE-ÉPREUVE — sans capitale, le plus développé défend ─────────── */
console.log('\n3. CONTRE-ÉPREUVE — nœud partagé sans capitale : le plus développé reste le défenseur principal');
{
  const m = montage();
  /* Titan : Marc Nv.1, Laurent Nv.2 — aucune capitale. */
  m.marc.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  m.lau.colonies.push({ nodeId: 'titan', level: 2, connected: true });
  const d = m.sb.defenseurPrincipal('titan', m.jup);
  note('Titan : ' + (d ? d.civ.name : 'aucun'));
  if (d === m.lau) ok('Terriens (Nv.2) devant Ceinturiens (Nv.1) — règle inchangée hors capitale');
  else ko('hors capitale, la règle du niveau ne tient plus');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Une capitale partagée est défendue par son propriétaire, à 10, et le cohabitant le sait.');
console.log('═'.repeat(84));
