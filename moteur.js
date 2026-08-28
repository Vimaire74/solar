/* ⚠️ MARQUEUR DE VERSION — À TENIR À JOUR À CHAQUE ENVOI.
   `moteur.js` n'en avait AUCUN. Conséquence vécue le 2026-08-07 : Marc constate 3 cartes Stratégie
   là où le code en prévoit 5, et il est impossible de dire si le code fautif est celui qu'on lit ou
   une version plus ancienne restée en ligne. On ne peut pas diagnostiquer ce qu'on ne peut pas
   identifier. Les trois fichiers portent maintenant leur version, et l'écran de connexion les
   compare : si l'un des trois diffère, il l'affiche en rouge. */
const SOLAR_BUILD_MOTEUR = '2026-08-28 · v9.95';
try{ window.SOLAR_BUILD_MOTEUR = SOLAR_BUILD_MOTEUR; }catch(e){}
/* ============================================================================
   MOTEUR DU JEU SOLAR — moteur.js
   ----------------------------------------------------------------------------
   TOUTES LES RÈGLES DU JEU SONT ICI, et nulle part ailleurs.

   Ce fichier était auparavant collé dans index.html (479 Ko sur 603, soit 79 %
   d'un fichier censé être une page). Le serveur devait l'en EXTRAIRE en cherchant
   un bloc <script>, ce qui a coûté deux bugs majeurs : `uiFillIncome` et
   `doRaidTarget` s'étaient retrouvées hors du bloc extrait, donc invisibles pour
   le serveur — revenu net inopérant une semaine, raids frappant une nation au
   hasard. Désormais la question « cette fonction est-elle dans le moteur ? » ne
   se pose plus : elle est dans ce fichier, ou elle n'y est pas.

   CHARGÉ PAR LES TROIS ENVIRONNEMENTS, sans transformation :
     · navigateur   — <script src="moteur.js"> dans index.html (mis en cache par
                      le service worker : le solo fonctionne HORS LIGNE) ;
     · serveur Node — server/game-core.js le lit directement (plus aucune
                      extraction depuis du HTML) ;
     · application  — embarqué tel quel dans le paquet mobile.

   ⚠️ NE RIEN METTRE ICI QUI TOUCHE À L'AFFICHAGE PUR (onglets, zoom, hauteur
   d'écran, écran de connexion) : ces fonctions restent dans index.html. À
   l'inverse, TOUTE règle de jeu doit être ici, sinon le serveur ne la connaîtra
   pas et se rabattra en silence sur un comportement dégradé.

   Différence assumée avec Board Game Arena : chez eux les règles sont
   exclusivement côté serveur (`Game.php`), car BGA n'a pas de mode hors ligne.
   Le jeu doit rester jouable sans réseau — les règles doivent donc pouvoir
   s'exécuter sur l'appareil ET sur le serveur. Voir ARCHITECTURE_AVENIR.md §7.
   ========================================================================== */

/* ╔══════════════════════════════════════════════════════════════════════════════════════════╗
   ║  @moteur  —  BLOC DE LOGIQUE DU JEU. NE PAS RENOMMER CETTE SENTINELLE.                    ║
   ║                                                                                          ║
   ║  server/game-core.js charge EXACTEMENT ce bloc pour faire tourner le jeu côté serveur.    ║
   ║  Tout ce qui touche aux RÈGLES doit vivre ICI. Une fonction de règle écrite dans un autre ║
   ║  bloc <script> serait INVISIBLE pour le serveur, qui se rabattrait en silence sur un      ║
   ║  comportement dégradé — c'est arrivé deux fois :                                          ║
   ║    · `uiFillIncome` (revenu net)  → le correctif est resté du code mort une semaine ;     ║
   ║    · `doRaidTarget` (raid ciblé)  → le serveur pillait toujours une nation arbitraire.    ║
   ║                                                                                          ║
   ║  Les blocs HORS moteur ne doivent contenir que de l'AFFICHAGE pur (onglets, zoom,         ║
   ║  hauteur d'écran, écran de connexion). game-core.js vérifie au chargement que toutes les  ║
   ║  fonctions dont le serveur a besoin sont bien ici, et ÉCHOUE bruyamment sinon.            ║
   ╚══════════════════════════════════════════════════════════════════════════════════════════╝ */

/* ============================================================ DATA ============================================================ */
const TECH_BRANCHES={
  expansion:{label:'Expansion',emoji:'🏗️',civBonus:'martiens',color:'#FF9800'},
  navigation:{label:'Navigation & Moteurs',emoji:'⚗️',civBonus:'ceinturiens',color:'#42a5f5'},
  ia_renseignement:{label:'IA & Renseignement',emoji:'🔍',civBonus:null,color:'#AB47BC'},
  sciences_exp:{label:'Sciences Expér.',emoji:'🧪',civBonus:null,color:'#26C6DA'},
  spiritualite_nature:{label:'Spiritualité & Nature',emoji:'🕊️',civBonus:'terriens',color:'#66BB6A'},
  mines_energie:{label:'Mines & Énergie',emoji:'⛏️',civBonus:'jupiteriens',color:'#FFA726'},
  empathes:{label:'Empathes',emoji:'🔮',civBonus:null,color:'#CE93D8'},
};
const MAP_PANELS=[
  {name:'Zone Interne',vb:'0 0 390 320'},
  {name:'Zone Joviène',vb:'370 50 255 240'},
  {name:'Zone Saturnienne',vb:'570 50 235 240'},
  {name:'Zone Externe',vb:'700 50 295 245'},
];
const PIRATE_PATH=['eris','pluto','triton','titan','ganymede','callisto','vesta','ceres'];
const CIVS={
  terriens:{id:'terriens',name:'Terriens',emoji:'🌍',color:'#4CAF50',
    start:{energy:2,materials:6,science:3,morale:5},startForce:5,home:'lune',
    techBonus:'spiritualite_nature',
    passive:'Moral ≥ 5 : +1 pt Gouvernement/tour.',
    active:{name:'Diplomatie Verte',desc:'+3 pts Gouvernement (0 AC, −3<i class=ri-materials></i>)',ac:0,cost:{materials:3}}},
  martiens:{id:'martiens',name:'Martiens',emoji:'🔴',color:'#ef5350',
    start:{energy:4,materials:4,science:2,morale:3},startForce:5,home:'phobos',
    techBonus:'expansion',
    passive:'Cartes Militaires −1<i class=ri-energy></i>. Colonisation −1<i class=ri-materials></i> −1<i class=ri-energy></i>.',
    active:{name:'Surtension',desc:'+1 AC immédiatement ce tour (2<i class=ri-energy></i>)',ac:0,cost:{energy:2}}},
  jupiteriens:{id:'jupiteriens',name:'Jupitériens',emoji:'🟠',color:'#FF9800',
    start:{energy:5,materials:2,science:3,morale:3},startForce:4,home:'io',
    techBonus:'mines_energie',
    passive:'Base sur Io, le monde le plus riche en <i class=ri-energy></i> du système (3<i class=ri-energy></i>/tour dès le premier tour).',
    active:{name:'Forge Orbitale',desc:'Améliore une colonie joviène (Io/Europe/Ganymède/Callisto) 1→2 (0 AC, −1<i class=ri-materials></i> −1<i class=ri-energy></i>)',ac:0,cost:{materials:1,energy:1}}},
  ceinturiens:{id:'ceinturiens',name:'Ceinturiens',emoji:'☠️',color:'#AB47BC',
    start:{energy:6,materials:4,science:1,morale:2},startForce:3,home:'eris',
    techBonus:'navigation',
    passive:'Raids coûtent 1 jeton Force (au lieu de 2). +1<i class=ri-energy></i>/tour (réserves de la ceinture). Immunisés contre les pirates.',
    active:{name:'Commerce avec les pirates',desc:'Gratuit, 1×/tour : 75% → +2 ressources aléatoires, 20% → +1, 5% → rien',ac:0,cost:{}}},
};
const PLANETS_DECO=[
  {name:'Mercure',color:'#B0A090',x:150,y:440,r:10,img:'mercure',ir:20},{name:'Vénus',color:'#E0C060',x:250,y:315,r:16,img:'venus',ir:33},
  {name:'Terre',color:'#4CAF50',x:375,y:520,r:18,img:'terre',ir:35},{name:'Mars',color:'#ef5350',x:515,y:300,r:14,img:'mars',ir:29},
  {name:'Jupiter',color:'#FF9800',x:960,y:330,r:30,img:'jupiter',ir:62},{name:'Saturne',color:'#FFD54F',x:1120,y:545,r:28,img:'saturne',ir:56},
  {name:'Uranus',color:'#80DEEA',x:1460,y:315,r:16,img:'uranus',ir:32},{name:'Neptune',color:'#3F51B5',x:1660,y:505,r:15,img:'neptune',ir:31},
];
/* ⚠️ LES COORDONNÉES DE CETTE TABLE SONT AUSSI LA MISE EN PAGE DE LA CARTE SYSTÈME.
   Déplacer un nœud ne change aucune règle, mais change ce que le joueur peut LIRE : les routes sont
   des segments entre ces points, et les planètes décoratives (`PLANETS_DECO`) sont des disques que
   ces segments peuvent traverser. Trois repositionnements le 2026-08-14, à la demande de Marc qui
   regardait la carte en direct, chacun vérifié par le calcul de la distance segment↔disque :
     · Phobos 552,282 → 555,260 — monté de 22 px. Sa route vers Déimos frôlait Mars à 3 px du
       centre (rayon 29) : elle passe maintenant à 14. Celle vers la Lune traversait déjà Mars
       avant ce changement (20 px) et y reste — c'est le prix à payer pour monter Phobos, la Lune
       étant très en dessous à gauche.
     · Europe 1060,352 → 1072,266 — la route depuis Vesta traversait le disque de Jupiter (17 px du
       centre, rayon 62). Elle passe désormais à 77, soit 15 px au-dessus du bord.
     · Callisto 1052,425 → 1052,397 — montée plus modestement : la route Ganymède→Titan passait à
       21 px de Callisto (rayon 16), elle passe à 43. Les deux voies vers Titan se distinguent. */
const NODES={
  // strategic:'full'=+1jeton/tour / 'half'=50%
  // Colonisation colonie 'remote' → −1<i class=ri-morale></i> one-time | Niv.1 → +1<i class=ri-morale></i> toutes | Niv.2 → +1<i class=ri-morale></i> si attractive, +2<i class=ri-morale></i> Callisto
  // ATTRACTIVE_COLS=['lune','europe','titan','encelade','triton']
  lune:{id:'lune',name:'Lune',emoji:'🌕',color:'#B0BEC5',type:'moon',baseVP:2,maxLv:3,r:15,strategic:'half',res:{energy:1,materials:2},x:420,y:475,conn:['phobos','ceres','deimos','io','vesta'],desc:'Satellite terrestre. Vue sur la Terre — habitat confortable.'},
  phobos:{id:'phobos',name:'Phobos',emoji:'⚫',color:'#8D6E63',type:'moon',baseVP:2,maxLv:3,r:11,strategic:'half',res:{energy:1,materials:2},x:555,y:260,conn:['lune','deimos','ceres','vesta'],desc:'Lune intérieure de Mars. Proche des routes de propulsion.'},
  deimos:{id:'deimos',name:'Déimos',emoji:'🟤',color:'#795548',type:'moon',baseVP:1,maxLv:3,r:12,strategic:null,res:{materials:1},x:452,y:322,conn:['phobos','lune'],desc:'Petite lune aride de Mars. Conditions difficiles.'},
  ceres:{id:'ceres',name:'Cérès',emoji:'⬜',color:'#CFD8DC',type:'dwarf_planet',baseVP:3,maxLv:3,r:21,strategic:'full',res:{energy:1,materials:3},x:625,y:548,conn:['lune','phobos','vesta','io','ganymede'],desc:'Hub de la ceinture d\'astéroïdes. Carrefour stratégique des routes.'},
  vesta:{id:'vesta',name:'Vesta',emoji:'🪨',color:'#78909C',type:'asteroid',baseVP:2,maxLv:3,r:17,strategic:null,res:{materials:2},x:715,y:212,conn:['ceres','ganymede','phobos','io','europe','lune'],desc:'Grand astéroïde métallique. Éloigné des routes principales.'},
  io:{id:'io',name:'Io',emoji:'🟡',color:'#FFD54F',type:'moon',baseVP:3,maxLv:3,r:15,strategic:'half',res:{energy:3,materials:1},x:862,y:328,conn:['ceres','europe','ganymede','vesta','lune'],desc:'Lune volcanique. Énergie géothermique intense.'},
  europe:{id:'europe',name:'Europe',emoji:'🔵',color:'#42a5f5',type:'moon',baseVP:4,maxLv:3,r:15,strategic:null,res:{energy:1,materials:1},x:1072,y:266,conn:['io','callisto','titan','vesta','pluto'],desc:'Océan sous-glaciaire. Paysage saisissant sous Jupiter. Radiation intense.'},
  ganymede:{id:'ganymede',name:'Ganymède',emoji:'🟤',color:'#A1887F',type:'moon',baseVP:4,maxLv:3,r:18,strategic:'full',res:{energy:1,materials:2},x:922,y:432,conn:['io','vesta','callisto','titan','ceres'],desc:'Plus grande lune du système. Hub jovien majeur, carrefour de routes.'},
  callisto:{id:'callisto',name:'Callisto',emoji:'🔘',color:'#607D8B',type:'moon',baseVP:3,maxLv:3,r:16,strategic:'half',res:{energy:1,materials:2},x:1052,y:397,conn:['europe','ganymede','titan'],desc:'Hors de la radiation jovienne. Meilleur habitat humain du système jovien.'},
  /* ⚠️ « STATION JUPITER » N'EST PLUS QU'UN DESSIN (2026-08-07, décision de Marc).
     Elle n'est pas SUPPRIMÉE de la table des nœuds, et c'est délibéré : c'est elle qui DESSINE la
     planète Jupiter sur la carte tactique (`mapImg` la traduit en image `jupiter`, `MAP_RAD` lui
     donne son rayon de 42). L'effacer ferait disparaître Jupiter de la carte, ce qui n'est pas ce
     qui était demandé — la base jupitérienne est désormais Io, mais Jupiter doit rester visible.
     Elle devient donc `decorative` comme les anneaux : aucune ressource, aucun revenu, aucune route
     possible à travers elle, exclue de tous les calculs. Un décor, rien de plus.
     À noter : elle portait déjà `noColonize`, donc personne ne pouvait la posséder — l'exception
     d'entretien jovienne qu'on vient de retirer ne s'appliquait en réalité à RIEN. */
  jorbital1:{id:'jorbital1',name:'Jupiter',emoji:'🟠',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:16,strategic:null,noColonize:true,decorative:true,res:{},x:960,y:415,conn:[],desc:'Géante gazeuse — non colonisable. La base jupitérienne est Io.'},
  jorbital2:{id:'jorbital2',name:'Anneau J-2',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,strategic:null,res:{},decorative:true,x:421,y:159,conn:['jorbital1','jorbital3'],desc:'Territoire jovien — non colonisable.'},
  jorbital3:{id:'jorbital3',name:'Anneau J-3',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,strategic:null,res:{},decorative:true,x:429,y:194,conn:['jorbital2','jorbital4'],desc:'Territoire jovien — non colonisable.'},
  jorbital4:{id:'jorbital4',name:'Anneau J-4',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,strategic:null,res:{},decorative:true,x:406,y:223,conn:['jorbital3','jorbital5'],desc:'Territoire jovien — non colonisable.'},
  jorbital5:{id:'jorbital5',name:'Anneau J-5',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,strategic:null,res:{},decorative:true,x:370,y:223,conn:['jorbital4','jorbital6'],desc:'Territoire jovien — non colonisable.'},
  jorbital6:{id:'jorbital6',name:'Anneau J-6',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,strategic:null,res:{},decorative:true,x:347,y:194,conn:['jorbital5','jorbital7'],desc:'Territoire jovien — non colonisable.'},
  jorbital7:{id:'jorbital7',name:'Anneau J-7',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,strategic:null,res:{},decorative:true,x:355,y:159,conn:['jorbital6','jorbital1'],desc:'Territoire jovien — non colonisable.'},
  titan:{id:'titan',name:'Titan',emoji:'🌫️',color:'#FF8F00',type:'moon',baseVP:5,maxLv:3,r:18,strategic:'full',res:{energy:2,materials:1},x:1400,y:485,conn:['ganymede','callisto','encelade','triton','europe','pluto'],desc:'Hydrocarbures atmosphériques. Paysage orange unique. Hub saturnien.'},
  encelade:{id:'encelade',name:'Encelade',emoji:'❄️',color:'#E0F7FA',type:'moon',baseVP:3,maxLv:3,r:14,strategic:null,res:{energy:1,materials:1},x:1325,y:580,conn:['titan','triton'],desc:'Geysers spectaculaires. Lune éloignée dans l\'ombre de Saturne.'},
  triton:{id:'triton',name:'Triton',emoji:'💜',color:'#7C4DFF',type:'moon',baseVP:4,maxLv:3,r:16,strategic:'half',res:{energy:1,materials:1},x:1745,y:620,conn:['titan','pluto','eris','encelade'],desc:'Lune rétrograde de Neptune. Paysage unique — carrefour vers Kuiper.'},
  pluto:{id:'pluto',name:'Pluton',emoji:'🩶',color:'#90A4AE',type:'dwarf_planet',baseVP:4,maxLv:3,r:15,strategic:null,res:{materials:1},x:1590,y:215,conn:['triton','eris','titan','europe'],desc:'Porte de la ceinture de Kuiper. Très éloigné, conditions extrêmes.'},
  eris:{id:'eris',name:'Éris',emoji:'⬡',color:'#B0BEC5',type:'dwarf_planet',baseVP:5,maxLv:3,r:17,strategic:null,res:{materials:1,energy:1},x:1790,y:190,conn:['pluto','triton'],desc:'Aux confins du système solaire. Avant-poste visible d\'un réseau de colonies dispersées dans la Ceinture — VP élevés.'},
};
/* ⚠️ CETTE TABLE APLATISSAIT LES BRANCHES, et le renommage du 26/08 l'a mise à nu.
   Elle donnait une couleur par `type` : toutes les cartes marquées `technology` — Navigation,
   Renseignement, Sciences, Empathes — sortaient du même bleu, alors que `TECH_BRANCHES` définit
   depuis toujours UNE COULEUR PAR BRANCHE, et que `docs/CARTES_INVENTAIRE.md` prescrit noir sur
   blanc « bord = couleur de branche ».
   Depuis que `type` porte le nom de la branche, aucune clé de cette table ne correspondait plus :
   les bordures seraient toutes tombées sur le gris de repli. On lit donc la branche quand il y en
   a une, et cette table ne sert plus qu'aux cartes militaires, qui n'ont pas de branche. */
const TYPE_COLORS={militaire:'#ef5350',military:'#ef5350'};
function couleurCarte(card){
  if(!card)return '#2a2a5a';
  if(card.branch&&TECH_BRANCHES[card.branch])return TECH_BRANCHES[card.branch].color;
  return TYPE_COLORS[card.type]||'#2a2a5a';
}
// Cartes disposant d'une illustration servie dans assets/cards/<id>.png (ajouter l'id au fil des illustrations)
const CARD_ART=new Set(['bio1','prop1','drones1','quant1','bio2','nav2','hyper3','reseau2','vegetal1','exploit1','terra3','iadef3','robo2','extra3','empathic2','eveil3','extract2','dyson3','mil3','mil2','liens1','gov_senat','gov_democratie','mil_invest','mil1','comm2','tele3','gov_corpo','cm_culture','cm_propagande','cm_social','cm_calm','cm_research','cm_univ','cm_reform','gov_tyrannie','cm_explore','cm_forages']);
const CARDS_POOL=[
  // ── EXPANSION ────────────────────────────────────────────────────────────────
  {id:'bio1',branch:'expansion',tier:1,type:'expansion',name:'Biosphère Autonome',emoji:'🏗️',
   effect:'Tes colonies de <b>niveau 1</b> ne coûtent plus aucun entretien en <i class=ri-energy></i>.',spec:'upkeep_e_disc',
   cost:{materials:2,science:1},vp:1},
  {id:'bio2',branch:'expansion',tier:2,type:'expansion',name:'Biosphère Avancée',emoji:'🌱',
   effect:'Tes colonies ne coûtent PLUS AUCUN entretien (ni <i class=ri-energy></i> ni <i class=ri-materials></i>). Supprime le malus moral des colonies difficiles.',spec:'bio2_bonus',
   cost:{science:4,energy:2,materials:2},vp:3},
  {id:'terra3',branch:'expansion',tier:3,type:'expansion',name:'Terraformation',emoji:'🌍',
   effect:'+1<i class=ri-materials></i> +1<i class=ri-morale></i>/tour par colonie de niveau 2 ou 3.',spec:'terra3',
   cost:{science:6,materials:4,energy:4},vp:5},
  // ── NAVIGATION & MOTEURS ─────────────────────────────────────────────────────
  {id:'prop1',branch:'navigation',tier:1,type:'navigation',name:'Propulsion Ionique',emoji:'⚗️',
   /* ⚠️ MARC DEMANDAIT « préciser que le rabais vaut pour la construction ET l'entretien ».
      Vérifié dans le moteur : `route_disc` met le coût de CONSTRUCTION à 0🪨 (une route coûte
      1🪨 sans lui). L'entretien d'une route, lui, se paie en ÉNERGIE — il n'existe aucun entretien
      en matériaux à réduire. La technologie qui supprime l'entretien est l'Hyperpropulsion.
      On écrit donc ce que la carte fait VRAIMENT, et on dit où va l'autre moitié de la question :
      un texte qui promet un rabais inexistant est pire qu'un texte trop court. */
   effect:'Construction de route : <b>0</b><i class=ri-materials></i> au lieu de 1. (L\'entretien d\'une route se paie en <i class=ri-energy></i> — voir Hyperpropulsion pour le supprimer.)',spec:'route_disc',
   cost:{science:2,energy:1},vp:1},
  {id:'nav2',branch:'navigation',tier:2,type:'navigation',name:'IA de Navigation',emoji:'🧠',
   effect:'+2 jetons Force. Coût de guerre ÷2 (division exacte : si le nombre de jetons engagés est impair, la demi-part est prélevée sur l\'<i class=ri-energy></i> — ex. 5 jetons = 2<i class=ri-materials></i> et 3<i class=ri-energy></i>).',spec:'nav2_war',forceBonus:2,
   cost:{science:4,energy:1},vp:3},
  /* ⚠️ SECOND POUVOIR AJOUTÉ LE 17/08 — L'INITIATIVE DE GUERRE (demande de Marc).
     Depuis que la fin de tour porte DEUX combats, l'ordre dans lequel ils se déroulent décide de
     tout : frapper d'abord, c'est engager ses jetons quand on les a encore ; défendre d'abord, c'est
     savoir ce qui reste avant de choisir son assaut. Une flotte capable de se déplacer plus vite que
     les autres doit pouvoir imposer ce tempo — et ce choix se paie, puisqu'il faut répartir des
     jetons et des ressources entre les deux combats. */
  {id:'hyper3',branch:'navigation',tier:3,type:'navigation',name:'Hyperpropulsion',emoji:'🌀',
   effect:'+5 Gov. Routes sans entretien. +3 jetons. En guerre : tu choisis d\'attaquer ou de défendre en premier.',
   spec:'route_force_free',spec2:'guerre_initiative',govPts:5,forceBonus:3,
   cost:{science:6,energy:2,materials:2},vp:5},
  // ── IA & RENSEIGNEMENT ───────────────────────────────────────────────────────
  {id:'drones1',branch:'ia_renseignement',tier:1,type:'ia_renseignement',name:'Drones Surveillance',emoji:'🔍',
   effect:'+1<i class=ri-science></i>/tour. Raids subis : −1 ressource volée.',spec:'intel_1',rGain:{science:1},
   cost:{science:2,energy:1,materials:1},vp:1},
  {id:'reseau2',branch:'ia_renseignement',tier:2,type:'ia_renseignement',name:'Réseau Orbital',emoji:'📡',
   effect:'+1<i class=ri-science></i>/tour. Infos complètes des nations. Immunité pirates.',spec:'intel_2',rGain:{science:1},
   cost:{science:3,energy:2,materials:2},vp:3},
  {id:'iadef3',branch:'ia_renseignement',tier:3,type:'ia_renseignement',name:'IA Défensive',emoji:'🛡️',
   effect:'+4 jetons. Immunité raids/pirates. Rappelle tes jetons des routes.',spec:'ia_immune',spec2:'storm_immune',forceBonus:4,
   cost:{science:5,energy:2,materials:2},vp:5},
  // ── SCIENCES EXPÉRIMENTALES ──────────────────────────────────────────────────
  {id:'quant1',branch:'sciences_exp',tier:1,type:'sciences_exp',name:'Ordinateur Quantique',emoji:'🧪',
   effect:'+3<i class=ri-science></i>/tour. −1<i class=ri-energy></i>/tour.',rGain:{science:3,energy:-1},
   cost:{science:2,materials:2},vp:1},
  {id:'robo2',branch:'sciences_exp',tier:2,type:'sciences_exp',name:'Robotisation Avancée',emoji:'🤖',
   effect:'+2<i class=ri-materials></i>/tour. Automatisation industrielle — rendement accru.',rGain:{materials:2},
   cost:{science:3,materials:2,energy:2},vp:3},
  {id:'extra3',branch:'sciences_exp',tier:3,type:'sciences_exp',name:'Exploration Extra-Solaire',emoji:'🚀',
   effect:'+8 VP si ≥5 techs. Colonise Éris/Pluton/Triton.',spec:'extrasolar',spec2:'gas_unlock',
   cost:{science:5,energy:3,materials:2},vp:5},
  // ── SPIRITUALITÉ & NATURE ────────────────────────────────────────────────────
  {id:'vegetal1',branch:'spiritualite_nature',tier:1,type:'spiritualite_nature',name:'Végétalisation',emoji:'🌿',
   effect:'+2<i class=ri-morale></i> immédiat. +1<i class=ri-morale></i>/tour.',resGain:{morale:2},rGain:{morale:1},
   cost:{materials:2,science:1},vp:1},
  {id:'empathic2',branch:'spiritualite_nature',tier:2,type:'spiritualite_nature',name:'Réseau Empathique',emoji:'🧘',
   effect:'+1<i class=ri-morale></i> immédiat. +2<i class=ri-morale></i>/tour. +1<i class=ri-science></i>/tour.',resGain:{morale:1},rGain:{morale:2,science:1},
   cost:{science:2,materials:2,energy:2},vp:3},
  {id:'eveil3',branch:'spiritualite_nature',tier:3,type:'spiritualite_nature',name:'Éveil Collectif',emoji:'✨',
   effect:'+2<i class=ri-science></i>/tour. +1 VP/colonie connectée au final.',spec:'colony_vp',rGain:{science:2},
   cost:{science:5,materials:2},vp:5},
  // ── MINES & ÉNERGIE ──────────────────────────────────────────────────────────
  {id:'exploit1',branch:'mines_energie',tier:1,type:'mines_energie',name:"Exploitations d'Astéroïdes",emoji:'⛏️',
   effect:'+3<i class=ri-materials></i>/tour',rGain:{materials:3},
   cost:{materials:1,energy:2,science:1},vp:1},
  {id:'extract2',branch:'mines_energie',tier:2,type:'mines_energie',name:'Extracteurs Solaires',emoji:'🏭',
   effect:'+3<i class=ri-energy></i>/tour',rGain:{energy:3},
   cost:{materials:4,energy:1,science:2},vp:3},
  {id:'dyson3',branch:'mines_energie',tier:3,type:'mines_energie',name:'Sphère de Dyson',emoji:'⚡',
   effect:'+5<i class=ri-energy></i>/tour. Les autres acceptent (+3<i class=ri-energy></i>) ou guerre.',spec:'dyson3',rGain:{energy:5},
   cost:{materials:6,energy:3,science:6},vp:5},
  // ── EMPATHES (Union Sacrée requise) ──────────────────────────────────────────
  {id:'liens1',branch:'empathes',tier:1,type:'empathes',name:'Liens Empathes',emoji:'🔮',
   effect:'Routes sans jeton (rappelle les tiens). +1<i class=ri-energy></i>/2 routes. +2 tokens combat.',spec:'empath_routes',combatBonus:2,
   cost:{science:4},vp:1},
  {id:'comm2',branch:'empathes',tier:2,type:'empathes',name:'Communications Instantanées',emoji:'🌐',
   effect:'+2<i class=ri-morale></i>/tour. +1<i class=ri-science></i>/tour. +5 gouvernement.',rGain:{morale:2,science:1},govPts:5,
   cost:{science:5},vp:3},
  {id:'tele3',branch:'empathes',tier:3,type:'empathes',name:'Télépathie',emoji:'🧬',
   effect:'Copie tech adverse. +2 tokens combat. −2<i class=ri-morale></i>/tour si guerre. +3<i class=ri-science></i>/tour.',spec:'empath_tele',combatBonus:2,rGain:{science:3},
   cost:{science:6},vp:5},
  // ── CIVIQUES héritées supprimées (refonte civique). Le civique vit désormais dans CIVIC_MARKET :
  //    cartes sociales, formes de gouvernement, et 📜 Réforme Institutionnelle (points de gouvernement permanents).
  // ── MILITAIRES (toutes visibles, 1× par carte par tour) ─────────────────────
  {id:'mil_invest',branch:null,tier:1,type:'militaire',name:'Investissements militaires',emoji:'🪖',ac:1,
   effect:'+2 jetons Force, perdus au tour suivant.',forceTemp:2,forceLoseNext:2,cost:{energy:2,materials:1},vp:1,repeatable:true},
  {id:'mil1',branch:null,tier:1,type:'militaire',name:'Drones de Combat',emoji:'🛩️',ac:1,reqCard:'drones1',
   effect:'+1 jeton Force, perdu au tour suivant. (Requiert Drones Surveillance.)',forceTemp:1,forceLoseNext:1,cost:{energy:1,materials:1},vp:1,repeatable:true},
  {id:'mil2',branch:null,tier:1,type:'militaire',name:'Flottes de Chasseurs',emoji:'🛸',ac:2,reqCard:'robo2',
   /* Marc, 23/08 : « Flottes de chasseur devrait être limité à une prise par partie mais accessible
      à tous les joueurs aussi. » Non répétable, donc — mais par JOUEUR, pas par partie (voir le
      bandeau du blocage global dans `buyTech`). */
   effect:'+4 jetons Force ; 1/2 perdue au T. suivant. Une seule fois par partie. (requis: Robotisation Avancée.)',forceTemp:4,forceLoseNext:2,cost:{energy:3,materials:3,science:1},vp:2,repeatable:false},
  {id:'mil3',branch:null,tier:2,type:'militaire',name:'Supercroiseur',emoji:'⚔️',ac:3,
   effect:'+5 puissance EN GUERRE (permanent ; inutile contre raids et pirates).',warForce:5,cost:{energy:3,materials:4,science:1},vp:5,repeatable:false},
];
const STRATEGY_CARDS=[
  {id:'st1',name:'Expansion Rapide',emoji:'🏗️',desc:'Ce tour : 1 colonisation gratuite en ressources (0<i class=ri-materials></i> 0<i class=ri-energy></i>)',spec:'strat_col_free'},
  {id:'st2',name:'Surge Militaire',emoji:'⚔️',desc:'+2 jetons Force (perdus en fin de tour)',force:2},
  {id:'st3',name:'Sprint du Savoir',emoji:'🔬',desc:'Ce tour : +3<i class=ri-science></i>',res:{science:3}},
  {id:'st4',name:'Récolte Urgente',emoji:'🌾',desc:'Ce tour : +2<i class=ri-materials></i> +2<i class=ri-energy></i>',res:{materials:2,energy:2}},
  {id:'st5',name:'Diplomatie',emoji:'🕊️',desc:'Risque guerre −3',warRisk:-3},
  {id:'st6',name:'Mobilisation',emoji:'📣',desc:'+1 AC ce tour',acBonus:1},
  {id:'st7',name:'Effort de Guerre',emoji:'🗡️',desc:'+1 jeton Force immédiat (conservable)',forceKeep:1},
  {id:'st9',name:'Calmer les tensions',emoji:'🕊️',desc:'−3 tension vers une nation choisie',calmTension:3},
  /* Consolidation : ressources immédiates au lieu d'une remise d'entretien (Marc, 2026-08-08).
     La remise faisait doublon avec Biosphère Autonome, qui donne désormais exactement la même chose
     de façon permanente — une carte à usage unique ne pouvait pas rivaliser. */
  {id:'st8',name:'Consolidation',emoji:'🛡️',desc:'+1<i class=ri-morale></i> +1<i class=ri-energy></i>',res:{morale:1,energy:1}},
];
const DISCOVERY_TILES=[
  {id:'dt1',name:'Gisement Riche',emoji:'⛏️',desc:'+2<i class=ri-materials></i> immédiats.',res:{materials:2}},
  {id:'dt2',name:'Relique Alien',emoji:'👽',desc:'+2<i class=ri-science></i> et +1 VP de bonus.',res:{science:2},vp:1},
  {id:'dt3',name:"Source d'Énergie",emoji:'⚡',desc:'+3<i class=ri-energy></i> immédiats.',res:{energy:3}},
  {id:'dt4',name:'Arsenal Orbital Secret',emoji:'💣',desc:'+2 jetons Force.',force:2},
  {id:'dt5',name:'Données Scientifiques',emoji:'📊',desc:'+2<i class=ri-science></i> immédiats.',res:{science:2}},
  {id:'dt6',name:'Minerais Rares',emoji:'💎',desc:'+1<i class=ri-materials></i> permanent par tour.',rGain:{materials:1}},
  {id:'dt7',name:'Terrain Rocailleux',emoji:'🪨',desc:'Rien de spécial ici.'},
  {id:'dt8',name:'Anomalie Spatiale',emoji:'🌀',desc:'+1 VP de bonus.',vp:1},
];
const AGENDAS_POOL=[
  {id:'ag1',name:'Explorateur',emoji:'🚀',desc:'5+ colonies connectées → +8 VP',score(p){return p.colonies.filter(c=>c.connected).length>=5?8:0;}},
  {id:'ag2',name:'Maître des Routes',emoji:'🛤️',desc:'5+ routes → +6 VP',score(p){return p.routes.length>=5?6:0;}},
  {id:'ag3',name:'Superpuissance Tech.',emoji:'⚗️',desc:'Plus de cartes Tech que toute autre nation → +8 VP',score(p){const myT=p.cards.filter(c=>c.branch).length;const best=Math.max(...allPlayers().filter(x=>x!==p).map(x=>x.cards.filter(c=>c.branch).length),0);return myT>=best&&myT>0?8:0;}},
  {id:'ag4',name:'Armada Solaire',emoji:'⚔️',desc:'15+ jetons Force (récupération inclus) → +8 VP',score(p){return (p.forceTokens+((p.forceCooldown||[]).reduce((s,c)=>s+(c.count||0),0)))>=15?8:0;}},
  {id:'ag6',name:'Gouvernance Éclairée',emoji:'🏛️',desc:'Gouvernement niveau 4 et Moral 8+ → +8 VP',score(p){return p.gov_level>=4&&(p.res.morale||0)>=8?8:0;}},
  {id:'ag8',name:'Hub Jovien',emoji:'🟠',desc:'3+ colonies joviennes → +6 VP',score(p){const j=['io','europe','ganymede','callisto'];return p.colonies.filter(c=>j.includes(c.nodeId)).length>=3?6:0;}},
  {id:'ag13',name:'Empire Énergétique',emoji:'⚡',desc:'Toutes les cartes tech qui génèrent <i class=ri-energy></i> → +12 VP',score(p){const energyCards=CARDS_POOL.filter(c=>c.rGain&&(c.rGain.energy||0)>0).map(c=>c.id);return energyCards.length>0&&energyCards.every(id=>p.cards.find(c=>c.id===id||c.id===id+'_esp'))?12:0;}},
  {id:'ag14',name:'Opulence Matérielle',emoji:'🪨',desc:'Toutes les cartes tech qui génèrent <i class=ri-materials></i> → +12 VP',score(p){const matCards=CARDS_POOL.filter(c=>c.rGain&&(c.rGain.materials||0)>0).map(c=>c.id);return matCards.length>0&&matCards.every(id=>p.cards.find(c=>c.id===id||c.id===id+'_esp'))?12:0;}},
];
const INVESTMENT_CARDS=[
  {id:'inv_esp',name:'Espionnage',emoji:'🕵️',cout:{},
   benefit:'À la fin des tours 3, 4 et 5 : copie TOUTE une filière technologique des autres nations',
   contrepartie:'+4 tension envers chaque nation copiée',
   /* ⚠️ CETTE CARTE N'A AUCUN EFFET AU MOMENT DE SA RÉSOLUTION, et c'est voulu (Marc, 2026-08-09).
      Tout se joue aux fins de tour 3, 4 et 5, dans `stEspionnage` — pour l'humain comme pour l'IA,
      par le même chemin. Avant, `applyBenefit` contenait une copie SÉPARÉE de la règle réservée aux
      IA, qui pillait toujours `G.player` : à quatre joueurs, une IA espionnait donc systématiquement
      celui qui se trouvait être « le joueur » au moment du calcul, quelle que soit sa position.
      Et `applyCost` posait la tension sur une « cible » désignée d'office, parfois une nation à qui
      on n'avait rien pris. Les deux ont été supprimées : une seule règle, un seul endroit. */
   applyBenefit(G,p){ /* rien ici : voir stEspionnage */ },
   applyCost(G,p){ /* la tension est posée à la copie, sur les nations réellement pillées */ }
  },
  {id:'inv_ind',name:'Industrialisation Lourde',emoji:'🏭',cout:{morale:3},
   benefit:'Revenus +4<i class=ri-materials></i>/tour (T3→T5)',
   contrepartie:'−3<i class=ri-morale></i>',
   applyBenefit(G,p){if(!p.investBonus)p.investBonus={};p.investBonus.matBonus=4;if(p===G.player)addLog('🏭 Industrialisation : +4<i class=ri-materials></i>/tour !','gold');},
   applyCost(G,p){p.res.morale=Math.max(0,(p.res.morale||0)-3);if(p===G.player)addLog('🏭 Industrialisation : −3<i class=ri-morale></i> (pollution massive)','red');}
  },
  {id:'inv_rec',name:'Recherche Intensive',emoji:'🔬',cout:{materials:3,energy:1},
   benefit:'Revenus +3<i class=ri-science></i>/tour (T3→T5)',
   contrepartie:'−3<i class=ri-materials></i> −1<i class=ri-energy></i>',
   applyBenefit(G,p){if(!p.investBonus)p.investBonus={};p.investBonus.sciBonus=3;if(p===G.player)addLog('<i class=ri-science></i> Recherche Intensive : +3<i class=ri-science></i>/tour !','gold');},
   applyCost(G,p){p.res.materials=Math.max(0,(p.res.materials||0)-3);p.res.energy=Math.max(0,(p.res.energy||0)-1);if(p===G.player)addLog('<i class=ri-science></i> Recherche Intensive : −3<i class=ri-materials></i> −1<i class=ri-energy></i>','red');}
  },
  {id:'inv_agr',name:'Agriculture Durable',emoji:'🌾',cout:{materials:2,science:1},
   benefit:'+2<i class=ri-morale></i>/tour (T3→T5)',
   contrepartie:'−2<i class=ri-materials></i> −1<i class=ri-science></i>',
   applyBenefit(G,p){if(!p.investBonus)p.investBonus={};p.investBonus.moraleBonus=2;if(p===G.player)addLog('🌾 Agriculture Durable : +2<i class=ri-morale></i>/tour !','gold');},
   applyCost(G,p){p.res.materials=Math.max(0,(p.res.materials||0)-2);p.res.science=Math.max(0,(p.res.science||0)-1);if(p===G.player)addLog('🌾 Agriculture Durable : −2<i class=ri-materials></i> −1<i class=ri-science></i>','red');}
  },
  {id:'inv_exp',name:'Expansion Rapide',emoji:'🚀',cout:{morale:1,materials:1,energy:1},
   benefit:'1 colonisation + 1 route gratuites (T3)',
   contrepartie:'−1<i class=ri-morale></i> −1<i class=ri-materials></i> −1<i class=ri-energy></i>',
   applyBenefit(G,p){
     if(!p.investBonus)p.investBonus={};
     p.investBonus.freeCol=1;p.investBonus.freeRte=1;
     if(p===G.player)addLog('🚀 Expansion Rapide : 1 colonisation + 1 route gratuites !','gold');
   },
   applyCost(G,p){p.res.morale=Math.max(0,(p.res.morale||0)-1);p.res.materials=Math.max(0,(p.res.materials||0)-1);p.res.energy=Math.max(0,(p.res.energy||0)-1);if(p===G.player)addLog('🚀 Expansion Rapide : −1<i class=ri-morale></i> −1<i class=ri-materials></i> −1<i class=ri-energy></i>','red');}
  },
];
const INVESTMENT_CARDS_2=[
  {id:'inv2_war',name:'Stratégie Guerrière',emoji:'⚔️',cout:{materials:4,energy:2},
   benefit:'Jetons retournent en 1 tour (au lieu de 2) — T7→T9',
   contrepartie:'−4<i class=ri-materials></i> −2<i class=ri-energy></i> immédiat',
   applyBenefit(G,p){if(!p.investBonus2)p.investBonus2={};p.investBonus2.fastCooldown=true;p.investBonus2.turnsLeft=4;if(p===G.player)addLog('⚔️ Stratégie Guerrière : jetons reviennent en 1 tour !','gold');},
   applyCost(G,p){p.res.materials=Math.max(0,(p.res.materials||0)-4);p.res.energy=Math.max(0,(p.res.energy||0)-2);if(p===G.player)addLog('⚔️ Stratégie Guerrière : −4<i class=ri-materials></i> −2<i class=ri-energy></i>','red');}
  },
  {id:'inv2_comfort',name:'Confort de la Population',emoji:'🕊️',cout:{materials:4},
   benefit:'+4<i class=ri-morale></i>/tour pendant 3 tours',
   contrepartie:'−4<i class=ri-materials></i> immédiat',
   applyBenefit(G,p){if(!p.investBonus2)p.investBonus2={};p.investBonus2.moraleFlat=4;p.investBonus2.turnsLeft=4;if(p===G.player)addLog('🕊️ Confort : +4<i class=ri-morale></i>/tour pendant 3 tours !','gold');},
   applyCost(G,p){p.res.materials=Math.max(0,(p.res.materials||0)-4);if(p===G.player)addLog('🕊️ Confort : −4<i class=ri-materials></i>','red');}
  },
  {id:'inv2_colonies',name:'Colonies Avancées',emoji:'🏗️',cout:{energy:3},/* le ÷2 des matériaux est toujours payable : seul le −3⚡ peut manquer */
   benefit:'Toutes tes colonies déjà possédées → niveau max (entretien payant normalement).',
   contrepartie:'<i class=ri-materials></i> ÷2 + −3<i class=ri-energy></i> immédiat',
   applyBenefit(G,p){
     let upgraded=0;
     for(const col of p.colonies){const node=NODES[col.nodeId];if(col.level<node.maxLv){upgraded++;col.level=node.maxLv;}}
     updateConnections(p);
     if(!p.investBonus2)p.investBonus2={};
     p.investBonus2.turnsLeft=4;
     if(p===G.player)addLog('🏗️ Colonies Avancées : '+upgraded+' colonie(s) au niveau max (entretien payant) !','gold');
   },
   applyCost(G,p){
     const half=Math.floor((p.res.materials||0)/2);p.res.materials=half;
     p.res.energy=Math.max(0,(p.res.energy||0)-3);
     if(p===G.player)addLog('🏗️ Colonies Avancées : <i class=ri-materials></i> ÷2, −3<i class=ri-energy></i>','red');
   }
  },
  {id:'inv2_union',name:'Union Sacrée',emoji:'🧠',cout:{materials:3,science:4},
   benefit:'Branche Empathes débloquée (exclusive 3 tours, puis accessible à tous)',
   contrepartie:'−3<i class=ri-materials></i> −4<i class=ri-science></i> immédiat',
   applyBenefit(G,p){
     if(!G.empathesFounder)G.empathesFounder={civIds:new Set(),openAtTurn:G.turn+3};
     G.empathesFounder.civIds.add(p.civ.id);
     if(!p.investBonus2)p.investBonus2={};
     p.investBonus2.unionSacree=true;
     const label=p===G.player?'Joueur ('+p.civ.name+')':'IA ('+p.civ.name+')';
     addLog('🧠 Union Sacrée : branche Empathes accessible pour '+label+' — exclusive jusqu\'au tour '+G.empathesFounder.openAtTurn,'gold');
   },
   applyCost(G,p){
     p.res.materials=Math.max(0,(p.res.materials||0)-3);p.res.science=Math.max(0,(p.res.science||0)-4);
     if(p===G.player)addLog('🧠 Union Sacrée : −3<i class=ri-materials></i> −4<i class=ri-science></i>','red');
   }
  },
];
/* ============================================================ CIVIC MARKET ============================================================ */
// Cartes répétables — disponibles toujours, coût uniquement en <i class=ri-materials></i>, pas de techTaken
const CIVIC_MARKET=[
  // ── SOCIALES ──
  {id:'cm_culture', name:'Campagne Culturelle', emoji:'🎨', type:'social',
   effect:'+3<i class=ri-morale></i> immédiat', desc:'Festivals et arts — moral de la population.',
   resGain:{morale:3}, cost:{materials:2}},
  {id:'cm_propagande', name:'Propagande', emoji:'📣', type:'social',
   effect:'+1<i class=ri-morale></i> immédiat', desc:'Discours et affiches — galvanise la population.',
   resGain:{morale:1}, cost:{energy:1}},
  /* ⚠️ ELLE ÉTAIT RÉPÉTABLE À L'INFINI, ET C'ÉTAIT UNE ERREUR (Marc, 2026-08-14).
     Elle rendait TROIS ressources pour deux — dont du moral, celui qui divise les revenus par deux
     quand il tombe à 1 et déclenche la guerre civile à 0 — alors que ses deux sœurs de moral,
     Campagne Culturelle (2🪨 → +3🙂) et Propagande (1⚡ → +1🙂), sont limitées à une fois par
     partie. La plus généreuse des trois était aussi la seule sans limite.
     Elle passe à 1× la partie, comme elles : le moral se gagne par le jeu — colonies de niveau,
     technologies, événements — et non par une carte qu'on réactive en boucle. */
  {id:'cm_social', name:'Programmes Sociaux', emoji:'🌿', type:'social',
   effect:'+2<i class=ri-morale></i> +1<i class=ri-science></i> immédiat (1× la partie)', desc:'Bien-être et éducation publique.',
   resGain:{morale:2,science:1}, cost:{materials:2}},
  {id:'cm_calm', name:'Calmer la Population', emoji:'🕊️', type:'social', repeatable:true,
   effect:'+1<i class=ri-morale></i> −3 tension vers une nation', desc:'Festivals de paix — apaisement populaire ciblé.',
   calmAction:true, cost:{materials:1,energy:1}},
  /* ⚠️ ELLE ÉTAIT LA SEULE BRIDÉE À 1×/TOUR, ET RIEN NE LE JUSTIFIAIT. Ses trois sœurs du marché
     civique font exactement la même chose — une action et des ressources contre un gain immédiat —
     sans aucune limite : Extraction d'He3 (1🪨 1🔬 → +2⚡), Capture d'astéroïdes (1⚡ 1🔬 → +2🪨),
     Programmes Sociaux (2🪨 → +2🙂). Seule la science était rationnée.
     Marc, 2026-08-14 : « investissement dans la recherche est bloqué à 1×/tour, ce n'est pas
     juste. » Elle devient répétable comme les autres ; le point d'action reste le vrai frein. */
  {id:'cm_research', name:'Investissement dans la Recherche', emoji:'📖', type:'social', repeatable:true,
   effect:'+2<i class=ri-science></i> immédiat', desc:'Subventions aux labos et universités.',
   resGain:{science:2}, cost:{materials:2}},
  {id:'cm_univ', name:'Universités des Colonies', emoji:'🎓', type:'social',
   effect:'+1<i class=ri-science></i>/tour (permanent)', desc:'Réseau universitaire — savoir continu.',
   rGain:{science:1}, cost:{energy:1,materials:1}},
  {id:'cm_explore', name:'Extraction d\'He3', emoji:'⚛️', type:'social',
   effect:'+2<i class=ri-energy></i> immédiat', desc:'Récolte d\'hélium-3 — carburant de fusion, énergie abondante.',
   resGain:{energy:2}, cost:{materials:1,science:1}, repeatable:true},
  {id:'cm_forages', name:'Capture d\'astéroïdes', emoji:'☄️', type:'social', repeatable:true,
   effect:'+2<i class=ri-materials></i> immédiat', desc:'Capture et exploitation d\'astéroïdes — matériaux bruts.',
   resGain:{materials:2}, cost:{energy:1,science:1}},
  {id:'cm_reform', name:'Réforme Institutionnelle', emoji:'📜', type:'social',
   effect:'+5 pts Gouvernement (permanent)', desc:'Réforme des institutions — gouvernance durablement renforcée. Comme une tech : effet acquis une fois pour toutes. 1× par partie.',
   govPts:5, cost:{science:3}},
  // ── GOUVERNEMENT (formes : une seule active à la fois, remplace la précédente) ──
  {id:'gov_tyrannie', name:'Tyrannie', emoji:'👑', type:'government',
   effect:'+1 AC/tour. −2<i class=ri-morale></i> à l\'adoption. Moral plafonné à 6.', desc:'Pouvoir autoritaire — efficacité par la contrainte : on obéit, on ne s\'enthousiasme pas.',
   govForm:{formPts:0,acBonus:1,adoptMorale:2,moraleCap:6}, cost:{}},
  {id:'gov_corpo', name:'Domination des Corporations', emoji:'🏢', type:'government',
   effect:'+5 pts Gouv. −1<i class=ri-morale></i> à l\'adoption. Moral plafonné à 7.', desc:'Les conglomérats dirigent — ordre marchand, adhésion tiède.',
   govForm:{formPts:5,adoptMorale:1,moraleCap:7}, cost:{materials:2}},
  {id:'gov_senat', name:'Sénat Solaire', emoji:'⚖️', type:'government',
   effect:'+5 pts Gouvernement.', desc:'Élus de toutes les colonies et de la mère — décisions coordonnées.',
   govForm:{formPts:5}, cost:{materials:3}},
  {id:'gov_democratie', name:'Démocratie Instantanée', emoji:'🗳️', type:'government',
   effect:'+1<i class=ri-morale></i>/tour, +10 pts Gouv. Entretien −2<i class=ri-materials></i> −2<i class=ri-energy></i>/tour.', desc:'Vote permanent sur mobile — légitimité forte, coût de communication.',
   govForm:{formPts:10,moralePerTurn:1,upkeep:{materials:2,energy:2}}, cost:{materials:3,energy:2,science:1}},
];
/* Gagnant d'un événement : meilleur sur la CONDITION ; égalité départagée par VP le plus bas, puis le plus de jetons Force. */
function _evWinner(statFn){const allP=allPlayers();let w=allP[0];for(const p of allP){const s=statFn(p),bs=statFn(w);if(s>bs)w=p;else if(s===bs&&p!==w){const dv=calcVP(p).total-calcVP(w).total;if(dv<0||(dv===0&&p.forceTokens>w.forceTokens))w=p;}}return w;}
const EVENTS=[
  {id:'ruee',type:'competition',name:'Ruée Minière',emoji:'⛏️',preview:'La nation avec le plus de colonies gagne +6 VP. Si égalité en première place : les deux, si plus d\'égalités personne.',
   resolve(G){const h=_evTop(function(p){return p.colonies.length;});return 'Ruée Minière — '+_evAwardVP(h,6);}},
  {id:'storm',type:'menace',name:'Tempêtes Solaires',emoji:'🌩️',preview:'Sans IA Défensive, chaque nation perd 1 jeton Force, 1 route et 2<i class=ri-materials></i>.',
   /* ⚠️ « 2 NATIONS TOUCHÉES » NE DIT NI QUI, NI QUOI. Marc, partie 140A : « on ne sait pas qui est
      touché au moment où c'est notifié. On devrait aussi rappeler là ce qui est perdu par chacun
      avec le nom de la route perdue. » Le détail existait — il était simplement jeté.
      On nomme donc chaque nation, sa route détruite, et on dit qui s'en est tiré. */
   resolve(G){
     const touches=[], proteges=[];
     for(const p of allPlayers()){
       if(hasSpec(p,'storm_immune')){ proteges.push(p.civ.emoji+' '+p.civ.name); continue; }
       const _j=Math.min(1,p.forceTokens||0);
       p.forceTokens=Math.max(0,(p.forceTokens||0)-1);
       let _rte=null;
       if(p.routes&&p.routes.length){
         const r=p.routes.pop();
         _rte=((NODES[r.from]&&NODES[r.from].name)||r.from)+'→'+((NODES[r.to]&&NODES[r.to].name)||r.to);
         updateConnections(p);
       }
       const _mat=Math.min(2,p.res.materials||0);
       p.res.materials=Math.max(0,(p.res.materials||0)-2);
       /* Marc, 27/08 : « événements négatifs qui t'affectent, −1 moral ». On l'applique aux nations
          RÉELLEMENT touchées — celles que l'IA Défensive épargne sont sorties plus haut par `continue`,
          elles ne perdent donc rien, ce qui est le sens même d'être protégé. */
       p.res.morale=Math.max(0,(p.res.morale||0)-1);
       const perte=[]; if(_j)perte.push('−'+_j+' jeton'); if(_rte)perte.push('route '+_rte+' détruite'); if(_mat)perte.push('−'+_mat+'<i class=ri-materials></i>');
       perte.push('−1<i class=ri-morale></i>');
       touches.push(p.civ.emoji+' '+p.civ.name+' : '+(perte.join(', ')||'rien à perdre'));
       addLog('🌩️ '+p.civ.emoji+' '+p.civ.name+' — tempête : '+(perte.join(', ')||'rien à perdre')+'.','red');
     }
     return 'Tempêtes Solaires — '+touches.length+' nation(s) touchée(s).<br>'
       +touches.map(t=>'• '+t).join('<br>')
       +(proteges.length?('<br><span style="color:#9ad89a">🛡️ Épargnées (IA Défensive) : '+proteges.join(', ')+'</span>'):'');
   }},
  {id:'pirates',type:'menace',name:'Prolifération des pirates',emoji:'☠️',preview:'Les pirates frappent les routes de la nation la plus riche en <i class=ri-materials></i> : les routes sans jeton NI technologie de protection sont détruites ; celles avec un jeton ont 50% de chance d\'être perdues, mais 2 au maximum.',
   resolve(G){const h=_evTop(function(p){return p.res.materials||0;});if(h.length!==1)return 'Prolifération des pirates — aucune cible claire.';const tgt=h[0];let unp=0,prot=0,tech=0;const keep=[];for(const r of tgt.routes){if((r.tokens||0)>0){/* jeton posé : 50% chacune, MAX 2 perdues */ if(prot<2&&Math.random()<0.5){tgt.forceCooldown.push({count:r.tokens,returnTurn:getCooldownTurn(tgt)});prot++;}else keep.push(r);}else if(routeProtegee(tgt,r)){keep.push(r);tech++;/* protégée par une TECHNOLOGIE : elle n'a pas besoin de jeton */}else unp++;/* ni jeton ni technologie : détruite */}tgt.routes=keep;updateConnections(tgt);
    /* −1 moral SEULEMENT si les pirates ont mordu : une nation visée mais dont toutes les routes
       étaient protégées n'a rien subi, et son peuple n'a aucune raison de s'en émouvoir. */
    if((unp+prot)>0)tgt.res.morale=Math.max(0,(tgt.res.morale||0)-1);if(tech)addLog('🛡️ '+tech+' route(s) de '+_evName(tgt)+' épargnée(s) — protégées par une technologie, sans jeton nécessaire.','gold');if((unp+prot)===0)return 'Prolifération des pirates — '+_evName(tgt)+' est la nation la plus riche en <i class=ri-materials></i> et devient la cible des pirates, mais AUCUNE route n\'est perdue.';
    return 'Prolifération des pirates — '+_evName(tgt)+' est visé (nation la plus riche en <i class=ri-materials></i>) et perd '+(unp+prot)+' route(s) : '+unp+' sans jeton détruite(s)'+(prot?', '+prot+' protégée(s) pillée(s) (max 2 — jetons en récupération)':'')+'.';}},
  {id:'sci',type:'competition',name:'Conférence Scientifique Solaire',emoji:'🔬',preview:'La nation avec la plus grande production de <i class=ri-science></i> gagne +6 VP.',
   resolve(G){const h=_evTop(_sciProd);return 'Conférence Scientifique — '+_evAwardVP(h,6);}},
  {id:'tech',type:'competition',name:'Développement Technologique',emoji:'⚗️',preview:'La nation avec le plus de technologies de niveau 2 et 3 gagne +6 VP.',
   resolve(G){const h=_evTop(function(p){return p.cards.filter(function(c){return c.branch&&c.tier>=2;}).length;});return 'Développement Technologique — '+_evAwardVP(h,6);}},
  {id:'attract',type:'opportunite',name:'Civilisation la plus attractive',emoji:'✨',preview:'La nation avec le plus de moral gagne +2<i class=ri-materials></i> +2<i class=ri-science></i> +3 VP. Si égalité en première place : les deux, si plus d\'égalités personne.',
   resolve(G){const h=_evTop(function(p){return p.res.morale||0;});if(h.length===0||h.length>=3)return 'Civilisation attractive — personne (trop d\'égalités).';h.forEach(function(p){const c=getResCapFor(p);p.res.materials=Math.min(c.materials,(p.res.materials||0)+2);p.res.science=Math.min(c.science,(p.res.science||0)+2);gagnerVP(p,3,'Événement : Civilisation attractive');});return 'Civilisation attractive — '+h.map(_evName).join(' & ')+' → +2<i class=ri-materials></i> +2<i class=ri-science></i> +3 VP';}},
  {id:'milsup',type:'competition',name:'Suprématie Militaire',emoji:'⚔️',preview:'La nation avec le plus de jetons Force (récupération inclus) gagne +6 VP.',
   resolve(G){const h=_evTop(_forceTotal);return 'Suprématie Militaire — '+_evAwardVP(h,6);}},
  {id:'comm',type:'opportunite',name:'Accords Commerciaux',emoji:'🤝',interactive:true,preview:'Occasion de conclure un accord commercial gratuit (+3 VP par nation ; met fin à une guerre).',
   resolve(G){return _evAccordAuto('comm',G);}},
  {id:'diplo',type:'opportunite',name:'Accords Diplomatiques',emoji:'🕊️',interactive:true,preview:'Occasion de pactes de non-agression (durée du pacte : 4 tours, coût par nation 6<i class=ri-materials></i>). Tension −5 partout. Met fin à une guerre.',
   resolve(G){return _evAccordAuto('diplo',G);}},
  {id:'final',type:'competition',name:'Jugement Final',emoji:'🏆',preview:'Décompte final des points de victoire.',
   resolve(G){return 'Fin — calcul des scores !';}},
];
/* --- Refonte v18 : événements tirés au hasard, 1 par tour pair (T2/T4/T6/T8), révélés au tour précédent. T10 = Jugement Final. --- */
// Toujours NOMMER la nation : « Toi » seul était ambigu (on ne savait pas si on gagnait ou perdait).
function _evName(p){return p.civ.emoji+' '+p.civ.name+((typeof G!=='undefined'&&G&&p===G.player)?' (toi)':'');}
function _forceTotal(p){return (p.forceTokens||0)+((p.forceCooldown||[]).reduce(function(s,c){return s+(c.count||0);},0));}
// SOURCE UNIQUE : jetons Force réellement ENGAGEABLES (guerre / raid) = réserve − garnison obligatoire
// (1 jeton réservé par colonie connectée hors base). Les jetons posés sur les routes et ceux en récupération
// ne sont déjà PAS dans p.forceTokens. Utilisé par la barre du haut ET les fenêtres de combat (plus d'écart).
function engageableTokens(p){
  if(!p)return 0;
  const garrison=(p.colonies||[]).filter(function(c){return c.connected&&c.nodeId!==p.civ.home;}).length;
  return Math.max(0,(p.forceTokens||0)-garrison);
}
// SOURCE UNIQUE — combien de jetons on peut PAYER (c'est CE plafond qui limite la taille d'un assaut).
// Normal : 1🪨 +1⚡ par jeton → N ≤ min(matériaux, énergie).
// IA de Navigation : moitié, la demie sur l'ÉNERGIE → coût(N) = ⌊N/2⌋🪨 + ⌈N/2⌉⚡
//   (1 jeton = 1⚡ · 2 jetons = 1🪨1⚡ · 3 jetons = 1🪨2⚡ …) → N ≤ min(2×matériaux+1, 2×énergie).
/* ⚠️ `reserve` : CE QU'IL FAUT GARDER DE CÔTÉ (le Supercroiseur, typiquement).
   Sans ce paramètre, ce plafond et `cruiserAfford` se calculaient CHACUN sur la trésorerie entière,
   en s'ignorant l'un l'autre. Mesuré le 2026-08-15 : avec 3🪨 3⚡ en caisse, le jeu annonçait
   « 6 jetons engageables » ET « croiseur payable » — alors qu'engager 3 jetons vide déjà tout.
   Chaque paiement se terminant par un plancher à zéro, on pouvait engager au-delà de ses moyens et
   toucher quand même les +5⚔️ du croiseur, sans jamais rien payer de plus.
   Marc l'avait senti sans pouvoir le prouver : « vérifie que j'avais assez de ressources pour
   engager le supercroiseur dans le dernier combat, j'ai des doutes ». */
function maxAffordableTokens(p,reserve){
  if(!p)return 0;
  const _r=reserve||{};
  const mat=Math.max(0,(p.res.materials||0)-(_r.materials||0)), en=Math.max(0,(p.res.energy||0)-(_r.energy||0));
  if(typeof hasSpec==='function'&&hasSpec(p,'nav2_war')) return Math.max(0,Math.min(2*mat+1,2*en));
  return Math.max(0,Math.min(mat,en));
}
/* La réserve à prévoir si CETTE nation déploie son croiseur ce combat — sinon rien. */
function reserveCroiseur(p,deploye){
  if(!deploye||typeof cruiserCost!=='function')return null;
  return cruiserCost(p);
}
function _sciProd(p){var s=(p.rpt&&p.rpt.science)||0;for(var i=0;i<p.colonies.length;i++){var c=p.colonies[i];if(!c.connected)continue;var n=NODES[c.nodeId];if(!n||n.decorative)continue;if((n.res||{}).science)s+=n.res.science;if(c.level>=3)s+=2;else if(c.level>=2)s+=1;}if(p.investBonus&&p.investBonus.sciBonus)s+=p.investBonus.sciBonus;return s;}
/* ─── UNE ROUTE EST-ELLE PROTÉGÉE ? ────────────────────────────────────────────
   ⚠️ DÉFAUT SIGNALÉ PAR MARC LE 2026-08-08, ET C'ÉTAIT UN PIÈGE TENDU PAR LE JEU LUI-MÊME.
   Trois technologies protègent les routes : IA Défensive (`ia_immune`), Lien Empathe
   (`empath_routes`) et Réseau Orbital (`intel_2`). Les deux premières RETIRENT explicitement tes
   jetons des routes au moment où tu les acquiers — c'est leur intérêt : récupérer ces jetons pour
   le combat. Or l'événement « Prolifération des pirates » ne regardait QUE `r.tokens > 0` :
   il détruisait donc toutes les routes que la technologie venait de dégarnir. Marc en a perdu
   trois d'un coup, précisément parce qu'il avait pris la bonne technologie.
   La protection existait pourtant déjà — dans l'avancée normale des pirates (`ia_immune`,
   `intel_2`) et dans l'attaque de route en guerre (`ia_immune`, `empath_routes`). Trois endroits,
   trois listes différentes, et l'événement n'en avait aucune. Un seul test désormais, partagé. */
function routeProtegee(p, r){
  if(!p) return false;
  if((r&&r.tokens||0)>0) return true;                     // un jeton posé protège, comme avant
  return routesProtegeesParTech(p);
}
/* La nation a-t-elle une technologie qui protège TOUTES ses routes, jeton ou pas ?
   ⚠️ Marc, 2026-08-09 : « le lien empathe gère toujours pas les attaques de pirates !! Ça
   considère les routes pas défendues. » Exact, et c'est ma faute : en créant `routeProtegee` la
   veille pour l'ÉVÉNEMENT pirate, j'avais laissé `advancePirates` — l'attaque pirate de CHAQUE
   fin de tour — avec sa propre liste `ia_immune || intel_2`, sans Lien Empathe. Or Lien Empathe
   retire justement les jetons des routes : la technologie créait donc elle-même les routes que
   les pirates allaient détruire. Le piège exact que la correction de la veille devait supprimer,
   à l'endroit que j'avais oublié.
   La règle est maintenant écrite UNE fois. Les quatre endroits qui la lisaient chacun à leur
   façon (événement pirate, pirates de fin de tour, attaque de route en guerre, raid IA sur route)
   appellent tous ceci. */
function routesProtegeesParTech(p){
  return !!p && (hasSpec(p,'ia_immune')||hasSpec(p,'empath_routes')||hasSpec(p,'intel_2'));
}
/* Le nom des technologies effectivement possédées, pour que le journal dise POURQUOI c'est protégé.
   Un « protégé » sans raison laisse le joueur croire à un caprice du jeu. */
function techsProtegeantRoutes(p){
  const t=[];
  if(hasSpec(p,'ia_immune')) t.push('IA Défensive');
  if(hasSpec(p,'empath_routes')) t.push('Lien Empathe');
  if(hasSpec(p,'intel_2')) t.push('Réseau Orbital');
  return t;
}
function _evTop(statFn){const all=allPlayers();let mx=-Infinity;for(const p of all){const s=statFn(p);if(s>mx)mx=s;}if(mx<=0)return[];return all.filter(function(p){return statFn(p)===mx;});}
/* ═══ CHAQUE POINT GAGNÉ DOIT POUVOIR DIRE D'OÙ IL VIENT ═══
   Marc, 2026-08-25 : « j'aimerais un rapport de fin de partie plus détaillé… le calcul complet des
   points pour chaque élément calculé, notamment les bonus spéciaux qui n'est pas clair. »
   `tempVP` était un compteur muet : événements, victoires de guerre, découvertes et accords y
   versaient tous leurs points sans laisser de trace, et le rapport final n'affichait qu'un total.
   On passe donc par UNE fonction, qui incrémente ET retient le motif. Rien de coûteux : la raison
   est connue au moment où l'on ajoute les points — il suffisait de ne pas la jeter. */
function gagnerVP(p,n,raison){
  if(!p||!n)return;
  p.tempVP=(p.tempVP||0)+n;
  if(!Array.isArray(p._vpDetail))p._vpDetail=[];
  p._vpDetail.push({n:n, raison:String(raison||'sans motif'), tour:(typeof G!=='undefined'&&G)?G.turn:0});
}
function _evAwardVP(holders,vp,nom){if(holders.length===0)return 'personne (aucune production).';if(holders.length>=3)return 'personne — trop d\'égalités ('+holders.length+' nations).';holders.forEach(function(p){gagnerVP(p,vp,'Événement : '+(nom||'récompense'));});return holders.map(_evName).join(' & ')+' → +'+vp+' VP';}
function _evCommResolve(G){for(const ai of G.ais){setTens('player',ai.civ.id,Math.max(0,getTens('player',ai.civ.id)-2));setTens(ai.civ.id,'player',Math.max(0,getTens(ai.civ.id,'player')-2));}for(const p of allPlayers()){const c=getResCapFor(p);p.res.materials=Math.min(c.materials,(p.res.materials||0)+2);}return 'Sommet commercial — tension −2 avec chaque nation, +2<i class=ri-materials></i> pour toutes.';}
// Tension −5 partout (règle Marc). Le +1<i class=ri-morale></i> n'est PAS distribué à tout le monde :
// il est gagné UNIQUEMENT par pacte effectivement conclu (voir _evDiploConfirm) — texte uniformisé.
function _evDiploResolve(G){for(const ai of G.ais){setTens('player',ai.civ.id,Math.max(0,getTens('player',ai.civ.id)-5));setTens(ai.civ.id,'player',Math.max(0,getTens(ai.civ.id,'player')-5));}return 'Sommet diplomatique — tension −5 partout.';}
function buildEventSchedule(){const pool=EVENTS.filter(function(e){return e.id!=='final';}).map(function(e){return e.id;});for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const tmp=pool[i];pool[i]=pool[j];pool[j]=tmp;}return {2:pool[0],4:pool[1],6:pool[2],8:pool[3],10:'final'};}
function eventForTurn(tn){if(!G||!G.eventSchedule)return null;const id=G.eventSchedule[tn];return id?(EVENTS.find(function(e){return e.id===id;})||null):null;}
/* --- Événements interactifs (accords) : menu joueur en solo ; repli auto pour IA/headless/en-ligne --- */
let _evCommDone=null,_evDiploDone=null,_evDiploSel={};
/* La suite d'une fenêtre d'accord : un NOM rangé dans `G`. Les variables `_evCommDone`/`_evDiploDone`
   ne servent plus qu'aux flux solo pas encore migrés — elles ne survivent pas à une sauvegarde,
   c'est pourquoi la version nommée a la priorité. */
function _accordSuite(){
  const d=fluxDonnees(), nom=d.suiteAccord;
  if(nom){ d.suiteAccord=null; _evCommDone=null; _evDiploDone=null; return ()=>fluxAppeler(nom); }
  return null;
}
/* Une suite peut être un NOM (forme migrée) ou encore une fonction (flux solo non migrés).
   ⚠️ Sans ce point de passage unique, un `done()` appelé sur une CHAÎNE lève « done is not a
   function » — ou pire, ne fait rien du tout et la partie s'arrête sans un mot. C'est arrivé deux
   fois pendant cette migration ; on ne compte plus dessus. */
function _appelerSuite(x){
  if(typeof x==='function'){ x(); return true; }
  if(typeof x==='string'&&x){ fluxAppeler(x); return true; }
  return false;
}
function _evAccordAuto(kind,G){
  if(G.player&&!G.player._isAI&&!_decisionActive()&&typeof document!=='undefined'&&document.getElementById)return null; // menu interactif (continueAfterEOT)
  return kind==='comm'?_evCommResolve(G):_evDiploResolve(G);
}
function _evEndWarWith(aiId,turns){
  const i=_warIndexBetween(_moiId(),aiId);if(i>=0)G.wars.splice(i,1);
  if(typeof halveTensions==='function')halveTensions('player',aiId);
  if(typeof syncWarState==='function')syncWarState();
}
function _evOverlay(html){
  let m=document.getElementById('event-choice-modal');
  if(!m){m=document.createElement('div');m.id='event-choice-modal';document.body.appendChild(m);}
  // Reste DANS la zone centrale (entre les barres haut/bas) et scrolle si trop grand.
  m.style.cssText='position:fixed;left:0;right:0;top:var(--topband,0);bottom:var(--botband,0);background:rgba(4,4,18,.92);z-index:360;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:8px 8px 26px';
  m.innerHTML='<div class="ea-card" style="max-width:440px;width:100%;text-align:left">'+html+'</div>';m.style.display='flex';
}
function _evCloseOverlay(){const m=document.getElementById('event-choice-modal');if(m)m.style.display='none';}
function _evMyStats(){var p=G.player;return '<div style="font-size:.78em;color:#dfe8ff;background:#0e1630;border:1px solid #2a3a6a;border-radius:8px;padding:6px 9px;margin-bottom:8px"><b>'+p.civ.emoji+' '+p.civ.name+' (toi)</b> — 🏆 '+calcVP(p).total+' VP · ⚔️ '+p.forceTokens+' · '+(p.res.materials||0)+'<i class=ri-materials></i> '+(p.res.energy||0)+'<i class=ri-energy></i> '+(p.res.morale||0)+'<i class=ri-morale></i></div>';}
/* ⚠️ « CE QUE JE SAIS D'ELLE » DÉPEND DE QUI REGARDE. Cette fiche lisait `G.player` : avec
   plusieurs humains interrogés EN MÊME TEMPS, tous voyaient la force perçue et le niveau de
   renseignement de la nation active, pas les leurs. L'observateur est maintenant explicite. */
function _evAiInfo(ai,obs){var _o=obs||G.player;var pf=perceivedForce(_o,ai);var s='🏆 '+calcVP(ai).total+' VP · ⚔️ '+pf.val+(pf.exact?'':'±3');if(getIntelLevel(_o)>=2)s+=' · '+(ai.res.materials||0)+'<i class=ri-materials></i> '+(ai.res.energy||0)+'<i class=ri-energy></i> '+(ai.res.morale||0)+'<i class=ri-morale></i>';return s;}
/* Les nations avec qui NAT peut encore signer — humaines comprises.
   ⚠️ L'ancienne liste partait de `G.ais` : deux joueurs humains ne pouvaient donc JAMAIS se
   proposer d'accord pendant un sommet, l'un n'apparaissait simplement pas dans la liste de l'autre. */
/* Existe-t-il DÉJÀ un accord commercial entre ces deux nations ? Le registre des signataires est la
   source ; le propriétaire du nœud ne sert que de repli pour les parties enregistrées avant lui. */
/* ═══════════ LE PACTE DE NON-AGRESSION NE SERVAIT À RIEN ═══════════
   ⚠️ DÉFAUT TROUVÉ EN RELISANT LA PARTIE 792D (Marc, 26/08 : « accord diplomatique pas respecté,
   j'ai pu attaquer le jupitérien »). `G._nonAgg` était ÉCRIT à deux endroits et LU nulle part dans
   le jeu — seul un banc d'essai le consultait. Aucun contrôle avant un assaut, un raid ou une
   déclaration de guerre, ni pour le joueur ni pour l'ordinateur. Le pacte était un objet décoratif :
   on le payait 6🪨, on lisait une belle ligne au journal, et rien n'en découlait.
   ⚠️ ET IL ÉTAIT INDEXÉ PAR LA SEULE NATION VISÉE, pas par le couple : un pacte signé avec une
   nation l'aurait protégée de TOUT LE MONDE. C'est la maladie de perspective habituelle — une
   relation entre deux nations rangée comme une propriété d'une seule.
   On range donc les pactes PAR COUPLE, et on les fait respecter en un seul point de passage. */
function _clePacte(a,b){ return [String(a),String(b)].sort().join('|'); }
/* Rend le tour d'expiration si un pacte lie ces deux nations, sinon null. */
function pacteEntre(a,b){
  if(!a||!b)return null;
  const ida=(a.civ?a.civ.id:a), idb=(b.civ?b.civ.id:b);
  if(ida===idb)return null;
  const t=(G.pactes||{})[_clePacte(ida,idb)];
  return (t!==undefined&&t!==null&&G.turn<=t)?t:null;
}
function poserPacte(a,b,tours){
  if(!a||!b)return;
  const ida=(a.civ?a.civ.id:a), idb=(b.civ?b.civ.id:b);
  G.pactes=G.pactes||{};
  G.pactes[_clePacte(ida,idb)]=G.turn+(tours||4);
  /* Compat : `G._nonAgg` est conservé en écriture pour les sauvegardes et les bancs antérieurs.
     Il n'est plus la source de vérité — `G.pactes` l'est. */
  G._nonAgg=G._nonAgg||{}; G._nonAgg[idb]=G.turn+(tours||4);
}
/* LE POINT DE PASSAGE UNIQUE. Rend un message si l'agression est interdite, sinon null.
   `journaliser` : écrire le refus au journal (on ne le fait pas quand l'IA se contente de filtrer
   ses cibles, sinon le journal se remplirait de non-événements). */
function agressionInterditeEntre(a,b,journaliser){
  const t=pacteEntre(a,b);
  if(t===null)return null;
  const msg='🕊️ Pacte de non-agression en vigueur entre '+a.civ.emoji+' '+a.civ.name+' et '
    +b.civ.emoji+' '+b.civ.name+' jusqu\'au tour '+t+' — aucune agression possible.';
  if(journaliser)addLog(msg,'red');
  return msg;
}
function accordEntre(a,b){
  if(!a||!b||a===b)return null;
  const ida=a.civ.id, idb=b.civ.id;
  return (G.commercialAccords||[]).find(function(nid){
    const s=(typeof _accordSignataires==='function')?_accordSignataires(nid):null;
    if(s)return s.includes(ida)&&s.includes(idb);
    const o=(typeof ownerNation==='function')?ownerNation(nid):null;
    return !!(o&&(o.civ.id===ida||o.civ.id===idb));
  })||null;
}
/* ⚠️ CE FILTRE SE TROMPAIT DEUX FOIS, ET DANS LES DEUX SENS.
   Il écartait toute nation ayant un accord sur UNE DE SES COLONIES — peu importe avec qui. Une
   nation liée aux Terriens devenait donc introuvable pour les Martiens, alors qu'ils n'avaient
   rien signé ensemble.
   Et il laissait passer une nation avec qui on avait DÉJÀ un accord, dès lors que cet accord était
   posé sur une colonie à NOUS : c'est le cas vu en partie — un accord conclu au sommet, puis la
   même nation revenant en proposer un second par une colonie.
   La bonne question n'est pas « cette nation a-t-elle un accord ? » mais « avons-nous DÉJÀ un
   accord ELLE ET MOI ? ». */
function _evCommCandidats(nat){
  return allPlayers().filter(function(o){
    return o!==nat && !accordEntre(nat,o);
  });
}
/* `onDone` est un NOM de suite (bloc @flux) : il se sauvegarde, une fonction non. */
function showEventChoiceModal(ev,onDone){
  if(!ev){ if(onDone)fluxAppeler(onDone); return; }
  if(ev.id==='comm')showCommEventModal(onDone);
  else if(ev.id==='diplo')showDiploEventModal(onDone);
  else if(onDone)fluxAppeler(onDone);
}
function showCommEventModal(onDone){
  fluxDonnees().suiteAccord=(typeof onDone==='string'&&onDone)?onDone:null; _evCommDone=onDone;
  /* ⚠️ « QUI N'A PAS DÉJÀ UN ACCORD » — AVEC MOI, pas avec n'importe qui. Une nation liée à une
     TROISIÈME disparaissait de mes candidats : le sommet me refusait un partenaire parfaitement
     libre à mon égard. Voir le bandeau d'`accordAvecMoi`. */
  const cands=G.ais.filter(function(ai){return !accordEntre(G.player,ai);});
  if(_decisionActive()){ // EN LIGNE : router vers le client, qui affiche la vraie modale (pas de panneau générique)
    _emitDecision('event_comm', G.player, {cands:cands.map(function(ai){return {id:ai.civ.id,name:ai.civ.name,emoji:ai.civ.emoji,war:!!(_warBetween(_moiId(),ai.civ.id)),info:_evAiInfo(ai)};})}, 'stAccordCommChoisi', null);
    return;
  }
  let opts;
  if(cands.length===0)opts='<div style="color:#8898b8;font-size:.85em;margin:8px 0">Toutes les nations ont déjà un accord avec toi.</div>';
  else opts=cands.map(function(ai){
    const vp=calcVP(ai).total;const pf=perceivedForce(G.player,ai);const war=_warBetween(_moiId(),ai.civ.id);
    return '<button onclick="_evCommPick(\''+ai.civ.id+'\')" style="display:block;width:100%;text-align:left;margin:5px 0;padding:9px 11px;background:#141a30;border:1px solid #2a3a6a;border-radius:8px;color:#cfe0ff;cursor:pointer">'+ai.civ.emoji+' <b>'+ai.civ.name+'</b>'+(war?' <span style="color:#ff7766">⚔️ en guerre</span>':'')+'<br><span style="font-size:.82em;color:#9fb4d6">'+_evAiInfo(ai)+'</span></button>';
  }).join('');
  _evOverlay('<div style="font-size:2.2em;text-align:center">🤝</div><div style="text-align:center;font-weight:700;margin-bottom:4px">Accords Commerciaux</div><div style="color:#9fb4d6;font-size:.82em;text-align:center;margin-bottom:10px">Accord commercial <b>gratuit</b> : +3 VP pour chaque nation, met fin à une guerre si elle existe. Un leader trop en avance peut refuser.</div>'+_evMyStats()+opts+'<button class="ea-btn" onclick="_evCommPick(null)" style="margin-top:10px">Passer (aucun accord)</button>');
}
/* Conclut effectivement l'accord entre DEUX nations explicites (aucun recours à G.player : la
   réponse du partenaire peut arriver bien après, quand la perspective a changé). */
function _evAccordConclude(prop,part){
  if(!prop||!part)return;
  /* ⚠️ UN ACCORD SE CONCLUT UNE FOIS, PAS UNE FOIS PAR PROPOSANT (Marc, partie 792D).
     Au sommet SIMULTANÉ, chaque nation choisit dans une liste de candidats calculée AVANT que les
     réponses n'arrivent. Terriens et Ceinturiens se sont donc choisis mutuellement, et l'accord a
     été conclu DEUX FOIS — deux lignes au journal, +6 VP au lieu de +3 de chaque côté, et un revenu
     doublé (« +2🪨 +2🙂 » par tour au lieu de +1/+1) pendant six tours. C'est le rapport détaillé
     de fin de partie qui l'a rendu visible, en montrant deux fois la même ligne.
     Marc, 26/08 : « si je le propose et qu'il le propose, alors on devrait juste voir accord signé
     entre les deux nations, point. » La garde vit donc ICI, au seul endroit qui conclut. */
  if(typeof accordEntre==='function'&&accordEntre(prop,part)){
    addLog('🤝 '+prop.civ.emoji+' '+prop.civ.name+' et '+part.civ.emoji+' '+part.civ.name
      +' se sont proposé un accord l\'un à l\'autre — il n\'en est signé qu\'UN.','dim');
    return;
  }
  const col=part.colonies.find(function(c){return c.nodeId!==part.civ.home;})||part.colonies[0];
  if(col)_accordEnregistrer(col.nodeId,prop,part);   // les DEUX signataires sont enregistrés
  const _w=(G.wars||[]).find(function(w){return (w.a===prop.civ.id&&w.b===part.civ.id)||(w.a===part.civ.id&&w.b===prop.civ.id);});
  if(_w&&typeof _evEndWarWith==='function')_evEndWarWith(part.civ.id,3);
  setTens(prop.civ.id,part.civ.id,Math.max(0,getTens(prop.civ.id,part.civ.id)-3));
  setTens(part.civ.id,prop.civ.id,Math.max(0,getTens(part.civ.id,prop.civ.id)-3));
  gagnerVP(prop,3,'Accord commercial avec '+part.civ.name);gagnerVP(part,3,'Accord commercial avec '+prop.civ.name);
  if(typeof updateConnections==='function'){updateConnections(prop);updateConnections(part);}
  addLog('🤝 Accord commercial conclu : '+prop.civ.emoji+' '+prop.civ.name+' ↔ '+part.civ.emoji+' '+part.civ.name+' — +3 VP chacun, tension −3.','gold');
  /* LES DEUX NATIONS DOIVENT VOIR LE RÉSULTAT. Marc, 26/08 : « je propose mon accord et je ne vois
     pas sa réponse, et lui non plus ». Le journal ne suffit pas : il défile, et en ligne chacun ne
     lit que le sien. On envoie donc une notice à CHACUN des deux signataires. */
  if(typeof notifyNationHit==='function'){
    notifyNationHit(prop,'🤝 Accord commercial signé',
      'Ton accord avec '+part.civ.emoji+' '+part.civ.name+' est <b>signé</b>.<br>+3 VP pour chacun, tension −3, et +1<i class=ri-materials></i> +1<i class=ri-morale></i> par tour tant qu\'il tient.');
    notifyNationHit(part,'🤝 Accord commercial signé',
      'Ton accord avec '+prop.civ.emoji+' '+prop.civ.name+' est <b>signé</b>.<br>+3 VP pour chacun, tension −3, et +1<i class=ri-materials></i> +1<i class=ri-morale></i> par tour tant qu\'il tient.');
  }
}
/* ACCORD COMMERCIAL = UNE PROPOSITION, PAS UNE DÉCISION UNILATÉRALE (règle posée par Marc).
   Avant : celui qui choisissait concluait l'accord tout seul ; l'autre ne voyait jamais de demande,
   il recevait simplement le même menu global — l'accord ne « marchait » que si, par hasard, il
   choisissait le premier en retour. Désormais : le partenaire HUMAIN reçoit une vraie DEMANDE
   (accepter / refuser), et ce n'est qu'après sa réponse que l'accord est conclu. Il garde ensuite
   son propre tour de choix parmi les nations restantes. Les IA répondent selon la règle existante
   (refus si le proposant est trop en avance et qu'elles ne sont pas en difficulté). */
function _evCommPick(aiId,propId){
  const _simul=Array.isArray(fluxDonnees().accordsRestants);   // sommet simultané en cours ?
  const nomSuite=fluxDonnees().suiteAccord;   // le NOM, avant que `_accordSuite()` ne le consomme
  const done=_simul?null:(_accordSuite()||_evCommDone); if(!_simul)_evCommDone=null; _evCloseOverlay();
  /* ⚠️ LE PROPOSANT N'EST PLUS « LA NATION ACTIVE ». Quand les joueurs sont interrogés en même
     temps, `G.player` ne désigne plus celui dont on traite la réponse : deux réponses arrivant
     coup sur coup auraient été attribuées à la même nation. Il est donc passé explicitement. */
  const prop=(propId&&allPlayers().find(function(n){return n.civ.id===propId;}))||G.player;
  const _suite=function(){ if(_simul)_accordsVerifierFin(); else _appelerSuite(done); };
  if(!aiId){addLog('🤝 '+prop.civ.emoji+' '+prop.civ.name+' — sommet commercial : aucun accord signé.','dim');_suite();return;}
  const ai=(typeof allPlayers==='function'?allPlayers():G.ais).find(function(a){return a&&a.civ&&a.civ.id===aiId;});
  if(!ai){_suite();return;}
  /* ⚠️ NE PAS POSER UNE QUESTION DÉJÀ TRANCHÉE. Partie 8B47, tour 4 : Marc a lu, dans cet ordre,
     « Ceinturiens propose un accord… en attente de sa réponse », « Accord commercial conclu :
     Terriens ↔ Ceinturiens », puis « Terriens refuse la proposition ». Trois lignes cohérentes
     entre elles mais incompréhensibles à la lecture — ce sont DEUX transactions du même sommet :
     il proposait aux Ceinturiens pendant qu'ils lui proposaient. Sa propre proposition s'est
     conclue, et on lui a quand même demandé de répondre à une offre devenue sans objet.
     Le couple est déjà lié : on le dit, et on ne demande rien. */
  if(typeof accordEntre==='function'&&accordEntre(prop,ai)){
    addLog('🤝 '+prop.civ.emoji+' '+prop.civ.name+' et '+ai.civ.emoji+' '+ai.civ.name
      +' sont déjà liés par un accord — la seconde proposition du sommet est sans objet.','dim');
    _suite();return;
  }
  // Partenaire HUMAIN en ligne → on lui DEMANDE son accord.
  if(_decisionActive()&&!ai._isAI){
    addLog('🤝 '+prop.civ.emoji+' '+prop.civ.name+' propose un accord commercial à '+ai.civ.emoji+' '+ai.civ.name+' — en attente de sa réponse…','dim');
    _emitDecision('accord_request', ai,
      {title:'🤝 Proposition d\'accord commercial',
       from:prop.civ.id, fromName:prop.civ.emoji+' '+prop.civ.name,
       texte:prop.civ.emoji+' '+prop.civ.name+' te propose un ACCORD COMMERCIAL : +3 VP pour chacun, tension −3, et fin de la guerre entre vous s\'il y en a une.',
       options:[{id:'yes',name:'✅ Accepter l\'accord'},{id:'no',name:'❌ Refuser'}]},
      'stAccordReponse', null);
    /* Les DEUX nations concernées vont dans les données du flux, pas dans la fermeture ci-dessus.
       Une proposition d'accord peut rester en attente longtemps (le partenaire est peut-être parti
       dîner) : si le serveur redémarre entre-temps, une fermeture est perdue et la partie se fige
       sans un mot. Deux identifiants de nation, eux, se sauvegardent. */
    /* ⚠️ UNE SEULE PAIRE NE SUFFIT PLUS. `accordProp`/`accordPart` ne retenaient QU'UNE
       proposition : avec des sommets simultanés, deux joueurs peuvent proposer en même temps et la
       seconde proposition écrasait la première, qui restait sans réponse pour toujours. On tient
       une LISTE de paires — deux identifiants par entrée, donc parfaitement sauvegardable. */
    const _d=fluxDonnees();
    _d.accordsPaires=_d.accordsPaires||[];
    _d.accordsPaires.push({prop:prop.civ.id, part:ai.civ.id});
    _d.accordProp=prop.civ.id; _d.accordPart=ai.civ.id;   // compat : parties enregistrées en cours
    if(!_simul)_d.suiteAccord=nomSuite;   // la suite du tour se joue APRÈS la réponse
    return;
  }
  /* Partenaire IA : MÊME RÈGLE que celle qu'on appliquerait à un joueur (`accordAcceptable`).
     Avant, cette fonction avait sa propre version — une IA pouvait donc accepter là où un humain
     aurait refusé, et inversement. Deux règles pour la même question, c'est une de trop. */
  const avis=accordAcceptable(ai,prop);
  if(!avis.ok){
    addLog('🤝 '+ai.civ.emoji+' '+ai.civ.name+' REFUSE l\'accord de '+prop.civ.emoji+' '+prop.civ.name
      +' — '+avis.raison+'.','red');
    if(typeof _emitNotice==='function')_emitNotice('accord_result', prop,
      {title:'🤝 Accord refusé', body:ai.civ.emoji+' '+ai.civ.name+' a refusé : '+avis.raison+'.'}, 'stRien');
    _suite();return;
  }
  _evAccordConclude(prop,ai);
  _suite();
}
/* ---- SUITES NOMMÉES DES FENÊTRES D'ACCORD (elles étaient des fermetures) ----
   Une fermeture ne se sauvegarde pas : une partie enregistrée pendant un sommet commercial ou
   diplomatique ne repartait pas. Le message d'erreur nommait la question perdue, mais c'est tout.
   Ces trois suites portent maintenant un nom, comme le reste du flux. */
function stAccordCommChoisi(ans,civId){
  const qui=civId||(ans&&ans._civ)||(G.player&&G.player.civ&&G.player.civ.id);
  _accordsMarquerRepondu(qui);
  _evCommPick(ans&&ans.aiId?ans.aiId:null, qui);
}
/* Réponse à un accord proposé PAR CLIC SUR UNE COLONIE (hors événement). Suite NOMMÉE : une
   proposition peut rester en attente longtemps, et une fermeture ne survivrait pas à une
   sauvegarde. Le coût n'est prélevé qu'ici, à l'acceptation — pas à la proposition. */
function stAccordDirectReponse(ans){
  const d=fluxDonnees();
  const prop=allPlayers().find(p=>p.civ.id===d.accordProp);
  const part=allPlayers().find(p=>p.civ.id===d.accordPart);
  const nodeId=d.accordNode;
  d.accordProp=null; d.accordPart=null; d.accordNode=null;
  const ok=!!(ans&&(ans.value==='yes'||ans.targetId==='yes'||ans.id==='yes'||ans.accept===true));
  if(!prop||!part){ return; }
  if(!ok){
    addLog('🤝 '+part.civ.emoji+' '+part.civ.name+' REFUSE l\'accord commercial de '
      +prop.civ.emoji+' '+prop.civ.name+'.','red');
    if(typeof _emitNotice==='function')_emitNotice('accord_result', prop,
      {title:'🤝 Accord refusé', body:part.civ.emoji+' '+part.civ.name+' a refusé ton accord commercial. Tu ne perds rien.'}, 'stRien');
    return;
  }
  // Accepté : c'est MAINTENANT que le proposant paie.
  if((prop.res.materials||0)<2 || prop.acLeft<1){
    addLog('🤝 '+prop.civ.emoji+' '+prop.civ.name+' n\'a plus les moyens de conclure l\'accord.','red');
    return;
  }
  prop.acLeft-=1; prop.res.materials-=2; prop.spentThisTurn=(prop.spentThisTurn||0)+3;
  part.res.materials=(part.res.materials||0)+2;
  _accordEnregistrer(nodeId,prop,part);
  setTens(prop.civ.id,part.civ.id,Math.max(0,getTens(prop.civ.id,part.civ.id)-3));
  setTens(part.civ.id,prop.civ.id,Math.max(0,getTens(part.civ.id,prop.civ.id)-3));
  if(typeof updateConnections==='function'){updateConnections(prop);updateConnections(part);}
  addLog('🤝 Accord commercial conclu : '+prop.civ.emoji+' '+prop.civ.name+' ↔ '
    +part.civ.emoji+' '+part.civ.name+' sur '+((NODES[nodeId]&&NODES[nodeId].name)||nodeId)
    +' — il donne 2<i class=ri-materials></i>, tension −3 des deux côtés.','gold');
  if(typeof _emitNotice==='function')_emitNotice('accord_result', prop,
    {title:'🤝 Accord accepté', body:part.civ.emoji+' '+part.civ.name+' a ACCEPTÉ ton accord commercial.'}, 'stRien');
}
/* RÉPONSE À UN PACTE DE NON-AGRESSION PROPOSÉ À UN JOUEUR.
   Suite NOMMÉE : une proposition peut rester en attente longtemps, et une fermeture ne survivrait
   pas à une sauvegarde. Le coût n'est prélevé QU'ICI, à l'acceptation — comme pour l'accord
   commercial direct. */
function stPacteReponse(ans,civId){
  const d=fluxDonnees();
  const qui=civId||(ans&&ans._civ)||null;
  const paires=d.accordsPaires||[];
  const i=paires.findIndex(x=>x&&x.pacte&&x.part===qui);
  const paire=i>=0?paires[i]:null;
  if(i>=0)paires.splice(i,1);
  const prop=paire?allPlayers().find(p=>p.civ.id===paire.prop):null;
  const part=paire?allPlayers().find(p=>p.civ.id===paire.part):null;
  const oui=!!(ans&&(ans.value==='yes'||ans.targetId==='yes'||ans.id==='yes'||ans.accept===true));
  if(prop&&part){
    if(!oui){
      addLog('🕊️ '+part.civ.emoji+' '+part.civ.name+' REFUSE le pacte de '+prop.civ.emoji+' '+prop.civ.name+'.','red');
      if(typeof _emitNotice==='function')_emitNotice('accord_result', prop,
        {title:'🕊️ Pacte refusé', body:part.civ.emoji+' '+part.civ.name+' a refusé ton pacte. Tu ne paies rien.'}, 'stRien');
    }else if((prop.res.materials||0)<6){
      addLog('🕊️ '+prop.civ.emoji+' '+prop.civ.name+' n\'a plus les 6<i class=ri-materials></i> du pacte.','red');
    }else{
      prop.res.materials-=6;
      const _i=_warIndexBetween(prop.civ.id,part.civ.id);
      if(_i>=0){G.wars.splice(_i,1);halveTensions(prop.civ.id,part.civ.id);if(typeof syncWarState==='function')syncWarState();}
      poserPacte(prop,part,4);
      setTens(prop.civ.id,part.civ.id,0);setTens(part.civ.id,prop.civ.id,0);
      const cap=getResCapFor(prop).morale, cap2=getResCapFor(part).morale;
      prop.res.morale=Math.min(cap,(prop.res.morale||0)+1);
      part.res.morale=Math.min(cap2,(part.res.morale||0)+1);
      addLog('🕊️ Pacte de non-agression : '+prop.civ.emoji+' '+prop.civ.name+' ↔ '+part.civ.emoji+' '+part.civ.name+' (4 tours).','gold');
      /* LES DEUX signataires reçoivent la nouvelle, pas seulement celui qui a proposé. */
      if(typeof notifyNationHit==='function'){
        const _t=n=>'Pacte de non-agression signé avec '+n.civ.emoji+' '+n.civ.name+' pour <b>4 tours</b>.'
          +'<br>Aucune des deux nations ne peut assaillir, piller ni déclarer la guerre à l\'autre pendant ce temps.';
        notifyNationHit(prop,'🕊️ Pacte de non-agression signé',_t(part));
        notifyNationHit(part,'🕊️ Pacte de non-agression signé',_t(prop));
      }
    }
  }
  if(Array.isArray(d.accordsRestants)) _accordsVerifierFin();
}
function stAccordReponse(ans,civId){
  const d=fluxDonnees();
  /* On retrouve LA paire dont ce répondant est le partenaire — plusieurs propositions peuvent
     être en vol en même temps. Les anciens champs uniques servent de repli pour une partie
     enregistrée avant ce changement. */
  const qui=civId||(ans&&ans._civ)||d.accordPart;
  const paires=d.accordsPaires||[];
  const i=paires.findIndex(x=>x&&x.part===qui);
  const paire=i>=0?paires[i]:{prop:d.accordProp,part:d.accordPart};
  if(i>=0)paires.splice(i,1);
  const prop=allPlayers().find(p=>p.civ.id===paire.prop);
  const part=allPlayers().find(p=>p.civ.id===paire.part);
  d.accordProp=null; d.accordPart=null;
  const ok=!!(ans&&(ans.value==='yes'||ans.targetId==='yes'||ans.id==='yes'||ans.accept===true));
  /* Le lien a pu se nouer PENDANT que la question attendait : au sommet, tout le monde propose en
     même temps. Traiter la réponse comme un refus ferait croire au joueur que son « non » a été
     ignoré — puisqu'un accord existe malgré tout. On dit ce qui est. */
  if(prop&&part&&typeof accordEntre==='function'&&accordEntre(prop,part)){
    /* ⚠️ ET ON SORT PAR LA MÊME PORTE QUE LA FIN DE FONCTION. J'avais d'abord écrit `_suite()`, qui
       n'existe pas dans cette portée — c'est la fermeture d'une AUTRE fonction, quarante lignes plus
       haut. Une `ReferenceError` ici aurait figé le sommet pour tout le monde. */
    addLog('🤝 '+prop.civ.emoji+' '+prop.civ.name+' et '+part.civ.emoji+' '+part.civ.name
      +' étaient déjà liés — il n\'existe qu\'un accord par couple de nations.','dim');
    if(typeof _emitNotice==='function')_emitNotice('accord_result', prop,
      {title:'🤝 Accord déjà en vigueur',
       body:'Un accord vous liait déjà à '+part.civ.emoji+' '+part.civ.name
           +'. Il n\'en existe qu\'un par couple de nations : ta proposition était sans objet.'}, 'stRien');
    if(Array.isArray(d.accordsRestants)) _accordsVerifierFin();
    else _appelerSuite(_accordSuite());
    return;
  }
  if(prop&&part){
    if(ok)_evAccordConclude(prop,part);
    else addLog('🤝 '+part.civ.emoji+' '+part.civ.name+' refuse la proposition de '+prop.civ.emoji+' '+prop.civ.name+'.','red');
    // Le proposant doit VOIR la réponse : notice personnelle (pas un simple message de journal).
    if(typeof _emitNotice==='function')_emitNotice('accord_result', prop,
      {title:ok?'🤝 Accord accepté':'🤝 Accord refusé',
       body:(ok?part.civ.emoji+' '+part.civ.name+' a ACCEPTÉ ton accord commercial — +3 VP chacun, tension −3.'
              :part.civ.emoji+' '+part.civ.name+' a REFUSÉ ton accord commercial.')}, 'stRien');
  }
  if(Array.isArray(d.accordsRestants)) _accordsVerifierFin();
  else _appelerSuite(_accordSuite());
}
function stDiploChoisi(ans,civId){
  _evDiploSel={};
  if(ans&&ans.selected){for(var i=0;i<ans.selected.length;i++)_evDiploSel[ans.selected[i]]=true;}
  const qui=civId||(ans&&ans._civ)||(G.player&&G.player.civ&&G.player.civ.id);
  _accordsMarquerRepondu(qui);
  _evDiploConfirm(qui);
}
function showDiploEventModal(onDone){
  fluxDonnees().suiteAccord=(typeof onDone==='string'&&onDone)?onDone:null; _evDiploDone=onDone;_evDiploSel={};
  if(_decisionActive()){ // EN LIGNE : router vers le client (vraie modale de pactes)
    _emitDecision('event_diplo', G.player, {mat:(G.player.res.materials||0), energy:(G.player.res.energy||0), rows:G.ais.map(function(ai){return {id:ai.civ.id,name:ai.civ.name,emoji:ai.civ.emoji,war:!!(_warBetween(_moiId(),ai.civ.id)),info:_evAiInfo(ai)};})}, 'stDiploChoisi', null);
    return;
  }
  const rows=G.ais.map(function(ai){
    const war=_warBetween(_moiId(),ai.civ.id);
    const cost=war?'6<i class=ri-materials></i> (met fin à la guerre)':'6<i class=ri-materials></i>';
    return '<label style="display:flex;align-items:flex-start;gap:8px;margin:5px 0;padding:8px 10px;background:#141a30;border:1px solid #2a3a6a;border-radius:8px;color:#cfe0ff;cursor:pointer"><input type="checkbox" style="margin-top:3px" onchange="_evDiploToggle(\''+ai.civ.id+'\',this.checked)"> <span>'+ai.civ.emoji+' <b>'+ai.civ.name+'</b> — pacte 4 tours · '+cost+(war?' · <span style="color:#ff7766">en guerre</span>':'')+'<br><span style="font-size:.82em;color:#9fb4d6">'+_evAiInfo(ai)+'</span></span></label>';
  }).join('');
  _evOverlay('<div style="font-size:2.2em;text-align:center">🕊️</div><div style="text-align:center;font-weight:700;margin-bottom:4px">Accords Diplomatiques</div><div style="color:#9fb4d6;font-size:.82em;text-align:center;margin-bottom:10px">Pacte de non-agression : 4 tours, 6<i class=ri-materials></i> par nation. Met fin à une guerre. +1<i class=ri-morale></i> par pacte conclu, tension 0 avec le partenaire.</div>'+_evMyStats()+rows+'<button class="ea-btn" onclick="_evDiploConfirm()" style="margin-top:10px">Conclure les pactes sélectionnés</button><button class="ea-btn" onclick="_evDiploNone()" style="margin-top:6px;background:#2a2f45">Aucun pacte</button>');
}
function _evDiploToggle(aiId,on){_evDiploSel[aiId]=on;}
function _evDiploNone(){_evDiploSel={};_evDiploConfirm();}
function _evDiploConfirm(propId){
  /* ⚠️ LE SIGNATAIRE N'EST PLUS « LA NATION ACTIVE ». Cette fonction lisait `G.player` d'un bout à
     l'autre : interrogés en même temps, deux joueurs auraient signé leurs pactes sur le dos du
     même compte en banque. Le proposant est passé explicitement. */
  const _simul=Array.isArray(fluxDonnees().accordsRestants);
  const prop=(propId&&allPlayers().find(function(n){return n.civ.id===propId;}))||G.player;
  const done=_simul?null:(_accordSuite()||_evDiploDone); if(!_simul)_evDiploDone=null;
  const autres=allPlayers().filter(function(n){return n!==prop;});
  for(const o of autres){setTens(prop.civ.id,o.civ.id,Math.max(0,getTens(prop.civ.id,o.civ.id)-5));setTens(o.civ.id,prop.civ.id,Math.max(0,getTens(o.civ.id,prop.civ.id)-5));}
  let made=0;
  for(const o of autres){
    if(!_evDiploSel[o.civ.id])continue;
    const war=_warBetween(prop.civ.id,o.civ.id);
    const needM=6; // coût uniforme : 6 matériaux par nation (plus de surcoût énergie en cas de guerre)
    if((prop.res.materials||0)<needM){addLog('🕊️ '+prop.civ.emoji+' '+prop.civ.name+' : pas assez de matériaux pour le pacte avec '+o.civ.name+' (6 requis).','red');continue;}
    /* ⚠️ UN PACTE SE SIGNE À DEUX. Il s'appliquait sans que l'autre nation ait son mot à dire :
       on payait 6🪨 et le pacte existait, même si la nation visée n'en voulait pas.
       Elle peut désormais refuser, selon la même règle qu'un accord commercial — et l'on ne paie
       pas un pacte refusé. (Un partenaire HUMAIN devrait recevoir une fenêtre : c'est le chantier
       de diplomatie que Marc a mis à plus tard ; en attendant, la règle vaut au moins pour les IA.) */
    /* UN PARTENAIRE HUMAIN REÇOIT UNE VRAIE FENÊTRE.
       ⚠️ IL N'EN AVAIT AUCUNE. Le pacte s'appliquait à lui sans qu'on lui demande : seules les IA
       avaient le droit de refuser. C'est le dernier des trois accords où un joueur subissait la
       décision d'un autre (Marc, 2026-08-14 : « il faut absolument que le multijoueur humain
       tourne et qu'on ait plus ces bugs de ne pas être notifié des propositions »).
       Rien n'est prélevé ici : les 6🪨 ne partent qu'à l'acceptation, dans `stPacteReponse`. */
    if(_decisionActive()&&!o._isAI){
      const _d2=fluxDonnees();
      _d2.accordsPaires=_d2.accordsPaires||[];
      _d2.accordsPaires.push({prop:prop.civ.id, part:o.civ.id, pacte:true});
      addLog('🕊️ '+prop.civ.emoji+' '+prop.civ.name+' propose un pacte de non-agression à '
        +o.civ.emoji+' '+o.civ.name+' — en attente de sa réponse…','dim');
      _emitRemote('accord_request', o,
        {title:'🕊️ Proposition de pacte de non-agression',
         from:prop.civ.id, fromName:prop.civ.emoji+' '+prop.civ.name,
         texte:prop.civ.emoji+' '+prop.civ.name+' te propose un PACTE DE NON-AGRESSION de 4 tours : '
               +'tension remise à zéro entre vous, fin de la guerre s\'il y en a une, et +1<i class=ri-morale></i> pour chacun. '
               +'C\'est lui qui paie les 6<i class=ri-materials></i>.',
         options:[{id:'yes',name:'🕊️ Accepter le pacte'},{id:'no',name:'❌ Refuser'}]},
        'stPacteReponse', null);
      continue;
    }
    const _avis=accordAcceptable(o,prop);
    if(!_avis.ok){
      addLog('🕊️ '+o.civ.emoji+' '+o.civ.name+' REFUSE le pacte de non-agression de '+prop.civ.emoji+' '+prop.civ.name+' — '+_avis.raison+'.','red');
      /* ⚠️ MARC N'A PAS VU CE REFUS (partie 792D : « j'ai pas vu qu'il l'a refusé, il faut que les
         nations voient la réponse ! »). Une ligne de journal parmi trente ne se voit pas, et en
         ligne chacun ne lit que le sien. Le proposant reçoit donc une notice. */
      if(typeof notifyNationHit==='function')notifyNationHit(prop,'🕊️ Pacte refusé',
        o.civ.emoji+' '+o.civ.name+' a <b>REFUSÉ</b> ton pacte de non-agression.<br>Motif : '+_avis.raison
        +'.<br><br>Tu ne perds rien — les 6<i class=ri-materials></i> ne sont pas prélevés.');
      continue;
    }
    prop.res.materials-=needM;
    if(war){const _i=_warIndexBetween(prop.civ.id,o.civ.id);if(_i>=0)G.wars.splice(_i,1);halveTensions(prop.civ.id,o.civ.id);if(typeof syncWarState==='function')syncWarState();}
    /* ⚠️ MÉMO — `G._nonAgg` est indexé par la SEULE nation visée, pas par le couple : un pacte
       signé par un joueur protège donc cette nation vis-à-vis de tout le monde. C'est la même
       maladie de perspective, mais changer la forme de cette donnée touche à tous ses lecteurs —
       à traiter à part, pas au milieu de la simultanéité. */
    poserPacte(prop,o,4);
    setTens(prop.civ.id,o.civ.id,0);setTens(o.civ.id,prop.civ.id,0);
    prop.res.morale=Math.min(getResCapFor(prop).morale,(prop.res.morale||0)+1);made++;
    addLog('🕊️ Pacte de non-agression : '+prop.civ.emoji+' '+prop.civ.name+' ↔ '+o.civ.emoji+' '+o.civ.name+' (4 tours).','gold');
    if(typeof notifyNationHit==='function'){
      const _txt=n=>'Pacte de non-agression signé avec '+n.civ.emoji+' '+n.civ.name+' pour <b>4 tours</b>.'
        +'<br>Aucune des deux nations ne peut assaillir, piller ni déclarer la guerre à l\'autre pendant ce temps.';
      notifyNationHit(prop,'🕊️ Pacte de non-agression signé',_txt(o));
      notifyNationHit(o,'🕊️ Pacte de non-agression signé',_txt(prop));
    }
  }
  _evCloseOverlay();
  /* Le journal est PARTAGÉ : « aucun pacte conclu » sans nom laissait croire que PERSONNE n'avait
     rien signé, alors que deux lignes plus haut deux pactes venaient d'être annoncés par un autre
     joueur (log de Marc, partie CC36). On nomme la nation. */
  if(made===0)addLog('🕊️ '+prop.civ.emoji+' '+prop.civ.name+' — sommet diplomatique : aucun pacte signé (tension −5 tout de même).','dim');
  if(_simul)_accordsVerifierFin(); else _appelerSuite(done);
}

/* ============================================================ STATE ============================================================ */
let G={};let mode=null;let routeFrom=null;let selectedCiv=null;let selectedAiCiv=null;let selectedAiCivs=[];let gameDifficulty='easy';let undoStack=[];let _warSliderMode='attack';
/* `_warModalCb`, `_peaceCb`, `_evModalCb`, `_warCombatCb`, `_pendingDiscovery`, `_forcedWarCb` ont
   été SUPPRIMÉS : c'étaient des variables de MODULE contenant des fonctions. Deux défauts, tous deux
   payés pendant la migration : elles ne survivaient pas à une sauvegarde (JSON n'écrit pas de
   fonctions), et elles étaient PARTAGÉES entre toutes les parties d'un même processus serveur.
   Toute suite est désormais un NOM rangé dans `G._flux.donnees` — voir le bloc @flux en bas. */
/* ============================================================ HELPERS ============================================================ */
// Résolveur d'identité : 'player' = la nation EN TRAIN d'agir (G.player). Le stockage des tensions
// est désormais par civ.id → symétrique entre nations, prêt pour le multijoueur (rotation serveur).
/* ═══════ L'ENNEMI VISÉ PAR UNE IA — UN IDENTIFIANT, PAS UN OBJET ═══════
   ⚠️ CECI RENDAIT LA PARTIE IMPOSSIBLE À SAUVEGARDER. `ai._enemy` contenait l'OBJET nation ciblé.
   Tant que les IA ne visaient que le joueur, la structure restait un arbre. Depuis qu'elles se font
   la guerre entre elles (2026-08-16), deux IA peuvent se cibler mutuellement : A._enemy → B,
   B._enemy → A. `JSON.stringify` lève alors « Converting circular structure to JSON », et
   `scSerialize` échoue — c'est-à-dire que la partie n'est plus enregistrable DU TOUT. Sur un
   serveur qui sauvegarde après chaque avancée, cela veut dire tout perdre au redémarrage.
   Un identifiant ne boucle pas. `aiEnnemi(ai)` le résout à la demande, et rend `null` si la nation
   n'existe plus (siège libéré, nation vaincue) — les appelants testaient déjà ce cas.
   `_enemy` reste lu en secours pour les parties enregistrées avant ce correctif. */
function aiEnnemi(ai){
  if(!ai) return null;
  const id = ai._enemyId || (ai._enemy && ai._enemy.civ && ai._enemy.civ.id) || null;
  if(!id) return null;
  const tous = (typeof allPlayers==='function') ? allPlayers() : [G.player].concat(G.ais||[]);
  return tous.find(n=>n && n.civ && n.civ.id===id) || null;
}
function _tk(x){return x==='player'?((G.player&&G.player.civ&&G.player.civ.id)||'player'):x;}
function getTens(from,to){from=_tk(from);to=_tk(to);return((G.tensions[from]||{})[to])||0;}
function setTens(from,to,val){from=_tk(from);to=_tk(to);if(!G.tensions[from])G.tensions[from]={};G.tensions[from][to]=Math.max(0,Math.min(10,val));}
function addTens(from,to,delta){setTens(from,to,getTens(from,to)+delta);}
/* Tension EFFECTIVE : une nation déjà en guerre voit sa tension envers les AUTRES baisser de 6 —
   le peuple craint d'ouvrir un second front.
   ⚠️ CETTE RÈGLE NE CONNAISSAIT QU'UNE NATION : LA TIENNE. L'ancienne version cherchait `G.player`
   parmi les deux identifiants, appelait « l'autre » celui qui n'était pas toi, et demandait
   `_warBetween(_moiId(), other)` — « suis-JE en guerre avec lui ». Sur un couple où tu n'es NI l'un
   NI l'autre, ces trois pas sont faux : `other` désignait le premier des deux au hasard, et la
   remise de 6 s'appliquait ou non selon TES guerres à toi, qui ne les regardent pas.
   Réécrite avec les deux nations nommées, la règle est la même — c'est sa portée qui change. */
function tensEff(from,to){
  from=_tk(from); to=_tk(to);
  var t=getTens(from,to);
  if(!(G.wars&&G.wars.length>0)) return t;
  /* `from` est la nation qui en veut à `to`. Si ELLE est déjà en guerre — mais pas contre `to` —
     son peuple a d'autres soucis. */
  if(_warOf(from)&&!_warBetween(from,to)) t=Math.max(0,t-6);
  return t;
}
function halveTensions(aId,bId){setTens(aId,bId,Math.ceil(getTens(aId,bId)/2));setTens(bId,aId,Math.ceil(getTens(bId,aId)/2));}
function resetTensions(aId,bId){setTens(aId,bId,0);setTens(bId,aId,0);}
// Modèle de guerre généralisé : canonique par nation (w.a, w.b = civ.id ; w.winsBy par civ.id)
// + vue dérivée côté G.player (w.aiId = l'autre nation ; w.wins = {player, ai}) pour ne pas réécrire
// les ~100 accès existants. Côté serveur, la rotation de G.player adapte automatiquement la vue.
/* « L'AUTRE CAMP » — MAIS L'AUTRE DE QUI ? Sans second argument, cette fonction répond « l'autre
   par rapport à la nation ACTIVE », ce qui n'a de sens que pour l'accesseur `war.aiId` (voir
   `_attachWar`). Tout appelant qui sait de quelle nation il parle doit le dire : `_warOther(w, id)`.
   Le défaut est silencieux — on obtient un adversaire plausible, simplement pas le bon. */
function _warOther(w,civId){const p=civId||(G.player&&G.player.civ&&G.player.civ.id);return (w&&w.b===p)?w.a:(w?w.b:null);}
function _warBetween(idA,idB){return (G.wars||[]).find(w=>(w.a===idA&&w.b===idB)||(w.a===idB&&w.b===idA))||null;}
function _warOf(civId){return (G.wars||[]).find(w=>w.a===civId||w.b===civId)||null;} // n'importe quelle guerre impliquant cette nation (autonome, indépendant de G.player)
/* ============================================================ COURTIER DE DÉCISIONS (mode serveur) ============================================================
   En SOLO : _decisionSink reste null → les modales s'affichent normalement (aucun changement).
   En SERVEUR/headless : chaque décision interactive émet un objet « en attente » {id,kind,nation,payload}
   vers le client responsable au lieu d'ouvrir une modale DOM ; la réponse est appliquée via le même handler. */
let _decisionSink=null;       // fonction(pending) installée par le serveur ; null = solo
/* ----------------------------------------------------------------------------
   LE COURTIER DE DÉCISIONS — la continuation est un NOM, plus une fonction
   ----------------------------------------------------------------------------
   C'ÉTAIT LE VERROU. `_pendingDecisions` gardait, pour chaque question posée,
   `{cb, adapt}` — deux FONCTIONS, dans une variable de module. Trois défauts qui
   rendaient toute reprise impossible, quel que soit le reste du travail :
     · une fonction ne se sérialise pas : `test_serialisation.js` restaurait un état
       parfait, puis la partie s'arrêtait sur la première question, sa suite perdue ;
     · le registre vivait HORS de `G`, donc partagé entre toutes les parties d'un
       même processus serveur ;
     · `_pendingSeq` aussi : après une reprise les identifiants repartaient à `d1`
       et se télescopaient avec ceux d'avant — une réponse pouvait déclencher la
       MAUVAISE continuation, en silence. C'est le pire des trois.
   MAINTENANT le registre est `G._flux.decisions` : `id -> {suite, adapt}`, deux
   NOMS résolus dans le registre `ST` au moment de la réponse. Il se sauvegarde
   avec la partie, il appartient à SA partie, et le compteur d'identifiants aussi.

   DETTE ASSUMÉE ET MESURÉE : les flux pas encore migrés passent toujours une
   fonction. On l'accepte — mais on la RANGE À PART (`_suitesVolatiles`) et on la
   compte (`fluxDetteDecisions()`), pour que « ce qui reste à faire » soit un
   chiffre et pas une impression. Après une reprise, une continuation volatile a
   disparu : on lève alors une erreur NOMMANT la question concernée, au lieu de
   s'arrêter sans un mot comme avant.
   -------------------------------------------------------------------------- */
let _suitesVolatiles={};      // id -> {cb, adapt} — uniquement pour les flux pas encore migrés
function _decisionActive(){return typeof _decisionSink==='function';}
function setDecisionSink(fn){_decisionSink=(typeof fn==='function')?fn:null;} // le serveur installe son émetteur ici
function _decisionsRegistre(){ const f=fluxEtatObj(); return (f.decisions||(f.decisions={})); }
/* Émet une décision et enregistre sa suite. nation = objet joueur ou civId (qui doit répondre).
   `cb` et `adapt` acceptent un NOM (chaîne, résolu dans `ST`) — c'est la forme à utiliser — ou
   encore une fonction, pour les flux pas encore migrés. */
function _emitDecision(kind, nation, payload, cb, adapt){
  /* ══════ PENDANT UNE SIMULATION, ON NE POSE AUCUNE QUESTION ══════
     ⚠️ C'EST LA PANNE QUI A ARRÊTÉ LES PARTIES AU TOUR 2, et elle mérite d'être comprise en entier.
     L'identifiant d'une question vient de `f.seqDecision`, qui vit DANS le flux — donc dans `G`,
     donc restauré après une simulation. Mais la continuation d'une question non migrée est rangée
     dans `_suitesVolatiles`, une variable de MODULE que rien ne restaure.
     Conséquence : une simulation qui émettait une question laissait `_suitesVolatiles['d7']`
     derrière elle, le compteur revenait à 6, et la question RÉELLE suivante recevait l'identifiant
     `d7`… puis se résolvait avec la continuation de la simulation. La chaîne de fin de tour partait
     dans une suite fantôme : les revenus tombaient, et plus rien après. Le journal s'arrêtait net
     sur « Revenus nets », sans erreur, sans message.
     Détecter cela « après coup » en comptant les questions ne suffisait pas : le mal était fait à
     l'émission. On refuse donc d'émettre, et on le SIGNALE — `simulerCoup` déclare alors le coup non
     simulable et lui laisse son rang d'utilité. */
  if(G&&G._simulationIA){ G._simuQuestion=true; }
  const f=fluxEtatObj();
  const id='d'+(f.seqDecision=(f.seqDecision||0)+1);
  const nomCb=(typeof cb==='string')?cb:null, nomAd=(typeof adapt==='string')?adapt:null;
  _decisionsRegistre()[id]={suite:nomCb, adapt:nomAd, volatile:!!((cb&&!nomCb)||(adapt&&!nomAd))};
  if(_decisionsRegistre()[id].volatile) _suitesVolatiles[id]={cb:(typeof cb==='function')?cb:null, adapt:(typeof adapt==='function')?adapt:null};
  /* PURGE DES ENTRÉES ORPHELINES. Une question peut être ABANDONNÉE sans réponse (le flux change
     d'avis, une guerre se termine avant qu'on y réponde) : son entrée resterait alors dans le
     registre pour toujours, et le fichier de sauvegarde grossirait à chaque tour. On garde les 50
     dernières — largement au-delà du nombre de questions simultanées possibles. */
  const reg=_decisionsRegistre(), ids=Object.keys(reg);
  if(ids.length>50) for(const vieux of ids.slice(0, ids.length-50)){ delete reg[vieux]; delete _suitesVolatiles[vieux]; }
  /* Simulation : on retient l'identifiant pour purger `_suitesVolatiles` au retour en arrière —
     c'est la seule partie de l'état de décision qui ne vit PAS dans `G` (voir `simulerCoup`). */
  if(G&&G._simulationIA&&_simuIdsCourants)_simuIdsCourants.push(id);
  const pending={id, kind, nation:(nation&&nation.civ?nation.civ.id:(nation||null)), payload:payload||{}};
  _decisionsRegistre()[id].nation=pending.nation;   // QUI doit répondre — on le rend à la suite (voir plus bas)
  _questionsPoser(pending);
  try{ _decisionSink(pending); }catch(e){}
  return id;
}
/* ----------------------------------------------------------------------------
   PLUSIEURS QUESTIONS EN MÊME TEMPS — `G._pendings`
   ----------------------------------------------------------------------------
   AVANT : `G._pending` était UN objet. Le moteur ne pouvait donc porter qu'UNE
   question à la fois, et tout ce qui concerne tout le monde — agenda secret,
   investissements — se jouait en file d'attente : chacun regardait tourner le
   sablier pendant que son voisin choisissait. Marc, 2026-08-07 : « les
   investissements et présentation d'événements et agenda secret n'apparaissent
   pas en même temps à chaque joueur ». C'était exact, et ce n'était pas un
   réglage d'affichage : le moteur ne SAVAIT pas poser deux questions.

   MAINTENANT `G._pendings` est la LISTE des questions ouvertes. `G._pending`
   reste la TÊTE de cette liste : tout le code existant qui teste « y a-t-il une
   question en cours ? » continue de fonctionner sans être touché — il en existe
   une trentaine d'occurrences, et les réécrire aurait été le vrai risque.

   Répondre à une question la retire de la liste ; les autres restent ouvertes.
   La suite d'une question reçoit en second argument la NATION qui a répondu :
   sans cela, avec quatre réponses possibles dans le désordre, une suite ne
   pouvait pas savoir à qui elle avait affaire (elle lisait un curseur unique
   rangé dans les données — exactement ce qui rendait le parallèle impossible).
   -------------------------------------------------------------------------- */
function _questionsListe(){
  if(!G) return [];
  if(!Array.isArray(G._pendings)) G._pendings = G._pending ? [G._pending] : [];
  return G._pendings;
}
function _questionsTete(){ const l=_questionsListe(); G._pending = l.length ? l[0] : null; }
function _questionsPoser(p){ const l=_questionsListe(); l.push(p); _questionsTete(); }
function _questionsRetirer(id){
  const l=_questionsListe(), i=l.findIndex(p=>p&&p.id===id);
  if(i>=0) l.splice(i,1);
  _questionsTete();
}
/* La liste complète, pour le serveur : il doit pouvoir envoyer à CHAQUE joueur SA question. */
function fluxQuestionsEnAttente(){ return _questionsListe().slice(); }
// Le serveur appelle ceci quand le client a répondu.
function resolveDecision(id, answer){
  const reg=_decisionsRegistre(), d=reg[id];
  if(!d)return false;
  delete reg[id];
  const vol=_suitesVolatiles[id]; delete _suitesVolatiles[id];
  _questionsRetirer(id);
  if(d.volatile&&!vol){
    // La partie a été reprise : la continuation était une fonction, elle n'a pas survécu.
    // On le DIT, au lieu de s'arrêter sans un mot — c'était le symptôme historique.
    throw new Error('flux : la suite de la question « '+id+' » a été perdue à la reprise '
      +'(continuation encore sous forme de fonction — flux non migré). Voir docs/LOT17 §16.');
  }
  const adapt = d.adapt ? (a=>fluxAppeler(d.adapt,a)) : (vol&&vol.adapt) || (a=>a);
  /* La réponse porte la NATION qui l'a donnée. Deux chemins, parce que l'adaptateur a le droit de
     rendre autre chose qu'un objet (`adCarteInvestissement` rend une chaîne) : on marque la réponse
     brute AVANT adaptation, et on passe la nation en SECOND ARGUMENT à la suite. Une suite qui s'en
     moque l'ignore ; une suite qui répond à plusieurs joueurs à la fois en a absolument besoin. */
  if(answer && typeof answer==='object' && d.nation) { try{ answer._civ=d.nation; }catch(e){} }
  const arg=adapt(answer);
  if(d.suite) fluxAppeler(d.suite, arg, d.nation||null);
  else if(vol&&typeof vol.cb==='function') vol.cb(arg, d.nation||null);
  return true;
}
function _clearPending(){ const f=fluxEtatObj(); f.decisions={}; _suitesVolatiles={}; if(G){G._pending=null;G._pendings=[];} }
/* Combien de questions en cours reposent encore sur une FONCTION (donc non reprenables).
   C'est la mesure de ce qu'il reste à migrer : l'objectif est zéro. */
/* ⚠️ À APPELER À CHAQUE FOIS QU'ON REMPLACE `G` PAR UN ÉTAT RESTAURÉ.
   `_suitesVolatiles` est la table de côté des continuations encore sous forme de fonction. Elle vit
   HORS de `G` (elle ne peut pas y vivre : ce sont des fonctions). Or, pour charger une partie, le
   serveur démarre d'abord une partie NEUVE — qui pose ses propres questions `d1`, `d2`… — puis
   remplace `G`. Les identifiants de la partie restaurée repartant eux aussi de `d1`, une réponse
   pouvait retrouver la suite de la PARTIE NEUVE et l'exécuter. En silence, et avec le mauvais état.
   C'est le télescopage d'identifiants annoncé dans le bandeau du courtier : il est arrivé. */
function fluxOublierVolatiles(){ _suitesVolatiles={}; }
function fluxDetteDecisions(){
  const reg=_decisionsRegistre();
  return Object.keys(reg).filter(id=>reg[id].volatile).length;
}
// Émet une décision vers un joueur HUMAIN DISTANT (flux pivot en ligne, via online.js). Même contrat que _emitDecision.
// N'est utilisé que pour les nations `_remoteHuman` quand la couche en ligne fournit window._scRemoteDecision (jamais en solo).
/* ⚠️ Cette fonction avait sa PROPRE copie du courtier (`_pendingSeq`, `_pendingDecisions`). En
   migrant le courtier, la copie est restée derrière et a planté au premier bilan de tour :
   « _pendingSeq is not defined ». Elle passe maintenant par la MÊME machinerie — il ne doit
   exister qu'un seul registre de questions en attente, sinon les deux divergent (et l'un des deux
   n'est pas sauvegardé). Seul l'émetteur diffère : le client distant au lieu du serveur. */
function _emitRemote(kind, nation, payload, cb, adapt){
  const vrai=_decisionSink;
  _decisionSink=function(p){ try{ window._scRemoteDecision(p); }catch(e){} };
  try{ return _emitDecision(kind, nation, payload, cb, adapt); }
  finally{ _decisionSink=vrai; }
}
function _isRemote(nat){return !!(nat&&nat._remoteHuman&&typeof window!=='undefined'&&typeof window._scRemoteDecision==='function');}
// ── Pont pour la couche EN LIGNE (online.js) : accès à l'état G depuis l'extérieur du script. ──
function scGetG(){return G;}
function scSetG(v){G=v;}
// ── Sauvegarde locale (reprise après refresh) — partie solo/hôte ──
function scSerialize(){return JSON.stringify(G,function(k,v){if(v instanceof Set)return{__set:[...v]};if(v instanceof Map)return{__map:[...v]};return v;});}
function scDeserialize(s){return JSON.parse(s,function(k,v){if(v&&v.__set)return new Set(v.__set);if(v&&v.__map)return new Map(v.__map);return v;});}
let _scLastSave=0;
function scSaveGame(){try{if(window.SC_TUTO)return;if(!G||!G.player||!G.phase||G.phase==='over')return;const n=Date.now();if(n-_scLastSave<1500)return;_scLastSave=n;localStorage.setItem('sc_save',scSerialize());}catch(e){}}
function scClearSave(){try{localStorage.removeItem('sc_save');}catch(e){}}
function scAbandonGame(){
  if(!confirm('Abandonner la partie en cours et revenir à l\'écran d\'accueil ? Cette partie sera définitivement perdue.'))return;
  scClearSave();
  try{if(typeof G==='object'&&G)G.phase='over';}catch(e){}
  location.reload();
}
function scResumeGame(){try{
  const s=localStorage.getItem('sc_save');if(!s)return false;
  const g=scDeserialize(s);if(!g||!g.player)return false;
  scSetG(g);if(typeof rehydrateState==='function')rehydrateState(g);if(typeof refreshWarViews==='function')refreshWarViews();
  const cs=document.getElementById('civ-sel');if(cs)cs.classList.add('hidden');
  const ov=document.getElementById('sc-ov');if(ov)ov.style.display='none';
  ['top-bar','game-wrap','action-bar','bottom-bar'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='flex';});
  try{if(window.initTechResize)initTechResize();}catch(e){}
  try{if(window.installBackGuard)installBackGuard();}catch(e){}
  if(typeof render==='function')render();
  const rb=document.getElementById('sc-resume-btn');if(rb)rb.remove();
  // Relancer la boucle d'entrelacement si la sauvegarde a été prise pendant les tours des IA (sinon la partie reste figée après reprise)
  try{ if(G&&G._il){ G._ilPaused=false; if(!G._humanActive && !G._pending && typeof interleaveStep==='function') setTimeout(interleaveStep,400); } }catch(e){}
  return true;
}catch(e){console.error('[SC] resume:',e);return false;}}
// Définit la nation « humain local » (G.player) par son id, le reste en G.ais. Utilisé en ligne après adoption d'un état.
function scSetLocalHuman(civId){ const all=[G.player,...G.ais]; const me=all.find(p=>p&&p.civ&&p.civ.id===civId); if(me){ G.player=me; G.ais=all.filter(p=>p!==me); if(typeof refreshWarViews==='function')refreshWarViews(); } }
// Reprend l'interleave (hôte) après le tour d'un joueur distant.
function scResumeInterleave(){ if(!G)return; G._ilPaused=false; if(typeof interleaveStep==='function')interleaveStep(); }
function scAdvanceIl(){ if(G)G._ilIdx=(G._ilIdx||0)+1; }
// Réhydrate un état G désérialisé (reçu du serveur) : re-relie civ/agenda/cartes + reconstruit Map/Set, pour le RENDU côté invité.
function rehydrateState(g){
  if(!g)return;
  const fixP=(p)=>{ if(!p)return;
    if(p.civ&&p.civ.id&&CIVS[p.civ.id])p.civ=CIVS[p.civ.id];
    if(p.agenda&&p.agenda.id){const a=AGENDAS_POOL.find(x=>x.id===p.agenda.id);if(a)p.agenda=a;}
    if(Array.isArray(p.cards))p.cards=p.cards.map(c=>{const f=CARDS_POOL.find(x=>x.id===c.id);return f?Object.assign({},f,c):c;});
    if(!(p.recentLosses instanceof Map))p.recentLosses=new Map(Array.isArray(p.recentLosses)?p.recentLosses:[]);
    if(!(p._milBoughtThisTurn instanceof Set))p._milBoughtThisTurn=new Set(Array.isArray(p._milBoughtThisTurn)?p._milBoughtThisTurn:[]);
  };
  fixP(g.player);(g.ais||[]).forEach(fixP);
  // Re-lier l'ordre d'initiative (et le raccourci player) aux objets CANONIQUES : la désérialisation JSON
  // duplique les objets, donc G._order contenait des copies ≠ G.player/G.ais → ta nation était jouée comme une IA
  // et la manche ne se terminait jamais (le tour restait bloqué après une reprise). On remappe par civ.id.
  if(Array.isArray(g._order)){
    const _all=[g.player].concat(g.ais||[]);
    g._order=g._order.map(function(o){const id=o&&o.civ&&o.civ.id;return _all.find(function(n){return n&&n.civ&&n.civ.id===id;})||o;}).filter(Boolean);
  }
  fluxOublierVolatiles(); // voir le bandeau : sinon une réponse peut exécuter la suite d'une AUTRE partie
  g.events=EVENTS;
  if(g.eventSchedule){const _ef=function(tn){const id=g.eventSchedule[tn];return id?(EVENTS.find(function(e){return e.id===id;})||null):null;};g.curEvent=_ef(g.turn);g.nextEvent=_ef(g.turn+1);}
}
// Modale d'INFORMATION (résultat de combat, fin de tour, événement…) : émet une 'notice' non bloquante.
// La continuation (souvent posée APRÈS l'appel, ex. _warModalCb) est lue au moment de la réponse via contFn.
function _emitNotice(kind, nation, payload, contFn){
  // `contFn` accepte un NOM (forme migrée) ou encore une fonction (flux pas encore migrés).
  const id=_emitDecision(kind, nation, payload, contFn || 'stRien', null);
  // info non bloquante : le driver l'acquitte automatiquement. On marque LA question concernée dans
  // la liste — pas « la tête », qui peut être celle d'un autre joueur depuis que plusieurs questions
  // coexistent (on aurait alors marqué comme « simple info » la vraie décision de quelqu'un d'autre).
  const q=_questionsListe().find(p=>p&&p.id===id); if(q) q.notice=true;
  return id;
}
function _attachWar(w){
  if(!w)return w; if(!w.winsBy)w.winsBy={};
  Object.defineProperty(w,'aiId',{get(){return _warOther(w);},configurable:true,enumerable:false});
  const wins={};
  Object.defineProperty(wins,'player',{enumerable:true,configurable:true,get(){const p=(G.player&&G.player.civ&&G.player.civ.id);return w.winsBy[p]||0;},set(v){const p=(G.player&&G.player.civ&&G.player.civ.id);w.winsBy[p]=v;}});
  Object.defineProperty(wins,'ai',{enumerable:true,configurable:true,get(){return w.winsBy[_warOther(w)]||0;},set(v){w.winsBy[_warOther(w)]=v;}});
  Object.defineProperty(w,'wins',{value:wins,writable:true,configurable:true,enumerable:false});
  return w;
}
function refreshWarViews(){if(G&&G.wars)for(const w of G.wars)_attachWar(w);}
/* ⚠️ « SUIS-JE EN GUERRE ? » — LA RÉPONSE DÉPEND DE QUI DEMANDE.
   Cette fonction lisait `G.wars[0]` sans regarder QUI se bat. À deux joueurs, la seule guerre
   possible impliquait forcément le joueur, et personne ne l'a vu. À QUATRE, une guerre entre les
   martiens et les jupitériens rendait `warState = actif` et `warWith = jupitériens` pour les
   terriens, spectateurs : ils héritaient d'une guerre qui n'était pas la leur, avec ses combats,
   ses coûts et sa tension à 10. (`w.aiId` est un accesseur qui rend « l'autre camp par rapport à
   G.player » : sur une guerre où G.player n'est PAS partie prenante, il rend n'importe lequel des
   deux belligérants — d'où l'ennemi inventé.)
   On ne retient donc que les guerres où la nation courante figure vraiment. */
function syncWarState(){
  const _moi=(G.player&&G.player.civ&&G.player.civ.id)||null;
  const _miennes=(G.wars||[]).filter(w=>w&&(w.a===_moi||w.b===_moi));
  G.warState=_miennes.length?'active':null;
  G.warWith=_miennes[0]?_miennes[0].aiId:null;
  G.warTurnsLeft=_miennes[0]?_miennes[0].turnsLeft:0;
  G.warWins=_miennes[0]?_miennes[0].wins:{player:0,ai:0};
}
/* Les guerres où CETTE nation est engagée — à utiliser partout où l'on écrivait
   `_warBetween(_moiId(),x)`, qui pouvait attraper la guerre de deux autres. */
/* Retirer une guerre : par le COUPLE, jamais par `aiId` (qui dépend de la perspective et pouvait
   supprimer la guerre de deux AUTRES nations). */
function _warIndexBetween(idA,idB){ return (G.wars||[]).findIndex(w=>w&&((w.a===idA&&w.b===idB)||(w.a===idB&&w.b===idA))); }
function _moiId(){ return (G.player&&G.player.civ&&G.player.civ.id)||null; }
/* ═══════ DEUX QUESTIONS QUI SE RESSEMBLENT ET QUI N'ONT RIEN À VOIR ═══════
   `_moiId()` répond « quelle nation la règle est-elle en train de traiter ? ». C'est la question
   piégée : à quatre joueurs, la réponse dépend de qui a la main, donc toute RÈGLE qui la pose est
   suspecte, et nos bancs la signalent.
   `_civLocale()` répond « quelle nation est assise devant CET écran ? ». Elle ne décide d'aucune
   règle : elle sert à savoir s'il faut ouvrir une fenêtre ici ou l'envoyer sur le réseau, et à
   tutoyer la bonne personne dans le journal. Elle est légitime partout et le restera.
   Les deux rendent la même valeur aujourd'hui. Elles cesseront de le faire le jour où le moteur
   résoudra le tour d'un autre joueur — c'est exactement pour ce jour-là qu'on les sépare
   maintenant, pendant qu'on peut encore dire laquelle chaque ligne voulait dire. */
function _civLocale(){ return (G.player&&G.player.civ&&G.player.civ.id)||null; }
/* ═══════ LE BONUS DE COMBAT D'UNE NATION, LU SUR SES CARTES ═══════
   Marc, 2026-08-09 : « ma consigne est claire depuis le début, pas de loose end. »

   AVANT. Lien Empathe et Télépathie déclarent chacune `combatBonus:2`. `applyCard` rangeait
   cette valeur dans `p.combatBonus`… que RIEN ne lisait, et que le début de tour remettait à
   zéro. Le +2 fonctionnait quand même, mais par un autre chemin : ONZE copies de
   `bonusCombatCartes(p)`, écrites à la main dans les
   calculs de puissance, les estimations et l'affichage.
   Conséquences : le chiffre 2 vivait à onze endroits (le changer voulait dire les trouver tous),
   et une carte future portant `combatBonus` sans ligne dédiée n'aurait rien fait, en silence.

   MAINTENANT. Une seule fonction, qui additionne ce que les CARTES déclarent. Le champ
   `combatBonus` redevient la source de vérité, comme `forceBonus` ou `warForce` le sont déjà.
   Les copies d'espionnage portent le champ : elles donnent donc le bonus, comme avant. */
function bonusCombatCartes(p){
  if(!p||!p.cards)return 0;
  let t=0; for(const c of p.cards) t+=(c&&c.combatBonus)||0;
  return t;
}
/* Cette nation est-elle en guerre ? À ne PAS confondre avec `G.warState`, qui ne dit que
   « la nation actuellement active est-elle en guerre » — donc dépend du point de vue. */
function estEnGuerre(p){
  const id=(p&&p.civ&&p.civ.id)||null;
  return !!id && (G.wars||[]).some(w=>w&&(w.a===id||w.b===id));
}
function mesGuerres(civId){
  const id=civId||((G.player&&G.player.civ&&G.player.civ.id)||null);
  return (G.wars||[]).filter(w=>w&&(w.a===id||w.b===id));
}
/* ⚠️ « OwnerAI » EST UN NOM MENSONGER, ET LE DÉFAUT ÉTAIT DANS LE NOM. Cette fonction ne cherchait
   le propriétaire d'un nœud QUE parmi `G.ais` : la colonie d'un autre HUMAIN n'avait donc, aux yeux
   du jeu, aucun propriétaire. Conséquence vécue par Marc (2026-08-12) : on proposait un accord
   commercial sur la colonie d'un joueur, personne ne lui demandait rien, et il ne pouvait pas
   cliquer sur « accepter » — l'accord se concluait tout seul.
   `ownerNation` cherche parmi TOUTES les nations. `getNodeOwnerAI` reste, mais ne renvoie plus que
   les IA, pour les rares endroits qui veulent vraiment « une IA » (l'ancien nom, l'ancien sens). */
function ownerNation(nodeId){ return allPlayers().find(n=>n&&n.colonies&&n.colonies.some(c=>c.nodeId===nodeId))||null; }
function getNodeOwnerAI(nodeId){const o=ownerNation(nodeId);return (o&&o._isAI!==false)?o:null;}

/* ══════════ COHABITATION SUR UN NŒUD (Exploration Extra-Solaire) ══════════
   `Exploration Extra-Solaire` est le SEUL moyen d'avoir deux nations sur le même nœud. Tout le
   reste du moteur a été écrit en supposant « un nœud = un propriétaire », et cela se voyait :

     · un cohabitant qui attaquait son propre nœud ne déclenchait RIEN — `getNodeOwnerAI` tombait
       sur l'attaquant lui-même, la fonction sortait en silence, sans message ni AC dépensé ;
     · une tierce nation attaquait le PREMIER occupant de la liste interne, pas le vrai maître des
       lieux, et l'autre restait sur place après la « capture » ;
     · le chemin de l'IA n'avait aucun garde-fou : une IA cohabitante qui gagnait se retrouvait avec
       DEUX colonies sur le même nœud, comptées deux fois en points de victoire.

   RÈGLES DÉCIDÉES PAR MARC (2026-08-14) :
     1. un cohabitant PEUT chasser l'autre. Le vainqueur reste seul : sa colonie prend le niveau de
        la colonie conquise (−1, comme toute capture), perd l'interdiction d'améliorer et l'accord
        commercial forcé disparaît — il n'a plus d'objet, il n'y a plus personne avec qui cohabiter ;
     2. face à une TIERCE nation, les occupants défendent ENSEMBLE. On attaque un lieu, pas une
        nation. Si l'assaillant l'emporte, il les expulse tous les deux et prend le nœud.
   ═══════════════════════════════════════════════════════════════════════ */
/* ══════════ QUI A SIGNÉ QUOI ══════════
   ⚠️ `G.commercialAccords` n'est qu'une liste de NŒUDS : elle ne dit pas qui a signé avec qui.
   Le calcul des revenus faisait donc `gains += G.commercialAccords.length` pour CHAQUE nation —
   autrement dit, chaque accord de la partie enrichissait TOUT LE MONDE, y compris les nations qui
   n'avaient rien signé. Mesuré le 2026-08-14 : deux accords entre Terriens et Martiens rapportaient
   +2🪨 +2🙂/tour au Jupitérien, resté à l'écart. Vestige du solo, où le seul signataire possible
   était le joueur.
   On tient donc un registre des DEUX signataires par nœud. La liste de nœuds reste inchangée : ses
   vingt autres lecteurs (carte, routes, colonisation, révocation…) n'ont pas à savoir tout cela. */
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CE QU'UNE FORME DE GOUVERNEMENT COÛTE EN MORAL — LA PART QUE L'IA NE VOYAIT PAS
   ----------------------------------------------------------------------------------------------
   ⚠️ PARTIE 8B47, 27/08 : DEUX IA SUR DEUX SE SONT SABORDÉES AVEC LA TYRANNIE. Les Jupitériens
   l'ont adoptée au TOUR 1, les Ceinturiens au tour 5, toutes deux pour le +1 AC. Aucune ne savait
   que la Tyrannie **plafonne leur moral à 6** : manifestations dès le tour 2, guerre civile au tour
   7 pour les Ceinturiens — dont ils ne sont jamais ressortis —, et 31 VP pour les Jupitériens avec
   une seule colonie à l'arrivée.

   LA CAUSE. `tryCivic` et `_civicUtil` évaluaient une forme par `formPts + acBonus×6`. Ni le malus
   ponctuel (`adoptMorale`) ni le plafond (`moraleCap`) n'entraient dans le calcul. L'IA voyait un
   cadeau là où il y avait un marché.

   ⚠️ UNE SEULE FONCTION POUR DEUX APPELANTS. `tryCivic` DÉCIDE et `_civicUtil` NOTE : deux copies du
   même barème finiraient par diverger, et l'IA choisirait une chose après en avoir noté une autre.

   ⚠️ MON PREMIER BARÈME ÉTAIT TROP DUR, et seule la mesure l'a montré. Avec une pénalité de 12 pour
   une nation fragile et 0,8 par point de plafond, la Tyrannie n'était plus JAMAIS adoptée (0 sur 24
   nations) et le VP médian tombait de 47 à 37 : le +1 AC valait bel et bien son prix, et je venais
   de l'interdire. Le barème ci-dessous garde la Tyrannie attractive pour une nation en bonne santé
   et la rend prohibitive pour une nation déjà fragile — ce qui est exactement la décision qu'un
   joueur prendrait.

   L'unité est celle de `val` : 1 point de gouvernement = 1, une AC permanente = 6.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function coutMoralForme(nat,f){
  if(!nat||!f||!f.govForm)return 0;
  const gf=f.govForm;
  const moral=nat.res.morale||0;
  let c=(gf.adoptMorale||0)*1.5;          // le malus d'adoption se paie une fois
  const cap=gf.moraleCap||0;
  if(cap>0){
    const apres=Math.max(0,moral-(gf.adoptMorale||0));
    if(apres>cap)c+=(apres-cap);          // ce qui sera écrêté dès la fin du tour
    c+=(10-cap)*0.3;                      // marge de sécurité perdue pour le reste de la partie
    /* En guerre ou à moral bas, le plafond cesse d'être un coût : il devient un risque de guerre
       civile, dont on ne ressort pas (plus de revenu → plus de quoi remonter le moral). */
    if((typeof estEnGuerre==='function'&&estEnGuerre(nat))||apres<=4)c+=6;
  }
  return c;
}
function _accordEnregistrer(nodeId,a,b){
  if(!nodeId)return null;
  /* ══════ UN SEUL ACCORD PAR COUPLE — ET LA GARDE EST ICI, PAS CHEZ LES APPELANTS ══════
     ⚠️ CE DÉFAUT A ÉTÉ « CORRIGÉ » UNE PREMIÈRE FOIS LE 26/08, ET IL EST REVENU. Marc, partie 792D :
     l'accord commercial avait été signé deux fois entre les mêmes nations. J'avais ajouté la garde
     dans `_evAccordConclude` — le chemin du SOMMET — et considéré l'affaire close. Le banc
     `test_pacte_et_accords.js` ne testait que ce chemin-là : il est resté vert, et le défaut a
     survécu partout ailleurs.

     Or un accord n'est pas enregistré entre deux NATIONS mais sur un NŒUD, et quatre fonctions en
     créent. Signer avec le même voisin sur trois de ses colonies donnait trois accords, donc
     +3🪨 +3🙂 par tour. Mesuré le 27/08 : Terriens et Ceinturiens en avaient deux (Cérès et Vesta),
     et les Jupitériens en cumulaient cinq à quatre nations — ce que Marc a repéré d'un coup d'œil
     dans le relevé du moral (« tu m'expliques accords commerciaux ×5 à 4 nations ? »).

     LA LEÇON : garder une règle chez ses APPELANTS, c'est la réécrire autant de fois qu'il y a
     d'appelants, et l'oublier une fois de trop. `_accordEnregistrer` est le seul passage obligé ;
     la règle vit ici. Un chemin ajouté demain en héritera sans rien avoir à savoir.

     On rend le nœud de l'accord existant : l'appelant qui veut prévenir son joueur peut le nommer. */
  if(a&&b&&typeof accordEntre==='function'){
    const deja=accordEntre(a,b);
    if(deja)return deja;
  }
  if(!G.commercialAccords.includes(nodeId))G.commercialAccords.push(nodeId);
  G.accordsParties=G.accordsParties||{};
  G.accordsParties[nodeId]=[a&&a.civ?a.civ.id:a, b&&b.civ?b.civ.id:b].filter(Boolean);
  return nodeId;
}
function _accordSignataires(nodeId){ return (G.accordsParties&&G.accordsParties[nodeId])||null; }
/* ═══════ « AI-JE UN ACCORD ICI ? » — LA QUESTION QUE PERSONNE NE POSAIT ═══════
   `G.commercialAccords` est une liste de NŒUDS : elle dit qu'un accord existe quelque part, jamais
   avec qui. Le registre des signataires existe depuis le 14/08, mais il n'avait été branché que sur
   le calcul des revenus — partout ailleurs on continuait de lire la liste brute.

   CE QUE ÇA DONNAIT (partie FDDD de Marc, 23/08). Au tour 8, un accord Martiens ↔ Jupitériens se
   pose sur Titan, colonie jovienne. Au tour 10, Marc ouvre Titan et lit « 🤝 Accord actif » avec le
   bouton « Rompre l'accord & Attaquer » — pour un contrat entre deux AUTRES nations, qu'il n'a
   jamais signé et qui ne l'engage à rien. Son commentaire : « j'ai validé aucun accord ».
   Sept endroits posaient la question de cette façon : la fenêtre de nœud, la carte, le choix de
   cible des IA, deux parcours de colonisation, le calcul de tension et la connexion des colonies.

   ⚠️ REPLI POUR LES VIEILLES PARTIES. Une sauvegarde d'avant le registre n'a pas de signataires. Le
   seul couple possible y était « le propriétaire du nœud » et « le joueur local » — le solo ne
   connaissait pas d'autre accord. On accorde donc le bénéfice du doute à ces deux-là, et à personne
   d'autre : mieux vaut un ancien accord reconnu à tort qu'une partie sauvegardée devenue illisible. */
function accordAvecMoi(nodeId,nat){
  if(!nodeId||!nat||!(G.commercialAccords||[]).includes(nodeId))return false;
  const id=nat.civ?nat.civ.id:nat;
  const s=_accordSignataires(nodeId);
  if(s)return s.includes(id);
  const o=(typeof ownerNation==='function')?ownerNation(nodeId):null;   // partie d'avant le registre
  return !!(o&&o.civ.id===id)||id===_moiId();
}
/* L'accord de ce nœud lie-t-il PRÉCISÉMENT ces deux nations ? */
function accordConcerne(nodeId,a,b){
  if(!nodeId||!a||!b||!(G.commercialAccords||[]).includes(nodeId))return false;
  const ida=a.civ?a.civ.id:a, idb=b.civ?b.civ.id:b;
  const s=_accordSignataires(nodeId);
  if(s)return s.includes(ida)&&s.includes(idb);
  const o=(typeof ownerNation==='function')?ownerNation(nodeId):null;
  return !!(o&&(o.civ.id===ida||o.civ.id===idb));
}
/* Les accords auxquels CETTE nation est partie. Un accord sans signataires connus (partie
   enregistrée avant ce changement) est attribué au propriétaire du nœud, faute de mieux. */
function accordsDe(nat){
  if(!nat)return [];
  return (G.commercialAccords||[]).filter(function(nid){
    const s=_accordSignataires(nid);
    if(s)return s.includes(nat.civ.id);
    const o=ownerNation(nid); return !!(o&&o.civ.id===nat.civ.id);
  });
}
function occupantsDuNoeud(nodeId){
  return allPlayers().filter(n=>n&&n.colonies&&n.colonies.some(c=>c.nodeId===nodeId));
}
function estNoeudPartage(nodeId){ return occupantsDuNoeud(nodeId).length>1; }
/* Tous ceux qui défendent ce nœud contre `attaquant` — un seul en temps normal, deux en cohabitation. */
function defenseursDuNoeud(nodeId, attaquant){
  return occupantsDuNoeud(nodeId).filter(n=>n!==attaquant);
}
/* Le défenseur PRINCIPAL : celui contre qui la guerre se déclare. On prend le plus développé sur ce
   nœud — pas le premier venu de l'ordre interne, qui n'a aucun sens de jeu. */
function defenseurPrincipal(nodeId, attaquant){
  const d=defenseursDuNoeud(nodeId, attaquant);
  if(!d.length) return null;
  const niv=n=>Math.max.apply(null,n.colonies.filter(c=>c.nodeId===nodeId).map(c=>c.level||1));
  return d.slice().sort((a,b)=>niv(b)-niv(a))[0];
}
/* LA CAPTURE, ÉCRITE UNE SEULE FOIS. Le joueur et l'IA avaient chacun leur copie ; l'une avait un
   garde-fou contre la double colonie, l'autre non. Deux copies d'un même calcul, c'est une de trop
   (voir docs/ARCHITECTURE_AVENIR.md). Rend le niveau obtenu.
   `vainqueur` prend le nœud ; TOUS les autres occupants en sont expulsés. */
function capturerNoeud(vainqueur, nodeId){
  /* Perdre une colonie fait basculer les expulsés en état de siège : ils riposteront. */
  if(typeof marquerAgressee==='function')
    for(const _v of (typeof occupantsDuNoeud==='function'?occupantsDuNoeud(nodeId):[]))
      if(_v!==vainqueur) marquerAgressee(_v);
  if(!vainqueur||!nodeId) return 0;
  const nom=(NODES[nodeId]&&NODES[nodeId].name)||nodeId;
  let meilleur=0, expulses=0;
  for(const perdant of occupantsDuNoeud(nodeId)){
    if(perdant===vainqueur) continue;
    const col=perdant.colonies.filter(c=>c.nodeId===nodeId);
    for(const c of col) meilleur=Math.max(meilleur, c.level||1);
    perdant.colonies=perdant.colonies.filter(c=>c.nodeId!==nodeId);
    if(typeof updateConnections==='function')updateConnections(perdant);
    perdant.res.morale=Math.max(0,(perdant.res.morale||0)-1);
    expulses++;
    if(expulses>1) addLog('🏴 '+perdant.civ.emoji+' '+perdant.civ.name+' est AUSSI chassé de '+nom
      +' — les cohabitants tombent ensemble.','red');
  }
  const nouveau=Math.max(1, meilleur-1);   // toute capture endommage la colonie d'un niveau
  const sienne=vainqueur.colonies.find(c=>c.nodeId===nodeId);
  const conn=(typeof checkConnected==='function')?checkConnected(nodeId,vainqueur):true;
  if(sienne){
    /* ⚠️ LE VAINQUEUR COHABITANT ÉTAIT PUNI. Le chemin du joueur refusait d'ajouter une colonie
       s'il en avait déjà une ici : il détruisait donc une colonie de Nv.3 et restait bloqué à Nv.1,
       avec l'interdiction d'améliorer — alors qu'il n'y a plus personne avec qui cohabiter.
       Le chemin de l'IA, lui, en ajoutait une SECONDE sur le même nœud. On garde la meilleure des
       deux valeurs et on lève le bridage. */
    sienne.level=Math.max(sienne.level||1, nouveau);
    delete sienne.noUpgrade;
    sienne.connected=conn;
  }else{
    vainqueur.colonies.push({nodeId:nodeId, level:nouveau, connected:conn, _conquest:3});
  }
  if(typeof updateConnections==='function')updateConnections(vainqueur);
  /* ⚠️ CE MESSAGE ANNONÇAIT TOUJOURS UN « ACCORD FORCÉ », ET C'ÉTAIT FAUX NEUF FOIS SUR DIX.
     Il n'avait été écrit que pour la cohabitation extra-solaire — le seul cas où un accord est
     effectivement imposé. Mais ce bloc tombe sur TOUT accord posé sur le nœud capturé, y compris un
     accord librement signé entre deux autres nations. Marc, partie FDDD : « 📜 Titan : l'accord
     forcé tombe avec la cohabitation » alors qu'il s'agissait d'un pacte Martiens ↔ Jupitériens,
     signé au sommet commercial deux tours plus tôt.
     Le nœud change de maître : l'accord qui y était attaché tombe, c'est juste — mais on dit
     désormais LEQUEL et POURQUOI, au lieu d'invoquer une règle qui n'a rien à voir. */
  if(!estNoeudPartage(nodeId) && G.commercialAccords.includes(nodeId)){
    const _sg=(typeof _accordSignataires==='function')?_accordSignataires(nodeId):null;
    const _noms=(_sg||[]).map(function(cid){ const n=allPlayers().find(function(x){return x.civ.id===cid;}); return n?(n.civ.emoji+' '+n.civ.name):cid; });
    const _force=(typeof estNoeudPartage==='function')&&sienne&&sienne.noUpgrade;
    G.commercialAccords=G.commercialAccords.filter(n=>n!==nodeId);
    if(G.accordsParties)delete G.accordsParties[nodeId];
    addLog('📜 '+nom+' change de maître — l\'accord commercial'
      +(_noms.length===2?(' entre '+_noms[0]+' et '+_noms[1]):(_force?' forcé':''))+' qui s\'y rattachait tombe.','dim');
  }
  return nouveau;
}
/* Une nation accepte-t-elle un accord commercial ? Règle unique, humains comme IA — c'est ce qui
   permet de DEMANDER à une IA au lieu de décider à sa place, et de lui laisser refuser.
   Elle refuse si : guerre en cours, tension trop forte, ou si le proposant est déjà loin devant
   et qu'elle-même se porte bien (elle n'a alors aucun intérêt à le renforcer). */
function accordAcceptable(nat, proposant){
  if(!nat||!proposant) return {ok:false, raison:'nation inconnue'};
  if(_warBetween(nat.civ.id, proposant.civ.id)) return {ok:false, raison:'vous êtes en guerre'};
  /* La garde de `_accordEnregistrer` empêcherait le doublon de toute façon — mais en silence, APRÈS
     que le proposant a dépensé 1 AC et donné 2🪨. Refuser ici, c'est refuser avant de faire payer,
     et pouvoir dire pourquoi. Les deux gardes ne font pas double emploi : celle-ci protège le
     joueur, celle-là protège la règle. */
  if(typeof accordEntre==='function'&&accordEntre(nat,proposant))
    return {ok:false, raison:'un accord vous lie déjà — il n\'en existe qu\'un par couple de nations'};
  const tension=tensEff(nat.civ.id, proposant.civ.id);
  if(tension>=7) return {ok:false, raison:'tensions trop élevées ('+tension+'/10)'};
  try{
    const mien=calcVP(nat).total, sien=calcVP(proposant).total;
    const enForme=(nat.res.morale||0)>=4 && nat.colonies.length>=3;
    if(sien>mien+15 && enForme) return {ok:false, raison:'tu es déjà trop en avance ('+sien+' VP contre '+mien+')'};
  }catch(e){}
  return {ok:true, raison:''};
}
function recomputeGov(p){
  const prev=p.gov_level;
  p.gov_pts=(p.govPermPts||0)+(p.govFormPts||0);
  p.gov_level=p.gov_pts>=15?4:p.gov_pts>=10?3:p.gov_pts>=5?2:1;
  /* ⚠️ CE MESSAGE ANNONÇAIT LE NIVEAU À LA PLACE DES AC. « Gouvernement niveau 4 ! (→4 AC) » alors
     que `calcAC` rend `gov_level + 1`, soit 5. Le calcul était juste, l'annonce fausse — le pire cas
     pour qui essaie de comprendre son propre tableau de bord, et de quoi faire douter des règles
     écrites, elles, correctement. Trouvé en relisant regles.html avec Marc (26/08). */
  if(p.gov_level>prev&&p===G.player)addLog('🏛️ Gouvernement niveau '+p.gov_level+' ! (→'
    +(typeof calcAC==='function'?calcAC(p):(p.gov_level+1))+' AC de base par tour)','gold');
}
function addGovPts(p,pts){
  // points de gouvernement PERMANENTS (techs, capacités) — distincts de la contribution de la forme
  p.govPermPts=(p.govPermPts||0)+pts;
  recomputeGov(p);
}
// Adopter une FORME de gouvernement (une seule à la fois ; remplace la précédente, dont la contribution est perdue)
function adoptGovForm(p,card){
  const f=card.govForm||{};
  p.govForm=card.id;
  p.govFormPts=f.formPts||0;
  p.govFormAC=f.acBonus||0;            // Tyrannie : +1 AC/tour sans monter le niveau
  p.govFormMorale=f.moralePerTurn||0;  // Démocratie : +1<i class=ri-morale></i>/tour
  p.govFormUpkeep=f.upkeep||null;      // Démocratie : entretien −1<i class=ri-materials></i> −1<i class=ri-energy></i>/tour
  /* ⚠️ PLAFOND DE MORAL PROPRE À LA FORME (Tyrannie 6, Corporations 7). Il ne coupe RIEN au moment
     de l'adoption : c'est `enforceCaps()` qui écrête, au même instant que le plafond ordinaire de 10.
     Adopter la Tyrannie à 9❤️ te laisse donc à 7 jusqu'à la fin du tour, puis te ramène à 6 — le
     joueur voit la redescente se produire là où il a l'habitude de la voir. Et comme le plafond est
     porté par la FORME et non par la nation, en changer le lève aussitôt. */
  p.govFormMoraleCap=f.moraleCap||0;
  if(f.adoptMorale)p.res.morale=Math.max(0,(p.res.morale||0)-f.adoptMorale); // malus ponctuel (non rendu si on rechange)
  recomputeGov(p);
  if(p===G.player)addLog('🏛️ Forme de gouvernement : '+card.emoji+' '+card.name,'gold');
}
function calcAC(p){
  let base=p.gov_level+1;
  if(p.govFormAC)base+=p.govFormAC; // Tyrannie : +1 AC/tour (sans monter le niveau)
  if(hasSpec(p,'morale_ac')&&(p.res.morale||0)>=7)base++;
  if(p.stratBonus&&p.stratBonus.acBonus)base+=p.stratBonus.acBonus;
  // Moral=0 → guerre civile (pas de revenus) mais les AC ne sont pas affectés
  return base;
}
function hasSpec(p,s){return p.cards.some(c=>c.spec===s||c.spec2===s);}
/* POURQUOI cette techno est-elle inaccessible ? Le jeu connaît trois raisons bien distinctes ;
   les confondre dans un même grisage muet n'aidait personne (retour de Marc). Texte court, destiné
   à la carte REPLIÉE — le détail complet reste sur la grande carte. */
function techLockReason(card,p){
  const pp=p||G.player;
  if(!card||!card.branch)return null;
  if(card.branch==='empathes'&&typeof isEmpathesAvailableFor==='function'&&!isEmpathesAvailableFor(pp))
    return 'réservée aux Empathes';
  if(card.tier>((G.branchTiers&&G.branchTiers[card.branch])||0)+1)
    return 'palier T'+card.tier+' pas encore ouvert';
  if(card.tier===3&&!pp.cards.some(function(c){return c.branch===card.branch&&c.tier===2;}))
    return 'il te faut TA T2 de cette branche';
  return null;
}
function isTechAvailable(card,p){
  if(!card.branch)return true;
  if(card.tier>(G.branchTiers[card.branch]||0)+1)return false;
  if(card.branch==='empathes'&&!isEmpathesAvailableFor(p||G.player))return false;
  if(card.tier===3){
    const pp=p||G.player;
    return pp.cards.some(c=>c.branch===card.branch&&c.tier===2);
  }
  return true;
}
/* ═══════ CE QUI EST EXCLUSIF À UNE SEULE NATION DANS TOUTE LA PARTIE ═══════
   Une seule famille l'est : les technologies de BRANCHE de rang 3. La première nation qui en prend
   une la ferme aux autres — c'est la règle qui fait de l'arbre technologique une course.

   ⚠️ LE COMMENTAIRE D'ORIGINE DISAIT « Militaires = répétables », ET C'ÉTAIT VRAI QUAND IL A ÉTÉ
   ÉCRIT. Le Supercroiseur est ensuite passé en `repeatable:false` : il tombait alors dans le
   `return !card.branch || card.tier>=3` — vrai, puisqu'il n'a pas de branche — et devenait exclusif
   à toute la partie. Marc, partie 140A du 23/08 : « Supercroiseur est limité à un joueur, ça ne
   devrait pas être le cas. » Le premier acheteur le rendait introuvable pour la table entière, avec
   le message « déjà prise par une autre faction ».
   Le militaire se limite par la POSSESSION, jamais globalement : chacun peut l'acheter une fois
   (contrôle dans le chemin d'achat), personne n'en prive les autres. */
/* ⚠️ CE TEST COMPARAIT À UNE VALEUR QUI N'EXISTE PAS. `type==='civique'` : aucune carte du jeu ne
   porte ce type — les types réels sont `colonization`, `technology`, `government`, `economic` et
   `militaire`. La branche « civique » était donc morte depuis toujours, et les cartes de
   GOUVERNEMENT étaient traitées comme exclusives alors que la ligne voulait précisément les
   exempter. Trouvé en relisant la partie 792D avec Marc.
   ⚠️ Un test qui ne peut jamais être vrai ne se voit pas : il ne casse rien, il applique
   silencieusement la mauvaise règle. Chercher les valeurs comparées dans les DONNÉES, pas dans le
   souvenir qu'on en a. */
function isTechExclusive(card){
  if(card.repeatable) return false;
  /* ⚠️ CORRECTION DE MA PROPRE CORRECTION (26/08). En remplaçant le `'civique'` mort par
     `'government'`, j'ai exempté trois VRAIES technologies de la branche Spiritualité — dont
     🕊️ Éveil Collectif, de rang 3, qui perdait ainsi son exclusivité. Les cartes de type
     `government` du pool ne sont pas des cartes civiques : ce sont des technologies comme les
     autres, et le rang 3 doit rester réservé à son premier acheteur.
     Seules les cartes MILITAIRES sont hors de ce régime : chacun peut acheter le Supercroiseur.
     `test_regles.js` a attrapé l'écart en comptant 6 T3 exclusives sur 7. */
  if(card.type==='militaire'||card.type==='military') return false;
  return !card.branch||card.tier>=3;
}
function getEffCost(card,p){
  const c={...card.cost};
  if(p.civ.id==='martiens'){
    if((card.type==='military'||card.type==='militaire')&&c.energy)c.energy=Math.max(0,c.energy-1);
    /* ⚠️ REMISE MARTIENNE CACHÉE — SUPPRIMÉE LE 2026-08-26 (décision de Marc).
       Les Martiens recevaient ici −1🪨 −1⚡ sur les trois cartes de la branche Expansion, EN PLUS de
       leur remise sur l'action Coloniser (calculée dans `colonizeCost`). Cette seconde remise
       n'était écrite dans aucune règle : un joueur qui comparait les coûts affichés à ceux du
       document ne pouvait que conclure à une erreur de comptabilité.
       Le passif martien reste ce que les règles annoncent : « Colonisation −1🪨 −1⚡ », c'est-à-dire
       l'ACTION. Rien sur les cartes. */
  }
  if(card.branch&&p.civ.techBonus===card.branch&&c.science)c.science=Math.max(0,c.science-1);
  /* ⚠️ UNE TECHNOLOGIE, C'EST UNE CARTE DE L'ARBRE — donc `branch`, jamais `type`.
     Ce test lisait `type==='technology'` : 12 cartes sur 21. La carte Stratégie « coût en savoir
     annulé » ne fonctionnait donc pas sur Biosphère, Végétalisation ni Exploitations d'Astéroïdes,
     sans que rien ne l'explique au joueur. Corrigé le 26/08 (décision de Marc : compter les 21). */
  if(p.stratBonus&&p.stratBonus.spec==='strat_free_sci'&&card.branch&&c.science)c.science=0;
  return c;
}
/* Le plafond de moral n'est plus le même pour tout le monde : une forme de gouvernement autoritaire
   l'abaisse (Tyrannie 6, Domination des Corporations 7). Il est lu ICI plutôt qu'appliqué à
   l'adoption, pour que TOUTES les sources de moral — revenus, techs, accords, événements — se
   heurtent au même mur, sans qu'aucune ait à connaître la forme de gouvernement. */
function realResCap(p){return{energy:12,materials:20,science:10+(p._resCap||0),morale:(p&&p.govFormMoraleCap)||10};}
function getResCapFor(p){return{energy:9999,materials:9999,science:9999,morale:9999};} // v18 : plafonds NON appliqués en cours de tour (on peut créer au-delà) ; l'écrêtage se fait via enforceCaps à la frontière de tour, APRÈS l'entretien.
function enforceCaps(){for(const p of allPlayers()){const cap=realResCap(p);for(const r in cap){if((p.res[r]||0)>cap[r])p.res[r]=cap[r];}}}
function rEmoji(r){return{energy:'<i class=ri-energy></i>',materials:'<i class=ri-materials></i>',science:'<i class=ri-science></i>',morale:'<i class=ri-morale></i>',force:'⚔️'}[r]||r;}
function rLabel(r){return{energy:'Énergie',materials:'Matériaux',science:'Savoir',morale:'Moral'}[r]||r;}
function rHtml(r,amt){const cls={energy:'energy',materials:'materials',science:'science',morale:'morale',force:'force'}[r]||'';const e=rEmoji(r);return `<span class="res-tag ${cls}">${amt!=null?amt+' ':''}${e}</span>`;}
function costHtml(cost){return Object.entries(cost).map(([r,a])=>rHtml(r,'-'+a)).join(' ');}
function getNodeDistance(fromId,toId){
  if(fromId===toId)return 0;
  const visited=new Set([fromId]);const queue=[[fromId,0]];
  while(queue.length){const[cur,dist]=queue.shift();const node=NODES[cur];if(!node)continue;for(const nb of(node.conn||[])){if(nb===toId)return dist+1;if(!visited.has(nb)){visited.add(nb);queue.push([nb,dist+1]);}}}
  return 99;
}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function setHint(t){const h=document.getElementById('hint');if(h)h.textContent=t;}
function getPiratePos(turn){return PIRATE_PATH[Math.min(Math.floor((turn-1)/2),PIRATE_PATH.length-1)];}
function getIntelLevel(p){if(hasSpec(p,'intel_2'))return 2;if(hasSpec(p,'intel_1'))return 1;return 0;}
// BROUILLARD : force perçue par 'viewer' sur 'target' (stable sur le tour). Exact si intel_2, sinon ±3.
function perceivedForce(viewer,target){
  const real=target.forceTokens||0;
  if(getIntelLevel(viewer)>=2)return{exact:true,val:real};
  if(!G._fog||G._fog.turn!==G.turn)G._fog={turn:G.turn,f:{}};
  const key=(viewer.civ?viewer.civ.id:'p')+'>'+(target.civ?target.civ.id:'p');
  if(G._fog.f[key]===undefined)G._fog.f[key]=Math.max(0,real+(Math.floor(Math.random()*7)-3));
  return{exact:false,val:G._fog.f[key]};
}
function allPlayers(){return [G.player,...G.ais];}
/* ═══ LA CIBLE D'UNE NATION — N'IMPORTE QUELLE RIVALE, PAS « L'HUMAIN » ═══
   Principe posé par Marc, rappelé le 2026-08-12 : « l'IA est une nation comme une autre ».

   AVANT, cette fonction ne retenait que les nations HUMAINES (`_isAI === false`). Une IA ne
   s'attaquait donc JAMAIS à une autre IA : elles se partageaient la carte en paix et se liguaient
   de fait contre les joueurs. Dans la partie 321D, c'est ainsi que le Jupitérien a atteint 115 VP
   sans jamais être inquiété par les deux autres IA — alors qu'il était de loin le plus menaçant.
   C'était aussi une asymétrie MESURABLE : le résultat d'une partie changeait selon la nation
   désignée « active » (voir `server/mesure_equivalence.js`).

   MAINTENANT : la cible est la nation RIVALE la plus proche, humaine ou non. Le critère reste la
   distance, comme avant — on ne change que le vivier. */
function _aiResolveTarget(ai){
  const all=allPlayers();
  let pool=all.filter(p=>p!==ai && p.colonies && p.colonies.length>0);
  if(!pool.length)pool=all.filter(p=>p!==ai);
  if(!pool.length)return null; // seule nation en jeu : personne à viser
  let best=pool[0],bestD=99;
  for(const h of pool){
    let m=99;
    for(const c of ai.colonies)for(const oc of h.colonies){const d=getNodeDistance(c.nodeId,oc.nodeId);if(d<m)m=d;}
    if(m<bestD){bestD=m;best=h;}
  }
  return best;
}
function getCooldownTurn(p){
  const fast=p.investBonus2&&p.investBonus2.fastCooldown&&(p.investBonus2.turnsLeft===undefined||p.investBonus2.turnsLeft>0);
  return G.turn+(fast?1:2);
}
// Supercroiseur : disponible si possédé et hors récupération ; déployable si on peut payer 5<i class=ri-materials></i> 5<i class=ri-energy></i>
function cruiserAvailable(p){return !!p.hasCruiser&&(!p.cruiserCooldown||G.turn>=p.cruiserCooldown);}
// Coût de déploiement du Supercroiseur : 5🪨 +5⚡. Avec l'IA de Navigation (coût de guerre ÷2, la demie sur
// l'ÉNERGIE) → ⌊5/2⌋=2🪨 et ⌈5/2⌉=3⚡. SOURCE UNIQUE, utilisée par l'affordabilité ET par la déduction.
// GARNISON AUTOMATIQUE d'une colonie (règle Marc) : elle se défend TOUJOURS seule, même si le défenseur
// n'engage aucun jeton — 1 jeton pour une colonie ordinaire, 10 pour la BASE de la nation.
// S'applique dans les DEUX SENS (quand tu attaques comme quand tu es attaqué). Les jetons que le défenseur
// engage volontairement s'AJOUTENT à cette garnison.
function garrisonOf(p,nodeId){
  if(!p||!nodeId)return 1;
  return (nodeId===(p.civ&&p.civ.home))?10:1;
}
function cruiserCost(p){
  const half=(typeof hasSpec==='function'&&hasSpec(p,'nav2_war'));
  return half?{materials:2,energy:3}:{materials:5,energy:5};
}
function cruiserAfford(p){const c=cruiserCost(p);return (p.res.materials||0)>=c.materials&&(p.res.energy||0)>=c.energy;}
// Déduit le coût et renvoie le texte à journaliser.
function cruiserPay(p){
  const c=cruiserCost(p);
  p.res.materials=Math.max(0,(p.res.materials||0)-c.materials);
  p.res.energy=Math.max(0,(p.res.energy||0)-c.energy);
  return '−'+c.materials+'<i class=ri-materials></i> −'+c.energy+'<i class=ri-energy></i>';
}
/* ============================================================ INIT ============================================================ */
function mkPlayer(civId){
  const civ=CIVS[civId];
  const startCols=[{nodeId:civ.home,level:1,connected:true}];
  if(civ.extraStartCols)for(const nid of civ.extraStartCols)startCols.push({nodeId:nid,level:1,connected:true});
  const startRoutes=civ.extraStartCols?civ.extraStartCols.map(nid=>({from:civ.home,to:nid,tokens:1})):[];
  return{civ,res:{...civ.start},gov_pts:0,gov_level:1,govPermPts:0,govForm:null,govFormPts:0,govFormAC:0,govFormMorale:0,govFormUpkeep:null,govFormMoraleCap:0,acMax:2,acLeft:2,
    forceTokens:civ.startForce-(civ.extraStartCols?civ.extraStartCols.length:0),forceCooldown:[],cards:[],
    colonies:startCols,
    routes:startRoutes,rpt:{},govRpt:0,tempVP:0,abilityUsed:false,
    spentThisTurn:0,bonusMat:false,stratBonus:null,
    wormholeUsed:false,_resCap:0,investBonus2:null,recentLosses:new Map()};
}
function initTechResize(){
  const handle=document.getElementById('tech-handle');
  const area=document.getElementById('tech-area');
  let dragging=false,startY=0,startH=0;
  handle.addEventListener('mousedown',e=>{
    dragging=true;startY=e.clientY;startH=area.offsetHeight;
    document.body.style.cursor='ns-resize';document.body.style.userSelect='none';
    e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!dragging)return;
    const delta=startY-e.clientY;
    const newH=Math.min(420,Math.max(42,startH+delta));
    area.style.height=newH+'px';
  });
  document.addEventListener('mouseup',()=>{
    if(!dragging)return;
    dragging=false;
    document.body.style.cursor='';document.body.style.userSelect='';
    renderTechTree();
  });
}
// Empêche le bouton "retour" du téléphone de quitter/réinitialiser la partie en cours.
// On garde une entrée d'historique "sentinelle" : à chaque retour, on ferme une éventuelle
// fiche ouverte puis on re-pousse l'entrée → la partie n'est jamais perdue par erreur.
function installBackGuard(){
  if(window._backGuardOn)return; window._backGuardOn=true;
  try{
    history.pushState({sc:1},'');
    window.addEventListener('popstate',function(){
      try{ if(typeof closePopup==='function') closePopup(); }catch(_){}
      try{ history.pushState({sc:1},''); }catch(_){}
    });
  }catch(e){}
}
function startGame(){
  if(!selectedCiv)return;
  document.getElementById('civ-sel').classList.add('hidden');
  document.getElementById('top-bar').style.display='flex';
  document.getElementById('game-wrap').style.display='flex';
  document.getElementById('action-bar').style.display='flex';
  document.getElementById('bottom-bar').style.display='flex';
  initTechResize();
  installBackGuard();
  initGame(selectedCiv, selectedAiCivs);
}
function initGame(civId,aiCivIds){
  const others=Object.keys(CIVS).filter(id=>id!==civId);
  let aiIds=(aiCivIds&&aiCivIds.length>0)?aiCivIds:[others[Math.floor(Math.random()*others.length)]];
  const branchCards=CARDS_POOL.filter(c=>c.branch);
  /* ⚠️ LA RIVIÈRE CIVIQUE EST VIDE DEPUIS LA REFONTE, ET IL FAUT LE DIRE PLUTÔT QUE DE FILTRER
     DANS LE VIDE. Les cartes `civique` (gov1, gov2, gov3, eco1, eco2) ont réellement existé dans
     CARDS_POOL ; elles ont été retirées lors de la refonte civique (voir docs/RESUME_PROJET.md) et
     le civique vit désormais dans CIVIC_MARKET. Le filtre survivait aux données et rendait toujours
     un tableau vide — c'est ce genre de survivance qui m'a fait « corriger » un test mort le 25/08
     et retirer son exclusivité à Éveil Collectif. On garde le champ (l'affichage le lit) mais on
     écrit ce qu'il est : vide, et pourquoi. */
  const civCards=[];
  const milCards=CARDS_POOL.filter(c=>!c.branch&&c.type==='militaire');
  G={turn:1,maxTurns:10,phase:'actions',
    player:mkPlayer(civId),ais:aiIds.map(id=>mkPlayer(id)),
    generalDeck:[],generalRiver:[],
    civRiver:civCards,          // toujours disponibles
    milRiver:[...milCards], // toutes les cartes militaires visibles (grisées si non acquérables)
    branchTiers:{expansion:0,navigation:0,ia_renseignement:0,sciences_exp:0,spiritualite_nature:0,mines_energie:0,empathes:0},
    techTaken:new Set(),
    agendas:[],  // compat display — chaque joueur a son propre .agenda
    events:EVENTS,eventSchedule:buildEventSchedule(),curEvent:null,nextEvent:null,
    log:[],turnActions:[],aiActions:[],_raidsThisTurn:[],_journal:[],
    wars:[],warRisk:0,warState:null,warTurnsLeft:0,warWins:{player:0,ai:0},_warDeclaredBy:'other',_aiWarTarget:null,_aiWarStance:'hold',
    warWith:null,tensions:{},
    commercialAccords:[],accordsParties:{},mapPanel:0,wormholeUsed:false,_pendingEvModal:null,
    playerInvest:null,aiInvest:null,investApplied:false,
    playerInvest2:null,aiInvest2:null,invest2Applied:false,
    empathesFounder:null,
    playerTension:0,aiTension:0,
    civicTaken:new Set(),
    _postWarColonizeOffer:null,
  };
  // Identité humain/IA par nation (persiste à la sérialisation). Le serveur la fixera selon les sièges.
  G.player._isAI=false;
  for(const a of G.ais)a._isAI=true;
  // Tensions bilatérales : tensions[fromId][toId] ∈ [0,10]
  G.tensions={};
  const _pid=G.player.civ.id; G.tensions[_pid]={};
  for(const ai of G.ais){G.tensions[_pid][ai.civ.id]=0;G.tensions[ai.civ.id]={[_pid]:0};}
  undoStack=[];G.debugNotes=[];
  /* La MACHINE À ÉTATS naît avec la partie et vit DANS `G` (bloc @flux, tout en bas).
     C'est ce qui rendra la reprise gratuite : sauver `G`, c'est sauver le déroulement.
     Tant que les anciens rappels n'ont pas tous été migrés, elle tourne EN PARALLÈLE
     du flux existant — elle observe, elle ne commande pas encore. La migration se fait
     flux par flux ; l'objectif mesurable est `test_serialisation.js` au vert. */
  fluxInit();
  /* Les tempéraments sont tirés ICI, une fois la table constituée. En mode serveur, les sièges
     humain/IA sont fixés juste après par le pilote : `attribuerProfilsIA` est donc rappelée à ce
     moment-là, et elle ne touche pas aux nations qui ont déjà un profil. */
  attribuerProfilsIA();
  drawStars();drawConnections();
  addLog('🚀 Partie ! '+CIVS[civId].name+' vs '+G.ais.map(a=>a.civ.name).join(', '),'gold');
  addLog('⭐ Bonus national : '+(CIVS[civId].techBonus?TECH_BRANCHES[CIVS[civId].techBonus].emoji+' '+TECH_BRANCHES[CIVS[civId].techBonus].label+' −1<i class=ri-science></i>':'Aucun'));
  renderLogLegend();
  if(!_decisionActive())showAgendaSelModal(); // serveur : le driver lance le draft d'agenda APRÈS avoir fixé les sièges humain/IA
}
/* ============================================================ UNDO ============================================================ */
function saveUndo(){undoStack.push({player:JSON.parse(JSON.stringify(G.player)),generalRiver:JSON.parse(JSON.stringify(G.generalRiver)),branchTiers:{...G.branchTiers},techTaken:new Set(G.techTaken),turnActions:[...G.turnActions],milBought:[...(G.player._milBoughtThisTurn||[])]});}
function undo(){
  if(G.phase!=='actions')return;
  if(!undoStack.length){addLog('⚠️ Rien à annuler.','red');return;}
  const snap=undoStack.pop();
  G.player=snap.player;G.generalRiver=snap.generalRiver;G.branchTiers=snap.branchTiers;G.techTaken=snap.techTaken;G.turnActions=snap.turnActions;
  // Recalculer la connectivité après restauration (col.connected peut être périmé)
  updateConnections(G.player);
  // JSON.parse détruit les Map — restaurer recentLosses en Map
  if(!(G.player.recentLosses instanceof Map))G.player.recentLosses=new Map();
  G.player._milBoughtThisTurn=new Set(snap.milBought||[]); // JSON détruit le Set → restaurer (sinon .has plante au rendu)
  // JSON.parse détruit les méthodes — restaurer la référence agenda depuis AGENDAS_POOL
  if(G.player.agenda&&typeof G.player.agenda.score!=='function'){const ag=AGENDAS_POOL.find(a=>a.id===G.player.agenda.id);if(ag)G.player.agenda=ag;}
  mode=null;routeFrom=null;setHint('');closePopup();_scHideConfirm();
  if(typeof _ilHide==='function')_ilHide(); // annulation : referme la fenêtre centrale des autres nations
  addLog('↩️ Action annulée.','gold');render();
}
/* ===== Confirmation action par action : popup ↩ / Valider (bas-droite zone centrale) ===== */
let _scConfirmArmed=false;
function _scHasConfirmDom(){return typeof document!=='undefined'&&document.getElementById&&document.getElementById('sc-confirm');}
function _sccGainsHTML(gains){
  return (gains||[]).map(function(g){
    if(g.kind==='vp')return '<span class="scc-chip vp">+'+g.val+'🏆</span>';
    if(g.kind==='pt')return '<span class="scc-chip pt">+'+g.val+g.icon+'</span>';
    return '<span class="scc-chip res">+'+g.val+g.icon+'</span>';
  }).join('');
}
function _scCardGains(card){
  var g=[];
  if(card.vp)g.push({kind:'vp',val:card.vp});
  if(card.resGain)for(const[r,a]of Object.entries(card.resGain))g.push({kind:'res',icon:rEmoji(r),val:a});
  if(card.rGain)for(const[r,a]of Object.entries(card.rGain))g.push({kind:'pt',icon:rEmoji(r),val:a});
  return g;
}
function scArmConfirm(abbrev,gains){
  if(!_scHasConfirmDom())return;
  if(G&&G.phase!=='actions')return;
  if(!undoStack.length)return; // action non annulable → pas de popup
  _scConfirmArmed=true;
  document.getElementById('sc-confirm-label').innerHTML=
    '<span class="scc-act">'+abbrev+'</span>'+((gains&&gains.length)?'<span class="scc-gains">'+_sccGainsHTML(gains)+'</span>':'');
  document.getElementById('sc-confirm').classList.add('show');
}
function _scHideConfirm(){_scConfirmArmed=false;if(_scHasConfirmDom())document.getElementById('sc-confirm').classList.remove('show');}
function _scGuard(){if(_scConfirmArmed){if(typeof addLog==='function')addLog('⚠️ Valide (✓) ou annule (↩) ton action avant d\'en jouer une autre.','red');return true;}return false;} // bloque l'enchaînement tant qu'une action n'est pas confirmée
function scConfirmValidate(){ // fige l'action (plus d'annulation) PUIS relance l'entrelacement (l'IA joue maintenant)
  _scHideConfirm();undoStack=[];render();
  if(typeof G!=='undefined'&&G&&G._il&&G._humanActive){G._ilPassTries=0;setTimeout(_ilMaybePass,20);}
}
function scConfirmCancel(){_scHideConfirm();undo();} // restaure l'état d'avant l'action ; on NE passe PAS la main (l'IA n'a pas joué)
/* Rappel « pouvoir gratuit » en fin de tour + disponibilité de la capacité */
const _SC_ABNAME={terriens:'Diplomatie Verte',martiens:'Surtension',ceinturiens:'Commerce avec les pirates',jupiteriens:'Forge Orbitale'};
function _scAbilityAvailable(){
  const p=(typeof G!=='undefined')&&G&&G.player; if(!p||!p.civ||!p.civ.active)return false;
  if(p.abilityUsed)return false;
  const ab=p.civ.active; if(p.acLeft<(ab.ac||0))return false;
  for(const[r,a]of Object.entries(ab.cost||{})){if((p.res[r]||0)<a)return false;}
  if(p.civ.id==='jupiteriens'){const el=p.colonies.filter(c=>['io','europe','ganymede','callisto'].includes(c.nodeId)&&c.level===1&&c.connected);if(!el.length)return false;}
  return true;
}
function _scAbilityReminderOpen(){return typeof document!=='undefined'&&!!document.getElementById('sc-ability-reminder');}
function _scShowAbilityReminder(){
  if(typeof document==='undefined'||_scAbilityReminderOpen())return;
  const p=G.player;const name=_SC_ABNAME[p.civ.id]||'ta capacité gratuite';
  // Le rappel apparaît maintenant quand il te reste ENCORE des actions (à 1 AC) : le bouton de refus ne doit
  // donc PAS passer le tour — il referme simplement la fenêtre et te laisse jouer. Textes adaptés.
  const _reste=(p.acLeft||0);
  const _msg=_reste>0
    ? ('Il te reste <strong>'+_reste+' AC</strong>. Utiliser <strong style="color:#ffd166">'+name+'</strong> (gratuite, 0 AC) maintenant ?')
    : ('Tu n\'as plus d\'actions. Utiliser <strong style="color:#ffd166">'+name+'</strong> (gratuite) avant de finir le tour ?');
  const _skip=_reste>0?'Plus tard — continuer à jouer':'Terminer le tour sans l\'utiliser';
  document.body.insertAdjacentHTML('beforeend',
    '<div id="sc-ability-reminder" style="position:fixed;inset:0;background:rgba(4,4,18,.85);z-index:620;display:flex;align-items:center;justify-content:center">'+
      '<div style="background:#0f0f2a;border:1px solid #4a9eff;border-radius:12px;padding:22px;min-width:300px;max-width:400px;text-align:center">'+
        '<div style="font-size:1.05em;font-weight:700;color:#c8d8f8;margin-bottom:8px">💫 Capacité gratuite non utilisée</div>'+
        '<div style="font-size:.9em;color:#9fb0d0;margin-bottom:16px">'+_msg+'</div>'+
        '<button onclick="_scAbilityReminderUse()" style="padding:9px 18px;margin:0 5px;background:#3ecf8e;color:#04240f;border:none;border-radius:9px;font-weight:700;cursor:pointer">💫 Utiliser</button>'+
        '<button onclick="_scAbilityReminderSkip()" style="padding:9px 18px;margin:0 5px;background:#1a1a2a;color:#9fb0d0;border:1px solid #3a3a5a;border-radius:9px;font-weight:700;cursor:pointer">'+_skip+'</button>'+
      '</div></div>');
}
function _scCloseAbilityReminder(){const e=document.getElementById('sc-ability-reminder');if(e)e.remove();}
function _scAbilityReminderUse(){_scCloseAbilityReminder();useAbility();}
function _scAbilityReminderSkip(){
  _scCloseAbilityReminder();
  // S'il te reste des AC, on NE passe PAS le tour : tu continues de jouer tes actions.
  if(G&&G.player&&(G.player.acLeft||0)>0){ if(typeof render==='function')render(); return; }
  if(typeof passTurnIL==='function')passTurnIL();
}
/* ============================================================ AGENDA SELECTION ============================================================ */
let _agendaPool=[];let _selectedAgendaId=null;
function showAgendaSelModal(){
  if(typeof _ilHide==='function')_ilHide();
  // Exclure les agendas déjà satisfaits dès le départ (ex : Frontière Externe pour les Pirates)
  _agendaPool=shuffle([...AGENDAS_POOL]).slice(0,5);
  _selectedAgendaId=null;
  if(_decisionActive()){ _serverAgendaDraft(); return; } // mode serveur : chaque humain choisit son agenda
  const p=G.player;
  // Calcul aperçu revenus T1 (sans maintenance, sans investissement pas encore actif)
  const previewGains={energy:0,materials:0,science:0,morale:0};
  for(const col of p.colonies){
    if(!col.connected)continue;
    const node=NODES[col.nodeId];
    if(node.decorative)continue;
    const mult=col.level===3?2:col.level===2?1.5:1;
    for(const[r,a]of Object.entries(node.res)){
      previewGains[r]=(previewGains[r]||0)+Math.floor(a*mult);
    }
    if(col.level===2)previewGains.morale++;
    else if(col.level>=3)previewGains.morale+=2;
  }
  for(const[r,a]of Object.entries(p.rpt))previewGains[r]=(previewGains[r]||0)+a;
  // Événement tour 1 (actuel) et tour 2 (prochain)
  const evT1=eventForTurn(1);
  const evT2=eventForTurn(2);
  // Contexte : ressources + revenus + événements
  const ctx=document.getElementById('agsel-context');
  // NET (revenus − entretien colonies/routes/gouvernement) : même source que la barre du haut, sinon on
  // affichait du BRUT et on ne voyait pas qu'on passait en négatif (remarque de l'ami de Marc).
  const _net=(typeof _netIncome==='function')?_netIncome(p):previewGains;
  const rLine=([r,a])=>a!==0?`<span class="agsel-res" style="color:${a<0?'#ff6b6b':'#7fe0a0'}">${rEmoji(r)} ${a>0?'+':''}${a}</span>`:'';
  const gainStr=Object.entries(_net).filter(([,a])=>a!==0).map(rLine).join('');
  const resStr=`<i class=ri-energy></i>${p.res.energy} <i class=ri-materials></i>${p.res.materials} <i class=ri-science></i>${p.res.science} <i class=ri-morale></i>${p.res.morale}`;
  ctx.innerHTML=`
    <div class="agsel-ctx-box">
      <div class="agsel-ctx-label">Vos ressources</div>
      <div class="agsel-ctx-val">${resStr}</div>
    </div>
    <div class="agsel-ctx-box">
      <div class="agsel-ctx-label">Revenus prévus/tour</div>
      <div class="agsel-ctx-val">${gainStr||'—'}</div>
    </div>
    <div class="agsel-ctx-box">
      <div class="agsel-ctx-label">Prochain événement</div>
      <div class="agsel-ctx-val">${evT2?evT2.emoji+' T.2 — '+evT2.preview:'Aucun'}</div>
    </div>`;
  // Rendu des 5 agendas
  const cont=document.getElementById('agsel-agendas');
  cont.innerHTML=_agendaPool.map(ag=>`
    <div class="agsel-ag" id="agsel-ag-${ag.id}" onclick="selectAgenda('${ag.id}')">
      <div class="agsel-ag-emoji">${ag.emoji}</div>
      <div class="agsel-ag-name">${ag.name}</div>
      <div class="agsel-ag-desc">${ag.desc}</div>
    </div>`).join('');
  document.getElementById('agsel-confirm-btn').disabled=true;
  document.getElementById('agenda-sel-modal').classList.remove('hidden');
  if(typeof _syncEndBtn==='function')_syncEndBtn();
}
// ── Draft d'agenda côté SERVEUR : chaque nation HUMAINE choisit le sien ; les IA choisissent automatiquement. ──
function _aiPickAgendas(){
  const aiPref={
    terriens:['ag6','ag10','ag2'],martiens:['ag4','ag3','ag1'],
    jupiteriens:['ag8','ag1','ag9'],ceinturiens:['ag4','ag11','ag2'],
  };
  const shuffled=shuffle([...AGENDAS_POOL]);
  for(const ai of G.ais){
    if(ai._isAI===false)continue; // humain : il choisira lui-même
    const prefs=(aiPref[ai.civ.id]||[]); let pick=null;
    for(const prefId of prefs){const f=shuffled.find(a=>a.id===prefId);if(f){pick=f;break;}}
    ai.agenda=pick||shuffled[0];
    addLog('🤖 '+ai.civ.emoji+' '+ai.civ.name+' — Agenda secret : '+ai.agenda.emoji+' '+ai.agenda.name,'dim');
  }
}
/* TIRAGE D'AGENDA (serveur) — la file par IDENTIFIANT et les cinq agendas proposés vont dans `G`.
   La file contenait des OBJETS nations et le tirage vivait dans une fermeture : après une reprise,
   les objets n'étaient plus les mêmes que ceux de `G` (JSON duplique), et les cinq cartes proposées
   étaient perdues — le joueur en aurait revu cinq autres. */
/* ---- AGENDA SECRET : TOUT LE MONDE CHOISIT EN MÊME TEMPS --------------------
   C'était une file d'attente : le joueur 2 regardait un sablier pendant que le
   joueur 1 lisait ses cinq cartes. Rien ne le justifiait — les choix sont SECRETS
   et INDÉPENDANTS, personne n'a besoin de connaître celui d'un autre. On pose donc
   les questions à tous d'un coup et on n'avance qu'à la DERNIÈRE réponse
   (`fluxActiver` / `fluxARepondu` — le mécanisme multi-actif de la machine, celui
   que BGA appelle `setPlayersMultiactive`).
   Chacun a SON tirage, mémorisé dans `d.agendaPools[civ]` : un joueur qui revient
   après un rafraîchissement doit revoir EXACTEMENT ses cinq cartes, pas cinq
   nouvelles (on ne peut pas les « recalculer », elles sont tirées au hasard). */
function _serverAgendaDraft(){
  _aiPickAgendas();
  const ids=allPlayers().filter(p=>p._isAI===false).map(p=>p.civ.id);
  const d=fluxDonnees();
  d.fileAgendaLocale=[];                 // la file n'existe plus : on garde la clé vide pour les vieilles sauvegardes
  d.agendaPools={};
  if(!ids.length){ _finishAgendaDraft(); return; }
  fluxActiver(ids);
  for(const civId of ids){
    const nat=allPlayers().find(p=>p.civ.id===civId);
    if(!nat){ if(fluxARepondu(civId)) { _finishAgendaDraft(); return; } continue; }
    const pool=shuffle([...AGENDAS_POOL]).slice(0,5);
    d.agendaPools[civId]=pool.map(a=>a.id);
    _emitDecision('agenda', nat,
      {options:pool.map(a=>({id:a.id,name:a.name,emoji:a.emoji,desc:a.desc}))},
      'stAgendaLocalRecu', null);
  }
}
/* La suite reçoit la nation qui a répondu (second argument) : avec quatre réponses possibles dans
   n'importe quel ordre, lire un curseur unique rangé dans les données donnait l'agenda du voisin. */
function stAgendaLocalRecu(ans, civId){
  const d=fluxDonnees();
  const cid=civId||(ans&&ans._civ)||null;
  const nat=allPlayers().find(p=>p.civ.id===cid);
  const pool=(((d.agendaPools||{})[cid])||d.agendaPoolLocal||[]).map(id=>AGENDAS_POOL.find(a=>a.id===id)).filter(Boolean);
  if(nat){
    const id=(ans&&ans.agendaId)||(pool[0]&&pool[0].id);
    nat.agenda=AGENDAS_POOL.find(a=>a.id===id)||pool[0]||nat.agenda;
    // Le journal ne nomme PAS l'agenda choisi : il est secret, et le journal est lu par tout le monde.
    addLog('📋 '+nat.civ.emoji+' '+nat.civ.name+' — agenda secret choisi.','dim');
  }
  if(!fluxARepondu(cid)) return;          // il en manque : on laisse leurs fenêtres ouvertes
  d.agendaPools=null; d.agendaPoolLocal=null;
  _finishAgendaDraft();
}
/* ---- REPRISE DES PARTIES SAUVEGARDÉES AVANT LE PASSAGE AU PARALLÈLE --------
   Une partie enregistrée pendant l'ancien draft séquentiel garde dans son fichier une question dont
   l'adaptateur s'appelle `adAgendaChoisi` et dont la suite du tour tient dans `d.fileAgendaLocale`.
   Supprimer ces deux fonctions aurait figé ces parties-là au rechargement, sans un mot. On garde
   donc l'ancien chemin, tel quel, pour les parties déjà commencées ; les nouvelles n'y passent plus. */
function _agendaStep(){
  const d=fluxDonnees(), file=d.fileAgendaLocale||[];
  if(!file.length){ d.agendaPoolLocal=null; _finishAgendaDraft(); return; }
  const nat=allPlayers().find(p=>p.civ.id===file[0]);
  if(!nat){ file.shift(); d.fileAgendaLocale=file; _agendaStep(); return; }
  const pool=shuffle([...AGENDAS_POOL]).slice(0,5);
  d.agendaPoolLocal=pool.map(a=>a.id);
  _emitDecision('agenda', nat,
    {options:pool.map(a=>({id:a.id,name:a.name,emoji:a.emoji,desc:a.desc}))},
    null, 'adAgendaChoisi');
}
function adAgendaChoisi(ans){
  const d=fluxDonnees(), file=d.fileAgendaLocale||[];
  const nat=allPlayers().find(p=>p.civ.id===file[0]);
  const pool=(d.agendaPoolLocal||[]).map(id=>AGENDAS_POOL.find(a=>a.id===id)).filter(Boolean);
  if(nat){
    const id=(ans&&ans.agendaId)||(pool[0]&&pool[0].id);
    nat.agenda=AGENDAS_POOL.find(a=>a.id===id)||pool[0];
    addLog('📋 '+nat.civ.emoji+' '+nat.civ.name+' — agenda secret choisi.','dim');
  }
  file.shift(); d.fileAgendaLocale=file;
  _agendaStep();
  return ans;
}
function _finishAgendaDraft(){
  G._agendaQueue=null;
  G.agendas=allPlayers().map(p=>p.agenda).filter(Boolean);
  runStrategyDraft();
}
function selectAgenda(agId){
  _selectedAgendaId=agId;
  document.querySelectorAll('.agsel-ag').forEach(el=>el.classList.remove('ag-selected'));
  const el=document.getElementById('agsel-ag-'+agId);
  if(el)el.classList.add('ag-selected');
  document.getElementById('agsel-confirm-btn').disabled=false;
}
function confirmAgendaChoice(){
  if(!_selectedAgendaId)return;
  const chosen=_agendaPool.find(a=>a.id===_selectedAgendaId);
  G.player.agenda=chosen;
  // Chaque IA choisit indépendamment dans le pool complet (pas les restes)
  const aiPref={
    terriens:['ag6','ag10','ag2'],martiens:['ag4','ag3','ag1'],
    jupiteriens:['ag8','ag1','ag9'],ceinturiens:['ag4','ag11','ag2'],
  };
  const shuffled=shuffle([...AGENDAS_POOL]);
  for(const ai of G.ais){
    const prefs=(aiPref[ai.civ.id]||[]);
    let pick=null;
    for(const prefId of prefs){const found=shuffled.find(a=>a.id===prefId);if(found){pick=found;break;}}
    ai.agenda=pick||shuffled[0];
    addLog('🤖 '+ai.civ.emoji+' '+ai.civ.name+' — Agenda secret : '+ai.agenda.emoji+' '+ai.agenda.name,'dim');
  }
  G.agendas=allPlayers().map(p=>p.agenda).filter(Boolean);
  document.getElementById('agenda-sel-modal').classList.add('hidden');
  addLog('📋 Agenda choisi : '+chosen.emoji+' '+chosen.name,'gold');
  // EN LIGNE : les humains DISTANTS choisissent leur propre agenda (l'auto-pick ci-dessus sert de repli si le réseau échoue).
  const _remoteAg=G.ais.filter(a=>_isRemote(a));
  if(_remoteAg.length)_relayRemoteAgendas(_remoteAg.slice(), 'runStrategyDraft');
  else runStrategyDraft();
}
/* TIRAGE D'AGENDA DES JOUEURS DISTANTS — file et suite dans `G`, plus dans une fermeture.
   La file `queue`, la nation courante et les cinq agendas proposés vivaient dans cette portée :
   sauver la partie pendant le tirage, c'était les perdre tous les trois. Les agendas proposés sont
   maintenant MÉMORISÉS (on ne peut pas les « recalculer » : ils sont tirés au hasard, et un joueur
   qui revient doit revoir EXACTEMENT les mêmes cinq cartes). */
/* Mode HÔTE-NAVIGATEUR (partie relayée par le navigateur du créateur, sans serveur) : même règle
   qu'au-dessus — tous les distants choisissent en même temps, et on n'avance qu'au dernier. */
function _relayRemoteAgendas(queue, onDone){
  const d=fluxDonnees();
  const ids=(Array.isArray(queue)?queue:[]).map(n=>(n&&n.civ)?n.civ.id:n).filter(Boolean);
  d.fileAgendas=[];
  d.apresAgendas=(typeof onDone==='string'&&onDone)?onDone:null;
  d.agendaPoolsD={}; d.agendaRestants=ids.slice();
  if(!ids.length){ stAgendaSuivant(); return; }
  for(const civId of ids){
    const nat=allPlayers().find(p=>p.civ.id===civId);
    if(!nat){ const r=d.agendaRestants; r.splice(r.indexOf(civId),1); continue; }
    const pool=shuffle([...AGENDAS_POOL]).slice(0,5);
    d.agendaPoolsD[civId]=pool.map(a=>a.id);
    _emitRemote('agenda', nat, {options:pool.map(a=>({id:a.id,name:a.name,emoji:a.emoji,desc:a.desc}))}, 'stAgendaRecu');
  }
  if(!d.agendaRestants.length) stAgendaSuivant();
}
/* Fin du tour de table : plus personne à interroger → on joue la suite nommée.
   (Garde aussi l'ancienne file `fileAgendas` pour les parties sauvegardées avant le parallèle.) */
function stAgendaSuivant(){
  const d=fluxDonnees(), file=d.fileAgendas||[];
  if(file.length){                                  // ancienne file séquentielle : on la termine comme avant
    const civId=file.shift(); d.fileAgendas=file;
    const nat=allPlayers().find(p=>p.civ.id===civId);
    if(!nat){ stAgendaSuivant(); return; }
    const pool=shuffle([...AGENDAS_POOL]).slice(0,5);
    d.agendaCiv=civId; d.agendaPool=pool.map(a=>a.id);
    _emitRemote('agenda', nat, {options:pool.map(a=>({id:a.id,name:a.name,emoji:a.emoji,desc:a.desc}))}, 'stAgendaRecu');
    return;
  }
  const nom=d.apresAgendas;
  d.apresAgendas=null; d.agendaCiv=null; d.agendaPool=null; d.agendaPoolsD=null; d.agendaRestants=null;
  if(nom)fluxAppeler(nom);
}
function stAgendaRecu(ans, civId){
  const d=fluxDonnees();
  const cid=civId||(ans&&ans._civ)||d.agendaCiv;
  const nat=allPlayers().find(p=>p.civ.id===cid);
  const pool=(((d.agendaPoolsD||{})[cid])||d.agendaPool||[]).map(id=>AGENDAS_POOL.find(a=>a.id===id)).filter(Boolean);
  if(nat){
    const id=(ans&&ans.agendaId)||(nat.agenda&&nat.agenda.id)||(pool[0]&&pool[0].id);
    nat.agenda=AGENDAS_POOL.find(a=>a.id===id)||nat.agenda||pool[0];
    addLog('📋 '+nat.civ.emoji+' '+nat.civ.name+' — agenda secret choisi.','dim');
    G.agendas=allPlayers().map(p=>p.agenda).filter(Boolean);
  }
  d.agendaCiv=null; d.agendaPool=null;
  const rest=d.agendaRestants;
  if(Array.isArray(rest)){                          // mode parallèle : on attend les autres
    const i=rest.indexOf(cid); if(i>=0) rest.splice(i,1);
    if(rest.length) return;
  }
  stAgendaSuivant();
}
/* ============================================================ INVESTMENT ============================================================ */
/* ═══════ INVESTISSEMENTS : PEUT-ON PAYER ? (Marc, 2026-08-09) ═══════
   « il faudrait aussi que le jeu évalue la possibilité de les payer au moment du choix
   et bloquer ce qui peut pas être payé. »

   Le défaut : chaque `applyCost` retirait sa contrepartie en `Math.max(0, …)`. Sans les
   ressources, le compteur s'arrêtait à zéro et le joueur encaissait le bénéfice GRATUITEMENT.
   Le champ `cout` déclare maintenant la contrepartie sous forme de DONNÉE, à côté du texte
   `contrepartie` qui, lui, ne sert qu'à l'affichage. Les deux doivent rester d'accord.

   Deux contrôles, comme Marc l'a demandé :
     · au CHOIX (fin du tour 2 ou 6) — la carte est grisée et non cliquable ;
     · au PRÉLÈVEMENT (tour 3 ou 7) — on revérifie, car le joueur a pu tout dépenser entre-temps.
   « Payable » signifie ici : avoir la ressource. On n'interdit pas de tomber à zéro moral —
   c'est un choix légitime, même s'il déclenche la guerre civile. */
function investCoutDe(card){ return (card&&card.cout)||{}; }
function investPayable(card,p){
  const c=investCoutDe(card);
  for(const r in c){ if((p.res[r]||0) < c[r]) return false; }
  return true;
}
function investManque(card,p){
  const c=investCoutDe(card), m=[];
  for(const r in c){ const d=c[r]-(p.res[r]||0); if(d>0) m.push(d+(typeof rEmoji==='function'?rEmoji(r):r)); }
  return m;
}
/* Applique une carte d'investissement APRÈS avoir revérifié qu'elle est payable.
   Rend true si elle a pris effet. Un seul chemin pour les deux niveaux et pour l'espionnage :
   c'est ce qui garantit qu'on ne peut pas oublier le contrôle à un endroit. */
function investAppliquer(card,p){
  if(!card) return false;
  if(!investPayable(card,p)){
    const m=investManque(card,p).join(' ');
    addLog('💼 '+p.civ.emoji+' '+p.civ.name+' — '+card.emoji+' '+card.name
      +' ne prend PAS effet : il manque '+m+' au moment du prélèvement.','red');
    if(typeof _journalAuto==='function')_journalAuto(p.civ.name,'Investissement sans effet',card.name+' — il manque '+m);
    return false;
  }
  card.applyBenefit(G,p); card.applyCost(G,p);
  return true;
}
function showInvestmentModal(){
  if(typeof _ilHide==='function')_ilHide();
  // Chaque IA choisit STRATÉGIQUEMENT (le joueur choisit en dernier)
  for(const a of G.ais)a._inv1=chooseInvestmentForAI(a,1);
  G.aiInvest=G.ais[0]?G.ais[0]._inv1:null;   // ÉCHO d'affichage local — ne JAMAIS s'en servir pour une règle (dépend de la perspective)
  if(_decisionActive()){ // mode serveur : chaque HUMAIN choisit son investissement Niv.1 (les invités d'abord, puis l'hôte)
    /* (Une variable `_invOpts` traînait ici, construite puis jamais utilisée : les options
       envoyées viennent de `_invOptions(nation)`, plus bas. Supprimée — du code mort qui a
       l'air d'être la source de vérité est pire que pas de code du tout.) */
    // ⚠️ LA FILE DES JOUEURS À INTERROGER VA DANS `G`, pas dans une fermeture (règle 3 du bloc @flux).
    // Avant, `_invQueue` et `_invAsk` vivaient dans cette portée : sauver la partie pendant que le
    // deuxième joueur choisissait son investissement, c'était perdre la file ET la suite.
    fluxDonnees().fileInvest=G.ais.filter(a=>!a._isAI).map(a=>a.civ.id);
    fluxDonnees().niveauInvest=1;
    stInvestDemander();
    return;
  }
  const aiPick=document.getElementById('inv-ai-pick');
  aiPick.innerHTML=G.ais.map(a=>{const c=INVESTMENT_CARDS.find(x=>x.id===a._inv1);return '🤖 '+a.civ.emoji+' <strong>'+a.civ.name+'</strong> : '+(c?c.emoji+' '+c.name:'—');}).join('<br>');
  aiPick.classList.remove('hidden');
  aiPick.innerHTML+=_tensionMiniHtml();
  const opts=document.getElementById('inv-opts');
  opts.innerHTML=INVESTMENT_CARDS.map(c=>{
    const aiAlso=G.ais.some(a=>a._inv1===c.id); // non-exclusif : tu peux choisir le même qu'une IA
    const ok=investPayable(c,G.player), manque=investManque(c,G.player).join(' ');
    return`<div class="inv-opt${ok?'':' inv-nope'}"${ok?` onclick="selectInvestment('${c.id}')"`:''}>
      <div class="inv-opt-emoji">${c.emoji}</div>
      <div class="inv-opt-name">${c.name}${aiAlso?' <span style="color:#cc9944;font-size:.82em">(IA aussi)</span>':''}</div>
      <div class="inv-opt-benefit">✅ ${c.benefit}</div>
      <div class="inv-opt-cost">⚠️ ${c.contrepartie}</div>
      ${ok?'':'<div class="inv-opt-cost" style="color:#ff8a8a;font-weight:700">🚫 Il te manque '+manque+'</div>'}
    </div>`;
  }).join('');
  document.getElementById('invest-modal').classList.remove('hidden');
}
function selectInvestment(cardId){
  /* ⚠️ L'INVESTISSEMENT APPARTIENT À LA NATION, PAS À LA PARTIE.
     `G.playerInvest` signifiait « l'investissement de celui qui était G.player au moment du choix ».
     En multijoueur, chaque joueur écrivait donc dans LA MÊME case, et le panneau Empire montrait à
     tout le monde le dernier choix enregistré (signalé par Marc le 2026-08-07 : « le jeu confond
     mon investissement avec celui de l'autre joueur »).
     `_inv1` / `_inv2` — portés par CHAQUE nation — existaient déjà et sont la bonne source : c'est
     eux que la résolution des effets utilise. `G.playerInvest` est conservé le temps d'un tour comme
     simple ÉCHO du joueur local (les gardes de `continueAfterEOT` s'en servent), mais plus rien
     d'affiché ne doit le lire. */
  G.player._inv1=cardId;
  G.playerInvest=cardId;
  const card=INVESTMENT_CARDS.find(c=>c.id===cardId);
  document.getElementById('invest-modal').classList.add('hidden');
  addLog('💼 Investissement Niv.1 : '+card.emoji+' '+card.name+' — effet T3→T5','gold');
  G.turn++;runStrategyDraft();
}
/* ---- INVESTISSEMENT NIV.2 ---- */
function showInvestmentModal2(){
  if(typeof _ilHide==='function')_ilHide();
  // Celui qui a terminé son tour 6 en dernier (l'IA) choisit en premier
  for(const a of G.ais)a._inv2=chooseInvestmentForAI(a,2);
  G.aiInvest2=G.ais[0]?G.ais[0]._inv2:null;  // ÉCHO d'affichage local — voir ci-dessus
  if(_decisionActive()){ // mode serveur : chaque HUMAIN choisit son investissement Niv.2 (les invités d'abord, puis l'hôte)
    // Même flux que le niveau 1 : la file des joueurs va dans `G`, pas dans une fermeture.
    fluxDonnees().fileInvest=G.ais.filter(a=>!a._isAI).map(a=>a.civ.id);
    fluxDonnees().niveauInvest=2;
    stInvestDemander();
    return;
  }
  document.getElementById('inv2-ai-pick').innerHTML=G.ais.map(a=>{const c=INVESTMENT_CARDS_2.find(x=>x.id===a._inv2);return '🤖 '+a.civ.emoji+' <strong>'+a.civ.name+'</strong> : '+(c?c.emoji+' '+c.name:'—');}).join('<br>');
  document.getElementById('inv2-ai-pick').classList.remove('hidden');
  document.getElementById('inv2-ai-pick').innerHTML+=_tensionMiniHtml();
  document.getElementById('inv2-opts').innerHTML=INVESTMENT_CARDS_2.map(card=>{
    const ok=investPayable(card,G.player), manque=investManque(card,G.player).join(' ');
    return `
    <div class="inv-opt${ok?'':' inv-nope'}"${ok?` onclick="selectInvestment2('${card.id}')"`:''}>
      <div class="inv-opt-emoji">${card.emoji}</div>
      <div class="inv-opt-name">${card.name}</div>
      <div class="inv-opt-benefit">${card.benefit}</div>
      <div class="inv-opt-cost">⚠️ ${card.contrepartie}</div>
      ${ok?'':'<div class="inv-opt-cost" style="color:#ff8a8a;font-weight:700">🚫 Il te manque '+manque+'</div>'}
    </div>`;}).join('');
  document.getElementById('invest2-modal').classList.remove('hidden');
}
function selectInvestment2(cardId){
  G.player._inv2=cardId;      // la nation d'abord — voir le bandeau de `selectInvestment`
  G.playerInvest2=cardId;
  const card=INVESTMENT_CARDS_2.find(c=>c.id===cardId);
  document.getElementById('invest2-modal').classList.add('hidden');
  addLog('💼 Investissement Niv.2 : '+card.emoji+' '+card.name+' — effet au tour 7','gold');
  // Continue to turn 7
  G.turn++;runStrategyDraft();
}
function applyInvestments2(){
  if(G.invest2Applied)return;G.invest2Applied=true;
  const pCard=INVESTMENT_CARDS_2.find(c=>c.id===G.player._inv2);
  const aCard=INVESTMENT_CARDS_2.find(c=>c.id===(G.ais[0]&&G.ais[0]._inv2));   // affichage seulement
  /* Revérification au PRÉLÈVEMENT : le choix date du tour 6, on est au tour 7, le joueur a pu
     tout dépenser entre-temps. `investAppliquer` refuse alors la carte au lieu d'en offrir le
     bénéfice avec une contrepartie ramenée à zéro (voir le bandeau d'`investPayable`). */
  if(pCard) investAppliquer(pCard,G.player);
  for(const a of G.ais){const ac=INVESTMENT_CARDS_2.find(c=>c.id===a._inv2);if(ac) investAppliquer(ac,a);}
  if(pCard)_journalAuto(G.player.civ.name,'Résolution investissement Niv.2',pCard.name);
  for(const a of G.ais){const ac3=INVESTMENT_CARDS_2.find(c=>c.id===a._inv2);if(ac3)_journalAuto(a.civ.name,'Résolution investissement Niv.2',ac3.name);}
}
function isEmpathesAvailableFor(p){
  if(!G.empathesFounder)return false;
  if(G.empathesFounder.civIds.has(p.civ.id))return true;
  return G.turn>=G.empathesFounder.openAtTurn;
}
function showEmpathCopyModal(){
  // Prend le pool de cartes de tous les IA, dédupliqué
  const seenIds=new Set();
  const allAiCards=G.ais.flatMap(ai=>ai.cards).filter(c=>!c._empathCopy&&!c.espCopy&&c.id&&!seenIds.has(c.id)&&seenIds.add(c.id));
  if(_decisionActive()){ // mode serveur : router le choix de carte à copier (Télépathie)
    _emitDecision('empath_copy', G.player,
      {options:allAiCards.map(c=>({id:c.id,name:c.name,emoji:c.emoji,effect:c.effect}))},
      applyEmpathCopy, (ans)=>(ans&&ans.cardId)||null);
    return;
  }
  const opts=allAiCards.map(c=>`
    <div class="inv-opt" onclick="applyEmpathCopy('${c.id}')">
      <div class="inv-opt-emoji">${c.emoji}</div>
      <div class="inv-opt-name">${c.name}</div>
      <div class="inv-opt-benefit">${c.effect}</div>
    </div>`).join('');
  document.getElementById('empath-copy-opts').innerHTML=opts||'<div style="color:#888">Aucune carte adverse disponible.</div>';
  document.getElementById('empath-copy-modal').classList.remove('hidden');
}
function applyEmpathCopy(cardId){
  document.getElementById('empath-copy-modal').classList.add('hidden');
  if(!cardId){render();return;}
  const original=G.ais.flatMap(a=>a.cards).find(c=>c.id===cardId);
  if(!original){render();return;}
  const copy={...original,id:'empath_copy_'+cardId,_empathCopy:true};
  G.player.cards.push(copy);
  // Copie uniquement les effets passifs (rGain, spec), pas les bonus one-shot
  if(copy.rGain)for(const[r,a]of Object.entries(copy.rGain))G.player.rpt[r]=(G.player.rpt[r]||0)+a;
  addLog('🧬 Télépathie : effets de '+original.emoji+' '+original.name+' copiés (passifs uniquement)','gold');
  closePopup();render();
}
/* ═══ UNE NATION ACCEPTE-T-ELLE LE MONOPOLE DE LA SPHÈRE DE DYSON ? ═══
   Cette règle vivait en dur dans `showDysonModal`, c'est-à-dire uniquement dans le cas où c'est
   TOI qui bâtis. Quand une IA bâtissait, personne ne la posait aux autres IA : elles n'avaient ni
   fenêtre, ni bonus, ni guerre — elles étaient simplement ignorées.
   (Marc, 2026-08-12 : « tu es sûr que si l'IA ou un autre joueur accepte que tu la construises il
   gagne le bonus de +3 en énergie ? » — la réponse était oui dans un sens, non dans l'autre.) */
function dysonAccepte(nat, batisseurId){
  if(!nat||!nat.civ) return true;
  const tension=(typeof getTens==='function')?getTens(nat.civ.id, batisseurId):0;
  const besoinEnergie=((nat.rpt&&nat.rpt.energy)||0)<2;
  return (tension<3&&besoinEnergie)||tension<2;
}
/* Verse le +3⚡/tour du partage énergétique, une seule fois, et le journalise nommément. */
function dysonPartage(nat){
  if(!nat) return;
  nat.rpt=nat.rpt||{};
  nat.rpt.energy=(nat.rpt.energy||0)+3;
  addLog('🔋 '+nat.civ.emoji+' '+nat.civ.name+' accepte le monopole — partage énergétique : '
    +'+3<i class=ri-energy></i>/tour.','gold');
}
function showDysonModal(){
  document.getElementById('dyson-title').textContent='⚡ Sphère de Dyson construite !';
  document.getElementById('dyson-sub').innerHTML='Monopole énergétique (+5<i class=ri-energy></i>/tour). Les autres acceptent (+3<i class=ri-energy></i>/tour) ou c\'est la guerre.';
  // Pour chaque IA : accepte si tensions[ai.civ.id] < 3 ET revenus énergie faibles
  let html='';
  const warTriggered=[];
  for(const ai of G.ais){
    const tension=getTens(ai.civ.id,'player');
    const needsEnergy=(ai.rpt.energy||0)<2;
    const accepts=dysonAccepte(ai, _moiId());   // même règle que lorsqu'une IA bâtit (voir dysonAccepte)
    const reason=accepts?(tension<2?'tension faible — pas de menace':'tension faible + besoin d\'énergie'):'tension élevée — refuse !';
    const color=accepts?'#80c880':'#ff8888';
    html+=`<div style="padding:8px 12px;border:1px solid ${color};border-radius:8px;margin-bottom:8px;color:${color};font-size:.88em">
      <strong>${ai.civ.emoji} ${ai.civ.name}</strong> — ${accepts?'✅ Accepte':'⚔️ Refuse'} <span style="color:#7080a0;font-size:.85em">(${reason})</span>
    </div>`;
    if(!accepts)warTriggered.push(ai);
  }
  if(_decisionActive()){ // mode serveur : chaque AUTRE HUMAIN décide accepter/guerre ; les IA gardent la décision auto
    const _humanOthers=G.ais.filter(a=>!a._isAI);
    const _aiRefusers=warTriggered.filter(a=>a._isAI).map(a=>a.civ.id); // seules les IA sont auto-décidées
    const _humanRefusers=[];
    const _builderName=G.player.civ.name, _builderId=G.player.civ.id;
    const _finalize=()=>{
      const refusing=_aiRefusers.concat(_humanRefusers);
      G._dysonWarTargets=refusing;
      if(refusing.length>0){
        _emitDecision('dyson_build', G.player,
          {refusing, accepting:G.ais.filter(a=>!refusing.includes(a.civ.id)).map(a=>a.civ.id)},
          'stDysonForcer', null);
      } else {
        _emitNotice('dyson_build', G.player, {refusing:[], accepting:G.ais.map(a=>a.civ.id)}, 'applyDysonClose');
      }
    };
    let _hi=0;
    const _askNextHuman=()=>{
      if(_hi>=_humanOthers.length){ _finalize(); return; }
      const _h=_humanOthers[_hi++];
      _emitDecision('human_dyson', _h, {builder:_builderId, builderName:_builderName},
        null, (ans)=>{ if(ans&&ans.war)_humanRefusers.push(_h.civ.id); _askNextHuman(); });
    };
    _askNextHuman();
    return;
  }
  document.getElementById('dyson-nations').innerHTML=html;
  // Boutons : si au moins une nation refuse, on peut FORCER (garder, guerre) ou RENONCER (annuler l'achat)
  const actsEl=document.getElementById('dyson-actions');
  if(warTriggered.length>0){
    actsEl.innerHTML=
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
      '<button class="eot-btn" style="flex:1;margin-top:0;background:linear-gradient(135deg,#8a2222,#5a0a0a);border-color:#cc4444;color:#ffcccc" onclick="applyDysonClose()"><i class=ri-energy></i> Forcer — guerre</button>'+
      '<button class="eot-btn" style="flex:1;margin-top:0;background:#14182e;border-color:#5a6a8a;color:#aab8d8" onclick="dysonRenounce()">↩️ Renoncer (annuler l\'achat)</button>'+
      '</div>';
  } else {
    actsEl.innerHTML='<button class="eot-btn" onclick="applyDysonClose()">Continuer</button>';
  }
  document.getElementById('dyson-modal').classList.remove('hidden');
  // Stocker pour applyDysonClose
  G._dysonWarTargets=warTriggered.map(a=>a.civ.id);
}
function dysonRenounce(){
  document.getElementById('dyson-modal').classList.add('hidden');
  G._dysonWarTargets=null;
  if(typeof undo==='function'&&undoStack.length>0){undo();addLog('↩️ Sphère de Dyson : achat annulé — tu renonces au monopole. Pas de guerre.','dim');}
  render();
}
function applyDysonClose(){
  document.getElementById('dyson-modal').classList.add('hidden');
  {const _refusing=G._dysonWarTargets||[];let _acc=0;for(const _ai of G.ais){if(!_refusing.includes(_ai.civ.id)){dysonPartage(_ai);_acc++;}}if(_acc>0)addLog('🔋 '+_acc+' nation(s) acceptent le monopole (+3<i class=ri-energy></i>/tour chacune).','dim');}
  if(G._dysonWarTargets&&G._dysonWarTargets.length>0){
    const names=G._dysonWarTargets.map(id=>{const ai=G.ais.find(a=>a.civ.id===id);return ai?ai.civ.emoji+' '+ai.civ.name:id;}).join(', ');
    addLog('<i class=ri-energy></i> Sphère de Dyson : '+names+' refus — Guerre !','red');
    G.warRisk=10;
    /* ⚠️ QUI EST L'AGRESSEUR ? Marc, 2026-08-09 : « dans sphère de Dyson seul le joueur qui a fait
       la Tech Dyson peut faire la guerre et décider d'attaquer des colonies, ça devrait être
       l'inverse, on était en guerre les deux contre lui. »
       C'est juste : celui qui bâtit la Sphère s'arroge un monopole, ceux qui REFUSENT lui déclarent
       la guerre. Ce sont donc EUX les agresseurs, et c'est à eux que la fenêtre d'assaut doit
       s'ouvrir. Le bâtisseur se défend. On nomme donc l'agresseur — la nation refusante — au lieu
       de l'étiquette `'dyson'`, que chaque lecteur interprétait comme « moi ». */
    for(const _tgt of G._dysonWarTargets){
      declareWar('Sphère de Dyson — Guerre pour le contrôle de l\'énergie solaire !','dyson',_tgt,_tgt);
      const _dw=_warBetween(_moiId(),_tgt); if(_dw)_dw.aiAggressor=true; // la refusante s'engage vraiment (au moins un assaut)
    }
  } else {
    addLog('<i class=ri-energy></i> Sphère de Dyson : toutes les nations acceptent le monopole énergétique.','gold');
  }
  G._dysonWarTargets=null;
  render();
}
function showMoraleWarning(){
  const m=G.player.res.morale||0;
  if(m>1)return;
  document.getElementById('dyson-title').textContent=m===0?'💔 Moral à 0 — Guerre civile !':'⚠️ Moral critique (1)';
  document.getElementById('dyson-sub').innerHTML=m===0
    ?'<b>Aucun revenu</b>, <b>AC ÷2</b>. Remonte le moral : techs Spiritualité, accords, Consolidation.'
    :'Ton moral est à 1 → tes <b>revenus sont divisés par 2</b> ce tour, et tu risques la guerre civile (0 = aucun revenu + AC ÷2). Remonte-le : techs Spiritualité, accords, carte « Consolidation ».';
  document.getElementById('dyson-nations').innerHTML='';
  document.getElementById('dyson-actions').innerHTML='<button class="eot-btn" style="background:linear-gradient(135deg,#8a2222,#5a0a0a);border-color:#cc4444;color:#ffcccc" onclick="document.getElementById(\'dyson-modal\').classList.add(\'hidden\')">Compris</button>';
  document.getElementById('dyson-modal').classList.remove('hidden');
}
function showAiDysonModal(aiId,cb){
  const ai=G.ais.find(a=>a.civ.id===aiId)||G.ais[0];
  if(_decisionActive()){ // mode serveur : router accepter/refuser le monopole Dyson d'une IA
    G._aiDysonId=aiId;G._aiDysonCb=cb;
    _emitDecision('ai_dyson', G.player,
      {builder:(ai?ai.civ.id:aiId), builderName:(ai?ai.civ.name:'IA')},
      null, (ans)=>{ aiDysonDecide(!!(ans&&ans.war)); });
    return;
  }
  document.getElementById('dyson-title').textContent='⚡ '+(ai?ai.civ.emoji+' '+ai.civ.name:'Une IA')+' a construit la Sphère de Dyson !';
  document.getElementById('dyson-sub').innerHTML='Monopole énergétique adverse. Accepte (+3<i class=ri-energy></i>/tour) ou refuse (= guerre).';
  document.getElementById('dyson-nations').innerHTML='';
  document.getElementById('dyson-actions').innerHTML=
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="eot-btn" style="flex:1;margin-top:0;background:#0e2a18;border-color:#3a8a5a;color:#9fe8b8" onclick="aiDysonDecide(false)">🤝 Accepter le monopole</button>'+
    '<button class="eot-btn" style="flex:1;margin-top:0;background:linear-gradient(135deg,#8a2222,#5a0a0a);border-color:#cc4444;color:#ffcccc" onclick="aiDysonDecide(true)">⚔️ Refuser — guerre</button>'+
    '</div>';
  G._aiDysonId=aiId;G._aiDysonCb=cb;
  document.getElementById('dyson-modal').classList.remove('hidden');
}
function aiDysonDecide(war){
  document.getElementById('dyson-modal').classList.add('hidden');
  const aiId=G._aiDysonId;const cb=G._aiDysonCb;G._aiDysonId=null;G._aiDysonCb=null;
  if(war){G.warRisk=10;declareWar('Sphère de Dyson ennemie — refus du monopole énergétique !','player',aiId);addLog('⚔️ Tu refuses la Sphère de Dyson — guerre déclarée !','red');}
  else{
    addLog('🤝 Tu acceptes le monopole énergétique de la Sphère de Dyson.','dim');
    dysonPartage(G.player);
    // Accepter le monopole = geste d'apaisement : termine toute guerre FRAÎCHEMENT déclarée avec le bâtisseur ce tour et calme la tension bilatérale.
    const _builder=G.ais.find(a=>a.civ.id===aiId);
    const _w=_warBetween(_moiId(),aiId);
    if(_w&&_w.justDeclared){
      const _i=G.wars.indexOf(_w);if(_i>=0)G.wars.splice(_i,1);
      setTens('player',aiId,2);setTens(aiId,'player',2);
      syncWarState();
      addLog('🕊️ Ton acceptation du monopole apaise '+(_builder?_builder.civ.emoji+' '+_builder.civ.name:'la nation')+' — la guerre est évitée.','gold');
    }
  }
  /* ⚠️ LES AUTRES NATIONS EXISTENT AUSSI. Cette fonction ne traitait que `G.player` : quand une IA
     bâtissait la Sphère, les DEUX autres IA n'étaient ni consultées, ni payées, ni fâchées — comme
     si elles n'étaient pas dans la partie. On leur applique donc la même règle qu'à toi : celles qui
     acceptent touchent leur +3⚡/tour, celles qui refusent déclarent la guerre au bâtisseur. */
  {
    const _bat=allPlayers().find(n=>n.civ.id===aiId);
    for(const _n of allPlayers()){
      if(!_n||_n===G.player||_n.civ.id===aiId) continue;      // toi : déjà traité ; le bâtisseur : pas concerné
      if(dysonAccepte(_n, aiId)) dysonPartage(_n);
      else {
        /* ⚠️ RETIRER LE +6 AVAIT RETIRÉ LA SEULE CONSÉQUENCE. Marc, 24/08 : « le refus de la sphère
           de Dyson déclare la guerre automatiquement donc pas besoin du +6 en tension ». Exact —
           mais la guerre n'était déclarée QUE pour la nation locale, quelques lignes plus haut
           (`declareWar`). Pour les autres nations, cette branche se contentait d'écrire dans le
           journal une tension « +6 » qui n'existait plus nulle part : un refus sans effet, et un
           journal qui mentait. `test_dyson_guerre.js` l'a attrapé au tour suivant.
           On déclare donc la guerre pour de bon, et c'est `declarerGuerre` qui pose la tension des
           deux camps à 10 — le maximum, sans avoir à l'additionner. La refusante est l'AGRESSEUR :
           c'est elle qui prend les armes contre un monopole qu'elle n'accepte pas. */
        if(_bat&&!_warBetween(_n.civ.id,_bat.civ.id)){
          declarerGuerre(_n,_bat,'Sphère de Dyson — refus du monopole énergétique','ai');
          const _dwn=_warBetween(_n.civ.id,_bat.civ.id); if(_dwn)_dwn.aiAggressor=true;
        }
        addLog('⚔️ '+_n.civ.emoji+' '+_n.civ.name+' REFUSE le monopole de '
          +(_bat?_bat.civ.emoji+' '+_bat.civ.name:aiId)+' — guerre déclarée au bâtisseur (tension 10).','red');
      }
    }
  }
  if(typeof cb==='function')cb();else render();
}
/* ═══════════════════ ESPIONNAGE — TROIS FILIÈRES, AUX TOURS 3, 4 ET 5 ═══════════════════
   Règle fixée par Marc le 2026-08-09 : « Espionnage ne permet pas de choisir chaque fin de
   tour 3/4/5 la branche qu'on veut copier. On devrait pouvoir voir les tech développées par
   les autres dans les diverses branches à chaque fin de tour, avec un choix par filière. »

   CE QUI A CHANGÉ. Avant : UN choix unique, au tour 3, sur UNE seule nation « cible » — celle
   que le jeu jugeait la plus avancée. Au tour 3 presque personne n'a deux technologies dans la
   même filière, donc l'investissement était le plus souvent gâché ; d'où le report bricolé
   (`_espEnAttente`) qui n'a jamais vraiment réglé le problème, il l'a déplacé.

   MAINTENANT : à la fin des tours 3, 4 et 5, on voit les technologies de TOUTES les autres
   nations regroupées par filière, et on en copie une, entière. Trois fenêtres, trois filières —
   ou la même filière plusieurs fois, ce qui n'a d'intérêt que si elle s'est enrichie entre-temps.
   Le report n'a plus lieu d'être : il n'y a plus rien à rattraper.

   TENSION : chaque nation à qui on a effectivement pris quelque chose en veut à l'espion (+4).
   On ne fâche donc plus une nation dont on n'a rien copié — c'était le cas avant, la « cible »
   étant désignée d'office. */
/* ═══════════════════ ESPIONNAGE — RÈGLE DE MARC, 2026-08-10 ═══════════════════
   « Il doit montrer à la fin du tour 3 les tech possédées par les adversaires y compris IA.
   Juste les titres et les catégories et les nations. Tu peux alors choisir de piller toute une
   catégorie. Si un joueur en a 3 tu pompes les trois technologies d'un coup. Mais ça c'est une
   cause de guerre alors disons tension +6 pour une tech, +8 pour deux tech et +10 pour trois
   technologies. La jauge augmente chez la nation pillée pas chez toi. Donc guerre populaire
   forcée. […] on devrait pouvoir choisir une tech à la fois, pas seulement une branche. »

   CE QUI NE MARCHAIT PAS (partie 321D, « on choisit mais ça se valide pas, demande trois fois ») :
     · LA VALIDATION. La question était émise avec un ADAPTATEUR (`adEspionnage`) qui transformait
       la réponse en simple chaîne. La suite, elle, attendait un objet et lisait `ans.branch` —
       donc `undefined`. Le choix partait bien, il n'était simplement jamais appliqué. Plus
       d'adaptateur : la suite reçoit la réponse telle quelle.
     · « TROIS FOIS ». La question revenait aux tours 3, 4 et 5. Une seule occasion désormais,
       REPORTABLE tant qu'on veut — c'est le bouton « attendre un tour » qui manquait.
     · « ON NE SAIT PAS À QUI SONT LES TECH ». Chaque ligne nomme la nation, la catégorie et les
       technologies.

   LA TENSION. Elle monte CHEZ LA VICTIME, envers l'espion — c'est elle qui a une raison d'en
   vouloir, pas l'inverse. 1 tech → +6, 2 → +8, 3 ou plus → +10. À 10, la guerre populaire est
   forcée : piller trois technologies d'un coup, c'est déclarer la guerre. */
const ESP_TENSION={1:6,2:8};        // au-delà de 2 technologies : 10, donc guerre forcée
function espTensionPour(n){ return n<=0?0:(ESP_TENSION[n]||10); }

/* Ce que les AUTRES possèdent, regroupé par (nation, catégorie). On ne montre que ce qui est
   copiable : leurs technologies de branche, hors copies d'espionnage et hors ce qu'on a déjà. */
function espInventaire(espion){
  const par=[];
  for(const n of allPlayers()){
    if(!n||n===espion) continue;
    const parBranche={};
    for(const c of (n.cards||[])){
      if(!c.branch||c.espCopy) continue;
      if(espion.cards.find(x=>x.id===c.id||x.id===c.id+'_esp')) continue;   // déjà à nous
      (parBranche[c.branch]||(parBranche[c.branch]=[])).push(c);
    }
    for(const b of Object.keys(parBranche)) par.push({nation:n, branch:b, cartes:parBranche[b]});
  }
  return par;
}
/* LA LISTE PROPOSÉE — RANGÉE PAR NATION, PAS PAR TYPE DE COUP.
   ⚠️ ELLE ÉTAIT TRIÉE À L'ENVERS DE LA FAÇON DONT ON DÉCIDE. Le premier jet listait TOUTES les
   catégories entières de TOUTES les nations, puis TOUTES les technologies une par une de toutes les
   nations. Marc, après la partie 0C10 : « J'ai pas vu s'afficher des catégories de tech pour les
   regrouper. Il faudrait regrouper par nation de manière plus claire. » Il avait raison : on
   choisit d'abord QUI on espionne, ensuite QUOI — pas l'inverse. Une même nation se retrouvait
   citée en haut et en bas de la liste, et rien ne disait combien elle avait de technologies.

   On range donc par NATION : d'abord celle qui a le plus à prendre, et pour chacune ses catégories
   entières puis ses technologies isolées. Chaque option porte `groupe` (le titre de section) et
   `groupeId` (la nation), ce qui permet à l'affichage — solo comme serveur — d'insérer un
   intertitre au lieu d'une liste plate.

   Chaque entrée porte un `id` : le serveur vérifie que la réponse vient bien de la liste, ce qui
   n'était pas possible sans identifiant. */
function _espOptions(espion){
  const inv=espInventaire(espion), opts=[];
  const tens=n=>' — tension +'+espTensionPour(n)+' chez la victime';

  // Regrouper l'inventaire par nation, la plus fournie en premier.
  const parNation=new Map();
  for(const e of inv){
    const k=e.nation.civ.id;
    if(!parNation.has(k)) parNation.set(k,{nation:e.nation, entrees:[], total:0});
    const g=parNation.get(k); g.entrees.push(e); g.total+=e.cartes.length;
  }
  const nations=[...parNation.values()].sort((a,b)=>b.total-a.total);

  for(const g of nations){
    const titre=g.nation.civ.emoji+' '+g.nation.civ.name+' — '+g.total+' technologie'+(g.total>1?'s':'')+' à prendre';
    const marque=o=>{ o.groupe=titre; o.groupeId=g.nation.civ.id;
      /* Clé de CATÉGORIE : c'est l'unité de sélection. Marc, 2026-08-15 : « c'est bien seulement
         d'une seule catégorie et chez un seul joueur », mais « il faudrait des cases à cocher pour
         choisir plusieurs tech ». On coche donc à l'intérieur d'un même bloc nation+catégorie. */
      if(o.nation&&o.branch){ o.categorieCle=o.nation+'|'+o.branch;
        o.categorieNom=(BRANCH_NAMES[o.branch]||o.branch); }
      return o; };
    // 1) les catégories entières de CETTE nation (le gros coup), les plus grosses d'abord
    for(const e of g.entrees.filter(x=>x.cartes.length>=2).sort((a,b)=>b.cartes.length-a.cartes.length)){
      opts.push(marque({ id:'lot:'+e.nation.civ.id+':'+e.branch, kind:'lot',
        nation:e.nation.civ.id, branch:e.branch, ids:e.cartes.map(c=>c.id),
        name:'📦 '+(BRANCH_NAMES[e.branch]||e.branch)+' — LA CATÉGORIE ENTIÈRE ('+e.cartes.length+')',
        desc:e.cartes.map(c=>c.emoji+' '+c.name).join(', ')+tens(e.cartes.length) }));
    }
    // 2) puis ses technologies une par une, catégorie par catégorie
    for(const e of g.entrees){
      for(const c of e.cartes){
        opts.push(marque({ id:'une:'+e.nation.civ.id+':'+c.id, kind:'une',
          nation:e.nation.civ.id, branch:e.branch, ids:[c.id],
          name:c.emoji+' '+c.name,
          desc:(BRANCH_NAMES[e.branch]||e.branch)+tens(1) }));
      }
    }
  }
  /* ⚠️ PLUS DE « ATTENDRE » AU DERNIER TOUR. L'option promettait une fenêtre qui ne reviendrait
     pas : au tour 5, reporter revient à jeter l'investissement, et le jeu le proposait sans le
     dire. On ne l'offre donc qu'aussi longtemps qu'elle est tenable. */
  if(opts.length&&G.turn<ESP_TOUR_DERNIER) opts.push({ id:'attendre', kind:'attendre', ids:[],
    groupe:'⏳ Ou ne rien faire ce tour-ci', groupeId:'_attendre',
    name:'⏳ Attendre un tour',
    desc:'Ne rien piller maintenant. La fenêtre reviendra à la fin du tour prochain — les autres '
        +'auront peut-être développé davantage. Dernière occasion au tour '+ESP_TOUR_DERNIER+'.' });
  return opts;
}
/* VALIDER UNE SÉLECTION À COCHER — une seule nation, une seule catégorie.
   ⚠️ ON NE FAIT PAS CONFIANCE À LA RÉPONSE. Elle vient du client : on vérifie que chaque
   identifiant coché appartient bien à l'inventaire volable de CETTE nation dans CETTE catégorie.
   Sans cela, un client bricolé pourrait réclamer n'importe quelle carte de la partie.
   Rend une option normalisée (même forme que les autres), ou `null` si la sélection est invalide. */
function espSelectionValide(espion, nationId, branch, ids){
  if(!espion||!nationId||!branch||!Array.isArray(ids)||!ids.length) return null;
  const e=espInventaire(espion).find(x=>x.nation.civ.id===nationId && x.branch===branch);
  if(!e) return null;
  const dispo=new Set(e.cartes.map(c=>c.id));
  const retenus=[...new Set(ids)].filter(id=>dispo.has(id));      // doublons écartés, intrus rejetés
  if(!retenus.length) return null;
  const noms=e.cartes.filter(c=>retenus.includes(c.id)).map(c=>c.emoji+' '+c.name);
  return { id:'sel:'+nationId+':'+branch+':'+retenus.join(','), kind:'selection',
    nation:nationId, branch:branch, ids:retenus,
    name:noms.join(', '),
    desc:(BRANCH_NAMES[branch]||branch)+' — tension +'+espTensionPour(retenus.length)+' chez la victime' };
}
/* ═══ LA RÉPONSE NE PORTE PLUS QUE DES IDENTIFIANTS D'OPTIONS (Marc, 2026-08-25) ═══
   « Pour l'espionnage mon problème c'est que ça me donne jamais la tech espionnée… On a vu que pour
   la Télépathie ça marchait, donc applique la même chose puisque ça marche. »

   Il a raison, et la comparaison est éclairante. La Télépathie renvoie UN identifiant tiré de la
   liste qu'on vient d'afficher (`cardId`), et rien d'autre : impossible de se tromper, impossible
   qu'un maillon l'égare. L'espionnage, lui, renvoyait un TRIPLET reconstruit à la main côté écran —
   `{nation, branch, ids}` — dont deux champs ne figuraient dans aucune liste proposée. Chaque
   maillon devait donc les comprendre : le client pour les fabriquer, l'assainisseur du serveur pour
   les laisser passer, le moteur pour les revalider. Trois occasions de diverger, et elles ont
   divergé trois fois (16/08, 23/08, 25/08 — la dernière : l'assainisseur jetait `branch`).

   Désormais l'écran renvoie `{ids:['une:martiens:bio1', …]}` : uniquement des identifiants
   D'OPTIONS, ceux-là mêmes que le moteur a proposés. La nation et la catégorie s'en DÉDUISENT, donc
   plus personne n'a besoin de les transmettre. La règle « une seule catégorie chez une seule
   nation » se vérifie ici, une fois, au seul endroit qui connaisse la vérité. */
function espSelectionDepuisOptions(espion, ids){
  if(!espion||!Array.isArray(ids)||!ids.length) return null;
  const opts=_espOptions(espion);
  const choisies=[...new Set(ids)].map(id=>opts.find(o=>o&&o.id===id)).filter(o=>o&&o.ids&&o.ids.length);
  if(!choisies.length) return null;
  const nation=choisies[0].nation, branch=choisies[0].branch;
  if(!nation||!branch) return null;
  /* Une seule catégorie chez une seule nation : on écarte tout ce qui déborde plutôt que de
     refuser l'ensemble — un clic parasite ne doit pas coûter la fenêtre au joueur. */
  const cartes=[];
  for(const o of choisies){
    if(o.nation!==nation||o.branch!==branch) continue;
    for(const cid of o.ids) if(!cartes.includes(cid)) cartes.push(cid);
  }
  return espSelectionValide(espion, nation, branch, cartes);
}
/* Copie effective. Rend le nombre de cartes prises. */
function espPiller(espion, opt){
  if(!opt||!opt.ids||!opt.ids.length) return 0;
  const victime=allPlayers().find(n=>n.civ.id===opt.nation);
  if(!victime) return 0;
  let pris=0; const noms=[];
  for(const id of opt.ids){
    const carte=(victime.cards||[]).find(c=>c.id===id);
    if(!carte) continue;
    if(espion.cards.find(x=>x.id===carte.id||x.id===carte.id+'_esp')) continue;
    const copie={...carte, id:carte.id+'_esp', espCopy:true};
    espion.cards.push(copie); applyCard(copie,espion); pris++;
    noms.push((carte.emoji||'')+' <b>'+carte.name+'</b>'+(carte.effect?' — <span style="opacity:.8">'+carte.effect+'</span>':''));
    addLog('🕵️ '+espion.civ.emoji+' '+espion.civ.name+' vole '+carte.emoji+' '+carte.name
      +' à '+victime.civ.emoji+' '+victime.civ.name,'gold');
  }
  if(!pris) return 0;
  /* LA TENSION VA CHEZ LA VICTIME, envers l'espion — pas l'inverse (règle de Marc). C'est elle
     qui a une raison d'en vouloir. À 10, la guerre populaire devient inévitable. */
  const t=espTensionPour(pris);
  if(typeof addTens==='function') addTens(victime.civ.id, espion.civ.id, t);
  const niveau=(typeof getTens==='function')?getTens(victime.civ.id,espion.civ.id):t;
  addLog('🕵️ '+victime.civ.emoji+' '+victime.civ.name+' a détecté l\'espionnage de '
    +espion.civ.name+' — '+pris+' technologie(s) volée(s), tension +'+t+' envers lui ('+niveau+'/10).','red');
  if(niveau>=10) addLog('🚨 Tension à 10 : la population de '+victime.civ.name+' exige la guerre contre '
    +espion.civ.name+' !','red');
  if(typeof _journalAuto==='function')_journalAuto(espion.civ.name,'Espionnage',pris+' tech volée(s) à '+victime.civ.name+' — tension +'+t);

  /* ═══ LE RÉCAPITULATIF, AUX DEUX CAMPS (Marc, 2026-08-10) ═══
     « je voulais voir un récapitulatif de ce qui a été volé et que ce soit indiqué au voleur et
     au volé. » Sans cela, le bénéfice de l'investissement était invisible : le joueur ne savait
     pas ce qu'il venait de gagner, et la victime ignorait pourquoi sa tension explosait.
     `notifyNationHit` est le bon outil : il ouvre une fenêtre chez un HUMAIN, en solo comme en
     ligne, et ne dérange pas les IA (tout reste au journal pour elles). */
  const liste='• '+noms.join('<br>• ');
  notifyNationHit(espion, '🕵️ Espionnage réussi',
    '<b>'+pris+' technologie'+(pris>1?'s':'')+' volée'+(pris>1?'s':'')+'</b> à '
    +victime.civ.emoji+' '+victime.civ.name+' :<br>'+liste
    +'<br><br>Elles sont à toi dès maintenant, avec tous leurs effets.'
    +'<br><span style="color:#ff9a8a">Contrepartie : tension +'+t+' chez '+victime.civ.name
    +' envers toi ('+niveau+'/10)'+(niveau>=10?' — sa population exige la guerre.':'.')+'</span>');
  notifyNationHit(victime, '🕵️ Tu as été espionné !',
    victime.civ.name+' a découvert que '+espion.civ.emoji+' '+espion.civ.name
    +' a dérobé <b>'+pris+' de tes technologie'+(pris>1?'s':'')+'</b> :<br>'+liste
    +'<br><br>Tu les gardes — mais il les a aussi.'
    +'<br><span style="color:#ff9a8a">Ta population lui en veut : tension +'+t+' ('+niveau+'/10)'
    +(niveau>=10?'<br><b>À 10, la guerre est inévitable.</b>':'')+'</span>');
  return pris;
}
/* L'IA prend le plus gros lot disponible, sans fenêtre. Même règle que l'humain. */
function espChoixIA(espion){
  const opts=_espOptions(espion).filter(o=>o.kind!=='attendre');
  if(!opts.length){ addLog('🕵️ '+espion.civ.name+' — rien à espionner pour l\'instant.','dim'); return false; }
  espPiller(espion,opts[0]);
  espion._espFait=true;
  return true;
}
/* ═══════ QUAND LA FENÊTRE S'OUVRE, ET QUAND ELLE SE FERME ═══════
   ⚠️ ELLE N'AVAIT PAS DE FIN. Le code ne posait qu'une borne BASSE (`G.turn<3`), alors que tout
   le reste du jeu — le texte de la carte, le commentaire ci-dessus, le décompte de `investBonus` —
   annonce un investissement de niveau 1 actif de T3 à T5. Journal de Marc du 16/08 : la fenêtre
   d'espionnage revient aux tours 3, 4, 5, 6, 7, 8, 9 ET 10, y compris après la ligne
   « ⌛ investissement Niv.1 expiré (T3→T5 couverts) » du tour 6. L'outil survivait à ce qui le
   justifie, et pouvait donc voler des technologies bien après la fin de son financement.
   Les deux bornes sont désormais écrites au même endroit, et l'expiration de l'investissement les
   suit. */
const ESP_TOUR_PREMIER=3, ESP_TOUR_DERNIER=5;
/* ÉTAT DE FLUX — fin des tours 3, 4 et 5, jusqu'à ce que l'espionnage soit utilisé. */
function stEspionnage(){
  const d=fluxDonnees();
  if(G.turn<ESP_TOUR_PREMIER||G.turn>ESP_TOUR_DERNIER){ stBilanDeTour(); return; }
  const candidats=allPlayers().filter(p=>p&&p._inv1==='inv_esp'&&!p._espFait&&p._espTour!==G.turn);
  for(const p of candidats) p._espTour=G.turn;      // une seule sollicitation par tour
  for(const p of candidats.filter(p=>p._isAI)) espChoixIA(p);
  const humains=candidats.filter(p=>!p._isAI);
  const local=_civLocale();   // « qui est devant cet écran », pour router la fenêtre — pas une règle
  d.espRestants=[];
  for(const p of humains){
    const opts=_espOptions(p);
    if(!opts.length){
      addLog('🕵️ '+p.civ.emoji+' '+p.civ.name+' — aucune technologie à voler pour l\'instant'
        +(G.turn<ESP_TOUR_DERNIER?' ; la fenêtre reviendra au prochain tour.'
                                 :' — et c\'était la dernière fenêtre (l\'investissement couvre T3→T5).'),'dim');
      continue;
    }
    d.espRestants.push(p.civ.id);
    const charge={tour:G.turn, options:opts};
    /* ⚠️ AUCUN ADAPTATEUR (5e argument à `null`). C'est un adaptateur qui a fait échouer la
       validation dans la partie 321D : il rendait une chaîne, alors que la suite lit un objet. */
    if(p.civ.id===local) _emitDecision('espionage', p, charge, 'stEspionnageRecu', null);
    else _emitRemote('espionage', p, charge, 'stEspionnageRecu', null);
  }
  if(!d.espRestants.length){ stBilanDeTour(); return; }
}
function stEspionnageRecu(ans, civId){
  const d=fluxDonnees();
  const cid=civId||(ans&&ans._civ)||null;
  const nat=allPlayers().find(p=>p.civ.id===cid)||G.player;
  const choisi=(ans&&(ans.id||ans.branch))||null;      // `branch` toléré : anciens clients
  if(nat){
    /* SÉLECTION À COCHER : plusieurs technologies d'une même catégorie chez une même nation.
       Elle est validée contre l'inventaire réel avant d'être appliquée (voir `espSelectionValide`). */
    let opt=null;
    /* 1) FORME COURANTE — des identifiants d'options, comme la Télépathie. */
    if(ans && Array.isArray(ans.ids) && ans.ids.length) opt=espSelectionDepuisOptions(nat, ans.ids);
    /* 2) Forme précédente `{nation, branch, ids-de-cartes}` : tolérée pour un client resté en
       cache, et pour les parties reprises d'une sauvegarde antérieure. */
    if(!opt && ans && Array.isArray(ans.ids) && ans.ids.length && ans.nation && ans.branch)
      opt=espSelectionValide(nat, ans.nation, ans.branch, ans.ids);
    /* 3) Choix unique par identifiant d'option (panneau de repli, pilote, bot). */
    if(!opt) opt=_espOptions(nat).find(o=>o.id===choisi);
    if(!opt||opt.kind==='attendre'){
      /* ⚠️ CE MESSAGE EST AUSSI UN SIGNAL D'ALARME. Il ne s'écrit que si une réponse est arrivée
         sans qu'aucune option valide n'ait pu en être tirée. Dans le journal de Marc du 16/08 il
         apparaît HUIT fois d'affilée : le choix partait bien et se faisait rejeter à chaque tour.
         On dit désormais POURQUOI, sinon on ne peut pas distinguer « j'ai cliqué Attendre » d'une
         sélection refusée — c'est ce qui a rendu ce défaut si long à cerner. */
      const _volontaire=!!(ans&&(ans.id==='attendre'||choisi==='attendre'));
      /* ⚠️ ON DIT CE QU'ON A REÇU. « Sélection invalide » sans le contenu de la réponse a coûté deux
         diagnostics à l'aveugle (Marc, parties du 16 et du 23/08). Les CLÉS suffisent à trancher :
         `{branch}` seul = client d'avant le 17/08 resté en cache — il n'envoie pas d'identifiant
         d'option, et aucune réponse de cette forme ne peut être appliquée. */
      if(!_volontaire) addLog('🕵️ ⚙️ Réponse reçue : {'+Object.keys(ans||{}).join(', ')+'}'
        +((ans&&ans.branch&&!ans.ids&&!ans.id)?' — forme ANCIENNE (client en cache) : demande au joueur de recharger la page.':''),'dim');
      addLog('🕵️ '+nat.civ.emoji+' '+nat.civ.name+' — espionnage '
        +(_volontaire?'reporté volontairement':'NON APPLIQUÉ : sélection invalide ou vide')
        +(G.turn<ESP_TOUR_DERNIER?' — la fenêtre reviendra à la fin du tour prochain.'
                                 :' — et c\'était la dernière fenêtre (T3→T5).'),'dim');
    }else{
      if(espPiller(nat,opt)>0) nat._espFait=true;
    }
  }
  const rest=d.espRestants;
  if(Array.isArray(rest)){
    const i=rest.indexOf(nat?nat.civ.id:cid); if(i>=0) rest.splice(i,1);
    if(rest.length) return;
  }
  d.espRestants=null;
  stBilanDeTour();
}
/* Fenêtre SOLO. En ligne, online.js rend la même charge utile. */
/* ⚠️ ON NE CHOISIT PLUS « TOUT OU UNE SEULE ». La liste proposait soit UNE technologie, soit la
   CATÉGORIE ENTIÈRE — impossible d'en prendre exactement deux, alors que la règle de Marc prévoit
   +6 / +8 / +10 de tension selon qu'on en vole une, deux ou trois. Le jeu savait compter, l'écran
   ne savait pas demander. Marc, 2026-08-15 : « il faudrait des cases à cocher pour choisir plusieurs
   tech mais c'est bien seulement d'une seule catégorie et chez un seul joueur ».
   On coche donc à l'intérieur d'un bloc nation + catégorie, et le bouton dit ce que ça coûtera. */
function _espBlocs(opts){
  const blocs=new Map();
  for(const o of opts){
    if(o.kind!=='une'||!o.categorieCle) continue;
    if(!blocs.has(o.categorieCle)) blocs.set(o.categorieCle,{cle:o.categorieCle, groupe:o.groupe,
      nation:o.nation, branch:o.branch, categorieNom:o.categorieNom, techs:[]});
    blocs.get(o.categorieCle).techs.push(o);
  }
  return [...blocs.values()];
}
function showEspionageChoiceModal(){
  const opts=_espOptions(G.player);
  if(!opts.length){ addLog('🕵️ Espionnage : aucune technologie à voler pour l\'instant.','dim'); return; }
  document.getElementById('espionage-modal-sub').textContent=
    'Coche les technologies à voler — une seule catégorie, chez une seule nation. La tension monte CHEZ ELLE.';
  let html='', grp=null;
  for(const b of _espBlocs(opts)){
    if(b.groupe&&b.groupe!==grp){ grp=b.groupe; html+='<div class="esp-groupe">'+b.groupe+'</div>'; }
    html+='<div class="esp-cat" data-cle="'+b.cle+'">'
      +'<div class="esp-cat-nom">'+b.categorieNom+'</div>';
    for(const t of b.techs)
      html+='<label class="esp-tech"><input type="checkbox" data-cle="'+b.cle+'" value="'+t.ids[0]+'" onchange="_espCoche(this)"> <span>'+t.name+'</span></label>';
    html+='<div class="esp-cat-pied" id="pied-'+b.cle+'"></div></div>';
  }
  const att=opts.find(o=>o.kind==='attendre');
  if(att) html+='<div class="inv-opt" onclick="applyEspionageChoice(\'attendre\')" style="margin-top:10px">'
    +'<div class="inv-opt-name">'+att.name+'</div><div class="inv-opt-benefit">'+att.desc+'</div></div>';
  document.getElementById('espionage-branch-opts').innerHTML=html;
  document.getElementById('espionage-modal').classList.remove('hidden');
}
/* Une seule catégorie à la fois : cocher ailleurs décoche le bloc précédent, plutôt que de refuser
   le clic sans rien dire. */
function _espCoche(input){
  const cle=input.getAttribute('data-cle');
  if(input.checked)
    document.querySelectorAll('#espionage-branch-opts input[type=checkbox]').forEach(x=>{
      if(x.getAttribute('data-cle')!==cle) x.checked=false; });
  document.querySelectorAll('#espionage-branch-opts .esp-cat').forEach(div=>{
    const c=div.getAttribute('data-cle');
    const pris=[...document.querySelectorAll('#espionage-branch-opts input[data-cle="'+c+'"]')].filter(x=>x.checked);
    const pied=document.getElementById('pied-'+c); if(!pied)return;
    pied.innerHTML = pris.length
      ? ('<button class="eot-btn esp-go" onclick="_espValider(\''+c+'\')">🕵️ Voler '+pris.length
         +' technologie'+(pris.length>1?'s':'')+' — tension +'+espTensionPour(pris.length)+' chez la victime</button>')
      : '';
  });
}
function _espValider(cle){
  const ids=[...document.querySelectorAll('#espionage-branch-opts input[data-cle="'+cle+'"]')]
    .filter(x=>x.checked).map(x=>x.value);
  if(!ids.length)return;
  const [nation,branch]=cle.split('|');
  const el=document.getElementById('espionage-modal'); if(el) el.classList.add('hidden');
  stEspionnageRecu({nation:nation, branch:branch, ids:ids}, G.player.civ.id);
}
function applyEspionageChoice(optId){
  const el=document.getElementById('espionage-modal'); if(el) el.classList.add('hidden');
  stEspionnageRecu({id:optId}, G.player.civ.id);
}

/* (`_finishInvestmentsAfterEspionage` supprimée : elle n'existait que pour rattraper le flux
   après la fenêtre d'espionnage du tour 3. Cette fenêtre a été déplacée aux fins de tours 3, 4
   et 5, et `applyInvestments` suit désormais un chemin unique.) */
const BRANCH_NAMES={
  expansion:'Expansion',
  navigation:'Navigation & Moteurs',
  ia_renseignement:'IA & Renseignement',
  sciences_exp:'Sciences Expér.',
  spiritualite_nature:'Spiritualité & Nature',
  mines_energie:'Mines & Énergie',
  empathes:'Empathes',
};
function applyInvestments(){
  if(G.investApplied)return;G.investApplied=true;
  /* L'ESPIONNAGE NE S'INTERCEPTE PLUS ICI. Il se joue aux fins de tour 3, 4 et 5 (`stEspionnage`).
     Le mécanisme de report (`_espEnAttente`, `_espFait`, `_finishInvestmentsAfterEspionage`) existait
     parce qu'un choix unique au tour 3 tombait presque toujours trop tôt ; avec trois occasions
     échelonnées, il n'a plus d'objet et a été supprimé. */
  const pCard=INVESTMENT_CARDS.find(c=>c.id===G.player._inv1);
  const aCard=INVESTMENT_CARDS.find(c=>c.id===(G.ais[0]&&G.ais[0]._inv1));     // affichage seulement
  // Revérification au prélèvement (même raison qu'au Niv.2, voir `applyInvestments2`).
  if(pCard) investAppliquer(pCard,G.player);
  for(const a of G.ais){const ac=INVESTMENT_CARDS.find(c=>c.id===a._inv1);if(ac) investAppliquer(ac,a);}
  // Niv.1 : actif T3→T5 (3 tours) — turnsLeft=4 pour compenser le décompte immédiat dans startTurn
  for(const p of allPlayers()){if(p.investBonus)p.investBonus.turnsLeft=4;}
  addLog('💼 Tour 3 : effets Investissement Niv.1 appliqués — actifs T3→T5 !','gold');
  if(pCard)_journalAuto(G.player.civ.name,'Résolution investissement Niv.1',pCard.name);
  for(const a of G.ais){const ac2=INVESTMENT_CARDS.find(c=>c.id===a._inv1);if(ac2)_journalAuto(a.civ.name,'Résolution investissement Niv.1',ac2.name);}
  // Popup de confirmation avec résumé des effets actifs
  if(pCard) showInvestmentActiveModal(pCard, aCard);
}
function showInvestmentActiveModal(pCard, aCard){
  if(typeof _ilHide==='function')_ilHide();
  const el=document.getElementById('invest-active-modal');
  if(!el)return;
  const pBenef=pCard?pCard.benefit:'—';
  const aBenef=aCard?`${aCard.emoji} ${aCard.name} : ${aCard.benefit}`:'—';
  document.getElementById('inv-active-your').innerHTML=`${pCard.emoji} ${pCard.name} : ${pBenef}`;
  document.getElementById('inv-active-ai').innerHTML=aBenef;
  el.classList.remove('hidden');
}
function dismissInvestActive(){
  document.getElementById('invest-active-modal').classList.add('hidden');
}
/* ============================================================ STRATEGY ============================================================ */
// ── DRAFT DES BONUS DE DÉBUT DE TOUR (mémo #12) : pool commun limité, choix du plus faible (VP) au plus fort, égalité départagée par jetons Force ──
function runStrategyDraft(){
  _startTurnPrep(); // revenus + AC à jour AVANT le choix des cartes Stratégie
  // ORDRE (Marc) : l'ÉVÉNEMENT DU TOUR SUIVANT est présenté AVANT le choix des cartes Stratégie — sinon on
  // choisit sa stratégie sans savoir ce qui arrive, ce qui vide l'annonce de son intérêt.
  // (Avant : l'annonce était faite en fin de _startTurnBegin, donc APRÈS le draft.)
  G.curEvent=eventForTurn(G.turn);              // se résout en fin de CE tour
  G.nextEvent=eventForTurn(G.turn+1);           // révélé maintenant pour qu'on s'y prépare
  G._announcedTurn=G.turn;                      // évite une seconde annonce dans _startTurnBegin
  if(G.nextEvent){ render(); showEventAnnounce(G.nextEvent, '_runStrategyDraftAfterAnnounce'); return; }
  _runStrategyDraftAfterAnnounce();
}
function _runStrategyDraftAfterAnnounce(){
  const nations=[G.player,...G.ais];
  /* ORDRE DU DRAFT : le joueur le plus FAIBLE choisit en premier (règle voulue par Marc).
     ⚠️ BUG CORRIGÉ LE 2026-08-07 : on comparait `calcVP(a)` à `calcVP(b)` — or `calcVP` rend un
     OBJET `{colVP,…,total}`, pas un nombre. Donc `va!==vb` était TOUJOURS vrai (deux objets
     distincts) et `va-vb` valait `NaN` : un comparateur qui rend NaN ne trie RIEN. L'ordre était en
     réalité l'ordre naturel des nations, et la règle du plus faible n'était plus appliquée depuis
     que `calcVP` a cessé de rendre un simple nombre (rétablissement du détail des VP).
     Le `.total` est donc indispensable — c'est lui, le classement. */
  /* ORDRE EXACT DEMANDÉ PAR MARC (2026-08-07), du plus faible au plus fort, dans cet ordre de
     départage — chaque critère ne servant qu'en cas d'égalité parfaite sur le précédent :
        1. moins de points de victoire        2. moins de jetons militaires
        3. moins de colonies                  4. moins de routes
        5. moins de revenu (matériaux + énergie)
     Les deux derniers critères manquaient : à égalité de VP et de jetons — fréquent au tour 1, où
     tout le monde est à 0 — l'ordre retombait sur l'ordre de déclaration des nations, c'est-à-dire
     le joueur local en premier. Ce n'était pas « le plus faible d'abord », c'était « toi d'abord ». */
  const _revenu=p=>{
    try{ if(typeof _netIncome==='function'){ const n=_netIncome(p)||{}; return (n.materials||0)+(n.energy||0); } }catch(e){}
    return ((p.rpt&&p.rpt.materials)||0)+((p.rpt&&p.rpt.energy)||0);
  };
  const _criteres=p=>[calcVP(p).total,(p.forceTokens||0),(p.colonies||[]).length,(p.routes||[]).length,_revenu(p)];
  const order=nations.slice().sort((a,b)=>{
    const ca=_criteres(a), cb=_criteres(b);
    for(let i=0;i<ca.length;i++) if(ca[i]!==cb[i]) return ca[i]-cb[i];   // croissant : le plus faible choisit avant
    return 0;
  });
  /* L'ordre est ÉCRIT dans le journal : c'était invérifiable, donc indiscutable dans les deux sens.
     Marc : « y a toujours un bug sur la détermination du joueur le plus faible » — sans trace, ni
     lui ni moi ne pouvions le prouver. Maintenant si l'ordre est faux, il se voit. */
  try{
    /* Fait de partie, pas d'une nation — voir la note d'auteur du journal. */
    logAuteur('systeme',()=>addLog('🃏 Ordre du draft Stratégie (du plus faible au plus fort) : '
      + order.map((p,i)=>(i+1)+'. '+p.civ.name+' ('+calcVP(p).total+' VP, '+(p.forceTokens||0)+'⚔️)').join(' · '),'dim'));
  }catch(e){}
  /* TAILLE DE LA PIOCHE — constante à tous les tours (choix de Marc, 2026-08-07 : option « b »).
     AVANT : `nations + (tour===1 ? 3 : 2)`. La pioche perdait donc une carte entre le tour 1 et le
     tour 2, et ne la retrouvait jamais. Marc, en voyant le choix rétrécir : « j'ai demandé ça
     moi ? » — non, ça n'avait jamais été demandé.
     La MÉCANIQUE DE DRAFT est conservée : chaque nation qui choisit retire sa carte de la pioche,
     donc passer en dernier coûte toujours quelque chose. C'est voulu — c'est ce qui donne son sens
     à l'ordre de passage (le plus faible choisit en premier). Ce qui ne l'était pas, c'est que la
     pioche DE DÉPART rétrécisse d'un tour à l'autre. */
  const poolSize=Math.min(STRATEGY_CARDS.length, nations.length+2);
  G._stratPool=shuffle([...STRATEGY_CARDS]).slice(0,poolSize);
  // Tracé aussi : « je vois 3 cartes » et « le code en prépare 5 » ne peuvent plus rester une
  // discussion d'opinion. Si le journal dit 5 et que l'écran en montre 3, le défaut est APRÈS ici.
  try{ addLog('🃏 Pioche Stratégie : '+poolSize+' cartes pour '+nations.length+' nations ('+nations.length+' + 2, plafonné à '+STRATEGY_CARDS.length+').','dim'); }catch(e){}
  /* ⚠️ ON RANGE DES IDENTIFIANTS, PAS DES OBJETS NATION — ET C'EST UN CORRECTIF, PAS UN STYLE.
     `G._stratOrder` contenait les objets eux-mêmes, et la file était consommée par comparaison
     d'IDENTITÉ (`G._stratOrder[0]===nat`). Ça marche tant que la partie vit en mémoire. Dès qu'elle
     passe par JSON — sauvegarde, redémarrage du serveur — les objets rangés ici deviennent des
     COPIES : plus jamais `===` aux nations rendues par `allPlayers()`. Le `shift()` ne se faisait
     donc plus, `_runDraftStep` reposait éternellement la question au MÊME joueur, et le suivant
     restait en attente. Mesuré : le joueur A recevait huit fois d'affilée `decision:strategy`
     pendant que B voyait un sablier — une partie reprise sur deux ne repartait pas.
     Le draft est la question la plus fréquente du jeu (une par joueur et par tour) : c'est donc
     l'endroit le plus probable où une sauvegarde tombe. Un identifiant, lui, survit à JSON. */
  G._stratOrder=order.map(n=>n.civ.id);
  G._stratPlayerRank=G._stratOrder.indexOf(G.player.civ.id)+1;G._stratTotal=G._stratOrder.length;
  G.ais.forEach(a=>a._draftedStrat=null);
  _runDraftStep();
}
function _aiBestStratFromPool(ai,pool){
  const prefs=[];
  if((ai.res.morale||0)<=3)prefs.push('st8');
  if(ai.forceTokens<=1&&(G.warState||(G.warRisk||0)>=5))prefs.push('st2');
  if((ai.res.science||0)<=2)prefs.push('st3');
  if((ai.res.materials||0)<=2||(ai.res.energy||0)<=2)prefs.push('st4');
  prefs.push('st6','st2','st7','st3','st4','st8','st1','st5','st9');
  for(const id of prefs){const c=pool.find(x=>x.id===id);if(c)return c;}
  return pool[0];
}
/* La réponse au draft Stratégie : `civId` vient du courtier, pas d'une fermeture. On retrouve la
   nation par son identifiant — la seule chose qui survive vraiment à une sauvegarde. */
function stStrategieChoisie(ans, civId){
  const cid=civId||(ans&&ans._civ)||null;
  const ordre=G._stratOrder||[];
  const _tous=(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[]));
  const nat=_tous.find(p=>p&&p.civ&&p.civ.id===cid)||_tous.find(p=>p&&p.civ&&p.civ.id===ordre[0]);
  _resolveStratChoice(nat, ans&&ans.cardId);
}
/* ─── LA PHRASE DU DRAFT ───────────────────────────────────────────────────────
   ⚠️ LE DÉFAUT ÉTAIT ICI, ET C'ÉTAIT UN DÉFAUT DE TEXTE, PAS DE RÈGLE.
   La fenêtre recevait `rank: order.length` — c'est-à-dire le nombre de nations qui n'ont PAS encore
   choisi, et non la position du joueur. Les deux se ressemblent assez pour passer inaperçus, et se
   contredisent complètement : à deux nations, le joueur qui choisit en DERNIER voyait « 1er/2 », et
   celui qui choisissait en PREMIER voyait « 2e/2 ». Le compte des cartes, lui, était juste depuis le
   début — c'est le texte qui mentait, et qui m'a fait chercher un bug dans la pioche.
   La position vraie est : total − restants + 1.
   On formule aussi la phrase en clair (demande de Marc) : le rang de FORCE est l'inverse du rang de
   choix, puisque le plus faible choisit en premier. Une seule fonction la produit, pour que les
   modes solo et en ligne ne puissent pas dire deux choses différentes. */
function _draftOrdinal(n){ return n===1?'premier':(n===2?'deuxième':(n===3?'troisième':(n===4?'quatrième':n+'ème'))); }
function draftPhrase(pos,total){
  // Rang inconnu : on le DIT, au lieu d'inventer une position (c'est le `||1` de l'ancienne version
  // qui affichait « 1er » quand l'information manquait — la valeur la plus trompeuse possible).
  if(!pos||!total) return 'Ordre de choix indéterminé — à signaler.';
  const force=total-pos+1;                       // 1 = le plus fort
  const quand='tu choisis en '+_draftOrdinal(pos);
  if(pos===1)     return 'Tu es le joueur le plus FAIBLE : '+quand+'.';
  if(force===1)   return 'Tu es le joueur le plus FORT : '+quand+' (dernier).';
  return 'Tu es le '+_draftOrdinal(force)+' joueur le plus fort : '+quand+'.';
}
function _runDraftStep(){
  const order=G._stratOrder,pool=G._stratPool;if(!order){_startTurnBegin();return;}
  const _natDe=id=>(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[])).find(p=>p&&p.civ&&p.civ.id===id);
  while(order.length){
    const nat=_natDe(order[0]);
    if(!nat){ order.shift(); continue; }   // nation disparue (siège libéré) : on n'attend pas un fantôme
    const _total=G._stratTotal||order.length;
    const _pos=_total-order.length+1;            // position RÉELLE de celui qui choisit maintenant
    const _phrase=draftPhrase(_pos,_total);
    if(_isRemote(nat)){ // EN LIGNE : humain DISTANT (pivot) → relayer son choix de Stratégie
      /* SUITE NOMMÉE. La carte Stratégie est la question la PLUS FRÉQUENTE du jeu (une par joueur
         et par tour) : tant que sa suite était une fermeture, une partie enregistrée pendant le
         draft — c'est-à-dire une partie sur deux — ne redémarrait pas. La nation qui répond est
         rendue par le courtier (second argument), il n'y a donc rien à capturer. */
      _emitRemote('strategy', nat,
        {rank:_pos, total:_total, phrase:_phrase, options:pool.map(c=>({id:c.id,name:c.name,emoji:c.emoji,desc:c.desc,calmTension:c.calmTension||0}))},
        'stStrategieChoisie', null);
      return;
    }
    if(nat._isAI===false){ // une nation HUMAINE doit choisir
      if(_decisionActive()){ // mode serveur : router vers ce joueur
        _emitDecision('strategy', nat,
          {rank:_pos, total:_total, phrase:_phrase, options:pool.map(c=>({id:c.id,name:c.name,emoji:c.emoji,desc:c.desc,calmTension:c.calmTension||0}))},
          'stStrategieChoisie', null);
      } else { G._stratPlayerRank=_pos; G._stratTotal=_total; showStrategyModal(); } // solo : l'unique humain est G.player
      return;
    }
    order.shift();
    if(pool.length){const c=_aiBestStratFromPool(nat,pool);const i=pool.findIndex(x=>x.id===c.id);if(i>=0)pool.splice(i,1);nat._draftedStrat=c;}
  }
  _finishDraft();
}
// Réponse d'un humain au draft Stratégie (mode serveur). cardId null = ignorer.
function _resolveStratChoice(nat, cardId){
  const pool=G._stratPool||[];
  const card=cardId?STRATEGY_CARDS.find(c=>c.id===cardId):null;
  if(card){const i=pool.findIndex(c=>c.id===card.id);if(i>=0)pool.splice(i,1);}
  const needCalm=_applyStratTo(nat,card);
  if(needCalm){ // sous-décision : choisir une nation à calmer
    const rivals=allPlayers().filter(p=>p!==nat);
    (_isRemote(nat)?_emitRemote:_emitDecision)('strategy_calm', nat,
      {amount:card.calmTension, options:rivals.map(r=>({id:r.civ.id,name:r.civ.name,emoji:r.civ.emoji,tension:getTens(nat.civ.id,r.civ.id)}))},
      null,
      (ans)=>{ const tid=ans&&ans.targetId; if(tid){const prev=getTens(nat.civ.id,tid);setTens(nat.civ.id,tid,Math.max(0,prev-(card.calmTension||0)));addLog('🕊️ '+nat.civ.emoji+' '+nat.civ.name+' calme vs '+tid+' −'+(card.calmTension||0),'dim');} nat.stratBonus=null; _afterStratFor(nat); });
    return;
  }
  _afterStratFor(nat);
}
function _afterStratFor(nat){
  if(G._stratOrder&&nat&&G._stratOrder[0]===nat.civ.id)G._stratOrder.shift();
  _runDraftStep();
}
function _playerStratDone(){
  const card=G._playerDraftCard;G._playerDraftCard=null;
  if(card&&G._stratPool){const i=G._stratPool.findIndex(c=>c.id===card.id);if(i>=0)G._stratPool.splice(i,1);}
  if(G._stratOrder&&G._stratOrder[0]===G.player.civ.id)G._stratOrder.shift();
  _runDraftStep();
}
function _finishDraft(){G._stratPool=null;G._stratOrder=null;_startTurnBegin();}
function _tensionMiniHtml(){
  if(!G.ais||!G.ais.length)return '';
  const rows=G.ais.map(ai=>{
    const pt=getTens('player',ai.civ.id),at=getTens(ai.civ.id,'player');
    const c=pt>=8?'#ff6644':pt>=5?'#ffaa44':pt>=3?'#ffcc66':'#66cc88';
    const w=_warBetween(_moiId(),ai.civ.id);
    return '<span style="display:inline-block;margin:0 5px 4px 0;padding:2px 7px;background:#0d1322;border:1px solid #1f2c44;border-radius:5px;font-size:.72em">'+ai.civ.emoji+' <span style="color:'+c+'">'+pt+'</span><span style="color:#46577a">/'+at+'</span>'+(w?' ⚔️':'')+'</span>';
  }).join('');
  return '<div style="margin:8px 0 4px;padding:5px 8px;background:#080c18;border-radius:6px"><div style="font-size:.6em;color:#5a6a8a;margin-bottom:3px;letter-spacing:.5px">⚖️ TENSIONS · toi / eux</div>'+rows+'</div>';
}
function showStrategyModal(){
  if(typeof _ilHide==='function')_ilHide();
  /* ⚠️ CE REPLI MENTAIT, ET C'EST PROBABLEMENT LE DÉFAUT VU PAR MARC.
     Il valait `slice(0,3)` : si `G._stratPool` était absent pour une raison quelconque, la fenêtre
     affichait TROIS cartes tirées au hasard — un nombre qui n'a aucun fondement dans les règles —
     sans le moindre avertissement. Et juste en dessous, `G._stratPlayerRank||1` affichait « 1er ».
     Les deux symptômes rapportés (« il n'y a que 3 choix » et « c'était marqué 1er sur 3 ») sont
     exactement ce que produit ce repli. Il fabriquait une partie plausible mais fausse.
     Désormais : on reconstruit une pioche de la BONNE taille (nations + 2), et on l'écrit dans le
     journal. Un repli doit être bruyant, jamais crédible. */
  let pool=G._stratPool;
  if(!Array.isArray(pool)||!pool.length){
    const _n=[G.player].concat(G.ais||[]).length;
    const _t=Math.min(STRATEGY_CARDS.length,_n+2);
    pool=shuffle([...STRATEGY_CARDS]).slice(0,_t);
    G._stratPool=pool;
    try{ addLog('⚠️ Pioche Stratégie absente au moment de l\'affichage — reconstruite à '+_t+' cartes ('+_n+' nations + 2). À signaler : le draft n\'a pas été préparé normalement.','red'); }catch(e){}
  }
  const el=document.getElementById('strat-options');
  el.innerHTML=pool.map(c=>`<div class="strat-opt" id="strat-opt-${c.id}" onclick="selectStrategy('${c.id}')">
    <div class="so-emoji">${c.emoji}</div>
    <div class="so-name">${c.name}</div>
    <div class="so-desc">${c.desc}</div>
  </div>`).join('');
  _selectedStratId=null;const _scb=document.getElementById('strat-confirm-btn');if(_scb)_scb.disabled=true;
  /* Le rang ne se DEVINE pas : `||1` affichait « 1er » quand l'information manquait, ce qui est la
     pire valeur possible — c'est celle qu'on croit sur parole. On le recalcule, et à défaut on dit
     franchement qu'on ne sait pas. */
  const _tous=[G.player].concat(G.ais||[]);
  let rank=G._stratPlayerRank;
  if(!rank&&Array.isArray(G._stratOrder)){ const i=G._stratOrder.indexOf(G.player.civ.id); if(i>=0) rank=i+1; }
  const total=G._stratTotal||_tous.length;
  document.getElementById('strat-sub').innerHTML=draftPhrase(rank,total)+' — '+pool.length+' carte(s) proposée(s).'+_tensionMiniHtml();
  document.getElementById('strategy-modal').classList.remove('hidden');
  if(typeof _syncEndBtn==='function')_syncEndBtn();
}
// Applique les effets d'une carte Stratégie à une NATION donnée (humain ou IA actif).
// Retourne true si une sous-décision « calmer une tension » reste à résoudre.
function _applyStratTo(nat,card){
  if(!card){nat.stratBonus=null;return false;}
  if(card.calmTension)return true; // calm = sous-décision (choix de la nation cible)
  if(card.res)for(const[r,a]of Object.entries(card.res)){nat.res[r]=(nat.res[r]||0)+a;}
  if(card.force){nat.forceTokens+=card.force;nat.stratForceBonus=(nat.stratForceBonus||0)+card.force;}
  if(card.forceKeep){nat.forceTokens+=card.forceKeep;} // conservable (non temporaire)
  if(card.warRisk)G.warRisk=Math.max(0,G.warRisk+(card.warRisk));
  if(card.acBonus||card.spec||card.combatBonus||card.upkeepDiscount){
    nat.stratBonus={acBonus:card.acBonus||0,spec:card.spec||null,combatBonus:card.combatBonus||0,upkeepDiscount:card.upkeepDiscount||0};
    // L'AC est déjà calculé avant le draft → on ajoute ici le bonus AC de la carte Stratégie choisie.
    // PLAFOND 5 AC : startTurn applique Math.min(5,calcAC) mais ce bonus s'ajoutait APRÈS → on pouvait monter à 6.
    // On replafonne donc ici aussi (le gain réel peut être 0 si on est déjà au maximum).
    if(card.acBonus){
      const _before=nat.acMax||0;
      nat.acMax=Math.min(5,_before+card.acBonus);
      const _gain=nat.acMax-_before;                 // ce qui a VRAIMENT été accordé (0 si déjà à 5)
      nat.acLeft=Math.min(nat.acMax,(nat.acLeft||0)+_gain);
      if(_gain<=0&&nat===G.player)addLog('⚠️ Déjà au maximum de 5 AC — le bonus de la carte Stratégie ne s\'applique pas.','dim');
    }
  }else nat.stratBonus=null;
  addLog((nat===G.player?'🎯 Stratégie : ':'🎯 '+nat.civ.emoji+' '+nat.civ.name+' — Stratégie : ')+card.name+' — '+card.desc, nat===G.player?'gold':'dim');
  return false;
}
let _selectedStratId=null;
function selectStrategy(id){
  _selectedStratId=id;
  document.querySelectorAll('.strat-opt').forEach(el=>el.classList.remove('so-selected'));
  const el=document.getElementById('strat-opt-'+id);if(el)el.classList.add('so-selected');
  const b=document.getElementById('strat-confirm-btn');if(b)b.disabled=false;
}
function confirmStrategy(){
  if(!_selectedStratId)return;
  const id=_selectedStratId;_selectedStratId=null;
  applyStrategy(id);
}
function applyStrategy(id){
  const card=STRATEGY_CARDS.find(c=>c.id===id);
  document.getElementById('strategy-modal').classList.add('hidden');
  if(!card){G._playerDraftCard=null;_playerStratDone();return;}
  G._playerDraftCard=card;
  if(card.calmTension){showCalmPopup('strategy',card.calmTension,card);return;} // solo : popup de choix
  _applyStratTo(G.player,card);
  _playerStratDone();
}
function showCalmPopup(mode,amount,stratCard){
  // Popup commun pour "Calmer les tensions" (stratégie) et "Calmer la Population" (civique)
  const amount_=amount||2;
  const btnStyle='display:block;width:100%;text-align:left;margin-bottom:6px;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:.85em;border:1px solid #2a4a6a;background:#0d1a2a;color:#c8d8f8';
  const rows=G.ais.map(ai=>{
    const pt=getTens('player',ai.civ.id);
    const at=getTens(ai.civ.id,'player');
    const col=pt>=8?'#ff6644':pt>=5?'#ffaa44':pt>=3?'#ffcc66':'#66cc88';
    return`<button style="${btnStyle}" onclick="applyCalmTension('${ai.civ.id}','${mode}',${amount_})">`+
      `${ai.civ.emoji} <strong>${ai.civ.name}</strong> &nbsp;`+
      `<span style="color:${col}">Ta tension : ${pt}/10</span>`+
      `<span style="color:#5a6a8a;font-size:.85em"> | Leur tension : ${at}/10</span>`+
      `</button>`;
  }).join('');
  const label=mode==='strategy'?'🕊️ Calmer les tensions intérieures':'🕊️ Calmer la Population';
  const desc=mode==='strategy'?`Réduit ta tension vers une nation de <strong>${amount_}</strong> points`:`+1<i class=ri-morale></i> et réduit ta tension vers une nation de <strong>${amount_}</strong> points<br><small style="color:#7880a0">Coût : −1<i class=ri-materials></i> −1<i class=ri-energy></i></small>`;
  // Réutiliser le modal de détail tech (ou créer un overlay inline)
  document.body.insertAdjacentHTML('beforeend',`<div id="calm-overlay" style="position:fixed;inset:0;background:rgba(4,4,18,.85);z-index:600;display:flex;align-items:center;justify-content:center">
    <div style="background:#0f0f2a;border:1px solid #4a9eff;border-radius:10px;padding:20px;min-width:300px;max-width:380px">
      <div style="font-size:1em;font-weight:700;color:#c8d8f8;margin-bottom:6px">${label}</div>
      <div style="font-size:.82em;color:#7880a0;margin-bottom:14px">${desc}</div>
      ${rows}
      <button onclick="document.getElementById('calm-overlay').remove();${mode==='strategy'?'G._playerDraftCard=null;_playerStratDone();':''}" style="margin-top:8px;padding:5px 14px;background:#1a1a3a;border:1px solid #3a3a6a;border-radius:5px;color:#9898b8;cursor:pointer;font-size:.82em">Annuler</button>
    </div></div>`);
}
function applyCalmTension(aiId,mode,amount){
  const overlay=document.getElementById('calm-overlay');if(overlay)overlay.remove();
  const prev=getTens('player',aiId);
  setTens('player',aiId,Math.max(0,prev-amount));
  addLog('🕊️ Calme vers '+aiId+' : tension −'+amount+' ('+prev+' → '+getTens('player',aiId)+'/10)','gold');
  if(mode==='civic'){
    // Action civique : payer le coût, donner +1 moral
    const p=G.player;
    saveUndo();
    p.acLeft-=1;p.res.materials=Math.max(0,(p.res.materials||0)-1);p.res.energy=Math.max(0,(p.res.energy||0)-1);
    p.res.morale=Math.min(10,(p.res.morale||0)+1);
    addAction('🕊️','Calmer la Population',1,{materials:1,energy:1},'+1<i class=ri-morale></i> −'+amount+' tension vs '+aiId);
    render();
  }else if(mode==='strategy'){
    G.player.stratBonus=null;
    _playerStratDone();
  }
}
function skipStrategy(){document.getElementById('strategy-modal').classList.add('hidden');G.player.stratBonus=null;G._playerDraftCard=null;_playerStratDone();}
/* ============================================================ TURN ============================================================ */
/* ⚠️ L'AUTEUR EST `'systeme'`, PAS `null` — et j'ai écrit `null` d'abord, ce qui ne faisait RIEN.
   `_logCivCourante` teste `if(_auteurLog!==null) return _auteurLog` : `null` est précisément la
   valeur qui signifie « retombe sur G.player ». Il faut un identifiant qui ne corresponde à aucune
   nation ; `_logPrefixe` affiche alors « Système ». Les blocs internes (`doAITurn`, revenus nation
   par nation) posent leur propre auteur et l'emportent — seules les lignes de PARTIE restent au
   Système, ce qui est exactement le but. */
function startTurn(){ return logAuteur('systeme', function(){ _startTurnPrep(); _startTurnBegin(); }); }
// PRÉPARATION DU TOUR (avant le choix des cartes Stratégie) : remet à jour les revenus déjà
// encaissés, les jetons revenus de récupération, les points de gouvernement ET surtout le NOMBRE
// D'ACTIONS (AC), pour que tout soit à jour AVANT que le joueur ne choisisse sa stratégie.
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   L'USURE DE GUERRE — CE QU'UNE GUERRE COÛTE, MÊME QUAND ON NE SE BAT PAS
   ----------------------------------------------------------------------------------------------
   Règle de Marc, 27/08 : « −4 de malus pour la guerre, dès que la guerre est enclenchée au tour 1,
   et ensuite au tour 2 en début de tour. » Autrement dit : une fois par guerre et par tour, prélevé
   sur le STOCK, pour les DEUX belligérants.

   ⚠️ POURQUOI SUR LE STOCK ET EN DÉBUT DE TOUR — la première version a échoué, et l'échec est
   instructif. Elle valait −2 et se retranchait du REVENU de fin de tour, pour apparaître au bilan.
   Mesurée sur trois tirages identiques : aucun effet mesurable. La raison est arithmétique — après
   écrêtage, `moral = min(plafond, moral + revenu − malus)`. Une nation qui gagne +9 avec un plafond
   de 6 revient à 6 quoi qu'on retranche : le malus était pris sur un surplus déjà jeté.
   Prélevé en début de tour, il frappe le stock AVANT la phase d'actions — donc avant l'instant où
   `_moraleRev` fige le moral qui décide de la guerre civile et des revenus ÷2. La guerre devient
   alors une vraie dépense, pas une écriture comptable.

   ⚠️ UNE FOIS PAR GUERRE ET PAR TOUR, marqué DANS la guerre (`w._usureTour`) et non sur la nation :
   à quatre nations plusieurs conflits coexistent, et un drapeau posé sur la nation ferait payer une
   seule usure à qui en mène deux. La règle est cumulative — c'est ce que Marc a demandé.
   Le marqueur vit dans l'objet guerre, donc il est sérialisé avec elle : une partie reprise ne
   refacture pas le tour en cours.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const USURE_GUERRE_MORAL = 4;
function _usureDeGuerre(w){
  if(!w||w.ended)return;
  if(w._usureTour===G.turn)return;         // déjà facturée ce tour-ci
  w._usureTour=G.turn;
  for(const id of [w.a,w.b]){
    const nat=allPlayers().find(function(n){return n&&n.civ&&n.civ.id===id;});
    if(!nat)continue;
    const avant=nat.res.morale||0;
    nat.res.morale=Math.max(0,avant-USURE_GUERRE_MORAL);
    const reel=avant-(nat.res.morale||0);
    if(reel>0)addLog('⚔️ '+nat.civ.emoji+' '+nat.civ.name+' — usure de guerre : −'+reel+'<i class=ri-morale></i> (guerre en cours).','red');
  }
}
/* Toutes les guerres en cours, une fois chacune. Appelée à l'ouverture du tour ET à la déclaration,
   pour que la guerre déclenchée au tour 1 se paie dès le tour 1. */
function usureDesGuerres(){ for(const w of (G.wars||[])) _usureDeGuerre(w); }
function _startTurnPrep(){
  if(G._prepDoneTurn===G.turn)return; // une seule préparation par tour
  G._prepDoneTurn=G.turn;
  usureDesGuerres();   // AVANT tout le reste : le moral du tour part déjà entamé
  if(typeof enforceCaps==='function')enforceCaps(); // écrêtage : correction des excès du tour précédent (après entretien)
  G.phase='actions';G.turnActions=[];G.aiActions=[];G._raidsThisTurn=[];
  /* ⚠️ CES COMPTEURS SONT PAR NATION — les remettre à zéro sur G.player SEUL ne réinitialisait que
     le joueur 1 en multijoueur. Conséquences vécues : la carte « Expansion Rapide » (colonisation
     gratuite) ne fonctionnait plus jamais pour les autres joueurs après leur première utilisation
     (`_stratColUsed` restait à true), et une carte militaire « 1× par tour » devenait 1× par PARTIE.
     Bug signalé par Marc pour le TROISIÈME joueur. Toujours passer par allPlayers(). */
  allPlayers().forEach(p=>{ p._milBoughtThisTurn=new Set(); }); // militaires : 1× par carte par tour
  allPlayers().forEach(p=>{ p._civicPerTurn=new Set(); }); // civiques « 1×/tour » (ex. Investissement Recherche) — remis à zéro chaque tour, par nation
  mode=null;routeFrom=null;undoStack=[];if(typeof _scHideConfirm==='function')_scHideConfirm();G._scStuckTries=0;G._scStuckShown=false;
  G.player.abilityUsed=false;G.ais.forEach(ai=>{ai.abilityUsed=false;});
  allPlayers().forEach(p=>{ p._stratColUsed=false; }); // colonisation gratuite (carte Stratégie) : 1× par tour, POUR CHAQUE nation
  G.player._attacksThisTurn=0;G.ais.forEach(ai=>{ai._attacksThisTurn=0;});
  if(G.player.bonusMat){G.player.res.materials+=1;G.player.bonusMat=false;addLog('🔀 Bonus : +1<i class=ri-materials></i>','green');}
  G.ais.forEach(ai=>{if(ai.bonusMat){ai.res.materials+=1;ai.bonusMat=false;}});
  G.player.spentThisTurn=0;G.ais.forEach(ai=>{ai.spentThisTurn=0;});   // `combatBonus` n'est plus un accumulateur de nation (voir bonusCombatCartes)
  // Retours récupération jetons
  for(const p of allPlayers()){
    const rec=p.forceCooldown.filter(fc=>fc.returnTurn<=G.turn);
    for(const fc of rec)p.forceTokens+=fc.count;
    p.forceCooldown=p.forceCooldown.filter(fc=>fc.returnTurn>G.turn);
  }
  // Retirer les jetons Force temporaires de la stratégie du tour précédent
  /* Expiration des jetons TEMPORAIRES — également par nation : appliquée au seul G.player, les autres
     joueurs conservaient indéfiniment les jetons d'une carte Stratégie et leurs renforts militaires
     (avantage permanent non voulu). Le message nomme la nation quand ce n'est pas celle qui agit. */
  allPlayers().forEach(p=>{
    const _moi=(p===G.player), _nom=_moi?'':(p.civ.emoji+' '+p.civ.name+' : ');
    if(p.stratForceBonus){p.forceTokens=Math.max(0,p.forceTokens-p.stratForceBonus);addLog('⏱️ '+_nom+'Jetons Force temporaires expirés (−'+p.stratForceBonus+').','dim');p.stratForceBonus=0;}
    if(p.milLoseNext){p.forceTokens=Math.max(0,p.forceTokens-p.milLoseNext);addLog('⏱️ '+_nom+'Renforts militaires dissous (−'+p.milLoseNext+' jeton(s)).','dim');p.milLoseNext=0;}
  });
  if(G.player.civ.id==='terriens'&&(G.player.res.morale||0)>=5)addGovPts(G.player,1);
  for(const ai of G.ais){if(ai.civ.id==='terriens'&&(ai.res.morale||0)>=5)addGovPts(ai,1);}
  if(G.player.govRpt>0)addGovPts(G.player,G.player.govRpt);
  for(const ai of G.ais){if(ai.govRpt>0)addGovPts(ai,ai.govRpt);}
  G.player.acMax=Math.min(5,calcAC(G.player));G.player.acLeft=G.player.acMax;
  // Moral v6 : Moral=0 → AC max divisé par 2 (arrondi bas)
  if((G.player._moraleRev!==undefined?G.player._moraleRev:(G.player.res.morale||0))===0){const half=Math.floor(G.player.acMax/2);G.player.acLeft=half;addLog('😞 Moral nul — AC réduit à '+half+'/'+G.player.acMax,'red');}
  // (Filet IA « se relève » supprimé — parité : tout le monde subit la pénalité basée sur le moral FIGÉ en fin de phase d'actions, et remonte par ses propres actions.)
  G.ais.forEach(ai=>{ai.acMax=Math.min(5,calcAC(ai));ai.acLeft=ai.acMax;if((ai._moraleRev!==undefined?ai._moraleRev:(ai.res.morale||0))===0){ai.acLeft=Math.floor(ai.acMax/2);}});
  if(typeof render==='function')render(); // affiche AC + revenus à jour AVANT le draft Stratégie
}
// DÉBUT EFFECTIF DU TOUR (après le choix des cartes Stratégie) : investissements, événement, jeu.
function _startTurnBegin(){
  // Appliquer les investissements EN PREMIER (avant les décomptes) pour que T7 soit effectif
  if(G.turn===3&&!G.investApplied)applyInvestments();
  if(G.turn===7&&!G.invest2Applied)applyInvestments2();
  // Décompte turnsLeft investissement Niv.1 (T3→T5 : 3 tours effectifs)
  for(const p of allPlayers()){
    if(p.investBonus&&p.investBonus.turnsLeft!==undefined){
      p.investBonus.turnsLeft--;
      /* `<=0` restait vrai à chaque tour suivant : le journal de Marc affichait « Investissement
         Niv.1 expiré » aux tours 6, 7 ET 8. On ne l'annonce qu'au tour où il expire vraiment, et
         `turnsLeft` est ensuite figé à 0 pour ne plus jamais repasser ici. */
      if(p.investBonus.turnsLeft===0){
        /* ⚠️ `matBonus` et `sciBonus` MANQUAIENT à cette liste (corrigé le 2026-08-09).
           Industrialisation Lourde et Recherche Intensive ne s'arrêtaient donc JAMAIS : leur texte
           annonce « T3→T5 », le journal disait « actifs jusqu'au tour 10 », et le code les laissait
           courir jusqu'à la fin. Trois versions différentes de la même règle, dans le même jeu.
           Marc a tranché le 2026-08-09 : TROIS TOURS, comme le texte des cartes. */
        p.investBonus.matX2=false;p.investBonus.sciX2=false;p.investBonus.matHalf=false;p.investBonus.moraleBonus=0;
        p.investBonus.matBonus=0;p.investBonus.sciBonus=0;
        addLog('⌛ '+p.civ.emoji+' '+p.civ.name+' — investissement Niv.1 expiré (T3→T5 couverts).','dim');
      }
    }
  }
  // Décompte turnsLeft investissement Niv.2 (T7→T9 : 3 tours effectifs)
  for(const p of allPlayers()){
    if(p.investBonus2&&p.investBonus2.turnsLeft!==undefined){
      p.investBonus2.turnsLeft--;
      if(p.investBonus2.turnsLeft===0){   // même correction qu'au Niv.1 : annoncé une seule fois
        /* Même oubli qu'au Niv.1 : `moraleFlat` (Confort Population, +4❤️/tour) et `unionSacree`
           ne figuraient pas ici. Confort dure trois tours comme les autres. `unionSacree` n'est
           PAS remis à zéro : il débloque la branche Empathes, et une branche débloquée le reste
           — l'annuler retirerait au joueur des cartes déjà achetées. */
        p.investBonus2.fastCooldown=false;p.investBonus2.moraleX2=false;p.investBonus2.moraleFlat=0;
        addLog('⌛ '+p.civ.emoji+' '+p.civ.name+' — investissement Niv.2 expiré (T7→T9 couverts).','dim');
      }
    }
  }
  G.curEvent=eventForTurn(G.turn);              // se résout en fin de CE tour
  G.nextEvent=eventForTurn(G.turn+1);           // révélé maintenant pour qu'on s'y prépare
  // L'annonce a normalement DÉJÀ été faite avant le draft (runStrategyDraft). On ne la refait pas.
  // Elle reste ici pour le cas où l'on démarre un tour SANS passer par le draft (ex. tout premier tour).
  if(G.nextEvent && G._announcedTurn!==G.turn){
    G._announcedTurn=G.turn;
    render(); // Mettre à jour le compteur de tour AVANT d'afficher le modal d'annonce
    showEventAnnounce(G.nextEvent,'stApresAnnonceDebutTour');
  } else {render();if(typeof showMoraleWarning==='function')showMoraleWarning();}
  startInterleaved();
}
/* ─── PERSPECTIVE D'UNE GUERRE (multijoueur) ────────────────────────────────────────────────
   Tout le flux de guerre (offre de paix, choix d'assaut, résultat de combat) est écrit du point
   de vue de `G.player` : c'est un héritage du solo, où il n'existe qu'un humain et où toutes les
   guerres sont les siennes. En multijoueur, la fin de manche traitait CHAQUE guerre sans changer
   de perspective : les fenêtres « combat » et « paix » partaient donc TOUTES vers la même nation.
   Mesuré sur une partie à 4 : 20 fenêtres de combat sur 20 et 20 offres de paix sur 20 adressées
   au joueur 1, y compris pour les guerres des trois autres — qui, eux, n'avaient aucune fenêtre.
   On bascule donc la perspective sur un belligérant AVANT de traiter sa guerre.
   `w.a` est toujours l'AGRESSEUR (declareWar l'écrit ainsi), `w.b` le défenseur. */
function _warSides(w){
  const all=(typeof allPlayers==='function')?allPlayers():[G.player].concat(G.ais||[]);
  return {A:all.find(p=>p&&p.civ&&p.civ.id===w.a)||null, B:all.find(p=>p&&p.civ&&p.civ.id===w.b)||null};
}
function _activateNation(nat){
  if(!nat||!nat.civ||G.player===nat) return false;
  const all=(typeof allPlayers==='function')?allPlayers():[G.player].concat(G.ais||[]);
  G.player=nat; G.ais=all.filter(p=>p!==nat);
  if(typeof refreshWarViews==='function'){ try{ refreshWarViews(); }catch(e){} }
  return true;
}
/* Choisit le belligérant dont on adopte le point de vue : l'agresseur s'il est humain (c'est lui
   qui mène l'assaut ; le défenseur reçoit de toute façon SA propre fenêtre de défense), sinon
   l'autre humain, sinon l'agresseur. N'agit qu'en mode serveur : en solo G.player est déjà le
   seul humain et toutes les guerres sont les siennes — on ne touche à rien. */
function _focusWar(w){
  if(!w||!_decisionActive()) return;
  const s=_warSides(w);
  const humains=[s.A,s.B].filter(n=>n&&!n._isAI);
  const cible=(s.A&&!s.A._isAI)?s.A:(humains[0]||s.A);
  _activateNation(cible);
}
/* ----------------------------------------------------------------------------
   LA SUITE D'UNE FENÊTRE DE GUERRE — un NOM, plus une fonction
   ----------------------------------------------------------------------------
   C'était `_warModalCb`, une variable de module contenant une FONCTION. Deux
   défauts, tous deux payés :
     · une fonction ne se sérialise pas : sauver la partie pendant qu'une fenêtre
       de guerre est ouverte, c'était perdre la suite du tour ;
     · la variable vivait HORS de `G`, donc deux parties dans le même processus
       (le serveur en fait tourner plusieurs) partageaient le même emplacement.
   Maintenant la suite est un NOM rangé dans `G._flux.donnees` : elle se sauvegarde,
   elle appartient à SA partie, et on peut lire « qu'est-ce qui doit se passer
   après cette fenêtre ? » sans exécuter quoi que ce soit.
   -------------------------------------------------------------------------- */
function _warSuite(nom){ fluxDonnees().suiteGuerre = (typeof nom==='string' && nom) ? nom : null; }
function _warSuiteEnAttente(){ return !!fluxDonnees().suiteGuerre; }
function _warSuiteJouer(){
  const d=fluxDonnees(), nom=d.suiteGuerre; d.suiteGuerre=null;
  if(nom) fluxAppeler(nom); else render();
}
/* Suites nommées des flux pas encore migrés : elles gardent leur comportement mot
   pour mot, mais portent désormais un nom — donc elles survivent à une sauvegarde. */
function stApresAssautDeclare(){ render(); const _a=G._assaultThenSuite; G._assaultThenSuite=null; if(_a)fluxAppeler(_a,'WAR'); }
function stRendre(){ render(); }
/* Rend la suite du choix de combat sous forme de fonction appelable, qu'elle soit nommée (forme
   migrée) ou encore une fermeture (flux d'assaut pas encore migré), et la consomme. */
function _combatSuiteLire(){
  const d=fluxDonnees(), nom=d.suiteCombat;
  d.suiteCombat=null; G._warChoiceCb=null;
  return nom ? ((v)=>fluxAppeler(nom,v)) : null;
}
function stRien(){}
/* ---- ASSAUT DU JOUEUR SUR UNE COLONIE ------------------------------------
   Cible et ennemi sont RECALCULÉS depuis les curseurs, jamais capturés. */
function _assautCible(){ return fluxDonnees().assautCible||null; }
function _assautEnnemi(){ const id=fluxDonnees().assautEnnemi; return id?((typeof allPlayers==='function'?allPlayers():G.ais).find(a=>a&&a.civ&&a.civ.id===id)||null):null; }
function stAssautJoueurChoisi(committed){
  const nodeId=_assautCible(), ennemi=_assautEnnemi();
  fluxDonnees().engagementAssaut=committed;
  // DÉFENSEUR HUMAIN (multijoueur) : on lui AFFICHE la fenêtre de défense pour qu'il choisisse ses
  // jetons AVANT de résoudre. Son choix pilote la défense via G._aiWarCommitted (lu par resolveWarCombat).
  if(ennemi && ennemi._isAI===false && _decisionActive()){
    /* ⚠️ COPIE MANUELLE DU MÊME CALCUL — elle ignorait l'IA de Navigation (coût de guerre ÷2).
       `maxAffordableTokens` est la SOURCE UNIQUE ; trois fenêtres de défense la recalculaient à la
       main avec `min(matériaux, énergie)`, donc sans la remise. Le banc du croiseur les a trouvées.
       Pas de croiseur proposé dans cette fenêtre-ci : aucune réserve à prévoir. */
    const maxDef=Math.max(0,Math.min(ennemi.forceTokens||0, maxAffordableTokens(ennemi)));
    const _atkName=(typeof window!=='undefined'&&window._scPseudo&&window._scPseudo[G.player.civ.id])||G.player.civ.name;
    fluxDonnees().maxDefAssaut=maxDef;
    _emitDecision('defense', ennemi,
      {attacker:G.player.civ.id, attackerName:_atkName, target:{type:'colony', name:(NODES[nodeId]&&NODES[nodeId].name)||nodeId}, threat:committed, maxDef},
      'stAssautJoueurResoudre', 'adDefenseAssaut');
    return;
  }
  stAssautJoueurResoudre();
}
/* Défense contre l'assaut d'une IA. Le contexte est relu dans `G._aiAssaultCtx` : il vivait dans
   une fermeture, donc une sauvegarde pendant le choix des jetons perdait la cible ET la suite. */
function adDefenseContreIA(ans){
  const ctx=G._aiAssaultCtx||{};
  const p=(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[])).find(x=>x&&x.civ&&x.civ.id===ctx.defCivId)||G.player;
  const ai=(G.ais||[]).find(a=>a&&a.civ&&a.civ.id===ctx.aiId)||(typeof allPlayers==='function'?allPlayers():[]).find(a=>a&&a.civ&&a.civ.id===ctx.aiId);
  const maxDef=ctx.maxDef||0;
  const def=Math.max(0,Math.min(maxDef,(ans&&ans.defTokens)||0));
  G._defCruiserChoice=!!(ans&&ans.cruiser&&ctx.cruOk);
  G._aiAssaultCtx=null;
  resolveAiAssaultOnPlayer(ai,ctx.target,ctx.aiCommit,def,ctx.done,p);
  return ans;
}
function adDefenseAssaut(ans){
  const maxDef=fluxDonnees().maxDefAssaut||0;
  G._aiWarCommitted=Math.max(0,Math.min(maxDef,(ans&&ans.defTokens)||0));
  return ans;
}
function stAssautJoueurResoudre(){
  const d=fluxDonnees(), nodeId=_assautCible(), ennemi=_assautEnnemi();
  const committed=d.engagementAssaut;
  d.engagementAssaut=null; d.maxDefAssaut=null;
  const war=ennemi?_warBetween(_moiId(),ennemi.civ.id):null;
  const res=resolveWarCombat(committed);
  if(war){ war.turnsLeft=99; }
  G.warTurnsLeft=99;
  if(war&&G.player.colonies.some(c=>c.nodeId===nodeId))war.aiRecaptureTarget=nodeId; // l'IA voudra la reprendre
  undoStack=[]; // pas d'annulation d'un combat (aléatoire)
  showWarModal('⚔️ Assaut sur '+((NODES[nodeId]&&NODES[nodeId].name)||nodeId),
    res?('Puissance — Toi : <strong>'+res.pPow+'</strong> | '+(ennemi?ennemi.civ.name:'l\'ennemi')+' : <strong>'+res.aPow+'</strong>'):'',
    res?{txt:res.txt,cls:res.cls}:null);
  d.assautCible=null; d.assautEnnemi=null;
  _warSuite('stApresAssautDeclare');
}
/* ---- INVESTISSEMENTS : la file des joueurs vit dans `G._flux.donnees` ------
   On interroge d'abord les joueurs DISTANTS un par un, puis le joueur local.
   Chaque étape porte un nom, donc la file ET la suite survivent à une sauvegarde. */
function _invCartes(){ return (fluxDonnees().niveauInvest===2)?INVESTMENT_CARDS_2:INVESTMENT_CARDS; }
/* `payable`/`manque` sont calculés PAR NATION et partent au client : le grisage des cartes
   impayables doit être le MÊME en solo et en ligne, sinon la règle dépend du mode de jeu. */
function _invOptions(nat){ const p=nat||G.player;
  return _invCartes().map(c=>({id:c.id,name:c.name,emoji:c.emoji,benefit:c.benefit,contrepartie:c.contrepartie,
    payable:investPayable(c,p),manque:investManque(c,p).join(' ')})); }
function _invChamp(){ return (fluxDonnees().niveauInvest===2)?'_inv2':'_inv1'; }
/* TOUS LES HUMAINS CHOISISSENT LEUR INVESTISSEMENT EN MÊME TEMPS.
   Même raison que l'agenda : le choix est secret et indépendant, faire la queue n'apportait rien.
   Le joueur LOCAL est traité comme les autres — sa réponse ne fait plus avancer le tour à elle
   seule. C'est `_investTermine()`, joué à la DERNIÈRE réponse, qui enchaîne : un seul chemin de
   sortie, donc pas de version « locale » et de version « distante » qui finiraient par diverger. */
function stInvestDemander(){
  const d=fluxDonnees(), niv=d.niveauInvest||1, champ=_invChamp(), kind='invest'+niv;
  const local=_civLocale();   // « qui est devant cet écran », pour router la fenêtre — pas une règle
  const distants=(d.fileInvest||[]).slice();
  const tous=distants.concat((local && distants.indexOf(local)<0)?[local]:[]);
  d.fileInvest=[]; d.investCiv=null; d.investRestants=tous.slice();
  if(!tous.length){ _investTermine(); return; }
  for(const civId of tous){
    const nat=allPlayers().find(a=>a&&a.civ.id===civId);   // `G.ais` marchait par accident : un humain distant y vit aussi. On nomme ce qu'on cherche.
    if(!nat){ const r=d.investRestants; const i=r.indexOf(civId); if(i>=0)r.splice(i,1); continue; }
    if(civId===local) _emitDecision(kind, nat, {ai:G.ais.filter(a=>a._isAI!==false).map(a=>({civ:a.civ.id,pick:a[champ]})), options:_invOptions(nat)}, 'stInvestRecu', null);
    else _emitRemote(kind, nat, {options:_invOptions(nat)}, 'stInvestRecu');
  }
  if(!d.investRestants.length) _investTermine();
}
function stInvestRecu(ans, civId){
  const d=fluxDonnees(), champ=_invChamp();
  const cid=civId||(ans&&ans._civ)||d.investCiv;
  const nat=allPlayers().find(p=>p.civ.id===cid);
  if(nat){
    nat[champ]=(ans&&ans.cardId)||nat[champ]||_invCartes()[0].id;
    // Le joueur local sera annoncé par `selectInvestment`, avec le nom de sa carte : pas deux fois.
    if(nat!==G.player) addLog('💼 '+nat.civ.emoji+' '+nat.civ.name+' — investissement choisi.','dim');
  }
  d.investCiv=null;
  const rest=d.investRestants;
  if(Array.isArray(rest)){
    const i=rest.indexOf(cid); if(i>=0) rest.splice(i,1);
    if(rest.length) return;                          // il en manque : leurs fenêtres restent ouvertes
  }
  _investTermine();
}
/* Sortie unique du tour de table : on rejoue le chemin normal du joueur local (log, écho, tour+1,
   draft stratégie) — celui qui existait déjà et qui sert aussi en solo. */
function _investTermine(){
  const d=fluxDonnees(), niv=d.niveauInvest||1;
  d.investRestants=null; d.investCiv=null;
  if(niv===2) selectInvestment2(G.player._inv2||INVESTMENT_CARDS_2[0].id);
  else selectInvestment(G.player._inv1||INVESTMENT_CARDS[0].id);
}
function adCarteInvestissement(ans){ return (ans&&ans.cardId)||_invCartes()[0].id; }
/* L'annonce d'événement a été lue : on joue la suite nommée. */
function stApresAnnonceDebutTour(){ render(); if(typeof showMoraleWarning==='function')showMoraleWarning(); }
function stAnnonceLue(){ const d=fluxDonnees(), nom=d.suiteAnnonce; d.suiteAnnonce=null; if(nom) fluxAppeler(nom); }
/* ADAPTATEURS NOMMÉS — ils traduisent la réponse brute du client en effet de jeu.
   Ils étaient des fermetures posées à l'émission de la question : perdues à la sauvegarde, elles
   emportaient AVEC ELLES la suite du tour. Nommés, ils se retrouvent après une reprise. */
function adOffreDePaix(ans){
  if(ans&&ans.accept){
    G._peaceOffer={materials:(ans.offer&&ans.offer.materials)||0,energy:(ans.offer&&ans.offer.energy)||0,science:(ans.offer&&ans.offer.science)||0};
    submitPeaceOffer();
  } else _paixSuiteJouer('WAR'); // refuse : poursuite (l'IA assaillira, défense routée)
}
/* Ce qu'une nation tenue par l'ordinateur répond à la fenêtre de combat. Le résultat a EXACTEMENT
   la forme d'une réponse de joueur : c'est `adChoixDeCombat` qui l'applique dans les deux cas, donc
   il n'existe qu'une seule résolution du combat à maintenir. */
function iaChoixDeCombat(nat){
  const ennemi=allPlayers().find(a=>a&&a.civ.id===G.warWith)||null;
  const plafond=Math.max(0,Math.min(nat.forceTokens||0,
    (typeof maxAffordableTokens==='function')?maxAffordableTokens(nat):(nat.forceTokens||0)));
  /* Sans jeton engageable, on ne peut qu'attendre : proposer autre chose ferait dépenser dans le vide. */
  if(plafond<=0) return {action:'hold'};
  const menace=ennemi?(ennemi.forceTokens||0):0;
  /* Assez forte pour frapper : elle vise la colonie ennemie la plus faible, jamais la capitale
     (mêmes cibles que la posture d'IA existante). */
  if(plafond>=2&&plafond>=menace){
    const cibles=ennemi?ennemi.colonies.filter(c=>c.nodeId!==ennemi.civ.home):[];
    if(cibles.length){
      const cible=cibles.reduce((b,c)=>(!b||(c.level||1)<(b.level||1))?c:b,null);
      return {action:'attack', node:cible.nodeId, tokens:plafond,
              cruiser:(typeof cruiserAvailable==='function')&&cruiserAvailable(nat)&&(typeof cruiserAfford==='function')&&cruiserAfford(nat)};
    }
  }
  /* Sinon elle se défend avec ce qu'elle peut payer, sans se ruiner. */
  return {action:'defend', tokens:Math.min(plafond,Math.max(1,Math.ceil(menace/2)))};
}
function adChoixDeCombat(ans){
  const suite=_combatSuiteLire(); if(!suite) return;
  const _p=G.player;
  const act=ans&&ans.action;
  // Le supercroiseur doit être armé AVANT resolveWarCombat (qui lit puis remet à zéro le drapeau).
  const _cruHas=(typeof cruiserAvailable==='function')&&cruiserAvailable(_p);
  G._cruiserDeployed=!!(ans&&ans.cruiser)&&_cruHas&&(typeof cruiserAfford==='function')&&cruiserAfford(_p);
  if(act==='hold')suite('STANDOFF');
  else if(act==='defend')suite('DEFEND:'+Math.max(0,(ans.tokens|0)));
  else if(act==='attack'){ if(ans.node)_warAttackColonyTarget=ans.node; suite(Math.max(0,(ans.tokens|0))); } // ← CIBLE routée → capture
  /* ═══════ ATTAQUER UNE ROUTE — L'ACTION MANQUAIT ENTIÈREMENT EN LIGNE ═══════
     La fenêtre de combat envoie la liste des routes ennemies depuis toujours, `warAttackRoute` et
     toute la mécanique de capture existent, et la question « récupérer ou détruire » sait déjà se
     poser en réseau (`route_capture`). Il ne manquait que ceci : le verbe. Aucune branche `route`
     ici, donc une réponse `{action:'route'}` tombait dans le `else` et valait « n'engager
     personne ». En multijoueur, la guerre offrait donc strictement moins d'options qu'en solo, sans
     que rien ne le signale — l'ami de Marc l'a remarqué sans oser l'affirmer (17/08).

     ⚠️ ET ON VÉRIFIE AVANT D'APPELER. `warAttackRoute` sait renoncer quand les jetons manquent :
     elle écrit un avertissement et rend la main pour qu'on rechoisisse. C'est juste en solo, où la
     modale est restée ouverte — mais mortel en ligne, où la question vient d'être CONSOMMÉE : plus
     personne ne pourrait répondre, et on aurait remplacé une impasse par une autre. On contrôle
     donc ici, et à défaut on se retire proprement plutôt que de figer la table. */
  else if(act==='route'){
    const _idx=Math.max(0,(ans.route|0));
    const _adv=allPlayers().find(a=>a&&a.civ.id===G.warWith)||null;
    const _r=_adv&&_adv.routes?_adv.routes[_idx]:null;
    const _besoin=_r?(((_r.tokens||0)>=1)?2:1):0;
    if(!_r||(_p.forceTokens||0)<_besoin){
      addLog('⚠️ Route inattaquable ('+(_r?('il faut '+_besoin+' jeton'+(_besoin>1?'s':'')):'cible introuvable')+') — assaut abandonné pour ce tour.','red');
      suite('STANDOFF');
    } else warAttackRoute(_idx);
  }
  else suite(0);
}
/* Après un assaut né d'une guerre populaire forcée : on rend la main à la suite de ce flux. */
function stApresGuerrePopulaire(){ if(!_guerrePopSuiteJouer())render(); }
/* Fermeture d'une fenêtre de résultat de guerre, côté serveur : on applique l'éventuelle
   colonisation-butin puis on joue la suite nommée. */
function stWarResultFerme(ans){
  if(ans&&ans.colonize&&G._postWarColonizeOffer&&typeof doPostWarColonize==='function')doPostWarColonize(G._postWarColonizeOffer);
  _warSuiteJouer();
}
/* L'adversaire a refusé la paix : on relance le flux de la guerre courante avec la réponse « WAR ».
   Avant, cette suite capturait `_peaceCb` dans une fermeture — donc perdue à la sauvegarde. */
function stPaixRefuseeContinuer(){
  const c=guerreCourante();
  if(c&&c.fraiche) guerreFraichePaixRepondue('WAR'); else guerrePaixRepondue('WAR');
}
fluxDeclarer('stApresAssautDeclare', stApresAssautDeclare);
fluxDeclarer('stRendre', stRendre);
fluxDeclarer('stRien', stRien);
fluxDeclarer('stAssautJoueurChoisi', stAssautJoueurChoisi);
fluxDeclarer('stAssautJoueurResoudre', stAssautJoueurResoudre);
fluxDeclarer('adDefenseAssaut', adDefenseAssaut);
fluxDeclarer('adDefenseContreIA', adDefenseContreIA);
fluxDeclarer('_evSuiteJouer', _evSuiteJouer);
fluxDeclarer('stEvenementChoixOuFin', stEvenementChoixOuFin);
fluxDeclarer('stApresEvenement', stApresEvenement);
fluxDeclarer('stAgendaSuivant', stAgendaSuivant);
fluxDeclarer('stAgendaRecu', stAgendaRecu);
fluxDeclarer('adAgendaChoisi', adAgendaChoisi);
fluxDeclarer('stAgendaLocalRecu', stAgendaLocalRecu);   // draft d'agenda en parallèle (mode serveur)
fluxDeclarer('_agendaStep', _agendaStep);
fluxDeclarer('runStrategyDraft', typeof runStrategyDraft==='function'?runStrategyDraft:stRien);
fluxDeclarer('stAccordsSuivant', stAccordsSuivant);
fluxDeclarer('_accordsVerifierFin', _accordsVerifierFin);
fluxDeclarer('_accordsTerminer', _accordsTerminer);
fluxDeclarer('stInvestDemander', stInvestDemander);
fluxDeclarer('stInvestRecu', stInvestRecu);
/* ESPIONNAGE — trois états nommés, comme tout le reste : une question posée en fin de tour 3, 4
   ou 5 peut très bien traverser une sauvegarde avant d'être répondue. */
fluxDeclarer('stEspionnage', stEspionnage);
fluxDeclarer('stEspionnageRecu', stEspionnageRecu);
/* `adEspionnage` supprimé : c'est lui qui cassait la validation (voir le bandeau de stEspionnage). */
fluxDeclarer('adCarteInvestissement', adCarteInvestissement);
fluxDeclarer('selectInvestment', typeof selectInvestment==='function'?selectInvestment:stRien);
fluxDeclarer('selectInvestment2', typeof selectInvestment2==='function'?selectInvestment2:stRien);
fluxDeclarer('stAnnonceLue', stAnnonceLue);
fluxDeclarer('stApresAnnonceDebutTour', stApresAnnonceDebutTour);
fluxDeclarer('_runStrategyDraftAfterAnnounce', typeof _runStrategyDraftAfterAnnounce==='function'?_runStrategyDraftAfterAnnounce:stRien);
fluxDeclarer('continueAfterEOT', typeof continueAfterEOT==='function'?continueAfterEOT:stRien);
fluxDeclarer('adOffreDePaix', adOffreDePaix);
fluxDeclarer('stPaixReponse', stPaixReponse);   // le joueur humain accepte ou refuse la paix — plus de dé à sa place
/* Choix « récupérer / détruire » une route ennemie prise au combat. */
function adCaptureRoute(ans){ return !!(ans&&ans.capture); }
fluxDeclarer('adCaptureRoute', adCaptureRoute);
fluxDeclarer('stStrategieChoisie', stStrategieChoisie);   // le draft Stratégie : une question par joueur et par tour
/* Sphère de Dyson : passer outre les refus, ou renoncer. */
function stDysonForcer(ans){ if(ans&&ans.force){ if(typeof applyDysonClose==='function')applyDysonClose(); } else if(typeof dysonRenounce==='function')dysonRenounce(); }
fluxDeclarer('stDysonForcer', stDysonForcer);
fluxDeclarer('applyDysonClose', typeof applyDysonClose==='function'?applyDysonClose:stRien);
/* Sommets commercial et diplomatique. */
fluxDeclarer('stAccordCommChoisi', stAccordCommChoisi);
fluxDeclarer('stAccordReponse', stAccordReponse);
fluxDeclarer('stAccordDirectReponse', stAccordDirectReponse);
fluxDeclarer('stPacteReponse', stPacteReponse);   // pacte de non-agression proposé à un JOUEUR
fluxDeclarer('stDiploChoisi', stDiploChoisi);
fluxDeclarer('routeCaptureChoice', typeof routeCaptureChoice==='function'?routeCaptureChoice:stRien);
fluxDeclarer('adChoixDeCombat', adChoixDeCombat);
fluxDeclarer('stApresGuerrePopulaire', stApresGuerrePopulaire);
fluxDeclarer('stWarResultFerme', stWarResultFerme);
fluxDeclarer('stPaixRefuseeContinuer', stPaixRefuseeContinuer);

/* ============================================================================
   LE FLUX DES GUERRES — migré sur la machine à états (bloc @flux)
   ----------------------------------------------------------------------------
   AVANT. `processAllWars(onDone)` gardait la file des guerres ET son index DANS
   DES FERMETURES (`processOngoing(idx)`), et chaque fenêtre posait sa suite dans
   `_warModalCb = () => processOngoing(idx+1)`. Trois conséquences, toutes vécues :
     · une partie sauvegardée pendant une guerre ne pouvait PAS repartir : l'index
       n'existait nulle part ailleurs que dans la mémoire du processus ;
     · le point de vue (`G.player`) et l'index étaient capturés ENSEMBLE — c'est la
       famille de bugs « la fenêtre part au mauvais belligérant » ;
     · impossible de dire « où en est la partie » : il n'y avait rien à lire.

   MAINTENANT. La file et le curseur vivent dans `G._flux.donnees` (règle 3 du bloc
   @flux) et chaque suite est une fonction NOMMÉE qui ne capture rien. Tout ce dont
   une étape a besoin — la guerre, l'ennemi, son nom — est RECALCULÉ depuis le
   curseur (doctrine BGA : « never store the args, always recompute them »). Deux
   effets directs : le déroulement est redevenu une donnée sérialisable, et une
   fenêtre ne peut plus s'adresser à un belligérant périmé.

   ⚠️ On garde la file par IDENTIFIANT de nation, jamais par référence d'objet :
   une guerre peut se terminer en cours de file (vassalisation, paix), et une
   référence gardée pointerait alors sur une guerre qui n'existe plus.
   ========================================================================== */
function guerresPreparer(apres){
  const d=fluxDonnees();
  // Les guerres FRAÎCHEMENT déclarées se traitent APRÈS les guerres en cours : l'ordre est figé ici,
  // une fois pour toutes, et `justDeclared` est consommé au même instant (comme avant).
  /* ⚠️ ON RANGE LE COUPLE {a,b}, PAS `w.aiId`.
     `aiId` est un accesseur : il rend « l'autre camp par rapport à G.player ». Or `guerreEtape()`
     CHANGE de perspective (`_focusWar`) pour traiter chaque guerre du point de vue d'un de ses
     belligérants. Une file remplie avec la perspective de départ ne désignait donc plus les mêmes
     guerres une fois la perspective changée — et la file se sérialise, ce qui figeait l'erreur
     dans la sauvegarde. Le couple, lui, ne dépend de personne. */
  const cle=w=>({a:w.a,b:w.b});
  const enCours=G.wars.filter(w=>!w.justDeclared).map(cle);
  const fraiches=G.wars.filter(w=>w.justDeclared).map(cle);
  G.wars.forEach(w=>{ if(w.justDeclared) w.justDeclared=false; });
  d.guerres=enCours.map(k=>({a:k.a,b:k.b,fraiche:false})).concat(fraiches.map(k=>({a:k.a,b:k.b,fraiche:true})));
  d.guerreIdx=0;
  d.apresGuerres=apres||'stFinDeTour';   // un NOM, pas une fonction : un nom se sérialise
}
function guerreCourante(){ const d=fluxDonnees(); return (d.guerres||[])[d.guerreIdx||0]||null; }
/* Les « arguments » de l'étape courante, RECALCULÉS à chaque fois. */
/* L'identifiant de l'adversaire dans la guerre courante, DU POINT DE VUE de la nation active.
   Les entrées de file anciennes (champ `aiId`) restent lisibles : une partie sauvegardée avant ce
   changement doit pouvoir reprendre. */
function guerreAdverseId(){
  const c=guerreCourante(); if(!c) return null;
  if(c.a&&c.b){ const moi=(G.player&&G.player.civ&&G.player.civ.id); return (c.b===moi)?c.a:c.b; }
  return c.aiId||null;   // ancienne file, sauvegardée avant le passage au couple {a,b}
}
function guerreObjet(){ const c=guerreCourante(); if(!c) return null;
  if(c.a&&c.b) return _warBetween(c.a,c.b);
  return G.wars.find(w=>w.aiId===c.aiId)||null; }   // ancienne file
function guerreEnnemi(){ const id=guerreAdverseId(); if(!id) return null;
  return (typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[])).find(n=>n&&n.civ&&n.civ.id===id)||G.ais[0]||null; }
function guerreEnnemiNom(){ const e=guerreEnnemi(); return e?(e.civ.emoji+' '+e.civ.name):'IA'; }
function guerreSuivante(){ const d=fluxDonnees(); d.guerreIdx=(d.guerreIdx||0)+1; guerreEtape(); }

/* UNE étape = UNE guerre. Remplace `processOngoing`/`processFresh`, qui ne différaient
   que par leur file : la distinction est maintenant portée par `fraiche` dans la file. */
function guerreEtape(){
  const d=fluxDonnees(), c=guerreCourante();
  if(!c){ fluxAppeler(d.apresGuerres||'stFinDeTour'); return; }   // file épuisée
  const war=guerreObjet();
  if(!war){ guerreSuivante(); return; }                            // guerre déjà terminée entre-temps
  _focusWar(war); // ← adopter le point de vue d'un belligérant AVANT toute lecture de G.player/aiId
  // NATION SANS COLONIE = vaincue → elle devient VASSALE et la guerre s'ARRÊTE (sinon la partie se bloquait :
  // on proposait un combat contre une nation qui n'a plus rien à défendre).
  const _van=G.ais.find(a=>a.civ.id===guerreAdverseId());
  if(_van&&(!_van.colonies||_van.colonies.length===0)){
    const _n=_van.civ.emoji+' '+_van.civ.name;
    endWar(guerreAdverseId());
    addLog('🏳️ '+_n+' n\'a plus aucune colonie — nation ASSERVIE (vassale). La guerre prend fin.','gold');
    showWarModal('🏳️ '+_n+' asservi !','Cette nation n\'a plus aucune colonie : elle devient ta <strong>vassale</strong>.<br><br>La guerre prend fin.',{txt:'Victoire totale.',cls:'win'});
    _warSuite('guerreSuivante');
    return;
  }
  G.warWith=guerreAdverseId();
  if(!c.fraiche){ G.warTurnsLeft=war.turnsLeft; G.warWins=war.wins; }
  if(c.fraiche) guerreEtapeFraiche(); else guerreEtapeEnCours();
}

/* ---- guerre EN COURS ------------------------------------------------------ */
function guerreEtapeEnCours(){
  // Modèle « assaut » (war.live) : pas de combat automatique en fin de tour. LIBRE CHOIX au joueur :
  // faire la paix ou poursuivre. L'ancien modèle (combat résolu d'office) subsiste pour les guerres
  // non-live ; les deux passent par la même fenêtre de paix, d'où le branchement à la réponse.
  showPeaceOfferModal(false, 'guerrePaixRepondue');
}
function guerrePaixRepondue(peaceResult){
  const c=guerreCourante(); if(!c) return;
  const war=guerreObjet(), warEnName=guerreEnnemiNom();
  if(peaceResult==='PEACE'){
    const er=endWar(guerreAdverseId());
    showWarModal('🕊️ Paix avec '+warEnName,'La guerre se termine par accord diplomatique.',er||{txt:'Paix conclue.',cls:'win'});
    _warSuite('guerreSuivante');
    return;
  }
  if(war&&(war.live||G._il)){
    /* ═══════ LE DÉFENSEUR N'A JAMAIS PU RIPOSTER — C'ÉTAIT ÉCRIT ICI ═══════
       ⚠️ CE BLOC DISAIT : « ta fenêtre d'ASSAUT ne s'ouvre QUE si TU es l'agresseur », et renvoyait
       sinon directement à l'assaut ennemi (`guerreAssautIAPuisSuivante`). À CHAQUE tour, sans
       exception. Le défenseur ne pouvait donc jamais attaquer — alors que la fenêtre du premier
       tour lui promet noir sur blanc : « Tu pourras riposter à TON tour. » Le jeu faisait une
       promesse qu'aucune ligne ne tenait, et l'agresseur, lui, avait déjà DEUX combats par tour
       (son assaut, puis la riposte adverse). Marc, 17/08 : « à la fin du deuxième tour on devrait
       pouvoir faire deux combats, un en défense et un en attaque. »

       MAINTENANT. Le premier tour de guerre reste au seul déclarant — c'est lui qui frappe, l'autre
       se défend (voir `guerreEtapeFraiche`). Dès le tour suivant, les DEUX camps ont leur assaut et
       leur défense ; seul l'ORDRE change, et c'est lui qui devient l'enjeu tactique, puisqu'il faut
       répartir jetons et ressources entre deux combats. */
    guerreOrdreDeBataille();
    return;
  }
  showWarCombatModal('guerreCombatClassiqueChoisi');
}
/* L'ennemi frappe à son tour, puis on passe à la guerre suivante. Fonction NOMMÉE : c'est ce qui
   remplace `()=>maybeAiAssaultPlayer(warEnemy,()=>processOngoing(idx+1))` et sa double capture. */
function guerreAssautIAPuisSuivante(){ maybeAiAssaultPlayer(guerreEnnemi(), 'guerreSuivante'); }

/* ═══════════════════ L'INITIATIVE — LE DROIT DE DÉCIDER DE L'ORDRE ═══════════════════
   Marc, 17 puis 23/08. L'initiative n'est PAS « qui frappe en premier » : c'est « qui DÉCIDE
   lequel des deux frappe en premier ». La nuance est tout l'intérêt de la règle — celui qui la
   détient choisit d'ouvrir le feu ou d'encaisser d'abord, selon ce que l'adversaire peut encore
   payer. Une seule fenêtre, six critères, dans cet ordre strict :

     1. HYPERPROPULSION — priorité absolue sur tout le reste. Si les DEUX la possèdent (elle se
        copie par Télépathie ou Espionnage), les pouvoirs s'annulent et on descend d'un cran.
     2. RÉTROCESSION — celui qui a assailli l'autre LE PLUS pendant ce tour cède l'initiative.
        On ne frappe pas dans la journée puis on impose encore le tempo du soir.
     3. À ÉGALITÉ D'ASSAUTS — le plus de TECHNOLOGIES de rang 2 ou 3. L'avance scientifique décide
        du tempo : les états-majors les mieux équipés voient venir.
     4. Puis le plus de JETONS Force.
     5. Puis le plus de RESSOURCES ENGAGEABLES.
     6. Puis, en tout dernier recours, l'agresseur.

   ⚠️ LE DERNIER CRITÈRE N'EST PAS DÉCORATIF. Sans lui, deux nations rigoureusement identiques ne
   départageraient jamais, la question ne serait posée à personne, et la partie s'arrêterait là.
   Une cascade de départage doit TOUJOURS se terminer — c'est sa seule obligation absolue.

   ⚠️ « LE PLUS DE RESSOURCES POUR LE COMBAT » EST INTERPRÉTÉ, ET IL FAUT LE SAVOIR. Un jeton coûte
   1🪨 + 1⚡ : posséder 20🪨 et 0⚡ ne permet d'en engager aucun. On compare donc le NOMBRE DE JETONS
   PAYABLES, `min(matériaux, énergie)`, et non la somme des deux stocks — qui donnerait l'initiative
   à une nation incapable de se battre. */
const _RANG_TECH_INITIATIVE = 2;   // « niveau 3 ou niveau 2 » (Marc, 23/08)
function _techsDeRang(nat){
  if(!nat||!nat.cards) return 0;
  /* Les copies obtenues par Espionnage ou Télépathie comptent : ce sont des technologies acquises,
     et Marc les cite lui-même comme un moyen légitime d'obtenir l'Hyperpropulsion. */
  return nat.cards.filter(function(c){ return c && c.branch && (c.tier||0)>=_RANG_TECH_INITIATIVE; }).length;
}
function _assautsDuTour(war,civId){
  if(!war||war._assautsTour!==G.turn||!war._assautsPar) return 0;
  return war._assautsPar[civId]||0;
}
/* Appelé à CHAQUE assaut de la phase d'actions, quel que soit l'assaillant. */
function noterAssautDuTour(war,civId){
  if(!war||!civId) return;
  if(war._assautsTour!==G.turn){ war._assautsTour=G.turn; war._assautsPar={}; }
  war._assautsPar[civId]=(war._assautsPar[civId]||0)+1;
}
/* Rend { nation, raison } — la raison est journalisée : une règle à six critères doit pouvoir
   s'expliquer au joueur qui la subit, sinon elle passe pour de l'arbitraire. */
function _guerreDetenteurInitiative(war){
  const moi=G.player, adv=guerreEnnemi();
  if(!adv) return {nation:moi, raison:'aucun adversaire'};
  const h=function(n){ return !!(n&&typeof hasSpec==='function'&&hasSpec(n,'guerre_initiative')); };
  const hMoi=h(moi), hAdv=h(adv);
  if(hMoi&&!hAdv) return {nation:moi, raison:'🌀 Hyperpropulsion'};
  if(hAdv&&!hMoi) return {nation:adv, raison:'🌀 Hyperpropulsion'};
  const aMoi=_assautsDuTour(war,moi.civ.id), aAdv=_assautsDuTour(war,adv.civ.id);
  if(aMoi!==aAdv) return {nation:(aMoi>aAdv?adv:moi),
    raison:'rétrocession — '+(aMoi>aAdv?moi:adv).civ.name+' a assailli '+Math.max(aMoi,aAdv)+' fois ce tour'};
  const tMoi=_techsDeRang(moi), tAdv=_techsDeRang(adv);
  if(tMoi!==tAdv) return {nation:(tMoi>tAdv?moi:adv),
    raison:'avance technologique ('+Math.max(tMoi,tAdv)+' technologies de rang 2-3 contre '+Math.min(tMoi,tAdv)+')'};
  const jMoi=moi.forceTokens||0, jAdv=adv.forceTokens||0;
  if(jMoi!==jAdv) return {nation:(jMoi>jAdv?moi:adv), raison:'plus de jetons Force ('+Math.max(jMoi,jAdv)+')'};
  const rMoi=Math.min(moi.res.materials||0,moi.res.energy||0), rAdv=Math.min(adv.res.materials||0,adv.res.energy||0);
  if(rMoi!==rAdv) return {nation:(rMoi>rAdv?moi:adv), raison:'plus de ressources engageables ('+Math.max(rMoi,rAdv)+' jetons payables)'};
  const agr=(war&&war.agresseurCiv)?war.agresseurCiv:((war&&war.declaredBy==='player')?moi.civ.id:adv.civ.id);
  return {nation:(agr===moi.civ.id?moi:adv), raison:'égalité parfaite — l\'agresseur tranche'};
}
function guerreOrdreDeBataille(){
  const war=guerreObjet(); if(!war){ guerreSuivante(); return; }
  const d=_guerreDetenteurInitiative(war);
  const qui=d.nation, adv=(qui===G.player)?guerreEnnemi():G.player;
  addLog('🎖️ Initiative de fin de tour : '+qui.civ.emoji+' '+qui.civ.name+' — '+d.raison+'.','dim');
  /* La question est POSÉE, même à une nation tenue par l'ordinateur : c'est `driver.js` qui y
     répond. Court-circuiter ici casserait la reprise de partie — une question qui n'existe pas
     dans `G._flux` n'est pas sauvegardée, et la chaîne ne repart pas (leçon du lot 17). */
  _emitDecision('war_initiative', qui,
    {enemyName:(adv?adv.civ.name:'l\'ennemi'), enemyEmoji:(adv?adv.civ.emoji:''), raison:d.raison,
     texte:'🎖️ <b>Tu as l\'initiative</b> ('+d.raison+') : tu décides de l\'ordre des deux combats de cette fin de tour.',
     options:[
       {id:'attaque', emoji:'⚔️', name:'Attaquer en premier',
        desc:'Tu frappes avec tous tes jetons disponibles, puis tu défends avec ce qu\'il te reste.'},
       {id:'defense', emoji:'🛡️', name:'Défendre en premier',
        desc:'Tu encaisses d\'abord — tu sauras ce qui te reste avant de choisir ton assaut.'}]},
    'guerreOrdreChoisi', null);
}
/* ⚠️ LA RÉPONSE NE VIENT PAS FORCÉMENT DE MOI. `_guerreLancerOrdre` raisonne du point de vue de
   `G.player` ; si c'est l'ADVERSAIRE qui détenait l'initiative, son « j'attaque en premier » veut
   dire que MOI je frappe en second. Sans cette inversion, le choix de l'adversaire s'appliquerait
   à l'envers — et le joueur verrait le contraire de ce que l'écran vient d'annoncer.
   `resolveDecision` passe en second argument la nation qui a répondu : c'est elle qui tranche. */
function guerreOrdreChoisi(ans,civId){
  const v=(ans&&(ans.id||ans.value||ans.ordre))||'attaque';
  const veutFrapperEnPremier=(v!=='defense');
  const decideurEstMoi=(!civId)||(civId===_moiId());
  const jePremier=decideurEstMoi?veutFrapperEnPremier:!veutFrapperEnPremier;
  const nat=decideurEstMoi?G.player:(guerreEnnemi()||G.player);
  addLog('🎖️ '+nat.civ.emoji+' '+nat.civ.name+' choisit d\''
    +(veutFrapperEnPremier?'attaquer en premier.':'encaisser en premier.'),'gold');
  _guerreLancerOrdre(jePremier);
}
/* Les deux enchaînements. Le second n'a besoin d'AUCUNE modification de `guerreCombatLiveChoisi` :
   celle-ci rappelle toujours `guerreAssautIAPuisSuivante` après l'assaut, et `maybeAiAssaultPlayer`
   sait déjà ne pas frapper deux fois dans le même tour (`war._aiAssaultedThisTurn`). L'appel
   redondant retombe donc simplement sur `guerreSuivante`. */
function _guerreLancerOrdre(jePremier){
  if(jePremier){ showWarCombatModal('guerreCombatLiveChoisi'); return; }   // moi → puis riposte adverse
  maybeAiAssaultPlayer(guerreEnnemi(), 'guerreMonAssaut');                 // eux → puis mon assaut
}
function guerreMonAssaut(){ showWarCombatModal('guerreCombatLiveChoisi'); }

function guerreCombatLiveChoisi(committed){
  const warEnName=guerreEnnemiNom();
  // ROUTE_ATTACK / STANDOFF / DEFEND : déjà résolus par leur propre flux → on enchaîne sur l'ennemi.
  if(committed===undefined||committed===null||typeof committed==='string'||(committed|0)<=0){
    addLog('🛡️ Tu tiens ta position — aucun assaut ce tour.','dim'); guerreAssautIAPuisSuivante(); return; // 0 jeton = TENIR (pas un combat perdu d'avance)
  }
  /* ⚠️ LE DÉFENSEUR HUMAIN CHOISIT SA DÉFENSE À CHAQUE COMBAT, PAS SEULEMENT AU PREMIER ASSAUT.
     L'assaut initial demandait bien au défenseur humain ses jetons (`stAssautJoueurChoisi`), mais
     les tours SUIVANTS de la même guerre passaient directement par `resolveWarCombat`, qui lit
     `G._aiWarCommitted` — une valeur calculée par formule. Résultat mesuré à quatre joueurs :
     l'attaquant recevait huit fenêtres de combat, le défenseur UNE SEULE, au tout début. Pour lui,
     la guerre se déroulait sans lui — exactement ce que Marc décrivait.
     On emprunte ici le chemin déjà éprouvé de l'assaut : même fenêtre, même adaptateur. */
  const _def=guerreEnnemi();
  if(_def && _def._isAI===false && _decisionActive()){
    /* ⚠️ COPIE MANUELLE DU MÊME CALCUL — elle ignorait l'IA de Navigation (coût de guerre ÷2).
       `maxAffordableTokens` est la SOURCE UNIQUE ; trois fenêtres de défense la recalculaient à la
       main avec `min(matériaux, énergie)`, donc sans la remise. Le banc du croiseur les a trouvées.
       Pas de croiseur proposé dans cette fenêtre-ci : aucune réserve à prévoir. */
    const maxDef=Math.max(0,Math.min(_def.forceTokens||0, maxAffordableTokens(_def)));
    const d=fluxDonnees(); d.maxDefAssaut=maxDef; d.engagementGuerre=(committed|0);
    _emitDecision('defense', _def,
      {attacker:G.player.civ.id, attackerName:G.player.civ.name,
       target:{type:'war', name:'la ligne de front'}, threat:(committed|0), maxDef},
      'guerreDefenseRecue', 'adDefenseAssaut');
    return;
  }
  const res=resolveWarCombat(committed);
  showWarModal('⚔️ Combat contre '+warEnName,
    res?('Puissance — Toi : <strong>'+res.pPow+'</strong> | '+warEnName+' : <strong>'+res.aPow+'</strong>'):'',
    res?{txt:res.txt,cls:res.cls}:null);
  _warSuite('guerreAssautIAPuisSuivante');
}

/* Le défenseur humain a répondu (`adDefenseAssaut` a déjà posé `G._aiWarCommitted`) : on résout. */
function guerreDefenseRecue(){
  const d=fluxDonnees(), committed=d.engagementGuerre|0;
  d.engagementGuerre=null; d.maxDefAssaut=null;
  const warEnName=guerreEnnemiNom();
  const res=resolveWarCombat(committed);
  showWarModal('⚔️ Combat contre '+warEnName,
    res?('Puissance — Toi : <strong>'+res.pPow+'</strong> | '+warEnName+' : <strong>'+res.aPow+'</strong>'):'',
    res?{txt:res.txt,cls:res.cls}:null);
  _warSuite('guerreAssautIAPuisSuivante');
}
function guerreCombatClassiqueChoisi(playerCommitted){
  const c=guerreCourante(); if(!c) return;
  const war=guerreObjet(); if(!war){ guerreSuivante(); return; }
  const warEnemy=guerreEnnemi(), warEnName=guerreEnnemiNom();
  let combatResult,endResult;
  if(playerCommitted==='ROUTE_ATTACK'){
    const r=G._routeAttackResult||{};G._routeAttackResult=null;
    combatResult=r.warCombatResult||null;endResult=r.warEndResult||null;
    war.turnsLeft=G.warTurnsLeft;
  }else if(playerCommitted==='STANDOFF'){
    // Standoff : les deux tiennent position — AUCUN combat, AUCUNE perte (on se regarde sans s'affronter).
    war.turnsLeft--;G.warTurnsLeft=war.turnsLeft;
    addLog('🕊️ '+(warEnemy?warEnemy.civ.name:'L\'adversaire')+' choisit de tenir aussi — standoff : aucun combat, aucune perte.','gold');
    endResult=war.turnsLeft<=0?endWar(guerreAdverseId()):null;
    combatResult={pPow:'—',aPow:'—',txt:(warEnemy?warEnemy.civ.emoji+' '+warEnemy.civ.name:'L\'adversaire')+' tient aussi — standoff, aucun combat ni perte.',cls:'neutral'};
  }else if(typeof playerCommitted==='string'&&playerCommitted.startsWith('DEFEND:')){
    const defTokens=parseInt(playerCommitted.split(':')[1])||0;
    const aiAtt=G._aiWarCommitted||1;const t=G._aiWarTarget;G._aiWarTarget=null;
    const pDef=defTokens;
    const _defGagne=(pDef>=aiAtt);
    /* ⚠️ UNE SEULE COMPTABILITÉ POUR L'ATTAQUE ET POUR LA DÉFENSE.
       Ces quatre lignes étaient écrites à la main et divergeaient de `applyCombatEngage`, le calcul
       utilisé partout ailleurs. Trois écarts, tous au détriment du défenseur ou de la cohérence :
         · en DÉFENSE RÉUSSIE, la TOTALITÉ des jetons partait en récupération, alors qu'après une
           victoire la moitié revient immédiatement — défendre avec succès coûtait donc plus cher
           qu'attaquer avec succès, sans qu'aucune règle ne le dise ;
         · en défense PERDUE, rien n'était perdu définitivement, alors qu'un assaut perdu coûte la
           moitié des jetons engagés — perdre en défense était plus doux que perdre en attaque ;
         · la remise « Navigation » prenait `floor` sur les DEUX ressources, au lieu de `floor` sur
           les matériaux et `ceil` sur l'énergie : avec 5 jetons, défendre coûtait 4 et attaquer 5.
       C'est une partie de ce que Marc a vu comme des « calculs complètement fantasques ». */
    if(defTokens>0){
      const _h=(typeof hasSpec==='function'&&hasSpec(G.player,'nav2_war'));
      const _dm=_h?Math.floor(defTokens/2):defTokens, _de=_h?Math.ceil(defTokens/2):defTokens;
      applyCombatEngage(G.player,defTokens,_defGagne);
      addLog('⚔️ Coût défense : −'+_dm+'<i class=ri-materials></i> −'+_de+'<i class=ri-energy></i> ('+defTokens+' jeton(s) engagé(s)'
        +(_defGagne?', la moitié revient tout de suite':', la moitié perdue')+')','dim');
    }
    let txt,cls;
    if(_defGagne){
      if(warEnemy)warEnemy.forceTokens=Math.max(0,warEnemy.forceTokens-Math.ceil(aiAtt*0.5));
      war.wins.player++;G.warWins.player++;
      txt='🛡️ Défense réussie ! '+pDef+'🛡️ vs '+aiAtt+'⚔️ — '+(t?'La '+(t.type==='colony'?'colonie '+t.name:'route '+t.name)+' tient !':'Tes positions tiennent !');cls='win';
      addLog('🛡️ Défense réussie — IA recule, −'+Math.ceil(aiAtt*0.5)+' jeton(s) ennemi.','gold');
    }else{
      war.wins.ai++;G.warWins.ai++;
      if(t&&t.type==='colony'){const col=t.obj;if(col&&col.level>1)col.level--;else if(col)col.connected=false;txt='💥 Défense insuffisante ! '+pDef+'🛡️ vs '+aiAtt+'⚔️ — Colonie '+t.name+' dégradée !';cls='loss';addLog('💥 Colonie '+t.name+' dégradée !','red');}
      else if(t&&t.type==='route'){const rt=t.obj;if(rt)rt.tokens=0;updateConnections(G.player);txt='💥 Route '+t.name+' neutralisée !';cls='loss';addLog('💥 Route neutralisée !','red');}
      else{txt='💥 Défense insuffisante ! '+pDef+'🛡️ vs '+aiAtt+'⚔️ — L\'IA prend l\'avantage.';cls='loss';}
    }
    war.turnsLeft--;G.warTurnsLeft=war.turnsLeft;
    endResult=war.turnsLeft<=0?endWar(guerreAdverseId()):null;
    combatResult={pPow:pDef+'🛡️',aPow:aiAtt+'⚔️',txt,cls};
  }else{
    combatResult=resolveWarCombat(playerCommitted);
    war.turnsLeft=G.warTurnsLeft;
    endResult=G.warTurnsLeft<=0?endWar(guerreAdverseId()):null;
  }
  showWarModal(
    endResult?('⚔️ Fin de Guerre vs '+warEnName):('⚔️ Combat vs '+warEnName),
    combatResult?('Puissance — Toi : <strong>'+combatResult.pPow+'</strong> | IA : <strong>'+combatResult.aPow+'</strong>'):'',
    endResult?{txt:endResult.txt,cls:endResult.cls}:(combatResult?{txt:combatResult.txt,cls:combatResult.cls}:null)
  );
  _warSuite('guerreSuivante');
}

/* ---- guerre FRAÎCHEMENT déclarée ----------------------------------------- */
function guerreRaison(){ const w=guerreObjet(); return (w&&w.reason)||G._warDeclareReason||'Tensions trop élevées'; }
function guerreEtapeFraiche(){
  const war=guerreObjet(), warEnName=guerreEnnemiNom();
  if(war && (war.agresseurCiv ? (war.agresseurCiv===_moiId()) : (war.declaredBy==='player'))){
    showWarModal('⚔️ Guerre déclarée vs '+warEnName+' !','<strong>'+guerreRaison()+'</strong><br><br>Assaille une colonie ennemie, ou tiens ta position.',null);
    // TU es l'agresseur (ex. refus de la Sphère de Dyson) → tu dois pouvoir ATTAQUER TOUT DE SUITE.
    // Avant : simple message d'info puis passage au tour suivant, sans jamais de fenêtre de combat (bug Marc).
    _warSuite('guerreFraicheOuvrirCombat');
    return;
  }
  showPeaceOfferModal(true, 'guerreFraichePaixRepondue');
}
function guerreFraicheOuvrirCombat(){ showWarCombatModal('guerreFraicheCombatChoisi'); }
function guerreFraicheCombatChoisi(committed){
  const warEnName=guerreEnnemiNom();
  if(committed===undefined||committed===null||typeof committed==='string'||(committed|0)<=0){
    addLog('🛡️ Tu tiens ta position — aucun assaut ce tour.','dim'); guerreSuivante(); return; // 0 jeton = TENIR
  }
  const res=resolveWarCombat(committed);
  showWarModal('⚔️ Combat contre '+warEnName,
    res?('Puissance — Toi : <strong>'+res.pPow+'</strong> | '+warEnName+' : <strong>'+res.aPow+'</strong>'):'',
    res?{txt:res.txt,cls:res.cls}:null);
  _warSuite('guerreSuivante');
}
function guerreFraichePaixRepondue(peaceResult){
  const c=guerreCourante(); if(!c) return;
  const warEnName=guerreEnnemiNom();
  if(peaceResult==='PEACE'){
    endWar(guerreAdverseId());
    showWarModal('🕊️ Paix Conclue !','Un accord a été trouvé. La guerre est évitée.',{txt:'Vous avez évité la guerre.',cls:'win'});
    _warSuite('guerreSuivante');
    return;
  }
  showWarModal('⚔️ Guerre Déclarée !','<strong style="color:#ff8888">'+warEnName+'</strong> a déclaré la guerre à <strong style="color:#aaddff">'+G.player.civ.emoji+' '+G.player.civ.name+'</strong>.<br><br><em>'+guerreRaison()+'</em><br><br>C\'est elle l\'agresseur : elle frappe maintenant — prépare ta défense. Tu pourras riposter à TON tour.',null);
  _warSuite('guerreAssautIAPuisSuivante'); // l'IA agresseur frappe immédiatement (fenêtre de défense)
}

/* ============================================================================
   LA FIN DE TOUR — UNE SEULE fonction, nommée
   ----------------------------------------------------------------------------
   Il y en avait DEUX : une fermeture `finishTurn` dans `endTurn` (solo) et une
   autre, presque identique, dans `runEndOfRound` (serveur). `ARCHITECTURE_AVENIR.md`
   les signalait comme une cause racine : « deux chemins = deux comportements ; le
   jeu appris hors ligne peut différer du jeu en ligne ». Et elles AVAIENT déjà
   divergé — seule la version serveur mémorisait `G._lastEOT`, si bien qu'en solo
   le garde-fou anti-réexécution ne pouvait pas ré-afficher le bilan.
   Elles sont fusionnées ici. Étant nommée, cette fonction peut en plus être
   désignée par son NOM comme « étape d'après » (voir `apresGuerres`) — ce qu'une
   fermeture ne permettait pas.
   ========================================================================== */
function stFinDeTour(){
  _applyMoraleFlags();
  const revs=doRevenues(); const maint=doMaintenance(); _emitNetRevenueLog(maint);
  _photographierTour();   // l'état de chaque nation, une fois le tour soldé — voir la note plus haut
  refillGeneralRiver();
  if(G.curEvent){
    const evMsg=G.curEvent.resolve(G);
    if(evMsg)logAuteur('systeme',()=>addLog('🎯 ÉVÉNEMENT '+G.curEvent.emoji+' '+G.curEvent.name+' : '+evMsg,'gold'));
    if(evMsg)_journalAuto(G.player.civ.name,'Événement : '+G.curEvent.name,evMsg);
    G._pendingEvModal={ev:G.curEvent,msg:evMsg};
  }
  G._lastEOT={maint,revs}; // mémorisé pour ré-affichage sûr en cas de reprise (manquait côté solo)
  // ORDRE (Marc) : l'ÉVÉNEMENT de fin de tour — son RÉSULTAT à valider, ou son ACTION (accords
  // commerciaux / diplomatiques) — est présenté AVANT le bilan de fin de tour. Le plafonnement des
  // ressources se fait au DÉBUT du tour suivant (continueAfterEOT).
  /* L'espionnage s'intercale ENTRE l'événement et le bilan : aux tours 3, 4 et 5, celui qui a
     pris cet investissement choisit la filière qu'il copie (voir `stEspionnage`). Aux autres
     tours, l'état passe directement au bilan. */
  _resolveEndTurnEvent('stEspionnage');
}
function stBilanDeTour(){ const e=G._lastEOT||{}; showEOTModal(e.maint,e.revs,null,null); }
/* (`_espionnageRappel` supprimée : elle rappelait qu'un espionnage était « en réserve » et
   l'activait d'office à la fin du tour 3. Avec trois occasions échelonnées — tours 3, 4 et 5 —
   il n'y a plus rien à mettre en réserve ni à rattraper.) */
/* Sphère de Dyson construite par une IA ce tour → on demande son avis au joueur AVANT les guerres
   (son refus peut précisément déclencher une guerre, qui doit alors entrer dans la file). */
function stDysonPuisGuerres(){
  if(G._aiDysonBuilt){ const _dysAi=G._aiDysonBuilt; G._aiDysonBuilt=null; showAiDysonModal(_dysAi, stGuerres); }
  else stGuerres();
}
fluxDeclarer('stFinDeTour', stFinDeTour);
fluxDeclarer('stBilanDeTour', stBilanDeTour);
fluxDeclarer('stDysonPuisGuerres', stDysonPuisGuerres);

/* Point d'entrée du flux des guerres. Remplace `processAllWars(onDone)` : plus de suite passée en
   paramètre, on nomme l'étape d'après — c'est ce qui permet de la retrouver après une sauvegarde. */
function stGuerres(){ guerresPreparer('stFinDeTour'); guerreEtape(); }
/* Toutes les suites nommées du flux des guerres. Une suite non enregistrée fige la partie :
   depuis la correction ci-dessus elle lève une erreur explicite, mais autant ne pas l'oublier. */
fluxDeclarer('stGuerres', stGuerres);
fluxDeclarer('guerreEtape', guerreEtape);
fluxDeclarer('guerreSuivante', guerreSuivante);
fluxDeclarer('guerreAssautIAPuisSuivante', guerreAssautIAPuisSuivante);
/* Les étapes de l'ordre de bataille sont NOMMÉES, comme tout le reste du flux : c'est ce qui
   permet à une partie sauvegardée entre les deux combats de repartir au bon endroit. */
fluxDeclarer('guerreOrdreDeBataille', guerreOrdreDeBataille);
fluxDeclarer('guerreOrdreChoisi', guerreOrdreChoisi);
fluxDeclarer('guerreMonAssaut', guerreMonAssaut);
fluxDeclarer('guerreFraicheOuvrirCombat', guerreFraicheOuvrirCombat);
fluxDeclarer('guerrePaixRepondue', guerrePaixRepondue);
fluxDeclarer('guerreFraichePaixRepondue', guerreFraichePaixRepondue);
fluxDeclarer('guerreCombatLiveChoisi', guerreCombatLiveChoisi);
fluxDeclarer('guerreDefenseRecue', guerreDefenseRecue);   // le défenseur humain a choisi ses jetons
fluxDeclarer('guerreCombatClassiqueChoisi', guerreCombatClassiqueChoisi);
fluxDeclarer('guerreFraicheCombatChoisi', guerreFraicheCombatChoisi);

/* ===== ENTRELACÉ (machinerie — non activée tant que startTurn/endTurn/addAction ne sont pas branchés) ===== */
function startInterleaved(){
  G._il=true;
  G._order=allPlayers().slice();
  for(let i=G._order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[G._order[i],G._order[j]]=[G._order[j],G._order[i]];}
  for(const p of allPlayers()){ p._passedRound=false; p._aiSetupDone=false; p._turnActions=[]; p._raidsThisTurn=[]; p._recoltesTour=0; }
  G._ilIdx=0; G._humanActive=false; G._ilLines=[]; G._ilMarkEntry=(G.log&&G.log[0])||null; G._turnMarkEntry=(G.log&&G.log[0])||null;
  /* ⚠️ LA LIGNE D'INITIATIVE ÉTAIT ÉCRITE APRÈS LE `return` DU MODE SERVEUR — donc JAMAIS en
     multijoueur (demande de Marc, 2026-08-07 : « ajouter dans journal qui est désigné par le hasard
     comme premier joueur du tour »). Elle est remontée ici, avant le retour, et nomme les nations
     plutôt que « Toi » : le journal est LU PAR TOUS, « Toi » n'y veut rien dire. */
  logAuteur('systeme',()=>addLog('━ Initiative du tour '+G.turn+' : '+G._order.map(n=>n.civ.emoji+' '+n.civ.name).join(' › ')
    +' — '+G._order[0].civ.name+' commence ━','dim'));
  if(typeof _journalAuto==='function')_journalAuto(G._order[0].civ.name,'Premier joueur du tour (tirage au sort)',G._order.map(n=>n.civ.name).join(' › '));
  if(_decisionActive()){ G._il=false; G._serverActionPhase=true; return; } // SERVEUR : le driver pilote la phase d'actions (pas l'interleave solo)
  interleaveStep();
}
function _ilEl(){
  let b=document.getElementById('il-window');
  if(!b){ b=document.createElement('div'); b.id='il-window';
    b.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:350;padding:12px 20px;border-radius:14px;background:linear-gradient(180deg,rgba(152,20,26,.97),rgba(108,10,16,.97));border:2px solid #ff6b6b;box-shadow:0 10px 40px rgba(120,0,0,.55);pointer-events:none;max-width:min(88vw,420px);text-align:center;color:#fff';
    const x=document.createElement('button'); x.id='il-window-close'; x.textContent='✕'; x.title='Fermer';
    x.setAttribute('onclick','_ilDismiss()');
    x.style.cssText='position:absolute;top:5px;right:7px;width:30px;height:30px;line-height:27px;padding:0;border-radius:50%;border:1px solid #ff9a9a;background:#7a1015;color:#fff;font-size:16px;cursor:pointer;pointer-events:auto;z-index:2';
    b.appendChild(x);
    const c=document.createElement('div'); c.id='il-window-content'; b.appendChild(c);
    document.body.appendChild(b); }
  return b;
}
// Une modale de transition (bilan de fin de tour, choix de bonus/stratégie, investissement, événement…) est-elle ouverte ?
function _ilTransitionOpen(){
  const ids=['eot-modal','bilan-modal','strategy-modal','agenda-sel-modal','invest-modal','invest2-modal','invest-active-modal','event-modal','event-announce-modal','dyson-modal','espionage-modal','empath-copy-modal','war-modal','war-combat-modal','attack-modal','discovery-modal','peace-modal','forced-war-modal'];
  for(const id of ids){ const el=document.getElementById(id); if(el && !el.classList.contains('hidden') && el.style.display!=='none') return true; }
  return false;
}
function _ilShow(lines){ if(_ilTransitionOpen()){ _ilHide(); return; } const b=_ilEl(); const c=document.getElementById('il-window-content'); if(c)c.innerHTML=lines.map(l=>'<div style="margin:6px 0;font-size:1.0em;font-weight:600;color:#fff">'+l+'</div>').join(''); b.style.display=lines.length?'block':'none'; }
function _ilHide(){ if(typeof G!=='undefined'&&G)clearTimeout(G._ilHideTimer); const b=document.getElementById('il-window'); if(b)b.style.display='none'; }
// Masquer le bouton « Fin de Tour » tant qu'un choix de début (agenda / stratégie) est ouvert — évite les clics par erreur.
function _syncEndBtn(){
  const b=document.getElementById('btn-end'); if(!b)return;
  const blocking=['agenda-sel-modal','strategy-modal'].some(id=>{const e=document.getElementById(id);return e&&!e.classList.contains('hidden');});
  b.style.display=blocking?'none':'';
}
// Fermeture manuelle (croix) — filet de sécurité : referme la fenêtre et, si la boucle s'est bloquée, la relance.
function _ilDismiss(){
  _ilHide(); clearTimeout(G._ilHideTimer);
  if(G&&G._il&&!G._humanActive&&!G._aiAssaultCtx){ G._ilPaused=false; setTimeout(interleaveStep,60); } // pas ton tour + aucune décision en attente → débloque
}
function _ilModalOpen(){
  // uniquement les modales d'ACTION (qui s'ouvrent pendant TON tour) — pas les transitions de tour
  const ids=['war-combat-modal','route-token-modal','attack-modal','dyson-modal','discovery-modal','peace-modal','war-modal','empath-copy-modal','espionage-modal'];
  for(const id of ids){ const el=document.getElementById(id); if(el && !el.classList.contains('hidden') && el.style.display!=='none') return true; }
  if(document.getElementById('aad-overlay')||document.getElementById('calm-overlay')) return true;
  return false;
}
function _ilMaybePass(){
  if(!G._il||!G._humanActive) return;
  if(_scConfirmArmed) return; // action en attente de confirmation → on gèle l'entrelacement (Valider relancera ; ↩ garde la main)
  if(_ilModalOpen() && (G._ilPassTries||0)<24){ G._ilPassTries=(G._ilPassTries||0)+1; setTimeout(_ilMaybePass,250); return; }
  G._ilPassTries=0; playerActed();
}
function cancelWarCombat(){
  document.getElementById('war-combat-modal').classList.add('hidden');
  if(typeof _ilHide==='function')_ilHide(); // referme la fen\u00EAtre centrale en cas d'annulation
  // Assaut issu du CHOIX paix/guerre (aucun AC d\u00e9pens\u00e9) : pas de remboursement, on REVIENT \u00E0 la modale paix/guerre.
  if(G._warDecisionAssault){
    G._warDecisionAssault=false; G._warCancelRefund=null;
    G.player._attacksThisTurn=Math.max(0,(G.player._attacksThisTurn||0)-1); // l'assaut annul\u00e9 ne compte pas
    fluxDonnees().suiteCombat=null; G._warChoiceCb=null; G._assaultThenSuite=null;
    if(typeof _warAttackColonyTarget!=='undefined')_warAttackColonyTarget=null;
    addLog('\u21A9\uFE0F Assaut annul\u00e9 \u2014 retour au choix paix/guerre.','dim');
    if(G._warContinueSuite){showPeaceOfferModal(false,G._warContinueSuite);}else{render();}
    return;
  }
  if(G._warCancelRefund){ G.player.acLeft+=(G._warCancelRefund.ac||0); G.player._attacksThisTurn=Math.max(0,(G.player._attacksThisTurn||0)-(G._warCancelRefund.atk||0)); G._warCancelRefund=null; fluxDonnees().suiteCombat=null;G._warChoiceCb=null; if(typeof _warAttackColonyTarget!=='undefined')_warAttackColonyTarget=null; addLog('\u21A9\uFE0F Attaque annul\u00e9e \u2014 AC rendu.','dim'); render(); return; }
  const cb=_combatSuiteLire();
  if(cb){ cb((typeof _warSliderMode!=='undefined'&&_warSliderMode==='defend')?'DEFEND:0':'STANDOFF'); } else render();
}
function _ilVerb(rest){ const m={colonise:'colonisent',\u0061ch\u00e8te:'ach\u00e8tent',adopte:'adoptent',am\u00e9liore:'am\u00e9liorent',construit:'construisent',d\u00e9ploie:'d\u00e9ploient',reprend:'reprennent',commerce:'commercent',neutralise:'neutralisent',d\u00e9truit:'d\u00e9truisent',capture:'capturent',acqui\u00e8re:'acqui\u00e8rent',investit:'investissent'}; const w=rest.split(' ')[0].toLowerCase(); return (m[w]?m[w]+rest.slice(w.length):rest); }
function _ilPhrase(nation, msg){
  let t=String(msg).replace(/<[^>]+>/g,'');
  t=t.replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\uFE0F]/gu,' ').replace(/\s+/g,' ').trim();
  const i=t.indexOf(nation); let rest=(i>=0?t.slice(i+nation.length):t).trim();
  rest=rest.replace(/^route\s*/i,'construisent une route vers ').replace(/^:\s*/,'');
  return nation+' : '+_ilVerb(rest);
}
// FILET DE SÉCURITÉ UNIVERSEL : dès que c'est le tour du joueur, on arme un chien de garde ; si dans
// ~5 s rien n'a avancé (même tour, même position, toujours 0 issue visible : pas de modale, pas de
// confirmation, pas de rappel de pouvoir), on affiche une sortie « Fin de tour » manuelle. Ça garantit
// qu'on ne reste JAMAIS bloqué sans fin de tour, quelle que soit la cause (bug signalé par Marc, tour 6).
/* Le TUTORIEL impose son propre rythme : le joueur LIT la bulle du coach, il n'est pas bloqué.
   Or la bulle n'est pas une « modale » au sens du chien de garde → au bout de 5 secondes de lecture
   celui-ci affichait « Tu sembles bloqué » par-dessus l'explication (bug vu par Marc à l'étape 8).
   Le tutoriel a déjà son propre filet de sécurité : un bouton « Suivant » à chaque étape. */
function _scTutorialActive(){
  try{ return !!(typeof window!=='undefined' && (window.SC_TUTO || document.getElementById('tuto-coach'))); }
  catch(e){ return false; }
}
function _armPlayerStuckWatch(){
  try{
    clearTimeout(G._playerStuckWatch);
    if(_scTutorialActive())return;                            // pas de chien de garde pendant le tutoriel
    const t=G.turn, idx=G._ilIdx;
    G._playerStuckWatch=setTimeout(function(){
      try{
        if(!G||G.phase!=='actions'||!G._il||!G._humanActive)return;
        if(_scTutorialActive())return;                        // le coach a pu démarrer entre-temps
        if(G.turn!==t||G._ilIdx!==idx)return;                 // ça a avancé → ok
        if(_scConfirmArmed)return;                            // barre Valider visible → sortie existe
        if(typeof _scAbilityReminderOpen==='function'&&_scAbilityReminderOpen())return;
        if(typeof _ilModalOpen==='function'&&_ilModalOpen())return; // une modale d'action est ouverte
        if(typeof _scAnyModalOpen==='function'&&_scAnyModalOpen())return;
        if(G._scStuckShown)return;
        G._scStuckShown=true; if(typeof _scShowStuckModal==='function')_scShowStuckModal();
      }catch(e){}
    }, 5000);
  }catch(e){}
}
function interleaveStep(){
  if(G._ilPaused) return;
  try{ clearTimeout(G._playerStuckWatch); }catch(e){}   // ça avance → désarmer le chien de garde
  let guard=0;
  while(guard++ < 60){
    if(allPlayers().every(p=>p._passedRound)){ _ilHide(); runEndOfRound(); return; }
    const actor=G._order[G._ilIdx % G._order.length];
    if(actor._passedRound){ G._ilIdx++; continue; }
    if(actor===G.player){
      G._humanActive=true;
      // Action par action : quand tes actions sont finies (0 AC) et aucune confirmation en attente →
      // rappel du pouvoir gratuit s'il n'est pas utilisé, sinon on passe automatiquement au tour suivant (plus besoin de « Fin de Tour »).
      if(G.player.acLeft<=0 && !_scConfirmArmed && !_scAbilityReminderOpen()){
        if(_scAbilityAvailable()){ render(); _scShowAbilityReminder(); _armPlayerStuckWatch(); return; }
        return passTurnIL();
      }
      clearTimeout(G._ilHideTimer); G._ilHideTimer=setTimeout(_ilHide,2000); render(); _scMaybeStuck(); _armPlayerStuckWatch(); return;
    }
    if(actor._remoteHuman){ // EN LIGNE : nation d'un joueur humain DISTANT → la couche en ligne gère son tour
      if(actor.acLeft<=0){ actor._passedRound=true; G._ilIdx++; continue; }
      G._ilPaused=true; G._humanActive=false; render();
      if(typeof window!=='undefined' && typeof window._scOnRemoteTurn==='function') window._scOnRemoteTurn(actor.civ.id);
      return;
    }
    G._humanActive=false;
    const before=(G.log||[]).length;
    const acted=doAITurn(actor,true);
    if(acted&&G.aiActions&&G.aiActions.length){ actor._turnActions=(actor._turnActions||[]).concat(G.aiActions); } // cumule les actions de la manche pour le bilan par nation
    if(!acted||actor.acLeft<=0) actor._passedRound=true;
    G._ilIdx++;
    const _newE=[]; for(const e of (G.log||[])){ if(e===G._ilMarkEntry) break; _newE.push(e); if(_newE.length>60) break; }
    const since=_newE.map(e=>String(e.msg).replace(/<[^>]+>/g,'').trim());
    G._ilLines=since.filter(t=>/^\u{1F916}/u.test(t)).map(t=>t.replace(/^\u{1F916}\s*/u,'')).reverse();
    _ilShow(G._ilLines);
    render();
    if(G._aiAssaultCtx){ G._ilPaused=true; return; }
    if(G._ilPlayerHits&&G._ilPlayerHits.length){ G._ilPaused=true; _showPlayerHitModal(); return; } // une nation t'a attaqué → popup à valider
    setTimeout(interleaveStep, 1000);
    return;
  }
}
function playerActed(){ if(!G._il||!G._humanActive) return; _scHideConfirm(); G._ilLines=[]; G._ilMarkEntry=(G.log&&G.log[0])||null; _ilHide(); G._humanActive=false; G._ilIdx++; interleaveStep(); }
function passTurnIL(){ if(!G._il) return; _scHideConfirm(); G._ilLines=[]; G._ilMarkEntry=(G.log&&G.log[0])||null; _ilHide(); G._humanActive=false; G.player._passedRound=true; G._ilIdx++; interleaveStep(); }
function runEndOfRound(){ return logAuteur('systeme', _runEndOfRound); }
function _runEndOfRound(){
  // GARDE-FOU ANTI-RÉEXÉCUTION (indexé sur le tour) : évite que la fin de manche tourne DEUX fois
  // (ex. reprise d'une partie sauvée pendant le bilan → interleaveStep revoit « tous ont passé »
  //  et rappelait runEndOfRound → revenus/pirates/événement en double). Bug corrigé 2026-07-26.
  if(G._eotDoneTurn===G.turn){
    if(G._lastEOT){ showEOTModal(G._lastEOT.maint,G._lastEOT.revs,null,null); } // ré-afficher le bilan au lieu de tout refaire
    return;
  }
  G._eotDoneTurn=G.turn;
  advancePirates(); updateWarRisk(); updateTension();
  stDysonPuisGuerres();   // → guerres → stFinDeTour : chaque étape est NOMMÉE, aucune n'est capturée
}
/* ===== fin machinerie entrelacée ===== */
function endTurn(){
  if(G.phase!=='actions')return;
  if(typeof window!=='undefined' && window._scOnPass){ const cb=window._scOnPass; window._scOnPass=null; cb(); return; } // EN LIGNE (invité) : « Fin de tour » = passer (renvoie l'action)
  if(G._il){ return passTurnIL(); }
  closePopup();mode=null;setHint('');
  const pSpent=G.player.acMax-G.player.acLeft;const aSpent=G.ais[0]?G.ais[0].acMax:0;
  if(pSpent<aSpent)G.player.bonusMat=true;
  addLog('— Fin du tour '+G.turn+' —','dim');
  G.player._moraleRev=G.player.res.morale; // figer le moral de fin de phase d'actions : les pénalités ignorent les baisses dues aux guerres de fin de tour
  G.phase='ai';render();
  setTimeout(()=>{
    for(const aiPlayer of G.ais){doAITurn(aiPlayer);aiPlayer._turnActions=[...(G.aiActions||[])];aiPlayer._moraleRev=aiPlayer.res.morale;}
    advancePirates();
    updateWarRisk();
    updateTension();
    // Même suite que le chemin serveur (`runEndOfRound`) : ce sont les MÊMES fonctions nommées,
    // il n'y a plus deux copies de la fin de tour à maintenir en parallèle.
    if(G._forcedWarPending){G._forcedWarPending=false;_guerrePopSuite('stDysonPuisGuerres');} // guerre populaire résolue AVANT les guerres
    else stDysonPuisGuerres();
  },150);
}
// Résout l'événement de FIN DE TOUR (résultat OU action interactive accord commercial/diplomatique) puis done().
// Appelé dans finishTurn AVANT le bilan de fin de tour, pour respecter l'ordre voulu par Marc.
/* L'ÉVÉNEMENT DE FIN DE TOUR — suites nommées, rangées dans `G`.
   `_evModalCb` était une variable de MODULE contenant une fonction. Après une reprise elle valait
   `null` : la fenêtre de résultat se fermait et la partie s'arrêtait là, **sans un mot**. C'est ce
   que le diagnostic de la machine a fini par nommer (« état debut, aucune nation active »).
   Tout passe maintenant par des noms rangés dans `G._flux.donnees`. */
function _evSuite(nom){ fluxDonnees().suiteEvenement=(typeof nom==='string'&&nom)?nom:null; }
function _evSuiteJouer(){ const d=fluxDonnees(), nom=d.suiteEvenement; d.suiteEvenement=null; if(nom) fluxAppeler(nom); }
function _resolveEndTurnEvent(done){
  const d=fluxDonnees();
  d.apresEvenement=(typeof done==='string'&&done)?done:null;   // l'étape d'APRÈS l'événement, par son nom
  if(!G._pendingEvModal){ stApresEvenement(); return; }
  const _pe=G._pendingEvModal;G._pendingEvModal=null;
  d.evenementCourant=_pe.ev?_pe.ev.id:null;
  const ev=_pe.ev,msg=_pe.msg;
  // Étape 1 : le RÉSULTAT de l'événement, à VALIDER par le joueur ; ensuite seulement le choix éventuel.
  if(msg!==null&&msg!==undefined&&msg!==''){
    _evSuite('stEvenementChoixOuFin');
    showEventModal(ev,msg);
    return;
  }
  _evSuite('stApresEvenement');
  stEvenementChoixOuFin();
}
/* L'événement courant, RECALCULÉ depuis son identifiant (jamais gardé dans une fermeture). */
function _evCourant(){ const id=fluxDonnees().evenementCourant; return id?(EVENTS.find(e=>e.id===id)||null):null; }
/* Étape 2 : le CHOIX interactif (accords commerciaux / diplomatiques), s'il y en a un.
   ⚠️ Avant, ce choix était conditionné à `msg===null` — or _evCommResolve/_evDiploResolve renvoient
   TOUJOURS un message → la fenêtre de choix ne s'ouvrait JAMAIS (code mort). On se base donc sur
   `ev.interactive`. */
function stEvenementChoixOuFin(){
  const ev=_evCourant();
  if(!(ev&&ev.interactive&&typeof showEventChoiceModal==='function')){ stApresEvenement(); return; }
  // ⚠️ On ne repasse PAS « stApresEvenement » ici : l'étape d'après est DÉJÀ mémorisée
  // (`d.apresEvenement`, posée par `_resolveEndTurnEvent`). La lui redonner l'écrasait par
  // elle-même : `stApresEvenement` finissait par s'appeler lui-même, ne trouvait plus rien, et la
  // partie s'arrêtait juste après le dernier joueur du tour de table — sans un mot.
  if(_decisionActive()){ _runInteractiveEventAllHumans(ev, null); return; } // EN LIGNE : CHAQUE humain fait SES propres accords
  _evSuite('stApresEvenement');
  showEventChoiceModal(ev, '_evSuiteJouer');
}
function stApresEvenement(){
  const d=fluxDonnees(), nom=d.apresEvenement;
  d.apresEvenement=null; d.evenementCourant=null;
  if(nom) fluxAppeler(nom);
}
function continueAfterEOT(){
  document.getElementById('eot-modal').classList.add('hidden');
  enforceCaps(); // DÉBUT DU TOUR SUIVANT : ressources plafonnées (12⚡ / 20🪨 / 10🔬 / 10🙂, moins sous forme autoritaire)
  if(G.turn>=G.maxTurns)doEndGame();
  else if(G.turn===2&&!G.player._inv1){showInvestmentModal();}   // niv.1 : choix fin T2, effet T3→T5
  else if(G.turn===6&&!G.player._inv2){showInvestmentModal2();} // niv.2 : choix fin T6, effet T7→T9
  else{G.turn++;runStrategyDraft();}
}
// EN LIGNE : un événement interactif (accords commerciaux/diplomatiques) est proposé à CHAQUE humain, l'un
// après l'autre, en « activant » sa nation (G.player) le temps de sa décision. Les tensions passent par
// _tk('player')→G.player.civ.id, donc l'échange de G.player suffit à traiter correctement chaque humain.
/* CHAQUE humain fait SES propres accords, l'un après l'autre. La file et la nation d'origine vont
   dans `G._flux.donnees` : elles vivaient dans cette fermeture, donc une sauvegarde au milieu du
   tour de table perdait la file ET rendait la main à la mauvaise nation. */
function _evSwap(civId){
  const all=allPlayers(); const nat=all.find(p=>p.civ.id===civId); if(!nat) return;
  G.player=nat; G.ais=all.filter(p=>p!==nat);
  if(typeof refreshWarViews==='function')refreshWarViews();
}
function _runInteractiveEventAllHumans(ev, done){
  const d=fluxDonnees();
  d.evenementCourant=ev?ev.id:d.evenementCourant;
  d.apresEvenement=(typeof done==='string'&&done)?done:d.apresEvenement;
  /* TOUTES les nations, IA comprises — voir `iaChoisitAccord`. Avant : `filter(p=>!p._isAI)`. */
  d.fileAccords=allPlayers().map(p=>p.civ.id);
  d.nationAvantAccords=G.player&&G.player.civ?G.player.civ.id:null;
  stAccordsSuivant();
}
/* LE SOMMET S'OUVRE POUR TOUT LE MONDE EN MÊME TEMPS.
   ⚠️ IL SE JOUAIT L'UN APRÈS L'AUTRE, et c'était le reproche de Marc : « c'est le joueur actif qui
   voit la possibilité tout seul, or il faut que ce soit simultané ». Cette fonction faisait
   `file.shift()`, basculait `G.player` sur ce joueur (`_evSwap`) et n'ouvrait la fenêtre du suivant
   qu'une fois le premier servi. Trois conséquences : les autres attendaient sans rien voir, la
   perspective globale changeait à chaque étape, et celui qui jouait en premier signait avant que
   les autres aient pu se manifester.
   Désormais, en ligne, chaque humain reçoit SA fenêtre au même instant, avec SA liste de
   partenaires et SA fiche de renseignement. Le tour ne repart que lorsque tout le monde a répondu
   ET que toutes les propositions en vol ont reçu leur réponse.
   Le mode SOLO garde le chemin d'origine : un seul humain, la question est la même. */
/* CE QU'UNE IA CHOISIT AU SOMMET — elle propose, elle ne fait plus que subir.
   ⚠️ ELLE N'Y PARTICIPAIT PAS DU TOUT. `fileAccords` ne contenait que les humains : au sommet
   commercial, une IA encaissait les +2🪨 collectifs et rien d'autre. Elle ne proposait jamais
   d'accord à personne, et ne pouvait donc jamais sortir d'un isolement diplomatique.
   Marc, 2026-08-14 : « qu'elles puissent elles aussi participer c'est mieux […] dans la
   perspective d'éliminer le joueur dominant qui contrôle tout et voit tout et pas les autres. »
   Elle vise la nation avec qui la tension est la PLUS FORTE parmi celles qui accepteraient : c'est
   là que l'accord rapporte le plus (tension −3 des deux côtés), et c'est ce qu'un joueur ferait. */
function iaChoisitAccord(ia){
  const cands=_evCommCandidats(ia).filter(function(o){
    return accordAcceptable(o,ia).ok && accordAcceptable(ia,o).ok;   // les DEUX doivent y trouver leur compte
  });
  if(!cands.length) return null;
  return cands.slice().sort(function(a,b){
    return (getTens(ia.civ.id,b.civ.id)+getTens(b.civ.id,ia.civ.id))
         - (getTens(ia.civ.id,a.civ.id)+getTens(a.civ.id,ia.civ.id));
  })[0];
}
/* Ce qu'une IA signe au sommet diplomatique : les pactes qu'elle peut payer, avec qui accepterait. */
function iaChoisitPactes(ia){
  let budget=(ia.res.materials||0);
  const out=[];
  const cibles=allPlayers().filter(function(o){return o!==ia;}).sort(function(a,b){
    return (getTens(b.civ.id,ia.civ.id)) - (getTens(a.civ.id,ia.civ.id));   // d'abord les plus remontés contre elle
  });
  for(const o of cibles){
    if(budget<6) break;
    if(!accordAcceptable(o,ia).ok) continue;
    if(getTens(ia.civ.id,o.civ.id)<4 && !_warBetween(ia.civ.id,o.civ.id)) continue; // pas de pacte inutile
    out.push(o.civ.id); budget-=6;
  }
  return out;
}
function stAccordsSuivant(){
  const d=fluxDonnees(), file=d.fileAccords||[];
  if(!_decisionActive()){
    /* SOLO. ⚠️ La file contient maintenant les IA aussi (elles participent au sommet) : sans ce
       filtre, on ouvrirait la fenêtre du JOUEUR pour chaque nation IA à tour de rôle. Elles
       décident sur place, par le même chemin nommé que les humains. */
    while(file.length){
      const suiv=allPlayers().find(p=>p.civ.id===file[0]);
      if(!suiv){ file.shift(); continue; }
      if(!suiv._isAI) break;
      file.shift(); d.fileAccords=file;
      const ev0=_evCourant();
      if(ev0&&ev0.id==='diplo') stDiploChoisi({selected:iaChoisitPactes(suiv)}, suiv.civ.id);
      else { const cible=iaChoisitAccord(suiv); stAccordCommChoisi({aiId:cible?cible.civ.id:null}, suiv.civ.id); }
    }
    d.fileAccords=file;
    if(!file.length){ _accordsTerminer(); return; }
    const civId=file.shift(); d.fileAccords=file;
    _evSwap(civId);
    showEventChoiceModal(_evCourant(), 'stAccordsSuivant');
    return;
  }
  if(!file.length){ _accordsVerifierFin(); return; }
  d.accordsRestants=file.slice(); d.fileAccords=[]; d.accordsPaires=d.accordsPaires||[];
  const ev=_evCourant();
  const local=_civLocale();   // « qui est devant cet écran », pour router la fenêtre — pas une règle
  for(const civId of d.accordsRestants.slice()){
    const nat=allPlayers().find(p=>p.civ.id===civId);
    if(!nat){ _accordsMarquerRepondu(civId); continue; }
    /* Une IA n'a pas de fenêtre : elle décide tout de suite, mais elle passe par EXACTEMENT le même
       chemin qu'un joueur (`stAccordCommChoisi` / `stDiploChoisi`). Deux chemins pour une même
       décision, c'est ce qui a produit toutes les divergences de cette semaine. */
    if(nat._isAI){
      if(ev&&ev.id==='diplo') stDiploChoisi({selected:iaChoisitPactes(nat)}, nat.civ.id);
      else { const cible=iaChoisitAccord(nat); stAccordCommChoisi({aiId:cible?cible.civ.id:null}, nat.civ.id); }
      continue;
    }
    const versLui=(nat.civ.id===local)?_emitDecision:_emitRemote;
    if(ev&&ev.id==='diplo'){
      versLui('event_diplo', nat,
        {mat:(nat.res.materials||0), energy:(nat.res.energy||0),
         rows:allPlayers().filter(o=>o!==nat).map(function(o){
           return {id:o.civ.id,name:o.civ.name,emoji:o.civ.emoji,war:!!(_warBetween(nat.civ.id,o.civ.id)),info:_evAiInfo(o,nat)};})},
        'stDiploChoisi', null);
    }else{
      versLui('event_comm', nat,
        {cands:_evCommCandidats(nat).map(function(o){
           return {id:o.civ.id,name:o.civ.name,emoji:o.civ.emoji,war:!!(_warBetween(nat.civ.id,o.civ.id)),info:_evAiInfo(o,nat)};})},
        'stAccordCommChoisi', null);
    }
  }
  _accordsVerifierFin();   // cas limite : aucune nation valide
}
/* Le sommet est fini quand plus personne ne doit répondre ET qu'aucune proposition n'est en vol. */
function _accordsVerifierFin(){
  const d=fluxDonnees();
  if(!Array.isArray(d.accordsRestants))return;
  if((d.accordsRestants||[]).length)return;
  if((d.accordsPaires||[]).length)return;   // quelqu'un attend encore la réponse de son partenaire
  _accordsTerminer();
}
function _accordsMarquerRepondu(civId){
  const r=fluxDonnees().accordsRestants;
  if(!Array.isArray(r)||!civId)return;
  const i=r.indexOf(civId); if(i>=0)r.splice(i,1);
}
function _accordsTerminer(){
  const d=fluxDonnees();
  if(d.nationAvantAccords)_evSwap(d.nationAvantAccords);
  d.fileAccords=null; d.nationAvantAccords=null; d.accordsRestants=null; d.accordsPaires=null;
  stApresEvenement();
}
function refillGeneralRiver(){
  // Militaires : TOUTES visibles (grisées si non acquérables) ; 1× par carte par tour (suivi via _milBoughtThisTurn).
  const allMil=CARDS_POOL.filter(c=>!c.branch&&c.type==='militaire');
  G.milRiver=[...allMil];
}
/* ============================================================ PIRATES ============================================================ */
// Les pirates NPC n'existent pas si l'une des factions joue Pirates
function npcPiratesActive(){return true;} // les Pirates de Kuiper (NPC) existent TOUJOURS — ils n'attaquent simplement pas les Ceinturiens (voir advancePirates)
function advancePirates(){
  if(!npcPiratesActive())return;
  // Chaque route NON protégée a sa PROPRE chance d'attaque, croissante chaque tour jusqu'à 100%.
  const chance=Math.min(1,0.10+G.turn*0.10); // T1=20% … T9=100%
  let attacked=false;
  /* Ces trois phases (pirates, entretien, revenus) tournent nation par nation, mais TOUTES sous la
     perspective de l'humain principal : sans marquage, leurs lignes lui auraient été attribuées.
     On nomme donc l'auteur à chaque tour de boucle — c'est la nation traitée, pas celle activée. */
  for(const p of allPlayers()) logAuteur(p, ()=>{
    if(p.civ.id==='ceinturiens')return; // les pirates ne pillent pas les Ceinturiens (ils font du commerce avec eux)
    /* ⚠️ ICI était le défaut signalé par Marc le 2026-08-09. Cette ligne testait
       `ia_immune || intel_2` — sa PROPRE liste, sans Lien Empathe — alors que la règle partagée
       existait déjà juste à côté depuis la veille. Le message ne part plus au seul `G.player`,
       pour la même raison qu'au message de destruction plus bas : à plusieurs humains, l'autre
       ne voyait rien. */
    if(routesProtegeesParTech(p)){
      if(p.routes.length) addLog('🛡️ Routes de '+p.civ.emoji+' '+p.civ.name+' immunisées contre les pirates ('
        +techsProtegeantRoutes(p).join(', ')+').','gold');
      return;   // ⚠️ `return` et non `continue` : le corps de boucle est passé en fonction (voir logAuteur)
    }
    // Routes non protégées (sans jeton Force) : chacune risque d'être pillée ET DÉTRUITE (à reconstruire).
    // Une route est protégée si elle a un jeton OU si un allié a déjà un jeton sur le même segment (surveillance partagée).
    const _guarded=function(r){return allPlayers().some(function(o){return o!==p&&o.routes.some(function(or){return (or.tokens||0)>0&&((or.from===r.from&&or.to===r.to)||(or.from===r.to&&or.to===r.from));});});};
    // `routeProtegee` = jeton posé OU technologie de protection. Plus de test « r.tokens===0 » en
    // dur ici : c'est ce raccourci qui ignorait les technologies (voir le bandeau ci-dessus).
    const unprotected=p.routes.filter(r=>!routeProtegee(p,r)&&!_guarded(r));
    const hitRoutes=unprotected.filter(()=>Math.random()<chance);
    if(hitRoutes.length){
      p.routes=p.routes.filter(r=>!hitRoutes.includes(r));updateConnections(p);
      attacked=true;
      /* ⚠️ CORRIGÉ LE 2026-08-07 (partie DB55) : le message n'était écrit que `if(p===G.player)`.
         Or `runEndOfRound` active l'humain PRIMAIRE (l'hôte) : les routes du SECOND humain étaient
         donc détruites EN SILENCE. L'ami de Marc a perdu deux routes — et avec elles la connectivité
         de trois colonies et ses points d'agenda — sans jamais recevoir un mot. Il a cru que « le
         jeu avait oublié de compter une route ».
         Le journal appartient à la PARTIE, pas au point de vue : on nomme donc la nation touchée,
         et la ligne part à tout le monde. Chacun doit pouvoir constater ce qui lui est arrivé. */
      hitRoutes.forEach(r=>{
        const _seg=(NODES[r.from]?.name||r.from)+'→'+(NODES[r.to]?.name||r.to);
        addLog('☠️ Pirates ! Route '+_seg+' de '+p.civ.emoji+' '+p.civ.name+' pillée et DÉTRUITE — à reconstruire (protège tes routes avec un jeton).','red');
        if(typeof _journalAuto==='function')_journalAuto(p.civ.name,'Route détruite par les pirates',_seg);
      });
    }
    // (Règle voulue par Marc : les pirates de FIN DE TOUR n'attaquent QUE les routes non protégées,
    //  JAMAIS les colonies. La branche « raid sur colonie » a été retirée. L'événement « Prolifération
    //  des pirates » reste distinct.)
  });
  if(attacked){
    // Risque guerre +1 avec Ceinturiens (lore : ils soutiennent les pirates en secret)
    /* ⚠️ UN JOUEUR CEINTURIEN ÉTAIT INVISIBLE. `G.ais` ne contient jamais la nation active : quand
       un humain jouait les Ceinturiens, cette recherche ne trouvait personne et le code partait
       dans la branche « pas de Ceinturiens dans la partie » — risque de guerre global au lieu de la
       tension due à leur soutien secret aux pirates. Mesuré le 2026-08-15. */
    const ceinturAI=allPlayers().find(a=>a.civ.id==='ceinturiens');
    if(ceinturAI){
      // ⚠️ `'player'` en dur ciblait « celui qui est actif à cet instant », pas la nation réellement
      // pillée. On monte la tension de CHAQUE nation attaquée envers les Ceinturiens.
      for(const v of allPlayers()){ if(v!==ceinturAI) addTens(v.civ.id,ceinturAI.civ.id,1); }
      addLog('☠️ Tension vs Ceinturiens +1 (soutien secret aux pirates)','dim');
    }else{
      /* Pas de Ceinturiens dans cette partie : les pirates ne sont le bras de personne. Il n'y a
         donc aucune nation vers qui diriger la rancœur, et le climat général monte d'un cran.
         `G.warRisk` est GLOBAL, et c'est ici la bonne échelle — c'est une jauge d'ambiance, pas une
         relation entre deux nations. C'est la seule lecture de drapeau global que ce lot laisse en
         place, et elle est délibérée. */
      G.warRisk=Math.min(10,(G.warRisk||0)+1);
      addLog('☠️ Raid pirate — risque de guerre +1','red');
    }
  }
}
/* ============================================================ MAINTENANCE ============================================================ */
function _applyMoraleFlags(){
  // v18 Table 17 : les pénalités de moral (guerre civile / ÷2) se calculent sur le moral figé
  // en fin de phase d'actions, AVANT les revenus (étape 7) et l'entretien (étape 8).
  for(const p of allPlayers()){
    const _m=(p._moraleRev!==undefined?p._moraleRev:(p.res.morale||0));
    if(_m===0){p._civilWar=true;addLog(p===G.player?'💥 GUERRE CIVILE ! Moral 0 — aucune ressource ce tour.':('💥 Guerre civile chez '+p.civ.emoji+' '+p.civ.name+' — moral 0, aucune ressource ce tour.'),'red');}
    /* ⚠️ CES DEUX MESSAGES ÉTAIENT RÉSERVÉS AU JOUEUR, et leur jumeau IA ne nommait personne.
       Partie 8B47, tour 8 : Marc lisait coup sur coup « Moral critique (1) — ressources ÷2 » et
       « Guerre civile IA (moral 0) » — deux états contradictoires, en réalité deux nations
       différentes, dont aucune n'était nommée. Un journal à quatre nations doit dire QUI. */
    else if(_m===1){p._halfResources=true;addLog(p===G.player?'⚠️ Moral critique (1) — ressources ÷2 ce tour.':('⚠️ Moral critique chez '+p.civ.emoji+' '+p.civ.name+' (1) — ses ressources sont divisées par deux.'),'red');}
  }
}
function doMaintenance(){
  const result={energyCost:0,matCost:0,routeEnergyCost:0,routeMatGain:0,moraleLostCols:0,moraleLostRoutes:0};
  for(const p of allPlayers()){
    /* ⚠️ DÉFAUT CORRIGÉ LE 2026-08-09 (signalé par Marc : « Biosphère Autonome semble ne plus
       fonctionner »). Il ne le semblait pas : elle ne fonctionnait pas. `disc` ne comptait que
       `stratBonus.upkeepDiscount` — un bonus que PLUS AUCUNE carte ne pose depuis que Consolidation
       a changé — et oubliait `upkeep_e_disc`, la remise de Biosphère Autonome. La remise était donc
       bien déduite dans les DEUX endroits qui AFFICHENT l'entretien (le bilan et le revenu net),
       mais pas ici, le seul endroit qui le PRÉLÈVE : le joueur lisait −2⚡ et payait −3⚡.
       C'est la maladie connue des trois copies du même barème (voir les avertissements en regard
       dans `_netIncome` et dans l'affichage) : une correction faite dans deux copies sur trois.
       La remise porte sur le TOTAL d'entretien, pas sur chaque colonie. */
    const disc=((p.stratBonus&&p.stratBonus.upkeepDiscount)||0);   // ⚠️ plus aucune carte ne pose ce bonus depuis que Consolidation a changé : mécanique conservée, actuellement inutilisée. La remise de Biosphère Autonome, elle, est PAR COLONIE — voir la boucle ci-dessous.
    /* ENTRETIEN D'UNE COLONIE HORS BASE (barème révisé par Marc le 2026-08-07) :
         Nv.1 → 1⚡          Nv.2 → 1⚡ + 1🪨          Nv.3 → 1⚡ + 2🪨
       AVANT, l'énergie suivait le niveau (1, 2 puis 3⚡) : monter ses colonies coûtait si cher en
       énergie que l'amélioration devenait un piège — c'est le constat de Marc en jouant.
       L'énergie est donc FIXE à 1 par colonie, quel que soit le niveau ; c'est le coût en MATÉRIAUX
       (inchangé : 0, 1, 2) qui porte désormais seul la progression.
       ⚠️ Le commentaire précédent annonçait « Nv1 = 0⚡ » : il était FAUX depuis longtemps, le code
       facturait bien 1⚡ au niveau 1. Ne pas se fier au commentaire sans lire la ligne. */
    /* ⚠️ EXCEPTION SUPPRIMÉE LE 2026-08-07 (décision de Marc).
       Les Jupitériens ne payaient pas l'entretien de leurs stations orbitales (`jorbital*`). Cette
       règle datait de l'époque où ces stations avaient un intérêt ; depuis qu'elles ont été vidées
       de leur contenu, six des sept ne rapportent RIEN et la septième (Station Jupiter, 2⚡/1🔬)
       devenait une source gratuite d'énergie — un avantage que rien ne documentait, dans le texte
       d'aucun pouvoir. Une seule règle d'entretien pour tout le monde : seule la CAPITALE est
       exemptée, pour toutes les nations. */
    const extraCols=p.colonies.filter(c=>c.nodeId!==p.civ.home);
    let totalEnergy=0,totalMat=0;
    const freeUpk=(p.investBonus2&&(p.investBonus2.freeUpkeep||0)>0);
    const _terra=hasSpec(p,'terra3'),_bio=hasSpec(p,'bio2_bonus');
    /* BIOSPHÈRE AVANCÉE : plus aucun entretien, à AUCUN niveau (décision de Marc, 2026-08-08).
       Avant, l'exemption était partagée entre Biosphère Avancée (énergie, Nv2-3) et Terraformation
       (tout, Nv2-3) : deux technologies qui se marchaient dessus. Désormais l'exemption appartient
       à Biosphère Avancée SEULE, et Terraformation ne s'occupe plus que des revenus. */
    /* BIOSPHÈRE AUTONOME (règle fixée par Marc le 2026-08-09) : −1⚡ PAR COLONIE DE NIVEAU 1.
       Comme une colonie coûte 1⚡ quel que soit son niveau, cela revient à dire que les colonies
       de niveau 1 ne coûtent plus rien en énergie. La remise précédente (−1⚡ sur le total) était
       trop faible : « sinon ça reste difficile ». ⚠️ MÊME RÈGLE dans les deux autres copies du
       barème (`_netIncome` et l'affichage du bilan) — voir les avertissements en regard. */
    const _bio1=hasSpec(p,'upkeep_e_disc');
    for(const col of extraCols){
      if(_bio) continue;                              // Biosphère Avancée : aucune colonie n'est facturée
      const lvl=col.level||1;
      if(!(_bio1&&lvl<=1)) totalEnergy+=1;            // 1⚡ par colonie, sauf Nv1 avec Biosphère Autonome
      totalMat+=lvl>=3?2:(lvl>=2?1:0);
    }
    if(freeUpk){totalEnergy=0;totalMat=0;p.investBonus2.freeUpkeep--;}
    totalEnergy=Math.max(0,totalEnergy-disc);
    // Appliquer moral rules (0=guerre civile, 1=ressources/2)
    const applyMoralPenalty=(p)=>{
      const _m=(p._moraleRev!==undefined?p._moraleRev:(p.res.morale||0)); // moral figé en fin de phase d'actions (pas l'effondrement dû aux guerres)
      if(_m===0){
        // Guerre civile : aucune ressource ce tour (reset gains à 0)
        p._civilWar=true;
        addLog(p===G.player?'💥 GUERRE CIVILE ! Moral 0 — aucune ressource ce tour.':('💥 Guerre civile chez '+p.civ.emoji+' '+p.civ.name+' — moral 0, aucune ressource ce tour.'),'red');
      }else if(_m===1){
        p._halfResources=true;
        addLog(p===G.player?'⚠️ Moral critique (1) — ressources ÷2 ce tour.':('⚠️ Moral critique chez '+p.civ.emoji+' '+p.civ.name+' (1) — ses ressources sont divisées par deux.'),'red');
      }
    };
    // Payer énergie colonies
    const payE=Math.min(totalEnergy,p.res.energy||0);p.res.energy-=payE;
    const missE=totalEnergy-payE;if(missE>0){p.res.morale=Math.max(0,(p.res.morale||0)-missE);}
    // Payer matériaux colonies
    const payM=Math.min(totalMat,p.res.materials||0);p.res.materials-=payM;
    const missM=totalMat-payM;if(missM>0){p.res.morale=Math.max(0,(p.res.morale||0)-missM);}
    /* ⚠️ CE DÉTAIL N'ÉTAIT REMPLI QUE POUR LA NATION ACTIVE. `result` est rendu à l'APPELANT, qui
       sait très bien de quelle nation il parle : le bilan de fin de tour d'un autre joueur restait
       donc vide de ses coûts d'entretien. On remplit toujours ; c'est l'appelant qui choisit d'en
       faire quelque chose. */
    result.energyCost=totalEnergy;result.matCost=totalMat;result.moraleLostCols=missE+missM;
    // Routes : coût 1<i class=ri-energy></i>/route, revenu 1<i class=ri-materials></i>/route (routes non alimentées n'affectent pas le moral)
    const numRoutes=p.routes.length;
    const _freeRteUpkeep=hasSpec(p,'route_force_free'); // Hyperpropulsion : entretien des routes gratuit
    const payRE=_freeRteUpkeep?numRoutes:Math.min(numRoutes,p.res.energy||0);
    if(!_freeRteUpkeep)p.res.energy-=payRE;
    const missRE=_freeRteUpkeep?0:numRoutes-payRE;
    if(missRE>0&&p===G.player)addLog('⚠️ '+missRE+' route(s) non alimentée(s) ce tour (manque <i class=ri-energy></i>).','dim');
    const caps=getResCapFor(p);
    // Seules les routes payées génèrent du revenu commercial
    p.res.materials=Math.min(caps.materials,(p.res.materials||0)+payRE);
    /* ⚠️ CE QUI EST ANNONCÉ DOIT ÊTRE CE QUI EST PRÉLEVÉ. Avec Hyperpropulsion l'entretien des routes
       est gratuit (`if(!_freeRteUpkeep) p.res.energy -= payRE`), mais le bilan annonçait quand même
       `numRoutes`⚡ de dépense : le joueur voyait un coût qui n'avait pas eu lieu et son bilan ne
       tombait pas juste (signalé par Marc le 2026-08-07). Le GAIN en matériaux, lui, est bien de 1
       par route même sans payer : les routes rapportent, c'est voulu. */
    const _coutRoutes=_freeRteUpkeep?0:payRE;
    result.routeEnergyCost=_coutRoutes;result.routeMatGain=payRE;result.moraleLostRoutes=0;
    /* Entretien mémorisé PAR NATION : en multijoueur chaque humain doit voir SON bilan de fin de tour
       (et non celui du joueur qui a clos la manche). Mêmes chiffres, calculés une seule fois ici. */
    p._lastMaint={energyCost:totalEnergy,matCost:totalMat,routeEnergyCost:_coutRoutes,routeMatGain:payRE,moraleLostCols:missE+missM,moraleLostRoutes:0};
    // Entretien de la forme de gouvernement (Démocratie : −1<i class=ri-materials></i> −1<i class=ri-energy></i>/tour tant qu'active)
    if(p.govFormUpkeep){for(const[r,a]of Object.entries(p.govFormUpkeep)){const pay=Math.min(a,p.res[r]||0);p.res[r]=(p.res[r]||0)-pay;}}
    p.stratBonus=null;
  }
  return result;
}
// Ligne de journal « Revenus nets » : revenus bruts − entretien (colonies, routes, gouvernement).
function _emitNetRevenueLog(maint){
  const d=G&&G._revLogData;if(!d){return;}G._revLogData=null;
  maint=maint||{};
  const eCost=(maint.energyCost||0)+(maint.routeEnergyCost||0);
  const mCost=(maint.matCost||0)-(maint.routeMatGain||0);
  const net={energy:(d.gross.energy||0)-eCost,materials:(d.gross.materials||0)-mCost,science:(d.gross.science||0)};
  const parts=[];
  for(const r of['energy','materials','science']){const a=net[r];if(a!==0)parts.push((a>=0?'+':'')+a+rEmoji(r));}
  const netM=d.grossM-(d.conquestPen||0)-(d.manif||0)-(maint.moraleLostCols||0);
  if(d.conquestPen||d.manif||maint.moraleLostCols){
    parts.push('<i class=ri-morale></i> '+(d.grossM>=0?'+':'')+d.grossM+' brut'+(d.conquestPen?' −'+d.conquestPen+' conquête':'')+(d.manif?' −'+d.manif+' tension':'')+(maint.moraleLostCols?' −'+maint.moraleLostCols+' entretien':'')+' → '+(netM>=0?'+':'')+netM+' net');
  }else if(d.grossM!==0){
    parts.push((d.grossM>=0?'+':'')+d.grossM+'<i class=ri-morale></i>');
  }
  if(parts.length)addLog('💰 Revenus nets (après entretien) : '+parts.join(' '));
}
// ── TOOLTIP REVENU : détail des sources et malus permanents (lecture seule) ──
function revenueBreakdownHTML(p){
  if(!p||!p.colonies)return '';
  const E={energy:'<i class=ri-energy></i>',materials:'<i class=ri-materials></i>',science:'<i class=ri-science></i>',morale:'<i class=ri-morale></i>'};
  const fmt=o=>['materials','energy','science','morale'].filter(r=>o[r]).map(r=>(o[r]>0?'+':'')+o[r]+E[r]).join(' ')||'—';
  /* ⚠️ CETTE INFOBULLE AVAIT SA PROPRE VERSION DES REVENUS, et il lui manquait six règles (voir
     `revenusBruts`). Elle ne calcule plus : elle demande le calcul officiel ET son détail poste
     par poste, puis se contente de le mettre en forme. C'est ce que Marc a demandé — corriger le
     mauvais code, sans toucher à celui qui marchait. */
  const _postes=[];
  const g=revenusBruts(p,{detail:_postes});
  for(const _r of ['energy','materials','science','morale']) if(g[_r]===undefined) g[_r]=0;
  const inc=_postes.filter(x=>Object.keys(x.o).length).map(x=>x.label+' : '+fmt(x.o));
  const mal=[];
  // ── ENTRETIEN & MALUS PERMANENTS ──
  const extraCols=p.colonies.filter(c=>c.nodeId!==p.civ.home);   // exception « stations orbitales joviennes » supprimée (voir doMaintenance)
  /* ⚠️ TROISIÈME COPIE DU MÊME BARÈME, ET ELLE AVAIT DIVERGÉ.
     Elle facturait `upE += lvl` — 2⚡ pour une colonie de niveau 2, 3⚡ au niveau 3 — alors que le
     calcul RÉEL (`doMaintenance`) et le revenu net (`_netIncome`) facturent 1⚡ quel que soit le
     niveau, depuis que Marc a fixé cette règle (« on fait 1 énergie toujours »). Le bilan de fin de
     tour annonçait donc un entretien PLUS ÉLEVÉ que celui réellement prélevé, et l'écart grandissait
     à mesure qu'on montait ses colonies. C'est très probablement une partie de ce que Marc décrivait
     en disant que le bilan ne donnait pas le bon résultat.
     Trois implémentations d'un même barème, c'est deux de trop — mais les fusionner touche à
     l'affichage, au net et au prélèvement en même temps. En attendant, elles sont au moins
     identiques, et chacune renvoie aux deux autres. */
  let upE=0,upM=0;const _terraU=hasSpec(p,'terra3'),_bioU=hasSpec(p,'bio2_bonus'),_bio1U=hasSpec(p,'upkeep_e_disc');
  for(const c of extraCols){if(_bioU)continue;/*Biosphère Avancée : aucun entretien*/const lvl=c.level||1;if(!(_bio1U&&lvl<=1))upE+=1;/*Biosphère Autonome : Nv1 gratuit en ⚡*/upM+=lvl>=3?2:lvl>=2?1:0;}
  /* Biosphère Autonome : −1⚡ PAR COLONIE DE NIVEAU 1 (Marc, 2026-08-09), donc appliquée dans la
     boucle ci-dessus et pas ici. La remise `upkeepDiscount` de stratBonus, elle, reste un forfait
     sur le total — mais plus aucune carte ne la pose depuis que Consolidation a changé. */
  upE=Math.max(0,upE-((p.stratBonus&&p.stratBonus.upkeepDiscount)||0));
  if(p.investBonus2&&(p.investBonus2.freeUpkeep||0)>0)mal.push('🏙️ Entretien colonies : gratuit ('+p.investBonus2.freeUpkeep+' tour(s) restants)');
  else if(upE||upM)mal.push('🏙️ Entretien colonies : '+[upE?'−'+upE+'<i class=ri-energy></i>':'',upM?'−'+upM+'<i class=ri-materials></i>':''].filter(Boolean).join(' '));
  const nr=p.routes.length;
  if(nr){if(hasSpec(p,'route_force_free'))mal.push('🛤️ Routes ×'+nr+' : entretien gratuit (Hyperpropulsion) +'+nr+'<i class=ri-materials></i>');else mal.push('🛤️ Routes ×'+nr+' : −'+nr+'<i class=ri-energy></i> +'+nr+'<i class=ri-materials></i>');}
  if(p.govFormUpkeep){const o={};for(const r in p.govFormUpkeep)o[r]=-p.govFormUpkeep[r];mal.push('🗳️ Forme de gouvernement : '+fmt(o)+'/tour');}
  if(hasSpec(p,'empath_tele')&&estEnGuerre(p))mal.push('🧬 Télépathie (en guerre) : −2<i class=ri-morale></i>/tour');
  /* ⚠️ SECONDE COPIE DU BARÈME — celle-ci ne calcule rien, elle EXPLIQUE. Le calcul vit dans
     `revenusBruts` ; si une ligne y est ajoutée sans l'être ici, l'infobulle « Revenu par tour »
     annonce un net qu'elle n'est pas capable de justifier, et le joueur cherche l'erreur là où elle
     n'est pas. C'est la divergence décrite dans ARCHITECTURE_AVENIR.md §4. */
  {
    const _gu=(G.wars||[]).filter(function(w){return w&&!w.ended&&(w.a===p.civ.id||w.b===p.civ.id);}).length;
    if(_gu>0)mal.push('⚔️ Usure de guerre ×'+_gu+' : −'+(USURE_GUERRE_MORAL*_gu)+'<i class=ri-morale></i> au DÉBUT de chaque tour');
  }   // par NATION, pas par perspective
  const m=(p.res.morale||0);
  if(m===0)mal.push('💥 Moral 0 : GUERRE CIVILE — aucun revenu ce tour !');
  else if(m===1)mal.push('⚠️ Moral 1 : revenus ÷2 ce tour');
  // ── HTML ──
  let h='<div style="font-weight:700;color:#cdd8ff;margin-bottom:5px">📊 Revenu par tour</div>';
  h+='<div style="color:#7fe0a0;margin-bottom:2px;font-weight:600">Sources</div>';
  h+=inc.length?inc.map(l=>'<div>'+l+'</div>').join(''):'<div style="color:#7a88a8">Aucune colonie connectée.</div>';
  /* ═══ L'ORDRE DE LECTURE SUIT L'ORDRE DU CALCUL ═══
     Marc, partie 140A : « il vaut mieux indiquer le revenu brut en bas des colonies, puis en dessous
     les bonus malus d'entretien, et enfin le revenu net calculé. Pour le moment l'ordre est bizarre. »
     Il avait raison : le total BRUT était affiché APRÈS l'entretien, si bien qu'on lisait des
     déductions avant de savoir de quoi elles se déduisaient. On sous-total donc juste sous les
     sources, puis on retranche, puis on conclut. */
  h+='<div style="border-top:1px solid #2a3a5a;margin-top:5px;padding-top:4px;color:#9fb0d0">Total brut (avant entretien) : '+fmt(g)+'</div>';
  if(mal.length){h+='<div style="color:#ff9a8a;margin:6px 0 2px;font-weight:600">Entretien / malus</div>';h+=mal.map(l=>'<div style="color:#ffb3a3">'+l+'</div>').join('');}
  /* Total : on affiche le BRUT (somme des sources) puis le vrai NET, entretien déduit.
     Le net vient de _netIncome() — la même fonction que la barre du haut et le menu Empire,
     pour qu'il n'existe qu'un seul calcul de revenu net dans tout le jeu. */
  const _netTip=(typeof _netIncome==='function')?_netIncome(p):g;
  /* Le net doit rester lisible même à 0 ou en négatif : on affiche toute ressource
     présente dans le brut OU dans le net (sinon une déduction qui ramène à 0 disparaît). */
  const fmtNet=(o,ref)=>['materials','energy','science','morale'].filter(r=>o[r]||ref[r])
    .map(r=>'<span style="color:'+((o[r]||0)<0?'#ff6b6b':(o[r]||0)>0?'#7fe0a0':'#8898b8')+'">'+((o[r]||0)>0?'+':'')+(o[r]||0)+E[r]+'</span>').join(' ')||'—';
  h+='<div style="border-top:1px solid #2a3a5a;margin-top:6px;padding-top:4px;font-weight:700;color:#dfe8ff">= Revenu net (entretien déduit) : '+fmtNet(_netTip,g)+'</div>';
  return h;
}
// Revenu NET estimé du prochain end-of-turn, PAR ressource (revenus BRUTS − entretien colonies/routes/gouv,
// règles de moral incluses). Sert à l'aperçu barre du haut + menu Empire. Estimation (≈) : l'entretien
// routes suppose toutes les routes alimentées ; les pénalités de moral pour entretien impayé ne sont pas déduites.
function _netIncome(p){
  /* ⚠️ CE CALCUL AVAIT SA PROPRE VERSION DES REVENUS, et il lui manquait six règles : les passifs
     Ceinturiens et Jupitériens, Industrialisation, Recherche Intensive, Confort de la Population et
     Démocratie Instantanée. La barre du haut et le menu Empire annonçaient donc au joueur un revenu
     qu'il ne touchait pas. Il ne calcule plus rien : il lit `revenusBruts`, la version qui crédite
     vraiment. La suite — moral et entretien — lui appartient toujours. */
  const g=(!p||!p.civ)?{energy:0,materials:0,science:0,morale:0}:revenusBruts(p);
  if(!p||!p.civ) return g;
  for(const _r of ['energy','materials','science','morale']) if(g[_r]===undefined) g[_r]=0;
  // Règles de moral (appliquées aux REVENUS) : 0 = guerre civile (rien), 1 = ÷2.
  const m=(p.res.morale||0);
  if(m===0){ g.energy=0;g.materials=0;g.science=0;g.morale=0; }
  else if(m===1){ for(const r of ['energy','materials','science','morale']) g[r]=Math.floor((g[r]||0)/2); }
  // ENTRETIEN (déduit après) — colonies hors base
  /* Ces deux drapeaux étaient déclarés en tête de la partie « revenus », qui a migré dans
     `revenusBruts`. Le barème d'entretien, lui, est resté ici : il faut donc les redéclarer.
     (Sans ça : « _bio is not defined » — attrapé par la mesure, pas par la lecture.) */
  const _terra=hasSpec(p,'terra3'),_bio=hasSpec(p,'bio2_bonus');
  void _terra;
  const extraCols=p.colonies.filter(c=>c.nodeId!==p.civ.home);   // exception « stations orbitales joviennes » supprimée (voir doMaintenance)
  /* ⚠️ MÊME BARÈME QUE `doMaintenance` — c'est une SECONDE implémentation du même calcul, et elle a
     déjà divergé par le passé (bug du revenu net, une semaine perdue). Toute modification du barème
     doit toucher LES DEUX. 1⚡ par colonie quel que soit le niveau, matériaux 0/1/2. */
  const _bio1N=hasSpec(p,'upkeep_e_disc');
  let upE=0,upM=0; for(const c of extraCols){if(_bio)continue;/*Biosphère Avancée : aucun entretien*/const lvl=c.level||1; if(!(_bio1N&&lvl<=1))upE+=1;/*Biosphère Autonome : Nv1 gratuit en ⚡*/ upM+=lvl>=3?2:lvl>=2?1:0;}
  /* Biosphère Autonome : −1⚡ PAR COLONIE DE NIVEAU 1 (Marc, 2026-08-09) — appliquée dans la boucle
     ci-dessus. Ne reste ici que le forfait `upkeepDiscount`, que plus aucune carte ne pose. */
  upE=Math.max(0,upE-((p.stratBonus&&p.stratBonus.upkeepDiscount)||0));
  if(p.investBonus2&&(p.investBonus2.freeUpkeep||0)>0){upE=0;upM=0;}
  g.energy-=upE; g.materials-=upM;
  const nr=p.routes.length; if(!hasSpec(p,'route_force_free')) g.energy-=nr; g.materials+=nr; // route : −1⚡ +1🪨
  if(p.govFormUpkeep) for(const r in p.govFormUpkeep) g[r]=(g[r]||0)-(p.govFormUpkeep[r]||0);
  return g;
}
// Petit badge « +N/t » ou « −N/t » coloré (vert positif, rouge négatif).
function _netBadge(v,big){ const c=v<0?'#ff6b6b':v>0?'#7fe0a0':'#8898b8'; const sz=big?'.66em':'.7em'; return '<span style="font-size:'+sz+';color:'+c+';font-weight:700;margin-left:3px">'+(v>0?'+':'')+v+'/t</span>'; }
function _showRevTip(){
  _hideRevTip();const p=G&&G.player;if(!p)return;
  const el=document.getElementById('top-res');if(!el)return;
  const d=document.createElement('div');d.id='rev-tip';
  d.style.cssText='position:fixed;z-index:900;max-width:330px;background:#0a0e1e;border:1px solid #3a4a6a;border-radius:8px;padding:10px 12px;font-size:11px;line-height:1.5;color:#c8d8f8;box-shadow:0 10px 30px rgba(0,0,0,.85);pointer-events:none';
  d.innerHTML=revenueBreakdownHTML(p);document.body.appendChild(d);
  const r=el.getBoundingClientRect();
  d.style.left=Math.max(6,Math.min(r.left,window.innerWidth-d.offsetWidth-6))+'px';
  d.style.top=Math.min(r.bottom+6,window.innerHeight-d.offsetHeight-6)+'px';
}
function _hideRevTip(){const d=document.getElementById('rev-tip');if(d)d.remove();}
function _wireRevTip(){const el=document.getElementById('top-res');if(!el)return;el.style.cursor='help';el.title='';el.onmouseenter=_showRevTip;el.onmouseleave=_hideRevTip;el.onclick=function(){document.getElementById('rev-tip')?_hideRevTip():_showRevTip();};}
/* ═══════════ LES REVENUS BRUTS D'UNE NATION — UNE SEULE VÉRITÉ ═══════════
   Marc, 2026-08-09 : « Rustine ne me plaira jamais. Mais fusion ne doit pas perdre le code qui
   fonctionne bien. J'aurais dit plutôt corriger le mauvais code. »

   C'est exactement ce qui est fait ici. Le calcul ci-dessous est celui de `doRevenues` — le code
   qui CRÉDITE réellement les ressources, donc celui qui a toujours eu raison. Il n'a pas été
   réécrit : il a été DÉPLACÉ, tel quel, dans une fonction sans effet de bord. `doRevenues`
   l'appelle et se contente ensuite de ce qui lui appartient : plafonds, moral, jetons, journal.

   Les deux calculs FAUTIFS — l'infobulle « Revenu par tour » et l'estimation du revenu net —
   avaient chacun leur propre version, et il leur manquait six règles : les passifs Ceinturiens et
   Jupitériens, Industrialisation, Recherche Intensive, Confort de la Population et Démocratie
   Directe. Ils ne calculent plus rien : ils lisent celle-ci.

   CE QUI N'EST **PAS** ICI, et c'est délibéré :
     · les PLAFONDS de ressources et la règle de moral (÷2, guerre civile) — elles s'appliquent au
       moment du versement, et l'estimation les traite autrement (elle regarde le moral courant,
       `doRevenues` regarde le drapeau posé au tour précédent). Mélanger les deux changerait le jeu ;
     · l'ENTRETIEN, qui est un prélèvement, pas un revenu.

   ⚠️ POINT À TRANCHER, laissé EXACTEMENT tel quel pour ne rien changer au jeu sans décision :
   le revenu des colonies connectées via un réseau ÉTRANGER n'est compté que `if(p===G.player)`,
   c'est-à-dire pour la seule nation active. À plusieurs joueurs, les autres n'en touchent donc
   rien. Cela ressemble beaucoup à la maladie de la perspective globale, mais le corriger
   MODIFIERAIT les revenus en partie : à signaler à Marc, pas à décider seul.

   `opts.journal(msg, cls)` reçoit les lignes de journal (vide par défaut : un affichage ne doit
   rien écrire dans le journal). `opts.detail` reçoit le détail poste par poste, pour l'infobulle. */
/* ═══════ CE QU'UNE COLONIE PRODUIT EN UN TOUR — UNE SEULE FOIS DANS LE JEU ═══════
   Extrait de `revenusBruts` le 2026-08-24, parce que le RAID en a besoin : il ne vole plus deux
   ressources au hasard dans les stocks, mais la PRODUCTION D'UN TOUR de la colonie visée (demande
   de Marc). Recopier le barème aurait fait une TROISIÈME version du calcul de revenu — le projet en
   a déjà payé le prix trois fois (voir `mesure_revenus.js`). Une règle, une fonction, deux
   appelants.

   Ne comprend QUE ce que la colonie produit elle-même : ressources du nœud multipliées par le
   niveau, moral et savoir de niveau, bonus Terraformation. Les revenus qui ne viennent pas d'une
   colonie — accords, technologies, passifs nationaux, investissements — n'en font pas partie et ne
   peuvent donc pas être pillés. */
/* ═══════ LE BUTIN D'UN RAID — LA PRODUCTION D'UN TOUR, PAS DEUX RESSOURCES AU HASARD ═══════
   Marc, 2026-08-24 : « le raid doit voler le revenu de la colonie du tour et pas seulement deux
   ressources à choix. » Le changement n'est pas cosmétique : piller devient une DÉCISION. Une
   colonie de niveau 3 sur un nœud riche rapporte quatre à six ressources ; une colonie de niveau 1
   presque rien. Choisir sa cible commence à compter, et la tension à +5 fait du raid un coup qu'on
   prépare au lieu d'un réflexe.
   Le moral n'est pas pillable : on ne vole pas la bonne humeur d'un peuple.
   Rend {col, butin} — `col` peut être nulle si la nation n'a aucune colonie connectée. */
function butinDeRaid(cible,nodeId){
  const cols=(cible.colonies||[]).filter(c=>c.connected&&!(NODES[c.nodeId]&&NODES[c.nodeId].decorative));
  if(!cols.length) return {col:null,butin:{}};
  let col=nodeId?cols.find(c=>c.nodeId===nodeId):null;
  if(!col){
    /* Sans cible désignée, on pille la plus productive — c'est ce que ferait n'importe quel
       pillard, et cela donne aux IA le même discernement qu'au joueur. */
    let meilleur=-1;
    for(const c of cols){
      const r=revenuDuneColonie(cible,c);
      const v=(r.energy||0)+(r.materials||0)+(r.science||0);
      if(v>meilleur){meilleur=v;col=c;}
    }
  }
  const brut=revenuDuneColonie(cible,col), butin={};
  for(const k of ['energy','materials','science']){
    const dispo=Math.min(brut[k]||0, cible.res[k]||0);   // on ne vole que ce qu'elle a vraiment
    if(dispo>0) butin[k]=dispo;
  }
  return {col:col,butin:butin};
}
function revenuDuneColonie(p,col){
  const node=NODES[col.nodeId]; const o={};
  if(!node||node.decorative) return o;
  const add=(k,v)=>{ if(v) o[k]=(o[k]||0)+v; };
  const _mult=col.level>=3?2:(col.level>=2?1.5:1);      // v18 : ressources du nœud × niveau
  for(const[r,a]of Object.entries(node.res)) add(r,Math.floor(a*_mult));
  /* Bonus moral RÉCURRENT — NIVEAU 3 SEULEMENT (Marc, 27/08 : « supprime le bonus moral des
     colonies niveau 2, fais seulement un bonus moral colonie niv 3 »).
     ⚠️ POURQUOI CE RETRAIT. Mesuré le même jour, une partie lue tour par tour : le moral saturait
     dès le tour 5 et 61 % des tours-nation se passaient collés au plafond. Chaque colonie améliorée
     ajoutait un revenu PERMANENT au moral, alors que le stock, lui, reste plafonné à 10 — le
     surplus était jeté sans que rien ne l'indique. Retirer l'échelon 2 divise par deux le nombre de
     colonies qui alimentent ce revenu.
     ⚠️ Le bonus PONCTUEL à l'amélioration (colonies attractives, Callisto) est autre chose et
     subsiste : il récompense le geste, il ne gonfle pas un revenu par tour. */
  if(col.level>=3)add('morale',2);
  // Terraformation : +1🪨 +1❤️/tour par colonie de niveau 2 ou 3
  if(hasSpec(p,'terra3')&&(col.level||1)>=2){ add('materials',1); add('morale',1); }
  /* Savoir par niveau — TOUTE colonie, sans exception. Ce commentaire disait « Hub technologique »
     et les règles en avaient déduit un hub qui n'a jamais existé : aucun nœud ne porte de marque de
     ce genre, et la condition ci-dessous ne teste que le niveau. Corrigé le 27/08 après vérification
     avec Marc, qui a choisi de garder la règle universelle — plus simple à lire et à jouer. */
  if(col.level>=3)add('science',2); else if(col.level>=2)add('science',1);
  return o;
}
function revenusBruts(p, opts){
  const _o=opts||{}, _j=_o.journal||function(){}, _d=_o.detail||null;
  const _det=(label,o)=>{ if(_d) _d.push({label:label,o:o}); };
  const gains={};
  /* TRANSIT PAR LE RÉSEAU D'UN PARTENAIRE. Une colonie non reliée à ton propre réseau rapporte
     quand même si UNE DE TES ROUTES la relie à un nœud sous accord commercial — c'est le droit de
     transit décrit dans les règles.
     ⚠️ DEUX CORRECTIONS ICI. (1) `if(p===G.player)` : seule la nation ACTIVE en profitait, les
     autres n'étaient jamais payées. (2) Le malus −1🙂 −1🪨 est SUPPRIMÉ à la demande de Marc
     (2026-08-14 : « Il faut supprimer ce malus. Je n'en veux plus. »). Il reste que ces colonies
     ne touchent pas le bonus de niveau : les ressources brutes du nœud, rien de plus. */
  for(const col of p.colonies){
    if(!col.foreignConnected)continue;
    const node=NODES[col.nodeId];
    if(node.decorative)continue;
    for(const[r,a]of Object.entries(node.res)){gains[r]=(gains[r]||0)+a;}
    _det('🔗 '+node.name+' (transit par un partenaire)',Object.assign({},node.res));
    _j('🔗 '+node.name+' — reliée par le réseau d\'un partenaire (ressources brutes, sans bonus de niveau)','dim');
  }
  for(const col of p.colonies){
    if(!col.connected)continue;
    const node=NODES[col.nodeId];
    if(node.decorative)continue;
    const _o=revenuDuneColonie(p,col);
    for(const _k of Object.keys(_o)) gains[_k]=(gains[_k]||0)+_o[_k];
    _det('🏙️ '+((NODES[col.nodeId]&&NODES[col.nodeId].name)||col.nodeId)+' (Nv.'+(col.level||1)+')',_o);
  }
  // Accord commercial actif : +1<i class=ri-materials></i> +1<i class=ri-morale></i> par accord (les deux nations)
  /* ⚠️ LES LIGNES DE JOURNAL DES BONUS ÉTAIENT RÉSERVÉES À LA NATION ACTIVE (`if(p===G.player)`).
     Le garde était inutile — `opts.journal` vaut « ne rien faire » par défaut, donc un simple calcul
     n'écrit jamais — et nuisible : en multijoueur, le détail des bonus d'investissement d'une autre
     nation ne s'affichait nulle part. On appelle `_j` sans condition ; c'est l'appelant qui décide
     s'il veut un journal. */
  /* ⚠️ SEULS LES SIGNATAIRES SONT PAYÉS. C'était `G.commercialAccords.length` pour tout le monde :
     une nation qui n'avait signé aucun accord touchait quand même +1🪨 +1🙂 par accord de la
     partie. Voir `accordsDe`. */
  {const _mes=accordsDe(p).length;
   if(_mes>0){
    gains.materials=(gains.materials||0)+_mes;
    gains.morale=(gains.morale||0)+_mes;
    _det('🤝 Accords commerciaux ×'+_mes,{materials:_mes,morale:_mes});
    _j('🤝 Accord commercial : +'+_mes+'<i class=ri-materials></i> +'+_mes+'<i class=ri-morale></i>','dim');
   }}
  if(p.civ.id==='ceinturiens'){gains.energy=(gains.energy||0)+1;_det('☠️ Réserves de la Ceinture',{energy:1});} // réserves de la ceinture
  /* JUPITÉRIENS — LE +1⚡ NATIONAL EST SUPPRIMÉ (Marc, 2026-08-14).
     ⚠️ TROIS AVANTAGES SE CUMULAIENT SUR LA MÊME RESSOURCE. Io est le nœud le plus riche en
     énergie du jeu (3⚡ ; le suivant est Titan à 2⚡, tout le reste est à 0 ou 1) — et c'est une
     CAPITALE : gratuite au tour 1, toujours connectée, exemptée d'entretien. Par-dessus venait ce
     +1⚡/tour, de la même ressource. Et la Forge Orbitale monte une lune jovienne pour 0 AC, en
     contournant la vraie monnaie rare du jeu.
     Mesuré le 2026-08-14 : 4⚡/tour au tour 1 contre 1⚡ pour les trois autres, et 17⚡ cumulés à la
     fin du tour 3 contre 5, 7 et 9. Le pouvoir national faisait double emploi avec la capitale :
     c'est lui qu'on retire, la richesse d'Io suffit à caractériser la nation. */
  {const _o={};for(const[r,a]of Object.entries(p.rpt)){gains[r]=(gains[r]||0)+a;if(a)_o[r]=a;}if(Object.keys(_o).length)_det('🔬 Bonus techs/cartes',_o);}
  // Bonus investissement Niv.1 (actif si turnsLeft > 0 ou non défini)
  if(p.investBonus&&(p.investBonus.turnsLeft===undefined||p.investBonus.turnsLeft>0)){
    if(p.investBonus.matX2&&gains.materials){const before=gains.materials;gains.materials=Math.floor(gains.materials*2);_j('🏭 Industrialisation active : <i class=ri-materials></i>×2 ('+before+'→'+gains.materials+')','dim');}
    if(p.investBonus.sciX2&&gains.science){const before=gains.science;gains.science=Math.floor(gains.science*2);_j('<i class=ri-science></i> Recherche Intensive active : <i class=ri-science></i>×2 ('+before+'→'+gains.science+')','dim');}
    if(p.investBonus.matHalf&&gains.materials){gains.materials=Math.floor(gains.materials/2);}
    if(p.investBonus.moraleBonus){gains.morale=(gains.morale||0)+p.investBonus.moraleBonus;_j('🌾 Agriculture Durable : +'+p.investBonus.moraleBonus+'<i class=ri-morale></i>','dim');}
    if(p.investBonus.matBonus){gains.materials=(gains.materials||0)+p.investBonus.matBonus;_det('🏭 Industrialisation Lourde',{materials:p.investBonus.matBonus});}
    if(p.investBonus.sciBonus){gains.science=(gains.science||0)+p.investBonus.sciBonus;_det('🔬 Recherche Intensive',{science:p.investBonus.sciBonus});}
  }
  // Bonus investissement Niv.2
  if(p.investBonus2&&(p.investBonus2.turnsLeft===undefined||p.investBonus2.turnsLeft>0)){
    // moraleX2 : gains de moral doublés
    if(p.investBonus2.moraleX2&&gains.morale){const before=gains.morale;gains.morale=Math.floor(gains.morale*2);_j('🕊️ Confort Population actif : <i class=ri-morale></i>×2 ('+before+'→'+gains.morale+')','dim');}
    if(p.investBonus2.moraleFlat){gains.morale=(gains.morale||0)+p.investBonus2.moraleFlat;_det('🕊️ Confort de la Population',{morale:p.investBonus2.moraleFlat});}
  }
  // Empathes T1 : +1<i class=ri-energy></i> par tranche de 2 routes
  if(hasSpec(p,'empath_routes')&&p.routes.length>=2){
    const _e=Math.floor(p.routes.length/2);
    gains.energy=(gains.energy||0)+_e;_det('🔮 Réseau Empathique ('+p.routes.length+' routes)',{energy:_e});
  }
  // Empathes T3 : −2<i class=ri-morale></i>/tour si guerre active
  /* ⚠️ `G.warState` est GLOBAL : il vaut « active » dès que la nation ACTIVE est en guerre,
     pas la nation `p` qu'on est en train de payer. À trois joueurs, une nation télépathe EN
     PAIX perdait donc 2 moral par tour parce qu'une AUTRE se battait — et, symétriquement,
     une télépathe en guerre n'y échappait quand la nation active était en paix. Même maladie
     que l'étiquette « dyson » : une donnée globale lue comme si elle parlait de p.
     (Signalé par Marc le 2026-08-09 : « si ça se trouve le problème est le même ». Il l'était.) */
  if(hasSpec(p,'empath_tele')&&estEnGuerre(p)){
    gains.morale=(gains.morale||0)-2;_det('🧬 Télépathie (en guerre)',{morale:-2});
  }
  /* ⚠️ L'USURE DE GUERRE N'EST PLUS ICI — et l'échec de la première version mérite d'être gardé.
     Elle valait −2 par guerre et se retranchait du REVENU, pour apparaître au bilan de fin de tour.
     Mesuré sur trois tirages identiques : aucun effet. Une nation qui gagne +9 de moral avec un
     plafond de 6 revient à 6 quoi qu'il arrive — un malus retranché du revenu est simplement
     absorbé par un surplus déjà jeté. Tant que le revenu dépasse le plafond, AUCUNE perte placée
     du côté du revenu ne peut survivre.
     Elle est désormais prélevée sur le STOCK, en début de tour (`_usureDeGuerre`), donc AVANT la
     phase d'actions qui fige le moral servant aux pénalités. Voir cette fonction. */
  if(p.govFormMorale){gains.morale=(gains.morale||0)+p.govFormMorale;_det('🗳️ Forme de gouvernement',{morale:p.govFormMorale});} // Démocratie Instantanée : +1<i class=ri-morale></i>/tour
  return gains;
}
function doRevenues(){
  let playerGains={};
  for(const p of allPlayers()){
    if(p._civilWar){p._civilWar=false;continue;}
    const caps=getResCapFor(p);
    /* LE CALCUL EST DANS `revenusBruts` — c'est CE code-ci qui y a été déplacé, sans modification.
       `doRevenues` garde ce qui est de son ressort : plafonds, moral, jetons, conquête, journal. */
    /* ⚠️ LE JOURNAL LOCAL RECEVAIT LES REVENUS DES QUATRE NATIONS.
       Cette boucle passe sur TOUTES les nations, et fournissait le journal à chacune : l'écran
       affichait donc « 🤝 Accord commercial : +3🪨 +3🙂 » quatre fois de suite, sans dire de qui il
       s'agissait. C'est du bruit, et c'est surtout une FUITE : le nombre d'accords et de bonus
       d'une rivale est une information qu'on n'a pas à lire.
       La règle du jeu est de journaliser pour la nation assise devant cet écran. C'est bien à
       l'APPELANT d'en décider — `revenusBruts` calcule et ne sait pas qui regarde ; c'est pour ça
       que la condition est ici et non dans le calcul. */
    const _pourMoi = (p===G.player);
    const gains=revenusBruts(p, _pourMoi?{journal:(m,c)=>addLog(m,c)}:{});
    if(p._halfResources){
      p._halfResources=false;
      for(const r of Object.keys(gains))gains[r]=Math.floor((gains[r]||0)/2);
      if(p===G.player)addLog('⚠️ Moral 1 — revenus ÷2','red');
    }
    for(const[r,a]of Object.entries(gains))p.res[r]=Math.min(caps[r]||10,(p.res[r]||0)+a);
    // +1 jeton Force par colonie NOUVELLEMENT acquise ce tour (vaisseaux de protection) — une seule fois par colonie
    const _prevCol=(p._colCountLastTurn===undefined)?p.colonies.length:p._colCountLastTurn;
    const _newCol=p.colonies.length-_prevCol;
    if(_newCol>0){p.forceTokens+=_newCol;if(p===G.player)addLog('⚔️ +'+_newCol+' jeton(s) Force — vaisseaux de protection des nouvelles colonies.','gold');}
    p._colCountLastTurn=p.colonies.length;
    // Mécontentement de conquête : −2<i class=ri-morale></i> le 1er tour de possession, −1<i class=ri-morale></i> les 2 suivants (apaisé par une amélioration de la colonie)
    let _conquestPen=0;
    for(const col of p.colonies){
      if(col._conquest>0){
        const pen=col._conquest===3?2:1;
        p.res.morale=Math.max(0,(p.res.morale||0)-pen);
        if(p===G.player){_conquestPen+=pen;addLog('💢 '+(NODES[col.nodeId]?.name||col.nodeId)+' (récemment conquise) — population mécontente : −'+pen+'<i class=ri-morale></i>','red');}
        col._conquest--;
      }
    }
    /* Revenus mémorisés PAR NATION — nécessaires au bilan de fin de tour de CHAQUE humain
       en multijoueur (chacun voit le sien, calculé ici une seule fois). */
    p._lastRevs=Object.assign({},gains);
    if(p===G.player){
      playerGains=gains;
      // Le journal affiche le revenu NET (après entretien) : on garde les gains bruts ici,
      // et la ligne « 💰 Revenus nets » est émise après doMaintenance (voir _emitNetRevenueLog).
      G._revLogData={gross:{energy:gains.energy||0,materials:gains.materials||0,science:gains.science||0},
        grossM:gains.morale||0,conquestPen:_conquestPen,manif:(p._manifLoss||0)};
    }
  }
  return playerGains;
}
/* ============================================================ PLAYER ACTIONS ============================================================ */
function toggleMode(m){
  if(G.phase!=='actions')return;
  if(_scGuard())return;
  if(mode===m){mode=null;setHint('');render();return;}
  mode=m;routeFrom=null;closePopup();
  if(m==='colonize')setHint('Nœuds colonisables surlignés — clique un nœud pour ouvrir sa fiche (option Coloniser).');
  if(m==='route')setHint('Tes nœuds de départ surlignés — clique un nœud pour ouvrir sa fiche (options Route → voisin).');
  if(m==='attack')setHint('⚔️ Colonies ennemies — clique un nœud pour ouvrir sa fiche (option Attaquer).');
  render();
}
function handleNodeClick(nodeId){
  // Tout clic sur un nœud ouvre SA FICHE (plus d'action « en aveugle » selon un mode).
  // Les boutons 🏗/🛤 ne servent plus qu'à surligner les cibles possibles sur la carte.
  showNodePopup(nodeId);
}
/* ═══ LA NATION QUI AGIT EST UN ARGUMENT, PLUS UNE VARIABLE GLOBALE ═══
   ⚠️ Cette action lisait `G.player` — « la nation actuellement affichée » — et non « celle qui
   agit ». En solo c'est la même ; à quatre nations, cela ne l'est que si le serveur a pensé à faire
   tourner `G.player` juste avant l'appel. C'est la maladie de fond décrite dans
   `ARCHITECTURE_AVENIR.md`, et elle a produit tous les défauts graves du mois d'août.
   Le paramètre est FACULTATIF : sans lui on retombe sur `G.player`, et les appels existants se
   comportent exactement comme avant (`mesure_equivalence.js` le vérifie). Ce qui change, c'est
   qu'un appelant qui SAIT de qui il parle peut désormais le dire. */
function buyTech(cardId, nation){
  const _n=nation||G.player;
  if(G.phase!=='actions')return;
  if(_scGuard())return;
  const card=CARDS_POOL.find(c=>c.id===cardId);if(!card)return;
  if(!isTechAvailable(card,_n)){
    if(card.tier===3&&!_n.cards.some(c=>c.branch===card.branch&&c.tier===2))
      addLog('⚠️ Vous devez d\'abord posséder personnellement la T2 de cette branche.','red');
    else addLog('⚠️ Branche non encore débloquée (achetez d\'abord T'+(card.tier-1)+').','red');
    return;
  }
  if(card.branch==='empathes'&&!isEmpathesAvailableFor(_n)){addLog('⚠️ Branche Empathes non disponible (Union Sacrée requise ou exclusivité fondateur).','red');return;}
  if(isTechExclusive(card)){
    if(G.techTaken.has(cardId)){addLog('⚠️ Cette carte est déjà prise par une autre faction.','red');return;}
  }else{
    if(_n.cards.some(c=>c.id===cardId)){addLog('⚠️ Vous possédez déjà cette carte.','red');return;}
  }
  const acCost=card.tier===3?2:1;
  if(_n.acLeft<acCost){addLog('⚠️ Pas assez d\'AC (besoin '+acCost+').','red');return;}
  const cost=getEffCost(card,_n);
  for(const[r,a]of Object.entries(cost)){if((_n.res[r]||0)<a){addLog('⚠️ Pas assez de '+rLabel(r)+' (besoin '+a+').','red');return;}}
  saveUndo();
  _n.acLeft-=acCost;
  _n.spentThisTurn+=acCost+Object.values(cost).reduce((s,v)=>s+v,0);
  for(const[r,a]of Object.entries(cost))_n.res[r]-=a;
  _n.cards.push(card);applyCard(card,_n);
  if(isTechExclusive(card))G.techTaken.add(cardId);
  if(card.branch)G.branchTiers[card.branch]=Math.max(G.branchTiers[card.branch]||0,card.tier);
  const costStr=Object.entries(cost).map(([r,a])=>'-'+a+rEmoji(r)).join(' ');
  addLog('✅ '+card.emoji+' '+card.name+' — '+acCost+' AC'+(costStr?' '+costStr:''),'green');
  addAction(card.emoji,card.name,acCost,cost,card.effect);
  if(card.id==='tele3'){const ais=G.ais.filter(a=>a.cards.length>0);if(ais.length>0){closePopup();showEmpathCopyModal();return;}}
  if(card.id==='extra3'&&G._pendingExtraSolar&&G._pendingExtraSolar.length){closePopup();showExtraSolarChoice();return;}
  if(card.id==='dyson3'){closePopup();showDysonModal();return;}
  scArmConfirm(card.emoji+' '+card.name,_scCardGains(card));
  closePopup();render();
}
/* ═══ LA NATION QUI AGIT EST UN ARGUMENT, PLUS UNE VARIABLE GLOBALE ═══
   ⚠️ Cette action lisait `G.player` — « la nation actuellement affichée » — et non « celle qui
   agit ». En solo c'est la même ; à quatre nations, cela ne l'est que si le serveur a pensé à faire
   tourner `G.player` juste avant l'appel. C'est la maladie de fond décrite dans
   `ARCHITECTURE_AVENIR.md`, et elle a produit tous les défauts graves du mois d'août.
   Le paramètre est FACULTATIF : sans lui on retombe sur `G.player`, et les appels existants se
   comportent exactement comme avant (`mesure_equivalence.js` le vérifie). Ce qui change, c'est
   qu'un appelant qui SAIT de qui il parle peut désormais le dire. */
function buyGeneral(cardId, nation){
  const _n=nation||G.player;
  if(G.phase!=='actions')return;
  if(_scGuard())return;
  // Cherche dans civRiver ou milRiver
  const card=(G.civRiver||[]).find(c=>c&&c.id===cardId)||(G.milRiver||[]).find(c=>c&&c.id===cardId)
           ||(G.generalRiver||[]).find(c=>c&&c.id===cardId);
  if(!card)return;
  if(card.reqCard&&!_n.cards.some(c=>c.id===card.reqCard)){const _rn=CARDS_POOL.find(c=>c.id===card.reqCard)?.name||card.reqCard;addLog('⚠️ '+card.name+' nécessite la tech « '+_rn+' ».','red');return;}
  if(card.type==='militaire'){
    if(!_n._milBoughtThisTurn)_n._milBoughtThisTurn=new Set();
    if(_n._milBoughtThisTurn.has(card.id)){addLog('⚠️ '+card.name+' déjà acheté ce tour (1×/tour).','red');return;}
    /* ⚠️ « UNE SEULE FOIS » VEUT DIRE PAR JOUEUR, PAS PAR PARTIE. C'est la possession qui compte,
       et elle se lit dans les cartes de CETTE nation — pas dans un registre commun. */
    if(!card.repeatable&&_n.cards.some(c=>c.id===card.id)){addLog('⚠️ '+card.name+' — tu la possèdes déjà (une seule par partie).','red');return;}
  }
  const acCost=card.ac||1;
  if(_n.acLeft<acCost){addLog('⚠️ Pas assez d\'AC (besoin '+acCost+').','red');return;}
  const cost=getEffCost(card,_n);
  for(const[r,a]of Object.entries(cost)){if((_n.res[r]||0)<a){addLog('⚠️ Pas assez de '+rLabel(r)+'.','red');return;}}
  saveUndo();
  _n.acLeft-=acCost;_n.spentThisTurn+=acCost+Object.values(cost).reduce((s,v)=>s+v,0);
  for(const[r,a]of Object.entries(cost))_n.res[r]-=a;
  // Pour les militaires répétables, on clone la carte pour ne pas bloquer les futurs achats
  /* ⚠️ ON CLONE TOUJOURS. Les cartes non répétables poussaient l'objet du CATALOGUE dans la main du
     joueur : tant qu'une seule nation pouvait la prendre, cela ne se voyait pas. Depuis que le
     Supercroiseur est accessible à tous, deux nations partageraient la même instance — toute
     mutation de l'une se lirait chez l'autre, et la sauvegarde la dupliquerait en deux objets
     distincts au rechargement. Un clone par acquéreur, sans exception. */
  const cardCopy={...card,_uid:(card.repeatable?Date.now():card.id+':'+_n.civ.id)};
  _n.cards.push(cardCopy);applyCard(cardCopy,_n);
  if(card.type==='militaire'){if(!_n._milBoughtThisTurn)_n._milBoughtThisTurn=new Set();_n._milBoughtThisTurn.add(card.id);} // 1× par carte par tour
  // Militaires : répétables → rien dans techTaken
  // Civiques : chacun peut acheter 1×, pas de blocage global → rien dans techTaken
  // Branche T3 exclusive : techTaken global
  /* ═══ `G.techTaken` EST UN REGISTRE GLOBAL — IL NE DOIT CONCERNER QUE LES BRANCHES ═══
     ⚠️ Il existe pour l'exclusivité des technologies de rang 3 : la première nation qui prend une T3
     de branche la ferme aux autres. Les cartes MILITAIRES y tombaient aussi, du seul fait qu'elles
     sont `repeatable:false` — si bien que le premier joueur à acheter le Supercroiseur le rendait
     introuvable pour toute la table. Marc, partie 140A : « Supercroiseur est limité à un joueur, ça
     ne devrait pas être le cas. »
     Le militaire se limite désormais par la POSSESSION (voir le contrôle plus haut) : chacun peut
     l'acheter une fois, personne ne prive les autres. */
  if(!card.repeatable&&card.type!=='militaire') G.techTaken.add(cardId);
  addLog('✅ '+card.emoji+' '+card.name+' ('+acCost+' AC)','green');
  addAction(card.emoji,card.name,acCost,cost,card.effect);
  scArmConfirm(card.emoji+' '+card.name,_scCardGains(card));
  closePopup();render();
}
function buyMarket(cardId){
  if(G.phase!=='actions')return;
  if(_scGuard())return;
  const card=CIVIC_MARKET.find(c=>c.id===cardId);if(!card)return;
  const isGov=card.type==='government';
  const isPerTurn=!!card.perTurn;
  const isRepeat=!!(card.repeatable||card.calmAction||isPerTurn); // perTurn = pas bloqué à vie, mais 1×/tour (voir ci-dessous)
  if(isGov){
    if(G.player.govForm===cardId){addLog('⚠️ '+card.name+' est déjà ta forme de gouvernement actuelle.','red');return;}
  } else if(isPerTurn){
    if(!G.player._civicPerTurn)G.player._civicPerTurn=new Set();
    if(G.player._civicPerTurn.has(cardId)){addLog('⚠️ '+card.name+' déjà activé ce tour (1×/tour).','red');return;}
  } else if(!isRepeat&&G.player._civicTaken&&G.player._civicTaken.has(cardId)){addLog('⚠️ '+card.name+' a déjà été utilisé cette partie.','red');return;} // par NATION (multi : chaque nation a ses civiques)
  if(G.player.acLeft<1){addLog('⚠️ Pas assez d\'AC (besoin 1).','red');return;}
  for(const[r,a]of Object.entries(card.cost)){if((G.player.res[r]||0)<a){addLog('⚠️ Pas assez de '+rLabel(r)+' (besoin '+a+').','red');return;}}
  // Calmer la Population : ouvre popup de choix de nation avant débit (−3 tension)
  if(card.calmAction){closePopup();showCalmPopup('civic',3);return;}
  saveUndo();
  G.player.acLeft-=1;
  G.player.spentThisTurn+=1+Object.values(card.cost).reduce((s,v)=>s+v,0);
  for(const[r,a]of Object.entries(card.cost))G.player.res[r]-=a;
  const caps=getResCapFor(G.player);
  if(card.resGain)for(const[r,a]of Object.entries(card.resGain))G.player.res[r]=Math.min(caps[r]||10,(G.player.res[r]||0)+a);
  if(card.rGain)for(const[r,a]of Object.entries(card.rGain))G.player.rpt[r]=(G.player.rpt[r]||0)+a; // ex. Universités : +1<i class=ri-science></i>/tour permanent
  if(card.govForm)adoptGovForm(G.player,card);
  if(card.govPts)addGovPts(G.player,card.govPts);
  if(isPerTurn){ if(!G.player._civicPerTurn)G.player._civicPerTurn=new Set(); G.player._civicPerTurn.add(cardId); } // 1×/tour
  else if(!isGov&&!isRepeat){ if(!G.player._civicTaken)G.player._civicTaken=new Set(); G.player._civicTaken.add(cardId); } // par NATION
  const costStr=Object.entries(card.cost).map(([r,a])=>'-'+a+rEmoji(r)).join(' ');
  addLog('💼 '+card.emoji+' '+card.name+' — 1AC'+(costStr?' '+costStr:'')+' → '+card.effect,'gold');
  addAction(card.emoji,card.name,1,card.cost,card.effect);
  scArmConfirm(card.emoji+' '+card.name,_scCardGains(card));
  closePopup();render();
}
function showMarketDetail(cardId){
  const card=CIVIC_MARKET.find(c=>c.id===cardId);if(!card)return;
  _techDetailId=cardId;_detailIsGeneral=false;_detailIsMarket=true;
  const cost=card.cost;
  const isGov=card.type==='government';
  const isRepeat=!!(card.repeatable||card.calmAction||card.perTurn); // perTurn = utilisable CHAQUE tour → ∞
  const isCurrentForm=isGov&&G.player.govForm===cardId;
  const blocked=isGov?isCurrentForm:(!isRepeat&&G.player._civicTaken&&G.player._civicTaken.has(cardId));
  const canBuy=G.phase==='actions'&&G.player.acLeft>=1&&!blocked&&Object.entries(cost).every(([r,a])=>(G.player.res[r]||0)>=a);
  const border=isGov?'#4a90e8':'#66cc88';
  document.getElementById('td-card').style.borderTop=`4px solid ${border}`;
  const artEl=document.getElementById('td-art');
  if(CARD_ART.has(cardId)){artEl.style.background=`#0a0a18 url('assets/cards/${cardId}.png') center/contain no-repeat`;artEl.style.height='300px';}
  else{artEl.style.background=border+'22';artEl.style.height='';}
  artEl.innerHTML=`<span class="td-tier-badge">${isRepeat?'∞':isGov?'GOV':'1×'}</span>${CARD_ART.has(cardId)?'':`<span id="td-emoji">${card.emoji}</span>`}<span class="td-taken-badge hidden"></span>`;
  document.getElementById('td-name').textContent=card.name;
  document.getElementById('td-branch').textContent=isGov?'🏛️ Gouvernement (GOV) · forme — remplace l\'actuelle':card.govPts?'🏛️ Civique · points de gouvernement permanents · 1× par partie':(isRepeat?'🌿 Social · répétable chaque tour':'🌿 Social · 1× par partie');
  document.getElementById('td-effect').innerHTML=card.effect;
  const statusTxt=isGov?(isCurrentForm?' <span style="color:#88ccff;margin-left:6px">✓ Forme actuelle</span>':' <span style="color:#aaffaa;margin-left:6px">Adopter</span>'):(blocked?' <span style="color:#ff6060;margin-left:6px">✗ Déjà utilisé</span>':' <span style="color:#aaffaa;margin-left:6px">Disponible</span>');
  document.getElementById('td-cost').innerHTML='<span class="res-tag energy">1 AC</span> '+costHtml(cost)+statusTxt;
  const btn=document.getElementById('td-buy-btn');
  btn.style.display='block';
  if(G.phase!=='actions'){btn.className='td-buy cannot';btn.textContent='Pas disponible hors phase actions';}
  else if(isCurrentForm){btn.className='td-buy cannot';btn.textContent='Forme déjà active';}
  else if(blocked){btn.className='td-buy cannot';btn.textContent='Déjà utilisé cette partie';}
  else if(!canBuy){btn.className='td-buy cannot';btn.textContent='Ressources insuffisantes';}
  else{btn.className='td-buy can';btn.textContent=isGov?'🏛️ Adopter (1 AC)':'💼 Acheter (1 AC)';}
  document.getElementById('tech-detail-modal').classList.remove('hidden');var _tdm=document.getElementById('tech-detail-modal');_tdm.scrollTop=0;var _tdc=document.getElementById('td-card');if(_tdc)_tdc.scrollTop=0;requestAnimationFrame(function(){_tdm.scrollTop=0;if(_tdc)_tdc.scrollTop=0;});
}
function applyCard(card,p){
  if(card.forceBonus)p.forceTokens+=card.forceBonus;
  if(card.forceTemp){p.forceTokens+=card.forceTemp;p.milLoseNext=(p.milLoseNext||0)+(card.forceLoseNext||0);} // renforts temporaires (dissous au tour suivant)
  if(card.warForce){p.hasCruiser=true;p.cruiserPower=card.warForce;} // Supercroiseur : possédé ; déployé à la demande en guerre (5 jetons insécables, coût 5<i class=ri-materials></i> 5<i class=ri-energy></i>)
  /* `card.combatBonus` n'est plus RECOPIÉ dans la nation : il est lu directement sur les cartes
     par `bonusCombatCartes(p)`. Un accumulateur qu'il fallait remettre à zéro chaque tour, que
     personne ne lisait, et qui donnait l'illusion que le champ servait — c'était le piège. */
  void card.combatBonus;
  if(card.rGain)for(const[r,a]of Object.entries(card.rGain)){p.rpt[r]=(p.rpt[r]||0)+a;}
  if(card.resGain)for(const[r,a]of Object.entries(card.resGain)){const caps=getResCapFor(p);p.res[r]=Math.min(caps[r]||10,(p.res[r]||0)+a);}
  if(card.govPts)addGovPts(p,card.govPts);
  if(card.govRpt)p.govRpt=(p.govRpt||0)+card.govRpt;
  if(card.spec==='res_cap_up')p._resCap=(p._resCap||0)+2;
  /* ROUTES QUI N'ONT PLUS BESOIN DE JETON → on rend les jetons déjà posés à la réserve.
     Deux technologies rendent les routes protégées SANS jeton :
       · `ia_immune`     — IA Défensive, « Immunité raids/pirates. Rappelle tes jetons des routes. »
       · `empath_routes` — Lien Empathe, « Routes sans jeton. » (ajouté le 2026-08-07 à la demande
                            de Marc : la carte l'annonçait déjà, le code ne le faisait pas.)
     Sans ce rappel, les jetons restaient immobilisés sur des routes qui n'en avaient plus l'usage —
     le joueur payait une protection devenue gratuite, et sa force de combat en souffrait.
     ⚠️ Les deux techs sont déjà traitées ensemble ailleurs (`techProt` en défense de route, routes
     inattaquables) : c'est bien la MÊME règle, elle était juste incomplète ici. */
  if(card.spec==='ia_immune'||card.spec==='empath_routes'){
    const _nomTech=(card.spec==='ia_immune')?'IA Défensive':'Lien Empathe';
    let recalled=0; for(const r of p.routes){if((r.tokens||0)>0){p.forceTokens+=r.tokens;recalled+=r.tokens;r.tokens=0;}}
    if(recalled>0){updateConnections(p);if(p===G.player)addLog('🛡️ '+_nomTech+' : '+recalled+' jeton(s) rappelé(s) des routes (désormais protégées sans jeton) → rendus à ta réserve.','gold');}
  }
  // Exploration Extra-Solaire : choisir UNE planète parmi Éris/Pluton/Triton (≥5 techs)
  if(card.spec==='extrasolar'){
    /* Même correction : « 5 technologies ou plus » compte TOUTE carte de l'arbre technologique.
       Avec `type==='technology'` la condition n'en voyait que 12 sur 21, et le +8 VP promis par les
       règles était donc bien plus dur à obtenir que ce qu'elles annoncent. */
    const techCount=p.cards.filter(c=>!!c.branch).length;
    if(techCount>=5){
      const cand=['eris','pluto','triton'].filter(nid=>!p.colonies.find(c=>c.nodeId===nid));
      if(p===G.player){
        G._pendingExtraSolar=cand; // le joueur choisira (modale après l'achat)
      }else if(cand.length){
        // IA : choisit une planète libre de préférence, sinon accord forcé
        const free=cand.filter(nid=>!allPlayers().some(pl=>pl.colonies.find(c=>c.nodeId===nid)));
        _extraSolarColonize(p,free[0]||cand[0]);
      }
    }
  }
}
// Colonisation Extra-Solaire d'UNE planète (accord forcé + non améliorable si déjà occupée)
function _extraSolarColonize(p,nid){
  if(!nid||p.colonies.find(c=>c.nodeId===nid))return;
  const occupied=allPlayers().some(pl=>pl!==p&&pl.colonies.find(c=>c.nodeId===nid));
  if(occupied){const _occ=allPlayers().find(function(pl){return pl!==p&&pl.colonies.some(function(c){return c.nodeId===nid;});});_accordEnregistrer(nid,p,_occ);}
  const connected=(typeof checkConnected==='function')?checkConnected(nid,p):false;
  p.colonies.push({nodeId:nid,level:1,connected,noUpgrade:!!occupied});
  updateConnections(p);
  if(p===G.player)addLog('🚀 Extra-Solaire : tu colonises '+NODES[nid].name+(occupied?' (accord commercial forcé — non améliorable)':'')+' !','gold');
  else addLog('🤖 IA Extra-Solaire → '+NODES[nid].name+(occupied?' (accord forcé)':''),'dim');
}
function showExtraSolarChoice(){
  const cand=G._pendingExtraSolar||[];
  if(!cand.length){G._pendingExtraSolar=null;render();return;}
  if(_decisionActive()){ // mode serveur : router le choix de planète extra-solaire
    _emitDecision('extrasolar', G.player,
      {options:cand.map(nid=>({node:nid, name:NODES[nid]?.name||nid, emoji:NODES[nid]?.emoji||'', occupied:allPlayers().some(pl=>pl!==G.player&&pl.colonies.find(c=>c.nodeId===nid))}))},
      extraSolarPick, (ans)=>(ans&&ans.node)||cand[0]);
    return;
  }
  document.getElementById('dyson-title').textContent='🚀 Exploration Extra-Solaire';
  document.getElementById('dyson-sub').innerHTML='Choisis <b>UNE</b> planète. Si déjà tenue : accord forcé + colonie non améliorable.';
  document.getElementById('dyson-nations').innerHTML='';
  document.getElementById('dyson-actions').innerHTML='<div style="display:flex;flex-direction:column;gap:8px">'+cand.map(nid=>{
    const occ=allPlayers().some(pl=>pl!==G.player&&pl.colonies.find(c=>c.nodeId===nid));
    return '<button class="eot-btn" style="margin-top:0;background:#10142e;border-color:#6a7ad0;color:#bcd" onclick="extraSolarPick(\''+nid+'\')">'+(NODES[nid]?.emoji||'')+' '+(NODES[nid]?.name||nid)+(occ?' — accord forcé (non améliorable)':' — libre')+'</button>';
  }).join('')+'</div>';
  document.getElementById('dyson-modal').classList.remove('hidden');
}
function extraSolarPick(nid){
  document.getElementById('dyson-modal').classList.add('hidden');
  _extraSolarColonize(G.player,nid);
  G._pendingExtraSolar=null;
  render();
}
function colonizeCost(p){
  if(p.investBonus&&p.investBonus.freeCol>0){
    // 1 seule colonisation vraiment gratuite (pas d'AC, pas de ressources) — usage unique
    return{ac:0,mat:0,en:0,_useFree:true};
  }
  let ac=1,mat=2,en=1;
  if(p.civ.id==='martiens'){mat=Math.max(0,mat-1);en=Math.max(0,en-1);}
  if(hasSpec(p,'col_mat_disc'))mat=Math.max(0,mat-1);
  let _useStrat=false;
  if(p.stratBonus&&p.stratBonus.spec==='strat_col_ac'&&!p._stratColUsed){ac=Math.max(0,ac-1);_useStrat=true;}
  if(p.stratBonus&&p.stratBonus.spec==='strat_col_free'&&!p._stratColUsed){mat=0;en=0;_useStrat=true;}
  return{ac,mat,en,_useStrat};
}
/* ═══ LA NATION QUI AGIT EST UN ARGUMENT, PLUS UNE VARIABLE GLOBALE ═══
   ⚠️ Cette action lisait `G.player` — « la nation actuellement affichée » — et non « celle qui
   agit ». En solo c'est la même ; à quatre nations, cela ne l'est que si le serveur a pensé à faire
   tourner `G.player` juste avant l'appel. C'est la maladie de fond décrite dans
   `ARCHITECTURE_AVENIR.md`, et elle a produit tous les défauts graves du mois d'août.
   Le paramètre est FACULTATIF : sans lui on retombe sur `G.player`, et les appels existants se
   comportent exactement comme avant (`mesure_equivalence.js` le vérifie). Ce qui change, c'est
   qu'un appelant qui SAIT de qui il parle peut désormais le dire. */
function doColonize(nodeId, nation){
  const _n=nation||G.player;
  if(_scGuard())return;
  const node=NODES[nodeId];
  if(node.decorative||node.noColonize){addLog('⚠️ Territoire jovien — non colonisable.','red');return;}
  if(_n.colonies.find(c=>c.nodeId===nodeId)){addLog('⚠️ Colonie déjà présente sur '+node.name+'.','red');return;}
  // Extra-solaire (Triton/Pluton/Éris) désormais colonisable par TOUS — plus de tech requise (c'est juste très loin à connecter). La tech Exploration Extra-Solaire reste pour sa colonie gratuite + VP.
  const aColHere=G.ais.some(ai=>ai.colonies.find(c=>c.nodeId===nodeId));
  if(aColHere){addLog('⚠️ '+node.name+' est déjà colonisé par une autre nation — colonisation impossible (seule l\'Exploration Extra-Solaire permet une co-colonisation).','red');return;}
  const isAdjacent=_n.colonies.some(c=>NODES[c.nodeId]?.conn.includes(nodeId))||_n.routes.some(r=>(r.from===nodeId||r.to===nodeId)&&_n.colonies.find(c=>c.nodeId===(r.from===nodeId?r.to:r.from)));
  const cost=colonizeCost(_n);
  const{ac,mat,en}=cost;
  if(_n.acLeft<ac){addLog('⚠️ Pas assez d\'AC (besoin '+ac+').','red');return;}
  if((_n.res.materials||0)<mat){addLog('⚠️ Pas assez de Matériaux.','red');return;}
  if((_n.res.energy||0)<en){addLog('⚠️ Pas assez d\'Énergie.','red');return;}
  saveUndo(); // colonisation annulable (popup ↩/Valider) ; la découverte est fixée par nœud pour éviter le re-roll
  if(cost._useFree&&_n.investBonus){_n.investBonus.freeCol--;addLog('🚀 Expansion Rapide : colonisation sans AC !','gold');}
  if(cost._useStrat)_n._stratColUsed=true;
  _n.acLeft-=ac;_n.res.materials-=mat;_n.res.energy-=en;
  _n.spentThisTurn+=ac+mat+en;
  const connected=checkConnected(nodeId,_n);
  _n.colonies.push({nodeId,level:1,connected});
  updateConnections(_n);
  // Moral one-time : Niv.1 = +1<i class=ri-morale></i> pour tous; colonie éloignée = −1<i class=ri-morale></i> (conditions difficiles)
  // Biosphère Avancée (bio2_bonus) supprime le malus des colonies difficiles
  const isRemoteCol=['deimos','vesta','europe','encelade','pluto','eris'].includes(nodeId);
  if(isRemoteCol&&!hasSpec(_n,'bio2_bonus')){
    // Net 0 : +1 Niv.1 − 1 éloignée (les deux s'annulent, on log séparément)
    addLog('⚠️ Colonie éloignée — conditions difficiles (−1<i class=ri-morale></i>), mais vie améliorée (+1<i class=ri-morale></i>) → net 0','dim');
  } else {
    _n.res.morale=(_n.res.morale||0)+1;
    const msg=isRemoteCol?' — Biosphère Avancée : malus annulé !':'';
    addLog('🏠 '+node.name+' Nv.1 — amélioration des conditions de vie (+1<i class=ri-morale></i>)'+msg,'gold');
  }
  addLog('🏗️ Colonie sur '+node.name+(connected?' ✓ connectée':' ✗ non connectée'),'green');
  addAction('🏗️','Coloniser '+node.name,ac,{materials:mat,energy:en},connected?'Connectée':'Non connectée');
  // Discovery
  if(!G._discCache)G._discCache={};
  let disc=G._discCache[nodeId];
  if(!disc){disc=DISCOVERY_TILES[Math.floor(Math.random()*DISCOVERY_TILES.length)];G._discCache[nodeId]=disc;}
  G._decouverteEnAttente={disc,nodeId}; // dans G : une tuile en attente doit survivre à une sauvegarde
  showDiscoveryModal(disc);
}
// Colonies au paysage attrayant → bonus moral au Niv.2
const ATTRACTIVE_COLS=['lune','europe','titan','encelade','triton'];
/* `nat` : la nation qui améliore. Sans lui, la nation active — comportement d'origine inchangé.
   ⚠️ `G.player` y était le PARAMÈTRE IMPLICITE de l'action : elle s'appliquait à la bonne nation,
   elle ne savait simplement pas la nommer. C'est ce qui rend une même action impossible à réutiliser
   pour quelqu'un d'autre — et ce qui a valu au jeu la moitié de ses défauts de perspective. */
function doUpgrade(nodeId,nat){
  const _n=nat||G.player;   // la nation qui améliore — explicite, plus implicite

  if(_scGuard())return;
  const col=_n.colonies.find(c=>c.nodeId===nodeId);const node=NODES[nodeId];
  if(!col){addLog('⚠️ Pas de colonie sur '+node.name+'.','red');return;}
  if(col.noUpgrade){addLog('⚠️ '+node.name+' (colonisée par accord forcé) ne peut pas être améliorée.','red');return;}
  if(col.level>=node.maxLv){addLog('⚠️ '+node.name+' est au niveau maximum.','red');return;}
  const targetLv=col.level+1;
  const ac=1;
  const mat=3;
  const en=1;
  const sci=1;
  if(_n.acLeft<ac){addLog('⚠️ Pas assez d\'AC (besoin '+ac+').','red');return;}
  if((_n.res.materials||0)<mat){addLog('⚠️ Pas assez de Matériaux (besoin '+mat+').','red');return;}
  if((_n.res.energy||0)<en){addLog('⚠️ Pas assez d\'Énergie (besoin '+en+').','red');return;}
  if((_n.res.science||0)<sci){addLog('⚠️ Pas assez de Savoir (besoin 1<i class=ri-science></i>).','red');return;}
  saveUndo();
  _n.acLeft-=ac;_n.res.materials-=mat;_n.res.energy-=en;_n.res.science-=sci;
  _n.spentThisTurn+=ac+mat+en+sci;
  col.level=targetLv;
  if(col._conquest){col._conquest=0;addLog('🏗️ '+node.name+' développée — la population conquise est apaisée (fin du mécontentement).','green');}
  // Bonus moral one-time au Niv.2
  if(targetLv===2){
    if(nodeId==='callisto'){
      _n.res.morale=(_n.res.morale||0)+2;
      addLog('🌟 Callisto Nv.2 — habitat exceptionnel hors radiation (+2<i class=ri-morale></i>)','gold');
    } else if(ATTRACTIVE_COLS.includes(nodeId)){
      _n.res.morale=(_n.res.morale||0)+1;
      addLog('🌅 Paysage remarquable sur '+node.name+' — conditions de vie (+1<i class=ri-morale></i>)','gold');
    }
  }
  addLog('⬆️ '+node.name+' Nv.'+targetLv+' — +<i class=ri-science></i>'+(targetLv>=3?2:1)+'/tour désormais','green');
  addAction('⬆️',node.name+' Nv.'+targetLv,ac,{materials:mat,energy:en,science:sci},'Hub: +<i class=ri-science></i>'+(targetLv>=3?2:1)+'/tour');
  scArmConfirm('⬆️ '+node.name+' Nv.'+targetLv,[{kind:'pt',icon:rEmoji('science'),val:(targetLv>=3?2:1)}]);
}
function routeCost(p){
  let ac=1,mat=1;
  if(hasSpec(p,'route_disc'))mat=0;
  // Vérifier bonus freeRte (Expansion Rapide)
  if(p.investBonus&&p.investBonus.freeRte>0)return{ac:0,mat:0,_useFree:true};
  return{ac,mat};
}
let _pendingRouteObj=null;
/* ═══ LA NATION QUI AGIT EST UN ARGUMENT, PLUS UNE VARIABLE GLOBALE ═══
   ⚠️ Cette action lisait `G.player` — « la nation actuellement affichée » — et non « celle qui
   agit ». En solo c'est la même ; à quatre nations, cela ne l'est que si le serveur a pensé à faire
   tourner `G.player` juste avant l'appel. C'est la maladie de fond décrite dans
   `ARCHITECTURE_AVENIR.md`, et elle a produit tous les défauts graves du mois d'août.
   Le paramètre est FACULTATIF : sans lui on retombe sur `G.player`, et les appels existants se
   comportent exactement comme avant (`mesure_equivalence.js` le vérifie). Ce qui change, c'est
   qu'un appelant qui SAIT de qui il parle peut désormais le dire. */
function doEstablishRoute(from,to, nation){
  const _n=nation||G.player;
  if(_scGuard())return;
  const fn=NODES[from],tn=NODES[to];
  if(!fn||!tn){addLog('⚠️ Nœud invalide.','red');return;}
  if(!fn.conn.includes(to)){addLog('⚠️ '+fn.name+' et '+tn.name+' ne sont pas adjacents.','red');return;}
  if(_n.routes.find(r=>(r.from===from&&r.to===to)||(r.from===to&&r.to===from))){addLog('⚠️ Route déjà établie.','red');return;}
  const rc=routeCost(_n);
  if(_n.acLeft<rc.ac){addLog('⚠️ Pas assez d\'AC.','red');return;}
  if((_n.res.materials||0)<rc.mat){addLog('⚠️ Pas assez de Matériaux.','red');return;}
  saveUndo(); // route annulable (popup ↩/Valider)
  _n.acLeft-=rc.ac;_n.res.materials-=rc.mat;
  _n.spentThisTurn+=rc.ac+rc.mat;
  if(rc._useFree&&_n.investBonus)_n.investBonus.freeRte--;
  const newRoute={from,to,tokens:0};
  _n.routes.push(newRoute);updateConnections(_n);
  addLog('🛤️ Route '+fn.name+' → '+tn.name+(rc._useFree?' (GRATUITE)':''),'green');
  addAction('🛤️','Route '+fn.name+' → '+tn.name,rc.ac,{materials:rc.mat},'Construite');
  // Popup assignation jeton
  if(_n.forceTokens>0&&!hasSpec(_n,'route_force_free')){
    _pendingRouteObj=newRoute;
    document.getElementById('rtm-info').innerHTML=
      'Route <strong>'+fn.name+' → '+tn.name+'</strong><br>'+
      'Jetons disponibles : <strong>'+_n.forceTokens+'</strong><br>'+
      '<span style="color:#7880a0;font-size:.92em">Un jeton protège la route des pirates et la maintient connectée. Sans jeton : route passive (revenu 1<i class=ri-materials></i>/tour mais pas de connectivité et cargos vulnérables).</span>';
    document.getElementById('route-token-modal').classList.remove('hidden');
  }else{
    /* IA DE NAVIGATION (`route_force_free`) — « déploiement GRATUIT en jetons ».
       ⚠️ BUG CORRIGÉ LE 2026-08-07 (partie DB55) : cette branche se contentait d'ÉCRIRE
       « Route gratuite en jeton » et ne posait AUCUN jeton. La route restait à `tokens:0`, donc
       NON PROTÉGÉE — et les pirates la détruisaient. Le joueur lisait « gratuite en jeton », croyait
       sa route sûre, et la perdait sans comprendre. Deux lignes se contredisaient dans son journal :
         « 🛤️ Route gratuite en jeton (IA Navigation). »
         « ⚠️ Route non protégée — cargos vulnérables aux pirates. »
       L'ami de Marc a perdu deux routes ainsi, et avec elles ses points d'agenda — dans une partie
       jouée 103 à 100.
       Le jeton est maintenant RÉELLEMENT posé, et SANS être prélevé sur la réserve : c'est
       exactement le sens de « gratuit en jetons ». */
    if(hasSpec(_n,'route_force_free')){
      newRoute.tokens=1;                       // posé pour de vrai…
      updateConnections(_n);             // …donc la route compte pour la connectivité
      addLog('🛤️ Route protégée gratuitement (IA de Navigation) — jeton posé sans puiser dans ta réserve.','dim');
    }
    scArmConfirm('🛤️ Route',[{kind:'pt',icon:rEmoji('materials'),val:1}]);
    render();
  }
}
function confirmRouteToken(deploy){
  document.getElementById('route-token-modal').classList.add('hidden');
  if(deploy&&_pendingRouteObj&&G.player.forceTokens>0){
    _pendingRouteObj.tokens=1;G.player.forceTokens--;
    addLog('⚔️ Jeton déployé sur route '+NODES[_pendingRouteObj.from]?.name+'→'+NODES[_pendingRouteObj.to]?.name,'green');
    updateConnections(G.player);
  }else if(!deploy){
    addLog('⚠️ Route non protégée — cargos vulnérables aux pirates.','dim');
  }
  _pendingRouteObj=null;scArmConfirm('🛤️ Route',[{kind:'pt',icon:rEmoji('materials'),val:1}]);render();
}
/* ─── Gestion interactive des routes (clic sur la carte) ─── */
let _routeManageIdx=-1;
function showRouteManageModal(idx){
  if(G.phase!=='actions'){addLog('⚠️ Hors phase actions.','red');return;}
  const p=G.player;
  const r=p.routes[idx];
  if(!r)return;
  _routeManageIdx=idx;
  const fn=NODES[r.from],tn=NODES[r.to];
  const hasToken=(r.tokens||0)>0;
  const isFree=hasSpec(p,'route_force_free');
  document.getElementById('rmm-title').textContent='🛤️ '+fn.name+' → '+tn.name;
  const warnConn=hasToken?' <span style="color:#ff8844;font-size:.9em">⚠️ Rappeler peut couper des colonies !</span>':'';
  document.getElementById('rmm-info').innerHTML=
    'Jeton : <strong style="color:'+(hasToken?'#66cc66':'#ff8844')+'">'+(hasToken?'⚔️ Déployé':'Aucun (route non protégée)')+'</strong>'+warnConn+
    '<br>Jetons disponibles : <strong>'+p.forceTokens+'</strong> | AC restants : <strong>'+p.acLeft+'</strong>'+
    (isFree?'<br><span style="color:#66cc99;font-size:.88em">IA Navigation : déploiement gratuit en jetons.</span>':'')+
    '<br><span style="color:#7880a0;font-size:.82em">Route protégée = connectivité + immunité pirates. Non protégée = revenu 1<i class=ri-materials></i>/tour mais vulnérable.</span>';
  const deployBtn=document.getElementById('rmm-deploy-btn');
  const recallBtn=document.getElementById('rmm-recall-btn');
  if(hasToken){
    deployBtn.classList.add('hidden');
    recallBtn.classList.remove('hidden');
    recallBtn.textContent='↩️ Rappeler jeton'+(isFree?' (gratuit, 1 AC)':' (1 AC)');
    recallBtn.disabled=(p.acLeft<1);
    recallBtn.style.opacity=p.acLeft<1?.5:1;
  }else{
    recallBtn.classList.add('hidden');
    deployBtn.classList.remove('hidden');
    const canDeploy=p.forceTokens>0&&p.acLeft>=1;
    deployBtn.textContent=isFree?'⚔️ Déployer jeton (1 AC)':'⚔️ Déployer 1 jeton (1 AC + 1 🗡️)';
    deployBtn.disabled=!canDeploy;
    deployBtn.style.opacity=canDeploy?1:.5;
  }
  document.getElementById('route-manage-modal').classList.remove('hidden');
}
function routeManageDeploy(){
  const p=G.player;
  const r=p.routes[_routeManageIdx];
  if(!r||p.acLeft<1){addLog('⚠️ AC insuffisants.','red');routeManageClose();return;}
  const isFree=hasSpec(p,'route_force_free');
  if(!isFree&&p.forceTokens<1){addLog('⚠️ Aucun jeton disponible.','red');routeManageClose();return;}
  undoStack=[];
  p.acLeft--;p.spentThisTurn+=1;
  if(!isFree)p.forceTokens--;
  r.tokens=1;
  updateConnections(p);
  addLog('⚔️ Jeton déployé sur '+NODES[r.from]?.name+'→'+NODES[r.to]?.name,'green');
  addAction('⚔️','Jeton déployé — '+NODES[r.from]?.name+'→'+NODES[r.to]?.name,1,{},'Route protégée');
  routeManageClose();
}
function routeManageRecall(){
  const p=G.player;
  const r=p.routes[_routeManageIdx];
  if(!r||p.acLeft<1){addLog('⚠️ AC insuffisants.','red');routeManageClose();return;}
  undoStack=[];
  p.acLeft--;p.spentThisTurn+=1;
  r.tokens=0;
  p.forceTokens++;
  updateConnections(p);
  const lostConn=p.colonies.filter(c=>!c.connected&&c.nodeId!==p.civ.home);
  addLog('↩️ Jeton rappelé depuis '+NODES[r.from]?.name+'→'+NODES[r.to]?.name+(lostConn.length?' — ⚠️ '+lostConn.length+' colonie(s) déconnectée(s) !':''),'gold');
  addAction('↩️','Rappel jeton — '+NODES[r.from]?.name+'→'+NODES[r.to]?.name,1,{},'Jeton libre +1');
  routeManageClose();
}
function routeManageClose(){
  _routeManageIdx=-1;
  document.getElementById('route-manage-modal').classList.add('hidden');
  render();
}
// Commerce avec les pirates (Ceinturiens) : 75% → +1 ressource aléatoire (<i class=ri-energy></i>/<i class=ri-materials></i>/<i class=ri-science></i>), 25% → rien. Renvoie la ressource reçue ou null.
function pirateCommerce(p){
  const roll=Math.random();const n=roll<0.75?2:roll<0.95?1:0; // 75% +2, 20% +1, 5% rien
  const caps=getResCapFor(p);const got=[];
  for(let i=0;i<n;i++){const r=['energy','materials','science'][Math.floor(Math.random()*3)];p.res[r]=Math.min(caps[r]!=null?caps[r]:9999,(p.res[r]||0)+1);got.push(r);}
  return got; // tableau des ressources reçues (0, 1 ou 2)
}
/* ─── ANNONCE VERTE : CE QUE TU VIENS DE GAGNER ────────────────────────────────
   Demande de Marc (2026-08-08). Deux moments passaient jusqu'ici en silence à l'écran : le butin
   d'un raid, et la validation d'une action gratuite (pouvoir de nation). Le journal les notait, mais
   il faut aller le consulter — or ce sont précisément les instants où l'on veut un retour immédiat.
   Le client affiche cette annonce en bas à droite, à l'emplacement du bouton Valider, cinq secondes,
   comme le bandeau rouge des autres nations. En solo (pas de couche en ligne) elle est simplement
   ignorée : le journal reste la source. */
function gainToast(html){
  try{ if(typeof window!=='undefined'&&typeof window.showGainToast==='function') window.showGainToast(html); }catch(e){}
}
/* `nat` : la nation qui active son pouvoir. Sans lui, la nation active. */
function useAbility(nat){
  const _n=nat||G.player;   // la nation qui active son pouvoir

  if(G.phase!=='actions')return;
  if(_scGuard())return;
  if(_n.abilityUsed){addLog('⚠️ Capacité déjà utilisée ce tour.','red');return;}
  const p=_n,ab=p.civ.active;
  if(p.acLeft<ab.ac){addLog('⚠️ Pas assez d\'AC.','red');return;}
  for(const[r,a]of Object.entries(ab.cost)){if((p.res[r]||0)<a){addLog('⚠️ Ressources insuffisantes.','red');return;}}
  // Jupitérien — Forge Orbitale : le joueur CHOISIT la lune joviène à améliorer (modale). Pas d'auto-sélection ni de coût dans le vide.
  if(p.civ.id==='jupiteriens'){
    const eligible=p.colonies.filter(c=>['io','europe','ganymede','callisto'].includes(c.nodeId)&&c.level===1&&c.connected);
    if(!eligible.length){addLog('⚠️ Aucune lune joviène de niveau 1 connectée à améliorer — elles sont déjà au niveau max (ou non reliées) : Io, Europe, Ganymède, Callisto.','red');return;}
    showForgeChoiceModal(eligible); return; // le coût est prélevé au moment du choix (_forgeUpgrade)
  }
  saveUndo();p.acLeft-=ab.ac;for(const[r,a]of Object.entries(ab.cost))p.res[r]-=a;p.abilityUsed=true;
  if(p.civ.id==='terriens'){const _lv0=p.gov_level;addGovPts(p,3);addLog('💫 Diplomatie Verte : +3 pts Gov','gold');
    gainToast(p.civ.name+' — +3 en gouvernement'+(p.gov_level>_lv0?', passe Nv.'+p.gov_level:''));addAction('💫','Diplomatie Verte',0,{materials:3},'+3 pts Gov');}
  else if(p.civ.id==='martiens'){p.acLeft+=1;p.acMax+=1;addLog('💫 Surtension : +1 AC ce tour','gold');
    gainToast(p.civ.name+' — gagne une action');addAction('💫','Surtension',0,{energy:2},'+1 AC');}
  else if(p.civ.id==='ceinturiens'){
    const got=pirateCommerce(p);
    if(got.length){const em=got.map(rEmoji).join('');addLog('💫 Commerce avec les pirates : contrebande → +'+em,'gold');
      gainToast(p.civ.name+' — gagne '+got.map(r=>'1'+rEmoji(r)).join(' '));addAction('💫','Commerce avec les pirates',0,{},'+'+em);}
    else{addLog('💫 Commerce avec les pirates : les pirates n\'ont rien pu piller ce tour (rien reçu).','dim');addAction('💫','Commerce avec les pirates',0,{},'Rien');}
  }
  scArmConfirm('💫 Pouvoir',[]);
  render();
}
// Forge Orbitale (Jupitérien) : modale de choix de la lune à améliorer
function showForgeChoiceModal(eligible){
  const box=document.getElementById('forge-opts'); if(!box)return;
  box.innerHTML=eligible.map(c=>`<button class="atk-confirm" style="display:block;width:100%;margin-bottom:6px;background:#2a1a05;border-color:#FFB74D;color:#ffd39a" onclick="_forgeUpgrade('${c.nodeId}')">🏗️ ${NODES[c.nodeId].emoji} ${NODES[c.nodeId].name} — Nv.1 → Nv.2</button>`).join('');
  document.getElementById('forge-modal').classList.remove('hidden');
}
function forgeCancel(){const m=document.getElementById('forge-modal'); if(m)m.classList.add('hidden');}
function _forgeUpgrade(nodeId){
  const p=G.player,ab=p.civ.active;
  const m=document.getElementById('forge-modal'); if(m)m.classList.add('hidden');
  if(p.abilityUsed){render();return;}
  const col=p.colonies.find(c=>c.nodeId===nodeId&&c.level===1&&['io','europe','ganymede','callisto'].includes(c.nodeId)&&c.connected);
  if(!col){addLog('⚠️ Cette lune n\'est plus améliorable.','red');render();return;}
  saveUndo();
  p.acLeft-=ab.ac;for(const[r,a]of Object.entries(ab.cost))p.res[r]-=a;p.abilityUsed=true;
  col.level++;updateConnections(p);
  addLog('💫 Forge Orbitale : '+NODES[nodeId].name+' → Nv.'+col.level,'gold');
  gainToast(p.civ.name+' — améliore '+NODES[nodeId].name+' Nv.'+col.level);
  addAction('💫','Forge Orbitale',0,{materials:1,energy:1},NODES[nodeId].name+' Nv.'+col.level);
  scArmConfirm('💫 Forge '+NODES[nodeId].name,[{kind:'pt',icon:rEmoji('science'),val:1}]);
  render();
}
/* ⚠️ LE RAID DOIT AVOIR UNE CIBLE CHOISIE. Le bouton « 💰 Raid » de la barre d'action appelait un
   raid SANS cible, qui frappait `G.ais[0]` — la première nation de la liste, c'est-à-dire une nation
   arbitraire que le joueur n'a jamais désignée. En multijoueur `G.ais` est « tout le monde sauf moi » :
   un Jupitérien croyant piller les Martiens pillait en réalité le Terrien, dont la tension montait
   (bug signalé par Marc). Désormais : une seule cible possible → on la prend ; plusieurs → on DEMANDE. */
function doRaid(){
  if(G.phase!=='actions')return;
  if(_scGuard())return;
  const _cibles=(G.ais||[]).filter(a=>a&&a.civ);
  if(_cibles.length===0){addLog('⚠️ Raid : aucune nation à piller.','red');return;}
  if(_cibles.length===1){ doRaidTarget(_cibles[0].civ.id,null); return; }
  const _opts=_cibles.map(a=>({id:a.civ.id, name:a.civ.name, emoji:a.civ.emoji,
    label:a.civ.emoji+' '+a.civ.name+' — tension '+getTens(a.civ.id,'player')+'/10'}));
  if(_decisionActive()){ // en ligne : la question part au joueur qui agit
    _emitDecision('raid_target', G.player, {title:'💰 Quelle nation veux-tu piller ?', options:_opts}, null,
      (ans)=>{ const id=(ans&&(ans.targetId||ans.value||ans.id))||null; if(id)doRaidTarget(id,null); });
    return;
  }
  // Solo : petite fenêtre de choix autonome (aucune dépendance à une modale existante).
  if(typeof document==='undefined'||document.getElementById('sc-raid-pick'))return;
  document.body.insertAdjacentHTML('beforeend',
    '<div id="sc-raid-pick" style="position:fixed;inset:0;background:rgba(4,4,18,.86);z-index:660;display:flex;align-items:center;justify-content:center;padding:16px">'+
      '<div style="background:#0f0f2a;border:2px solid #cc7a22;border-radius:14px;padding:20px;max-width:400px;width:100%">'+
        '<div style="font-weight:700;color:#ffbb66;margin-bottom:12px;text-align:center">💰 Quelle nation veux-tu piller ?</div>'+
        _opts.map(o=>'<button onclick="_scRaidPick(\''+o.id+'\')" style="display:block;width:100%;margin:6px 0;padding:10px;background:#2a1200;border:1px solid #cc6622;color:#ffcfa0;border-radius:9px;cursor:pointer;font-weight:700">'+o.label+'</button>').join('')+
        '<button onclick="_scRaidPick(null)" style="display:block;width:100%;margin-top:10px;padding:8px;background:#14182e;border:1px solid #3a3a5a;color:#9898b8;border-radius:9px;cursor:pointer">Annuler</button>'+
      '</div></div>');
}
function _scRaidPick(id){
  const m=document.getElementById('sc-raid-pick'); if(m)m.remove();
  if(id)doRaidTarget(id,null);
}
/* ⚠️ DÉPLACÉE ICI depuis le bloc <script> d'interface. Elle en était inaccessible au SERVEUR
   (game-core.js ne charge que le plus gros bloc) : `sb.doRaidTarget` était undefined, le serveur
   retombait donc TOUJOURS sur le raid sans cible et pillait une nation arbitraire. */
/* `pillard` : la nation qui raide. Sans lui, c'est la nation active — comportement d'origine. */
function doRaidTarget(aiId,nodeId,pillard){
  try{
    if(!G||G.phase!=='actions')return;
    var p=pillard||G.player;
    var tc=p.civ.id==='ceinturiens'?1:2;
    var enCost=0;
    /* `G.ais` disait « les autres » : correct par hasard tant que le pillard EST la nation active,
       faux dès qu'on passe un pillard explicite. On cherche parmi toutes les nations sauf lui. */
    var target=allPlayers().find(function(a){return a!==p&&a.civ.id===aiId;});
    if(!target){addLog('⚠️ Cible de raid introuvable.','red');return;}
    /* Un raid est une agression : le pacte l'interdit comme il interdit l'assaut. */
    if(typeof agressionInterditeEntre==='function'&&agressionInterditeEntre(p,target,true))return;
    if(p.acLeft<1){addLog('⚠️ Raid : besoin 1 AC.','red');return;}
    if(p.forceTokens<tc){addLog('⚠️ Raid : besoin '+tc+' jeton(s) Force.','red');return;}
    if(enCost>0&&(p.res.energy||0)<enCost){addLog('⚠️ Raid : besoin '+enCost+'<i class=ri-energy></i> (carburant).','red');return;}
    undoStack=[];
    p.acLeft-=1;p.forceTokens-=tc;p.forceCooldown.push({count:tc,returnTurn:getCooldownTurn(p)});
    if(enCost>0)p.res.energy-=enCost;
    p.spentThisTurn=(p.spentThisTurn||0)+1+tc+enCost;
    /* ⚠️ LE BUTIN NE VIENT PLUS DU STOCK AU HASARD, MAIS D'UNE COLONIE (voir `butinDeRaid`). */
    var _b=butinDeRaid(target,nodeId), _col=_b.col, stolen=[];
    for(var _k in _b.butin){
      var _q=_b.butin[_k];
      target.res[_k]=Math.max(0,(target.res[_k]||0)-_q);
      p.res[_k]=(p.res[_k]||0)+_q;
      stolen.push('+'+_q+rEmoji(_k));
    }
    var _nomCol=_col?((NODES[_col.nodeId]&&NODES[_col.nodeId].name)||_col.nodeId):null;
    /* Moral : −1 chez la victime (Marc, 27/08). Se faire piller une colonie humilie la population ;
       jusqu'ici le raid ne coûtait que des ressources et de la tension, jamais de moral. */
    target.res.morale=Math.max(0,(target.res.morale||0)-1);
    /* Tension : +5 chez la victime (Marc, 24/08 — « le raid doit faire mal »). Le pillard, lui,
       gagne +1 envers celle qu'il vient de voler : on se méfie de qui l'on a dépouillé. */
    addTens(target.civ.id,p.civ.id,5);
    addTens(p.civ.id,target.civ.id,1);
    addLog('⚔️ Raid sur '+target.civ.emoji+' '+target.civ.name+(_nomCol?' — production de '+_nomCol+' pillée':'')
      +' ! '+(stolen.join(' ')||'rien à prendre')+(enCost>0?' (−1<i class=ri-energy></i>)':'')+' ('+tc+' jeton en récupération, tension +5)','green');
    addAction('💰','Raid '+target.civ.emoji,1,{},'Volé : '+(stolen.join('')||'rien'));
    /* LE BUTIN DOIT SE VOIR AU MOMENT DU RAID, PAS SEULEMENT DANS LE JOURNAL.
       ⚠️ `gainToast` ne suffisait qu'en SOLO. En multijoueur, cette fonction s'exécute sur le
       SERVEUR, où `window.showGainToast` n'existe pas : le toast partait dans le vide et le joueur
       ne voyait rien — exactement le reproche de Marc (2026-08-14 : « le gain des raids qu'on fait
       n'est toujours pas affiché au moment du raid, c'est visible seulement dans le journal »).
       On envoie donc une NOTICE, qui elle traverse le réseau, comme pour les réponses d'accord. */
    const _butin=stolen.length?stolen.join(' '):'';
    gainToast(p.civ.name+' — raid sur '+target.civ.name+' : '+(stolen.length?'+'+stolen.join(' +'):'aucun butin'));
    if(_decisionActive()){
      _emitNotice('raid_result', p,
        {title:'💰 Raid sur '+target.civ.emoji+' '+target.civ.name,
         butin:_butin,
         body:(stolen.length?('Butin : <b>+'+stolen.join(' +')+'</b>'):'<b>Aucun butin</b> — ses coffres étaient vides.')
              +' · '+tc+' jeton(s) en récupération · tension +2 chez '+target.civ.name+'.'}, 'stRien');
      /* La VICTIME aussi doit l'apprendre autrement que par le journal : on lui doit la même
         courtoisie qu'aux propositions d'accord. */
      /* ⚠️ LES ICÔNES DOIVENT ÊTRE DES MOTS POUR LA VICTIME. Son bandeau (`showLogToast`) retire
         toutes les balises HTML avant d'afficher : `<i class=ri-materials></i>` disparaissait
         purement et simplement, et le message devenait « Tu perds  . ». Mon propre banc l'a montré
         avant qu'une partie ne le fasse. On convertit donc en texte AVANT l'envoi (`_riToText`).
         Le pillard, lui, passe par un bandeau qui rend le HTML : il garde ses icônes. */
      if(!target._isAI) _emitNotice('raid_result', target,
        {title:'⚠️ '+p.civ.emoji+' '+p.civ.name+' te pille',
         butin:'', perte:true,
         body:(stolen.length?('Tu perds '+_riToText(stolen.join(' ')).trim()+'.'):'Rien à prendre — tes coffres étaient vides.')
              +' Ta tension envers '+p.civ.name+' monte de 2.'}, 'stRien');
    }
    render();
  }catch(e){console.error('doRaidTarget',e);}
}

/* Ancien raid sans cible — CONSERVÉ uniquement pour compatibilité interne (IA/scripts). Ne plus
   l'appeler depuis l'interface : il choisit `G.ais[0]`, ce qui n'a de sens qu'à deux nations. */
/* ⚠️ `doRaidLegacyFirstTarget` SUPPRIMÉE le 2026-08-24 — elle n'était appelée de NULLE PART.
   C'était une seconde implémentation complète du raid, qui pillait toujours `G.ais[0]` (« la
   première IA de la liste », c'est-à-dire n'importe qui selon la rotation) et volait deux
   ressources au hasard. Elle a survécu à la refonte du raid par cible, et elle serait restée en
   arrière d'un barème à chaque changement de règle — le raid vient précisément de passer au vol de
   la production d'une colonie et à +5 de tension, qu'elle n'aurait jamais suivis.
   Deux implémentations d'une même règle, c'est une de trop : le projet l'a payé sur l'assaut, sur
   les revenus et sur la défense. On efface au lieu d'entretenir. Le raid vit dans `doRaidTarget`. */
function showAccordInfo(nodeId){
  const node=NODES[nodeId]; const ai=getNodeOwnerAI(nodeId);
  const nm=ai?(ai.civ.emoji+' '+ai.civ.name):'cette nation';
  if(_decisionActive()){ // mode serveur : router la confirmation d'accord
    _emitDecision('accord_confirm', G.player,
      {node:nodeId, nodeName:(node?node.name:nodeId), withCiv:(ai?ai.civ.id:null), withName:(ai?ai.civ.name:'cette nation')},
      null, (ans)=>{ if(ans&&ans.confirm)proposeAccord(nodeId); });
    return;
  }
  document.getElementById('accord-body').innerHTML=
    'Accord commercial avec <b>'+nm+'</b> sur <b>'+(node?node.name:nodeId)+'</b>.<br><br>'+
    '<b>Coût :</b> 1 AC + <b>2<i class=ri-materials></i> donnés</b> à '+(ai?ai.civ.name:'l\'autre nation')+' (toi −2, elle +2).<br>'+
    '<b>Effet immédiat :</b> tension <b>−3 des deux côtés</b>.<br>'+
    '<b>Tant qu\'il tient :</b> +1<i class=ri-materials></i> +1<i class=ri-morale></i>/tour, pas de pénalité de tension pour tes routes sur ses colonies, et tu peux <b>traverser son territoire</b> (routes) pour désenclaver tes colonies.<br><br>'+
    '<span style="color:#ff9a9a">⚠️ Une déclaration de guerre avec cette nation annule tous tes accords avec elle.</span>';
  const btn=document.getElementById('accord-confirm');
  btn.onclick=function(){document.getElementById('accord-modal').classList.add('hidden');proposeAccord(nodeId);};
  document.getElementById('accord-modal').classList.remove('hidden');
}
/* `proposant` : la nation qui propose. ⚠️ IL ÉTAIT ÉCRIT EN DUR (`G.player`), et c'est pour cela
   qu'une IA ne pouvait PAS proposer d'accord de sa propre initiative — le seul chemin existant
   passait par le clic du joueur sur une colonie. Une IA subissait la diplomatie sans jamais
   pouvoir l'engager. Marc : « c'est le dernier morceau du principe l'IA est une nation comme une
   autre ». Le paramètre est optionnel : sans lui, le comportement du joueur est identique. */
/* `proposant` : la nation qui propose. Sans lui, la nation active. */
function proposeAccord(nodeId,proposant){
  if(G.phase!=='actions')return;const node=NODES[nodeId];const p=proposant||G.player;
  /* ⚠️ « HUMAIN » VEUT DIRE ICI : *DEVANT CET ÉCRAN-CI*, ET RIEN D'AUTRE.
     Ce drapeau ne sert qu'à décider si on écrit un refus dans le journal — « ⚠️ besoin 1 AC ».
     Un joueur humain DISTANT est bien humain, mais son journal n'est pas celui-ci : lui écrire ces
     lignes reviendrait à raconter à quelqu'un les échecs de son adversaire. Et une IA ne lit rien.
     D'où la double condition. Elle a l'air redondante ; elle ne l'est pas.
     Si un jour ces lignes doivent partir chez leur destinataire, ce sera par `_emitNotice`, pas en
     élargissant ce test. */
  const _humain=(p===G.player&&!p._isAI);
  const _dire=(m,c)=>{ if(_humain)addLog(m,c); };
  if(p.acLeft<1){_dire('⚠️ Accord : besoin 1 AC.','red');return;}
  if((p.res.materials||0)<2){_dire('⚠️ Accord : besoin 2<i class=ri-materials></i> (donnés à l\'autre nation).','red');return;}
  /* ⚠️ UN ACCORD SE PROPOSE, IL NE S'IMPOSE PAS — ET CELA VAUT POUR TOUTES LES NATIONS.
     Avant : le propriétaire était cherché parmi `G.ais` seulement. Sur la colonie d'un autre
     HUMAIN, il n'y avait donc AUCUN propriétaire : aucune vérification, aucune demande, et
     l'accord se concluait tout seul. C'est exactement ce que Marc a vécu — « l'autre joueur ne
     peut pas cliquer sur accepter ».
     Maintenant : on trouve le propriétaire quel qu'il soit, et on lui DEMANDE. Un humain reçoit
     une fenêtre ; une IA décide par `accordAcceptable`, la même règle que celle qui s'appliquerait
     à un joueur. Rien n'est prélevé tant que la réponse n'est pas arrivée. */
  const proprio=ownerNation(nodeId);
  if(proprio && proprio!==p){
    if(_decisionActive() && proprio._isAI===false){
      addLog('🤝 '+p.civ.emoji+' '+p.civ.name+' propose un accord commercial à '
        +proprio.civ.emoji+' '+proprio.civ.name+' sur '+(node?node.name:nodeId)+' — en attente de sa réponse…','dim');
      fluxDonnees().accordProp=p.civ.id;
      fluxDonnees().accordPart=proprio.civ.id;
      fluxDonnees().accordNode=nodeId;
      _emitRemote('accord_request', proprio,
        {title:'🤝 Proposition d\'accord commercial',
         from:p.civ.id, fromName:p.civ.emoji+' '+p.civ.name,
         texte:p.civ.emoji+' '+p.civ.name+' te propose un ACCORD COMMERCIAL sur '+(node?node.name:nodeId)
              +' : +1<i class=ri-materials></i> +1<i class=ri-morale></i>/tour pour chacun, tension −3, '
              +'et il te donne 2<i class=ri-materials></i> tout de suite.',
         options:[{id:'yes',name:'✅ Accepter l\'accord'},{id:'no',name:'❌ Refuser'}]},
        'stAccordDirectReponse', null);
      return;   // ⚠️ on ne prélève RIEN ici : tout se fait à la réponse
    }
    const avis=accordAcceptable(proprio,p);
    if(!avis.ok){
      _dire('⚠️ '+proprio.civ.emoji+' '+proprio.civ.name+' refuse l\'accord — '+avis.raison+'.','red');
      if(!_humain)addLog('🤝 '+proprio.civ.emoji+' '+proprio.civ.name+' refuse l\'accord de '
        +p.civ.emoji+' '+p.civ.name+' — '+avis.raison+'.','dim');
      return;
    }
  }
  /* `accordAi` (qui ne pouvait être qu'une IA) est devenu `proprio` : la SUITE de cette fonction
     s'en servait pour verser les 2🪨 et baisser la tension. Avec un propriétaire humain, elle ne
     versait donc rien et ne calmait rien — la moitié invisible du même défaut. */
  if(_humain)undoStack=[];   // l'annulation n'a de sens que pour le joueur local
  p.acLeft-=1;p.res.materials-=2;p.spentThisTurn=(p.spentThisTurn||0)+3;
  if(proprio)proprio.res.materials=(proprio.res.materials||0)+2; // le matériau est DONNÉ à l'autre nation
  _accordEnregistrer(nodeId,p,proprio);
  let tensionMsg='';
  if(proprio){
    /* ⚠️ LA TENSION ÉTAIT CALMÉE ENTRE « player » ET LE PROPRIÉTAIRE — donc entre la nation ACTIVE
       et lui, quel que soit le vrai proposant. Avec une IA qui propose, c'est la tension de
       quelqu'un d'autre qui baissait. On nomme les deux nations. */
    const pPrev=getTens(p.civ.id,proprio.civ.id), aPrev=getTens(proprio.civ.id,p.civ.id);
    setTens(p.civ.id,proprio.civ.id,Math.max(0,pPrev-3));
    setTens(proprio.civ.id,p.civ.id,Math.max(0,aPrev-3)); // −3 des DEUX côtés
    tensionMsg=' — Tension −3 des deux côtés vs '+proprio.civ.name;
  }
  addLog((_humain?'🤝 Accord Commercial sur ':'🤝 '+p.civ.emoji+' '+p.civ.name+' conclut un accord sur ')+node.name
    +' — 2<i class=ri-materials></i> donnés à '+(proprio?proprio.civ.name:'l\'autre nation')+tensionMsg,'gold');
  if(_humain){ addAction('🤝','Accord '+node.name,1,{materials:2},'2 matériaux donnés'+tensionMsg); closePopup();render(); }
  else G.aiActions.push({emoji:'🤝',name:'Accord '+node.name,desc:'avec '+(proprio?proprio.civ.name:'?')});
  return true;
}
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ROMPRE L'ACCORD ET ATTAQUER — LA MÊME PORTE QUE L'ASSAUT ORDINAIRE
   ----------------------------------------------------------------------------------------------
   ⚠️ C'ÉTAIT UNE SECONDE IMPLÉMENTATION DE L'ASSAUT, ET ELLE A VIEILLI SEULE. Marc, 27/08 :
   « accord commercial bloque maintenant la conquête ». Reproduit : avec un accord posé sur la
   colonie d'un HUMAIN, ce bouton était un CLIC MORT — aucun AC dépensé, aucune guerre, et le
   message « ⚠️ Cette colonie n'appartient à aucune nation ».

   La cause : cette fonction cherchait le défenseur avec `getNodeOwnerAI`, dont la dernière ligne
   est `return (o && o._isAI !== false) ? o : null` — elle rend donc **null dès que le propriétaire
   est un joueur humain**. C'est exactement le défaut #77 du 23/08 (« attaquer un joueur humain ne
   faisait rien »), corrigé à l'époque dans `attackColony` en passant à `defenseurPrincipal`… et
   jamais reporté ici, parce que personne ne pensait à ce second chemin.

   Elle avait aussi dérivé sur deux autres points : aucun contrôle du pacte de non-agression, et
   aucune gestion des nœuds partagés.

   ON NE RÉPARE DONC PAS, ON SUPPRIME LE DOUBLON. Rompre un accord pour attaquer, c'est attaquer :
   la guerre déclarée par l'assaut révoque déjà PROPREMENT tous les accords entre les deux nations
   (liste ET registre — voir `declarerGuerre`). Il ne reste ici que la phrase qui prévient le joueur.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function breakAccordAndAttack(nodeId){
  if(G.phase!=='actions')return;
  const node=NODES[nodeId];
  const _def=(typeof defenseurPrincipal==='function')?defenseurPrincipal(nodeId,G.player):null;
  if(!_def){addLog('⚠️ Aucune autre nation à assaillir sur ce nœud.','red');return;}
  /* Le message d'avertissement N'EST ÉMIS QUE SI L'ASSAUT VA RÉELLEMENT PARTIR : annoncer « l'accord
     est rompu » puis se faire refuser l'attaque faute d'AC serait un mensonge de plus. On le pose
     donc après les contrôles, en s'appuyant sur le fait qu'`attackColony` dépense l'AC. */
  const _avant=G.player.acLeft;
  attackColony(nodeId,G.player);
  if(G.player.acLeft<_avant)
    addLog('📜 Attaque surprise sur '+((node&&node.name)||nodeId)+' — l\'accord est rompu par la guerre qui suit.','red');
}
/* `attaquant` : la nation qui assaille. Sans lui, la nation active. */
function attackColony(nodeId,attaquant){
  if(G.phase!=='actions')return;const node=NODES[nodeId];const p=attaquant||G.player;
  /* ⚠️ ON NE DEMANDE PLUS « À QUI EST CE NŒUD » MAIS « QUI LE DÉFEND CONTRE MOI ».
     `getNodeOwnerAI` rendait UNE nation — sur un nœud partagé elle pouvait rendre l'attaquant
     lui-même, et l'assaut sortait alors en silence : pas de message, pas d'AC dépensé, rien.
     Un clic mort, impossible à comprendre en jouant. */
  const _atkAI=defenseurPrincipal(nodeId,p);
  if(!_atkAI){addLog('⚠️ Aucune autre nation à assaillir sur ce nœud.','red');return;}
  /* Le pacte lie aussi CELUI QUI CLIQUE — c'est exactement ce que Marc a pu faire dans la partie
     792D, faute de contrôle. Le refus est explicite : un bouton qui ne fait rien est pire. */
  if(typeof agressionInterditeEntre==='function'&&agressionInterditeEntre(p,_atkAI,true))return;
  if(estNoeudPartage(nodeId))addLog('⚔️ '+(node?node.name:nodeId)+' est partagé — l\'assaut rompt la cohabitation.','red');
  /* Capitale assaillable : voir la note dans breakAccordAndAttack(). Sa défense de 10 jetons
     (garrisonOf) suffit à la rendre difficile ; l'interdire n'a plus lieu d'être. */
  const tc=p.civ.id==='ceinturiens'?1:2;
  if(p.acLeft<1){addLog('⚠️ Assaut : besoin 1 AC.','red');return;}
  if(p.forceTokens<tc){addLog('⚠️ Assaut : besoin d’au moins '+tc+' jeton(s) Force.','red');return;}
  if(Math.min(p.res.materials||0,p.res.energy||0)<1){addLog('⚠️ Assaut : il faut du <i class=ri-materials></i> et de l’<i class=ri-energy></i> pour engager des jetons.','red');return;}
  // LIMITE DE 2 ATTAQUES/TOUR SUPPRIMÉE (demande de Marc) : le nombre d'assauts n'est plus plafonné —
  // il reste limité naturellement par les AC, les jetons Force et le coût en ressources de chaque combat.
  p.acLeft-=1;p.spentThisTurn+=1;closePopup();
  /* ⚠️ TROISIÈME ARGUMENT : QUI ASSAILLE. Il manquait, et son absence a coûté cher.
     `playerAssaultColony(nodeId, ennemi, attaquant)` retombe sur `G.player` quand on ne le lui dit
     pas. Or `attackColony` SAIT qui attaque — il vient de lui débiter son AC et ses jetons deux
     lignes plus haut — et le passait quand même sous silence. Résultat : la guerre était ouverte au
     nom de la nation ACTIVE, le combat livré par elle, les pertes et la capture portées à son compte.
     En solo, la nation active est toi et l'illusion tient. À quatre nations sur un serveur, l'assaut
     d'une IA était imputé à qui regardait l'écran.
     ⚠️ CE DÉFAUT EST ANCIEN ET N'A ÉCLATÉ QUE LE 28/08. Tant qu'`historique` décidait, les IA
     n'assaillaient presque jamais : le chemin fautif n'était pas emprunté. `tacticien` assaille dès
     le tour 1, et `test_equivalence` est passé au rouge le jour même. Un banc qui devient rouge
     après un changement de comportement n'accuse pas toujours le changement — ici il a révélé ce que
     l'ancien comportement dissimulait.
     TROUVÉ PAR BISSECTION, pas à la lecture (`diag_equivalence_coups.js`) : en retirant les familles
     de coups une à une, `assaut` seul ramenait la divergence de 10/12 à 0/12.
     Les deux AUTRES appels de `playerAssaultColony` (guerre populaire, poursuite de guerre) omettent
     l'argument à BON DROIT : ils partent de `G.warWith` et de la fenêtre du joueur actif — c'est bien
     de lui qu'il s'agit. */
  playerAssaultColony(nodeId,_atkAI,p);
}
// ── ASSAUT DE COLONIE : combat résolu IMMÉDIATEMENT (1 manche), capture si victoire. (Le modèle « guerre en 2 tours » est supprimé.) ──
/* `attaquant` : la nation qui monte l'assaut. Sans lui, la nation active. */
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Y A-T-IL UN ÉCRAN DEVANT CE MOTEUR ?
   ----------------------------------------------------------------------------------------------
   ⚠️ LE MOTEUR TOURNE DANS DEUX MONDES, ET IL NE SAVAIT PAS DANS LEQUEL IL ÉTAIT. Dans le
   navigateur, `document` est réel. Sur le serveur, `server/game-core.js` en fabrique un décor de
   carton dont chaque élément rend `parentElement: null`. Tant qu'on se contente de lire, le décor
   tient ; dès qu'on suit une référence — `slider.parentElement.style` — il s'effondre.

   CE QUE ÇA A COÛTÉ, MESURÉ LE 27/08. `_warShowAttackSlider` faisait exactement cela. L'exception
   remontait jusqu'à `runEndOfRound`, qui abandonnait TOUTE la fin de tour : revenus, entretien,
   tension, événements — perdus, pour toutes les nations. Sur 8 parties : 4 fins de tour avortées, et
   les nations terminaient avec 19,5 ressources au lieu de 28,2. Soit **un tiers de l'économie du
   jeu**, disparue sans un mot dans un `catch`. C'est la cause du point #81 (« les IA n'ont plus
   d'énergie »), cherchée du côté du comportement des IA pendant des jours.

   POURQUOI UN DRAPEAU EXPLICITE PLUTÔT QU'UNE DEVINETTE. On pourrait tester `typeof window`, ou
   sonder un élément pour voir s'il « a l'air vrai ». Les deux sont des devinettes qui retomberont en
   panne au prochain changement du bac à sable. Le bac à sable SAIT qu'il n'a pas d'écran : il le
   déclare (`SOLAR_SANS_ECRAN`), et le moteur le lit. Une information connue vaut mieux qu'une
   information reconstituée.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function _aUnEcran(){ return typeof SOLAR_SANS_ECRAN==='undefined' || !SOLAR_SANS_ECRAN; }

/* Cette fenêtre appartient à l'ATTAQUANT, et à lui seul : elle n'a de sens que devant l'écran de
   la nation qui frappe. Une IA n'a pas d'écran ; un humain distant a le sien, ailleurs. */
function _ouvrirFenetreAssaut(nodeId,attaquant){
  if(!_aUnEcran())return;
  if(attaquant!==G.player||attaquant._isAI)return;
  try{document.getElementById('wcm-turn').textContent=G.turn;}catch(e){}
  document.getElementById('war-combat-modal').classList.remove('hidden');
  _warSelectColonyTarget(nodeId);
}
function playerAssaultColony(nodeId,enemyAI,attaquant){
  const _atk=attaquant||G.player;
  enemyAI=enemyAI||defenseurPrincipal(nodeId,_atk);
  if(!enemyAI){addLog('⚠️ Assaut impossible : aucune nation adverse sur '+((NODES[nodeId]&&NODES[nodeId].name)||nodeId)+'.','red');return;}
  _atk._attacksThisTurn=(_atk._attacksThisTurn||0)+1; G._warCancelRefund={ac:1,atk:1};
  let war=_warBetween(_atk.civ.id,enemyAI.civ.id);
  /* ⚠️ LA GUERRE S'OUVRAIT AU NOM DE LA MAUVAISE NATION. L'ancienne ligne appelait la façade
     `declareWar(…,'player',…)`, qui déclare toujours au nom de `G.player`, puis relisait la guerre
     avec `_warBetween(_moiId(),…)`. En solo c'est identique. À deux humains, le joueur B assaillait
     et c'est le joueur A qui se retrouvait en guerre — puis `war` restait introuvable et l'assaut
     partait en silence. On passe donc par le moteur nommé, qui ne connaît que deux nations. */
  if(!war){
    G._warFocusColony=nodeId;
    const raison='Assaut sur '+(NODES[nodeId]?.name||nodeId)+' !';
    declarerGuerre(_atk,enemyAI,raison,'player');
    G._warDeclareReason=raison;G._warDeclaredBy='player';
    war=_warBetween(_atk.civ.id,enemyAI.civ.id);
  }
  if(!war)return;
  war.live=true;war.justDeclared=false;war.turnsLeft=99;war._playerFoughtTurn=G.turn;war.playerProvoked=true; // tu as attaqué → l'IA pourra riposter dès la parité (pas besoin d'être 2× dominante)
  /* ═══ QUI A FRAPPÉ PENDANT LE TOUR PERD L'INITIATIVE DU SOIR ═══
     Règle de Marc, 17 puis 23/08 : celui qui a assailli l'autre LE PLUS pendant ce tour lui cède
     l'initiative de fin de tour. On compte donc les assauts, un par un et par nation — un simple
     « untel a frappé » ne permettrait pas de départager deux camps qui se sont rendu coup pour coup.
     ⚠️ On range l'information DANS LA GUERRE, pas dans un drapeau global : à quatre nations il y a
     plusieurs guerres en cours, et `war._playerFoughtTurn` juste au-dessus ne dit que « la nation
     active s'est battue » — ce qui ne veut plus rien dire quand trois conflits coexistent. */
  if(typeof noterAssautDuTour==='function') noterAssautDuTour(war,_atk.civ.id);
  /* `G.warWith` / `warWins` / `warTurnsLeft` sont les drapeaux de l'écran LOCAL : ils disent « la
     guerre que MOI je regarde ». Les poser quand c'est quelqu'un d'autre qui attaque affichait à ce
     joueur-ci un conflit qui n'était pas le sien. La vérité vit dans `war`, pas dans ces trois-là. */
  if(_atk===G.player){G.warWith=enemyAI.civ.id;G.warWins=war.wins;G.warTurnsLeft=99;}
  /* ⚠️ `_warAttackColonyTarget` EST DE LA RÈGLE, PAS DE L'AFFICHAGE, malgré son nom. `resolveWarCombat`
     le relit pour la garnison, la défense automatique de la capitale, les co-défenseurs d'un nœud
     partagé et la cible de la capture. Le laisser filer dans le bloc d'affichage ci-dessous aurait
     fait combattre le serveur sur une cible nulle — un défaut bien pire que celui qu'on corrige. */
  _warAttackColonyTarget=nodeId;
  // La CIBLE et l'ENNEMI vont dans `G._flux.donnees` : ils vivaient dans la fermeture ci-dessous,
  // et un assaut interrompu (sauvegarde, rafraîchissement) perdait « sur quoi » on se battait.
  fluxDonnees().assautCible=nodeId;
  fluxDonnees().assautEnnemi=enemyAI.civ.id;
  fluxDonnees().suiteCombat='stAssautJoueurChoisi';
  G._warChoiceCb='stAssautJoueurChoisi';
  /* ══════ ICI FINIT LA RÈGLE, ICI COMMENCE L'AFFICHAGE ══════
     Tout ce qui précède doit se produire partout — navigateur, serveur, banc d'essai. Ce qui suit
     n'a de sens que devant un écran, et devant CELUI DE L'ATTAQUANT. */
  _ouvrirFenetreAssaut(nodeId,_atk);
}
// ── Économie de combat UNIFIÉE (attaque ET défense identiques) ──
// Engager e jetons coûte 1<i class=ri-materials></i> +1<i class=ri-energy></i> par jeton. Les jetons engagés quittent le pool :
// s'ils survivent (camp non vaincu) ils reviennent après récupération ; si le camp PERD,
// la moitié est détruite définitivement, le reste revient après récupération.
function applyCombatEngage(p,e,won){
  e=Math.max(0,e|0); if(e<=0||!p)return;
  // IA de Navigation (nav2_war) : COÛT de guerre divisé par 2 EXACTEMENT. Quand le nombre de jetons est
  // IMPAIR, la demi-part est toujours prélevée sur l'ÉNERGIE (ex. 5 jetons → 2🪨 et 3⚡).
  // Les jetons immobilisés, eux, restent identiques.
  const _half=(typeof hasSpec==='function'&&hasSpec(p,'nav2_war'));
  const rcM=_half?Math.floor(e/2):e;   // matériaux : arrondi BAS
  const rcE=_half?Math.ceil(e/2):e;    // énergie   : arrondi HAUT (porte la demie)
  p.res.materials=Math.max(0,(p.res.materials||0)-rcM);
  p.res.energy=Math.max(0,(p.res.energy||0)-rcE);
  p.forceTokens=Math.max(0,(p.forceTokens||0)-e);      // tous les engagés quittent temporairement le pool
  if(!p.forceCooldown)p.forceCooldown=[];
  if(won){
    // VICTOIRE (règle) : seule la MOITIÉ des jetons engagés part en récupération ; l'autre moitié reste DISPO tout de suite.
    const recov=Math.floor(e/2);
    p.forceTokens+=(e-recov);                          // l'autre moitié revient immédiatement
    if(recov>0)p.forceCooldown.push({count:recov,returnTurn:getCooldownTurn(p)});
  }else{
    // DÉFAITE : la moitié est perdue définitivement, le reste part en récupération.
    const lost=Math.floor(e/2);
    const back=e-lost;
    if(back>0)p.forceCooldown.push({count:back,returnTurn:getCooldownTurn(p)});
  }
}
// ── ATTAQUE DE ROUTE : détruit la route (pas de récupération, indéfendable) — sauf protection ──
function resolveRouteAttack(attacker,defender,route,commit){
  commit=Math.max(1,commit|0);
  const rn=(NODES[route.from]?.name||route.from)+'→'+(NODES[route.to]?.name||route.to);
  const youAtk=(attacker===G.player);
  const atkName=youAtk?'Tu':(attacker.civ.emoji+' '+attacker.civ.name);
  const techProt=routeProtegee(defender,{tokens:0}); // même définition que partout ailleurs (voir routeProtegee)
  const tok=route.tokens||0;
  if(techProt){addLog('🛡️ Route '+rn+' protégée (tech, jeton non perdable) — attaque sans effet.',youAtk?'red':'gold');return {held:true};}
  if(tok>=1&&commit<=1){addLog('🛡️ Route '+rn+' défendue par son jeton — tient contre 1 jeton.',youAtk?'red':'gold');return {held:true};}
  const wasProtected=tok>=1;
  defender.routes=defender.routes.filter(r=>r!==route);updateConnections(defender);
  if(wasProtected){applyCombatEngage(attacker,commit,true);addLog('💥 '+atkName+' DÉTRUIT la route '+rn+' — jeton de protection brisé ; jetons engagés en récupération.',youAtk?'gold':'red');}
  else{addLog('💥 '+atkName+' DÉTRUIT la route '+rn+' — non protégée, à reconstruire ; tes jetons reviennent (pas de récupération).',youAtk?'gold':'red');}
  if(!youAtk)notifyNationHit(defender,(attacker.civ?attacker.civ.name:'Une nation')+' détruit ta route',rn+' est détruite'+(wasProtected?' (protection brisée)':' — à reconstruire')+'.');
  return {destroyed:true};
}
function attackEnemyRoute(aiId,ri){
  if(G.phase!=='actions')return;
  const ai=G.ais.find(a=>a.civ.id===aiId);if(!ai)return;
  if(!(_warBetween(_moiId(),aiId))){addLog('⚠️ Il faut être en guerre avec '+ai.civ.name+' pour attaquer ses routes.','red');return;}
  // LIMITE DE 2 ATTAQUES/TOUR SUPPRIMÉE (demande de Marc) : le nombre d'assauts n'est plus plafonné —
  // il reste limité naturellement par les AC, les jetons Force et le coût en ressources de chaque combat.
  if(G.player.acLeft<1){addLog('⚠️ Attaque de route : besoin 1 AC.','red');return;}
  const route=ai.routes[ri];if(!route)return;
  // Liste divergente corrigée le 2026-08-09 : elle oubliait Réseau Orbital (`intel_2`), qui protège
  // pourtant les routes partout ailleurs. Une seule règle : `routesProtegeesParTech`.
  if(routesProtegeesParTech(ai)){addLog('🛡️ Routes de '+ai.civ.name+' protégées ('+techsProtegeantRoutes(ai).join(', ')+') — inattaquables.','red');return;}
  const need=((route.tokens||0)>=1)?2:1; // route protégée par un jeton → 2 jetons pour la briser
  if((G.player.forceTokens||0)<need){addLog('⚠️ Il te faut '+need+' jeton(s) Force pour cette route'+(((route.tokens||0)>=1)?' (protégée par un jeton)':'')+'.','red');return;}
  undoStack=[];
  G.player.acLeft-=1;G.player.spentThisTurn+=1;G.player._attacksThisTurn=(G.player._attacksThisTurn||0)+1;
  resolveRouteAttack(G.player,ai,route,need);
  undoStack=[];closePopup();render();
  if(G&&G._il){G._ilPassTries=0;setTimeout(_ilMaybePass,80);}
}
// ── ASSAUT IA : pendant son tour, l'IA tente de reprendre sa colonie (ou d'en prendre une) ──
function resolveAiAssault(ai,targetId,commit){
  const p=aiEnnemi(ai)||G.player;const war=_warBetween(ai.civ.id,p.civ.id)||_warBetween(_moiId(),ai.civ.id);if(!war)return;
  war.aiAggressor=false; // « au moins un assaut » effectué → ensuite comportement normal (paix si elle ne peut pas gagner)
  war._aiAssaultedThisTurn=true; // l'IA a déjà frappé ce tour → pas de second assaut en fin de tour
  const aEmpath=bonusCombatCartes(ai);
  const pEmpath=bonusCombatCartes(p);
  const _cruDef=cruiserAvailable(p)&&cruiserAfford(p); // le croiseur défend automatiquement s'il est dispo et qu'on peut payer
  if(_cruDef){const _cc=cruiserPay(p);addLog('⚓ Supercroiseur en défense (+'+(p.cruiserPower||5)+'⚔️, '+_cc+').','gold');}
  // Défense : on n'engage que les jetons qu'on peut PAYER (1<i class=ri-materials></i>+1<i class=ri-energy></i> chacun) — règle stricte.
  const dCommit=Math.max(0,Math.min(p.forceTokens||0,p.res.materials||0,p.res.energy||0));
  const pDef=dCommit+pEmpath+(_cruDef?(p.cruiserPower||5):0)+garrisonOf(p,targetId); // garnison auto : 1 colonie / 10 base
  const _aiCru=cruiserAvailable(ai)&&cruiserAfford(ai); // l'IA déploie son Supercroiseur si elle le possède et peut payer
  if(_aiCru){const _cc=cruiserPay(ai);addLog('⚓ '+ai.civ.emoji+' '+ai.civ.name+' déploie son Supercroiseur (+'+(ai.cruiserPower||5)+'⚔️, '+_cc+').','dim');}
  const aPow=commit+aEmpath+((ai.stratBonus&&ai.stratBonus.combatBonus)||0)+(_aiCru?(ai.cruiserPower||5):0);
  ai.acLeft=Math.max(0,ai.acLeft-1);ai.spentThisTurn+=1+commit;
  const _aiWins=aPow>pDef;
  applyCombatEngage(ai,commit,_aiWins); // l'attaquant paie TOUJOURS ses jetons engagés (coût + récupération), même si le défenseur n'engage rien — sinon reprise quasi GRATUITE en boucle (bug Marc : colonie rendue sans frais)
  applyCombatEngage(p,dCommit,!_aiWins);             // défenseur joueur : coût + récupération de ce qu'il engage
  if(dCommit>0)addLog('🛡️ Défense : '+dCommit+' jeton(s) engagé(s) (−'+dCommit+'<i class=ri-materials></i> −'+dCommit+'<i class=ri-energy></i>).','dim');
  const node=NODES[targetId];
  if(aPow>pDef){
    war.winsBy[ai.civ.id]=(war.winsBy[ai.civ.id]||0)+1;
    if(_cruDef)p.cruiserCooldown=getCooldownTurn(p); // croiseur en récupération (2 tours, 1 avec tech) suite à la défense perdue
    /* ⚠️ TROISIÈME COPIE DE LA CAPTURE, ET LA DERNIÈRE SANS GARDE-FOU. `ai.colonies.push(...)` était
       inconditionnel : quand l'IA cohabitait déjà sur ce nœud (seul l'Extra-Solaire le permet), elle
       s'y retrouvait avec DEUX colonies. `selftest.js` l'a attrapé — « invariant : double colonie
       eris » — une partie sur six, et seulement depuis qu'Éris rapporte 1⚡ et attire les IA.
       J'avais fusionné les deux autres copies le matin même et manqué celle-ci : c'est exactement
       ce que le mémo sur les copies multiples annonçait. Une seule capture pour tout le monde. */
    const newLvl=capturerNoeud(ai,targetId);
    ai._warRecapture=null;war.aiRecaptureTarget=null;
    p.res.morale=Math.max(0,(p.res.morale||0)-1);
    addLog('🏴 '+ai.civ.emoji+' '+ai.civ.name+' REPREND '+(node?node.name:targetId)+' ! ('+aPow+'⚔️ vs '+pDef+'🛡️, Nv.'+newLvl+') — tu perds la colonie, −1<i class=ri-morale></i>','red');
    G.aiActions.push({emoji:'🏴',name:'Reprend '+(node?node.name:targetId),desc:aPow+'⚔️ vs '+pDef+'🛡️'});
    notifyNationHit(p,ai.civ.name+' prend '+(node?node.name:targetId),'Ta colonie tombe (Nv.'+newLvl+') — combat '+aPow+' contre '+pDef+'. Tu perds 1 moral.');
  }else{
    war.winsBy[p.civ.id]=(war.winsBy[p.civ.id]||0)+1;ai.res.morale=Math.max(0,(ai.res.morale||0)-1);
    if(_aiCru)ai.cruiserCooldown=getCooldownTurn(ai); // croiseur IA en réparation suite à la défaite
    addLog('🛡️ '+ai.civ.emoji+' '+ai.civ.name+' échoue à reprendre '+(node?node.name:targetId)+' ('+aPow+'⚔️ vs '+pDef+'🛡️) — assaut repoussé !','gold');
    G.aiActions.push({emoji:'🛡️',name:'Assaut repoussé : '+(node?node.name:targetId),desc:aPow+'⚔️ vs '+pDef+'🛡️'});
    notifyNationHit(p,ai.civ.name+' attaque '+(node?node.name:targetId),'Assaut repoussé ! Ta défense tient — combat '+aPow+' contre '+pDef+'.');
  }
}
// ── ASSAUT IA SUR LE JOUEUR (fin de tour, quand l'IA MAINTIENT la guerre / refuse la paix) : le joueur choisit sa défense ──
// Renvoie la nation adverse d'une guerre, vue depuis ai (l'autre partie). Si une est humaine, c'est l'humain assailli.
function _warHumanFoe(war,ai){
  if(!war)return null;
  const otherId=(war.a===ai.civ.id)?war.b:war.a;
  return allPlayers().find(p=>p.civ.id===otherId)||null;
}
function _aiPickPlayerTarget(ai,defender,prefNode){
  const p=defender||G.player;
  const cols=p.colonies.filter(c=>c.nodeId!==p.civ.home&&c.connected);
  /* ⚠️ ON FRAPPE LA COLONIE QU'ON A ÉVALUÉE. Quand l'assaut vient de la phase d'actions,
     `tryAssaultAI` a choisi une cible APRÈS avoir calculé sa défense. Recalculer ici « la plus
     proche » ferait porter le coup sur une autre colonie que celle dont on avait mesuré la garde :
     l'IA se retrouverait à attaquer une place forte en croyant frapper un point faible. */
  if(prefNode){
    const _pref=p.colonies.find(c=>c.nodeId===prefNode);
    if(_pref) return {type:'colony',obj:_pref,name:(NODES[prefNode]&&NODES[prefNode].name)||prefNode};
  }
  let bestCol=null,bestD=99;
  for(const c of cols)for(const ac of ai.colonies){const d=getNodeDistance(c.nodeId,ac.nodeId);if(d<bestD){bestD=d;bestCol=c;}}
  if(bestCol)return{type:'colony',obj:bestCol,name:NODES[bestCol.nodeId]?.name||bestCol.nodeId};
  const routes=p.routes.filter(r=>(r.tokens||0)>0);
  if(routes.length)return{type:'route',obj:routes[0],name:(NODES[routes[0].from]?.name||routes[0].from)+'→'+(NODES[routes[0].to]?.name||routes[0].to)};
  // En dernier recours la CAPITALE est une cible valable (elle n'est plus imprenable : 10 jetons de
  // garnison la défendent). Sans ça, une nation réduite à sa seule capitale devenait inattaquable.
  const anyCol=p.colonies.filter(c=>c.nodeId!==p.civ.home);
  const pool=anyCol.length?anyCol:p.colonies.slice();
  if(pool.length){pool.sort((a,b)=>(a.level||1)-(b.level||1));return{type:'colony',obj:pool[0],name:NODES[pool[0].nodeId]?.name||pool[0].nodeId};}
  return null;
}
// defender = la nation HUMAINE assaillie (par défaut G.player en solo). Rendu nation-safe pour le multi-humain.
/* `suite` est un NOM de fonction, plus une fonction (voir `_warSuite`). Toutes les sorties de ce
   flux passent donc par `_assautSuite()`, qui résout le nom au moment de l'appel.
   ⚠️ Le piège qui vient d'être payé : en changeant la NATURE du paramètre, j'avais converti UN seul
   des six points de sortie. Les cinq autres appelaient encore `done()` sur une chaîne — la partie se
   figeait en silence au premier tour, sans exception ni message. Un paramètre qui change de nature
   se vérifie sur TOUS ses usages, pas sur celui qu'on a sous les yeux. */
function _assautSuite(suite){ if(typeof suite==='string'&&suite) fluxAppeler(suite); }
function maybeAiAssaultPlayer(ai,done,defender,prefNode){
  /* `_warOf` rend « la guerre de cette nation vue d'ici » ; quand l'assaillie est nommée, c'est LEUR
     guerre qui compte, pas la première trouvée. */
  const war=(ai&&defender&&typeof _warBetween==='function'&&_warBetween(ai.civ.id,defender.civ.id))||(ai&&_warOf(ai.civ.id));
  if(!war){_assautSuite(done);return;}
  // ATTAQUANT HUMAIN (multijoueur) : il n'attaque PAS automatiquement en fin de tour — il assaille lui-même
  // pendant SON tour d'action (combat visible + choix des jetons). Sinon la guerre paraîtrait « occultée ».
  if(ai._isAI===false){_assautSuite(done);return;}
  defender=defender||_warHumanFoe(war,ai)||G.player;
  if(war._aiAssaultedThisTurn){_assautSuite(done);return;} // l'IA a déjà attaqué pendant son tour → pas de double assaut
  const afford=Math.min(ai.res.materials||0,ai.res.energy||0);
  const target=_aiPickPlayerTarget(ai,defender,prefNode);
  if(!target||(ai.forceTokens||0)<1||afford<1||(ai.res.morale||0)<1){
    /* ═══ « IL N'A PAS ATTAQUÉ » DOIT SE VOIR, ET NE SE DIRE QU'UNE FOIS ═══
       Marc, partie 792D : « quand on est en guerre et que l'autre ne m'attaque pas en premier, ce
       n'est pas clair. Il faudrait un texte disant qu'il n'a pas attaqué. »
       Deux défauts en un. D'abord la ligne n'existait qu'au JOURNAL : quand on choisit d'encaisser
       en premier et qu'il ne se passe rien, l'écran reste muet et on croit à un blocage. Ensuite
       elle s'écrivait DEUX FOIS de suite au tour 9 — cette fonction est atteinte par plusieurs
       chemins dans la séquence de fin de tour. On mémorise donc le tour DANS la guerre : une
       annonce par guerre et par tour, et une notice chez l'assailli qui attend. */
    if(war._silenceTour!==G.turn){
      war._silenceTour=G.turn;
      addLog('🛡️ '+ai.civ.emoji+' '+ai.civ.name+' maintient la guerre mais n\'a pas les moyens d\'attaquer ce tour.','dim');
      const _na={emoji:'🛡️',name:'En guerre — n\'a pas attaqué ce tour',desc:'moyens insuffisants'};
      if(ai._turnActions)ai._turnActions.push(_na);else ai._turnActions=[_na];
      if(typeof notifyNationHit==='function')notifyNationHit(defender,'🛡️ Aucun assaut contre toi',
        ai.civ.emoji+' '+ai.civ.name+' <b>n\'a pas attaqué</b> ce tour-ci.<br>'
        +'La guerre continue, mais il lui manque les jetons, les ressources ou le moral pour monter un assaut.'
        +'<br><br>Tes positions sont intactes.');
    }
    _assautSuite(done);return;
  }
  const commit=Math.min(ai.forceTokens,afford);
  showAiAssaultDefenseModal(ai,target,commit,done,defender);
}
function _aadUpd(v){document.getElementById('aad-val').textContent=v;document.getElementById('aad-cost').textContent='−'+v+'🪨 −'+v+'⚡';}
function showAiAssaultDefenseModal(ai,target,aiCommit,done,defender){
  const p=defender||G.player;
  const shownThreat=(getIntelLevel(p)>=2)?(aiCommit+'⚔️'):('≈'+aiCommit+'⚔️ (estimé)');
  /* ⚠️ Le croiseur défensif se paie AUSSI : on le réserve avant de compter les jetons engageables. */
  const maxDef=Math.max(0,Math.min(p.forceTokens||0,
    maxAffordableTokens(p, reserveCroiseur(p, (typeof cruiserAvailable==='function'&&cruiserAvailable(p)&&typeof cruiserAfford==='function'&&cruiserAfford(p)))))); // limité à ce qu'on peut PAYER
  if(_isRemote(p)||_decisionActive()){ // en ligne : router la défense vers le joueur (éventuellement DISTANT) assailli
    // CHOIX TACTIQUE (Marc) : le défenseur voit la cible et décide combien de jetons engager — et s'il déploie
    // son SUPERCROISEUR (s'il le possède et peut le payer ; demi-tarif avec l'IA de Navigation : 2🪨 +3⚡).
    const _cruOk=(typeof cruiserAvailable==='function'&&cruiserAvailable(p)&&typeof cruiserAfford==='function'&&cruiserAfford(p));
    const _cruC=(typeof cruiserCost==='function')?cruiserCost(p):{materials:5,energy:5};
    // Le contexte de l'assaut va dans G — il y était déjà pour le chemin solo (`G._aiAssaultCtx`),
    // on l'unifie plutôt que de garder un second exemplaire dans une fermeture.
    G._aiAssaultCtx={aiId:ai.civ.id, target, aiCommit, done, defCivId:(p&&p.civ&&p.civ.id)||null, maxDef, cruOk:_cruOk};
    (_isRemote(p)?_emitRemote:_emitDecision)('defense', p,
      {attacker:ai.civ.id, attackerName:ai.civ.name, target:{type:target.type,name:target.name}, threat:aiCommit, maxDef,
       cruiser:_cruOk, cruiserPower:(p.cruiserPower||5), cruiserCost:_cruC,
       myTokens:(p.forceTokens||0), myMat:(p.res.materials||0), myEnergy:(p.res.energy||0)},
      null, 'adDefenseContreIA');
    return;
  }
  const pEmp=bonusCombatCartes(p);
  const cruAvail=cruiserAvailable(p)&&cruiserAfford(p);
  G._aiAssaultCtx={aiId:ai.civ.id,target,aiCommit,done};
  const tgtLabel=target.type==='colony'?('🏙️ Colonie '+target.name+' (Nv.'+(target.obj.level||1)+')'):('🛤️ Route '+target.name);
  const html='<div id="aad-overlay" style="position:fixed;inset:0;background:rgba(4,4,18,.9);z-index:620;display:flex;align-items:center;justify-content:center">'+
    '<div style="background:#160a0a;border:2px solid #cc4422;border-radius:12px;padding:20px;min-width:300px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.9)">'+
    '<div style="font-size:1.05em;font-weight:700;color:#ff8866;margin-bottom:8px">🔴 '+ai.civ.emoji+' '+ai.civ.name+' t\'assaille !</div>'+
    '<div style="font-size:.85em;color:#cc9988;margin-bottom:6px">Cible : <strong style="color:#ffbbaa">'+tgtLabel+'</strong></div>'+
    '<div style="font-size:.82em;color:#cc9988;margin-bottom:12px">Force d\'attaque : <strong style="color:#ff9977">'+shownThreat+'</strong>. Combien de jetons engages-tu en défense ? <span style="color:#7880a0">(1<i class=ri-materials></i> 1<i class=ri-energy></i> / jeton)</span>'+
      (pEmp?'<br><span style="color:#c080ff">🔮 +'+pEmp+' Empathes (gratuit)</span>':'')+
      (cruAvail?'<br><span style="color:#88bbee">⚓ Supercroiseur : +'+(p.cruiserPower||5)+'⚔️ auto si tu engages ≥1 jeton (5<i class=ri-materials></i> 5<i class=ri-energy></i>)</span>':'')+'</div>'+
    '<input type="range" id="aad-slider" min="0" max="'+maxDef+'" value="0" style="width:100%" oninput="_aadUpd(this.value)">'+
    '<div style="text-align:center;font-size:.85em;color:#c8d8f8;margin:8px 0">Défense : <strong id="aad-val">0</strong> jeton(s) — coût <span id="aad-cost">−0<i class=ri-materials></i> −0<i class=ri-energy></i></span></div>'+
    '<div style="display:flex;gap:8px;margin-top:6px">'+
      '<button onclick="confirmAiAssaultDefense()" style="flex:1;padding:9px;background:#2a1200;border:1px solid #cc6622;color:#ffaa66;border-radius:6px;cursor:pointer;font-weight:700">🛡️ Défendre</button>'+
      '<button onclick="document.getElementById(\'aad-slider\').value=0;confirmAiAssaultDefense()" style="flex:1;padding:9px;background:#1a1a3a;border:1px solid #3a3a6a;color:#9898b8;border-radius:6px;cursor:pointer">↩ Ne rien dépenser</button>'+
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}
function confirmAiAssaultDefense(){
  const slider=document.getElementById('aad-slider');
  const def=slider?(parseInt(slider.value)||0):0;
  const ov=document.getElementById('aad-overlay');if(ov)ov.remove();
  const ctx=G._aiAssaultCtx;G._aiAssaultCtx=null;if(!ctx)return;
  const ai=G.ais.find(a=>a.civ.id===ctx.aiId);if(!ai){_assautSuite(ctx.done);return;}
  resolveAiAssaultOnPlayer(ai,ctx.target,ctx.aiCommit,def,ctx.done);
  if(G._ilPaused){ G._ilPaused=false; setTimeout(interleaveStep,300); }
}
function resolveAiAssaultOnPlayer(ai,target,aiCommit,defTokens,done,defender){
  const p=defender||G.player;const war=_warBetween(ai.civ.id,p.civ.id)||_warOf(ai.civ.id);
  const pEmp=bonusCombatCartes(p);
  const aEmp=bonusCombatCartes(ai);
  // Le Supercroiseur ne se déploie plus tout seul : en ligne c'est le CHOIX du défenseur (G._defCruiserChoice).
  // En solo, comportement d'origine conservé (auto s'il défend avec au moins 1 jeton).
  const _cruChoice=G._defCruiserChoice; G._defCruiserChoice=undefined;
  const cruDef=(_cruChoice!==undefined ? !!_cruChoice : (defTokens>0))&&cruiserAvailable(p)&&cruiserAfford(p);
  if(cruDef){const _cc=cruiserPay(p);addLog('⚓ Supercroiseur en défense (+'+(p.cruiserPower||5)+'⚔️, '+_cc+').','gold');}
  const pDef=defTokens+pEmp+(cruDef?(p.cruiserPower||5):0)+((target&&target.type==='colony'&&target.obj)?garrisonOf(p,target.obj.nodeId):1); // garnison auto : 1 colonie / 10 base
  const _aiCru=cruiserAvailable(ai)&&cruiserAfford(ai);
  if(_aiCru){const _cc=cruiserPay(ai);addLog('⚓ '+ai.civ.emoji+' '+ai.civ.name+' déploie son Supercroiseur (+'+(ai.cruiserPower||5)+'⚔️, '+_cc+').','dim');}
  const aPow=aiCommit+aEmp+((ai.stratBonus&&ai.stratBonus.combatBonus)||0)+(_aiCru?(ai.cruiserPower||5):0);
  // Coût + récupération SYMÉTRIQUES : l'attaquant IA paie/récupération ses jetons ; si tu repousses l'assaut, l'IA en perd la MOITIÉ définitivement (défendre fait perdre des jetons à l'ennemi). Le défenseur paie ce qu'il engage.
  applyCombatEngage(ai,aiCommit,aPow>pDef); // l'attaquant paie TOUJOURS ses jetons engagés (même si tu ne défends pas) — sinon capture GRATUITE
  applyCombatEngage(p,defTokens,pDef>=aPow);
  if(defTokens>0)addLog('🛡️ Défense : '+defTokens+' jeton(s) engagé(s) (−'+defTokens+'<i class=ri-materials></i> −'+defTokens+'<i class=ri-energy></i>).','dim');
  let resultTxt,cls;
  if(pDef>=aPow){
    if(war)war.winsBy[p.civ.id]=(war.winsBy[p.civ.id]||0)+1;
    if(_aiCru)ai.cruiserCooldown=getCooldownTurn(ai); // croiseur IA en réparation suite à l'échec de l'assaut
    ai.res.morale=Math.max(0,(ai.res.morale||0)-1);
    resultTxt='🛡️ Défense réussie ! '+pDef+'🛡️ vs '+aPow+'⚔️ — '+(target.type==='colony'?'Colonie '+target.name+' tient.':'Route '+target.name+' tient.');cls='win';
    addLog('🛡️ '+ai.civ.emoji+' '+ai.civ.name+' repoussé ('+pDef+'🛡️ vs '+aPow+'⚔️).','gold');
  }else{
    if(war)war.winsBy[ai.civ.id]=(war.winsBy[ai.civ.id]||0)+1;
    if(cruDef)p.cruiserCooldown=getCooldownTurn(p);
    let lost;
    if(target.type==='route'){
      target.obj.tokens=0;updateConnections(p);lost='🛤️ Route '+target.name+' neutralisée — jeton de protection perdu.';
    }else{
      // RÈGLE UNIFIÉE (Marc) : une colonie vaincue est CAPTURÉE IMMÉDIATEMENT au niveau −1, dans les DEUX
      // SENS. Avant, seule TA colonie était d'abord « rétrogradée » (il fallait 3 assauts à l'ennemi pour
      // prendre une colonie Nv.3, alors qu'un seul te suffisait) — asymétrie corrigée.
      const col=target.obj;
      const _newLvl=Math.max(1,(col.level||1)-1);
      p.colonies=p.colonies.filter(c=>c.nodeId!==col.nodeId);updateConnections(p);
      const conn=(typeof checkConnected==='function')?checkConnected(col.nodeId,ai):true;
      if(!ai.colonies.some(c=>c.nodeId===col.nodeId))ai.colonies.push({nodeId:col.nodeId,level:_newLvl,connected:conn});
      updateConnections(ai);if(war)war.aiRecaptureTarget=null;
      lost='🏴 Colonie '+target.name+' CAPTURÉE par '+ai.civ.name+' (Nv.'+_newLvl+') — tu la perds !';
    }
    p.res.morale=Math.max(0,(p.res.morale||0)-1);
    resultTxt='💥 Défense insuffisante ! '+pDef+'🛡️ vs '+aPow+'⚔️<br><strong style="color:#ff9977">'+lost+'</strong> (−1<i class=ri-morale></i>)';cls='loss';
    addLog('💥 '+lost+' ('+pDef+'🛡️ vs '+aPow+'⚔️)','red');
  }
  if(war)war._aiAssaultedThisTurn=true;
  const _act={emoji:'⚔️',name:'Assaut sur '+target.name,desc:aPow+'⚔️ vs '+pDef+'🛡️'};
  if(ai._turnActions)ai._turnActions.push(_act);else ai._turnActions=[_act];
  render();
  showWarModal('⚔️ '+ai.civ.emoji+' '+ai.civ.name+' attaque',resultTxt,{txt:(cls==='win'?'Tes positions tiennent.':'Tu as subi des pertes.'),cls});
  _warSuite(typeof done==='string'?done:null); // `done` est désormais un NOM (voir _warSuite)
}
/* ============================================================ CONNECTION LOGIC ============================================================ */
function checkConnected(nodeId,p){
  const empath=hasSpec(p,'empath_routes');
  const vis=new Set([p.civ.home]);const q=[p.civ.home];
  // empath_routes : toutes les routes connectent, pas besoin de jeton
  while(q.length){const cur=q.shift();for(const r of p.routes){if(!empath&&(r.tokens||0)<=0)continue;const nxt=r.from===cur?r.to:r.to===cur?r.from:null;if(nxt&&!vis.has(nxt)){vis.add(nxt);q.push(nxt);}}}
  return vis.has(nodeId);
}
function updateConnections(p){
  // Une route CONNECTE indépendamment du jeton (le jeton = protection pirate seulement).
  const vis=new Set([p.civ.home]);const q=[p.civ.home];
  while(q.length){const cur=q.shift();for(const r of p.routes){const nxt=r.from===cur?r.to:r.to===cur?r.from:null;if(nxt&&!vis.has(nxt)){vis.add(nxt);q.push(nxt);}}}
  for(const col of p.colonies){
    col.connected=vis.has(col.nodeId);
    // Connexion étrangère : colonie non connectée à son propre réseau,
    // mais reliée par une route à une colonie IA avec qui un accord commercial est actif
    /* ⚠️ LE TRANSIT NE VALAIT QUE POUR LA NATION ACTIVE, ET QU'AVEC UNE IA. `p===G.player` privait
       les autres nations de la règle, et `G.ais.some(...)` faisait qu'un accord de transit avec un
       autre JOUEUR ne comptait jamais, pour personne. */
    col.foreignConnected=false;
    if(!col.connected){
      for(const r of p.routes){
        const other=r.from===col.nodeId?r.to:r.to===col.nodeId?r.from:null;
        if(!other)continue;
        if(!accordAvecMoi(other,p))continue;   // un accord entre deux AUTRES nations ne me connecte à rien
        const partenaire=allPlayers().some(function(o){
          return o!==p && o.colonies.some(function(ac){return ac.nodeId===other;});
        });
        if(partenaire){col.foreignConnected=true;break;}
      }
    }
  }
}
/* ============================================================ TENSION POPULAIRE ============================================================ */
/* ═══════════ DEUX NOUVELLES CAUSES DE TENSION (Marc, 2026-08-24) ═══════════
   Jusqu'ici la tension ne montait que pour des griefs de VOISINAGE (routes, domination, avance
   technologique). Une nation pouvait donc être proprement étranglée — enfermée derrière les
   colonies des autres, incapable de s'étendre — sans que rien ne monte : elle finissait la partie
   dernière et sans histoire. C'est ce que Marc a vu partie après partie.

     A. BLOCAGE DE CHEMIN (+4) — « si une nation bloque la progression vers des colonies, par
        exemple en colonisant sur le chemin qu'on veut prendre ».
     B. ÉTOUFFEMENT (+6 puis +1 par tour) — « si les autres ont trois colonies ou plus et qu'une
        nation n'arrive pas à en avoir plus qu'une ou deux ». À partir du TOUR 2.

   ⚠️ B NE VISE QU'UNE SEULE NATION, ET C'EST DÉLIBÉRÉ. Marc a choisi « celui qui la bloque le
   plus ». Répartir la colère sur tout le monde mettrait l'étouffée en guerre contre trois
   adversaires à la fois — elle est déjà la plus faible, elle serait balayée sur tous les fronts.
   Un seul ennemi désigné lui laisse une chance de concentrer ses forces. */

/* Combien de nœuds VOISINS des colonies de `x` sont tenus par `y` ? C'est la mesure du blocage :
   ce sont exactement les cases vers lesquelles `x` aurait pu s'étendre. */
function _voisinsPris(x,y){
  if(!x||!y)return 0;
  const aY=new Set((y.colonies||[]).map(c=>c.nodeId));
  const vus=new Set(); let n=0;
  for(const c of (x.colonies||[]))
    for(const adj of ((NODES[c.nodeId]&&NODES[c.nodeId].conn)||[])){
      if(vus.has(adj))continue; vus.add(adj);
      if(aY.has(adj))n++;
    }
  return n;
}
/* Combien de nœuds voisins restent LIBRES pour `x` ? À zéro ou un, elle est à l'étroit. */
function _ouverturesLibres(x){
  const pris=new Set();
  for(const n of allPlayers())for(const c of (n.colonies||[]))pris.add(c.nodeId);
  const vus=new Set(); let n=0;
  for(const c of (x.colonies||[]))
    for(const adj of ((NODES[c.nodeId]&&NODES[c.nodeId].conn)||[])){
      if(vus.has(adj))continue; vus.add(adj);
      const nd=NODES[adj];
      if(!nd||nd.decorative||nd.noColonize)continue;
      if(!pris.has(adj))n++;
    }
  return n;
}
/* A. `y` barre-t-elle le chemin de `x` ? Il ne suffit pas d'être voisin — sinon la règle se
   déclencherait pour tout le monde en permanence. Il faut que `x` soit RÉELLEMENT à l'étroit
   (au plus une ouverture libre) ET que `y` occupe une de ses sorties. */
function bloqueLExpansion(x,y){
  if(!x||!y||x===y)return false;
  return _ouverturesLibres(x)<=1 && _voisinsPris(x,y)>=1;
}
/* B. `x` est-elle étouffée ? Deux colonies au plus, quand une autre en a au moins trois.
   ⚠️ ON COMPTE LES COLONIES POSSÉDÉES, PAS LES COLONIES CONNECTÉES. Premier jet : `connected`.
   Une nation avec quatre colonies dont deux non reliées était alors déclarée « étouffée » — elle
   n'était pas enfermée, elle avait seulement du retard sur ses routes. Ces faux positifs se
   comptaient par dizaines (`mesure_tensions.js`) et mettaient des nations prospères en guerre
   populaire. La règle de Marc parle du NOMBRE de colonies : « une nation n'arrive pas à en avoir
   plus qu'une ou deux ». C'est donc bien la possession, pas le réseau. */
function estEtouffee(x){
  if(!x||G.turn<2)return false;
  if((x.colonies||[]).length>2)return false;
  /* ⚠️ « LES AUTRES NATIONS », AU PLURIEL — PAS « UNE AUTRE ». Premier jet : `some(...)`, donc
     l'étouffement se déclarait dès qu'UNE nation prenait sa troisième colonie, ce qui arrive au
     tour 3 ou 4 dans toute partie normale. Toutes les autres, encore à deux, se déclaraient
     étouffées en même temps : le plateau entier en colère pour un simple décalage de rythme.
     La règle écrite dit « si les AUTRES nations ont trois colonies ou plus » — c'est-à-dire quand
     on est seul en arrière, pas quand on est second. `every` au lieu de `some` : la différence
     entre une nation à la traîne et une nation distancée par tout le monde. */
  const autres=allPlayers().filter(o=>o!==x);
  return autres.length>0&&autres.every(o=>(o.colonies||[]).length>=3);
}
/* Qui l'étouffe le plus ? Celle qui occupe le plus de ses sorties ; à égalité, la plus grande. */
function principalBloqueur(x){
  let best=null,score=-1;
  for(const o of allPlayers()){
    if(o===x)continue;
    const v=_voisinsPris(x,o)*10+(o.colonies||[]).filter(c=>c.connected).length;
    if(v>score){score=v;best=o;}
  }
  return best;
}
function updateTension(){
  /* ═══════ LA TENSION SE FIGEAIT DÈS QU'UNE GUERRE EXISTAIT QUELQUE PART ═══════
     ⚠️ `if(G.warState) return;` — une seule ligne, et tout le système s'arrêtait. `G.warState` est
     un drapeau LOCAL : « la nation que je regarde est en guerre ». À quatre nations, dès qu'un
     conflit s'ouvrait n'importe où, plus AUCUN couple ne voyait sa tension bouger — ni les griefs,
     ni l'érosion, ni les manifestations, ni la guerre populaire. Marc, partie 140A : « les tensions
     ne semblent pas vraiment interpolées correctement, y en a jamais ». Sa partie a connu des
     guerres dès le tour 4 : le calcul dormait depuis ce moment-là.
     L'intention était juste — deux nations DÉJÀ en guerre n'ont pas à accumuler de la rancune, la
     guerre s'en charge — mais cela se décide COUPLE PAR COUPLE. C'est ce que font les gardes
     `_warBetween(...)` ci-dessous, qui existaient déjà pour le déclenchement. */
  /* ⚠️ TROIS VARIABLES MORTES RETIRÉES ICI (`pColNodes`, `pConnectedCount`, `pT3`). Elles lisaient
     `G.player` et n'étaient utilisées NULLE PART : vestiges de l'époque où cette fonction ne
     calculait la tension que du point de vue du joueur. Depuis, `_tensionVers(x,y)` recalcule tout
     à partir de ses deux arguments. Les laisser coûtait trois lectures de la perspective globale et
     donnait à lire une fonction qui semblait tourner autour du joueur — c'est exactement ainsi
     qu'on reproduit la maladie sans s'en apercevoir. */
  /* ⚠️ LA TENSION EXISTE ENTRE DEUX NATIONS, PAS ENTRE « LE JOUEUR » ET LES AUTRES.
     Cette boucle ne calculait que les couples touchant G.player. À deux, cela couvrait tout et
     personne ne l'a vu. À QUATRE, la tension entre les trois autres nations ne montait JAMAIS :
     deux adversaires pouvaient se poser des routes sur le nez toute la partie sans que rien
     n'augmente, donc sans jamais risquer la guerre populaire. Un tiers du plateau était inerte.
     `_tensionVers(x,y)` applique maintenant la MÊME règle écrite à n'importe quel couple, et on
     parcourt tous les couples ordonnés. Le calcul est identique — c'est sa portée qui change. */
  const _tensionVers=(x,y)=>{           // ce que x reproche à y, ce tour-ci
    let add=0;
    const colX=new Set(x.colonies.map(c=>c.nodeId));
    for(const r of y.routes){           // +1 par route de y qui touche une colonie de x (hors accord)
      const touche=(colX.has(r.from)||colX.has(r.to));
      const accord=accordConcerne(r.from,x,y)||accordConcerne(r.to,x,y);   // l'accord doit lier CES deux nations
      if(touche&&!accord)add+=1;
    }
    for(const ry of y.routes){          // +1 par route partagée que y défend d'un jeton
      if((ry.tokens||0)>0)for(const rx of x.routes){
        if((rx.from===ry.from&&rx.to===ry.to)||(rx.from===ry.to&&rx.to===ry.from))add+=1;
      }
    }
    const cx=x.colonies.filter(c=>c.connected).length, cy=y.colonies.filter(c=>c.connected).length;
    if(cy-cx>=6)add+=6;else if(cy-cx>=4)add+=3;   // y domine x
    if(y.cards.filter(c=>c.tier===3).length>=2)add+=4;  // y prend une avance technologique
    /* A — y barre le chemin de x. UNE SEULE FOIS, à l'instant où le blocage s'installe : c'est un
       ACTE (« en colonisant sur le chemin qu'on veut prendre »), pas un état permanent. La charge a
       été décidée avant les boucles, ici on ne fait que la lire. */
    add+=(_chargesBlocage.get(x.civ.id+'|'+y.civ.id)||0);
    /* B — étouffement, uniquement envers celle qui bloque le plus : +6 le tour où il s'installe,
       puis +1 par tour tant qu'il dure. Littéralement la règle de Marc. */
    if(x._etouffeDepuis!==undefined&&x._etouffeDepuis!==null&&principalBloqueur(x)===y)
      add+=(_chargesEtouffe.has(x.civ.id)?6:1);
    return add;
  };
  const _toutes=(typeof allPlayers==='function')?allPlayers():[G.player].concat(G.ais||[]);
  /* ═══ POURQUOI CES DEUX GRIEFS SONT DES ÉVÉNEMENTS ET NON DES ÉTATS ═══
     Premier réglage, le 2026-08-24 : +4 et +6 RÉPÉTÉS À CHAQUE TOUR tant que la situation durait.
     Le banc `mesure_tensions.js` a tranché en dix parties — 67 guerres populaires contre 10 sur le
     témoin, 89 couples au maximum. C'était arithmétique : la tension s'accumule d'un tour sur
     l'autre et le seuil est 10, donc un grief permanent de +4 déclare la guerre en trois tours,
     à tout le monde, dès que la carte se remplit. Fin de partie, chaque nation est à l'étroit :
     tout le monde déclarait la guerre à tout le monde.
     La règle écrite de Marc dit autre chose : « +6 de tension populaire. Si ça continue chaque tour
     +1 ». Six UNE FOIS, puis un. On charge donc au moment où la situation S'INSTALLE, et on
     entretient ensuite à +1. C'est ce que font les deux tables ci-dessous, calculées une seule fois
     avant les boucles — `_tensionVers` les lit sans jamais les modifier. */
  const _chargesBlocage=new Map(), _chargesEtouffe=new Set();
  for(const x of _toutes){
    if(!x._blocageVu)x._blocageVu={};
    for(const y of _toutes){
      if(x===y)continue;
      /* ⚠️ LA MARQUE N'EST JAMAIS EFFACÉE, ET C'EST TOUT L'ENJEU. Premier jet : on oubliait le
         blocage dès qu'il cessait, donc il se refacturait à la réouverture. Sur une carte qui se
         remplit, `_ouverturesLibres` clignote — une colonie prise, une route posée — et les +4
         revenaient tour après tour. Mesuré : 15 % → 30 % de tours passés en guerre pour ce seul
         grief. Une nation ne peut donc reprocher à une autre de l'avoir enfermée QU'UNE FOIS dans
         la partie : +4 au maximum par couple, quoi qu'il arrive ensuite. */
      if(bloqueLExpansion(x,y)&&!x._blocageVu[y.civ.id]){
        x._blocageVu[y.civ.id]=G.turn; _chargesBlocage.set(x.civ.id+'|'+y.civ.id,4);
      }
    }
  }
  /* L'ÉTOUFFEMENT EST UN ÉTAT QUI DURE, pas un grief du tour : on retient DEPUIS QUAND il dure,
     pour que la colère grandisse au lieu de stagner. Mis à jour une fois par nation, avant les
     boucles — `_tensionVers` est appelée pour chaque couple et ne doit rien modifier. */
  for(const _n of _toutes){
    if(estEtouffee(_n)){
      if(_n._etouffeDepuis===undefined||_n._etouffeDepuis===null){
        _n._etouffeDepuis=G.turn; _chargesEtouffe.add(_n.civ.id);
        const _b=principalBloqueur(_n);
        addLog('😰 '+_n.civ.emoji+' '+_n.civ.name+' étouffe — '+((_n.colonies||[]).filter(c=>c.connected).length)
          +' colonie(s) quand les autres en ont 3 ou plus'+(_b?(' · la colère vise '+_b.civ.emoji+' '+_b.civ.name):'')+'.','red');
      }
    } else _n._etouffeDepuis=null;
  }
  /* ⚠️ CE BLOC CALCULAIT SANS RIEN DÉCLENCHER — LA MOITIÉ D'UN CORRECTIF EST PIRE QUE RIEN.
     La boucle ci-dessous existait déjà et faisait bien monter la tension entre deux nations
     quelconques. Mais l'EFFET de cette tension — la guerre populaire à 10 — était resté cent lignes
     plus bas, dans la boucle réservée aux couples du joueur. Deux IA pouvaient donc atteindre 10/10
     et rester en paix pour toujours.
     Ce n'était pas une hypothèse : six parties complètes instrumentées (`mesure_guerre_perspective.js`)
     donnaient 84 colonies, 89 technologies, une tension de 10/10 entre les autres nations… et ZÉRO
     guerre déclarée. Le seuil était atteint précisément là où le déclencheur n'existait pas.
     Maintenant le déclenchement est ici, avec le calcul. */
  for(const x of _toutes)for(const y of _toutes){
    if(x===y)continue;
    /* ⚠️ CE TEST EST DU ROUTAGE, PAS UNE RÈGLE. Le calcul est identique pour tous les couples ; ce
       qui diffère, c'est qu'un couple impliquant la nation LOCALE doit ouvrir une fenêtre chez le
       joueur au lieu d'être résolu en silence (`triggerGuereeForcee` contre `guerrePopulaireAuto`).
       Tant que cette distinction existe, elle doit rester lisible pour ce qu'elle est. */
    if(x===G.player||y===G.player)continue;      // couples de la nation locale : traités plus bas, avec fenêtre
    if(_warBetween(x.civ.id,y.civ.id))continue;  // déjà en guerre ensemble : la guerre tient la tension à 10
    const a=_tensionVers(x,y);
    if(a>0)addTens(x.civ.id,y.civ.id,a);
    else if(getTens(x.civ.id,y.civ.id)>0)addTens(x.civ.id,y.civ.id,-1);   // paix : −1/tour
    /* Même seuil, même règle que pour toi : 10 de tension effective, et pas déjà en guerre
       ensemble. La garde regarde CES DEUX nations — pas « suis-je en guerre », qui ne les
       concerne pas. */
    if(tensEff(x.civ.id,y.civ.id)>=10&&!_warBetween(x.civ.id,y.civ.id)){
      guerrePopulaireAuto(x,y);
      return;
    }
  }
  for(const ai of G.ais){
    if(_warBetween(_moiId(),ai.civ.id))continue;   // même règle que ci-dessus, couple par couple
    let addP=_tensionVers(G.player,ai), addA=_tensionVers(ai,G.player);
    // Appliquer
    if(addP>0){addTens('player',ai.civ.id,addP);addLog('😡 Ta tension vs '+ai.civ.name+' +'+addP+' → '+getTens('player',ai.civ.id)+'/10','dim');}
    else if(getTens('player',ai.civ.id)>0)addTens('player',ai.civ.id,-1); // paix : −1/tour
    if(addA>0)addTens(ai.civ.id,'player',addA);
    else if(getTens(ai.civ.id,'player')>0)addTens(ai.civ.id,'player',-1); // paix : −1/tour
    // Effets tension joueur → cette IA (guerre forcée uniquement ici)
    const pt=tensEff('player',ai.civ.id); // tension effective (−6 envers les autres nations si une guerre tourne déjà)
    /* ⚠️ LA TRÊVE DE 3 TOURS EST SUPPRIMÉE (Marc, 2026-08-14 : « y a une trêve de trois tours pour
       les IA dans les règles ? Je savais pas, supprime ça »).
       Elle n'était nulle part dans les règles écrites, et surtout elle ne liait QUE les IA : elle
       était consultée ici et pour les manifestations, jamais quand le joueur déclarait la guerre
       lui-même. On pouvait donc déclarer, conquérir, acheter la paix, et recommencer au tour
       suivant — cinq colonies prises ainsi dans la partie 0C10 — pendant que les IA, elles,
       devaient attendre. Une règle qui ne s'applique qu'à un camp n'est pas une règle. */
    const _warWithThis=!!(_warBetween(_moiId(),ai.civ.id)); // déjà en guerre avec CETTE nation → pas de guerre populaire en plus
    if(pt>=10&&!_warWithThis){triggerGuereeForcee('player',ai);return;}
    // Effets tension IA → joueur
    const at=tensEff(ai.civ.id,'player');
    if(at>=10&&!_warWithThis){triggerGuereeForcee('ai',ai);return;}
  }
  // Compat aliases
  G.playerTension=G.ais.reduce((mx,ai)=>Math.max(mx,getTens('player',ai.civ.id)),0);
  if(G.ais[0])G.aiTension=getTens(G.ais[0].civ.id,'player');
  /* ═══════ MANIFESTATIONS — −1 MORAL PAR NATION HAÏE À 6 OU PLUS ═══════
     ⚠️ CETTE PUNITION NE FRAPPAIT QUE TOI. La règle est écrite pour tout le monde dans regles.html,
     mais le code ne l'appliquait qu'à `G.player` : une IA détestée par les trois autres ne perdait
     jamais un point de moral. Comme le moral pèse sur les revenus et les points de victoire, c'était
     un avantage permanent et invisible — d'autant plus qu'aucune guerre n'éclatait jamais entre
     elles pour compenser.
     On applique la même règle à chaque nation. `_manifLoss` reste posé sur chacune : l'affichage du
     revenu net le lit, et il ne servait qu'au joueur local jusqu'ici. */
  for(const nat of _toutes){
    if(!nat||!nat.civ)continue;
    const hostiles=_toutes.filter(a=>a&&a!==nat
      && tensEff(nat.civ.id,a.civ.id)>=6
      && !_warBetween(nat.civ.id,a.civ.id));   // pas de double peine avec qui on est déjà en guerre
    nat._manifLoss=hostiles.length;
    if(!hostiles.length)continue;
    nat.res.morale=Math.max(0,(nat.res.morale||0)-hostiles.length);
    const detail=hostiles.map(a=>a.civ.name+' '+getTens(nat.civ.id,a.civ.id)+'/10').join(', ');
    if(nat===G.player)
      addLog('😤 Tensions élevées ('+detail+') — manifestations : −'+hostiles.length+'<i class=ri-morale></i>','red');
    else
      addLog('😤 '+nat.civ.emoji+' '+nat.civ.name+' — manifestations ('+detail+') : −'+hostiles.length+'<i class=ri-morale></i>','dim');
  }
}
/* La suite de la GUERRE POPULAIRE : un NOM rangé dans `G._flux.donnees`.
   `_forcedWarCb` était une variable de module : perdue à la sauvegarde, et partagée entre toutes
   les parties d'un même processus serveur. */
function _guerrePopSuite(nom){ fluxDonnees().suiteGuerrePop=(typeof nom==='string'&&nom)?nom:null; }
function _guerrePopSuiteJouer(){ const d=fluxDonnees(), nom=d.suiteGuerrePop; d.suiteGuerrePop=null; if(nom){fluxAppeler(nom);return true;} return false; }
function _guerrePopEnAttente(){ return !!fluxDonnees().suiteGuerrePop; }
/* ═══════ GUERRE POPULAIRE — LE NOYAU, ENTRE DEUX NATIONS NOMMÉES ═══════
   Quand la tension d'une nation envers une autre atteint 10, son peuple exige la guerre. Cette
   fonction fait tout ce qui ne dépend d'AUCUN écran : déclarer, épingler la tension, encaisser le
   coût moral. Elle ne sait pas qui regarde, et c'est le but.

   ⚠️ DEUX DÉFAUTS CORRIGÉS ICI, ET LE SECOND EST LE PLUS COÛTEUX.
   1. « −2 moral pour chaque camp » en frappait QUATRE. L'ancien code faisait `G.player −2` puis
      `G.ais.forEach(−2)` : à deux nations c'était bien « chaque camp », à quatre cela punissait deux
      spectateurs pour une guerre qui ne les regardait pas. La règle écrite dit les deux camps ; on
      applique les deux camps.
   2. Elle ne pouvait déclarer QUE des guerres impliquant la nation active — elle appelait la façade
      `declareWar`, qui parle toujours au nom de `G.player`. Deux IA à 10/10 de tension ne pouvaient
      donc jamais entrer en guerre. Mesuré : sur six parties complètes, tension 10/10 entre les
      autres nations, et ZÉRO guerre déclarée. Le monde était en paix perpétuelle sauf autour de toi.
   `G.warWith` / `playerTension` / `aiTension` sont des miroirs de l'écran local : on ne les pose que
   si cet écran-ci est concerné. */
function guerrePopulaireEntre(offense,offenseur){
  if(!offense||!offenseur||offense===offenseur)return null;
  const w=declarerGuerre(offense,offenseur,'Guerre Populaire Forcée — le peuple exige vengeance !','other');
  if(!w)return null;
  for(const n of [offense,offenseur]) n.res.morale=Math.max(0,(n.res.morale||0)-2);
  /* La tension reste à 10 pendant la guerre ; elle ne redescend qu'à la paix. */
  setTens(offense.civ.id,offenseur.civ.id,10); setTens(offenseur.civ.id,offense.civ.id,10);
  const local=(offense===G.player||offenseur===G.player);
  if(local){
    const autre=(offense===G.player)?offenseur:offense;
    G.warWith=autre.civ.id;              // épingler la cible, sinon syncWarState pointe sur G.wars[0]
    G.playerTension=10; G.aiTension=10;
    addLog('💥 Guerre populaire ! −2<i class=ri-morale></i> pour chaque camp.','red');
    _journalAuto(G.player.civ.name,'Guerre populaire forcée','−2 moral pour chaque camp',true);
  }else{
    addLog('💥 Guerre populaire entre '+offense.civ.emoji+' '+offense.civ.name+' et '
      +offenseur.civ.emoji+' '+offenseur.civ.name+' — −2<i class=ri-morale></i> pour chacune.','red');
    _journalAuto(offense.civ.name,'Guerre populaire forcée','contre '+offenseur.civ.name+' — −2 moral pour chaque camp',true);
  }
  return w;
}
/* Guerre populaire entre deux nations qu'AUCUN écran ne pilote : on déclare, et l'offensé frappe
   tout de suite une route de l'offenseur qui touche ses colonies. Même geste que la branche « IA
   offensée » ci-dessous, écrit sans supposer que la victime est le joueur local. */
function guerrePopulaireAuto(offense,offenseur){
  const w=guerrePopulaireEntre(offense,offenseur);
  if(!w)return null;
  const cible=offenseur.routes.find(r=>offense.colonies.some(c=>c.nodeId===r.from||c.nodeId===r.to));
  if(cible){
    cible.tokens=0; offenseur.forceTokens=Math.max(0,(offenseur.forceTokens||0)-1);
    updateConnections(offenseur);
    addLog('😡 '+offense.civ.emoji+' '+offense.civ.name+' neutralise une route de '+offenseur.civ.name
      +' : '+((NODES[cible.from]&&NODES[cible.from].name)||cible.from)+'→'+((NODES[cible.to]&&NODES[cible.to].name)||cible.to)+'.','red');
  }else{
    addLog('😡 '+offense.civ.emoji+' '+offense.civ.name+' lance des raids sur les frontières de '+offenseur.civ.name+'.','red');
  }
  return w;
}
/* Façade historique : « le joueur local, offensé ou offenseur, contre une IA ». Elle ajoute au noyau
   la fenêtre de choix, qui n'a de sens que pour quelqu'un qui regarde un écran. */
function triggerGuereeForcee(offendedSide,targetAi){
  const fwTargetAi=targetAi||(G.ais[0]);
  if(!fwTargetAi)return;
  const offense=(offendedSide==='player')?G.player:fwTargetAi;
  const offenseur=(offendedSide==='player')?fwTargetAi:G.player;
  if(!guerrePopulaireEntre(offense,offenseur))return;
  const fwAi=fwTargetAi;
  if(offendedSide==='player'){
    // Joueur offensé : montrer choix
    const aiAllRoutes=fwAi.routes.slice(); // toutes les routes (protégées ET non protégées)
    // La capitale ennemie EST une cible valable (10 jetons de garnison, plus imprenable) : on ne
    // l'exclut plus de la liste, sinon une nation réduite à sa capitale n'était plus attaquable.
    const _fwCols=fwAi.colonies.filter(c=>c.nodeId!==fwAi.civ.home);
    const nearestAiCol=(_fwCols.length?_fwCols:fwAi.colonies.slice()).reduce((best,c)=>{
      const d=G.player.colonies.reduce((md,pc)=>Math.min(md,getNodeDistance(pc.nodeId,c.nodeId)),99);
      return(!best||d<best.dist)?{col:c,dist:d}:best;
    },null);
    let choicesHtml=
      '<div class="fw-choice" onclick="forcedWarDemandPeace()">🕊️ Exiger la paix (tribut si ennemi faible, sinon la guerre continue)</div>'+
      (aiAllRoutes.length?aiAllRoutes.map((r,i)=>{const prot=(r.tokens||0)>=1;const need=prot?2:1;const can=(G.player.forceTokens||0)>=need;return `<div class="fw-choice" onclick="forcedWarChoiceRoute(${i})" style="${can?'':'opacity:.5'}">${prot?'🛡️':'🔓'} Attaquer route ${NODES[r.from]?.name||r.from}→${NODES[r.to]?.name||r.to} — ${need} jeton${need>1?'s':''}</div>`;}).join(''):'<div style="color:#5a6a8a;font-size:.82em">Aucune route ennemie.</div>')+
      (nearestAiCol?`<div class="fw-choice" onclick="forcedWarChoiceColony('${nearestAiCol.col.nodeId}')">🏗️ Attaquer colonie la plus proche : ${NODES[nearestAiCol.col.nodeId]?.name}</div>`:'');
    if(!aiAllRoutes.length&&!nearestAiCol)choicesHtml+='<div style="color:#5a6a8a;font-size:.82em;margin-top:6px">Aucune cible ennemie accessible.</div><div class="fw-choice" onclick="forcedWarNoTarget()">✖️ Passer — aucune cible, la pression populaire retombe</div>';
    G._forcedWarPending=true; // sérialiser : attendre le choix avant processAllWars
    /* La nation « offensée » n'est pas toujours quelqu'un qui regarde un écran : cette façade est
       appelée avec `G.player`, qui peut être une IA (partie tout-IA, ou après `_focusWar`). Elle
       choisit alors sa cible seule, par les MÊMES fonctions que le joueur : la colonie la plus
       proche si elle en a les moyens, sinon une route, sinon rien. */
    if(G.player&&G.player._isAI){
      G._forcedWarPending=false;
      const force=G.player.forceTokens||0;
      const routeAbordable=aiAllRoutes.findIndex(r=>force>=(((r.tokens||0)>=1)?2:1));
      if(nearestAiCol&&force>=1) forcedWarChoiceColony(nearestAiCol.col.nodeId);
      else if(routeAbordable>=0) forcedWarChoiceRoute(routeAbordable);
      else forcedWarNoTarget();
      return;
    }
    if(_decisionActive()){ // EN LIGNE : router le choix vers le joueur (sinon la modale ne s'affiche jamais côté serveur headless)
      const _rts=aiAllRoutes.map(function(r,i){return {i:i, name:(NODES[r.from]?.name||r.from)+'→'+(NODES[r.to]?.name||r.to), need:((r.tokens||0)>=1?2:1), prot:((r.tokens||0)>=1)};});
      _emitDecision('forced_war', G.player,
        {enemy:fwAi.civ.id, enemyName:fwAi.civ.name, routes:_rts,
         colTarget:(nearestAiCol?nearestAiCol.col.nodeId:null), colName:(nearestAiCol?(NODES[nearestAiCol.col.nodeId]?.name||nearestAiCol.col.nodeId):null),
         myForce:(G.player.forceTokens||0)},
        function(ans){
          try{
            if(ans&&ans.peace)forcedWarDemandPeace();
            else if(ans&&typeof ans.route==='number')forcedWarChoiceRoute(ans.route);
            else if(ans&&ans.colony)forcedWarChoiceColony(ans.colony);
            else forcedWarNoTarget();
          }catch(e){ try{forcedWarNoTarget();}catch(_){} }
        });
      return;
    }
    document.getElementById('fw-title').textContent='⚔️ Guerre Populaire contre '+fwAi.civ.emoji+' '+fwAi.civ.name+' !';
    document.getElementById('fw-desc').innerHTML='Tension à 10 envers '+fwAi.civ.emoji+' '+fwAi.civ.name+' : attaque une de ses routes ou colonies maintenant.';
    document.getElementById('fw-choices').innerHTML=choicesHtml;
    document.getElementById('forced-war-modal').classList.remove('hidden');
  }else{
    // IA offensée : attaque auto la route la plus gênante ou colonie la plus proche
    const playerRouteNearAI=G.player.routes.find(r=>{const a=fwAi.colonies.find(c=>c.nodeId===r.from||c.nodeId===r.to);return a;});
    if(playerRouteNearAI){
      playerRouteNearAI.tokens=0;G.player.forceTokens=Math.max(0,G.player.forceTokens-1);
      updateConnections(G.player);
      addLog('😡 L\'IA attaque ta route (guerre populaire) : '+NODES[playerRouteNearAI.from]?.name+'→'+NODES[playerRouteNearAI.to]?.name+' — route neutralisée, −1 jeton !','red');
    }else{
      addLog('😡 L\'IA lance des raids sur tes frontières (guerre populaire).','red');
    }
  }
}
function forcedWarChoiceRoute(idx){
  const fwcAi=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const r=fwcAi?fwcAi.routes[idx]:null;
  if(!r)return;
  const prot=(r.tokens||0)>=1;const need=prot?2:1;
  if((G.player.forceTokens||0)<need){addLog('⚠️ Il te faut '+need+' jeton'+(need>1?'s':'')+' Force pour cette route'+(prot?' (protégée)':'')+'.','red');return;} // garde la fenêtre ouverte
  G.player._attacksThisTurn=(G.player._attacksThisTurn||0)+1;
  document.getElementById('forced-war-modal').classList.add('hidden');
  G._pendingRouteAtk={ai:fwcAi, route:r, prot:prot, mode:'forced'}; // même modale récupérer/détruire que la fenêtre de combat
  showRouteCaptureModal(r, prot);
}
function forcedWarChoiceColony(nodeId){
  document.getElementById('forced-war-modal').classList.add('hidden');
  const fwcAi2=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  if(fwcAi2)halveTensions('player',fwcAi2.civ.id);
  G.playerTension=0;G.aiTension=0;
  // Plus de capture instantanée : on lance le VRAI combat (tu choisis tes jetons). La guerre populaire reprend après le combat.
  G._assaultThenSuite='stApresGuerrePopulaire'; // un NOM (la guerre populaire reprend ensuite son cours)
  playerAssaultColony(nodeId,fwcAi2);
}
function forcedWarDemandPeace(){
  document.getElementById('forced-war-modal').classList.add('hidden');
  const ai=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const weak=ai&&(ai.forceTokens||0)<=(G.player.forceTokens||0); // l'IA cède si elle n'est pas militairement supérieure
  if(ai&&weak){
    const tM=Math.min(2,ai.res.materials||0),tE=Math.min(2,ai.res.energy||0);
    ai.res.materials=Math.max(0,(ai.res.materials||0)-tM);ai.res.energy=Math.max(0,(ai.res.energy||0)-tE);
    const cap=(typeof getResCapFor==='function')?getResCapFor(G.player):{materials:9999,energy:9999};
    G.player.res.materials=Math.min(cap.materials,(G.player.res.materials||0)+tM);
    G.player.res.energy=Math.min(cap.energy,(G.player.res.energy||0)+tE);
    const _i=_warIndexBetween(_moiId(),ai.civ.id);if(_i>=0)G.wars.splice(_i,1);
    halveTensions('player',ai.civ.id);syncWarState();
    addLog('🕊️ '+ai.civ.emoji+' '+ai.civ.name+' cède à la pression et achète la paix : tribut +'+tM+' matériaux +'+tE+' énergie.','gold');
  }else if(ai){
    addLog('⚔️ '+ai.civ.emoji+' '+ai.civ.name+' refuse de payer — la guerre continue (pas de combat ce tour).','red');
  }
  G.playerTension=0;G.aiTension=0;
  if(!_guerrePopSuiteJouer())render();
}
// Filet de sécurité : guerre populaire sans aucune cible (pas de route protégée ni de colonie ennemie non-mère) → la pression retombe, on débloque.
function forcedWarNoTarget(){
  document.getElementById('forced-war-modal').classList.add('hidden');
  const fwId=G.warWith;
  if(fwId){const _i=_warIndexBetween(_moiId(),fwId);if(_i>=0)G.wars.splice(_i,1);halveTensions('player',fwId);syncWarState();}
  G.playerTension=0;G.aiTension=0;
  addLog('⚔️ Guerre populaire : aucune cible ennemie accessible — la pression retombe, pas d\'attaque.','dim');
  if(!_guerrePopSuiteJouer())render();
}
/* ============================================================ WAR ============================================================ */
function getContestedSegments(){
  const contested=[];
  for(const ai of G.ais){for(const pr of G.player.routes)for(const ar of ai.routes)if((pr.from===ar.from&&pr.to===ar.to)||(pr.from===ar.to&&pr.to===ar.from))contested.push({from:pr.from,to:pr.to});}
  return contested;
}
function updateWarRisk(){
  const segs=getContestedSegments();
  if(segs.length>0){G.warRisk=Math.min(10,G.warRisk+segs.length);addLog('⚠️ '+segs.length+' route(s) en conflit — risque +'+segs.length,'dim');}
  else if(G.warRisk>0&&!G.warState)G.warRisk=Math.max(0,G.warRisk-1);
  if(G.warRisk>=10&&!G.warState)declareWar('Tensions au maximum ('+G.warRisk+'/10) !');
}
/* ⚠️ `agresseurCiv` AJOUTÉ LE 2026-08-09 (défaut signalé par Marc sur la Sphère de Dyson).
   `declaredBy` est une ÉTIQUETTE relative au lecteur : `'player'` veut dire « moi », et pour la
   Sphère de Dyson l'étiquette était `'dyson'`, considérée comme « moi » PAR TOUT LE MONDE. Le test
   `declaredBy==='player'||declaredBy==='dyson'` rendait donc agresseur quiconque le lisait — la
   maladie de la perspective globale décrite dans docs/ARCHITECTURE_AVENIR.md §2.
   On mémorise maintenant l'agresseur par son IDENTIFIANT DE NATION. Une seule vérité, la même
   pour les quatre joueurs, et qui survit à une sauvegarde. */
/* ══════════ DÉCLARER LA GUERRE ENTRE DEUX NATIONS QUELCONQUES ══════════
   ⚠️ `declareWar` NE SAVAIT DÉCLARER QUE DES GUERRES IMPLIQUANT LA NATION ACTIVE. Elle construisait
   la guerre comme `{a: G.player.civ.id, b: cible}` et n'appliquait ses conséquences — accords
   révoqués, routes rompues, colonies extra-solaires perdues — QU'À `G.player`. Deux IA ne pouvaient
   donc pas se déclarer la guerre, et une IA ne pouvait pas la déclarer à un second joueur humain.
   Marc, 2026-08-15 : « elle doit pouvoir déclarer la guerre à tout le monde, autre IA, joueur actif
   et autres joueurs. »

   `declarerGuerre(agresseur, cible, raison)` ne connaît que deux nations. Elle applique les mêmes
   conséquences, mais SYMÉTRIQUEMENT et aux deux nations réellement concernées. `declareWar` reste
   comme façade pour tous ses appelants existants : elle traduit « moi contre X » en un appel
   nommé. */
function declarerGuerre(agresseur, cible, raison, declaredBy){
  if(!agresseur||!cible||agresseur===cible) return null;
  const A=agresseur.civ.id, B=cible.civ.id;
  if(_warBetween(A,B)) return null;                       // déjà en guerre : rien à faire
  /* ⚠️ LE PACTE PASSE AVANT TOUT — c'est ici qu'il prend corps. TOUTES les guerres du jeu passent
     par cette fonction : agression délibérée, guerre populaire à 10 de tension, refus de la Sphère
     de Dyson. Un seul point de passage, donc une seule garde, donc aucun chemin oublié. */
  if(typeof agressionInterditeEntre==='function'&&agressionInterditeEntre(agresseur,cible,true)) return null;
  const w=_attachWar({a:A,b:B,winsBy:{[A]:0,[B]:0},turnsLeft:99,justDeclared:true,
    reason:raison, declaredBy:declaredBy||'other', agresseurCiv:A, live:true, aiRecaptureTarget:null});
  w.focusColony=G._warFocusColony||null; G._warFocusColony=null;
  G.wars.push(w);
  /* Une nation à qui l'on déclare la guerre change de tempérament : elle riposte et s'arme avant
     tout, quel que soit son profil de temps de paix (voir `PROFILS_IA.assiegee`). */
  if(typeof marquerAgressee==='function'){ marquerAgressee(cible); marquerAgressee(agresseur); }
  if(typeof syncWarState==='function')syncWarState();
  // La tension reste au MAXIMUM des deux côtés pendant toute la guerre (endWar la halve à la fin).
  setTens(A,B,10); setTens(B,A,10);

  /* Accords commerciaux ENTRE CES DEUX NATIONS — et seulement eux. L'ancienne version révoquait
     tout accord posé sur une colonie de la cible, quel qu'en soit l'autre signataire. */
  const _rev=(G.commercialAccords||[]).filter(nid=>{
    const sg=(typeof _accordSignataires==='function')?_accordSignataires(nid):null;
    if(sg) return sg.includes(A)&&sg.includes(B);
    const o=(typeof ownerNation==='function')?ownerNation(nid):null;   // partie d'avant le registre
    return !!(o&&(o.civ.id===A||o.civ.id===B));
  });
  if(_rev.length){
    G.commercialAccords=G.commercialAccords.filter(nid=>!_rev.includes(nid));
    if(G.accordsParties)for(const n of _rev)delete G.accordsParties[n];
    addLog('📜 Accords commerciaux entre '+agresseur.civ.emoji+' '+agresseur.civ.name+' et '
      +cible.civ.emoji+' '+cible.civ.name+' révoqués ('+_rev.length+') !','red');
  }

  /* Cohabitation extra-solaire : chacun perd la colonie posée sur un nœud de l'autre. Symétrique —
     l'ancienne version ne faisait tomber que celles de la nation active. */
  for(const [x,y] of [[agresseur,cible],[cible,agresseur]]){
    const perdues=x.colonies.filter(c=>y.colonies.some(yc=>yc.nodeId===c.nodeId));
    if(perdues.length){
      x.colonies=x.colonies.filter(c=>!perdues.includes(c));
      if(typeof updateConnections==='function')updateConnections(x);
      addLog('💥 '+x.civ.emoji+' '+x.civ.name+' perd '+perdues.length+' colonie(s) Extra-Solaire sur le territoire de '
        +y.civ.emoji+' '+y.civ.name+' — la guerre rompt la cohabitation.','red');
    }
  }

  /* Routes traversant le territoire ennemi : rompues, jetons rendus. Des deux côtés. */
  for(const [x,y] of [[agresseur,cible],[cible,agresseur]]){
    const chezMoi=id=>x.colonies.some(c=>c.nodeId===id);
    const chezLui=id=>y.colonies.some(c=>c.nodeId===id);
    const cassees=[];
    x.routes=x.routes.filter(r=>{const br=(!chezMoi(r.from)&&!chezMoi(r.to))&&(chezLui(r.from)||chezLui(r.to));if(br)cassees.push(r);return !br;});
    if(cassees.length){
      let jetons=0; cassees.forEach(r=>jetons+=(r.tokens||0));
      if(jetons>0)x.forceTokens=(x.forceTokens||0)+jetons;
      if(typeof updateConnections==='function')updateConnections(x);
      addLog('🛤️ '+x.civ.emoji+' '+x.civ.name+' : '+cassees.length+' route(s) en territoire '+y.civ.name+' rompue(s)'
        +(jetons>0?' — '+jetons+' jeton(s) Force rendu(s)':'')+'.','red');
    }
  }
  /* ⚠️ L'USURE APRÈS L'ANNONCE, PAS AVANT. Elle était facturée quarante lignes plus haut, si bien
     que le journal montrait la punition AVANT son motif : partie 8B47, tour 7, Marc lisait deux
     « usure de guerre −4 » puis seulement « GUERRE DÉCLARÉE ». Un journal se lit dans l'ordre des
     causes. Le prélèvement lui-même est inchangé — « dès que la guerre est enclenchée au tour 1 ». */
  _usureDeGuerre(w);
  addLog('🚨 GUERRE DÉCLARÉE : '+agresseur.civ.emoji+' '+agresseur.civ.name+' contre '
    +cible.civ.emoji+' '+cible.civ.name+' — '+raison,'red');
  return w;
}
/* Façade historique : « MOI contre X ». Le vrai moteur est `declarerGuerre(agresseur,victime,…)`,
   qui ne connaît que deux nations nommées ; cette façade sert les dizaines d'appelants anciens qui
   ne savent dire qu'un camp.
   `declarant` : la nation qui parle. Sans lui, la nation active — ce qui reste juste en solo, et
   devient faux dès qu'un DEUXIÈME humain déclare une guerre : sans ce paramètre, la guerre était
   ouverte au nom de la personne devant cet écran, pas au nom de celle qui a cliqué. */
function declareWar(reason,declaredBy='other',aiId=null,agresseurCiv=null,declarant=null){
  const moi=declarant||G.player;
  if(!moi||!moi.civ)return;
  const _moi=moi.civ.id;
  /* ⚠️ TROIS REPLIS QUAND LA CIBLE N'EST PAS DONNÉE, du plus fiable au plus arbitraire :
       1. `G.warWith` — mais c'est le drapeau de l'écran LOCAL, donc valable pour lui seul ;
       2. une guerre réellement en cours impliquant `moi` — la bonne réponse dans presque tous les cas ;
       3. « la première autre nation ». Héritage du solo à deux nations : à quatre, c'est un tirage au
          sort. On le garde (des appelants anciens comptent dessus) mais on le NOMME, et il ne lit
          plus `G.ais` — sinon un deuxième humain n'était jamais une cible possible. */
  const _enGuerre=(G.wars||[]).find(w=>w&&(w.a===_moi||w.b===_moi));
  const _autre=allPlayers().find(n=>n&&n!==moi);
  const _replis=(moi===G.player?G.warWith:null)
    ||(_enGuerre?((_enGuerre.a===_moi)?_enGuerre.b:_enGuerre.a):null)
    ||(_autre&&_autre.civ.id);
  const tgtId=aiId||_replis;
  if(!tgtId||tgtId===_moi)return;
  const cible=allPlayers().find(n=>n.civ.id===tgtId);
  if(!cible)return;
  /* Qui est l'agresseur ? `'player'` = celui qui déclare, sinon la cible — comme avant. */
  const agrId=agresseurCiv||((declaredBy==='player')?_moi:tgtId);
  const agresseur=allPlayers().find(n=>n.civ.id===agrId)||moi;
  const victime=(agresseur===moi)?cible:moi;
  const w=declarerGuerre(agresseur,victime,reason,declaredBy);
  if(!w)return;
  G._warDeclareReason=reason;G._warDeclaredBy=declaredBy;
}

/* ─── LE JOURNAL DE COMBAT : TOUT CE QUI A ÉTÉ DÉPENSÉ, DES DEUX CÔTÉS ────────
   Demande de Marc (2026-08-08) : « les jetons et ressources dépensées dans la guerre par les deux
   parties devraient figurer dans le journal », avec les technologies possédées « pour qu'on puisse
   savoir si quelque chose bugue ».
   Le journal disait bien « X engage N jetons », mais jamais : ce qui est REVENU, ce qui est PERDU
   pour de bon, d'où venait la puissance affichée (garnison, supercroiseur, bonus empathes), ni quelle
   technologie modifiait le calcul. Impossible, en relisant un log, de dire si un chiffre était juste.
   Maintenant chaque combat écrit une ligne par camp, et la ligne se suffit à elle-même. */
/* ⚠️ CETTE LIGNE A COÛTÉ DEUX COLONIES À MARC. Elle annonçait « Supercroiseur » dès que la
   technologie était POSSÉDÉE et hors récupération — jamais elle ne regardait s'il était ARMÉ dans ce
   combat-ci. Son journal du 16/08 affiche donc, deux fois de suite :

       « puissance 2 · techs : Navigation (coût ÷2), IA Défensive, Supercroiseur »   → défaite 2 vs 3

   Deux et non sept : le +5 n'était pas là. Il a engagé deux jetons contre trois en croyant en avoir
   sept, parce que le récapitulatif nommait une force qui ne combattait pas. Un affichage qui ment
   sur la puissance engagée est pire qu'un affichage absent : il fait prendre la mauvaise décision
   avec confiance. Le second argument dit s'il a réellement été déployé. */
function _techsCombat(p, croiseurArme){
  if(!p) return [];
  const t=[];
  if(hasSpec(p,'nav2_war')) t.push('Navigation (coût ÷2)');
  if(hasSpec(p,'empath_routes')) t.push('Lien Empathe (+2⚔️)');
  if(hasSpec(p,'empath_tele')) t.push('Télépathie (+2⚔️)');
  if(hasSpec(p,'ia_immune')) t.push('IA Défensive');
  if(croiseurArme) t.push('Supercroiseur DÉPLOYÉ (+'+(p.cruiserPower||5)+'⚔️)');
  else if(typeof cruiserAvailable==='function'&&cruiserAvailable(p)) t.push('Supercroiseur au port (non déployé)');
  return t;
}
/* Une ligne de journal par camp. `engages` = jetons mis dans la bataille ; `gagne` = ce camp l'a-t-il
   emporté (détermine si la moitié revient tout de suite ou est perdue). */
function journalCombat(p,engages,gagne,puissance,detailPuissance,croiseurArme){
  if(!p) return;
  const e=Math.max(0,engages|0);
  const demi=(typeof hasSpec==='function'&&hasSpec(p,'nav2_war'));
  const cM=demi?Math.floor(e/2):e, cE=demi?Math.ceil(e/2):e;
  const recup=e>0?Math.floor(e/2):0;
  const sort=gagne ? (e-recup)+' revenu(s) tout de suite, '+recup+' en récupération'
                   : recup+' PERDU(S) définitivement, '+(e-recup)+' en récupération';
  const techs=_techsCombat(p,croiseurArme);
  addLog('📊 '+p.civ.emoji+' '+p.civ.name+' — '+e+' jeton(s) engagé(s) · coût −'+cM+'<i class=ri-materials></i> −'+cE+'<i class=ri-energy></i>'
    +' · puissance '+puissance+(detailPuissance?' ('+detailPuissance+')':'')
    +' · jetons : '+sort
    +(techs.length?' · techs : '+techs.join(', '):' · aucune tech de combat'),'dim');
}
/* ─── DÉFENSE D'UNE NATION TENUE PAR L'ORDINATEUR ──────────────────────────────
   Règle posée par Marc le 2026-08-08. Elle remplace `min(jetons, matériaux, énergie)` — qui
   engageait TOUT, sans jamais regarder la menace : une nation se ruinait contre une attaque d'un
   seul jeton, et abandonnait une colonie vitale dès qu'il lui manquait un matériau.

   Ce qu'elle sait de l'ennemi :
     · avec RÉSEAU ORBITAL (`intel_2`) → la force EXACTE ; elle place le juste nécessaire ;
     · sans → l'estimation à ±3 du menu Empire. Elle SURÉVALUE (+3) pour ce qui compte — capitale et
       niveau 3 — et SOUS-évalue (−3) pour le reste, quitte à perdre une colonie mineure.

   Ce qu'elle engage :
     · capitale  : estimation MOINS les 10 jetons de garnison automatique — donc souvent rien. Sans
                   cette soustraction, une capitale deviendrait imprenable et la règle « on peut
                   assaillir une capitale » redeviendrait théorique ;
     · niveau 3  : la force ennemie estimée ;
     · niveau 2  : la moitié ;
     · niveau 1  : 2 jetons ;
     · 2 colonies ou moins : tout ce qu'elle peut payer — dos au mur, on ne calcule plus.
   Et si elle ne peut pas atteindre ce chiffre, elle engage quand même la MOITIÉ de ce qu'elle peut
   payer : mieux vaut faire saigner l'assaillant que céder gratuitement. */
function defenseIA(def, atk, nodeId){
  if(!def||!def.civ) return 0;
  const payable=Math.max(0,Math.min(def.forceTokens||0, def.res.materials||0, def.res.energy||0));
  if(payable<=0) return 0;
  const cols=def.colonies||[];
  if(cols.length<=2) return payable;                       // dos au mur
  const col=cols.find(c=>c.nodeId===nodeId);
  const niveau=col?(col.level||1):1;
  const capitale=(nodeId===def.civ.home);
  let est=0, exact=false;
  try{ const pf=perceivedForce(def,atk); est=pf.val||0; exact=!!pf.exact; }catch(e){ est=(atk&&atk.forceTokens)||0; }
  let cible;
  if(capitale)      cible=Math.max(0,(exact?est:est+3)-10);   // la garnison de 10 fait déjà le gros du travail
  else if(niveau>=3)cible=(exact?est:est+3);
  else if(niveau===2)cible=Math.ceil((exact?est:Math.max(0,est-3))/2);
  else              cible=2;
  if(cible<=payable) return Math.max(0,Math.min(cible,payable));
  return Math.floor(payable/2);                            // hors de portée : on fait saigner
}
/* ═══════ CE QUE COÛTERA VRAIMENT UN ASSAUT — L'ARITHMÉTIQUE QUE L'IA IGNORAIT ═══════
   Marc, partie du 16/08 (4 joueurs) : « les IA gèrent très mal la guerre ». Le journal donnait le
   chiffre exact, cinq fois de suite :

       2⚔️ vs 2🛡️ · 1⚔️ vs 1🛡️ · 4⚔️ vs 4🛡️ · 2⚔️ vs 2🛡️ · 4⚔️ vs 4🛡️

   Cinq assauts, cinq égalités parfaites, cinq défaites — et 13 jetons perdus. Ce n'est pas de la
   malchance : la victoire exige `aPow > dPow` (l'égalité revient au défenseur), alors que l'IA
   choisissait sa cible en comparant ses jetons à `perceivedForce(ai,r).val` — la force de la NATION.
   Or la défense d'une COLONIE, telle que le combat la calcule quelques lignes plus bas, vaut :

       jetons engagés + bonus de combat du défenseur + 1 (garnison) + renforts des cohabitants

   Trois termes manquaient donc à l'estimation, dont la garnison qui est toujours là. L'IA visait
   systématiquement la parité, c'est-à-dire la défaite.

   ⚠️ CETTE FONCTION NE TRICHE PAS. Elle passe par `perceivedForce`, qui ne rend un chiffre exact
   qu'avec le Réseau Orbital ; sans renseignement on majore d'un jeton plutôt que de lire `r.res`.
   Les technologies, elles, sont publiques (c'est ce que l'espionnage donne à voir) : leur bonus de
   combat entre légitimement dans le calcul.

   Elle sert à DEUX endroits — le choix de la cible et le calcul de l'utilité. Les corriger
   séparément est la faute déjà commise sur l'adjacence et sur la portée de colonisation : le
   correctif appliqué au seul exécutant ne change rien, l'action n'étant jamais jugée digne d'être
   tentée. */
/* ═══ L'ESTIMATION DOIT SE CALCULER COMME LE COMBAT, SINON ELLE INTERDIT DES VICTOIRES ═══
   ⚠️ DÉFAUT MESURÉ (partie DF6A, Marc 2026-08-25 : « au lieu de conquérir une colonie le système
   les bloque… du coup je ne vois pas de fenêtre de combat pour me défendre, et entre IA pareil »).

   Cette fonction comptait TOUS les jetons du défenseur. Le combat, lui, n'en retient que ce qu'il
   peut PAYER : `dCommit = min(jetons, matériaux, énergie)`, un jeton coûtant 1🪨 + 1⚡. Une nation
   avec huit jetons et zéro énergie défend donc avec sa seule garnison — mais elle était estimée à
   neuf. Le `+1` d'incertitude aggravait encore l'écart.

   MESURÉ sur 8 parties tout-ordinateur, avant correction :
     · 54 cibles évaluées, 40 défenses SURESTIMÉES, écart moyen +3,4 ;
     · 26 assauts refusés que l'IA aurait GAGNÉS — contre 21 autorisés.
   Autrement dit : plus d'une conquête possible sur deux était interdite par une addition fausse.
   D'où ce que Marc voit à l'écran — les IA renoncent, aucune fenêtre de défense ne s'ouvre jamais,
   et lui n'a rien à défendre.

   ⚠️ ON NE DESSERRE PAS LA RÈGLE, ON CORRIGE LE CALCUL. « Ne pas lancer un assaut perdu d'avance »
   reste vrai et reste appliqué : c'est l'estimation de la défense qui devient exacte. La prudence
   sans arithmétique juste n'est pas de la prudence, c'est de la paralysie. */
function defenseAttendue(ai, cible, nodeId){
  if(!ai||!cible) return 99;
  let jetons=0, exact=false;
  try{ const pf=perceivedForce(ai,cible); jetons=pf.val||0; exact=!!pf.exact; }catch(e){ jetons=cible.forceTokens||0; }
  if(!exact) jetons+=1;                        // sans renseignement, on prévoit un jeton de plus
  /* ⚠️ LE PLAFOND DE PAYABILITÉ NE S'APPLIQUE QU'AVEC LE RENSEIGNEMENT — ET C'EST UNE RÈGLE, PAS
     UNE PRUDENCE. Un jeton coûte 1🪨 + 1⚡ : `min(matériaux, énergie)` borne ce que le défenseur
     peut réellement aligner, exactement comme le calcule le combat (`dCommit`). Mais les STOCKS
     d'une rivale sont cachés (§14.7 des règles) : les lire sans Réseau Orbital serait de la triche,
     et retirerait tout intérêt à cette technologie. `_assaultAIUtil` pose déjà cette limite noir sur
     blanc pour la doctrine « frapper qui ne peut plus se défendre » ; la même limite vaut ici.

     ⚠️ PREMIÈRE VERSION DE CE CORRECTIF : PLAFOND INCONDITIONNEL. Elle réparait bien la paralysie
     — 21 assauts autorisés sur 54 évaluations, contre 78 sur 96 après — mais en donnant à TOUTES
     les IA une vision parfaite des coffres adverses. `test_equivalence.js` l'a attrapée en montrant
     une partie dont l'issue changeait selon la nation active, et la relecture a montré pourquoi :
     l'IA jouait avec une information qu'aucune règle ne lui accorde. Une correction qui fait
     tricher n'est pas une correction. */
  if(exact) jetons=Math.max(0,Math.min(jetons, Math.min(cible.res&&cible.res.materials||0, cible.res&&cible.res.energy||0)));
  let renfort=0;
  try{
    for(const co of defenseursDuNoeud(nodeId, ai)){
      if(co===cible) continue;
      renfort+=Math.max(0,Math.min(co.forceTokens||0, co.res.materials||0, co.res.energy||0))
              +((typeof bonusCombatCartes==='function')?bonusCombatCartes(co):0);
    }
  }catch(e){}
  const dEmpath=(typeof bonusCombatCartes==='function')?bonusCombatCartes(cible):0;
  return jetons+dEmpath+1/*garnison*/+renfort;
}
/* ═══════ UN TOUR DE GUERRE SE DÉCOMPTE UNE FOIS PAR TOUR, PAS UNE FOIS PAR COMBAT ═══════
   Depuis que la fin de tour porte DEUX combats (l'assaut de chacun), ce décompte serait appelé
   deux fois dans la même soirée : une guerre de deux tours s'achèverait au milieu du second, et le
   compteur « tour de guerre 1/2 » affiché au joueur mentirait. On garde donc le décompte là où il
   est — c'est le seul endroit qui sache qu'un combat a vraiment eu lieu — mais on le rend
   IDEMPOTENT dans le tour, en retenant le numéro de tour déjà décompté. */
function _decompterTourDeGuerre(){
  const w=_warBetween(_moiId(),G.warWith);
  if(w){ if(w._tourDecompte!==G.turn){ w._tourDecompte=G.turn; w.turnsLeft--; } G.warTurnsLeft=w.turnsLeft; }
  else G.warTurnsLeft--;
}
/* ═══════════════ QUI SE BAT ? LA FONCTION NE LE SAVAIT PAS ═══════════════
   ⚠️ CETTE FONCTION LISAIT `G.player` DIX-HUIT FOIS — c'est-à-dire « la nation actuellement
   affichée », et non « celle qui livre ce combat ». En solo les deux coïncident toujours ; à
   quatre nations, elles ne coïncident que si le serveur a pensé à faire tourner `G.player` juste
   avant. C'est la maladie décrite dans `ARCHITECTURE_AVENIR.md`, et elle a produit à elle seule les
   trois défauts les plus graves d'août : l'assaut qui ne faisait rien contre un humain, l'accord
   d'autrui affiché comme le mien, la tension gelée pour tout le monde.

   ON NE CHANGE PAS LE COMPORTEMENT, ON REND LA DÉPENDANCE VISIBLE ET FACULTATIVE. La nation est
   désormais un ARGUMENT ; sans lui on retombe sur `G.player`, et tous les appels existants se
   comportent exactement comme avant (c'est ce que vérifie `mesure_equivalence.js`). Mais un
   appelant qui sait de qui il parle peut désormais le DIRE, au lieu d'espérer que la variable
   globale soit bien orientée au bon moment.

   ⚠️ `G.warWins.player` N'EST PAS UNE PERSPECTIVE : c'est une clé de compteur, littéralement le
   mot « player ». Elle n'est pas touchée — la renommer obligerait à migrer les sauvegardes.
   ═══════════════════════════════════════════════════════════════════════ */
function resolveWarCombat(playerCommitted, attaquant){
  const _atk=attaquant||G.player;
  /* L'adversaire se déduit de l'ATTAQUANT, plus de `G.ais` — une liste qui dépend elle aussi de qui
     est « actif ». On retombe sur `G.warWith` seulement si cette nation n'a pas de guerre connue. */
  const warEnemy=(function(){
    /* ═══ AVEC DEUX GUERRES OUVERTES, ON SE BATTAIT CONTRE LA MAUVAISE NATION ═══
       ⚠️ DÉFAUT DE LA PARTIE F8D7. `_warOf(civ)` rend LA PREMIÈRE guerre trouvée pour cette nation.
       Marc était en guerre contre les Martiens depuis le tour 8 ET contre les Ceinturiens depuis le
       tour 9. En assaillant Triton — colonie ceinturienne — le combat s'est résolu contre les
       MARTIENS : le compte rendu les nomme (« 📊 🔴 Martiens … puissance 3 »), leur garnison a
       défendu, et la colonie visée, introuvable chez eux, n'a jamais changé de main. Trois victoires
       sur Triton (T9 puis T10), trois fois « +2 VP » et rien d'autre. De l'extérieur cela ressemble
       à « la colonie revient à sa nation » ; en réalité on gagnait contre quelqu'un d'autre.

       L'ADVERSAIRE D'UN COMBAT SE DÉDUIT DE LA CIBLE, pas de l'ordre du tableau des guerres.
       Ordre de préférence : qui défend le nœud visé (s'il y a guerre avec lui) · la guerre désignée
       par `G.warWith` · à défaut seulement, la première guerre trouvée. */
    const _estEnGuerre=n=>!!(n&&n!==_atk&&typeof _warBetween==='function'&&_warBetween(_atk.civ.id,n.civ.id));
    const _tousSaufMoi=()=>allPlayers().filter(n=>n&&n!==_atk);
    // 1) le défenseur du nœud visé
    try{
      const _cible=_warAttackColonyTarget;
      if(_cible){
        const _def=(typeof defenseurPrincipal==='function')?defenseurPrincipal(_cible,_atk):null;
        if(_estEnGuerre(_def)) return _def;
        const _occ=_tousSaufMoi().find(n=>_estEnGuerre(n)&&(n.colonies||[]).some(c=>c.nodeId===_cible));
        if(_occ) return _occ;
      }
    }catch(e){}
    // 2) la guerre explicitement désignée par l'écran
    const _dit=_tousSaufMoi().find(n=>n.civ.id===G.warWith);
    if(_estEnGuerre(_dit)) return _dit;
    // 3) repli historique
    let id=null;
    try{ const w=_warOf(_atk.civ.id); if(w) id=_warOther(w,_atk.civ.id); }catch(e){}
    const cible=id||G.warWith;
    return allPlayers().find(n=>n!==_atk&&n.civ.id===cible)||allPlayers().find(n=>n!==_atk)||G.ais[0];
  })();
  const pBonus=(_atk.stratBonus&&_atk.stratBonus.combatBonus)||0;
  const pEmpathBonus=bonusCombatCartes(_atk);
  const aEmpathBonus=bonusCombatCartes(warEnemy);
  // On ne peut engager QUE ce qu'on possède ET ce qu'on peut PAYER (1🪨 +1⚡ par jeton — règle §14).
  // Sans ce plafond, on pouvait « engager » 15 jetons sans en avoir les moyens (bug signalé par Marc).
  let engagedP=(playerCommitted!==undefined)?playerCommitted:_atk.forceTokens;
  /* Le croiseur est décidé AVANT le plafond : ce qu'il coûte n'est plus engageable en jetons. */
  {const _cruPrevu=!!G._cruiserDeployed&&cruiserAvailable(_atk)&&cruiserAfford(_atk);
   const _cap=Math.max(0,Math.min(_atk.forceTokens||0,maxAffordableTokens(_atk,reserveCroiseur(_atk,_cruPrevu))));
   if(engagedP>_cap){ addLog('⚠️ Engagement réduit à '+_cap+' jeton(s) — tu ne peux engager que ce que tu peux PAYER'
     +(_cruPrevu?', Supercroiseur compris':'')+'.','red'); engagedP=_cap; }}
  const _cruOn=!!G._cruiserDeployed&&cruiserAvailable(_atk)&&cruiserAfford(_atk);G._cruiserDeployed=false;
  if(_cruOn){const _cc=cruiserPay(_atk);addLog('⚓ Supercroiseur déployé (+'+(_atk.cruiserPower||5)+'⚔️, '+_cc+').','gold');}
  const pPow=engagedP+pBonus+pEmpathBonus+(_cruOn?(_atk.cruiserPower||5):0); // Supercroiseur : +5 si déployé ce combat
  let aiEngaged=(G._aiWarCommitted!==undefined)?G._aiWarCommitted:Math.ceil((warEnemy.forceTokens||0)*0.7);
  aiEngaged=Math.min(aiEngaged,warEnemy.forceTokens||0,warEnemy.res.materials||0,warEnemy.res.energy||0); // ne peut engager que ce qu'il peut PAYER (1🪨+1⚡/jeton)
  const _aiCru=cruiserAvailable(warEnemy)&&cruiserAfford(warEnemy); // l'IA déploie son Supercroiseur en défense si possédé et payable
  if(_aiCru){const _cc=cruiserPay(warEnemy);addLog('⚓ '+warEnemy.civ.emoji+' '+warEnemy.civ.name+' déploie son Supercroiseur en défense (+'+(warEnemy.cruiserPower||5)+'⚔️, '+_cc+').','dim');}
  // COLONIE MÈRE (règle Marc) : la capitale est automatiquement défendue par 10 jetons de la nation.
  // Elle reste donc prenable, mais au prix d'un vrai assaut (avant : imprenable « en théorie », en pratique
  // capturée pour 1 jeton → nation à 0 colonie et partie bloquée).
  const _homeDef=(_warAttackColonyTarget&&warEnemy&&_warAttackColonyTarget===warEnemy.civ.home)?10:0;
  if(_homeDef)addLog('🏛️ Capitale '+(NODES[_warAttackColonyTarget]?.name||'')+' : défense automatique de 10 jetons.','dim');
  /* RENFORT DES COHABITANTS (règle Marc, 2026-08-14) : « les deux défendent ensemble ». On attaque
     un LIEU, pas une nation. Si un nœud extra-solaire est partagé, l'occupant qui n'est pas la cible
     officielle de la guerre prête quand même main-forte : ses jetons engageables et ses bonus de
     cartes s'ajoutent à la défense. En contrepartie, s'il perd, il est expulsé lui aussi
     (`capturerNoeud`). */
  let _renfort=0;
  if(_warAttackColonyTarget){
    for(const _co of defenseursDuNoeud(_warAttackColonyTarget,_atk)){
      if(_co===warEnemy)continue;
      const _j=Math.max(0,Math.min(_co.forceTokens||0,_co.res.materials||0,_co.res.energy||0));
      const _b=(typeof bonusCombatCartes==='function')?bonusCombatCartes(_co):0;
      if(_j+_b<=0)continue;
      _renfort+=_j+_b;
      if(typeof applyCombatEngage==='function')applyCombatEngage(_co,_j,false); // il se bat vraiment : ses jetons partent
      addLog('🤝 '+_co.civ.emoji+' '+_co.civ.name+' défend '+((NODES[_warAttackColonyTarget]&&NODES[_warAttackColonyTarget].name)||_warAttackColonyTarget)
        +' aux côtés de '+warEnemy.civ.emoji+' '+warEnemy.civ.name+' (+'+(_j+_b)+'⚔️) — cohabitants.','gold');
    }
  }
  const aPow=aiEngaged+aEmpathBonus+(_aiCru?(warEnemy.cruiserPower||5):0)+garrisonOf(warEnemy,_warAttackColonyTarget)+_renfort; // garnison auto : 1 colonie / 10 base
  G._aiWarCommitted=undefined;
  // Coût + récupération SYMÉTRIQUES (attaque ET défense) : 1<i class=ri-materials></i> +1<i class=ri-energy></i> par jeton engagé, jetons immobilisés (récupération / moitié perdue si défaite).
  const targetAvantNettoyage=_warAttackColonyTarget;   // mémorisée : elle est effacée plus bas, or le journal en a besoin
  const pWin=pPow>aPow,aWin=aPow>pPow;
  // RÈGLE §14 : le coût est de 1🪨 +1⚡ PAR JETON ENGAGÉ — pas « par jeton adverse en défense ».
  // L'ancienne formule (min(engagés, défense+1)) rendait les assauts massifs QUASI GRATUITS : engager
  // 15 jetons contre un ennemi sans défense ne coûtait qu'1 jeton (bug signalé par Marc). Les jetons
  // engagés quittent le pool ; en cas de VICTOIRE la moitié revient tout de suite (cf. applyCombatEngage).
  const _atkUsed=engagedP;
  /* ⚠️ CES DEUX ANNONCES IGNORAIENT « IA DE NAVIGATION » (coût de guerre divisé par deux).
     Dans le log de Marc : « Coût combat : 19 jetons (−19🪨 −19⚡) » alors que 9🪨 et 10⚡ étaient
     réellement prélevés. Le journal annonçait donc un prix qu'il ne payait pas — de quoi croire à
     un défaut de comptabilité alors que le prélèvement, lui, était juste. On calcule ici EXACTEMENT
     ce que `applyCombatEngage` va retirer : moitié arrondie en bas sur les matériaux, en haut sur
     l'énergie (la demi-part est toujours portée par l'énergie). */
  const _prix=(p,e)=>{const h=(typeof hasSpec==='function'&&hasSpec(p,'nav2_war'));
    return {m:h?Math.floor(e/2):e, e:h?Math.ceil(e/2):e, demi:h};};
  if(engagedP>0){const _c=_prix(_atk,_atkUsed);
    addLog('⚔️ Coût combat (toi) : '+_atkUsed+' jeton(s) engagé(s) — −'+_c.m+'<i class=ri-materials></i> −'+_c.e+'<i class=ri-energy></i>'+(_c.demi?' (IA de Navigation : coût divisé par deux)':''),'dim');}
  if(aiEngaged>0){const _d=_prix(warEnemy,aiEngaged);
    addLog('🛡️ '+warEnemy.civ.emoji+' '+warEnemy.civ.name+' engage '+aiEngaged+' jeton(s) en défense (−'+_d.m+'<i class=ri-materials></i> −'+_d.e+'<i class=ri-energy></i>'+(_d.demi?', coût divisé par deux':'')+').','dim');}
  if(engagedP>0)applyCombatEngage(_atk,_atkUsed,!aWin); // coût + récupération pour _atkUsed jetons (la garnison compte toujours comme défense)
  applyCombatEngage(warEnemy,aiEngaged,!pWin);
  /* LE COMPTE RENDU, DES DEUX CÔTÉS. Écrit APRÈS l'application des coûts : les nombres tracés sont
     donc ceux qui ont réellement été prélevés, pas une prévision. */
  try{
    const _dp=[]; if(pBonus)_dp.push('+'+pBonus+' stratégie'); if(pEmpathBonus)_dp.push('+'+pEmpathBonus+' empathes'); if(_cruOn)_dp.push('+'+(_atk.cruiserPower||5)+' supercroiseur');
    journalCombat(_atk,_atkUsed,!aWin,pPow,_dp.join(' '),_cruOn);
    const _dd=[]; if(aEmpathBonus)_dd.push('+'+aEmpathBonus+' empathes'); if(_aiCru)_dd.push('+'+(warEnemy.cruiserPower||5)+' supercroiseur');
    /* ⚠️ MON PROPRE DÉFAUT, VU DANS LE LOG : « puissance 18 (+10 garnison +10 capitale) » — 8+10+10
       ferait 28, pas 18. `garrisonOf` rend DÉJÀ 10 pour une capitale ; j'affichais la même garnison
       deux fois. La puissance calculée était juste, c'est l'explication qui était fausse — le pire
       cas pour qui relit un log en cherchant une anomalie. */
    const _gar=(typeof garrisonOf==='function')?garrisonOf(warEnemy,targetAvantNettoyage):0;
    if(_gar)_dd.push('+'+_gar+(_homeDef?' garnison de capitale':' garnison'));
    journalCombat(warEnemy,aiEngaged,!pWin,aPow,_dd.join(' '),_aiCru);
  }catch(e){}
  _decompterTourDeGuerre();let txt,cls;
  const targetId=_warAttackColonyTarget;_warAttackColonyTarget=null;
  if(pPow>aPow){
    G.warWins.player++;gagnerVP(_atk,2,'Combat gagné contre '+warEnemy.civ.name);warEnemy.res.morale=Math.max(0,(warEnemy.res.morale||0)-1);
    if(_aiCru)warEnemy.cruiserCooldown=getCooldownTurn(warEnemy); // croiseur IA en réparation suite à la défaite en défense
    // (jetons : coût + récupération gérés par applyCombatEngage ci-dessus, symétrique attaque/défense)
    // Appliquer les dégâts sur la colonie ciblée
    if(targetId){
      /* ═══ FILET DE SÉCURITÉ : LE NŒUD VISÉ PEUT N'ÊTRE À PERSONNE DE NOMMÉ ═══
         ⚠️ CE N'EST PAS LA CAUSE DU DÉFAUT F8D7, ET IL FAUT LE DIRE. La vraie cause est trente
         lignes plus haut : avec deux guerres ouvertes, `warEnemy` désignait la mauvaise nation
         (voir le bandeau de `resolveWarCombat`). Une fois l'adversaire correctement déduit de la
         CIBLE, il possède le nœud et cette recherche élargie ne sert plus.
         On la garde pour le cas résiduel : un nœud partagé dont aucun occupant n'est en guerre avec
         l'assaillant — `warEnemy` retombe alors sur un repli, et sans ce filet la victoire ne
         donnerait à nouveau que des points. `capturerNoeud` sait expulser tous les occupants ;
         c'est le seul endroit qui doive le savoir. */
      let _proprio=warEnemy.colonies.some(c=>c.nodeId===targetId)?warEnemy:null;
      if(!_proprio) _proprio=(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[]))
        .find(n=>n&&n!==_atk&&(n.colonies||[]).some(c=>c.nodeId===targetId))||null;
      if(_proprio){
        // CAPTURE (memo #10/#15) : la colonie change de propriétaire sur victoire
        _proprio.forceTokens=Math.max(0,(_proprio.forceTokens||0)-1); // le jeton de GARNISON de la colonie perdue est DÉTRUIT (il a défendu et péri)
        addLog('💥 Jeton de garnison de '+NODES[targetId].name+' détruit dans la défense.','dim');
        /* ⚠️ LE MORAL DE L'ABANDON FORCÉ EST MAINTENANT DANS `capturerNoeud`, qui l'applique à CHAQUE
           nation expulsée — cohabitants compris. Le laisser ici aussi le comptait deux fois : le
           perdant tombait de −3 au lieu de −2, et `test_guerre_complete.js` l'a vu tout de suite. */
        /* La capture est écrite UNE SEULE FOIS (`capturerNoeud`) : elle expulse tous les occupants,
           lève le bridage d'une colonie partagée et fait tomber l'accord forcé. */
        const newLvl=capturerNoeud(_atk,targetId);
        txt='🏴 Victoire ! Tu CAPTURES '+NODES[targetId].name+' (Nv.'+newLvl+') — elle est à toi ! (+2 VP, population hostile −2<i class=ri-morale></i>)';
        addLog('🏴 '+NODES[targetId].name+' capturée sur '+_proprio.civ.emoji+' '+_proprio.civ.name+' ! (Nv.'+newLvl+', −2<i class=ri-morale></i> ennemi)','gold');
      }else{txt='Victoire ! (+2 VP, IA −2 jetons, −1<i class=ri-morale></i>)';addLog('⚔️ Combat : victoire ('+pPow+' vs '+aPow+') +2 VP','gold');}
    }else{txt='Victoire ! (+2 VP, IA −2 jetons, −1<i class=ri-morale></i>)';addLog('⚔️ Combat : victoire ('+pPow+' vs '+aPow+') +2 VP','gold');}
    cls='win';
  }
  else if(aPow>pPow){
    G.warWins.ai++;gagnerVP(warEnemy,2,'Combat gagné contre '+_atk.civ.name);_atk.res.morale=Math.max(0,(_atk.res.morale||0)-1);
    if(_cruOn){_atk.cruiserCooldown=getCooldownTurn(_atk);addLog('⚓ Supercroiseur en réparation (récupération) suite à la défaite — pas perdu.','dim');}
    txt='Défaite. (IA +2 VP — jetons engagés immobilisés, moitié perdue, −1<i class=ri-morale></i>)';cls='loss';
    addLog('⚔️ Combat : défaite ('+pPow+' vs '+aPow+')','red');
  }
  else{_atk.res.morale=Math.max(0,(_atk.res.morale||0)-1);warEnemy.res.morale=Math.max(0,(warEnemy.res.morale||0)-1);txt='Égalité — −1<i class=ri-morale></i> pour les deux.';cls='draw';addLog('⚔️ Égalité','dim');}
  return{pPow,aPow,txt,cls};
}
function _isWithinDistance(targetId,player,maxDist){
  const visited=new Set(player.colonies.map(c=>c.nodeId));
  let frontier=player.colonies.map(c=>c.nodeId);
  for(let d=0;d<maxDist;d++){
    const next=[];
    for(const n of frontier){for(const adj of(NODES[n]?.conn||[])){if(adj===targetId)return true;if(!visited.has(adj)){visited.add(adj);next.push(adj);}}}
    frontier=next;
  }
  return false;
}
function doPostWarColonize(nodeId){
  const p=G.player;const node=NODES[nodeId];
  const matCost=2,enCost=1;
  G._postWarColonizeOffer=null;
  if((p.res.materials||0)<matCost||(p.res.energy||0)<enCost){
    addLog('⚠️ Ressources insuffisantes pour coloniser '+node.name+'.','red');
    render();dismissWarModal();return;
  }
  p.res.materials-=matCost;p.res.energy-=enCost;
  const connected=checkConnected(nodeId,p);
  p.colonies.push({nodeId,level:1,connected});updateConnections(p);
  addLog('🏗️ Butin de guerre : tu colonises '+node.name+' !','gold');
  render();dismissWarModal();
}
function endWar(aiId){
  const ewAiId=aiId||G.warWith;
  const idx=_warIndexBetween(_moiId(),ewAiId);
  if(idx<0){syncWarState();return null;}
  const war=G.wars.splice(idx,1)[0];
  const warEnemyEW=G.ais.find(a=>a.civ.id===ewAiId)||G.ais[0];
  let txt,cls;
  if(war.wins.player>war.wins.ai){
    // Joueur gagne : +1<i class=ri-morale></i>. Tension du gagnant → 0, du perdant → 5. (Plus de +VP ni perte de colonie.)
    G.player.res.morale=Math.min(8,(G.player.res.morale||0)+1);
    if(ewAiId){setTens('player',ewAiId,0);setTens(ewAiId,'player',5);}
    G.warRisk=Math.max(0,G.warRisk-6);
    txt='🏆 Guerre gagnée ! +1<i class=ri-morale></i>';cls='win';addLog('🏆 Guerre gagnée — +1<i class=ri-morale></i> (tension : toi 0, ennemi 5)','gold');
  } else if(war.wins.ai>war.wins.player){
    // Joueur perd : pas de pénalité de fin (les combats ont déjà coûté). L'IA gagnante gagne +1<i class=ri-morale></i>. Tension : toi 5, IA 0.
    if(warEnemyEW)warEnemyEW.res.morale=Math.min(8,(warEnemyEW.res.morale||0)+1);
    if(ewAiId){setTens('player',ewAiId,5);setTens(ewAiId,'player',0);}
    txt='💀 Guerre perdue.';cls='loss';addLog('💀 Guerre perdue (tension : toi 5, ennemi 0)','red');
  } else {
    // Égalité : −1<i class=ri-morale></i>, tension → 4 des deux côtés.
    G.player.res.morale=Math.max(0,(G.player.res.morale||0)-1);
    if(ewAiId){setTens('player',ewAiId,4);setTens(ewAiId,'player',4);}
    txt='🤝 Paix blanche. −1<i class=ri-morale></i>.';cls='draw';addLog('🤝 Paix blanche — −1<i class=ri-morale></i>, tension 4','dim');
  }
  G.playerTension=G.ais.reduce((mx,ai)=>Math.max(mx,getTens('player',ai.civ.id)),0);
  G.aiTension=G.ais[0]?getTens(G.ais[0].civ.id,'player'):0;
  syncWarState();
  return{txt,cls};
}
/* ============================================================ AI ============================================================ */
// ── Choix STRATÉGIQUE d'un investissement par une IA (Niv.1 ou Niv.2) ──
function chooseInvestmentForAI(ai,level){
  const pool=level===2?INVESTMENT_CARDS_2:INVESTMENT_CARDS;
  const connCols=ai.colonies.filter(c=>c.connected).length;
  const morale=ai.res.morale||0;
  const sci=(ai.rpt&&ai.rpt.science)||0;
  const atWar=!!_warOf(ai.civ.id);
  let belowMax=0;for(const c of ai.colonies){const n=NODES[c.nodeId];if(n&&(c.level||1)<(n.maxLv||3))belowMax++;}
  let best=pool[0],bestS=-1;
  for(const card of pool){
    let s=1+Math.random()*0.5;
    switch(card.id){
      case 'inv_ind': s+=connCols*1.0; break;
      case 'inv_rec': s+=sci*1.5+2; break;
      case 'inv_agr': s+=morale<=4?4:1; break;
      case 'inv_exp': s+=G.turn<=2?4:1; break;
      case 'inv_esp': s+=1.5; break;
      /* Le conquérant prend Stratégie Guerrière : ses jetons reviennent en un tour au lieu de deux,
         ce qui double la cadence de ses assauts. C'est l'investissement qui sert le plus sa
         doctrine — demandé explicitement par Marc. */
      case 'inv2_war': s+=(typeof profilActifDe==='function'&&profilActifDe(ai)===PROFILS_IA.guerrier)?8:
                          (atWar?5:((ai.civ.id==='martiens'||ai.civ.id==='terriens')?2:1)); break;
      case 'inv2_comfort': s+=morale<=4?4:1; break;
      case 'inv2_colonies': s+=belowMax*1.5; break;
      case 'inv2_union': s+=sci>=1?3:1; break;
    }
    /* L'IA ne choisit pas une carte qu'elle ne pourra pas payer (Marc, 2026-08-09) : le
       joueur, lui, ne peut plus la choisir — les deux doivent obéir à la même règle, sinon
       l'IA gagnerait des bénéfices gratuits que l'humain n'a plus le droit de prendre.
       ⚠️ Le choix a lieu au tour 2 et le prélèvement au tour 3 : ce contrôle ne garantit
       donc rien, il évite seulement les choix absurdes. Le vrai filet est `investAppliquer`. */
    if(!investPayable(card,ai)) s=-99;
    if(s>bestS){bestS=s;best=card;}
  }
  return best.id;
}
// ── Achat IA d'une carte civique (forme de gouvernement ou sociale) ──
function aiBuyCivic(ai,card){
  const cost=card.cost||{};
  ai.acLeft-=1;ai.spentThisTurn+=1+Object.values(cost).reduce((s,v)=>s+v,0);
  for(const[r,a]of Object.entries(cost))ai.res[r]=(ai.res[r]||0)-a;
  const caps=getResCapFor(ai);
  if(card.resGain)for(const[r,a]of Object.entries(card.resGain))ai.res[r]=Math.min(caps[r]||10,(ai.res[r]||0)+a);
  if(card.rGain)for(const[r,a]of Object.entries(card.rGain))ai.rpt[r]=(ai.rpt[r]||0)+a;
  if(card.govForm)adoptGovForm(ai,card);
  if(card.govPts)addGovPts(ai,card.govPts);
  if(card.type==='social'&&!card.repeatable&&!card.calmAction){if(!ai._civicTaken)ai._civicTaken=new Set();ai._civicTaken.add(card.id);}
  addLog('🤖 '+ai.civ.name+(card.type==='government'?' adopte ':' achète ')+card.emoji+' '+card.name,'dim');
  G.aiActions.push({emoji:card.emoji,name:card.name,desc:card.effect});
}
// ── Achat IA d'une carte militaire ──
function aiBuyMilitary(ai,card){
  const ac=card.ac||1;const cost=getEffCost(card,ai);
  ai.acLeft-=ac;ai.spentThisTurn+=ac+Object.values(cost).reduce((s,v)=>s+v,0);
  for(const[r,a]of Object.entries(cost))ai.res[r]=(ai.res[r]||0)-a;
  const cc=card.repeatable?{...card,_uid:Date.now()+Math.random()}:card;
  ai.cards.push(cc);applyCard(cc,ai);
  if(!ai._milBoughtThisTurn)ai._milBoughtThisTurn=new Set();ai._milBoughtThisTurn.add(card.id); // 1× par carte par tour
  addLog('🤖 '+ai.civ.name+' achète '+card.emoji+' '+card.name,'dim');
  G.aiActions.push({emoji:card.emoji,name:'Achète '+card.name,desc:card.effect});
}
/* ══════════════════ PROFILS DE JEU DES NATIONS DIRIGÉES PAR L'ORDINATEUR ══════════════════
   Demande de Marc, 2026-08-16 : « faire un profil de jeu par IA — une qui évite la guerre et vise
   le développement des colonies et les tech, une autre qui raid plus et qui vise la guerre, une
   autre qui cherche à accomplir les événements et son agenda en priorité. »

   POURQUOI ÇA CHANGE LE JEU. Toutes les IA partageaient le même cerveau : à situation égale, elles
   voulaient la même chose au même moment. Une partie à quatre ressemblait donc à trois exemplaires
   du même adversaire, et le joueur n'avait qu'une seule manière de faire à apprendre.

   COMMENT. Le profil ne remplace pas le calcul d'utilité — il le PONDÈRE. Une bâtisseuse acculée
   se défendra toujours ; elle le fera simplement plus tard et moins volontiers qu'une guerrière.
   C'est ce qui évite les caricatures : personne ne devient incapable d'une action.

   ⚠️ UNE NATION AGRESSÉE CHANGE DE TEMPÉRAMENT. Le profil décrit une préférence en temps de paix.
   Dès qu'on lui déclare la guerre, qu'on la pille ou qu'on lui prend une colonie, elle bascule en
   `assiegee` pour quelques tours : militaire, technologies de guerre et ripostes passent devant,
   quel que soit son tempérament d'origine. C'est exactement ce que Marc a vu faire aux Martiens,
   qui ont pris les technologies l'empêchant d'attaquer.
   Le profil est une CHAÎNE rangée sur la nation : il se sauvegarde et survit à une reprise. */
const PROFILS_IA = {
  batisseur: {
    nom:'Bâtisseur', emoji:'🏗️',
    desc:'développe ses colonies et ses technologies, ne pille jamais',
    /* Demande de Marc : aucun raid, jamais. Quand il lui manque une ressource, il la RÉCOLTE
       (He3, astéroïdes, recherche — voir `tryCivic`) au lieu d'aller la prendre chez le voisin.
       D'où le `civic` haut : c'est par là qu'il se refait. */
    mult:{ colonize:1.5, upgrade:1.6, tech:1.5, route:1.3, civic:1.7,
           raid:0, raidAI:0, assaultAI:0.3, military:0.6, accord:1.4 }
  },
  guerrier: {
    nom:'Conquérant', emoji:'⚔️',
    desc:'pille, arme sa flotte et cherche l\'affrontement',
    /* ═══ DOCTRINE DU CONQUÉRANT (dictée par Marc, 2026-08-16) ═══
       « Un conquérant qui ne raide pas et qui vise les technologies militaires en premier. Comme ça
       il économise ses jetons. »
       Le raid tombe donc à presque rien : il coûte 2 jetons pour deux ressources, et ces jetons
       sont exactement ce dont il a besoin pour prendre une colonie — qui, elle, rapporte des VP,
       un revenu et un territoire. Il thésaurise pour frapper.
       Le reste de sa doctrine ne tient pas dans des multiplicateurs : l'ordre de ses recherches est
       dans `_econBranches`, sa façon de choisir sa cible dans `_assaultAIUtil`, et son
       investissement dans `chooseInvestmentForAI`. */
    /* ⚠️ RAID À ZÉRO, PAS « TRÈS BAS ». Avec un simple coefficient (0,15), il pillait encore 2,4 fois
       par partie : une utilité réduite reste positive, et quand tout le reste est hors de portée —
       plus de savoir, plus de matériaux — le raid redevenait le seul choix classé. Un conquérant qui
       ne raide pas, c'est zéro. Ses jetons servent aux assauts, qui rapportent une colonie. */
    mult:{ colonize:1.0, upgrade:1.4, tech:1.35, route:1.0, civic:0.85,
           raid:0, raidAI:0, assaultAI:2.6, military:1.1, accord:0.5 }
  },
  opportuniste: {
    nom:'Opportuniste', emoji:'🎯',
    desc:'court les événements et son agenda secret',
    mult:{ colonize:1.2, upgrade:1.1, tech:1.3, route:1.2, civic:1.5,
           raid:0.7, raidAI:0.7, assaultAI:0.7, military:0.9, accord:1.6 }
  },
  /* Non attribuable au départ : c'est l'état de crise, adopté par n'importe quelle nation. */
  assiegee: {
    nom:'Assiégée', emoji:'🛡️',
    desc:'riposte et se protège avant tout',
    mult:{ colonize:0.5, upgrade:0.7, tech:1.1, route:0.7, civic:0.8,
           raid:1.4, raidAI:1.4, assaultAI:2.0, military:2.2, accord:1.2 }
  },
  /* ═══ ACCULÉE — LA NATION ENFERMÉE CESSE DE SUBIR (Marc, 2026-08-24) ═══
     La tension d'étouffement (voir `estEtouffee`) donne à une nation enfermée l'ENVIE de se battre.
     Elle ne lui en donne pas les MOYENS — et depuis que l'IA refuse les assauts perdus d'avance,
     l'enfermée est précisément celle qui ne peut pas gagner. Sans ce tempérament, la règle
     produirait des guerres populaires suicidaires : elle monterait à 10, déclarerait, et se ferait
     écraser au premier combat.
     Elle S'ARME donc d'abord : `military` très haut pour acheter des jetons et des technologies de
     combat, `colonize` au plancher — elle n'a de toute façon nulle part où aller —, `accord` haut
     parce qu'un accord commercial reste une sortie honorable. L'assaut suit quand elle a de quoi
     le gagner, et la garde de `defenseAttendue` continue de l'empêcher de se jeter dans le vide. */
  acculee: {
    nom:'Acculée', emoji:'😰',
    desc:'enfermée : elle s\'arme, puis force le passage',
    mult:{ colonize:0.3, upgrade:0.9, tech:1.2, route:0.8, civic:1.0,
           raid:1.2, raidAI:1.2, assaultAI:2.4, military:3.0, accord:1.6 }
  }
};
const PROFILS_ATTRIBUABLES = ['batisseur','guerrier','opportuniste'];
const PROFIL_ASSIEGEE_TOURS = 3;   // durée de la bascule après la dernière agression subie

/* Attribue un tempérament à chaque nation dirigée par l'ordinateur.
   À trois IA ou plus, les trois profils sortent tous — le joueur affronte donc les trois manières
   de jouer. En dessous, on tire sans remise : deux IA auront deux tempéraments différents, une IA
   seule en aura un au hasard. */
function attribuerProfilsIA(){
  /* ⚠️ L'ORDRE DE PARCOURS DOIT ÊTRE CANONIQUE, PAS CELUI D'ACTIVATION.
     `allPlayers()` rend les nations dans l'ordre « active d'abord, puis les autres » — qui change
     selon qui joue. Les tempéraments étaient donc distribués différemment selon la nation active,
     et deux parties par ailleurs identiques divergeaient : `test_equivalence.js` l'a vu tout de
     suite (« le résultat dépend de qui est la nation active »).
     On trie par identifiant : le tirage reste aléatoire, mais pour un même tirage la même nation
     reçoit toujours le même tempérament. */
  /* ⚠️ ON EN DONNE UN À TOUTES LES NATIONS, MÊME CELLE DU JOUEUR.
     Le filtre « seulement les IA » paraissait évident, et il rendait le jeu dépendant de QUI est la
     nation active : la nation du joueur n'avait pas de tempérament, donc si l'ordinateur venait à
     la jouer — partie tout-IA, joueur remplacé après une absence, banc d'essai — elle se comportait
     autrement que les autres. `test_equivalence.js` l'a vu immédiatement.
     Un tempérament posé sur une nation humaine ne coûte rien : il n'est lu que par `doAITurn`. */
  const ias=(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[]))
    .filter(Boolean)
    .slice().sort((a,b)=>String(a.civ.id).localeCompare(String(b.civ.id)));
  /* ⚠️ LE TIRAGE NE DOIT ÊTRE FAIT QU'UNE FOIS, ET PAS À CHAQUE APPEL.
     Cette fonction est rappelée après coup par le pilote (quand les sièges humain/IA sont connus).
     Mélanger à chaque appel consommait du hasard en quantité variable selon le nombre de nations
     déjà pourvues : deux parties par ailleurs identiques se mettaient alors à diverger, et
     `test_equivalence.js` — qui vérifie qu'une partie ne dépend pas de QUI est la nation active —
     est passé au rouge. Contre-épreuve faite : en retirant l'attribution, il redevenait vert.
     On tire donc UN décalage, une seule fois par partie, rangé dans `G` ; l'ordre des nations étant
     canonique (tri par identifiant), l'attribution devient entièrement reproductible. */
  if(G._profilDecalage===undefined||G._profilDecalage===null)
    G._profilDecalage=Math.floor(Math.random()*PROFILS_ATTRIBUABLES.length);
  const sac=PROFILS_ATTRIBUABLES.slice();
  let k=0;
  for(const n of ias){
    if(!n){k++;continue;}
    if(n._profil){k++;continue;}   // on avance quand même : la place dans l'ordre reste la sienne
    n._profil=sac[(k+G._profilDecalage)%sac.length]; k++;
    /* On ne l'ANNONCE que pour les nations réellement tenues par l'ordinateur : inutile de dire au
       joueur qu'il a un tempérament dont il ne verra jamais l'effet. */
    if(n._isAI!==false){
      try{ addLog('🧠 '+n.civ.emoji+' '+n.civ.name+' — tempérament : '+PROFILS_IA[n._profil].emoji+' '+PROFILS_IA[n._profil].nom
        +' ('+PROFILS_IA[n._profil].desc+')','dim'); }catch(e){}
    }
  }
}
/* Marque une nation comme agressée : elle basculera en `assiegee` pour quelques tours. Appelée
   quand elle subit un raid, une déclaration de guerre ou la perte d'une colonie. */
function marquerAgressee(nat){ if(nat&&nat._isAI!==false) nat._agresseeTour=G.turn; }
/* Le profil EFFECTIF : celui de crise s'il y a eu une agression récente, sinon le tempérament. */
/* L'ORDRE DES BASCULES COMPTE. Être agressée est plus urgent qu'être enfermée : on riposte à qui
   vous frappe avant de forcer une frontière. Les deux priment sur le tempérament d'origine, et
   toutes deux sont TEMPORAIRES — une nation redevient elle-même dès que la cause disparaît. */
function profilActifDe(nat){
  if(!nat)return null;
  const dep=nat._agresseeTour;
  if(dep!==undefined&&dep!==null&&(G.turn-dep)<PROFIL_ASSIEGEE_TOURS) return PROFILS_IA.assiegee;
  if(nat._etouffeDepuis!==undefined&&nat._etouffeDepuis!==null) return PROFILS_IA.acculee;
  return PROFILS_IA[nat._profil]||null;
}
function nomProfilDe(nat){ const p=profilActifDe(nat); return p?(p.emoji+' '+p.nom):'—'; }
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LE CERVEAU DES IA — ÉTAPE 0 : LUI DONNER UNE PORTE
   ----------------------------------------------------------------------------------------------
   Marc, 27/08 : « les IA appliquent une recette de cuisine au lieu de réfléchir ». Il a raison, et
   `docs/ARCHITECTURE_AVENIR.md` §Cas 2 dit pourquoi rien ne pouvait changer : « l'IA actuelle n'est
   pas une fonction état → action, elle est ENTREMÊLÉE au moteur ». `actionUtilities` et
   `chooseAndAct` sont des fermetures internes à `doAITurn` : impossible de les appeler, de les
   tester, ou d'en essayer une autre.

   ⚠️ CETTE ÉTAPE NE CHANGE AUCUN COMPORTEMENT — c'est sa seule raison d'être. Elle installe une
   porte : le choix final passe désormais par un CERVEAU NOMMÉ, et le cerveau `historique` fait
   exactement ce que faisait la boucle d'avant (prendre la première action réalisable du classement
   d'utilité). `test_cerveau_ia.js` le prouve, coup par coup, sur une partie entière à graine fixe.
   Toucher au comportement AVANT d'avoir cette preuve reviendrait à mélanger un changement de
   structure et un changement de jeu — et à ne plus savoir lequel des deux a cassé quoi.

   CE QUE LA PORTE PERMET ENSUITE :
     · étape 1 — une fonction d'évaluation de POSITION, au lieu de 95 poids par action ;
     · étape 2 — une recherche à un coup : essayer chaque candidat, évaluer, garder le meilleur.
       C'est ce qui transforme « coloniser, est-ce bien en général ? » en « que vaut ma position si
       je colonise CE nœud-là ? ». Mesuré : l'état pèse 9,1 Ko et se clone en 0,73 ms — 500
       évaluations par tour tiennent en ~365 ms, y compris sur mobile hors ligne.

   L'INTERFACE, VOLONTAIREMENT ÉTROITE. Un cerveau reçoit :
     · `nation`   — la nation qui joue (jamais `G.player` : c'est la maladie de fond du projet) ;
     · `utilites` — la note de chaque action candidate, telle que le tempérament l'a modulée ;
     · `classees` — ces actions triées, de la meilleure à la moins bonne ;
     · `executer(k)` — TENTE l'action `k` et rend `true` si elle a eu lieu. Une action peut échouer
       après coup (ressources qui manquent au dernier moment) : le cerveau doit le supporter.
   Il rend `true` s'il a agi. Rien d'autre ne lui est offert : un cerveau qui aurait besoin de plus
   devra le demander explicitement, ce qui rendra sa dépendance visible.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ÉTAPE 1 — CE QUE VAUT UNE POSITION
   ----------------------------------------------------------------------------------------------
   Une seule fonction, à la place des 95 `score += …` disséminés dans `actionUtilities`. La
   différence n'est pas cosmétique : un poids par action répond à « coloniser, est-ce bien EN
   GÉNÉRAL ? », une évaluation de position répond à « que vaut ma situation APRÈS ce coup-ci ? ».
   Seule la seconde question permet de comparer deux coups de natures différentes — une colonie
   contre une technologie — sans arbitrage arbitraire.

   ⚠️ L'UNITÉ EST LE POINT DE VICTOIRE, et rien d'autre. Tout ce qui n'est pas déjà un VP doit être
   converti en VP ESPÉRÉS d'ici la fin de partie. C'est ce qui rend les termes comparables et le
   réglage discutable : chaque coefficient répond à « combien de VP cela rapportera-t-il ? », une
   question à laquelle on peut opposer une mesure.

   ⚠️ L'HORIZON CHANGE TOUT, et c'est ce qu'une note par action ne peut pas exprimer. Au tour 2, une
   technologie qui produit du savoir vaut ses dix tours de rendement ; au tour 10, elle ne vaut plus
   que ses VP inscrits. Une colonie améliorable vaut son potentiel au début, plus rien à la fin.
   `restants` porte cette décote, et c'est de loin le terme le plus important de la fonction.

   ⚠️ LE MORAL N'EST PAS UNE RESSOURCE COMME LES AUTRES : à 0 il supprime TOUT revenu (guerre civile)
   et l'on n'en ressort pas, faute de moyens pour remonter. C'est une falaise, pas une pente — d'où
   un malus qui n'a rien de proportionnel.

   `nat` est reçue en argument, jamais lue dans `G.player` : c'est une fonction de RÈGLE au sens de
   la convention du 24/08, et elle doit pouvoir juger la position de n'importe qui — y compris celle
   d'un rival, ce dont l'étape 3 aura besoin.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function evaluerPosition(nat){
  if(!nat||!nat.civ)return 0;
  const acquis=calcVP(nat).total;
  const total=G.maxTurns||10;
  const restants=Math.max(0,total-(G.turn||1)+1);
  const horizon=restants/total;                      // 1 au premier tour, ~0 au dernier

  /* PRODUCTION — ce que la position rapportera d'ici la fin. Les coefficients disent combien de VP
     vaut UNE unité par tour : le savoir mène aux technologies (les mieux notées au score), les
     matériaux aux colonies et aux routes, l'énergie ne fait qu'accompagner. */
  let rev={};
  try{ rev=revenusBruts(nat)||{}; }catch(e){ rev={}; }
  const parTour=(rev.materials||0)*0.55+(rev.energy||0)*0.40+(rev.science||0)*0.85;
  const production=parTour*restants*0.30;

  /* TRÉSORERIE — convertible tout de suite, mais elle ne vaut que si l'on a encore le temps de la
     dépenser. Un stock de 20🪨 au dernier tour ne vaut rien. */
  const tresorerie=((nat.res.materials||0)*0.14+(nat.res.energy||0)*0.12+(nat.res.science||0)*0.22)*horizon;

  /* POTENTIEL DE DÉVELOPPEMENT — une colonie de niveau 1 reliée vaut bien plus que sa valeur
     actuelle, tant qu'il reste des tours pour l'améliorer. */
  let potentiel=0;
  for(const c of (nat.colonies||[])){
    const n=NODES[c.nodeId]; if(!n||n.decorative)continue;
    const marge=Math.max(0,(n.maxLv||3)-(c.level||1));
    potentiel+=marge*(n.baseVP||1)*0.45*horizon;
    if(!c.connected)potentiel-=(n.baseVP||1)*0.5;    // isolée : la moitié des VP, et un revenu nul
  }

  /* SÉCURITÉ — le moral est une falaise. Et la force sert autant à dissuader qu'à conquérir. */
  const moral=nat.res.morale||0;
  const perilMoral=moral<=0?-18:moral<=1?-11:moral<=3?-4:0;
  const force=Math.min(12,nat.forceTokens||0)*0.45*horizon;

  return acquis+production+tresorerie+potentiel+perilMoral+force;
}
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ÉTAPE 3b — CE QU'UN COUP RETIRE À L'ADVERSAIRE COMPTE AUTANT QUE CE QU'IL ME RAPPORTE
   ----------------------------------------------------------------------------------------------
   `evaluerPosition` ne regarde qu'une nation. Conséquence mesurée : le cerveau `chercheur` refusait
   d'assaillir une cible DÉSARMÉE (`test_defense_attendue`), parce qu'il ne voyait que le coût de
   l'assaut — jetons engagés, moral, guerre ouverte — et jamais la colonie arrachée au rival.
   Or on ne gagne pas une partie dans l'absolu : on la gagne CONTRE quelqu'un. Le score d'une
   position est donc l'écart avec le rival le mieux placé.

   ⚠️ COEFFICIENT 0,6, PAS 1. À poids égal, nuire deviendrait aussi rentable que construire, et l'IA
   se contenterait de saboter. Le rival pèse un peu moins que soi : on préfère avancer, mais gêner
   celui qui mène cesse d'être invisible.
   ⚠️ ON N'ÉVALUE QUE LE MEILLEUR RIVAL, pas tous. Deux évaluations par coup candidat au lieu d'une :
   le budget mesuré (0,73 ms le clone) reste tenable, y compris sur mobile hors ligne.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function evaluerPositionRelative(nat){
  if(!nat||!nat.civ)return 0;
  const moi=evaluerPosition(nat);
  let meilleur=0, somme=0, n=0;
  for(const o of allPlayers()){
    if(!o||o===nat||!o.civ)continue;
    const v=evaluerPosition(o);
    somme+=v; n++;
    if(v>meilleur)meilleur=v;
  }
  if(!n)return moi;
  /* ⚠️ NE PAS SE COMPARER AU SEUL MEILLEUR RIVAL — c'est la faute que j'ai commise d'abord, et elle
     rendait l'IA incapable d'attaquer. Diagnostiqué le 27/08 sur le banc `test_defense_attendue` :
     prendre une colonie SANS DÉFENSE était noté 3,2, la plus basse de toutes les actions jouables
     (carte militaire 6,4 · amélioration 5,6 · technologie 5,1 · colonisation 4,1). L'IA ne refusait
     pas d'attaquer par accident : l'évaluation lui disait que c'était le pire coup.
     La raison : en ne retranchant que le MEILLEUR rival, affaiblir n'importe qui d'autre était
     rigoureusement invisible. Or on prend rarement une colonie au leader — on la prend au voisin.
     On se compare donc à la MOYENNE du peloton (tout le monde compte), plus un supplément sur celui
     qui mène (seul le premier gagne la partie). */
  const moyenne=somme/n;
  return moi-0.55*moyenne-0.35*meilleur;
}
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ÉTAPE 2 — ESSAYER UN COUP, REGARDER, REVENIR EN ARRIÈRE
   ----------------------------------------------------------------------------------------------
   C'est la brique qui manquait pour que les IA « réfléchissent » : pouvoir jouer un coup POUR DE
   FAUX, mesurer la position obtenue, puis remettre le plateau comme il était.

   ⚠️ POURQUOI ON NE PEUT PAS FAIRE `G = scDeserialize(sauvegarde)`. `G` est bien réassignable, mais
   tout le moteur détient des RÉFÉRENCES vers l'intérieur : `ai` pointe sur `G.ais[2]`, une guerre
   pointe sur ses belligérants, les fermetures d'`doAITurn` capturent la nation. Remplacer `G` les
   laisserait toutes braquées sur un plateau fantôme — le genre de panne qui ne se voit qu'en partie
   réelle, trois jours plus tard.
   On RECOUD donc l'ancien état DANS les objets existants (`_fusionEnPlace`), récursivement et sans
   liste de champs : une liste, on l'oublie, et un champ oublié corrompt la partie en silence.

   ⚠️ TROIS CHOSES QUE LA SIMULATION NE DOIT PAS TOUCHER. Le journal (il raconterait des coups qui
   n'ont pas eu lieu), les questions en attente (une fenêtre de défense envoyée pendant une
   simulation partirait pour de bon chez un joueur), et l'affichage. Le journal est donc coupé et
   tronqué, et tout coup qui POSE UNE QUESTION est déclaré non simulable — voir ci-dessous.

   ⚠️ CE QU'ON NE SAIT PAS SIMULER, ON LE DIT. Un assaut ouvre une fenêtre de combat : le simuler
   demanderait de deviner la réponse du défenseur. Ces coups-là ne sont pas évalués par recherche ;
   ils gardent leur note d'utilité historique. Mieux vaut une IA qui cherche sur les trois quarts de
   ses coups qu'une IA qui prétend chercher sur tous et se trompe sur les combats.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function _fusionEnPlace(dst,src){
  if(dst instanceof Set&&src instanceof Set){ dst.clear(); for(const v of src)dst.add(v); return dst; }
  if(dst instanceof Map&&src instanceof Map){ dst.clear(); for(const e of src)dst.set(e[0],e[1]); return dst; }
  if(Array.isArray(dst)&&Array.isArray(src)){
    dst.length=src.length;
    for(let i=0;i<src.length;i++)dst[i]=_recoudre(dst[i],src[i]);
    return dst;
  }
  /* ⚠️ NE JAMAIS SUPPRIMER UNE FONCTION. C'est la panne la plus coûteuse de l'étape 2, et la plus
     instructive : JSON ne transporte pas les fonctions, donc une restauration naïve les EFFACE.
     `G.curEvent` pointe sur une entrée de la table globale `EVENTS`, laquelle porte une méthode
     `resolve(G)`. Recoudre l'état supprimait ce `resolve` — non pas dans une copie, mais dans la
     TABLE GLOBALE, définitivement, pour toute la partie. `stFinDeTour` appelait ensuite
     `G.curEvent.resolve(G)` sur un objet mutilé : la fin de tour mourait juste après les revenus,
     sans erreur visible, et la partie s'arrêtait au tour 2.
     Même piège pour les agendas (`score`) et les cartes d'investissement (`applyBenefit`).
     La règle est donc générale et sans exception : ce que la sérialisation ne sait pas porter, la
     restauration n'a pas le droit de détruire. */
  for(const k of Object.keys(dst))if(!(k in src)&&typeof dst[k]!=='function')delete dst[k];
  for(const k of Object.keys(src))dst[k]=_recoudre(dst[k],src[k]);
  return dst;
}
function _recoudre(a,b){
  if(typeof a==='function'&&(b===undefined||b===null))return a;   // voir la note ci-dessus
  if(a&&b&&typeof a==='object'&&typeof b==='object'
     &&Array.isArray(a)===Array.isArray(b)
     &&(a instanceof Set)===(b instanceof Set)
     &&(a instanceof Map)===(b instanceof Map)) return _fusionEnPlace(a,b);
  return b;
}
/* Combien de questions attendent une réponse ? Sert à détecter qu'un coup simulé en a posé une.
   ⚠️ ON NE PASSE PAS PAR `_questionsListe()` : elle CRÉE `G._pendings` si le champ manque. Une
   simulation doit être sans trace, or elle ajoutait ce champ à l'état — l'aller-retour n'était donc
   pas rigoureusement neutre, et c'est la comparaison octet à octet qui l'a montré. Une fonction qui
   observe ne doit rien écrire. */
function _nbQuestions(){
  if(!G)return 0;
  if(Array.isArray(G._pendings))return G._pendings.length;
  return G._pending?1:0;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ÉTAPE 3 — RÉPONDRE AUX QUESTIONS QU'ON POSE, POUR POUVOIR ÉVALUER UN ASSAUT
   ----------------------------------------------------------------------------------------------
   L'étape 2 déclarait les coups militaires « non simulables » : un assaut ouvre une fenêtre de
   combat, et la simulation s'arrêtait là. Conséquence mesurée : le cerveau `chercheur` jouait mieux
   à l'économie (+12 % de VP) mais devenait aveugle à la guerre, au point d'INVERSER la hiérarchie
   d'agressivité des tempéraments — 2 assauts pour le conquérant contre 10 pour le bâtisseur.

   ⚠️ ON NE RECOPIE PAS LA RÉSOLUTION DU COMBAT. Ce serait une seconde vérité, exactement la maladie
   que `ARCHITECTURE_AVENIR.md` §4 décrit. On laisse le MOTEUR résoudre son combat, et on se contente
   de répondre à ses questions — avec les fonctions qu'il expose déjà (`defenseIA`, `iaChoixDeCombat`,
   `iaVeutLaPaix`), celles-là mêmes que le pilote du serveur utilise. Le barème de combat reste donc
   à un seul endroit.

   ⚠️ ET ON PURGE `_suitesVolatiles`. Les continuations non migrées vivent dans une variable de
   MODULE, hors de `G` : une simulation qui pose une question la laisserait derrière elle, le
   compteur d'identifiants reculerait avec l'état, et la question RÉELLE suivante se résoudrait avec
   la continuation fantôme. C'est la panne qui arrêtait les parties au tour 2 (§52.3). On retient
   donc les identifiants créés pendant la simulation, et on les efface au retour en arrière.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ⚠️ HORS DE `G`, ET C'EST LE POINT. Ma première version rangeait ces identifiants dans `G._simuIds`
   — donc la RESTAURATION les écrasait juste avant qu'on s'en serve, et la purge portait sur une
   liste vide. Ce qui sert à défaire la restauration ne peut pas vivre dans ce qu'elle restaure. */
let _simuIdsCourants=null;
function _reponseSimulee(p){
  const o=(p&&p.payload)||{}, k=p&&p.kind, opts=o.options||[];
  const nat=(p&&p.nation)?allPlayers().find(function(n){return n&&n.civ&&n.civ.id===p.nation;}):null;
  if(k==='peace_offer'){
    const ennemi=allPlayers().find(function(n){return n&&n.civ&&n.civ.id===G.warWith;});
    const veut=(typeof iaVeutLaPaix==='function')?iaVeutLaPaix(nat,ennemi):true;
    return veut?{accept:true,offer:{materials:0,energy:0,science:0}}:{accept:false};
  }
  if(k==='peace_answer'||k==='accord_request')return {id:'yes',accept:true};
  if(k==='war_initiative'){
    const j=nat?Math.min(nat.forceTokens||0,nat.res.materials||0,nat.res.energy||0):0;
    return {id:j>=2?'attaque':'defense'};
  }
  if(k==='war_combat')return (typeof iaChoixDeCombat==='function')?iaChoixDeCombat(nat):{action:'hold'};
  if(k==='defense'){
    /* ⚠️ SUPPOSER « 2 JETONS » FAISAIT MENTIR LA SIMULATION. Un défenseur à sec était crédité d'une
       défense qu'il n'avait pas, et l'IA renonçait à des assauts gagnés d'avance. Le moteur sait
       déjà calculer cette défense — `defenseIA`, la même fonction que le serveur appelle quand une
       nation tenue par l'ordinateur se défend. On l'utilise plutôt que de deviner. */
    let n=null;
    if(typeof defenseIA==='function'){
      const att=allPlayers().find(function(x){return x&&x.civ&&x.civ.id===o.attacker;});
      const noeud=(o.target&&(o.target.id||o.target.node))||o.node||null;
      try{ n=defenseIA(nat,att,noeud); }catch(e){ n=null; }
    }
    if(n===null||n===undefined||isNaN(n))n=Math.min(2,o.maxDef||0);
    return {defTokens:Math.max(0,Math.min(n,o.maxDef||0))};
  }
  if(k==='route_capture')return {capture:true};
  if(k==='forced_war'){
    if(o.colTarget)return {colony:o.colTarget};
    if(Array.isArray(o.routes)&&o.routes.length)return {route:0};
    return {peace:true};
  }
  if(k==='raid_target')return {targetId:opts.length?opts[0].id:null};
  if(k==='ai_dyson'||k==='human_dyson')return {war:false};
  if(k==='dyson_build')return {force:false};
  if(k==='event_comm'){const c=o.cands||[];return {aiId:c.length?c[0].id:null};}
  if(k==='event_diplo'){const r=o.rows||[];return {selected:r.length?[r[0].id]:[]};}
  if(!opts.length)return {};
  const cle=k==='agenda'?'agendaId':(k==='strategy'?'cardId':((k==='invest1'||k==='invest2')?'cardId':(k==='espionage'?'id':(k==='extrasolar'?'node':'targetId'))));
  const a={}, op=opts[0];
  a[cle]=(op.id!==undefined)?op.id:(op.node!==undefined?op.node:op.branch);
  return a;
}
/* Vide la file des questions en y répondant nous-mêmes. Bornée : une chaîne qui ne se termine pas
   doit rendre la main plutôt que boucler — le coup sera simplement déclaré non évaluable. */
function _viderQuestionsSimulees(){
  for(let garde=0;garde<24;garde++){
    const liste=(G&&Array.isArray(G._pendings))?G._pendings:(G&&G._pending?[G._pending]:[]);
    if(!liste.length)return true;
    const q=liste[0];
    try{ resolveDecision(q.id,_reponseSimulee(q)); }catch(e){ return false; }
  }
  return false;
}
/* Joue `fn` pour de faux et rend `{ ok, valeur }` ; le plateau est remis comme avant, toujours. */
function simulerCoup(nat,fn){
  const avantLog=(G.log||[]).length, avantJ=(G._journal||[]).length, avantQ=_nbQuestions();
  const sauvegarde=scSerialize();
  const silence=G._simulationIA; G._simulationIA=true; G._simuQuestion=false;
  const idsAvant=_simuIdsCourants; const mesIds=[]; _simuIdsCourants=mesIds;
  let ok=false, valeur=-Infinity, poseQuestion=false;
  try{
    ok=!!fn();
    /* La chaîne de décisions se déroule ICI, répondue par le moteur lui-même : c'est ce qui rend un
       assaut évaluable. Si elle ne se termine pas, le coup est déclaré non évaluable plutôt que
       noté au hasard. */
    const close=_viderQuestionsSimulees();
    poseQuestion=!close;
    if(ok&&close) valeur=evaluerPositionRelative(nat);
  }catch(e){ ok=false; }
  finally{
    try{
      _fusionEnPlace(G,scDeserialize(sauvegarde));
      /* ⚠️ RECOUDRE LES VALEURS NE SUFFIT PAS : IL FAUT RÉANIMER L'ÉTAT. Une guerre porte un accesseur
         `aiId` posé par `_attachWar` (Object.defineProperty, non énumérable) ; la sérialisation ne le
         voit pas, et une guerre restaurée ressort muette. `rehydrateState` et `refreshWarViews` sont
         exactement ce que le chemin de reprise normal exécute après une lecture de sauvegarde
         (`scLoadGame`) — s'en dispenser ici, c'est restaurer à moitié.
         MESURÉ : sans ces deux lignes, une partie jouée par le cerveau chercheur s'arrêtait au
         TOUR 2. Le banc `test_cerveau_ia.js` en fait un échec. */
      if(typeof rehydrateState==='function')rehydrateState(G);
      if(typeof refreshWarViews==='function')refreshWarViews();
    }catch(e){}
    /* Le journal n'est pas dans la sauvegarde utile : on le tronque à sa longueur d'avant, ce qui
       efface les lignes écrites pendant la simulation sans toucher aux précédentes. */
    if(G.log&&G.log.length>avantLog)G.log.length=avantLog;
    if(G._journal&&G._journal.length>avantJ)G._journal.length=avantJ;
    /* Les continuations volatiles créées pendant la simulation ne sont PAS dans `G` : on les efface
       à la main, sans quoi la prochaine question réelle hériterait de l'une d'elles. */
    for(const id of mesIds) delete _suitesVolatiles[id];
    _simuIdsCourants=idsAvant;
    G._simulationIA=silence; delete G._simuQuestion;
  }
  return {ok:ok&&!poseQuestion, valeur:valeur, question:poseQuestion};
}
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   L'ÉNUMÉRATEUR DE COUPS CONCRETS — LA BRIQUE QUI MANQUAIT
   ----------------------------------------------------------------------------------------------
   Marc, 27/08 : « je préfère un système qui n'a pas de notes sur les actions préalables, je veux une
   IA qui réfléchisse coup après coup comme un humain, sans se limiter par une recette initiale. »

   ⚠️ CE QUE LA RECETTE FAISAIT, ET POURQUOI C'EST LE VRAI PROBLÈME. L'ancienne IA choisissait une
   CATÉGORIE (« coloniser », notée 30,4 par un barème écrit à la main), puis une sous-fonction
   décidait seule OÙ coloniser. Deux préjugés empilés : la note de la catégorie, et le choix interne
   de la cible. L'IA ne comparait jamais « coloniser Vesta » à « coloniser Europe », encore moins à
   « assaillir Io ». Diagnostiqué le 27/08 : prendre une colonie SANS DÉFENSE était noté 1,5, dernier
   de tous les coups jouables, et l'IA passait à côté.

   ICI, PAS DE NOTE. Cette fonction ne juge rien : elle DÉCRIT ce qui est jouable, coup par coup, avec
   sa cible. C'est au chercheur d'essayer chacun et de regarder ce que ça donne.

   ⚠️ ET PAS DE SECONDE COPIE DES RÈGLES. La légalité et le coût sont demandés au moteur lui-même —
   `colonizeCost`, `routeCost`, `getEffCost`, `isTechAvailable`, `isTechExclusive`. Recopier ces
   conditions ici aurait créé la divergence que `ARCHITECTURE_AVENIR.md` §4 décrit : deux vérités qui
   s'éloignent. Quand un filtre serait ambigu, on préfère PROPOSER le coup et laisser la simulation
   le rejeter — un coup impossible coûte une simulation, un coup oublié coûte une partie.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function coupsPossibles(nat){
  const coups=[];
  if(!nat||!nat.civ||(nat.acLeft||0)<1)return coups;
  const abordable=o=>Object.entries(o||{}).every(([r,a])=>(nat.res[r]||0)>=a);
  const occupe=id=>allPlayers().some(n=>n.colonies&&n.colonies.some(c=>c.nodeId===id));
  const mien=id=>(nat.colonies||[]).some(c=>c.nodeId===id);

  /* COLONISER — chaque nœud libre, nommément. */
  {
    const c=colonizeCost(nat);
    if((nat.acLeft||0)>=c.ac&&(nat.res.materials||0)>=c.mat&&(nat.res.energy||0)>=c.en){
      for(const id in NODES){
        const n=NODES[id]; if(!n||n.decorative||n.noColonize)continue;
        if(occupe(id))continue;
        coups.push({type:'coloniser',node:id,libelle:'coloniser '+n.name});
      }
    }
  }
  /* AMÉLIORER — chacune de mes colonies améliorables. */
  for(const col of (nat.colonies||[])){
    const n=NODES[col.nodeId]; if(!n||n.decorative||col.noUpgrade)continue;
    if((col.level||1)>=(n.maxLv||3))continue;
    if((nat.res.materials||0)>=3&&(nat.res.energy||0)>=1&&(nat.res.science||0)>=1)
      coups.push({type:'ameliorer',node:col.nodeId,libelle:'améliorer '+n.name+' Nv.'+((col.level||1)+1)});
  }
  /* ROUTE — chaque liaison constructible depuis mes positions. */
  {
    const r=routeCost(nat);
    if((nat.res.materials||0)>=r.mat&&(nat.forceTokens||0)>=(r.force||0)){
      const depuis=(nat.colonies||[]).map(c=>c.nodeId).concat([nat.civ.home]);
      for(const a2 of depuis){
        const n=NODES[a2]; if(!n)continue;
        for(const b2 of (n.conn||[])){
          if((nat.routes||[]).some(x=>(x.from===a2&&x.to===b2)||(x.from===b2&&x.to===a2)))continue;
          coups.push({type:'route',from:a2,to:b2,libelle:'route '+n.name+'→'+((NODES[b2]||{}).name||b2)});
        }
      }
    }
  }
  /* TECHNOLOGIE — chaque carte réellement achetable, nommément. */
  for(const card of CARDS_POOL){
    if((nat.cards||[]).some(c=>c.id===card.id))continue;
    if(isTechExclusive(card)&&G.techTaken.has(card.id))continue;
    if(!isTechAvailable(card,nat))continue;
    if(card.reqCard&&!(nat.cards||[]).some(c=>c.id===card.reqCard))continue;
    const ac=card.tier===3?2:1;
    if((nat.acLeft||0)<ac)continue;
    if(!abordable(getEffCost(card,nat)))continue;
    coups.push({type:'tech',card:card.id,libelle:'acheter '+card.name});
  }
  /* CIVIQUE — chaque carte du marché abordable. */
  for(const card of (typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[])){
    if(card.id===nat.govForm)continue;
    if(nat._civicTaken&&nat._civicTaken.has(card.id)&&!card.repeatable)continue;
    if(!abordable(card.cost))continue;
    coups.push({type:'civique',card:card.id,libelle:'civique : '+card.name});
  }
  /* RAID, ASSAUT, ACCORD — sur chaque colonie adverse, nommément. */
  {
    const jetons=nat.civ.id==='ceinturiens'?1:2;
    for(const o of allPlayers()){
      if(o===nat||!o.civ)continue;
      for(const col of (o.colonies||[])){
        const nom=(NODES[col.nodeId]||{}).name||col.nodeId;
        if((nat.forceTokens||0)>=jetons)
          coups.push({type:'raid',cible:o.civ.id,node:col.nodeId,libelle:'raid sur '+nom+' ('+o.civ.name+')'});
        if((nat.forceTokens||0)>=jetons&&(nat.res.materials||0)>=1&&(nat.res.energy||0)>=1)
          coups.push({type:'assaut',node:col.nodeId,libelle:'assaillir '+nom+' ('+o.civ.name+')'});
        if((nat.res.materials||0)>=2&&!mien(col.nodeId))
          coups.push({type:'accord',node:col.nodeId,libelle:'accord sur '+nom+' ('+o.civ.name+')'});
      }
    }
  }
  /* POUVOIR NATIONAL — gratuit, une fois par tour. */
  if(!nat.abilityUsed)coups.push({type:'pouvoir',libelle:'pouvoir national'});
  return coups;
}
/* Joue un coup DÉCRIT. Chaque type délègue à la fonction du moteur qui porte déjà la règle : on ne
   réimplémente rien, on appelle. Rend `true` si le coup a eu lieu. */
/* ═══════ QUI EST EN TRAIN D'AGIR ? — le pendant de `logAuteur` pour les ACTIONS ═══════
   ⚠️ CE BLOC EXISTE À CAUSE D'UN DÉFAUT QUE J'AI INTRODUIT LE 27/08 ET QUE MARC A VU LE 28.
   `appliquerCoup` appelle les fonctions DU JOUEUR (`doColonize`, `doUpgrade`, `buyTech`…) — c'est
   voulu, c'est ce qui garantit qu'une IA et un humain obéissent aux mêmes règles, écrites une seule
   fois. Mais ces fonctions se terminent toutes par `addAction`, qui est le CARNET DE BORD DU JOUEUR
   LOCAL et qui code la nation active en dur : elle inscrivait donc chaque coup d'IA dans les actions
   de Marc, signait la ligne de journal de SON nom, faisait apparaître un toast sur SON écran, et en
   mode solo programmait `_ilMaybePass` — c'est-à-dire qu'elle passait SA main.
   Résultat vu en jouant : « l'IA joue toutes ses actions d'un coup avant ou après moi ». Les deux
   carnets étaient mélangés, et les seules lignes encore identifiables étaient les `🤖`.
   L'ancienne IA n'y passait jamais : ses enveloppes (`tryColonize`…) enregistraient dans
   `G.aiActions` via `_aiRec`. Le défaut est donc né avec le cerveau `tacticien`, pas avant.

   ⚠️ CE QU'ON NE FAIT SURTOUT PAS : ajouter un paramètre `acteur` à `addAction` et le propager dans
   `doColonize`, `doUpgrade`, `buyTech`, `aiBuyCivic`, `doRaidTarget`, `attackColony`… Ce serait la
   même règle maintenue à huit endroits, avec la divergence garantie à terme que décrit
   `ARCHITECTURE_AVENIR.md` §4. On pose la nation À UN SEUL ENDROIT et `addAction` la lit — exactement
   le mécanisme de `logAuteur`/`_auteurLog`, qui rend déjà ce service pour le journal. */
let _acteurAction=null;
function acteurAction(nat,fn){
  const av=_acteurAction;
  _acteurAction=nat||null;
  try{ return fn(); } finally { _acteurAction=av; }
}
/* La nation qui agit en ce moment. Sans acteur désigné, c'est le joueur local — donc TOUS les appels
   existants (clics du joueur) se comportent rigoureusement comme avant. */
function _acteurCourant(){ return _acteurAction||(typeof G!=='undefined'&&G?G.player:null); }

function appliquerCoup(nat,coup){
  if(!nat||!coup)return false;
  const avantAc=nat.acLeft;
  const connu=acteurAction(nat,function(){
  switch(coup.type){
    case 'coloniser': doColonize(coup.node,nat); break;
    case 'ameliorer': doUpgrade(coup.node,nat); break;
    case 'route':     doEstablishRoute(coup.from,coup.to,nat); break;
    case 'tech':      buyTech(coup.card,nat); break;
    case 'civique': {
      const c=(typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[]).find(x=>x.id===coup.card);
      if(c)aiBuyCivic(nat,c); break;
    }
    case 'raid':      doRaidTarget(coup.cible,coup.node,nat); break;
    case 'assaut':    attackColony(coup.node,nat); break;
    case 'accord':    proposeAccord(coup.node,nat); break;
    case 'pouvoir':   if(typeof useAbility==='function')useAbility(nat); break;
    default: return false;
  }
  return true;
  });
  if(!connu)return false;
  /* ⚠️ « LE COUP A-T-IL EU LIEU ? » SE MESURE, IL NE SE SUPPOSE PAS. Les fonctions du moteur
     refusent en silence (ressources manquantes au dernier moment, cible devenue invalide) et ne
     rendent rien d'exploitable. Une action réussie consomme TOUJOURS au moins un AC — sauf le
     pouvoir national, qui est gratuit et se marque par `abilityUsed`. */
  const fait=(coup.type==='pouvoir')?!!nat.abilityUsed:(nat.acLeft<avantAc);
  /* ⚠️ UNE ACTION QUI N'EST PAS ENREGISTRÉE N'A PAS EU LIEU, POUR LE JOUEUR. Les anciennes fonctions
     `tryColonize`, `tryTech`… poussaient elles-mêmes dans `G.aiActions` : c'est de là que viennent
     les lignes « 🤖 Ceinturiens colonise Titan » du journal, le récapitulatif de fin de tour, et le
     comptage des bancs. En appelant `doColonize` directement, je court-circuitais tout cela.
     Constaté sur `test_profils_ia` : « 0 assaut contre 0 » ET « 0 construction contre 0 », alors que
     l'IA jouait normalement — elle agissait dans le silence complet. Marc aurait vu ses adversaires
     jouer sans qu'une seule ligne ne le dise.
     On enregistre donc ici, avec les MÊMES libellés que l'ancien chemin pour que le journal, les
     rapports de fin de partie et les bancs continuent de s'y retrouver. */
  if(fait&&typeof G!=='undefined'&&Array.isArray(G.aiActions)){
    const nom=id=>(NODES[id]||{}).name||id;
    let e=null;
    switch(coup.type){
      case 'coloniser': e={emoji:'🏗️',name:'Colonise '+nom(coup.node),desc:''}; break;
      case 'ameliorer': {
        const col=(nat.colonies||[]).find(c=>c.nodeId===coup.node);
        e={emoji:'⬆️',name:'Améliore '+nom(coup.node),desc:'Nv.'+((col&&col.level)||'?')}; break;
      }
      case 'route':     e={emoji:'🛤️',name:'Route → '+nom(coup.to),desc:'depuis '+nom(coup.from)}; break;
      case 'tech': {
        const c=CARDS_POOL.find(x=>x.id===coup.card);
        e={emoji:(c&&c.emoji)||'✅',name:'Achète '+((c&&c.name)||coup.card),desc:(c&&c.effect)||''}; break;
      }
      case 'civique': {
        const c=(typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[]).find(x=>x.id===coup.card);
        e={emoji:(c&&c.emoji)||'📜',name:'Achète '+((c&&c.name)||coup.card),desc:(c&&c.effect)||''}; break;
      }
      case 'raid':      e={emoji:'💰',name:'Raid sur '+nom(coup.node),desc:coup.cible||''}; break;
      case 'assaut':    e={emoji:'⚔️',name:'Assaut sur '+nom(coup.node),desc:''}; break;
      case 'accord':    e={emoji:'🤝',name:'Accord '+nom(coup.node),desc:''}; break;
      case 'pouvoir':   e={emoji:'💫',name:'Pouvoir national',desc:''}; break;
    }
    /* ⚠️ SEULEMENT SI PERSONNE NE L'A DÉJÀ FAIT. Certaines fonctions du moteur enregistrent leur
       propre entrée (l'assaut, le raid) : en ajouter une seconde ferait compter l'action deux fois
       dans les bancs et l'afficherait en double au joueur. */
    if(e&&!G.aiActions.some(x=>x&&!x._rec&&x.name===e.name))G.aiActions.push(e);
    /* ⚠️ ET LA LIGNE DE JOURNAL, QUI EST CE QUE LE JOUEUR LIT VRAIMENT. Les anciennes enveloppes
       (`tryColonize`, `tryUpgrade`, `tryRoute`, `tryTech`) écrivaient « 🤖 Ceinturiens colonise
       Titan » avant d'agir. `doColonize` et consorts, eux, ne disent rien — ils appliquent la règle,
       c'est tout, et c'est très bien ainsi. Il faut donc l'annoncer ici.
       Le raid, l'assaut et l'accord s'annoncent DÉJÀ eux-mêmes : on ne les répète pas.
       ⚠️ On garde la tournure EXACTE de l'ancien chemin (« 🤖 <nation> colonise <nœud> », sans
       emoji de nation) : le journal, les rapports de fin de partie et plusieurs bancs la relisent. */
    const phrase={
      coloniser: function(){ return 'colonise '+nom(coup.node); },
      ameliorer: function(){ const c=(nat.colonies||[]).find(x=>x.nodeId===coup.node);
                             return 'améliore '+nom(coup.node)+' Nv.'+((c&&c.level)||''); },
      route:     function(){ return 'route → '+nom(coup.to); },
      tech:      function(){ const c=CARDS_POOL.find(x=>x.id===coup.card); return 'achète '+((c&&c.name)||coup.card); },
      civique:   function(){ const c=(typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[]).find(x=>x.id===coup.card);
                             return 'achète '+((c&&c.name)||coup.card); },
      pouvoir:   function(){ return 'utilise son pouvoir national'; }
    }[coup.type];
    if(phrase)addLog('🤖 '+nat.civ.name+' '+phrase(),'dim');
  }
  return fait;
}
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LA TRACE DE DÉCISION — CE QUE L'IA A COMPARÉ, ET DE COMBIEN ELLE A TRANCHÉ
   ----------------------------------------------------------------------------------------------
   Une ligne par décision : le coup retenu, sa note, le dauphin, l'écart entre les deux, et combien
   de coups ont été réellement évalués. C'est ce qui permet, en relisant une partie, de distinguer
   « elle a choisi ça franchement » de « ça s'est joué à 0,1 point » — et de voir POURQUOI elle n'a
   pas attaqué, plutôt que de le supposer.

   ⚠️ BORNÉE, PARCE QU'ELLE VOYAGE. Cette trace vit dans `G`, donc elle est sauvegardée avec la
   partie et traverse le réseau. Une partie de dix tours produit ~150 décisions ; on en garde les
   200 dernières, ce qui couvre toujours la partie entière sans faire enfler les sauvegardes.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function _tracerDecisionIA(nat,coup,valeur,second,valeurSeconde,evalues,proposes){
  if(!G||!nat||!nat.civ)return;
  if(!Array.isArray(G._traceIA))G._traceIA=[];
  G._traceIA.push({
    t:G.turn||0, nat:nat.civ.id,
    choix:(coup&&coup.libelle)||'?',
    val:Math.round((valeur||0)*10)/10,
    second:(second&&second.libelle)||null,
    val2:(valeurSeconde===-Infinity||valeurSeconde===undefined)?null:Math.round(valeurSeconde*10)/10,
    evalues:evalues||0, proposes:proposes||0
  });
  if(G._traceIA.length>200)G._traceIA.splice(0,G._traceIA.length-200);
}
/* La PHOTO de fin de tour : où en est chaque nation, tour par tour. Quarante lignes pour une partie
   entière — assez pour lire une trajectoire (qui décroche, quand, et sur quelle ressource), et
   assez léger pour tenir dans une sauvegarde. */
function _photographierTour(){
  if(!G)return;
  if(!Array.isArray(G._photos))G._photos=[];
  for(const p of allPlayers()){
    if(!p||!p.civ)continue;
    let vp=0; try{ vp=calcVP(p).total; }catch(e){}
    G._photos.push({ t:G.turn||0, nat:p.civ.id, vp:vp,
      e:p.res.energy||0, m:p.res.materials||0, s:p.res.science||0, mo:p.res.morale||0,
      col:(p.colonies||[]).length, rt:(p.routes||[]).length, ca:(p.cards||[]).length,
      jt:p.forceTokens||0,
      guerre:(G.wars||[]).some(w=>w&&!w.ended&&(w.a===p.civ.id||w.b===p.civ.id)) });
  }
  if(G._photos.length>240)G._photos.splice(0,G._photos.length-240);
}
const CERVEAUX_IA={};
function enregistrerCerveau(nom,fn){ CERVEAUX_IA[nom]=fn; }
/* ⚠️ DEUX CERVEAUX SEULEMENT, ET C'EST VOULU.
   `historique` — la recette d'origine : une table de 95 poids écrits à la main note les CATÉGORIES
   d'action (« coloniser » vaut 30), et une sous-fonction choisit seule la cible. Il ne sert plus que
   de TÉMOIN : sans lui, aucune mesure ne serait comparable à quoi que ce soit.
   `tacticien`  — aucune note préalable. Il énumère les coups CONCRETS (`coupsPossibles`), les joue
   tous pour de faux, et garde celui qui laisse la meilleure position.

   Un troisième, `chercheur`, a existé entre les deux : il réordonnait les six premières catégories
   du classement d'utilité. Il a été SUPPRIMÉ le 27/08 dès que `tacticien` l'a surpassé — un
   intermédiaire qu'on garde « au cas où » devient une troisième chose à maintenir, à tester et à
   faire diverger. Marc : « nettoie bien le code histoire qu'on paye pas les restes plus tard. »

   ⚠️ `tacticien` EST LE CERVEAU DU JEU DEPUIS LE 27/08 — décision de Marc, prise sur mesures.
   Il gagne nettement : 11 parties contre 5, 51,3 VP de moyenne contre 40,5 (+27 %).

   ⚠️ ET IL N'ATTAQUE PAS AU MÊME MOMENT QUE L'ANCIENNE IA — c'est une qualité, pas un défaut. Mesuré
   coup par coup, la valeur du meilleur coup MILITAIRE contre celle du meilleur coup PACIFIQUE :

       tour  2 : 8,3 contre 9,3 → elle bâtit        tour  8 : 6,8 contre 6,2 → ELLE ATTAQUE
       tour  4 : 7,8 contre 8,3 → elle bâtit        tour 10 : 6,3 contre 6,1 → ELLE ATTAQUE
       tour  6 : 7,3 contre 7,2 → ELLE ATTAQUE

   La bascule se fait au tour 6, et personne ne l'a programmée. Au tour 2, coloniser rapporte huit
   tours de revenus ; au tour 8 il ne reste rien à récolter, alors qu'une colonie prise compte ses
   points IMMÉDIATEMENT et les retire à l'autre. Marc, qui attaque lui-même vers le tour 8, y a vu
   la même logique avant la mesure.
   ⚠️ Mon « elle n'attaque jamais » de la veille était donc FAUX PAR EXCÈS : j'avais mesuré zéro
   assaut dans des parties où quatre tacticiens jouent tous pacifiquement — personne ne s'affaiblit,
   donc aucune proie n'apparaît. Contre un joueur humain qui attaque, la situation est autre.

   `historique` reste enregistré comme TÉMOIN : sans lui, plus aucune mesure ne serait comparable. */
function nomCerveauCourant(){ return (G&&G._cerveauIA)||'tacticien'; }
function cerveauCourant(){ return CERVEAUX_IA[nomCerveauCourant()]||CERVEAUX_IA.historique; }
/* Le cerveau d'origine : la première action réalisable du classement. Rigoureusement l'ancienne
   boucle, déplacée — pas réécrite. */
enregistrerCerveau('historique', function(ctx){
  for(const k of ctx.classees){ if(ctx.executer(k)) return true; }
  return false;
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LE CERVEAU `tacticien` — AUCUNE NOTE PRÉALABLE, QUE DES COUPS ESSAYÉS
   ----------------------------------------------------------------------------------------------
   C'est ce que Marc a demandé le 27/08 : « une IA qui réfléchisse coup après coup comme un humain,
   sans se limiter par une recette initiale ».

   Il n'y a plus de table d'utilité du tout — elle n'est même pas calculée quand ce cerveau joue.
   L'IA énumère ses coups CONCRETS (`coupsPossibles` : « coloniser Vesta », « assaillir Io », et non
   « coloniser » en général), les joue tous pour de faux, et garde celui qui laisse la meilleure
   position. Le seul jugement porté est celui que le jeu lui-même calcule.

   ⚠️ POURQUOI CE N'EST PAS LA MÊME CHOSE QUE `chercheur`. Ce dernier partait encore du classement
   d'utilité et n'en réordonnait que les six premières CATÉGORIES ; la cible restait choisie par une
   sous-fonction. Il ne pouvait donc jamais préférer « coloniser Europe » à « coloniser Vesta », ni
   voir qu'un assaut précis valait mieux qu'une colonisation quelconque. `tacticien` compare des
   coups nommés, tous contre tous.

   ⚠️ MESURÉ AVANT D'ÊTRE ÉCRIT : 50 coups concrets dans une position typique, 1,4 ms l'essai, soit
   70 ms par décision et ~1,4 s par tour pour quatre nations. Tenable hors ligne sur téléphone —
   c'était la condition posée par Marc.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
enregistrerCerveau('tacticien', function(ctx){
  const coups=ctx.coups();
  if(!coups.length)return false;
  let meilleur=null, meilleureValeur=-Infinity, second=null, secondeValeur=-Infinity, evalues=0;
  for(const c of coups){
    const r=simulerCoup(ctx.nation, function(){ return ctx.jouer(c); });
    if(!r.ok)continue;
    evalues++;
    if(r.valeur>meilleureValeur){ second=meilleur; secondeValeur=meilleureValeur;
                                  meilleureValeur=r.valeur; meilleur=c; }
    else if(r.valeur>secondeValeur){ secondeValeur=r.valeur; second=c; }
  }
  if(!meilleur)return false;
  /* ⚠️ ON GARDE LE POURQUOI, PAS SEULEMENT LE QUOI. Marc, 27/08 : « veille à ce que le fichier
     debug puisse être efficace dans le recueil d'informations, pas juste le journal d'une partie ».
     Le journal dit « Ceinturiens colonise Titan ». Il ne dit pas que l'IA a comparé 47 coups, que
     Titan l'emportait de 0,2 point sur un assaut, ni qu'elle a hésité. Sans cela, quand une IA joue
     bizarrement, on ne peut que deviner. */
  _tracerDecisionIA(ctx.nation, meilleur, meilleureValeur, second, secondeValeur, evalues, coups.length);
  /* Le coup gagnant a été DÉFAIT par la simulation : on le rejoue pour de vrai. S'il échoue à la
     seconde tentative (un tirage a pu changer), on prend le suivant plutôt que de passer son tour. */
  if(ctx.jouer(meilleur))return true;
  for(const c of coups){ if(c!==meilleur&&ctx.jouer(c))return true; }
  return false;
});
function doAITurn(aiPlayer,oneShot){
  /* Tout ce que cette fonction journalise appartient à CETTE IA. Sans ce marquage, ses lignes
     étaient attribuées à `G.player` — c'est-à-dire à l'humain que le serveur avait activé, ce qui
     est exactement le contraire de la vérité. */
  return logAuteur(aiPlayer, ()=>_doAITurnInterne(aiPlayer,oneShot));
}
function _doAITurnInterne(aiPlayer,oneShot){
  const ai=aiPlayer;G.aiActions=[];G._raidsThisTurn=[];ai._warConserve=false;ai._warRecapture=null;ai._warAggressor=false;ai._enemyId=(function(){var _t=_aiResolveTarget(ai);return (_t&&_t.civ&&_t.civ.id)||null;})();ai._pForceEst=perceivedForce(ai,aiEnnemi(ai)).val;
  // ── RÉSERVE DE GUERRE (point d'entrée) ──────────────────────────────────────────────────────────────
  // Un joueur humain en guerre ne dépense pas sa dernière énergie : il garde de quoi ENGAGER ses jetons
  // (1🪨 +1⚡ par jeton). Avant, l'IA finissait à 0⚡ et se laissait conquérir sans résistance.
  // On coupe TOUTE dépense discrétionnaire dès que la trésorerie tombe au niveau de la réserve.
  {const _w=(typeof _warOf==='function')?_warOf(ai.civ.id):null;
   if(_w){
     const _resv=Math.max(2,Math.min(6,ai.forceTokens||0));
     const _liq=Math.min(ai.res.materials||0, ai.res.energy||0);
     // +3 de marge : une seule action peut coûter jusqu'à ~3 ressources, sans quoi l'IA passerait
     // SOUS la réserve d'un coup (elle s'arrête donc un cran plus tôt).
     if(_liq<=_resv+3){
       ai._hoarding=true;                       // thésaurise ce tour : elle garde de quoi se défendre
       if(oneShot){ ai.acLeft=Math.max(0,ai.acLeft-1); return false; }
       ai.acLeft=0; return;
     }
   }
   ai._hoarding=false;}
  // ── Suivi des coûts IA : snapshot avant chaque action, diff après, enregistré au journal ──
  function _aiSnapRes(){return{energy:ai.res.energy||0,materials:ai.res.materials||0,science:ai.res.science||0,morale:ai.res.morale||0,force:ai.forceTokens||0};}
  function _aiRec(bAc,bRes,fromIdx){
    const acP=Math.max(0,bAc-ai.acLeft),cost={},gain={};
    /* ⚠️ SEULS LES COÛTS ÉTAIENT RELEVÉS. Un pouvoir gratuit qui RAPPORTE des ressources — le
       « Commerce avec les pirates » des Ceinturiens — s'affichait donc « paie 0 AC (aucune
       ressource) » alors que la nation venait d'encaisser. Doublement trompeur : on croyait qu'il ne
       s'était rien passé. On relève les deux sens. */
    for(const r of['energy','materials','science']){const d=(bRes[r]||0)-(ai.res[r]||0);if(d>0)cost[r]=d;else if(d<0)gain[r]=-d;}
    const df=(bRes.force||0)-(ai.forceTokens||0);if(df>0)cost.force=df;
    for(let i=fromIdx;i<G.aiActions.length;i++){const e=G.aiActions[i];if(e&&!e._rec){e._rec=true;_journalAdd(ai,e.name,acP,cost,e.desc,{war:_isWarAct(e.name)});}}
    // TRANSPARENCE (demande de Marc) : le journal affichait les actions des IA SANS leur coût — impossible de
    // vérifier qu'elles paient. On journalise donc ce qu'elles dépensent réellement, comme pour le joueur.
    if(G.aiActions.length>fromIdx){
      const parts=[];
      for(const r of ['energy','materials','science']){ if(cost[r])parts.push('−'+cost[r]+rEmoji(r)); }
      if(cost.force)parts.push('−'+cost.force+' jeton'+(cost.force>1?'s':'')+' Force');
      for(const r of ['energy','materials','science']){ if(gain[r])parts.push('+'+gain[r]+rEmoji(r)); }
      addLog('   ↳ '+ai.civ.emoji+' '+ai.civ.name+' paie : '+(acP?acP+' AC':'0 AC')+(parts.length?(' '+parts.join(' ')):' (aucune ressource)'),'dim');
    }
  }
  function _aiStep(fn){const bAc=ai.acLeft,bRes=_aiSnapRes(),i0=G.aiActions.length;const r=fn();_aiRec(bAc,bRes,i0);return r;}
  // ── POUVOIRS GRATUITS (0 AC, 1×/tour) — l'IA active le sien quand c'est utile et abordable (parité joueur) ──
  {const _bA=ai.acLeft,_bR=_aiSnapRes(),_i0=G.aiActions.length;
  if(!ai.abilityUsed){
    if(ai.civ.id==='ceinturiens'){ // Commerce avec les pirates (gratuit) — toujours
      const _cr=pirateCommerce(ai);ai.abilityUsed=true;
      if(_cr.length)G.aiActions.push({emoji:'💫',name:'Commerce avec les pirates',desc:'+'+_cr.map(rEmoji).join('')});
    }else if(ai.civ.id==='terriens'){ // Diplomatie Verte : +3 pts Gouv pour 3🪨 (garde 2🪨 de réserve pour bâtir)
      /* ⚠️ ELLE PAYAIT ENCORE APRÈS LE NIVEAU MAXIMAL. Le gouvernement plafonne à 15 points (niveau 4,
         4 AC de base) : au-delà, un point de plus ne donne RIEN — ni action, ni score, et l'agenda
         « Gouvernance Éclairée » demande seulement le niveau 4. L'IA terrienne continuait pourtant à
         verser 3🪨 par tour, indéfiniment : 27🪨 brûlés dans la partie 0C10, ce qui explique qu'elle
         n'ait presque rien bâti et fini dernière avec 7 VP de colonies.
         Le garde-fou existait déjà ailleurs pour la Réforme Institutionnelle (`gov_pts<15`) — il
         manquait seulement ici. */
      if((ai.res.materials||0)>=5&&(ai.gov_pts||0)<15){ai.res.materials-=3;addGovPts(ai,3);ai.abilityUsed=true;
        G.aiActions.push({emoji:'💫',name:'Diplomatie Verte',desc:'+3 pts Gouvernement'});}
    }else if(ai.civ.id==='martiens'){ // Surtension : +1 AC pour 2⚡ (si l'AC supplémentaire est finançable et hors fin de partie)
      if((ai.res.energy||0)>=3&&(ai.res.materials||0)>=2&&G.turn<=7){ai.res.energy-=2;ai.acLeft+=1;ai.acMax=(ai.acMax||ai.acLeft)+1;ai.abilityUsed=true;
        G.aiActions.push({emoji:'💫',name:'Surtension',desc:'+1 AC'});}
    }else if(ai.civ.id==='jupiteriens'){ // Forge Orbitale : améliore une lune joviène 1→2 gratuitement (sans AC ni science)
      const _col=ai.colonies.find(c=>['io','europe','ganymede','callisto'].includes(c.nodeId)&&c.level===1&&c.connected);
      if(_col&&(ai.res.materials||0)>=3&&(ai.res.energy||0)>=3){ai.res.materials-=1;ai.res.energy-=1;_col.level=2;updateConnections(ai);ai.abilityUsed=true;
        G.aiActions.push({emoji:'💫',name:'Forge Orbitale',desc:NODES[_col.nodeId].name+' Nv.2'});}
    }
  }
  /* ⚠️ LE POUVOIR NATIONAL GRATUIT N'ÉTAIT ANNONCÉ NULLE PART. Chaque autre action de l'IA écrit sa
     propre ligne (« 🤖 X colonise Y ») ; ces quatre-là se contentaient de pousser dans `G.aiActions`.
     Résultat, partie 8B47 : « ↳ ☠️ Ceinturiens paie : 0 AC (aucune ressource) » revenait presque à
     chaque tour, sans jamais dire ce qui avait été fait. Marc voyait une ligne vide. */
  for(let _k=_i0;_k<G.aiActions.length;_k++){
    const _e=G.aiActions[_k]; if(!_e)continue;
    addLog('🤖 '+ai.civ.emoji+' '+ai.civ.name+' — '+(_e.emoji||'')+' '+_e.name+(_e.desc?(' : '+_e.desc):''),'dim');
  }
  _aiRec(_bA,_bR,_i0);}
  ai._milBoughtThisTurn=new Set(); // militaires : 1× par carte par tour (IA)
  {const _w0=_warOf(ai.civ.id);if(_w0)_w0._aiAssaultedThisTurn=false;} // reset : autorise un assaut ce tour
  const isPirate=ai.civ.id==='ceinturiens';
  const isMartien=ai.civ.id==='martiens';

  // Score d'un nœud pour décider quoi coloniser en priorité
  function nodeScore(nodeId){
    const n=NODES[nodeId];
    return (n.baseVP||0)*2+(n.res.materials||0)*1.2+(n.res.energy||0)*1.0+(n.res.science||0)*0.8+(n.strategic==='full'?3:n.strategic==='half'?1:0);
  }

  // Achète une carte tech en priorisant certaines branches
  function tryTech(priorityBranches,filterFn){
    if(ai.acLeft<1)return false;
    const allBranches=Object.keys(TECH_BRANCHES);
    const prio=priorityBranches||[];
    const rest=[ai.civ.techBonus,...allBranches.filter(b=>b!==ai.civ.techBonus&&!prio.includes(b))].filter(Boolean);
    const sorted=[...prio,...rest];
    for(const branch of sorted){
      const tier=(G.branchTiers[branch]||0)+1;
      const card=CARDS_POOL.find(c=>c.branch===branch&&c.tier===tier&&
        (!isTechExclusive(c)||!G.techTaken.has(c.id))&&
        !ai.cards.find(x=>x.id===c.id)&&
        (!filterFn||filterFn(c))&&
        (c.tier<3||ai.cards.some(x=>x.branch===c.branch&&x.tier===2)));
      if(!card||(card.branch==='empathes'&&!isEmpathesAvailableFor(ai)))continue;
      const acCost=card.tier===3?2:1;
      if(ai.acLeft<acCost)continue;
      const cost=getEffCost(card,ai);
      if(Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a)){
        ai.acLeft-=acCost;ai.spentThisTurn+=acCost+Object.values(cost).reduce((s,v)=>s+v,0);
        for(const[r,a]of Object.entries(cost))ai.res[r]-=a;
        ai.cards.push(card);applyCard(card,ai);
        if(isTechExclusive(card))G.techTaken.add(card.id);
        G.branchTiers[branch]=Math.max(G.branchTiers[branch]||0,card.tier);
        if(card.id==='dyson3')G._aiDysonBuilt=ai.civ.id; // mémo 9 : le joueur devra accepter ou déclarer la guerre
        addLog('🤖 '+ai.civ.name+' achète '+card.emoji+' '+card.name,'dim');
        G.aiActions.push({emoji:card.emoji,name:'Achète '+card.name,desc:card.effect});
        return true;
      }
    }
    for(const card of G.generalRiver){
      if(!card||G.techTaken.has(card.id))continue;
      if(filterFn&&!filterFn(card))continue;
      const cost=getEffCost(card,ai);
      if(Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a)){
        ai.acLeft--;for(const[r,a]of Object.entries(cost))ai.res[r]-=a;
        ai.cards.push(card);applyCard(card,ai);G.techTaken.add(card.id);
        const idx=G.generalRiver.findIndex(c=>c&&c.id===card.id);if(idx>=0)G.generalRiver[idx]=null;
        G.aiActions.push({emoji:card.emoji,name:'Achète '+card.name,desc:card.effect});
        return true;
      }
    }
    return false;
  }
  // ── Gestion du MORAL : récupération quand il est bas ──
  function _hasMorale(c){return (c.rGain&&c.rGain.morale>0)||(c.resGain&&c.resGain.morale>0);}
  function tryMoraleTech(){
    return tryTech(['spiritualite_nature','sciences_exp'],_hasMorale);
  }
  function tryMoraleUpgrade(){
    if(ai.acLeft<1)return false;
    const cands=ai.colonies.filter(c=>c.connected&&c.level===1&&!c.noUpgrade&&(c.nodeId==='callisto'||ATTRACTIVE_COLS.includes(c.nodeId)));
    for(const col of cands){
      const node=NODES[col.nodeId];if(!node||node.type==='orbital_station')continue;
      const ac=1,mat=3,en=1,sci=1; // Nv.1 → 2 (v18 : 1 AC fixe)
      if(ai.acLeft<ac||(ai.res.materials||0)<mat||(ai.res.energy||0)<en||(ai.res.science||0)<sci)continue;
      ai.acLeft-=ac;ai.res.materials-=mat;ai.res.energy-=en;ai.res.science-=sci;ai.spentThisTurn+=ac+mat+en+sci;
      col.level=2;
      const mBonus=col.nodeId==='callisto'?2:1;
      ai.res.morale=Math.min(8,(ai.res.morale||0)+mBonus);
      addLog('🤖 '+ai.civ.name+' améliore '+node.name+' Nv.2 (+'+mBonus+'<i class=ri-morale></i>)','dim');
      G.aiActions.push({emoji:'⬆️',name:'Améliore '+node.name,desc:'Nv.2 +'+mBonus+'<i class=ri-morale></i>'});
      return true;
    }
    return false;
  }

  /* ═══════ RELIER UNE COLONIE QUI N'EST PAS LA PORTE À CÔTÉ ═══════
     ⚠️ CETTE FONCTION NE SAVAIT CONSTRUIRE QU'UNE LIAISON DIRECTE : une colonie isolée n'était
     reliée que si elle touchait DÉJÀ une colonie connectée. À deux sauts du réseau, aucune route
     n'était jamais construite — ni ce tour-là, ni aucun autre. La colonie restait muette jusqu'à la
     fin de la partie, sans revenu, à demi-valeur en VP, et l'entretien continuait de courir.
     Mesuré : 34 colonies encore isolées sur 100 fondées, même après avoir rendu la route plus
     désirable que la colonisation. Rendre une action prioritaire ne sert à rien si elle est
     incapable de s'exécuter.

     MAINTENANT on cherche un CHEMIN court (3 sauts au plus) depuis le réseau déjà relié, et on pose
     la PREMIÈRE liaison manquante. Les tours suivants poseront les autres : c'est ainsi qu'un
     joueur construit une ligne, tronçon par tronçon. `updateConnections` propage le long des
     routes sans se soucier de qui possède les nœuds traversés — un relais sur un monde vide relie
     donc parfaitement. */
  function tryRoute(){
    if(ai.acLeft<1)return false;
    const matCost=hasSpec(ai,'route_disc')?0:1;
    if((ai.res.materials||0)<matCost)return false;
    // (plus de garde énergie : connecter une colonie est vital — une route non alimentée relie quand même la colonie, seul son bonus commercial est différé)
    const _existe=(a,b)=>!!ai.routes.find(r=>(r.from===a&&r.to===b)||(r.from===b&&r.to===a));
    const _poser=(a,b,cible)=>{
      ai.acLeft--;ai.res.materials=Math.max(0,(ai.res.materials||0)-matCost);ai.spentThisTurn+=1+matCost;
      const tok=ai.forceTokens>0?1:0;if(tok>0)ai.forceTokens--;
      ai.routes.push({from:a,to:b,tokens:tok});updateConnections(ai);
      const _nom=(NODES[cible]&&NODES[cible].name)||cible;
      const _etape=(b!==cible)?(' (via '+((NODES[b]&&NODES[b].name)||b)+')'):'';
      addLog('🤖 '+ai.civ.name+' route → '+_nom+_etape,'dim');
      G.aiActions.push({emoji:'🛤️',name:'Route → '+_nom+_etape,desc:tok?'1⚔ déployé':'non protégée'});
      return true;
    };
    /* Le réseau déjà relié : la base et tout ce que les routes atteignent. */
    const relie=new Set([ai.civ.home]);
    {const q=[ai.civ.home];
     while(q.length){const cur=q.shift();
       for(const r of ai.routes){const nx=r.from===cur?r.to:(r.to===cur?r.from:null);
         if(nx&&!relie.has(nx)){relie.add(nx);q.push(nx);}}}}
    /* Ce qu'on peut traverser : tout sauf le territoire d'autrui, sauf accord de transit. */
    const aAutrui=new Set();
    for(const p of allPlayers())if(p!==ai)for(const c of p.colonies)aAutrui.add(c.nodeId);
    const passable=id=>{
      const n=NODES[id]; if(!n||n.decorative)return false;
      if(relie.has(id))return true;
      return !aAutrui.has(id)||accordAvecMoi(id,ai);
    };
    const isolees=ai.colonies.filter(c=>!c.connected&&c.nodeId!==ai.civ.home);
    if(!isolees.length)return false;
    /* BFS depuis le réseau vers la colonie isolée la PLUS PROCHE — on relie d'abord le moins cher. */
    let meilleur=null;
    for(const col of isolees){
      const prec=new Map(), file=[];
      for(const id of relie){ prec.set(id,null); file.push(id); }
      let trouve=false;
      for(let i=0;i<file.length&&!trouve;i++){
        const cur=file[i];
        for(const adj of ((NODES[cur]&&NODES[cur].conn)||[])){
          if(prec.has(adj))continue;
          if(adj!==col.nodeId&&!passable(adj))continue;
          prec.set(adj,cur); file.push(adj);
          if(adj===col.nodeId){trouve=true;break;}
        }
      }
      if(!trouve)continue;
      /* Remonter jusqu'au premier tronçon manquant, en partant du réseau. */
      const chemin=[]; let n=col.nodeId;
      while(n!==null&&n!==undefined){ chemin.unshift(n); n=prec.get(n); }
      if(chemin.length<2||chemin.length>4)continue;         // 3 sauts au plus
      for(let k=0;k<chemin.length-1;k++){
        if(_existe(chemin[k],chemin[k+1]))continue;
        if(!meilleur||chemin.length<meilleur.long)
          meilleur={a:chemin[k], b:chemin[k+1], cible:col.nodeId, long:chemin.length};
        break;
      }
    }
    if(meilleur)return _poser(meilleur.a,meilleur.b,meilleur.cible);
    return false;
  }

  function tryColonize(){
    if(ai.acLeft<1)return false;
    const owned=new Set(ai.colonies.map(c=>c.nodeId));
    /* Les nœuds occupés par une AUTRE nation, humaine ou IA — même règle pour tout le monde.
       Avant : deux listes séparées, l'une pour « les humains », l'autre construite depuis `G.ais`
       (donc dépendante de qui était actif). Une seule liste, un seul critère : « ce n'est pas moi ». */
    const pOwned=new Set();for(const _h of allPlayers()){if(_h!==ai)for(const _c of _h.colonies)pOwned.add(_c.nodeId);}
    const otherAiOwned=pOwned;
    if(!ai.recentLosses)ai.recentLosses=new Map();
    for(const[nid,until]of ai.recentLosses)if(G.turn>=until)ai.recentLosses.delete(nid);
    /* ⚠️ UNE COLONIE EN TRAVERS DU CHEMIN ENFERMAIT L'IA POUR TOUTE LA PARTIE.
       Elle ne regardait que les nœuds DIRECTEMENT voisins de ses colonies. Que Cérès ou Vesta soit
       prise par quelqu'un d'autre, et elle n'avait plus rien à coloniser — alors qu'il restait de
       la place juste derrière. Mesuré avant correction : dans 7,9 % des tours, une nation n'avait
       AUCUN voisin libre mais un ou plusieurs nœuds libres à deux pas (`mesure_expansion_ia.js`).
       Elle voit maintenant plus loin. Un nœud éloigné vaut moins qu'un nœud collé — il faudra
       construire des routes pour le relier — d'où la pénalité par distance ; mais il vaut mieux
       qu'une nation immobile. Le réflexe « reconnecter une colonie isolée avant tout », déjà en
       place dans `chooseAndAct`, se charge ensuite de la rattacher au réseau. */
    const PORTEE_COLONISATION=2;   // un saut de plus que le voisinage immédiat, pas davantage
    let bestAdj=null,bestScore=-99,bestFrom=null;
    {
      /* Parcours en largeur depuis toutes ses colonies : `dist` donne le nombre de sauts. */
      /* ⚠️ NE VISER LOIN QUE PAR UN CHEMIN RÉELLEMENT PRATICABLE.
         Premier jet : portée 3, tous chemins confondus. Résultat mesuré — les routes tombent de 2,9
         à 1,5 par nation et les VP de 30 à 20. La raison : une route ne se construit qu'entre deux
         nœuds dont l'un est à soi (`tryRoute`), et le nœud intermédiaire appartenait justement à la
         nation qui bloquait. L'IA colonisait donc des mondes qu'elle ne pourrait JAMAIS relier —
         colonies isolées, sans revenu et à demi-valeur en VP. Coloniser loin sans pouvoir rattacher
         est pire que ne pas coloniser.
         On ne traverse donc que ce par quoi une route pourra passer : ses propres nœuds, les nœuds
         libres, et ceux sous accord commercial — le TRANSIT prévu par les règles. */
      const _traversable=id=>{
        if(owned.has(id))return true;
        if(accordAvecMoi(id,ai))return true;                                    // transit autorisé par MON accord
        return !pOwned.has(id);                                                 // libre
      };
      const dist=new Map(), file=[];
      for(const col of ai.colonies){ dist.set(col.nodeId,0); file.push(col.nodeId); }
      for(let i=0;i<file.length;i++){
        const id=file[i], d=dist.get(id);
        if(d>=PORTEE_COLONISATION)continue;
        if(d>0&&!_traversable(id))continue;      // cul-de-sac : on ne passera pas par là
        for(const v of (NODES[id]?.conn||[])){
          if(dist.has(v))continue;
          dist.set(v,d+1); file.push(v);
        }
      }
      for(const [adj,d] of dist){
        if(d===0)continue;                                   // c'est déjà une des siennes
        if(owned.has(adj)||ai.recentLosses.has(adj))continue;
        if(NODES[adj]?.decorative||NODES[adj]?.noColonize)continue; // Anneau jovien / Station Jupiter
        if(pOwned.has(adj)&&!accordAvecMoi(adj,ai))continue;
        if(otherAiOwned.has(adj))continue;                   // pas de double occupation
        /* Chaque saut supplémentaire coûte une route à construire : on décote en conséquence,
           sans interdire. Le voisin direct reste préféré à qualité égale. */
        const sc=nodeScore(adj)-(d-1)*2.5;
        if(sc>bestScore){bestScore=sc;bestAdj=adj;bestFrom=null;}
      }
    }
    if(!bestAdj)return false;
    const mat=isMartien?1:2,en=isMartien?0:1;
    if((ai.res.materials||0)<mat||(ai.res.energy||0)<en)return false;
    ai.acLeft--;ai.res.materials=Math.max(0,(ai.res.materials||0)-mat);
    ai.res.energy=Math.max(0,(ai.res.energy||0)-en);ai.spentThisTurn+=1+mat+en;
    const connected=checkConnected(bestAdj,ai);ai.colonies.push({nodeId:bestAdj,level:1,connected});
    updateConnections(ai);owned.add(bestAdj);
    addLog('🤖 '+ai.civ.name+' colonise '+NODES[bestAdj].name,'dim');
    G.aiActions.push({emoji:'🏗️',name:'Colonise '+NODES[bestAdj].name,desc:'Nv.1 (score:'+bestScore.toFixed(0)+')'});
    return true;
  }

  // Upgrade : choisit la colonie connectée avec le plus haut potentiel VP
  function tryUpgrade(){
    let bestCol=null,bestVal=-1;
    for(const col of ai.colonies){
      if(!col.connected||col.level>=3||col.noUpgrade)continue;
      const node=NODES[col.nodeId];if(node.type==='orbital_station')continue;
      const val=nodeScore(col.nodeId)*col.level;
      if(val>bestVal){bestVal=val;bestCol=col;}
    }
    if(!bestCol)return false;
    const node=NODES[bestCol.nodeId];
    const targetLv=bestCol.level+1;
    const ac=1,mat=3,en=1,sci=1;
    if(ai.acLeft<ac||(ai.res.materials||0)<mat||(ai.res.energy||0)<en||(ai.res.science||0)<sci)return false;
    ai.acLeft-=ac;ai.res.materials=Math.max(0,(ai.res.materials||0)-mat);
    ai.res.energy=Math.max(0,(ai.res.energy||0)-en);ai.res.science=Math.max(0,(ai.res.science||0)-sci);
    ai.spentThisTurn+=ac+mat+en+sci;bestCol.level=targetLv;
    addLog('🤖 '+ai.civ.name+' améliore '+node.name+' Nv.'+targetLv,'dim');
    G.aiActions.push({emoji:'⬆️',name:'Améliore '+node.name,desc:'Nv.'+targetLv});
    return true;
  }

  /* PROPOSER UN ACCORD COMMERCIAL — de sa propre initiative, pendant son tour.
     ⚠️ AUCUNE IA NE L'AVAIT JAMAIS FAIT. Le seul chemin vers `proposeAccord` était le clic du
     joueur sur une colonie : une IA pouvait accepter ou refuser, jamais engager. Elle subissait la
     diplomatie. C'est le dernier morceau du principe posé par Marc — « l'IA est une nation comme
     une autre ».
     Elle vise une colonie de la nation avec qui la tension est la plus forte parmi celles qui
     accepteraient : c'est là que l'accord rapporte le plus (−3 de tension des deux côtés, +1🪨
     +1🙂/tour, et fin d'une guerre s'il y en a une). */
  function tryAccord(){
    if(ai.acLeft<1||(ai.res.materials||0)<2)return false;
    if(typeof accordAcceptable!=='function')return false;
    const partenaires=allPlayers().filter(function(o){
      if(o===ai)return false;
      if(!o.colonies||!o.colonies.length)return false;
      if(!accordAcceptable(o,ai).ok)return false;        // il refuserait
      if(!accordAcceptable(ai,o).ok)return false;        // elle-même n'y a pas intérêt
      return o.colonies.some(function(c){return !accordAvecMoi(c.nodeId,ai);});
    }).sort(function(x,y){
      return (getTens(ai.civ.id,y.civ.id)+getTens(y.civ.id,ai.civ.id))
           - (getTens(ai.civ.id,x.civ.id)+getTens(x.civ.id,ai.civ.id));
    });
    if(!partenaires.length)return false;
    const cible=partenaires[0];
    /* On évite sa capitale : un accord sur la colonie mère est le plus mal vu, et c'est aussi ce
       qu'un joueur choisirait en dernier. */
    const col=cible.colonies.filter(function(c){return !accordAvecMoi(c.nodeId,ai);})
                            .sort(function(a,b){return (a.nodeId===cible.civ.home?1:0)-(b.nodeId===cible.civ.home?1:0);})[0];
    if(!col)return false;
    return proposeAccord(col.nodeId, ai)===true;
  }
  function tryRaid(){
    /* ⚠️ LE TEMPÉRAMENT DOIT ÊTRE RESPECTÉ MÊME HORS DU CALCUL D'UTILITÉ.
       Mettre `U.raid` et `U.raidAI` à zéro suffit tant que l'action passe par `chooseAndAct` — mais
       ces deux fonctions sont aussi atteignables par d'autres chemins (séquence de guerre, reprise
       de colonie). Un bâtisseur affichait donc encore des pillages résiduels. « Aucun raid » se
       vérifie ici, à l'entrée, là où aucun chemin ne peut la contourner. */
    if(ai._profil==='batisseur'||ai._profil==='guerrier')return false;
    const raidTok=isPirate?1:2;const raidEn=0;
    if(ai.acLeft<1||ai.forceTokens<raidTok)return false;
    if((ai._attacksThisTurn||0)>=1)return false; // max 1 action agressive/tour
    if(raidEn>0&&(ai.res.energy||0)<raidEn)return false;
    /* ⚠️ L'IA SE RUINAIT CONTRE UN MUR, TOUR APRÈS TOUR.
       L'immunité de la cible (IA Défensive) n'était constatée qu'APRÈS le paiement : 1 AC et 2
       jetons partaient, le raid ne rapportait rien, et l'IA recommençait au tour suivant. Vu dans
       la partie C06D : Terriens et Martiens ont gaspillé leur action à chaque tour du 6 au 10
       contre une nation immunisée — deux adversaires neutralisés sans que le joueur lève le petit
       doigt. Ça explique une bonne part d'une victoire à 158 VP contre 33, 43 et 46.
       Une IA regarde donc AVANT de payer, et se rabat sur une nation pillable s'il en existe une.
       Le joueur humain, lui, garde le droit de tenter un raid perdu d'avance : c'est son choix,
       et le journal le lui dit. */
    let _e=aiEnnemi(ai);
    const _pillable=n=>n&&n!==ai&&!hasSpec(n,'ia_immune')&&((n.res.energy||0)+(n.res.materials||0))>0
      &&!(typeof agressionInterditeEntre==='function'&&agressionInterditeEntre(ai,n,false));
    if(!_pillable(_e)){
      const _autres=(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[]))
        .filter(_pillable)
        .sort((a,b)=>((b.res.energy||0)+(b.res.materials||0))-((a.res.energy||0)+(a.res.materials||0)));
      if(!_autres.length)return false;      // personne à piller : l'IA fera autre chose de son AC
      _e=_autres[0];
    }
    if(!isPirate&&(ai.res.morale||0)<=2)return false; // self-intérêt : moral bas → l'IA se soigne au lieu de piller
    if(_e.res.energy+_e.res.materials<=0)return false;
    ai.acLeft--;ai.forceTokens-=raidTok;ai.forceCooldown.push({count:raidTok,returnTurn:getCooldownTurn(ai)});
    ai._attacksThisTurn=(ai._attacksThisTurn||0)+1;
    if(raidEn>0)ai.res.energy-=raidEn;
    ai.spentThisTurn+=1+raidTok+raidEn;
    const targets=['energy','materials'].filter(r=>(_e.res[r]||0)>0);let stolen=[];
    const maxSteal=hasSpec(_e,'ia_immune')?0:hasSpec(_e,'intel_1')?1:2;
    if(maxSteal===0){
      /* ⚠️ LE RAID BLOQUÉ COÛTE, MAIS LE JOURNAL NE LE DISAIT PAS.
         Le prélèvement a lieu quelques lignes plus haut — 1 AC et les jetons partent en récupération —
         puis cette branche sortait AVANT `G.aiActions.push(...)`. Dans le log de Marc, les Martiens
         semblaient donc raider gratuitement tour après tour : sept « raid bloqué » sans une seule
         ligne de coût. Le coût était bien payé ; rien ne le prouvait.
         On l'écrit, et on applique aussi la tension : subir une tentative de pillage fâche, qu'elle
         ait réussi ou non — elle était jusqu'ici sans conséquence diplomatique. */
      if(typeof marquerAgressee==='function')marquerAgressee(_e);   // même bloqué, un pillage se retient
      addLog('🛡️ IA Défensive de '+_e.civ.emoji+' '+_e.civ.name+' : raid de '+ai.civ.emoji+' '+ai.civ.name+' bloqué — il perd quand même 1 AC et '+raidTok+' jeton(s) (récupération).','gold');
      G.warRisk=Math.min(10,(G.warRisk||0)+1);
      addTens(_e.civ.id,ai.civ.id,1);
      /* ═══ LE PILLARD DOIT SAVOIR QU'IL SE COGNE À UN MUR ═══
         Marc, 24/08 : « la nation qui constate le blocage devrait pouvoir le savoir par un message
         pour pouvoir arrêter. » Sept raids bloqués d'affilée dans son journal — personne n'avait
         moyen d'apprendre. On retient donc l'information SUR LE PILLARD : une IA cesse d'essayer
         (voir la garde de `tryRaid`), et un joueur humain reçoit une notice. */
      ai._raidsImmunises=ai._raidsImmunises||{};
      ai._raidsImmunises[_e.civ.id]=G.turn;
      if(ai._isAI===false&&typeof notifyNationHit==='function')
        notifyNationHit(ai,'🛡️ Raid bloqué',
          _e.civ.emoji+' '+_e.civ.name+' possède l\'IA Défensive : ses colonies sont immunisées contre les raids. '
          +'Tes jetons partent en récupération sans butin — inutile de réessayer tant qu\'elle la possède.');
      G.aiActions.push({emoji:'🛡️',name:'Raid bloqué',desc:'−1 AC −'+raidTok+' jeton(s), aucun butin'});
      return true;
    }
    /* MÊME BUTIN QUE LE JOUEUR : la production d'un tour d'une colonie (voir `butinDeRaid`).
       ⚠️ Le raid de l'IA avait son PROPRE barème — deux ressources au hasard dans les stocks — et
       il serait resté en arrière du raid humain, qui vient de passer au vol de production. Une même
       règle, un même calcul, pour les deux camps. Le renseignement adverse (`intel_1`) protège
       toujours : il divise le butin par deux, l'IA Défensive l'annule (traité plus haut). */
    {
      const _b=butinDeRaid(_e,null);
      for(const _k in _b.butin){
        const _q=(maxSteal===1)?Math.ceil(_b.butin[_k]/2):_b.butin[_k];   // Drones Surveillance : moitié
        if(_q<=0)continue;
        _e.res[_k]=Math.max(0,(_e.res[_k]||0)-_q); ai.res[_k]=(ai.res[_k]||0)+_q;
        stolen.push('+'+_q+rEmoji(_k));
      }
      if(_b.col)addLog('💰 '+ai.civ.emoji+' '+ai.civ.name+' pille la production de '
        +((NODES[_b.col.nodeId]&&NODES[_b.col.nodeId].name)||_b.col.nodeId)+' chez '+_e.civ.emoji+' '+_e.civ.name+'.','red');
    }
    G.warRisk=Math.min(10,(G.warRisk||0)+2);
    addTens(_e.civ.id,ai.civ.id,5); // la victime en veut au pillard — +5 depuis le 2026-08-24
    addTens(ai.civ.id,_e.civ.id,1);
    if(!G._raidsThisTurn)G._raidsThisTurn=[];
    G._raidsThisTurn.push({civ:ai.civ,stolen:[...stolen]});
    if(!_e._raidsThisTurn)_e._raidsThisTurn=[]; // journal propre à la victime (bilan multijoueur)
    _e._raidsThisTurn.push({civ:ai.civ,stolen:[...stolen]});
    /* ⚠️ « TU PERDS » ÉTAIT ÉCRIT EN DUR. La cible d'un raid est la nation la plus PROCHE
       géographiquement (`_aiResolveTarget`), pas forcément le lecteur du journal. Quand une IA en
       pillait une autre, le journal annonçait donc à Marc que c'était LUI qui perdait les
       ressources — au point de fausser la lecture d'une partie entière (14 raids dans le log 0C10,
       dont on ne pouvait pas savoir combien le visaient réellement). On nomme la victime. */
    const _vic=(_e===G.player&&!G.player._isAI)?'Tu perds':(_e.civ.emoji+' '+_e.civ.name+' perd');
    addLog('🤖 Raid de '+ai.civ.emoji+' '+ai.civ.name+' ! '+_vic+' '+(stolen.join('')||'rien — coffres vides')+' (risque guerre +2, tension +2)','red');
    G.aiActions.push({emoji:'⚔️',name:'Raid',desc:'Vole : '+(stolen.join('')||'rien')});
    notifyNationHit(_e,ai.civ.name+' te pille',(stolen.length?'Ils volent '+_riToText(stolen.join(' '))+'.':'Raid sans butin.')+' Risque de guerre +2, tension +2.');
    return true;
  }

  // ══════════════ STRATÉGIE GLOBALE PAR CIVILISATION (voir SPEC_IA_strategie.md) ══════════════
  const t=G.turn;
  // Ceinturiens : tactique tirée au sort une fois — rush-tech OU mixte

  // ── Carte STRATÉGIE du tour (les IA en bénéficient aussi, choisie selon leur besoin) ──
  (function aiApplyStrat(){
    if(oneShot&&ai._aiSetupDone)return;
    // Carte déjà choisie au draft de début de tour (mémo #12) — on applique son effet.
    const card=ai._draftedStrat;ai._draftedStrat=null;if(!card)return;
    if(card.calmTension){const _eid=aiEnnemi(ai).civ.id;const cur=getTens(ai.civ.id,_eid);setTens(ai.civ.id,_eid,Math.max(0,cur-card.calmTension));}
    ai.stratBonus={acBonus:card.acBonus||0,spec:card.spec||null,combatBonus:card.combatBonus||0,upkeepDiscount:card.upkeepDiscount||0};
    if(card.acBonus)ai.acLeft+=card.acBonus;
    if(card.force)ai.forceTokens+=card.force;
    if(card.res){const cap=getResCapFor(ai);for(const[r,a]of Object.entries(card.res))ai.res[r]=Math.min(cap[r]||99,(ai.res[r]||0)+a);}
    if(card.warRisk)G.warRisk=Math.max(0,G.warRisk+card.warRisk);
    G.aiActions.push({emoji:card.emoji,name:'Stratégie : '+card.name,desc:card.desc});
  })();

  // ── Réflexe de PAIX : épuisée (moral bas) + en mauvaise posture → cessez-le-feu (stoppe la spirale) ──
  (function aiWarPolicy(){
    if(oneShot&&ai._aiSetupDone)return;
    const myWar=_warOf(ai.civ.id);
    if(!myWar)return;
    const _e=aiEnnemi(ai);
    const pForce=(ai._pForceEst!==undefined)?ai._pForceEst:(_e.forceTokens||0);
    const myForce=ai.forceTokens||0;
    const morale=ai.res.morale||0;
    const affordTok=Math.min(ai.res.materials||0,ai.res.energy||0);
    // Priorité : reprendre SA colonie perdue.
    let recap=myWar.aiRecaptureTarget;
    if(recap&&!_e.colonies.some(c=>c.nodeId===recap))recap=null;
    let target=recap,opportunistic=false;
    const aggressor=!!myWar.aiAggressor; // a déclaré la guerre (refus Dyson) → s'engage même en infériorité (au moins un assaut)
    const _domFactor=myWar.playerProvoked?1:1.3; // provoquée par ton attaque → riposte dès la PARITÉ ; sinon agression seulement si nettement dominante (2×)
    if(!target&&(aggressor||myForce>=_domFactor*Math.max(1,pForce))){
      // Pas de colonie à reprendre → contre-attaque si elle peut tenir (parité si provoquée, sinon 2× la force estimée du joueur).
      const cand=_e.colonies.filter(c=>c.nodeId!==_e.civ.home&&c.connected);
      if(cand.length){cand.sort((a,b)=>(a.level||1)-(b.level||1));target=cand[0].nodeId;opportunistic=true;}
    }
    // Chance de l'emporter : reprise → force projetée ≥ joueur ; opportuniste → déjà filtré par le 2×.
    const projForce=myForce+(myForce<=1?3:0)+ai.colonies.length;
    const winnable=!!target&&morale>=2&&affordTok>=1&&(opportunistic||projForce>=pForce);
    if(!winnable){
      // ADVERSAIRE HUMAIN : l'IA ne met PLUS FIN à la guerre toute seule (avant : endWar → « paix blanche »
      // automatique, le joueur ne pouvait jamais combattre — bug Marc après refus de la Sphère de Dyson).
      // Elle se contente de VOULOIR la paix ; le joueur tranchera dans la fenêtre de fin de tour (accepter ou
      // poursuivre, avec sa fenêtre d'attaque).
      /* ⚠️ LA PAIX SE DEMANDE, ELLE NE SE DÉCRÈTE PAS — ET CELA VAUT ENTRE IA AUSSI.
         Avant, une IA qui ne pouvait pas gagner mettait fin à la guerre TOUTE SEULE (« paix
         blanche ») dès que son adversaire était une autre IA ; face à un humain, elle devait
         demander. Deux poids, deux mesures : les guerres entre IA s'arrêtaient d'elles-mêmes,
         celles contre un joueur non. Désormais elle VEUT la paix, quel que soit l'adversaire ;
         c'est l'adversaire qui tranche (fenêtre pour un humain, `aiWarPolicy` pour une IA). */
      ai._wantsPeace=true;
      if(ai._isAI!==false) addLog('🕊️ '+ai.civ.emoji+' '+ai.civ.name+' cherche la paix avec '
        +(_e?_e.civ.emoji+' '+_e.civ.name:'son adversaire')+'.','dim');
      return;
      addLog('🕊️ '+ai.civ.emoji+' '+ai.civ.name+' propose la paix.','dim');
      return;
    }
    // Guerre jouable → conserver les ressources, monter en puissance, et assaillir dès que possible.
    /* CIBLE DE LA CONTRE-ATTAQUE (Marc, 2026-08-08) : la colonie qu'on vient de lui prendre, SAUF si
       une colonie ennemie de NIVEAU 3 est plus proche de son territoire — reprendre coûte le même
       AC, autant viser ce qui rapporte le plus. Sans colonie de niveau 3 chez l'ennemi, elle
       revient à la colonie perdue. La distance se mesure depuis SES propres colonies. */
    let _cible=target;
    try{
      if(aiEnnemi(ai)&&typeof getNodeDistance==='function'){
        const _dist=id=>Math.min(...(ai.colonies||[]).map(c=>{const d=getNodeDistance(c.nodeId,id);return (d==null||d<0)?99:d;}).concat([99]));
        const _nv3=(aiEnnemi(ai).colonies||[]).filter(c=>(c.level||1)>=3).map(c=>({id:c.nodeId,d:_dist(c.nodeId)})).sort((a,b)=>a.d-b.d)[0];
        if(_nv3 && (!target || _nv3.d < _dist(target))) _cible=_nv3.id;
      }
    }catch(e){}
    ai._warConserve=true;ai._warRecapture=_cible;ai._warAggressor=aggressor;
  })();
  // ── L'IA peut DÉTRUIRE une de tes routes non protégées (tactique de guerre, cap 2 attaques/tour) ──
  (function aiRouteRaid(){
    if(oneShot&&ai._aiSetupDone)return;
    const myWar=_warOf(ai.civ.id);
    if(!myWar)return;
    if((ai._attacksThisTurn||0)>=1||(ai.forceTokens||0)<1)return;
    const _e=aiEnnemi(ai);
    if(routesProtegeesParTech(_e))return; // routes tech-protégées — même règle que partout (2026-08-09 : `intel_2` manquait)
    const targets=_e.routes.filter(r=>(r.tokens||0)===0);
    if(!targets.length)return;
    if(Math.random()<0.5){
      const r=targets[Math.floor(Math.random()*targets.length)];
      ai._attacksThisTurn=(ai._attacksThisTurn||0)+1;
      resolveRouteAttack(ai,_e,r,1);
    }
  })();


  // ── Cartes civiques (forme de gouvernement / social) ──
  function tryCivic(){
    if(ai.acLeft<1)return false;
    if(!ai._civicTaken)ai._civicTaken=new Set();
    // 1) Adopter la forme de gouvernement qui améliore le plus (points + AC) si abordable
    let bestForm=null,bestVal=0;
    const curVal=(ai.govFormPts||0)+(ai.govFormAC||0)*6;
    /* ⚠️ AU PLAFOND, LES POINTS DE GOUVERNEMENT NE VALENT PLUS RIEN. Le niveau 4 s'atteint à 15
       points et c'est le maximum du jeu : au-delà, cinq points de plus n'apportent aucune AC. L'IA
       adoptait pourtant encore le Sénat Solaire pour 3🪨 — de l'argent brûlé, tour après tour.
       Seul le bonus d'AC (Tyrannie) garde de la valeur là-haut. */
    const _auPlafond=(ai.gov_pts||0)>=15;
    for(const f of CIVIC_MARKET){
      if(f.type!=='government'||f.id===ai.govForm||!f.govForm)continue;
      const cost=f.cost||{};if(!Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a))continue;
      const _pts=_auPlafond?0:(f.govForm.formPts||0);
      /* Le coût en moral fait partie du prix, au même titre que les 🪨 — voir `coutMoralForme`. */
      const val=_pts+(f.govForm.acBonus||0)*6-curVal-coutMoralForme(ai,f);
      if(val>bestVal){bestVal=val;bestForm=f;}
    }
    if(bestForm){aiBuyCivic(ai,bestForm);return true;}
    // 1b) Réforme Institutionnelle : +5 pts Gouv permanents (1×/partie) — viser un palier de gouvernement
    const _reform=CIVIC_MARKET.find(c=>c.id==='cm_reform');
    if(_reform&&!ai._civicTaken.has('cm_reform')&&(ai.gov_pts||0)<15){
      const _rc=_reform.cost||{};
      if(Object.entries(_rc).every(([r,a])=>(ai.res[r]||0)>=a)){aiBuyCivic(ai,_reform);return true;}
    }
    // 2) Moral bas → carte sociale de moral
    if((ai.res.morale||0)<=3){
      for(const c of CIVIC_MARKET){
        if(c.type!=='social'||c.calmAction||!(c.resGain&&c.resGain.morale))continue;
        if(!c.repeatable&&ai._civicTaken.has(c.id))continue;
        const cost=c.cost||{};if(Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a)){aiBuyCivic(ai,c);return true;}
      }
    }
    /* ═══ RÉCOLTER CE QUI MANQUE, PLUTÔT QUE D'ALLER LE PRENDRE CHEZ LES AUTRES ═══
       Demande de Marc, 2026-08-16 : « le bâtisseur préfère toujours récolter du He3, du minerai ou
       de la science pour arriver à faire ce qui est nécessaire. »
       Cette fonction ne savait produire QUE des matériaux (et du moral). Une nation à court
       d'énergie ou de savoir n'avait donc aucune façon de s'en procurer par le travail — il ne lui
       restait que le raid. Les trois cartes existent pourtant depuis toujours :
         ⚛️ Extraction d'He3        +2⚡   pour 1🪨 1🔬
         ☄️ Capture d'astéroïdes    +2🪨   pour 1⚡ 1🔬
         📖 Investissement Recherche +2🔬   pour 2🪨
       On récolte la ressource la plus basse d'abord — c'est elle qui bloque. */
    {
    if((ai._recoltesTour||0)<1){
      const _manque=[
        {r:'materials', v:(ai.res.materials||0)},
        {r:'energy',    v:(ai.res.energy||0)},
        {r:'science',   v:(ai.res.science||0)},
      ].filter(x=>x.v<=2).sort((x,y)=>x.v-y.v);
      for(const m of _manque){
        for(const c of CIVIC_MARKET){
          if(c.type!=='social'||c.calmAction)continue;
          if(!(c.resGain&&c.resGain[m.r]))continue;
          if(!c.repeatable&&ai._civicTaken.has(c.id))continue;
          const cost=c.cost||{};
          if(!Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a))continue;
          /* Ne pas s'appauvrir davantage : on refuse une récolte qui coûte la ressource qu'on
             cherche justement à reconstituer. */
          if((cost[m.r]||0)>0)continue;
          ai._recoltesTour=(ai._recoltesTour||0)+1;   // une seule récolte par tour (voir `_civicUtil`)
          aiBuyCivic(ai,c);return true;
        }
      }
    }
    }
    return false;
  }
  // ── Cartes militaires (renforts temporaires / Supercroiseur) ──
  function tryMilitary(){
    if(ai.acLeft<1)return false;
    const mils=(G.milRiver||[]).filter(c=>c);
    const atWar=!!_warOf(ai.civ.id);
    const militarist=ai.civ.id==='martiens'||ai.civ.id==='ceinturiens';
    const wantForce=atWar||militarist||(ai.forceTokens||0)<2||G.warRisk>=6;
    if(!wantForce)return false;
    const ownsCruiser=ai.cards.some(c=>c.id==='mil3');
    const cand=mils.filter(c=>{
      if(c.reqCard&&!ai.cards.some(x=>x.id===c.reqCard))return false;
      if(c.id==='mil3'&&ownsCruiser)return false;
      if(ai._milBoughtThisTurn&&ai._milBoughtThisTurn.has(c.id))return false; // 1× par carte par tour
      const ac=c.ac||1;if(ai.acLeft<ac)return false;
      const cost=getEffCost(c,ai);return Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a);
    });
    if(!cand.length)return false;
    cand.sort((a,b)=>((b.warForce||0)+(b.forceTemp||0))-((a.warForce||0)+(a.forceTemp||0)));
    aiBuyMilitary(ai,cand[0]);return true;
  }
  // ── IA CONTRE IA : raid (vol de ressources) sur une nation IA rivale proche ──
  function tryRaidAI(){
    /* ⚠️ LE TEMPÉRAMENT DOIT ÊTRE RESPECTÉ MÊME HORS DU CALCUL D'UTILITÉ.
       Mettre `U.raid` et `U.raidAI` à zéro suffit tant que l'action passe par `chooseAndAct` — mais
       ces deux fonctions sont aussi atteignables par d'autres chemins (séquence de guerre, reprise
       de colonie). Un bâtisseur affichait donc encore des pillages résiduels. « Aucun raid » se
       vérifie ici, à l'entrée, là où aucun chemin ne peut la contourner. */
    if(ai._profil==='batisseur'||ai._profil==='guerrier')return false;
    if(ai.acLeft<1)return false;
    if((ai._attacksThisTurn||0)>=1)return false; // max 2 actions agressives / manche / nation
    const raidTok=isPirate?1:2;
    if((ai.forceTokens||0)<raidTok)return false;
    const rivals=G.ais.filter(a=>a!==ai && a._isAI!==false && a.colonies.some(c=>c.nodeId!==a.civ.home && !NODES[c.nodeId]?.decorative));
    if(!rivals.length)return false;
    let best=null,bd=99;
    for(const r of rivals)for(const c of ai.colonies)for(const oc of r.colonies){const d=getNodeDistance(c.nodeId,oc.nodeId);if(d<bd){bd=d;best=r;}}
    if(!best||bd>2)return false;
    if(((best.res.energy||0)+(best.res.materials||0))<=0)return false;
    /* On a déjà buté sur son IA Défensive : inutile d'y laisser des jetons tour après tour.
       C'est la contrepartie du message envoyé au joueur — l'ordinateur, lui, s'en souvient. */
    if(ai._raidsImmunises&&ai._raidsImmunises[best.civ.id]!==undefined&&hasSpec(best,'ia_immune'))return false;
    ai.acLeft--;ai.forceTokens-=raidTok;ai.forceCooldown.push({count:raidTok,returnTurn:getCooldownTurn(ai)});ai.spentThisTurn+=1+raidTok;
    ai._attacksThisTurn=(ai._attacksThisTurn||0)+1;
    addTens(best.civ.id,ai.civ.id,5);addTens(ai.civ.id,best.civ.id,1);   // victime +5, pillard +1 (barème unique, 24/08)
    if(hasSpec(best,'ia_immune')){addLog('🛡️ '+best.civ.emoji+' '+best.civ.name+' (IA Défensive) bloque le raid de '+ai.civ.name+'.','dim');G.aiActions.push({emoji:'🛡️',name:'Raid bloqué',desc:'vs '+best.civ.name});return true;}
    const tgts=['energy','materials'].filter(r=>(best.res[r]||0)>0);const stolen=[];
    for(let i=0;i<2&&tgts.length;i++){const r=tgts[Math.floor(Math.random()*tgts.length)];best.res[r]=Math.max(0,(best.res[r]||0)-1);ai.res[r]=(ai.res[r]||0)+1;stolen.push(rEmoji(r));if(best.res[r]===0)tgts.splice(tgts.indexOf(r),1);}
    addLog('🤖 '+ai.civ.emoji+' '+ai.civ.name+' pille '+best.civ.emoji+' '+best.civ.name+' : '+(stolen.join('')||'rien')+' (tension +2)','red');
    G.aiActions.push({emoji:'⚔️',name:'Pille '+best.civ.name,desc:'Vole : '+(stolen.join('')||'rien')});
    return true;
  }
  /* ── ASSAUT D'UNE COLONIE VOISINE — CONTRE N'IMPORTE QUELLE NATION ──
     ⚠️ UNE IA NE POUVAIT ATTAQUER QU'UNE AUTRE IA, ET C'ÉTAIT LITTÉRAL. Cette boucle parcourait
     `G.ais` — qui ne contient JAMAIS le joueur actif — et rejetait en plus explicitement toute
     nation dont `_isAI===false`. Deux filtres, tous deux excluant les humains. Un joueur n'était
     donc jamais assailli de l'initiative d'une IA : seulement en reprise de colonie s'il avait
     lui-même déclaré la guerre, ou par guerre populaire à tension maximale.
     Marc, 2026-08-15 : « les IA m'attaquent jamais c'est trop facile. »

     CE QUI CHANGE. La cible peut être n'importe quelle nation voisine. Contre une IA, le combat se
     résout automatiquement comme avant. Contre un HUMAIN, on ne résout rien ici : l'IA DÉCLARE la
     guerre, et l'assaut passe par le chemin déjà éprouvé (`maybeAiAssaultPlayer`) qui ouvre au
     joueur sa fenêtre de défense — choix des jetons, supercroiseur. On ne lui prend pas une colonie
     sans qu'il ait pu répondre.

     ⚠️ LIMITE ASSUMÉE, ET IL FAUT LA CONNAÎTRE. `declareWar` construit la guerre entre `G.player` et
     la cible : elle ne sait pas exprimer une guerre entre deux nations dont aucune n'est la nation
     active. Une IA peut donc déclarer la guerre au joueur ACTIF (le cas solo, celui de Marc), pas
     encore à un second humain assis à la table. C'est la même maladie de perspective que partout
     ailleurs ; elle est ici circonscrite et signalée plutôt que contournée en silence. */
  function tryAssaultAI(){
    if(ai.acLeft<1)return false;
    if((ai._attacksThisTurn||0)>=1)return false;
    const affordTok=Math.min(ai.res.materials||0,ai.res.energy||0);
    const commit=Math.min(ai.forceTokens||0,affordTok,6);   // même plafond que dans `_assaultAIUtil`
    if(commit<1)return false;
    let best=null,bestCol=null,bestDef=99,bestSansDefense=false;
    /* ⚠️ L'ORDRE D'EXAMEN DES CIBLES NE DOIT RIEN DEVOIR À « QUI EST LA NATION ACTIVE ».
       `allPlayers()` rend `[G.player, ...G.ais]` : son ordre change donc selon la nation affichée.
       À égalité de défense — et les égalités sont fréquentes, la garnison valant 1 pour tout le
       monde — c'est la PREMIÈRE cible rencontrée qui l'emporte (`_rang < bestDef`, strict). La
       victime dépendait ainsi de la perspective : `test_equivalence.js` a montré une nation qui
       perdait Cérès ou la gardait selon qui était « actif », avec la même carte et le même hasard.
       C'est la maladie de fond décrite dans `ARCHITECTURE_AVENIR.md`, dans un endroit où elle ne se
       voyait pas tant que les assauts étaient rares. On fixe donc un ordre canonique — l'identifiant
       de civilisation — qui ne dépend de personne. */
    const _rivaux=allPlayers().filter(r=>r!==ai)
      .sort((x,y)=>String(x.civ.id).localeCompare(String(y.civ.id)));
    for(const r of _rivaux){
      /* Le pacte écarte la cible SANS journaliser : écrire un refus à chaque évaluation remplirait
         le journal de non-événements. L'IA se contente de regarder ailleurs, comme un joueur. */
      if(typeof agressionInterditeEntre==='function'&&agressionInterditeEntre(ai,r,false))continue;
      /* ⚠️ LA LIMITE « SEULEMENT LE JOUEUR ACTIF » EST LEVÉE (Marc, 2026-08-15). Elle n'existait que
         parce que `declareWar` ne savait construire qu'une guerre impliquant la nation active ;
         `declarerGuerre(agresseur, cible, …)` ne connaît plus que deux nations. Une IA peut donc
         viser n'importe qui : une autre IA, le joueur actif, ou un second humain. */
      if(r._isAI===false && _warBetween(ai.civ.id,r.civ.id))continue;   // déjà en guerre : la reprise s'en charge
      for(const oc of r.colonies){
        if(oc.nodeId===r.civ.home||!oc.connected||NODES[oc.nodeId]?.decorative)continue;
        /* ⚠️ L'IA S'INTERDISAIT CE QUE LE JOUEUR A LE DROIT DE FAIRE.
           Elle n'assaillait qu'une colonie VOISINE d'une des siennes. Cette contrainte n'existe
           nulle part dans les règles, et `attackColony` ne l'impose pas au joueur : il frappe où il
           veut. L'IA se privait donc de presque toutes ses cibles — mesuré 0,1 à 0,3 guerre par
           partie — et son tempérament conquérant ne servait à rien faute d'adversaire à portée.
           Règle unique pour tout le monde (décidé par Marc, 2026-08-16). */
        /* ⚠️ ON COMPARAIT SES JETONS À LA FORCE DE LA NATION, PAS À LA DÉFENSE DE LA COLONIE.
           `perceivedForce(ai,r).val` ignore la garnison (+1, toujours présente), le bonus de combat
           du défenseur et les cohabitants — les trois termes que `dPow` ajoutera au moment du combat.
           D'où les cinq égalités du journal de Marc, toutes perdues. Voir `defenseAttendue`. */
        const def=defenseAttendue(ai,r,oc.nodeId);const tens=getTens(ai.civ.id,r.civ.id);
        /* ═══ MÊME DOCTRINE QU'À L'ÉVALUATION — sinon l'action serait jugée bonne puis refusée.
           Une nation à court d'énergie OU de matériaux ne peut engager aucun jeton en défense
           (1🪨 + 1⚡ par jeton) : sa colonie n'a que sa garnison. Le conquérant qui possède le
           Réseau Orbital voit ces stocks et frappe là, en priorité absolue et à petit prix. */
        const _pf=(typeof profilActifDe==='function')?profilActifDe(ai):null;
        const _sansDefense=(_pf===PROFILS_IA.guerrier&&hasSpec(ai,'intel_2')
                            &&Math.min(r.res.energy||0,r.res.materials||0)<=0);
        if(!_sansDefense){
          /* ⚠️ NI LE TEMPÉRAMENT NI LA TENSION NE DISPENSENT DE L'ARITHMÉTIQUE.
             L'ancienne condition disait : le conquérant attaque dès la PARITÉ, les autres dès qu'ils
             sont plus forts — « ou si la tension dépasse 6 », auquel cas n'importe qui pouvait
             attaquer n'importe qui. Or la parité est une défaite (`aPow > dPow`), et une rancune ne
             fabrique pas de vaisseaux : cette clause lançait des assauts perdus d'avance.
             Il faut donc passer devant, pour tout le monde. Le tempérament garde son rôle ailleurs —
             il décide de l'ENVIE d'attaquer (multiplicateur `assaultAI`) et du choix de la cible,
             pas de la façon dont les additions se font.
             MESURÉ (`mesure_assauts_ia.js`, 12 parties) : en exigeant une marge de 2, 15 conquêtes ;
             avec +1, 18 conquêtes — et zéro défaite dans les deux cas. La prudence supplémentaire
             ne protégeait de rien, elle privait seulement l'IA de trois conquêtes. */
          if(commit+bonusCombatCartes(ai)<=def)continue;
        }
        /* Une cible à sec passe avant tout le reste : on lui donne une priorité artificiellement
           basse pour qu'elle gagne le classement, quel que soit son nombre de jetons affiché. */
        const _rang=_sansDefense?-1:def;
        if(_rang<bestDef){bestDef=_rang;best=r;bestCol=oc;bestSansDefense=_sansDefense;}
      }
    }
    if(!best)return false;
    /* ═══════ CIBLE HUMAINE : ON FRAPPE, ON N'ANNONCE PAS (Marc, 2026-08-25) ═══════
       ⚠️ CE BLOC PRÉVENAIT LA VICTIME, ET C'ÉTAIT UNE INVENTION DU CODE, PAS UNE RÈGLE.
       Il disait : « on déclare, on ne résout pas — la suite est celle qui existe déjà pour les
       guerres, inutile d'en écrire une seconde ». Une économie de moyens qui a produit trois
       anomalies, toutes visibles dans la partie DF6A :
         · une ANNONCE (« marche sur Ganymède — prépare ta défense ») qui n'existait que contre un
           humain : contre une IA, le même code résolvait le combat sur-le-champ ;
         · une GUERRE DÉCLARÉE avant le premier coup, à l'envers de la règle — c'est l'attaque qui
           déclenche la guerre, pas l'inverse ;
         · et surtout, une échappatoire : une guerre fraîche où l'on n'est pas l'agresseur ouvre
           d'abord la FENÊTRE DE PAIX (`guerreEtapeFraiche`). Marc a accepté la paix au tour 4,
           l'assaut annoncé s'est évaporé sans qu'un jeton soit engagé, et le cycle a recommencé au
           tour 7. Prévenu, puis autorisé à annuler : une IA ne pouvait littéralement rien prendre.
       Marc, 25/08 : « soit on attaque une colonie par surprise et après l'autre te déclare la
       guerre — pas parce qu'il le veut mais parce que c'est une réponse obligatoire — soit on ne
       fait pas la guerre. Il faut que les joueurs et les IA soient traités sur pied d'égalité. »

       C'est exactement ce que fait déjà `playerAssaultColony` quand TU attaques : la guerre s'ouvre
       DANS l'assaut, `justDeclared` est retombé aussitôt, et la fenêtre de combat s'ouvre. On
       calque, à la lettre. La seule différence légitime demeure : l'humain choisit ses jetons de
       DÉFENSE dans une fenêtre (`showAiAssaultDefenseModal`) au lieu de subir un calcul. */
    if(best._isAI===false){
      const _nom=(NODES[bestCol.nodeId]&&NODES[bestCol.nodeId].name)||bestCol.nodeId;
      G._warFocusColony=bestCol.nodeId;
      let _w=_warBetween(ai.civ.id,best.civ.id);
      if(!_w){
        /* Voie GÉNÉRALE : deux nations nommées, quelle que soit celle qui est active. */
        if(!declarerGuerre(ai,best,'Assaut surprise sur '+_nom+' !','ai'))return false;
        _w=_warBetween(ai.civ.id,best.civ.id);
      }
      if(!_w)return false;
      /* Mêmes drapeaux que du côté humain : la guerre est LIVE et n'est plus « fraîche », donc la
         fin de tour ne proposera pas la paix avant qu'un coup ait été porté. */
      _w.live=true; _w.justDeclared=false; _w.turnsLeft=99;
      _w.aiAggressor=true;            // elle a pris l'initiative : elle s'engage vraiment
      _w._aiAssaultedThisTurn=false;  // …et c'est CET assaut-ci qu'on autorise
      ai.acLeft=Math.max(0,ai.acLeft-1); ai._attacksThisTurn=(ai._attacksThisTurn||0)+1;
      /* La rétrocession vaut pour TOUT LE MONDE : une IA qui frappe pendant sa phase d'actions cède
         elle aussi l'initiative du soir. Sans cette ligne, la règle n'aurait puni que le joueur —
         ce qui n'est pas une règle, c'est un handicap. */
      if(typeof noterAssautDuTour==='function') noterAssautDuTour(_w,ai.civ.id);
      addLog('⚔️ '+ai.civ.emoji+' '+ai.civ.name+' frappe '+_nom+' par surprise !','red');
      G.aiActions.push({emoji:'⚔️',name:'Assaut sur '+_nom,desc:'frappe surprise'});
      /* La fenêtre de défense s'ouvre chez l'assailli et le combat se résout dans la foulée.
         Pas de suite nommée : on n'est pas dans la séquence de fin de tour, l'IA poursuit son tour
         comme après une proposition d'accord (`proposeAccord`), qui emprunte déjà ce chemin. */
      maybeAiAssaultPlayer(ai,null,best,bestCol.nodeId);
      return true;
    }
    const tens=getTens(ai.civ.id,best.civ.id);
    const aEmpath=bonusCombatCartes(ai);
    const dEmpath=bonusCombatCartes(best);
    const dCommit=Math.max(0,Math.min(best.forceTokens||0,best.res.materials||0,best.res.energy||0));
    /* ⚠️ ON COMPTE D'ABORD, ON ENGAGE ENSUITE. Cette boucle appelait `applyCombatEngage` au moment
       même où elle additionnait les renforts. Tant que l'assaut avait lieu de toute façon, cela ne
       se voyait pas ; depuis qu'il peut être ABANDONNÉ (voir juste en dessous), des cohabitants
       auraient payé leurs jetons pour un combat qui n'a pas eu lieu. Deux passes : le décompte,
       puis l'engagement — et il ne peut plus y avoir de facture sans bataille. */
    const _renforts=[];
    let _renfortIA=0;
    for(const _co of defenseursDuNoeud(bestCol.nodeId,ai)){
      if(_co===best)continue;
      const _j=Math.max(0,Math.min(_co.forceTokens||0,_co.res.materials||0,_co.res.energy||0));
      const _b=(typeof bonusCombatCartes==='function')?bonusCombatCartes(_co):0;
      if(_j+_b<=0)continue;
      _renfortIA+=_j+_b; _renforts.push({co:_co,j:_j,b:_b});
    }
    /* ═══ CONTRE UNE NATION À SEC, ON N'ENGAGE QUE CE QU'IL FAUT ═══
       Doctrine de Marc : « elle attaque une colonie avec deux jetons ». Face à un défenseur qui ne
       peut rien engager, il n'y a que la garnison (1) et les éventuels cohabitants : inutile d'y
       jeter six jetons, ils partiraient en récupération pour rien. Ce qui reste sert à la cible
       suivante — c'est tout l'intérêt d'économiser ses jetons plutôt que de raider. */
    /* ═══ LE CHIFFRE QUI FAIT BASCULER LE COMBAT, POUR TOUT LE MONDE ═══
       `_requis` = la défense réelle, moins notre propre bonus, plus un — puisque `aPow > dPow` et
       que l'égalité revient au défenseur. Ce calcul n'existait QUE pour la cible à sec ; partout
       ailleurs l'IA engageait `commit`, c'est-à-dire tout ce qu'elle avait, sans jamais vérifier
       que cela suffisait. En dessous de `_requis`, l'assaut est perdu d'avance ; au-dessus, les
       jetons en trop partent en récupération sans rien acheter. */
    const _defReelle=dCommit+dEmpath+1/*garnison*/+_renfortIA;
    const _requis=_defReelle-aEmpath+1;
    let _engage=Math.max(2,Math.min(commit,Math.max(2,_requis)));
    /* ⚠️ ON RENONCE PLUTÔT QUE D'OFFRIR SES JETONS. La défense réelle peut dépasser l'estimation
       faite au moment du choix (le défenseur paie plus de jetons qu'on ne lui en prêtait). Avant,
       l'IA y allait quand même : cinq assauts, cinq égalités, cinq défaites, 13 jetons perdus
       (journal de Marc, 16/08). Renoncer ne coûte rien — ni AC, ni jeton — et l'IA gardera de quoi
       se défendre, ce qui était l'autre moitié du problème. */
    if(_engage+aEmpath<=_defReelle){
      addLog('🧠 '+ai.civ.emoji+' '+ai.civ.name+' renonce à l\'assaut sur '
        +((NODES[bestCol.nodeId]&&NODES[bestCol.nodeId].name)||bestCol.nodeId)
        +' — défense trop forte ('+_defReelle+'🛡️ contre '+(commit+aEmpath)+'⚔️ disponibles).','dim');
      return false;
    }
    for(const _r of _renforts){
      if(typeof applyCombatEngage==='function')applyCombatEngage(_r.co,_r.j,false);
      addLog('🤝 '+_r.co.civ.emoji+' '+_r.co.civ.name+' défend '+((NODES[bestCol.nodeId]&&NODES[bestCol.nodeId].name)||bestCol.nodeId)
        +' aux côtés de '+best.civ.emoji+' '+best.civ.name+' (+'+(_r.j+_r.b)+'⚔️) — cohabitants.','gold');
    }
    if(bestSansDefense&&_engage<commit)
      addLog('🎯 '+ai.civ.emoji+' '+ai.civ.name+' frappe '+((NODES[bestCol.nodeId]&&NODES[bestCol.nodeId].name)||bestCol.nodeId)
        +' — '+best.civ.name+' est à court de ressources et ne peut pas défendre ('+_engage+' jeton(s) suffisent).','gold');
    const aPow=_engage+aEmpath,dPow=dCommit+dEmpath+1/*garnison de base*/+_renfortIA;
    ai.acLeft=Math.max(0,ai.acLeft-1);ai.spentThisTurn+=1+_engage;ai._attacksThisTurn=(ai._attacksThisTurn||0)+1;
    const win=aPow>dPow;
    applyCombatEngage(ai,_engage,win);if(dCommit>0)applyCombatEngage(best,dCommit,!win);
    addTens(ai.civ.id,best.civ.id,1);addTens(best.civ.id,ai.civ.id,3);
    const node=NODES[bestCol.nodeId];
    if(win){
      /* ⚠️ CE CHEMIN N'AVAIT AUCUN GARDE-FOU. `ai.colonies.push(...)` était inconditionnel : une IA
         qui cohabitait déjà sur ce nœud s'y retrouvait avec DEUX colonies, comptées deux fois en
         points de victoire. Mesuré, pas supposé (`mesure_cohabitation.js`). Une seule capture pour
         tout le monde, désormais. */
      const newLvl=capturerNoeud(ai,bestCol.nodeId);
      addLog('🏴 '+ai.civ.emoji+' '+ai.civ.name+' capture '+(node?node.name:bestCol.nodeId)+' sur '+best.civ.emoji+' '+best.civ.name+' ('+aPow+'⚔️ vs '+dPow+'🛡️, Nv.'+newLvl+')','red');
      G.aiActions.push({emoji:'🏴',name:'Capture '+(node?node.name:bestCol.nodeId),desc:'sur '+best.civ.name+' — '+aPow+'⚔️ vs '+dPow+'🛡️'});
    }else{
      ai.res.morale=Math.max(0,(ai.res.morale||0)-1);
      addLog('🛡️ '+best.civ.emoji+' '+best.civ.name+' repousse l\'assaut de '+ai.civ.emoji+' '+ai.civ.name+' ('+aPow+'⚔️ vs '+dPow+'🛡️)','gold');
      G.aiActions.push({emoji:'🛡️',name:'Assaut repoussé par '+best.civ.name,desc:aPow+'⚔️ vs '+dPow+'🛡️'});
    }
    return true;
  }

  // ── Boucle d'exécution ──
  function tryRecaptureAssault(){
    if(!ai._warRecapture)return false;
    // EN LIGNE : la reprise pendant le tour d'action de l'IA se résout de façon INVISIBLE (défense auto, non routée).
    // On la DIFFÈRE au chemin de fin de manche (maybeAiAssaultPlayer), qui t'affiche la fenêtre de défense et
    // te laisse choisir tes jetons. (En solo _decisionActive()=false → comportement inchangé.)
    if(typeof _decisionActive==='function'&&_decisionActive())return false;
    const targetId=ai._warRecapture;
    if(!aiEnnemi(ai).colonies.some(c=>c.nodeId===targetId)){ai._warRecapture=null;return false;}
    if(ai.acLeft<1)return false;
    const pForce=(ai._pForceEst!==undefined)?ai._pForceEst:(aiEnnemi(ai).forceTokens||0);
    const affordTok=Math.min(ai.res.materials||0,ai.res.energy||0);
    const commit=Math.min(ai.forceTokens,affordTok);
    if(commit<1)return false;
    if(!ai._warAggressor&&commit<Math.max(1,Math.ceil(pForce*0.7)))return false; // non-agresseur : contre-attaque dès ~70% de la force adverse (plus agressif). Agresseur : frappe même en infériorité.
    resolveAiAssault(ai,targetId,commit);return true;
  }
  // ══════════════ CERVEAU À UTILITÉ ══════════════
  // Plus de listes de priorités fixes ni de tactiques tirées au sort : à chaque action,
  // l'IA estime la VALEUR ATTENDUE de chaque type d'action et joue la meilleure. Les raids
  // sont désormais une option de faible valeur, choisie seulement s'il ne reste rien de mieux à bâtir.
  /* ⚠️ DEUX ENDROITS POSAIENT LA MÊME QUESTION, ET UN SEUL A ÉTÉ CORRIGÉ D'ABORD.
     Cette fonction calcule l'UTILITÉ de coloniser ; `tryColonize` EXÉCUTE. J'ai commencé par
     élargir la portée dans l'exécution — sans effet mesurable, parce que l'utilité, elle, ne voyait
     toujours que les voisins directs : elle valait 0, l'action n'était donc jamais tentée et le
     code élargi jamais atteint. Les deux doivent regarder aussi loin l'un que l'autre. */
  function _bestColonizeScore(){
    const owned=new Set(ai.colonies.map(c=>c.nodeId));
    const otherOwned=new Set();for(const p of allPlayers())if(p!==ai)for(const c of p.colonies)otherOwned.add(c.nodeId);
    const PORTEE=2;
    const trav=id=>owned.has(id)||accordAvecMoi(id,ai)||!otherOwned.has(id);   // même règle qu'à l'exécution
    const dist=new Map(), file=[];
    for(const col of ai.colonies){ dist.set(col.nodeId,0); file.push(col.nodeId); }
    for(let i=0;i<file.length;i++){
      const id=file[i], d=dist.get(id);
      if(d>=PORTEE)continue;
      if(d>0&&!trav(id))continue;   // même règle de traversée qu'à l'exécution
      for(const v of (NODES[id]?.conn||[])){ if(dist.has(v))continue; dist.set(v,d+1); file.push(v); }
    }
    let best=-1;
    for(const [adj,d] of dist){
      if(d===0)continue;
      if(owned.has(adj)||otherOwned.has(adj)||NODES[adj]?.decorative||NODES[adj]?.noColonize)continue;
      if(ai.recentLosses&&ai.recentLosses.has(adj))continue;
      const s=nodeScore(adj)-(d-1)*2.5;   // même décote par saut que dans `tryColonize`
      if(s>best)best=s;
    }
    return best;
  }
  function _bestUpgradeVal(){
    let best=-1;
    for(const col of ai.colonies){if(!col.connected||col.level>=3||col.noUpgrade)continue;const n=NODES[col.nodeId];if(!n||n.type==='orbital_station')continue;const v=nodeScore(col.nodeId)*col.level;if(v>best)best=v;}
    return best;
  }
  function _affordableTechVP(){ // meilleure VP d'une tech ACHETABLE maintenant, sinon -1
    let best=-1;
    for(const branch of Object.keys(TECH_BRANCHES)){
      const tier=(G.branchTiers[branch]||0)+1;
      const card=CARDS_POOL.find(c=>c.branch===branch&&c.tier===tier&&(!isTechExclusive(c)||!G.techTaken.has(c.id))&&!ai.cards.find(x=>x.id===c.id)&&(c.tier<3||ai.cards.some(x=>x.branch===c.branch&&x.tier===2)));
      if(!card||(card.branch==='empathes'&&!isEmpathesAvailableFor(ai)))continue;
      const acCost=card.tier===3?2:1;if(ai.acLeft<acCost)continue;
      const cost=getEffCost(card,ai);if(!Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a))continue;
      if((card.vp||0)>best)best=(card.vp||0);
    }
    return best;
  }
  function _econBranches(){
    /* ⚠️ UNE NATION ATTAQUÉE CHANGE DE PRIORITÉS (Marc, 2026-08-08).
       Tant qu'elle est en guerre ou qu'une nation lui est hostile, elle vise d'abord
       « navigation » (IA de Navigation : coût de guerre divisé par deux) puis « ia_renseignement »
       (Réseau Orbital : la force adverse EXACTE, donc une défense au juste nécessaire — et IA
       Défensive, qui protège ses routes). Sans ces deux branches, sa nouvelle défense reste aveugle
       et chère : elle surévalue de 3 à chaque combat et paie plein tarif.
       Ce n'est pas un abandon de son économie — l'ordre normal suit derrière. */
    const _normal =
      (ai.civ.id==='jupiteriens') ? ['mines_energie','sciences_exp'] :
      (ai.civ.id==='ceinturiens') ? ['sciences_exp','navigation'] :
      (isMartien)                 ? ['navigation','expansion','mines_energie'] :
                                    ['expansion','sciences_exp','navigation'];
    /* ═══ LE CONQUÉRANT CHERCHE D'ABORD À VOIR, PUIS À FRAPPER À BAS COÛT ═══
       Doctrine de Marc : « si je suis bloqué dans mon développement et que j'ai le moins de
       colonies, je prends Réseau Orbital en premier pour savoir qui je peux attaquer, puis IA
       Défensive si possible, et aussi IA de Navigation. »
       Le Réseau Orbital est ce qui lui donne les stocks EXACTS des rivales : sans lui, il ne peut
       pas savoir qu'une nation est tombée à zéro énergie, donc pas choisir le moment. IA Défensive
       est dans la même branche (rang 3) et protège ses routes ; la Navigation divise son coût de
       guerre par deux. Les branches d'énergie suivent — il lui faut de quoi payer ses assauts —
       et le reste est dédaigné sans être abandonné. */
    const _pf=(typeof profilActifDe==='function')?profilActifDe(ai):null;
    if(_pf===PROFILS_IA.guerrier){
      const _guerrier=['ia_renseignement','navigation','mines_energie'];
      return _guerrier.concat(_normal.filter(b=>_guerrier.indexOf(b)<0));
    }
    let _menacee=false;
    try{ _menacee=!!(aiEnnemi(ai) || (typeof _warOf==='function' && _warOf(ai.civ.id)) || (ai._warAggressor)); }catch(e){}
    if(!_menacee) return _normal;
    const _guerre=['navigation','ia_renseignement'];
    return _guerre.concat(_normal.filter(b=>_guerre.indexOf(b)<0));
  }
  function _raidUtil(){
    const _e=aiEnnemi(ai);if(!_e)return 0;
    const tok=isPirate?1:2;if((ai.forceTokens||0)<tok)return 0;
    if(((_e.res.energy||0)+(_e.res.materials||0))<=0)return 0;
    if(!isPirate&&(ai.res.morale||0)<=2)return 0;
    let v=isPirate?3:1.5; // valeur de base FAIBLE (avant : raid quasi systématique)
    v+=Math.min(3,((_e.res.energy||0)+(_e.res.materials||0))*0.15);
    const lead=Math.max(...allPlayers().map(p=>calcVP(p).total));
    if(calcVP(_e).total>=lead)v+=2.5; // harceler le leader
    if(G.turn<=3)v-=4; // début : bâtir d'abord
    return Math.max(0,v);
  }
  function _raidAIUtil(){
    const tok=isPirate?1:2;if((ai.forceTokens||0)<tok)return 0;
    if((ai._attacksThisTurn||0)>=1)return 0;
    let rich=-1;
    for(const r of G.ais){if(r===ai||r._isAI===false)continue;for(const c of ai.colonies)for(const oc of r.colonies){if(getNodeDistance(c.nodeId,oc.nodeId)<=2)rich=Math.max(rich,(r.res.energy||0)+(r.res.materials||0));}}
    if(rich<=0)return 0;
    let v=isPirate?3:1.5;v+=Math.min(2.5,rich*0.12);if(G.turn<=3)v-=4;return Math.max(0,v);
  }
  /* ⚠️ L'ASSAUT PERDAIT TOUJOURS LE CLASSEMENT, ET C'ÉTAIT LA VRAIE CAUSE. Il valait 6, ou 9 à
     tension haute — quand coloniser vaut 15 à 25. Une IA préférait donc TOUJOURS poser une colonie
     de plus, tant qu'il restait un nœud libre. Mesuré le 2026-08-15 : huit activations d'affilée,
     tension à 9, joueur à un seul jeton et colonie adjacente — huit colonisations, aucun assaut.
     C'est pour cela qu'aucun assaut entre IA n'apparaît dans le journal de la partie C071 non plus.
     La valeur monte donc au niveau des autres actions, et grandit avec l'écart de force et la
     tension : une nation nettement supérieure et remontée attaque, une nation à parité hésite. */
  function _valeurAssaut(commit,def,tens){
    const avantage=Math.max(0,commit-def);          // à quel point on domine
    return Math.min(26, 11 + avantage*2.5 + (tens>=6?5:0) + (tens>=9?3:0));
  }
  function _assaultAIUtil(){
    if((ai._attacksThisTurn||0)>=1)return 0;
    /* ⚠️ LE PLAFOND DE 3 JETONS RENDAIT L'ASSAUT IMPOSSIBLE CONTRE UN JOUEUR. L'IA compare son
       engagement à la force PERÇUE de l'adversaire : plafonnée à 3, elle jugeait « trop fort » tout
       joueur ayant 4 jetons — c'est-à-dire à peu près tout le monde. Elle engage désormais jusqu'à
       6 jetons, comme un joueur qui monte un vrai assaut. */
    const affordTok=Math.min(ai.res.materials||0,ai.res.energy||0);const commit=Math.min(ai.forceTokens||0,affordTok,6);
    if(commit<1)return 0;
    /* ⚠️ CETTE UTILITÉ EXCLUAIT LES HUMAINS, ELLE AUSSI. Corriger `tryAssaultAI` sans corriger ce
       calcul n'aurait rien changé : l'action n'aurait jamais été jugée digne d'être tentée, donc
       jamais appelée. Deux endroits pour une même question — voir le bandeau de `tryAssaultAI`. */
    for(const r of allPlayers()){
      if(r===ai)continue;
      if(r._isAI===false && _warBetween(ai.civ.id,r.civ.id))continue;   // même condition qu'à l'exécution
      for(const oc of r.colonies){if(oc.nodeId===r.civ.home||!oc.connected||NODES[oc.nodeId]?.decorative)continue;/* même règle qu'à l'exécution : plus de contrainte d'adjacence */const def=defenseAttendue(ai,r,oc.nodeId);const tens=getTens(ai.civ.id,r.civ.id);
        /* ⚠️ UNE NATION BELLIQUEUSE N'ATTEND PAS D'ÊTRE SÛRE DE GAGNER. La condition « je dois avoir
           STRICTEMENT plus de jetons que sa force perçue » convient à une nation prudente ; appliquée
           à toutes, elle rendait l'assaut presque introuvable — mesuré : 0,1 guerre par partie.
           Un profil conquérant, ou une nation qu'on vient d'agresser, se contente de la parité et
           d'une tension moindre. Les autres gardent l'exigence d'origine. */
        const _pf=(typeof profilActifDe==='function')?profilActifDe(ai):null;
        /* ═══ FRAPPER QUI NE PEUT PLUS SE DÉFENDRE ═══
           Doctrine de Marc : « qu'elle attaque avec peu de jetons les nations qui n'ont plus
           d'énergie ou de minerai, plutôt en fin de tour. Dès qu'une nation est à zéro énergie — ce
           qu'elle ne peut savoir qu'avec le Réseau Orbital — elle attaque une colonie avec deux
           jetons. »
           C'est exactement le raisonnement d'un joueur : engager des jetons en défense coûte
           1🪨 + 1⚡ chacun. Une nation à sec ne peut RIEN engager — sa colonie n'est protégée que
           par sa garnison, et deux jetons suffisent à la prendre.
           ⚠️ ET ELLE NE PEUT LE SAVOIR QU'AVEC LE RENSEIGNEMENT. Sans Réseau Orbital, les stocks
           d'une rivale lui sont cachés (§14.7 des règles) : lire `r.res` sans cette technologie
           serait de la triche, et retirerait tout intérêt à la brancher en premier. */
        if(_pf===PROFILS_IA.guerrier&&hasSpec(ai,'intel_2')){
          const _sec=Math.min(r.res.energy||0,r.res.materials||0)<=0;
          if(_sec){
            /* Peu de jetons suffisent : on garde le reste pour la cible suivante. */
            const _petit=Math.min(commit,Math.max(2,def+1));
            return Math.max(_valeurAssaut(_petit,0,tens), 24);
          }
        }
        /* MÊME ARITHMÉTIQUE QU'À L'EXÉCUTION — sinon l'action est jugée bonne ici puis refusée
           là-bas, et l'IA perd son tour à vouloir une chose qu'elle s'interdira. La parité
           (`commit>=def`) valait acceptation ici et DÉFAITE au combat ; `||tens>=_seuilTens`
           autorisait carrément l'assaut perdu d'avance. Une seule règle : passer devant. */
        if(commit+bonusCombatCartes(ai)>def)return _valeurAssaut(commit,def,tens);}}
    return 0;
  }
  function _civicUtil(){
    let v=0;const curVal=(ai.govFormPts||0)+(ai.govFormAC||0)*6;
    for(const f of (typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[])){if(f.type!=='government'||f.id===ai.govForm||!f.govForm)continue;const cost=f.cost||{};if(!Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a))continue;const val=(f.govForm.formPts||0)+(f.govForm.acBonus||0)*6-curVal-coutMoralForme(ai,f);if(val>0)v=Math.max(v,6+val*0.4);}
    const _reform=(typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[]).find(c=>c.id==='cm_reform');
    if(_reform&&!(ai._civicTaken&&ai._civicTaken.has('cm_reform'))&&(ai.gov_pts||0)<15){const rc=_reform.cost||{};if(Object.entries(rc).every(([r,a])=>(ai.res[r]||0)>=a))v=Math.max(v,10);}
    if((ai.res.morale||0)<=3)v=Math.max(v,7);
    /* La récolte vaut d'autant plus que la ressource manquante est basse : à 0 elle bloque tout,
       à 3 elle commence seulement à gêner. Sans cette ligne, `tryCivic` savait récolter mais
       n'était jamais choisi — le calcul d'utilité ne connaissait que les formes de gouvernement. */
    {
      const _bas=Math.min(ai.res.materials||0,ai.res.energy||0,ai.res.science||0);
      /* ⚠️ LA RÉCOLTE SERT À SE DÉBLOQUER, PAS À OCCUPER SES ACTIONS. Sans plafond, elle repassait
         en tête à chaque action du tour : le Jupitérien de la partie FDDD a acheté DIX fois
         ☄️ Capture d'astéroïdes et CINQ fois 📖 Investissement dans la Recherche, pour une seule
         colonisation, une amélioration et zéro route en dix tours. Marc : « le jupitérien fait rien
         plusieurs tours de suite se contentant d'accumuler des réserves ».
         Une récolte par tour suffit à sortir d'une pénurie ; au-delà, c'est du remplissage. Et le
         seuil descend de 3 à 2 : à 3 d'une ressource on est gêné, pas bloqué. */
      if(_bas<=2&&(ai._recoltesTour||0)<1){
        const _rec=(typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[]).some(c=>
          c.type==='social'&&!c.calmAction&&c.resGain&&(c.repeatable||!(ai._civicTaken&&ai._civicTaken.has(c.id)))
          &&Object.entries(c.cost||{}).every(([r,a])=>(ai.res[r]||0)>=a));
        if(_rec)v=Math.max(v,10+(3-_bas)*3);
      }
    }
    return v;
  }
  function _militaryUtil(){
    const atWar=!!_warOf(ai.civ.id);
    if(!(atWar||G.warRisk>=6||(ai.forceTokens||0)<2||isMartien))return 0;
    return (ai.forceTokens||0)<2?9:(atWar?8:5);
  }
  function _accordUtil(){
    if(ai.acLeft<1||(ai.res.materials||0)<2)return 0;
    const tens=Math.max.apply(null,[0].concat(allPlayers().filter(function(o){return o!==ai;})
      .map(function(o){return getTens(o.civ.id,ai.civ.id);})));
    /* ⚠️ LE FREIN NE FREINAIT PAS. Je comptais les accords posés SUR MES colonies — or une IA qui
       propose signe sur la colonie de l'AUTRE : son compteur restait à zéro et elle proposait sans
       fin. Mesuré : 83 accords sur 8 parties, moral moyen +60 %. On compte les accords dont elle
       est SIGNATAIRE (`accordsDe`), et on plafonne : au-delà de trois, un accord de plus n'est plus
       une priorité de tour. */
    const mesAccords=(typeof accordsDe==='function')?accordsDe(ai).length:0;
    if(mesAccords>=3)return 0;
    if(tens<3&&mesAccords>0)return 0;                    // tranquille et déjà lié : rien d'urgent
    return Math.min(11, 3+tens*1.4-mesAccords*3);
  }
  /* ═══ UNE COLONIE NON CONNECTÉE NE PRODUIT RIEN ═══
     ⚠️ CETTE VALEUR ÉTAIT PLATE, ET ELLE PERDAIT LA COURSE. 18, quel que soit le nombre de colonies
     à l'abandon — alors que `U.colonize` monte facilement à 25-35 (score du nœud ×1,5, prime de
     début de partie, bonus « peu de colonies », retard en VP). L'IA préférait donc TOUJOURS fonder
     une colonie de plus plutôt que de relier celles qu'elle avait.
     Mesuré chez Marc, partie FDDD du 23/08 : le Martien fonde Ganymède, Europe et Pluton au tour 1
     et ne construit sa PREMIÈRE route qu'au tour 7 — trois colonies muettes pendant six tours,
     qui coûtent leur entretien sans rien rapporter. Score final : 1 point de routes.
     La valeur croît maintenant avec le nombre de colonies isolées : à trois, relier devient
     l'affaire la plus rentable de la partie, et c'est exactement ce qu'un joueur ferait. */
  function _routeUtil(){
    const _iso=ai.colonies.filter(c=>!c.connected&&c.nodeId!==ai.civ.home).length;
    if(!_iso||(ai.res.materials||0)<1)return 0;
    return 18+_iso*8;                                   // 26 · 34 · 42…
  }
  function actionUtilities(){
    const t=G.turn,mor=ai.res.morale||0,mat=ai.res.materials||0,en=ai.res.energy||0,sci=ai.res.science||0,nCol=ai.colonies.length;
    const lead=Math.max(...allPlayers().map(p=>calcVP(p).total)),myVP=calcVP(ai).total,behind=Math.max(0,lead-myVP);
    const U={};
    U.heal    = mor<=2 ? 60 : 0;                          // survie d'abord
    const cs=_bestColonizeScore(),colAff=mat>=(isMartien?1:2)&&en>=(isMartien?0:1);
    U.colonize= (cs>=0&&colAff)?(cs*1.5+(t<=3?7:0)+Math.max(0,6-nCol)*2+behind*0.3):0;
    /* ⚠️ ON NE FONDE PAS UNE QUATRIÈME VILLE QUAND TROIS N'ONT PAS DE ROUTE. Relever la valeur de
       la route ne suffisait pas : les deux actions se disputent les mêmes matériaux, et la
       colonisation gardait l'avantage grâce à ses primes cumulées. On l'amortit donc tant que des
       colonies restent isolées — ce n'est pas une interdiction : une nation bloquée de tous côtés
       peut encore préférer s'étendre au loin, elle le fera simplement en connaissance de cause. */
    const _iso=ai.colonies.filter(c=>!c.connected&&c.nodeId!==ai.civ.home).length;
    if(_iso>0) U.colonize*= (_iso>=2?0.25:0.6);
    const uv=_bestUpgradeVal(),upAff=mat>=3&&en>=1&&sci>=1;
    U.upgrade = (uv>=0&&upAff)?(uv*1.0+(t>=7?9:2)):0;
    const tv=_affordableTechVP();
    U.tech    = tv>=0?(8+tv*2.5+(sci>=6?4:0)+behind*0.4):0;
    U.route   = _routeUtil();
    U.civic   = _civicUtil();
    U.military= _militaryUtil();
    U.raid    = _raidUtil();
    U.raidAI  = _raidAIUtil();
    U.assaultAI=_assaultAIUtil();
    /* L'ACCORD VAUT D'AUTANT PLUS QUE LA TENSION EST HAUTE. Une nation isolée et détestée a plus
       besoin d'un partenaire qu'une nation tranquille — c'est exactement le raisonnement d'un
       joueur, et c'est ce qui empêche les IA de rester spectatrices de la diplomatie. */
    U.accord  = _accordUtil();
    return U;
  }
  /* ═══════ LE PROFIL DE L'IA PONDÈRE SES ENVIES ═══════
     Les utilités ci-dessus disent ce qu'une action RAPPORTE. Le profil dit ce que cette nation-là
     AIME faire. On multiplie, on ne remplace pas : une IA bâtisseuse acculée peut toujours se
     battre, elle le fera simplement plus tard et moins volontiers qu'une guerrière.
     Voir `PROFILS_IA` pour les trois tempéraments et `profilActifDe()` pour la bascule d'une nation
     agressée. */
  function _appliquerProfil(U){
    const prof=(typeof profilActifDe==='function')?profilActifDe(ai):null;
    if(!prof||!prof.mult)return U;
    for(const k of Object.keys(U)) if(prof.mult[k]!==undefined) U[k]=U[k]*prof.mult[k];
    /* ⚠️ « AUCUN RAID » VEUT DIRE AUCUN, MÊME EN ÉTAT DE SIÈGE. L'état `assiegee` remonte le raid à
       1,4 pour permettre une riposte — un bâtisseur agressé se remettait donc à piller, et le
       compteur ne descendait jamais tout à fait à zéro. Son tempérament de fond prime : il se
       défend et il construit, il ne pille pas. Le conquérant, lui, garde ce zéro par doctrine. */
    const _base=ai._profil;
    if(_base==='batisseur'||_base==='guerrier'){ U.raid=0; U.raidAI=0; }
    /* BESOIN DE RESSOURCES → ON PRODUIT, ON NE PILLE PAS (demande de Marc, 2026-08-16).
       Une IA à court cherchait à se refaire par le raid, ce qui coûte 1 AC et 2 jetons pour deux
       ressources au mieux. Les actions Économie & Société donnent autant pour moins cher et sans
       s'attirer d'ennemis. Quand la caisse est basse, elles passent devant. */
    const _pauvre=Math.min(ai.res.materials||0, ai.res.energy||0)<=2;
    if(_pauvre){ U.civic=(U.civic||0)+9; U.raid=(U.raid||0)*0.3; U.raidAI=(U.raidAI||0)*0.3; }
    return U;
  }
  const execMap={
    heal:()=>tryMoraleTech()||tryMoraleUpgrade(),
    colonize:tryColonize, upgrade:tryUpgrade, route:tryRoute,
    tech:()=>tryTech(_econBranches()),
    civic:tryCivic, military:tryMilitary,
    raid:tryRaid, raidAI:tryRaidAI, assaultAI:tryAssaultAI,
    accord:tryAccord
  };
  // RÉSERVE DE GUERRE (comportement d'un joueur humain) : quand elle est EN GUERRE, l'IA ne dépense plus
  // jusqu'à zéro — elle garde de quoi PAYER sa défense (1🪨 +1⚡ par jeton engagé). Avant, elle finissait
  // à 0⚡ et se faisait conquérir sans opposer la moindre résistance.
  function _warReserve(){
    if(!_warOf(ai.civ.id))return 0;                    // pas en guerre → pas de réserve
    return Math.max(2,Math.min(6,ai.forceTokens||0));  // de quoi engager ses jetons (plafonné)
  }
  function _belowReserve(){
    const r=_warReserve(); if(!r)return false;
    return Math.min(ai.res.materials||0, ai.res.energy||0) <= r;
  }
  function chooseAndAct(){
    // Reconnecter une colonie isolée reste toujours le réflexe prioritaire.
    if(ai.colonies.some(c=>!c.connected&&c.nodeId!==ai.civ.home)&&tryRoute())return true;
    // En guerre et trésorerie basse → on THÉSAURISE (on ne dépense pas ce qui servira à se défendre).
    if(_belowReserve())return false;
    /* ⚠️ LA TABLE DE NOTES N'EST CALCULÉE QUE SI LE CERVEAU LA DEMANDE. Marc, 27/08 : « je préfère
       un système qui n'a pas de notes sur les actions préalables ». Le cerveau `tacticien` n'en veut
       pas — et grâce à ces accesseurs paresseux, elle ne tourne même pas quand il joue. Les anciens
       cerveaux, eux, continuent d'y accéder normalement. C'est la façon de la retirer sans casser
       le témoin qui sert à la mesurer. */
    let _U=null;
    const utilites=function(){ if(_U===null)_U=_appliquerProfil(actionUtilities()); return _U; };
    const ctx={
      nation: ai,
      get utilites(){ return utilites(); },
      get classees(){ const U=utilites(); return Object.keys(U).filter(k=>U[k]>0).sort((a,b)=>U[b]-U[a]); },
      executer: function(k){ return !!(execMap[k]&&execMap[k]()); },
      /* Les deux seules portes dont le tacticien a besoin : « que puis-je jouer ? » et « joue-le ». */
      coups: function(){ return coupsPossibles(ai); },
      jouer: function(c){ return appliquerCoup(ai,c); }
    };
    return !!cerveauCourant()(ctx);
  }
  ai._aiSetupDone=true;
  if(oneShot){ // INTERLACÉ : UNE action puis la main tourne
    if(ai.acLeft<=0) return false;
    if(ai._warConserve) return _aiStep(tryRecaptureAssault);
    return _aiStep(chooseAndAct);
  }
  if(ai._warConserve){
    // En guerre jouable : conserver les ressources pour frapper au maximum.
    for(let s=0;s<4&&ai.acLeft>0;s++){if(!_aiStep(tryRecaptureAssault))break;}
    ai.acLeft=0;return;
  }
  for(let safety=0;safety<16&&ai.acLeft>0;safety++){ if(!_aiStep(chooseAndAct))break; }
  ai.acLeft=0;
}
/* ============================================================ VP ============================================================ */
/* ═══ LE DÉTAIL DE CHAQUE POSTE, PAS SEULEMENT SON TOTAL ═══
   Marc, 2026-08-25 : « il faut mettre dans le calcul de points les règles qui expliquent ça, et le
   calcul complet des points pour chaque élément calculé ».
   Chaque poste renseigne donc une liste de lignes montrant SON ARITHMÉTIQUE — colonie par colonie,
   carte par carte, ressource par ressource. C'est gratuit : les nombres sont déjà là au moment du
   calcul, on cessait simplement de les écrire. Un total qu'on ne peut pas vérifier n'explique rien,
   et c'est précisément ce qui a fait douter Marc de la comptabilité du jeu. */
function calcVP(p){
  const det={colonies:[],routes:[],cartes:[],tech:[],rpt:[],agenda:[],evt:[]};
  // Colonies : baseVP×niveau×connexion + 1 bonus par colonie connectée
  let colVP=0;
  for(const col of p.colonies){
    const node=NODES[col.nodeId];
    if(node.decorative)continue; // nœuds décoratifs (anneau jovien) — jamais en colonie
    // Pirates : Éris et Pluton comptent baseVP:2 au niveau 1 (le premium est gagné en développant)
    // Jupitériens : Jupiter (J-1) donne son baseVP normalement comme home
    const effectiveBVP=(p.civ.id==='ceinturiens'&&col.level===1&&['eris','pluto'].includes(col.nodeId))?2:node.baseVP;
    const _base=Math.round(effectiveBVP*col.level*(col.connected?1:0.5));
    const _liaison=(col.connected?1:0);
    colVP+=_base+_liaison;
    det.colonies.push((node.name||col.nodeId)+' Nv.'+col.level+' : '+effectiveBVP+' (nœud) × '+col.level
      +' (niveau) × '+(col.connected?'1 (connectée)':'0,5 (isolée)')+' = '+_base
      +(_liaison?' +1 (liaison) ':' ')+'→ '+(_base+_liaison)
      +(effectiveBVP!==node.baseVP?'  [Ceinturiens : '+ (node.name||col.nodeId) +' vaut 2 au niveau 1]':''));
  }
  // Routes : 1 VP par route établie (incite l'IA à construire des routes)
  const routeVP=p.routes.length;
  if(routeVP)det.routes.push(routeVP+' route(s) × 1 = '+routeVP+'   ('
    +p.routes.map(r=>((NODES[r.from]&&NODES[r.from].name)||r.from)+'→'+((NODES[r.to]&&NODES[r.to].name)||r.to)).join(', ')+')');
  const cardsVP=p.cards.reduce((s,c)=>s+(c.vp||0),0);
  for(const c of p.cards){ if(c&&c.vp) det.cartes.push((c.emoji||'')+' '+(c.name||c.id)+' (niveau '+(c.tier||'?')+') : +'+c.vp); }
  /* ═══ « TECHNOLOGIE » VOULAIT DIRE DEUX CHOSES DIFFÉRENTES ═══
     ⚠️ DÉFAUT VU DANS LA PARTIE 792D. Ce bonus comptait les cartes de `type === 'technology'` :
     douze cartes sur les vingt-et-une que l'arbre technologique propose. Partout ailleurs — agenda
     « Superpuissance Tech. », espionnage, tension « deux technologies de niveau 3 » — une
     technologie est une carte qui porte une BRANCHE. Marc avait onze cartes à branche et n'en
     voyait que quatre comptées : Biosphère Autonome, Végétalisation, Exploitations d'Astéroïdes,
     Éveil Collectif sont des technologies pour les règles, invisibles pour ce seul calcul.
     Le joueur compte ses cartes ; le jeu doit compter les mêmes. C'est la branche qui fait foi. */
  const _nbTech=p.cards.filter(c=>!!c.branch).length;
  const techBonusVP=Math.floor(_nbTech*0.5);
  if(_nbTech)det.tech.push(_nbTech+' technologie(s) × 0,5 = '+String(_nbTech*0.5).replace('.',',')+' → '+techBonusVP+' (arrondi à l\'inférieur)');
  // Bonus revenus/tour (rpt) v6 : par ressource — rpt>5→+2VP, rpt>10→+5VP
  let rptVP=0;
  for(const r of['energy','materials','science','morale']){const v=p.rpt[r]||0;const _g=v>10?5:v>5?2:0;rptVP+=_g;
    /* ⚠️ `rEmoji` rend une BALISE HTML, que le rapport texte supprime : la ligne s'affichait
       « · 6/tour → +2 », sans dire de quelle ressource il s'agissait. On écrit le nom en clair —
       un rapport lisible ne doit rien devoir au CSS. */
    if(_g)det.rpt.push((typeof rLabel==='function'?rLabel(r):r)+' : '+v+'/tour → +'+_g+(v>10?' (au-delà de 10/tour)':' (au-delà de 5/tour)'));}
  let agendasVP=p.agenda&&typeof p.agenda.score==='function'?p.agenda.score(p):0;
  /* La description d'agenda contient déjà « → +8 VP » : on ne le répète pas, on dit seulement si
     la condition est remplie. */
  if(p.agenda)det.agenda.push((p.agenda.emoji||'')+' '+(p.agenda.name||'?')+' — '+(p.agenda.desc||'')
    +(agendasVP>0?'  ✔ condition remplie':'  ✘ condition NON remplie'));
  const evtVP=p.tempVP||0;
  /* Le détail des VP d'événement est tenu au fil de la partie par `gagnerVP` : on ne fait ici que
     le recopier. Les parties commencées avant cette version n'en ont pas — on le dit plutôt que de
     laisser croire à une erreur. */
  if(Array.isArray(p._vpDetail)&&p._vpDetail.length){
    for(const e of p._vpDetail) det.evt.push('T'+(e.tour||'?')+' — '+e.raison+' : +'+e.n);
  } else if(evtVP) det.evt.push('+'+evtVP+' au total (détail non enregistré : partie commencée avant la v9.82)');
  /* ═══ « BONUS DIVERS » NE VEUT RIEN DIRE POUR CELUI QUI LE LIT ═══
     Marc, partie 140A : « dans le décompte des points de fin de partie, c'est pas clair pourquoi »
     et « les bonus spéciaux en particulier c'est pas clair, faut expliquer pourquoi ». Le calcul
     savait exactement d'où venait chaque point ; il n'en gardait que la somme. On conserve donc le
     DÉTAIL au fil du calcul — c'est gratuit, et cela évite de reconstituer après coup un
     raisonnement qu'on vient de faire. */
  let extraVP=0; const extraDetail=[];
  if(hasSpec(p,'extrasolar')&&p.cards.filter(c=>!!c.branch).length>=5){
    extraVP+=8; extraDetail.push('🚀 Exploration Extra-Solaire : +8 (au moins 5 technologies)'); }
  if(hasSpec(p,'colony_vp')){
    const _n=p.colonies.filter(c=>c.connected).length;
    extraVP+=_n; extraDetail.push('✨ Éveil Collectif : +1 par colonie connectée (×'+_n+')'); }
  if(p.bonusVP){ extraDetail.push('🗺️ Découvertes : +'+p.bonusVP); }   // déjà compté dans evtVP/tempVP selon le chemin
  const forceVP=0; // supprimé v6
  return{colVP,routeVP,cardsVP,techBonusVP,rptVP,forceVP,agendasVP,evtVP,extraVP,extraDetail,det,
    total:colVP+routeVP+cardsVP+techBonusVP+rptVP+agendasVP+evtVP+extraVP};
}
// ── Log de partie : construction + copier / email / télécharger (en jeu ET à la fin) ──
// Rapport lisible : chaque action de chaque nation avec coûts + gain, groupée par tour,
// puis le calcul final des points de victoire. Émojis de guerre seulement.
function buildJournalReport(){
  const L=[];
  L.push('=== SOLAR — RAPPORT DE PARTIE ===');
  try{
    L.push('Nations : '+G.player.civ.name+' (toi) vs '+G.ais.map(a=>a.civ.name).join(', '));
    if(G.phase==='over'){const pv=calcVP(G.player).total,av=Math.max(...G.ais.map(a=>calcVP(a).total));L.push('Résultat : '+(pv>=av?'VICTOIRE':'DÉFAITE')+' — '+pv+' VP contre '+av+' VP');}
    else L.push('Partie en cours — tour '+G.turn+'/'+G.maxTurns);
  }catch(e){}
  L.push('');
  const J=G._journal||[];
  const maxT=J.reduce((m,e)=>Math.max(m,e.turn||0),G.turn||0);
  for(let t=1;t<=maxT;t++){
    const ents=J.filter(e=>e.turn===t);
    if(!ents.length)continue;
    L.push('───────── TOUR '+t+' ─────────');
    for(const e of ents){
      const nat=e.nat||'?';
      const ct=_costToText(e.cost);
      let cost='';
      if(e.ac>0&&ct)cost=e.ac+' AC, '+ct;
      else if(e.ac>0)cost=e.ac+' AC';
      else if(ct)cost=ct;
      else if(!e.auto)cost='gratuit';
      const pre=e.war?'⚔️ ':(e.auto?'⚙️ ':'');
      let line=pre+'['+nat+'] '+(e.name||'action');
      if(cost)line+=' — '+cost;
      if(e.gain)line+=' → '+e.gain;
      L.push(line);
    }
    L.push('');
  }
  L.push('═════ CALCUL FINAL DES POINTS DE VICTOIRE ═════');
  const all=[G.player].concat(G.ais||[]);
  for(const p of all){
    let v;try{v=calcVP(p);}catch(e){continue;}
    const isP=p===G.player;
    L.push('');
    L.push('▶ '+p.civ.name+(isP?' (toi)':' (IA)')+' — TOTAL '+v.total+' VP');
    /* ⚠️ SOLO ET EN LIGNE DOIVENT DIRE LA MÊME CHOSE. Ce rapport-ci se contentait de trois lignes de
       totaux pendant que le rapport du serveur détaillait tout : deux chemins, deux vérités, et un
       joueur qui ne comprend pas pourquoi son score change de forme selon l'écran. Même détail des
       deux côtés, tiré du même `calcVP().det`. */
    const _d=v.det||{};
    const _bloc=(titre,valeur,regle,lignes,siVide)=>{
      L.push('   '+titre+' : '+(valeur||0)+'   ['+regle+']');
      const _L=(lignes&&lignes.length)?lignes:(siVide?[siVide]:[]);
      for(const x of _L)L.push('      · '+String(x).replace(/<[^>]+>/g,''));
    };
    _bloc('Colonies',v.colVP,'VP du nœud × niveau, ×1 si connectée, ×0,5 si isolée, +1 par colonie reliée',_d.colonies,'aucune colonie');
    _bloc('Routes',v.routeVP,'+1 VP par route établie',_d.routes,'aucune route établie');
    _bloc('Cartes',v.cardsVP,'VP inscrit sur la carte — technologies : 1 au niveau 1, 3 au niveau 2, 5 au niveau 3 · cartes militaires : valeur propre',_d.cartes,'aucune carte porteuse de VP');
    _bloc('Bonus technologiques',v.techBonusVP,'+0,5 VP par technologie (toute carte de l\'arbre technologique), arrondi à l\'inférieur',_d.tech,
      'aucune carte de l\'arbre technologique');
    _bloc('Revenus par tour',v.rptVP,'par ressource : +2 au-delà de 5/tour, +5 au-delà de 10/tour',_d.rpt,
      'aucune ressource ne dépasse 5 de revenu par tour');
    _bloc('Agenda'+(p.agenda&&p.agenda.name?' ('+p.agenda.name+')':''),v.agendasVP,
      (v.agendasVP>0?'condition remplie':'condition NON remplie'),_d.agenda,'aucun agenda secret enregistré');
    _bloc('Événements',v.evtVP,'événements, victoires de combat (+2 chacune), découvertes, accords',_d.evt,
      'aucun événement, combat gagné, découverte ni accord n\'a rapporté de point');
    _bloc('Bonus divers',v.extraVP,'bonus de technologies particulières (Extra-Solaire, Éveil Collectif) et découvertes',
      v.extraDetail,'aucun — aucune de ces technologies n\'a été acquise, ou leur condition n\'est pas remplie');
    L.push('   '+'─'.repeat(50));
    L.push('   TOTAL : '+v.total+'   [somme des huit postes ci-dessus]');
  }
  /* La trajectoire et les décisions des IA — voir `_analyseTexte`. Placées APRÈS le décompte, pour
     que le lecteur pressé trouve d'abord son score, et l'enquêteur ce qu'il lui faut ensuite. */
  try{ for(const l of _analyseTexte())L.push(l); }catch(e){}
  return L.join('\n');
}
function buildFullLog(){ return buildJournalReport(); }
// Couleur fixe d'une nation (même couleur qu'en jeu, via civ.color) à partir de son nom.
function _natColorByName(name){
  try{for(const p of [G.player,...(G.ais||[])]){if(p&&p.civ&&p.civ.name===name)return p.civ.color;}}catch(e){}
  return '#8faacc'; // Système / inconnu
}
function _esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
// Même rapport que buildJournalReport mais en HTML coloré (chaque nation dans SA couleur).
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LA SECTION « ANALYSE » DU RAPPORT — CE QUE LE JOURNAL SEUL NE DIT PAS
   ----------------------------------------------------------------------------------------------
   Marc, 27/08 : « veille à ce que le fichier debug puisse être efficace dans le recueil
   d'informations pour que ça nous serve. Pas juste le journal d'une partie. »

   Le journal raconte CE QUI s'est passé. Il ne dit pas comment chaque nation a progressé tour après
   tour, ni pourquoi une IA a préféré un coup à un autre. Ces deux manques ont coûté plusieurs
   sessions d'enquête à l'aveugle. Deux tableaux les comblent :
     · la TRAJECTOIRE — une ligne par nation et par tour : VP, ressources, colonies, en guerre ou
       non. On y lit d'un coup d'œil qui décroche, à quel tour et sur quelle ressource ;
     · les DÉCISIONS de l'IA — le coup retenu, sa note, le dauphin et l'écart. C'est ce qui distingue
       « elle a tranché franchement » de « ça s'est joué à un dixième de point ».
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function _analyseTexte(){
  const L=[];
  const photos=(G&&G._photos)||[], trace=(G&&G._traceIA)||[];
  L.push('');
  L.push('═══════════ ANALYSE — TRAJECTOIRE DES NATIONS ═══════════');
  L.push('(par tour : VP · ⚡🪨🔬❤️ · colonies/routes/cartes · jetons · ⚔ si en guerre)');
  if(!photos.length)L.push('  (aucune photo — partie trop courte ou version antérieure)');
  else{
    const tours=[...new Set(photos.map(x=>x.t))].sort((a,b)=>a-b);
    for(const t of tours){
      L.push('  Tour '+t);
      for(const x of photos.filter(y=>y.t===t)){
        L.push('    '+String(x.nat).padEnd(12)+' VP '+String(x.vp).padStart(3)
          +'  '+String(x.e).padStart(2)+'⚡ '+String(x.m).padStart(2)+'🪨 '+String(x.s).padStart(2)+'🔬 '+String(x.mo).padStart(2)+'❤️'
          +'  '+x.col+' col / '+x.rt+' rt / '+x.ca+' cartes  '+String(x.jt).padStart(2)+' jetons'
          +(x.guerre?'  ⚔ EN GUERRE':''));
      }
    }
  }
  L.push('');
  L.push('═══════════ ANALYSE — DÉCISIONS DES IA ═══════════');
  L.push('(coup retenu · sa note · le dauphin et sa note · nombre de coups réellement évalués)');
  L.push('Cerveau : '+((typeof nomCerveauCourant==='function')?nomCerveauCourant():'?'));
  if(!trace.length)L.push('  (aucune décision tracée — cerveau historique, ou partie sans IA)');
  else{
    for(const d of trace){
      const ecart=(d.val2===null||d.val2===undefined)?null:Math.round((d.val-d.val2)*10)/10;
      L.push('  T'+String(d.t).padStart(2)+' '+String(d.nat).padEnd(12)
        +' → '+String(d.choix).padEnd(34)+' ('+d.val+')'
        +(d.second?('   dauphin : '+d.second+' ('+d.val2+', écart '+ecart+')'):'')
        +'   ['+d.evalues+'/'+d.proposes+' coups]');
    }
  }
  return L;
}
function buildJournalReportHTML(){
  const H=[];
  try{
    H.push('<b>SOLAR — RAPPORT DE PARTIE</b>');
    H.push('Nations : '+[G.player,...(G.ais||[])].map(p=>'<span style="color:'+p.civ.color+';font-weight:700">'+_esc(p.civ.name)+'</span>').join(', '));
    if(G.phase==='over'){const pv=calcVP(G.player).total,av=Math.max(...G.ais.map(a=>calcVP(a).total));H.push('Résultat : '+(pv>=av?'VICTOIRE':'DÉFAITE')+' — '+pv+' VP contre '+av+' VP');}
    else H.push('Partie en cours — tour '+G.turn+'/'+G.maxTurns);
  }catch(e){}
  const J=G._journal||[];
  const maxT=J.reduce((m,e)=>Math.max(m,e.turn||0),G.turn||0);
  for(let t=1;t<=maxT;t++){
    const ents=J.filter(e=>e.turn===t);
    if(!ents.length)continue;
    H.push('<span class="jr-turn">TOUR '+t+'</span>');
    for(const e of ents){
      const nat=e.nat||'?';
      const col=_natColorByName(nat);
      const ct=_costToText(e.cost);
      let cost='';
      if(e.ac>0&&ct)cost=e.ac+' AC, '+ct;else if(e.ac>0)cost=e.ac+' AC';else if(ct)cost=ct;else if(!e.auto)cost='gratuit';
      const pre=e.war?'⚔️ ':(e.auto?'⚙️ ':'');
      let line=pre+'<span style="color:'+col+';font-weight:700">['+_esc(nat)+']</span> '+_esc(e.name||'action');
      if(cost)line+=' — '+_esc(cost);
      if(e.gain)line+=' → '+_esc(e.gain);
      H.push(line);
    }
  }
  H.push('<span class="jr-vp">CALCUL FINAL DES POINTS DE VICTOIRE</span>');
  for(const p of [G.player,...(G.ais||[])]){
    let v;try{v=calcVP(p);}catch(e){continue;}
    const isP=p===G.player;
    H.push('<span style="color:'+p.civ.color+';font-weight:700">▶ '+_esc(p.civ.name)+(isP?' (toi)':' (IA)')+' — TOTAL '+v.total+' VP</span>');
    H.push('&nbsp;&nbsp;&nbsp;Colonies : '+v.colVP+' · Routes : '+v.routeVP+' · Cartes : '+v.cardsVP);
    H.push('&nbsp;&nbsp;&nbsp;Bonus tech : '+v.techBonusVP+' · Bonus revenus/tour : '+v.rptVP);
    H.push('&nbsp;&nbsp;&nbsp;Agenda'+(p.agenda&&p.agenda.name?' ('+_esc(p.agenda.name)+')':'')+' : '+v.agendasVP+' · Événements : '+v.evtVP+(v.extraVP?' · Bonus spéciaux : '+v.extraVP:''));
  }
  return H.join('\n');
}
function _logToast(msg){
  let t=document.getElementById('_logtoast');
  if(!t){t=document.createElement('div');t.id='_logtoast';t.style.cssText='position:fixed;left:50%;bottom:calc(var(--botband,84px) + 14px);transform:translateX(-50%);z-index:1200;background:#0c2a12;border:1px solid #3fbf6a;color:#bff3cf;padding:9px 16px;border-radius:10px;font-size:.92em;box-shadow:0 6px 24px rgba(0,0,0,.6);pointer-events:none;opacity:0;transition:opacity .2s;max-width:90vw;text-align:center';document.body.appendChild(t);}
  t.innerHTML=msg;t.style.opacity='1';clearTimeout(t._h);t._h=setTimeout(()=>{t.style.opacity='0';},2400);
}
function copyLogText(){
  const full=buildFullLog();
  const ok=()=>_logToast('✅ Log copié — colle-le dans la conversation');
  const fallback=()=>{try{const ta=document.createElement('textarea');ta.value=full;ta.style.position='fixed';ta.style.top='-1000px';document.body.appendChild(ta);ta.focus();ta.select();const done=document.execCommand('copy');document.body.removeChild(ta);done?ok():_logToast('⚠️ Copie impossible — utilise Email ou .txt');}catch(e){_logToast('⚠️ Copie impossible — utilise Email ou .txt');}};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(full).then(ok).catch(fallback);}else fallback();
  const el=document.getElementById('end-log-confirm');if(el){el.style.display='block';setTimeout(()=>el.style.display='none',3000);}
}
function emailLog(){
  const full=buildFullLog();
  const href='mailto:?subject='+encodeURIComponent('Solar — log de partie')+'&body='+encodeURIComponent(full);
  if(href.length>1900)_logToast('ℹ️ Log long : l\'email peut être tronqué — préfère « Copier » si besoin.');
  try{location.href=href;}catch(e){_logToast('⚠️ Impossible d\'ouvrir l\'email');}
}
function downloadLog(){
  try{
    const blob=new Blob([buildFullLog()],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='solar_log_t'+(G.turn||0)+'.txt';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    _logToast('💾 Log téléchargé');
  }catch(e){_logToast('⚠️ Téléchargement impossible');}
}
function copyEndLog(){copyLogText();} // compat écran de fin
/* ═══ UNE GUERRE QUI DURE ENCORE À LA DERNIÈRE SECONDE DOIT QUAND MÊME SE CONCLURE ═══
   ⚠️ DÉFAUT DE LA PARTIE F8D7 (Marc : « vérifie la guerre que j'ai faite, il manque une annonce à
   la fin »). `doEndGame` calculait les points et s'arrêtait là. Les guerres ouvertes au tour 10 —
   celles du joueur contre les Martiens et contre les Ceinturiens — n'étaient jamais closes : aucune
   ligne au journal, aucun vainqueur nommé, rien. On avait mené trois combats victorieux et la
   partie se terminait comme s'il ne s'était rien passé.
   Le décompte des combats existe déjà, nation par nation (`war.winsBy`) : il suffisait de le dire.
   ⚠️ ON N'APPLIQUE AUCUN EFFET ICI — ni moral, ni tension. Les +2 VP par combat ont été versés au
   moment des combats ; ajouter quoi que ce soit après le dernier tour changerait un score déjà
   affiché à l'écran. Cette fonction RACONTE, elle ne joue pas. */
function cloreGuerresEnCours(){
  if(!G||!Array.isArray(G.wars)||!G.wars.length) return;
  const nom=id=>{ const n=(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[]))
    .find(x=>x&&x.civ&&x.civ.id===id); return n?(n.civ.emoji+' '+n.civ.name):id; };
  for(const w of G.wars.slice()){
    const a=w.a, b=w.b, va=(w.winsBy&&w.winsBy[a])||0, vb=(w.winsBy&&w.winsBy[b])||0;
    let verdict;
    if(va>vb) verdict=nom(a)+' l\'emporte ('+va+' combat(s) gagné(s) contre '+vb+')';
    else if(vb>va) verdict=nom(b)+' l\'emporte ('+vb+' combat(s) gagné(s) contre '+va+')';
    else verdict=(va===0)?'aucun combat livré — la guerre s\'éteint sans vainqueur'
                        :'match nul ('+va+' combat(s) partout)';
    addLog('🏳️ Fin de partie — guerre '+nom(a)+' ↔ '+nom(b)+' : '+verdict+'.','gold');
  }
  G.wars=[];
  if(typeof syncWarState==='function')syncWarState();
}
function doEndGame(){
  G.phase='over';scClearSave();
  /* Avant le décompte : le journal doit dire comment les guerres finissent.
     ⚠️ Le commentaire est écrit AU-DESSUS et non en fin de ligne : la suite de cette fonction tient
     sur une seule ligne très longue, et un `//` posé là avalerait tout le calcul des points.
     C'est exactement ce qui vient d'arriver — `test_serialisation.js` l'a attrapé en une minute
     avec « pVP is not defined ». */
  cloreGuerresEnCours();
  const pVP=calcVP(G.player);const aiVPs=G.ais.map(ai=>({ai,vp:calcVP(ai)}));const bestAiVP=aiVPs.reduce((best,x)=>x.vp.total>best.vp.total?x:best,aiVPs[0]||{ai:null,vp:{total:0}});const aVP=bestAiVP.vp;
  addLog('═══ FIN ═══','gold');addLog('Toi : '+pVP.total+' VP','gold');G.ais.forEach(ai=>addLog(ai.civ.name+' : '+calcVP(ai).total+' VP'));
  // Révélation des agendas secrets (une ligne par nation, attribuée à la nation)
  for(const p of [G.player,...G.ais]){try{if(p.agenda&&p.agenda.name){const _asc=(typeof p.agenda.score==='function')?p.agenda.score(p):0;_journalAuto(p.civ.name,'Agenda secret révélé : '+p.agenda.name,_asc+' VP');}}catch(e){}}
  render();
  // Enregistrement serveur + email de récap au joueur (silencieux ; ne fait rien si non connecté / hors-ligne).
  try{
    const _win=pVP.total>=aVP.total;
    const _players=[{name:G.player.civ.name,isAI:false,vp:pVP.total}]
      .concat(G.ais.map(a=>({name:a.civ.name,isAI:!a._remoteHuman,vp:calcVP(a).total})));
    fetch('api/save_result.php',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',
      body:JSON.stringify({myCiv:G.player.civ.id,myCivName:G.player.civ.name,won:_win,turns:G.turn,players:_players,
        game_code:(window._scGameCode||''),
        log:(function(){try{return buildJournalReport().split('\n').reverse();}catch(e){return(G.log||[]).map(x=>String((x&&x.msg)||x).replace(/<[^>]+>/g,''));}})()   /* journal ENTIER */})}).catch(()=>{});
  }catch(e){}
  setTimeout(()=>{
    const win=pVP.total>=aVP.total;
    document.getElementById('end-title').textContent=win?'🏆 Victoire !':'💀 Défaite';
    document.getElementById('end-result').textContent=win?'Tu domines le système solaire ! '+pVP.total+' VP contre '+aVP.total+'.':"Un adversaire s'impose : "+aVP.total+' VP contre '+pVP.total+'.';
    /* ═══ CHAQUE LIGNE DIT SA RÈGLE ═══
       Marc, partie 140A : « dans le décompte des points de fin de partie, c'est pas clair pourquoi.
       Il faut ajouter les mêmes textes que dans le fichier de règle pour qu'on comprenne pourquoi on
       gagne ou pas les VP. » Les libellés sont donc repris MOT POUR MOT du §17 des règles — deux
       formulations différentes pour un même calcul, c'est déjà une contradiction en germe.
       Et les « bonus spéciaux » énumèrent leur provenance, qui était la seule ligne réellement
       indéchiffrable. */
    const _reg=(t)=>`<div style="font-size:.78em;color:#8898b8;margin:-2px 0 4px 2px">${t}</div>`;
    const mkBox=(lbl,vp,w,em)=>`<div class="vp-box ${w?'winner':''}"><h3>${em} ${lbl}</h3>
      <div class="vp-line"><span>Colonies</span><span>${vp.colVP}</span></div>
      ${_reg('VP du nœud × niveau, ×1 si connectée, ×0,5 si isolée (+1 par colonie connectée)')}
      <div class="vp-line"><span>Routes</span><span>+${vp.routeVP}</span></div>
      ${_reg('+1 VP par route établie')}
      <div class="vp-line"><span>Cartes</span><span>+${vp.cardsVP}</span></div>
      ${_reg('VP inscrit sur la carte : 1 au T1, 3 au T2, 5 au T3')}
      <div class="vp-line"><span>Bonus technologique</span><span>+${vp.techBonusVP}</span></div>
      ${_reg('+0,5 VP par technologie, arrondi à l\'inférieur')}
      <div class="vp-line"><span>Bonus revenus/tour</span><span>+${vp.rptVP}</span></div>
      ${_reg('Par ressource : +2 VP au-delà de 5 de revenu, +5 VP au-delà de 10')}
      <div class="vp-line"><span>Agenda</span><span>+${vp.agendasVP}</span></div>
      ${_reg(vp.agendasVP?'Condition de ton agenda secret remplie':'Condition de ton agenda secret NON remplie')}
      <div class="vp-line"><span>Événements</span><span>+${vp.evtVP}</span></div>
      ${_reg('VP gagnés au fil des événements et des victoires de guerre')}
      <div class="vp-line"><span>Bonus spéciaux</span><span>+${vp.extraVP}</span></div>
      ${_reg((vp.extraDetail&&vp.extraDetail.length)?vp.extraDetail.join('<br>'):'aucun')}
      <div class="vp-total">${vp.total} VP</div></div>`;
    document.getElementById('vp-wrap').innerHTML=mkBox(G.player.civ.name,pVP,win,G.player.civ.emoji)+aiVPs.map(x=>mkBox(x.ai.civ.name,x.vp,!win&&x.vp.total===aVP.total,x.ai.civ.emoji)).join('');
    document.getElementById('end-scr').classList.remove('hidden');
  },700);
}
/* ============================================================ RENDERING ============================================================ */
function render(){
  renderTopBar();renderWarRisk();renderEvents();renderMap();renderTechTree();renderRight();renderActions();
  document.getElementById('score-p').textContent='~'+calcVP(G.player).total+' VP';
  document.getElementById('score-a').textContent='~'+G.ais.map(ai=>calcVP(ai).total).join('/') +' VP';
  // Label adverse : pseudo si connu (multijoueur, fourni par online.js via window._scPseudo), sinon nom de civ.
  // (Avant : « IA » en dur dès qu'il n'y avait qu'un adversaire → faux en multijoueur humain.)
  {const _lbl=(a)=>{try{if(window._scPseudo&&window._scPseudo[a.civ.id])return a.civ.emoji+' '+window._scPseudo[a.civ.id];}catch(e){}return a.civ.emoji+(G.ais.length===1?(' '+a.civ.name):'');};
   document.getElementById('score-a-label').textContent=G.ais.map(_lbl).join(' · ');}
}
function renderTopBar(){
  const p=G.player;
  // Badge civ avec tooltip capacité
  const civ=p.civ;
  const costStr=civ.active.ac>0||Object.keys(civ.active.cost||{}).length>0
    ?(civ.active.ac>0?civ.active.ac+' AC':'')+(Object.entries(civ.active.cost||{}).map(([r,a])=>a+{energy:'<i class=ri-energy></i>',materials:'<i class=ri-materials></i>',science:'<i class=ri-science></i>',morale:'<i class=ri-morale></i>'}[r]).join(''))
    :'Gratuit';
  document.getElementById('civ-badge-top').innerHTML=
    `<span class="cbt-pill" style="background:${civ.color}22;border-color:${civ.color}55;color:${civ.color}">${civ.emoji} ${civ.name}</span>`+
    `<span class="cbt-tooltip">`+
      `<strong style="font-size:.9em">${civ.emoji} ${civ.name}</strong>`+
      `<span class="cbt-sep"></span>`+
      `<span class="cbt-label">Capacité passive</span>`+
      `<span class="cbt-val">${civ.passive}</span>`+
      `<span class="cbt-sep"></span>`+
      `<span class="cbt-label">Capacité active — ${civ.active.name} (${costStr})</span>`+
      `<span class="cbt-val">${civ.active.desc}</span>`+
    `</span>`;
  document.getElementById('turn-disp').textContent='Tour '+G.turn+'/'+G.maxTurns;
  document.getElementById('phase-disp').textContent={actions:'⚡ Actions',ai:'🤖 IA joue…',over:'Terminé'}[G.phase]||'';
  /* NB : #top-res est rendu par uiFillIncome() (appelée plus bas) — un seul rendu, sinon le second
     écrase silencieusement le premier (c'est ce qui rendait le revenu net invisible pendant des jours). */
  _wireRevTip();
  document.getElementById('ac-disp').textContent=p.acLeft+'/'+p.acMax+' AC';
  document.getElementById('gov-disp').textContent='🏛️ Nv.'+p.gov_level+' ('+p.gov_pts+'pts)';
  if(typeof uiFillIncome==='function')uiFillIncome();
  if(typeof uiSyncBands==='function')uiSyncBands();
  if(typeof _syncEndBtn==='function')_syncEndBtn();
}
function renderWarRisk(){
  const el=document.getElementById('war-risk-display');if(!el)return;
  // Diplomatie : 2 mini-barres par nation (ma tension / la leur) + perte de moral
  const _tcol=t=>t>=10?'#ff2222':t>=8?'#ff5530':t>=6?'#ff8822':t>=3?'#ffcc22':'#44cc88';
  const _bar=(lbl,t,extra)=>`<div class="dip-row"><span class="dip-lbl">${lbl}</span>`+
    `<span class="dip-bar"><i style="width:${Math.min(100,t*10)}%;background:${_tcol(t)}"></i></span>`+
    `<span class="dip-val" style="color:${_tcol(t)}">${t}/10</span>${extra||''}</div>`;
  let tensHtml='';
  for(const ai of G.ais){
    const pt=getTens('player',ai.civ.id);const at=getTens(ai.civ.id,'player');
    const atWar=_warBetween(_moiId(),ai.civ.id); // ⚔️ uniquement la/les nation(s) avec qui on est RÉELLEMENT en guerre (plus le flag global G.warState)
    const status=atWar?'<span class="dip-status war">⚔️ EN GUERRE</span>'
      :(pt>=6||at>=6)?'<span class="dip-status hot">Tensions fortes</span>'
      :(pt>=3||at>=3)?'<span class="dip-status warm">Tensions</span>'
      :'<span class="dip-status ok">Paix</span>';
    const moralWarn=pt>=6?'<span class="dip-moral">−1<i class=ri-morale></i>/tour</span>':'';
    const warWarn=at>=10?'<span class="dip-moral" style="color:#ff4444">guerre !</span>':at>=8?'<span class="dip-moral" style="color:#ff7744">imminent</span>':'';
    // Estimation des jetons Force : exacte avec renseignement (intel niv.2), sinon ±3 (stable sur le tour)
    const _intel=(typeof getIntelLevel==='function')?getIntelLevel(G.player):0;
    const pf=perceivedForce(G.player,ai);
    const forceLine=pf.exact
      ?'⚔️ Force : <b style="color:#ff9966">'+pf.val+'</b> <span style="color:#5a7a66">(renseignement précis)</span>'
      :'⚔️ Force estimée : <b style="color:#ffb380">~'+pf.val+'</b> <span style="color:#5a6a8a">(±3 — sans renseignement)</span>';
    const ecoLine=_intel>=2
      ?'<i class=ri-energy></i>'+(ai.res.energy||0)+' <i class=ri-materials></i>'+(ai.res.materials||0)+' <i class=ri-science></i>'+(ai.res.science||0)+' <i class=ri-morale></i>'+(ai.res.morale||0)+' · 🏙️'+ai.colonies.length+' 🛤️'+ai.routes.length+' · ~'+calcVP(ai).total+' VP'
      :'🏙️ '+ai.colonies.length+' col · 🛤️ '+ai.routes.length+' routes · ~'+calcVP(ai).total+' VP <span style="color:#5a6a8a">· éco &amp; moral : tech requise</span>';
    tensHtml+=`<div class="dip-nation"><div class="dip-hdr"><span>${ai.civ.emoji} ${ai.civ.name}</span>${status}</div>`+
      `<div class="dip-force">${forceLine}</div>`+
      `<div class="dip-force" style="color:#8a98b8;font-size:.92em">${ecoLine}</div>`+
      _bar('Moi → eux',pt,moralWarn)+
      _bar('Eux → moi',at,warWarn)+
      `</div>`;
  }
  el.innerHTML='<div class="dip-help">Ta tension ≥ 6 → −1<i class=ri-morale></i>/tour · une tension à 10 → guerre forcée</div>'+tensHtml;
  // Pirate status (masqué si l'une des factions joue Pirates)
  const pirateEl=document.getElementById('pirate-status');if(!pirateEl)return;
  if(!npcPiratesActive()){pirateEl.innerHTML='';return;}
  const pirProb=Math.min(100,Math.round((0.10+G.turn*0.10)*100));
  let phtml='☠️ Pirates — Risque ce tour sur tes <strong>routes non protégées</strong> : <strong style="color:#ff8888">'+pirProb+'%</strong>';
  if(getIntelLevel(G.player)>=1)phtml+=' — <span style="color:#aaa;font-size:.88em">Prochain tour : '+(Math.min(100,pirProb+10))+'%</span>';
  pirateEl.innerHTML=phtml;
}
function renderEvents(){
  const nb=t=>`<span class="evt-badge eb-${t}">${t.replace('_',' ')}</span>`;
  const cur=G.curEvent,nxt=G.nextEvent;
  document.getElementById('evt-now-box').innerHTML=cur?`<div class="evt-now">${nb(cur.type)}<br><strong>${cur.emoji} ${cur.name}</strong><br><span style="font-size:.9em;color:#aab8d0">${cur.preview||''}</span><br><span style="font-size:.82em;color:#7aa87a">⏳ Se réalise à la fin du tour ${G.turn}</span></div>`:'<div style="font-size:.72em;color:#5a6a8a">Pas d\'événement ce tour.</div>';
  document.getElementById('evt-next-box').innerHTML=nxt?`<div class="evt-next">⚠️ <strong>Prochain — fin du tour ${G.turn+1} :</strong> ${nxt.emoji} ${nxt.name}<br><span style="font-size:.88em">${nxt.preview}</span></div>`:'';
}
function renderSystemMap(){
  const panel=MAP_PANELS[G.mapPanel||0];
  document.getElementById('solar-svg').setAttribute('viewBox','0 175 2020 490');
  document.getElementById('panel-label').textContent=panel.name;
  document.getElementById('panel-left').style.opacity=G.mapPanel===0?'.3':'1';
  document.getElementById('panel-right').style.opacity=G.mapPanel===MAP_PANELS.length-1?'.3':'1';
  // Contested routes
  const rp=document.getElementById('routes-p'),ra=document.getElementById('routes-ai');
  rp.innerHTML='';ra.innerHTML='';
  const contested=getContestedSegments();
  for(const seg of contested){const f=NODES[seg.from],t=NODES[seg.to];if(!f||!t)continue;const mx=(f.x+t.x)/2,my=(f.y+t.y)/2;ra.innerHTML+=`<line x1="${f.x}" y1="${f.y}" x2="${t.x}" y2="${t.y}" stroke="#ff5500" stroke-width="5" stroke-opacity=".22"/><text x="${mx}" y="${my-4}" text-anchor="middle" font-size="10" fill="#ff7744">⚠</text>`;}
  for(let ri=0;ri<G.player.routes.length;ri++){const r=G.player.routes[ri];const f=NODES[r.from],t=NODES[r.to];if(!f||!t)continue;const canManage=G.phase==='actions';rp.innerHTML+=`<line x1="${f.x}" y1="${f.y}" x2="${t.x}" y2="${t.y}" stroke="${G.player.civ.color}" stroke-width="2.5" stroke-opacity=".75" stroke-dasharray="5,3"/>`;if((r.tokens||0)>0){const mx=(f.x+t.x)/2,my=(f.y+t.y)/2;rp.innerHTML+=`<rect x="${mx-6}" y="${my-6}" width="12" height="12" fill="${G.player.civ.color}" opacity=".88" rx="2"/><text x="${mx}" y="${my+4}" text-anchor="middle" font-size="8" fill="white">⚔</text>`;}if(canManage){const mx=(f.x+t.x)/2,my=(f.y+t.y)/2;rp.innerHTML+=`<line x1="${f.x}" y1="${f.y}" x2="${t.x}" y2="${t.y}" stroke="transparent" stroke-width="16" onclick="showRouteManageModal(${ri})" style="cursor:pointer"/><circle cx="${mx}" cy="${my}" r="7" fill="${(r.tokens||0)>0?'#ff8844':'#224488'}" fill-opacity=".7" stroke="${(r.tokens||0)>0?'#ffaa66':'#4a9eff'}" stroke-width="1" onclick="showRouteManageModal(${ri})" style="cursor:pointer" title="${(r.tokens||0)>0?'↩️ Rappeler jeton':'⚔️ Déployer jeton'}"/>`;} }
  for(const aiP of G.ais){for(const r of aiP.routes){const f=NODES[r.from],t=NODES[r.to];if(!f||!t)continue;ra.innerHTML+=`<line x1="${f.x}" y1="${f.y}" x2="${t.x}" y2="${t.y}" stroke="${aiP.civ.color}" stroke-width="2" stroke-opacity=".5" stroke-dasharray="4,4"/>`;if((r.tokens||0)>0){const mx=(f.x+t.x)/2+8,my=(f.y+t.y)/2-8;ra.innerHTML+=`<rect x="${mx-5}" y="${my-5}" width="10" height="10" fill="${aiP.civ.color}" opacity=".7" rx="2"/><text x="${mx}" y="${my+3.5}" text-anchor="middle" font-size="7" fill="white">⚔</text>`;}}
  }
  // (Attaque de route par clic sur la carte retirée : peu lisible. On attaque les routes via la fenêtre de combat ou la guerre populaire forcée.)
  // Pirates NPC (masqué si l'une des factions joue Pirates)
  const pg=document.getElementById('pirates-g');pg.innerHTML='';
  // PIRATES : plus AUCUN marqueur/avancée sur la carte (demande de Marc — l'indication ne voulait rien dire).
  // Les pirates restent un facteur de HASARD : risque croissant avec les tours, ils pillent UNIQUEMENT les
  // routes non protégées (jamais les colonies, sauf événement dédié). Voir advancePirates().
  // Nodes
  const ng=document.getElementById('nodes-g');ng.innerHTML='';
  ng.innerHTML='';/* soleil dessiné retiré : fourni par l'image de fond (lueur à gauche) */
  for(const[id,node]of Object.entries(NODES)){
    if(node.type==='orbital_station')continue; // stations orbitales (dont Station Jupiter) non dessinées
    /* ⚠️ MÊME DÉFAUT QUE DANS LA FENÊTRE DE NŒUD : `.find()` prend le PREMIER occupant de la table
       interne, dont l'ordre dépend du siège qu'on occupe. Sur un nœud partagé (Exploration
       Extra-Solaire), chacun voyait donc l'anneau d'une nation différente — Marc voyait Éris en
       couleur jovienne alors qu'elle est à Laurent. On dessine un anneau PAR occupant : deux
       cercles concentriques disent ce qu'aucune couleur unique ne peut dire. */
    const pCol=G.player.colonies.find(c=>c.nodeId===id);
    const _occ=G.ais.map(ai=>({col:ai.colonies.find(c=>c.nodeId===id),ai})).filter(x=>x.col)
      .sort((x,y)=>(y.col.level||1)-(x.col.level||1));   // le plus établi d'abord
    const anyACol=_occ[0]||null;const aCol=anyACol?anyACol.col:null;const aColAI=anyACol?anyACol.ai:G.ais[0];
    const nr=node.r||6;
    const isOrbital=node.type==='orbital_station';
    const ir=Math.min(Math.max(nr,6),26); // lunes plus petites, proportionnelles à node.r
    const br=(node.decorative||isOrbital)?nr+2:ir; // rayon de référence pour anneaux/label/clic
    const glowR=br+6;
    let glow='';
    if(G.phase==='actions'){
      if(mode==='colonize'&&!pCol&&(!aCol||accordAvecMoi(id,G.player)))glow=`<circle cx="${node.x}" cy="${node.y}" r="${glowR}" fill="${node.color}" fill-opacity=".12" stroke="${node.color}" stroke-width="1.5" stroke-dasharray="4,3"/>`;
      if(mode==='route'){if(!routeFrom&&pCol)glow=`<circle cx="${node.x}" cy="${node.y}" r="${glowR}" fill="#44aaff" fill-opacity=".1" stroke="#44aaff" stroke-width="1.5" stroke-dasharray="3,3"/>`;if(routeFrom&&NODES[routeFrom]?.conn.includes(id))glow=`<circle cx="${node.x}" cy="${node.y}" r="${glowR}" fill="#ffaa00" fill-opacity=".12" stroke="#ffaa00" stroke-width="1.5" stroke-dasharray="3,3"/>`;}
    }
    let rings='';
    if(pCol)rings+=`<circle cx="${node.x}" cy="${node.y}" r="${br+3+pCol.level*3}" fill="none" stroke="${G.player.civ.color}" stroke-width="${pCol.level+1}" stroke-opacity="${pCol.connected?.85:.3}"/>`;
    _occ.forEach((o,i)=>{ rings+=`<circle cx="${node.x}" cy="${node.y}" r="${br+1+o.col.level*2+i*2}" fill="none" stroke="${o.ai.civ.color}" stroke-width="${o.col.level}" stroke-opacity="${o.col.connected?.65:.2}"${i?' stroke-dasharray="3,3"':''}/>`; });
    // Image pour lunes/naines ; petite station pour Station Jupiter (la grosse Jupiter est un décor) ; losange pour les anneaux joviens.
    const body=node.decorative
      ?`<polygon points="${node.x},${node.y-nr*1.5} ${node.x+nr*1.5},${node.y} ${node.x},${node.y+nr*1.5} ${node.x-nr*1.5},${node.y}" fill="${node.color}" fill-opacity=".25" stroke="${node.color}" stroke-width="1.2" stroke-dasharray="3,2"/>`
      :isOrbital
        ?`<circle cx="${node.x}" cy="${node.y}" r="${nr+1}" fill="${node.color}" fill-opacity=".4" stroke="${node.color}" stroke-width="1.4"/><text x="${node.x}" y="${node.y+3}" text-anchor="middle" font-size="9">${node.emoji}</text>`
        :`<image href="assets/map/${mapImg(id)}.png" xlink:href="assets/map/${mapImg(id)}.png" x="${(node.x-ir).toFixed(1)}" y="${(node.y-ir).toFixed(1)}" width="${2*ir}" height="${2*ir}" preserveAspectRatio="xMidYMid meet"/>`;
    ng.innerHTML+=`<g style="cursor:pointer" onclick="handleNodeClick('${id}')">${glow}${body}${rings}<circle cx="${node.x}" cy="${node.y}" r="${Math.max(br,12)}" fill="transparent"/><text x="${node.x}" y="${node.y+br+11}" text-anchor="middle" font-size="10" font-weight="600" paint-order="stroke" stroke="#04060f" stroke-width="2.6" fill="${isOrbital?'#FFD08a':'#e6eeff'}">${node.name}</text>${node.baseVP>0?`<text x="${node.x}" y="${node.y+br+19}" text-anchor="middle" font-size="7" fill="#6070a0">${node.baseVP}VP</text>`:''}</g>`;
  }
  if(typeof uiMapMarkers==='function')uiMapMarkers();
  try{ if(typeof uiMapFit==='function') setTimeout(uiMapFit,0); }catch(e){}
}
/* ============ NOUVELLE CARTE : vue globale (image) + vues secteur ============ */
const MAP_RAD={jorbital1:42,saturne:54,uranus:30,neptune:30,venus:26,terre:26,mars:19,mercure:16,
 ganymede:15,titan:15,callisto:14,io:13,europe:13,lune:9,triton:12,encelade:11,phobos:8,deimos:8,
 ceres:11,vesta:9,pluto:11,eris:11};
function mrad(id){return MAP_RAD[id]||14;}
const MAP_HOMECOL={'Terriens':'#4CAF50','Jupitériens':'#FF9800','Ceinturiens':'#AB47BC','Martiens':'#ef5350'};
const MAP_DECOR={mercure:'Mercure',venus:'Vénus',terre:'Terre',mars:'Mars',saturne:'Saturne',uranus:'Uranus',neptune:'Neptune'};
const MAP_CAPITAL={terre:'Terriens',mars:'Martiens',io:'Jupitériens',eris:'Ceinturiens'};   // la base jovienne est Io, plus la station
// planète décor-capitale → nœud jouable (QG) qu'elle représente, pour la rendre cliquable
const MAP_CAPITAL_NODE={terre:'lune',mars:'phobos'};
// durées de trajet (par arête, ids triés) — voie commerciale ∝ temps
const MAP_ROUTE_TIME={'lune|phobos':'~7 mois','ceres|lune':'~1 an','ceres|phobos':'~8 mois',
 'europe|io':'~5 j','ganymede|io':'~8 j','callisto|europe':'~6 j','callisto|ganymede':'~7 j','ganymede|vesta':'≈ mois',
 'encelade|titan':'~5 j','pluto|triton':'~ans','eris|pluto':'~ans',
 'ceres|io':'~1 an','ceres|vesta':'~1 an','ganymede|titan':'~2 ans','callisto|titan':'~2 ans','titan|triton':'~3 ans'};
function routeTime(a,b){return MAP_ROUTE_TIME[[a,b].sort().join('|')]||'';}
function ownsNode(id){return G.player.civ.home===id||G.player.colonies.some(c=>c.nodeId===id);}
function playerRouteIdx(a,b){return G.player.routes.findIndex(r=>(r.from===a&&r.to===b)||(r.from===b&&r.to===a));}
function mapRouteClick(a,b){const idx=playerRouteIdx(a,b);if(idx>=0){if(typeof showRouteManageModal==='function')showRouteManageModal(idx);return;}
  let from=null,to=null;if(ownsNode(a)){from=a;to=b;}else if(ownsNode(b)){from=b;to=a;}
  if(!from){addLog('⚠️ Une route part d\'une de tes colonies — colonise d\'abord une extrémité.','red');render();return;}
  doEstablishRoute(from,to);render();}
function mapRouteLabel(x,y,ang,lab){if(ang>90)ang-=180;if(ang<-90)ang+=180;const w=lab.length*5+12;return `<g transform="rotate(${ang.toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"><rect x="${(x-w/2).toFixed(0)}" y="${(y-8).toFixed(0)}" width="${w}" height="14" rx="7" fill="#0a1326ee" stroke="#2a3a6a"/><text x="${x.toFixed(0)}" y="${(y+2.6).toFixed(0)}" text-anchor="middle" font-size="8" fill="#9fc4e8">${lab}</text></g>`;}
function mapPlus(mx,my,built,own,onclick){const fill=built?'#16401a':(own?'#0e2a4a':'#161b29');const st=built?'#3fbf6a':(own?'#4a9eff':'#3a4566');const col=built?'#9ad89a':(own?'#9cc2ff':'#6a7a9a');return `<g style="cursor:pointer" onclick="${onclick}"><circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="10" fill="${fill}" stroke="${st}" stroke-width="1.5"/><text x="${mx.toFixed(0)}" y="${(my+4).toFixed(0)}" text-anchor="middle" font-size="13" fill="${col}" font-weight="700">${built?'✓':'+'}</text></g>`;}
function mapImg(id){return id==='jorbital1'?'jupiter':id;}
function bodyName(id){return (NODES[id]&&NODES[id].name)||MAP_DECOR[id]||id;}
function isNodeBody(id){return !!NODES[id];}
function playingCivs(){return [G.player,...G.ais].map(p=>p.civ.name);}
const MAP_SECTORS={
 interne:{title:'Secteur 1 · Interne',color:'#7ed09a',belt:1,
   place:{mercure:[68,128],venus:[110,232],terre:[180,355],lune:[146,372],mars:[188,488],phobos:[150,452],deimos:[258,392],ceres:[332,250]},
   /* ⚠️ UNE LIAISON INTER-SECTEURS N'EST PAS DESSINÉE PAR `conn` SEUL. La carte tactique ne trace
      que les arêtes INTRA-secteur ; tout ce qui sort du cadre passe par un `nexus`, qui porte le
      point de sortie et le bouton « + » de construction. Les liaisons Lune↔Io, Lune↔Vesta et
      Phobos↔Vesta (Marc, 2026-08-14 : « ça va désenclaver ») franchissent la frontière Interne ↔
      Jupiter : il leur faut donc une entrée de CHAQUE côté. */
   nexus:[{fromNode:'ceres',toNode:'io',to:'jupiter',next:'Io',xy:[372,345]},{fromNode:'ceres',toNode:'vesta',to:'jupiter',next:'Vesta',xy:[392,196]},
          {fromNode:'lune',toNode:'vesta',to:'jupiter',next:'Vesta',xy:[350,110]},
          {fromNode:'lune',toNode:'io',to:'jupiter',next:'Io',xy:[372,432]},
          {fromNode:'phobos',toNode:'vesta',to:'jupiter',next:'Vesta',xy:[380,530]}],
   band:{a:[300,118],b:[372,366],w:74,n:60,warm:true,name:'Ceinture intérieure',lab:[348,108]}},
 jupiter:{title:'Secteur 2 · Jupiter',color:'#ffb255',belt:1,
   place:{vesta:[52,158],jorbital1:[105,392],io:[160,350],europe:[240,378],ganymede:[208,238],callisto:[348,300]},
   nexus:[{fromNode:'io',toNode:'ceres',to:'interne',next:'Cérès',xy:[28,248]},{fromNode:'vesta',toNode:'ceres',to:'interne',next:'Cérès',xy:[24,96]},{fromNode:'callisto',toNode:'titan',to:'saturne',next:'Titan',xy:[372,392]},
          {fromNode:'vesta',toNode:'phobos',to:'interne',next:'Phobos',xy:[22,36]},
          {fromNode:'vesta',toNode:'lune',to:'interne',next:'Lune',xy:[18,170]},
          {fromNode:'io',toNode:'lune',to:'interne',next:'Lune',xy:[26,440]},
          {fromNode:'europe',toNode:'pluto',to:'externe',next:'Pluton',xy:[368,470]}],
   band:{a:[18,80],b:[120,248],w:52,n:44,warm:true,name:'Ceinture intérieure',lab:[132,264]}},
 saturne:{title:'Secteur 3 · Saturne',color:'#e9cf86',
   place:{saturne:[108,425,54],encelade:[210,360],titan:[262,235]},
   nexus:[{fromNode:'titan',toNode:'callisto',to:'jupiter',next:'Callisto',xy:[36,175]},{fromNode:'titan',toNode:'triton',to:'externe',next:'Triton',xy:[376,330]}]},
 externe:{title:'Secteur 4 · Externe & Kuiper',color:'#9ac8f5',belt:1,
   place:{uranus:[108,165],neptune:[235,150],triton:[222,196],pluto:[135,430],eris:[305,458]},
   /* Pluton↔Europe (Marc, 2026-08-14) : la Ceinture externe était la seule à n'avoir gagné aucune
      liaison au désenclavement du centre — quatre sauts d'Io contre un pour les Terriens. */
   nexus:[{fromNode:'triton',toNode:'titan',to:'saturne',next:'Titan',xy:[36,300]},
          {fromNode:'pluto',toNode:'europe',to:'jupiter',next:'Europe',xy:[28,470]}],
   band:{a:[55,398],b:[362,500],w:64,n:62,warm:false,name:'Ceinture de Kuiper',lab:[210,556]}},
};
/* ─── ZONES CLIQUABLES DE LA CARTE GLOBALE ────────────────────────────────────
   Coordonnées dans l'espace du `viewBox` (400 × 600), pas en pixels : elles ne dépendent donc pas
   de la taille d'affichage, mais elles dépendent du CADRAGE du dessin.
   RECALCULÉES le 2026-08-07 pour `global2.webp`, qui montre enfin toute la ceinture de Kuiper.
   Le nouveau dessin est un dézoom UNIFORME autour du Soleil : une seule transformation a donc suffi
   pour les dix, au lieu de dix relevés à l'œil —
        nouveau = Soleil + (ancien − Soleil) × 0,77,  avec Soleil ≈ (200, 245).
   Vérifié planète par planète sur l'image : Uranus, Jupiter, Neptune, Saturne, Terre, Mars et Vénus
   tombent tous à moins de 10 px de leur position mesurée. Les rayons sont réduits en proportion,
   et deux zones ont été replacées à la main car le dézoom les faisait chevaucher une planète :
   la Ceinture (descendue sur l'arc gauche, dégagé) et Kuiper (remontée sur l'anneau extérieur). */
const MAP_HOTSPOTS=[
 {x:157,y:203,r:18,label:'Mercure',lp:'below',sector:'interne',node:'lune'},
 {x:134,y:232,r:18,label:'Vénus',lp:'below',sector:'interne',node:'lune'},
 {x:186,y:306,r:20,label:'Terre',lp:'right',sector:'interne',node:'lune'},
 {x:253,y:305,r:19,label:'Mars',lp:'right',sector:'interne',node:'phobos'},
 {x:305,y:231,r:26,label:'Jupiter',lp:'below',sector:'jupiter',node:'io'},   // ouvre la vue jovienne sur Io, la vraie base
 {x:128,y:354,r:26,label:'Saturne',lp:'below',sector:'saturne',node:'titan'},
 {x:138,y:127,r:20,label:'Uranus',lp:'right',sector:'externe',node:'triton'},
 {x:288,y:408,r:20,label:'Neptune',lp:'right',sector:'externe',node:'triton'},
 {x:97,y:275,r:24,label:'Ceinture',lp:'right',sector:'jupiter',node:'ceres'},
 {x:200,y:95,r:26,label:'Kuiper',lp:'below',sector:'externe',node:'pluto'},
];
function setSector(k){G.mapView=k;closePopup();render();}
function backToMap(){
  /* ⚠️ La vue globale repart à 1×, sinon elle hérite du zoom posé en entrant sur une planète.
     (Piège rencontré ici : `backToMap` tenait sur UNE ligne ; ajouter un commentaire `//` en fin
     de ligne a fait disparaître tout ce qui suivait, accolade fermante comprise. `node --check`
     l'a vu tout de suite — mais seulement parce que je l'ai lancé.) */
  try{ if(typeof uiMZ!=='undefined'){ uiMZ=1; if(typeof uiApplyMZ==='function')uiApplyMZ(); } }catch(e){}
  G.mapView='global';closePopup();render();
}
// Ouvre la 2e carte (système entier scrollable, dessin index.html) centrée sur la planète cliquée.
/* ⚠️ CLIQUER UNE PLANÈTE DOIT ZOOMER DESSUS.
   Depuis que la carte TIENT entièrement dans son cadre à 1×, il n'y a plus rien à faire défiler :
   `scrollToNode` calculait un décalage, le trouvait nul, et la vue restait sur le système entier.
   On pose donc explicitement un niveau de zoom en arrivant, puis on centre. C'était gratuit avant
   parce que la carte débordait toujours — ce n'est plus le cas, il faut le demander. */
const ZOOM_PLANETE=3;   // ~un tiers du système visible : le voisinage de la planète, pas tout
function openNodeMap(nodeId){
  G.mapView='zoom'; G._zoomNode=nodeId||null; closePopup(); render();
  try{ if(typeof uiMZ!=='undefined'){ uiMZ=ZOOM_PLANETE; if(typeof uiApplyMZ==='function')uiApplyMZ(); } }catch(e){}
  setTimeout(()=>scrollToNode(G._zoomNode),120);
}
function scrollToNode(nodeId){
  const wrap=document.getElementById('map-wrap'); if(!wrap)return;
  const n=NODES[nodeId]; if(!n)return;
  const svg=document.getElementById('solar-svg'); if(!svg)return;
  const vb=((svg.getAttribute('viewBox'))||'0 175 2020 490').split(' ').map(Number);
  /* ⚠️ LE DESSIN N'OCCUPE PAS TOUTE LA BOÎTE. `preserveAspectRatio="xMidYMid meet"` le met à
     l'échelle pour qu'il tienne, puis le CENTRE : il reste donc des bandes vides sur un axe. Le
     calcul précédent supposait que le dessin remplissait la boîte, et visait donc à côté dès que
     les deux proportions différaient — c'est-à-dire presque toujours. On refait le calcul du
     navigateur : échelle, puis bandes, puis position réelle du nœud en pixels. */
  const bw=svg.clientWidth||wrap.clientWidth, bh=svg.clientHeight||wrap.clientHeight;
  if(!bw||!bh)return;
  const k=Math.min(bw/vb[2], bh/vb[3]);
  const ox=(bw-vb[2]*k)/2, oy=(bh-vb[3]*k)/2;
  const px=ox+(n.x-vb[0])*k, py=oy+(n.y-vb[1])*k;
  const left=Math.max(0,px-wrap.clientWidth/2), top=Math.max(0,py-wrap.clientHeight/2);
  try{ wrap.scrollTo({left,top,behavior:'smooth'}); }catch(e){ wrap.scrollLeft=left; wrap.scrollTop=top; }
}

function renderMap(){
  // La colonne s'élargit sur l'onglet Carte : on le vérifie ici aussi, car la partie démarre sur la
  // carte sans passer par `uiTab` (sinon elle resterait à l'étroit au tout premier affichage).
  try{ document.body.classList.toggle('vue-carte', !!document.querySelector('#mp-map.active')); }catch(e){}
  const svg=document.getElementById('solar-svg'); const wrap=document.getElementById('map-wrap');
  const bg=document.getElementById('map-bg-img'); const ng=document.getElementById('nodes-g');
  const view=G.mapView||'global';
  if(view!=='zoom'){
    // Carte de départ : image peinte global.png + zones cliquables invisibles
    if(wrap)wrap.classList.remove('mapzoom');
    if(svg)svg.setAttribute('viewBox','0 0 400 600');
    for(const gid of ['stars','connections','routes-ai','routes-p','pirates-g']){const g=document.getElementById(gid);if(g)g.innerHTML='';}
    if(bg)bg.style.display='';
    if(ng)ng.innerHTML=mapGlobalSVG();
    try{ if(typeof uiMapFit==='function') setTimeout(uiMapFit,0); }catch(e){}   // vue globale : ajuster aussi
    // On remesure APRÈS le rendu : la vue vient peut-être de changer de largeur.
      return;
  }
  // 2e carte : système entier scrollable (dessin index.html), centré sur la planète cliquée
  if(wrap)wrap.classList.add('mapzoom');
  try{ if(typeof uiApplyMZ==='function') setTimeout(uiApplyMZ,0); }catch(e){}
  if(bg)bg.style.display='none';
  drawConnections();
  renderSystemMap();
}
function mapGlobalSVG(){
  let s='';
  // Les noms des planètes sont dans l'image ; ici uniquement les zones cliquables invisibles.
  for(const h of MAP_HOTSPOTS){
    s+=`<g style="cursor:pointer" onclick="openNodeMap('${h.node}')">`;
    s+=`<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="#000" opacity="0" pointer-events="all"/>`;
    s+=`</g>`;
  }
  s+=`<rect x="40" y="560" width="320" height="30" rx="12" fill="#0a1326cc" stroke="#2a3a6a"/><text x="200" y="580" text-anchor="middle" font-size="11" fill="#cfe0ff">Touche une planète → carte détaillée</text>`;
  return s;
}
function mapSectorSVG(key){
  const S=MAP_SECTORS[key]; if(!S)return '';
  const ids=Object.keys(S.place); const civsIn=playingCivs(); const inSec=id=>!!S.place[id];
  // Tonalité dorée du Soleil sur le fond noir : forte dans l'Interne, de moins en moins vers Kuiper
  // Halo doré CONTINU sur tout le système : fort près du Soleil (Interne), s'éteignant presque à Éris (Externe).
  // Niveaux [bord interne, bord externe] choisis pour se raccorder d'une carte à l'autre.
  const GOLD={interne:[.54,.384],jupiter:[.448,.308],saturne:[.44,.26],externe:[.26,.05]}[key]||[.5,.3];
  let s=`<defs>`
    +`<linearGradient id="msGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#7e5d1e" stop-opacity="${GOLD[0]}"/><stop offset="100%" stop-color="#6a4d18" stop-opacity="${GOLD[1]}"/></linearGradient>`
    +`<radialGradient id="msVig" cx="50%" cy="44%" r="66%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".42"/></radialGradient>`
    +`</defs>`;
  // fond noir profond, teinté d'or côté Soleil
  s+=`<rect width="400" height="600" fill="#050509"/>`;
  s+=`<rect width="400" height="600" fill="url(#msGold)"/>`;
  // étoiles
  {let x=key.length*29+5;const rnd=()=>{x=(x*9301+49297)%233280;return x/233280;};
   for(let i=0;i<72;i++){s+=`<circle cx="${(rnd()*400)|0}" cy="${(rnd()*600)|0}" r="${(rnd()*1.2+.3).toFixed(1)}" fill="#fff" opacity="${(rnd()*.55+.12).toFixed(2)}"/>`;}}
  s+=`<rect width="400" height="600" fill="url(#msVig)"/>`;
  // Ceinture d'astéroïdes : BANDEAU délimité (début/fin) rempli de mini-astéroïdes, sans saturer près des planètes
  if(S.band){const B=S.band;const ax=B.a[0],ay=B.a[1],bx=B.b[0],by=B.b[1];const dx=bx-ax,dy=by-ay;const L=Math.hypot(dx,dy)||1;const ux=dx/L,uy=dy/L;const nx=-uy,ny=ux;const hw=B.w/2;const warm=B.warm!==false;const ec=warm?'#caa86a':'#9fb3da';
    const EG=(x1,y1,x2,y2,o,w)=>`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${ec}" stroke-opacity="${o}" stroke-width="${w}" stroke-dasharray="3 5"/>`;
    s+=`<polygon points="${(ax+nx*hw).toFixed(1)},${(ay+ny*hw).toFixed(1)} ${(bx+nx*hw).toFixed(1)},${(by+ny*hw).toFixed(1)} ${(bx-nx*hw).toFixed(1)},${(by-ny*hw).toFixed(1)} ${(ax-nx*hw).toFixed(1)},${(ay-ny*hw).toFixed(1)}" fill="${ec}" opacity=".05"/>`;
    s+=EG(ax+nx*hw,ay+ny*hw,bx+nx*hw,by+ny*hw,.4,1.2)+EG(ax-nx*hw,ay-ny*hw,bx-nx*hw,by-ny*hw,.4,1.2);
    s+=EG(ax+nx*hw,ay+ny*hw,ax-nx*hw,ay-ny*hw,.55,1.4)+EG(bx+nx*hw,by+ny*hw,bx-nx*hw,by-ny*hw,.55,1.4);
    let x=key.length*61+7;const rnd=()=>{x=(x*9301+49297)%233280;return x/233280;};
    const bodies=ids.map(id=>{const p=S.place[id];return [p[0],p[1],(p[2]||mrad(id))+9];});
    let placed=0,tries=0;const N=B.n||55;
    while(placed<N&&tries<N*6){tries++;const t=rnd(),off=(rnd()-0.5)*B.w;const px=ax+ux*L*t+nx*off,py=ay+uy*L*t+ny*off;
      if(bodies.some(bd=>Math.hypot(px-bd[0],py-bd[1])<bd[2]))continue;
      const rad=(rnd()*1.4+.4),op=(rnd()*.45+.3),jc=(rnd()*26)|0;const cc=warm?`rgb(${196+jc},${172+jc},${122+jc})`:`rgb(${156+jc},${178+jc},${212+jc})`;
      s+=`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rad.toFixed(1)}" fill="${cc}" opacity="${op.toFixed(2)}"/>`;placed++;}
  }
  // arêtes réelles intra-secteur (collecte unique)
  const edges=[]; const seen=new Set();
  for(const id of ids){if(!isNodeBody(id))continue;for(const adj of (NODES[id].conn||[])){if(!inSec(adj)||!isNodeBody(adj))continue;const k=[id,adj].sort().join('|');if(seen.has(k))continue;seen.add(k);edges.push([id,adj]);}}
  // 1) traits de route (faibles si non construites, pleins si construites) — sous les corps
  for(const [a,b] of edges){const pa=S.place[a],pb=S.place[b];const built=playerRouteIdx(a,b)>=0;
    s+=`<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="${built?'#3fbf6a':'#33509a'}" stroke-width="${built?3:2}" stroke-dasharray="${built?'':'6,4'}" opacity="${built?'.95':'.5'}"/>`;}
  for(const ai of G.ais)for(const r of ai.routes){if(!inSec(r.from)||!inSec(r.to))continue;const pa=S.place[r.from],pb=S.place[r.to];s+=`<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="${ai.civ.color}" stroke-width="2" stroke-opacity=".5" stroke-dasharray="4,4"/>`;}
  // nexus : trait inter-secteurs (sous les corps)
  for(const nx of (S.nexus||[])){const pf=S.place[nx.fromNode];if(!pf)continue;const built=playerRouteIdx(nx.fromNode,nx.toNode)>=0;s+=`<line x1="${pf[0]}" y1="${pf[1]}" x2="${nx.xy[0]}" y2="${nx.xy[1]}" stroke="${built?'#3fbf6a':'#3a8a5a'}" stroke-width="${built?3:2}" stroke-dasharray="${built?'':'6,4'}" opacity=".85"/>`;}
  // 2) corps
  for(const id of ids){
    const p=S.place[id]; const bx=p[0],by=p[1]; const r=p[2]||mrad(id); const node=isNodeBody(id);
    // Pas de halo sur les planètes ni de cercle autour de la planète-décor : seule la colonie est cerclée.
    if(node){const pCol=G.player.colonies.find(c=>c.nodeId===id);const aRec=G.ais.map(ai=>({col:ai.colonies.find(c=>c.nodeId===id),ai})).find(x=>x.col);
      if(pCol)s+=`<circle cx="${bx}" cy="${by}" r="${r+5}" fill="none" stroke="${G.player.civ.color}" stroke-width="${pCol.level+1}" stroke-opacity="${pCol.connected?.9:.35}"/>`;
      else if(aRec)s+=`<circle cx="${bx}" cy="${by}" r="${r+5}" fill="none" stroke="${aRec.ai.civ.color}" stroke-width="${aRec.col.level+1}" stroke-opacity="${aRec.col.connected?.7:.3}"/>`;}
    const clickId=node?id:(MAP_CAPITAL_NODE[id]||null);
    s+= clickId?`<g style="cursor:pointer" onclick="handleNodeClick('${clickId}')">`:`<g>`;
    s+=`<image href="assets/map/${mapImg(id)}.png" xlink:href="assets/map/${mapImg(id)}.png" x="${bx-r}" y="${by-r}" width="${r*2}" height="${r*2}" preserveAspectRatio="xMidYMid meet"/>`;
    s+=`<text x="${bx}" y="${by+r+12}" text-anchor="middle" font-size="10" fill="${node?'#e3ecff':'#9fb4d6'}" font-weight="${node?'700':'400'}" style="paint-order:stroke;stroke:#05060f;stroke-width:2.5px">${bodyName(id)}</text>`;
    if(node)s+=`<text x="${bx}" y="${by+r+22}" text-anchor="middle" font-size="8.5" fill="#8fa0c8" style="paint-order:stroke;stroke:#05060f;stroke-width:2px">${NODES[id].baseVP} PV</text>`;
    s+=`</g>`;
  }
  // 3) étiquettes de temps + boutons « + » (par-dessus les corps)
  for(const [a,b] of edges){const pa=S.place[a],pb=S.place[b];const built=playerRouteIdx(a,b)>=0;const own=ownsNode(a)||ownsNode(b);
    const lab=routeTime(a,b); if(lab){const lx=pa[0]+0.72*(pb[0]-pa[0]),ly=pa[1]+0.72*(pb[1]-pa[1]),ang=Math.atan2(pb[1]-pa[1],pb[0]-pa[0])*180/Math.PI;s+=mapRouteLabel(lx,ly,ang,lab);}
    s+=mapPlus((pa[0]+pb[0])/2,(pa[1]+pb[1])/2,built,own,`mapRouteClick('${a}','${b}')`);
    const idx=playerRouteIdx(a,b); if(idx>=0&&(G.player.routes[idx].tokens||0)>0){const mx=(pa[0]+pb[0])/2,my=(pa[1]+pb[1])/2;s+=`<rect x="${mx+9}" y="${my-7}" width="13" height="13" rx="2" fill="${G.player.civ.color}"/><text x="${(mx+15.5).toFixed(0)}" y="${(my+3).toFixed(0)}" text-anchor="middle" font-size="9" fill="#fff">⚔</text>`;}
  }
  // 4) nexus : temps + bouton « + » (construit la vraie route) + pastille étape suivante
  for(const nx of (S.nexus||[])){const pf=S.place[nx.fromNode];if(!pf)continue;const ex=nx.xy[0],ey=nx.xy[1];
    const built=playerRouteIdx(nx.fromNode,nx.toNode)>=0; const own=ownsNode(nx.fromNode)||ownsNode(nx.toNode);
    const lab=routeTime(nx.fromNode,nx.toNode); if(lab){const lx=pf[0]+0.40*(ex-pf[0]),ly=pf[1]+0.40*(ey-pf[1]),ang=Math.atan2(ey-pf[1],ex-pf[0])*180/Math.PI;s+=mapRouteLabel(lx,ly,ang,lab);}
    s+=mapPlus((pf[0]+ex)/2,(pf[1]+ey)/2,built,own,`mapRouteClick('${nx.fromNode}','${nx.toNode}')`);
    const elab='→ '+nx.next,w=elab.length*5.6+16,cxp=Math.max(w/2+2,Math.min(398-w/2,ex)),cyp=Math.max(14,Math.min(560,ey));
    s+=`<g style="cursor:pointer" onclick="setSector('${nx.to}')"><rect x="${(cxp-w/2).toFixed(0)}" y="${(cyp-10).toFixed(0)}" width="${w.toFixed(0)}" height="20" rx="10" fill="#102a1a" stroke="#3a8a5a"/><text x="${cxp.toFixed(0)}" y="${(cyp+4).toFixed(0)}" text-anchor="middle" font-size="9.5" fill="#9ff0c0" font-weight="700">${elab}</text></g>`;
  }
  // étiquette du bandeau de ceinture (au-dessus des corps) + origine ceinturienne
  if(S.band&&S.band.lab)s+=`<text x="${S.band.lab[0]}" y="${S.band.lab[1]}" text-anchor="middle" font-size="10.5" fill="${S.band.warm===false?'#b9ccf0':'#e0cd97'}" font-weight="700" style="paint-order:stroke;stroke:#05060f;stroke-width:2.5px">⌁ ${S.band.name}</text>`;
  if(key==='externe'&&civsIn.includes('Ceinturiens')&&S.place['eris'])s+=`<text x="${S.place['eris'][0]}" y="${(S.place['eris'][1]-mrad('eris')-9).toFixed(0)}" text-anchor="middle" font-size="9" fill="#e0bdf2" font-weight="700" style="paint-order:stroke;stroke:#05060f;stroke-width:2.5px">⚑ Origine Ceinturiens (ceinture externe)</text>`;
  s+=`<g style="cursor:pointer" onclick="backToMap()"><rect x="14" y="14" width="112" height="32" rx="16" fill="#13203f" stroke="#33509a"/><text x="70" y="35" text-anchor="middle" font-size="12.5" fill="#bcd0ff" font-weight="700">← Carte</text></g>`;
  s+=`<text x="386" y="33" text-anchor="end" font-size="14" fill="${S.color}" font-weight="700" style="paint-order:stroke;stroke:#05060f;stroke-width:3px">${S.title}</text>`;
  return s;
}
function changePanel(dir){
  G.mapPanel=Math.max(0,Math.min(MAP_PANELS.length-1,(G.mapPanel||0)+dir));
  renderMap();
}
function getTechAreaMode(){
  const h=document.getElementById('tech-area').offsetHeight;
  return h<130?'compact':'full';
}
function showCardPreview(card,el){
  if(!card)return;
  const pv=document.getElementById('tc-preview');
  const area=document.getElementById('tech-area');
  const cost=getEffCost(card,G.player);
  const costStr='1AC '+Object.entries(cost).map(([r,a])=>'-'+a+rEmoji(r)).join(' ');
  document.getElementById('tp-art').textContent=card.emoji;
  document.getElementById('tp-name').textContent=card.name;
  document.getElementById('tp-effect').innerHTML=card.effect;
  document.getElementById('tp-cost').textContent=costStr;
  const rect=el.getBoundingClientRect();const aRect=area.getBoundingClientRect();
  pv.style.display='block';
  pv.style.left=(rect.left-aRect.left)+'px';
  pv.style.bottom=(aRect.bottom-rect.top+4)+'px';
}
function hideCardPreview(){document.getElementById('tc-preview').style.display='none';}
function techScrollTo(id){
  const b=document.getElementById('tech-body');if(!b)return;
  if(id==='top'){b.scrollTo({top:0,behavior:'smooth'});return;}
  const el=document.getElementById(id);if(!el)return;
  const bR=b.getBoundingClientRect(),eR=el.getBoundingClientRect();
  b.scrollTo({top:b.scrollTop+(eR.top-bR.top)-4,behavior:'smooth'});
}
/* ============================================================================
   LES TROIS RIVIÈRES — technologies · éco & société · militaire
   ----------------------------------------------------------------------------
   Demande de Marc (notée le 2026-08-03, faite le 2026-08-07) : les trois familles
   de cartes doivent être TROIS PAGES distinctes, pas une liste continue. Avant,
   les trois boutons ne faisaient que FAIRE DÉFILER vers une ancre : on voyait donc
   toujours un bout des autres, et sur mobile on se perdait.
   Maintenant chaque rivière est une vue ; les boutons changent de page.
   ⚠️ Les identifiants `sec-civ` et `sec-mil` sont CONSERVÉS : le tutoriel pointe
   dessus (étapes « Les 3 onglets », « Actions civiles », « Actions militaires »).
   La préférence n'est pas rangée dans `G` : ce n'est pas un état de partie, juste
   la page qu'on regarde. Elle repart sur « Techs » au rechargement, et c'est bien. */
let _riviereActive='tech';
function techRiviere(nom){
  _riviereActive=(nom==='civ'||nom==='mil')?nom:'tech';
  _appliquerRiviere();
}
function _appliquerRiviere(){
  for(const r of ['tech','civ','mil']){
    const el=document.getElementById('riv-'+r);
    if(el) el.style.display=(r===_riviereActive)?'':'none';
    const b=document.getElementById('riv-btn-'+r);
    if(b){ b.style.opacity=(r===_riviereActive)?'1':'.45'; b.style.outline=(r===_riviereActive)?'2px solid #ffffff55':'none'; }
  }
  const body=document.getElementById('tech-body'); if(body) body.scrollTop=0;
}
function renderTechTree(){
  const body=document.getElementById('tech-body');
  const compact=getTechAreaMode()==='compact';
  let html='<div id="riv-tech">';
  for(const[branchId,branch]of Object.entries(TECH_BRANCHES)){
    // Branche Empathes : visible seulement si Union Sacrée a été jouée
    if(branchId==='empathes'&&!G.empathesFounder)continue;
    const isBonus=G.player.civ.techBonus===branchId;
    html+=`<div class="tb-row"><div class="tb-label" style="color:${branch.color};border-left:2px solid ${branch.color}60;font-size:.6em">${branch.emoji}<span style="display:${compact?'none':'inline'};margin-left:3px">${branch.label}</span>${isBonus?'<span class="tb-bonus-star">★</span>':''}</div><div class="tb-cards">`;
    for(let tier=1;tier<=3;tier++){
      const card=CARDS_POOL.find(c=>c.branch===branchId&&c.tier===tier);
      if(!card){html+=`<div class="tcard tlocked" style="opacity:.15;min-height:${compact?'22px':'68px'}"><div class="tc-header"><span class="tc-name" style="color:#3a3a6a">—</span></div></div>`;if(tier<3)html+=`<div class="tcard-arr">→</div>`;continue;}
      /* CARTE BLOQUÉE PAR UN PRÉREQUIS → COIN CORNÉ (demande de Marc, 2026-08-07).
         La carte reste ENTIÈRE : on ne replie plus rien, on ne cache rien. Un coin replié en haut à
         droite, comme on marque une page dans un livre, dit « celle-ci, tu ne peux pas encore ».
         La raison précise est dans l'info-bulle et sur la grande carte.
         ⚠️ `techLockReason` ne rend une raison QUE pour un prérequis manquant — palier non ouvert,
         T2 de la branche absente, branche réservée. Une technologie déjà acquise ou déjà prise par
         une autre nation ne passe donc PAS par ici : elle garde ses propres marques (✓ et ⛔).
         C'est voulu (Marc, 2026-08-08) : deux signalétiques sur la même carte se neutralisent. */
      const _raisonLock=(typeof techLockReason==='function')?techLockReason(card,G.player):null;
      const _cornee=!!(_raisonLock&&!G.player.cards.find(c=>c.id===card.id));
      const exclusive=isTechExclusive(card);
      const playerOwned=!!G.player.cards.find(c=>c.id===card.id);
      const aiOwned=G.ais.some(ai=>ai.cards.find(c=>c.id===card.id));
      const aiOwnedFirst=G.ais.find(ai=>ai.cards.find(c=>c.id===card.id));
      const _aiEmoji=aiOwnedFirst?aiOwnedFirst.civ.emoji:(G.ais[0]?G.ais[0].civ.emoji:'🤖');
      const exclusiveTaken=exclusive&&G.techTaken.has(card.id);
      const unavailForPlayer=playerOwned||exclusiveTaken;
      const cost=getEffCost(card,G.player);
      const costHtmlStr=costHtml(cost);
      const acCost=card.tier===3?2:1;
      const canAfford=G.phase==='actions'&&G.player.acLeft>=acCost&&Object.entries(cost).every(([r,a])=>(G.player.res[r]||0)>=a);
      let cls='tcard';
      if(!isTechAvailable(card,G.player))cls+=' tlocked';
      else if(unavailForPlayer)cls+=' ttaken';
      else if(!canAfford)cls+=' tcantbuy';
      else cls+=' tavail';
      if(isBonus&&!unavailForPlayer&&canAfford)cls+=' tbonus';
      if(compact)cls+=' tc-compact';
      if(playerOwned)cls+=' tc-mine';
      if(_cornee)cls+=' tc-corne';
      const artBg=branch.color+'18';
      // Petites cartes : on n'affiche QUE le statut "à toi" ; le détail (quelle nation) est sur la grande carte.
      let statusBadge='';
      // Symbole seul (large), le mot en info-bulle : « Pris » écrit en tout petit était illisible.
      if(playerOwned)statusBadge=`<span class="tc-taken-badge tb-mine" title="Tu possèdes cette technologie">✓</span>`;
      else if(exclusiveTaken)statusBadge=`<span class="tc-taken-badge tb-taken" title="Déjà prise par une autre nation — plus disponible">⛔</span>`;
      /* ⚠️ PLUS DE CADENAS SUR L'ILLUSTRATION (Marc, 2026-08-08). Il était redondant — la carte porte
         déjà son atténuation, son rouleau et le texte du prérequis — et sa qualité de rendu jurait
         avec les illustrations. Le voile noir qui l'accompagnait assombrissait l'image une seconde
         fois, par-dessus l'opacité de la carte. */
      const lockOverlay='';
      // Always open detail on click — no direct buy
      const onclick=`showTechDetail('${card.id}')`;
      if(compact){
        const acLabel=card.tier===3?'2AC':'1AC';
        const costStr=Object.entries(cost).map(([r,a])=>'-'+a+rEmoji(r)).join(' ');
        const compactStatus=playerOwned?'<span style="color:#66cc66">✓</span>'+(!exclusive&&aiOwned?`<span style="color:#9080c0">+${_aiEmoji}</span>`:''):exclusiveTaken?'<span style="color:#7880a0">🤖</span>':!exclusive&&aiOwned?`<span style="color:#9080c0;font-size:.85em">${_aiEmoji}+</span><span class="res-tag energy" style="font-size:.9em">${acLabel}</span> `+costStr:'<span class="res-tag energy" style="font-size:.9em">'+acLabel+'</span> '+costStr;
        html+=`<div class="${cls}"${_cornee?` title="${card.name} — ${_raisonLock}"`:''} onclick="${onclick}" onmouseleave="hideCardPreview()" style="border-top:2px solid ${branch.color}80">
          <div class="tc-header">
            <span class="tc-name">${card.emoji} ${card.name}</span>
            <span class="tc-tier">T${tier}</span>
            <span style="font-size:.58em;margin-left:4px;flex-shrink:0">${compactStatus}</span>
          </div></div>`;
      } else {
        let costDisplay;
        if(playerOwned)costDisplay='<span style="color:#8df59d">✓ À toi</span>';
        else if(exclusiveTaken)costDisplay='<span style="color:#ff9d9d">⛔ Prise</span>';
        else if(!canAfford)costDisplay='<span class="res-tag energy" style="font-size:.85em;opacity:.6">'+(card.tier===3?'2':'1')+'AC</span> <span style="color:#cc8844;font-size:.82em">'+Object.entries(cost).map(([r,a])=>{const have=G.player.res[r]||0;const ok=have>=a;return`<span style="color:${ok?'#8898b8':'#ff7744'}">${a}${rEmoji(r)}</span>`;}).join(' ')+'</span>';
        else costDisplay='<span class="res-tag energy" style="font-size:.85em">'+(card.tier===3?'2':'1')+'AC</span> '+costHtmlStr;
        html+=`<div class="${cls}"${_cornee?` title="${card.name} — ${_raisonLock}"`:''} onclick="${onclick}" style="border-top:2px solid ${branch.color}80;min-height:68px;cursor:pointer">
          <div class="tc-header"><span class="tc-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">${card.name}</span><span class="tc-tier">T${tier}</span></div>
          <div class="tc-art${CARD_ART.has(card.id)?' tc-illus':''}" style="${CARD_ART.has(card.id)?`background-image:url('assets/cards/${card.id}.png')`:`background:${artBg}`}">${CARD_ART.has(card.id)?'':card.emoji}${statusBadge}${lockOverlay}</div>
          <div class="tc-body">
            <div class="tc-effect">${card.effect}</div>
            <div class="tc-cost">${costDisplay}</div>
          </div>
        </div>`;
      }
      if(tier<3)html+=`<div class="tcard-arr">→</div>`;
    }
    html+=`</div></div>`;
  }
  html+='</div>';   // ← fin de la rivière TECHNOLOGIES
  // ── RIVIÈRE ÉCO & SOCIÉTÉ — Marché Civique (cartes répétables, coût <i class=ri-materials></i>) ──
  html+='<div id="riv-civ" style="display:none">';
  html+=`<div class="gen-row" id="sec-civ" style="border-top:2px solid #2a3a5a;padding-top:3px">
    <div class="gen-label" style="color:#88c8ff;font-size:.56em">💼<span style="display:${compact?'none':'inline'};margin-left:2px">Éco &amp; Société</span></div>`;
  // Cartes répétables mises EN TÊTE de la rivière (les plus utilisées, donc les plus faciles à trouver) :
  // Extraction d'He3, Capture d'astéroïdes, puis Investissement dans la Recherche (demande de Marc).
  const _civTop=['cm_explore','cm_forages','cm_research'];
  const cmSocial=CIVIC_MARKET.filter(c=>c.type==='social')
    .sort((a,b)=>(_civTop.indexOf(a.id)<0?99:_civTop.indexOf(a.id))-(_civTop.indexOf(b.id)<0?99:_civTop.indexOf(b.id)));
  const cmGov=CIVIC_MARKET.filter(c=>c.type==='government');
  for(const subGroup of[cmSocial,cmGov]){
    for(const card of subGroup){
      const isGov=card.type==='government';
      const isRepeat=!!(card.repeatable||card.calmAction||card.perTurn); // perTurn = utilisable CHAQUE tour → ∞
      const isCurrentForm=isGov&&G.player.govForm===card.id;
      const taken=isGov?false:(!isRepeat&&G.civicTaken.has(card.id)); // bloqué : 1× social déjà pris
      const cost=card.cost;const canBuy=!taken&&!isCurrentForm&&G.phase==='actions'&&G.player.acLeft>=1&&Object.entries(cost).every(([r,a])=>(G.player.res[r]||0)>=a);
      const border=isGov?'#4a90e8':'#66cc88';
      const artBg=border+'18';
      const costStr=Object.entries(cost).map(([r,a])=>'-'+a+rEmoji(r)).join(' ');
      const badge=isCurrentForm?'✓':isRepeat?'∞':isGov?'GOV':'1×';
      const badgeCol=taken?'#ff6060':isCurrentForm?'#88ccff':border;
      const govTag=isGov?'<span style="font-size:.5em;background:#1c3a6a;color:#9cc8ff;border-radius:3px;padding:0 3px;margin-left:3px;vertical-align:middle">GOV</span>':'';
      /* ⚠️ TROIS ÉTATS À DISTINGUER, ET UN SEUL L'ÉTAIT.
         · déjà prise et non répétable → ROULEAU (`taken` est déjà faux pour les répétables, la garde
           que j'avais ajoutée en plus était inutile et masquait le cas des cartes `calmAction`) ;
         · pas les moyens (ressources, AC, ou hors phase d'actions) → simplement ATTÉNUÉE, jamais
           enroulée : demain tu pourras l'acheter, le rouleau dirait le contraire ;
         · achetable → pleine lumière. */
      const _cls=(taken?' gc-corne no-buy':(!canBuy&&!isCurrentForm?' no-buy':''))+(isCurrentForm?' gc-mine':'');
      if(compact){
        html+=`<div class="gcard gc-compact${_cls}" onclick="showMarketDetail('${card.id}')" style="border-top:2px solid ${border}">
          <div class="gc-header"><span class="gc-name">${card.emoji} ${card.name}${govTag}</span><span class="gc-cost">${taken?'✗':isCurrentForm?'✓':canBuy?'1AC '+costStr:'—'}</span></div></div>`;
      } else {
        html+=`<div class="gcard${_cls}" onclick="showMarketDetail('${card.id}')" style="border-top:2px solid ${border};cursor:pointer">
          <div class="gc-header"><span class="gc-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">${card.name}${govTag}</span></div>
          <div class="gc-art${CARD_ART.has(card.id)?' gc-illus':''}" style="${CARD_ART.has(card.id)?`background:#0a0a18 url('assets/cards/${card.id}.png') center/cover no-repeat`:`background:${artBg}`}">${CARD_ART.has(card.id)?'':card.emoji}<span style="position:absolute;top:1px;right:2px;font-size:.55em;color:${badgeCol}">${badge}</span></div>
          <div class="gc-body"><div class="tc-effect" style="color:#8898b8">${card.effect}</div>
          <div class="gc-cost">${taken?'<span style="color:#ff6060;font-size:.8em">Déjà utilisé</span>':isCurrentForm?'<span style="color:#88ccff;font-size:.8em">Forme actuelle</span>':canBuy?'<span class="res-tag energy" style="font-size:.85em">1AC</span> '+costHtml(cost):'<span style="color:#5a6a8a">'+costStr+'</span>'}</div></div>
        </div>`;
      }
    }
  }
  html+=`</div>`;
  // Civiques (permanentes)
  const civCards=(G.civRiver||[]).filter(c=>c&&!G.techTaken.has(c.id));
  const milCards=(G.milRiver||[]).filter(c=>c);
  function renderNonBranchRow(label,cards,maxShow){
    let r=`<div class="gen-row"><div class="gen-label">${label}</div>`;
    const shown=cards.slice(0,maxShow);
    for(const card of shown){
      // Civique : taken = joueur l'a déjà (1× par joueur). Militaire : grisé si déjà acheté CE tour (1×/tour). Autre : techTaken global.
      const milThisTurn=card.type==='militaire'&&G.player._milBoughtThisTurn&&G.player._milBoughtThisTurn.has(card.id);
      const taken=milThisTurn||(card.repeatable?false:G.techTaken.has(card.id));
      const mine=G.player.cards.some(c=>c.id===card.id);
      const cost=getEffCost(card,G.player);
      const costHtmlStr=costHtml(cost);
      const _acN=card.ac||1;const _reqOk=!card.reqCard||G.player.cards.some(c=>c.id===card.reqCard);
      const canBuy=!taken&&_reqOk&&G.phase==='actions'&&G.player.acLeft>=_acN&&Object.entries(cost).every(([res,a])=>(G.player.res[res]||0)>=a);
      const border=couleurCarte(card);
      const artBg=border+'20';
      /* ⚠️ LE ROULEAU AUSSI SUR LES CARTES ÉCO&SOC ET MILITAIRES (Marc, 2026-08-08).
         Elles n'avaient qu'une opacité de 0,4 posée EN LIGNE — qui écrasait au passage
         l'uniformisation des trois niveaux, un style en ligne l'emportant sur une feuille de style.
         Deux motifs de blocage : la technologie requise manque, ou l'action a déjà été utilisée.
         ⚠️ JAMAIS pour les cartes RÉPÉTABLES (Capture d'astéroïdes) ni celles jouables à chaque tour
         (Investissement dans la Recherche) : elles restent achetables plusieurs fois, donc jamais
         enroulées. On s'appuie sur `taken`, que le jeu calcule DÉJÀ en tenant compte de ces deux
         cas — plutôt que de réécrire la règle et risquer de la faire diverger. */
      /* ⚠️ MON ERREUR : LE PRÉREQUIS NE DÉPEND PAS DE LA RÉPÉTABILITÉ.
         J'avais écrit `!répétable && (prise || prérequis manquant)`. Or les cartes militaires SONT
         répétables — les IA achètent des Drones de Combat à chaque tour dans les logs. Le garde-fou
         destiné aux seules cartes « déjà prises » annulait donc AUSSI le rouleau des cartes bloquées
         par un prérequis, qui sont justement les plus nombreuses côté militaire. D'où : aucune carte
         militaire enroulée, alors que c'est le cas le plus visible du jeu.
         Une technologie manquante bloque une carte, qu'elle soit répétable ou non. */
      const _repet=!!(card.repeatable||card.perTurn);
      const _gcBloque=(!_reqOk)||(taken&&!_repet);
      const _gcCls=(_gcBloque?' gc-corne no-buy':(!canBuy?' no-buy':''))+(mine?' gc-mine':'');
      if(compact){
        r+=`<div class="gcard gc-compact${_gcCls}" onclick="showGeneralDetail('${card.id}')" style="border-top:2px solid ${border}">
          <div class="gc-header"><span class="gc-name">${card.emoji} ${card.name}</span><span class="gc-cost">${taken?'✗':!_reqOk?'🔒':canBuy?_acN+'AC':'—'}</span></div></div>`;
      } else {
        r+=`<div class="gcard${_gcCls}" onclick="showGeneralDetail('${card.id}')" style="border-top:2px solid ${border};cursor:pointer">
          <div class="gc-header"><span class="gc-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">${card.name}</span></div>
          <div class="gc-art${CARD_ART.has(card.id)?' gc-illus':''}" style="${CARD_ART.has(card.id)?`background:#0a0a18 url('assets/cards/${card.id}.png') center/cover no-repeat`:`background:${artBg}`}">${CARD_ART.has(card.id)?'':card.emoji}${(card.repeatable||card.perTurn)?'<span style="position:absolute;top:1px;right:3px;font-size:.55em;color:#ffaa44">∞</span>':''}</div>
          <div class="gc-body"><div class="tc-effect" style="color:#8898b8">${card.effect}</div>
          <div class="gc-cost">${taken?'<span style="color:#ff6060;font-size:.8em">Acquis</span>':!_reqOk?'<span style="color:#cc7744;font-size:.72em">🔒 '+(CARDS_POOL.find(c=>c.id===card.reqCard)?.name||'tech requise')+'</span>':canBuy?'<span class="res-tag energy" style="font-size:.85em">'+_acN+'AC</span> '+costHtmlStr:'<span class="res-tag energy" style="font-size:.85em;opacity:.6">'+_acN+'AC</span> <span style="font-size:.82em">'+Object.entries(cost).map(([res,a])=>{const _ok=(G.player.res[res]||0)>=a;return '<span style="color:'+(_ok?'#8898b8':'#ff7744')+'">'+a+rEmoji(res)+'</span>';}).join(' ')+'</span>'   /* ⚠️ ICÔNES, PAS DES MOTS : cette branche — la seule où le joueur ne peut pas payer — écrivait « Énergie 2 Matériaux 3 » via rLabel(), alors que les trois autres branches utilisent rEmoji(). D'où des cartes qui changeaient d'écriture selon qu'on avait les moyens ou non. En prime, on colore en rouge la ressource qui manque, comme partout ailleurs. */}</div></div>
        </div>`;
      }
    }
    r+=`</div>`;return r;
  }
  html+='</div>';   // ← fin de la rivière ÉCO & SOCIÉTÉ
  // ── RIVIÈRE MILITAIRE ──
  html+='<div id="riv-mil" style="display:none"><div id="sec-mil"></div>'
      + renderNonBranchRow('⚔️ Militaire',milCards,6) + '</div>';
  body.innerHTML=html;
  _appliquerRiviere();   // ⚠️ après chaque rendu : sinon on retombe sur les trois rivières visibles
  const unlocked=Object.values(G.branchTiers).filter(t=>t>0).length;
  document.getElementById('branch-progress-summary').textContent=unlocked+'/6 branches';
}
function renderRight(){
  const p=G.player;
  document.getElementById('r-civ-hdr').innerHTML=`<span class="ce">${p.civ.emoji}</span><span class="cn">${p.civ.name}</span><span style="font-size:.62em;color:${TECH_BRANCHES[p.civ.techBonus]?.color||'#5a6a8a'};margin-left:4px">★ ${TECH_BRANCHES[p.civ.techBonus]?.emoji||''}</span>`;
  // Capacité de la nation (passif + pouvoir actif avec coût) — sous les ressources dans le menu Empire.
  {const _ab=p.civ.active;const _rE=(typeof rEmoji==='function')?rEmoji:(r=>r);
   const _cost=_ab?((_ab.ac||0)+' AC'+(Object.keys(_ab.cost||{}).length?(' '+Object.entries(_ab.cost).map(([r,v])=>'−'+v+_rE(r)).join(' ')):' (gratuit)')):'';
   const _abEl=document.getElementById('r-ability');
   if(_abEl)_abEl.innerHTML=(p.civ.passive?('<div style="color:#9fb4d6"><b>Passif :</b> '+p.civ.passive+'</div>'):'')
     +(_ab?('<div style="margin-top:5px;color:#ffd9a0"><b>💫 '+_ab.name+'</b> <span style="color:#8fb0d8">('+_cost+')</span>'+(p.abilityUsed?' <span style="color:#ff8888">· déjà utilisée</span>':'')+'<div style="color:#9aa8c4;margin-top:1px">'+(_ab.desc||'')+'</div></div>'):'');}
  const res=[['energy','<i class=ri-energy></i>','Énergie','#FFD700'],['materials','<i class=ri-materials></i>','Mat.','#FFA040'],['science','<i class=ri-science></i>','Savoir','#40D0FF'],['morale','<i class=ri-morale></i>','Moral','#FF6080']];
  const _netR=_netIncome(p);
  document.getElementById('r-res').innerHTML=res.map(([r,e,n,col])=>{const nv=_netR[r]||0;const nc=nv<0?'#ff6b6b':nv>0?'#7fe0a0':'#8898b8';return`<div class="rbox"><div class="rn" style="color:${col}">${e} ${n}</div><div class="rv" style="color:${col}">${p.res[r]||0}</div><div style="font-size:.66em;font-weight:700;color:${nc}" title="Revenu net estimé par tour (revenus − entretien)">${nv>0?'+':''}${nv}/t</div></div>`;}).join('');
  // Gov track
  const next=[5,10,15,'MAX'][p.gov_level-1];
  document.getElementById('r-gov').innerHTML=`<div class="gov-track">`+[1,2,3,4].map(l=>`<span class="gov-dot ${p.gov_level>=l?'active':''}">${l}</span>`).join('')+`</div><div class="gov-info">${p.gov_pts} pts · <strong>${p.acLeft}/${p.acMax} AC</strong></div><div class="gov-next">${typeof next==='number'?'Nv.'+(p.gov_level+1)+' dans '+(next-p.gov_pts)+' pts':'Niveau max !'}</div>`;
  // Force tokens — 4 catégories : dispo (rouge) / garnison colonies (rosé) / sur routes (gris) / récupération (bleu)
  const onRoute=p.routes.filter(r=>(r.tokens||0)>0).length;
  const onCd=p.forceCooldown.reduce((s,fc)=>s+fc.count,0);
  const reservedCol=p.colonies.filter(c=>c.connected&&c.nodeId!==p.civ.home).length; // 1 jeton réservé/garnison par colonie connectée
  const inReserve=p.forceTokens||0;
  const garrison=Math.min(inReserve,reservedCol);          // rosé : réservés par tes colonies
  const freeAvail=Math.max(0,inReserve-reservedCol);       // rouge : réellement engageables en attaque
  const totalF=inReserve+onRoute+onCd;
  const dots=Array.from({length:Math.max(totalF,1)},(_,i)=>{
    if(i<freeAvail)return'<span class="ft-dot avail" title="Disponible (engageable)"></span>';
    if(i<freeAvail+garrison)return'<span class="ft-dot reserved" title="Réservé — garnison d\'une colonie"></span>';
    if(i<inReserve+onRoute)return'<span class="ft-dot deployed" title="Déployé sur une route"></span>';
    return'<span class="ft-dot cd" title="En récupération"></span>';
  }).join('');
  document.getElementById('r-force').innerHTML=`<div class="force-display">${dots}</div>`+
    `<div class="force-info"><strong>${freeAvail}</strong> engageable(s)${garrison>0?' · '+garrison+' garnison':''}${onRoute>0?' · '+onRoute+' route(s)':''}${onCd>0?' · '+onCd+' récupération':''} | Raid : −1 AC, −${p.civ.id==='ceinturiens'?'1':'2'} jeton(s)</div>`+
    `<div class="force-legend" style="font-size:.66em;color:#8898b8;margin-top:4px;display:flex;gap:9px;flex-wrap:wrap;align-items:center"><span><span class="ft-dot avail" style="width:9px;height:9px;vertical-align:-1px"></span> dispo</span><span><span class="ft-dot reserved" style="width:9px;height:9px;vertical-align:-1px"></span> garnison colonies</span><span><span class="ft-dot deployed" style="width:9px;height:9px;vertical-align:-1px"></span> routes</span><span><span class="ft-dot cd" style="width:9px;height:9px;vertical-align:-1px"></span> récupération</span></div>`;
  // Colonies & Routes
  document.getElementById('r-cols').innerHTML=p.colonies.map(c=>{const n=NODES[c.nodeId];return`<span><span class="col-dot" style="background:${n.color};opacity:${c.connected?.9:.3}"></span>${n.name} Nv${c.level}${c.connected?'':' ✗'}</span><br>`;}).join('')+(p.routes.length?`<span style="color:#5a6a8a">Routes : ${p.routes.length}</span>`:'')
    +'<div style="margin-top:8px;padding-top:7px;border-top:1px solid #2a3a5a;font-size:.72em;color:#9fb0d0;line-height:1.5">'
    +'<div style="font-weight:700;color:#ffd0a0;margin-bottom:3px">⚠️ En cas de manque en fin de tour</div>'
    +'• <b>Entretien colonies impayé</b> (⚡ Nv.2-3, 🪨 Nv.3) → perte de <b>moral</b> (−1 par ressource manquante).<br>'
    +'• <b>Moral 0</b> → GUERRE CIVILE : aucun revenu ce tour. <b>Moral 1</b> → revenus ÷2.<br>'
    +'• <b>Route sans ⚡</b> (entretien impayé) → route <b>non alimentée</b> : pas de revenu commercial ce tour, cargos vulnérables.<br>'
    +'• <b>Route non protégée</b> (sans jeton Force) → risque d\'être <b>pillée et DÉTRUITE</b> par les pirates. Protège tes routes avec un jeton.'
    +'</div>';
  // Investissement actif
  const invEl=document.getElementById('r-invest');
  if(invEl){
    let invHtml='';
    /* On lit `p._inv1` — la nation AFFICHÉE — et non `G.playerInvest`, qui est commun à toute la
       partie et montrait donc l'investissement d'un autre joueur. */
    const pCard=INVESTMENT_CARDS.find(c=>c.id===p._inv1);
    if(pCard&&G.investApplied){
      invHtml+=`<div class="invest-badge"><span class="ib-emoji">${pCard.emoji}</span><span class="ib-text"><strong>${pCard.name}</strong><br><span class="ib-effect">${pCard.benefit}</span></span></div>`;
    }
    const pCard2=INVESTMENT_CARDS_2&&p._inv2?INVESTMENT_CARDS_2.find(c=>c.id===p._inv2):null;
    if(pCard2&&p.investBonus2&&(p.investBonus2.turnsLeft===undefined||p.investBonus2.turnsLeft>0)){
      const tl=p.investBonus2.turnsLeft!==undefined?` · ${p.investBonus2.turnsLeft}T restants`:'';
      invHtml+=`<div class="invest-badge invest-badge2"><span class="ib-emoji">${pCard2.emoji}</span><span class="ib-text"><strong>${pCard2.name}</strong><br><span class="ib-effect">${pCard2.benefit}${tl}</span></span></div>`;
    }
    invEl.innerHTML=invHtml||'<span style="color:#3a3a6a;font-size:.72em">Aucun investissement actif.</span>';
  }
  // Active cards
  const el=document.getElementById('r-cards');
  el.innerHTML=p.cards.length===0?'<span style="color:#3a3a6a;font-size:.72em">Aucune carte active.</span>':p.cards.map(card=>{
    const border=couleurCarte(card);
    const copyBadge=card.espCopy?'<span style="font-size:.58em;color:#ff9040;margin-left:3px">ESP</span>':card._empathCopy?'<span style="font-size:.58em;color:#c080ff;margin-left:3px">TÉLÉP</span>':'';
    return`<div class="acard" style="border-color:${border}${card.espCopy||card._empathCopy?';border-style:dashed':''}" title="${card.effect}"><div class="acard-name">${card.emoji} ${card.name}${copyBadge}</div><div class="acard-effect">${card.effect}</div></div>`;
  }).join('');
  // Agendas
  const myAg=p.agenda;
  document.getElementById('r-agendas').innerHTML=myAg?(()=>{const score=typeof myAg.score==='function'?myAg.score(p):0;return`<div class="agenda-item"><div class="agenda-name">${myAg.emoji} ${myAg.name}<span style="color:#5a6a8a;font-size:.6em;margin-left:4px">(secret)</span></div><div class="agenda-desc">${myAg.desc}</div><div class="agenda-status ${score>0?'agenda-ok':'agenda-no'}">${score>0?'✓ +'+score+' VP':'En cours…'}</div></div>`+G.ais.map(ai=>ai.agenda?`<div class="agenda-item" style="opacity:.55"><div class="agenda-name">${ai.civ.emoji} ${ai.civ.name} — ${ai.agenda.emoji} ${ai.agenda.name}</div></div>`:''). join('');})():'<div style="color:#5a6a8a;font-size:.7em">Aucun agenda</div>';
  // AI summary
  document.getElementById('r-ai').innerHTML=G.ais.map(ai=>{const aiVP=calcVP(ai);const aiCd=ai.forceCooldown.reduce((s,fc)=>s+fc.count,0);const _int=getIntelLevel(G.player);const pf=perceivedForce(G.player,ai);const forceTxt=pf.exact?('⚔️'+pf.val+(aiCd>0?'(+'+aiCd+'cd)':'')+' <span style="color:#5a7a66">(renseignement)</span>'):('⚔️~'+pf.val+' <span style="color:#5a6a8a">(±3, sans renseignement)</span>');const eco=_int>=2?('<i class=ri-energy></i>'+(ai.res.energy||0)+' <i class=ri-materials></i>'+(ai.res.materials||0)+' <i class=ri-science></i>'+(ai.res.science||0)+' <i class=ri-morale></i>'+(ai.res.morale||0)):'<span style="color:#5a6a8a">éco &amp; moral : inconnus (tech Renseignement)</span>';return`${ai.civ.emoji} <strong>${ai.civ.name}</strong> · Nv.${ai.gov_level}<br>${eco}<br>${forceTxt} · Cols:${ai.colonies.length} Routes:${ai.routes.length}<br><strong style="color:#ffd700">~${aiVP.total} VP estimés</strong>`;}).join('<hr style="border-color:#1a1a3a;margin:4px 0">');
}
function renderActions(){
  const active=G.phase==='actions';
  ['btn-col','btn-route','btn-ability','btn-end'].forEach(id=>{const b=document.getElementById(id);if(b)b.disabled=!active;});
  {const _bu=document.getElementById('btn-undo');if(_bu)_bu.disabled=!active||undoStack.length===0;}
  document.getElementById('btn-col').classList.toggle('on',mode==='colonize');
  document.getElementById('btn-route').classList.toggle('on',mode==='route');
  if(active){const p=G.player;const tc=p.civ.id==='ceinturiens'?1:2;document.getElementById('btn-raid').disabled=p.acLeft<1||p.forceTokens<tc;}
  else document.getElementById('btn-raid').disabled=true;
}
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LE RENDEMENT D'UN NŒUD, NIVEAU PAR NIVEAU
   ----------------------------------------------------------------------------------------------
   Marc, 27/08 : « j'aimerais que tu indiques sur les colonies du jeu le revenu niv 1, niv 2 et
   niv 3 [...] comme ça on peut choisir la meilleure colonie dès le départ. »

   ⚠️ CE TEXTE NE RECALCULE RIEN. Il appelle `revenuDuneColonie` — la fonction qui produit vraiment
   les ressources à chaque fin de tour. Recopier la formule ici (×1,5, ×2, +❤️, +🔬) aurait créé une
   seconde vérité, et c'est la maladie documentée du projet : deux chemins finissent toujours par
   diverger, et c'est l'affichage qui ment sans que rien ne le signale.

   Ce que l'affichage révèle, et qui n'était visible nulle part : le ×1,5 du niveau 2 est ARRONDI
   VERS LE BAS. Europe, Encelade, Triton et Pluton ne gagnent donc rien sur leurs ressources de base
   en passant au niveau 2 — seulement le ❤️ et le 🔬. Io et Cérès, eux, décollent. Le joueur pouvait
   difficilement le deviner ; maintenant il le lit avant de coloniser.

   `nat` sert à refléter les techs de CELUI QUI REGARDE (Terraformation change le rendement) : cette
   fonction AFFICHE, elle n'applique aucune règle, donc lire la nation courante est légitime.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function revenusParNiveau(nodeId,nat){
  const node=NODES[nodeId];
  if(!node||node.decorative) return '';
  const p=nat||(typeof G!=='undefined'&&G.player)||null;
  const max=node.maxLv||3;
  const bloc=[];
  for(let lv=1;lv<=max;lv++){
    const o=revenuDuneColonie(p,{nodeId:nodeId,level:lv,connected:true});
    const txt=Object.entries(o).map(([r,a])=>a+rEmoji(r)).join(' ')||'—';
    bloc.push('<span style="color:#7a8aa0">Nv'+lv+'</span> '+txt);
  }
  return bloc.join(' <span style="color:#3a3a6a">·</span> ');
}
/* ============================================================ NODE POPUP ============================================================ */
function showNodePopup(nodeId){
  if(G.phase!=='actions')return;
  const node=NODES[nodeId];
  if(node.decorative||node.noColonize){return;} // Anneau jovien / Station Jupiter — non colonisable
  /* ═══════ DEUX OCCUPANTS, ET CHACUN N'EN VOYAIT QU'UN ═══════
     ⚠️ `G.ais.map(…).find(x=>x.col)` prend le PREMIER occupant trouvé dans la table interne. Sur un
     nœud partagé — le seul cas possible, l'Exploration Extra-Solaire — ce premier occupant dépend de
     l'ordre des nations, donc du siège de celui qui regarde. Marc et Laurent, partie 140A : sur
     Éris, Marc voyait « colonie des Jupitériens Nv.1 » et Laurent, à qui Éris appartient, voyait sa
     propre Nv.3. Deux écrans, deux vérités, aucune mention du fait qu'ils étaient DEUX.
     Pire : le bouton d'attaque visait cet occupant arbitraire — d'où Laurent capable de « raider sa
     propre colonie ». La règle l'autorise (un cohabitant peut chasser l'autre), mais l'écran ne
     disait pas qui il visait.
     On liste donc TOUS les occupants, et la cible des boutons est celle que le moteur retiendra :
     `defenseurPrincipal`, la même fonction qui résout l'assaut. */
  const pCol=G.player.colonies.find(c=>c.nodeId===nodeId);
  const _occupants=allPlayers().filter(n=>n!==G.player&&n.colonies.some(c=>c.nodeId===nodeId))
    .map(n=>({nat:n, col:n.colonies.find(c=>c.nodeId===nodeId)}));
  const _defPrinc=(typeof defenseurPrincipal==='function')?defenseurPrincipal(nodeId,G.player):null;
  const aColInfo=(_defPrinc&&_defPrinc!==G.player)
    ? {ai:_defPrinc, col:_defPrinc.colonies.find(c=>c.nodeId===nodeId)}
    : (_occupants[0]?{ai:_occupants[0].nat, col:_occupants[0].col}:null);
  const aCol=aColInfo?aColInfo.col:null;const aColAI=aColInfo?aColInfo.ai:null;
  document.getElementById('npop-title').textContent=node.emoji+' '+node.name;
  const resStr=Object.entries(node.res).map(([r,a])=>'+'+a+rEmoji(r)).join(' ');
  const revStr=revenusParNiveau(nodeId,G.player);
  /* LE défaut signalé par Marc : c'est MON accord qui compte, pas celui du voisin d'en face. */
  const accord=accordAvecMoi(nodeId,G.player);
  document.getElementById('npop-info').innerHTML=`VP: ${node.baseVP} | ${resStr}<br>${revStr}<br>Type: ${({moon:'Lune',dwarf_planet:'Planète naine',asteroid:'Astéroïde',orbital_station:'Station orbitale',planet:'Planète',gas_giant:'Géante gazeuse'})[node.type]||node.type}${pCol?`<br>✅ <b style="color:${G.player.civ.color}">${G.player.civ.emoji} ${G.player.civ.name} (toi)</b> — Nv.${pCol.level}${pCol.connected?' ✓':' ✗ déconnectée'}`:''}${_occupants.map(o=>`<br>🏴 Colonie de <b style="color:${o.nat.civ.color}">${o.nat.civ.emoji} ${o.nat.civ.name}</b> — Nv.${o.col.level}${(o.nat===aColAI&&accord)?' 🤝 accord':''}${(_occupants.length>1&&o.nat===aColAI)?' <span style="color:#ffcc88">← cible de tes actions</span>':''}`).join('')}${(_occupants.length>1||(pCol&&_occupants.length))?'<br><span style="color:#ffcc88;font-size:.9em">⚠️ Nœud PARTAGÉ — les occupants se défendent ensemble contre un tiers ; entre eux, l\'un peut chasser l\'autre.</span>':''}${!pCol&&!aCol?'<br><span style="color:#7a8aa0">Inoccupé</span>':''}${getPiratePos(G.turn)===nodeId?'<br><span style="color:#ff8888">⚠️ Pirates ici !</span>':''}`;
  const acts=document.getElementById('npop-acts');acts.innerHTML='';
  if(!pCol){
    const{ac,mat,en}=colonizeCost(G.player);
    const outerLock=false; // extra-solaire colonisable par tous (la tech reste pour la colonie gratuite)
    if(!aCol){const ok=!outerLock&&G.player.acLeft>=ac&&(G.player.res.materials||0)>=mat&&(G.player.res.energy||0)>=en;acts.innerHTML+=`<button class="npop-btn" ${ok?'':'disabled'} onclick="doColonize('${nodeId}');closePopup();render()">🏗 Coloniser<br><small>−${ac} AC −${mat}<i class=ri-materials></i> −${en}<i class=ri-energy></i>${outerLock?' · Biosphère requise':''}</small></button>`;}
    else if(!accord){
      const _accAI=aColAI;
      const _atWar=_accAI&&_warBetween(_moiId(),_accAI.civ.id);
      const _tens=_accAI?getTens('player',_accAI.civ.id):0;
      const _accBlocked=_atWar||_tens>=7;
      const accordOk=!_accBlocked&&G.player.acLeft>=1&&(G.player.res.materials||0)>=2;
      const _accTitle=_accBlocked?(_atWar?'Impossible — en guerre':'Tensions trop élevées ('+_tens+'/10)'):'1AC · 2<i class=ri-materials></i> donnés';
      acts.innerHTML+=`<button class="npop-btn" ${accordOk?'':'disabled'} onclick="showAccordInfo('${nodeId}')">🤝 Accord Commercial<br><small>${_accTitle}</small></button>`;
      const tc=G.player.civ.id==='ceinturiens'?1:2;const atkOk=G.player.acLeft>=1&&G.player.forceTokens>=tc;
      acts.innerHTML+=`<button class="npop-btn" style="border-color:#9a1a1a;color:#ff8888" ${atkOk?'':'disabled'} onclick="attackColony('${nodeId}')">💥 Attaquer<br><small>1AC -${tc}⚔ — DÉCLENCHE GUERRE</small></button>`;
    }else{
      // Accord actif : commerce & transit autorisés, PAS de colonisation partagée. On peut rompre l'accord pour attaquer.
      const tc=G.player.civ.id==='ceinturiens'?1:2;const atkOk=G.player.acLeft>=1&&G.player.forceTokens>=tc;
      acts.innerHTML+=`<div style="font-size:.82em;color:#9ad89a;margin:4px 0">🤝 Accord actif — commerce & transit autorisés.</div>`;
      /* ⚠️ CE BOUTON ÉTAIT ÉCRIT DEUX FOIS. Le second, sous un `if(!G.warState)`, appelait exactement
         la même fonction avec un libellé différent : hors guerre, la fenêtre affichait donc DEUX
         boutons « Rompre l'accord & Attaquer » l'un sous l'autre. Un seul suffit, et il dit tout. */
      acts.innerHTML+=`<button class="npop-btn" style="border-color:#9a1a1a;color:#ff8888" ${atkOk?'':'disabled'} onclick="breakAccordAndAttack('${nodeId}')">💥 Rompre l'accord & Attaquer<br><small>1AC -${tc}⚔ — révoque l'accord, DÉCLENCHE LA GUERRE</small></button>`;
    }
  }
  if(pCol&&pCol.level<node.maxLv&&!pCol.noUpgrade){
    const _tLv=pCol.level+1;
    const _uac=1;const _umat=3;const _uen=1;
    const _uok=G.player.acLeft>=_uac&&(G.player.res.materials||0)>=_umat&&(G.player.res.energy||0)>=_uen&&(G.player.res.science||0)>=1;
    const _ubonus=nodeId==='callisto'?'+2<i class=ri-morale></i>':ATTRACTIVE_COLS.includes(nodeId)?'+1<i class=ri-morale></i>':'';
    acts.innerHTML+=`<button class="npop-btn" ${_uok?'':'disabled'} onclick="doUpgrade('${nodeId}');closePopup();render()">⬆ Niveau ${_tLv}<br><small>−${_uac} AC −${_umat}<i class=ri-materials></i> −${_uen}<i class=ri-energy></i> −1<i class=ri-science></i>${_ubonus&&_tLv===2?' '+_ubonus:''}</small></button>`;
  }
  if(pCol||nodeId===G.player.civ.home){const _rc=routeCost(G.player);const ac=_rc.ac,mat=_rc.mat,force=_rc.force||0;for(const adj of node.conn){const already=G.player.routes.find(r=>(r.from===nodeId&&r.to===adj)||(r.from===adj&&r.to===nodeId));if(!already){const ok=G.player.acLeft>=ac&&(G.player.res.materials||0)>=mat&&G.player.forceTokens>=force;acts.innerHTML+=`<button class="npop-btn" ${ok?'':'disabled'} onclick="doEstablishRoute('${nodeId}','${adj}');closePopup();render()">🛤 → ${NODES[adj].emoji} ${NODES[adj].name}<br><small>−${ac} AC −${mat}<i class=ri-materials></i>${force>0?' −'+force+' jeton(s)':''}</small></button>`;}}}
  // Raid contextuel : disponible sur toute colonie ennemie présente sur ce nœud
  if(aCol&&aColAI&&G.phase==='actions'){
    const _rtc=G.player.civ.id==='ceinturiens'?1:2;
    const _renC=0; // v18 : raids sans coût énergie
    const _rok=G.player.acLeft>=1&&G.player.forceTokens>=_rtc;
    acts.innerHTML+=`<button class="npop-btn" style="border-color:#cc7a22;color:#ffbb66" ${_rok?'':'disabled'} onclick="doRaidTarget('${aColAI.civ.id}','${nodeId}');closePopup();render()">💰 Raid<br><small>−1 AC −${_rtc} jeton(s)${_renC?' −'+_renC+'<i class=ri-energy></i>':''} — vole des ressources à ${aColAI.civ.emoji} ${aColAI.civ.name}</small></button>`;
  }
  if(!acts.innerHTML)acts.innerHTML='<div style="color:#5a6a8a;font-size:.85em">Aucune action disponible.</div>';
  const wrap=document.getElementById('map-wrap').getBoundingClientRect();
  const svgEl=document.getElementById('solar-svg');
  const vbA=(svgEl.getAttribute('viewBox')||'0 175 2020 490').split(' ').map(Number);
  const vbX=vbA[0],vbY=vbA[1],vbW=vbA[2],vbH=vbA[3];
  const svgRect=svgEl.getBoundingClientRect();
  const nx=(svgRect.left-wrap.left)+((NODES[nodeId].x-vbX)/vbW)*svgRect.width;
  const ny=(svgRect.top-wrap.top)+((NODES[nodeId].y-vbY)/vbH)*svgRect.height;
  document.getElementById('npop').style.left=Math.min(Math.max(nx+18,4),wrap.width-220)+'px';
  document.getElementById('npop').style.top=Math.max(Math.min(ny-10,wrap.height-290),0)+'px';
  document.getElementById('npop').style.display='block';
}
function closePopup(){document.getElementById('npop').style.display='none';}
/* ============================================================ MODALS ============================================================ */
let _toastTimer=null;
/* ── Journal structuré (rapport lisible de fin de partie) ─────────────────────
   Chaque action (humaine, IA ou automatique) est enregistrée avec : tour, nation,
   coût en AC, coût en ressources, et gain/résultat. Sert à bâtir un rapport clair. */
function _riToText(s){
  if(s===undefined||s===null)return '';
  s=String(s);
  s=s.replace(/<i[^>]*class=["']?ri-energy["']?[^>]*><\/i>/g,' énergie')
     .replace(/<i[^>]*class=["']?ri-materials["']?[^>]*><\/i>/g,' matériaux')
     .replace(/<i[^>]*class=["']?ri-science["']?[^>]*><\/i>/g,' science')
     .replace(/<i[^>]*class=["']?ri-morale["']?[^>]*><\/i>/g,' moral');
  s=s.replace(/<[^>]+>/g,'');                 // retire tout autre HTML
  // retire les émojis ressources / éco (on ne garde que les émojis de guerre : ⚔️ 🛡️ 🏴 🕊️ 💥)
  s=s.replace(/[🪨⚡🔬💰💫🏗️⬆️🛤️🤖📈☠️😡🙂😊🗺️💼🏛️⌛🔧📝❓]/g,'');
  return s.replace(/\s+/g,' ').trim();
}
const _RESNAME={energy:'énergie',materials:'matériaux',science:'science',morale:'moral',force:'jetons Force'};
function _costToText(cost){
  const parts=[];
  for(const r of['energy','materials','science','morale','force']){const a=(cost&&cost[r])||0;if(a>0)parts.push(a+' '+_RESNAME[r]);}
  return parts.join(', ');
}
function _journalAdd(civObj,name,ac,cost,gain,opts){
  opts=opts||{};
  if(!G)return;if(!G._journal)G._journal=[];
  G._journal.push({turn:G.turn||0,nat:(civObj&&civObj.civ&&civObj.civ.name)||String(civObj||'Système'),
    name:name,ac:ac||0,cost:_normCost(cost),gain:_riToText(gain),war:!!opts.war,auto:!!opts.auto});
}
// Résolution automatique attribuée à UNE nation (nat = nom de la nation concernée).
function _journalAuto(nat,name,gain,war){
  if(!G)return;if(!G._journal)G._journal=[];
  G._journal.push({turn:G.turn||0,nat:nat||((G.player&&G.player.civ&&G.player.civ.name)||'?'),name:name,ac:0,cost:{},gain:_riToText(gain),war:!!war,auto:true});
}
function _normCost(cost){
  const out={};if(!cost)return out;
  for(const r of['energy','materials','science','morale','force']){const a=cost[r]||0;if(a>0)out[r]=a;}
  return out;
}
function _isWarAct(name){return /guerre|assaut|capture|pill|raid|repouss|attaque|reprend|combat|paix|cessez/i.test(String(name||''));}
/* ⚠️ `addAction` EST LE CARNET DE BORD DU JOUEUR LOCAL — voir le bandeau de `acteurAction`.
   Quand c'est une AUTRE nation qui agit (une IA passée par `appliquerCoup`), elle ne s'en mêle pas :
   son coup est déjà enregistré par `appliquerCoup` dans `G.aiActions`, avec les libellés que lisent
   le journal, le bilan de fin de tour et les bancs. Enregistrer ici EN PLUS le compterait deux fois.
   Ce qui est neutralisé pour une IA, et pourquoi :
     · `G.turnActions` / `G.player._turnActions` — les actions DU SIÈGE ACTIF ; y verser celles d'une
       IA attribuait ses coups à Marc dans son propre bilan ;
     · la ligne de journal — elle était signée `G.player.civ.name`, donc du nom du lecteur ;
     · `showToast` — un toast pour une action qui n'est pas la sienne ;
     · `_ilMaybePass` — le pire : en solo, chaque action d'IA PASSAIT LA MAIN DU JOUEUR. */
function addAction(emoji,name,acPaid,resPaid,gainDesc){if(!G.turnActions)G.turnActions=[];/* ⚠️ L'INITIALISATION VIENT AVANT LA GARDE, ET CE N'EST PAS COSMÉTIQUE : si le premier coup du tour est celui d'une IA, sortir avant cette ligne laisserait `G.turnActions` à `undefined` pour tout le reste du tour. `test_passer.js` l'a attrapé dans l'heure (la main revenait au même joueur après un skip). */if(typeof _acteurCourant==='function'&&G&&_acteurCourant()!==G.player)return;const _entry={emoji,name,acPaid:acPaid||0,resPaid:resPaid||{},gainDesc:gainDesc||''};G.turnActions.push(_entry);if(G.player){if(!G.player._turnActions)G.player._turnActions=[];G.player._turnActions.push(_entry);}/* journal par nation : indispensable au bilan en multijoueur */if(G){G._scStuckTries=0;try{G._journal=G._journal||[];G._journal.push({turn:G.turn||0,nat:(G.player&&G.player.civ&&G.player.civ.name)||'Toi',name:name,ac:acPaid||0,cost:_normCost(resPaid),gain:_riToText(gainDesc),war:_isWarAct(name),auto:false});}catch(e){}}showToast(emoji,name,acPaid,resPaid,gainDesc);if(G&&G._il){G._ilPassTries=0;setTimeout(_ilMaybePass,60);}}
function showToast(emoji,name,acPaid,resPaid,gainDesc){
  const el=document.getElementById('action-toast');if(!el)return;
  const paid=[];if(acPaid)paid.push(acPaid+' AC');for(const[r,a]of Object.entries(resPaid||{}))if(a>0)paid.push(a+rEmoji(r));
  el.innerHTML=`<div class="toast-title">${emoji} ${name}</div><div class="toast-row">${paid.length?`<span class="toast-paid">−${paid.join(' −')}</span>`:'<span style="color:#5a6a8a">—</span>'}${gainDesc?`<span class="toast-gain">${gainDesc}</span>`:''}</div>`;
  if(_toastTimer)clearTimeout(_toastTimer);el.classList.add('show');_toastTimer=setTimeout(()=>el.classList.remove('show'),2000);
}
function showDiscoveryModal(disc){
  document.getElementById('disc-emoji').textContent=disc.emoji;
  document.getElementById('disc-name').textContent=disc.name;
  document.getElementById('disc-desc').innerHTML=disc.desc;
  document.getElementById('discovery-modal').classList.remove('hidden');
}
function dismissDiscovery(){
  document.getElementById('discovery-modal').classList.add('hidden');
  if(G._decouverteEnAttente){
    const{disc,nodeId}=G._decouverteEnAttente;G._decouverteEnAttente=null;
    const p=G.player;
    if(disc.res)for(const[r,a]of Object.entries(disc.res)){const caps=getResCapFor(p);p.res[r]=Math.min(caps[r]||10,(p.res[r]||0)+a);}
    if(disc.rGain)for(const[r,a]of Object.entries(disc.rGain))p.rpt[r]=(p.rpt[r]||0)+a;
    if(disc.force)p.forceTokens+=disc.force;
    if(disc.vp)gagnerVP(p,disc.vp,'Découverte : '+disc.name);
    addLog('🗺️ Découverte : '+disc.name+' — '+disc.desc,'gold');
    // Colonisation terminée (découverte fermée) → popup de confirmation annulable
    const _nd=NODES[nodeId];const _cg=[];
    if(_nd&&_nd.baseVP)_cg.push({kind:'vp',val:_nd.baseVP});
    scArmConfirm('🏗️ '+((_nd&&_nd.name)||'Colonie'),_cg);
  }
  render();
}
function showWarModal(title,body,result){
  /* ⚠️ UNE NOTICE BLOQUANTE ATTEND UN ACCUSÉ DE RÉCEPTION — DONC QUELQU'UN POUR L'ENVOYER.
     `war_result` est une fenêtre COLLECTIVE : le serveur la diffuse à tous, mais c'est son
     PROPRIÉTAIRE (`G.player` au moment de l'émission) qui la referme et débloque la suite. Après
     `_focusWar`, ce propriétaire peut être une IA : personne ne clique « Continuer », et la table
     entière attend. Le correctif des quatre fenêtres de DÉCISION ne couvrait pas ce cas — une notice
     n'est pas une question, mais elle bloque tout autant.
     Mesuré : `test_actions.js` s'arrêtait sur `waiting/war_result`. Le défaut existait avant, mais il
     ne se produisait presque jamais tant que les IA ne se faisaient pas la guerre entre elles ;
     depuis, chaque combat lointain est une occasion de le rencontrer.
     Une IA « lit » donc immédiatement, par la même suite nommée qu'un joueur qui clique. */
  /* ⚠️ COURT-CIRCUIT RETIRÉ — IL CASSAIT LA REPRISE DE PARTIE.
     Une nation tenue par l'ordinateur ne peut pas répondre à la fenêtre « war_result », et il fallait bien que
     quelqu'un le fasse. J'avais donc appelé la continuation ICI, en direct. Le multijoueur repartait,
     et deux bancs verts depuis le 6 août — `test_serialisation`, `test_reprise` — sont tombés deux
     fois sur trois : une partie sauvegardée puis restaurée ne repartait plus.
     Une partie n'est reprenable que parce que chaque question EXISTE dans `G._flux` avec sa suite
     rangée sous forme de nom. Appeler la continuation en direct saute cette étape : la question
     n'est jamais posée, donc jamais sauvegardée, et toute la chaîne se déroule d'un bloc au lieu de
     rendre la main entre les étapes. C'est désormais le PILOTE qui répond pour les IA
     (`driver.js`, `_reponseIA`), après que la question a été posée normalement. */
  if(_decisionActive()){ // mode serveur : notice non bloquante ; la suite (un NOM dans G) est jouée à la réponse
    _emitNotice('war_result', G.player, {title, body, result:result||null, colonizeOffer:G._postWarColonizeOffer||null}, 'stWarResultFerme');
    return;
  }
  document.getElementById('wm-title').textContent=title;
  let fullBody=body;
  // Offre de colonisation post-victoire si colonie ennemie détruite et joueur à portée
  if(G._postWarColonizeOffer){
    const oid=G._postWarColonizeOffer;const on=NODES[oid];
    const pHasMat=(G.player.res.materials||0)>=2,pHasEn=(G.player.res.energy||0)>=1;
    const canAfford=pHasMat&&pHasEn;
    fullBody+='<div style="margin-top:10px;padding:9px 12px;background:#0a2a0a;border:1px solid #44aa44;border-radius:7px;font-size:.9em">'+
      '<strong style="color:#88ff88">🏗️ Butin de guerre</strong><br>'+
      on.emoji+' <strong>'+on.name+'</strong> est à ta portée. Coloniser maintenant ?<br>'+
      '<span style="color:#667;font-size:.85em">Coût : 2<i class=ri-materials></i> +1<i class=ri-energy></i>'+(canAfford?'':' — <span style="color:#ff8888">ressources insuffisantes</span>')+'</span><br>'+
      '<button onclick="doPostWarColonize(\''+oid+'\')" style="margin-top:6px;padding:5px 14px;background:#0a2a0a;border:1px solid #44aa44;color:#88ff88;border-radius:5px;cursor:pointer;font-weight:700"'+(canAfford?'':' disabled style="opacity:.5;cursor:not-allowed"')+'>🏗️ Coloniser</button> '+
      '<button onclick="G._postWarColonizeOffer=null;document.getElementById(\'wm-body\').innerHTML=document.getElementById(\'wm-body\').innerHTML.split(\'<div style\\x3d\\x22margin-top:10px\')[0]" style="margin-top:6px;padding:5px 14px;background:#1a1a2a;border:1px solid #445;color:#778;border-radius:5px;cursor:pointer">Ignorer</button></div>';
  }
  document.getElementById('wm-body').innerHTML=fullBody;
  const rEl=document.getElementById('wm-result');
  if(result){rEl.innerHTML=result.txt;rEl.className='war-result '+result.cls;rEl.classList.remove('hidden');}else rEl.classList.add('hidden');
  document.getElementById('war-modal').classList.remove('hidden');
}
function dismissWarModal(){document.getElementById('war-modal').classList.add('hidden');_warSuiteJouer();}
/* ============================================================ WAR COMBAT MODAL ============================================================ */
/* ============================================================ PEACE OFFER ============================================================ */
/* La suite d'une offre de paix : un NOM rangé dans `G._flux.donnees` (voir `_warSuite`). */
function _paixSuite(nom){ fluxDonnees().suitePaix=(typeof nom==='string'&&nom)?nom:null; }
function _paixSuiteJouer(res){ const d=fluxDonnees(), nom=d.suitePaix; d.suitePaix=null; if(nom) fluxAppeler(nom,res); }
/* Une nation tenue par l'ordinateur veut-elle la paix ? Mêmes critères que ceux dont `submitPeaceOffer`
   se sert pour juger l'adversaire : plus de jetons, plus de quoi les payer, ou moral à terre. */
function iaVeutLaPaix(nat,ennemi){
  if(!nat)return true;
  const force=nat.forceTokens||0;
  const payable=Math.min(nat.res.materials||0,nat.res.energy||0);
  if(force<2||payable<1)return true;                 // incapable de se battre : la paix est la seule issue
  if((nat.res.morale||0)<=1)return true;             // le peuple n'en veut plus
  if(ennemi&&calcVP(ennemi).total>calcVP(nat).total+8)return true;  // trop loin derrière pour espérer
  return false;
}
function showPeaceOfferModal(isJustDeclared,cb){
  _paixSuite(cb);
  G._peaceOffer={materials:0,energy:0,science:0};
  const p=G.player;const ai=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const declBy=G._warDeclaredBy||'other';
  /* ⚠️ CETTE FENÊTRE ÉTAIT POSÉE À QUELQU'UN QUI NE PEUT PAS RÉPONDRE.
     `guerreEtape` appelle `_focusWar(war)` pour traiter chaque guerre du point de vue d'un de ses
     belligérants — c'est le mécanisme qui permet à une guerre entre deux AUTRES nations d'exister.
     Mais la question partait ensuite vers `G.player` sans vérifier qui c'était devenu : si c'est une
     IA, aucun siège humain ne reçoit rien, et la partie entière attend une réponse qui ne viendra
     jamais. Tant que les IA ne se faisaient pas la guerre entre elles, le cas ne se présentait pas ;
     dès que les tensions ont été corrigées, `test_ws.js` s'est figé sur 46 décisions.
     Une IA décide donc tout de suite — mais elle emprunte EXACTEMENT le même chemin qu'un joueur
     (`submitPeaceOffer` / `_paixSuiteJouer`), sinon on se retrouve avec deux résolutions de la paix
     à maintenir en parallèle, et c'est ainsi que naissent les divergences. */
  /* ⚠️ COURT-CIRCUIT RETIRÉ — IL CASSAIT LA REPRISE DE PARTIE.
     Une nation tenue par l'ordinateur ne peut pas répondre à la fenêtre « peace_offer », et il fallait bien que
     quelqu'un le fasse. J'avais donc appelé la continuation ICI, en direct. Le multijoueur repartait,
     et deux bancs verts depuis le 6 août — `test_serialisation`, `test_reprise` — sont tombés deux
     fois sur trois : une partie sauvegardée puis restaurée ne repartait plus.
     Une partie n'est reprenable que parce que chaque question EXISTE dans `G._flux` avec sa suite
     rangée sous forme de nom. Appeler la continuation en direct saute cette étape : la question
     n'est jamais posée, donc jamais sauvegardée, et toute la chaîne se déroule d'un bloc au lieu de
     rendre la main entre les étapes. C'est désormais le PILOTE qui répond pour les IA
     (`driver.js`, `_reponseIA`), après que la question a été posée normalement. */
  if(_decisionActive()){ // mode serveur : router le choix paix/guerre vers l'humain en guerre
    _emitDecision('peace_offer', p,
      {attacker:(ai?ai.civ.id:null), attackerName:(ai?ai.civ.name:'IA'), isJustDeclared:!!isJustDeclared, declaredBy:declBy,
       vpYou:calcVP(p).total, vpEnemy:calcVP(ai||G.ais[0]).total, stocks:{materials:p.res.materials||0,energy:p.res.energy||0,science:p.res.science||0},
       /* COMBIEN DE JETONS IL POURRAIT RÉELLEMENT ENGAGER S'IL REFUSE. Deux amis de Marc, 17/08 :
          l'un refuse la paix, choisit d'attaquer, et découvre seulement à la fenêtre suivante qu'il
          n'a pas de quoi engager un seul jeton. Le chiffre existe déjà (`maxAffordableTokens` tient
          compte de l'IA de Navigation, qui divise le coût par deux) : il suffisait de le DIRE avant
          la décision, pas après. */
       maxEngage:Math.max(0,Math.min(p.forceTokens||0,(typeof maxAffordableTokens==='function')?maxAffordableTokens(p):(p.forceTokens||0)))},
      null, 'adOffreDePaix');
    return;
  }
  document.getElementById('pm-combatants').innerHTML=
    `<span style="color:${p.civ.color};font-weight:700">${p.civ.emoji} ${p.civ.name}</span>`+
    `<span style="color:#556;font-size:.9em"> ⚔️ contre ⚔️ </span>`+
    `<span style="color:${ai?ai.civ.color:'#888'};font-weight:700">${ai?ai.civ.emoji:''} ${ai?ai.civ.name:'IA'}</span>`;
  document.getElementById('pm-declaredby').textContent=
    declBy==='player'?'Guerre déclarée par toi — l\'IA répond.':'Guerre déclarée par '+(ai?ai.civ.name:'l\'IA')+'.';
  const pVP=calcVP(p).total;const aVP=calcVP(ai||G.ais[0]).total;
  document.getElementById('pm-context').innerHTML=
    (isJustDeclared?'<strong>'+G._warDeclareReason+'</strong><br><br>':'')+
    'VP actuels — Toi : <strong>'+pVP+'</strong> | IA : <strong>'+aVP+'</strong><br>'+
    'Tu peux offrir des ressources pour tenter d\'éviter (ou stopper) la guerre.<br>'+
    '<span style="color:#667;font-size:.9em">L\'IA accepte selon sa situation et ton offre.</span>';
  _updatePeaceDisplay();
  document.getElementById('peace-modal').style.display='flex';
  document.getElementById('peace-modal').classList.remove('hidden');
}
function _updatePeaceDisplay(){
  const o=G._peaceOffer||{};const p=G.player;
  document.getElementById('pm-mat').textContent=o.materials||0;
  document.getElementById('pm-energy').textContent=o.energy||0;
  document.getElementById('pm-science').textContent=o.science||0;
  const total=(o.materials||0)+(o.energy||0)+(o.science||0);
  const maxMat=p.res.materials||0;const maxEn=p.res.energy||0;const maxSci=p.res.science||0;
  document.getElementById('pm-total').innerHTML=
    `Offre totale : <strong style="color:${total>=4?'#66ffaa':total>=2?'#ffcc66':'#ff8888'}">${total} ressource(s)</strong>`+
    ` | Tes stocks : <i class=ri-materials></i>${maxMat} <i class=ri-energy></i>${maxEn} <i class=ri-science></i>${maxSci}`;
}
function adjustPeaceOffer(res,delta){
  if(!G._peaceOffer)G._peaceOffer={};
  const p=G.player;
  const maxVals={materials:p.res.materials||0,energy:p.res.energy||0,science:p.res.science||0};
  G._peaceOffer[res]=Math.max(0,Math.min(maxVals[res],(G._peaceOffer[res]||0)+delta));
  _updatePeaceDisplay();
}
/* Réponse d'un joueur HUMAIN à une proposition de paix. Les deux nations et l'offre sont rangées
   dans `G._flux.donnees` : une proposition peut rester en attente longtemps, et doit survivre à une
   sauvegarde comme à un redémarrage du serveur. */
function stPaixReponse(ans){
  const d=fluxDonnees();
  const prop=allPlayers().find(n=>n.civ.id===d.paixProposant);
  const dest=allPlayers().find(n=>n.civ.id===d.paixDestinataire);
  const o=d.paixOffre||{materials:0,energy:0,science:0};
  d.paixProposant=null; d.paixDestinataire=null; d.paixOffre=null;
  const oui=!!(ans&&(ans.value==='yes'||ans.targetId==='yes'||ans.id==='yes'||ans.accept===true||ans.choice==='yes'));
  if(!prop||!dest){ _paixSuiteJouer('WAR'); return; }
  if(oui) _paixAppliquer(prop,dest,o);
  else{
    addLog('💢 '+dest.civ.emoji+' '+dest.civ.name+' REFUSE la paix proposée par '+prop.civ.emoji+' '+prop.civ.name+' — le conflit continue !','red');
    /* ⚠️ LA FENÊTRE DOIT JOUER LA SUITE, SINON LA PARTIE S'ARRÊTE ICI.
       J'avais d'abord émis une simple `notice` de refus, avec `stRien` pour continuation, avant de
       ranger la suite par `_warSuite`. Personne ne jouait donc jamais cette suite : la partie se
       figeait sur le refus de paix (mesuré : 59 coups puis plus rien). `showWarModal` émet la MÊME
       fenêtre mais avec `stWarResultFerme`, qui joue la suite rangée — c'est le mécanisme prévu. */
    _warSuite('stPaixRefuseeContinuer');
    showWarModal('💢 Paix refusée',
      dest.civ.emoji+' '+dest.civ.name+' refuse ta proposition de paix.<br><br>Le conflit continue — choisis ton assaut à l\'écran suivant.',
      null);
  }
}
/* Les EFFETS de la paix, pour un couple explicite — aucun recours à « le joueur » : la réponse peut
   arriver bien après, quand la perspective a changé de nation. */
function _paixAppliquer(prop,dest,o){
  o=o||{};
  for(const r of ['materials','energy','science']){
    const q=Math.min(prop.res[r]||0,o[r]||0);
    prop.res[r]=Math.max(0,(prop.res[r]||0)-q);
    dest.res[r]=(dest.res[r]||0)+q;
  }
  const i=_warIndexBetween(prop.civ.id,dest.civ.id); if(i>=0)G.wars.splice(i,1);
  halveTensions(prop.civ.id,dest.civ.id);
  syncWarState();
  const offerStr=[o.materials?o.materials+'<i class=ri-materials></i>':'',o.energy?o.energy+'<i class=ri-energy></i>':'',o.science?o.science+'<i class=ri-science></i>':''].filter(Boolean).join(' ');
  addLog('🕊️ Paix conclue entre '+prop.civ.emoji+' '+prop.civ.name+' et '+dest.civ.emoji+' '+dest.civ.name+(offerStr?' contre '+offerStr:'')+' !','gold');
  prop.res.morale=(prop.res.morale||0)+1;
  dest.res.morale=(dest.res.morale||0)+1;   // les deux peuples soufflent, pas seulement celui qui a proposé
  _warSuite('stRien');
  showWarModal('🕊️ Paix acceptée',
    dest.civ.emoji+' '+dest.civ.name+' a ACCEPTÉ la paix'+(offerStr?' contre '+offerStr:'')+'.<br><br>La guerre entre vous prend fin.',
    {txt:'Paix conclue.',cls:'win'});
  _paixSuiteJouer('PEACE');
}
function submitPeaceOffer(){
  const o=G._peaceOffer||{};
  const total=(o.materials||0)+(o.energy||0)+(o.science||0);
  /* ⚠️ MÊME BUG que le draft Stratégie, trouvé le même jour : `calcVP` rend un OBJET.
     `if(aVP<pVP)` comparait deux objets → TOUJOURS faux. La règle « l'adversaire est en retard,
     donc plus enclin à la paix » ne s'appliquait donc JAMAIS. */
  const pVP=calcVP(G.player).total;
  const peaceAi=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const aVP=calcVP(peaceAi||G.ais[0]).total;
  // Probabilité d'acceptation IA
  let prob=0.30;
  if(aVP<pVP)prob+=0.25;      // IA perd → plus encline à la paix
  if(total>=3)prob+=0.20;
  if(total>=6)prob+=0.20;
  if(G._warDeclaredBy==='player')prob-=0.10; // c'est l'IA qui a été attaquée → plus vindicative
  if(peaceAi&&peaceAi.civ.id==='ceinturiens')prob-=0.15;     // les ceinturiens n'aiment pas la paix
  // Self-intérêt : sans les moyens de vraiment se battre (peu de jetons Force / ressources), l'IA accepte la paix.
  const _aiForce=peaceAi?(peaceAi.forceTokens||0):0;
  const _aiAfford=peaceAi?Math.min(peaceAi.res.materials||0,peaceAi.res.energy||0):0;
  if(_aiForce<2||_aiAfford<1)prob+=0.55;
  if(peaceAi&&(peaceAi.res.morale||0)<=1)prob+=0.25; // moral à terre → veut la paix
  document.getElementById('peace-modal').style.display='none';
  document.getElementById('peace-modal').classList.add('hidden');
  /* ⚠️ UN HUMAIN N'EST PAS UN TIRAGE AU SORT.
     Cette fonction décidait de l'acceptation avec `Math.random()` et une heuristique d'IA — MÊME
     quand l'adversaire était un joueur humain connecté. Autrement dit : tu proposais la paix à ton
     ami, et un dé répondait à sa place. Il ne voyait jamais la proposition ; côté banc à quatre,
     l'attaquant recevait douze offres de paix et le défenseur ZÉRO.
     C'est le même défaut que la défense jouée par une formule, au même endroit du jeu.
     On lui pose donc la question, et on n'applique les effets qu'après SA réponse. L'heuristique
     ci-dessus reste, mais uniquement pour les nations tenues par l'ordinateur. */
  if(peaceAi && peaceAi._isAI===false && _decisionActive()){
    const d=fluxDonnees();
    d.paixProposant=G.player.civ.id; d.paixDestinataire=peaceAi.civ.id;
    d.paixOffre={materials:(o.materials||0),energy:(o.energy||0),science:(o.science||0)};
    const _offre=[o.materials?o.materials+'🪨':'',o.energy?o.energy+'⚡':'',o.science?o.science+'🔬':''].filter(Boolean).join(' ');
    addLog('🕊️ '+G.player.civ.emoji+' '+G.player.civ.name+' propose la paix à '+peaceAi.civ.emoji+' '+peaceAi.civ.name
      +(_offre?' contre '+_offre:'')+' — en attente de sa réponse…','dim');
    _emitDecision('peace_answer', peaceAi,
      {title:'🕊️ Proposition de paix',
       from:G.player.civ.id, fromName:G.player.civ.emoji+' '+G.player.civ.name,
       offer:{materials:(o.materials||0),energy:(o.energy||0),science:(o.science||0)},
       texte:G.player.civ.emoji+' '+G.player.civ.name+' te propose la PAIX'
             +(_offre?', et t\'offre '+_offre:', sans compensation')+'. La guerre entre vous prendrait fin.',
       options:[{id:'yes',name:'🕊️ Accepter la paix'},{id:'no',name:'⚔️ Refuser — la guerre continue'}]},
      'stPaixReponse', null);
    return;
  }
  const accepted=Math.random()<Math.min(0.95,Math.max(0.05,prob));
  if(accepted){
    // Transfert de ressources
    G.player.res.materials=Math.max(0,(G.player.res.materials||0)-(o.materials||0));
    G.player.res.energy=Math.max(0,(G.player.res.energy||0)-(o.energy||0));
    G.player.res.science=Math.max(0,(G.player.res.science||0)-(o.science||0));
    if(peaceAi){peaceAi.res.materials=(peaceAi.res.materials||0)+(o.materials||0);peaceAi.res.energy=(peaceAi.res.energy||0)+(o.energy||0);peaceAi.res.science=(peaceAi.res.science||0)+(o.science||0);}
    const peaceWarWith=G.warWith;
    const _pwIdx=_warIndexBetween(_moiId(),peaceWarWith);if(_pwIdx>=0)G.wars.splice(_pwIdx,1);
    if(peaceWarWith)halveTensions('player',peaceWarWith);
    G.playerTension=G.ais.reduce((mx,ai)=>Math.max(mx,getTens('player',ai.civ.id)),0);
    G.aiTension=G.ais[0]?getTens(G.ais[0].civ.id,'player'):0;
    syncWarState();
    const offerStr=[o.materials?o.materials+'<i class=ri-materials></i>':'',o.energy?o.energy+'<i class=ri-energy></i>':'',o.science?o.science+'<i class=ri-science></i>':''].filter(Boolean).join(' ');
    addLog('🕊️ Paix acceptée par '+(peaceAi?peaceAi.civ.name:'IA')+(offerStr?' contre '+offerStr:'')+'!','gold');
    G.player.res.morale=(G.player.res.morale||0)+1;
    _paixSuiteJouer('PEACE');
  }else{
    addLog('💢 '+(peaceAi?peaceAi.civ.name:'IA')+' refuse la paix — le conflit continue !','red');
    // D'ABORD montrer la réponse adverse ; ENSUITE (au clic) le choix d'assaut.
    showWarModal('💢 Paix refusée',(peaceAi?peaceAi.civ.emoji+' '+peaceAi.civ.name:'L\'ennemi')+' refuse ta proposition de paix.<br><br>Le conflit continue — choisis ton assaut à l\'écran suivant.',null);
    _warSuite('stPaixRefuseeContinuer');
  }
}
function rejectPeace(){
  document.getElementById('peace-modal').style.display='none';
  document.getElementById('peace-modal').classList.add('hidden');
  // Refuser la paix = POURSUIVRE la guerre → on propose tout de suite un assaut ce tour (sinon la guerre ne « se réalise » pas).
  const ai=G.warWith?G.ais.find(a=>a.civ.id===G.warWith):null;
  const cols=ai?ai.colonies.filter(c=>c.nodeId!==ai.civ.home):[]; // jamais la planète mère
  // La suite de la paix est un NOM : on la met de côté au lieu de la « garder sous le coude » dans
  // une fermeture — le bouton « Annuler » doit pouvoir y revenir même après un rechargement.
  const suite=fluxDonnees().suitePaix; fluxDonnees().suitePaix=null;
  if(!ai||!cols.length){addLog('⚔️ Tu poursuis la guerre (aucune colonie ennemie à assaillir ce tour).','red');if(suite)fluxAppeler(suite,'WAR');return;}
  G._warContinueSuite=suite;
  _showAssaultPicker(ai,cols);
}
function _showAssaultPicker(ai,cols){
  const p=G.player; const tc=p.civ.id==='ceinturiens'?1:2; const avail=p.forceTokens||0; const canAssault=avail>=tc;
  document.getElementById('wcm-sub').textContent='⚔️ Guerre vs '+ai.civ.emoji+' '+ai.civ.name+' — choisis une colonie à assaillir ce tour :';
  document.getElementById('wcm-info').innerHTML=
    '<div style="margin-bottom:8px;font-size:.85em;color:'+(canAssault?'#9ad89a':'#ff9a9a')+'">⚔️ Jetons Force disponibles : <strong>'+avail+'</strong> · un assaut coûte '+tc+' jeton(s)'+(canAssault?'':' — insuffisant : tu ne peux pas assaillir de colonie ce tour')+'</div>'
    +cols.map(c=>{const n=NODES[c.nodeId];return '<button '+(canAssault?'onclick="_warContinueAssault(\''+c.nodeId+'\')"':'disabled')+' style="display:block;width:100%;text-align:left;margin-bottom:5px;padding:7px 10px;background:#2a0a0a;border:1px solid #ef5350;color:#ffccaa;border-radius:6px;cursor:'+(canAssault?'pointer':'not-allowed')+';font-size:.85em;opacity:'+(canAssault?'1':'.4')+'">🎯 '+(n?n.emoji+' '+n.name:c.nodeId)+' (Nv.'+c.level+')</button>';}).join('')
    +'<button onclick="_warContinueNoAttack()" style="display:block;width:100%;margin-top:8px;padding:6px;background:#1a1a3a;border:1px solid #3a3a6a;color:#9898b8;border-radius:6px;cursor:pointer;font-size:.82em">🛡️ Poursuivre sans assaut ce tour</button>'
    +'<button onclick="_warBackToPeace()" style="display:block;width:100%;margin-top:6px;padding:6px;background:#0a1a2a;border:1px solid #4488cc;color:#88bbee;border-radius:6px;cursor:pointer;font-size:.82em">🕊️ Revenir au choix paix / guerre</button>';
  document.getElementById('wcm-slider').parentElement.style.display='none';
  document.getElementById('wcm-power').style.display='none';
  document.getElementById('war-combat-modal').querySelector('.atk-btns').style.display='none';
  document.getElementById('war-combat-modal').classList.remove('hidden');
}
function _warContinueNoAttack(){
  document.getElementById('war-combat-modal').classList.add('hidden');
  const suite=G._warContinueSuite;G._warContinueSuite=null;
  addLog('🛡️ Tu poursuis la guerre sans assaut ce tour.','dim');
  if(suite)fluxAppeler(suite,'WAR');
}
function _warContinueAssault(nodeId){
  const ai=G.warWith?G.ais.find(a=>a.civ.id===G.warWith):null;
  const suite=G._warContinueSuite; // GARDÉ : « Annuler » doit pouvoir revenir à la modale paix/guerre
  G._assaultThenSuite=suite; // après la résolution de l'assaut → poursuivre le flux de guerre (un NOM)
  G._warDecisionAssault=true; // assaut issu du choix paix/guerre (aucun AC dépensé ici)
  playerAssaultColony(nodeId,ai);
}
function _warBackToPeace(){
  document.getElementById('war-combat-modal').classList.add('hidden');
  if(G._warContinueSuite){showPeaceOfferModal(false,G._warContinueSuite);}else{render();}
}
function _warBackToChoice(){
  // Bouton "Annuler" : revient à l'écran de choix de guerre, sans rien résoudre ni dépenser.
  // On GARDE la posture/cible cachée de l'IA (pas de re-tirage du dé en annulant en boucle).
  if(G)G._warKeepStance=true;
  if(typeof showWarCombatModal==='function'&&G&&G._warChoiceCb)showWarCombatModal(G._warChoiceCb);
}
function showWarCombatModal(cb){
  // La suite du choix de combat : un NOM (voir `_warSuite`). `G._warChoiceCb` la mémorise aussi pour
  // le bouton « Annuler », qui doit pouvoir revenir au choix sans rien dépenser.
  fluxDonnees().suiteCombat=(typeof cb==='string'&&cb)?cb:null;
  G._warChoiceCb=fluxDonnees().suiteCombat;
  /* Même correctif que la fenêtre de paix : après `_focusWar`, `G.player` peut être une IA. Elle
     décide seule, mais par `adChoixDeCombat` — le chemin exact d'un joueur, avec les mêmes bornes
     d'engagement et le même traitement du supercroiseur. */
  /* ⚠️ COURT-CIRCUIT RETIRÉ — IL CASSAIT LA REPRISE DE PARTIE.
     Une nation tenue par l'ordinateur ne peut pas répondre à la fenêtre « war_combat », et il fallait bien que
     quelqu'un le fasse. J'avais donc appelé la continuation ICI, en direct. Le multijoueur repartait,
     et deux bancs verts depuis le 6 août — `test_serialisation`, `test_reprise` — sont tombés deux
     fois sur trois : une partie sauvegardée puis restaurée ne repartait plus.
     Une partie n'est reprenable que parce que chaque question EXISTE dans `G._flux` avec sa suite
     rangée sous forme de nom. Appeler la continuation en direct saute cette étape : la question
     n'est jamais posée, donc jamais sauvegardée, et toute la chaîne se déroule d'un bloc au lieu de
     rendre la main entre les étapes. C'est désormais le PILOTE qui répond pour les IA
     (`driver.js`, `_reponseIA`), après que la question a été posée normalement. */
  if(_decisionActive()){ // mode serveur : router le choix de combat vers le joueur (avec la CIBLE)
    const _p=G.player; const _ai=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
    const _aiTok=_ai?_ai.forceTokens:0;
    // Posture IA (attaquer/tenir) + cible menacée, comme en solo, pour que la défense fonctionne.
    if(!G._warKeepStance){ G._aiWarStance=(_aiTok>=2&&Math.random()>0.35)?'attack':'hold';
      const _tc=_p.colonies.filter(c=>c.nodeId!==_p.civ.home&&c.connected), _tr=_p.routes.filter(r=>(r.tokens||0)>0);
      const _all=[..._tc.map(c=>({type:'colony',name:NODES[c.nodeId]?.name||c.nodeId,obj:c})),..._tr.map(r=>({type:'route',name:(NODES[r.from]?.name||r.from)+'→'+(NODES[r.to]?.name||r.to),obj:r}))];
      G._aiWarTarget=_all.length?_all[Math.floor(Math.random()*_all.length)]:null;
    }
    G._warKeepStance=false;
    // Colonies ennemies attaquables (à portée) + la colonie « focus » (celle pour laquelle on se bat).
    const _reach=_ai?_getReachableWarTargets(_p,_ai):[];
    const _warObj=_warBetween(_moiId(),G.warWith); const _focus=_warObj&&_warObj.focusColony;
    const _cols=_reach.map(c=>({node:c.nodeId, name:NODES[c.nodeId]?.name||c.nodeId, emoji:NODES[c.nodeId]?.emoji||'', level:c.level,
      isHome:(_ai&&c.nodeId===_ai.civ.home), isFocus:(c.nodeId===_focus),
      dist:Math.min.apply(null,_p.colonies.map(pc=>getNodeDistance(pc.nodeId,c.nodeId)))}));
    const _routes=_ai?_ai.routes.map((r,i)=>({i, from:r.from, to:r.to, name:(NODES[r.from]?.name||r.from)+'→'+(NODES[r.to]?.name||r.to), protected:(r.tokens||0)>=1, cost:(r.tokens||0)>=1?2:1})):[];
    /* PLAFOND D'ENGAGEMENT ANNONCÉ AU CLIENT. Le moteur n'accepte que `min(jetons, payables)`
       (1🪨+1⚡ par jeton) : si la fenêtre proposait davantage, l'engagement était rogné en silence
       et le joueur croyait avoir engagé plus qu'il n'a réellement engagé. On envoie donc le VRAI
       plafond, et le client borne son curseur dessus — ce qui est proposé est ce qui est appliqué. */
    const _maxEng=Math.max(0,Math.min(_p.forceTokens||0,(typeof maxAffordableTokens==='function')?maxAffordableTokens(_p):(_p.forceTokens||0)));
    /* Plafond RÉDUIT si le joueur déploie son croiseur : le client reçoit les deux et borne son
       curseur sur celui qui correspond à la case cochée. Sinon il proposerait un engagement que le
       serveur rognerait ensuite en silence. */
    const _maxEngCru=Math.max(0,Math.min(_p.forceTokens||0,(typeof maxAffordableTokens==='function')
      ?maxAffordableTokens(_p, (typeof reserveCroiseur==='function')?reserveCroiseur(_p,true):null):(_p.forceTokens||0)));
    /* SUPERCROISEUR : en ligne il n'était JAMAIS pris en compte. `G._cruiserDeployed` est un drapeau
       posé par la modale SOLO ; la réponse réseau ne le transportait pas, donc le serveur résolvait
       toujours le combat sans lui (bug de Marc : 10 jetons + supercroiseur contre une capitale à 10
       → « Égalité » au lieu d'une victoire). On l'expose et on le reçoit. */
    const _cruHas=(typeof cruiserAvailable==='function')&&cruiserAvailable(_p);
    const _cruOk=_cruHas&&(typeof cruiserAfford==='function')&&cruiserAfford(_p);
    _emitDecision('war_combat', _p,
      {enemy:(_ai?_ai.civ.id:null), enemyName:(_ai?_ai.civ.name:'IA'), warTurnsLeft:G.warTurnsLeft, myForce:_p.forceTokens||0,
       maxEngage:_maxEng, maxEngageAvecCroiseur:_maxEngCru,
       cruiser:{has:!!_cruHas, afford:!!_cruOk, power:(_p.cruiserPower||5), cost:(typeof cruiserCost==='function')?cruiserCost(_p):null},
       /* ═══════ ON PEUT TOUJOURS SE RETIRER — SINON LA PARTIE SE FIGE ═══════
          ⚠️ CE DRAPEAU VALAIT `false` POUR CELUI QUI AVAIT DÉCLARÉ LA GUERRE, et c'est ce qui a
          bloqué la partie de deux amis de Marc le 17/08. L'intention se défendait : on ne déclare
          pas une guerre pour ensuite croiser les bras. Mais trois conditions se rencontrent :
            · agresseur          → pas de bouton « Tenir position » ;
            · plus de ressources → tous les boutons de colonie sont désactivés (`maxEngage < 1`) ;
            · l'ennemi ne menace rien ce tour-ci → pas de bouton « Défendre ».
          La fenêtre n'avait alors plus UN SEUL élément cliquable, et la table entière attendait une
          réponse que le joueur ne pouvait pas donner. Une règle de jeu ne doit jamais pouvoir
          produire un écran sans issue : la sanction du renoncement appartient au jeu (la guerre
          continue, le tour de guerre est consommé), pas à l'interface.
          Le client reçoit `estAgresseur` pour appeler la chose par son nom : « tenir position »
          quand on subit, « renoncer à l'assaut » quand on avait attaqué. */
       canHold:true, estAgresseur:((G._warDeclaredBy||'other')==='player'),
       cols:_cols, routes:_routes,
       aiThreat:(G._aiWarStance==='attack'&&G._aiWarTarget)?{type:G._aiWarTarget.type, name:G._aiWarTarget.name}:null},
      null, 'adChoixDeCombat');
    return;
  }
  const p=G.player;
  const warCombAi=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const aiTok=warCombAi?warCombAi.forceTokens:0;
  const _pfWar=perceivedForce(p,warCombAi);const enemyForceTxt=_pfWar.exact?(_pfWar.val+'⚔️ <span style="color:#5a7a66">(renseignement — exact)</span>'):('~'+_pfWar.val+'⚔️ <span style="color:#5a6a8a">(±3, sans renseignement)</span>');
  const aiRoutes=warCombAi?warCombAi.routes.slice():[]; // TOUTES les routes ennemies (protégées ET non protégées)
  document.getElementById('wcm-turn').textContent=G.turn;
  const warTourNum=G.warTurnsLeft===2?'1':'2';
  document.getElementById('wcm-sub').textContent='Tour de guerre '+(warTourNum==='1'?'1':'2')+'/2 — Choisissez votre cible :';
  // Pré-décision IA : attaquer ou tenir ? (caché du joueur)
  const _keepStance=!!G._warKeepStance;G._warKeepStance=false; // "Annuler" → garder la posture (pas de re-tirage)
  if(!_keepStance)G._aiWarStance=(aiTok>=2&&Math.random()>0.35)?'attack':'hold';
  // Choix du type d'attaque
  const routeOpts=aiRoutes.length>0
    ?aiRoutes.map((r,i)=>{const prot=(r.tokens||0)>=1;const need=prot?2:1;const can=(p.forceTokens||0)>=need;
      return `<button onclick="warAttackRoute(${i})"${can?'':' disabled'} style="display:block;width:100%;text-align:left;margin-bottom:4px;padding:5px 8px;background:#1a1a3a;border:1px solid ${prot?'#a35a5a':'#3a3a6a'};color:#c8d8f8;border-radius:5px;cursor:${can?'pointer':'not-allowed'};opacity:${can?1:.5};font-size:.82em">${prot?'🛡️':'🔓'} ${NODES[r.from]?.name||r.from} → ${NODES[r.to]?.name||r.to} — <b>${need} jeton${need>1?'s':''}</b>${prot?' (protégée)':' (non protégée)'}</button>`;}).join('')
    :'<div style="color:#5a6a8a;font-size:.82em">Aucune route ennemie.</div>';
  /* MÊME RÈGLE QU'EN LIGNE : la sortie existe toujours (voir le bandeau de `canHold` plus haut).
     Seul le mot change — on ne « tient pas position » quand c'est soi qui a déclaré la guerre. */
  const _estAgresseur=(G._warDeclaredBy||'other')==='player';
  const holdBtn=_estAgresseur
    ?'<div style="margin-top:10px;padding-top:10px;border-top:1px solid #2a3a5a"><strong style="color:#88ccff">🚪 Renoncer à l\'assaut ce tour</strong><br><span style="color:#7880a0;font-size:.82em">Tu as déclaré cette guerre, mais rien ne t\'oblige à frapper maintenant : conserve tes jetons. <b>La guerre continue</b> et le tour de guerre est consommé.</span><br><button onclick="warHoldPosition()" style="margin-top:6px;padding:6px 14px;background:#0a1a2a;border:1px solid #4488cc;color:#88bbee;border-radius:6px;cursor:pointer;font-weight:700">🚪 Renoncer à l\'assaut</button></div>'
    :'<div style="margin-top:10px;padding-top:10px;border-top:1px solid #2a3a5a"><strong style="color:#88ccff">🕊️ Tenir position</strong><br><span style="color:#7880a0;font-size:.82em">Pas ton conflit — conserve tes jetons. Si l\'ennemi attaque, tu choisis ta défense. Si les deux tiennent : aucun combat, aucune perte.</span><br><button onclick="warHoldPosition()" style="margin-top:6px;padding:6px 14px;background:#0a1a2a;border:1px solid #4488cc;color:#88bbee;border-radius:6px;cursor:pointer;font-weight:700">🕊️ Tenir position</button></div>';
  // Calculer une cible d'attaque IA plausible (colonie connectée ou route protégée)
  const aiTargetCols=G.player.colonies.filter(c=>c.nodeId!==G.player.civ.home&&c.connected);
  const aiTargetRoutes=G.player.routes.filter(r=>(r.tokens||0)>0);
  const allTargets=[...aiTargetCols.map(c=>({type:'colony',name:NODES[c.nodeId]?.name||c.nodeId,obj:c})),...aiTargetRoutes.map(r=>({type:'route',name:(NODES[r.from]?.name||r.from)+'→'+(NODES[r.to]?.name||r.to),obj:r}))];
  let rndTarget;
  if(_keepStance){rndTarget=G._aiWarTarget;}
  else{rndTarget=allTargets.length>0?allTargets[Math.floor(Math.random()*allTargets.length)]:null;G._aiWarTarget=rndTarget;}
  const defendBtn=rndTarget
    ?'<div style="margin-top:10px;padding-top:10px;border-top:1px solid #2a3a5a"><strong style="color:#ff8844">🛡️ Répondre à l\'attaque</strong><br><span style="color:#cc8866;font-size:.82em">L\'IA menace : <strong style="color:#ffaa77">'+(rndTarget.type==='colony'?'🏙️ Colonie '+rndTarget.name:'🛤️ Route '+rndTarget.name)+'</strong>. Choisis combien de jetons tu engages en défense.</span><br><button onclick="warDefendTarget()" style="margin-top:6px;padding:6px 14px;background:#2a1200;border:1px solid #cc6622;color:#ffaa66;border-radius:6px;cursor:pointer;font-weight:700">🛡️ Défendre (choisir jetons)</button></div>'
    :'';
  // Assaut direct sur la colonie pour laquelle on fait la guerre (memo #11)
  const _war=_warBetween(_moiId(),G.warWith);
  const _focus=_war&&_war.focusColony;
  const _enemyAI=G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0];
  const _focusOwned=_focus&&_enemyAI&&_enemyAI.colonies.some(c=>c.nodeId===_focus);
  const focusBtn=_focusOwned
    ?'<div style="margin-bottom:10px;padding:9px;background:#2a0a0a;border:1px solid #ff5050;border-radius:8px"><strong style="color:#ff9966">🎯 Assaut sur '+(NODES[_focus]?.emoji||'')+' '+(NODES[_focus]?.name||_focus)+'</strong><br><span style="color:#cc8866;font-size:.82em">La colonie pour laquelle tu fais la guerre — gagne le combat et tu la <b>captures</b> !</span><br><button onclick="_warSelectColonyTarget(\''+_focus+'\')" style="margin-top:6px;padding:8px 16px;background:#3a0a0a;border:1px solid #ff5050;color:#ffbbbb;border-radius:6px;cursor:pointer;font-weight:700">🎯 Assaillir '+(NODES[_focus]?.name||_focus)+'</button></div>'
    :'';
  document.getElementById('wcm-info').innerHTML=
    focusBtn+
    '<div style="margin-bottom:10px"><strong style="color:#ffb347">⚔️ Attaquer une autre colonie</strong><br>'+
    '<span style="color:#9898b8;font-size:.82em">Tes jetons : <strong>'+p.forceTokens+'</strong> | Force ennemie : <strong>'+enemyForceTxt+'</strong></span><br>'+
    '<button onclick="warAttackColony()" style="margin-top:6px;padding:6px 14px;background:#2a0a0a;border:1px solid #ef5350;color:#ff8080;border-radius:6px;cursor:pointer;font-weight:700">⚔️ Choisir une colonie</button></div>'+
    '<div><strong style="color:#4a8aff">🛤️ Attaquer les routes</strong><br>'+routeOpts+'</div>'+
    defendBtn+holdBtn;
  // Masquer le slider pour l'instant (étape 1 = choix)
  document.getElementById('wcm-slider').parentElement.style.display='none';
  document.getElementById('wcm-power').style.display='none';
  document.getElementById('war-combat-modal').querySelector('.atk-btns').style.display='none';
  document.getElementById('war-combat-modal').classList.remove('hidden');
}
function _getReachableWarTargets(player,ai){
  // Voisins directs (distance=1 entre n'importe quel nœud joueur et nœud IA) → tout ce qui est ≤4 hops
  // Sinon → uniquement le nœud ennemi le plus proche
  const pNodes=player.colonies.map(c=>c.nodeId);
  const aiNodes=ai.colonies.map(c=>c.nodeId);
  let isNeighbor=false;
  for(const pId of pNodes){
    for(const adj of(NODES[pId]?.conn||[])){
      if(aiNodes.includes(adj)){isNeighbor=true;break;}
    }
    if(isNeighbor)break;
  }
  if(isNeighbor){
    return ai.colonies.filter(c=>pNodes.some(pId=>getNodeDistance(pId,c.nodeId)<=4));
  }else{
    // Trouver la colonie ennemie la plus proche
    let minDist=999,closest=null;
    for(const c of ai.colonies){
      const d=Math.min(...pNodes.map(pId=>getNodeDistance(pId,c.nodeId)));
      if(d<minDist){minDist=d;closest=c;}
    }
    return closest?[closest]:[];
  }
}
function warAttackColony(){
  // Étape 2a : choisir quelle colonie attaquer (filtrée par proximité)
  const p=G.player;const ai=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const reachable=ai?_getReachableWarTargets(p,ai):[];
  if(!ai||reachable.length===0){
    _warAttackColonyTarget=ai?ai.civ.home:null;
    _warShowAttackSlider();return;
  }
  document.getElementById('wcm-sub').textContent='Quelle colonie attaquer ?';
  const colButtons=reachable.filter(c=>c.nodeId!==ai.civ.home).map(c=>{
    const n=NODES[c.nodeId];
    const dist=Math.min(...p.colonies.map(pc=>getNodeDistance(pc.nodeId,c.nodeId)));
    return`<button onclick="_warSelectColonyTarget('${c.nodeId}')" style="display:block;width:100%;text-align:left;margin-bottom:5px;padding:6px 10px;background:#1a0a0a;border:1px solid #6a2a2a;color:#ffccaa;border-radius:5px;cursor:pointer;font-size:.85em">
      ${n.emoji} <strong>${n.name}</strong> — Nv.${c.level}${c.connected?' ✓':' ✗ déconnectée'}
      <span style="color:#88aacc;float:right">${dist} nœud(s)</span>
    </button>`;
  }).join('');
  const homeCol=reachable.find(c=>c.nodeId===ai.civ.home);
  const homeBtn=homeCol?`<button onclick="_warSelectColonyTarget('${ai.civ.home}')" style="display:block;width:100%;text-align:left;margin-bottom:5px;padding:6px 10px;background:#2a0a1a;border:1px solid #8a2a4a;color:#ffaacc;border-radius:5px;cursor:pointer;font-size:.85em">
    ${NODES[ai.civ.home]?.emoji} <strong>${NODES[ai.civ.home]?.name}</strong> — QG 🏠 Nv.${homeCol.level}
  </button>`:'';
  document.getElementById('wcm-info').innerHTML=
    '<div style="color:#9898b8;font-size:.82em;margin-bottom:8px">IA : <strong>'+ai.civ.emoji+' '+ai.civ.name+'</strong> — '+reachable.length+' cible(s) à portée</div>'+
    homeBtn+colButtons;
  document.getElementById('wcm-slider').parentElement.style.display='none';
  document.getElementById('wcm-power').style.display='none';
  document.getElementById('war-combat-modal').querySelector('.atk-btns').style.display='none';
}
let _warAttackColonyTarget=null;
function _warSelectColonyTarget(nodeId){
  _warAttackColonyTarget=nodeId;      // règle : la cible, même sans écran
  if(!_aUnEcran())return;             // le reste est du dessin
  _warShowAttackSlider();
}
function _warShowAttackSlider(){
  if(!_aUnEcran())return;   // dessine un curseur : sans écran, il n'y a rien à dessiner
  const p=G.player;const ai=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const aiTok=ai?ai.forceTokens:0;
  // Défense RÉELLEMENT engageable par l'IA = ce qu'elle peut PAYER (1🪨+1⚡/jeton). Déterministe → l'affichage ne ment pas.
  const usableDef=ai?Math.min(aiTok,ai.res.materials||0,ai.res.energy||0):0;
  // Bonus de défense GRATUITS de l'ennemi (ne coûtent ni énergie ni matériaux) : Empathes et Supercroiseur.
  // Ils étaient absents de l'affichage → on pouvait perdre « 4 contre 5 » face à une nation à 0⚡ sans comprendre.
  const _freeDef=ai?(((typeof hasSpec==='function'&&hasSpec(ai,'empath_routes'))?2:0)
                    +((typeof hasSpec==='function'&&hasSpec(ai,'empath_tele'))?2:0)
                    +((typeof cruiserAvailable==='function'&&cruiserAvailable(ai)&&typeof cruiserAfford==='function'&&cruiserAfford(ai))?(ai.cruiserPower||5):0)):0;
  const aiCommitted=usableDef; // l'IA engagera ce qu'elle peut payer (la garnison +1 est ajoutée au combat)
  G._aiWarCommitted=aiCommitted;
  const stratBonus=(p.stratBonus&&p.stratBonus.combatBonus)||0;
  const targetNode=NODES[_warAttackColonyTarget];
  // Plancher de défense : 1 jeton réservé par colonie connectée hors base (non engageables en attaque)
  const defFloor=p.colonies.filter(c=>c.connected&&c.nodeId!==p.civ.home).length;
  const engageable=engageableTokens(p); // MÊME source que la barre du haut → plus d'écart d'affichage
  const intel=getIntelLevel(G.player);
  document.getElementById('wcm-sub').textContent='Attaque '+(targetNode?targetNode.name:'colonie')+' — choisis tes jetons :';
  document.getElementById('wcm-info').innerHTML=
    'Cible : <strong style="color:#ffaa66">'+(targetNode?targetNode.emoji+' '+targetNode.name:'?')+'</strong><br>'+
    'Tes jetons engageables : <strong>'+engageable+'</strong> <span style="color:#7880a0;font-size:.8em">('+(p.forceTokens||0)+' au total · '+defFloor+' réservé(s) en garnison)</span>'+
    (stratBonus?'<br>Bonus stratégie : <strong>+'+stratBonus+'</strong>':'')+
    '<br><span style="color:#7880a0;font-size:.82em">'+(intel>=2
      ? ('🛰️ Défense ennemie totale : <strong>'+(usableDef+1+_freeDef)+'</strong> '
       +'<span style="color:#8fb0d8">('+usableDef+' jeton(s) payable(s) + 1 garnison'+(_freeDef?(' + '+_freeDef+' bonus gratuits : Empathes/croiseur'):'')+')</span>')
      : ('🌫️ Force ennemie totale : <strong>~'+aiTok+'</strong> jeton(s) (±1) — part utilisable inconnue sans renseignement'))+'</span>';
  const slider=document.getElementById('wcm-slider');
  slider.parentElement.style.display='';
  document.getElementById('wcm-power').style.display='';
  document.getElementById('war-combat-modal').querySelector('.atk-btns').style.display='';
  const _afford=maxAffordableTokens(p, reserveCroiseur(p, !!G._cruiserDeployTemp)); // SOURCE UNIQUE : Navigation (coût ÷2) ET croiseur réservé
  const maxCommit=Math.max(0,Math.min(p.forceTokens-defFloor,_afford));
  slider.min=0;slider.max=maxCommit;slider.value=maxCommit;
  if(defFloor>0)document.getElementById('wcm-info').innerHTML+=
    '<br><span style="color:#7880a0;font-size:.8em">⚠️ '+defFloor+' jeton(s) réservés pour la défense de tes colonies (non engageables).</span>';
  if(Math.max(0,p.forceTokens-defFloor)>_afford)document.getElementById('wcm-info').innerHTML+=
    '<br><span style="color:#ff8866;font-size:.8em">⚠️ Limité à '+_afford+' jeton(s) : il faut 1<i class=ri-materials></i> +1<i class=ri-energy></i> par jeton engagé.</span>';
  // Bonus Empathes (gratuit, non gaspillable)
  const _emp=bonusCombatCartes(p);
  if(_emp>0)document.getElementById('wcm-info').innerHTML+='<br><span style="color:#c080ff;font-size:.82em">🔮 Bonus Empathes : +'+_emp+' (gratuit, non gaspillable)</span>';
  // Supercroiseur : déploiement à la demande
  G._cruiserDeployTemp=false;
  if(p.hasCruiser){
    let _cru;
    if(!cruiserAvailable(p))_cru='<span style="color:#7880a0;font-size:.82em">⚓ Supercroiseur en réparation (récupération).</span>';
    else if(!cruiserAfford(p))_cru='<span style="color:#ff8866;font-size:.82em">⚓ Supercroiseur indisponible : besoin de 5<i class=ri-materials></i> + 5<i class=ri-energy></i>.</span>';
    else _cru='<button id="cru-btn" onclick="toggleCruiser()" style="margin-top:6px;padding:6px 10px;background:#0a1a2a;border:1px solid #4488cc;color:#88bbee;border-radius:6px;cursor:pointer;font-size:.82em">⚓ Déployer le Supercroiseur (+'+(p.cruiserPower||5)+'⚔️, coût 5<i class=ri-materials></i> 5<i class=ri-energy></i>)</button>';
    document.getElementById('wcm-info').innerHTML+='<br>'+_cru;
  }
  _warSliderMode='attack';
  updateWarCombatSlider();
}
function warAttackRoute(idx){
  // Attaque d'une route ennemie (protégée ou non). Règle "route" (exception) :
  //  • non protégée → 1 jeton, aucun coût ; protégée → 2 jetons (défenseur perd son jeton, 1 des tiens en récupération).
  //  • ensuite tu choisis de la RÉCUPÉRER (elle devient tienne) ou de la DÉTRUIRE.
  const warAtkAi=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const r=warAtkAi?warAtkAi.routes[idx]:null;
  if(!r){document.getElementById('war-combat-modal').classList.add('hidden');const _s=_combatSuiteLire();if(_s)_s(0);return;}
  const prot=(r.tokens||0)>=1;const need=prot?2:1;
  if((G.player.forceTokens||0)<need){addLog('⚠️ Il te faut '+need+' jeton'+(need>1?'s':'')+' Force pour cette route'+(prot?' (protégée)':'')+'.','red');return;} // on laisse rechoisir
  G._pendingRouteAtk={ai:warAtkAi, route:r, prot:prot};
  document.getElementById('war-combat-modal').classList.add('hidden');
  showRouteCaptureModal(r, prot);
}
function showRouteCaptureModal(route, prot){
  const rn=(NODES[route.from]?.name||route.from)+' → '+(NODES[route.to]?.name||route.to);
  /* Une IA ne choisit pas entre « récupérer » et « détruire » : elle récupère. Même chemin que le
     joueur (`routeCaptureChoice`), pour ne pas dupliquer les effets de la capture. */
  /* ⚠️ COURT-CIRCUIT RETIRÉ — IL CASSAIT LA REPRISE DE PARTIE.
     Une nation tenue par l'ordinateur ne peut pas répondre à la fenêtre « route_capture », et il fallait bien que
     quelqu'un le fasse. J'avais donc appelé la continuation ICI, en direct. Le multijoueur repartait,
     et deux bancs verts depuis le 6 août — `test_serialisation`, `test_reprise` — sont tombés deux
     fois sur trois : une partie sauvegardée puis restaurée ne repartait plus.
     Une partie n'est reprenable que parce que chaque question EXISTE dans `G._flux` avec sa suite
     rangée sous forme de nom. Appeler la continuation en direct saute cette étape : la question
     n'est jamais posée, donc jamais sauvegardée, et toute la chaîne se déroule d'un bloc au lieu de
     rendre la main entre les étapes. C'est désormais le PILOTE qui répond pour les IA
     (`driver.js`, `_reponseIA`), après que la question a été posée normalement. */
  if(_decisionActive()){ // EN LIGNE : router le choix récupérer/détruire (sinon la modale ne s'affiche jamais côté serveur)
    /* SUITE NOMMÉE, pas une fonction. Cette question était la dernière du flux de guerre à porter sa
       continuation sous forme de fermeture : une partie sauvegardée pendant le choix
       « récupérer / détruire » ne repartait pas (test_reprise.js, famille GUERRE). Elle passait
       inaperçue tant que le moteur ne portait qu'UNE question à la fois — la suivante écrasait
       simplement celle-ci, et le joueur ne se voyait jamais proposer le choix. */
    _emitDecision('route_capture', G.player, {from:route.from, to:route.to, name:rn, prot:!!prot}, 'routeCaptureChoice', 'adCaptureRoute');
    return;
  }
  document.getElementById('rcm-title').textContent='🛤️ '+rn;
  document.getElementById('rcm-desc').innerHTML=prot
    ?'Tu as <b>brisé la protection</b> ennemie (son jeton est détruit). <b>2 jetons engagés : 1 part en récupération.</b> Que faire de la route ?'
    :'Route ennemie <b>non protégée</b>, prise <b>sans coût ni récupération</b>. Que faire ?';
  const keep=document.getElementById('rcm-keep');
  keep.innerHTML=prot?'🎖️ La récupérer <span style="opacity:.8;font-size:.85em">(1 jeton la protège)</span>':'🎖️ La récupérer <span style="opacity:.8;font-size:.85em">(elle devient tienne)</span>';
  document.getElementById('route-capture-modal').classList.remove('hidden');
}
function routeCaptureChoice(capture){
  document.getElementById('route-capture-modal').classList.add('hidden');
  const ctx=G._pendingRouteAtk;G._pendingRouteAtk=null;
  if(!ctx){render();return;}
  const ai=ctx.ai,r=ctx.route,p=G.player;
  // Retire la route ennemie : son jeton de protection (déployé) est détruit → le défenseur le perd définitivement.
  if(ai){ai.routes=ai.routes.filter(x=>x!==r);updateConnections(ai);}
  // Comptabilité des jetons de l'attaquant (exception ROUTE) :
  if(ctx.prot){
    p.forceTokens=Math.max(0,(p.forceTokens||0)-2);
    if(!p.forceCooldown)p.forceCooldown=[];
    p.forceCooldown.push({count:1,returnTurn:getCooldownTurn(p)}); // 1 seul jeton en récupération
    if(capture){if(!p.routes)p.routes=[];p.routes.push({from:r.from,to:r.to,tokens:1});updateConnections(p);} // le 2e reste posé sur la route
    else{p.forceTokens+=1;} // détruire : le 2e jeton revient en réserve
  }else{
    if(capture){if(!p.routes)p.routes=[];p.routes.push({from:r.from,to:r.to,tokens:0});updateConnections(p);} // aucune perte : le jeton reste en réserve
  }
  const rn=(NODES[r.from]?.name||r.from)+'→'+(NODES[r.to]?.name||r.to);
  addLog((capture?'🎖️ Tu captures la route ':'💥 Tu détruis la route ')+rn+(ctx.prot?' — défenseur −1 jeton, 1 des tiens en récupération.':' — sans coût.'),'gold');
  // Contexte GUERRE POPULAIRE FORCÉE : on apaise la tension et on reprend le flux de guerre forcée.
  if(ctx.mode==='forced'){
    if(ai)halveTensions('player',ai.civ.id);
    G.playerTension=0;G.aiTension=0;
    if(!_guerrePopSuiteJouer())render();
    return;
  }
  // Contexte FENÊTRE DE COMBAT : poursuite du flux de guerre (identique à l'ancien warAttackRoute)
  G._aiWarCommitted=0;
  const warCombatResult={pPow:'-',aPow:'-',txt:(capture?'Route capturée : ':'Route détruite : ')+rn+'.',cls:'win'};
  _decompterTourDeGuerre();
  const warEndResult=G.warTurnsLeft<=0?endWar(G.warWith):null;
  {const _s=_combatSuiteLire();
    if(_s){ G._routeAttackResult={warCombatResult,warEndResult}; _s('ROUTE_ATTACK'); }
    /* ⚠️ NE JAMAIS FINIR EN SILENCE. Il n'y avait ici qu'un `if(_s)` : quand la suite de combat
       avait déjà été consommée en amont (`adChoixDeCombat` la lit ET l'efface), ce bloc ne faisait
       RIEN. Pas d'erreur, pas de journal : la guerre s'arrêtait au milieu et la partie attendait
       une réponse que plus personne ne devait donner. C'est le pire mode de panne — invisible.
       On reprend donc explicitement le fil normal de la guerre, et on l'écrit. */
    else{
      addLog('🛤️ '+(capture?'Route capturée':'Route détruite')+' — la guerre reprend son cours.','dim');
      if(typeof guerreAssautIAPuisSuivante==='function') guerreAssautIAPuisSuivante();
      else render();
    }
  }
}
function updateWarCombatSlider(){
  const p=G.player;
  const committed=parseInt(document.getElementById('wcm-slider').value);
  const stratBonus=(p.stratBonus&&p.stratBonus.combatBonus)||0;
  const emp=bonusCombatCartes(p);
  const cruOn=!!G._cruiserDeployTemp&&cruiserAvailable(p)&&cruiserAfford(p);const cruPow=cruOn?(p.cruiserPower||5):0;
  const pPow=committed+stratBonus+emp+cruPow;
  document.getElementById('wcm-slider-val').textContent=committed;
  const _aff=(p.res.materials||0)>=(committed+(cruOn?5:0))&&(p.res.energy||0)>=(committed+(cruOn?5:0));
  document.getElementById('wcm-power').innerHTML='Ta puissance : <strong>'+pPow+'</strong>⚔️ <span style="color:#7880a0;font-size:.85em">('+committed+' jetons'+(emp?' +'+emp+' Empathes':'')+(cruPow?' +'+cruPow+' Croiseur':'')+')</span>'+
    '<br><span style="color:'+(_aff?'#ffaa66':'#ff5555')+';font-weight:700">Coût : −'+committed+'<i class=ri-materials></i> −'+committed+'<i class=ri-energy></i>'+(cruOn?' (+5<i class=ri-materials></i> 5<i class=ri-energy></i> croiseur)':'')+'</span>';
}
function toggleCruiser(){
  G._cruiserDeployTemp=!G._cruiserDeployTemp;
  const b=document.getElementById('cru-btn');
  if(b){const on=G._cruiserDeployTemp;b.textContent=on?'⚓ Supercroiseur DÉPLOYÉ (+'+(G.player.cruiserPower||5)+'⚔️) — annuler':'⚓ Déployer le Supercroiseur (+'+(G.player.cruiserPower||5)+'⚔️, coût 5🪨 5⚡)';b.style.background=on?'#0a2a1a':'#0a1a2a';b.style.borderColor=on?'#44bb88':'#4488cc';b.style.color=on?'#66ffaa':'#88bbee';}
  updateWarCombatSlider();
}
function confirmWarCombat(){ G._warCancelRefund=null; G._warDecisionAssault=false; if(G&&G._il){G._ilPassTries=0;setTimeout(_ilMaybePass,80);}
  const committed=parseInt(document.getElementById('wcm-slider').value);
  G._cruiserDeployed=!!G._cruiserDeployTemp&&cruiserAvailable(G.player)&&cruiserAfford(G.player);G._cruiserDeployTemp=false;
  document.getElementById('war-combat-modal').classList.add('hidden');
  {const _s=_combatSuiteLire(); if(_s)_s(committed);}
}
function warHoldPosition(){
  if((G._aiWarStance||'hold')==='attack'){
    // L'IA attaque malgré tout — basculer en défense forcée
    const _holdWarEnemy=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];const aiTok=_holdWarEnemy?_holdWarEnemy.forceTokens:0;
    G._aiWarCommitted=Math.max(1,Math.ceil(aiTok*(0.4+Math.random()*0.4)));
    warDefendTarget();
    // Avertissement en tête du panneau
    const info=document.getElementById('wcm-info');
    info.innerHTML='<div style="padding:7px 10px;background:#3a0a0a;border:1px solid #cc3322;border-radius:6px;margin-bottom:10px;color:#ff8866;font-size:.85em;font-weight:700">⚠️ L\'IA en profite pour attaquer pendant que tu recules !</div>'+info.innerHTML;
  }else{
    // Standoff mutuel — les deux tiennent
    document.getElementById('war-combat-modal').classList.add('hidden');
    {const _s=_combatSuiteLire(); if(_s)_s('STANDOFF');}
  }
}
function warDefendTarget(){
  // Étape 2 : slider pour choisir les jetons de défense
  const p=G.player;
  const t=G._aiWarTarget;
  const wdAi=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const aiTok=wdAi?wdAi.forceTokens:0;
  const aiCommitted=Math.max(1,Math.ceil(aiTok*(0.4+Math.random()*0.4)));
  G._aiWarCommitted=aiCommitted;
  const tName=t?(t.type==='colony'?'🏙️ Colonie '+t.name:'🛤️ Route '+t.name):'une cible';
  document.getElementById('wcm-sub').textContent='🛡️ Défense de '+tName+' — choisis tes jetons :';
  document.getElementById('wcm-info').innerHTML=
    'Cible menacée : <strong style="color:#ffaa77">'+tName+'</strong><br>'+
    'Tes jetons disponibles : <strong>'+p.forceTokens+'</strong><br>'+
    '<span style="color:#7880a0;font-size:.82em">Plus tu en engages, plus la défense est solide. 0 jeton = tu subis sans résistance.</span>';
  const slider=document.getElementById('wcm-slider');
  slider.parentElement.style.display='';
  document.getElementById('wcm-power').style.display='';
  // Remplacer le bouton "Confirmer attaque" par "Confirmer défense"
  const atkBtns=document.getElementById('war-combat-modal').querySelector('.atk-btns');
  atkBtns.style.display='';
  atkBtns.innerHTML='<button onclick="confirmWarDefense()" style="padding:8px 20px;background:#2a1200;border:1px solid #cc6622;color:#ffaa66;border-radius:7px;cursor:pointer;font-weight:700;font-size:.9em">🛡️ Défendre avec ces jetons</button> <button class="atk-cancel" onclick="cancelWarCombat()">↩ Annuler</button>';
  // Plancher de défense : 1 jeton réservé par colonie connectée hors base
  const defFloor2=p.colonies.filter(c=>c.connected&&c.nodeId!==p.civ.home).length;
  const _affD=maxAffordableTokens(p); // SOURCE UNIQUE : tient compte de l'IA de Navigation (coût ÷2)
  const maxDef=Math.max(0,Math.min(p.forceTokens-defFloor2,_affD));
  slider.min=0;slider.max=maxDef;slider.value=Math.min(Math.ceil(maxDef/2),maxDef);
  if(defFloor2>0)document.getElementById('wcm-info').innerHTML+=
    '<br><span style="color:#7880a0;font-size:.8em">⚠️ '+defFloor2+' jeton(s) réservés pour la défense de tes autres colonies.</span>';
  if(Math.max(0,p.forceTokens-defFloor2)>_affD)document.getElementById('wcm-info').innerHTML+=
    '<br><span style="color:#ff8866;font-size:.8em">⚠️ Limité à '+_affD+' jeton(s) : il faut 1<i class=ri-materials></i> +1<i class=ri-energy></i> par jeton engagé.</span>';
  _warSliderMode='defend';
  updateWarDefenseSlider();
}
function updateWarDefenseSlider(){
  const p=G.player;
  const committed=parseInt(document.getElementById('wcm-slider').value);
  document.getElementById('wcm-slider-val').textContent=committed;
  const _affd=(p.res.materials||0)>=committed&&(p.res.energy||0)>=committed;
  document.getElementById('wcm-power').innerHTML='Ta puissance de défense : '+committed+' 🛡️'+(committed<p.forceTokens?' <span style="color:#7880a0">('+((p.forceTokens-committed))+' épargnés)</span>':'')+
    '<br><span style="color:'+(_affd?'#ffaa66':'#ff5555')+';font-weight:700">Coût défense : −'+committed+'<i class=ri-materials></i> −'+committed+'<i class=ri-energy></i></span>';
}
function confirmWarDefense(){
  const committed=parseInt(document.getElementById('wcm-slider').value);
  document.getElementById('war-combat-modal').classList.add('hidden');
  {const _s=_combatSuiteLire(); if(_s)_s('DEFEND:'+committed);}
}
/* Corps du bilan de fin de tour. Fonction PURE (aucun accès DOM) : le solo l'injecte
   directement, le mode serveur l'envoie au client qui l'injecte dans la même fenêtre.
   Ainsi le bilan est rigoureusement identique en solo, en réseau et en multijoueur. */
function buildEOTBody(maint,revs,warCombat,warEnd){
  maint=maint||{};
  const _srv=(typeof _decisionActive==='function')&&_decisionActive();
  // En mode serveur G.turnActions/G._raidsThisTurn sont globaux (toutes nations confondues) :
  // on lit les journaux propres à la nation active.
  const _myActs=_srv?(G.player._turnActions||[]):(G.turnActions||[]);
  const _myRaids=_srv?(G.player._raidsThisTurn||[]):(G._raidsThisTurn||[]);
  let html='';
  html+='<div class="eot-section"><h4><i class=ri-energy></i> Actions ce tour</h4>';
  if(_myActs.length>0){for(const act of _myActs){const paid=[];if(act.acPaid)paid.push(act.acPaid+' AC');for(const[r,a]of Object.entries(act.resPaid||{}))if(a>0)paid.push(a+rEmoji(r));html+=`<div class="eot-item"><span class="eot-icon">${act.emoji}</span><span class="eot-name">${act.name}</span>${paid.length?`<span class="eot-paid">−${paid.join(' ')}</span>`:''}${act.gainDesc?`<span class="eot-gain">${act.gainDesc}</span>`:''}</div>`;}}else html+='<div class="eot-empty">Aucune action.</div>';
  html+='</div>';
  // (Bloc « Autres nations ce tour » melange supprime : detail par nation plus bas, une section par nation.)
  html+='<div class="eot-section"><h4>🔧 Entretien</h4>';
  if(!maint.energyCost&&!maint.matCost&&!maint.routeEnergyCost)html+='<div class="eot-empty">Aucun entretien.</div>';
  else{
    if(maint.energyCost>0||maint.matCost>0)html+=`<div class="eot-item"><span class="eot-icon">🏗️</span><span class="eot-name">Colonies (par niveau)</span><span class="eot-paid">−${maint.energyCost}<i class=ri-energy></i>${maint.matCost>0?' −'+maint.matCost+'<i class=ri-materials></i>':''}</span>${maint.moraleLostCols>0?`<span class="eot-paid">−${maint.moraleLostCols}<i class=ri-morale></i></span>`:''}</div>`;
    if(maint.routeEnergyCost>0)html+=`<div class="eot-item"><span class="eot-icon">🛤️</span><span class="eot-name">Routes (${G.player.routes.length})</span><span class="eot-paid">−${maint.routeEnergyCost}<i class=ri-energy></i></span><span class="eot-gain">+${maint.routeMatGain}<i class=ri-materials></i></span>${maint.moraleLostRoutes>0?`<span class="eot-paid">−${maint.moraleLostRoutes}<i class=ri-morale></i></span>`:''}</div>`;
  }
  html+='</div>';
  html+='<div class="eot-section"><h4>💰 Revenus</h4>';
  if(!revs||!Object.keys(revs).length)html+='<div class="eot-empty">Aucun revenu.</div>';
  else{const revStr=Object.entries(revs).filter(([,a])=>a>0).map(([r,a])=>'+'+a+rEmoji(r)).join('  ');html+=`<div class="eot-item"><span class="eot-icon">💰</span><span class="eot-name">${G.player.colonies.filter(c=>c.connected).map(c=>NODES[c.nodeId].name).join(', ')}</span><span class="eot-gain">${revStr}</span></div>`;}
  html+='</div>';
  for(const ai of G.ais){
    const _atWarEOT=_warBetween(_moiId(),ai.civ.id);
    html+='<div class="eot-section"><h4>'+ai.civ.emoji+' '+ai.civ.name+(_atWarEOT?' <span style="color:#ff7a7a;font-size:.82em">⚔️ en guerre avec toi</span>':'')+'</h4>';
    const _acts=ai._turnActions||[];
    if(_acts.length>0){for(const a of _acts)html+=`<div class="eot-item"><span class="eot-icon">${a.emoji}</span><span class="eot-name">${a.name}</span>${a.desc?`<span class="eot-desc">${a.desc}</span>`:''}</div>`;}else html+=`<div class="eot-empty">${_atWarEOT?'En guerre — n\'a rien entrepris ce tour.':'Rien fait ce tour.'}</div>`;
    html+='</div>';
  }
  if(warCombat){const bc=warCombat.cls==='win'?'#44aa44':warCombat.cls==='loss'?'#aa4444':'#aaaa44';html+=`<div class="eot-section" style="border:1px solid ${bc}30;border-radius:6px;padding:8px;margin-bottom:14px"><h4 style="color:${bc}">⚔️ Guerre</h4><div class="eot-item" style="color:${bc}"><span class="eot-icon">⚔️</span><span class="eot-name">${warCombat.txt}</span></div>${warEnd?`<div class="eot-item"><span class="eot-icon">🏳️</span><span class="eot-name">${warEnd.txt}</span></div>`:G.warState==='active'?`<div class="eot-item"><span class="eot-icon">🔔</span><span class="eot-name" style="color:#ffaa44">${G.warTurnsLeft} tour(s) restant(s)</span></div>`:''}</div>`;}
  // Section raids reçus ce tour
  if(_myRaids&&_myRaids.length>0){
    const totalStolen=_myRaids.flatMap(r=>r.stolen);
    const civName=_myRaids[0].civ.emoji+' '+_myRaids[0].civ.name;
    const raidCount=_myRaids.length;
    html+=`<div class="eot-section" style="border:1px solid #aa333330;border-radius:6px;padding:8px;margin-bottom:14px">
      <h4 style="color:#ff8888">⚔️ Pillage subi</h4>
      <div class="eot-item" style="color:#ff8888">
        <span class="eot-icon">⚔️</span>
        <span class="eot-name">${civName} — ${raidCount} raid${raidCount>1?'s':''}</span>
        <span class="eot-paid">−${totalStolen.join('')}</span>
      </div>
      <div class="eot-item" style="color:#cc8844;font-size:.82em">
        <span class="eot-icon">📈</span>
        <span class="eot-name">Risque de guerre +${raidCount*2} (suspicion accumulée)</span>
      </div>
    </div>`;
  }
  // Pirate forecast (masqué si l'une des factions joue Pirates)
  if(npcPiratesActive()){const nxtProb=Math.min(100,Math.round((0.10+(G.turn+1)*0.10)*100));html+=`<div class="eot-section"><h4 style="color:#ff8888">☠️ Pirates</h4><div class="eot-item" style="color:#ff8888"><span class="eot-icon">☠️</span><span class="eot-name">Risque sur les routes non protégées au prochain tour : ${nxtProb}%</span></div></div>`;}
  return html;
}
function showEOTModal(maint,revs,warCombat,warEnd){
  if(_decisionActive()){ // mode serveur : on envoie le bilan COMPLET (même HTML qu'en solo) ; la suite enchaîne via continueAfterEOT
    let _html='';
    try{ _html=buildEOTBody(maint,revs,warCombat,warEnd); }catch(e){ _html=''; }
    /* Un bilan PAR NATION : à la fin d'une manche il n'y a plus de joueur actif, tout le monde doit
       pouvoir lire le sien EN MÊME TEMPS (demande de Marc). On bascule temporairement la perspective
       (G.player / G.ais) sur chaque nation pour construire son bilan, puis on restaure l'état exact.
       buildEOTBody est une fonction pure sans DOM : cette bascule est sans effet de bord. */
    const _bodies={};
    const _savedPlayer=G.player, _savedAis=G.ais;
    try{
      const _all=(typeof allPlayers==='function')?allPlayers():[_savedPlayer].concat(_savedAis||[]);
      for(const _n of _all){
        if(!_n||!_n.civ) continue;
        try{
          G.player=_n; G.ais=_all.filter(x=>x!==_n);
          const _isMe=(_n===_savedPlayer);
          _bodies[_n.civ.id]=buildEOTBody(_isMe?maint:(_n._lastMaint||null), _isMe?revs:(_n._lastRevs||null), _isMe?warCombat:null, _isMe?warEnd:null);
        }catch(e){ _bodies[_n.civ.id]=''; }
      }
    }catch(e){}
    G.player=_savedPlayer; G.ais=_savedAis;
    /* Le bilan de fin de tour est une fenêtre COLLECTIVE : tout le monde reçoit le sien, mais c'est
       son propriétaire qui la referme et relance le tour. Si ce propriétaire est tenu par
       l'ordinateur — un joueur absent remplacé par une IA au vote — personne ne clique, et la table
       attend indéfiniment. Elle lit donc tout de suite, par la même suite nommée. */
  /* ⚠️ COURT-CIRCUIT RETIRÉ — IL CASSAIT LA REPRISE DE PARTIE.
     Une nation tenue par l'ordinateur ne peut pas répondre à la fenêtre « eot », et il fallait bien que
     quelqu'un le fasse. J'avais donc appelé la continuation ICI, en direct. Le multijoueur repartait,
     et deux bancs verts depuis le 6 août — `test_serialisation`, `test_reprise` — sont tombés deux
     fois sur trois : une partie sauvegardée puis restaurée ne repartait plus.
     Une partie n'est reprenable que parce que chaque question EXISTE dans `G._flux` avec sa suite
     rangée sous forme de nom. Appeler la continuation en direct saute cette étape : la question
     n'est jamais posée, donc jamais sauvegardée, et toute la chaîne se déroule d'un bloc au lieu de
     rendre la main entre les étapes. C'est désormais le PILOTE qui répond pour les IA
     (`driver.js`, `_reponseIA`), après que la question a été posée normalement. */
    _emitNotice('eot', G.player, {turn:G.turn, html:_html, bodies:_bodies, maint:maint||null, revs:revs||null}, 'continueAfterEOT');
    return;
  }
  if(typeof _ilHide==='function')_ilHide();
  document.getElementById('eot-title').textContent='📊 Bilan du Tour '+G.turn;
  document.getElementById('eot-body').innerHTML=buildEOTBody(maint,revs,warCombat,warEnd);
  document.getElementById('eot-modal').classList.remove('hidden');
}
function showEventModal(ev,msg){
  if(_decisionActive()){ // mode serveur : notice à tous ; la suite est un NOM rangé dans G
    _emitNotice('event_result', null, {event:{id:ev.id,name:ev.name,emoji:ev.emoji,type:ev.type}, msg}, '_evSuiteJouer');
    return;
  }
  const typeColors={competition:'#9a2222',menace:'#9a5a22',opportunite:'#226a42'};const typeBg={competition:'#3a0808',menace:'#3a1a08',opportunite:'#083a18'};const typeLabels={competition:'Compétition',menace:'Menace',opportunite:'Opportunité'};
  const card=document.getElementById('evm-card');card.className='evt-card '+(ev.type||'');card.style.borderColor=typeColors[ev.type]||'#5a1a7a';
  document.getElementById('evm-emoji').textContent=ev.emoji;
  const badge=document.getElementById('evm-badge');badge.textContent=typeLabels[ev.type]||ev.type;badge.style.background=typeBg[ev.type]||'#2a0a3a';badge.style.color=typeColors[ev.type]||'#cc88ff';badge.style.border='1px solid '+(typeColors[ev.type]||'#5a1a7a');
  document.getElementById('evm-name').textContent=ev.emoji+' '+ev.name;document.getElementById('evm-result').innerHTML=msg;
  const consEl=document.getElementById('evm-consequence');const good=['remportes','domines','protège','Égalité','Science !'].some(k=>msg.includes(k));const bad=['perds','perd','Défaite','−'].some(k=>msg.includes(k));
  if(msg.includes('te protéger')){consEl.textContent='🛡️ Tu as réussi à te protéger !';consEl.style.color='#88ee88';consEl.classList.remove('hidden');}
  else if(bad&&!good){consEl.textContent='⚠️ Impact négatif.';consEl.style.color='#ff8866';consEl.classList.remove('hidden');}
  else if(good){consEl.textContent='✓ Ta civilisation en bénéficie !';consEl.style.color='#88ee88';consEl.classList.remove('hidden');}
  else consEl.classList.add('hidden');
  document.getElementById('event-modal').classList.remove('hidden');
}
function dismissEventModal(){document.getElementById('event-modal').classList.add('hidden');const d=fluxDonnees();if(d.suiteEvenement){_evSuiteJouer();}else render();}
/* ============================================================ TECH DETAIL MODAL ============================================================ */
let _techDetailId=null;
function showTechDetail(cardId){
  const card=CARDS_POOL.find(c=>c.id===cardId);if(!card)return;
  _techDetailId=cardId;
  const branch=card.branch?TECH_BRANCHES[card.branch]:null;
  const exclusive=isTechExclusive(card);
  const playerOwned=!!G.player.cards.find(c=>c.id===cardId);
  const aiOwned=G.ais.some(ai=>!!ai.cards.find(c=>c.id===cardId));const aiOwnedCiv=G.ais.find(ai=>ai.cards.find(c=>c.id===cardId));
  const exclusiveTaken=exclusive&&G.techTaken.has(cardId);
  const avail=isTechAvailable(card,G.player)&&!playerOwned&&!exclusiveTaken;
  const cost=getEffCost(card,G.player);
  const acCost=card.tier===3?2:1;
  const canBuy=avail&&G.phase==='actions'&&G.player.acLeft>=acCost&&Object.entries(cost).every(([r,a])=>(G.player.res[r]||0)>=a);
  const artBg=branch?branch.color+'22':'#1a1a3a';
  const border=branch?branch.color:'#2a2a5a';
  document.getElementById('td-card').style.borderTop=`4px solid ${border}`;
  const artEl=document.getElementById('td-art');
  if(CARD_ART.has(cardId)){artEl.style.background=`#0a0a18 url('assets/cards/${cardId}.png') center/contain no-repeat`;artEl.style.height='300px';}
  else{artEl.style.background=artBg;artEl.style.height='';}
  let takenBadgeHtml='<span class="td-taken-badge hidden" id="td-taken"></span>';
  if(playerOwned&&aiOwned&&!exclusive)takenBadgeHtml=`<span class="td-taken-badge" id="td-taken">✓ Toi + ${aiOwnedCiv?aiOwnedCiv.civ.emoji:''}</span>`;
  else if(playerOwned)takenBadgeHtml=`<span class="td-taken-badge" id="td-taken">✓ Toi</span>`;
  else if(exclusiveTaken)takenBadgeHtml=`<span class="td-taken-badge" id="td-taken">${aiOwnedCiv?aiOwnedCiv.civ.emoji:'🤖'} IA</span>`;
  else if(!exclusive&&aiOwned)takenBadgeHtml=`<span class="td-taken-badge" id="td-taken" style="background:#4a3060;color:#c0a0ff">${aiOwnedCiv?aiOwnedCiv.civ.emoji:''} IA aussi</span>`;
  const lockOverlay='';   // carte détaillée : plus de cadenas non plus (voir la rivière)
  artEl.innerHTML=`<span class="td-tier-badge" id="td-tier">${card.tier?'T'+card.tier:'Général'}</span>${CARD_ART.has(cardId)?'':`<span id="td-emoji">${card.emoji}</span>`}${takenBadgeHtml}${lockOverlay}`;
  document.getElementById('td-name').textContent=card.name;
  document.getElementById('td-branch').innerHTML=branch?(branch.emoji+' '+branch.label+(G.player.civ.techBonus===card.branch?' — ★ Bonus nation -1<i class=ri-science></i>':'')):card.type||'';
  document.getElementById('td-effect').innerHTML=card.effect;
  const costRow=document.getElementById('td-cost');
  if(playerOwned){costRow.innerHTML='<span style="color:#66cc66;font-size:.95em">✓ Déjà dans ta collection</span>'+(!exclusive&&aiOwned?` <span style="color:#9080c0;font-size:.85em">(${aiOwnedCiv?aiOwnedCiv.civ.name:'IA'} l'a aussi)</span>`:'');}
  else if(exclusiveTaken){costRow.innerHTML=`<span style="color:#7880a0">Carte possédée par ${aiOwnedCiv?aiOwnedCiv.civ.name:'IA'}</span>`;}
  else{let extra=(!exclusive&&aiOwned)?` <span style="color:#9080c0;font-size:.85em">${aiOwnedCiv?aiOwnedCiv.civ.emoji+' '+aiOwnedCiv.civ.name:'Une IA'} l'a aussi — tu peux quand même l'acheter</span>`:'';
    const _acOk=G.player.acLeft>=acCost;
    const _acHtml='<span class="res-tag energy" style="'+(_acOk?'':'color:#ff5555;background:#3a0a0a')+'">'+acCost+' AC</span>';
    const _costHtml=Object.entries(cost).map(([r,a])=>{const have=G.player.res[r]||0;const ok=have>=a;return '<span style="color:'+(ok?'#8898b8':'#ff5555')+';font-weight:700">'+a+rEmoji(r)+(ok?'':' ✗')+'</span>';}).join(' ');
    costRow.innerHTML=_acHtml+' '+_costHtml+(card.vp?` <span style="color:#ffd700;margin-left:4px">+${card.vp} VP</span>`:'')+extra;}
  const btn=document.getElementById('td-buy-btn');
  if(playerOwned){btn.style.display='none';}
  else if(exclusiveTaken){btn.className='td-buy cannot';btn.textContent='🔒 Déjà prise par '+(aiOwnedCiv?aiOwnedCiv.civ.emoji+' '+aiOwnedCiv.civ.name:'l\'IA');btn.style.display='block';}
  else if(!isTechAvailable(card,G.player)){
    const needsT2=card.tier===3&&!G.player.cards.some(c=>c.branch===card.branch&&c.tier===2);
    btn.className='td-buy cannot';btn.textContent=needsT2?'🔒 T2 personnelle requise':'🔒 Branche verrouillée';btn.style.display='block';}
  else if(G.phase!=='actions'){btn.className='td-buy cannot';btn.textContent='Pas disponible hors phase actions';btn.style.display='block';}
  else if(!canBuy){btn.className='td-buy cannot';btn.textContent=G.player.acLeft<acCost?'⚠️ '+acCost+' AC requis':'Ressources insuffisantes';btn.style.display='block';}
  else{btn.className='td-buy can';btn.textContent='⚡ Acheter ('+acCost+' AC)';btn.style.display='block';}
  document.getElementById('tech-detail-modal').classList.remove('hidden');var _tdm=document.getElementById('tech-detail-modal');_tdm.scrollTop=0;var _tdc=document.getElementById('td-card');if(_tdc)_tdc.scrollTop=0;requestAnimationFrame(function(){_tdm.scrollTop=0;if(_tdc)_tdc.scrollTop=0;});
}
let _detailIsGeneral=false;
let _detailIsMarket=false;
function doBuyFromDetail(){
  if(!_techDetailId)return;
  const id=_techDetailId;
  const isGen=_detailIsGeneral;
  const isMkt=_detailIsMarket;
  document.getElementById('tech-detail-modal').classList.add('hidden');
  _techDetailId=null;_detailIsGeneral=false;_detailIsMarket=false;
  if(isMkt)buyMarket(id);
  else if(isGen)buyGeneral(id);
  else buyTech(id);
}
function closeTechDetail(){
  document.getElementById('tech-detail-modal').classList.add('hidden');
  _techDetailId=null;_detailIsGeneral=false;_detailIsMarket=false;
}
function showGeneralDetail(cardId){
  const card=CARDS_POOL.find(c=>c.id===cardId)
    ||(G.civRiver||[]).find(c=>c&&c.id===cardId)
    ||(G.milRiver||[]).find(c=>c&&c.id===cardId)
    ||(G.generalRiver||[]).find(c=>c&&c.id===cardId);
  if(!card)return;
  _techDetailId=cardId;_detailIsGeneral=true;
  const _milThisTurn=card.type==='militaire'&&G.player._milBoughtThisTurn&&G.player._milBoughtThisTurn.has(cardId);
  const taken=_milThisTurn||(card.repeatable?false:G.techTaken.has(cardId));
  const cost=getEffCost(card,G.player);
  const _acN=card.ac||1;const _reqOk=!card.reqCard||G.player.cards.some(c=>c.id===card.reqCard);
  const canBuy=!taken&&_reqOk&&G.phase==='actions'&&G.player.acLeft>=_acN&&Object.entries(cost).every(([r,a])=>(G.player.res[r]||0)>=a);
  const typeColor=couleurCarte(card);
  document.getElementById('td-card').style.borderTop=`4px solid ${typeColor}`;
  const artEl2=document.getElementById('td-art');
  if(CARD_ART.has(cardId)){artEl2.style.background=`#0a0a18 url('assets/cards/${cardId}.png') center/cover no-repeat`;artEl2.style.height='230px';}
  else{artEl2.style.background=typeColor+'22';artEl2.style.height='';}
  const genLabel=card.type==='militaire'?'Militaire':'Général';
  artEl2.innerHTML=`<span class="td-tier-badge" id="td-tier">${genLabel}</span>${CARD_ART.has(cardId)?'':`<span id="td-emoji">${card.emoji}</span>`}<span class="td-taken-badge hidden" id="td-taken"></span>`;
  document.getElementById('td-name').textContent=card.name;
  document.getElementById('td-branch').textContent=card.type||'';
  document.getElementById('td-effect').innerHTML=card.effect;
  const costRow=document.getElementById('td-cost');
  if(taken){costRow.innerHTML='<span style="color:#7880a0">'+(_milThisTurn?'Déjà achetée ce tour (1×/tour)':'Déjà achetée')+'</span>';}
  else{costRow.innerHTML='<span class="res-tag energy">'+_acN+' AC</span> '+costHtml(cost)+(card.reqCard&&!_reqOk?' <span style="color:#cc7744">🔒 '+(CARDS_POOL.find(c=>c.id===card.reqCard)?.name||'tech requise')+'</span>':'')+(card.vp?` <span style="color:#ffd700;margin-left:4px">+${card.vp} VP</span>`:'');}
  const btn=document.getElementById('td-buy-btn');
  if(taken){btn.style.display='none';}
  else if(G.phase!=='actions'){btn.className='td-buy cannot';btn.textContent='Pas disponible hors phase actions';btn.style.display='block';}
  else if(!_reqOk){btn.className='td-buy cannot';btn.textContent='Tech requise : '+(CARDS_POOL.find(c=>c.id===card.reqCard)?.name||'?');btn.style.display='block';}
  else if(!canBuy){btn.className='td-buy cannot';btn.textContent='Ressources / AC insuffisants';btn.style.display='block';}
  else{btn.className='td-buy can';btn.textContent='⚡ Acheter ('+_acN+' AC)';btn.style.display='block';}
  document.getElementById('tech-detail-modal').classList.remove('hidden');var _tdm=document.getElementById('tech-detail-modal');_tdm.scrollTop=0;var _tdc=document.getElementById('td-card');if(_tdc)_tdc.scrollTop=0;requestAnimationFrame(function(){_tdm.scrollTop=0;if(_tdc)_tdc.scrollTop=0;});
}
/* ============================================================ EVENT ANNOUNCE (début de tour) ============================================================ */
function showEventAnnounce(ev,onDone){
  // `onDone` est un NOM de suite (voir @flux) : rangé dans G, il survit à une sauvegarde.
  fluxDonnees().suiteAnnonce=(typeof onDone==='string'&&onDone)?onDone:null;
  if(_decisionActive()){ // mode serveur : annonce à tous, puis continue
    _emitNotice('event_announce', null, {event:{id:ev.id,name:ev.name,emoji:ev.emoji,type:ev.type,preview:ev.preview||''}}, 'stAnnonceLue');
    return;
  }
  const typeColors={competition:'#cc4444',menace:'#cc8844',opportunite:'#44cc88'};
  const typeLabels={competition:'⚔️ Compétition',menace:'⚠️ Menace',opportunite:'✨ Opportunité'};
  document.getElementById('ea-emoji').textContent=ev.emoji;
  document.getElementById('ea-name').textContent=ev.name;
  document.getElementById('ea-desc').innerHTML=`<span style="color:${typeColors[ev.type]||'#aaa'}">${typeLabels[ev.type]||''}</span><br>${ev.preview||''}`;
  const el=document.getElementById('event-announce-modal');
  el.style.borderColor=typeColors[ev.type]||'#5a1a7a';
  el.classList.remove('hidden');
  el.querySelector('.ea-card').style.borderColor=typeColors[ev.type]||'#5a1a7a';
  _eventAnnounceCb=onDone||null;
}
let _eventAnnounceCb=null;
function dismissEventAnnounce(){
  document.getElementById('event-announce-modal').classList.add('hidden');
  if(_eventAnnounceCb){const cb=_eventAnnounceCb;_eventAnnounceCb=null;cb();}
}
/* ============================================================ DEBUG / NOTE SYSTEM ============================================================ */
function showDebugModal(){
  document.getElementById('debug-turn-label').textContent=G.turn+'/'+G.maxTurns+' ('+({actions:'Actions',ai:'IA joue',over:'Terminé'}[G.phase]||G.phase)+')';
  document.getElementById('debug-note-input').value='';
  document.getElementById('debug-export-area').style.display='none';
  document.getElementById('debug-modal').classList.remove('hidden');
}
function closeDebugModal(){document.getElementById('debug-modal').classList.add('hidden');}
function saveDebugNote(){
  const txt=document.getElementById('debug-note-input').value.trim();
  if(!txt)return;
  const snap={turn:G.turn,phase:G.phase,note:txt,
    player:{acLeft:G.player.acLeft,acMax:G.player.acMax,gov_level:G.player.gov_level,gov_pts:G.player.gov_pts,
      res:{...G.player.res},forceTokens:G.player.forceTokens,
      cards:G.player.cards.map(c=>c.name),colonies:G.player.colonies.map(c=>c.nodeId+'Nv'+c.level),
      routes:G.player.routes.map(r=>r.from+'→'+r.to)},
    recentLog:G.log.slice(0,8).map(e=>e.msg)};
  if(!G.debugNotes)G.debugNotes=[];
  G.debugNotes.push(snap);
  addLog('📝 Note enregistrée (T'+G.turn+')','gold');
  closeDebugModal();
}
function exportDebugLog(){
  if(!G.debugNotes)G.debugNotes=[];
  let out='=== SOLAR — LOG D\'ANALYSE ===\n';
  out+='Partie : '+G.player.civ.name+' vs '+G.ais.map(a=>a.civ.name).join(', ')+'\n';
  out+='Agendas : '+G.agendas.map(a=>a.name).join(' / ')+'\n\n';
  if(G.debugNotes.length){
    out+='--- QUESTIONS / REMARQUES ---\n';
    for(const n of G.debugNotes){
      out+=`\n[Tour ${n.turn} — ${n.phase}] ❓ ${n.note}\n`;
      out+=`  AC: ${n.player.acLeft}/${n.player.acMax} | Gov Nv${n.player.gov_level} (${n.player.gov_pts}pts)\n`;
      out+=`  Res: <i class=ri-energy></i>${n.player.res.energy||0} <i class=ri-materials></i>${n.player.res.materials||0} <i class=ri-science></i>${n.player.res.science||0} <i class=ri-morale></i>${n.player.res.morale||0}\n`;
      out+=`  Force: ${n.player.forceTokens} jetons\n`;
      out+=`  Cartes: ${n.player.cards.join(', ')||'aucune'}\n`;
      out+=`  Colonies: ${n.player.colonies.join(', ')||'aucune'}\n`;
      out+=`  Routes: ${n.player.routes.join(', ')||'aucune'}\n`;
      out+=`  Log récent:\n${n.recentLog.map(l=>'    '+l).join('\n')}\n`;
    }
    out+='\n';
  }
  out+='--- RAPPORT DÉTAILLÉ ---\n';
  out+=buildJournalReport();
  document.getElementById('debug-export-text').value=out;
  try{const pv=document.getElementById('debug-export-preview');if(pv)pv.innerHTML=buildJournalReportHTML();}catch(e){}
  document.getElementById('debug-export-area').style.display='block';
  document.getElementById('debug-modal').classList.remove('hidden');
  document.getElementById('debug-turn-label').textContent=G.turn+'/'+G.maxTurns;
  setTimeout(()=>{const ta=document.getElementById('debug-export-text');ta.select();},100);
}
/* ============================================================ ATTACK MODE ============================================================ */
let _attackTargetNode=null;
function showAttackModal(nodeId){
  const node=NODES[nodeId];if(!node)return;
  _attackTargetNode=nodeId;
  const homeId=G.player.civ.home;
  const playerNodes=G.player.colonies.map(c=>c.nodeId);
  let minDist=99;
  for(const colId of playerNodes){const d=getNodeDistance(colId,nodeId);if(d<minDist)minDist=d;}
  const travelCost=1+Math.max(0,minDist-1);
  const maxTokens=G.player.forceTokens;
  document.getElementById('atk-sub').textContent='Cible : '+node.emoji+' '+node.name;
  document.getElementById('atk-info').innerHTML=
    `Distance depuis ta colonie la plus proche : <strong>${minDist} nœud(s)</strong><br>`+
    `Coût de trajet : <strong>${travelCost} jeton(s)</strong> — minimum à envoyer<br>`+
    `Force effective = jetons envoyés − ${travelCost}`;
  const slider=document.getElementById('atk-slider');
  slider.min=travelCost;slider.max=Math.max(travelCost,maxTokens);slider.value=travelCost;
  document.getElementById('atk-modal').classList.remove('hidden');
  updateAtkSlider();
}
function updateAtkSlider(){
  const slider=document.getElementById('atk-slider');
  const sent=parseInt(slider.value);
  const info=document.getElementById('atk-info').innerHTML;
  const travelCost=parseInt(slider.min);
  const eff=sent-travelCost;
  document.getElementById('atk-slider-val').textContent=sent;
  const _affA=(G.player.res.materials||0)>=sent&&(G.player.res.energy||0)>=sent;
  document.getElementById('atk-power').innerHTML=
    `Force effective : <strong style="color:${eff>0?'#ff8080':'#7880a0'}">${eff}</strong>`+
    (eff<=0?' — <span style="color:#ff6060">Insuffisant pour attaquer</span>':'')+
    '<br><span style="color:'+(_affA?'#ffaa66':'#ff5555')+';font-weight:700">Coût combat : −'+sent+'<i class=ri-materials></i> −'+sent+'<i class=ri-energy></i></span>'+(_affA?'':' <span style="color:#ff5555">— ressources insuffisantes</span>');
  document.getElementById('atk-confirm-btn').disabled=(eff<=0||sent>G.player.forceTokens||!_affA);
}
function confirmAttack(){
  if(!_attackTargetNode)return;
  const node=NODES[_attackTargetNode];
  const slider=document.getElementById('atk-slider');
  const sent=parseInt(slider.value);
  const travelCost=parseInt(slider.min);
  const effAtk=sent-travelCost;
  if(sent>G.player.forceTokens){addLog('⚠️ Pas assez de jetons Force.','red');cancelAttack();return;}
  if(G.player.acLeft<1){addLog('⚠️ Attaque : besoin 1 AC.','red');cancelAttack();return;}
  if((G.player.res.materials||0)<sent||(G.player.res.energy||0)<sent){addLog('⚠️ Attaque : besoin '+sent+'<i class=ri-materials></i> +'+sent+'<i class=ri-energy></i> (coût combat, 1<i class=ri-materials></i>+1<i class=ri-energy></i> par jeton).','red');cancelAttack();return;}
  cancelAttack();
  undoStack=[];
  G.player.acLeft-=1;G.player.forceTokens-=sent;
  G.player.res.materials-=sent;G.player.res.energy-=sent;
  addLog('⚔️ Coût combat : −'+sent+'<i class=ri-materials></i> −'+sent+'<i class=ri-energy></i> ('+sent+' jeton(s) envoyé(s))','dim');
  G.player.forceCooldown.push({count:sent,returnTurn:getCooldownTurn(G.player)});
  G.player.spentThisTurn+=1+sent;
  // Défense IA DÉTERMINISTE (plus d'aléatoire) : garnison de base (1) + ce que l'IA peut PAYER (1🪨+1⚡/jeton).
  /* ⚠️ CHEMIN SOLO — MÊME RÈGLE QUE LE SERVEUR. Il calculait ici sa propre défense
     (`min(jetons, matériaux, énergie)`), donc solo et en ligne divergeaient sur le même combat.
     `defenseIA` est désormais la SEULE définition ; les jetons engagés et ceux payés sont le même
     nombre, ce qui n'était pas garanti avant. */
  const atkAi=G.ais.find(ai=>ai.colonies.find(c=>c.nodeId===_attackTargetNode))||G.ais[0];
  const aiAfford=atkAi?((typeof defenseIA==='function')?defenseIA(atkAi,G.player,_attackTargetNode)
                                                      :Math.max(0,Math.min(atkAi.forceTokens||0,atkAi.res.materials||0,atkAi.res.energy||0))):0;
  const aiDef=1/*garnison de base*/+aiAfford;
  if(atkAi&&aiAfford>0&&typeof applyCombatEngage==='function')applyCombatEngage(atkAi,aiAfford,effAtk<=aiDef); // l'IA paie sa défense engagée
  let resultMsg='';let resultCls='';
  if(effAtk>aiDef){
    // VICTOIRE — CAPTURE de la colonie (elle change de propriétaire), PAS une simple destruction (bug : en ligne
    // le serveur passait par ici et « détruisait » sans te donner la colonie → tes captures ne tenaient jamais).
    const col=atkAi?atkAi.colonies.find(c=>c.nodeId===_attackTargetNode||c.nodeId===node.id):null;
    if(col&&atkAi){
      const newLvl=Math.max(1,(col.level||1)-1);
      atkAi.colonies=atkAi.colonies.filter(c=>c.nodeId!==col.nodeId);
      atkAi.forceTokens=Math.max(0,(atkAi.forceTokens||0)-1); // jeton de garnison détruit dans la défense
      atkAi.res.morale=Math.max(0,(atkAi.res.morale||0)-1);
      updateConnections(atkAi);
      const connP=(typeof checkConnected==='function')?checkConnected(col.nodeId,G.player):true;
      if(!G.player.colonies.some(c=>c.nodeId===col.nodeId))G.player.colonies.push({nodeId:col.nodeId,level:newLvl,connected:connP,_conquest:3});
      updateConnections(G.player);
      gagnerVP(G.player,2,'Colonie capturée : '+node.name);
      resultMsg='🏴 Victoire ! Tu CAPTURES '+node.name+' (Nv.'+newLvl+') — elle est à toi ! (+2 VP)';resultCls='gold';
      addLog('🏴 '+node.name+' CAPTURÉE sur '+atkAi.civ.emoji+' '+atkAi.civ.name+' ! (Nv.'+newLvl+', '+effAtk+'⚔️ vs '+aiDef+'🛡️)','gold');
    }
    else{resultMsg='✅ Victoire ! Zone sécurisée.';resultCls='gold';}
    G.warRisk=Math.min(10,G.warRisk+5);
  } else if(aiDef===effAtk){
    resultMsg='🛡️ Attaque repoussée — égalité ('+effAtk+' vs '+aiDef+').';resultCls='red';
    addLog('⚔️ Attaque sur '+node.name+' repoussée.','red');
  } else if(aiDef===effAtk+1){
    G.player.forceTokens=Math.max(0,G.player.forceTokens-1);
    resultMsg='💥 Contre-attaque ! Tu perds 1 jeton Force ('+effAtk+' vs '+aiDef+').';resultCls='red';
    addLog('⚔️ Contre-attaque — −1 jeton.','red');
  } else {
    G.player.forceTokens=Math.max(0,G.player.forceTokens-2);
    resultMsg='💥 Contre-attaque puissante ! Tu perds 2 jetons Force ('+effAtk+' vs '+aiDef+').';resultCls='red';
    addLog('⚔️ Contre-attaque forte — −2 jetons.','red');
  }
  G.warRisk=Math.min(15,G.warRisk+3);
  if(G.warRisk>=12&&!G.warState)declareWar('Attaque sur '+node.name+'!');
  addAction('⚔️','Attaque '+node.name,1,{},'Force eff. '+effAtk+' vs '+aiDef);
  showWarModal('⚔️ Résultat de l\'attaque',resultMsg,{txt:resultMsg,cls:effAtk>aiDef?'win':'loss'});
  _warSuite('stRendre');
  mode=null;setHint('');render();
}
function cancelAttack(){
  document.getElementById('attack-modal').classList.add('hidden');
  _attackTargetNode=null;
}
function toggleLog(){
  const content=document.getElementById('log-content');const arr=document.getElementById('log-arr');
  content.classList.toggle('open');arr.textContent=content.classList.contains('open')?'▼':'▶';
}
function _logColorNations(s){
  if(!G||!G.player||!s)return s;
  for(const p of [G.player,...(G.ais||[])]){const c=p.civ;if(!c||!c.name)continue;
    s=s.split(c.name).join('<span style="color:'+c.color+';font-weight:600">'+c.name+'</span>');}
  return s;
}
function renderLogLegend(){
  const el=document.getElementById('log-legend');if(!el||!G||!G.player)return;
  el.innerHTML='<span style="color:#7880a0">Légende —</span> '+[G.player,...(G.ais||[])].map(p=>'<span style="color:'+p.civ.color+';font-weight:700;margin-right:9px;white-space:nowrap">'+p.civ.emoji+' '+p.civ.name+(p===G.player?' (toi)':'')+'</span>').join('');
}
/* ═════════ QUI A ÉCRIT CETTE LIGNE ? (Marc, 2026-08-09) ═════════
   « change le log pour que chaque action de chaque joueur puisse être identifiée pour que ce
   soit possible de rejouer le jeu à partir du journal. »

   LE PROBLÈME. Le journal était un RÉCIT écrit du point de vue de la nation active : les autres
   étaient nommées (« 🎯 ☠️ Ceinturiens — Stratégie… »), la nation active ne l'était pas
   (« 🏗️ Colonie sur Cérès »). Comme le serveur bascule `G.player` d'une nation à l'autre, rien
   ne permettait, en relisant, de savoir QUI avait colonisé quoi. C'est ce qui m'a empêché de
   rejouer la partie CC36 : j'aurais dû deviner l'auteur de la moitié des lignes.

   LA CORRECTION. Chaque entrée du journal porte désormais l'IDENTIFIANT de la nation qui l'a
   produite (`civ`) et le tour (`turn`). C'est une DONNÉE, pas une tournure de phrase : elle ne
   dépend d'aucun point de vue et survit à la sérialisation.

   D'OÙ VIENT L'AUTEUR :
     · `_auteurLog`, posé explicitement autour d'un bloc dont on sait à qui il appartient
       (le tour d'une IA, une boucle d'entretien nation par nation) ;
     · à défaut, `G.player` — la nation agissante, puisque le pilote l'active avant d'appliquer son
       action.
   ⚠️ MAIS CE DÉFAUT NE VAUT RIEN POUR LES LIGNES QUI N'APPARTIENNENT À PERSONNE. Le draft
   Stratégie, l'ordre d'initiative, la résolution d'un événement : ce sont des faits de PARTIE, pas
   d'une nation. Le pilote réassigne `G.player` à chaque siège activé (`driver.activate`), si bien
   que ces lignes se retrouvaient signées par le dernier joueur ayant agi — partie 8B47, elles sont
   attribuées aux Terriens jusqu'au tour 7 puis aux Ceinturiens à partir du tour 8, sans qu'aucune
   règle n'ait changé. C'est la maladie de fond du projet : la perspective lue dans une globale.
   `startTurn` et `runEndOfRound` déclarent donc explicitement un auteur NUL — rendu « Système ».
   ⚠️ `_auteurLog` est volontairement une variable de PORTÉE, pas un champ de `G` : elle ne vaut
   que le temps d'un appel et `logAuteur` la restaure dans un `finally`. Rien à sauvegarder. */
let _auteurLog=null;
function logAuteur(qui, fn){
  const av=_auteurLog;
  _auteurLog=(qui&&qui.civ&&qui.civ.id)?qui.civ.id:(typeof qui==='string'?qui:null);
  try{ return fn(); } finally { _auteurLog=av; }
}
function _logCivCourante(){
  if(_auteurLog!==null) return _auteurLog;
  try{ return (G&&G.player&&G.player.civ)?G.player.civ.id:null; }catch(e){ return null; }
}
/* Le préfixe « T3 Martiens │ », dans la couleur de la nation. Rendu SEULEMENT ici : le message
   lui-même reste inchangé, pour que les rapports texte et les toasts ne s'en trouvent pas alourdis. */
function _logPrefixe(e){
  if(!e||typeof e!=='object')return '';
  let nom='Système',coul='#8faacc';
  try{
    for(const p of [G.player].concat(G.ais||[])){
      if(p&&p.civ&&p.civ.id===e.civ){ nom=p.civ.name; coul=p.civ.color; break; }
    }
  }catch(err){}
  const t=(e.turn!==undefined&&e.turn!==null)?('T'+e.turn+' '):'';
  return '<span style="opacity:.65;font-size:.85em">'+t+'</span>'
       + '<span style="color:'+coul+';font-weight:700;font-size:.85em">'+nom+'</span>'
       + '<span style="opacity:.45"> │ </span>';
}
function addLog(msg,cls=''){
  /* Pendant une simulation de l'IA, le moteur joue des coups qui n'auront pas lieu : les journaliser
     raconterait au joueur une partie imaginaire. Voir `simulerCoup`. */
  if(G&&G._simulationIA)return;
  if(G)G._lastProgress=Date.now(); // battement de cœur pour le chien de garde anti-blocage
  /* ⚠️ LE JOURNAL N'EST PLUS TRONQUÉ (Marc, 2026-08-08 : « le journal doit être entier »).
     Il gardait 80 lignes et jetait les plus anciennes : une partie de dix tours n'en conservait donc
     que les deux derniers. Impossible de refaire un calcul depuis le début, ni de retrouver l'origine
     d'un écart de jetons — c'est exactement ce qui m'a empêché d'analyser sa partie.
     Une partie est bornée à dix tours : le journal l'est donc aussi, quelques centaines de lignes.
     Rien ne justifiait ce plafond. */
  /* `civ` = QUI, `turn` = QUAND. Les deux sont indispensables pour rejouer une partie depuis le
     journal ; les ajouter ici plutôt qu'aux ~600 appels d'`addLog` garantit qu'aucune ligne n'y
     échappe — y compris celles qu'on écrira demain. */
  G.log.unshift({msg,cls,civ:_logCivCourante(),turn:(G&&G.turn)||0});
  const el=document.getElementById('log-content');
  /* Chaque ligne affiche discrètement son tour et sa nation. Le journal en jeu devient lisible
     comme un compte rendu de partie : « T3 Martiens │ … ». Même information que dans /debug et
     dans le rapport copié — un seul format, trois endroits. */
  if(el)el.innerHTML=G.log.map(e=>`<div class="log-e ${e.cls}">${_logPrefixe(e)}${_logColorNations(e.msg)}</div>`).join('');
}
// Peut-on encore jouer une action ce tour ? (utilisé pour détecter un blocage « plus de ressources »)
function _scCanPlayerAct(){
  const p=(typeof G!=='undefined')&&G&&G.player; if(!p||!p.civ) return true;
  if((p.acLeft||0)<=0) return true;                              // 0 AC → l'auto-passage gère (pas « bloqué »)
  const r=p.res||{};
  if((r.materials||0)>0 || (r.energy||0)>0 || (r.science||0)>0) return true; // il reste des ressources → peut agir
  // Plus AUCUNE ressource : reste-t-il une action GRATUITE (sans coût en ressources) ?
  // a) capacité gratuite non utilisée et jouable sans ressources (ex. Ceinturien : Commerce avec les pirates)
  if(!p.abilityUsed && p.civ.active){
    const ab=p.civ.active; let costOk=(p.acLeft||0)>=(ab.ac||0);
    if(costOk)for(const k in (ab.cost||{})){ if((r[k]||0) < ab.cost[k]){ costOk=false; break; } }
    if(costOk){
      if(p.civ.id==='jupiteriens'){ if((p.colonies||[]).some(c=>['io','europe','ganymede','callisto'].includes(c.nodeId)&&c.level===1&&c.connected)) return true; }
      else return true;
    }
  }
  // b) raid possible (coûte des jetons Force, pas de ressources)
  const tokCost = (p.civ.id==='ceinturiens')?1:2;
  if((p.acLeft||0)>=1 && (p.forceTokens||0)>=tokCost && G.ais && G.ais.length>0) return true;
  return false;                                                  // vraiment rien à faire ce tour
}
function _scMaybeStuck(){ // à appeler quand c'est le tour du joueur
  try{
    if(!G||G.phase!=='actions'||!G.player)return;
    if(typeof _scTutorialActive==='function'&&_scTutorialActive())return; // le coach mène le rythme
    if(_scConfirmArmed || G._scStuckShown)return;
    if(typeof _scAbilityReminderOpen==='function'&&_scAbilityReminderOpen())return;
    if(!_scCanPlayerAct()){ G._scStuckShown=true; _scShowStuckModal(); }
  }catch(e){}
}
// Chien de garde anti-blocage : si la partie devrait avancer seule (tour d'IA / fin de tour) mais reste figée
// (aucune fenêtre ouverte, aucune décision en attente, rien depuis ~8 s), on relance la continuation en attente.
function _scAnyModalOpen(){
  if(typeof document==='undefined')return false;
  const ids=['eot-modal','strategy-modal','agenda-sel-modal','invest-modal','invest2-modal','invest-active-modal','event-modal','event-announce-modal','dyson-modal','espionage-modal','empath-copy-modal','war-modal','war-combat-modal','attack-modal','discovery-modal','peace-modal','forced-war-modal','route-token-modal','forge-modal','accord-modal','sc-stuck-modal','sc-ability-reminder','sc-attack-notice'];
  for(const id of ids){ const el=document.getElementById(id); if(el && !el.classList.contains('hidden') && el.style.display!=='none') return true; }
  if(document.getElementById('aad-overlay')||document.getElementById('calm-overlay')) return true;
  return false;
}
function _scWatchdogRecover(){
  try{
    if(G._assaultThenSuite){ const nom=G._assaultThenSuite; G._assaultThenSuite=null; fluxAppeler(nom,'WAR'); return; }
    if(_guerrePopEnAttente()){ _guerrePopSuiteJouer(); return; }
    if(_warSuiteEnAttente()){ _warSuiteJouer(); return; }
    G._ilPaused=false; if(typeof interleaveStep==='function') interleaveStep();
  }catch(e){ try{ G._ilPaused=false; if(typeof interleaveStep==='function') interleaveStep(); }catch(_e){} }
}
function _scWatchdogTick(){
  try{
    if(typeof G==='undefined'||!G||!G._il) return;
    if(G.phase==='over'||G.phase==='setup'||G.phase==='lobby') return;
    if(G._humanActive) return;        // ton tour interactif → attente légitime
    if(G._pending) return;            // décision serveur en attente
    if(_scAnyModalOpen()) return;     // une fenêtre attend une décision → attente légitime
    const now=Date.now(); if(!G._lastProgress) G._lastProgress=now;
    if(now - G._lastProgress > 8000){ G._lastProgress=now; _scWatchdogRecover(); }
  }catch(e){}
}
if(typeof window!=='undefined' && typeof document!=='undefined' && document.getElementById) setInterval(_scWatchdogTick, 2500);
function _scShowStuckModal(){
  if(typeof document==='undefined'||!document.body||document.getElementById('sc-stuck-modal'))return;
  if(typeof _scTutorialActive==='function'&&_scTutorialActive())return; // jamais par-dessus le tutoriel
  /* Le texte doit dire la VÉRITÉ : le chien de garde se déclenche aussi sur une simple inactivité,
     où le joueur a très bien pu garder des ressources. On ne parle de pénurie que si elle est avérée. */
  const _penurie=(typeof _scCanPlayerAct==='function')?!_scCanPlayerAct():true;
  const _txt=_penurie
    ? "Tu n'as plus assez de ressources pour jouer une action ce tour. Que veux-tu faire ?"
    : "Rien ne s'est passé depuis un moment. Si tu réfléchis encore, ferme simplement cette fenêtre.";
  document.body.insertAdjacentHTML('beforeend',
    '<div id="sc-stuck-modal" style="position:fixed;inset:0;background:rgba(4,4,18,.88);z-index:640;display:flex;align-items:center;justify-content:center;padding:16px">'+
      '<div style="background:#0f0f2a;border:2px solid #c85050;border-radius:14px;padding:22px;max-width:420px;text-align:center">'+
        '<div style="font-size:1.05em;font-weight:700;color:#ffd0d0;margin-bottom:10px">⚠️ Tu sembles bloqué</div>'+
        '<div style="font-size:.9em;color:#c8d8f8;margin-bottom:18px;line-height:1.5">'+_txt+'</div>'+
        '<div style="display:flex;flex-direction:column;gap:9px">'+
          '<button onclick="_scStuckPass()" style="padding:11px;background:#16401a;border:1px solid #2f6b34;color:#9ad89a;border-radius:9px;font-weight:700;cursor:pointer;font-size:.95em">⏭ Passer mes actions et finir le tour</button>'+
          '<button onclick="_scStuckRestart()" style="padding:11px;background:#4a1010;border:1px solid #c85050;color:#ffd0d0;border-radius:9px;font-weight:700;cursor:pointer;font-size:.95em">↺ Recommencer la partie du début</button>'+
          '<button onclick="_scStuckDismiss()" style="padding:8px;background:#14182e;border:1px solid #3a3a5a;color:#9898b8;border-radius:9px;cursor:pointer;font-size:.85em">Fermer (continuer à essayer)</button>'+
        '</div>'+
      '</div></div>');
}
function _scCloseStuck(){const e=document.getElementById('sc-stuck-modal');if(e)e.remove();}
function _scStuckPass(){_scCloseStuck();if(G)G._scStuckShown=false;if(typeof endTurn==='function')endTurn();}
function _scStuckRestart(){_scCloseStuck();if(typeof scAbandonGame==='function')scAbandonGame();else location.reload();}
function _scStuckDismiss(){_scCloseStuck();if(G){G._scStuckTries=0;G._scStuckShown=false;}}
/* ── Attaques SUR TOI : popup à valider en mode interlacé (pour ne pas que ça défile trop vite) ──
   Une autre nation t'attaque (assaut de colonie, destruction de route, raid) → on met en file
   une notification ; l'interlacé se met en pause et affiche un popup ✓ Continuer. Les actions des
   autres nations qui NE te concernent PAS continuent de défiler normalement. */
// ANNONCE « TU AS ÉTÉ ATTAQUÉ » — adressée à la NATION VICTIME, quelle qu'elle soit.
// Fonctionne dans les TROIS modes : solo (modale locale accumulée), et en ligne (notice BLOQUANTE routée
// vers le joueur concerné, humain local ou distant). Une IA n'affiche rien : l'info reste dans le journal.
// C'est la raison pour laquelle les raids subis n'étaient pas annoncés : _notePlayerHit sortait si !G._il
// (donc toujours en mode serveur) et ne regardait que G.player, qui tourne d'une nation à l'autre.
function notifyNationHit(victim,title,body){
  try{
    if(!victim)return;
    if(victim._isAI)return;                       // IA : pas de fenêtre, tout est déjà journalisé
    if(typeof _decisionActive==='function'&&_decisionActive()){
      _emitNotice('raid_hit', victim, {title:title||'Attaque', body:body||''}, 'stRien');   // suite nommée : une fermeture ne survit pas à une sauvegarde
      return;
    }
    _notePlayerHit(title,body);                   // solo / local : comportement d'origine
  }catch(e){}
}
function _notePlayerHit(title,body){
  try{
    if(!G||!G._il)return;                    // seulement en mode interlacé (partie en direct)
    if(G.player&&G.player._remoteHuman)return; // ce client n'est pas le joueur concerné
    if(!G._ilPlayerHits)G._ilPlayerHits=[];
    G._ilPlayerHits.push({title:title||'Attaque',body:body||''});
  }catch(e){}
}
function _showPlayerHitModal(){
  if(typeof document==='undefined'||!document.body)return;
  const hits=(G&&G._ilPlayerHits)||[];
  if(!hits.length){return;}
  const old=document.getElementById('sc-attack-notice');if(old)old.remove();
  const rows=hits.map(h=>'<div style="background:#1a0e12;border:1px solid #7a2a2a;border-radius:9px;padding:10px 12px;margin-bottom:8px;text-align:left">'+
      '<div style="font-weight:700;color:#ffb3a3;margin-bottom:3px">⚔️ '+h.title+'</div>'+
      (h.body?'<div style="font-size:.88em;color:#e6d0d0;line-height:1.45">'+h.body+'</div>':'')+
    '</div>').join('');
  document.body.insertAdjacentHTML('beforeend',
    '<div id="sc-attack-notice" style="position:fixed;inset:0;background:rgba(4,4,18,.86);z-index:650;display:flex;align-items:center;justify-content:center;padding:16px">'+
      '<div style="background:#0f0f2a;border:2px solid #c85050;border-radius:14px;padding:20px;max-width:440px;width:100%">'+
        '<div style="font-size:1.02em;font-weight:800;color:#ffd0d0;margin-bottom:12px;text-align:center">🚨 On t\'attaque !</div>'+
        rows+
        '<button onclick="_ackPlayerHits()" style="margin-top:6px;width:100%;padding:12px;background:#16401a;border:1px solid #2f6b34;color:#bff3cf;border-radius:9px;font-weight:800;cursor:pointer;font-size:1em">✓ Continuer</button>'+
      '</div></div>');
}
function _ackPlayerHits(){
  const e=document.getElementById('sc-attack-notice');if(e)e.remove();
  if(G)G._ilPlayerHits=[];
  if(G&&G._il){ G._ilPaused=false; if(typeof interleaveStep==='function') setTimeout(interleaveStep,40); }
}
/* ============================================================ SVG SETUP ============================================================ */
function drawStars(){const el=document.getElementById('stars');if(el)el.innerHTML='';/* étoiles décoratives retirées : le fond image fournit les étoiles */}
function drawConnections(){
  let s='';
  // Lueur du Soleil (venant de la gauche)
  s+=`<defs><radialGradient id="mapSun" cx="0%" cy="52%" r="80%"><stop offset="0%" stop-color="#fff2c8" stop-opacity=".85"/><stop offset="9%" stop-color="#ffd98a" stop-opacity=".65"/><stop offset="24%" stop-color="#ff9d3c" stop-opacity=".26"/><stop offset="55%" stop-color="#ff6a1e" stop-opacity="0"/></radialGradient></defs>`;
  s+=`<rect x="0" y="150" width="1100" height="540" fill="url(#mapSun)"/>`;
  s+=`<circle cx="-10" cy="420" r="70" fill="#fff1c4" opacity=".85"/>`;
  // Ceinture d'astéroïdes (Mars–Jupiter)
  s+=`<rect x="600" y="175" width="255" height="420" rx="14" fill="#c2a86e" fill-opacity=".05" stroke="#c2a86e" stroke-opacity=".22" stroke-width="1" stroke-dasharray="3,8"/>`;
  s+=`<text x="728" y="300" text-anchor="middle" font-size="13" font-weight="700" fill="#c2a86e" fill-opacity=".9">☄️ Ceinture d'astéroïdes</text>`;
  // Ceinture de Kuiper (externe)
  s+=`<rect x="1500" y="115" width="390" height="210" rx="14" fill="#8fbcd6" fill-opacity=".05" stroke="#8fbcd6" stroke-opacity=".22" stroke-width="1" stroke-dasharray="3,8"/>`;
  s+=`<text x="1695" y="300" text-anchor="middle" font-size="13" font-weight="700" fill="#8fbcd6" fill-opacity=".9">❄️ Ceinture de Kuiper</text>`;
  for(const p of PLANETS_DECO){const pr=p.ir||p.r;
    if(p.img)s+=`<image href="assets/map/${p.img}.png" x="${p.x-pr}" y="${p.y-pr}" width="${pr*2}" height="${pr*2}" preserveAspectRatio="xMidYMid meet"/>`;
    else s+=`<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.color}" fill-opacity=".15" stroke="${p.color}" stroke-width="1" stroke-opacity=".35"/>`;
    s+=`<text x="${p.x}" y="${p.y+pr+12}" text-anchor="middle" font-size="11" font-weight="600" paint-order="stroke" stroke="#04060f" stroke-width="2.8" fill="#dce8ff" fill-opacity=".92">${p.name}</text>`;}
  // (anneaux de Saturne désormais inclus dans saturne.png)
  // Anneau orbital jovien (style sphère de Dyson) — cercle fin autour de Jupiter
  // Helpers durée / pastilles / courbe (Soleil à gauche → assistance gravitationnelle)
  const SUN={x:-40,y:420};
  const _days=(a,b)=>Math.round(Math.hypot(b.x-a.x,b.y-a.y)*0.26);
  // Durées de trajet FIXES réalistes (jours, échelle ×10). Clé = paire de nœuds triée.
  const DUR={'lune|phobos':55,'ceres|lune':58,'deimos|lune':52,'deimos|phobos':2,'ceres|phobos':24,
    'ceres|vesta':12,'ceres|io':55,'ceres|ganymede':58,'ganymede|vesta':52,
    'europe|io':3,'ganymede|io':4,'callisto|europe':4,'callisto|ganymede':4,
    'europe|titan':82,'ganymede|titan':80,'callisto|titan':78,
    'encelade|titan':6,'encelade|triton':150,'titan|triton':150,'pluto|titan':130,
    'pluto|triton':60,'eris|triton':90,'eris|pluto':45,'europe|pluto':170,
    'mars|terre':26,'jupiter|mars':70,'eris|jupiter':220};
  const _range=d=>{const lo=Math.max(1,Math.round(d*0.85)),hi=Math.round(d*1.2);return lo+'–'+hi+' j';};
  const _pill=(x,y,txt,gold)=>{const w=Math.max(34,txt.length*5.4);return `<g><rect x="${(x-w/2).toFixed(1)}" y="${y-8}" width="${w.toFixed(1)}" height="16" rx="8" fill="${gold?'#241f0e':'#0b1730'}" fill-opacity=".9" stroke="${gold?'#FFD54F':'#4a9eff'}" stroke-opacity=".65" stroke-width="1"/><text x="${x}" y="${y+3.5}" text-anchor="middle" font-size="8.5" font-weight="600" fill="${gold?'#ffe08a':'#a9c8ff'}">${txt}</text></g>`;};
  const _curve=(a,b)=>{const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;const side=((mx-SUN.x)*ny-(my-SUN.y)*nx)>=0?1:-1;const off=Math.min(len*0.18,90)*side;return{cx:mx+nx*off,cy:my+ny*off};};
  // Routes POSSIBLES (graphe du jeu) : lignes bleues + durée si le trajet est long (≥50 j)
  /* ROUTES QUI CONTOURNENT UNE PLANÈTE.
     ⚠️ Deux tracés passaient à travers le disque de Mars — Phobos↔Déimos à 14 px de son centre
     (rayon 29) et Lune↔Phobos à 13. Marc, 2026-08-14 : « fais des courbes pour […] éviter de
     passer sous la planète ». La valeur est la déviation perpendiculaire du point de contrôle, en
     pixels ; le signe choisit le côté. Chaque valeur a été retenue en MESURANT la distance de la
     courbe échantillonnée au disque, pas à l'œil :
        Phobos↔Déimos  +70 → Mars à 47 px (au lieu de 14)
        Lune↔Phobos    +70 → Mars à 35 px (au lieu de 13), et Terre reste à 64
     Toute autre liaison reste une droite : une carte pleine de courbes se lit moins bien. */
  const COURBE_ROUTE={'deimos|phobos':70,'lune|phobos':70};
  const _ctrl=(a,b,k)=>{const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;return{cx:mx-dy/len*k, cy:my+dx/len*k};};
  const drawn=new Set();
  for(const[id,node]of Object.entries(NODES)){for(const adj of node.conn){const key=[id,adj].sort().join('-');if(drawn.has(key))continue;drawn.add(key);const t=NODES[adj];if(node.type==='orbital_station'||t.type==='orbital_station')continue;
    const _k=COURBE_ROUTE[[id,adj].sort().join('|')];
    let _mid;
    if(_k){const c=_ctrl(node,t,_k);
      s+=`<path d="M ${node.x} ${node.y} Q ${c.cx.toFixed(1)} ${c.cy.toFixed(1)} ${t.x} ${t.y}" fill="none" stroke="#5a7fc0" stroke-width="1.5" stroke-opacity=".7" stroke-dasharray="6,4"/>`;
      _mid={x:0.25*node.x+0.5*c.cx+0.25*t.x, y:0.25*node.y+0.5*c.cy+0.25*t.y};   // point réel de la courbe, pour la pastille
    }else{
      s+=`<line x1="${node.x}" y1="${node.y}" x2="${t.x}" y2="${t.y}" stroke="#5a7fc0" stroke-width="1.5" stroke-opacity=".7" stroke-dasharray="6,4"/>`;
      _mid={x:node.x+(t.x-node.x)*0.65, y:node.y+(t.y-node.y)*0.65};
    }
    const d=DUR[[id,adj].sort().join('|')]??_days(node,t);
    if(d>=50){s+=_pill(_mid.x,_mid.y,_range(d),false);}
  }}
  /* ROUTES COMMERCIALES (purement visuelles) reliant les capitales : Terre → Mars → Jupiter → Éris.
     ⚠️ MASQUABLES depuis le 2026-08-14 (Marc : « crée un bouton sur la carte pour afficher ou
     cacher les distances […] sinon ça devient moins lisible »). Elles ne portent AUCUNE règle :
     ni route constructible, ni adjacence — seulement des durées de trajet. Les cacher ne change
     donc rien au jeu, et l'état est rangé dans `G` pour survivre à une sauvegarde. */
  const _pos=id=>NODES[id]||PLANETS_DECO.find(p=>p.name==={terre:'Terre',mars:'Mars',jupiter:'Jupiter'}[id]);
  if(G.mapDistances!==false)for(const[a,b] of [['terre','mars'],['mars','jupiter'],['jupiter','eris']]){const A=_pos(a),B=_pos(b);if(!A||!B)continue;const c=_curve(A,B);s+=`<path d="M ${A.x} ${A.y} Q ${c.cx.toFixed(1)} ${c.cy.toFixed(1)} ${B.x} ${B.y}" fill="none" stroke="#FFD54F" stroke-width="2.3" stroke-opacity=".5" stroke-dasharray="2,7" stroke-linecap="round"/>`;const px=0.25*A.x+0.5*c.cx+0.25*B.x,py=0.25*A.y+0.5*c.cy+0.25*B.y;s+=_pill(px,py,_range(DUR[[a,b].sort().join('|')]??_days(A,B)),true);}
  document.getElementById('connections').innerHTML=s;
}
/* Bascule des distances entre capitales (lignes jaunes). Rien de plus qu'un affichage. */
function toggleDistances(){
  G.mapDistances = (G.mapDistances===false);
  try{ const b=document.getElementById('mz-dist'); if(b){ b.classList.toggle('off', G.mapDistances===false); b.title = (G.mapDistances===false?'Afficher':'Masquer')+' les distances entre capitales'; } }catch(e){}
  if(typeof renderMap==='function')renderMap();
}
/* ============================================================ CIV SELECTION ============================================================ */
(function(){
  document.getElementById('civ-cards').innerHTML=Object.values(CIVS).map(civ=>{
    const tb=TECH_BRANCHES[civ.techBonus];
    return`<div class="civ-card" id="cc-${civ.id}" onclick="selectCiv('${civ.id}')">
      <div class="civ-emoji">${civ.emoji}</div><h3>${civ.name}</h3>
      <div class="civ-bar" style="background:${civ.color}"></div>
      ${[['<i class=ri-energy></i>','energy'],['<i class=ri-materials></i>','materials'],['<i class=ri-science></i>','science'],['<i class=ri-morale></i>','morale'],['⚔️ Force','startForce']].map(([e,k])=>`<div class="civ-stat"><span>${e}</span><span>${k==='startForce'?civ[k]:(civ.start?.[k]??'—')}</span></div>`).join('')}
      <div class="civ-passive">${civ.passive}<br><em style="color:#6070a0">${civ.active.name} : ${civ.active.desc}</em>${tb?`<br><span class="civ-bonus-tag">${tb.emoji} Bonus : ${tb.label} −1<i class=ri-science></i></span>`:''}</div>
    </div>`;}).join('');
})();
function setDifficulty(level){
  gameDifficulty=level;
  document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('diff-'+level).classList.add('active');
  if(selectedCiv)selectCiv(selectedCiv);
}
function selectCiv(id){
  selectedCiv=id;
  const nAIs={'easy':1,'normal':2,'hard':3}[gameDifficulty]||1;
  const others=Object.keys(CIVS).filter(cid=>cid!==id);
  const shuffled=others.sort(()=>Math.random()-0.5);
  selectedAiCivs=shuffled.slice(0,Math.min(nAIs,others.length));
  document.querySelectorAll('.civ-card').forEach(el=>{
    el.classList.remove('sel','ai-pick');
    el.querySelectorAll('.civ-pick-badge').forEach(b=>b.remove());
  });
  const playerCard=document.getElementById('cc-'+id);
  if(playerCard){
    playerCard.classList.add('sel');
    const b=document.createElement('div');b.className='civ-pick-badge player-badge';b.textContent='✓ Vous';
    playerCard.appendChild(b);
  }
  const aiLabels=['🤖 IA 1','🤖 IA 2','🤖 IA 3'];
  selectedAiCivs.forEach((civId,i)=>{
    const card=document.getElementById('cc-'+civId);
    if(card){
      card.classList.add('ai-pick');
      const b=document.createElement('div');b.className='civ-pick-badge ai-badge';
      b.textContent=aiLabels[i];card.appendChild(b);
    }
  });
  document.getElementById('btn-start').disabled=false;
}

/* ============================================================================
   @flux — LA MACHINE À ÉTATS DU JEU        (modèle Board Game Arena, lot 17)
   ============================================================================

   POURQUOI ELLE EST **ICI**, dans moteur.js, et pas côté serveur
   ----------------------------------------------------------------------------
   BGA déclare son flux côté serveur (`states.inc.php`) parce que BGA n'a pas de
   mode hors ligne : chez eux le navigateur n'est qu'un afficheur. Nous, si — le
   solo doit tourner dans l'avion. Le déroulement d'une partie est donc une RÈGLE
   du jeu au même titre que le coût d'une colonie, et il vit là où vivent les
   règles : dans `moteur.js`, chargé par le navigateur, lu par le serveur,
   embarqué tel quel dans l'application mobile. **Un seul flux pour les trois
   modes.** Une machine déclarée côté serveur uniquement aurait laissé le solo sur
   les anciens rappels — exactement l'hybride qu'on refuse.

   CE QU'ELLE REMPLACE
   ----------------------------------------------------------------------------
   Aujourd'hui le déroulement est une CHAÎNE DE RAPPELS : chaque question met de
   côté une fonction (« la suite ») qui vit dans la mémoire du processus.
   `server/test_serialisation.js` l'a démontré : une partie sauvegardée pendant
   qu'une question est posée NE PEUT PAS être reprise — l'état revient intact, la
   suite est perdue. La documentation de BGA met en garde contre exactement ça :
   « players will lose their progress on browser refresh (F5) ».

   LE PRINCIPE, en une phrase
   ----------------------------------------------------------------------------
   **L'état d'une partie vivante doit être une DONNÉE, jamais une fonction.**
   Ici : un numéro d'état + la liste des nations actives + quelques curseurs, le
   tout rangé dans `G._flux`. Comme `G` se sérialise déjà (points 1 à 4 de
   test_serialisation.js), la reprise devient gratuite : on relit, et on repart.

   LES QUATRE RÈGLES À NE PAS ENFREINDRE
   ----------------------------------------------------------------------------
   1. **Aucune règle de jeu dans ce bloc.** Il ne sait que : dans quel état on est,
      qui doit agir, quelle transition mène où. Les règles sont ailleurs dans ce
      fichier et s'y appellent par leur NOM (registre `ST`), jamais par référence
      — une référence de fonction ne se sérialise pas, un nom si.
   2. **Ne JAMAIS renuméroter un état.** BGA prévient : « all active games will
      behave unpredictably ». On ajoute (les numéros sont espacés de 10 pour
      permettre d'intercaler), on ne renumérote pas.
   3. **Aucun curseur dans une fermeture.** L'index de la guerre en cours, la
      nation qu'on interroge, la file d'attente : tout va dans `G._flux.donnees`.
      Un `for` qui capture son index dans un rappel, c'est le bug d'origine qui
      revient par la fenêtre.
   4. **Aucune transition non déclarée.** `fluxAller` refuse tout nom absent de la
      table. Une transition inventée à la volée, c'est le flux implicite qui
      revient — et il est précisément ce qu'on est en train de supprimer.
   ========================================================================== */

/* Types d'état — mêmes catégories que BGA.
   · ACTIF       : UNE nation doit répondre ou jouer.
   · MULTI_ACTIF : PLUSIEURS nations agissent EN MÊME TEMPS (agenda, stratégie,
                   investissements). C'est ce qui supprime l'attente en file à
                   quatre joueurs, par construction et non par rustine.
   · AUTO        : aucun joueur ; le jeu applique une règle puis transite seul.
   · INFO        : fenêtre à lire ; un joueur (ou tous) accuse réception.
   · FIN         : terminus. */
const FLUX_TYPE = { ACTIF:'actif', MULTI_ACTIF:'multi_actif', AUTO:'auto', INFO:'info', FIN:'fin' };

/* Numéros d'état — espacés de 10. Voir règle 2 : on n'en renumérote aucun. */
const S = {
  DEBUT:               1,
  AGENDA:             10,
  ANNONCE_EVENEMENT:  20,
  STRATEGIE:          30,
  CALMER_TENSION:     35,
  DEBUT_TOUR:         40,
  TOUR_NATION:        50,
  EXTRA_SOLAIRE:      54,
  CONFIRMATION:       55,
  COPIE_EMPATHE:      56,
  ESPIONNAGE:         57,
  CHOIX_CIBLE:        58,
  CAPTURE_ROUTE:      59,
  ROTATION:           60,
  PIRATES_TENSIONS:   70,
  GUERRE_PAIX:        80,
  GUERRE_COMBAT:      82,
  GUERRE_DEFENSE:     83,
  GUERRE_RESULTAT:    84,
  GUERRE_FORCEE:      86,
  DYSON:              88,
  DYSON_HUMAIN:       89,
  REVENUS:            90,
  EVENEMENT_RESULTAT: 92,
  EVENEMENT_CHOIX:    94,
  ACCORD_DEMANDE:     96,
  ACCORD_RESULTAT:    97,
  FIN:                99,
  BILAN:             100,
  INVESTISSEMENT_1:  110,
  INVESTISSEMENT_2:  112,
  TOUR_SUIVANT:      120
};

/* LA CARTE DU FLUX. `kind` = le nom de fenêtre déjà connu du client : les `kind`
   actuels (agenda, strategy, war_combat…) DEVIENNENT des états, sans que le client
   ait à changer de vocabulaire du jour au lendemain. */
const ETATS = {

  [S.DEBUT]: { nom:'debut', type:FLUX_TYPE.AUTO,
    description:'Mise en place de la partie',
    transitions:{ suite:S.AGENDA } },

  [S.AGENDA]: { nom:'agenda', type:FLUX_TYPE.MULTI_ACTIF, kind:'agenda',
    description:'Chaque joueur choisit son agenda secret',
    actions:['choisirAgenda'],
    transitions:{ tousChoisi:S.ANNONCE_EVENEMENT } },

  /* L'annonce vient AVANT le tirage Stratégie (corrigé en v4.8) : connaître
     l'événement à venir est précisément ce qui donne son intérêt au choix. */
  [S.ANNONCE_EVENEMENT]: { nom:'annonceEvenement', type:FLUX_TYPE.INFO, kind:'event_announce',
    collectif:true,
    description:'Événement annoncé pour le tour à venir',
    transitions:{ suite:S.STRATEGIE, aucun:S.STRATEGIE } },

  [S.STRATEGIE]: { nom:'strategie', type:FLUX_TYPE.MULTI_ACTIF, kind:'strategy',
    description:'Chaque nation tire sa carte Stratégie',
    actions:['choisirStrategie'],
    transitions:{ tousChoisi:S.DEBUT_TOUR, calmer:S.CALMER_TENSION } },

  [S.CALMER_TENSION]: { nom:'calmerTension', type:FLUX_TYPE.ACTIF, kind:'strategy_calm',
    description:'Choisir la nation dont on apaise la tension',
    actions:['choisirNation'],
    transitions:{ suite:S.DEBUT_TOUR } },

  [S.DEBUT_TOUR]: { nom:'debutTour', type:FLUX_TYPE.AUTO,
    description:'Préparation du tour (AC, revenus temporaires, remises à zéro par nation)',
    transitions:{ suite:S.TOUR_NATION } },

  [S.TOUR_NATION]: { nom:'tourNation', type:FLUX_TYPE.ACTIF,
    description:'La nation active joue une action ou passe',
    actions:['coloniser','route','ameliorer','acheterTech','pouvoir','raid','attaquer','dyson','passer'],
    /* `dyson` : construire la Sphère demande son avis à CHAQUE autre nation — d'où un état
       dédié, atteint depuis le tour de jeu et non depuis la fin de manche. Le contrôle de
       cohérence plus bas avait signalé l'oubli : l'état était déclaré mais inatteignable. */
    transitions:{ confirmer:S.CONFIRMATION, cible:S.CHOIX_CIBLE, dyson:S.DYSON,
                  capture:S.CAPTURE_ROUTE, espionnage:S.ESPIONNAGE, empathe:S.COPIE_EMPATHE,
                  extraSolaire:S.EXTRA_SOLAIRE, jouee:S.ROTATION, passe:S.ROTATION } },

  /* Sous-choix nés d'une action : ils prolongent le tour de la même nation et y reviennent.
     Les déclarer en états, c'est ce qui permet de les reprendre après un rafraîchissement —
     dans l'ancien flux ils vivaient dans des rappels et disparaissaient avec le processus. */
  [S.EXTRA_SOLAIRE]: { nom:'extraSolaire', type:FLUX_TYPE.ACTIF, kind:'extrasolar',
    description:'Exploration extra-solaire : choisir le monde à coloniser',
    actions:['choisirMonde','renoncer'],
    transitions:{ suite:S.ROTATION } },

  [S.COPIE_EMPATHE]: { nom:'copieEmpathe', type:FLUX_TYPE.ACTIF, kind:'empath_copy',
    description:'Télépathie : choisir la carte à copier',
    actions:['choisirCarte','renoncer'],
    transitions:{ suite:S.ROTATION } },

  [S.ESPIONNAGE]: { nom:'espionnage', type:FLUX_TYPE.ACTIF, kind:'espionage',
    description:'Espionnage : choisir la branche technologique à copier',
    actions:['choisirBranche','renoncer'],
    transitions:{ suite:S.ROTATION } },

  [S.CAPTURE_ROUTE]: { nom:'captureRoute', type:FLUX_TYPE.ACTIF, kind:'route_capture',
    description:'Capturer la route adverse ou la détruire',
    actions:['capturer','detruire'],
    transitions:{ suite:S.ROTATION } },

  [S.CONFIRMATION]: { nom:'confirmation', type:FLUX_TYPE.ACTIF,
    description:'Valider ou annuler l\'action qui vient d\'être jouée',
    actions:['valider','annuler'],
    transitions:{ valide:S.ROTATION, annule:S.TOUR_NATION } },

  /* Le raid demande sa cible depuis la v5.8 : sans ça il frappait `G.ais[0]`,
     une nation arbitraire que le joueur n'avait jamais désignée. */
  [S.CHOIX_CIBLE]: { nom:'choixCible', type:FLUX_TYPE.ACTIF, kind:'raid_target',
    description:'Choisir la nation à piller',
    actions:['choisirNation'],
    transitions:{ suite:S.ROTATION } },

  [S.ROTATION]: { nom:'rotation', type:FLUX_TYPE.AUTO,
    description:'Passe la main ; si toutes les nations ont passé, la manche se termine',
    transitions:{ suivant:S.TOUR_NATION, mancheFinie:S.PIRATES_TENSIONS } },

  [S.PIRATES_TENSIONS]: { nom:'piratesTensions', type:FLUX_TYPE.AUTO,
    description:'Pirates, risque de guerre, tensions',
    transitions:{ guerres:S.GUERRE_PAIX, pasDeGuerre:S.REVENUS } },

  /* Chaque guerre est traitée DU POINT DE VUE d'un belligérant (v5.1) : sans ça,
     les fenêtres de combat et de paix partaient toutes au même joueur. */
  [S.GUERRE_PAIX]: { nom:'guerrePaix', type:FLUX_TYPE.ACTIF, kind:'peace_offer',
    description:'Proposer la paix ou poursuivre la guerre',
    actions:['accepterPaix','refuserPaix'],
    transitions:{ paix:S.GUERRE_RESULTAT, guerre:S.GUERRE_COMBAT, forcee:S.GUERRE_FORCEE } },

  [S.GUERRE_COMBAT]: { nom:'guerreCombat', type:FLUX_TYPE.ACTIF, kind:'war_combat',
    description:'Assaillir une colonie, défendre, ou tenir sa position',
    actions:['assaillir','defendre','tenir'],
    transitions:{ defense:S.GUERRE_DEFENSE, resolu:S.GUERRE_RESULTAT } },

  [S.GUERRE_DEFENSE]: { nom:'guerreDefense', type:FLUX_TYPE.ACTIF, kind:'defense',
    description:'Le défenseur engage ses jetons',
    actions:['engagerJetons'],
    transitions:{ suite:S.GUERRE_RESULTAT } },

  [S.GUERRE_RESULTAT]: { nom:'guerreResultat', type:FLUX_TYPE.INFO, kind:'war_result',
    description:'Résultat du combat',
    transitions:{ guerreSuivante:S.GUERRE_PAIX, terminees:S.REVENUS } },

  [S.GUERRE_FORCEE]: { nom:'guerreForcee', type:FLUX_TYPE.ACTIF, kind:'forced_war',
    description:'Guerre populaire forcée : exiger la paix ou frapper',
    actions:['exigerPaix','attaquerRoute','attaquerColonie'],
    transitions:{ suite:S.GUERRE_RESULTAT } },

  [S.DYSON]: { nom:'dyson', type:FLUX_TYPE.ACTIF, kind:'ai_dyson',
    description:'Sphère de Dyson : accepter le monopole ou déclarer la guerre',
    actions:['accepter','refuser'],
    transitions:{ suite:S.ROTATION, guerre:S.GUERRE_PAIX, humainSuivant:S.DYSON_HUMAIN } },

  /* Sphère de Dyson : chaque AUTRE nation doit se prononcer. Séparer l'avis d'un humain
     de celui d'une IA évite de confondre « on attend une réponse » et « on applique une
     règle » — c'est le chantier resté ouvert depuis la partie à 2 humains. */
  [S.DYSON_HUMAIN]: { nom:'dysonHumain', type:FLUX_TYPE.ACTIF, kind:'human_dyson',
    description:'Une autre nation a construit la Sphère : accepter le monopole ou la guerre',
    actions:['accepter','refuser'],
    transitions:{ humainSuivant:S.DYSON_HUMAIN, suite:S.ROTATION, guerre:S.GUERRE_PAIX } },

  [S.REVENUS]: { nom:'revenus', type:FLUX_TYPE.AUTO,
    description:'Revenus, entretien, rivière de cartes',
    transitions:{ evenement:S.EVENEMENT_RESULTAT, sansEvenement:S.BILAN } },

  [S.EVENEMENT_RESULTAT]: { nom:'evenementResultat', type:FLUX_TYPE.INFO, kind:'event_result',
    collectif:true,
    description:'Effet de l\'événement du tour',
    transitions:{ interactif:S.EVENEMENT_CHOIX, suite:S.BILAN } },

  /* Deux événements interactifs partagent ce moment du tour : le sommet COMMERCIAL
     (`event_comm`, on désigne un partenaire) et le sommet DIPLOMATIQUE (`event_diplo`,
     on choisit des pactes). Même place dans le flux, questions différentes — d'où
     `kindAlt` plutôt qu'un état jumeau qui dupliquerait les transitions. */
  [S.EVENEMENT_CHOIX]: { nom:'evenementChoix', type:FLUX_TYPE.ACTIF, kind:'event_comm', kindAlt:'event_diplo',
    description:'Événement interactif : accords commerciaux ou pactes diplomatiques',
    actions:['choisirPartenaire','choisirPactes','passer'],
    transitions:{ proposition:S.ACCORD_DEMANDE, joueurSuivant:S.EVENEMENT_CHOIX, tousTraites:S.BILAN } },

  /* Un accord est une PROPOSITION, pas une décision unilatérale (v5.9). */
  [S.ACCORD_DEMANDE]: { nom:'accordDemande', type:FLUX_TYPE.ACTIF, kind:'accord_request',
    description:'Une nation te propose un accord commercial',
    actions:['accepter','refuser'],
    transitions:{ suite:S.ACCORD_RESULTAT } },

  [S.ACCORD_RESULTAT]: { nom:'accordResultat', type:FLUX_TYPE.INFO, kind:'accord_result',
    description:'Réponse à ta proposition d\'accord',
    transitions:{ suite:S.EVENEMENT_CHOIX } },

  /* Le bilan est COLLECTIF : à cet instant il n'y a plus de joueur actif, chacun
     lit le sien en même temps (règle posée par Marc). */
  [S.BILAN]: { nom:'bilan', type:FLUX_TYPE.INFO, kind:'eot',
    collectif:true, corpsParNation:true,
    description:'Bilan de fin de tour',
    transitions:{ investissement1:S.INVESTISSEMENT_1, investissement2:S.INVESTISSEMENT_2,
                  suite:S.TOUR_SUIVANT, fin:S.FIN } },

  [S.INVESTISSEMENT_1]: { nom:'investissement1', type:FLUX_TYPE.MULTI_ACTIF, kind:'invest1',
    description:'Investissement de niveau 1 (fin du tour 2)',
    actions:['choisirInvestissement'],
    transitions:{ tousChoisi:S.TOUR_SUIVANT } },

  [S.INVESTISSEMENT_2]: { nom:'investissement2', type:FLUX_TYPE.MULTI_ACTIF, kind:'invest2',
    description:'Investissement de niveau 2 (fin du tour 6)',
    actions:['choisirInvestissement'],
    transitions:{ tousChoisi:S.TOUR_SUIVANT } },

  [S.TOUR_SUIVANT]: { nom:'tourSuivant', type:FLUX_TYPE.AUTO,
    description:'Tour suivant, ou fin de partie au dernier tour',
    transitions:{ tourSuivant:S.ANNONCE_EVENEMENT, fin:S.FIN } },

  [S.FIN]: { nom:'fin', type:FLUX_TYPE.FIN,
    description:'Partie terminée — décompte des points de victoire' }
};

/* ----------------------------------------------------------------------------
   LE REGISTRE `ST` — les fonctions du jeu appelées PAR LEUR NOM
   ----------------------------------------------------------------------------
   BGA nomme `stXxx` la fonction exécutée EN ENTRANT dans un état automatique, et
   `argXxx` celle qui RECALCULE les arguments d'un état joueur. Deux points de
   leur doctrine qu'on reprend tels quels, parce qu'ils règlent nos deux plaies :
     · une fonction d'entrée nommée remplace la « suite » qu'on mettait de côté ;
     · des arguments RECALCULÉS à chaque affichage — jamais mémorisés — évitent
       qu'un joueur revenu après un rafraîchissement voie une fenêtre périmée
       (BGA : « never store the args, always recompute them »).
   On enregistre des NOMS, pas des références : un nom se sérialise, pas une
   fonction. C'est la règle 1 du bloc. */
/* ⚠️ `var` et non `const`, et initialisation PARESSEUSE — ce n'est pas une négligence.
   Le bloc @flux est en BAS du fichier, mais les flux migrés (guerres, fin de tour…) sont plus haut
   et s'enregistrent AU CHARGEMENT, donc AVANT cette ligne. Avec un `const`, chaque enregistrement
   tombait dans la zone morte temporelle : « Cannot access 'ST' before initialization », et le moteur
   refusait de se charger. Un `var` est hissé ; on crée la table au premier appel.
   Le jour où tu déplaces ce bloc ou ajoutes un enregistrement ailleurs, cette ligne te protège. */
var ST;
function fluxRegistre(){ return ST || (ST = Object.create(null)); }
function fluxDeclarer(nom, fn){ if(typeof fn==='function') fluxRegistre()[nom]=fn; }
/* ⚠️ UN NOM INCONNU LÈVE UNE ERREUR. Ce n'était pas le cas au premier jet : `fluxAppeler` rendait
   `undefined` sans rien dire, et deux suites que j'avais oublié d'enregistrer ont figé la partie au
   tour 1 — sans exception, sans message, sans trace. Il a fallu instrumenter le moteur pour la voir.
   Une continuation perdue en silence est EXACTEMENT le défaut que ce chantier supprime : elle ne
   doit pas pouvoir renaître dans l'outil censé la supprimer. */
function fluxAppeler(nom, ...args){
  const f=fluxRegistre()[nom];
  if(typeof f!=='function'){
    throw new Error('flux : suite « '+nom+' » inconnue du registre. '
      +'Ajoute `fluxDeclarer(\''+nom+'\', '+nom+')` à côté de sa définition. '
      +'Enregistrées : '+Object.keys(fluxRegistre()).sort().join(', '));
  }
  return f(...args);
}

/* ---------------------------------------------------------------------------
   L'ÉTAT VIVANT — rangé dans `G._flux`, donc sérialisé avec le reste de la partie.
   C'est TOUT l'intérêt du chantier : il n'y a rien d'autre à sauvegarder.
     · etat     : le numéro d'état courant ;
     · actifs   : les nations qui doivent agir MAINTENANT ;
     · repondu  : en MULTI_ACTIF, celles qui ont déjà répondu ;
     · donnees  : les curseurs (guerre en cours, nation interrogée, file d'attente).
                  Règle 3 : AUCUN curseur dans une fermeture, tout ici.
   --------------------------------------------------------------------------- */
function fluxInit(){
  G._flux = { v:1, etat:S.DEBUT, actifs:[], repondu:[], donnees:{}, histoire:[] };
  return G._flux;
}
function fluxEtatObj(){ return (G && G._flux) ? G._flux : fluxInit(); }
function fluxEtat(){ return fluxEtatObj().etat; }
function fluxDef(num){ return ETATS[(num===undefined)?fluxEtat():num]; }
function fluxNom(){ const d=fluxDef(); return d?d.nom:'?'; }
function fluxType(){ const d=fluxDef(); return d?d.type:'?'; }
function fluxFini(){ return fluxType()===FLUX_TYPE.FIN; }
function fluxDonnees(){ return fluxEtatObj().donnees; }

/* Qui a le droit d'agir. C'est la garantie que BGA appelle `checkAction` : elle
   REFUSE une action hors tour au lieu de l'appliquer poliment. Sans elle, un
   client modifié — ou simplement en retard d'un tour — joue quand ce n'est pas
   à lui, et la partie diverge sans que personne comprenne pourquoi. */
function fluxPeutAgir(civId){ return fluxEtatObj().actifs.indexOf(civId)!==-1; }
function fluxActionPermise(action){ return ((fluxDef()||{}).actions||[]).indexOf(action)!==-1; }

function fluxActiver(civIds){
  const f=fluxEtatObj();
  f.actifs = Array.isArray(civIds)?civIds.slice():(civIds?[civIds]:[]);
  f.repondu = [];
  return f.actifs;
}
function fluxActiverTous(filtre){
  const toutes = (typeof allPlayers==='function')?allPlayers():[G.player].concat(G.ais||[]);
  return fluxActiver(toutes.filter(n=>n&&(filtre?filtre(n):true)).map(n=>n.civ.id));
}
/* MULTI_ACTIF : une nation a répondu. Rend true quand TOUTES ont répondu — c'est ce
   qui permet à quatre joueurs de choisir leur carte EN MÊME TEMPS plutôt que chacun
   son tour. L'attente en file à quatre joueurs disparaît par construction. */
function fluxARepondu(civId){
  const f=fluxEtatObj();
  if(f.repondu.indexOf(civId)===-1) f.repondu.push(civId);
  return f.repondu.length >= f.actifs.length;
}
function fluxResteARepondre(){
  const f=fluxEtatObj();
  return f.actifs.filter(c=>f.repondu.indexOf(c)===-1);
}

/* LA TRANSITION. Refuse tout nom non déclaré (règle 4). `donnees` est fusionné
   dans les curseurs. Si l'état d'arrivée déclare une fonction d'entrée (`entree`),
   elle est appelée — c'est l'équivalent du `stXxx` de BGA. */
function fluxAller(nomTransition, donnees){
  const f=fluxEtatObj(), def=fluxDef();
  if(!def) throw new Error('flux : état '+f.etat+' inconnu');
  if(def.type===FLUX_TYPE.FIN) throw new Error('flux : transition « '+nomTransition+' » depuis FIN — la partie est terminée');
  const cible=(def.transitions||{})[nomTransition];
  if(cible===undefined){
    throw new Error('flux : transition « '+nomTransition+' » inconnue depuis l\'état '+f.etat+' ('+def.nom+'). '
      +'Déclarées : '+Object.keys(def.transitions||{}).join(', '));
  }
  const depuis=f.etat, depuisNom=def.nom;
  f.etat=cible; f.actifs=[]; f.repondu=[];
  if(donnees&&typeof donnees==='object') Object.assign(f.donnees, donnees);
  f.histoire.push({t:(G&&G.turn)||0, de:depuis, deNom:depuisNom, via:nomTransition, vers:cible, versNom:fluxNom()});
  if(f.histoire.length>60) f.histoire.shift();
  const arrivee=fluxDef();
  if(arrivee&&arrivee.entree) fluxAppeler(arrivee.entree);
  return f.etat;
}

/* Les arguments d'un état joueur, RECALCULÉS (jamais mémorisés — voir plus haut).
   C'est ce qui garantit qu'un joueur revenu après un rafraîchissement voit la
   question telle qu'elle est MAINTENANT, et non telle qu'elle était. */
function fluxArguments(){
  const d=fluxDef();
  return (d&&d.args)?(fluxAppeler(d.args)||{}):{};
}

/* DIAGNOSTIC — demande de Marc : « un rafraîchissement amène le jeu à vérifier les
   bugs éventuels ». Une partie figée doit pouvoir DIRE pourquoi elle est figée. */
function fluxDiagnostiquer(){
  const f=fluxEtatObj(), d=fluxDef(), soucis=[];
  const connues=((typeof allPlayers==='function')?allPlayers():[G.player].concat(G.ais||[])).filter(Boolean).map(n=>n.civ.id);
  if(!d) soucis.push('état '+f.etat+' inconnu de la machine');
  else{
    if((d.type===FLUX_TYPE.ACTIF||d.type===FLUX_TYPE.MULTI_ACTIF)&&!f.actifs.length)
      soucis.push('état « '+d.nom+' » attend une réponse mais AUCUNE nation n\'est active — la partie ne peut pas avancer');
    if(d.type===FLUX_TYPE.ACTIF&&f.actifs.length>1)
      soucis.push('état « '+d.nom+' » est à joueur unique mais '+f.actifs.length+' nations sont actives');
    for(const c of f.actifs) if(connues.indexOf(c)===-1)
      soucis.push('la nation active « '+c+' » ne fait pas partie de la partie');
  }
  return { etat:f.etat, nom:d?d.nom:'?', type:d?d.type:'?', tour:(G&&G.turn)||0,
           actifs:f.actifs.slice(), enAttente:fluxResteARepondre(),
           histoire:f.histoire.slice(-12), soucis };
}

/* ---------------------------------------------------------------------------
   CONTRÔLE DE COHÉRENCE — au chargement du moteur, donc AVANT toute partie.
   Une transition qui pointe dans le vide est un blocage garanti chez un joueur.
   Mieux vaut échouer ici, bruyamment, que dans la partie de Marc un dimanche soir.
   (C'est ce contrôle qui avait déjà attrapé l'état DYSON, déclaré mais orphelin.)
   --------------------------------------------------------------------------- */
(function verifierFlux(){
  const fautes=[], numeros=new Set(Object.keys(ETATS).map(Number));
  for(const num of numeros){
    const e=ETATS[num];
    if(!e.nom) fautes.push('état '+num+' : pas de nom');
    if(!e.type) fautes.push('état '+num+' : pas de type');
    if(e.type===FLUX_TYPE.FIN) continue;
    if(!e.transitions||!Object.keys(e.transitions).length)
      fautes.push('état '+num+' ('+e.nom+') : aucune transition — cul-de-sac');
    for(const t of Object.keys(e.transitions||{}))
      if(!numeros.has(e.transitions[t])) fautes.push('état '+num+' ('+e.nom+') : transition « '+t+' » vise l\'état '+e.transitions[t]+', qui n\'existe pas');
    if((e.type===FLUX_TYPE.ACTIF||e.type===FLUX_TYPE.MULTI_ACTIF)&&!(e.actions||[]).length)
      fautes.push('état '+num+' ('+e.nom+') : état joueur sans action possible');
  }
  // Tout état doit être atteignable, sinon c'est du code mort déguisé en règle.
  const atteints=new Set([S.DEBUT]);
  for(const num of numeros){ const tr=ETATS[num].transitions||{}; for(const t of Object.keys(tr)) atteints.add(tr[t]); }
  for(const num of numeros) if(!atteints.has(num)) fautes.push('état '+num+' ('+ETATS[num].nom+') : INATTEIGNABLE');
  if(fautes.length) throw new Error('MACHINE À ÉTATS INCOHÉRENTE :\n  · '+fautes.join('\n  · '));
})();

/* Accès à la carte du flux depuis l'EXTÉRIEUR du moteur (serveur, tests, outils).
   `S`, `ETATS` et `FLUX_TYPE` sont déclarés en `const` : ils ne deviennent donc PAS
   des propriétés globales et restent invisibles pour le serveur — même piège que
   `G`, exposé par `scGetG()`. On expose donc des accesseurs explicites plutôt que
   de laisser chacun bricoler son introspection. */
function fluxTable(){ return ETATS; }
function fluxNumeros(){ return S; }
function fluxTypes(){ return FLUX_TYPE; }
