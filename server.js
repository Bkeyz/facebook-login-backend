const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Simple storage (NO bcrypt for now)
const users = [];

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Register (NO password hashing for now)
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    
    console.log('Register:', { name, email });
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be 6+ characters' });
    }
    
    // Check if user exists
    const existing = users.find(u => u.email === email);
    if (existing) {
        return res.status(400).json({ error: 'User already exists' });
    }
    
    // Save user (plain text password - TEMPORARY!)
    const newUser = {
        id: users.length + 1,
        name: name,
        email: email,
        password: password  // NOT HASHED - fix later
    };
    
    users.push(newUser);
    console.log('Users:', users.length);
    
    res.json({ 
        success: true, 
        message: 'Account created!',
        user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
});

// Login (NO bcrypt)
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    
    console.log('Login:', { identifier });
    
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = users.find(u => u.email === identifier);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ 
        success: true, 
        message: 'Login successful!',
        user: { id: user.id, name: user.name, email: user.email }
    });
});

// Home
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
});
