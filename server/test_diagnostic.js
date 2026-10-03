/* ============================================================================
   TEST — LE RAPPORT DE DIAGNOSTIC : CONSTRUIT, PLAFONNÉ, PROPOSÉ, REÇU (28/09/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Le figeage du 28/09 (espionnage sans fenêtre, §167) n'a laissé aucune trace lisible.
   `diagnostic.js` garde sur l'appareil les erreurs, les figeages et l'état de la partie, et le
   serveur (`diagnostic-serveur.js`) reçoit le rapport. Ce banc vérifie les deux, sans écran ni
   serveur : le fichier client est chargé dans le décor de game-core, avec un localStorage réel
   (en mémoire) puisque c'est lui que le module mesure.

   Points : 1) rapport complet (appareil lu dans un agent utilisateur Android, versions, état) ;
   2) une erreur et une promesse rejetée entrent, avec l'état ; 3) un figeage « question sans
   fenêtre » est détecté à 30 s, pas avant, jamais en ligne ; 4) le plafond de 200 Ko tient ;
   5) la proposition à l'ouverture obéit à « ne plus proposer » ; 6) le serveur refuse trop gros /
   mal formé / incomplet et enregistre un bon rapport ; 7) le balisage porte les boutons attendus.
   Usage : node test_diagnostic.js
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { loadLogic } = require('./game-core.js');
const diag = require('./diagnostic-serveur.js');
const RACINE = path.join(__dirname, '..');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage() {
  const sb = loadLogic(path.join(RACINE, 'index.html'));
  const mem = {};
  sb.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, clear() { for (const k in mem) delete mem[k]; } };
  sb.navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-F741B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36', language: 'fr-CH', deviceMemory: 8, hardwareConcurrency: 8, onLine: true };
  sb.screen = { width: 1080, height: 2640 }; sb.devicePixelRatio = 3; sb.innerWidth = 360; sb.innerHeight = 780;
  sb.SOLAR_BUILD_HTML = '2026-09-28 · v11.02'; sb.SOLAR_APP_VERSION = '11.02 (1102)';
  delete sb.SOLAR_SANS_ECRAN;   // le module ne se branche que « avec écran » ; on branche à la main ensuite
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'diagnostic.js'), 'utf8'), sb, { filename: 'diagnostic.js' });
  sb.SOLAR_SANS_ECRAN = true;
  /* ⚠️ LE DÉCOR MENT DEUX FOIS, ET IL FAUT LE SAVOIR : `getElementById` rend un élément pour TOUT id
     (donc « le tutoriel est actif » et « une fenêtre est ouverte » partout). On rend `null` pour le
     coach et on déclare les fenêtres fermées — sinon les points 3 et 5 seraient rouges sans défaut
     (cf. REPRISE §164.6 : l'instrument fabrique le symptôme). */
  const _gebi = sb.document.getElementById;
  sb.document.getElementById = function (id) { return id === 'tuto-coach' ? null : _gebi.call(sb.document, id); };
  sb._scAnyModalOpen = () => false;
  sb.initGame('ceinturiens', ['terriens', 'jupiteriens']);
  sb.__G.turn = 3; sb.__G.phase = 'actions'; sb.__G._il = true;
  return { sb, mem, G: sb.__G };
}

console.log('═'.repeat(80));
console.log('RAPPORT DE DIAGNOSTIC — CLIENT ET SERVEUR');
console.log('═'.repeat(80) + '\n');

console.log('1. LE RAPPORT EST COMPLET');
{
  const { sb } = montage();
  const r = sb.scDiagRapport('test');
  const a = r.appareil;
  if (a.modele === 'SM-F741B' && a.os === 'Android 14') ok('appareil lu dans l\'agent utilisateur : ' + a.modele + ' · ' + a.os); else ko('appareil mal lu : ' + JSON.stringify(a));
  if (r.versions.html && r.versions.moteur && r.versions.appli === '11.02 (1102)') ok('versions : html, moteur, appli'); else ko('versions incomplètes : ' + JSON.stringify(r.versions));
  const p = r.partie;
  if (p.partie && p.tour === 3 && p.joueur === 'ceinturiens' && Array.isArray(p.nations) && p.nations.length === 3 && Array.isArray(p.journal)) ok('état de partie : tour, joueur, nations, journal'); else ko('état de partie incomplet : ' + JSON.stringify(p).slice(0, 200));
  if (typeof r.journal === 'string' && r.journal.length > 50) ok('journal complet joint (' + r.journal.length + ' car.)'); else ko('journal absent');
  if (r.commentaire === 'test') ok('commentaire joint'); else ko('commentaire perdu');
}

console.log('\n2. ERREURS ET PROMESSES REJETÉES');
{
  const { sb, mem } = montage();
  const e = sb.scDiagNoterErreur({ message: 'x is not a function', filename: 'https://localhost/moteur.js', lineno: 4402, colno: 7, error: { stack: 'TypeError: x is not a function\n    at stEspionnage (moteur.js:4402:7)' } });
  if (e && e.msg === 'x is not a function' && e.ou === 'moteur.js:4402:7' && /stEspionnage/.test(e.pile)) ok('erreur notée avec fichier:ligne et pile'); else ko('erreur mal notée : ' + JSON.stringify(e));
  if (e.etat && e.etat.tour === 3) ok('l\'état de la partie est photographié avec l\'erreur'); else ko('état absent de l\'erreur');
  const d = JSON.parse(mem.sc_debug);
  if (d.erreurs.length === 1 && d.nonEnvoye === true) ok('persistée dans localStorage, marquée non envoyée'); else ko('persistance : ' + JSON.stringify(d).slice(0, 120));
  sb.scDiagErreur('promesse', 'refus', 'Error: refus\n  at f');
  if (sb.scDiagCharger().erreurs.length === 2) ok('la promesse rejetée s\'ajoute'); else ko('promesse non ajoutée');
  /* Contre-épreuve : après envoi (simulé), la liste est vidée mais le compteur reste. */
  const dd = sb.scDiagCharger(); dd.erreurs = []; dd.nonEnvoye = false; dd.envoyes = 1; sb.scDiagSauver();
  if (JSON.parse(mem.sc_debug).erreurs.length === 0 && JSON.parse(mem.sc_debug).envoyes === 1) ok('vidée après envoi, compteur gardé'); else ko('vidage après envoi');
}

console.log('\n3. FIGEAGE « QUESTION SANS FENÊTRE »');
{
  const { sb, G } = montage();
  G._pending = { id: 'd7', kind: 'espionage', nation: 'ceinturiens' };
  const t0 = 1000000;
  if (sb.scDiagSurveiller(t0) === null && sb.scDiagSurveiller(t0 + 10000) === null && sb.scDiagSurveiller(t0 + 29000) === null) ok('rien avant 30 s'); else ko('signalé trop tôt');
  const f = sb.scDiagSurveiller(t0 + 31000);
  if (f && /espionage/.test(f.detail) && f.etat && f.etat.questions && f.etat.questions[0].id === 'd7') ok('figeage signalé à 31 s, avec la question et l\'état'); else ko('figeage non signalé : ' + JSON.stringify(f));
  if (sb.scDiagSurveiller(t0 + 60000) === null) ok('une seule fois par question'); else ko('signalé deux fois');
  /* Contre-épreuve : en ligne, le serveur porte la question — rien n'est signalé. */
  const m2 = montage(); m2.G._pending = { id: 'd1', kind: 'agenda', nation: 'x' }; m2.sb.setDecisionSink(function () {});
  if (m2.sb.scDiagSurveiller(t0) === null && m2.sb.scDiagSurveiller(t0 + 60000) === null) ok('contre-épreuve : jamais en ligne'); else ko('signalé en ligne');
  /* Contre-épreuve : une fenêtre ouverte n'est pas un figeage (le décor rend « fermé » partout, on force). */
  const m3 = montage(); m3.G._pending = { id: 'd2', kind: 'espionage', nation: 'x' }; m3.sb._scAnyModalOpen = () => true;
  m3.sb.scDiagSurveiller(t0); if (m3.sb.scDiagSurveiller(t0 + 60000) === null) ok('contre-épreuve : fenêtre ouverte = attente légitime'); else ko('signalé malgré une fenêtre ouverte');
}

console.log('\n4. LE PLAFOND DE 200 Ko TIENT');
{
  const { sb, mem } = montage();
  const gros = 'x'.repeat(3000);
  for (let i = 0; i < 400; i++) sb.scDiagErreur('erreur', 'e' + i, gros);
  const taille = mem.sc_debug.length, d = JSON.parse(mem.sc_debug);
  if (taille <= 200 * 1024) ok('taille stockée ' + taille + ' ≤ 204800'); else ko('plafond dépassé : ' + taille);
  if (d.erreurs.length <= 30 && d.erreurs[d.erreurs.length - 1].msg === 'e399') ok('30 erreurs au plus, les plus RÉCENTES gardées'); else ko('mauvaise coupe : ' + d.erreurs.length + ' / ' + d.erreurs[d.erreurs.length - 1].msg);
  const r = JSON.stringify(sb.scDiagRapport(''));
  if (r.length <= 2 * 1024 * 1024) ok('rapport envoyé ' + r.length + ' ≤ 2 Mo (plafond serveur, 03/10)'); else ko('rapport trop gros pour le serveur : ' + r.length);
}

console.log('\n5. LA PROPOSITION À L\'OUVERTURE');
{
  const { sb } = montage();
  if (sb.scDiagProposerSiBesoin() === false) ok('rien à envoyer → pas de fenêtre'); else ko('proposée sans raison');
  sb.scDiagErreur('erreur', 'boum', '');
  if (sb.scDiagProposerSiBesoin() === true) ok('une erreur non envoyée → proposée'); else ko('non proposée malgré une erreur');
  const d = sb.scDiagCharger(); d.nePlusProposer = true; sb.scDiagSauver();
  if (sb.scDiagProposerSiBesoin() === false) ok('« ne plus proposer » respecté'); else ko('proposée malgré le refus');
}

console.log('\n6. LE SERVEUR');
{
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-diag-'));
  const bon = JSON.stringify({ v: 1, appareil: { modele: 'SM-F741B', os: 'Android 14' }, versions: { moteur: 'v11.02' }, erreurs: [], partie: { tour: 3 } });
  const r1 = diag.enregistrer(bon, dossier);
  if (r1.ok && fs.existsSync(r1.fichier)) ok('bon rapport enregistré : ' + r1.id); else ko('bon rapport refusé : ' + JSON.stringify(r1));
  const lu = JSON.parse(fs.readFileSync(r1.fichier, 'utf8'));
  if (lu.recu && lu.appareil.modele === 'SM-F741B') ok('relu avec sa date de réception'); else ko('fichier illisible');
  const r2 = diag.enregistrer('{"v":1,"appareil":{}', dossier);
  if (!r2.ok && r2.statut === 400) ok('JSON invalide → 400'); else ko('JSON invalide accepté');
  const r3 = diag.enregistrer(JSON.stringify({ hello: 1 }), dossier);
  if (!r3.ok && r3.statut === 400) ok('rapport incomplet → 400'); else ko('rapport incomplet accepté');
  const r4 = diag.enregistrer(JSON.stringify({ v: 1, appareil: {}, versions: {}, bourrage: 'x'.repeat(2 * 1024 * 1024 + 1024) }), dossier);
  if (!r4.ok && r4.statut === 413) ok('trop volumineux → 413'); else ko('trop volumineux accepté');
  const l = diag.lister(dossier);
  if (l.length === 1 && l[0].appareil === 'SM-F741B · Android 14' && l[0].tour === 3) ok('liste : 1 rapport, appareil et tour résumés'); else ko('liste : ' + JSON.stringify(l));
  /* Plafond de fichiers. */
  for (let i = 0; i < diag.MAX_FICHIERS; i++) fs.writeFileSync(path.join(dossier, 'z' + i + '.json'), '{}');
  const r5 = diag.enregistrer(bon, dossier);
  if (!r5.ok && r5.statut === 429) ok('dossier plein → 429'); else ko('dossier plein accepté');
  fs.rmSync(dossier, { recursive: true, force: true });
  /* Le chemin HTTP est déclaré dans server.js et le fichier part dans l'image. */
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  if (/diagnostic\.traiter\(req, res/.test(srv) && /diagnostics\)\\b/.test(srv)) ok('server.js branche /api/diagnostic et protège /diagnostics'); else ko('server.js ne branche pas le diagnostic');
  const dk = fs.readFileSync(path.join(__dirname, 'Dockerfile'), 'utf8');
  if (/diagnostic-serveur\.js/.test(dk)) ok('Dockerfile copie diagnostic-serveur.js'); else ko('Dockerfile ne copie PAS diagnostic-serveur.js : le serveur déployé tomberait au démarrage');
}

console.log('\n6 bis. MARC EST PRÉVENU PAR COURRIEL (01/10)');
/* Marc : « j'aimerais être prévenu qu'un rapport a été envoyé par quelqu'un depuis notre serveur sur
   l'email contact… ». `traiter` reçoit un rappel `surRapport(rapport, id)` ; server.js y branche
   `sendMail(DIAG_MAIL, …)`. Le courriel résume (appareil, versions, tour, erreurs, commentaire) et
   donne l'adresse de la page des rapports SANS la clé. */
{
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-diag-'));
  const recus = [];
  const faux = (methode, corps) => {
    const h = {}; const req = { url: '/api/diagnostic', method: methode, on(ev, fn) { h[ev] = fn; return req; } };
    const res = { setHeader() {}, writeHead(c) { res.code = c; }, end(t) { res.corps = t; } };
    const t = diag.traiter(req, res, dossier, () => true, (r, id) => recus.push({ r, id }));
    if (h.data && corps !== undefined) h.data(corps); if (h.end) h.end();
    return { traite: t, res };
  };
  const bon = JSON.stringify({ v: 1, appareil: { modele: 'SM-F741B', os: 'Android 14' }, versions: { moteur: 'v11.10' }, erreurs: [{ quand: '2026-10-01T20:00:00Z', type: 'erreur', msg: 'TypeError: boum', ou: 'moteur.js:42', pile: 'at f (moteur.js:42)\nat g' }], figeages: [], partie: { tour: 5, civ: 'Ceinturiens' }, commentaire: 'Le jeu a figé.', journal: 'TOUR 1\n[Terriens] Achète Ordinateur Quantique\nTOUR 2\n[Ceinturiens] Coloniser Triton' });
  const a = faux('POST', bon);
  if (a.traite && a.res.code === 200 && recus.length === 1 && recus[0].r.appareil.modele === 'SM-F741B' && /^\d{4}-/.test(recus[0].id)) ok('rapport valide → rappel appelé une fois, avec le rapport et son identifiant');
  else ko('rappel non appelé sur un rapport valide (code ' + a.res.code + ', appels ' + recus.length + ')');
  const b = faux('POST', '{"v":1');
  if (b.res.code === 400 && recus.length === 1) ok('rapport invalide → aucun rappel (contre-épreuve)'); else ko('rappel appelé sur un rapport invalide');
  const c = faux('OPTIONS');
  if (c.res.code === 204 && recus.length === 1) ok('OPTIONS → aucun rappel'); else ko('rappel appelé sur OPTIONS');
  /* Sans rappel, rien ne casse (anciens appelants). */
  const req2 = { url: '/api/diagnostic', method: 'POST', on(ev, fn) { if (ev === 'end') fn(); return req2; } };
  const res2 = { setHeader() {}, writeHead(c) { res2.code = c; }, end() {} };
  let casse = false; try { diag.traiter(req2, res2, dossier, () => true); } catch (e) { casse = true; }
  if (!casse) ok('sans rappel : rien ne casse'); else ko('traiter sans rappel lève une exception');
  /* Le courriel lui-même : une fonction pure, testable. */
  const m = diag.courriel(recus[0].r, recus[0].id, 'https://live.solar-game.com');
  if (m && /SM-F741B/.test(m.texte) && /v11\.10/.test(m.texte) && /tour 5/i.test(m.texte) && /Le jeu a figé/.test(m.texte)) ok('courriel : appareil, version, tour, commentaire'); else ko('courriel incomplet : ' + JSON.stringify(m));
  /* Marc, 01/10 soir : TOUT dans le courriel — l'erreur avec son emplacement, et le journal ENTIER. */
  if (m && /TypeError: boum/.test(m.texte) && /moteur\.js:42/.test(m.texte) && /Coloniser Triton/.test(m.texte) && /TOUR 1/.test(m.texte)) ok('courriel : l\'erreur (message + emplacement) et le journal entier y sont'); else ko('courriel sans le détail des erreurs ou sans le journal');
  if (m && m.pieces && m.pieces.length === 1 && /\.json$/.test(m.pieces[0].filename) && JSON.parse(m.pieces[0].content).journal) ok('courriel : le rapport brut en pièce jointe (' + m.pieces[0].filename + ')'); else ko('courriel : pièce jointe absente');
  if (m && !/key=/.test(m.texte) && /\/stats/.test(m.texte)) ok('courriel : renvoie à /stats, aucune clé à composer'); else ko('courriel : lien avec clé ou sans /stats');
  if (m && /diagnostic/i.test(m.sujet) && /SM-F741B/.test(m.sujet)) ok('sujet : « ' + m.sujet + ' »'); else ko('sujet : ' + (m && m.sujet));
  /* server.js branche bien le rappel sur l'envoi. */
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  if (/DIAG_MAIL/.test(srv) && /diagnostic\.traiter\(req, res,[\s\S]{0,120}?\(r, id\)\s*=>/.test(srv) && /contact@solar-game\.com/.test(srv) && /sendMail\(DIAG_MAIL, m\.sujet, m\.texte, m\.pieces\)/.test(srv)) ok('server.js : DIAG_MAIL (contact@solar-game.com par défaut), rappel branché sur sendMail AVEC la pièce jointe'); else ko('server.js ne branche pas le courriel de diagnostic (avec pièce jointe)');
  if (/diagStatsHtml\(\)/.test(srv) && /Rapports de diagnostic/.test(srv) && /diagnostic\.lire\(/.test(srv)) ok('server.js : /stats liste les rapports avec leur contenu'); else ko('server.js : /stats sans la section des rapports');
  fs.rmSync(dossier, { recursive: true, force: true });
}

console.log('\n7. LA FENÊTRE');
{
  const { sb } = montage();
  const h = sb.scDiagBalisage(true);
  /* 03/10 (Marc) : trois boutons seulement — Retour, Copier le rapport, Envoyer le rapport. */
  for (const id of ['sc-diag-oui', 'sc-diag-non', 'sc-diag-copier', 'sc-diag-com']) if (h.indexOf('id="' + id + '"') < 0) ko('bouton/champ manquant : ' + id);
  if (/ni votre nom, ni votre adresse/.test(h) && /confidentialite\.html/.test(h)) ok('le texte dit ce qui part, ce qui ne part pas, et lie la confidentialité'); else ko('texte incomplet');
  if ((h.match(/min-height:44px/g) || []).length >= 3) ok('boutons de 44 px'); else ko('boutons trop petits');
  if (h.indexOf('sc-diag-jamais') < 0 && h.indexOf('sc-diag-voir') < 0 && sb.scDiagBalisage(true).indexOf('sc-diag-jamais') < 0) ok('ni « Voir » ni « Ne plus proposer » (03/10)'); else ko('bouton retiré encore présent');
  const idx = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  if ((idx.match(/scDiagOuvrir\(false\)/g) || []).length === 2 && /<script src="diagnostic\.js">/.test(idx) && /__scErreursPrecoces/.test(idx)) ok('index.html : deux boutons, le script, le tampon précoce'); else ko('index.html incomplet');
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  if (/diagnostic\.js/.test(sw)) ok('sw.js pré-cache diagnostic.js'); else ko('sw.js oublie diagnostic.js');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   • ' + e)); process.exit(1); }
console.log('✅ Tout est vert.');
