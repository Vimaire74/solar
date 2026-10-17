/* ============================================================================
   TEST — LA POLITIQUE DE CONFIDENTIALITÉ EXISTE, EST LIÉE, EST LIVRÉE
   ----------------------------------------------------------------------------
   POURQUOI. Google Play et l'App Store exigent une politique de confidentialité
   accessible par URL dès que l'appli crée des comptes. Elle a été écrite le 13/09
   pour la bêta. Une page qui existe mais n'est liée nulle part, ou qui n'est pas
   dans le lot d'envoi, ne sert à rien le jour de la soumission — et on ne s'en
   apercevrait qu'au refus. Contrôle de SOURCE, annoncé comme tel.

   CE QUI EST VÉRIFIÉ :
     1. la page existe et couvre ce que les magasins regardent : responsable, données
        collectées, courriels, droits (suppression), enfants, hébergement ;
     2. elle est liée depuis l'écran d'accueil (index.html), depuis les DEUX écrans de
        connexion d'online.js (saisie de l'email ET « déjà connecté »), et le tutoriel
        (copie d'index.html) la porte aussi ;
     3. le numéro de version est affiché sur l'écran « déjà connecté » (Marc, 13/09 :
        « j'ai dû me déconnecter pour vérifier ») ;
     4. le service worker la précache (hors ligne) ;
     5. elle est dans le lot d'envoi, identique à la source.

   Usage : node test_confidentialite.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');
const LOT = path.join(R, 'Pour uploader', 'lot17');
const lire = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

console.log('═'.repeat(80));
console.log('CONFIDENTIALITÉ — LA PAGE, SES LIENS, SA LIVRAISON');
console.log('═'.repeat(80) + '\n');

console.log('1. La page');
const page = lire(path.join(R, 'confidentialite.html'));
if (!page) ko('confidentialite.html est absent à la racine');
else {
  const attendus = [['responsable', /TitanCorp/], ['contact', /contact@solar-game\.com/], ['email', /email/i],
    ['mot de passe haché', /hach/], ['courriels', /r[ée]capitulatif/i], ['suppression de compte', /Supprimer (ton|mon) compte|suppression/i],
    ['enfants', /enfants|13 ans/i], ['hébergement', /OVH/], ['pas de publicité', /publicit/i], ['date', /2026/]];
  const manquent = attendus.filter(([n, re]) => !re.test(page)).map(([n]) => n);
  note('taille : ' + page.length + ' caractères');
  if (!manquent.length) ok('elle couvre responsable, données, courriels, droits, enfants, hébergement');
  else ko('il manque : ' + manquent.join(', '));
}

console.log('\n2. Les liens');
const index = lire(path.join(R, 'play.html')) || '', online = lire(path.join(R, 'online.js')) || '', tuto = lire(path.join(R, 'tutorial.html')) || '';
if (/href="confidentialite\.html"/.test(index)) ok('index.html (écran d\'accueil)'); else ko('index.html ne la lie pas');
if (/href="confidentialite\.html"/.test(tuto)) ok('tutorial.html (copie de l\'accueil)'); else ko('tutorial.html ne la lie pas — régénérer le tutoriel');
const nb = (online.match(/href="confidentialite\.html"/g) || []).length;
note('online.js : ' + nb + ' lien(s)');
if (nb >= 2) ok('online.js : les deux écrans (saisie de l\'email ET déjà connecté)');
else ko('online.js : ' + nb + ' lien — il en faut un par écran de connexion');

console.log('\n3. La version sur l\'écran « déjà connecté »');
{
  const i = online.indexOf('function screenLobby('), j = online.indexOf('\nfunction ', i + 10);
  const corps = i >= 0 ? online.slice(i, j) : '';
  if (/_buildLabel\(\)/.test(corps)) ok('screenLobby affiche _buildLabel()');
  else ko('screenLobby n\'affiche pas la version — il faut se déconnecter pour la voir');
}

console.log('\n4. Le service worker');
const sw = lire(path.join(R, 'sw.js')) || '';
if (/'\.\/confidentialite\.html'/.test(sw)) ok('précachée dans SHELL'); else ko('sw.js ne précache pas la page');

console.log('\n5. Le lot d\'envoi');
const lot = lire(path.join(LOT, 'confidentialite.html'));
if (!lot) ko('absente de Pour uploader/lot17');
else if (lot === page) ok('présente dans le lot, identique à la source');
else ko('présente dans le lot mais DIFFÉRENTE de la source — resynchroniser');

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ La politique de confidentialité est prête pour les magasins.');
