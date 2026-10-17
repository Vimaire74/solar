/* LE COLONISATEUR — ET LUI SEUL — VOIT SES GAINS (Marc, 21/09).
   En ligne, la fenêtre « Découverte » était refermée par le serveur avant d'avoir été vue.
   Usage : node test_colonisation_avis.js */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const d = new GameDriver(path.join(__dirname, '..', 'play.html'));
d.boot([{ civId: 'terriens', isAI: false, user: 'marc' }, { civId: 'martiens', isAI: false, user: 'autre' }], () => {});
const sb = d.sb, G = sb.__G;
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
let r = d.pump(), g = 0;
while (r && r.kind === 'decision' && g++ < 50) r = d.answer(r.pending.id, {});
if (!r || r.kind !== 'action') { console.log('❌ pas de tour d\'action : ' + JSON.stringify(r && r.kind)); process.exit(1); }
const moi = [G.player].concat(G.ais || []).find(n => n.civ.id === r.civId);
const home = moi.civ.home;
const cible = (sb.NODES || require('vm').runInContext('NODES', sb))[home].conn.find(id => { const N = require('vm').runInContext('NODES', sb)[id]; return N && !N.decorative && !N.noColonize && N.type !== 'orbital_station' && !sb.occupantsDuNoeud(id).length; });
moi.res.materials = 10; moi.res.energy = 10;
r = d.act(r.civId, { type: 'colonize', node: cible });
const qs = require('vm').runInContext('_questionsListe()', sb);
const avis = qs.filter(q => q && q.payload && /Colonisation réussie/.test(String(q.payload.title)));
if (avis.length === 1) ok('une fenêtre « Colonisation réussie » pour ' + moi.civ.id + ' (' + cible + ')'); else ko(avis.length + ' fenêtre(s) « Colonisation réussie »');
if (avis.length && (avis[0].nation === moi.civ.id || avis[0].civId === moi.civ.id || (avis[0].nation && avis[0].nation.civ && avis[0].nation.civ.id === moi.civ.id) || JSON.stringify(avis[0]).indexOf(moi.civ.id) >= 0)) ok('adressée au colonisateur');
else if (avis.length) ko('destinataire : ' + JSON.stringify(Object.keys(avis[0])));
if (avis.length) console.log('     ' + String(avis[0].payload.body).replace(/<br>/g, ' | ').replace(/<[^>]+>/g, ''));
if (avis.length && avis[0].payload.body_i18n) ok('corps traduisible (clé jointe)'); else if (avis.length) ko('corps sans clé');
if (ecarts.length) { console.log('❌ ' + ecarts.join(' · ')); process.exit(1); }
console.log('✅ Le colonisateur est informé de ses gains.');
