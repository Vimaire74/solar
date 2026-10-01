/* ============================================================================
   diagnostic-serveur.js — RÉCEPTION DES RAPPORTS DE DIAGNOSTIC (28/09/2026)
   ----------------------------------------------------------------------------
   Le client (diagnostic.js) envoie `POST /api/diagnostic` en `text/plain` (pas de pré-vol CORS),
   corps = JSON du rapport. Ici : plafond de taille, forme minimale, un fichier par rapport dans
   `<DATA>/diagnostics/`, plafond de fichiers. Aucune clé : le rapport ne contient rien de
   personnel et le joueur choisit de l'envoyer. La LECTURE, elle, est protégée (`/diagnostics?key=`).
   Fonctions PURES d'abord (testables sans serveur) ; le branchement HTTP en dernier.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_OCTETS = 300 * 1024;   // le client se plafonne au même chiffre
const MAX_FICHIERS = 200;        // au-delà : 429, on ne remplit pas le disque

/* Vérifie le corps et rend {ok, rapport} ou {ok:false, statut, raison}. */
function verifier(corps) {
  if (typeof corps !== 'string') return { ok: false, statut: 400, raison: 'corps absent' };
  if (Buffer.byteLength(corps, 'utf8') > MAX_OCTETS) return { ok: false, statut: 413, raison: 'rapport trop volumineux (max ' + MAX_OCTETS + ' octets)' };
  let r;
  try { r = JSON.parse(corps); } catch (e) { return { ok: false, statut: 400, raison: 'JSON invalide' }; }
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, statut: 400, raison: 'forme invalide' };
  if (r.v !== 1 || !r.appareil || typeof r.appareil !== 'object' || !r.versions || typeof r.versions !== 'object')
    return { ok: false, statut: 400, raison: 'rapport incomplet (v, appareil, versions attendus)' };
  return { ok: true, rapport: r };
}
/* Écrit le rapport et rend {ok, id, fichier} ou {ok:false, statut, raison}. */
function enregistrer(corps, dossier) {
  const v = verifier(corps);
  if (!v.ok) return v;
  try { fs.mkdirSync(dossier, { recursive: true }); } catch (e) {}
  let existants = [];
  try { existants = fs.readdirSync(dossier).filter(f => f.endsWith('.json')); } catch (e) {}
  if (existants.length >= MAX_FICHIERS) return { ok: false, statut: 429, raison: 'trop de rapports en attente (' + existants.length + ')' };
  const id = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '_' + crypto.randomBytes(3).toString('hex');
  const fichier = path.join(dossier, id + '.json');
  const r = v.rapport; r.recu = new Date().toISOString();
  fs.writeFileSync(fichier, JSON.stringify(r, null, 1));
  return { ok: true, id, fichier };
}
/* Résumé d'un dossier de rapports, pour la page protégée. */
function lister(dossier) {
  let fichiers = [];
  try { fichiers = fs.readdirSync(dossier).filter(f => f.endsWith('.json')).sort().reverse(); } catch (e) { return []; }
  return fichiers.map(f => {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
      return { fichier: f, recu: r.recu, appareil: (r.appareil && (r.appareil.modele + ' · ' + r.appareil.os)) || '?',
               versions: r.versions && r.versions.moteur, erreurs: (r.erreurs || []).length, figeages: (r.figeages || []).length,
               tour: r.partie && r.partie.tour, commentaire: (r.commentaire || '').slice(0, 120) };
    } catch (e) { return { fichier: f, erreur: e.message }; }
  });
}

/* ── Branchement HTTP : rend true si la requête a été traitée ── */
function enTeteCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
/* Le courriel qui prévient Marc (01/10 : « j'aimerais être prévenu qu'un rapport a été envoyé »).
   Fonction PURE : {sujet, texte}. La page des rapports est donnée SANS la clé — un courriel se
   transfère, une clé ne se transfère pas. */
function courriel(r, id, base) {
  r = r || {}; const ap = r.appareil || {}, v = r.versions || {}, pa = r.partie || {};
  const nE = (r.erreurs || []).length, nF = (r.figeages || []).length;
  const modele = ap.modele || '?';
  const sujet = 'Solar — rapport de diagnostic reçu (' + modele + (pa.tour ? ', tour ' + pa.tour : '') + ')';
  const lignes = [
    'Un joueur vient d\'envoyer un rapport de diagnostic depuis l\'application.',
    '',
    'Identifiant : ' + id,
    'Reçu le     : ' + (r.recu || new Date().toISOString()),
    'Appareil    : ' + modele + ' · ' + (ap.os || '?'),
    'Versions    : ' + Object.keys(v).map(k => k + ' ' + v[k]).join(' · '),
    'Partie      : ' + (pa.tour ? 'tour ' + pa.tour : 'aucune partie en cours') + (pa.civ ? ' · ' + pa.civ : ''),
    'Erreurs     : ' + nE + ' erreur' + (nE > 1 ? 's' : '') + ' · ' + nF + ' figeage' + (nF > 1 ? 's' : ''),
    '',
    'Commentaire du joueur :',
    (r.commentaire && String(r.commentaire).trim()) ? String(r.commentaire).trim() : '(aucun)',
    '',
    'Lire le rapport complet (ajoute ta clé d\'administration après key=) :',
    (base || '') + '/diagnostics?key=&f=' + id + '.json',
    'Tous les rapports : ' + (base || '') + '/diagnostics?key=',
  ];
  return { sujet, texte: lignes.join('\n') };
}
/* `surRapport(rapport, id)` : appelé APRÈS l'enregistrement d'un rapport valide, jamais sur un refus
   ni sur OPTIONS. Optionnel : les anciens appelants n'en passent pas. */
function traiter(req, res, dossier, cleValide, surRapport) {
  const url = req.url || '';
  if (url === '/api/diagnostic' || url.indexOf('/api/diagnostic?') === 0) {
    enTeteCors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    if (req.method !== 'POST') { res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"ok":false,"raison":"POST attendu"}'); return true; }
    let corps = '', trop = false;
    req.on('data', chunk => { if (trop) return; corps += chunk; if (corps.length > MAX_OCTETS + 1024) { trop = true; } });
    req.on('end', () => {
      const r = trop ? { ok: false, statut: 413, raison: 'rapport trop volumineux' } : enregistrer(corps, dossier);
      res.writeHead(r.ok ? 200 : r.statut, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(r.ok ? { ok: true, id: r.id } : { ok: false, raison: r.raison }));
      if (r.ok) {
        console.log('[diagnostic] rapport reçu : ' + r.id);
        if (typeof surRapport === 'function') { try { surRapport(JSON.parse(fs.readFileSync(r.fichier, 'utf8')), r.id); } catch (e) { console.error('[diagnostic] rappel :', e.message); } }
      }
    });
    return true;
  }
  if (url === '/diagnostics' || url.indexOf('/diagnostics?') === 0) {
    if (typeof cleValide === 'function' && !cleValide(url)) return false;   // le serveur répond 404 comme pour toute page de service
    let u = null; try { u = new URL(url, 'http://x'); } catch (e) {}
    const f = u && u.searchParams.get('f');
    if (f && /^[\w-]+\.json$/.test(f)) {
      try { const txt = fs.readFileSync(path.join(dossier, f), 'utf8'); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(txt); }
      catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('rapport introuvable'); }
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(lister(dossier), null, 1));
    return true;
  }
  return false;
}
module.exports = { verifier, enregistrer, lister, traiter, courriel, MAX_OCTETS, MAX_FICHIERS };
