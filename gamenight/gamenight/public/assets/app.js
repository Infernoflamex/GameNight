"use strict";
/* ═══════════════════════════════════════════════════════════════════════════
   GAME NIGHT — app logic
   Data lives in Firebase Realtime Database under /gamenight:
     { players:[], customs:[], feed:[], gameImages:{} }
   Player objects may also carry `pw` ({s,h} PBKDF2 hash) and `wishes` ({gameId:1|2|3}).
   ═══════════════════════════════════════════════════════════════════════════ */

// ── TINY HELPERS ─────────────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ic=(n,s=16,swap)=>PX.icon(n,s,"",swap);
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
const wr=(v,p)=>p>0?Math.round(v/p*100):0;
const initial=n=>([...String(n||"?").trim()][0]||"?").toUpperCase();
function arr(v){return Array.isArray(v)?v.filter(Boolean):v?Object.values(v).filter(Boolean):[];}
// Date formatting is surprisingly slow in browsers: one shared formatter + a cache per date string.
const DF_LONG=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",year:"numeric"}),DF_SHORT=new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit"});
const fdCache=new Map(),fdsCache=new Map();
function fd(d){if(!d)return"—";let v=fdCache.get(d);if(v===undefined){v=DF_LONG.format(new Date(d+"T12:00:00"));fdCache.set(d,v);}return v;}
function fdShort(d){if(!d)return"";let v=fdsCache.get(d);if(v===undefined){v=DF_SHORT.format(new Date(d+"T12:00:00"));fdsCache.set(d,v);}return v;}
function pick(a){return a[Math.floor(Math.random()*a.length)];}

// ── GAMES ────────────────────────────────────────────────────────────────────
const BG=[
  {id:"dobble",name:"Dobble",icon:"dobble",type:"board"},
  {id:"faraway",name:"Faraway",icon:"faraway",type:"board"},
  {id:"battle-sheep",name:"Battle Sheep",icon:"sheep",type:"board"},
  {id:"sea-salt",name:"Sea Salt & Paper",icon:"crab",type:"board"},
  {id:"quoridor",name:"Quoridor",icon:"wall",type:"board"},
  {id:"splendor",name:"Splendor",icon:"gem",type:"board"},
  {id:"catan",name:"CATAN",icon:"wheat",type:"board"},
  {id:"7wonders",name:"7 Wonders",icon:"pyramid",type:"board"},
  {id:"splendor-duel",name:"Splendor Duel",icon:"gems",type:"board"},
  {id:"celestia",name:"Celestia",icon:"airship",type:"board"},
  {id:"perfect-words",name:"Perfect Words",icon:"notepad",type:"board"},
  {id:"perudo",name:"Perudo",icon:"dicecup",type:"board"},
  {id:"squadro",name:"Squadro",icon:"arrows",type:"board"},
  {id:"aventuriers",name:"Les Aventuriers du Rail",icon:"train",type:"board"},
  {id:"roi-nains",name:"Le Roi des Nains",icon:"dwarf",type:"board"},
  {id:"quarto",name:"Quarto",icon:"blocks",type:"board"},
  {id:"break-code",name:"Break the Code",icon:"codelock",type:"board"},
  {id:"stella",name:"Stella – Dixit Universe",icon:"moon",type:"board"},
  {id:"hutan",name:"HUTAN",icon:"tree",type:"board"},
  {id:"tarot",name:"Tarot",icon:"tarot",type:"board"},
  // Jeux en ligne
  {id:"lol",name:"League of Legends",icon:"helm",type:"online"},
  {id:"valorant",name:"Valorant",icon:"crosshair",type:"online"},
  {id:"starcraft2",name:"StarCraft II",icon:"spaceship",type:"online"},
  {id:"osu",name:"osu!",icon:"rhythm",type:"online"},
  {id:"minecraft",name:"Minecraft",icon:"pickaxe",type:"online"},
  {id:"cs2",name:"Counter-Strike 2",icon:"bomb",type:"online"},
  {id:"rocket-league",name:"Rocket League",icon:"ball",type:"online"},
  {id:"tft",name:"Teamfight Tactics",icon:"pawn",type:"online"},
  {id:"among-us",name:"Among Us",icon:"astronaut",type:"online"},
  {id:"overwatch2",name:"Overwatch 2",icon:"shield",type:"online"},
  {id:"fortnite",name:"Fortnite",icon:"parachute",type:"online"},
  {id:"gartic-phone",name:"Gartic Phone",icon:"paint",type:"online"},
  {id:"geoguessr",name:"GeoGuessr",icon:"mappin",type:"online"},
];
// Pixel icons for games added by hand before icons existed (matched by name)
const NAME_HINTS={
  "le petit bac":"letters","azul":"tiles","skyjo":"cards","memoire 44":"tank","scrabble":"letters",
  "dame de pique":"spade","pickomino":"worm","skribbl.io":"paint","the game 0f life 2":"car","the game of life 2":"car",
  "dobble connect":"dobble","fromage":"cheese","evergreen":"pine","harmonies":"bird","ipso":"bubble",
  "king of tokyo":"monster","kingdom builder":"castle","colt express":"cowboy","tarot":"tarot","small world":"dragon",
};
const ONLINE_HINTS=new Set(["skribbl.io"]);
const ICON_CHOICES=["meeple","dice","cards","card","tarot","spade","letters","notepad","tiles","blocks","pawn","dicecup","codelock","gem","gems","crown",
  "train","sheep","crab","wheat","pyramid","temple","castle","dragon","monster","dwarf","tree","pine","bird","worm","cheese","airship","moon","sun",
  "car","tank","cowboy","faraway","wall","arrows","dobble","bubble","paint","gamepad","globe","helm","crosshair","spaceship","rhythm","pickaxe",
  "bomb","ball","astronaut","shield","parachute","mappin","sword","swords","target","rocket","heart","star","skull","boom","fire","bolt"];
const TINTS=[["#29366f","#253063"],["#257179","#216870"],["#5d275d","#532252"],["#7a4841","#6f403a"],["#333c57","#2d354e"],["#3b5dc9","#3553b8"],["#2f6b4a","#2a6142"],["#7a3a48","#6f3441"]];
function tint(id){let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return TINTS[h%TINTS.length];}

function ag(){return[...BG.map(g=>({...g,img:gameImages[g.id]||null})),...customs];}
function gg(id){return ag().find(g=>g.id===id);}
function gType(g){if(!g)return"board";if(g.type)return g.type;return ONLINE_HINTS.has(norm(g.name))?"online":"board";}
function gIcon(g){
  if(!g)return"dice";
  if(g.icon&&PX.has(g.icon))return g.icon;
  const h=NAME_HINTS[norm(g.name)];if(h&&PX.has(h))return h;
  return gType(g)==="online"?"gamepad":"meeple";
}
function gameArt(g,size=48,useCover=true,extra=""){
  const[a,b]=tint(g?.id||"x");
  const inner=useCover&&g?.img?coverDiv(g):ic(gIcon(g),size);
  return`<div class="art" style="--a1:${a};--a2:${b};${extra}">${inner}</div>`;
}
function countByGame(){const c={};feed.forEach(f=>{c[f.gameId]=(c[f.gameId]||0)+1;});return c;}

// ── PALETTES ─────────────────────────────────────────────────────────────────
const COLS=["#ffcd75","#ef7d57","#e46a7e","#b13e53","#a7f070","#38b764","#73eff7","#41a6f6","#3b5dc9","#d47fd4","#c98a5b","#f4f4f4"];
const ACCS=["#ffcd75","#ef7d57","#73eff7","#a7f070","#41a6f6","#e46a7e","#d47fd4","#38b764","#c98a5b"];
const ST_COLORS=["#73eff7","#ef7d57","#ffcd75","#a7f070","#41a6f6","#e46a7e","#d47fd4","#38b764","#f4f4f4","#c98a5b"];
const MEEPLE_SWAPS=[null,{"2":"9","3":"a","1":"8"},{"2":"6","3":"5","1":"7"},{"2":"3","3":"4","1":"2"},{"2":"1","3":"2","1":"0"}];
function medal(i,s=16){return i<3?ic(["medal1","medal2","medal3"][i],s):`<span class="rk-num">${i+1}</span>`;}

// ── SCORING ──────────────────────────────────────────────────────────────────
// Convert a placement + player count into a 1-4 rank (last place = rank 4)
function gameRankFor(place,n){
  if(n<=2)return place===1?1:4;
  if(n===3)return place===1?1:place===2?2:4;
  return place===1?1:place===2?2:place===3?3:4;
}
function ptsFor(place,n){
  if(n<=2)return place===1?1:-1;
  if(n===3)return place===1?2:place===2?1:-1;
  return place===1?3:place===2?2:place===3?1:-1;
}
function feedSortDesc(a,b){
  const da=a.date?new Date(a.date+"T12:00:00"):new Date(0);
  const db=b.date?new Date(b.date+"T12:00:00"):new Date(0);
  const diff=db-da;if(diff!==0)return diff;
  return Number(b.id)-Number(a.id);
}
function feedSortAsc(a,b){return-feedSortDesc(a,b);}
const rkCache=new WeakMap(); // normalized rankings per match object (cleared when a match is edited)
function getRankings(f){
  let c=rkCache.get(f);if(c)return c;
  c=rankingsOf(f);rkCache.set(f,c);return c;
}
function rankingsOf(f){
  if(f.rankings)return arr(f.rankings).map(r=>({...r,pids:arr(r.pids)}));
  if(!f.winnerId)return[];
  const ranks=[{place:1,pids:[f.winnerId]}];
  const others=(f.playerIds||[]).filter(id=>id!==f.winnerId);
  if(others.length)ranks.push({place:2,pids:others});
  return ranks;
}
function placeOf(f,pid){const n=(f.playerIds||[]).length;const r=getRankings(f).find(r=>r.pids.includes(pid));return r?r.place:Math.max(n,99);}

// Rebuild stats from feed
let stats={};
function rbs(){
  stats={};
  const blank=()=>({parties:0,victoires:0,seconds:0,troisiemes:0,points:0,scoreSum:0,scoreCount:0,scoreMax:null,scoreMin:null,rankSum:0,rankCount:0});
  feed.forEach(f=>{
    const rnk=getRankings(f),allPids=f.playerIds||[],scores=f.scores||{},n=allPids.length;
    const rankedSet=new Set(rnk.flatMap(r=>r.pids));
    allPids.forEach(pid=>{
      if(!stats[pid])stats[pid]={};
      if(!stats[pid][f.gameId])stats[pid][f.gameId]=blank();
      const s=stats[pid][f.gameId];
      s.parties++;
      if(!rankedSet.has(pid)){s.points+=ptsFor(999,n);s.rankSum+=4;s.rankCount++;}
      if(scores[pid]!==undefined&&scores[pid]!==null&&scores[pid]!==""){
        const sc=parseFloat(scores[pid]);
        if(!isNaN(sc)){s.scoreSum+=sc;s.scoreCount++;s.scoreMax=s.scoreMax===null?sc:Math.max(s.scoreMax,sc);s.scoreMin=s.scoreMin===null?sc:Math.min(s.scoreMin,sc);}
      }
    });
    rnk.forEach(r=>{
      r.pids.forEach(pid=>{
        if(!stats[pid])stats[pid]={};
        if(!stats[pid][f.gameId])stats[pid][f.gameId]=blank();
        const s=stats[pid][f.gameId];
        if(r.place===1)s.victoires++;
        if(r.place===2)s.seconds++;
        if(r.place===3)s.troisiemes++;
        s.points+=ptsFor(r.place,n);
        s.rankSum+=gameRankFor(r.place,n);s.rankCount++;
      });
    });
  });
}
function gt(pid){
  const raw=Object.values(stats[pid]||{}).reduce((a,s)=>({
    parties:a.parties+s.parties,victoires:a.victoires+s.victoires,seconds:a.seconds+(s.seconds||0),
    troisiemes:a.troisiemes+(s.troisiemes||0),points:a.points+(s.points||0),rankSum:a.rankSum+(s.rankSum||0),rankCount:a.rankCount+(s.rankCount||0)
  }),{parties:0,victoires:0,seconds:0,troisiemes:0,points:0,rankSum:0,rankCount:0});
  raw.points=Math.max(0,raw.points);
  return raw;
}
const avgRank=t=>t.rankCount>0?t.rankSum/t.rankCount:null;
const avgRankColor=v=>v===null?"var(--text3)":v<=2?"var(--lime)":v<=3?"var(--yellow)":"var(--pink)";

const RANKS=[
  {min:0,name:"Token",cls:"rank-token"},{min:10,name:"Joueur",cls:"rank-player"},{min:20,name:"Challenger",cls:"rank-contender"},
  {min:35,name:"Stratège Jr.",cls:"rank-planner"},{min:60,name:"Tacticien",cls:"rank-tactician"},{min:100,name:"Stratège",cls:"rank-strategist"},
  {min:150,name:"Cerveau",cls:"rank-mastermind"},{min:300,name:"Champion",cls:"rank-champion"},{min:500,name:"Légende",cls:"rank-legend"},
  {min:1000,name:"Tabletop God",cls:"rank-god"},{min:1500,name:"Tabletop God ★",cls:"rank-god"},
];
const RANK_COLORS={"rank-token":"#94b0c2","rank-player":"#a7f070","rank-contender":"#38b764","rank-planner":"#73eff7","rank-tactician":"#41a6f6",
  "rank-strategist":"#d47fd4","rank-mastermind":"#ef7d57","rank-champion":"#ffcd75","rank-legend":"#73eff7","rank-god":"#ffcd75"};
function getRank(pts){let r=RANKS[0];for(const rk of RANKS){if(pts>=rk.min)r=rk;else break;}return r;}
const rankTag=pts=>{const r=getRank(pts||0);return`<span class="rank ${r.cls}">${esc(r.name)}</span>`;};

// ── BADGES ───────────────────────────────────────────────────────────────────
const BADGE_CATEGORIES=[
  {id:"streaks",label:"Séries",icon:"fire",color:"var(--orange)"},
  {id:"victoires",label:"Victoires",icon:"trophy",color:"var(--yellow)"},
  {id:"marathon",label:"Marathon",icon:"gamepad",color:"var(--cyan)"},
  {id:"mastery",label:"Maîtrise",icon:"gem",color:"var(--sky)"},
  {id:"social",label:"Social",icon:"handshake",color:"var(--lime)"},
  {id:"shame",label:"Hall of Shame",icon:"skull",color:"var(--text3)"},
];
const BADGES=[
  {id:"streak3",cat:"streaks",icon:"fire",name:"En Feu",desc:"3 victoires consécutives"},
  {id:"streak5",cat:"streaks",icon:"bolt",name:"Fulgurant",desc:"5 victoires consécutives"},
  {id:"streak10",cat:"streaks",icon:"comet",name:"Intouchable",desc:"10 victoires consécutives"},
  {id:"hatrick",cat:"streaks",icon:"tophat",name:"Hat-Trick",desc:"3 victoires de suite sur le même jeu"},
  {id:"perfectday",cat:"streaks",icon:"sun",name:"Journée Parfaite",desc:"3 victoires le même jour"},
  {id:"wins10",cat:"victoires",icon:"sword",name:"First Blood",desc:"10 victoires au total"},
  {id:"wins50",cat:"victoires",icon:"fist",name:"Dominateur",desc:"50 victoires au total"},
  {id:"wins100",cat:"victoires",icon:"halo",name:"Divine",desc:"100 victoires au total"},
  {id:"wr60",cat:"victoires",icon:"target",name:"Tireur d'Élite",desc:"60 %+ de victoires (min. 10 parties)"},
  {id:"pts100",cat:"victoires",icon:"star",name:"Centurion",desc:"Atteindre 100 points"},
  {id:"comeback",cat:"victoires",icon:"rocket",name:"Comeback Kid",desc:"Gagner après avoir fini dernier (même jeu)"},
  {id:"highscore",cat:"victoires",icon:"podium",name:"Record Man",desc:"Détenir un record de score dans un jeu"},
  {id:"games50",cat:"marathon",icon:"dice",name:"Vétéran",desc:"50 parties jouées"},
  {id:"games100",cat:"marathon",icon:"temple",name:"Légende Vivante",desc:"100 parties jouées"},
  {id:"second20",cat:"marathon",icon:"medal2",name:"Éternel Dauphin",desc:"20 deuxièmes places au total"},
  {id:"third20",cat:"marathon",icon:"medal3",name:"Médaillé de Bronze",desc:"20 troisièmes places au total"},
  {id:"poly5",cat:"mastery",icon:"rainbow",name:"Touche-à-Tout",desc:"Victoires sur 5 jeux différents"},
  {id:"poly10",cat:"mastery",icon:"globe",name:"Expert Mondial",desc:"Victoires sur 10 jeux différents"},
  {id:"poly20",cat:"mastery",icon:"firework",name:"Jack of All Trades",desc:"Victoires sur 20 jeux différents"},
  {id:"domgame",cat:"mastery",icon:"gem",name:"Maître du Jeu",desc:"10 victoires sur un même jeu"},
  {id:"allplayers",cat:"social",icon:"handshake",name:"Camarade",desc:"Jouer avec tous les joueurs inscrits"},
  {id:"lastplace20",cat:"shame",icon:"skull",name:"Souffre-Douleur",desc:"20 dernières places (courage !)"},
];
// Walks a player's matches in order; returns {badgeId: firstDate} for every badge unlocked.
const badgeCache=new Map();
function badgeDates(pid){
  if(badgeCache.has(pid))return badgeCache.get(pid);
  const dates={};
  const chrono=[...feed].sort(feedSortAsc).filter(f=>(f.playerIds||[]).includes(pid));
  let streak=0,lastPlaceCount=0,wins=0,parties=0,seconds=0,thirds=0,pts=0;
  const gameStreak={},dayWins={},gameLast={},winsPerGame={},playedWith=new Set();
  const others=players.filter(p=>p.id!==pid);
  chrono.forEach(f=>{
    const set=id=>{if(!dates[id])dates[id]=f.date||"";};
    const n=(f.playerIds||[]).length;const place=placeOf(f,pid);
    const isWin=place===1,isLast=gameRankFor(place,n)===4;
    parties++;if(place===2)seconds++;if(place===3)thirds++;pts+=ptsFor(place,n);
    if(isWin){streak++;wins++;winsPerGame[f.gameId]=(winsPerGame[f.gameId]||0)+1;dayWins[f.date]=(dayWins[f.date]||0)+1;}else streak=0;
    gameStreak[f.gameId]=isWin?(gameStreak[f.gameId]||0)+1:0;
    if(isLast)lastPlaceCount++;
    if(isWin&&gameLast[f.gameId]==="last")set("comeback");
    gameLast[f.gameId]=isLast?"last":"other";
    (f.playerIds||[]).forEach(id=>{if(id!==pid)playedWith.add(id);});
    if(streak>=3)set("streak3");if(streak>=5)set("streak5");if(streak>=10)set("streak10");
    if(gameStreak[f.gameId]>=3)set("hatrick");
    if((dayWins[f.date]||0)>=3)set("perfectday");
    if(wins>=10)set("wins10");if(wins>=50)set("wins50");if(wins>=100)set("wins100");
    if(parties>=50)set("games50");if(parties>=100)set("games100");
    if(parties>=10&&wr(wins,parties)>=60)set("wr60");
    if(Math.max(0,pts)>=100)set("pts100");
    if(seconds>=20)set("second20");if(thirds>=20)set("third20");
    if(lastPlaceCount>=20)set("lastplace20");
    const wg=Object.keys(winsPerGame).length;
    if(wg>=5)set("poly5");if(wg>=10)set("poly10");if(wg>=20)set("poly20");
    if(Object.values(winsPerGame).some(v=>v>=10))set("domgame");
    if(others.length&&others.every(p=>playedWith.has(p.id)))set("allplayers");
  });
  // Win-rate badge uses the final ratio (it can be lost again)
  const tot=gt(pid);
  if(!(tot.parties>=10&&wr(tot.victoires,tot.parties)>=60))delete dates.wr60;
  // Record holder: current best score on any game
  ag().forEach(g=>{
    const rows=players.map(p=>stats[p.id]?.[g.id]).filter(s=>s&&s.scoreCount>0);
    const mine=stats[pid]?.[g.id];
    if(!rows.length||!mine||!mine.scoreCount)return;
    if(mine.scoreMax>=Math.max(...rows.map(s=>s.scoreMax))&&!dates.highscore)dates.highscore="";
  });
  badgeCache.set(pid,dates);
  return dates;
}
function computeBadges(pid){const d=badgeDates(pid);return BADGES.map(b=>({...b,unlocked:b.id in d,date:d[b.id]||""}));}

// ── FIREBASE ─────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG={
  apiKey:"AIzaSyB-T-nqLAI8PXR5vfDE0w6DC3G6_hfp0zw",
  authDomain:"gamelab-night.firebaseapp.com",
  databaseURL:"https://gamelab-night-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"gamelab-night",
  storageBucket:"gamelab-night.firebasestorage.app",
  messagingSenderId:"1053785811460",
  appId:"1:1053785811460:web:085e00b1bf826db3042351"
};
// Accounts are Firebase Authentication email/password accounts. Players never see the email:
// each player record stores its account email + uid, they just pick their profile and type a password.
const ACCOUNT_DOMAIN="gamelab-night.web.app";
const ADMIN_EMAIL="admin@"+ACCOUNT_DOMAIN;
let players=[],customs=[],feed=[],gameImages={};
let playerKeys={},feedKeys={},customKeys={}; // item id → key in the database
let rootRef=null,dbRef=null,loaded=false;

function setSync(state,txt){const el=$("sync");if(!el)return;el.className="sync "+state;$("synctxt").textContent=txt;el.title=txt;}
const clean=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
// Every save is a small targeted write, so the database rules can check who is allowed to make it.
function dbw(fn,okMsg){
  if(!dbRef){toast("Hors ligne : rien n'a été enregistré","err","cross");return Promise.resolve(false);}
  setSync("saving","Sauvegarde…");
  let p;try{p=Promise.resolve(fn());}catch(e){p=Promise.reject(e);}
  return p.then(()=>{setSync("ok","Enregistré");setTimeout(()=>setSync("ok","En ligne"),1800);if(okMsg)toast(okMsg[0],"ok",okMsg[1]);return true;})
    .catch(e=>{
      console.error(e);setSync("err","Refusé");
      const denied=/permission/i.test(String(e&&(e.code||e.message)));
      toast(denied?"Action refusée : reconnecte-toi":"Erreur de sauvegarde","err","cross");return false;
    });
}
function svPlayer(pid,sub,val){
  const k=playerKeys[pid];if(k===undefined)return Promise.resolve(false);
  return dbw(()=>dbRef.child(`players/${k}/${sub}`).set(clean(val)));
}
function initFirebase(){
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    rootRef=firebase.database().ref();dbRef=rootRef.child("gamenight");
    firebase.database().ref(".info/connected").on("value",s=>{if(!loaded)return;s.val()?setSync("ok","En ligne"):setSync("err","Hors ligne");});
    firebase.auth().onAuthStateChanged(u=>{onAuth(u);});
    dbRef.on("value",snap=>{
      const d=snap.val()||{};
      playerKeys={};feedKeys={};customKeys={};
      snap.child("players").forEach(c=>{const v=c.val();if(v&&v.id)playerKeys[v.id]=c.key;});
      snap.child("feed").forEach(c=>{const v=c.val();if(v&&v.id)feedKeys[v.id]=c.key;});
      snap.child("customs").forEach(c=>{const v=c.val();if(v&&v.id)customKeys[v.id]=c.key;});
      players=arr(d.players);customs=arr(d.customs);feed=arr(d.feed);gameImages=d.gameImages||{};
      loaded=true;
      onData();
      setSync("ok","En ligne");
    },err=>{console.error("Firebase read error:",err);setSync("err","Erreur Firebase");});
  }catch(e){console.error("Firebase init error:",e);setSync("err","Erreur");rAll();}
}
function onData(){
  rbs();badgeCache.clear();
  renderAcct();
  rAll();
  bgaOnData();
}

// ── AUTH (Firebase Authentication) ───────────────────────────────────────────
let authUser=null,adminFlag=false;
async function onAuth(u){
  authUser=u||null;adminFlag=false;
  if(u){try{adminFlag=(await rootRef.child("gamenight_admins/"+u.uid).once("value")).val()===true;}catch(e){adminFlag=false;}}
  renderAcct();if(loaded)rAll();
}
function me(){if(!authUser)return null;const p=players.find(x=>x.uid===authUser.uid);return p?p.id:null;}
function meP(){const id=me();return id?players.find(p=>p.id===id):null;}
function isAdmin(){return!!(authUser&&adminFlag);}
function loggedIn(){return!!(me()||isAdmin());}
function canEdit(pid){return isAdmin()||me()===pid;}
function authErr(e){
  const c=String(e&&e.code||"");
  if(/wrong-password|invalid-credential|invalid-login|user-not-found|invalid-password|invalid-email/.test(c))return"Mot de passe incorrect.";
  if(/too-many-requests/.test(c))return"Trop d'essais. Réessaie dans quelques minutes.";
  if(/network/.test(c))return"Pas de connexion internet.";
  if(/weak-password/.test(c))return"Mot de passe trop faible : 6 caractères minimum.";
  if(/requires-recent-login/.test(c))return"Reconnecte-toi puis réessaie.";
  if(/operation-not-allowed|configuration-not-found|admin-restricted/.test(c))return"Les comptes ne sont pas activés côté Firebase.";
  return"Erreur : "+(e&&e.message||c);
}
function requireLogin(reason,then){if(loggedIn()){then();return;}openLogin(reason,then);}
function requireEdit(pid,then){
  if(canEdit(pid)){then();return;}
  if(loggedIn()){toast("Tu ne peux modifier que ton propre profil","warn","lock");return;}
  openLogin("Connecte-toi avec ce profil pour le modifier.",()=>{canEdit(pid)?then():toast("Ce n'est pas ton profil","warn","lock");},pid);
}

let loginSel=null,loginAdmin=false,loginThen=null;
function openLogin(reason,then,preselect){
  if(!loaded){toast("Chargement en cours…","warn","dice");return;}
  loginThen=then||null;loginAdmin=false;loginSel=preselect||null;
  const r=$("login-reason");r.style.display=reason?"flex":"none";r.innerHTML=reason?ic("lock",16)+"<span>"+esc(reason)+"</span>":"";
  $("login-pw").value="";$("login-err").textContent="";
  renderLoginWho();setLoginMode();openM("loginModal");
  setTimeout(()=>{if(loginSel)$("login-pw").focus();},80);
}
function renderLoginWho(){
  $("login-who").innerHTML=players.map(p=>`<button type="button" class="who${loginSel===p.id?" on":""}" onclick="pickLogin('${p.id}')">${avatar(p,40)}<span>${esc(p.name)}</span></button>`).join("")||`<div class="muted">Aucun joueur</div>`;
}
function pickLogin(id){loginSel=id;renderLoginWho();$("login-err").textContent="";$("login-pw").focus();}
function toggleAdminLogin(){loginAdmin=!loginAdmin;setLoginMode();$("login-err").textContent="";$("login-pw").focus();}
function setLoginMode(){
  $("login-pick").style.display=loginAdmin?"none":"block";
  $("login-admin-note").style.display=loginAdmin?"flex":"none";
  $("login-admin-toggle").textContent=loginAdmin?"Je suis un joueur":"Accès admin";
  $("login-title").textContent=loginAdmin?"Connexion admin":"Connexion";
}
function shake(el){el.classList.remove("shake");void el.offsetWidth;el.classList.add("shake");}
async function doLogin(){
  const pw=$("login-pw").value.trim(),err=$("login-err"),btn=$("login-go");
  if(!loginAdmin&&!loginSel){err.textContent="Choisis d'abord ton profil.";shake($("login-who"));return;}
  if(!pw){err.textContent="Entre ton mot de passe.";$("login-pw").focus();return;}
  let email=ADMIN_EMAIL;
  if(!loginAdmin){const p=players.find(x=>x.id===loginSel);email=p&&p.email;if(!email){err.textContent="Ce profil n'a pas encore de compte : demande à l'admin.";return;}}
  btn.disabled=true;err.textContent="Vérification…";
  try{const c=await firebase.auth().signInWithEmailAndPassword(email,pw);await onAuth(c.user);}
  catch(e){btn.disabled=false;err.textContent=authErr(e);shake($("login-form"));$("login-pw").select();return;}
  btn.disabled=false;
  if(loginAdmin&&!isAdmin()){err.textContent="Ce compte n'a pas les droits admin.";await firebase.auth().signOut();return;}
  if(!loginAdmin&&me()!==loginSel){err.textContent="Ce compte n'est pas relié à ce profil : demande à l'admin.";await firebase.auth().signOut();return;}
  err.textContent="";cm("loginModal");
  const p=meP();
  toast(loginAdmin?"Mode admin activé":`Salut ${p?p.name:""} !`,"ok",loginAdmin?"crown":"face_happy");
  const t=loginThen;loginThen=null;if(t)setTimeout(t,60);
}
async function logout(){closeMenu();try{await firebase.auth().signOut();}catch(e){}toast("À la prochaine !","ok","logout");}

function renderAcct(){
  const slot=$("acct-slot");if(!slot)return;
  if(isAdmin())slot.innerHTML=`<button class="acct" onclick="toggleMenu(event)" title="Compte">${ic("crown",16)}<span class="nm">Admin</span></button>`;
  else if(me()){const p=meP();slot.innerHTML=`<button class="acct" onclick="toggleMenu(event)" title="Compte">${avatar(p,26)}<span class="nm">${esc(p.name)}</span></button>`;}
  else slot.innerHTML=`<button class="btn ghost sm" onclick="openLogin()">${ic("key",16)}<span class="lbl">Connexion</span></button>`;
}
function toggleMenu(e){
  e.stopPropagation();
  const m=$("acct-menu");
  if(m.classList.contains("open")){closeMenu();return;}
  let h="";
  if(isAdmin()){
    h=`<div class="mwho">Connecté en tant que<b>Administrateur</b></div>
      <button onclick="closeMenu();go('joueurs')">${ic("players",16)}Gérer les joueurs</button>`;
  }else{
    const p=meP();
    h=`<div class="mwho">Connecté en tant que<b>${esc(p.name)}</b></div>
      <button onclick="closeMenu();openEP('${p.id}')">${ic("pencil",16)}Mon profil</button>
      <button onclick="closeMenu();wishView='mine';go('envies')">${ic("heart",16)}Mes envies</button>
      <button onclick="closeMenu();openPwModal()">${ic("key",16)}Changer mon mot de passe</button>`;
  }
  h+=`<button onclick="logout()">${ic("logout",16)}Se déconnecter</button>`;
  m.innerHTML=h;m.classList.add("open");
}
function closeMenu(){$("acct-menu")?.classList.remove("open");}

function openPwModal(){
  if(!me()){requireLogin("Connecte-toi pour changer ton mot de passe.",()=>me()&&openPwModal());return;}
  ["pw-cur","pw-new","pw-new2"].forEach(i=>$(i).value="");$("pw-err").textContent="";
  $("pw-title").textContent="Changer mon mot de passe";
  openM("pwModal");setTimeout(()=>$("pw-cur").focus(),80);
}
async function submitPw(){
  const u=firebase.auth().currentUser,err=$("pw-err");
  if(!u||!me()){err.textContent="Connecte-toi d'abord.";return;}
  const cur=$("pw-cur").value.trim(),n1=$("pw-new").value.trim(),n2=$("pw-new2").value.trim();
  if(n1.length<6){err.textContent="6 caractères minimum.";return;}
  if(n1!==n2){err.textContent="Les deux mots de passe ne correspondent pas.";return;}
  err.textContent="Vérification…";
  try{await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,cur));}
  catch(e){err.textContent=/wrong|invalid/.test(String(e&&e.code))?"Mot de passe actuel incorrect.":authErr(e);return;}
  try{await u.updatePassword(n1);}catch(e){err.textContent=authErr(e);return;}
  err.textContent="";cm("pwModal");toast("Mot de passe mis à jour","ok","key");
}
// Creates a Firebase account for a player without touching the current session (separate app instance).
let accountsAuth=null;
async function createAccount(pid,pw){
  if(!accountsAuth){
    accountsAuth=firebase.initializeApp(FIREBASE_CONFIG,"accounts").auth();
    try{await accountsAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);}catch(e){}
  }
  const email=`j${pid}-${Date.now().toString(36)}@${ACCOUNT_DOMAIN}`;
  const c=await accountsAuth.createUserWithEmailAndPassword(email,pw);
  const uid=c.user.uid;
  try{await accountsAuth.signOut();}catch(e){}
  return{uid,email};
}

// ── AVATARS (optionally pixelated) ───────────────────────────────────────────
const pxCache=new Map();let pxTimer=null;
function makePixel(src){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const N=32,c=document.createElement("canvas");c.width=N;c.height=N;
        const x=c.getContext("2d");const s=Math.min(img.width,img.height);
        x.imageSmoothingQuality="high";
        x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,N,N);
        const d=x.getImageData(0,0,N,N),a=d.data;
        for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++)a[i+k]=Math.min(255,Math.round(a[i+k]/20)*20);
        x.putImageData(d,0,0);res(c.toDataURL("image/png"));
      }catch(e){res(null);}
    };
    img.onerror=()=>res(null);img.src=src;
  });
}
function avSrc(p){
  if(!localSettings.pixelAvatars)return{url:p.photo,px:false};
  const c=pxCache.get(p.photo);
  if(c)return{url:c,px:true};
  if(c===undefined){
    pxCache.set(p.photo,null);
    makePixel(p.photo).then(u=>{pxCache.set(p.photo,u||false);clearTimeout(pxTimer);pxTimer=setTimeout(syncImageCss,120);});
  }
  return{url:p.photo,px:false};
}
// Big data-URL images (profile photos, card backgrounds, game covers) live in ONE generated
// stylesheet instead of being pasted into every page's HTML, so tab switches stay light.
const cssId=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,"_");
let imgSig="";
function syncImageCss(){
  const list=[];
  players.forEach(p=>{
    if(p.photo){const s=avSrc(p);list.push(["ph-"+cssId(p.id),s.url,s.px?";image-rendering:pixelated":""]);}
    if(p.cardBgImg)list.push(["cb-"+cssId(p.id),p.cardBgImg,""]);
  });
  ag().forEach(g=>{if(g.img)list.push(["gc-"+cssId(g.id),g.img,""]);});
  const sig=list.map(([c,u,x])=>c+u.length+u.slice(-12)+x).join(";");
  if(sig===imgSig)return;
  imgSig=sig;
  let el=$("img-css");
  if(!el){el=document.createElement("style");el.id="img-css";document.head.appendChild(el);}
  el.textContent=list.map(([c,u,x])=>`.${c}{background-image:url("${u}")${x}}`).join("\n");
}
const coverDiv=g=>`<div class="cover gc-${cssId(g.id)}"></div>`;
const cardBg=p=>p.cardBgImg?`<div class="card-bg cb-${cssId(p.id)}"></div>`:p.cardBgColor?`<div class="card-bg" style="background:${esc(p.cardBgColor)}"></div>`:"";
function avatar(p,size=32){
  const box=`width:${size}px;height:${size}px`;
  if(!p)return`<span class="av" style="${box}"></span>`;
  if(p.photo){avSrc(p);return`<span class="av ph ph-${cssId(p.id)}" style="${box}" title="${esc(p.name)}"></span>`;}
  return`<span class="av" style="${box};background:${esc(p.color||"#94b0c2")};font-size:calc(${Math.max(8,Math.round(size*.36))}px*var(--dz))" title="${esc(p.name)}">${esc(initial(p.name))}</span>`;
}
const pname=pid=>players.find(p=>p.id===pid)?.name||"?";

// ── UI PRIMITIVES ────────────────────────────────────────────────────────────
function openM(id){const el=$(id);document.body.appendChild(el);el.classList.add("open");document.body.style.overflow="hidden";}
function cm(id){$(id)?.classList.remove("open");if(!document.querySelector(".ov.open"))document.body.style.overflow="";}
let ovDown=null;
document.addEventListener("mousedown",e=>{ovDown=e.target.classList?.contains("ov")&&e.target.hasAttribute("data-close")?e.target:null;});
document.addEventListener("click",e=>{
  if(ovDown&&e.target===ovDown)cm(ovDown.id);ovDown=null;
  if(!e.target.closest("#acct-menu"))closeMenu();
  const im=e.target.closest("img[data-ps]");if(im){openLB(PSETS[+im.dataset.ps][+im.dataset.i]);return;}
  const gb=e.target.closest("[data-gall]");if(gb)openGall(PSETS[+gb.dataset.gall]);
});
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  if($("lb").classList.contains("open")){closeLB();return;}
  if($("gall").classList.contains("open")){closeGall();return;}
  const open=[...document.querySelectorAll(".ov.open")];const top=open[open.length-1];
  if(top&&top.hasAttribute("data-close"))cm(top.id);
  closeMenu();
});
let toastTimer=null;
function toast(msg,type="ok",icon){
  const t=$("toast");if(!t)return;
  const col={ok:"g",warn:"y",err:"r"}[type]||"";
  t.className="box "+col;
  t.innerHTML=ic(icon||(type==="err"?"cross":type==="warn"?"lock":"check"),16)+"<span>"+esc(msg)+"</span>";
  requestAnimationFrame(()=>t.classList.add("show"));
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2800);
}
function askConfirm(msg,yes="Supprimer"){
  return new Promise(res=>{
    $("confirm-msg").textContent=msg;$("confirm-yes").textContent=yes;openM("confirmModal");
    const done=v=>{cm("confirmModal");$("confirm-yes").onclick=$("confirm-no").onclick=null;res(v);};
    $("confirm-yes").onclick=()=>done(true);$("confirm-no").onclick=()=>done(false);
  });
}
function hydrate(root=document){root.querySelectorAll("[data-ic]").forEach(el=>{el.outerHTML=PX.icon(el.dataset.ic,+el.dataset.s||16);});}
function seg(items,cur,fn){return`<div class="seg">${items.map(([k,label,icn])=>`<button class="${cur===k?"on":""}" onclick="${fn}('${k}')">${icn?ic(icn,16):""}${label}</button>`).join("")}</div>`;}
// Long lists show a short preview; "Voir plus" reveals the next chunk until the end, then "Réduire".
// How far a list was opened survives re-renders (e.g. after rating a game); filters reset it.
const lists={};
function paged(key,items,renderItem,{first=8,step=8,cls=""}={}){
  const prev=lists[key];
  const n=Math.min(items.length,Math.max(first,prev&&prev.shown||0));
  lists[key]={items,renderItem,first,step,shown:n};
  return`<div id="pl-${key}"${cls?` class="${cls}"`:""}>${items.slice(0,n).map((it,i)=>renderItem(it,i)).join("")}</div><div class="pl-more" id="plm-${key}">${moreBtn(key)}</div>`;
}
function moreBtn(key){
  const s=lists[key];if(!s)return"";
  const rest=s.items.length-s.shown;
  if(rest>0)return`<button class="btn ghost" onclick="plMore('${key}')">Voir plus <span class="muted">(${rest} restant${rest>1?"s":""})</span></button>`;
  if(s.items.length>s.first)return`<button class="btn ghost sm" onclick="plLess('${key}')">Réduire</button>`;
  return"";
}
function plMore(key){
  const s=lists[key];if(!s)return;
  const from=s.shown;s.shown=Math.min(s.items.length,s.shown+s.step);
  $("pl-"+key).insertAdjacentHTML("beforeend",s.items.slice(from,s.shown).map((it,i)=>s.renderItem(it,from+i)).join(""));
  $("plm-"+key).innerHTML=moreBtn(key);
}
function plLess(key){
  const s=lists[key];if(!s)return;
  s.shown=s.first;
  $("pl-"+key).innerHTML=s.items.slice(0,s.shown).map((it,i)=>s.renderItem(it,i)).join("");
  $("plm-"+key).innerHTML=moreBtn(key);
  $("pl-"+key).scrollIntoView({block:"start",behavior:"smooth"});
}
function plReset(...keys){keys.forEach(k=>{if(lists[k])lists[k].shown=0;});}
function bar(pct,color){return`<div class="bar"><i style="width:calc((100% - 4px) * ${Math.max(0,Math.min(100,pct))/100});--c:${color}"></i></div>`;}

// Photos
const PSETS=[];
function photoStrip(photos,max=12){
  if(!photos||!photos.length)return"";
  const k=PSETS.push(photos)-1;
  return`<div class="pstrip">${photos.slice(0,max).map((src,i)=>thumbImg(src,k,i)).join("")}</div>`
    +(photos.length>max?`<div class="mt"><button class="btn ghost sm" data-gall="${k}">${ic("camera",16)}Voir les ${photos.length} photos</button></div>`:"");
}
// Match photos are shown as small thumbnails (made once, in the background); full size only in the lightbox.
const BLANK="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const thumbs=new Map(),thumbIds=new Map(),thumbQueue=[];let thumbBusy=false;
function thumbImg(src,k,i){
  const t=thumbs.get(src);
  if(t)return`<img src="${t}" alt="" data-ps="${k}" data-i="${i}">`;
  if(!thumbIds.has(src)){thumbIds.set(src,thumbIds.size);thumbQueue.push(src);setTimeout(runThumbs,0);}
  return`<img src="${BLANK}" alt="" data-th="${thumbIds.get(src)}" data-ps="${k}" data-i="${i}">`;
}
async function runThumbs(){
  if(thumbBusy)return;thumbBusy=true;
  while(thumbQueue.length){
    const src=thumbQueue.shift();
    const t=await new Promise(res=>{
      const img=new Image();
      img.onload=()=>{try{const m=240,r=Math.min(1,m/Math.max(img.width,img.height)),c=document.createElement("canvas");
        c.width=Math.max(1,Math.round(img.width*r));c.height=Math.max(1,Math.round(img.height*r));
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.8));}catch(e){res(src);}};
      img.onerror=()=>res(src);img.src=src;
    });
    thumbs.set(src,t);
    document.querySelectorAll(`img[data-th="${thumbIds.get(src)}"]`).forEach(im=>{im.src=t;im.removeAttribute("data-th");});
    await new Promise(r=>setTimeout(r,16));
  }
  thumbBusy=false;
}
function openLB(src){$("lbimg").src=src;$("lb").classList.add("open");}
function closeLB(){$("lb").classList.remove("open");}
let gallPhotos=[],gallPage=0;
function openGall(ph){gallPhotos=ph;gallPage=0;$("gall-grid").innerHTML="";$("gall").classList.add("open");gallMore();}
function closeGall(){$("gall").classList.remove("open");}
function gallMore(){
  const k=PSETS.push(gallPhotos)-1,start=gallPage*30;
  $("gall-grid").insertAdjacentHTML("beforeend",gallPhotos.slice(start,start+30).map((src,i)=>thumbImg(src,k,start+i)).join(""));
  gallPage++;$("gall-more").style.display=gallPage*30<gallPhotos.length?"inline-flex":"none";
}

// Image compression
function compress(file,mx,q){
  return new Promise(res=>{
    const r=new FileReader();
    r.onload=e=>{const img=new Image();img.onload=()=>{
      const c=document.createElement("canvas");let w=img.width,h=img.height;
      if(w>h&&w>mx){h=Math.round(h*mx/w);w=mx}else if(h>mx){w=Math.round(w*mx/h);h=mx}
      c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);res(c.toDataURL("image/jpeg",q));
    };img.src=e.target.result;};
    r.readAsDataURL(file);
  });
}
function rpp(cid,list){
  const c=$(cid);c.innerHTML="";
  list.forEach((src,i)=>{
    const w=document.createElement("div");w.className="th";
    w.innerHTML=`<img src="${src}" alt=""><button class="x" aria-label="Retirer">${ic("cross",16)}</button>`;
    w.querySelector("button").onclick=()=>{list.splice(i,1);rpp(cid,list);};
    c.appendChild(w);
  });
}

// ── NAV ──────────────────────────────────────────────────────────────────────
const TABS=["accueil","classement","jeux","envies","historique","stats","joueurs"];
let curTab="accueil";
function go(id){
  if(!TABS.includes(id))id="accueil";
  curTab=id;
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("on",p.id==="pg-"+id));
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.tab===id));
  document.querySelector(`.tab[data-tab="${id}"]`)?.scrollIntoView({block:"nearest",inline:"nearest"});
  if(!render(id)&&id==="stats")drawStatsChart();
  window.scrollTo({top:0});
  try{history.replaceState(null,"","#"+id);}catch(e){}
}
// A tab is only rebuilt when something changed since it was last drawn (data, login, settings).
let dataVer=0;const pageVer={};
function render(id,force){
  if(!force&&pageVer[id]===dataVer)return false;
  pageVer[id]=dataVer;
  ({accueil:rAccueil,classement:rClass,jeux:rJeux,envies:rEnvies,historique:rHisto,stats:rStats,joueurs:rJoueurs})[id]?.();
  return true;
}
function rAll(){dataVer++;syncImageCss();render(curTab,true);bgaRefreshLinks();}

// ── ACCUEIL ──────────────────────────────────────────────────────────────────
const H=n=>`<span class="hl">${esc(n)}</span>`;
const N=x=>`<span class="hn">${esc(x)}</span>`;
const G=n=>`<span class="hg">${esc(n)}</span>`;
function buildFacts(){
  const facts=[];
  const add=(e,t,who)=>facts.push({e,t,who:who||"_"});
  if(!feed.length||!players.length)return[{e:"dice",t:"Ajoutez vos premières parties pour voir des anecdotes ici !",who:"_"}];
  const desc=[...feed].sort(feedSortDesc),asc=[...feed].sort(feedSortAsc);
  const counts=countByGame();
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  if(top){const g=gg(top[0]);if(g)add("gamepad",`${G(g.name)} est notre jeu le plus joué, avec ${N(top[1]+" parties")} !`);}
  players.forEach(p=>{
    const tot=gt(p.id);if(tot.parties<1)return;
    ag().forEach(g=>{
      const gs=stats[p.id]?.[g.id];if(!gs)return;
      let s=0,mx=0;asc.filter(f=>f.gameId===g.id&&(f.playerIds||[]).includes(p.id)).forEach(f=>{if(placeOf(f,p.id)===1){s++;mx=Math.max(mx,s);}else s=0;});
      if(mx>=3)add("fire",`${H(p.name)} a enchaîné ${N(mx+" victoires")} d'affilée à ${G(g.name)} !`,p.name);
      if(gs.parties>=3&&gs.victoires===0)add("face_sad",`${H(p.name)} n'a ${N("jamais gagné")} à ${G(g.name)} en ${gs.parties} parties…`,p.name);
      if(gs.parties>=3&&gs.seconds>=Math.ceil(gs.parties*.5))add("face_angry",`${H(p.name)} a fini 2e dans ${N(gs.seconds)} parties sur ${gs.parties} à ${G(g.name)}. Si près !`,p.name);
      const rate=wr(gs.victoires,gs.parties);
      if(gs.parties>=3&&rate>=60)add("crown",`${H(p.name)} règne sur ${G(g.name)} avec ${N(rate+" %")} de victoires.`,p.name);
    });
    const rate=wr(tot.victoires,tot.parties);
    if(tot.parties>=5&&rate>=55)add("bolt",`${H(p.name)} gagne ${N(rate+" %")} de ses parties (${tot.parties} jouées).`,p.name);
    if(tot.parties>=5&&rate<=20)add("skull",`${H(p.name)} n'a gagné que ${N(tot.victoires+" fois")} en ${tot.parties} parties… courage !`,p.name);
  });
  const byWins=players.map(p=>({...p,...gt(p.id)})).sort((a,b)=>b.victoires-a.victoires)[0];
  if(byWins&&byWins.victoires>0)add("trophy",`${H(byWins.name)} mène le bal avec ${N(byWins.victoires+" victoires")} au total.`,byWins.name);
  const byPts=players.map(p=>({...p,...gt(p.id)})).sort((a,b)=>b.points-a.points);
  if(byPts[0]&&byPts[0].points>0)add("chart_up",`${H(byPts[0].name)} culmine à ${N(byPts[0].points+" points")}, le record du groupe.`,byPts[0].name);
  // Nemesis
  let nem=null,best=0;
  players.forEach(v=>players.forEach(b=>{
    if(b.id===v.id)return;let bw=0,sh=0;
    feed.forEach(f=>{const ids=f.playerIds||[];if(!ids.includes(v.id)||!ids.includes(b.id))return;sh++;if(placeOf(f,b.id)<placeOf(f,v.id))bw++;});
    if(sh>=4&&bw/sh>=.7&&bw>best){best=bw;nem={b:b.name,v:v.name,bw,sh};}
  }));
  if(nem)add("imp",`Le cauchemar de ${H(nem.v)} s'appelle ${H(nem.b)} : ${N(nem.bw+" victoires")} sur ${nem.sh} parties ensemble.`,nem.v);
  // Hot game (5 latest)
  if(desc.length>=5){
    const rc={};desc.slice(0,5).forEach(f=>rc[f.gameId]=(rc[f.gameId]||0)+1);
    const hot=Object.entries(rc).sort((a,b)=>b[1]-a[1])[0];const hg=hot&&gg(hot[0]);
    if(hg&&hot[1]>=2)add("fire",`${G(hg.name)} est le hit du moment : ${N(hot[1]+" fois")} sur les 5 dernières parties.`);
  }
  // Rough patch (6 latest)
  if(desc.length>=6){
    const lc={};desc.slice(0,6).forEach(f=>{const n=(f.playerIds||[]).length;(f.playerIds||[]).forEach(pid=>{if(gameRankFor(placeOf(f,pid),n)===4)lc[pid]=(lc[pid]||0)+1;});});
    const w=Object.entries(lc).sort((a,b)=>b[1]-a[1])[0];const wp=w&&players.find(p=>p.id===w[0]);
    if(wp&&w[1]>=3)add("chart_down",`${H(wp.name)} traverse une ${N("mauvaise passe")} : dernier ${w[1]} fois sur les 6 dernières parties…`,wp.name);
  }
  // Hot streak in points (3 latest per player)
  let bg=-Infinity,bp=null;
  players.forEach(p=>{
    const part=asc.filter(f=>(f.playerIds||[]).includes(p.id));if(part.length<4)return;
    const g=part.slice(-3).reduce((s,f)=>s+ptsFor(placeOf(f,p.id),(f.playerIds||[]).length),0);
    if(g>bg){bg=g;bp=p;}
  });
  if(bp&&bg>=4)add("rocket",`${H(bp.name)} est en feu : ${N("+"+bg+" points")} sur ses 3 dernières parties.`,bp.name);
  // Close calls
  desc.slice(0,60).forEach(f=>{
    const sc=f.scores||{},rnk=getRankings(f);
    const a=rnk.find(r=>r.place===1)?.pids?.[0],b=rnk.find(r=>r.place===2)?.pids?.[0];
    if(!a||!b||sc[a]==null||sc[b]==null)return;
    const gap=Math.abs(parseFloat(sc[a])-parseFloat(sc[b]));const g=gg(f.gameId);
    if(gap>0&&gap<=2&&g)add("face_angry",`À ${G(g.name)} le ${fd(f.date)}, ${H(pname(b))} a perdu d'à peine ${N(gap+" pt"+(gap>1?"s":""))} face à ${H(pname(a))} !`,pname(b));
  });
  // Silver collector
  players.forEach(p=>{const t=gt(p.id);if(t.parties>=8&&t.seconds>=Math.max(4,t.parties*.3))add("medal2",`${H(p.name)} a terminé ${N(t.seconds+" fois")} à la 2e place. Le dauphin officiel.`,p.name);});
  // Rivalries
  const ranked=byPts;
  for(let i=0;i<ranked.length-1;i++){const a=ranked[i],b=ranked[i+1],d=a.points-b.points;if(d>=0&&d<=3&&a.points>0)add("swords",`${H(a.name)} et ${H(b.name)} ne sont séparés que de ${N(d+" point"+(d!==1?"s":""))} au classement !`,a.name);}
  players.forEach(a=>players.forEach(b=>{
    if(a.id>=b.id)return;
    let aw=0,bw=0;feed.forEach(f=>{const ids=f.playerIds||[];if(!ids.includes(a.id)||!ids.includes(b.id))return;const pa=placeOf(f,a.id),pb=placeOf(f,b.id);if(pa<pb)aw++;else if(pb<pa)bw++;});
    const t=aw+bw;if(t<4)return;
    if(aw===0&&bw>=4)add("target",`${H(b.name)} n'a ${N("jamais perdu")} contre ${H(a.name)} en ${bw} face-à-face.`,b.name);
    else if(bw===0&&aw>=4)add("target",`${H(a.name)} n'a ${N("jamais perdu")} contre ${H(b.name)} en ${aw} face-à-face.`,a.name);
    else if(Math.abs(aw-bw)<=1&&t>=6)add("swords",`${H(a.name)} contre ${H(b.name)} : rivalité parfaite, ${N(aw+" – "+bw)} en ${t} duels.`,a.name);
  }));
  // Biggest blowout
  let big=null,bgap=0;
  feed.forEach(f=>{
    const e=Object.entries(f.scores||{}).map(([k,v])=>[k,parseFloat(v)]).filter(([,v])=>!isNaN(v));if(e.length<2)return;
    e.sort((x,y)=>y[1]-x[1]);const gap=e[0][1]-e[e.length-1][1];const g=gg(f.gameId);
    if(gap>bgap&&g){bgap=gap;big={g:g.name,w:pname(e[0][0]),l:pname(e[e.length-1][0]),gap};}
  });
  if(big)add("boom",`Record d'écart à ${G(big.g)} : ${H(big.w)} a écrasé ${H(big.l)} de ${N(big.gap+" points")} !`,big.w);
  // Wishes
  const gw=groupWishes(players.map(p=>p.id),"all");
  if(gw.length&&gw[0].v[3].length)add("heart",`Envie n°1 du groupe en ce moment : ${G(gw[0].g.name)}, avec ${N(gw[0].v[3].length+" × Always Yes")}.`);
  return facts;
}
let feedFacts=[],feedIdx=0,feedTimer=null;
function factBatch(all){
  const cnt={},out=[];
  for(const f of [...all].sort(()=>Math.random()-.5)){if((cnt[f.who]||0)>=2&&f.who!=="_")continue;cnt[f.who]=(cnt[f.who]||0)+1;out.push(f);if(out.length>=12)break;}
  return out;
}
let factsAll=[],factsVer=-1;
function startFeed(){
  clearInterval(feedTimer);
  if(factsVer!==dataVer){factsAll=buildFacts();factsVer=dataVer;}
  feedFacts=factBatch(factsAll);feedIdx=0;renderFact(false);
  if(feedFacts.length>1)feedTimer=setInterval(()=>nextFact(),8000);
}
function nextFact(){if(!feedFacts.length)return;feedIdx=(feedIdx+1)%feedFacts.length;renderFact(true);}
function goFact(i){feedIdx=i;renderFact(true);clearInterval(feedTimer);feedTimer=setInterval(()=>nextFact(),8000);}
function renderFact(anim){
  const b=$("bubble");if(!b){clearInterval(feedTimer);return;}
  const f=feedFacts[feedIdx];if(!f)return;
  const paint=()=>{
    $("bubble-ic").innerHTML=ic(f.e,32);$("bubble-t").innerHTML=f.t;
    $("bubble-dots").innerHTML=feedFacts.map((_,i)=>`<button class="${i===feedIdx?"on":""}" onclick="event.stopPropagation();goFact(${i})" aria-label="Anecdote ${i+1}"></button>`).join("");
    b.classList.remove("fade");
  };
  if(anim){b.classList.add("fade");setTimeout(paint,300);}else paint();
}
function stars(){
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  let s="";for(let i=0;i<34;i++){
    const big=i%9===0;
    s+=`<span class="star${big?" big":""}" style="left:${(rnd()*100).toFixed(1)}%;top:${(rnd()*92+3).toFixed(1)}%;animation-delay:-${(rnd()*3).toFixed(2)}s;animation-duration:${(2.4+rnd()*2.4).toFixed(2)}s"></span>`;
  }
  return s;
}
function rAccueil(){
  const lb=players.map(p=>({...p,...gt(p.id)})).sort((a,b)=>b.points-a.points||b.victoires-a.victoires);
  const desc=[...feed].sort(feedSortDesc);
  const counts=countByGame();const totG=Object.keys(counts).length;
  const topG=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];const topGame=topG&&gg(topG[0]);
  const topWin=[...lb].sort((a,b)=>b.victoires-a.victoires)[0];
  const photos=[];desc.forEach(f=>(f.photos||[]).forEach(ph=>photos.push(ph)));
  const greet=me()?`Salut <b>${esc(meP().name)}</b> ! `:"";

  let h=`<section class="hero box">
    <div class="sky-layer sky-n"></div><div class="sky-layer sky-s"></div>
    <div class="sky">${stars()}</div>
    <span class="orb sun">${ic("sun",96)}</span><span class="orb moon">${ic("moon",64)}</span>
    <div class="hero-in">
      <h1 class="hero-t">GAME NIGHT</h1>
      <p class="hero-s">${greet}<b>${feed.length}</b> parties · <b>${players.length}</b> joueurs · <b>${totG}</b> jeux différents</p>
      <div class="hero-cta">
        <button class="btn" onclick="openWheelModal()">${ic("wheel",16)}Quel jeu ce soir ?</button>
        <button class="btn alt" onclick="openMatchModal()">${ic("plus",16)}Nouvelle partie</button>
      </div>
    </div>
    <div class="stage" style="z-index:2">
      <div class="mascot" onclick="nextFact()" title="Encore une anecdote !">
        <img class="pxi" src="${PX.uri("mascot")}" width="64" height="64" alt="">
        <img class="pxi blink" src="${PX.uri("mascot_blink")}" width="64" height="64" alt="">
      </div>
      <div class="bubble" id="bubble"><span id="bubble-ic"></span><div id="bubble-t" class="grow"></div><div class="bubble-dots" id="bubble-dots"></div></div>
    </div>
    <div class="table"><div class="props">
      <span class="prop">${ic("soda",32)}</span>
      <span class="prop hide-s">${ic("chips",32)}</span>
      <span class="prop spin">${ic("dice",32)}</span>
      <span class="prop">${ic("meeple",32,MEEPLE_SWAPS[1])}</span>
      <span class="prop hide-s">${ic("card",32)}</span>
      <span class="prop">${ic("meeple",32)}</span>
      <span class="prop hide-s">${ic("pizza",32)}</span>
    </div></div>
  </section>`;

  h+=`<div class="tiles">
    ${tile("gamepad",totG,"jeux différents joués","var(--cyan)")}
    ${tile("swords",feed.length,"parties enregistrées","var(--orange)")}
    ${tile("trophy",topWin?.victoires||0,topWin?`victoires · <b>${esc(topWin.name)}</b>`:"record de victoires","var(--yellow)")}
    ${tile(topGame?gIcon(topGame):"dice",topG?topG[1]:0,topGame?`parties · <b>${esc(topGame.name)}</b>`:"jeu favori","var(--lime)")}
  </div>`;

  // Top players + recent matches
  h+=`<div class="grid2 mb">
    <div class="box"><div class="box-h">${ic("trophy",16)}<h3>Top joueurs</h3><button class="more" onclick="go('classement')">Tout voir</button></div><div class="list">`;
  if(!lb.length)h+=`<div class="empty">${ic("players",32)}Aucun joueur pour l'instant</div>`;
  lb.slice(0,5).forEach((p,i)=>{
    const rk=getRank(p.points);
    h+=`<div class="lrow${p.showBanner?" banner":""}" style="--rc:${RANK_COLORS[rk.cls]||"#94b0c2"}"><span class="place">${medal(i,16)}</span>${avatar(p,36)}
      <div class="grow"><div class="nm ell">${esc(p.name)}</div><div style="margin-top:.25rem">${rankTag(p.points)}</div></div>
      <div class="end"><div class="num" style="font-size:calc(.75rem*var(--dz));color:var(--yellow)">${p.points} ${ic("star",16)}</div><div class="sub">${p.victoires} victoires</div></div></div>`;
  });
  h+=`</div></div>
    <div class="box"><div class="box-h" style="--hc:var(--orange)">${ic("scroll",16)}<h3>Dernières parties</h3><button class="more" onclick="go('historique')">Historique</button></div><div class="list">`;
  if(!desc.length)h+=`<div class="empty">${ic("scroll",32)}Aucune partie encore</div>`;
  desc.slice(0,5).forEach(f=>{
    const g=gg(f.gameId);const w=(getRankings(f).find(r=>r.place===1)?.pids||[]).map(pid=>players.find(p=>p.id===pid)).filter(Boolean);
    h+=`<div class="lrow click" onclick="go('historique')">${gameArt(g,32,false,"width:40px;height:40px;flex-shrink:0")}
      <div class="grow"><div class="nm ell">${esc(g?.name||f.gameId)}</div><div class="sub">${fd(f.date)} · ${(f.playerIds||[]).length} joueurs</div></div>
      ${w.length?`<div class="end row" style="gap:.35rem;flex-wrap:nowrap">${ic("trophy",16)}<span class="ell" style="max-width:120px;font-weight:600">${w.map(x=>esc(x.name)).join(" & ")}</span></div>`:""}</div>`;
  });
  h+=`</div></div></div>`;

  // Wishes teaser + photos
  const gw=groupWishes(players.map(p=>p.id),"all").filter(r=>r.score>0).slice(0,4);
  h+=`<div class="grid2">
    <div class="box"><div class="box-h" style="--hc:var(--pink)">${ic("heart",16)}<h3>Envies du groupe</h3><button class="more" onclick="go('envies')">Voir</button></div><div class="list">`;
  if(!gw.length)h+=`<div class="empty">${ic("face_ok",32)}<span>Personne n'a encore donné ses envies.</span><button class="btn sm" onclick="wishView='mine';go('envies')">${ic("heart",16)}Donner mes envies</button></div>`;
  gw.forEach((r,i)=>{
    h+=`<div class="lrow click" onclick="go('envies')"><span class="place">${medal(i,16)}</span>${gameArt(r.g,32,false,"width:40px;height:40px;flex-shrink:0")}
      <div class="grow"><div class="nm ell">${esc(r.g.name)}</div><div class="sub">${r.v[3].length} Always Yes · ${r.n} avis</div></div><div class="end num" style="font-size:.75rem;color:var(--yellow)">${r.score}</div></div>`;
  });
  h+=`</div></div>
    <div class="box"><div class="box-h" style="--hc:var(--cyan)">${ic("camera",16)}<h3>Souvenirs</h3>${photos.length?`<button class="more" data-gall="${PSETS.push(photos)-1}">Tout voir</button>`:""}</div><div class="pad">`;
  h+=photos.length?photoStrip(photos,8):`<div class="empty">${ic("photo",32)}Ajoutez des photos à vos parties pour les retrouver ici.</div>`;
  h+=`</div></div></div>`;

  $("pg-accueil").innerHTML=h;
  startFeed();
}
function tile(icon,v,label,color){return`<div class="tile box">${ic(icon,32)}<div class="grow"><div class="v" style="--tc:${color}">${v}</div><div class="l">${label}</div></div></div>`;}

// ── CLASSEMENT ───────────────────────────────────────────────────────────────
let classSort="points";
function setClassSort(k){classSort=k;plReset("class");rClass();}
function rClass(){
  const sorts={
    points:(a,b)=>b.points-a.points||b.victoires-a.victoires,
    victoires:(a,b)=>b.victoires-a.victoires||b.points-a.points||b.parties-a.parties,
    winrate:(a,b)=>wr(b.victoires,b.parties)-wr(a.victoires,a.parties)||b.points-a.points,
    parties:(a,b)=>b.parties-a.parties||b.victoires-a.victoires,
    jeux:(a,b)=>b.jeux-a.jeux||b.victoires-a.victoires,
    avgRank:(a,b)=>(avgRank(a)??99)-(avgRank(b)??99)||b.parties-a.parties,
  };
  const lb=players.map(p=>({...p,...gt(p.id),jeux:Object.values(stats[p.id]||{}).filter(s=>s.parties>0).length})).sort(sorts[classSort]||sorts.points);
  let h=`<div class="page-head"><h2 class="ptitle">${ic("trophy",32)}Classement <small>${players.length} joueurs</small></h2>
    ${seg([["points","Points","star"],["victoires","Victoires","trophy"],["winrate","% victoires"],["parties","Parties"],["jeux","Jeux"],["avgRank","Rang moyen"]],classSort,"setClassSort")}</div>
    <p class="lead">Points par partie : victoire +1 à +3 selon le nombre de joueurs, 2e et 3e place rapportent aussi, dernière place −1.</p>`;
  if(!lb.length){$("pg-classement").innerHTML=h+`<div class="empty box">${ic("players",32)}Aucun joueur.</div>`;return;}
  h+=paged("class",lb,(p,i)=>{
    const r=wr(p.victoires,p.parties),ar=avgRank(p);
    const bg=cardBg(p);
    const stat=(v,l,c,cls="")=>`<div class="${cls}"><div class="v" style="--vc:${c}">${v}</div><div class="l">${l}</div></div>`;
    let cols="";
    if(classSort==="victoires")cols=stat(p.victoires,"1re","var(--yellow)")+stat(p.seconds,"2e","#c9d6e0","hide-s")+stat(p.troisiemes,"3e","var(--tan)","hide-s");
    else if(classSort==="parties")cols=stat(p.parties,"parties","var(--cyan)");
    else if(classSort==="jeux")cols=stat(p.jeux,"jeux","var(--sky)");
    else if(classSort==="avgRank")cols=stat(ar===null?"—":ar.toFixed(2),"rang",avgRankColor(ar));
    else cols=stat(p.points,"points","var(--yellow)")+stat(p.victoires,"victoires","var(--text)","hide-s");
    cols+=stat(r+"%","% vict.","var(--lime)");
    return`<div class="lb-row box${i===0?" y":""}">${bg}
      <div class="place">${medal(i,32)}</div>${avatar(p,48)}
      <div class="lb-main"><div class="row" style="gap:.5rem"><span class="lb-name ell">${esc(p.name)}</span>${rankTag(p.points)}</div>
        <div class="lb-bar">${bar(r,p.color||"var(--yellow)")}<span>${p.parties} parties</span></div></div>
      <div class="lb-stats">${cols}</div></div>`;
  },{first:8,step:8});
  $("pg-classement").innerHTML=h;
}

// ── JEUX ─────────────────────────────────────────────────────────────────────
let jeuxSort="parties",jeuxType="all";
function setJeuxSort(k){jeuxSort=k;plReset("jeux","jeux0");rJeux();}
function setJeuxType(k){jeuxType=k;plReset("jeux","jeux0");rJeux();}
function rJeux(){
  const counts=countByGame();
  const games=ag().filter(g=>jeuxType==="all"||gType(g)===jeuxType).map(g=>{
    const tot=counts[g.id]||0;
    const ldr=players.map(p=>({...p,v:stats[p.id]?.[g.id]?.victoires||0,par:stats[p.id]?.[g.id]?.parties||0})).sort((a,b)=>b.v-a.v)[0];
    return{...g,tot,ldr};
  });
  const sorts={parties:(a,b)=>b.tot-a.tot||a.name.localeCompare(b.name),name:(a,b)=>a.name.localeCompare(b.name,"fr"),
    winrate:(a,b)=>wr(b.ldr?.v||0,b.ldr?.par||0)-wr(a.ldr?.v||0,a.ldr?.par||0)};
  games.sort(sorts[jeuxSort]||sorts.parties);
  const played=games.filter(g=>g.tot>0),zeros=games.filter(g=>g.tot===0);
  const all=ag();const nOnline=all.filter(g=>gType(g)==="online").length;
  let h=`<div class="page-head"><h2 class="ptitle">${ic("gamepad",32)}Jeux <small>${all.length} au catalogue</small></h2>
    <button class="btn" onclick="openGameModal()">${ic("plus",16)}Ajouter un jeu</button></div>
    <div class="row mb">${seg([["all","Tous"],["board","Société","meeple"],["online",`En ligne (${nOnline})`,"globe"]],jeuxType,"setJeuxType")}
    ${seg([["parties","Plus joués"],["name","A → Z"],["winrate","Domination"]],jeuxSort,"setJeuxSort")}</div>`;
  if(played.length){
    h+=paged("jeux",played,g=>{
      const lead=g.ldr&&g.ldr.v>0?`<div class="gcard-l" title="Meilleur joueur">${ic("crown",16)}<span class="ell">${esc(g.ldr.name)}</span><span class="muted">${g.ldr.v}</span></div>`:"";
      return`<div class="gcard box" onclick="openDetail('${g.id}')">
        <div class="art" style="--a1:${tint(g.id)[0]};--a2:${tint(g.id)[1]}">${g.img?coverDiv(g):ic(gIcon(g),64)}
          ${gType(g)==="online"?`<span class="badge tag on">${ic("globe",16)}En ligne</span>`:""}
          ${loggedIn()?`<div class="tools"><button class="ibtn" onclick="event.stopPropagation();openEG('${g.id}')" title="Modifier">${ic("pencil",16)}</button></div>`:""}</div>
        <div class="gcard-b"><div class="gcard-n">${esc(g.name)}</div>
          <div class="gcard-m"><span class="cnt">${g.tot}</span>partie${g.tot>1?"s":""}</div>${lead}</div></div>`;
    },{first:12,step:12,cls:"ggrid"});
  }else h+=`<div class="empty box">${ic("dice",32)}Aucune partie pour ce filtre.</div>`;
  if(zeros.length){
    h+=`<h3 class="ptitle mt" style="font-size:.75rem;margin-bottom:.8rem">Pas encore joués <small>${zeros.length}</small></h3>`;
    h+=paged("jeux0",zeros,g=>`<button class="chip" style="cursor:pointer" onclick="openDetail('${g.id}')">${ic(gIcon(g),16)}${esc(g.name)}${gType(g)==="online"?ic("globe",16):""}</button>`,{first:12,step:24,cls:"unplayed"});
  }
  $("pg-jeux").innerHTML=h;
}

// ── ENVIES (wishes) ──────────────────────────────────────────────────────────
const WISH_LEVELS=[3,2,1,0]; // 0 = "connais pas": shown, but never counted in the score
const hasWish=v=>v!==undefined&&v!==null&&+v>=0&&+v<=3;
const WISH={
  3:{short:"3/3",label:"Always Yes",icon:"face_happy",c:"#a7f070"},
  2:{short:"2/3",label:"S'il n'y a pas de choix pourquoi pas",icon:"face_ok",c:"#ffcd75"},
  1:{short:"1/3",label:"Raccourci",icon:"face_meh",c:"#ef7d57"},
  0:{short:"?/3",label:"Connais pas le jeu",icon:"question",c:"#41a6f6"},
};
let wishView="group",wishType="all",wishPresent=null,wishFilter="all",wishSearch="";
function wishesOf(pid){return players.find(p=>p.id===pid)?.wishes||{};}
function groupWishes(pids,type){
  const rows=[];
  ag().forEach(g=>{
    if(type!=="all"&&gType(g)!==type)return;
    const v={3:[],2:[],1:[],0:[]};let score=0,n=0;
    pids.forEach(pid=>{const raw=wishesOf(pid)[g.id];if(hasWish(raw)){const w=+raw;v[w].push(pid);score+=w;n++;}});
    if(n)rows.push({g,v,score,n});
  });
  return rows.sort((a,b)=>b.score-a.score||b.v[3].length-a.v[3].length||a.g.name.localeCompare(b.g.name,"fr"));
}
function setWish(gid,lvl){
  const pid=me();
  if(!pid){
    if(isAdmin()){toast("Connecte-toi avec un profil joueur pour noter","warn","lock");return;}
    openLogin("Connecte-toi pour donner tes envies.",()=>me()&&setWish(gid,lvl));return;
  }
  const p=meP();if(!p.wishes)p.wishes={};
  const nv=p.wishes[gid]===lvl?null:lvl;
  if(nv===null)delete p.wishes[gid];else p.wishes[gid]=nv;
  svPlayer(pid,"wishes/"+gid,nv);
  if(curTab==="envies")rEnvies();
}
function setWishView(v){wishView=v;rEnvies();}
function setWishType(v){wishType=v;plReset("wgroup","wmine");rEnvies();}
function setWishFilter(v){wishFilter=v;plReset("wmine");rEnvies();}
function toggleWishPresent(pid){
  if(!wishPresent)wishPresent=players.map(p=>p.id);
  wishPresent=wishPresent.includes(pid)?wishPresent.filter(x=>x!==pid):[...wishPresent,pid];plReset("wgroup");
  rEnvies();
}
function wishAll(on){wishPresent=on?players.map(p=>p.id):[];rEnvies();}
function rEnvies(){
  const legend=`<div class="legend box">${WISH_LEVELS.map(l=>`<span class="it"><span class="lv" style="--wc:${WISH[l].c}">${WISH[l].short}</span>${ic(WISH[l].icon,16)}<b>${esc(WISH[l].label)}</b></span>`).join("")}</div>`;
  let h=`<div class="page-head"><h2 class="ptitle">${ic("heart",32)}Envies</h2>
    <div class="row">${seg([["group","Le groupe","players"],["mine","Mes envies","heart"]],wishView,"setWishView")}
    <button class="btn" onclick="openGameModal()" title="Ajouter un jeu au catalogue">${ic("plus",16)}Ajouter un jeu</button></div></div>
    <p class="lead">Chacun note les jeux auxquels il a envie de jouer. Le groupe voit ce qui fait l'unanimité, et la roue peut s'en servir.</p>${legend}`;
  if(wishView==="mine")h+=renderMyWishes();else h+=renderGroupWishes();
  $("pg-envies").innerHTML=h;
}
function renderGroupWishes(){
  const present=wishPresent||players.map(p=>p.id);
  let h=`<div class="box pad mb"><div class="flabel">${ic("players",16)}Qui est là ?</div><div class="chips">`;
  players.forEach(p=>{h+=`<button class="chip${present.includes(p.id)?" on":""}" onclick="toggleWishPresent('${p.id}')">${avatar(p,20)}${esc(p.name)}</button>`;});
  h+=`</div><div class="row mt" style="margin-top:.7rem"><button class="linkbtn" onclick="wishAll(true)">Tout le monde</button><span class="muted">·</span><button class="linkbtn" onclick="wishAll(false)">Personne</button></div></div>`;
  h+=`<div class="row mb">${seg([["all","Tous"],["board","Société","meeple"],["online","En ligne","globe"]],wishType,"setWishType")}<span class="grow"></span>`;
  const rows=groupWishes(present,wishType);
  const wheelN=Math.min(8,rows.filter(r=>r.score>0).length);
  if(wheelN>=2)h+=`<button class="btn alt sm" onclick="wheelFromWishes()">${ic("wheel",16)}Roue avec le top ${wheelN}</button>`;
  h+=`</div>`;
  const voters=present.filter(pid=>Object.keys(wishesOf(pid)).length);
  if(!present.length)return h+`<div class="empty box">${ic("players",32)}Sélectionne au moins une personne.</div>`;
  if(!rows.length)return h+`<div class="empty box">${ic("face_ok",32)}<span>Aucune envie notée pour cette sélection.</span><button class="btn sm" onclick="setWishView('mine')">${ic("heart",16)}Donner mes envies</button></div>`;
  h+=`<p class="muted mb" style="margin-top:-.4rem">${voters.length} personne${voters.length>1?"s":""} sur ${present.length} ont donné leurs envies.</p>`;
  const max=3*present.length;
  h+=paged("wgroup",rows,(r,i)=>{
    const unan=present.length>1&&r.v[3].length===present.length;
    const grp=WISH_LEVELS.filter(l=>r.v[l].length).map(l=>`<span class="grp" style="--wc:${WISH[l].c}" title="${esc(WISH[l].label)}">${ic(WISH[l].icon,16)}<span class="avs">${r.v[l].map(pid=>avatar(players.find(p=>p.id===pid),22)).join("")}</span></span>`).join("");
    return`<div class="wrow box${unan?" g":""}"><span class="place">${medal(i,16)}</span>${gameArt(r.g,32,false)}
      <div class="grow"><div class="nm">${esc(r.g.name)}${unan?`<span class="unanime">Unanime</span>`:""}</div><div class="wvoters">${grp}</div></div>
      <div class="wscore"><span class="num">${r.score}<span class="muted" style="font-size:.6rem"> / ${max}</span></span>${bar(r.score/max*100,unan?"var(--lime)":"var(--yellow)")}</div></div>`;
  },{first:8,step:10});
  return h;
}
function renderMyWishes(){
  const p=meP();
  if(!p){
    return`<div class="empty box">${ic("lock",32)}<span>${isAdmin()?"Le compte admin n'a pas d'envies : connecte-toi avec ton profil joueur.":"Connecte-toi pour noter tes jeux."}</span>
      <button class="btn" onclick="openLogin('Connecte-toi pour donner tes envies.',()=>rEnvies())">${ic("key",16)}Se connecter</button></div>`;
  }
  const mine=p.wishes||{};
  let games=ag().filter(g=>wishType==="all"||gType(g)===wishType);
  const total=games.length,rated=games.filter(g=>hasWish(mine[g.id])).length;
  if(wishFilter==="todo")games=games.filter(g=>!hasWish(mine[g.id]));
  if(wishFilter==="done")games=games.filter(g=>hasWish(mine[g.id]));
  const q=norm(wishSearch);if(q)games=games.filter(g=>norm(g.name).includes(q));
  games.sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  let h=`<div class="progress">${avatar(p,32)}<span>Tu as noté <b style="color:var(--yellow)">${rated}</b> jeux sur ${total}.</span><div class="grow" style="max-width:260px">${bar(total?rated/total*100:0,"var(--lime)")}</div></div>
    <div class="row mb">${seg([["all","Tous"],["board","Société","meeple"],["online","En ligne","globe"]],wishType,"setWishType")}
    ${seg([["all","Tout"],["todo","À noter"],["done","Notés"]],wishFilter,"setWishFilter")}
    <input type="search" id="wish-q" placeholder="Rechercher un jeu…" value="${esc(wishSearch)}" style="max-width:240px" oninput="wishSearch=this.value;plReset('wmine');rEnviesKeepFocus()"/></div>`;
  if(!games.length)return h+`<div class="empty box">${ic("search",32)}Aucun jeu ici.</div>`;
  h+=paged("wmine",games,g=>{
    const cur=hasWish(mine[g.id])?+mine[g.id]:null;
    return`<div class="wrow box">${gameArt(g,32,false)}<div class="grow"><div class="nm">${esc(g.name)}</div><div class="sub muted">${gType(g)==="online"?"Jeu en ligne":"Jeu de société"}</div></div>
      <div class="wvote">${WISH_LEVELS.map(l=>`<button class="wbtn${cur===l?" on":""}" style="--wc:${WISH[l].c}" onclick="setWish('${g.id}',${l})" title="${esc(WISH[l].short+" · "+WISH[l].label)}">${ic(WISH[l].icon,16)}<span>${WISH[l].short}</span><span class="txt">${esc(WISH[l].label)}</span></button>`).join("")}</div></div>`;
  },{first:10,step:10});
  return h;
}
function rEnviesKeepFocus(){
  const el=$("wish-q");const pos=el?el.selectionStart:0;
  rEnvies();
  const n=$("wish-q");if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}}
}
function wheelFromWishes(){
  const present=wishPresent||players.map(p=>p.id);
  const rows=groupWishes(present,wishType).filter(r=>r.score>0).slice(0,8);
  if(!rows.length)return;
  openWheelModal();wPlayerSel=[...present];wList=rows.map(r=>r.g.id);goWheelSpin();
}

// ── HISTORIQUE ───────────────────────────────────────────────────────────────
let histoPlayer="all",histoGame="all",histoShown=8,histoDir="desc";
function histoFiltered(){
  let f=[...feed].sort(histoDir==="asc"?feedSortAsc:feedSortDesc);
  if(histoPlayer!=="all")f=f.filter(e=>(e.playerIds||[]).includes(histoPlayer));
  if(histoGame!=="all")f=f.filter(e=>e.gameId===histoGame);
  return f;
}
function rHisto(){
  histoShown=8;
  const list=histoFiltered();
  let h=`<div class="page-head"><h2 class="ptitle">${ic("scroll",32)}Historique <small>${feed.length} parties</small></h2>
    <button class="btn ghost" onclick="openBga()">${ic("globe",16)}Importer depuis BGA</button></div>
    <div class="row mb">
      <select style="flex:1;min-width:150px;max-width:260px" onchange="histoPlayer=this.value;rHisto()"><option value="all">Tous les joueurs</option>${players.map(p=>`<option value="${p.id}"${histoPlayer===p.id?" selected":""}>${esc(p.name)}</option>`).join("")}</select>
      <select style="flex:1;min-width:150px;max-width:260px" onchange="histoGame=this.value;rHisto()"><option value="all">Tous les jeux</option>${ag().filter(g=>feed.some(f=>f.gameId===g.id)).sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(g=>`<option value="${g.id}"${histoGame===g.id?" selected":""}>${esc(g.name)}</option>`).join("")}</select>
      <button class="btn ghost sm" onclick="histoDir=histoDir==='desc'?'asc':'desc';rHisto()">${histoDir==="desc"?"Plus récentes d'abord":"Plus anciennes d'abord"}</button>
    </div>`;
  if(!list.length){$("pg-historique").innerHTML=h+`<div class="empty box">${ic("search",32)}Aucune partie trouvée.</div>`;return;}
  h+=`<div id="histo-list"></div><div id="histo-more" style="text-align:center" class="mt"></div>`;
  $("pg-historique").innerHTML=h;
  renderHisto(list,0,histoShown);
}
function histoMore(){const list=histoFiltered();const from=histoShown;histoShown=Math.min(histoShown+10,list.length);renderHisto(list,from,histoShown);}
function renderHisto(list,from,to){
  const out=$("histo-list");if(!out)return;
  let html="";
  list.slice(from,to).forEach(f=>{
    const g=gg(f.gameId),rnk=getRankings(f).sort((a,b)=>a.place-b.place),sc=f.scores||{},pho=f.photos||[];
    const ranked=new Set(rnk.flatMap(r=>r.pids)),unranked=(f.playerIds||[]).filter(id=>!ranked.has(id));
    const nm=pid=>{const p=players.find(x=>x.id===pid);const s=sc[pid]!==undefined&&sc[pid]!==null&&sc[pid]!==""?`<span class="sc">${esc(sc[pid])}</span>`:"";return p?`<span class="row" style="gap:.35rem;flex-wrap:nowrap"><span class="dot" style="background:${esc(p.color)}"></span><b style="font-weight:600">${esc(p.name)}</b>${s}</span>`:"?";};
    let res="";
    rnk.forEach(r=>{res+=`<div class="r">${r.place<=3?ic(["medal1","medal2","medal3"][r.place-1],16):`<span class="rk-num">${r.place}</span>`}<span class="row" style="gap:.3rem .9rem">${r.pids.map(nm).join("")}${r.pids.length>1?`<span class="tag">égalité</span>`:""}</span></div>`;});
    if(unranked.length)res+=`<div class="r" style="opacity:.75">${ic("skull",16)}<span class="row" style="gap:.3rem .9rem">${unranked.map(nm).join("")}</span></div>`;
    const tools=loggedIn()?`<button class="ibtn" onclick="openEM('${f.id}')" title="Modifier">${ic("pencil",16)}</button><button class="ibtn" onclick="delMatch('${f.id}')" title="Supprimer">${ic("trash",16)}</button>`:"";
    html+=`<div class="hitem box">${gameArt(g,48)}
      <div class="hbody"><div class="htop"><div class="grow"><div class="hname">${esc(g?.name||f.gameId)}</div><div class="hdate">${fd(f.date)} · ${(f.playerIds||[]).length} joueurs${f.bga&&f.bga.table?` · <a href="https://boardgamearena.com/table?table=${encodeURIComponent(f.bga.table)}" target="_blank" rel="noopener">BGA</a>`:""}</div></div>
        <div class="htools">${pho.length?`<button class="ibtn" onclick="toggleMatchPhotos('${f.id}')" title="Photos">${ic("camera",16)}${pho.length}</button>`:""}${tools}</div></div>
        <div class="hres">${res}</div><div id="mphotos-${f.id}" class="mt" style="display:none"></div></div></div>`;
  });
  out.insertAdjacentHTML("beforeend",html);
  const more=$("histo-more");
  if(more)more.innerHTML=to<list.length?`<button class="btn ghost" onclick="histoMore()">Voir plus (${list.length-to} restantes)</button>`:"";
}
function toggleMatchPhotos(fid){
  const d=$("mphotos-"+fid);if(!d)return;
  const open=d.style.display==="none";d.style.display=open?"block":"none";
  if(open&&!d.dataset.loaded){const f=feed.find(x=>x.id===fid);d.innerHTML=photoStrip(f?.photos||[],30);d.dataset.loaded="1";}
}

// ── MATCH MODAL ──────────────────────────────────────────────────────────────
let mSel=[],mRanks={p1:[],p2:[],p3:[]},pmpho=[];
function openMatchModal(){
  requireLogin("Connecte-toi pour enregistrer une partie.",()=>{
    const sel=$("m-game");
    const opt=t=>ag().filter(g=>gType(g)===t).sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join("");
    sel.innerHTML=`<option value="">— Choisir un jeu —</option><optgroup label="Jeux de société">${opt("board")}</optgroup><optgroup label="Jeux en ligne">${opt("online")}</optgroup>`;
    $("m-date").value=new Date().toISOString().split("T")[0];
    mSel=me()?[me()]:[];mRanks={p1:[],p2:[],p3:[]};pmpho=[];
    $("mph-prev").innerHTML="";$("ms1-err").textContent="";$("ms2-err").textContent="";
    rMChips();$("ms1").style.display="block";$("ms2").style.display="none";
    openM("mModal");
    $("mph").onchange=async function(){for(const f of this.files)pmpho.push(await compress(f,1920,0.9));rpp("mph-prev",pmpho);this.value="";};
  });
}
function rMChips(){
  const c=$("m-players");c.innerHTML="";
  players.forEach(p=>{
    const b=document.createElement("button");b.type="button";
    b.className="chip"+(mSel.includes(p.id)?" on":"");
    b.innerHTML=`${avatar(p,20)}${esc(p.name)}`;
    b.onclick=()=>{mSel.includes(p.id)?mSel=mSel.filter(x=>x!==p.id):mSel.push(p.id);
      ["p1","p2","p3"].forEach(k=>mRanks[k]=mRanks[k].filter(x=>mSel.includes(x)));rMChips();};
    c.appendChild(b);
  });
}
function mNext(){
  const err=$("ms1-err");
  if(!$("m-game").value){err.textContent="Choisis un jeu.";return;}
  if(mSel.length<2){err.textContent="Sélectionne au moins 2 joueurs.";return;}
  err.textContent="";
  buildRankChips(mRanks,mSel,{p1:"r-p1",p2:"r-p2",p3:"r-p3"});
  buildScoreInputs("m-scores",mSel,{});
  $("ms1").style.display="none";$("ms2").style.display="block";
}
function mBack(){$("ms1").style.display="block";$("ms2").style.display="none";}
function buildRankChips(ranks,pids,ids){
  Object.entries(ids).forEach(([place,cid])=>{
    const c=$(cid);c.innerHTML="";
    pids.forEach(pid=>{
      const p=players.find(x=>x.id===pid);if(!p)return;
      const on=ranks[place].includes(pid);
      const b=document.createElement("button");b.type="button";
      b.className="chip"+(on?" "+place:"");
      b.innerHTML=`${avatar(p,20)}${esc(p.name)}`;
      b.onclick=()=>{
        if(on)ranks[place]=ranks[place].filter(x=>x!==pid);
        else{["p1","p2","p3"].forEach(k=>ranks[k]=ranks[k].filter(x=>x!==pid));ranks[place].push(pid);}
        buildRankChips(ranks,pids,ids);
      };
      c.appendChild(b);
    });
  });
}
function buildScoreInputs(cid,pids,existing){
  const c=$(cid);c.innerHTML="";
  pids.forEach(pid=>{
    const p=players.find(x=>x.id===pid);if(!p)return;
    const row=document.createElement("div");row.className="score-row";
    row.innerHTML=`${avatar(p,24)}<span class="grow ell">${esc(p.name)}</span><input type="number" inputmode="decimal" placeholder="—" data-pid="${pid}"/>`;
    if(existing[pid]!==undefined&&existing[pid]!==null)row.querySelector("input").value=existing[pid];
    c.appendChild(row);
  });
}
function readScores(cid){
  const s={};document.querySelectorAll(`#${cid} input[data-pid]`).forEach(i=>{const v=i.value.trim();if(v!==""&&!isNaN(parseFloat(v)))s[i.dataset.pid]=parseFloat(v);});return s;
}
function rankingsFrom(r){const out=[];["p1","p2","p3"].forEach((k,i)=>{if(r[k].length)out.push({place:i+1,pids:[...r[k]]});});return out;}
function submitMatch(){
  if(!loggedIn())return;
  const gid=$("m-game").value,date=$("m-date").value;
  if(!mRanks.p1.length){$("ms2-err").textContent="Indique au moins le gagnant.";return;}
  const entry={id:Date.now().toString(),gameId:gid,playerIds:[...mSel],rankings:rankingsFrom(mRanks),date,photos:[...pmpho],scores:readScores("m-scores")};
  feed.push(entry);rbs();badgeCache.clear();cm("mModal");rAll();
  const g=gg(gid);
  dbw(()=>dbRef.child("feed").push(clean(entry)),[`Partie de ${g?g.name:"jeu"} enregistrée !`,"trophy"]);
}
let emId="",eRanks={p1:[],p2:[],p3:[]},empho=[];
function openEM(id){
  requireLogin("Connecte-toi pour modifier une partie.",()=>{
    emId=id;const f=feed.find(x=>x.id===id);if(!f)return;
    $("e-date").value=f.date||"";
    empho=[...(f.photos||[])];rpp("eph-prev",empho);
    const rnk=getRankings(f);
    eRanks={p1:[...(rnk.find(r=>r.place===1)?.pids||[])],p2:[...(rnk.find(r=>r.place===2)?.pids||[])],p3:[...(rnk.find(r=>r.place===3)?.pids||[])]};
    buildRankChips(eRanks,f.playerIds||[],{p1:"er-p1",p2:"er-p2",p3:"er-p3"});
    buildScoreInputs("e-scores",f.playerIds||[],f.scores||{});
    $("eph").onchange=async function(){for(const x of this.files)empho.push(await compress(x,1920,0.9));rpp("eph-prev",empho);this.value="";};
    openM("emModal");
  });
}
function submitEM(){
  if(!loggedIn())return;
  const f=feed.find(x=>x.id===emId);if(!f)return;
  const d=$("e-date").value;if(d)f.date=d;
  const r=rankingsFrom(eRanks);if(r.length)f.rankings=r;rkCache.delete(f);
  f.scores=readScores("e-scores");f.photos=[...empho];
  rbs();badgeCache.clear();cm("emModal");rAll();
  const k=feedKeys[f.id];if(k===undefined){toast("Partie introuvable, recharge la page","err","cross");return;}
  dbw(()=>dbRef.child("feed/"+k).set(clean(f)),["Partie modifiée","pencil"]);
}
async function delMatch(id){
  if(!loggedIn())return;
  const f=feed.find(x=>x.id===id);const g=f&&gg(f.gameId);
  if(!(await askConfirm(`Supprimer la partie de ${g?g.name:"ce jeu"} du ${fd(f?.date)} ?`)))return;
  const k=feedKeys[id];if(k===undefined)return;
  feed=feed.filter(x=>x.id!==id);rbs();badgeCache.clear();rAll();
  dbw(()=>dbRef.child("feed/"+k).remove(),["Partie supprimée","trash"]);
}

// ── JOUEURS ──────────────────────────────────────────────────────────────────
function rJoueurs(){
  let h=`<div class="page-head"><h2 class="ptitle">${ic("players",32)}Joueurs <small>${players.length}</small></h2>
    <button class="btn" onclick="openPM()">${ic("plus",16)}Nouveau joueur</button></div>`;
  if(!loggedIn())h+=`<div class="reason" style="box-shadow:inset var(--px) 0 0 0 var(--sky)">${ic("lock",16)}<span>Chaque profil est protégé par un mot de passe. <button class="linkbtn" onclick="openLogin()">Connecte-toi</button> pour modifier le tien.</span></div>`;
  if(!players.length){$("pg-joueurs").innerHTML=h+`<div class="empty box">${ic("players",32)}Aucun joueur encore.</div>`;return;}
  h+=paged("joueurs",players,p=>{
    const t=gt(p.id),ar=avgRank(t);
    const bestG=ag().map(g=>({...g,v:stats[p.id]?.[g.id]?.victoires||0})).filter(g=>g.v>0).sort((a,b)=>b.v-a.v)[0];
    const bg=cardBg(p);
    const pins=(p.pinnedBadges||[]).map(bid=>BADGES.find(b=>b.id===bid)).filter(Boolean);
    const nWish=Object.keys(p.wishes||{}).length;
    const tool=canEdit(p.id)?`<button class="btn ghost sm sq" onclick="openEP('${p.id}')" title="Modifier">${ic("pencil",16)}</button>`
      :!loggedIn()?`<button class="ibtn" onclick="openLogin('Connecte-toi pour modifier ton profil.',()=>openEP('${p.id}'),'${p.id}')" title="C'est moi">${ic("lock",16)}</button>`:"";
    return`<div class="pcard box${me()===p.id?" g":""}">${bg}
      <div class="pcard-top">${avatar(p,64)}
        <div class="grow"><div class="pcard-n">${esc(p.name)}${me()===p.id?`<span class="pcard-me">TOI</span>`:""}</div>
          <div class="row" style="margin-top:.4rem;gap:.4rem">${rankTag(t.points)}${nWish?`<span class="tag" title="Jeux notés dans Envies">${ic("heart",16)}${nWish}</span>`:""}</div>
          ${bestG?`<div class="sub muted" style="margin-top:.35rem;font-size:.86rem">Spécialité : <b style="color:var(--text2)">${esc(bestG.name)}</b> (${bestG.v} victoires)</div>`:""}</div>
        <div style="align-self:flex-start">${tool}</div></div>
      ${pins.length?`<div class="row" style="margin-top:.75rem;gap:.45rem">${pins.map(b=>`<span class="bdg" onmouseenter="showBadgeTip(this,'${b.id}')" onmouseleave="hideTip()" onclick="showBadgeTip(this,'${b.id}')">${ic(b.icon,32)}</span>`).join("")}</div>`:""}
      <div class="pstats">
        <div><div class="v">${t.parties}</div><div class="l">Parties</div></div>
        <div><div class="v" style="--vc:var(--lime)">${t.victoires}</div><div class="l">Victoires</div></div>
        <div><div class="v" style="--vc:#c9d6e0">${t.seconds}</div><div class="l">2e place</div></div>
        <div><div class="v" style="--vc:var(--cyan)">${t.points}</div><div class="l">Points</div></div>
        <div><div class="v" style="--vc:${avgRankColor(ar)}">${ar===null?"—":ar.toFixed(1)}</div><div class="l">Rang moy.</div></div>
      </div></div>`;
  },{first:6,step:6,cls:"pgrid"});
  $("pg-joueurs").innerHTML=h;
}
function showBadgeTip(el,bid){
  const b=BADGES.find(x=>x.id===bid);if(!b)return;
  const n=players.filter(p=>bid in badgeDates(p.id)).length;
  const tip=$("tip");
  tip.innerHTML=`<div class="row" style="gap:.5rem;margin-bottom:.35rem">${ic(b.icon,32)}<b style="color:var(--yellow)">${esc(b.name)}</b></div><div class="dim" style="font-size:.9rem">${esc(b.desc)}</div><div class="muted" style="font-size:.82rem;margin-top:.4rem">${n} joueur${n>1?"s":""} sur ${players.length} l'${n>1?"ont":"a"}</div>`;
  tip.classList.add("show");
  const r=el.getBoundingClientRect();let left=r.right+10,top=r.top;
  const tw=tip.offsetWidth;if(left+tw>innerWidth-8)left=r.left-tw-10;
  if(top+tip.offsetHeight>innerHeight-8)top=innerHeight-tip.offsetHeight-8;
  tip.style.left=Math.max(6,left)+"px";tip.style.top=Math.max(6,top)+"px";
}
function hideTip(){$("tip").classList.remove("show");}
document.addEventListener("scroll",hideTip,{passive:true});

// ── PLAYER MODAL ─────────────────────────────────────────────────────────────
let epId=null,ppho=null,pCardBgImg=null,pCardBgColor=null,pShowBanner=false,selCol=COLS[0];
function setBannerUI(v){pShowBanner=v;$("p-banner-toggle").classList.toggle("on",v);}
function toggleBannerPref(){setBannerUI(!pShowBanner);}
function clearCardBg(){pCardBgImg=null;pCardBgColor=null;$("p-cardbg-prev").innerHTML="";$("p-cardbg-colorprev").style.background="";$("p-cardbg-color").value="";$("p-cardbg-clear").style.display="none";}
function showCardBgPrev(){
  $("p-cardbg-prev").innerHTML=pCardBgImg?`<img src="${pCardBgImg}" alt="" style="width:100%;height:64px;object-fit:cover;margin-top:.6rem;box-shadow:0 0 0 2px var(--frame)">`:"";
  $("p-cardbg-colorprev").style.background=pCardBgColor||"";
  $("p-cardbg-clear").style.display=(pCardBgImg||pCardBgColor)?"inline-flex":"none";
}
function bindPlayerInputs(){
  $("pp").onchange=function(){const f=this.files[0];this.value="";if(!f)return;compressAndCrop(f,"square",r=>{ppho=r;$("pp-prev").innerHTML=`<img src="${r}" alt="" style="width:80px;height:80px;object-fit:cover;box-shadow:0 0 0 2px var(--frame)">`;});};
  $("p-cardbg-file").onchange=function(){const f=this.files[0];this.value="";if(!f)return;compressAndCrop(f,"banner",r=>{pCardBgImg=r;pCardBgColor=null;$("p-cardbg-color").value="";showCardBgPrev();});};
  $("p-cardbg-color").oninput=function(){const v=this.value.trim();if(v){pCardBgColor=v;pCardBgImg=null;}else pCardBgColor=null;showCardBgPrev();};
}
function bCols(){
  const c=$("p-colors");c.innerHTML="";
  const list=COLS.includes(selCol)?COLS:[selCol,...COLS];
  list.forEach(col=>{const d=document.createElement("button");d.type="button";d.className="swatch"+(col===selCol?" on":"");d.style.background=col;d.setAttribute("aria-label",col);d.onclick=()=>{selCol=col;bCols();};c.appendChild(d);});
}
function openPM(){
  requireLogin("Connecte-toi pour ajouter un joueur.",()=>{
    epId=null;ppho=null;pCardBgImg=null;pCardBgColor=null;
    $("p-name").value="";$("pp-prev").innerHTML="";$("p-cardbg-color").value="";showCardBgPrev();
    $("pModalTitle").textContent="Nouveau joueur";$("pSubmitBtn").textContent="Ajouter";
    $("p-badges-section").style.display="none";$("p-own-pw").style.display="none";$("p-del").style.display="none";
    $("p-pw-section").style.display="block";$("p-pw").value="";$("p-pw-label").textContent="Mot de passe initial";
    $("p-pw-hint").textContent="À transmettre au nouveau joueur : il pourra le changer depuis son profil.";$("p-err").textContent="";
    selCol=COLS[players.length%COLS.length];bCols();setBannerUI(false);bindPlayerInputs();
    openM("pModal");setTimeout(()=>$("p-name").focus(),80);
  });
}
function openEP(id){
  requireEdit(id,()=>{
    epId=id;const p=players.find(x=>x.id===id);if(!p)return;
    $("p-name").value=p.name;ppho=p.photo||null;pCardBgImg=p.cardBgImg||null;pCardBgColor=p.cardBgColor||null;
    $("pp-prev").innerHTML=ppho?`<img src="${ppho}" alt="" style="width:80px;height:80px;object-fit:cover;box-shadow:0 0 0 2px var(--frame)">`:"";
    $("p-cardbg-color").value=pCardBgColor||"";showCardBgPrev();
    $("pModalTitle").textContent=me()===id?"Mon profil":"Modifier "+p.name;$("pSubmitBtn").textContent="Enregistrer";
    selCol=p.color||COLS[0];bCols();setBannerUI(!!p.showBanner);
    $("p-own-pw").style.display=me()===id?"block":"none";
    const adminOther=isAdmin()&&me()!==id;
    $("p-pw-section").style.display=adminOther?"block":"none";$("p-pw").value="";
    $("p-pw-label").textContent="Nouveau mot de passe (admin)";$("p-pw-hint").textContent="Laisser vide pour ne rien changer.";
    $("p-del").style.display=isAdmin()?"inline-flex":"none";$("p-err").textContent="";
    $("p-badges-section").style.display="block";$("p-badges-grid").innerHTML=renderBadgeGrid(id);
    bindPlayerInputs();openM("pModal");
  });
}
async function submitPlayer(){
  const err=$("p-err");
  const name=$("p-name").value.trim().toUpperCase();
  if(!name){err.textContent="Choisis un pseudo.";return;}
  if(players.some(p=>p.id!==epId&&p.name.toUpperCase()===name)){err.textContent="Ce pseudo est déjà pris.";return;}
  const npw=$("p-pw").value.trim();
  const btn=$("pSubmitBtn");
  if(epId){
    if(!canEdit(epId))return;
    const p=players.find(x=>x.id===epId),k=playerKeys[epId];if(!p||k===undefined)return;
    const resetPw=npw&&isAdmin()&&me()!==epId;
    if(resetPw&&npw.length<6){err.textContent="Mot de passe : 6 caractères minimum.";return;}
    const upd={name,color:selCol,cardBgImg:pCardBgImg||null,cardBgColor:pCardBgColor||null,showBanner:pShowBanner};
    if(ppho)upd.photo=ppho;
    btn.disabled=true;
    try{
      if(resetPw){
        // Admin reset: a fresh account replaces the old one for this profile.
        err.textContent="Création du nouveau compte…";
        let acc;try{acc=await createAccount(p.id,npw);}catch(e){err.textContent=authErr(e);return;}
        const m={[`gamenight/players/${k}/uid`]:acc.uid,[`gamenight/players/${k}/email`]:acc.email,[`gamenight_uids/${acc.uid}`]:p.id};
        if(p.uid)m[`gamenight_uids/${p.uid}`]=null;
        if(!(await dbw(()=>rootRef.update(m),["Nouveau mot de passe actif","key"]))){err.textContent="Le mot de passe n'a pas pu être changé.";return;}
      }
      Object.assign(p,upd);
      err.textContent="";cm("pModal");rAll();
      dbw(()=>dbRef.child("players/"+k).update(clean(upd)),["Profil enregistré","check"]);
    }finally{btn.disabled=false;}
  }else{
    if(!loggedIn())return;
    if(npw.length<6){err.textContent="Donne-lui un mot de passe initial (6 caractères minimum).";return;}
    btn.disabled=true;err.textContent="Création du compte…";
    try{
      const pid=Date.now().toString();
      let acc;try{acc=await createAccount(pid,npw);}catch(e){err.textContent=authErr(e);return;}
      const obj={id:pid,name,color:selCol,photo:ppho||null,cardBgImg:pCardBgImg||null,cardBgColor:pCardBgColor||null,showBanner:pShowBanner,uid:acc.uid,email:acc.email};
      const key=dbRef.child("players").push().key;
      const ok=await dbw(()=>rootRef.update({[`gamenight/players/${key}`]:clean(obj),[`gamenight_uids/${acc.uid}`]:pid}),[`${name} a rejoint la table !`,"meeple"]);
      if(ok){err.textContent="";cm("pModal");}else err.textContent="Le joueur n'a pas pu être ajouté.";
    }finally{btn.disabled=false;}
  }
}
async function delPlayer(id){
  if(!isAdmin())return;
  const p=players.find(x=>x.id===id),k=playerKeys[id];if(!p||k===undefined)return;
  if(!(await askConfirm(`Supprimer ${p.name} ? Ses parties seront retirées de l'historique.`)))return;
  const m={[`gamenight/players/${k}`]:null};
  if(p.uid)m[`gamenight_uids/${p.uid}`]=null;
  feed.forEach(f=>{
    if(!(f.playerIds||[]).includes(id))return;
    const fk=feedKeys[f.id];if(fk===undefined)return;
    const nf={...f,playerIds:f.playerIds.filter(x=>x!==id),rankings:getRankings(f).map(r=>({...r,pids:r.pids.filter(x=>x!==id)})).filter(r=>r.pids.length)};
    if(nf.scores){nf.scores={...nf.scores};delete nf.scores[id];}
    m[`gamenight/feed/${fk}`]=nf.playerIds.length?clean(nf):null;
  });
  cm("pModal");
  dbw(()=>rootRef.update(m),["Joueur supprimé","trash"]);
}
function renderBadgeGrid(pid){
  const p=players.find(x=>x.id===pid);const pinned=p?.pinnedBadges||[];
  const badges=computeBadges(pid);const n=badges.filter(b=>b.unlocked).length;
  let out=`<div class="reason" style="box-shadow:inset var(--px) 0 0 0 var(--yellow)"><span><b style="color:var(--yellow)">${n}</b> / ${badges.length} badges débloqués · <b style="color:var(--cyan)">${pinned.length}</b> / 3 épinglés</span></div>`;
  BADGE_CATEGORIES.forEach(cat=>{
    const cb=badges.filter(b=>b.cat===cat.id);if(!cb.length)return;
    out+=`<div class="bcat"><button type="button" class="bcat-h" style="--cc:${cat.color}" onclick="const n=this.nextElementSibling;n.hidden=!n.hidden">${ic(cat.icon,16)}<span>${cat.label}</span><span>${cb.filter(b=>b.unlocked).length}/${cb.length}</span></button><div>`;
    cb.forEach(b=>{
      const pin=pinned.includes(b.id);
      out+=`<div class="bitem ${b.unlocked?"unlocked":"locked"}${pin?" pinned":""}" ${b.unlocked?`onclick="toggleBadgePin('${pid}','${b.id}')" title="${pin?"Retirer de la carte":"Épingler sur la carte"}"`:""}>
        ${ic(b.icon,32)}<div class="grow"><div class="bn">${esc(b.name)}</div><div class="bd">${esc(b.desc)}</div>
        ${b.unlocked?`<div class="bs">${pin?"Épinglé":"Débloqué"}${b.date?" · "+fd(b.date):""}</div>`:`<div class="bd">${ic("lock",16)} Verrouillé</div>`}</div>
        ${b.unlocked?(pin?ic("star",16):`<span class="muted" style="font-size:.8rem">épingler</span>`):""}</div>`;
    });
    out+=`</div></div>`;
  });
  return out;
}
function toggleBadgePin(pid,bid){
  if(!canEdit(pid))return;
  const p=players.find(x=>x.id===pid);if(!p)return;
  let pins=[...(p.pinnedBadges||[])];
  if(pins.includes(bid))pins=pins.filter(x=>x!==bid);
  else if(pins.length<3)pins.push(bid);
  else{toast("3 badges maximum : retires-en un d'abord","warn","star");return;}
  p.pinnedBadges=pins;$("p-badges-grid").innerHTML=renderBadgeGrid(pid);
  svPlayer(pid,"pinnedBadges",pins);
}

// ── GAME MODAL (add / edit) ──────────────────────────────────────────────────
let egId=null,gNewImg=undefined,gSelIcon="meeple",gSelType="board";
function renderIconPick(){$("g-icons").innerHTML=ICON_CHOICES.filter(n=>PX.has(n)).map(n=>`<button type="button" class="${n===gSelIcon?"on":""}" onclick="gSelIcon='${n}';renderIconPick()" title="${n}">${ic(n,32)}</button>`).join("");}
function bindGameInputs(){
  document.querySelectorAll("#g-type button").forEach(b=>{b.classList.toggle("on",b.dataset.v===gSelType);b.onclick=()=>{gSelType=b.dataset.v;bindGameInputs();};});
  $("gp").onchange=async function(){const f=this.files[0];this.value="";if(!f)return;gNewImg=await compress(f,1080,0.9);$("gp-prev").innerHTML=`<img src="${gNewImg}" alt="" style="width:100%;max-height:140px;object-fit:cover;margin-top:.6rem;box-shadow:0 0 0 2px var(--frame)">`;};
}
function openGameModal(){
  requireLogin("Connecte-toi pour ajouter un jeu.",()=>{
    egId=null;gNewImg=undefined;gSelIcon="meeple";gSelType=(curTab==="envies"?wishType:jeuxType)==="online"?"online":"board";
    $("gModalTitle").textContent="Nouveau jeu";$("g-meta").style.display="block";$("g-name").value="";
    $("g-cur").innerHTML="";$("gp-prev").innerHTML="";$("g-del").style.display="none";$("g-delimg").style.display="none";$("g-err").textContent="";
    renderIconPick();bindGameInputs();openM("gModal");setTimeout(()=>$("g-name").focus(),80);
  });
}
function openEG(id){
  requireLogin("Connecte-toi pour modifier un jeu.",()=>{
    const g=gg(id);if(!g)return;egId=id;gNewImg=undefined;
    const custom=customs.some(c=>c.id===id);
    gSelIcon=gIcon(g);gSelType=gType(g);
    $("gModalTitle").textContent=g.name;$("g-meta").style.display=custom?"block":"none";$("g-name").value=g.name;
    $("g-cur").innerHTML=g.img?`<img src="${g.img}" alt="" style="width:100%;max-height:140px;object-fit:cover;margin-bottom:.6rem;box-shadow:0 0 0 2px var(--frame)">`:"";
    $("gp-prev").innerHTML="";$("g-del").style.display=custom?"inline-flex":"none";$("g-delimg").style.display=g.img?"inline-flex":"none";$("g-err").textContent="";
    renderIconPick();bindGameInputs();openM("gModal");
  });
}
function gRemoveImg(){gNewImg=null;$("g-cur").innerHTML=`<div class="muted mb">L'image sera retirée.</div>`;$("g-delimg").style.display="none";}
function submitGame(){
  if(!loggedIn())return;
  if(egId===null){
    const name=$("g-name").value.trim();if(!name){$("g-err").textContent="Donne un nom au jeu.";return;}
    if(ag().some(g=>norm(g.name)===norm(name))){$("g-err").textContent="Ce jeu existe déjà.";return;}
    const c={id:"c"+Date.now(),name,icon:gSelIcon,type:gSelType,img:gNewImg||null};
    customs.push(c);cm("gModal");
    if(curTab==="envies"){wishView="mine";wishFilter="all";wishSearch=name;} // jump straight to rating the new game
    rAll();
    dbw(()=>dbRef.child("customs").push(clean(c)),[`${name} ajouté au catalogue`,gSelIcon]);
  }else{
    const c=customs.find(x=>x.id===egId),id=egId;
    if(c){
      const n=$("g-name").value.trim();if(n)c.name=n;c.icon=gSelIcon;c.type=gSelType;if(gNewImg!==undefined)c.img=gNewImg;
      const k=customKeys[id];cm("gModal");rAll();
      if(k!==undefined)dbw(()=>dbRef.child("customs/"+k).set(clean(c)),["Jeu mis à jour","check"]);
    }else{
      cm("gModal");
      if(gNewImg===undefined)return;
      if(gNewImg===null)delete gameImages[id];else gameImages[id]=gNewImg;
      rAll();
      dbw(()=>gNewImg===null?dbRef.child("gameImages/"+id).remove():dbRef.child("gameImages/"+id).set(gNewImg),["Jeu mis à jour","check"]);
    }
  }
}
async function delGame(id){
  if(!loggedIn()||!customs.some(c=>c.id===id))return;
  const g=gg(id);const n=feed.filter(f=>f.gameId===id).length;
  if(!(await askConfirm(`Supprimer ${g?.name} du catalogue ?${n?` ${n} partie(s) y font référence.`:""}`)))return;
  const k=customKeys[id];if(k===undefined)return;
  customs=customs.filter(c=>c.id!==id);cm("gModal");rAll();
  dbw(()=>dbRef.child("customs/"+k).remove(),["Jeu supprimé","trash"]);
}

// ── GAME DETAIL ──────────────────────────────────────────────────────────────
let detailGid=null;
function openDetail(gid){
  const g=gg(gid);if(!g)return;
  const total=feed.filter(f=>f.gameId===gid).length;
  const blank={parties:0,victoires:0,seconds:0,troisiemes:0,points:0,scoreSum:0,scoreCount:0,scoreMax:null,scoreMin:null,rankSum:0,rankCount:0};
  const rows=players.map(p=>({...p,...(stats[p.id]?.[gid]||blank)})).filter(r=>r.parties>0).sort((a,b)=>b.victoires-a.victoires||b.points-a.points);
  const photos=[];feed.filter(f=>f.gameId===gid).sort(feedSortDesc).forEach(f=>(f.photos||[]).forEach(ph=>photos.push(ph)));
  $("d-ic").innerHTML=ic(gIcon(g),16);$("d-title").textContent=g.name;
  let h=`<div class="row mb" style="gap:1rem;align-items:stretch"><div style="width:120px;flex-shrink:0">${gameArt(g,64,true,"height:96px")}</div>
    <div class="grow"><div class="row" style="gap:.4rem"><span class="tag${gType(g)==="online"?" on":""}">${ic(gType(g)==="online"?"globe":"meeple",16)}${gType(g)==="online"?"Jeu en ligne":"Jeu de société"}</span></div>
      <div class="num" style="font-size:calc(1.1rem*var(--dz));color:var(--cyan);margin-top:.6rem">${total}</div><div class="muted">partie${total>1?"s":""} jouée${total>1?"s":""}</div></div>
    <div style="display:flex;flex-direction:column;gap:.2rem;align-items:flex-end">
      <button class="btn sm" onclick="cm('dModal');openMatchModal();setTimeout(()=>{const s=$('m-game');if(s)s.value='${gid}'},120)">${ic("plus",16)}Partie</button>
      ${loggedIn()?`<button class="btn ghost sm" onclick="cm('dModal');openEG('${gid}')">${ic("pencil",16)}Modifier</button>`:""}</div></div>`;
  // Wishes for this game
  const w={3:[],2:[],1:[],0:[]};players.forEach(p=>{const v=wishesOf(p.id)[gid];if(hasWish(v))w[+v].push(p);});
  const mineW=me()&&hasWish(wishesOf(me())[gid])?+wishesOf(me())[gid]:null;
  h+=`<div class="box-h" style="--hc:var(--pink);margin:0 -1.15rem .6rem">${ic("heart",16)}<h3>Envies</h3></div>`;
  h+=`<div class="wvoters mb">${WISH_LEVELS.map(l=>`<span class="grp">${ic(WISH[l].icon,16)}<b style="color:${WISH[l].c};font-size:.85rem">${WISH[l].short}</b><span class="avs">${w[l].length?w[l].map(p=>avatar(p,22)).join(""):`<span class="muted">—</span>`}</span></span>`).join("")}</div>`;
  if(me())h+=`<div class="wvote mb">${WISH_LEVELS.map(l=>`<button class="wbtn${mineW===l?" on":""}" style="--wc:${WISH[l].c}" onclick="setWish('${gid}',${l});openDetail('${gid}')">${ic(WISH[l].icon,16)}${WISH[l].short}</button>`).join("")}<span class="muted" style="align-self:center;margin-left:.4rem;font-size:.88rem">ton avis</span></div>`;
  // Palmares
  h+=`<div class="box-h" style="margin:0 -1.15rem .2rem">${ic("trophy",16)}<h3>Palmarès</h3></div>`;
  if(!rows.length)h+=`<div class="empty">${ic("dice",32)}Personne n'y a encore joué.</div>`;
  if(detailGid!==gid){plReset("detail");detailGid=gid;}
  h+=paged("detail",rows,(r,i)=>{
    const ar=avgRank(r);
    return`<div class="lrow"><span class="place">${medal(i,16)}</span>${avatar(r,30)}<div class="grow"><div class="nm ell">${esc(r.name)}</div><div class="sub">${r.parties} parties · ${wr(r.victoires,r.parties)} % de victoires</div></div>
      <div class="end row" style="gap:.8rem;flex-wrap:nowrap;font-size:.9rem"><span title="Victoires">${ic("medal1",16)}${r.victoires}</span><span title="2e places">${ic("medal2",16)}${r.seconds}</span><span title="Points" style="color:var(--yellow)">${ic("star",16)}${Math.max(0,r.points)}</span><span title="Rang moyen" style="color:${avgRankColor(ar)}">${ar===null?"—":ar.toFixed(2)}</span></div></div>`;
  },{first:6,step:6});
  // Score records
  const sc=rows.filter(r=>r.scoreCount>0);
  if(sc.length){
    const hi=[...sc].sort((a,b)=>b.scoreMax-a.scoreMax)[0],lo=[...sc].sort((a,b)=>a.scoreMin-b.scoreMin)[0];
    h+=`<div class="box-h mt" style="--hc:var(--cyan);margin-left:-1.15rem;margin-right:-1.15rem">${ic("podium",16)}<h3>Records de score</h3></div>
      <div class="grid2" style="gap:.8rem;margin:.6rem 0">
        <div class="reason" style="box-shadow:inset var(--px) 0 0 0 var(--lime);margin:0">${avatar(hi,28)}<div><div class="muted" style="font-size:.8rem">Record haut · ${esc(hi.name)}</div><div class="num" style="color:var(--lime)">${hi.scoreMax}</div></div></div>
        <div class="reason" style="box-shadow:inset var(--px) 0 0 0 var(--pink);margin:0">${avatar(lo,28)}<div><div class="muted" style="font-size:.8rem">Record bas · ${esc(lo.name)}</div><div class="num" style="color:var(--pink)">${lo.scoreMin}</div></div></div>
      </div>`;
    [...sc].sort((a,b)=>b.scoreSum/b.scoreCount-a.scoreSum/a.scoreCount).forEach(r=>{
      h+=`<div class="lrow">${avatar(r,24)}<span class="grow ell">${esc(r.name)}</span><span class="row" style="gap:.9rem;font-size:.9rem;flex-wrap:nowrap"><span style="color:var(--lime)">▲ ${r.scoreMax}</span><span class="muted">moy. ${(r.scoreSum/r.scoreCount).toFixed(1)}</span><span style="color:var(--pink)">▼ ${r.scoreMin}</span></span></div>`;
    });
  }
  if(photos.length)h+=`<div class="box-h mt" style="--hc:var(--cyan);margin:1rem -1.15rem .7rem">${ic("camera",16)}<h3>Photos</h3></div>${photoStrip(photos,12)}`;
  $("detail-inner").innerHTML=h;
  if(!$("dModal").classList.contains("open"))openM("dModal");
}

// ── WHEEL ────────────────────────────────────────────────────────────────────
let wPlayerSel=[],wList=[],wAngle=0,wSpinning=false;
const wImgs={};
function wImg(name){if(!wImgs[name]){const im=new Image();im.onload=()=>{if(!wSpinning)drawWheel(wAngle);};im.src=PX.uri(name);wImgs[name]=im;}return wImgs[name];}
function wStep(n){[0,1,2].forEach(i=>$("ws"+i).style.display=i===n?"block":"none");}
function openWheelModal(){
  wPlayerSel=players.map(p=>p.id);
  const pc=$("wplayers");pc.innerHTML="";
  players.forEach(p=>{
    const b=document.createElement("button");b.type="button";b.className="chip on";
    b.innerHTML=`${avatar(p,20)}${esc(p.name)}`;
    b.onclick=()=>{wPlayerSel=wPlayerSel.includes(p.id)?wPlayerSel.filter(x=>x!==p.id):[...wPlayerSel,p.id];b.classList.toggle("on",wPlayerSel.includes(p.id));};
    pc.appendChild(b);
  });
  if(!players.length)pc.innerHTML=`<span class="muted">Aucun joueur</span>`;
  wStep(0);openM("wModal");
}
function wPresetIds(kind){
  if(kind==="wish")return groupWishes(wPlayerSel,"all").filter(r=>r.score>0).slice(0,8).map(r=>r.g.id);
  if(kind==="played"){
    const s=new Set();feed.forEach(f=>{if(!wPlayerSel.length||(f.playerIds||[]).some(pid=>wPlayerSel.includes(pid)))s.add(f.gameId);});
    return ag().filter(g=>s.has(g.id)).map(g=>g.id);
  }
  return[];
}
function wPreset(kind){
  const ids=wPresetIds(kind);
  if(kind==="wish"&&!ids.length){toast("Personne n'a encore noté de jeux dans Envies","warn","heart");return;}
  wList=ids;renderWheelGames();
}
function goWheelGames(){
  wList=wPresetIds("wish");if(!wList.length)wList=wPresetIds("played");if(!wList.length)wList=ag().slice(0,8).map(g=>g.id);
  renderWheelGames();wStep(1);
}
function renderWheelGames(){
  const c=$("wgames");c.innerHTML="";
  [...ag()].sort((a,b)=>(wList.includes(b.id)-wList.includes(a.id))||a.name.localeCompare(b.name,"fr")).forEach(g=>{
    const b=document.createElement("button");b.type="button";b.className="chip"+(wList.includes(g.id)?" on":"");
    b.innerHTML=`${ic(gIcon(g),16)}${esc(g.name)}`;
    b.onclick=()=>{wList=wList.includes(g.id)?wList.filter(x=>x!==g.id):[...wList,g.id];b.classList.toggle("on",wList.includes(g.id));};
    c.appendChild(b);
  });
}
function goWheelSpin(){
  if(wList.length<2){toast("Mets au moins 2 jeux sur la roue","warn","wheel");return;}
  wAngle=-Math.PI/2;wStep(2);$("wres").innerHTML="Appuie sur SPIN !";
  const cv=$("wcanv"),dpr=window.devicePixelRatio||1;cv.width=460*dpr;cv.height=460*dpr;cv.style.width="460px";
  drawWheel(wAngle);
}
function drawWheel(ang){
  const cv=$("wcanv");if(!cv)return;
  const dpr=cv.width/460,ctx=cv.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
  const list=ag().filter(g=>wList.includes(g.id)),n=list.length;if(!n)return;
  const cx=230,cy=230,r=212,seg=2*Math.PI/n,showIc=n<=16;
  ctx.clearRect(0,0,460,460);
  ctx.beginPath();ctx.arc(cx,cy+6,r+6,0,2*Math.PI);ctx.fillStyle="rgba(0,0,0,.35)";ctx.fill();
  list.forEach((g,i)=>{
    const s=ang+i*seg,e=s+seg;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,s,e);ctx.closePath();
    ctx.fillStyle=ACCS[i%ACCS.length];if(n%ACCS.length===1&&i===n-1)ctx.fillStyle=ACCS[4];ctx.fill();
    ctx.strokeStyle="#0c0d18";ctx.lineWidth=3;ctx.stroke();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(s+seg/2);
    if(showIc){const im=wImg(gIcon(g));if(im.complete&&im.naturalWidth){ctx.save();ctx.translate(r-26,0);ctx.rotate(Math.PI/2);ctx.drawImage(im,-16,-16,32,32);ctx.restore();}}
    ctx.fillStyle="#1a1c2c";ctx.font=`600 ${Math.round((n>18?12:15)*uiScale())}px ${uiFamily()}`;ctx.textAlign="right";ctx.textBaseline="middle";
    const max=n>18?16:20;const label=g.name.length>max?g.name.slice(0,max-1)+"…":g.name;
    ctx.fillText(label,showIc?r-50:r-14,1);ctx.restore();
  });
  ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.strokeStyle="#0c0d18";ctx.lineWidth=6;ctx.stroke();
  for(let k=0;k<24;k++){const a=k/24*2*Math.PI;ctx.fillStyle=k%2?"#ffcd75":"#f4f4f4";ctx.fillRect(cx+Math.cos(a)*(r+1)-3,cy+Math.sin(a)*(r+1)-3,6,6);}
  ctx.fillStyle="#0c0d18";ctx.fillRect(cx-26,cy-26,52,52);ctx.fillStyle="#2b3152";ctx.fillRect(cx-23,cy-23,46,46);
  const d=wImg("dice");if(d.complete&&d.naturalWidth)ctx.drawImage(d,cx-16,cy-16,32,32);
  // pointer at top
  ctx.fillStyle="#0c0d18";ctx.beginPath();ctx.moveTo(cx-17,6);ctx.lineTo(cx+17,6);ctx.lineTo(cx,40);ctx.closePath();ctx.fill();
  ctx.fillStyle="#ef7d57";ctx.beginPath();ctx.moveTo(cx-11,9);ctx.lineTo(cx+11,9);ctx.lineTo(cx,31);ctx.closePath();ctx.fill();
}
function spinWheel(){
  const list=ag().filter(g=>wList.includes(g.id));
  if(list.length<2||wSpinning)return;
  wSpinning=true;$("wres").innerHTML="…";
  const total=Math.PI*2*(7+Math.random()*4),dur=3800,t0=performance.now(),a0=wAngle;
  const step=now=>{
    const t=Math.min((now-t0)/dur,1),ease=1-Math.pow(1-t,4);
    wAngle=a0+total*ease;drawWheel(wAngle);
    if(t<1){requestAnimationFrame(step);return;}
    wSpinning=false;
    const n=list.length,seg=2*Math.PI/n;
    const rel=((-Math.PI/2-wAngle)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
    const g=list[Math.floor(rel/seg)%n];
    $("wres").innerHTML=`${ic(gIcon(g),32)}<span>${esc(g.name)} !</span>`;
  };
  requestAnimationFrame(step);
}

// ── STATS ────────────────────────────────────────────────────────────────────
let stSelPlayers=[],stSelGame="all",stVsOnly=false,stMetric="points",stTimeFilter="all",stShowLabels=false,stPlayerSearch="",stGameSearch="",stChart=null;
function rStats(){
  if(!stSelPlayers.length&&players.length){
    const recent=new Set();[...feed].sort(feedSortDesc).slice(0,20).forEach(f=>(f.playerIds||[]).forEach(id=>recent.add(id)));
    stSelPlayers=players.filter(p=>recent.has(p.id)).slice(0,3).map(p=>p.id);
    if(!stSelPlayers.length)stSelPlayers=players.slice(0,3).map(p=>p.id);
  }
  stSelPlayers=stSelPlayers.filter(id=>players.some(p=>p.id===id));
  const labels={points:"Points cumulés",victoires:"Victoires cumulées",parties:"Parties jouées",avgRank:"Rang moyen (1 = meilleur)"};
  $("pg-stats").innerHTML=`<div class="page-head"><h2 class="ptitle">${ic("chart",32)}Statistiques</h2>
    ${seg([["points","Points","star"],["victoires","Victoires","trophy"],["parties","Parties"],["avgRank","Rang moyen"]],stMetric,"stSetMetric")}</div>
    <div class="stats-layout">
      <div>
        <div class="row mb">${seg([["all","Tout"],["week","Semaine"],["month","Mois"],["year","Année"],["20","20 dern."],["50","50 dern."]],stTimeFilter,"stSetTime")}
          <button class="btn ghost sm" onclick="stToggleLabels()">${stShowLabels?"Masquer":"Afficher"} les noms</button></div>
        <div class="box chartbox"><div class="flabel">${labels[stMetric]}</div>
          <div style="position:relative"><canvas id="st-canvas"></canvas><div id="st-tooltip" class="box"></div></div>
          <div id="st-empty" class="empty" style="display:none">${ic("chart",32)}Aucune donnée pour cette sélection.</div></div>
        <div class="box pad mt row" style="gap:.8rem"><button class="toggle${stVsOnly?" on":""}" onclick="stToggleVs()" aria-label="Parties communes"></button><div><div style="font-weight:600">Parties communes uniquement</div><div class="muted" style="font-size:.88rem">Seulement les parties où tous les joueurs choisis étaient là</div></div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:1.4rem">
        <div class="box pad"><div class="flabel">${ic("players",16)}Joueurs</div><input type="search" placeholder="Rechercher…" value="${esc(stPlayerSearch)}" oninput="stPlayerSearch=this.value;stUpdatePanels()"/><div class="picklist" id="st-player-list"></div></div>
        <div class="box pad"><div class="flabel">${ic("gamepad",16)}Jeu</div><input type="search" placeholder="Rechercher…" value="${esc(stGameSearch)}" oninput="stGameSearch=this.value;stUpdatePanels()"/><div class="picklist" id="st-game-list"></div></div>
      </div>
    </div>`;
  stUpdatePanels();drawStatsChart();
}
function stUpdatePanels(){
  const q=norm(stPlayerSearch),gq=norm(stGameSearch);
  const pl=$("st-player-list"),gl=$("st-game-list");if(!pl)return;
  pl.innerHTML=players.filter(p=>!q||norm(p.name).includes(q)).map(p=>{
    const i=stSelPlayers.indexOf(p.id),c=i>=0?ST_COLORS[i%ST_COLORS.length]:"transparent";
    return`<button class="pick${i>=0?" on":""}" style="--lc:${c}" onclick="stTogglePlayer('${p.id}')">${avatar(p,28)}<span class="ell">${esc(p.name)}</span>${i>=0?`<span class="ln"></span>`:""}</button>`;
  }).join("")||`<div class="muted">Aucun résultat</div>`;
  const games=ag().filter(g=>feed.some(f=>f.gameId===g.id)&&(!gq||norm(g.name).includes(gq))).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  gl.innerHTML=`<button class="pick${stSelGame==="all"?" on":""}" onclick="stSetGame('all')">${ic("dice",16)}<span>Tous les jeux</span></button>`+
    games.map(g=>`<button class="pick${stSelGame===g.id?" on":""}" onclick="stSetGame('${g.id}')">${ic(gIcon(g),16)}<span class="ell">${esc(g.name)}</span></button>`).join("");
}
function stTogglePlayer(id){if(stSelPlayers.includes(id)){if(stSelPlayers.length>1)stSelPlayers=stSelPlayers.filter(x=>x!==id);}else stSelPlayers.push(id);stUpdatePanels();drawStatsChart();}
function stSetGame(id){stSelGame=id;stUpdatePanels();drawStatsChart();}
function stToggleVs(){stVsOnly=!stVsOnly;rStats();}
function stSetMetric(m){stMetric=m;rStats();}
function stSetTime(t){stTimeFilter=t;rStats();}
function stToggleLabels(){stShowLabels=!stShowLabels;rStats();}
function drawStatsChart(){
  const canvas=$("st-canvas"),empty=$("st-empty");if(!canvas)return;
  let entries=[...feed].sort(feedSortAsc);
  if(stSelGame!=="all")entries=entries.filter(f=>f.gameId===stSelGame);
  entries=stVsOnly&&stSelPlayers.length>1?entries.filter(f=>stSelPlayers.every(pid=>(f.playerIds||[]).includes(pid))):entries.filter(f=>stSelPlayers.some(pid=>(f.playerIds||[]).includes(pid)));
  if(stTimeFilter!=="all"){
    const c=new Date();
    if(stTimeFilter==="week"){c.setDate(c.getDate()-7);entries=entries.filter(f=>new Date(f.date+"T12:00:00")>=c);}
    else if(stTimeFilter==="month"){c.setMonth(c.getMonth()-1);entries=entries.filter(f=>new Date(f.date+"T12:00:00")>=c);}
    else if(stTimeFilter==="year"){c.setFullYear(c.getFullYear()-1);entries=entries.filter(f=>new Date(f.date+"T12:00:00")>=c);}
    else{const n=parseInt(stTimeFilter);if(!isNaN(n))entries=entries.slice(-n);}
  }
  if(!entries.length){canvas.style.display="none";empty.style.display="flex";stChart=null;return;}
  canvas.style.display="block";empty.style.display="none";
  const isRank=stMetric==="avgRank";
  const series=stSelPlayers.map((pid,idx)=>{
    const p=players.find(x=>x.id===pid);const color=ST_COLORS[idx%ST_COLORS.length];
    const vals=[isRank?2.5:0],dates=["Départ"];let cum=0,rt=0,rg=0;
    entries.forEach(f=>{
      dates.push(fd(f.date));
      const n=(f.playerIds||[]).length;
      if(!(f.playerIds||[]).includes(pid)){vals.push(isRank?(rg?+(rt/rg).toFixed(2):2.5):cum);return;}
      const pl=placeOf(f,pid);
      if(isRank){rt+=gameRankFor(pl,n);rg++;vals.push(+(rt/rg).toFixed(2));return;}
      if(stMetric==="parties")cum++;
      else if(stMetric==="victoires"){if(pl===1)cum++;}
      else cum+=ptsFor(pl,n);
      vals.push(stMetric==="points"?Math.max(0,cum):cum);
    });
    return{pid,name:p?.name||"?",color,vals,dates};
  });
  const numPts=entries.length+1,step=Math.max(1,Math.ceil((numPts-1)/8)),xTicks=[];
  for(let i=0;i<numPts;i+=step)xTicks.push(i);if(!xTicks.includes(numPts-1))xTicks.push(numPts-1);
  let yMin=0,yMax,yTicks=[];
  if(isRank){yMin=1;yMax=4;yTicks=[1,2,3,4];}
  else{let m=5;series.forEach(s=>s.vals.forEach(v=>{if(v>m)m=v;}));const ys=m<=10?1:m<=30?5:m<=100?10:m<=300?25:50;yMax=Math.ceil(m/ys)*ys;for(let y=0;y<=yMax;y+=ys)yTicks.push(y);}
  const dpr=window.devicePixelRatio||1,cssW=canvas.parentElement.clientWidth,cssH=Math.max(240,Math.round(cssW*.5));
  canvas.width=cssW*dpr;canvas.height=cssH*dpr;canvas.style.width=cssW+"px";canvas.style.height=cssH+"px";
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);
  const PAD={top:16,right:stShowLabels?92:16,bottom:34,left:40},W=cssW-PAD.left-PAD.right,Hh=cssH-PAD.top-PAD.bottom;
  const cx=i=>PAD.left+(i/(numPts-1||1))*W;
  const cy=v=>isRank?PAD.top+((v-yMin)/(yMax-yMin))*Hh:PAD.top+Hh-(v/yMax)*Hh;
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()||"#1a1c2c";ctx.fillRect(0,0,cssW,cssH);
  ctx.font=`500 ${Math.round(12*uiScale())}px `+uiFamily();
  yTicks.forEach(y=>{ctx.fillStyle="rgba(255,255,255,.06)";ctx.fillRect(PAD.left,Math.round(cy(y)),W,2);ctx.fillStyle="#7387a8";ctx.textAlign="right";ctx.fillText(isRank?(y===1?"1er":y+"e"):String(y),PAD.left-8,cy(y)+4);});
  ctx.textAlign="center";xTicks.forEach(i=>{const raw=entries[i-1];ctx.fillStyle="#7387a8";ctx.fillText(i===0?"":fdShort(raw?.date),cx(i),PAD.top+Hh+20);});
  ctx.fillStyle="#3a4470";ctx.fillRect(PAD.left-2,PAD.top,2,Hh+2);ctx.fillRect(PAD.left-2,PAD.top+Hh,W+2,2);
  series.forEach(s=>{
    ctx.strokeStyle="#0c0d18";ctx.lineWidth=6;ctx.lineJoin="miter";ctx.beginPath();s.vals.forEach((v,i)=>i?ctx.lineTo(cx(i),cy(v)):ctx.moveTo(cx(i),cy(v)));ctx.stroke();
    ctx.strokeStyle=s.color;ctx.lineWidth=3;ctx.beginPath();s.vals.forEach((v,i)=>i?ctx.lineTo(cx(i),cy(v)):ctx.moveTo(cx(i),cy(v)));ctx.stroke();
    xTicks.forEach(i=>{if(i>=s.vals.length)return;ctx.fillStyle="#0c0d18";ctx.fillRect(cx(i)-5,cy(s.vals[i])-5,10,10);ctx.fillStyle=s.color;ctx.fillRect(cx(i)-3,cy(s.vals[i])-3,6,6);});
    if(stShowLabels){const li=s.vals.length-1;ctx.fillStyle=s.color;ctx.textAlign="left";ctx.font=`600 ${Math.round(12*uiScale())}px `+uiFamily();ctx.fillText(s.name.length>10?s.name.slice(0,9)+"…":s.name,cx(li)+8,cy(s.vals[li])+4);ctx.font=`500 ${Math.round(12*uiScale())}px `+uiFamily();}
  });
  stChart={series,numPts,PAD,W,Hh};
  const tip=$("st-tooltip");
  const move=e=>{
    if(!stChart)return;const rect=canvas.getBoundingClientRect();
    const mx=(e.clientX??e.touches?.[0]?.clientX??0)-rect.left;
    if(mx<PAD.left-12||mx>PAD.left+W+12){tip.style.display="none";return;}
    const i=Math.max(0,Math.min(numPts-1,Math.round((mx-PAD.left)/W*(numPts-1))));
    tip.innerHTML=`<div class="muted" style="margin-bottom:.3rem">${i===0?"Départ":series[0].dates[i]}</div>`+series.map(s=>{const v=s.vals[Math.min(i,s.vals.length-1)];return`<div class="row" style="gap:.5rem;flex-wrap:nowrap"><span style="width:12px;height:4px;background:${s.color}"></span><span style="color:${s.color}" class="grow">${esc(s.name)}</span><b>${isRank?v.toFixed(2):v}</b></div>`;}).join("");
    tip.style.display="block";
    let left=cx(i)+12;const tw=tip.offsetWidth;if(left+tw>rect.width-4)left=cx(i)-tw-12;
    tip.style.left=Math.max(0,left)+"px";tip.style.top="6px";
  };
  canvas.onmousemove=move;canvas.onmouseleave=()=>tip.style.display="none";
  canvas.ontouchmove=e=>{e.preventDefault();move(e);};canvas.ontouchend=()=>setTimeout(()=>tip.style.display="none",1500);
}
let resizeT=null;
window.addEventListener("resize",()=>{clearTimeout(resizeT);resizeT=setTimeout(()=>{if(curTab==="stats")drawStatsChart();},150);});

// ── SETTINGS (this device only) ──────────────────────────────────────────────
const SETT_KEY="gn_settings";
let localSettings={fontSize:"normal",bgImage:null,bgOpacity:20,pixelAvatars:true,animations:true,theme:"night",police:"originale"};
const FONTS=["originale","douce","nette"];
function uiFamily(){return getComputedStyle(document.documentElement).getPropertyValue("--ui").trim()||"sans-serif";}
function uiScale(){return localSettings.police==="douce"||localSettings.police==="nette"?1:.63;} // canvas text has no font-size-adjust
function loadSettings(){try{const s=localStorage.getItem(SETT_KEY);if(s)localSettings={...localSettings,...JSON.parse(s)};}catch(e){}applySettings();}
function saveSettings(){try{localStorage.setItem(SETT_KEY,JSON.stringify(localSettings));}catch(e){}applySettings();}
function applySettings(){
  document.documentElement.style.fontSize=({small:"14px",normal:"16px",large:"18px"})[localSettings.fontSize]||"16px";
  const bg=$("bg-layer");
  if(localSettings.bgImage){bg.style.backgroundImage=`url(${localSettings.bgImage})`;bg.style.opacity=(localSettings.bgOpacity||20)/100;bg.style.display="block";}
  else bg.style.display="none";
  document.body.classList.toggle("calm",!localSettings.animations);
  document.documentElement.dataset.font=FONTS.includes(localSettings.police)?localSettings.police:"originale";
  const th=localSettings.theme==="sunset"?"sunset":"night";
  document.documentElement.dataset.theme=th;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",th==="sunset"?"#26172a":"#1a1c2c");
  const tb=$("theme-btn");
  if(tb){tb.innerHTML=ic(th==="sunset"?"moon":"sun",16);tb.title=th==="sunset"?"Passer à la nuit":"Passer au coucher de soleil";}
  applyPalette();
}
function toggleTheme(){
  localSettings.theme=localSettings.theme==="sunset"?"night":"sunset";saveSettings();
  if($("settModal").classList.contains("open"))syncSettingsUI();
  if(curTab==="stats")drawStatsChart();
}
function syncSettingsUI(){
  document.querySelectorAll("#fs-seg button").forEach(b=>{b.classList.toggle("on",b.dataset.fs===localSettings.fontSize);b.onclick=()=>{localSettings.fontSize=b.dataset.fs;saveSettings();syncSettingsUI();if(curTab==="stats")drawStatsChart();};});
  document.querySelectorAll("#font-seg button").forEach(b=>{b.classList.toggle("on",b.dataset.font===(localSettings.police||"originale"));b.onclick=()=>{localSettings.police=b.dataset.font;saveSettings();syncSettingsUI();document.fonts.ready.then(()=>{if(curTab==="stats")drawStatsChart();});};});
  document.querySelectorAll("#theme-seg button").forEach(b=>{b.classList.toggle("on",b.dataset.th===(localSettings.theme||"night"));b.onclick=()=>{if(b.dataset.th!==localSettings.theme)toggleTheme();syncSettingsUI();};});
  $("set-pxav").classList.toggle("on",!!localSettings.pixelAvatars);
  $("set-anim").classList.toggle("on",!!localSettings.animations);
  $("bg-opacity").value=localSettings.bgOpacity||20;$("bg-opacity-val").textContent=(localSettings.bgOpacity||20)+"%";
  $("bg-remove").style.display=localSettings.bgImage?"inline-flex":"none";
  renderPalettePick();
}
function openSettings(){
  syncSettingsUI();
  $("bg-file").onchange=async function(){const f=this.files[0];this.value="";if(!f)return;localSettings.bgImage=await compress(f,1920,0.85);saveSettings();syncSettingsUI();};
  openM("settModal");
}
function toggleSetting(k){localSettings[k]=!localSettings[k];saveSettings();syncSettingsUI();if(k==="pixelAvatars"){renderAcct();rAll();}}
function setBgOpacity(v){localSettings.bgOpacity=parseInt(v);$("bg-opacity-val").textContent=v+"%";saveSettings();}
function removeBg(){localSettings.bgImage=null;saveSettings();syncSettingsUI();}
function resetSettings(){localSettings={fontSize:"normal",bgImage:null,bgOpacity:20,pixelAvatars:true,animations:true,theme:"night",police:"originale"};saveSettings();syncSettingsUI();renderAcct();rAll();}

// ── CROP TOOL ────────────────────────────────────────────────────────────────
let _cropCb=null,_cropShape="square",_cropZoom=1,_cropOx=0,_cropOy=0,_cropDrag=false,_cropLx=0,_cropLy=0;
function openCropModal(dataUrl,shape,cb){
  _cropCb=cb;_cropShape=shape||"square";_cropZoom=1;_cropOx=0;_cropOy=0;
  $("crop-zoom").value=1;$("crop-zoom-val").textContent="100%";
  const img=$("crop-img");img.onload=()=>cropApplyTransform();img.src=dataUrl;
  openM("cropModal");
  const frame=$("crop-frame"),cont=$("crop-container");
  const cw=cont.offsetWidth||400,ch=Math.min(cw*1.2,420);cont.style.height=ch+"px";
  const fW=shape==="banner"?Math.min(cw-20,380):Math.min(260,cw-20),fH=shape==="banner"?Math.round(fW/3):fW;
  frame.style.width=fW+"px";frame.style.height=fH+"px";frame.style.left=Math.max(0,(cw-fW)/2)+"px";frame.style.top=Math.max(0,(ch-fH)/2)+"px";
  const xy=e=>e.touches?{x:e.touches[0].clientX,y:e.touches[0].clientY}:{x:e.clientX,y:e.clientY};
  img.onmousedown=img.ontouchstart=e=>{_cropDrag=true;const p=xy(e);_cropLx=p.x;_cropLy=p.y;e.preventDefault();};
  window.onmousemove=window.ontouchmove=e=>{if(!_cropDrag)return;const p=xy(e);_cropOx+=p.x-_cropLx;_cropOy+=p.y-_cropLy;_cropLx=p.x;_cropLy=p.y;cropApplyTransform();};
  window.onmouseup=window.ontouchend=()=>{_cropDrag=false;};
}
function cropApplyZoom(z){_cropZoom=parseFloat(z);$("crop-zoom-val").textContent=Math.round(_cropZoom*100)+"%";cropApplyTransform();}
function cropApplyTransform(){$("crop-img").style.transform=`translate(${_cropOx}px,${_cropOy}px) scale(${_cropZoom})`;}
function cropCleanup(){cm("cropModal");window.onmousemove=window.onmouseup=window.ontouchmove=window.ontouchend=null;_cropCb=null;}
function cropCancel(){cropCleanup();}
function cropConfirm(){
  const img=$("crop-img"),cont=$("crop-container").getBoundingClientRect(),fr=$("crop-frame").getBoundingClientRect(),ir=img.getBoundingClientRect();
  const fx=fr.left-cont.left,fy=fr.top-cont.top,ix=ir.left-cont.left,iy=ir.top-cont.top;
  const scX=img.naturalWidth/ir.width,scY=img.naturalHeight/ir.height;
  const sx=Math.max(0,(fx-ix)*scX),sy=Math.max(0,(fy-iy)*scY);
  const outW=_cropShape==="banner"?960:512,outH=_cropShape==="banner"?320:512;
  let sw=Math.min(fr.width*scX,img.naturalWidth-sx),sh=Math.min(fr.height*scY,img.naturalHeight-sy);
  const ar=outW/outH;if(sw/sh>ar)sw=sh*ar;else sh=sw/ar;
  const c=document.createElement("canvas");c.width=outW;c.height=outH;
  c.getContext("2d").drawImage(img,sx,sy,sw,sh,0,0,outW,outH);
  const res=c.toDataURL("image/jpeg",0.9),cb=_cropCb;cropCleanup();if(cb)cb(res);
}
function compressAndCrop(file,shape,cb){const r=new FileReader();r.onload=e=>openCropModal(e.target.result,shape,cb);r.readAsDataURL(file);}

// ── PALETTE (couleurs du site, pour cet appareil) ────────────────────────────
// A palette sets the main color variables inline on <html>, so it wins over the night/sunset
// ambiance colors (the ambiance then only switches the sky scene). "Originale" sets nothing.
// Backgrounds always stay dark: many labels use the background color as text on bright buttons,
// so a light background would make them unreadable. Presets were contrast-checked against the original.
const PAL_VARS=["--bg","--bg2","--bg3","--bg4","--frame","--text","--text2","--text3","--yellow","--orange","--cyan"];
const PALETTES={
  originale:{name:"Originale"},
  ocean:{name:"Océan",c:["#0e1e2a","#132938","#1a3547","#285068","#060e15","#eef8fb","#a9cbd6","#7699a9","#5fe3cf","#ff8a6b","#8fd3ff"]},
  foret:{name:"Forêt",c:["#13201a","#192a21","#21372b","#32503f","#08100b","#f1f6ea","#bcd0b4","#81a084","#d4e86a","#f0a35e","#8be0b0"]},
  bonbon:{name:"Bonbon",c:["#22162e","#2c1c3b","#3a2650","#523673","#0f0816","#fdf2ff","#dcc2e8","#a68bbd","#ff9ad5","#ffb36b","#9ae6ff"]},
  braise:{name:"Braise",c:["#1f1414","#2a1a19","#382220","#55322c","#0e0807","#fff1e6","#e3c2ad","#ad8a78","#ffc04d","#ff7a52","#ffd9a0"]},
  gameboy:{name:"Game Boy",c:["#0f2a12","#143417","#1c431f","#2f6130","#061407","#e3f8d2","#acd391","#7fa868","#b8d82a","#e0c040","#c8ec7a"]},
  contraste:{name:"Contraste fort",c:["#0b0b0b","#141414","#1f1f1f","#3a3a3a","#000000","#ffffff","#e6e6e6","#b8b8b8","#ffe14d","#ffa04d","#6fe8ff"]},
  perso:{name:"Perso"},
};
const PAL_ORIG={night:["#1a1c2c","#2b3152"],sunset:["#26172a","#432949"]}; // for the "Originale" preview
const PAL_DEF={bg:"#1a1c2c",accent:"#ffcd75",accent2:"#73eff7"};
const isHex=v=>/^#[0-9a-f]{6}$/i.test(String(v||""));
function hexHsl(hex){
  const n=parseInt(hex.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;let h=0,s=0;
  if(d){s=d/(1-Math.abs(2*l-1));h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}
  return[h,s,l];
}
function hslHex(h,s,l){
  const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return"#"+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,"0")).join("");
}
function lumi(hex){const n=parseInt(hex.slice(1),16);return[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=lumi(a),y=lumi(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
// Lighten a color until it reads well on the background (and dark text reads well on it)
function readable(hex,bg){let[h,s,l]=hexHsl(hex),out=hex;while(contrast(out,bg)<5&&l<.97){l+=.02;out=hslHex(h,s,l);}return out;}
function palCustom(){const c=localSettings.palCustom||{};return{bg:isHex(c.bg)?c.bg:PAL_DEF.bg,accent:isHex(c.accent)?c.accent:PAL_DEF.accent,accent2:isHex(c.accent2)?c.accent2:PAL_DEF.accent2};}
// "Perso": the background keeps the picked hue but its lightness is fixed dark; accents are lightened if needed
function customColors(){
  const p=palCustom(),[h,s0]=hexHsl(p.bg),s=Math.min(s0,.5),ts=Math.min(s0,.25),bg=hslHex(h,s,.13);
  return[bg,hslHex(h,s,.17),hslHex(h,s,.22),hslHex(h,s,.32),hslHex(h,s,.06),hslHex(h,ts,.96),hslHex(h,ts,.8),hslHex(h,Math.min(s0,.3),.62),
    readable(p.accent,bg),readable("#ef7d57",bg),readable(p.accent2,bg)];
}
function palKey(){return PALETTES[localSettings.palette]?localSettings.palette:"originale";}
function palColors(k){return k==="perso"?customColors():PALETTES[k]?.c||null;}
function applyPalette(){
  const root=document.documentElement,c=palColors(palKey());
  PAL_VARS.forEach((v,i)=>c?root.style.setProperty(v,c[i]):root.style.removeProperty(v));
  root.dataset.palette=palKey();
  const bg=getComputedStyle(root).getPropertyValue("--bg").trim();
  if(bg)document.querySelector('meta[name="theme-color"]')?.setAttribute("content",bg);
}
function setPalette(k){
  if(!PALETTES[k])return;
  localSettings.palette=k;saveSettings();renderPalettePick();
  if(curTab==="stats")drawStatsChart(); // the chart paints its own background
}
function setPalCustom(key,v,done){
  if(!isHex(v))return;
  localSettings.palCustom={...palCustom(),[key]:v};localSettings.palette="perso";saveSettings();
  // While the color picker is open only refresh the preview chips, so the picker stays open
  const sw=$("pal-perso-sw");if(sw)sw.innerHTML=palSwatch(customColors());
  if(done){renderPalettePick();if(curTab==="stats")drawStatsChart();}
}
function palSwatch(c){return[c[0],c[2],c[8],c[9],c[10]].map(x=>`<i style="background:${x}"></i>`).join("");}
function renderPalettePick(){
  const el=$("pal-pick");if(!el)return;
  const cur=palKey(),o=PAL_ORIG[localSettings.theme==="sunset"?"sunset":"night"];
  const sw=k=>k==="originale"?palSwatch([o[0],"",o[1],"","","","","","#ffcd75","#ef7d57","#73eff7"]):palSwatch(palColors(k));
  let h=`<div class="pal-grid">${Object.keys(PALETTES).map(k=>`<button type="button" class="pal${k===cur?" on":""}" onclick="setPalette('${k}')" aria-pressed="${k===cur}">
    <span class="pal-sw"${k==="perso"?` id="pal-perso-sw"`:""}>${sw(k)}</span><span class="pal-n">${esc(PALETTES[k].name)}</span></button>`).join("")}</div>`;
  if(cur==="perso"){
    const p=palCustom(),f=(key,label)=>`<label class="pal-c"><input type="color" value="${p[key]}" oninput="setPalCustom('${key}',this.value)" onchange="setPalCustom('${key}',this.value,true)"/><span>${label}</span></label>`;
    h+=`<div class="pal-perso">${f("bg","Fond")}${f("accent","Accent")}${f("accent2","Liens")}</div>
      <div class="hint">Le fond garde ta teinte mais reste sombre, et les accents sont éclaircis si besoin, pour que tout reste lisible.</div>`;
  }else if(cur!=="originale")h+=`<div class="hint">La palette remplace les couleurs de l'ambiance. L'ambiance ne change alors plus que le ciel de l'accueil.</div>`;
  el.innerHTML=h;
}

// ── BOARD GAME ARENA IMPORT ──────────────────────────────────────────────────
// BGA has no public API, and its history endpoint only answers pages opened on boardgamearena.com
// by a logged-in player. So a bookmarklet runs there, opens Game Night at #bga, and relays our
// read-only requests via postMessage using the player's own BGA session (no BGA password here).
// The bookmarklet is kept tiny on purpose: all parsing lives below, so fixes never require
// re-installing the bookmark.
const BGA_HOST=/^https:\/\/([a-z0-9-]+\.)?boardgamearena\.com$/;
const BGA_PAGES=3; // history pages read per batch
// BGA internal names that don't match our game names (the rest match by name or are learned from past imports)
const BGA_GAMES={sevenwonders:"7wonders",tickettoride:"aventuriers",stella:"stella"};
let bgaBridge=false,bgaOpened=false,bgaMe="",bgaOrigin="*",bgaSeq=0;
const bgaWait={};
let bgaTables=[],bgaPage=0,bgaEnd=false,bgaBusy=false,bgaErr="";
const bgaSel=new Set(),bgaSeen=new Set(),bgaMap={};

function bgaBookmarklet(){
  const app=location.origin+location.pathname;
  const src=`(()=>{const APP=${JSON.stringify(app)},O=new URL(APP).origin;`+
    `if(!/(^|\\.)boardgamearena\\.com$/.test(location.hostname)){alert("Ouvre boardgamearena.com (connecté à ton compte), puis clique à nouveau sur ce favori.");return;}`+
    `const cfg=()=>typeof bgaConfig!=="undefined"&&bgaConfig||{};`+
    `const me=String(typeof current_player_id!=="undefined"&&current_player_id||"");`+
    `if(!me||me==="0"){alert("Connecte-toi à Board Game Arena, puis clique à nouveau sur ce favori.");return;}`+
    `window.open(APP+"#bga","_blank");if(window.__gnBga)return;window.__gnBga=1;`+
    `const OK=["/gamestats/gamestats/getGames.html?","/table/table/tableinfos.html?"];`+
    `addEventListener("message",async e=>{if(e.origin!==O)return;const m=e.data||{};if(m.gn!=="bga")return;`+
    `const reply=d=>e.source.postMessage(Object.assign({gn:"bga",id:m.id},d),e.origin);`+
    `try{if(m.type==="hello")return reply({ok:1,data:{me:me}});`+
    `const p=String(m.path||"");if(m.type!=="get"||!OK.some(x=>p.indexOf(x)===0))throw new Error("Requête refusée");`+
    `const r=await fetch(p,{credentials:"include",headers:{"X-Request-Token":cfg().requestToken||""}});`+
    `const t=await r.text();let j;try{j=JSON.parse(t);}catch(x){throw new Error("BGA n'a pas renvoyé de données (HTTP "+r.status+")");}`+
    `reply({ok:1,data:j});}catch(err){reply({ok:0,error:String(err&&err.message||err)});}});})();`;
  return "javascript:"+encodeURIComponent(src);
}
function bgaCopy(){
  const t=bgaBookmarklet();
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject())
    .then(()=>toast("Code copié : colle-le comme adresse d'un nouveau favori","ok","check"))
    .catch(()=>window.prompt("Copie ce code et colle-le comme adresse d'un nouveau favori :",t));
}

// Messaging with the bookmarklet (it lives in the BGA tab that opened us)
window.addEventListener("message",e=>{
  if(!BGA_HOST.test(e.origin)||!window.opener||e.source!==window.opener)return;
  const m=e.data||{},w=m.gn==="bga"&&bgaWait[m.id];if(!w)return;
  delete bgaWait[m.id];clearTimeout(w.t);bgaOrigin=e.origin;
  m.ok?w.res(m.data):w.rej(new Error(m.error||"Erreur Board Game Arena."));
});
function bgaAsk(msg,ms=20000){
  return new Promise((res,rej)=>{
    if(!window.opener){rej(new Error("Onglet Board Game Arena introuvable : lance l'import depuis le favori, sur boardgamearena.com."));return;}
    const id=++bgaSeq;
    bgaWait[id]={res,rej,t:setTimeout(()=>{delete bgaWait[id];rej(new Error("Board Game Arena ne répond pas."));},ms)};
    try{window.opener.postMessage({gn:"bga",id,...msg},bgaOrigin);}
    catch(e){clearTimeout(bgaWait[id].t);delete bgaWait[id];rej(e);}
  });
}

// Parsing. getGames.html returns {status:1,data:{tables:[{table_id,game_name,start,end,normalend,
// players,player_names,scores,ranks}]}} where the per-player fields are comma-separated lists.
const bgaSplit=v=>Array.isArray(v)?v.map(x=>String(x??"")):v==null||v===""?[]:String(v).split(",");
function isoDay(ts){const d=new Date(ts*1000);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function bgaParse(t){
  const ids=bgaSplit(t.players),names=bgaSplit(t.player_names),scores=bgaSplit(t.scores),ranks=bgaSplit(t.ranks);
  const ts=Number(t.end)||Number(t.start)||0;
  return{
    table:String(t.table_id||"").replace(/\D/g,""),
    game:String(t.game_name||"").toLowerCase().replace(/[^a-z0-9_-]/g,"")||"inconnu",
    date:ts?isoDay(ts):"",ts,
    normal:String(t.normalend??"1")!=="0",
    ppl:names.map((n,i)=>{const s=parseFloat(scores[i]);return{bid:ids[i]||"",name:n.trim(),score:isFinite(s)?s:null,rank:parseInt(ranks[i],10)||0};}),
  };
}
// Annotate fetched tables with the Game Night players they involve and whether they can be imported
function bgaRows(){
  const byName={};players.forEach(p=>{if(p.bga)byName[norm(p.bga)]=p.id;});
  const done=new Set(feed.map(f=>f.bga&&f.bga.table).filter(Boolean).map(String));
  return bgaTables.map(t=>{
    const ppl=t.ppl.map(p=>({...p,pid:byName[norm(p.name)]||null}));
    const ins=ppl.filter(p=>p.pid);
    const st=done.has(t.table)?"done":!ppl.some(p=>p.rank>0)?"open":ins.length<2?"few":"ok";
    return{...t,ppl,ins,out:ppl.length-ins.length,st};
  });
}
// Places among group members only (outsiders are left out), ties kept, top 3 like the manual form
function bgaRankings(ins){
  const rs=[...new Set(ins.map(p=>p.rank).filter(r=>r>0))].sort((a,b)=>a-b).slice(0,3);
  return rs.map((r,i)=>({place:i+1,pids:ins.filter(p=>p.rank===r).map(p=>p.pid)}));
}
const gkey=s=>norm(s).replace(/[^a-z0-9]/g,"");
function bgaPretty(g){return String(g||"").replace(/[_-]+/g," ").replace(/\b[a-z]/g,c=>c.toUpperCase())||"Jeu BGA";}
function bgaGuess(g){
  const prev=feed.find(f=>f.bga&&f.bga.game===g&&gg(f.gameId));if(prev)return prev.gameId;
  const c=customs.find(x=>x.bga===g);if(c)return c.id;
  if(BGA_GAMES[g]&&gg(BGA_GAMES[g]))return BGA_GAMES[g];
  const k=gkey(g),m=ag().find(x=>gkey(x.name)===k);return m?m.id:"";
}

// Loading
async function bgaConnect(){
  bgaBusy=true;bgaErr="";bgaRenderList();
  try{
    const r=await bgaAsk({type:"hello"},8000);
    bgaMe=String((r&&r.me)||"").replace(/\D/g,"");
    if(!bgaMe)throw new Error("Connecte-toi à Board Game Arena, puis relance le favori.");
    await bgaLoad();
  }catch(e){bgaErr=e.message||String(e);}
  bgaBusy=false;bgaRenderList();
}
async function bgaLoad(){
  for(let i=0;i<BGA_PAGES&&!bgaEnd;i++){
    const r=await bgaAsk({type:"get",path:`/gamestats/gamestats/getGames.html?player=${bgaMe}&opponent_id=0&finished=0&updateStats=0&page=${bgaPage+1}`});
    if(!r||String(r.status)!=="1")throw new Error((r&&r.error)||"Réponse inattendue de Board Game Arena.");
    const list=arr(r.data&&r.data.tables);
    bgaPage++;
    const have=new Set(bgaTables.map(t=>t.table));
    list.map(bgaParse).forEach(t=>{if(t.table&&!have.has(t.table)){have.add(t.table);bgaTables.push(t);}});
    if(!list.length)bgaEnd=true;
  }
}
async function bgaMore(){
  if(bgaBusy||bgaEnd)return;
  bgaBusy=true;bgaRenderList();
  try{await bgaLoad();}catch(e){toast(e.message||"Erreur Board Game Arena","err","cross");}
  bgaBusy=false;bgaRenderList();
}
function bgaRetry(){bgaMe="";bgaTables=[];bgaPage=0;bgaEnd=false;bgaConnect();}

// UI
function openBga(){
  if(!loaded){toast("Les données chargent encore, réessaie dans un instant","err","dice");return;}
  openM("bgaModal");bgaRender();
  if(bgaBridge&&!bgaMe&&!bgaBusy)bgaConnect();
}
function bgaOnData(){
  if(bgaBridge&&!bgaOpened){bgaOpened=true;openBga();return;}
  if(bgaBridge&&$("bgaModal")?.classList.contains("open"))bgaRenderList();
  bgaRefreshLinks();
}
function bgaLogin(){openLogin("Connecte-toi pour importer tes parties Board Game Arena.",()=>bgaRender());}
function bgaLinkRow(p){
  const v=p.bga||"";
  return`<div class="bga-link">${avatar(p,24)}<span class="ell">${esc(p.name)}</span>${canEdit(p.id)
    ?`<input type="text" value="${esc(v)}" placeholder="pseudo BGA" maxlength="40" autocapitalize="none" autocorrect="off" spellcheck="false" onchange="bgaSetName('${p.id}',this.value)" aria-label="Pseudo BGA de ${esc(p.name)}"/>`
    :`<span class="ell${v?"":" muted"}">${esc(v||"—")}</span>`}</div>`;
}
function bgaLinks(){
  return`${loggedIn()?"":`<div class="hint" style="margin:0 0 .5rem">Connecte-toi pour renseigner ton pseudo. <button class="linkbtn" onclick="bgaLogin()">Connexion</button></div>`}
    <div class="bga-links">${players.map(bgaLinkRow).join("")}</div>
    <div class="hint">Le pseudo exact de ton profil BGA. Chacun renseigne le sien, l'admin peut tous les remplir.</div>`;
}
function bgaSetName(pid,v){
  if(!canEdit(pid))return;
  const p=players.find(x=>x.id===pid);if(!p)return;
  const name=String(v||"").trim();
  if(name&&players.some(x=>x.id!==pid&&norm(x.bga)===norm(name))){toast("Ce pseudo BGA est déjà lié à un autre joueur","err","cross");bgaRender();return;}
  if((p.bga||"")===name)return;
  p.bga=name||null;svPlayer(pid,"bga",name||null);
  toast(name?`${p.name} = ${name} sur BGA`:"Pseudo BGA retiré","ok","check");
  if(bgaBridge)bgaRenderList();
}
const bgaCountTxt=()=>`(${players.filter(p=>p.bga).length}/${players.length} renseignés)`;
// Refresh the username rows (e.g. once sign-in finishes), unless someone is typing in them
function bgaRefreshLinks(){
  const w=$("bga-links-wrap");if(!w||!$("bgaModal")?.classList.contains("open")||w.contains(document.activeElement))return;
  w.innerHTML=bgaLinks();const c=$("bga-count");if(c)c.textContent=bgaCountTxt();
}
function bgaRender(){
  const b=$("bga-body");if(!b)return;
  const nLinked=players.filter(p=>p.bga).length;
  const count=`<span id="bga-count" class="muted" style="text-transform:none;letter-spacing:0">${bgaCountTxt()}</span>`;
  if(bgaBridge){
    b.innerHTML=`<div id="bga-list"></div>
      <details class="bga-det"${nLinked<2?" open":""}><summary>${ic("players",16)}Pseudos BGA ${count}</summary><div id="bga-links-wrap">${bgaLinks()}</div></details>`;
    bgaRenderList();return;
  }
  b.innerHTML=`<div class="reason" style="box-shadow:inset var(--px) 0 0 0 var(--sky)">${ic("globe",16)}<span>Board Game Arena n'a pas d'API publique. L'import passe par un favori qui lit ton historique BGA dans ton navigateur : aucun mot de passe BGA n'est demandé ici.</span></div>
    <div class="bga-step"><span class="n">1</span><div class="grow"><div class="flabel">${ic("players",16)}Pseudos BGA ${count}</div><div id="bga-links-wrap">${bgaLinks()}</div></div></div>
    <div class="bga-step"><span class="n">2</span><div class="grow"><div class="flabel">${ic("star",16)}Installe le favori (une seule fois)</div>
      <div class="row"><a class="btn alt bga-bm" href="${esc(bgaBookmarklet())}" onclick="event.preventDefault();toast('Glisse ce bouton dans ta barre de favoris','ok','star')">${ic("dice",16)}Game Night ⇢ BGA</a>
      <button class="btn ghost sm" onclick="bgaCopy()">Copier le code</button></div>
      <div class="hint">Sur ordinateur, glisse le bouton jaune dans ta barre de favoris (Ctrl+Maj+B pour l'afficher). Sinon, crée un favori et colle le code copié à la place de l'adresse.</div></div></div>
    <div class="bga-step"><span class="n">3</span><div class="grow"><div class="flabel">${ic("scroll",16)}Lance l'import</div>
      <div>Va sur Board Game Arena, connecté à ton compte, et clique sur le favori. Game Night s'ouvre avec tes dernières parties : tu vérifies, tu coches, tu importes.</div>
      <div class="row mt"><a class="btn ghost sm" href="https://boardgamearena.com/" target="_blank" rel="noopener">${ic("globe",16)}Ouvrir Board Game Arena</a></div></div></div>
    <div class="mfoot"><button class="btn" onclick="cm('bgaModal')">Fermer</button></div>`;
}
function bgaRenderList(){
  const el=$("bga-list");if(!el)return;
  if(bgaErr){
    el.innerHTML=`<div class="reason">${ic("skull",16)}<span>${esc(bgaErr)}</span></div>
      <div class="hint">Vérifie que l'onglet Board Game Arena est toujours ouvert et que tu y es connecté. Si ça bloque encore, relance le favori depuis BGA.</div>
      <div class="mfoot"><button class="btn ghost" onclick="cm('bgaModal')">Fermer</button><button class="btn" onclick="bgaRetry()">Réessayer</button></div>`;
    return;
  }
  if(bgaBusy&&!bgaTables.length){el.innerHTML=`<div class="empty">${ic("globe",48)}<span>${bgaMe?"Lecture de ton historique BGA…":"Connexion à Board Game Arena…"}</span></div>`;return;}
  const rows=bgaRows(),ok=rows.filter(r=>r.st==="ok");
  ok.forEach(r=>{
    if(!bgaMap[r.game])bgaMap[r.game]={id:bgaGuess(r.game),name:bgaPretty(r.game)};
    // Pre-tick clean results only: everyone in the group and a normal game end
    if(!bgaSeen.has(r.table)){bgaSeen.add(r.table);if(!r.out&&r.normal)bgaSel.add(r.table);}
  });
  const games=[...new Set(ok.map(r=>r.game))];
  const pick=ok.filter(r=>bgaSel.has(r.table)&&bgaMap[r.game].id!=="-");
  const cnt=k=>rows.filter(r=>r.st===k).length;
  const skipped=[cnt("done")&&`${cnt("done")} déjà importée${cnt("done")>1?"s":""}`,cnt("few")&&`${cnt("few")} avec moins de 2 joueurs du groupe`,cnt("open")&&`${cnt("open")} sans résultat`].filter(Boolean);
  let h=`<div class="reason" style="box-shadow:inset var(--px) 0 0 0 var(--green)">${ic("check",16)}<span>Connecté à Board Game Arena · ${rows.length} partie${rows.length>1?"s":""} lue${rows.length>1?"s":""}</span></div>`;
  if(games.length)h+=`<div class="field"><div class="flabel">${ic("gamepad",16)}Jeux</div><div class="bga-games">${games.map(bgaGameRow).join("")}</div></div>`;
  h+=`<div class="field"><div class="flabel">${ic("scroll",16)}Parties à importer</div>${ok.length?ok.map(bgaTableRow).join(""):`<div class="empty">${ic("search",32)}<span>Aucune nouvelle partie avec au moins 2 joueurs du groupe.</span></div>`}</div>`;
  if(skipped.length)h+=`<div class="hint">Ignorées : ${skipped.join(" · ")}.</div>`;
  h+=`<div class="mfoot">${bgaEnd?`<span class="muted">Début de l'historique atteint</span>`:`<button class="btn ghost" onclick="bgaMore()"${bgaBusy?" disabled":""}>${bgaBusy?"Chargement…":"Parties plus anciennes"}</button>`}<span class="spacer"></span>
    <button class="btn ok" onclick="bgaImport()"${pick.length&&!bgaBusy?"":" disabled"}>${ic("check",16)}Importer${pick.length?` (${pick.length})`:""}</button></div>`;
  el.innerHTML=h;
}
function bgaGameRow(g){
  const m=bgaMap[g];
  const opt=t=>ag().filter(x=>gType(x)===t).sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(x=>`<option value="${esc(x.id)}"${m.id===x.id?" selected":""}>${esc(x.name)}</option>`).join("");
  return`<div class="bga-game"><span class="ell" title="${esc(g)}"><b>${esc(bgaPretty(g))}</b> <span class="muted">sur BGA</span></span>
    <div class="bga-gsel"><select onchange="bgaSetGame('${g}',this.value)" aria-label="Jeu Game Night pour ${esc(g)}">
      <option value=""${m.id===""?" selected":""}>+ Nouveau jeu…</option><option value="-"${m.id==="-"?" selected":""}>Ignorer ce jeu</option>
      <optgroup label="Jeux de société">${opt("board")}</optgroup><optgroup label="Jeux en ligne">${opt("online")}</optgroup></select>
      ${m.id===""?`<input type="text" value="${esc(m.name)}" maxlength="48" placeholder="Nom du jeu" oninput="bgaMap['${g}'].name=this.value" aria-label="Nom du nouveau jeu"/>`:""}</div></div>`;
}
function bgaSetGame(g,v){if(bgaMap[g]){bgaMap[g].id=v;bgaRenderList();}}
function bgaToggle(t,on){on?bgaSel.add(t):bgaSel.delete(t);bgaRenderList();}
function bgaTableRow(r){
  const m=bgaMap[r.game],skip=m.id==="-",on=!skip&&bgaSel.has(r.table);
  const g=m.id&&!skip?gg(m.id):null,gname=g?g.name:m.id===""?(m.name.trim()||bgaPretty(r.game)):bgaPretty(r.game);
  const places={};bgaRankings(r.ins).forEach(x=>x.pids.forEach(pid=>places[pid]=x.place));
  const sc=s=>s===null?"":`<span class="sc">${esc(s)}</span>`;
  const ins=[...r.ins].sort((a,b)=>(places[a.pid]||9)-(places[b.pid]||9)).map(p=>{
    const pl=players.find(x=>x.id===p.pid),k=places[p.pid];
    return`<span class="bga-p">${k?ic(["medal1","medal2","medal3"][k-1],16):ic("skull",16)}${avatar(pl,20)}<b>${esc(pl.name)}</b>${sc(p.score)}</span>`;
  }).join("");
  const outs=r.ppl.filter(p=>!p.pid).map(p=>`<span class="bga-p out">${esc(p.name)}${sc(p.score)}</span>`).join("");
  const tags=(r.out?`<span class="tag">+${r.out} hors groupe</span>`:"")+(r.normal?"":`<span class="tag">fin anormale</span>`);
  return`<label class="bga-t${on?"":" off"}"><input type="checkbox"${on?" checked":""}${skip?" disabled":""} onchange="bgaToggle('${r.table}',this.checked)"/>
    <div class="grow"><div class="row" style="gap:.3rem .6rem"><b>${esc(gname)}</b><span class="hdate">${fd(r.date)}</span>${tags}</div>
    <div class="bga-ppl">${ins}${outs}</div></div></label>`;
}
function bgaImport(){
  if(!loggedIn()){bgaLogin();return;}
  const rows=bgaRows().filter(r=>r.st==="ok"&&bgaSel.has(r.table)&&bgaMap[r.game]&&bgaMap[r.game].id!=="-");
  if(!rows.length)return;
  let stamp=Date.now();
  const writes={},newKey=list=>dbRef.child(list).push().key;
  // Create the games picked as "+ Nouveau jeu" (one per BGA game, reusing a same-named game if any)
  const made={};
  rows.forEach(r=>{
    const m=bgaMap[r.game];
    if((m.id&&gg(m.id))||made[r.game])return;
    const name=(m.name||"").trim()||bgaPretty(r.game);
    const ex=ag().find(x=>norm(x.name)===norm(name));
    if(ex){made[r.game]=ex.id;return;}
    const c={id:"c"+(stamp++),name,icon:"meeple",type:"board",img:null,bga:r.game};
    customs.push(c);writes["customs/"+newKey("customs")]=clean(c);
    made[r.game]=c.id;
  });
  rows.sort((a,b)=>a.ts-b.ts).forEach(r=>{
    const scores={};r.ins.forEach(p=>{if(p.score!==null)scores[p.pid]=p.score;});
    const entry={id:String(stamp++),gameId:made[r.game]||bgaMap[r.game].id,playerIds:r.ins.map(p=>p.pid),rankings:bgaRankings(r.ins),
      date:r.date||new Date().toISOString().split("T")[0],photos:[],scores,bga:{table:r.table,game:r.game}};
    feed.push(entry);writes["feed/"+newKey("feed")]=clean(entry);
  });
  Object.keys(made).forEach(g=>{bgaMap[g].id=made[g];});
  rbs();badgeCache.clear();rAll();bgaRenderList();
  const n=rows.length;
  // One multi-path write: all the games and matches land together, or none do
  dbw(()=>dbRef.update(writes),[`${n} partie${n>1?"s":""} importée${n>1?"s":""} depuis BGA !`,"trophy"]);
}

// ── BOOT ─────────────────────────────────────────────────────────────────────
(function boot(){
  $("favicon").href=PX.uri("dice");
  hydrate();
  $("tabs").addEventListener("click",e=>{const t=e.target.closest(".tab");if(t)go(t.dataset.tab);});
  loadSettings();renderAcct();
  const start=(location.hash||"").slice(1);
  bgaBridge=start==="bga"; // opened by the BGA bookmarklet
  curTab=TABS.includes(start)?start:bgaBridge?"historique":"accueil";
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("on",p.id==="pg-"+curTab));
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.tab===curTab));
  $("pg-"+curTab).innerHTML=`<div class="empty">${ic("dice",48)}<span>Mise en place de la table…</span></div>`;
  initFirebase();
})();
