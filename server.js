const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-super-secret-key-change-this';

// NO helmet - removed completely to fix CSP issue
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many attempts' }
});

// Storage
const users = new Map();

// Helper functions
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Register
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be 6+ chars' });
    }
    
    // Check if user exists
    for (let user of users.values()) {
        if (user.email === email) {
            return res.status(400).json({ error: 'Email already exists' });
        }
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = Date.now().toString();
    
    const newUser = {
        id: userId,
        name: name,
        email: email,
        password: hashedPassword,
        createdAt: new Date()
    };
    
    users.set(userId, newUser);
    const token = generateToken(userId);
    
    res.json({ 
        message: 'Account created successfully!', 
        token: token,
        user: { id: userId, name: name, email: email }
    });
});

// Login
app.post('/api/login', loginLimiter, async (req, res) => {
    const { identifier, password } = req.body;
    
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user by email
    let foundUser = null;
    for (let user of users.values()) {
        if (user.email === identifier) {
            foundUser = user;
            break;
        }
    }
    
    if (!foundUser) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const valid = await bcrypt.compare(password, foundUser.password);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = generateToken(foundUser.id);
    
    res.json({ 
        message: 'Login successful!', 
        token: token,
        user: { id: foundUser.id, name: foundUser.name, email: foundUser.email }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', users: users.size });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
