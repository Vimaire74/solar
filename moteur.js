/* ⚠️ MARQUEUR DE VERSION — À TENIR À JOUR À CHAQUE ENVOI.
   `moteur.js` n'en avait AUCUN. Conséquence vécue le 2026-08-07 : Marc constate 3 cartes Stratégie
   là où le code en prévoit 5, et il est impossible de dire si le code fautif est celui qu'on lit ou
   une version plus ancienne restée en ligne. On ne peut pas diagnostiquer ce qu'on ne peut pas
   identifier. Les trois fichiers portent maintenant leur version, et l'écran de connexion les
   compare : si l'un des trois diffère, il l'affiche en rouge. */
const SOLAR_BUILD_MOTEUR = '2026-08-07 · v9.8';
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
    passive:'Colonies joviennes (Io, Europe, Ganymède, Callisto) +1<i class=ri-energy></i>/tour. Base : Io.',
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
const NODES={
  // upgradeCost:'standard'=2AC / 'remote'=3AC | strategic:'full'=+1jeton/tour / 'half'=50%
  // Colonisation colonie 'remote' → −1<i class=ri-morale></i> one-time | Niv.1 → +1<i class=ri-morale></i> toutes | Niv.2 → +1<i class=ri-morale></i> si attractive, +2<i class=ri-morale></i> Callisto
  // ATTRACTIVE_COLS=['lune','europe','titan','encelade','triton']
  lune:{id:'lune',name:'Lune',emoji:'🌕',color:'#B0BEC5',type:'moon',baseVP:2,maxLv:3,r:15,upgradeCost:'standard',strategic:'half',res:{energy:1,materials:2},x:420,y:475,conn:['phobos','ceres','deimos'],desc:'Satellite terrestre. Vue sur la Terre — habitat confortable.'},
  phobos:{id:'phobos',name:'Phobos',emoji:'⚫',color:'#8D6E63',type:'moon',baseVP:2,maxLv:3,r:11,upgradeCost:'standard',strategic:'half',res:{energy:1,materials:2},x:552,y:282,conn:['lune','deimos','ceres'],desc:'Lune intérieure de Mars. Proche des routes de propulsion.'},
  deimos:{id:'deimos',name:'Déimos',emoji:'🟤',color:'#795548',type:'moon',baseVP:1,maxLv:3,r:12,upgradeCost:'remote',strategic:null,res:{materials:1},x:452,y:322,conn:['phobos','lune'],desc:'Petite lune aride de Mars. Conditions difficiles.'},
  ceres:{id:'ceres',name:'Cérès',emoji:'⬜',color:'#CFD8DC',type:'dwarf_planet',baseVP:3,maxLv:3,r:21,upgradeCost:'standard',strategic:'full',res:{energy:1,materials:3},x:625,y:548,conn:['lune','phobos','vesta','io','ganymede'],desc:'Hub de la ceinture d\'astéroïdes. Carrefour stratégique des routes.'},
  vesta:{id:'vesta',name:'Vesta',emoji:'🪨',color:'#78909C',type:'asteroid',baseVP:2,maxLv:3,r:17,upgradeCost:'remote',strategic:null,res:{materials:2},x:715,y:212,conn:['ceres','ganymede'],desc:'Grand astéroïde métallique. Éloigné des routes principales.'},
  io:{id:'io',name:'Io',emoji:'🟡',color:'#FFD54F',type:'moon',baseVP:3,maxLv:3,r:15,upgradeCost:'standard',strategic:'half',res:{energy:3,materials:1},x:862,y:328,conn:['ceres','europe','ganymede','jorbital1'],desc:'Lune volcanique. Énergie géothermique intense.'},
  europe:{id:'europe',name:'Europe',emoji:'🔵',color:'#42a5f5',type:'moon',baseVP:4,maxLv:3,r:15,upgradeCost:'remote',strategic:null,res:{energy:1,materials:1},x:1060,y:352,conn:['io','callisto','jorbital1','titan'],desc:'Océan sous-glaciaire. Paysage saisissant sous Jupiter. Radiation intense.'},
  ganymede:{id:'ganymede',name:'Ganymède',emoji:'🟤',color:'#A1887F',type:'moon',baseVP:4,maxLv:3,r:18,upgradeCost:'standard',strategic:'full',res:{energy:1,materials:2},x:922,y:432,conn:['io','vesta','callisto','titan','jorbital1','ceres'],desc:'Plus grande lune du système. Hub jovien majeur, carrefour de routes.'},
  callisto:{id:'callisto',name:'Callisto',emoji:'🔘',color:'#607D8B',type:'moon',baseVP:3,maxLv:3,r:16,upgradeCost:'standard',strategic:'half',res:{energy:1,materials:2},x:1052,y:425,conn:['europe','ganymede','titan'],desc:'Hors de la radiation jovienne. Meilleur habitat humain du système jovien.'},
  jorbital1:{id:'jorbital1',name:'Station Jupiter',emoji:'🟠',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:16,upgradeCost:'standard',strategic:null,noColonize:true,res:{energy:2,science:1},x:960,y:415,conn:['io','europe','ganymede'],desc:'Anneau orbital de la base jupitérienne (Io) — non colonisable.'},
  jorbital2:{id:'jorbital2',name:'Anneau J-2',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,upgradeCost:'standard',strategic:null,res:{},decorative:true,x:421,y:159,conn:['jorbital1','jorbital3'],desc:'Territoire jovien — non colonisable.'},
  jorbital3:{id:'jorbital3',name:'Anneau J-3',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,upgradeCost:'standard',strategic:null,res:{},decorative:true,x:429,y:194,conn:['jorbital2','jorbital4'],desc:'Territoire jovien — non colonisable.'},
  jorbital4:{id:'jorbital4',name:'Anneau J-4',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,upgradeCost:'standard',strategic:null,res:{},decorative:true,x:406,y:223,conn:['jorbital3','jorbital5'],desc:'Territoire jovien — non colonisable.'},
  jorbital5:{id:'jorbital5',name:'Anneau J-5',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,upgradeCost:'standard',strategic:null,res:{},decorative:true,x:370,y:223,conn:['jorbital4','jorbital6'],desc:'Territoire jovien — non colonisable.'},
  jorbital6:{id:'jorbital6',name:'Anneau J-6',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,upgradeCost:'standard',strategic:null,res:{},decorative:true,x:347,y:194,conn:['jorbital5','jorbital7'],desc:'Territoire jovien — non colonisable.'},
  jorbital7:{id:'jorbital7',name:'Anneau J-7',emoji:'🛸',color:'#FFB74D',type:'orbital_station',baseVP:0,maxLv:1,r:2,upgradeCost:'standard',strategic:null,res:{},decorative:true,x:355,y:159,conn:['jorbital6','jorbital1'],desc:'Territoire jovien — non colonisable.'},
  titan:{id:'titan',name:'Titan',emoji:'🌫️',color:'#FF8F00',type:'moon',baseVP:5,maxLv:3,r:18,upgradeCost:'standard',strategic:'full',res:{energy:2,materials:1},x:1400,y:485,conn:['ganymede','callisto','encelade','triton','europe','pluto'],desc:'Hydrocarbures atmosphériques. Paysage orange unique. Hub saturnien.'},
  encelade:{id:'encelade',name:'Encelade',emoji:'❄️',color:'#E0F7FA',type:'moon',baseVP:3,maxLv:3,r:14,upgradeCost:'remote',strategic:null,res:{energy:1,materials:1},x:1325,y:580,conn:['titan','triton'],desc:'Geysers spectaculaires. Lune éloignée dans l\'ombre de Saturne.'},
  triton:{id:'triton',name:'Triton',emoji:'💜',color:'#7C4DFF',type:'moon',baseVP:4,maxLv:3,r:16,upgradeCost:'remote',strategic:'half',res:{energy:1,materials:1},x:1745,y:620,conn:['titan','pluto','eris','encelade'],desc:'Lune rétrograde de Neptune. Paysage unique — carrefour vers Kuiper.'},
  pluto:{id:'pluto',name:'Pluton',emoji:'🩶',color:'#90A4AE',type:'dwarf_planet',baseVP:4,maxLv:3,r:15,upgradeCost:'remote',strategic:null,res:{materials:1},x:1590,y:215,conn:['triton','eris','titan'],desc:'Porte de la ceinture de Kuiper. Très éloigné, conditions extrêmes.'},
  eris:{id:'eris',name:'Éris',emoji:'⬡',color:'#B0BEC5',type:'dwarf_planet',baseVP:5,maxLv:3,r:17,upgradeCost:'remote',strategic:null,res:{materials:1},x:1790,y:190,conn:['pluto','triton'],desc:'Aux confins du système solaire. Ressources rares mais VP élevés.'},
};
const TYPE_COLORS={economic:'#4CAF50',military:'#ef5350',technology:'#42a5f5',colonization:'#FF9800',government:'#AB47BC',civique:'#AB47BC',militaire:'#ef5350'};
// Cartes disposant d'une illustration servie dans assets/cards/<id>.png (ajouter l'id au fil des illustrations)
const CARD_ART=new Set(['bio1','prop1','drones1','quant1','bio2','nav2','hyper3','reseau2','vegetal1','exploit1','terra3','iadef3','robo2','extra3','empathic2','eveil3','extract2','dyson3','mil3','mil2','liens1','gov_senat','gov_democratie','mil_invest','mil1','comm2','tele3','gov_corpo','cm_culture','cm_propagande','cm_social','cm_calm','cm_research','cm_univ','cm_reform','gov_tyrannie','cm_explore','cm_forages']);
const CARDS_POOL=[
  // ── EXPANSION ────────────────────────────────────────────────────────────────
  {id:'bio1',branch:'expansion',tier:1,type:'colonization',name:'Biosphère Autonome',emoji:'🏗️',
   effect:'Colonisation −1<i class=ri-energy></i>',spec:'col_e_disc',
   cost:{materials:2,science:1},vp:1},
  {id:'bio2',branch:'expansion',tier:2,type:'colonization',name:'Biosphère Avancée',emoji:'🌱',
   effect:'Colonies +1<i class=ri-materials></i>/tour. Colonies Nv.2-3 : sans entretien <i class=ri-energy></i>. Supprime malus moral colonies difficiles.',spec:'bio2_bonus',
   cost:{science:4,energy:2,materials:2},vp:3},
  {id:'terra3',branch:'expansion',tier:3,type:'colonization',name:'Terraformation',emoji:'🌍',
   effect:'+1<i class=ri-materials></i> +1<i class=ri-morale></i>/tour par colonie. Colonies Nv.2-3 : sans aucun entretien.',spec:'terra3',
   cost:{science:6,materials:4,energy:4},vp:5},
  // ── NAVIGATION & MOTEURS ─────────────────────────────────────────────────────
  {id:'prop1',branch:'navigation',tier:1,type:'technology',name:'Propulsion Ionique',emoji:'⚗️',
   effect:'Routes −1<i class=ri-materials></i>',spec:'route_disc',
   cost:{science:2,energy:1},vp:1},
  {id:'nav2',branch:'navigation',tier:2,type:'technology',name:'IA de Navigation',emoji:'🧠',
   effect:'+2 jetons Force. Coût de guerre ÷2 (division exacte : si le nombre de jetons engagés est impair, la demi-part est prélevée sur l\'<i class=ri-energy></i> — ex. 5 jetons = 2<i class=ri-materials></i> et 3<i class=ri-energy></i>).',spec:'nav2_war',forceBonus:2,
   cost:{science:4,energy:1},vp:3},
  {id:'hyper3',branch:'navigation',tier:3,type:'technology',name:'Hyperpropulsion',emoji:'🌀',
   effect:'+5 Gov. Routes sans entretien. +3 jetons.',spec:'route_force_free',govPts:5,forceBonus:3,
   cost:{science:6,energy:2,materials:2},vp:5},
  // ── IA & RENSEIGNEMENT ───────────────────────────────────────────────────────
  {id:'drones1',branch:'ia_renseignement',tier:1,type:'technology',name:'Drones Surveillance',emoji:'🔍',
   effect:'+1<i class=ri-science></i>/tour. Raids subis : −1 ressource volée.',spec:'intel_1',rGain:{science:1},
   cost:{science:2,energy:1,materials:1},vp:1},
  {id:'reseau2',branch:'ia_renseignement',tier:2,type:'technology',name:'Réseau Orbital',emoji:'📡',
   effect:'+1<i class=ri-science></i>/tour. Infos complètes des nations. Immunité pirates.',spec:'intel_2',rGain:{science:1},
   cost:{science:3,energy:2,materials:2},vp:3},
  {id:'iadef3',branch:'ia_renseignement',tier:3,type:'technology',name:'IA Défensive',emoji:'🛡️',
   effect:'+4 jetons. Immunité raids/pirates. Rappelle tes jetons des routes.',spec:'ia_immune',spec2:'storm_immune',forceBonus:4,
   cost:{science:5,energy:2,materials:2},vp:5},
  // ── SCIENCES EXPÉRIMENTALES ──────────────────────────────────────────────────
  {id:'quant1',branch:'sciences_exp',tier:1,type:'technology',name:'Ordinateur Quantique',emoji:'🧪',
   effect:'+3<i class=ri-science></i>/tour. −1<i class=ri-energy></i>/tour.',rGain:{science:3,energy:-1},
   cost:{science:2,materials:2},vp:1},
  {id:'robo2',branch:'sciences_exp',tier:2,type:'technology',name:'Robotisation Avancée',emoji:'🤖',
   effect:'+2<i class=ri-materials></i>/tour. Automatisation industrielle — rendement accru.',rGain:{materials:2},
   cost:{science:3,materials:2,energy:2},vp:3},
  {id:'extra3',branch:'sciences_exp',tier:3,type:'technology',name:'Exploration Extra-Solaire',emoji:'🚀',
   effect:'+8 VP si ≥5 techs. Colonise Éris/Pluton/Triton.',spec:'extrasolar',spec2:'gas_unlock',
   cost:{science:5,energy:3,materials:2},vp:5},
  // ── SPIRITUALITÉ & NATURE ────────────────────────────────────────────────────
  {id:'vegetal1',branch:'spiritualite_nature',tier:1,type:'government',name:'Végétalisation',emoji:'🌿',
   effect:'+2<i class=ri-morale></i> immédiat. +1<i class=ri-morale></i>/tour.',resGain:{morale:2},rGain:{morale:1},
   cost:{materials:2,science:1},vp:1},
  {id:'empathic2',branch:'spiritualite_nature',tier:2,type:'government',name:'Réseau Empathique',emoji:'🧘',
   effect:'+1<i class=ri-morale></i> immédiat. +2<i class=ri-morale></i>/tour. +1<i class=ri-science></i>/tour.',resGain:{morale:1},rGain:{morale:2,science:1},
   cost:{science:2,materials:2,energy:2},vp:3},
  {id:'eveil3',branch:'spiritualite_nature',tier:3,type:'government',name:'Éveil Collectif',emoji:'✨',
   effect:'+2<i class=ri-science></i>/tour. +1 VP/colonie connectée au final.',spec:'colony_vp',rGain:{science:2},
   cost:{science:5,materials:2},vp:5},
  // ── MINES & ÉNERGIE ──────────────────────────────────────────────────────────
  {id:'exploit1',branch:'mines_energie',tier:1,type:'economic',name:"Exploitations d'Astéroïdes",emoji:'⛏️',
   effect:'+3<i class=ri-materials></i>/tour',rGain:{materials:3},
   cost:{materials:1,energy:2,science:1},vp:1},
  {id:'extract2',branch:'mines_energie',tier:2,type:'economic',name:'Extracteurs Solaires',emoji:'🏭',
   effect:'+3<i class=ri-energy></i>/tour',rGain:{energy:3},
   cost:{materials:4,energy:1,science:2},vp:3},
  {id:'dyson3',branch:'mines_energie',tier:3,type:'economic',name:'Sphère de Dyson',emoji:'⚡',
   effect:'+5<i class=ri-energy></i>/tour. Les autres acceptent (+3<i class=ri-energy></i>) ou guerre.',spec:'dyson3',rGain:{energy:5},
   cost:{materials:6,energy:3,science:6},vp:5},
  // ── EMPATHES (Union Sacrée requise) ──────────────────────────────────────────
  {id:'liens1',branch:'empathes',tier:1,type:'technology',name:'Liens Empathes',emoji:'🔮',
   effect:'Routes sans jeton (rappelle les tiens). +1<i class=ri-energy></i>/2 routes. +2 tokens combat.',spec:'empath_routes',combatBonus:2,
   cost:{science:4},vp:1},
  {id:'comm2',branch:'empathes',tier:2,type:'technology',name:'Communications Instantanées',emoji:'🌐',
   effect:'+2<i class=ri-morale></i>/tour. +1<i class=ri-science></i>/tour. +5 gouvernement.',rGain:{morale:2,science:1},govPts:5,
   cost:{science:5},vp:3},
  {id:'tele3',branch:'empathes',tier:3,type:'technology',name:'Télépathie',emoji:'🧬',
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
   effect:'+4 jetons Force ; 1/2 perdue au T. suivant. (requis: Robotisation Avancée.)',forceTemp:4,forceLoseNext:2,cost:{energy:3,materials:3,science:1},vp:2,repeatable:true},
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
  {id:'st8',name:'Consolidation',emoji:'🛡️',desc:'+1<i class=ri-morale></i>, −1<i class=ri-energy></i> entretien',res:{morale:1},upkeepDiscount:1},
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
  {id:'inv_esp',name:'Espionnage',emoji:'🕵️',
   benefit:'Copie toutes les cartes d\'une branche ennemie au choix',
   contrepartie:'+6 risque de guerre envers la nation ciblée',
   applyBenefit(G,p){
     // Pour le joueur : géré via showEspionageChoiceModal (interception dans applyInvestments)
     // Pour l'IA : copie automatiquement la branche la plus fournie de l'adversaire
     if(p!==G.player){
       const enemy=G.player;
       const branches={};
       for(const c of enemy.cards){if(c.branch)branches[c.branch]=(branches[c.branch]||0)+1;}
       const topBranch=Object.entries(branches).sort((a,b)=>b[1]-a[1])[0];
       if(!topBranch)return;
       const branchCards=enemy.cards.filter(c=>c.branch===topBranch[0]);
       for(const c of branchCards){
         if(!p.cards.find(x=>x.id===c.id+'_esp')){
           const copy={...c,id:c.id+'_esp',espCopy:true};
           p.cards.push(copy);applyCard(copy,p);
         }
       }
       addLog('🤖 Espionnage IA : copie de la branche '+topBranch[0]+' ('+branchCards.length+' carte(s))','dim');
     }
   },
   applyCost(G,p){
     /* Tension PAR PAIRE : la nation espionnée en veut à l'espion (voir `applyEspionageChoice`). */
     const _c=(typeof _espCible==='function')?_espCible():null;
     if(_c&&typeof addTens==='function')addTens(_c.civ.id,p.civ.id,4);
     G.warRisk=Math.min(10,(G.warRisk||0)+4);
     if(G.ais&&G.ais.includes(p))addLog('🕵️ Espionnage de '+p.civ.name+(_c?' contre '+_c.civ.name:'')+' — tension +4.','red');
   }
  },
  {id:'inv_ind',name:'Industrialisation Lourde',emoji:'🏭',
   benefit:'Revenus +4<i class=ri-materials></i>/tour (T3→T5)',
   contrepartie:'−3<i class=ri-morale></i>',
   applyBenefit(G,p){if(!p.investBonus)p.investBonus={};p.investBonus.matBonus=4;if(p===G.player)addLog('🏭 Industrialisation : +4<i class=ri-materials></i>/tour !','gold');},
   applyCost(G,p){p.res.morale=Math.max(0,(p.res.morale||0)-3);if(p===G.player)addLog('🏭 Industrialisation : −3<i class=ri-morale></i> (pollution massive)','red');}
  },
  {id:'inv_rec',name:'Recherche Intensive',emoji:'🔬',
   benefit:'Revenus +3<i class=ri-science></i>/tour (T3→T5)',
   contrepartie:'−3<i class=ri-materials></i> −1<i class=ri-energy></i>',
   applyBenefit(G,p){if(!p.investBonus)p.investBonus={};p.investBonus.sciBonus=3;if(p===G.player)addLog('<i class=ri-science></i> Recherche Intensive : +3<i class=ri-science></i>/tour !','gold');},
   applyCost(G,p){p.res.materials=Math.max(0,(p.res.materials||0)-3);p.res.energy=Math.max(0,(p.res.energy||0)-1);if(p===G.player)addLog('<i class=ri-science></i> Recherche Intensive : −3<i class=ri-materials></i> −1<i class=ri-energy></i>','red');}
  },
  {id:'inv_agr',name:'Agriculture Durable',emoji:'🌾',
   benefit:'+2<i class=ri-morale></i>/tour (T3→T5)',
   contrepartie:'−2<i class=ri-materials></i> −1<i class=ri-science></i>',
   applyBenefit(G,p){if(!p.investBonus)p.investBonus={};p.investBonus.moraleBonus=2;if(p===G.player)addLog('🌾 Agriculture Durable : +2<i class=ri-morale></i>/tour !','gold');},
   applyCost(G,p){p.res.materials=Math.max(0,(p.res.materials||0)-2);p.res.science=Math.max(0,(p.res.science||0)-1);if(p===G.player)addLog('🌾 Agriculture Durable : −2<i class=ri-materials></i> −1<i class=ri-science></i>','red');}
  },
  {id:'inv_exp',name:'Expansion Rapide',emoji:'🚀',
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
  {id:'inv2_war',name:'Stratégie Guerrière',emoji:'⚔️',
   benefit:'Jetons retournent en 1 tour (au lieu de 2) — T7→T9',
   contrepartie:'−4<i class=ri-materials></i> −2<i class=ri-energy></i> immédiat',
   applyBenefit(G,p){if(!p.investBonus2)p.investBonus2={};p.investBonus2.fastCooldown=true;p.investBonus2.turnsLeft=4;if(p===G.player)addLog('⚔️ Stratégie Guerrière : jetons reviennent en 1 tour !','gold');},
   applyCost(G,p){p.res.materials=Math.max(0,(p.res.materials||0)-4);p.res.energy=Math.max(0,(p.res.energy||0)-2);if(p===G.player)addLog('⚔️ Stratégie Guerrière : −4<i class=ri-materials></i> −2<i class=ri-energy></i>','red');}
  },
  {id:'inv2_comfort',name:'Confort de la Population',emoji:'🕊️',
   benefit:'+4<i class=ri-morale></i>/tour pendant 3 tours',
   contrepartie:'−4<i class=ri-materials></i> immédiat',
   applyBenefit(G,p){if(!p.investBonus2)p.investBonus2={};p.investBonus2.moraleFlat=4;p.investBonus2.turnsLeft=4;if(p===G.player)addLog('🕊️ Confort : +4<i class=ri-morale></i>/tour pendant 3 tours !','gold');},
   applyCost(G,p){p.res.materials=Math.max(0,(p.res.materials||0)-4);if(p===G.player)addLog('🕊️ Confort : −4<i class=ri-materials></i>','red');}
  },
  {id:'inv2_colonies',name:'Colonies Avancées',emoji:'🏗️',
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
  {id:'inv2_union',name:'Union Sacrée',emoji:'🧠',
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
  {id:'cm_social', name:'Programmes Sociaux', emoji:'🌿', type:'social', repeatable:true,
   effect:'+2<i class=ri-morale></i> +1<i class=ri-science></i> immédiat', desc:'Bien-être et éducation publique.',
   resGain:{morale:2,science:1}, cost:{materials:2}},
  {id:'cm_calm', name:'Calmer la Population', emoji:'🕊️', type:'social', repeatable:true,
   effect:'+1<i class=ri-morale></i> −3 tension vers une nation', desc:'Festivals de paix — apaisement populaire ciblé.',
   calmAction:true, cost:{materials:1,energy:1}},
  {id:'cm_research', name:'Investissement dans la Recherche', emoji:'📖', type:'social', perTurn:true,
   effect:'+2<i class=ri-science></i> immédiat (1×/tour)', desc:'Subventions aux labos et universités.',
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
   effect:'+1 AC/tour. −2<i class=ri-morale></i> à l\'adoption.', desc:'Pouvoir autoritaire — efficacité par la contrainte.',
   govForm:{formPts:0,acBonus:1,adoptMorale:2}, cost:{}},
  {id:'gov_corpo', name:'Domination des Corporations', emoji:'🏢', type:'government',
   effect:'+5 pts Gouv. −1<i class=ri-morale></i> à l\'adoption.', desc:'Les conglomérats dirigent — ordre marchand.',
   govForm:{formPts:5,adoptMorale:1}, cost:{materials:2}},
  {id:'gov_senat', name:'Sénat Solaire', emoji:'⚖️', type:'government',
   effect:'+5 pts Gouvernement.', desc:'Élus de toutes les colonies et de la mère — décisions coordonnées.',
   govForm:{formPts:5}, cost:{materials:3}},
  {id:'gov_democratie', name:'Démocratie Directe', emoji:'🗳️', type:'government',
   effect:'+1<i class=ri-morale></i>/tour, +10 pts Gouv. Entretien −2<i class=ri-materials></i> −2<i class=ri-energy></i>/tour.', desc:'Vote permanent sur mobile — légitimité forte, coût de communication.',
   govForm:{formPts:10,moralePerTurn:1,upkeep:{materials:2,energy:2}}, cost:{materials:3,energy:2,science:1}},
];
/* Gagnant d'un événement : meilleur sur la CONDITION ; égalité départagée par VP le plus bas, puis le plus de jetons Force. */
function _evWinner(statFn){const allP=allPlayers();let w=allP[0];for(const p of allP){const s=statFn(p),bs=statFn(w);if(s>bs)w=p;else if(s===bs&&p!==w){const dv=calcVP(p).total-calcVP(w).total;if(dv<0||(dv===0&&p.forceTokens>w.forceTokens))w=p;}}return w;}
const EVENTS=[
  {id:'ruee',type:'competition',name:'Ruée Minière',emoji:'⛏️',preview:'La nation avec le plus de colonies gagne +6 VP. Si égalité en première place : les deux, si plus d\'égalités personne.',
   resolve(G){const h=_evTop(function(p){return p.colonies.length;});return 'Ruée Minière — '+_evAwardVP(h,6);}},
  {id:'storm',type:'menace',name:'Tempêtes Solaires',emoji:'🌩️',preview:'Sans IA Défensive, chaque nation perd 1 jeton Force, 1 route et 2<i class=ri-materials></i>.',
   resolve(G){let n=0;const pProt=hasSpec(G.player,'storm_immune');for(const p of allPlayers()){if(hasSpec(p,'storm_immune'))continue;p.forceTokens=Math.max(0,(p.forceTokens||0)-1);if(p.routes&&p.routes.length){p.routes.pop();updateConnections(p);}p.res.materials=Math.max(0,(p.res.materials||0)-2);n++;}return (pProt?'Tu as réussi à te protéger. ':'')+'Tempêtes Solaires — '+n+' nation(s) touchée(s) : −1 jeton, −1 route, −2<i class=ri-materials></i>.';}},
  {id:'pirates',type:'menace',name:'Prolifération des pirates',emoji:'☠️',preview:'Les pirates frappent les routes de la nation la plus riche en <i class=ri-materials></i> : les routes sans jeton sont détruites ; celles avec ont 50% de chance d\'être perdues, mais 2 au maximum.',
   resolve(G){const h=_evTop(function(p){return p.res.materials||0;});if(h.length!==1)return 'Prolifération des pirates — aucune cible claire.';const tgt=h[0];let unp=0,prot=0;const keep=[];for(const r of tgt.routes){if((r.tokens||0)>0){/* protégée : 50% chacune, MAX 2 perdues */ if(prot<2&&Math.random()<0.5){tgt.forceCooldown.push({count:r.tokens,returnTurn:getCooldownTurn(tgt)});prot++;}else keep.push(r);}else unp++;/* non protégée : détruite */}tgt.routes=keep;updateConnections(tgt);if((unp+prot)===0)return 'Prolifération des pirates — '+_evName(tgt)+' est la nation la plus riche en <i class=ri-materials></i> et devient la cible des pirates, mais AUCUNE route n\'est perdue.';
    return 'Prolifération des pirates — '+_evName(tgt)+' est visé (nation la plus riche en <i class=ri-materials></i>) et perd '+(unp+prot)+' route(s) : '+unp+' sans jeton détruite(s)'+(prot?', '+prot+' protégée(s) pillée(s) (max 2 — jetons en récupération)':'')+'.';}},
  {id:'sci',type:'competition',name:'Conférence Scientifique Solaire',emoji:'🔬',preview:'La nation avec la plus grande production de <i class=ri-science></i> gagne +6 VP.',
   resolve(G){const h=_evTop(_sciProd);return 'Conférence Scientifique — '+_evAwardVP(h,6);}},
  {id:'tech',type:'competition',name:'Développement Technologique',emoji:'⚗️',preview:'La nation avec le plus de technologies de niveau 2 et 3 gagne +6 VP.',
   resolve(G){const h=_evTop(function(p){return p.cards.filter(function(c){return c.branch&&c.tier>=2;}).length;});return 'Développement Technologique — '+_evAwardVP(h,6);}},
  {id:'attract',type:'opportunite',name:'Civilisation la plus attractive',emoji:'✨',preview:'La nation avec le plus de moral gagne +2<i class=ri-materials></i> +2<i class=ri-science></i> +3 VP. Si égalité en première place : les deux, si plus d\'égalités personne.',
   resolve(G){const h=_evTop(function(p){return p.res.morale||0;});if(h.length===0||h.length>=3)return 'Civilisation attractive — personne (trop d\'égalités).';h.forEach(function(p){const c=getResCapFor(p);p.res.materials=Math.min(c.materials,(p.res.materials||0)+2);p.res.science=Math.min(c.science,(p.res.science||0)+2);p.tempVP=(p.tempVP||0)+3;});return 'Civilisation attractive — '+h.map(_evName).join(' & ')+' → +2<i class=ri-materials></i> +2<i class=ri-science></i> +3 VP';}},
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
function maxAffordableTokens(p){
  if(!p)return 0;
  const mat=p.res.materials||0, en=p.res.energy||0;
  if(typeof hasSpec==='function'&&hasSpec(p,'nav2_war')) return Math.max(0,Math.min(2*mat+1,2*en));
  return Math.max(0,Math.min(mat,en));
}
function _sciProd(p){var s=(p.rpt&&p.rpt.science)||0;for(var i=0;i<p.colonies.length;i++){var c=p.colonies[i];if(!c.connected)continue;var n=NODES[c.nodeId];if(!n||n.decorative)continue;if((n.res||{}).science)s+=n.res.science;if(c.level>=3)s+=2;else if(c.level>=2)s+=1;}if(p.investBonus&&p.investBonus.sciBonus)s+=p.investBonus.sciBonus;return s;}
function _evTop(statFn){const all=allPlayers();let mx=-Infinity;for(const p of all){const s=statFn(p);if(s>mx)mx=s;}if(mx<=0)return[];return all.filter(function(p){return statFn(p)===mx;});}
function _evAwardVP(holders,vp){if(holders.length===0)return 'personne (aucune production).';if(holders.length>=3)return 'personne — trop d\'égalités ('+holders.length+' nations).';holders.forEach(function(p){p.tempVP=(p.tempVP||0)+vp;});return holders.map(_evName).join(' & ')+' → +'+vp+' VP';}
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
  G._peaceCooldown=G._peaceCooldown||{};G._peaceCooldown[aiId]=G.turn+(turns||3);
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
function _evAiInfo(ai){var pf=perceivedForce(G.player,ai);var s='🏆 '+calcVP(ai).total+' VP · ⚔️ '+pf.val+(pf.exact?'':'±3');if(getIntelLevel(G.player)>=2)s+=' · '+(ai.res.materials||0)+'<i class=ri-materials></i> '+(ai.res.energy||0)+'<i class=ri-energy></i> '+(ai.res.morale||0)+'<i class=ri-morale></i>';return s;}
/* `onDone` est un NOM de suite (bloc @flux) : il se sauvegarde, une fonction non. */
function showEventChoiceModal(ev,onDone){
  if(!ev){ if(onDone)fluxAppeler(onDone); return; }
  if(ev.id==='comm')showCommEventModal(onDone);
  else if(ev.id==='diplo')showDiploEventModal(onDone);
  else if(onDone)fluxAppeler(onDone);
}
function showCommEventModal(onDone){
  fluxDonnees().suiteAccord=(typeof onDone==='string'&&onDone)?onDone:null; _evCommDone=onDone;
  const cands=G.ais.filter(function(ai){return !ai.colonies.some(function(c){return G.commercialAccords.includes(c.nodeId);});});
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
  const col=part.colonies.find(function(c){return c.nodeId!==part.civ.home;})||part.colonies[0];
  if(col&&!G.commercialAccords.includes(col.nodeId))G.commercialAccords.push(col.nodeId);
  const _w=(G.wars||[]).find(function(w){return (w.a===prop.civ.id&&w.b===part.civ.id)||(w.a===part.civ.id&&w.b===prop.civ.id);});
  if(_w&&typeof _evEndWarWith==='function')_evEndWarWith(part.civ.id,3);
  setTens(prop.civ.id,part.civ.id,Math.max(0,getTens(prop.civ.id,part.civ.id)-3));
  setTens(part.civ.id,prop.civ.id,Math.max(0,getTens(part.civ.id,prop.civ.id)-3));
  prop.tempVP=(prop.tempVP||0)+3;part.tempVP=(part.tempVP||0)+3;
  if(typeof updateConnections==='function'){updateConnections(prop);updateConnections(part);}
  addLog('🤝 Accord commercial conclu : '+prop.civ.emoji+' '+prop.civ.name+' ↔ '+part.civ.emoji+' '+part.civ.name+' — +3 VP chacun, tension −3.','gold');
}
/* ACCORD COMMERCIAL = UNE PROPOSITION, PAS UNE DÉCISION UNILATÉRALE (règle posée par Marc).
   Avant : celui qui choisissait concluait l'accord tout seul ; l'autre ne voyait jamais de demande,
   il recevait simplement le même menu global — l'accord ne « marchait » que si, par hasard, il
   choisissait le premier en retour. Désormais : le partenaire HUMAIN reçoit une vraie DEMANDE
   (accepter / refuser), et ce n'est qu'après sa réponse que l'accord est conclu. Il garde ensuite
   son propre tour de choix parmi les nations restantes. Les IA répondent selon la règle existante
   (refus si le proposant est trop en avance et qu'elles ne sont pas en difficulté). */
function _evCommPick(aiId){
  const nomSuite=fluxDonnees().suiteAccord;   // le NOM, avant que `_accordSuite()` ne le consomme
  const done=_accordSuite()||_evCommDone;_evCommDone=null;_evCloseOverlay();
  const prop=G.player; // le proposant est la nation active AU MOMENT du choix : on le capture
  if(!aiId){addLog('🤝 Sommet commercial : aucun accord conclu.','dim');_appelerSuite(done);return;}
  const ai=(typeof allPlayers==='function'?allPlayers():G.ais).find(function(a){return a&&a.civ&&a.civ.id===aiId;});
  if(!ai){_appelerSuite(done);return;}
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
    fluxDonnees().accordProp=prop.civ.id;
    fluxDonnees().accordPart=ai.civ.id;
    fluxDonnees().suiteAccord=nomSuite;   // remise en place : la suite du tour se joue APRÈS la réponse
    return;
  }
  // Partenaire IA : règle existante — elle refuse si le proposant est trop en avance et qu'elle va bien.
  const gap=calcVP(prop).total-calcVP(ai).total;const weak=(ai.res.morale||0)<=2||_forceTotal(ai)<3;
  if(!weak&&gap>=8){addLog('🤝 '+ai.civ.emoji+' '+ai.civ.name+' refuse : tu es trop en avance ('+gap+' VP).','red');_appelerSuite(done);return;}
  _evAccordConclude(prop,ai);
  _appelerSuite(done);
}
/* ---- SUITES NOMMÉES DES FENÊTRES D'ACCORD (elles étaient des fermetures) ----
   Une fermeture ne se sauvegarde pas : une partie enregistrée pendant un sommet commercial ou
   diplomatique ne repartait pas. Le message d'erreur nommait la question perdue, mais c'est tout.
   Ces trois suites portent maintenant un nom, comme le reste du flux. */
function stAccordCommChoisi(ans){ _evCommPick(ans&&ans.aiId?ans.aiId:null); }
function stAccordReponse(ans){
  const d=fluxDonnees();
  const prop=allPlayers().find(p=>p.civ.id===d.accordProp);
  const part=allPlayers().find(p=>p.civ.id===d.accordPart);
  d.accordProp=null; d.accordPart=null;
  const ok=!!(ans&&(ans.value==='yes'||ans.targetId==='yes'||ans.id==='yes'||ans.accept===true));
  if(prop&&part){
    if(ok)_evAccordConclude(prop,part);
    else addLog('🤝 '+part.civ.emoji+' '+part.civ.name+' refuse la proposition de '+prop.civ.emoji+' '+prop.civ.name+'.','red');
    // Le proposant doit VOIR la réponse : notice personnelle (pas un simple message de journal).
    if(typeof _emitNotice==='function')_emitNotice('accord_result', prop,
      {title:ok?'🤝 Accord accepté':'🤝 Accord refusé',
       body:(ok?part.civ.emoji+' '+part.civ.name+' a ACCEPTÉ ton accord commercial — +3 VP chacun, tension −3.'
              :part.civ.emoji+' '+part.civ.name+' a REFUSÉ ton accord commercial.')}, 'stRien');
  }
  _appelerSuite(_accordSuite());
}
function stDiploChoisi(ans){
  _evDiploSel={};
  if(ans&&ans.selected){for(var i=0;i<ans.selected.length;i++)_evDiploSel[ans.selected[i]]=true;}
  _evDiploConfirm();
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
function _evDiploConfirm(){
  const done=_accordSuite()||_evDiploDone;_evDiploDone=null;
  for(const ai of G.ais){setTens('player',ai.civ.id,Math.max(0,getTens('player',ai.civ.id)-5));setTens(ai.civ.id,'player',Math.max(0,getTens(ai.civ.id,'player')-5));}
  let made=0;
  for(const ai of G.ais){
    if(!_evDiploSel[ai.civ.id])continue;
    const war=_warBetween(_moiId(),ai.civ.id);
    const needM=6; // coût uniforme : 6 matériaux par nation (plus de surcoût énergie en cas de guerre)
    if((G.player.res.materials||0)<needM){addLog('🕊️ Pas assez de matériaux pour le pacte avec '+ai.civ.name+' (6 requis).','red');continue;}
    G.player.res.materials-=needM;
    if(war)_evEndWarWith(ai.civ.id,4);
    G._nonAgg=G._nonAgg||{};G._nonAgg[ai.civ.id]=G.turn+4;
    G._peaceCooldown=G._peaceCooldown||{};G._peaceCooldown[ai.civ.id]=Math.max(G._peaceCooldown[ai.civ.id]||0,G.turn+4);
    setTens('player',ai.civ.id,0);setTens(ai.civ.id,'player',0);
    G.player.res.morale=Math.min(getResCapFor(G.player).morale,(G.player.res.morale||0)+1);made++;
    addLog('🕊️ Pacte de non-agression avec '+ai.civ.emoji+' '+ai.civ.name+' (4 tours).','gold');
  }
  _evCloseOverlay();
  if(made===0)addLog('🕊️ Sommet diplomatique : tension −5 partout (aucun pacte conclu).','dim');
  _appelerSuite(done);
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
function _tk(x){return x==='player'?((G.player&&G.player.civ&&G.player.civ.id)||'player'):x;}
function getTens(from,to){from=_tk(from);to=_tk(to);return((G.tensions[from]||{})[to])||0;}
function setTens(from,to,val){from=_tk(from);to=_tk(to);if(!G.tensions[from])G.tensions[from]={};G.tensions[from][to]=Math.max(0,Math.min(10,val));}
function addTens(from,to,delta){setTens(from,to,getTens(from,to)+delta);}
// Tension EFFECTIVE : si une guerre est active, la tension envers les AUTRES nations (hors-guerre) baisse de 6 (le peuple craint deux fronts).
function tensEff(from,to){from=_tk(from);to=_tk(to);var t=getTens(from,to);if(G.wars&&G.wars.length>0){var pid=(G.player&&G.player.civ&&G.player.civ.id);var other=(from===pid)?to:from;if(other!==pid&&!_warBetween(_moiId(),other))t=Math.max(0,t-6);}return t;}
function halveTensions(aId,bId){setTens(aId,bId,Math.ceil(getTens(aId,bId)/2));setTens(bId,aId,Math.ceil(getTens(bId,aId)/2));}
function resetTensions(aId,bId){setTens(aId,bId,0);setTens(bId,aId,0);}
// Modèle de guerre généralisé : canonique par nation (w.a, w.b = civ.id ; w.winsBy par civ.id)
// + vue dérivée côté G.player (w.aiId = l'autre nation ; w.wins = {player, ai}) pour ne pas réécrire
// les ~100 accès existants. Côté serveur, la rotation de G.player adapte automatiquement la vue.
function _warOther(w){const p=(G.player&&G.player.civ&&G.player.civ.id);return (w&&w.b===p)?w.a:(w?w.b:null);}
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
function mesGuerres(civId){
  const id=civId||((G.player&&G.player.civ&&G.player.civ.id)||null);
  return (G.wars||[]).filter(w=>w&&(w.a===id||w.b===id));
}
function getNodeOwnerAI(nodeId){return G.ais.find(ai=>ai.colonies.some(c=>c.nodeId===nodeId))||null;}
function recomputeGov(p){
  const prev=p.gov_level;
  p.gov_pts=(p.govPermPts||0)+(p.govFormPts||0);
  p.gov_level=p.gov_pts>=15?4:p.gov_pts>=10?3:p.gov_pts>=5?2:1;
  if(p.gov_level>prev&&p===G.player)addLog('🏛️ Gouvernement niveau '+p.gov_level+' ! (→'+p.gov_level+' AC base/tour)','gold');
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
function isTechExclusive(card){
  // Militaires = répétables. Civiques = chacun peut acheter 1×, non-exclusives globalement.
  // T3 de branche = exclusives (1 seul acheteur par partie).
  if(card.repeatable) return false;
  if(card.type==='civique') return false;
  return !card.branch||card.tier>=3;
}
function getEffCost(card,p){
  const c={...card.cost};
  if(p.civ.id==='martiens'){
    if((card.type==='military'||card.type==='militaire')&&c.energy)c.energy=Math.max(0,c.energy-1);
    if(card.type==='colonization'){if(c.materials)c.materials=Math.max(0,c.materials-1);if(c.energy)c.energy=Math.max(0,c.energy-1);}
  }
  if(card.branch&&p.civ.techBonus===card.branch&&c.science)c.science=Math.max(0,c.science-1);
  if(p.stratBonus&&p.stratBonus.spec==='strat_free_sci'&&card.type==='technology'&&c.science)c.science=0;
  return c;
}
function realResCap(p){return{energy:12,materials:20,science:10+(p._resCap||0),morale:10};}
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
// Cible principale d'une IA = nation HUMAINE la plus proche ayant des colonies.
// Solo : l'unique humain est G.player → comportement identique. Multijoueur : la nation humaine la plus proche.
function _aiResolveTarget(ai){
  const all=allPlayers();
  let pool=all.filter(p=>p!==ai && p._isAI===false && p.colonies && p.colonies.length>0);
  if(!pool.length)pool=all.filter(p=>p!==ai && p._isAI===false);
  if(!pool.length)return G.player; // filet : aucun humain identifié
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
  return{civ,res:{...civ.start},gov_pts:0,gov_level:1,govPermPts:0,govForm:null,govFormPts:0,govFormAC:0,govFormMorale:0,govFormUpkeep:null,acMax:2,acLeft:2,
    forceTokens:civ.startForce-(civ.extraStartCols?civ.extraStartCols.length:0),forceCooldown:[],cards:[],
    colonies:startCols,
    routes:startRoutes,rpt:{},govRpt:0,tempVP:0,abilityUsed:false,
    spentThisTurn:0,bonusMat:false,stratBonus:null,combatBonus:0,
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
  const civCards=CARDS_POOL.filter(c=>!c.branch&&c.type==='civique');
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
    commercialAccords:[],mapPanel:0,wormholeUsed:false,_pendingEvModal:null,
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
function showInvestmentModal(){
  if(typeof _ilHide==='function')_ilHide();
  // Chaque IA choisit STRATÉGIQUEMENT (le joueur choisit en dernier)
  for(const a of G.ais)a._inv1=chooseInvestmentForAI(a,1);
  G.aiInvest=G.ais[0]?G.ais[0]._inv1:null;   // ÉCHO d'affichage local — ne JAMAIS s'en servir pour une règle (dépend de la perspective)
  if(_decisionActive()){ // mode serveur : chaque HUMAIN choisit son investissement Niv.1 (les invités d'abord, puis l'hôte)
    const _invOpts=INVESTMENT_CARDS.map(c=>({id:c.id,name:c.name,emoji:c.emoji,benefit:c.benefit,contrepartie:c.contrepartie}));
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
    return`<div class="inv-opt" onclick="selectInvestment('${c.id}')">
      <div class="inv-opt-emoji">${c.emoji}</div>
      <div class="inv-opt-name">${c.name}${aiAlso?' <span style="color:#cc9944;font-size:.82em">(IA aussi)</span>':''}</div>
      <div class="inv-opt-benefit">✅ ${c.benefit}</div>
      <div class="inv-opt-cost">⚠️ ${c.contrepartie}</div>
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
  document.getElementById('inv2-opts').innerHTML=INVESTMENT_CARDS_2.map(card=>`
    <div class="inv-opt" onclick="selectInvestment2('${card.id}')">
      <div class="inv-opt-emoji">${card.emoji}</div>
      <div class="inv-opt-name">${card.name}</div>
      <div class="inv-opt-benefit">${card.benefit}</div>
      <div class="inv-opt-cost">⚠️ ${card.contrepartie}</div>
    </div>`).join('');
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
  if(pCard){pCard.applyBenefit(G,G.player);pCard.applyCost(G,G.player);}
  for(const a of G.ais){const ac=INVESTMENT_CARDS_2.find(c=>c.id===a._inv2);if(ac){ac.applyBenefit(G,a);ac.applyCost(G,a);}}
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
function showDysonModal(){
  document.getElementById('dyson-title').textContent='⚡ Sphère de Dyson construite !';
  document.getElementById('dyson-sub').innerHTML='Monopole énergétique (+5<i class=ri-energy></i>/tour). Les autres acceptent (+3<i class=ri-energy></i>/tour) ou c\'est la guerre.';
  // Pour chaque IA : accepte si tensions[ai.civ.id] < 3 ET revenus énergie faibles
  let html='';
  const warTriggered=[];
  for(const ai of G.ais){
    const tension=getTens(ai.civ.id,'player');
    const needsEnergy=(ai.rpt.energy||0)<2;
    const accepts=(tension<3&&needsEnergy)||tension<2;
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
  {const _refusing=G._dysonWarTargets||[];let _acc=0;for(const _ai of G.ais){if(!_refusing.includes(_ai.civ.id)){_ai.rpt.energy=(_ai.rpt.energy||0)+3;_acc++;}}if(_acc>0)addLog('🔋 '+_acc+' nation(s) acceptent le monopole et reçoivent +3<i class=ri-energy></i>/tour (partage énergétique).','dim');}
  if(G._dysonWarTargets&&G._dysonWarTargets.length>0){
    const names=G._dysonWarTargets.map(id=>{const ai=G.ais.find(a=>a.civ.id===id);return ai?ai.civ.emoji+' '+ai.civ.name:id;}).join(', ');
    addLog('<i class=ri-energy></i> Sphère de Dyson : '+names+' refus — Guerre !','red');
    G.warRisk=10;
    for(const _tgt of G._dysonWarTargets){declareWar('Sphère de Dyson — Guerre pour le contrôle de l\'énergie solaire !','dyson',_tgt);const _dw=_warBetween(_moiId(),_tgt);if(_dw)_dw.aiAggressor=true;} // TOUTES les nations refusantes entrent en guerre ET t'assaillent (agresseurs engagés)
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
    G.player.rpt.energy=(G.player.rpt.energy||0)+3;addLog('🔋 Partage énergétique : +3<i class=ri-energy></i>/tour pour toi.','gold');
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
  if(typeof cb==='function')cb();else render();
}
/* La nation espionnée, RECALCULÉE depuis le curseur (jamais `G.ais[0]`, qui dépend du point de vue).
   À défaut de cible désignée, on prend la nation la plus avancée en technologies : c'est celle qui
   vaut la peine d'être espionnée, et c'est un choix explicable — contrairement à « la première ». */
function _espCible(){
  const d=(typeof fluxDonnees==='function')?fluxDonnees():{};
  const tous=(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[])).filter(n=>n&&n!==G.player);
  if(d.espionCible){ const c=tous.find(n=>n.civ.id===d.espionCible); if(c)return c; }
  let best=null,bn=-1;
  for(const n of tous){ const k=(n.cards||[]).filter(c=>c.branch).length; if(k>bn){bn=k;best=n;} }
  return best||tous[0]||null;
}
function showEspionageChoiceModal(){
  const enemy=_espCible();
  if(!enemy){ addLog('🕵️ Espionnage : aucune nation à espionner.','dim'); _finishInvestmentsAfterEspionage(); return; }
  if(typeof fluxDonnees==='function')fluxDonnees().espionCible=enemy.civ.id;   // figé pour la réponse
  // Regrouper les cartes ennemies par branche
  const branches={};
  for(const c of enemy.cards){
    if(!c.branch)continue;
    if(!branches[c.branch])branches[c.branch]=[];
    branches[c.branch].push(c);
  }
  const entries=Object.entries(branches);
  if(!entries.length){
    // Pas de branche disponible — applique automatiquement le coût sans bénéfice
    const inv=INVESTMENT_CARDS.find(c=>c.id==='inv_esp');
    if(inv)inv.applyCost(G,G.player);
    addLog('🕵️ Espionnage : aucune branche ennemie à copier !','dim');
    _finishInvestmentsAfterEspionage();
    return;
  }
  const civName=enemy.civ.emoji+' '+enemy.civ.name;
  if(_decisionActive()){ // mode serveur : router le choix de branche à espionner
    _emitDecision('espionage', G.player,
      {target:enemy.civ.id, options:entries.map(([branchId,cards])=>({branch:branchId, name:BRANCH_NAMES[branchId]||branchId, cards:cards.map(c=>c.name)}))},
      applyEspionageChoice, (ans)=>(ans&&ans.branch)||entries[0][0]);
    return;
  }
  document.getElementById('espionage-modal-sub').textContent=
    'Copie une branche de '+civName+' (+6 risque de guerre).';
  const opts=entries.map(([branchId,cards])=>{
    const branchName=BRANCH_NAMES[branchId]||branchId;
    const cardList=cards.map(c=>c.emoji+' '+c.name).join(', ');
    return `<div class="inv-opt" onclick="applyEspionageChoice('${branchId}')">
      <div class="inv-opt-emoji">${cards[0].emoji||'<i class=ri-science></i>'}</div>
      <div class="inv-opt-name">${branchName}</div>
      <div class="inv-opt-benefit">${cardList}</div>
      <div class="inv-opt-cost">${cards.length} carte(s)</div>
    </div>`;
  }).join('');
  document.getElementById('espionage-branch-opts').innerHTML=opts;
  document.getElementById('espionage-modal').classList.remove('hidden');
}
function applyEspionageChoice(branchId){
  document.getElementById('espionage-modal').classList.add('hidden');
  const enemy=_espCible();
  if(!enemy){ _finishInvestmentsAfterEspionage(); return; }
  const branchCards=enemy.cards.filter(c=>c.branch===branchId);
  for(const c of branchCards){
    if(!G.player.cards.find(x=>x.id===c.id+'_esp')){
      const copy={...c,id:c.id+'_esp',espCopy:true};
      G.player.cards.push(copy);applyCard(copy,G.player);
      addLog('🕵️ Espionnage : copie '+c.emoji+' '+c.name,'gold');
    }
  }
  /* COÛT — TENSION RÉELLE ENVERS L'ESPION (corrigé le 2026-08-07, signalé par Marc : « espionnage
     n'a pas créé de tension chez l'autre joueur contre ma nation »).
     AVANT : `G.warRisk += 8` — un compteur GLOBAL de la partie, qui ne rendait personne hostile.
     MAINTENANT : la nation espionnée en veut à l'espion, nommément. L'espionnage est un acte
     diplomatique : la cible le VOIT (ligne de journal explicite), sinon elle subirait une hostilité
     qu'elle ne peut pas s'expliquer. */
  const civName=enemy.civ.emoji+' '+enemy.civ.name;
  if(typeof addTens==='function')addTens(enemy.civ.id,G.player.civ.id,4);
  G.warRisk=Math.min(10,(G.warRisk||0)+4);   // la galaxie se tend aussi, mais moitié moins qu'avant
  addLog('🕵️ Espionnage de '+G.player.civ.emoji+' '+G.player.civ.name+' contre '+civName
    +' — '+civName+' l\'a détecté : tension +4 envers '+G.player.civ.name+'.','red');
  if(typeof _journalAuto==='function')_journalAuto(G.player.civ.name,'Espionnage détecté',civName+' : tension +4');
  G.player._espFait=true; G.player._espEnAttente=false;
  _finishInvestmentsAfterEspionage();
}
function _finishInvestmentsAfterEspionage(){
  // Appliquer l'investissement IA si nécessaire, puis le modal de confirmation
  const aCard=INVESTMENT_CARDS.find(c=>c.id===(G.ais[0]&&G.ais[0]._inv1));   // affichage seulement
  for(const a of G.ais){const ac=INVESTMENT_CARDS.find(c=>c.id===a._inv1);if(ac){ac.applyBenefit(G,a);ac.applyCost(G,a);}}
  addLog('💼 Tour 3 : effets Investissement Niv.1 appliqués — actifs jusqu\'au tour 10 !','gold');
  const pCard=INVESTMENT_CARDS.find(c=>c.id===G.player._inv1);
  if(pCard)_journalAuto(G.player.civ.name,'Résolution investissement Niv.1',pCard.name);
  for(const a of G.ais){const ac2=INVESTMENT_CARDS.find(c=>c.id===a._inv1);if(ac2)_journalAuto(a.civ.name,'Résolution investissement Niv.1',ac2.name);}
  if(pCard)showInvestmentActiveModal(pCard,aCard);
}
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
  // Espionnage joueur : interception pour choix de branche
  /* ESPIONNAGE — ACTIVATION DIFFÉRÉE (décisions de Marc, 2026-08-07).
     Copier une BRANCHE ne vaut rien tant que personne n'a deux technologies dans la même : au tour 3
     c'est presque toujours le cas, et l'investissement était gâché. Le joueur peut donc ATTENDRE.
     Règles fixées par Marc : différé possible pour l'Espionnage SEUL ; date limite la fin du TOUR 3,
     après quoi il s'active AUTOMATIQUEMENT (ni perdu ni remboursé) ; un RAPPEL à chaque fin de tour
     tant qu'il n'est pas activé.
     ⚠️ Le marqueur vit dans la NATION (`_espEnAttente`), jamais dans `G` : c'est exactement le piège
     qui a fait confondre les investissements de deux joueurs (voir `selectInvestment`). */
  if(G.player._inv1==='inv_esp' && G.player._espFait!==true && G.turn<3 && G.player._espEnAttente!==false){
    G.player._espEnAttente=true;
    addLog('🕵️ Espionnage en réserve — tu peux l\'activer quand une nation aura deux technologies '
      +'dans la même branche. Activation automatique à la fin du tour 3.','gold');
    _finishInvestmentsAfterEspionage();
    return;
  }
  if(G.player._inv1==='inv_esp'){
    // L'IA applique son investissement en arrière-plan maintenant, le joueur choisit
    showEspionageChoiceModal();
    return; // Le reste se fait dans applyEspionageChoice/_finishInvestmentsAfterEspionage
  }
  const pCard=INVESTMENT_CARDS.find(c=>c.id===G.player._inv1);
  const aCard=INVESTMENT_CARDS.find(c=>c.id===(G.ais[0]&&G.ais[0]._inv1));     // affichage seulement
  if(pCard){pCard.applyBenefit(G,G.player);pCard.applyCost(G,G.player);}
  for(const a of G.ais){const ac=INVESTMENT_CARDS.find(c=>c.id===a._inv1);if(ac){ac.applyBenefit(G,a);ac.applyCost(G,a);}}
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
    addLog('🃏 Ordre du draft Stratégie (du plus faible au plus fort) : '
      + order.map((p,i)=>(i+1)+'. '+p.civ.name+' ('+calcVP(p).total+' VP, '+(p.forceTokens||0)+'⚔️)').join(' · '),'dim');
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
  G._stratOrder=order;
  G._stratPlayerRank=order.indexOf(G.player)+1;G._stratTotal=order.length;
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
  const nat=(typeof allPlayers==='function'?allPlayers():[G.player].concat(G.ais||[])).find(p=>p&&p.civ&&p.civ.id===cid)||ordre[0];
  _resolveStratChoice(nat, ans&&ans.cardId);
}
function _runDraftStep(){
  const order=G._stratOrder,pool=G._stratPool;if(!order){_startTurnBegin();return;}
  while(order.length){
    const nat=order[0];
    if(_isRemote(nat)){ // EN LIGNE : humain DISTANT (pivot) → relayer son choix de Stratégie
      /* SUITE NOMMÉE. La carte Stratégie est la question la PLUS FRÉQUENTE du jeu (une par joueur
         et par tour) : tant que sa suite était une fermeture, une partie enregistrée pendant le
         draft — c'est-à-dire une partie sur deux — ne redémarrait pas. La nation qui répond est
         rendue par le courtier (second argument), il n'y a donc rien à capturer. */
      _emitRemote('strategy', nat,
        {rank:order.length, total:G._stratTotal, options:pool.map(c=>({id:c.id,name:c.name,emoji:c.emoji,desc:c.desc,calmTension:c.calmTension||0}))},
        'stStrategieChoisie', null);
      return;
    }
    if(nat._isAI===false){ // une nation HUMAINE doit choisir
      if(_decisionActive()){ // mode serveur : router vers ce joueur
        _emitDecision('strategy', nat,
          {rank:order.length, total:G._stratTotal, options:pool.map(c=>({id:c.id,name:c.name,emoji:c.emoji,desc:c.desc,calmTension:c.calmTension||0}))},
          'stStrategieChoisie', null);
      } else { showStrategyModal(); } // solo : l'unique humain est G.player
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
  if(G._stratOrder&&G._stratOrder[0]===nat)G._stratOrder.shift();
  _runDraftStep();
}
function _playerStratDone(){
  const card=G._playerDraftCard;G._playerDraftCard=null;
  if(card&&G._stratPool){const i=G._stratPool.findIndex(c=>c.id===card.id);if(i>=0)G._stratPool.splice(i,1);}
  if(G._stratOrder&&G._stratOrder[0]===G.player)G._stratOrder.shift();
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
  if(!rank&&Array.isArray(G._stratOrder)){ const i=G._stratOrder.indexOf(G.player); if(i>=0) rank=i+1; }
  const total=G._stratTotal||_tous.length;
  const rangTxt=rank?(rank+(rank===1?'er':'e')+'/'+total):('position inconnue sur '+total);
  document.getElementById('strat-sub').innerHTML='Draft : à toi en '+rangTxt+' — '+pool.length+' carte(s) proposée(s).'+_tensionMiniHtml();
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
function startTurn(){ _startTurnPrep(); _startTurnBegin(); }
// PRÉPARATION DU TOUR (avant le choix des cartes Stratégie) : remet à jour les revenus déjà
// encaissés, les jetons revenus de récupération, les points de gouvernement ET surtout le NOMBRE
// D'ACTIONS (AC), pour que tout soit à jour AVANT que le joueur ne choisisse sa stratégie.
function _startTurnPrep(){
  if(G._prepDoneTurn===G.turn)return; // une seule préparation par tour
  G._prepDoneTurn=G.turn;
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
  G.player.spentThisTurn=0;G.player.combatBonus=0;G.ais.forEach(ai=>{ai.spentThisTurn=0;ai.combatBonus=0;});
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
      if(p.investBonus.turnsLeft<=0){
        p.investBonus.matX2=false;p.investBonus.sciX2=false;p.investBonus.matHalf=false;p.investBonus.moraleBonus=0;
        if(p===G.player)addLog('⌛ Investissement Niv.1 expiré (T3→T5 couverts).','dim');
      }
    }
  }
  // Décompte turnsLeft investissement Niv.2 (T7→T9 : 3 tours effectifs)
  for(const p of allPlayers()){
    if(p.investBonus2&&p.investBonus2.turnsLeft!==undefined){
      p.investBonus2.turnsLeft--;
      if(p.investBonus2.turnsLeft<=0){
        p.investBonus2.fastCooldown=false;p.investBonus2.moraleX2=false;
        if(p===G.player)addLog('⌛ Investissement Niv.2 expiré (T7→T9 couverts).','dim');
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
    const maxDef=Math.max(0,Math.min(ennemi.forceTokens||0, ennemi.res.materials||0, ennemi.res.energy||0));
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
function _invOptions(){ return _invCartes().map(c=>({id:c.id,name:c.name,emoji:c.emoji,benefit:c.benefit,contrepartie:c.contrepartie})); }
function _invChamp(){ return (fluxDonnees().niveauInvest===2)?'_inv2':'_inv1'; }
/* TOUS LES HUMAINS CHOISISSENT LEUR INVESTISSEMENT EN MÊME TEMPS.
   Même raison que l'agenda : le choix est secret et indépendant, faire la queue n'apportait rien.
   Le joueur LOCAL est traité comme les autres — sa réponse ne fait plus avancer le tour à elle
   seule. C'est `_investTermine()`, joué à la DERNIÈRE réponse, qui enchaîne : un seul chemin de
   sortie, donc pas de version « locale » et de version « distante » qui finiraient par diverger. */
function stInvestDemander(){
  const d=fluxDonnees(), niv=d.niveauInvest||1, champ=_invChamp(), kind='invest'+niv;
  const local=(G.player&&G.player.civ)?G.player.civ.id:null;
  const distants=(d.fileInvest||[]).slice();
  const tous=distants.concat((local && distants.indexOf(local)<0)?[local]:[]);
  d.fileInvest=[]; d.investCiv=null; d.investRestants=tous.slice();
  if(!tous.length){ _investTermine(); return; }
  for(const civId of tous){
    const nat=(civId===local)?G.player:G.ais.find(a=>a.civ.id===civId);
    if(!nat){ const r=d.investRestants; const i=r.indexOf(civId); if(i>=0)r.splice(i,1); continue; }
    if(civId===local) _emitDecision(kind, nat, {ai:G.ais.filter(a=>a._isAI!==false).map(a=>({civ:a.civ.id,pick:a[champ]})), options:_invOptions()}, 'stInvestRecu', null);
    else _emitRemote(kind, nat, {options:_invOptions()}, 'stInvestRecu');
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
fluxDeclarer('stInvestDemander', stInvestDemander);
fluxDeclarer('stInvestRecu', stInvestRecu);
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
    // POURSUITE DE LA GUERRE. Règle (Marc) : ta fenêtre d'ASSAUT ne s'ouvre QUE si TU es l'agresseur.
    // Si c'est l'AUTRE nation qui a déclaré la guerre, c'est ELLE qui attaque : tu n'as alors que le
    // choix DÉFENSIF (combien de jetons engager, déployer ou non ton Supercroiseur) — ce qui permet la
    // guerre d'usure : sur-défendre pour lui coûter ses jetons et attendre d'être en position d'attaquer.
    const _jeSuisAgresseur=(war.declaredBy==='player'||war.declaredBy==='dyson');
    if(!_jeSuisAgresseur){ guerreAssautIAPuisSuivante(); return; }
    showWarCombatModal('guerreCombatLiveChoisi');
    return;
  }
  showWarCombatModal('guerreCombatClassiqueChoisi');
}
/* L'ennemi frappe à son tour, puis on passe à la guerre suivante. Fonction NOMMÉE : c'est ce qui
   remplace `()=>maybeAiAssaultPlayer(warEnemy,()=>processOngoing(idx+1))` et sa double capture. */
function guerreAssautIAPuisSuivante(){ maybeAiAssaultPlayer(guerreEnnemi(), 'guerreSuivante'); }

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
    const maxDef=Math.max(0,Math.min(_def.forceTokens||0,_def.res.materials||0,_def.res.energy||0));
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
  if(war&&(war.declaredBy==='player'||war.declaredBy==='dyson')){
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
  refillGeneralRiver();
  if(G.curEvent){
    const evMsg=G.curEvent.resolve(G);
    if(evMsg)addLog('🎯 ÉVÉNEMENT '+G.curEvent.emoji+' '+G.curEvent.name+' : '+evMsg,'gold');
    if(evMsg)_journalAuto(G.player.civ.name,'Événement : '+G.curEvent.name,evMsg);
    G._pendingEvModal={ev:G.curEvent,msg:evMsg};
  }
  G._lastEOT={maint,revs}; // mémorisé pour ré-affichage sûr en cas de reprise (manquait côté solo)
  // ORDRE (Marc) : l'ÉVÉNEMENT de fin de tour — son RÉSULTAT à valider, ou son ACTION (accords
  // commerciaux / diplomatiques) — est présenté AVANT le bilan de fin de tour. Le plafonnement des
  // ressources se fait au DÉBUT du tour suivant (continueAfterEOT).
  _resolveEndTurnEvent('stBilanDeTour');
}
function stBilanDeTour(){ _espionnageRappel(); const e=G._lastEOT||{}; showEOTModal(e.maint,e.revs,null,null); }
/* RAPPEL DE FIN DE TOUR pour l'espionnage encore en réserve, et activation d'office au tour 3.
   Sans rappel, un investissement mis de côté s'oublie — et c'est justement pour ne PAS l'oublier
   que Marc a demandé le report. Au tour 3 le message annonce que c'est le DERNIER. */
function _espionnageRappel(){
  for(const p of (typeof allPlayers==='function'?allPlayers():[G.player])){
    if(!p||p._isAI||p._inv1!=='inv_esp'||p._espFait||p._espEnAttente!==true)continue;
    if(G.turn>=3){
      p._espEnAttente=false;
      addLog('🕵️ '+p.civ.emoji+' '+p.civ.name+' — dernier tour pour l\'espionnage : il s\'active MAINTENANT.','red');
      if(p===G.player&&typeof showEspionageChoiceModal==='function'){ p._espFait=true; showEspionageChoiceModal(); }
    }else{
      addLog('🕵️ '+p.civ.emoji+' '+p.civ.name+' — espionnage toujours en réserve. Il s\'activera '
        +'automatiquement à la fin du tour 3'+(G.turn===2?' — c\'est le PROCHAIN tour.':'.'),'gold');
    }
  }
}
fluxDeclarer('_espionnageRappel', _espionnageRappel);
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
  for(const p of allPlayers()){ p._passedRound=false; p._aiSetupDone=false; p._turnActions=[]; p._raidsThisTurn=[]; }
  G._ilIdx=0; G._humanActive=false; G._ilLines=[]; G._ilMarkEntry=(G.log&&G.log[0])||null; G._turnMarkEntry=(G.log&&G.log[0])||null;
  /* ⚠️ LA LIGNE D'INITIATIVE ÉTAIT ÉCRITE APRÈS LE `return` DU MODE SERVEUR — donc JAMAIS en
     multijoueur (demande de Marc, 2026-08-07 : « ajouter dans journal qui est désigné par le hasard
     comme premier joueur du tour »). Elle est remontée ici, avant le retour, et nomme les nations
     plutôt que « Toi » : le journal est LU PAR TOUS, « Toi » n'y veut rien dire. */
  addLog('━ Initiative du tour '+G.turn+' : '+G._order.map(n=>n.civ.emoji+' '+n.civ.name).join(' › ')
    +' — '+G._order[0].civ.name+' commence ━','dim');
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
function runEndOfRound(){
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
  enforceCaps(); // DÉBUT DU TOUR SUIVANT : ressources plafonnées à leur maximum (12⚡ / 20🪨 / 10🔬 / 10🙂)
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
  d.fileAccords=allPlayers().filter(p=>!p._isAI).map(p=>p.civ.id);
  d.nationAvantAccords=G.player&&G.player.civ?G.player.civ.id:null;
  stAccordsSuivant();
}
function stAccordsSuivant(){
  const d=fluxDonnees(), file=d.fileAccords||[];
  if(!file.length){
    if(d.nationAvantAccords)_evSwap(d.nationAvantAccords);
    d.fileAccords=null; d.nationAvantAccords=null;
    stApresEvenement();
    return;
  }
  const civId=file.shift(); d.fileAccords=file;
  _evSwap(civId);
  showEventChoiceModal(_evCourant(), 'stAccordsSuivant');
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
  for(const p of allPlayers()){
    if(p.civ.id==='ceinturiens')continue; // les pirates ne pillent pas les Ceinturiens (ils font du commerce avec eux)
    if(hasSpec(p,'ia_immune')||hasSpec(p,'intel_2')){if(p===G.player)addLog('🛡️ Routes immunisées contre les pirates (Réseau Orbital / IA Défensive).','gold');continue;}
    // Routes non protégées (sans jeton Force) : chacune risque d'être pillée ET DÉTRUITE (à reconstruire).
    // Une route est protégée si elle a un jeton OU si un allié a déjà un jeton sur le même segment (surveillance partagée).
    const _guarded=function(r){return allPlayers().some(function(o){return o!==p&&o.routes.some(function(or){return (or.tokens||0)>0&&((or.from===r.from&&or.to===r.to)||(or.from===r.to&&or.to===r.from));});});};
    const unprotected=p.routes.filter(r=>(r.tokens||0)===0&&!_guarded(r));
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
  }
  if(attacked){
    // Risque guerre +1 avec Ceinturiens (lore : ils soutiennent les pirates en secret)
    const ceinturAI=G.ais.find(a=>a.civ.id==='ceinturiens');
    if(ceinturAI){
      // ⚠️ `'player'` en dur ciblait « celui qui est actif à cet instant », pas la nation réellement
      // pillée. On monte la tension de CHAQUE nation attaquée envers les Ceinturiens.
      for(const v of allPlayers()){ if(v!==ceinturAI) addTens(v.civ.id,ceinturAI.civ.id,1); }
      addLog('☠️ Tension vs Ceinturiens +1 (soutien secret aux pirates)','dim');
    }else{
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
    if(_m===0){p._civilWar=true;addLog(p===G.player?'💥 GUERRE CIVILE ! Moral 0 — aucune ressource ce tour.':'💥 Guerre civile IA (moral 0).','red');}
    else if(_m===1){p._halfResources=true;if(p===G.player)addLog('⚠️ Moral critique (1) — ressources ÷2 ce tour.','red');}
  }
}
function doMaintenance(){
  const result={energyCost:0,matCost:0,routeEnergyCost:0,routeMatGain:0,moraleLostCols:0,moraleLostRoutes:0};
  for(const p of allPlayers()){
    const disc=(p.stratBonus&&p.stratBonus.upkeepDiscount)||0;
    /* ENTRETIEN D'UNE COLONIE HORS BASE (barème révisé par Marc le 2026-08-07) :
         Nv.1 → 1⚡          Nv.2 → 1⚡ + 1🪨          Nv.3 → 1⚡ + 2🪨
       AVANT, l'énergie suivait le niveau (1, 2 puis 3⚡) : monter ses colonies coûtait si cher en
       énergie que l'amélioration devenait un piège — c'est le constat de Marc en jouant.
       L'énergie est donc FIXE à 1 par colonie, quel que soit le niveau ; c'est le coût en MATÉRIAUX
       (inchangé : 0, 1, 2) qui porte désormais seul la progression.
       ⚠️ Le commentaire précédent annonçait « Nv1 = 0⚡ » : il était FAUX depuis longtemps, le code
       facturait bien 1⚡ au niveau 1. Ne pas se fier au commentaire sans lire la ligne. */
    // Jupitériens : stations orbitales joviennes (jorbital*) = sans entretien (traitées comme base)
    const extraCols=p.colonies.filter(c=>{
      if(c.nodeId===p.civ.home)return false;
      if(p.civ.id==='jupiteriens'&&c.nodeId.startsWith('jorbital'))return false;
      return true;
    });
    let totalEnergy=0,totalMat=0;
    const freeUpk=(p.investBonus2&&(p.investBonus2.freeUpkeep||0)>0);
    const _terra=hasSpec(p,'terra3'),_bio=hasSpec(p,'bio2_bonus');
    for(const col of extraCols){
      const lvl=col.level;
      if(lvl>=2&&_terra)continue;                     // Terraformation : colonies Nv.2-3 sans AUCUN entretien
      if(!(lvl>=2&&(_bio||_terra)))totalEnergy+=1;    // 1⚡ par colonie, quel que soit le niveau. Biosphère Avancée : colonies Nv.2-3 sans entretien énergie
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
        addLog(p===G.player?'💥 GUERRE CIVILE ! Moral 0 — aucune ressource ce tour.':'💥 Guerre civile IA (moral 0).','red');
      }else if(_m===1){
        p._halfResources=true;
        if(p===G.player)addLog('⚠️ Moral critique (1) — ressources ÷2 ce tour.','red');
      }
    };
    // Payer énergie colonies
    const payE=Math.min(totalEnergy,p.res.energy||0);p.res.energy-=payE;
    const missE=totalEnergy-payE;if(missE>0){p.res.morale=Math.max(0,(p.res.morale||0)-missE);}
    // Payer matériaux colonies
    const payM=Math.min(totalMat,p.res.materials||0);p.res.materials-=payM;
    const missM=totalMat-payM;if(missM>0){p.res.morale=Math.max(0,(p.res.morale||0)-missM);}
    if(p===G.player){result.energyCost=totalEnergy;result.matCost=totalMat;result.moraleLostCols=missE+missM;}
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
    if(p===G.player){result.routeEnergyCost=_coutRoutes;result.routeMatGain=payRE;result.moraleLostRoutes=0;}
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
  const g={energy:0,materials:0,science:0,morale:0};const inc=[],mal=[];
  // colonies connectées
  for(const c of p.colonies){
    if(!c.connected)continue;const n=NODES[c.nodeId];if(!n||n.decorative)continue;
    const _mult=c.level>=3?2:(c.level>=2?1.5:1);
    const o={};for(const r in n.res){const _v=Math.floor(n.res[r]*_mult);o[r]=(o[r]||0)+_v;g[r]=(g[r]||0)+_v;}
    if(c.level>=3){o.morale=(o.morale||0)+2;g.morale+=2;}else if(c.level>=2){o.morale=(o.morale||0)+1;g.morale+=1;}
    if(hasSpec(p,'bio2_bonus')){o.materials=(o.materials||0)+1;g.materials+=1;}
    if(hasSpec(p,'terra3')){o.materials=(o.materials||0)+1;o.morale=(o.morale||0)+1;g.materials+=1;g.morale+=1;}
    let lv=0;if(c.level>=3)lv=2;else if(c.level>=2)lv=1;if(lv){o.science=(o.science||0)+lv;g.science+=lv;}
    inc.push('🏙️ '+(n.name||c.nodeId)+' (Nv.'+(c.level||1)+') : '+fmt(o));
  }
  // colonies connectées via réseau étranger
  for(const c of p.colonies){
    if(!c.foreignConnected)continue;const n=NODES[c.nodeId];if(!n||n.decorative)continue;
    const o={};for(const r in n.res){o[r]=(o[r]||0)+n.res[r];g[r]=(g[r]||0)+n.res[r];}
    o.morale=(o.morale||0)-1;g.morale-=1;g.materials=Math.max(0,g.materials-1);
    inc.push('🔗 '+(n.name||c.nodeId)+' (connexion étrangère) : '+fmt(o)+' <span style="color:#ff8a8a">−1<i class=ri-morale></i> −1<i class=ri-materials></i></span>');
  }
  // accords commerciaux
  if(G.commercialAccords&&G.commercialAccords.length>0){const k=G.commercialAccords.length;g.materials+=k;g.morale+=k;inc.push('🤝 Accords commerciaux ×'+k+' : +'+k+'<i class=ri-materials></i> +'+k+'<i class=ri-morale></i>');}
  // revenus permanents (techs/cartes)
  if(p.rpt){const o={};let any=false;for(const r in p.rpt)if(p.rpt[r]){o[r]=p.rpt[r];g[r]=(g[r]||0)+p.rpt[r];any=true;}if(any)inc.push('<i class=ri-science></i> Bonus techs/cartes : '+fmt(o));}
  // investissements
  if(p.investBonus&&(p.investBonus.turnsLeft===undefined||p.investBonus.turnsLeft>0)){
    if(p.investBonus.matX2&&g.materials){g.materials=Math.floor(g.materials*2);inc.push('🏭 Industrialisation : <i class=ri-materials></i> ×2');}
    if(p.investBonus.sciX2&&g.science){g.science=Math.floor(g.science*2);inc.push('<i class=ri-science></i> Recherche Intensive : <i class=ri-science></i> ×2');}
    if(p.investBonus.matHalf&&g.materials){g.materials=Math.floor(g.materials/2);mal.push('🏗️ Colonies Avancées : <i class=ri-materials></i> ÷2');}
    if(p.investBonus.moraleBonus){g.morale+=p.investBonus.moraleBonus;inc.push('🌾 Agriculture Durable : +'+p.investBonus.moraleBonus+'<i class=ri-morale></i>');}
  }
  if(p.investBonus2&&(p.investBonus2.turnsLeft===undefined||p.investBonus2.turnsLeft>0)){
    if(p.investBonus2.moraleX2&&g.morale){g.morale=Math.floor(g.morale*2);inc.push('🕊️ Confort Population : <i class=ri-morale></i> ×2');}
  }
  // ── ENTRETIEN & MALUS PERMANENTS ──
  const extraCols=p.colonies.filter(c=>c.nodeId!==p.civ.home&&!(p.civ.id==='jupiteriens'&&String(c.nodeId).startsWith('jorbital')));
  let upE=0,upM=0;const _terraU=hasSpec(p,'terra3'),_bioU=hasSpec(p,'bio2_bonus');for(const c of extraCols){const lvl=c.level||1;if(lvl>=2&&_terraU)continue;/*Terraformation : Nv2-3 aucun entretien*/if(!(lvl>=2&&(_bioU||_terraU)))upE+=lvl;/*Biosphère : Nv2-3 sans entretien énergie*/upM+=lvl>=3?2:lvl>=2?1:0;}
  upE=Math.max(0,upE-((p.stratBonus&&p.stratBonus.upkeepDiscount)||0));
  if(p.investBonus2&&(p.investBonus2.freeUpkeep||0)>0)mal.push('🏙️ Entretien colonies : gratuit ('+p.investBonus2.freeUpkeep+' tour(s) restants)');
  else if(upE||upM)mal.push('🏙️ Entretien colonies : '+[upE?'−'+upE+'<i class=ri-energy></i>':'',upM?'−'+upM+'<i class=ri-materials></i>':''].filter(Boolean).join(' '));
  const nr=p.routes.length;
  if(nr){if(hasSpec(p,'route_force_free'))mal.push('🛤️ Routes ×'+nr+' : entretien gratuit (Hyperpropulsion) +'+nr+'<i class=ri-materials></i>');else mal.push('🛤️ Routes ×'+nr+' : −'+nr+'<i class=ri-energy></i> +'+nr+'<i class=ri-materials></i>');}
  if(p.govFormUpkeep){const o={};for(const r in p.govFormUpkeep)o[r]=-p.govFormUpkeep[r];mal.push('🗳️ Forme de gouvernement : '+fmt(o)+'/tour');}
  if(hasSpec(p,'empath_tele')&&G.warState==='active')mal.push('🧬 Télépathie (en guerre) : −2<i class=ri-morale></i>/tour');
  const m=(p.res.morale||0);
  if(m===0)mal.push('💥 Moral 0 : GUERRE CIVILE — aucun revenu ce tour !');
  else if(m===1)mal.push('⚠️ Moral 1 : revenus ÷2 ce tour');
  // ── HTML ──
  let h='<div style="font-weight:700;color:#cdd8ff;margin-bottom:5px">📊 Revenu par tour</div>';
  h+='<div style="color:#7fe0a0;margin-bottom:2px;font-weight:600">Sources</div>';
  h+=inc.length?inc.map(l=>'<div>'+l+'</div>').join(''):'<div style="color:#7a88a8">Aucune colonie connectée.</div>';
  if(mal.length){h+='<div style="color:#ff9a8a;margin:6px 0 2px;font-weight:600">Entretien / malus</div>';h+=mal.map(l=>'<div style="color:#ffb3a3">'+l+'</div>').join('');}
  /* Total : on affiche le BRUT (somme des sources) puis le vrai NET, entretien déduit.
     Le net vient de _netIncome() — la même fonction que la barre du haut et le menu Empire,
     pour qu'il n'existe qu'un seul calcul de revenu net dans tout le jeu. */
  const _netTip=(typeof _netIncome==='function')?_netIncome(p):g;
  /* Le net doit rester lisible même à 0 ou en négatif : on affiche toute ressource
     présente dans le brut OU dans le net (sinon une déduction qui ramène à 0 disparaît). */
  const fmtNet=(o,ref)=>['materials','energy','science','morale'].filter(r=>o[r]||ref[r])
    .map(r=>'<span style="color:'+((o[r]||0)<0?'#ff6b6b':(o[r]||0)>0?'#7fe0a0':'#8898b8')+'">'+((o[r]||0)>0?'+':'')+(o[r]||0)+E[r]+'</span>').join(' ')||'—';
  h+='<div style="border-top:1px solid #2a3a5a;margin-top:6px;padding-top:4px;color:#9fb0d0">Total brut (avant entretien) : '+fmt(g)+'</div>';
  h+='<div style="font-weight:700;color:#dfe8ff">Revenu net (entretien déduit) : '+fmtNet(_netTip,g)+'</div>';
  return h;
}
// Revenu NET estimé du prochain end-of-turn, PAR ressource (revenus BRUTS − entretien colonies/routes/gouv,
// règles de moral incluses). Sert à l'aperçu barre du haut + menu Empire. Estimation (≈) : l'entretien
// routes suppose toutes les routes alimentées ; les pénalités de moral pour entretien impayé ne sont pas déduites.
function _netIncome(p){
  const g={energy:0,materials:0,science:0,morale:0};
  if(!p||!p.civ) return g;
  const _terra=hasSpec(p,'terra3'),_bio=hasSpec(p,'bio2_bonus');
  for(const c of p.colonies){
    if(!c.connected) continue; const n=NODES[c.nodeId]; if(!n||n.decorative) continue;
    const mult=c.level>=3?2:(c.level>=2?1.5:1);
    for(const r in n.res) g[r]=(g[r]||0)+Math.floor(n.res[r]*mult);
    if(c.level>=3){g.morale+=2;g.science+=2;} else if(c.level>=2){g.morale+=1;g.science+=1;}
    if(_bio) g.materials+=1;
    if(_terra){g.materials+=1;g.morale+=1;}
    if(p.civ.id==='jupiteriens'&&['io','europe','ganymede','callisto'].includes(c.nodeId)) g.energy+=1;
  }
  if(G.commercialAccords&&G.commercialAccords.length){g.materials+=G.commercialAccords.length;g.morale+=G.commercialAccords.length;}
  if(p.civ.id==='ceinturiens') g.energy+=1;
  if(p.rpt) for(const r in p.rpt) g[r]=(g[r]||0)+(p.rpt[r]||0);
  if(p.investBonus&&(p.investBonus.turnsLeft===undefined||p.investBonus.turnsLeft>0)){
    if(p.investBonus.matX2&&g.materials>0) g.materials=Math.floor(g.materials*2);
    if(p.investBonus.sciX2&&g.science>0) g.science=Math.floor(g.science*2);
    if(p.investBonus.matHalf&&g.materials>0) g.materials=Math.floor(g.materials/2);
    if(p.investBonus.moraleBonus) g.morale+=p.investBonus.moraleBonus;
  }
  if(p.investBonus2&&(p.investBonus2.turnsLeft===undefined||p.investBonus2.turnsLeft>0)&&p.investBonus2.moraleX2&&g.morale>0) g.morale=Math.floor(g.morale*2);
  // Règles de moral (appliquées aux REVENUS) : 0 = guerre civile (rien), 1 = ÷2.
  const m=(p.res.morale||0);
  if(m===0){ g.energy=0;g.materials=0;g.science=0;g.morale=0; }
  else if(m===1){ for(const r of ['energy','materials','science','morale']) g[r]=Math.floor((g[r]||0)/2); }
  // ENTRETIEN (déduit après) — colonies hors base
  const extraCols=p.colonies.filter(c=>c.nodeId!==p.civ.home&&!(p.civ.id==='jupiteriens'&&String(c.nodeId).startsWith('jorbital')));
  /* ⚠️ MÊME BARÈME QUE `doMaintenance` — c'est une SECONDE implémentation du même calcul, et elle a
     déjà divergé par le passé (bug du revenu net, une semaine perdue). Toute modification du barème
     doit toucher LES DEUX. 1⚡ par colonie quel que soit le niveau, matériaux 0/1/2. */
  let upE=0,upM=0; for(const c of extraCols){const lvl=c.level||1; if(lvl>=2&&_terra)continue; if(!(lvl>=2&&(_bio||_terra)))upE+=1; upM+=lvl>=3?2:lvl>=2?1:0;}
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
function doRevenues(){
  let playerGains={};
  for(const p of allPlayers()){
    if(p._civilWar){p._civilWar=false;continue;}
    const gains={};
    const caps=getResCapFor(p);
    // Colonies connectées via réseau étranger (accord commercial) — malus
    if(p===G.player){
      for(const col of p.colonies){
        if(!col.foreignConnected)continue;
        const node=NODES[col.nodeId];
        if(node.decorative)continue;
        for(const[r,a]of Object.entries(node.res)){gains[r]=(gains[r]||0)+a;}
        // Malus connexion étrangère : −1<i class=ri-morale></i> −1<i class=ri-materials></i> (min 0<i class=ri-materials></i>)
        gains.morale=(gains.morale||0)-1;
        const matGain=gains.materials||0;
        gains.materials=Math.max(0,matGain-1);
        addLog('🔗 '+node.name+' (connexion étrangère) — revenus avec malus −1<i class=ri-morale></i> −1<i class=ri-materials></i>','dim');
      }
    }
    for(const col of p.colonies){
      if(!col.connected)continue;
      const node=NODES[col.nodeId];
      if(node.decorative)continue;
      // v18 : ressources du nœud × niveau (×1 / ×1,5 / ×2)
      const _mult=col.level>=3?2:(col.level>=2?1.5:1);
      for(const[r,a]of Object.entries(node.res)){
        gains[r]=(gains[r]||0)+Math.floor(a*_mult);
      }
      // v18 : bonus moral RÉCURRENT par niveau — Nv2 +1<i class=ri-morale></i>/tour, Nv3 +2<i class=ri-morale></i>/tour
      if(col.level>=3)gains.morale=(gains.morale||0)+2;
      else if(col.level>=2)gains.morale=(gains.morale||0)+1;
      // Biosphère Avancée : +1<i class=ri-materials></i>/tour par colonie connectée
      if(hasSpec(p,'bio2_bonus'))gains.materials=(gains.materials||0)+1;
      // Terraformation : +1<i class=ri-materials></i> +1<i class=ri-morale></i>/tour par colonie connectée
      if(hasSpec(p,'terra3')){gains.materials=(gains.materials||0)+1;gains.morale=(gains.morale||0)+1;}
      // Hub technologique : savoir par niveau (conservé pour ne pas assécher la science)
      if(col.level>=3)gains.science=(gains.science||0)+2;
      else if(col.level>=2)gains.science=(gains.science||0)+1;
      if(p.civ.id==='jupiteriens'&&['io','europe','ganymede','callisto'].includes(col.nodeId))gains.energy=(gains.energy||0)+1;
      // (Retiré : plus de jeton Force par nœud stratégique/tour. Désormais +1 jeton UNE FOIS à l'acquisition d'une colonie.)
    }
    // Accord commercial actif : +1<i class=ri-materials></i> +1<i class=ri-morale></i> par accord (les deux nations)
    if(G.commercialAccords.length>0){
      gains.materials=(gains.materials||0)+G.commercialAccords.length;
      gains.morale=(gains.morale||0)+G.commercialAccords.length;
      if(p===G.player)addLog('🤝 Accord commercial : +'+G.commercialAccords.length+'<i class=ri-materials></i> +'+G.commercialAccords.length+'<i class=ri-morale></i>','dim');
    }
    if(p.civ.id==='ceinturiens')gains.energy=(gains.energy||0)+1; // réserves de la ceinture
    for(const[r,a]of Object.entries(p.rpt))gains[r]=(gains[r]||0)+a;
    // Bonus investissement Niv.1 (actif si turnsLeft > 0 ou non défini)
    if(p.investBonus&&(p.investBonus.turnsLeft===undefined||p.investBonus.turnsLeft>0)){
      if(p.investBonus.matX2&&gains.materials){const before=gains.materials;gains.materials=Math.floor(gains.materials*2);if(p===G.player)addLog('🏭 Industrialisation active : <i class=ri-materials></i>×2 ('+before+'→'+gains.materials+')','dim');}
      if(p.investBonus.sciX2&&gains.science){const before=gains.science;gains.science=Math.floor(gains.science*2);if(p===G.player)addLog('<i class=ri-science></i> Recherche Intensive active : <i class=ri-science></i>×2 ('+before+'→'+gains.science+')','dim');}
      if(p.investBonus.matHalf&&gains.materials){gains.materials=Math.floor(gains.materials/2);}
      if(p.investBonus.moraleBonus){gains.morale=(gains.morale||0)+p.investBonus.moraleBonus;if(p===G.player)addLog('🌾 Agriculture Durable : +'+p.investBonus.moraleBonus+'<i class=ri-morale></i>','dim');}
      if(p.investBonus.matBonus)gains.materials=(gains.materials||0)+p.investBonus.matBonus;
      if(p.investBonus.sciBonus)gains.science=(gains.science||0)+p.investBonus.sciBonus;
    }
    // Bonus investissement Niv.2
    if(p.investBonus2&&(p.investBonus2.turnsLeft===undefined||p.investBonus2.turnsLeft>0)){
      // moraleX2 : gains de moral doublés
      if(p.investBonus2.moraleX2&&gains.morale){const before=gains.morale;gains.morale=Math.floor(gains.morale*2);if(p===G.player)addLog('🕊️ Confort Population actif : <i class=ri-morale></i>×2 ('+before+'→'+gains.morale+')','dim');}
      if(p.investBonus2.moraleFlat)gains.morale=(gains.morale||0)+p.investBonus2.moraleFlat;
    }
    // Empathes T1 : +1<i class=ri-energy></i> par tranche de 2 routes
    if(hasSpec(p,'empath_routes')&&p.routes.length>=2){
      gains.energy=(gains.energy||0)+Math.floor(p.routes.length/2);
    }
    // Empathes T3 : −2<i class=ri-morale></i>/tour si guerre active
    if(hasSpec(p,'empath_tele')&&G.warState==='active'){
      gains.morale=(gains.morale||0)-2;
    }
    if(p.govFormMorale)gains.morale=(gains.morale||0)+p.govFormMorale; // Démocratie Directe : +1<i class=ri-morale></i>/tour
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
function buyTech(cardId){
  if(G.phase!=='actions')return;
  if(_scGuard())return;
  const card=CARDS_POOL.find(c=>c.id===cardId);if(!card)return;
  if(!isTechAvailable(card,G.player)){
    if(card.tier===3&&!G.player.cards.some(c=>c.branch===card.branch&&c.tier===2))
      addLog('⚠️ Vous devez d\'abord posséder personnellement la T2 de cette branche.','red');
    else addLog('⚠️ Branche non encore débloquée (achetez d\'abord T'+(card.tier-1)+').','red');
    return;
  }
  if(card.branch==='empathes'&&!isEmpathesAvailableFor(G.player)){addLog('⚠️ Branche Empathes non disponible (Union Sacrée requise ou exclusivité fondateur).','red');return;}
  if(isTechExclusive(card)){
    if(G.techTaken.has(cardId)){addLog('⚠️ Cette carte est déjà prise par une autre faction.','red');return;}
  }else{
    if(G.player.cards.some(c=>c.id===cardId)){addLog('⚠️ Vous possédez déjà cette carte.','red');return;}
  }
  const acCost=card.tier===3?2:1;
  if(G.player.acLeft<acCost){addLog('⚠️ Pas assez d\'AC (besoin '+acCost+').','red');return;}
  const cost=getEffCost(card,G.player);
  for(const[r,a]of Object.entries(cost)){if((G.player.res[r]||0)<a){addLog('⚠️ Pas assez de '+rLabel(r)+' (besoin '+a+').','red');return;}}
  saveUndo();
  G.player.acLeft-=acCost;
  G.player.spentThisTurn+=acCost+Object.values(cost).reduce((s,v)=>s+v,0);
  for(const[r,a]of Object.entries(cost))G.player.res[r]-=a;
  G.player.cards.push(card);applyCard(card,G.player);
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
function buyGeneral(cardId){
  if(G.phase!=='actions')return;
  if(_scGuard())return;
  // Cherche dans civRiver ou milRiver
  const card=(G.civRiver||[]).find(c=>c&&c.id===cardId)||(G.milRiver||[]).find(c=>c&&c.id===cardId)
           ||(G.generalRiver||[]).find(c=>c&&c.id===cardId);
  if(!card)return;
  if(card.reqCard&&!G.player.cards.some(c=>c.id===card.reqCard)){const _rn=CARDS_POOL.find(c=>c.id===card.reqCard)?.name||card.reqCard;addLog('⚠️ '+card.name+' nécessite la tech « '+_rn+' ».','red');return;}
  if(card.type==='militaire'){if(!G.player._milBoughtThisTurn)G.player._milBoughtThisTurn=new Set();if(G.player._milBoughtThisTurn.has(card.id)){addLog('⚠️ '+card.name+' déjà acheté ce tour (1×/tour).','red');return;}}
  const acCost=card.ac||1;
  if(G.player.acLeft<acCost){addLog('⚠️ Pas assez d\'AC (besoin '+acCost+').','red');return;}
  const cost=getEffCost(card,G.player);
  for(const[r,a]of Object.entries(cost)){if((G.player.res[r]||0)<a){addLog('⚠️ Pas assez de '+rLabel(r)+'.','red');return;}}
  saveUndo();
  G.player.acLeft-=acCost;G.player.spentThisTurn+=acCost+Object.values(cost).reduce((s,v)=>s+v,0);
  for(const[r,a]of Object.entries(cost))G.player.res[r]-=a;
  // Pour les militaires répétables, on clone la carte pour ne pas bloquer les futurs achats
  const cardCopy=card.repeatable?{...card,_uid:Date.now()}:card;
  G.player.cards.push(cardCopy);applyCard(cardCopy,G.player);
  if(card.type==='militaire'){if(!G.player._milBoughtThisTurn)G.player._milBoughtThisTurn=new Set();G.player._milBoughtThisTurn.add(card.id);} // 1× par carte par tour
  // Militaires : répétables → rien dans techTaken
  // Civiques : chacun peut acheter 1×, pas de blocage global → rien dans techTaken
  // Branche T3 exclusive : techTaken global
  if(!card.repeatable&&card.type!=='civique') G.techTaken.add(cardId);
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
  if(card.combatBonus)p.combatBonus=(p.combatBonus||0)+card.combatBonus;
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
    const techCount=p.cards.filter(c=>c.type==='technology').length;
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
  if(occupied&&!G.commercialAccords.includes(nid))G.commercialAccords.push(nid);
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
  if(hasSpec(p,'col_e_disc'))en=Math.max(0,en-1);
  let _useStrat=false;
  if(p.stratBonus&&p.stratBonus.spec==='strat_col_ac'&&!p._stratColUsed){ac=Math.max(0,ac-1);_useStrat=true;}
  if(p.stratBonus&&p.stratBonus.spec==='strat_col_free'&&!p._stratColUsed){mat=0;en=0;_useStrat=true;}
  return{ac,mat,en,_useStrat};
}
function doColonize(nodeId){
  if(_scGuard())return;
  const node=NODES[nodeId];
  if(node.decorative||node.noColonize){addLog('⚠️ Territoire jovien — non colonisable.','red');return;}
  if(G.player.colonies.find(c=>c.nodeId===nodeId)){addLog('⚠️ Colonie déjà présente sur '+node.name+'.','red');return;}
  // Extra-solaire (Triton/Pluton/Éris) désormais colonisable par TOUS — plus de tech requise (c'est juste très loin à connecter). La tech Exploration Extra-Solaire reste pour sa colonie gratuite + VP.
  const aColHere=G.ais.some(ai=>ai.colonies.find(c=>c.nodeId===nodeId));
  if(aColHere){addLog('⚠️ '+node.name+' est déjà colonisé par une autre nation — colonisation impossible (seule l\'Exploration Extra-Solaire permet une co-colonisation).','red');return;}
  const isAdjacent=G.player.colonies.some(c=>NODES[c.nodeId]?.conn.includes(nodeId))||G.player.routes.some(r=>(r.from===nodeId||r.to===nodeId)&&G.player.colonies.find(c=>c.nodeId===(r.from===nodeId?r.to:r.from)));
  const cost=colonizeCost(G.player);
  const{ac,mat,en}=cost;
  if(G.player.acLeft<ac){addLog('⚠️ Pas assez d\'AC (besoin '+ac+').','red');return;}
  if((G.player.res.materials||0)<mat){addLog('⚠️ Pas assez de Matériaux.','red');return;}
  if((G.player.res.energy||0)<en){addLog('⚠️ Pas assez d\'Énergie.','red');return;}
  saveUndo(); // colonisation annulable (popup ↩/Valider) ; la découverte est fixée par nœud pour éviter le re-roll
  if(cost._useFree&&G.player.investBonus){G.player.investBonus.freeCol--;addLog('🚀 Expansion Rapide : colonisation sans AC !','gold');}
  if(cost._useStrat)G.player._stratColUsed=true;
  G.player.acLeft-=ac;G.player.res.materials-=mat;G.player.res.energy-=en;
  G.player.spentThisTurn+=ac+mat+en;
  const connected=checkConnected(nodeId,G.player);
  G.player.colonies.push({nodeId,level:1,connected});
  updateConnections(G.player);
  // Moral one-time : Niv.1 = +1<i class=ri-morale></i> pour tous; colonie éloignée = −1<i class=ri-morale></i> (conditions difficiles)
  // Biosphère Avancée (bio2_bonus) supprime le malus des colonies difficiles
  const isRemoteCol=['deimos','vesta','europe','encelade','pluto','eris'].includes(nodeId);
  if(isRemoteCol&&!hasSpec(G.player,'bio2_bonus')){
    // Net 0 : +1 Niv.1 − 1 éloignée (les deux s'annulent, on log séparément)
    addLog('⚠️ Colonie éloignée — conditions difficiles (−1<i class=ri-morale></i>), mais vie améliorée (+1<i class=ri-morale></i>) → net 0','dim');
  } else {
    G.player.res.morale=(G.player.res.morale||0)+1;
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
function doUpgrade(nodeId){
  if(_scGuard())return;
  const col=G.player.colonies.find(c=>c.nodeId===nodeId);const node=NODES[nodeId];
  if(!col){addLog('⚠️ Pas de colonie sur '+node.name+'.','red');return;}
  if(col.noUpgrade){addLog('⚠️ '+node.name+' (colonisée par accord forcé) ne peut pas être améliorée.','red');return;}
  if(col.level>=node.maxLv){addLog('⚠️ '+node.name+' est au niveau maximum.','red');return;}
  const isRemote=node.upgradeCost==='remote';
  const targetLv=col.level+1;
  const ac=1;
  const mat=3;
  const en=1;
  const sci=1;
  if(G.player.acLeft<ac){addLog('⚠️ Pas assez d\'AC (besoin '+ac+').','red');return;}
  if((G.player.res.materials||0)<mat){addLog('⚠️ Pas assez de Matériaux (besoin '+mat+').','red');return;}
  if((G.player.res.energy||0)<en){addLog('⚠️ Pas assez d\'Énergie (besoin '+en+').','red');return;}
  if((G.player.res.science||0)<sci){addLog('⚠️ Pas assez de Savoir (besoin 1<i class=ri-science></i>).','red');return;}
  saveUndo();
  G.player.acLeft-=ac;G.player.res.materials-=mat;G.player.res.energy-=en;G.player.res.science-=sci;
  G.player.spentThisTurn+=ac+mat+en+sci;
  col.level=targetLv;
  if(col._conquest){col._conquest=0;addLog('🏗️ '+node.name+' développée — la population conquise est apaisée (fin du mécontentement).','green');}
  // Bonus moral one-time au Niv.2
  if(targetLv===2){
    if(nodeId==='callisto'){
      G.player.res.morale=(G.player.res.morale||0)+2;
      addLog('🌟 Callisto Nv.2 — habitat exceptionnel hors radiation (+2<i class=ri-morale></i>)','gold');
    } else if(ATTRACTIVE_COLS.includes(nodeId)){
      G.player.res.morale=(G.player.res.morale||0)+1;
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
function doEstablishRoute(from,to){
  if(_scGuard())return;
  const fn=NODES[from],tn=NODES[to];
  if(!fn||!tn){addLog('⚠️ Nœud invalide.','red');return;}
  if(!fn.conn.includes(to)){addLog('⚠️ '+fn.name+' et '+tn.name+' ne sont pas adjacents.','red');return;}
  if(G.player.routes.find(r=>(r.from===from&&r.to===to)||(r.from===to&&r.to===from))){addLog('⚠️ Route déjà établie.','red');return;}
  const rc=routeCost(G.player);
  if(G.player.acLeft<rc.ac){addLog('⚠️ Pas assez d\'AC.','red');return;}
  if((G.player.res.materials||0)<rc.mat){addLog('⚠️ Pas assez de Matériaux.','red');return;}
  saveUndo(); // route annulable (popup ↩/Valider)
  G.player.acLeft-=rc.ac;G.player.res.materials-=rc.mat;
  G.player.spentThisTurn+=rc.ac+rc.mat;
  if(rc._useFree&&G.player.investBonus)G.player.investBonus.freeRte--;
  const newRoute={from,to,tokens:0};
  G.player.routes.push(newRoute);updateConnections(G.player);
  addLog('🛤️ Route '+fn.name+' → '+tn.name+(rc._useFree?' (GRATUITE)':''),'green');
  addAction('🛤️','Route '+fn.name+' → '+tn.name,rc.ac,{materials:rc.mat},'Construite');
  // Popup assignation jeton
  if(G.player.forceTokens>0&&!hasSpec(G.player,'route_force_free')){
    _pendingRouteObj=newRoute;
    document.getElementById('rtm-info').innerHTML=
      'Route <strong>'+fn.name+' → '+tn.name+'</strong><br>'+
      'Jetons disponibles : <strong>'+G.player.forceTokens+'</strong><br>'+
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
    if(hasSpec(G.player,'route_force_free')){
      newRoute.tokens=1;                       // posé pour de vrai…
      updateConnections(G.player);             // …donc la route compte pour la connectivité
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
function useAbility(){
  if(G.phase!=='actions')return;
  if(_scGuard())return;
  if(G.player.abilityUsed){addLog('⚠️ Capacité déjà utilisée ce tour.','red');return;}
  const p=G.player,ab=p.civ.active;
  if(p.acLeft<ab.ac){addLog('⚠️ Pas assez d\'AC.','red');return;}
  for(const[r,a]of Object.entries(ab.cost)){if((p.res[r]||0)<a){addLog('⚠️ Ressources insuffisantes.','red');return;}}
  // Jupitérien — Forge Orbitale : le joueur CHOISIT la lune joviène à améliorer (modale). Pas d'auto-sélection ni de coût dans le vide.
  if(p.civ.id==='jupiteriens'){
    const eligible=p.colonies.filter(c=>['io','europe','ganymede','callisto'].includes(c.nodeId)&&c.level===1&&c.connected);
    if(!eligible.length){addLog('⚠️ Aucune lune joviène de niveau 1 connectée à améliorer — elles sont déjà au niveau max (ou non reliées) : Io, Europe, Ganymède, Callisto.','red');return;}
    showForgeChoiceModal(eligible); return; // le coût est prélevé au moment du choix (_forgeUpgrade)
  }
  saveUndo();p.acLeft-=ab.ac;for(const[r,a]of Object.entries(ab.cost))p.res[r]-=a;p.abilityUsed=true;
  if(p.civ.id==='terriens'){addGovPts(p,3);addLog('💫 Diplomatie Verte : +3 pts Gov','gold');addAction('💫','Diplomatie Verte',0,{materials:3},'+3 pts Gov');}
  else if(p.civ.id==='martiens'){p.acLeft+=1;p.acMax+=1;addLog('💫 Surtension : +1 AC ce tour','gold');addAction('💫','Surtension',0,{energy:2},'+1 AC');}
  else if(p.civ.id==='ceinturiens'){
    const got=pirateCommerce(p);
    if(got.length){const em=got.map(rEmoji).join('');addLog('💫 Commerce avec les pirates : contrebande → +'+em,'gold');addAction('💫','Commerce avec les pirates',0,{},'+'+em);}
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
function doRaidTarget(aiId,nodeId){
  try{
    if(!G||G.phase!=='actions')return;
    var p=G.player;
    var tc=p.civ.id==='ceinturiens'?1:2;
    var enCost=0;
    var target=G.ais.find(function(a){return a.civ.id===aiId;});
    if(!target){addLog('⚠️ Cible de raid introuvable.','red');return;}
    if(p.acLeft<1){addLog('⚠️ Raid : besoin 1 AC.','red');return;}
    if(p.forceTokens<tc){addLog('⚠️ Raid : besoin '+tc+' jeton(s) Force.','red');return;}
    if(enCost>0&&(p.res.energy||0)<enCost){addLog('⚠️ Raid : besoin '+enCost+'<i class=ri-energy></i> (carburant).','red');return;}
    undoStack=[];
    p.acLeft-=1;p.forceTokens-=tc;p.forceCooldown.push({count:tc,returnTurn:getCooldownTurn(p)});
    if(enCost>0)p.res.energy-=enCost;
    p.spentThisTurn=(p.spentThisTurn||0)+1+tc+enCost;
    var targets=['energy','materials'].filter(function(r){return (target.res[r]||0)>0;});
    var stolen=[];
    for(var i=0;i<2&&targets.length>0;i++){
      var r=targets[Math.floor(Math.random()*targets.length)];
      target.res[r]=Math.max(0,(target.res[r]||0)-1);
      p.res[r]=(p.res[r]||0)+1;stolen.push(rEmoji(r));
      if(target.res[r]===0)targets.splice(targets.indexOf(r),1);
    }
    addTens(target.civ.id,'player',2);
    addTens('player',target.civ.id,1);
    addLog('⚔️ Raid sur '+target.civ.emoji+' '+target.civ.name+' ! +'+(stolen.join('')||'rien')+(enCost>0?' (−1<i class=ri-energy></i>)':'')+' ('+tc+' jeton en CD, tension +2)','green');
    addAction('💰','Raid '+target.civ.emoji,1,{},'Volé : '+(stolen.join('')||'rien'));
    render();
  }catch(e){console.error('doRaidTarget',e);}
}

/* Ancien raid sans cible — CONSERVÉ uniquement pour compatibilité interne (IA/scripts). Ne plus
   l'appeler depuis l'interface : il choisit `G.ais[0]`, ce qui n'a de sens qu'à deux nations. */
function doRaidLegacyFirstTarget(){
  const p=G.player;const tokenCost=p.civ.id==='ceinturiens'?1:2;
  const enCost=0; // v18 : raid sans coût énergie
  if(p.acLeft<1){addLog('⚠️ Raid : besoin 1 AC.','red');return;}
  if(p.forceTokens<tokenCost){addLog('⚠️ Raid : besoin '+tokenCost+' jeton(s) Force.','red');return;}
  if(enCost>0&&(p.res.energy||0)<enCost){addLog('⚠️ Raid : besoin '+enCost+'<i class=ri-energy></i> (carburant).','red');return;}
  undoStack=[];p.acLeft-=1;p.forceTokens-=tokenCost;p.forceCooldown.push({count:tokenCost,returnTurn:getCooldownTurn(p)});
  if(enCost>0)p.res.energy-=enCost;
  p.spentThisTurn+=1+tokenCost+enCost;
  const raidTarget=G.ais[0];
  const targets=['energy','materials'].filter(r=>(raidTarget.res[r]||0)>0);let stolen=[];
  for(let i=0;i<2&&targets.length>0;i++){const r=targets[Math.floor(Math.random()*targets.length)];raidTarget.res[r]=Math.max(0,(raidTarget.res[r]||0)-1);p.res[r]=(p.res[r]||0)+1;stolen.push(rEmoji(r));if(raidTarget.res[r]===0)targets.splice(targets.indexOf(r),1);}
  // Raid → monte la tension de la cible vers le joueur ET la tension du joueur vers la cible
  addTens(raidTarget.civ.id,'player',2);
  addTens('player',raidTarget.civ.id,1);
  addLog('⚔️ Raid ! +'+stolen.join('')+(enCost>0?' (−1<i class=ri-energy></i>)':'')+' ('+tokenCost+' jeton en CD, tension +2 vs '+raidTarget.civ.name+')','green');
  addAction('⚔️','Raid',1,{},'Volé : '+(stolen.join('')||'rien'));render();
}
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
function proposeAccord(nodeId){
  if(G.phase!=='actions')return;const node=NODES[nodeId];const p=G.player;
  if(p.acLeft<1){addLog('⚠️ Accord : besoin 1 AC.','red');return;}
  if((p.res.materials||0)<2){addLog('⚠️ Accord : besoin 2<i class=ri-materials></i> (donnés à l\'autre nation).','red');return;}
  // Vérifier que l'IA propriétaire accepte (pas en guerre, tension < 7)
  const accordAi=G.ais.find(ai=>ai.colonies.some(c=>c.nodeId===nodeId));
  if(accordAi){
    const atWar=_warBetween(_moiId(),accordAi.civ.id);
    const tension=tensEff('player',accordAi.civ.id);
    if(atWar){addLog('⚠️ '+accordAi.civ.emoji+' '+accordAi.civ.name+' refuse l\'accord — vous êtes en guerre !','red');return;}
    if(tension>=7){addLog('⚠️ '+accordAi.civ.emoji+' '+accordAi.civ.name+' refuse l\'accord — tensions trop élevées ('+tension+'/10 ≥ 7).','red');return;}
  }
  undoStack=[];p.acLeft-=1;p.res.materials-=2;p.spentThisTurn+=3;
  if(accordAi)accordAi.res.materials=(accordAi.res.materials||0)+2; // le matériau est DONNÉ à l'autre nation
  G.commercialAccords.push(nodeId);
  let tensionMsg='';
  if(accordAi){
    const pPrev=getTens('player',accordAi.civ.id), aPrev=getTens(accordAi.civ.id,'player');
    setTens('player',accordAi.civ.id,Math.max(0,pPrev-3));
    setTens(accordAi.civ.id,'player',Math.max(0,aPrev-3)); // −3 des DEUX côtés
    tensionMsg=' — Tension −3 des deux côtés vs '+accordAi.civ.name;
  }
  addLog('🤝 Accord Commercial sur '+node.name+' — 2<i class=ri-materials></i> donnés à '+(accordAi?accordAi.civ.name:'l\'autre nation')+tensionMsg,'gold');
  addAction('🤝','Accord '+node.name,1,{materials:2},'2 matériaux donnés'+tensionMsg);
  closePopup();render();
}
function breakAccordAndAttack(nodeId){
  if(G.phase!=='actions')return;const node=NODES[nodeId];const p=G.player;
  const _brkAI=getNodeOwnerAI(nodeId);
  if(!_brkAI){addLog('⚠️ Cette colonie n\'appartient à aucune nation.','red');return;}
  /* La capitale N'EST PLUS imprenable (règle décidée par Marc) : elle est défendue d'office par
     10 jetons automatiquement alimentés, auxquels s'ajoutent les jetons que le défenseur engage
     s'il peut les payer. On peut donc l'assaillir comme n'importe quelle colonie. */
  const tc=p.civ.id==='ceinturiens'?1:2;
  if(p.acLeft<1){addLog('⚠️ Attaque : besoin 1 AC.','red');return;}
  if(p.forceTokens<tc){addLog('⚠️ Attaque : besoin d\'au moins '+tc+' jeton(s) Force.','red');return;}
  if(Math.min(p.res.materials||0,p.res.energy||0)<1){addLog('⚠️ Attaque : il faut du <i class=ri-materials></i> et de l\'<i class=ri-energy></i> pour engager des jetons.','red');return;}
  // LIMITE DE 2 ATTAQUES/TOUR SUPPRIMÉE (demande de Marc) : le nombre d'assauts n'est plus plafonné —
  // il reste limité naturellement par les AC, les jetons Force et le coût en ressources de chaque combat.
  // Rupture d'accord = attaque SURPRISE : on rompt l'accord PUIS on assaille immédiatement (capture si victoire).
  G.commercialAccords=G.commercialAccords.filter(n=>n!==nodeId);
  addLog('📜 Accord sur '+node.name+' rompu — attaque surprise !','red');
  p.acLeft-=1;p.spentThisTurn+=1;closePopup();
  playerAssaultColony(nodeId,_brkAI); // résout le combat + capture immédiate (déclare la guerre)
}
function attackColony(nodeId){
  if(G.phase!=='actions')return;const node=NODES[nodeId];const p=G.player;
  const _atkAI=getNodeOwnerAI(nodeId);
  if(!_atkAI){addLog('⚠️ Cette colonie n’appartient à aucune nation.','red');return;}
  /* Capitale assaillable : voir la note dans breakAccordAndAttack(). Sa défense de 10 jetons
     (garrisonOf) suffit à la rendre difficile ; l'interdire n'a plus lieu d'être. */
  const tc=p.civ.id==='ceinturiens'?1:2;
  if(p.acLeft<1){addLog('⚠️ Assaut : besoin 1 AC.','red');return;}
  if(p.forceTokens<tc){addLog('⚠️ Assaut : besoin d’au moins '+tc+' jeton(s) Force.','red');return;}
  if(Math.min(p.res.materials||0,p.res.energy||0)<1){addLog('⚠️ Assaut : il faut du <i class=ri-materials></i> et de l’<i class=ri-energy></i> pour engager des jetons.','red');return;}
  // LIMITE DE 2 ATTAQUES/TOUR SUPPRIMÉE (demande de Marc) : le nombre d'assauts n'est plus plafonné —
  // il reste limité naturellement par les AC, les jetons Force et le coût en ressources de chaque combat.
  p.acLeft-=1;p.spentThisTurn+=1;closePopup();
  playerAssaultColony(nodeId,_atkAI);
}
// ── ASSAUT DE COLONIE : combat résolu IMMÉDIATEMENT (1 manche), capture si victoire. (Le modèle « guerre en 2 tours » est supprimé.) ──
function playerAssaultColony(nodeId,enemyAI){
  enemyAI=enemyAI||getNodeOwnerAI(nodeId);if(!enemyAI)return;
  G.player._attacksThisTurn=(G.player._attacksThisTurn||0)+1; G._warCancelRefund={ac:1,atk:1};
  let war=_warBetween(_moiId(),enemyAI.civ.id);
  if(!war){G._warFocusColony=nodeId;declareWar('Assaut sur '+(NODES[nodeId]?.name||nodeId)+' !','player',enemyAI.civ.id);war=_warBetween(_moiId(),enemyAI.civ.id);}
  if(!war)return;
  war.live=true;war.justDeclared=false;war.turnsLeft=99;war._playerFoughtTurn=G.turn;war.playerProvoked=true; // tu as attaqué → l'IA pourra riposter dès la parité (pas besoin d'être 2× dominante)
  G.warWith=enemyAI.civ.id;G.warWins=war.wins;G.warTurnsLeft=99;
  _warAttackColonyTarget=nodeId;
  try{document.getElementById('wcm-turn').textContent=G.turn;}catch(e){}
  // La CIBLE et l'ENNEMI vont dans `G._flux.donnees` : ils vivaient dans la fermeture ci-dessous,
  // et un assaut interrompu (sauvegarde, rafraîchissement) perdait « sur quoi » on se battait.
  fluxDonnees().assautCible=nodeId;
  fluxDonnees().assautEnnemi=enemyAI.civ.id;
  fluxDonnees().suiteCombat='stAssautJoueurChoisi';
  G._warChoiceCb='stAssautJoueurChoisi';
  document.getElementById('war-combat-modal').classList.remove('hidden');
  _warSelectColonyTarget(nodeId);
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
  const techProt=hasSpec(defender,'empath_routes')||hasSpec(defender,'ia_immune'); // Liens Empathes / IA Défensive : jeton non perdable
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
  if(hasSpec(ai,'empath_routes')||hasSpec(ai,'ia_immune')){addLog('🛡️ Routes de '+ai.civ.name+' protégées par une tech — inattaquables.','red');return;}
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
  const p=ai._enemy||G.player;const war=_warBetween(ai.civ.id,p.civ.id)||_warBetween(_moiId(),ai.civ.id);if(!war)return;
  war.aiAggressor=false; // « au moins un assaut » effectué → ensuite comportement normal (paix si elle ne peut pas gagner)
  war._aiAssaultedThisTurn=true; // l'IA a déjà frappé ce tour → pas de second assaut en fin de tour
  const aEmpath=(hasSpec(ai,'empath_routes')?2:0)+(hasSpec(ai,'empath_tele')?2:0);
  const pEmpath=(hasSpec(p,'empath_routes')?2:0)+(hasSpec(p,'empath_tele')?2:0);
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
    const pcol=p.colonies.find(c=>c.nodeId===targetId);const newLvl=pcol?Math.max(1,pcol.level-1):1;
    p.colonies=p.colonies.filter(c=>c.nodeId!==targetId);updateConnections(p);
    const conn=(typeof checkConnected==='function')?checkConnected(targetId,ai):true;
    ai.colonies.push({nodeId:targetId,level:newLvl,connected:conn});updateConnections(ai);
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
function _aiPickPlayerTarget(ai,defender){
  const p=defender||G.player;
  const cols=p.colonies.filter(c=>c.nodeId!==p.civ.home&&c.connected);
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
function maybeAiAssaultPlayer(ai,done,defender){
  const war=ai&&_warOf(ai.civ.id);
  if(!war){_assautSuite(done);return;}
  // ATTAQUANT HUMAIN (multijoueur) : il n'attaque PAS automatiquement en fin de tour — il assaille lui-même
  // pendant SON tour d'action (combat visible + choix des jetons). Sinon la guerre paraîtrait « occultée ».
  if(ai._isAI===false){_assautSuite(done);return;}
  defender=defender||_warHumanFoe(war,ai)||G.player;
  if(war._aiAssaultedThisTurn){_assautSuite(done);return;} // l'IA a déjà attaqué pendant son tour → pas de double assaut
  const afford=Math.min(ai.res.materials||0,ai.res.energy||0);
  const target=_aiPickPlayerTarget(ai,defender);
  if(!target||(ai.forceTokens||0)<1||afford<1||(ai.res.morale||0)<1){
    addLog('🛡️ '+ai.civ.emoji+' '+ai.civ.name+' maintient la guerre mais n\'a pas les moyens d\'attaquer ce tour.','dim');
    const _na={emoji:'🛡️',name:'En guerre — n\'a pas attaqué ce tour',desc:'moyens insuffisants'};
    if(ai._turnActions)ai._turnActions.push(_na);else ai._turnActions=[_na];
    _assautSuite(done);return;
  }
  const commit=Math.min(ai.forceTokens,afford);
  showAiAssaultDefenseModal(ai,target,commit,done,defender);
}
function _aadUpd(v){document.getElementById('aad-val').textContent=v;document.getElementById('aad-cost').textContent='−'+v+'🪨 −'+v+'⚡';}
function showAiAssaultDefenseModal(ai,target,aiCommit,done,defender){
  const p=defender||G.player;
  const shownThreat=(getIntelLevel(p)>=2)?(aiCommit+'⚔️'):('≈'+aiCommit+'⚔️ (estimé)');
  const maxDef=Math.max(0,Math.min(p.forceTokens||0,maxAffordableTokens(p))); // limité à ce qu'on peut PAYER
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
  const pEmp=(hasSpec(p,'empath_routes')?2:0)+(hasSpec(p,'empath_tele')?2:0);
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
  const pEmp=(hasSpec(p,'empath_routes')?2:0)+(hasSpec(p,'empath_tele')?2:0);
  const aEmp=(hasSpec(ai,'empath_routes')?2:0)+(hasSpec(ai,'empath_tele')?2:0);
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
    col.foreignConnected=false;
    if(!col.connected&&p===G.player){
      for(const r of p.routes){
        const other=r.from===col.nodeId?r.to:r.to===col.nodeId?r.from:null;
        if(!other)continue;
        const hasAccordAI=G.ais.some(ai=>
          ai.colonies.some(ac=>ac.nodeId===other)&&G.commercialAccords.includes(other)
        );
        if(hasAccordAI){col.foreignConnected=true;break;}
      }
    }
  }
}
/* ============================================================ TENSION POPULAIRE ============================================================ */
function updateTension(){
  if(G.warState)return; // pas de montée de tension pendant la guerre
  const pColNodes=new Set(G.player.colonies.map(c=>c.nodeId));
  const pConnectedCount=G.player.colonies.filter(c=>c.connected).length;
  const pT3=G.player.cards.filter(c=>c.tier===3).length;
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
      const accord=G.commercialAccords.includes(r.from)||G.commercialAccords.includes(r.to);
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
    return add;
  };
  const _toutes=(typeof allPlayers==='function')?allPlayers():[G.player].concat(G.ais||[]);
  for(const x of _toutes)for(const y of _toutes){
    if(x===y)continue;
    if(x===G.player||y===G.player)continue;      // les couples du joueur sont traités plus bas (avec leurs effets)
    const a=_tensionVers(x,y);
    if(a>0)addTens(x.civ.id,y.civ.id,a);
    else if(getTens(x.civ.id,y.civ.id)>0)addTens(x.civ.id,y.civ.id,-1);   // paix : −1/tour
  }
  for(const ai of G.ais){
    let addP=_tensionVers(G.player,ai), addA=_tensionVers(ai,G.player);
    // Appliquer
    if(addP>0){addTens('player',ai.civ.id,addP);addLog('😡 Ta tension vs '+ai.civ.name+' +'+addP+' → '+getTens('player',ai.civ.id)+'/10','dim');}
    else if(getTens('player',ai.civ.id)>0)addTens('player',ai.civ.id,-1); // paix : −1/tour
    if(addA>0)addTens(ai.civ.id,'player',addA);
    else if(getTens(ai.civ.id,'player')>0)addTens(ai.civ.id,'player',-1); // paix : −1/tour
    // Effets tension joueur → cette IA (guerre forcée uniquement ici)
    const pt=tensEff('player',ai.civ.id); // tension effective (−6 envers les autres nations si une guerre tourne déjà)
    const _cool=((G._peaceCooldown&&G._peaceCooldown[ai.civ.id])||0)>G.turn; // trêve après une guerre récente avec cette nation
    const _warWithThis=!!(_warBetween(_moiId(),ai.civ.id)); // déjà en guerre avec CETTE nation → pas de guerre populaire en plus
    if(pt>=10&&!_warWithThis&&!_cool){triggerGuereeForcee('player',ai);return;}
    // Effets tension IA → joueur
    const at=tensEff(ai.civ.id,'player');
    if(at>=10&&!_warWithThis&&!_cool){triggerGuereeForcee('ai',ai);return;}
  }
  // Compat aliases
  G.playerTension=G.ais.reduce((mx,ai)=>Math.max(mx,getTens('player',ai.civ.id)),0);
  if(G.ais[0])G.aiTension=getTens(G.ais[0].civ.id,'player');
  // Effet tension : −1<i class=ri-morale></i> par nation avec tension ≥6 (cumulatif)
  // Manifestations : −1<i class=ri-morale></i> par nation à tension ≥6 — MAIS on exclut celles avec qui on est déjà EN GUERRE (pas de double peine).
  const highTensAis=G.ais.filter(ai=>tensEff('player',ai.civ.id)>=6&&!(_warBetween(_moiId(),ai.civ.id))&&!(G._peaceCooldown&&G.turn<(G._peaceCooldown[ai.civ.id]||0))); // pas de manifestations avec qui on est en guerre NI en paix/trêve récente
  G.player._manifLoss=highTensAis.length; // mémorisé pour l'affichage du revenu cœur en net
  if(highTensAis.length>0){
    G.player.res.morale=Math.max(0,(G.player.res.morale||0)-highTensAis.length);
    addLog('😤 Tensions élevées ('+highTensAis.map(ai=>ai.civ.name+' '+getTens('player',ai.civ.id)+'/10').join(', ')+') — manifestations : −'+highTensAis.length+'<i class=ri-morale></i>','red');
  }
}
/* La suite de la GUERRE POPULAIRE : un NOM rangé dans `G._flux.donnees`.
   `_forcedWarCb` était une variable de module : perdue à la sauvegarde, et partagée entre toutes
   les parties d'un même processus serveur. */
function _guerrePopSuite(nom){ fluxDonnees().suiteGuerrePop=(typeof nom==='string'&&nom)?nom:null; }
function _guerrePopSuiteJouer(){ const d=fluxDonnees(), nom=d.suiteGuerrePop; d.suiteGuerrePop=null; if(nom){fluxAppeler(nom);return true;} return false; }
function _guerrePopEnAttente(){ return !!fluxDonnees().suiteGuerrePop; }
function triggerGuereeForcee(offendedSide,targetAi){
  const fwTargetAi=targetAi||(G.ais[0]);
  declareWar('Guerre Populaire Forcée — le peuple exige vengeance !','other',fwTargetAi?.civ.id||null);
  if(fwTargetAi)G.warWith=fwTargetAi.civ.id; // épingler la cible (sinon syncWarState pointe sur G.wars[0])
  G.player.res.morale=Math.max(0,(G.player.res.morale||0)-2);
  G.ais.forEach(ai=>{ai.res.morale=Math.max(0,(ai.res.morale||0)-2);});
  addLog('💥 Guerre populaire ! −2<i class=ri-morale></i> pour chaque camp.','red');
  _journalAuto(G.player.civ.name,'Guerre populaire forcée','−2 moral pour chaque camp',true);
  // La tension reste à 10 pendant la guerre (épinglée par declareWar ; ne redescend qu'à la fin).
  G.playerTension=10;G.aiTension=10;
  const fwAi=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
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
    halveTensions('player',ai.civ.id);G._peaceCooldown=G._peaceCooldown||{};G._peaceCooldown[ai.civ.id]=G.turn+3;syncWarState();
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
  if(fwId){const _i=_warIndexBetween(_moiId(),fwId);if(_i>=0)G.wars.splice(_i,1);halveTensions('player',fwId);G._peaceCooldown=G._peaceCooldown||{};G._peaceCooldown[fwId]=G.turn+3;syncWarState();}
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
function declareWar(reason,declaredBy='other',aiId=null){
  const tgtId=aiId||G.warWith||(G.ais[0]?.civ.id);
  if(!tgtId)return;
  if(_warBetween(_moiId(),tgtId))return; // déjà en guerre avec cette IA
  const newWar=_attachWar({a:G.player.civ.id,b:tgtId,winsBy:{[G.player.civ.id]:0,[tgtId]:0},turnsLeft:99,justDeclared:true,reason,declaredBy,live:true,aiRecaptureTarget:null});
  newWar.focusColony=G._warFocusColony||null;G._warFocusColony=null; // colonie visée par l'assaut (memo #11)
  G.wars.push(newWar);
  G._warDeclareReason=reason;G._warDeclaredBy=declaredBy;
  syncWarState();
  // La tension reste au MAXIMUM (10/10) pendant toute la guerre — elle ne redescend qu'à la fin (endWar la halve).
  setTens('player',tgtId,10);setTens(tgtId,'player',10);
  const warEnName=G.ais.find(a=>a.civ.id===tgtId)?.civ.name||tgtId;
  // Annule les accords commerciaux AVEC CETTE nation (sur toutes ses colonies) — un raid ne les annule pas.
  const _revoked=G.commercialAccords.filter(nid=>{const o=getNodeOwnerAI(nid);return o&&o.civ.id===tgtId;});
  if(_revoked.length){G.commercialAccords=G.commercialAccords.filter(nid=>!_revoked.includes(nid));addLog('📜 Accords commerciaux avec '+warEnName+' révoqués ('+_revoked.length+') !','red');}
  // Colonie Extra-Solaire co-localisée sur un nœud de la nation en guerre → elle saute.
  const _warAI=G.ais.find(a=>a.civ.id===tgtId);
  if(_warAI){
    const _lostCols=G.player.colonies.filter(c=>_warAI.colonies.some(ac=>ac.nodeId===c.nodeId));
    if(_lostCols.length){G.player.colonies=G.player.colonies.filter(c=>!_lostCols.includes(c));updateConnections(G.player);addLog('💥 '+_lostCols.length+' colonie(s) Extra-Solaire sur le territoire de '+warEnName+' perdue(s) à cause de la guerre.','red');}
  }
  // Rompt les routes entre deux colonies ennemies (aucun bout à moi ET au moins un bout = nation en guerre) ; jeton rendu. Les routes me touchant tiennent.
  const _isMine=id=>G.player.colonies.some(c=>c.nodeId===id);
  const _isWarNat=id=>{const o=getNodeOwnerAI(id);return !!(o&&o.civ.id===tgtId);};
  const _broken=[];
  G.player.routes=G.player.routes.filter(r=>{const br=(!_isMine(r.from)&&!_isMine(r.to))&&(_isWarNat(r.from)||_isWarNat(r.to));if(br)_broken.push(r);return !br;});
  if(_broken.length){let _tk=0;_broken.forEach(r=>_tk+=(r.tokens||0));if(_tk>0)G.player.forceTokens+=_tk;updateConnections(G.player);addLog('🛤️ '+_broken.length+' route(s) en territoire '+warEnName+' rompue(s)'+(_tk>0?' — '+_tk+' jeton(s) Force rendu(s)':'')+'.','red');}
  addLog('🚨 GUERRE DÉCLARÉE contre '+warEnName+' : '+reason,'red');
}
function resolveWarCombat(playerCommitted){
  const warEnemy=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const pBonus=(G.player.stratBonus&&G.player.stratBonus.combatBonus)||0;
  const pEmpathBonus=(hasSpec(G.player,'empath_routes')?2:0)+(hasSpec(G.player,'empath_tele')?2:0);
  const aEmpathBonus=(hasSpec(warEnemy,'empath_routes')?2:0)+(hasSpec(warEnemy,'empath_tele')?2:0);
  // On ne peut engager QUE ce qu'on possède ET ce qu'on peut PAYER (1🪨 +1⚡ par jeton — règle §14).
  // Sans ce plafond, on pouvait « engager » 15 jetons sans en avoir les moyens (bug signalé par Marc).
  let engagedP=(playerCommitted!==undefined)?playerCommitted:G.player.forceTokens;
  {const _cap=Math.max(0,Math.min(G.player.forceTokens||0,maxAffordableTokens(G.player)));
   if(engagedP>_cap){ addLog('⚠️ Engagement réduit à '+_cap+' jeton(s) — tu ne peux engager que ce que tu peux PAYER.','red'); engagedP=_cap; }}
  const _cruOn=!!G._cruiserDeployed&&cruiserAvailable(G.player)&&cruiserAfford(G.player);G._cruiserDeployed=false;
  if(_cruOn){const _cc=cruiserPay(G.player);addLog('⚓ Supercroiseur déployé (+'+(G.player.cruiserPower||5)+'⚔️, '+_cc+').','gold');}
  const pPow=engagedP+pBonus+pEmpathBonus+(_cruOn?(G.player.cruiserPower||5):0); // Supercroiseur : +5 si déployé ce combat
  let aiEngaged=(G._aiWarCommitted!==undefined)?G._aiWarCommitted:Math.ceil((warEnemy.forceTokens||0)*0.7);
  aiEngaged=Math.min(aiEngaged,warEnemy.forceTokens||0,warEnemy.res.materials||0,warEnemy.res.energy||0); // ne peut engager que ce qu'il peut PAYER (1🪨+1⚡/jeton)
  const _aiCru=cruiserAvailable(warEnemy)&&cruiserAfford(warEnemy); // l'IA déploie son Supercroiseur en défense si possédé et payable
  if(_aiCru){const _cc=cruiserPay(warEnemy);addLog('⚓ '+warEnemy.civ.emoji+' '+warEnemy.civ.name+' déploie son Supercroiseur en défense (+'+(warEnemy.cruiserPower||5)+'⚔️, '+_cc+').','dim');}
  // COLONIE MÈRE (règle Marc) : la capitale est automatiquement défendue par 10 jetons de la nation.
  // Elle reste donc prenable, mais au prix d'un vrai assaut (avant : imprenable « en théorie », en pratique
  // capturée pour 1 jeton → nation à 0 colonie et partie bloquée).
  const _homeDef=(_warAttackColonyTarget&&warEnemy&&_warAttackColonyTarget===warEnemy.civ.home)?10:0;
  if(_homeDef)addLog('🏛️ Capitale '+(NODES[_warAttackColonyTarget]?.name||'')+' : défense automatique de 10 jetons.','dim');
  const aPow=aiEngaged+aEmpathBonus+(_aiCru?(warEnemy.cruiserPower||5):0)+garrisonOf(warEnemy,_warAttackColonyTarget); // garnison auto : 1 colonie / 10 base
  G._aiWarCommitted=undefined;
  // Coût + récupération SYMÉTRIQUES (attaque ET défense) : 1<i class=ri-materials></i> +1<i class=ri-energy></i> par jeton engagé, jetons immobilisés (récupération / moitié perdue si défaite).
  const pWin=pPow>aPow,aWin=aPow>pPow;
  // RÈGLE §14 : le coût est de 1🪨 +1⚡ PAR JETON ENGAGÉ — pas « par jeton adverse en défense ».
  // L'ancienne formule (min(engagés, défense+1)) rendait les assauts massifs QUASI GRATUITS : engager
  // 15 jetons contre un ennemi sans défense ne coûtait qu'1 jeton (bug signalé par Marc). Les jetons
  // engagés quittent le pool ; en cas de VICTOIRE la moitié revient tout de suite (cf. applyCombatEngage).
  const _atkUsed=engagedP;
  if(engagedP>0)addLog('⚔️ Coût combat (toi) : '+_atkUsed+' jeton(s) engagé(s) — 1<i class=ri-materials></i> +1<i class=ri-energy></i> par jeton (−'+_atkUsed+'<i class=ri-materials></i> −'+_atkUsed+'<i class=ri-energy></i>)','dim');
  if(aiEngaged>0)addLog('🛡️ '+warEnemy.civ.emoji+' '+warEnemy.civ.name+' engage '+aiEngaged+' jeton(s) en défense (−'+aiEngaged+'<i class=ri-materials></i> −'+aiEngaged+'<i class=ri-energy></i>).','dim');
  if(engagedP>0)applyCombatEngage(G.player,_atkUsed,!aWin); // coût + récupération pour _atkUsed jetons (la garnison compte toujours comme défense)
  applyCombatEngage(warEnemy,aiEngaged,!pWin);
  const _rcw=_warBetween(_moiId(),G.warWith);if(_rcw){_rcw.turnsLeft--;G.warTurnsLeft=_rcw.turnsLeft;}else G.warTurnsLeft--;let txt,cls;
  const targetId=_warAttackColonyTarget;_warAttackColonyTarget=null;
  if(pPow>aPow){
    G.warWins.player++;G.player.tempVP+=2;warEnemy.res.morale=Math.max(0,(warEnemy.res.morale||0)-1);
    if(_aiCru)warEnemy.cruiserCooldown=getCooldownTurn(warEnemy); // croiseur IA en réparation suite à la défaite en défense
    // (jetons : coût + récupération gérés par applyCombatEngage ci-dessus, symétrique attaque/défense)
    // Appliquer les dégâts sur la colonie ciblée
    if(targetId){
      const tc=warEnemy.colonies.find(c=>c.nodeId===targetId);
      if(tc){
        // CAPTURE (memo #10/#15) : la colonie change de propriétaire sur victoire
        warEnemy.colonies=warEnemy.colonies.filter(c=>c.nodeId!==targetId);updateConnections(warEnemy);
        warEnemy.forceTokens=Math.max(0,(warEnemy.forceTokens||0)-1); // le jeton de GARNISON de la colonie perdue est DÉTRUIT (il a défendu et péri)
        addLog('💥 Jeton de garnison de '+NODES[targetId].name+' détruit dans la défense.','dim');
        warEnemy.res.morale=Math.max(0,(warEnemy.res.morale||0)-1); // abandon forcé : −1<i class=ri-morale></i> de plus (total −2)
        const newLvl=Math.max(1,tc.level-1); // colonie endommagée par l'assaut
        const connP=(typeof checkConnected==='function')?checkConnected(targetId,G.player):true;
        if(!G.player.colonies.some(c=>c.nodeId===targetId))G.player.colonies.push({nodeId:targetId,level:newLvl,connected:connP,_conquest:3});
        updateConnections(G.player);
        txt='🏴 Victoire ! Tu CAPTURES '+NODES[targetId].name+' (Nv.'+newLvl+') — elle est à toi ! (+2 VP, population hostile −2<i class=ri-morale></i>)';
        addLog('🏴 '+NODES[targetId].name+' capturée sur '+warEnemy.civ.emoji+' '+warEnemy.civ.name+' ! (Nv.'+newLvl+', −2<i class=ri-morale></i> ennemi)','gold');
      }else{txt='Victoire ! (+2 VP, IA −2 jetons, −1<i class=ri-morale></i>)';addLog('⚔️ Combat : victoire ('+pPow+' vs '+aPow+') +2 VP','gold');}
    }else{txt='Victoire ! (+2 VP, IA −2 jetons, −1<i class=ri-morale></i>)';addLog('⚔️ Combat : victoire ('+pPow+' vs '+aPow+') +2 VP','gold');}
    cls='win';
  }
  else if(aPow>pPow){
    G.warWins.ai++;warEnemy.tempVP+=2;G.player.res.morale=Math.max(0,(G.player.res.morale||0)-1);
    if(_cruOn){G.player.cruiserCooldown=getCooldownTurn(G.player);addLog('⚓ Supercroiseur en réparation (récupération) suite à la défaite — pas perdu.','dim');}
    txt='Défaite. (IA +2 VP — jetons engagés immobilisés, moitié perdue, −1<i class=ri-morale></i>)';cls='loss';
    addLog('⚔️ Combat : défaite ('+pPow+' vs '+aPow+')','red');
  }
  else{G.player.res.morale=Math.max(0,(G.player.res.morale||0)-1);warEnemy.res.morale=Math.max(0,(warEnemy.res.morale||0)-1);txt='Égalité — −1<i class=ri-morale></i> pour les deux.';cls='draw';addLog('⚔️ Égalité','dim');}
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
  G._peaceCooldown=G._peaceCooldown||{};if(ewAiId)G._peaceCooldown[ewAiId]=G.turn+3; // trêve : pas de nouvelle guerre populaire avec cette nation pendant ~2 tours
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
      case 'inv2_war': s+=atWar?5:((ai.civ.id==='martiens'||ai.civ.id==='terriens')?2:1); break;
      case 'inv2_comfort': s+=morale<=4?4:1; break;
      case 'inv2_colonies': s+=belowMax*1.5; break;
      case 'inv2_union': s+=sci>=1?3:1; break;
    }
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
function doAITurn(aiPlayer,oneShot){
  const ai=aiPlayer;G.aiActions=[];G._raidsThisTurn=[];ai._warConserve=false;ai._warRecapture=null;ai._warAggressor=false;ai._enemy=_aiResolveTarget(ai);ai._pForceEst=perceivedForce(ai,ai._enemy).val;
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
    const acP=Math.max(0,bAc-ai.acLeft),cost={};
    for(const r of['energy','materials','science']){const d=(bRes[r]||0)-(ai.res[r]||0);if(d>0)cost[r]=d;}
    const df=(bRes.force||0)-(ai.forceTokens||0);if(df>0)cost.force=df;
    for(let i=fromIdx;i<G.aiActions.length;i++){const e=G.aiActions[i];if(e&&!e._rec){e._rec=true;_journalAdd(ai,e.name,acP,cost,e.desc,{war:_isWarAct(e.name)});}}
    // TRANSPARENCE (demande de Marc) : le journal affichait les actions des IA SANS leur coût — impossible de
    // vérifier qu'elles paient. On journalise donc ce qu'elles dépensent réellement, comme pour le joueur.
    if(G.aiActions.length>fromIdx){
      const parts=[];
      for(const r of ['energy','materials','science']){ if(cost[r])parts.push('−'+cost[r]+rEmoji(r)); }
      if(cost.force)parts.push('−'+cost.force+' jeton'+(cost.force>1?'s':'')+' Force');
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
      if((ai.res.materials||0)>=5){ai.res.materials-=3;addGovPts(ai,3);ai.abilityUsed=true;
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
      const isRemote=node.upgradeCost==='remote';
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

  function tryRoute(){
    if(ai.acLeft<1)return false;
    const matCost=hasSpec(ai,'route_disc')?0:1;
    if((ai.res.materials||0)<matCost)return false;
    // (plus de garde énergie : connecter une colonie est vital — une route non alimentée relie quand même la colonie, seul son bonus commercial est différé)
    for(const col of ai.colonies){
      if(col.connected)continue;
      for(const oc of ai.colonies){
        if(!oc.connected)continue;
        const on=NODES[oc.nodeId];
        if(on&&on.conn.includes(col.nodeId)&&!ai.routes.find(r=>(r.from===oc.nodeId&&r.to===col.nodeId)||(r.from===col.nodeId&&r.to===oc.nodeId))){
          ai.acLeft--;ai.res.materials=Math.max(0,(ai.res.materials||0)-matCost);ai.spentThisTurn+=1+matCost;
          const tok=ai.forceTokens>0?1:0;if(tok>0)ai.forceTokens--;
          ai.routes.push({from:oc.nodeId,to:col.nodeId,tokens:tok});updateConnections(ai);
          addLog('🤖 '+ai.civ.name+' route → '+NODES[col.nodeId].name,'dim');
          G.aiActions.push({emoji:'🛤️',name:'Route → '+NODES[col.nodeId].name,desc:tok?'1⚔ déployé':'non protégée'});
          return true;
        }
      }
    }
    return false;
  }

  function tryColonize(){
    if(ai.acLeft<1)return false;
    const owned=new Set(ai.colonies.map(c=>c.nodeId));
    const pOwned=new Set();for(const _h of allPlayers()){if(_h!==ai&&_h._isAI===false)for(const _c of _h.colonies)pOwned.add(_c.nodeId);} // nœuds des nations humaines (colonisables seulement si accord commercial)
    const otherAiOwned=new Set();for(const _o of G.ais){if(_o!==ai)for(const _c of _o.colonies)otherAiOwned.add(_c.nodeId);} // ne pas coloniser un nœud déjà occupé par une AUTRE nation
    if(!ai.recentLosses)ai.recentLosses=new Map();
    for(const[nid,until]of ai.recentLosses)if(G.turn>=until)ai.recentLosses.delete(nid);
    // Trouver le meilleur nœud adjacent selon le score (pas juste le premier)
    let bestAdj=null,bestScore=-99,bestFrom=null;
    for(const col of ai.colonies){
      for(const adj of(NODES[col.nodeId]?.conn||[])){
        if(owned.has(adj)||ai.recentLosses.has(adj))continue;
        if(NODES[adj]?.decorative||NODES[adj]?.noColonize)continue; // Anneau jovien / Station Jupiter — non colonisable
        if(pOwned.has(adj)&&!G.commercialAccords.includes(adj))continue;
        if(otherAiOwned.has(adj))continue; // nœud déjà colonisé par une autre IA (pas de double occupation)
        // extra-solaire ouvert à tous (plus de verrou tech)
        const sc=nodeScore(adj);
        if(sc>bestScore){bestScore=sc;bestAdj=adj;bestFrom=col.nodeId;}
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
    const isRemote=node.upgradeCost==='remote';
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

  function tryRaid(){
    const raidTok=isPirate?1:2;const raidEn=0;
    if(ai.acLeft<1||ai.forceTokens<raidTok)return false;
    if((ai._attacksThisTurn||0)>=1)return false; // max 1 action agressive/tour
    if(raidEn>0&&(ai.res.energy||0)<raidEn)return false;
    const _e=ai._enemy;
    if(!isPirate&&(ai.res.morale||0)<=2)return false; // self-intérêt : moral bas → l'IA se soigne au lieu de piller
    if(_e.res.energy+_e.res.materials<=0)return false;
    ai.acLeft--;ai.forceTokens-=raidTok;ai.forceCooldown.push({count:raidTok,returnTurn:getCooldownTurn(ai)});
    ai._attacksThisTurn=(ai._attacksThisTurn||0)+1;
    if(raidEn>0)ai.res.energy-=raidEn;
    ai.spentThisTurn+=1+raidTok+raidEn;
    const targets=['energy','materials'].filter(r=>(_e.res[r]||0)>0);let stolen=[];
    const maxSteal=hasSpec(_e,'ia_immune')?0:hasSpec(_e,'intel_1')?1:2;
    if(maxSteal===0){addLog('🛡️ IA Défensive : raid bloqué !','gold');return true;}
    for(let i=0;i<maxSteal&&targets.length>0;i++){const r=targets[Math.floor(Math.random()*targets.length)];_e.res[r]=Math.max(0,(_e.res[r]||0)-1);ai.res[r]=(ai.res[r]||0)+1;stolen.push(rEmoji(r));if(_e.res[r]===0)targets.splice(targets.indexOf(r),1);}
    G.warRisk=Math.min(10,(G.warRisk||0)+2);
    addTens(_e.civ.id,ai.civ.id,2); // l'ennemi (humain) est en colère contre cette IA
    if(!G._raidsThisTurn)G._raidsThisTurn=[];
    G._raidsThisTurn.push({civ:ai.civ,stolen:[...stolen]});
    if(!_e._raidsThisTurn)_e._raidsThisTurn=[]; // journal propre à la victime (bilan multijoueur)
    _e._raidsThisTurn.push({civ:ai.civ,stolen:[...stolen]});
    addLog('🤖 Raid '+ai.civ.emoji+' '+ai.civ.name+' ! Tu perds '+stolen.join('')+' (risque guerre +2, tension +2)','red');
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
    if(card.calmTension){const _eid=ai._enemy.civ.id;const cur=getTens(ai.civ.id,_eid);setTens(ai.civ.id,_eid,Math.max(0,cur-card.calmTension));}
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
    const _e=ai._enemy;
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
      if(_e && _e._isAI===false){
        ai._wantsPeace=true;
        // Ne pas afficher ce message si « ai » est en fait la nation du JOUEUR (repli auto après déconnexion) :
        // on lisait « 🌍 Terriens cherche la paix » alors que Terriens, c'est le joueur lui-même.
        if(ai._isAI!==false)addLog('🕊️ '+ai.civ.emoji+' '+ai.civ.name+' cherche la paix — à toi de décider en fin de tour.','dim');
        return;
      }
      if(typeof endWar==='function')endWar(ai.civ.id);
      addLog('🕊️ '+ai.civ.emoji+' '+ai.civ.name+' propose la paix.','dim');
      return;
    }
    // Guerre jouable → conserver les ressources, monter en puissance, et assaillir dès que possible.
    ai._warConserve=true;ai._warRecapture=target;ai._warAggressor=aggressor;
  })();
  // ── L'IA peut DÉTRUIRE une de tes routes non protégées (tactique de guerre, cap 2 attaques/tour) ──
  (function aiRouteRaid(){
    if(oneShot&&ai._aiSetupDone)return;
    const myWar=_warOf(ai.civ.id);
    if(!myWar)return;
    if((ai._attacksThisTurn||0)>=1||(ai.forceTokens||0)<1)return;
    const _e=ai._enemy;
    if(hasSpec(_e,'empath_routes')||hasSpec(_e,'ia_immune'))return; // routes tech-protégées
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
    for(const f of CIVIC_MARKET){
      if(f.type!=='government'||f.id===ai.govForm||!f.govForm)continue;
      const cost=f.cost||{};if(!Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a))continue;
      const val=(f.govForm.formPts||0)+(f.govForm.acBonus||0)*6-curVal;
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
    // 3) Matériaux bas → carte sociale de matériaux (ex. Forages Planétaires) — aide surtout les Jupitériens
    if((ai.res.materials||0)<=3){
      for(const c of CIVIC_MARKET){
        if(c.type!=='social'||c.calmAction||!(c.resGain&&c.resGain.materials))continue;
        if(!c.repeatable&&ai._civicTaken.has(c.id))continue;
        const cost=c.cost||{};if(Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a)){aiBuyCivic(ai,c);return true;}
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
    ai.acLeft--;ai.forceTokens-=raidTok;ai.forceCooldown.push({count:raidTok,returnTurn:getCooldownTurn(ai)});ai.spentThisTurn+=1+raidTok;
    ai._attacksThisTurn=(ai._attacksThisTurn||0)+1;
    addTens(ai.civ.id,best.civ.id,2);addTens(best.civ.id,ai.civ.id,2);
    if(hasSpec(best,'ia_immune')){addLog('🛡️ '+best.civ.emoji+' '+best.civ.name+' (IA Défensive) bloque le raid de '+ai.civ.name+'.','dim');G.aiActions.push({emoji:'🛡️',name:'Raid bloqué',desc:'vs '+best.civ.name});return true;}
    const tgts=['energy','materials'].filter(r=>(best.res[r]||0)>0);const stolen=[];
    for(let i=0;i<2&&tgts.length;i++){const r=tgts[Math.floor(Math.random()*tgts.length)];best.res[r]=Math.max(0,(best.res[r]||0)-1);ai.res[r]=(ai.res[r]||0)+1;stolen.push(rEmoji(r));if(best.res[r]===0)tgts.splice(tgts.indexOf(r),1);}
    addLog('🤖 '+ai.civ.emoji+' '+ai.civ.name+' pille '+best.civ.emoji+' '+best.civ.name+' : '+(stolen.join('')||'rien')+' (tension +2)','red');
    G.aiActions.push({emoji:'⚔️',name:'Pille '+best.civ.name,desc:'Vole : '+(stolen.join('')||'rien')});
    return true;
  }
  // ── IA CONTRE IA : assaut d'une colonie d'une nation IA rivale (adjacente), résolu automatiquement ──
  function tryAssaultAI(){
    if(ai.acLeft<1)return false;
    if((ai._attacksThisTurn||0)>=1)return false;
    const affordTok=Math.min(ai.res.materials||0,ai.res.energy||0);
    const commit=Math.min(ai.forceTokens||0,affordTok,3);
    if(commit<1)return false;
    let best=null,bestCol=null,bestDef=99;
    for(const r of G.ais){if(r===ai||r._isAI===false)continue;
      for(const oc of r.colonies){
        if(oc.nodeId===r.civ.home||!oc.connected||NODES[oc.nodeId]?.decorative)continue;
        if(!ai.colonies.some(c=>(NODES[c.nodeId]?.conn||[]).includes(oc.nodeId)))continue; // doit être adjacent
        const def=perceivedForce(ai,r).val;const tens=getTens(ai.civ.id,r.civ.id);
        if(commit<=def&&tens<6)continue; // n'attaque que si plus fort, ou tension haute
        if(def<bestDef){bestDef=def;best=r;bestCol=oc;}
      }
    }
    if(!best)return false;
    const tens=getTens(ai.civ.id,best.civ.id);
    const aEmpath=(hasSpec(ai,'empath_routes')?2:0)+(hasSpec(ai,'empath_tele')?2:0);
    const dEmpath=(hasSpec(best,'empath_routes')?2:0)+(hasSpec(best,'empath_tele')?2:0);
    const dCommit=Math.max(0,Math.min(best.forceTokens||0,best.res.materials||0,best.res.energy||0));
    const aPow=commit+aEmpath,dPow=dCommit+dEmpath+1/*garnison de base*/;
    ai.acLeft=Math.max(0,ai.acLeft-1);ai.spentThisTurn+=1+commit;ai._attacksThisTurn=(ai._attacksThisTurn||0)+1;
    const win=aPow>dPow;
    applyCombatEngage(ai,commit,win);if(dCommit>0)applyCombatEngage(best,dCommit,!win);
    addTens(ai.civ.id,best.civ.id,1);addTens(best.civ.id,ai.civ.id,3);
    const node=NODES[bestCol.nodeId];
    if(win){
      const newLvl=Math.max(1,bestCol.level-1);
      best.colonies=best.colonies.filter(c=>c.nodeId!==bestCol.nodeId);updateConnections(best);
      const conn=(typeof checkConnected==='function')?checkConnected(bestCol.nodeId,ai):true;
      ai.colonies.push({nodeId:bestCol.nodeId,level:newLvl,connected:conn});updateConnections(ai);
      best.res.morale=Math.max(0,(best.res.morale||0)-1);
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
    if(!ai._enemy.colonies.some(c=>c.nodeId===targetId)){ai._warRecapture=null;return false;}
    if(ai.acLeft<1)return false;
    const pForce=(ai._pForceEst!==undefined)?ai._pForceEst:(ai._enemy.forceTokens||0);
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
  function _bestColonizeScore(){
    const owned=new Set(ai.colonies.map(c=>c.nodeId));
    const otherOwned=new Set();for(const p of allPlayers())if(p!==ai)for(const c of p.colonies)otherOwned.add(c.nodeId);
    let best=-1;
    for(const col of ai.colonies)for(const adj of(NODES[col.nodeId]?.conn||[])){
      if(owned.has(adj)||otherOwned.has(adj)||NODES[adj]?.decorative||NODES[adj]?.noColonize)continue;
      if(ai.recentLosses&&ai.recentLosses.has(adj))continue;
      // extra-solaire ouvert à tous (plus de verrou tech)
      const s=nodeScore(adj);if(s>best)best=s;
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
    if(ai.civ.id==='jupiteriens')return['mines_energie','sciences_exp'];
    if(ai.civ.id==='ceinturiens')return['sciences_exp','navigation'];
    if(isMartien)return['navigation','expansion','mines_energie'];
    return['expansion','sciences_exp','navigation']; // Terriens & défaut
  }
  function _raidUtil(){
    const _e=ai._enemy;if(!_e)return 0;
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
  function _assaultAIUtil(){
    if((ai._attacksThisTurn||0)>=1)return 0;
    const affordTok=Math.min(ai.res.materials||0,ai.res.energy||0);const commit=Math.min(ai.forceTokens||0,affordTok,3);
    if(commit<1)return 0;
    for(const r of G.ais){if(r===ai||r._isAI===false)continue;for(const oc of r.colonies){if(oc.nodeId===r.civ.home||!oc.connected||NODES[oc.nodeId]?.decorative)continue;if(!ai.colonies.some(c=>(NODES[c.nodeId]?.conn||[]).includes(oc.nodeId)))continue;const def=perceivedForce(ai,r).val;const tens=getTens(ai.civ.id,r.civ.id);if(commit>def||tens>=6)return 6+(tens>=6?3:0);}}
    return 0;
  }
  function _civicUtil(){
    let v=0;const curVal=(ai.govFormPts||0)+(ai.govFormAC||0)*6;
    for(const f of (typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[])){if(f.type!=='government'||f.id===ai.govForm||!f.govForm)continue;const cost=f.cost||{};if(!Object.entries(cost).every(([r,a])=>(ai.res[r]||0)>=a))continue;const val=(f.govForm.formPts||0)+(f.govForm.acBonus||0)*6-curVal;if(val>0)v=Math.max(v,6+val*0.4);}
    const _reform=(typeof CIVIC_MARKET!=='undefined'?CIVIC_MARKET:[]).find(c=>c.id==='cm_reform');
    if(_reform&&!(ai._civicTaken&&ai._civicTaken.has('cm_reform'))&&(ai.gov_pts||0)<15){const rc=_reform.cost||{};if(Object.entries(rc).every(([r,a])=>(ai.res[r]||0)>=a))v=Math.max(v,10);}
    if((ai.res.morale||0)<=3)v=Math.max(v,7);
    return v;
  }
  function _militaryUtil(){
    const atWar=!!_warOf(ai.civ.id);
    if(!(atWar||G.warRisk>=6||(ai.forceTokens||0)<2||isMartien))return 0;
    return (ai.forceTokens||0)<2?9:(atWar?8:5);
  }
  function _routeUtil(){
    const hasDisc=ai.colonies.some(c=>!c.connected&&c.nodeId!==ai.civ.home);
    return (hasDisc&&(ai.res.materials||0)>=1)?18:0; // connecter est vital → prioritaire sur coloniser davantage
  }
  function actionUtilities(){
    const t=G.turn,mor=ai.res.morale||0,mat=ai.res.materials||0,en=ai.res.energy||0,sci=ai.res.science||0,nCol=ai.colonies.length;
    const lead=Math.max(...allPlayers().map(p=>calcVP(p).total)),myVP=calcVP(ai).total,behind=Math.max(0,lead-myVP);
    const U={};
    U.heal    = mor<=2 ? 60 : 0;                          // survie d'abord
    const cs=_bestColonizeScore(),colAff=mat>=(isMartien?1:2)&&en>=(isMartien?0:1);
    U.colonize= (cs>=0&&colAff)?(cs*1.5+(t<=3?7:0)+Math.max(0,6-nCol)*2+behind*0.3):0;
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
    return U;
  }
  const execMap={
    heal:()=>tryMoraleTech()||tryMoraleUpgrade(),
    colonize:tryColonize, upgrade:tryUpgrade, route:tryRoute,
    tech:()=>tryTech(_econBranches()),
    civic:tryCivic, military:tryMilitary,
    raid:tryRaid, raidAI:tryRaidAI, assaultAI:tryAssaultAI
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
    const U=actionUtilities();
    const ranked=Object.keys(U).filter(k=>U[k]>0).sort((a,b)=>U[b]-U[a]);
    for(const k of ranked){ if(execMap[k]&&execMap[k]()) return true; }
    return false;
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
function calcVP(p){
  // Colonies : baseVP×niveau×connexion + 1 bonus par colonie connectée
  let colVP=0;
  for(const col of p.colonies){
    const node=NODES[col.nodeId];
    if(node.decorative)continue; // nœuds décoratifs (anneau jovien) — jamais en colonie
    // Pirates : Éris et Pluton comptent baseVP:2 au niveau 1 (le premium est gagné en développant)
    // Jupitériens : Jupiter (J-1) donne son baseVP normalement comme home
    const effectiveBVP=(p.civ.id==='ceinturiens'&&col.level===1&&['eris','pluto'].includes(col.nodeId))?2:node.baseVP;
    colVP+=Math.round(effectiveBVP*col.level*(col.connected?1:0.5))+(col.connected?1:0);
  }
  // Routes : 1 VP par route établie (incite l'IA à construire des routes)
  const routeVP=p.routes.length;
  const cardsVP=p.cards.reduce((s,c)=>s+(c.vp||0),0);
  // Bonus Tech : +0.5 VP par carte Technologie (arrondi inférieur), valorise la spécialisation
  const techBonusVP=Math.floor(p.cards.filter(c=>c.type==='technology').length*0.5);
  // Bonus revenus/tour (rpt) v6 : par ressource — rpt>5→+2VP, rpt>10→+5VP
  let rptVP=0;
  for(const r of['energy','materials','science','morale']){const v=p.rpt[r]||0;rptVP+=v>10?5:v>5?2:0;}
  let agendasVP=p.agenda&&typeof p.agenda.score==='function'?p.agenda.score(p):0;
  const evtVP=p.tempVP||0;
  let extraVP=0;
  if(hasSpec(p,'extrasolar')&&p.cards.filter(c=>c.type==='technology').length>=5)extraVP+=8;
  if(hasSpec(p,'colony_vp'))extraVP+=p.colonies.filter(c=>c.connected).length;
  const forceVP=0; // supprimé v6
  return{colVP,routeVP,cardsVP,techBonusVP,rptVP,forceVP,agendasVP,evtVP,extraVP,total:colVP+routeVP+cardsVP+techBonusVP+rptVP+agendasVP+evtVP+extraVP};
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
    L.push('   Colonies : '+v.colVP+' · Routes : '+v.routeVP+' · Cartes : '+v.cardsVP);
    L.push('   Bonus tech : '+v.techBonusVP+' · Bonus revenus/tour : '+v.rptVP);
    L.push('   Agenda'+(p.agenda&&p.agenda.name?' ('+p.agenda.name+')':'')+' : '+v.agendasVP+' · Événements : '+v.evtVP+(v.extraVP?' · Bonus spéciaux : '+v.extraVP:''));
  }
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
function doEndGame(){
  G.phase='over';scClearSave();const pVP=calcVP(G.player);const aiVPs=G.ais.map(ai=>({ai,vp:calcVP(ai)}));const bestAiVP=aiVPs.reduce((best,x)=>x.vp.total>best.vp.total?x:best,aiVPs[0]||{ai:null,vp:{total:0}});const aVP=bestAiVP.vp;
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
        log:(function(){try{return buildJournalReport().split('\n').slice(0,400).reverse();}catch(e){return(G.log||[]).slice(0,150).map(x=>String((x&&x.msg)||x).replace(/<[^>]+>/g,''));}})()})}).catch(()=>{});
  }catch(e){}
  setTimeout(()=>{
    const win=pVP.total>=aVP.total;
    document.getElementById('end-title').textContent=win?'🏆 Victoire !':'💀 Défaite';
    document.getElementById('end-result').textContent=win?'Tu domines le système solaire ! '+pVP.total+' VP contre '+aVP.total+'.':"Un adversaire s'impose : "+aVP.total+' VP contre '+pVP.total+'.';
    const mkBox=(lbl,vp,w,em)=>`<div class="vp-box ${w?'winner':''}"><h3>${em} ${lbl}</h3>
      <div class="vp-line"><span>Colonies (+1/connectée)</span><span>${vp.colVP}</span></div>
      <div class="vp-line"><span>Routes (1VP/route)</span><span>+${vp.routeVP}</span></div>
      <div class="vp-line"><span>Cartes</span><span>+${vp.cardsVP}</span></div>
      <div class="vp-line"><span>Bonus Tech (×0.5/tech)</span><span>+${vp.techBonusVP}</span></div>
      <div class="vp-line"><span>Bonus Revenus/tour</span><span>+${vp.rptVP}</span></div>
      <div class="vp-line"><span>Agendas</span><span>+${vp.agendasVP}</span></div>
      <div class="vp-line"><span>Événements</span><span>+${vp.evtVP}</span></div>
      <div class="vp-line"><span>Bonus spéciaux</span><span>+${vp.extraVP}</span></div>
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
    const pCol=G.player.colonies.find(c=>c.nodeId===id);const anyACol=G.ais.map(ai=>({col:ai.colonies.find(c=>c.nodeId===id),ai})).find(x=>x.col);const aCol=anyACol?anyACol.col:null;const aColAI=anyACol?anyACol.ai:G.ais[0];
    const nr=node.r||6;
    const isOrbital=node.type==='orbital_station';
    const ir=Math.min(Math.max(nr,6),26); // lunes plus petites, proportionnelles à node.r
    const br=(node.decorative||isOrbital)?nr+2:ir; // rayon de référence pour anneaux/label/clic
    const glowR=br+6;
    let glow='';
    if(G.phase==='actions'){
      if(mode==='colonize'&&!pCol&&(!aCol||G.commercialAccords.includes(id)))glow=`<circle cx="${node.x}" cy="${node.y}" r="${glowR}" fill="${node.color}" fill-opacity=".12" stroke="${node.color}" stroke-width="1.5" stroke-dasharray="4,3"/>`;
      if(mode==='route'){if(!routeFrom&&pCol)glow=`<circle cx="${node.x}" cy="${node.y}" r="${glowR}" fill="#44aaff" fill-opacity=".1" stroke="#44aaff" stroke-width="1.5" stroke-dasharray="3,3"/>`;if(routeFrom&&NODES[routeFrom]?.conn.includes(id))glow=`<circle cx="${node.x}" cy="${node.y}" r="${glowR}" fill="#ffaa00" fill-opacity=".12" stroke="#ffaa00" stroke-width="1.5" stroke-dasharray="3,3"/>`;}
    }
    let rings='';
    if(pCol)rings+=`<circle cx="${node.x}" cy="${node.y}" r="${br+3+pCol.level*3}" fill="none" stroke="${G.player.civ.color}" stroke-width="${pCol.level+1}" stroke-opacity="${pCol.connected?.85:.3}"/>`;
    if(aCol)rings+=`<circle cx="${node.x}" cy="${node.y}" r="${br+1+aCol.level*2}" fill="none" stroke="${aColAI.civ.color}" stroke-width="${aCol.level}" stroke-opacity="${aCol.connected?.65:.2}"/>`;
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
const MAP_CAPITAL={terre:'Terriens',mars:'Martiens',jorbital1:'Jupitériens',eris:'Ceinturiens'};
// planète décor-capitale → nœud jouable (QG) qu'elle représente, pour la rendre cliquable
const MAP_CAPITAL_NODE={terre:'lune',mars:'phobos'};
// durées de trajet (par arête, ids triés) — voie commerciale ∝ temps
const MAP_ROUTE_TIME={'lune|phobos':'~7 mois','ceres|lune':'~1 an','ceres|phobos':'~8 mois',
 'europe|io':'~5 j','ganymede|io':'~8 j','callisto|europe':'~6 j','europe|jorbital1':'~5 j','callisto|ganymede':'~7 j','ganymede|jorbital1':'~8 j','ganymede|vesta':'≈ mois',
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
   nexus:[{fromNode:'ceres',toNode:'io',to:'jupiter',next:'Io',xy:[372,345]},{fromNode:'ceres',toNode:'vesta',to:'jupiter',next:'Vesta',xy:[392,196]}],
   band:{a:[300,118],b:[372,366],w:74,n:60,warm:true,name:'Ceinture intérieure',lab:[348,108]}},
 jupiter:{title:'Secteur 2 · Jupiter',color:'#ffb255',belt:1,
   place:{vesta:[52,158],jorbital1:[105,392],io:[160,350],europe:[240,378],ganymede:[208,238],callisto:[348,300]},
   nexus:[{fromNode:'io',toNode:'ceres',to:'interne',next:'Cérès',xy:[28,248]},{fromNode:'vesta',toNode:'ceres',to:'interne',next:'Cérès',xy:[24,96]},{fromNode:'callisto',toNode:'titan',to:'saturne',next:'Titan',xy:[372,392]}],
   band:{a:[18,80],b:[120,248],w:52,n:44,warm:true,name:'Ceinture intérieure',lab:[132,264]}},
 saturne:{title:'Secteur 3 · Saturne',color:'#e9cf86',
   place:{saturne:[108,425,54],encelade:[210,360],titan:[262,235]},
   nexus:[{fromNode:'titan',toNode:'callisto',to:'jupiter',next:'Callisto',xy:[36,175]},{fromNode:'titan',toNode:'triton',to:'externe',next:'Triton',xy:[376,330]}]},
 externe:{title:'Secteur 4 · Externe & Kuiper',color:'#9ac8f5',belt:1,
   place:{uranus:[108,165],neptune:[235,150],triton:[222,196],pluto:[135,430],eris:[305,458]},
   nexus:[{fromNode:'triton',toNode:'titan',to:'saturne',next:'Titan',xy:[36,300]}],
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
 {x:305,y:231,r:26,label:'Jupiter',lp:'below',sector:'jupiter',node:'jorbital1'},
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
         (Version précédente : la carte était réduite à une bande fine. C'était une autre idée que
         celle de Marc — « replier » voulait dire corner le coin, pas replier la carte.) */
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
      const lockOverlay=!isTechAvailable(card,G.player)?`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;background:rgba(0,0,0,.18)">🔒</div>`:'';
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
      if(compact){
        html+=`<div class="gcard gc-compact${isCurrentForm?' gc-mine':''}" onclick="showMarketDetail('${card.id}')" style="border-top:2px solid ${border};opacity:${taken?.4:1}">
          <div class="gc-header"><span class="gc-name">${card.emoji} ${card.name}${govTag}</span><span class="gc-cost">${taken?'✗':isCurrentForm?'✓':canBuy?'1AC '+costStr:'—'}</span></div></div>`;
      } else {
        html+=`<div class="gcard${isCurrentForm?' gc-mine':''}" onclick="showMarketDetail('${card.id}')" style="border-top:2px solid ${border};cursor:pointer;opacity:${taken?.4:1}">
          <div class="gc-header"><span class="gc-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">${card.name}${govTag}</span></div>
          <div class="gc-art" style="${CARD_ART.has(card.id)?`background:#0a0a18 url('assets/cards/${card.id}.png') center/cover no-repeat`:`background:${artBg}`}">${CARD_ART.has(card.id)?'':card.emoji}<span style="position:absolute;top:1px;right:2px;font-size:.55em;color:${badgeCol}">${badge}</span></div>
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
      const taken=milThisTurn||(card.repeatable?false:card.type==='civique'?G.player.cards.some(c=>c.id===card.id):G.techTaken.has(card.id));
      const mine=G.player.cards.some(c=>c.id===card.id);
      const cost=getEffCost(card,G.player);
      const costHtmlStr=costHtml(cost);
      const _acN=card.ac||1;const _reqOk=!card.reqCard||G.player.cards.some(c=>c.id===card.reqCard);
      const canBuy=!taken&&_reqOk&&G.phase==='actions'&&G.player.acLeft>=_acN&&Object.entries(cost).every(([res,a])=>(G.player.res[res]||0)>=a);
      const border=TYPE_COLORS[card.type]||'#2a2a5a';
      const artBg=border+'20';
      if(compact){
        r+=`<div class="gcard gc-compact${mine?' gc-mine':''}" onclick="showGeneralDetail('${card.id}')" style="border-top:2px solid ${border};opacity:${taken?.4:1}">
          <div class="gc-header"><span class="gc-name">${card.emoji} ${card.name}</span><span class="gc-cost">${taken?'✗':!_reqOk?'🔒':canBuy?_acN+'AC':'—'}</span></div></div>`;
      } else {
        r+=`<div class="gcard${mine?' gc-mine':''}" onclick="showGeneralDetail('${card.id}')" style="border-top:2px solid ${border};cursor:pointer;opacity:${taken?.4:1}">
          <div class="gc-header"><span class="gc-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">${card.name}</span></div>
          <div class="gc-art" style="${CARD_ART.has(card.id)?`background:#0a0a18 url('assets/cards/${card.id}.png') center/cover no-repeat`:`background:${artBg}`}">${CARD_ART.has(card.id)?'':card.emoji}${(card.repeatable||card.perTurn)?'<span style="position:absolute;top:1px;right:3px;font-size:.55em;color:#ffaa44">∞</span>':''}</div>
          <div class="gc-body"><div class="tc-effect" style="color:#8898b8">${card.effect}</div>
          <div class="gc-cost">${taken?'<span style="color:#ff6060;font-size:.8em">Acquis</span>':!_reqOk?'<span style="color:#cc7744;font-size:.72em">🔒 '+(CARDS_POOL.find(c=>c.id===card.reqCard)?.name||'tech requise')+'</span>':canBuy?'<span class="res-tag energy" style="font-size:.85em">'+_acN+'AC</span> '+costHtmlStr:'<span style="color:#5a6a8a">'+_acN+'AC '+Object.entries(cost).map(([res,a])=>rLabel(res)+' '+a).join(' ')+'</span>'}</div></div>
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
    const border=TYPE_COLORS[card.type]||'#2a2a5a';
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
/* ============================================================ NODE POPUP ============================================================ */
function showNodePopup(nodeId){
  if(G.phase!=='actions')return;
  const node=NODES[nodeId];
  if(node.decorative||node.noColonize){return;} // Anneau jovien / Station Jupiter — non colonisable
  const pCol=G.player.colonies.find(c=>c.nodeId===nodeId);const aColInfo=G.ais.map(ai=>({ai,col:ai.colonies.find(c=>c.nodeId===nodeId)})).find(x=>x.col);const aCol=aColInfo?aColInfo.col:null;const aColAI=aColInfo?aColInfo.ai:null;
  document.getElementById('npop-title').textContent=node.emoji+' '+node.name;
  const resStr=Object.entries(node.res).map(([r,a])=>'+'+a+rEmoji(r)).join(' ');
  const accord=G.commercialAccords.includes(nodeId);
  document.getElementById('npop-info').innerHTML=`VP: ${node.baseVP} | ${resStr}<br>Type: ${({moon:'Lune',dwarf_planet:'Planète naine',asteroid:'Astéroïde',orbital_station:'Station orbitale',planet:'Planète',gas_giant:'Géante gazeuse'})[node.type]||node.type}${pCol?`<br>✅ <b style="color:${G.player.civ.color}">${G.player.civ.emoji} ${G.player.civ.name} (toi)</b> — Nv.${pCol.level}${pCol.connected?' ✓':' ✗ déconnectée'}`:''}${aCol&&aColAI?`<br>🏴 Colonie de <b style="color:${aColAI.civ.color}">${aColAI.civ.emoji} ${aColAI.civ.name}</b> — Nv.${aCol.level}${accord?' 🤝 accord':''}`:''}${!pCol&&!aCol?'<br><span style="color:#7a8aa0">Inoccupé</span>':''}${getPiratePos(G.turn)===nodeId?'<br><span style="color:#ff8888">⚠️ Pirates ici !</span>':''}`;
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
      acts.innerHTML+=`<button class="npop-btn" style="border-color:#9a1a1a;color:#ff8888" ${atkOk?'':'disabled'} onclick="breakAccordAndAttack('${nodeId}')">💥 Rompre l'accord & Attaquer<br><small>1AC -${tc}⚔ — DÉCLENCHE GUERRE</small></button>`;
      // Même avec un accord, on peut rompre et déclarer la guerre
      if(!G.warState){
        const tc=G.player.civ.id==='ceinturiens'?1:2;const atkOk=G.player.acLeft>=1&&G.player.forceTokens>=tc;
        acts.innerHTML+=`<button class="npop-btn" style="border-color:#aa4400;color:#ff9966" ${atkOk?'':'disabled'} onclick="breakAccordAndAttack('${nodeId}')">⚔️ Rompre l'accord & Attaquer<br><small>1AC -${tc}⚔ — révoque l'accord, déclenche GUERRE</small></button>`;
      }
    }
  }
  if(pCol&&pCol.level<node.maxLv&&!pCol.noUpgrade){
    const _isRem=node.upgradeCost==='remote';const _tLv=pCol.level+1;
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
function addAction(emoji,name,acPaid,resPaid,gainDesc){if(!G.turnActions)G.turnActions=[];const _entry={emoji,name,acPaid:acPaid||0,resPaid:resPaid||{},gainDesc:gainDesc||''};G.turnActions.push(_entry);if(G.player){if(!G.player._turnActions)G.player._turnActions=[];G.player._turnActions.push(_entry);}/* journal par nation : indispensable au bilan en multijoueur */if(G){G._scStuckTries=0;try{G._journal=G._journal||[];G._journal.push({turn:G.turn||0,nat:(G.player&&G.player.civ&&G.player.civ.name)||'Toi',name:name,ac:acPaid||0,cost:_normCost(resPaid),gain:_riToText(gainDesc),war:_isWarAct(name),auto:false});}catch(e){}}showToast(emoji,name,acPaid,resPaid,gainDesc);if(G&&G._il){G._ilPassTries=0;setTimeout(_ilMaybePass,60);}}
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
    if(disc.vp)p.tempVP=(p.tempVP||0)+disc.vp;
    addLog('🗺️ Découverte : '+disc.name+' — '+disc.desc,'gold');
    // Colonisation terminée (découverte fermée) → popup de confirmation annulable
    const _nd=NODES[nodeId];const _cg=[];
    if(_nd&&_nd.baseVP)_cg.push({kind:'vp',val:_nd.baseVP});
    scArmConfirm('🏗️ '+((_nd&&_nd.name)||'Colonie'),_cg);
  }
  render();
}
function showWarModal(title,body,result){
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
function showPeaceOfferModal(isJustDeclared,cb){
  _paixSuite(cb);
  G._peaceOffer={materials:0,energy:0,science:0};
  const p=G.player;const ai=G.warWith?G.ais.find(a=>a.civ.id===G.warWith)||G.ais[0]:G.ais[0];
  const declBy=G._warDeclaredBy||'other';
  if(_decisionActive()){ // mode serveur : router le choix paix/guerre vers l'humain en guerre
    _emitDecision('peace_offer', p,
      {attacker:(ai?ai.civ.id:null), attackerName:(ai?ai.civ.name:'IA'), isJustDeclared:!!isJustDeclared, declaredBy:declBy,
       vpYou:calcVP(p).total, vpEnemy:calcVP(ai||G.ais[0]).total, stocks:{materials:p.res.materials||0,energy:p.res.energy||0,science:p.res.science||0}},
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
  G._peaceCooldown=G._peaceCooldown||{};
  G._peaceCooldown[dest.civ.id]=G.turn+3; G._peaceCooldown[prop.civ.id]=G.turn+3;
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
    G._peaceCooldown=G._peaceCooldown||{};if(peaceWarWith)G._peaceCooldown[peaceWarWith]=G.turn+3; // trêve après paix négociée
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
    /* SUPERCROISEUR : en ligne il n'était JAMAIS pris en compte. `G._cruiserDeployed` est un drapeau
       posé par la modale SOLO ; la réponse réseau ne le transportait pas, donc le serveur résolvait
       toujours le combat sans lui (bug de Marc : 10 jetons + supercroiseur contre une capitale à 10
       → « Égalité » au lieu d'une victoire). On l'expose et on le reçoit. */
    const _cruHas=(typeof cruiserAvailable==='function')&&cruiserAvailable(_p);
    const _cruOk=_cruHas&&(typeof cruiserAfford==='function')&&cruiserAfford(_p);
    _emitDecision('war_combat', _p,
      {enemy:(_ai?_ai.civ.id:null), enemyName:(_ai?_ai.civ.name:'IA'), warTurnsLeft:G.warTurnsLeft, myForce:_p.forceTokens||0,
       maxEngage:_maxEng,
       cruiser:{has:!!_cruHas, afford:!!_cruOk, power:(_p.cruiserPower||5)},
       canHold:((G._warDeclaredBy||'other')!=='player'),
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
  const canHold=(G._warDeclaredBy||'other')!=='player';
  const holdBtn=canHold
    ?'<div style="margin-top:10px;padding-top:10px;border-top:1px solid #2a3a5a"><strong style="color:#88ccff">🕊️ Tenir position</strong><br><span style="color:#7880a0;font-size:.82em">Pas ton conflit — conserve tes jetons. Si l\'ennemi attaque, tu choisis ta défense. Si les deux tiennent : aucun combat, aucune perte.</span><br><button onclick="warHoldPosition()" style="margin-top:6px;padding:6px 14px;background:#0a1a2a;border:1px solid #4488cc;color:#88bbee;border-radius:6px;cursor:pointer;font-weight:700">🕊️ Tenir position</button></div>'
    :'';
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
  _warAttackColonyTarget=nodeId;
  _warShowAttackSlider();
}
function _warShowAttackSlider(){
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
  const _afford=maxAffordableTokens(p); // SOURCE UNIQUE : tient compte de l'IA de Navigation (coût ÷2, demie sur ⚡)
  const maxCommit=Math.max(0,Math.min(p.forceTokens-defFloor,_afford));
  slider.min=0;slider.max=maxCommit;slider.value=maxCommit;
  if(defFloor>0)document.getElementById('wcm-info').innerHTML+=
    '<br><span style="color:#7880a0;font-size:.8em">⚠️ '+defFloor+' jeton(s) réservés pour la défense de tes colonies (non engageables).</span>';
  if(Math.max(0,p.forceTokens-defFloor)>_afford)document.getElementById('wcm-info').innerHTML+=
    '<br><span style="color:#ff8866;font-size:.8em">⚠️ Limité à '+_afford+' jeton(s) : il faut 1<i class=ri-materials></i> +1<i class=ri-energy></i> par jeton engagé.</span>';
  // Bonus Empathes (gratuit, non gaspillable)
  const _emp=(hasSpec(p,'empath_routes')?2:0)+(hasSpec(p,'empath_tele')?2:0);
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
  const _rarcw=_warBetween(_moiId(),G.warWith);if(_rarcw){_rarcw.turnsLeft--;G.warTurnsLeft=_rarcw.turnsLeft;}else G.warTurnsLeft--;
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
  const emp=(hasSpec(p,'empath_routes')?2:0)+(hasSpec(p,'empath_tele')?2:0);
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
  const _affD=Math.min(p.res.materials||0,p.res.energy||0); // 1<i class=ri-materials></i>+1<i class=ri-energy></i> par jeton engagé
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
  const lockOverlay=!isTechAvailable(card)?'<div style="position:absolute;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:28px">🔒</div>':'';
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
  const taken=_milThisTurn||(card.repeatable?false:card.type==='civique'?G.player.cards.some(c=>c.id===cardId):G.techTaken.has(cardId));
  const cost=getEffCost(card,G.player);
  const _acN=card.ac||1;const _reqOk=!card.reqCard||G.player.cards.some(c=>c.id===card.reqCard);
  const canBuy=!taken&&_reqOk&&G.phase==='actions'&&G.player.acLeft>=_acN&&Object.entries(cost).every(([r,a])=>(G.player.res[r]||0)>=a);
  const typeColor=TYPE_COLORS[card.type]||'#2a2a5a';
  document.getElementById('td-card').style.borderTop=`4px solid ${typeColor}`;
  const artEl2=document.getElementById('td-art');
  if(CARD_ART.has(cardId)){artEl2.style.background=`#0a0a18 url('assets/cards/${cardId}.png') center/cover no-repeat`;artEl2.style.height='230px';}
  else{artEl2.style.background=typeColor+'22';artEl2.style.height='';}
  const genLabel=card.type==='militaire'?'Militaire':card.type==='civique'?'Civique':'Général';
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
  const atkAi=G.ais.find(ai=>ai.colonies.find(c=>c.nodeId===_attackTargetNode))||G.ais[0];
  const aiAfford=atkAi?Math.max(0,Math.min(atkAi.forceTokens||0,atkAi.res.materials||0,atkAi.res.energy||0)):0;
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
      G.player.tempVP=(G.player.tempVP||0)+2;
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
function addLog(msg,cls=''){
  if(G)G._lastProgress=Date.now(); // battement de cœur pour le chien de garde anti-blocage
  G.log.unshift({msg,cls});if(G.log.length>80)G.log.pop();
  const el=document.getElementById('log-content');
  if(el)el.innerHTML=G.log.map(e=>`<div class="log-e ${e.cls}">${_logColorNations(e.msg)}</div>`).join('');
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
    'pluto|triton':60,'eris|triton':90,'eris|pluto':45,
    'mars|terre':26,'jupiter|mars':70,'eris|jupiter':220};
  const _range=d=>{const lo=Math.max(1,Math.round(d*0.85)),hi=Math.round(d*1.2);return lo+'–'+hi+' j';};
  const _pill=(x,y,txt,gold)=>{const w=Math.max(34,txt.length*5.4);return `<g><rect x="${(x-w/2).toFixed(1)}" y="${y-8}" width="${w.toFixed(1)}" height="16" rx="8" fill="${gold?'#241f0e':'#0b1730'}" fill-opacity=".9" stroke="${gold?'#FFD54F':'#4a9eff'}" stroke-opacity=".65" stroke-width="1"/><text x="${x}" y="${y+3.5}" text-anchor="middle" font-size="8.5" font-weight="600" fill="${gold?'#ffe08a':'#a9c8ff'}">${txt}</text></g>`;};
  const _curve=(a,b)=>{const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;const side=((mx-SUN.x)*ny-(my-SUN.y)*nx)>=0?1:-1;const off=Math.min(len*0.18,90)*side;return{cx:mx+nx*off,cy:my+ny*off};};
  // Routes POSSIBLES (graphe du jeu) : lignes bleues + durée si le trajet est long (≥50 j)
  const drawn=new Set();
  for(const[id,node]of Object.entries(NODES)){for(const adj of node.conn){const key=[id,adj].sort().join('-');if(drawn.has(key))continue;drawn.add(key);const t=NODES[adj];if(node.type==='orbital_station'||t.type==='orbital_station')continue;
    s+=`<line x1="${node.x}" y1="${node.y}" x2="${t.x}" y2="${t.y}" stroke="#5a7fc0" stroke-width="1.5" stroke-opacity=".7" stroke-dasharray="6,4"/>`;
    const d=DUR[[id,adj].sort().join('|')]??_days(node,t);
    if(d>=50){const px=node.x+(t.x-node.x)*0.65,py=node.y+(t.y-node.y)*0.65;s+=_pill(px,py,_range(d),false);}
  }}
  // Routes COMMERCIALES (purement visuelles) reliant les capitales : Terre → Mars → Jupiter → Éris. Durée toujours affichée.
  const _pos=id=>NODES[id]||PLANETS_DECO.find(p=>p.name==={terre:'Terre',mars:'Mars',jupiter:'Jupiter'}[id]);
  for(const[a,b] of [['terre','mars'],['mars','jupiter'],['jupiter','eris']]){const A=_pos(a),B=_pos(b);if(!A||!B)continue;const c=_curve(A,B);s+=`<path d="M ${A.x} ${A.y} Q ${c.cx.toFixed(1)} ${c.cy.toFixed(1)} ${B.x} ${B.y}" fill="none" stroke="#FFD54F" stroke-width="2.3" stroke-opacity=".5" stroke-dasharray="2,7" stroke-linecap="round"/>`;const px=0.25*A.x+0.5*c.cx+0.25*B.x,py=0.25*A.y+0.5*c.cy+0.25*B.y;s+=_pill(px,py,_range(DUR[[a,b].sort().join('|')]??_days(A,B)),true);}
  document.getElementById('connections').innerHTML=s;
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
