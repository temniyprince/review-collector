require('dotenv').config();

const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// In-memory stores
const stats = { sent: 0, clicked: 0, skipped: 0 };
const emailTimestamps = new Map(); // email -> lastSentTimestamp
const reviewLinks = new Map();    // id -> { email, orderId }
const eventLog = [];              // max 100 entries

function logEvent(type, data) {
  eventLog.push({ type, time: new Date().toISOString(), ...data });
  if (eventLog.length > 100) eventLog.shift();
}



// POST /webhook — accept order, schedule review email
app.post('/webhook', (req, res) => {
  const { customer_email, customer_name, order_id } = req.body;

  if (!customer_email || !customer_name || !order_id) {
    return res.status(400).json({ error: 'Missing required fields: customer_email, customer_name, order_id' });
  }

  logEvent('webhook', { email: customer_email, orderId: order_id });

  const now = Date.now();
  const lastSent = emailTimestamps.get(customer_email);

  if (lastSent && (now - lastSent) < 30 * 24 * 60 * 60 * 1000) {
    stats.skipped++;
    return res.json({ status: 'skipped', reason: 'Email already sent in the last 30 days' });
  }

  setTimeout(() => {
    const reviewId = crypto.randomUUID();

    reviewLinks.set(reviewId, { email: customer_email, orderId: order_id });

    const link = `${BASE_URL}/r/${reviewId}`;
    const text = `Привіт, ${customer_name}!

Дякуємо, що завітали до Barbershop Garage 🙏

Нам важно знати вашу думку — якщо все сподобалось, будемо вдячні за відгук на Google. Це займе лише хвилину і дуже допоможе нам!

👉 Залишити відгук: ${link}

З повагою,
Команда Barbershop Garage`;

    fetch('https://sandbox.api.mailtrap.io/api/send/3840028', {
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
})
.then(r => r.json())
.then(() => {
  emailTimestamps.set(customer_email, Date.now());
  stats.sent++;
  logEvent('sent', { email: customer_email });
  console.log(`Email sent to ${customer_email}, review id: ${reviewId}`);
})
.catch((err) => {
  console.error(`Failed to send email to ${customer_email}:`, err.message);
});
      .catch((err) => {
        console.error(`Failed to send email to ${customer_email}:`, err.message);
      });
  }, 5000);

  res.json({ status: 'scheduled' });
});

// GET /r/:id — redirect to Google Maps, log click
app.get('/r/:id', (req, res) => {
  const { id } = req.params;
  const entry = reviewLinks.get(id);

  if (!entry) {
    return res.status(404).json({ error: 'Review link not found' });
  }

  stats.clicked++;
  logEvent('clicked', { email: entry.email });
  console.log(`Review link clicked: id=${id}, email=${entry.email}, orderId=${entry.orderId}`);

  res.redirect('https://www.google.com/maps/place/%D0%91%D0%B0%D1%80%D0%B1%D0%B5%D1%80%D1%88%D0%BE%D0%BF+Garage/@50.3169195,30.7011602,17z/data=!4m8!3m7!1s0x40d4c105d5eb042b:0x63168f972f757126!8m2!3d50.3169195!4d30.7037351!9m1!1b1!16s%2Fg%2F11m7pz2_33?entry=ttu');
});

// GET /stats — return counters
app.get('/stats', (_req, res) => {
  res.json(stats);
});

// GET /log — return last 10 events
app.get('/log', (_req, res) => {
  res.json(eventLog.slice(-10));
});

// GET / — dashboard
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Review Collector — Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f0f0f; color: #e0e0e0;
    min-height: 100vh; padding: 40px 20px;
  }
  .container { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 600; margin-bottom: 30px; color: #fff; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 40px; }
  .card {
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
    padding: 24px; text-align: center;
  }
  .card .value { font-size: 36px; font-weight: 700; margin-bottom: 4px; }
  .card .label { font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .card.sent .value { color: #4ade80; }
  .card.clicked .value { color: #60a5fa; }
  .card.skipped .value { color: #fbbf24; }
  .card.rate .value { color: #c084fc; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #ccc; }
  .log { list-style: none; }
  .log li {
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
    padding: 14px 18px; margin-bottom: 8px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 14px;
  }
  .log li .left { display: flex; align-items: center; gap: 12px; }
  .log li .badge {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    padding: 3px 8px; border-radius: 4px; letter-spacing: 0.3px;
  }
  .badge.webhook { background: #1e3a5f; color: #60a5fa; }
  .badge.sent { background: #1a3d2e; color: #4ade80; }
  .badge.clicked { background: #3b2f63; color: #c084fc; }
  .log li .time { color: #666; font-size: 12px; font-variant-numeric: tabular-nums; }
  .empty { color: #555; text-align: center; padding: 40px; font-size: 14px; }
  @media (max-width: 600px) { .cards { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="container">
  <h1>Review Collector — Dashboard</h1>
  <div class="cards">
    <div class="card sent"><div class="value" id="v-sent">0</div><div class="label">Sent</div></div>
    <div class="card clicked"><div class="value" id="v-clicked">0</div><div class="label">Clicked</div></div>
    <div class="card skipped"><div class="value" id="v-skipped">0</div><div class="label">Skipped</div></div>
    <div class="card rate"><div class="value" id="v-rate">0%</div><div class="label">Conversion</div></div>
  </div>
  <h2>Recent Activity</h2>
  <ul class="log" id="activity-log"></ul>
</div>
<script>
function refresh() {
  fetch('/stats').then(r => r.json()).then(s => {
    document.getElementById('v-sent').textContent = s.sent;
    document.getElementById('v-clicked').textContent = s.clicked;
    document.getElementById('v-skipped').textContent = s.skipped;
    const rate = s.sent > 0 ? ((s.clicked / s.sent) * 100).toFixed(1) + '%' : '0%';
    document.getElementById('v-rate').textContent = rate;
  });
  fetch('/log').then(r => r.json()).then(events => {
    const ul = document.getElementById('activity-log');
    if (!events.length) { ul.innerHTML = '<li class="empty">No activity yet</li>'; return; }
    ul.innerHTML = events.slice().reverse().map(e => {
      const labels = { webhook: 'Webhook', sent: 'Email Sent', clicked: 'Link Clicked' };
      const detail = e.type === 'webhook'
        ? e.email + ' · ' + e.orderId
        : e.email;
      const t = new Date(e.time);
      const ts = t.toLocaleTimeString('uk-UA', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const ds = t.toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit' });
      return '<li><span class="left"><span class="badge ' + e.type + '">' + labels[e.type] +
        '</span>' + detail + '</span><span class="time">' + ds + ' ' + ts + '</span></li>';
    }).join('');
  });
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Review collector running on port ${PORT}`);
});
