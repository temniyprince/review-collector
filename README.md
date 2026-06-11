# 📬 Review Collector

A lightweight SaaS tool that automatically sends post-purchase emails to customers asking them to leave a review on Google Maps.

## How it works

1. After a customer places an order, a POST request is sent to the API
2. The server sends a personalized email:  
   *"Thank you for your purchase! Would you like to leave us a review?"* + Google Maps link
3. Done — no manual work needed

## Tech Stack

- **Node.js** + **Express** — backend server
- **Mailtrap HTTP API** — email delivery
- **Railway** — cloud deployment
- **REST API** — tested via cURL

## API Usage

```bash
curl -X POST https://your-app.up.railway.app/send-review \
  -H "Content-Type: application/json" \
  -d '{"email": "customer@example.com", "name": "John"}'
```

## Status

✅ Deployed and tested via cURL  
⚙️ CRM integration — in progress

## Setup

```bash
git clone https://github.com/temniyprince/review-collector
cd review-collector
npm install
```

Create a `.env` file:
```
MAILTRAP_TOKEN=your_token
GOOGLE_MAPS_LINK=your_google_maps_review_link
PORT=3000
```

```bash
node index.js
```

---

Built by [@temniyprince](https://github.com/temniyprince)
