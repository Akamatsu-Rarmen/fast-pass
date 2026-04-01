const express = require("express");
const Database = require("better-sqlite3");
const cookieParser = require("cookie-parser");

const app = express();
app.use(cookieParser());

const PASSCODE = "R105";

const db = new Database("tickets.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

// ===== 枠取得 =====
app.get("/get-ticket", (req, res) => {
  const slots = [9,10,11,12,13,14];

  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo"
  });

  const rows = db.prepare(`
    SELECT slot, COUNT(*) as count FROM tickets
    WHERE date(created_at, '+9 hours') = ?
    GROUP BY slot
  `).all(today);

  let counts = {};
  slots.forEach(s => counts[s] = 0);

  rows.forEach(r => counts[r.slot] = r.count);

  res.json({ counts });
});

// ===== 予約 =====
app.get("/reserve", (req, res) => {

  if (req.query.passcode !== PASSCODE) {
    return res.json({ success:false, message:"パスコードが違います" });
  }

  if (req.cookies.reserved) {
    return res.json({ success:false, message:"すでに予約済みです" });
  }

  const chosen = parseInt(req.query.slot);

  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo"
  });

  const row = db.prepare(`
    SELECT COUNT(*) as count FROM tickets
    WHERE slot = ? AND date(created_at, '+9 hours') = ?
  `).get(chosen, today);

  if (row.count >= 3) {
    return res.json({ success:false, message:"満員です" });
  }

  db.prepare("INSERT INTO tickets (slot) VALUES (?)").run(chosen);

  res.cookie("reserved", "yes", { maxAge: 86400000 });
  res.cookie("slot", chosen, { maxAge: 86400000 });
  res.cookie("group", row.count+1, { maxAge: 86400000 });

  res.json({
    success:true,
    slot: `${chosen}時〜${chosen+1}時`,
    group: row.count+1
  });
});

// ===== フロント =====
app.get("/", (req, res) => {
res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
body {
  margin:0;
  overflow:hidden;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
  background: radial-gradient(circle at center, #1b2735, #090a0f);
  font-family:sans-serif;
}

/* 銀河っぽいぼかし */
body::before {
  content:"";
  position:absolute;
  width:200%;
  height:200%;
  background: radial-gradient(circle, rgba(255,255,255,0.1), transparent 70%);
  animation: galaxy 20s linear infinite;
}

@keyframes galaxy {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 星 */
.star {
  position:absolute;
  width:2px;
  height:2px;
  background:white;
  border-radius:50%;
  animation: twinkle 2s infinite;
}

@keyframes twinkle {
  0% {opacity:0.2;}
  50% {opacity:1;}
  100% {opacity:0.2;}
}

/* 流れ星 */
.shooting-star {
  position:absolute;
  width:2px;
  height:80px;
  background: linear-gradient(white, transparent);
  transform: rotate(45deg);
  animation: shoot 2s linear infinite;
}

@keyframes shoot {
  0% { transform: translate(0,0) rotate(45deg); opacity:1;}
  100% { transform: translate(-600px,600px) rotate(45deg); opacity:0;}
}

/* カード */
.ticket {
  position:relative;
  z-index:10;
  background: rgba(255,255,255,0.9);
  padding:25px;
  border-radius:20px;
  text-align:center;
  width:300px;
}

button {
  margin:5px;
  padding:10px;
  border:none;
  border-radius:10px;
  background:#667eea;
  color:white;
}

button:disabled {
  background:gray;
}
</style>
</head>

<body>

<div class="ticket">

<div id="auth">
<h3>パスコード</h3>
<input id="passcode">
<button onclick="checkPass()">入場</button>
<div id="error"></div>
</div>

<div id="main" style="display:none;">
<h3>時間選択</h3>
<div id="slots"></div>
</div>

<div id="result" style="display:none;"></div>

</div>

<script>
// 星生成
for (let i = 0; i < 120; i++) {
  const star = document.createElement("div");
  star.className = "star";
  star.style.top = Math.random()*100 + "%";
  star.style.left = Math.random()*100 + "%";
  star.style.opacity = Math.random();
  document.body.appendChild(star);
}

// 流れ星
for (let i = 0; i < 5; i++) {
  const s = document.createElement("div");
  s.className = "shooting-star";
  s.style.left = Math.random()*100 + "%";
  s.style.animationDelay = Math.random()*5 + "s";
  document.body.appendChild(s);
}

// Cookie取得
function getCookie(name){
  const v=document.cookie.match('(^|;) ?'+name+'=([^;]*)(;|$)');
  return v?v[2]:null;
}

// 予約済み表示
if(getCookie("reserved")){
  const slot=getCookie("slot");
  const group=getCookie("group");

  document.getElementById("auth").style.display="none";
  document.getElementById("main").style.display="none";
  document.getElementById("result").style.display="block";

  document.getElementById("result").innerText =
    slot+"時〜"+(parseInt(slot)+1)+"時 / "+group+"組目";
}

let savedPasscode="";

function checkPass(){
  const input=document.getElementById("passcode").value;

  if(input==="R105"){
    savedPasscode=input;
    document.getElementById("auth").style.display="none";
    document.getElementById("main").style.display="block";
    loadSlots();
  }else{
    document.getElementById("error").innerText="パスコードが違います";
  }
}

async function loadSlots(){
  const res=await fetch('/get-ticket');
  const data=await res.json();

  const container=document.getElementById("slots");
  container.innerHTML="";

  Object.keys(data.counts).forEach(slot=>{
    const count=data.counts[slot];

    const btn=document.createElement("button");
    btn.innerText=slot+"時〜"+(parseInt(slot)+1)+"時 ("+count+"/3)";

    if(count>=3){
      btn.disabled=true;
    }else{
      btn.onclick=()=>reserve(slot);
    }

    container.appendChild(btn);
  });
}

async function reserve(slot){
  const res=await fetch('/reserve?slot='+slot+'&passcode='+savedPasscode);
  const data=await res.json();

  if(!data.success){
    alert(data.message);
  }else{
    document.getElementById("main").style.display="none";
    document.getElementById("result").style.display="block";

    document.getElementById("result").innerText =
      data.slot+" / "+data.group+"組目";
  }
}
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("started"));
