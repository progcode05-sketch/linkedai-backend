const express = require('express');
const app = express();

app.use(express.json());

const authLinkedIn    = require('./api/auth/linkedin');
const generate        = require('./api/generate');
const usage           = require('./api/usage');
const subscribe       = require('./api/billing/subscribe');
const cancel          = require('./api/billing/cancel');
const verify          = require('./api/billing/verify');
const webhook         = require('./api/billing/webhook');

app.all('/api/auth/linkedin',     authLinkedIn);
app.all('/api/generate',          generate);
app.all('/api/usage',             usage);
app.all('/api/billing/subscribe', subscribe);
app.all('/api/billing/cancel',    cancel);
app.all('/api/billing/verify',    verify);
app.all('/api/billing/webhook',   webhook);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Linkora backend running on port ${PORT}`));
