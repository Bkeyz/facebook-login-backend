const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Simple storage
const users = [];

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Register
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    
    console.log('Register attempt:', { name, email });
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.status(400).json({ error: 'User exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { id: users.length + 1, name, email, password: hashedPassword };
    users.push(user);
    
    res.json({ message: 'Registration successful', user: { id: user.id, name: user.name, email: user.email } });
});

// Login
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    
    console.log('Login attempt:', { identifier });
    
    const user = users.find(u => u.email === identifier);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email } });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Users registered: ${users.length}`);
});