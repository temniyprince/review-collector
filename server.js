require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const stats = { sent: 0, clicked: 0, skipped: 0 };
const emailTimestamps = new Map();
const reviewLinks = new Map();
const eventLog = [];

function logEvent(type, data) {
  eventLog.push({ type, time: new Date().toISOString(), ...data });
  if (eventLog.length > 100) eventLog.shift();
}

async function sendEmail(customer_email, customer_name, link) {
  const text = `Привіт, ${customer_name}!\n\nДякуємо, що завітали до Barbershop Garage 🙏\n\nЗалиште відгук: ${link}\n\nКоманда Barbershop Garage`;
  const res = await fetch('https://sandbox.api.mailtrap.io/api/send/3840028', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SMTP_PASS}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: { email: 'bramljahv@gmail.com', name: 'Barbershop Garage' },
      to: [{ email: customer_email }],
      subject: 'Як вам стрижка? ✂️',
      text
    })
  });
  return res.json();
}

app.post('/webhook', (req, res) => {
  const { customer_email, customer_name, order_id } = req.body;
  if (!customer_email || !customer_name || !order_id) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  logEvent('webhook', { email: customer_email, orderId: order_id });
  const now = Date.now();
  const last = emailTimestamps.get(customer_email);
  if (last && now - last < 30 * 24 * 60 * 60 * 1000) {
    stats.skipped++;
    return res.json({ status: 'skipped' });
  }
  const reviewId = crypto.randomUUID();
  reviewLinks.set(reviewId, { email: customer_email, orderId: order_id });
  const link = `${BASE_URL}/r/${reviewId}`;
  setTimeout(async () => {
    try {
      await sendEmail(customer_email, customer_name, link);
      emailTimestamps.set(customer_email, Date.now());
      stats.sent++;
      logEvent('sent', { email: customer_email });
      console.log(`Email sent to ${customer_email}`);
    } catch (err) {
      console.error(`Failed to send email to ${customer_email}:`, err.message);
    }
  }, 5000);
  res.json({ status: 'scheduled' });
});

app.get('/r/:id', (req, res) => {
  const entry = reviewLinks.get(req.params.id);
  if (!entry) return res.status(404).send('Not found');
  stats.clicked++;
  logEvent('clicked', { email: entry.email });
  res.redirect('https://www.google.com/maps/place/Barbershop+Garage/@50.3169195,30.7037351,17z');
});

app.get('/stats', (req, res) => res.json(stats));
app.get('/log', (req, res) => res.json(eventLog.slice(-10)));

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Review Collector</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#0f0f0f;color:#e0e0e0;padding:40px 20px}.container{max-width:900px;margin:0 auto}h1{font-size:28px;margin-bottom:30px;color:#fff}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:40px}.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:24px;text-align:center}.value{font-size:36px;font-weight:700;margin-bottom:4px}.label{font-size:13px;color:#888;text-transform:uppercase}.sent .value{color:#4ade80}.clicked .value{color:#60a5fa}.skipped .value{color:#fbbf24}.rate .value{color:#c084fc}h2{font-size:18px;margin-bottom:16px;color:#ccc}.log{list-style:none}.log li{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:14px 18px;margin-bottom:8px;display:flex;justify-content:space-between;font-size:14px}.badge{font-size:11px;font-weight:600;text-transform:uppercase;padding:3px 8px;border-radius:4px;margin-right:10px}.badge.webhook{background:#1e3a5f;color:#60a5fa}.badge.sent{background:#1a3d2e;color:#4ade80}.badge.clicked{background:#3b2f63;color:#c084fc}.time{color:#666;font-size:12px}</style></head>
<body><div class="container"><h1>Review Collector — Dashboard</h1>
<div class="cards">
<div class="card sent"><div class="value" id="s">0</div><div class="label">Sent</div></div>
<div class="card clicked"><div class="value" id="c">0</div><div class="label">Clicked</div></div>
<div class="card skipped"><div class="value" id="sk">0</div><div class="label">Skipped</div></div>
<div class="card rate"><div class="value" id="r">0%</div><div class="label">Conversion</div></div>
</div>
<h2>Recent Activity</h2><ul class="log" id="log"></ul></div>
<script>
function refresh(){
  fetch('/stats').then(r=>r.json()).then(s=>{
    document.getElementById('s').textContent=s.sent;
    document.getElementById('c').textContent=s.clicked;
    document.getElementById('sk').textContent=s.skipped;
    document.getElementById('r').textContent=s.sent>0?((s.clicked/s.sent)*100).toFixed(1)+'%':'0%';
  });
  fetch('/log').then(r=>r.json()).then(events=>{
    const ul=document.getElementById('log');
    if(!events.length){ul.innerHTML='<li style="color:#555;text-align:center;padding:40px">No activity yet</li>';return;}
    const labels={webhook:'Webhook',sent:'Email Sent',clicked:'Clicked'};
    ul.innerHTML=events.slice().reverse().map(e=>{
      const t=new Date(e.time);
      const ts=t.toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const ds=t.toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit'});
      const detail=e.type==='webhook'?e.email+' · '+e.orderId:e.email;
      return '<li><span><span class="badge '+e.type+'">'+labels[e.type]+'</span>'+detail+'</span><span class="time">'+ds+' '+ts+'</span></li>';
    }).join('');
  });
}
refresh();setInterval(refresh,5000);
</script></body></html>`);
});

app.listen(PORT, () => console.log(`Review collector running on port ${PORT}`));