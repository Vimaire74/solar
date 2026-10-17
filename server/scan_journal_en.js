/* OUTIL (pas un banc) — joue UNE partie serveur tout-IA sauf un siège humain qui passe, puis relit le
   journal EN ANGLAIS tel que l'écran l'affiche (`journalEtiqueter(_logTexte)`), et liste par clé :
   les lignes encore en français, les « you/your », et les lignes de nation sans étiquette.
   Usage : node scan_journal_en.js [graine]  */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');
const bac = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'lang', 'en.js'), 'utf8'), bac);
const EN = bac.window.SOLAR_LANG_DICT;
const d = new GameDriver(HTML);
d.boot([{ civId: 'martiens', isAI: false }, { civId: 'terriens', isAI: true }, { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
const G = d.sb.__G;
let r = d.pump(), g = 0; const essais = {};
while (g++ < 30000 && r && r.kind !== 'over') {
  if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
  if (r.kind === 'action') {
    /* Le siège « humain » joue avec le cerveau de l'ordinateur : ses coups passent par les branches
       réservées au joueur (G.player, !_isAI), celles que Marc lit. */
    const nat = d.nation(r.civId); const k = G.turn + ':' + r.civId; essais[k] = (essais[k] || 0) + 1;
    let fait = false;
    if (essais[k] < 8 && nat.acLeft > 0) { try { d.activate(r.civId); fait = !!d.sb.doAITurn(nat, true); d.sb._scHideConfirm && d.sb._scHideConfirm(); vm.runInContext('undoStack=[];_scConfirmArmed=false;', d.sb); } catch (e) { fait = false; } }
    if (fait) { r = d.pump(); continue; }
    try { r = d.act(r.civId, { type: 'pass' }); } catch (e) { r = d.pump(); }
    continue;
  }
  if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
  break;
}
const LANGUE = process.env.LANGUE || 'en';
if (LANGUE === 'en') vm.runInContext('SOLAR_LANG_DICT=' + JSON.stringify(EN) + ';', d.sb);
const FRW = /\b(de|des|du|la|le|les|et|pour|sur|avec|jeton|jetons|tour|colonie|pillée|connectée|aucune|guerre|refuse|achète|adopte|paie|Pioche|Stratégie|Terriens|Martiens|Jupitériens|Ceinturiens|ressource|désormais|n'a|à)\b/;
const YOU = process.env.LANGUE === 'fr' ? /(^|[\s(—:])(tu|ta|ton|tes|toi|te|Tu|Ta|Ton|Tes|Toi)([\s),.!:]|$)/ : /\b(you|your|You|Your)\b/;
const par = {};
const emojis = new Set([G.player].concat(G.ais).map(n => n.civ.emoji));
for (const e of (G.log || []).slice().reverse()) {
  const txt = d.sb.journalEtiqueter(e, d.sb._logTexte(e)).replace(/<[^>]+>/g, '');
  const k = e.k || '(sans clé)';
  const pb = [];
  if (LANGUE === 'en' && FRW.test(txt.replace(/[A-Za-zÀ-ÿ]*[À-ÿ][A-Za-zÀ-ÿ]*/g, m => /^(Ganymède|Cérès|Éris|Encelade|Pluton|Lune)$/.test(m) ? 'X' : m))) pb.push('FR');
  if (YOU.test(txt)) pb.push('YOU');
  if (e.civ && e.civ !== 'systeme' && !/^\s*↳/.test(txt) && ![...emojis].some(em => txt.startsWith(em))) pb.push('SANS-ÉTIQUETTE');
  if (!pb.length) continue;
  const cle = k + ' [' + pb.join(',') + ']';
  if (!par[cle]) par[cle] = { n: 0, ex: 'T' + e.turn + ' ' + e.civ + ' │ ' + txt.slice(0, 170) };
  par[cle].n++;
}
console.log('Partie jouée jusqu\'au tour ' + G.turn + ' — ' + (G.log || []).length + ' lignes');
for (const [k, v] of Object.entries(par).sort()) console.log(String(v.n).padStart(3) + '  ' + k + '\n       ' + v.ex);
console.log(Object.keys(par).length + ' clé(s) à revoir');
