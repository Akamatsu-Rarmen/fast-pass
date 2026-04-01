const express = require("express");
const Database = require("better-sqlite3");
const cookieParser = require("cookie-parser");

const app = express();
app.use(cookieParser());

const PASSCODE = "R105";

const db = new Database("tickets.db");

// テーブル
db.prepare(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

// =====================
// 枠の状況取得
// =====================
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

  rows.forEach(r => {
    counts[r.slot] = r.count;
  });

  res.json({ counts });
});

// =====================
// 予約処理
// =====================
app.get("/reserve", (req, res) => {

  if (req.query.passcode !== PASSCODE) {
    return res.json({ success: false, message: "パスコードが違います" });
  }

  if (req.cookies.reserved) {
    return res.json({ success: false, message: "すでに予約済みです" });
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
    return res.json({ success: false, message: "この時間帯は満員です" });
  }

  db.prepare("INSERT INTO tickets (slot) VALUES (?)").run(chosen);

  // 👇結果も保存
  res.cookie("reserved", "yes", { maxAge: 24*60*60*1000 });
  res.cookie("slot", chosen, { maxAge: 24*60*60*1000 });
  res.cookie("group", row.count + 1, { maxAge: 24*60*60*1000 });

  res.json({
    success: true,
    slot: `${chosen}時〜${chosen+1}時`,
    group: row.count + 1
  });
});

// =====================
// フロント
// =====================
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body {
  margin:0;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
  background:#0d1b2a;
  font-family:sans-serif;
  color:white;
}
.ticket {
  background:white;
  color:black;
  padding:20px;
  border-radius:15px;
  text-align:center;
  width:300px;
}
button {
  margin:5px;
  padding:10px;
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
// 👇 Cookie取得関数
function getCookie(name) {
  const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
  return v ? v[2] : null;
}

// 👇 すでに予約済みなら結果表示
const reserved = getCookie("reserved");
if (reserved) {
  const slot = getCookie("slot");
  const group = getCookie("group");

  document.getElementById("auth").style.display = "none";
  document.getElementById("main").style.display = "none";
  document.getElementById("result").style.display = "block";

  document.getElementById("result").innerText =
    slot + "時〜" + (parseInt(slot)+1) + "時 / " + group + "組目";
}

let savedPasscode = "";

function checkPass() {
  const input = document.getElementById("passcode").value;

  if (input === "${PASSCODE}") {
    savedPasscode = input;
    document.getElementById("auth").style.display = "none";
    document.getElementById("main").style.display = "block";
    loadSlots();
  } else {
    document.getElementById("error").innerText = "パスコードが違います";
  }
}

async function loadSlots() {
  const res = await fetch('/get-ticket');
  const data = await res.json();

  const container = document.getElementById("slots");
  container.innerHTML = "";

  Object.keys(data.counts).forEach(slot => {
    const count = data.counts[slot];

    const btn = document.createElement("button");
    btn.innerText = slot + "時〜" + (parseInt(slot)+1) + "時 (" + count + "/3)";

    if (count >= 3) {
      btn.disabled = true;
    } else {
      btn.onclick = () => reserve(slot);
    }

    container.appendChild(btn);
  });
}

async function reserve(slot) {
  const res = await fetch('/reserve?slot=' + slot + '&passcode=' + savedPasscode);
  const data = await res.json();

  if (!data.success) {
    alert(data.message);
  } else {
    document.getElementById("main").style.display = "none";
    document.getElementById("result").style.display = "block";

    document.getElementById("result").innerText =
      data.slot + " / " + data.group + "組目";
  }
}
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("started"));
