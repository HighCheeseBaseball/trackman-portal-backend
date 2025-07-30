require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Add body parser for JSON
app.use(express.json());

// Add CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', '*');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Ensure the videos directory exists
const videosDir = path.join(__dirname, 'videos');
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir);
}

// Simple user database (we'll store in memory for now)
let users = [
  { id: 1, username: "dom.stagliano", password: "password123", name: "Dom Stagliano", email: "stags@example.com" },
  { id: 2, username: "michael.kelly", password: "password123", name: "Michael Kelly", email: "michael@example.com" },
  { id: 3, username: "spencer.stockton", password: "Luzardo", name: "Spencer Stockton", email: "stockton@test.com" },
];

// Endpoint to fetch session data and download videos (MOCK VERSION)
app.get('/api/fetch-videos', async (req, res) => {
  const requestedPlayer = req.query.player;
  
  // Mock video data - replace with real API call later
  const mockVideos = [
    { player: "Dom Stagliano", date: "2025-07-18", filename: "Stags_07_18_P01.mp4" },
    { player: "Dom Stagliano", date: "2025-07-18", filename: "Stags_07_18_P02.mp4" },
    { player: "Michael Kelly", date: "2025-07-26", filename: "Michael_Kelly_07_26_P01.mp4" },
    {player: "Michael Kelly", date: "2025-07-26", filename: "Michael_Kelly_07_26_P02.mp4" },
    {player: "Spencer Stockton", date: "2025-07-26", filename: "Luzardo_Side.mp4" }
  ];
  
  // Filter by player if requested
  const filteredVideos = requestedPlayer 
    ? mockVideos.filter(v => v.player.toLowerCase() === requestedPlayer.toLowerCase())
    : mockVideos;
    
  console.log(`Returning ${filteredVideos.length} videos for player: ${requestedPlayer || 'all'}`);
  res.json(filteredVideos);
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    res.json({ success: true, user: { username: user.username, name: user.name } });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

// User registration endpoint
app.post('/api/register', (req, res) => {
  const { username, password, name, email } = req.body;
  
  // Check if user already exists
  if (users.find(user => user.username === username)) {
    return res.status(400).json({ success: false, message: 'Username already exists' });
  }
  
  // Check if email already exists
  if (users.find(user => user.email === email)) {
    return res.status(400).json({ success: false, message: 'Email already exists' });
  }
  
  // Add new user (in production, hash the password!)
  const newUser = {
    id: users.length + 1,
    username,
    password,
    name: name || username, // Use username as name if not provided
    email: email || `${username}@example.com` // Use default email if not provided
  };
  
  users.push(newUser);
  
  console.log(`New user registered: ${username}`);
  res.json({ success: true, message: 'User registered successfully', user: { username: newUser.username, name: newUser.name } });
});

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  // Simple admin credentials (change these!)
  if (username === "admin" && password === "admin123") {
    res.json({ success: true, isAdmin: true });
  } else {
    res.status(401).json({ success: false, message: "Invalid admin credentials" });
  }
});

// Get all users (admin only)
app.get('/api/admin/users', (req, res) => {
  // In a real app, you'd check admin authentication here
  res.json(users.map(user => ({ id: user.id, username: user.username, name: user.name, email: user.email })));
});

// Add new user (admin only)
app.post('/api/admin/users', (req, res) => {
  const { username, password, name, email } = req.body;
  
  const newUser = {
    id: users.length + 1,
    username,
    password,
    name,
    email
  };
  
  users.push(newUser);
  res.json({ success: true, user: newUser });
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  users = users.filter(user => user.id !== userId);
  res.json({ success: true });
});

// Serve video files
app.use('/videos', express.static(videosDir));

// ADD THE TEST ENDPOINT HERE (right before app.listen)
app.get('/test-api', async (req, res) => {
  const {
    TRACKMAN_USERNAME,
    TRACKMAN_PASSWORD,
    TRACKMAN_CLIENT_ID,
    TRACKMAN_TEAM_ID
  } = process.env;

  console.log('Credentials:', {
    username: TRACKMAN_USERNAME,
    password: TRACKMAN_PASSWORD ? '***' : 'MISSING',
    clientId: TRACKMAN_CLIENT_ID,
    teamId: TRACKMAN_TEAM_ID
  });

  const url = 'https://api.trackmanbaseball.com/api/v2/postsession';
  const params = {
    teamId: TRACKMAN_TEAM_ID,
    fromDate: '2025-01-01',
    toDate: '2025-12-31'
  };
  const headers = { ClientId: TRACKMAN_CLIENT_ID };

  try {
    const response = await axios.get(url, {
      headers,
      params,
      auth: { username: TRACKMAN_USERNAME, password: TRACKMAN_PASSWORD }
    });
    
    console.log('API Response Status:', response.status);
    console.log('API Response Data:', response.data);
    
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('API Error:', err.response?.status, err.response?.data);
    res.json({ success: false, error: err.message, status: err.response?.status });
  }
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ message: "Backend is working!" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
