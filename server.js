const express = require('express');
const path = require('path');
const https = require('https');

const app = express();

app.use(express.json());

// Cloudinary config endpoint — MUST be first
app.get('/api/cloudinary-config', (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET
  });
});

// Newsletter welcome email via Resend
app.post('/api/send-welcome-email', (req, res) => {
  const email = req.body && req.body.email;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[RESEND] RESEND_API_KEY not set');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're on the list.</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background-color: #ffffff;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #1a1a1a;
    }
    .wrapper {
      max-width: 560px;
      margin: 0 auto;
      padding: 64px 40px;
    }
    .logo {
      font-size: 13px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #1a1a1a;
      margin-bottom: 56px;
      display: block;
    }
    .divider {
      width: 32px;
      height: 1px;
      background: #1a1a1a;
      margin-bottom: 40px;
    }
    .heading {
      font-size: 28px;
      font-weight: 300;
      line-height: 1.2;
      letter-spacing: -0.01em;
      color: #1a1a1a;
      margin-bottom: 24px;
    }
    .body-text {
      font-size: 14px;
      font-weight: 300;
      line-height: 1.8;
      color: #6b6b6b;
      margin-bottom: 48px;
    }
    .signature {
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #1a1a1a;
    }
    .footer {
      margin-top: 64px;
      padding-top: 32px;
      border-top: 1px solid #e0e0e0;
      font-size: 10px;
      color: #aaaaaa;
      letter-spacing: 0.04em;
      line-height: 1.8;
    }
    .footer a {
      color: #aaaaaa;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <span class="logo">Janedore</span>
    <div class="divider"></div>
    <h1 class="heading">You're on the list.</h1>
    <p class="body-text">
      We're not quite ready yet — but when we are,<br>
      you'll be the first to know.
    </p>
    <span class="signature">— Janedore</span>
    <div class="footer">
      You're receiving this because you signed up at janedore.co.za.<br>
      <a href="mailto:support@janedore.co.za">support@janedore.co.za</a>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `You're on the list.\n\nWe're not quite ready yet — but when we are, you'll be the first to know.\n\n— Janedore\n\nsupport@janedore.co.za`;

  const body = JSON.stringify({
    from:     'Janedore <support@janedore.co.za>',
    reply_to: 'support@janedore.co.za',
    to:       [email],
    subject:  "You\u2019re on the list.",
    html,
    text
  });

  const options = {
    hostname: 'api.resend.com',
    path:     '/emails',
    method:   'POST',
    headers:  {
      'Authorization':  `Bearer ${apiKey}`,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const request = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        console.log('[RESEND] Email sent to:', email);
        res.json({ success: true });
      } else {
        console.error('[RESEND] API error:', response.statusCode, data);
        res.status(500).json({ error: 'Failed to send email' });
      }
    });
  });

  request.on('error', (err) => {
    console.error('[RESEND] Request error:', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  });

  request.write(body);
  request.end();
});

// Serve static files (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname)));

// Catch-all for HTML routing — only sends index.html for clean URLs
app.get('*', (req, res) => {
  // If it looks like a file request (.css, .js, .png etc), let it 404
  if (req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  // Otherwise send index.html for client-side routing
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
