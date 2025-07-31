require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

// Add body parser for JSON
app.use(express.json());

// Add CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
  } else {
    next();
  }
});

// Handle preflight requests for all routes
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).end();
});

// Ensure the videos directory exists
const videosDir = path.join(__dirname, 'videos');
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir);
}

// Simple user database (we'll store in memory for now)
let users = [];

// Endpoint to fetch session data and upload videos to S3
app.get('/api/fetch-videos', async (req, res) => {
  const {
    TRACKMAN_USERNAME,
    TRACKMAN_PASSWORD,
    TRACKMAN_CLIENT_ID,
    TRACKMAN_TEAM_ID
  } = process.env;

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

    const data = response.data;
    const videoList = [];
    const requestedPlayer = req.query.player;

    for (const session of data) {
      const player = session.playerName || 'unknown';
      const mediaUrl = session.mediaUrl;
      const date = (session.date || 'unknown').replace(/\//g, '-');
      if (mediaUrl) {
        const filename = `${player.replace(/ /g, '_')}_${date}.mp4`;
        
        // Check if video already exists in S3
        try {
          await s3.headObject({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: filename
          }).promise();
          
          // Video exists in S3, add to list
          videoList.push({ player, date, filename });
          console.log(`Video ${filename} already exists in S3`);
          
        } catch (err) {
          if (err.code === 'NotFound') {
            // Video doesn't exist in S3, download and upload
            try {
              console.log(`Downloading ${filename} from TrackMan...`);
              const videoResp = await axios.get(mediaUrl, { responseType: 'stream' });
              
              // Upload to S3
              const uploadParams = {
                Bucket: process.env.AWS_S3_BUCKET,
                Key: filename,
                Body: videoResp.data,
                ContentType: 'video/mp4'
              };
              
              await s3.upload(uploadParams).promise();
              console.log(`Uploaded ${filename} to S3`);
              
              // Only add to list if matches requested player
              if (!requestedPlayer || player.toLowerCase() === requestedPlayer.toLowerCase()) {
                videoList.push({ player, date, filename });
              }
              
            } catch (uploadErr) {
              console.error(`Failed to upload ${filename}: ${uploadErr.message}`);
              continue;
            }
          } else {
            console.error(`Error checking S3 for ${filename}: ${err.message}`);
            continue;
          }
        }
      }
    }
    
    // Filter by player if requested
    const filteredVideos = requestedPlayer 
      ? videoList.filter(v => v.player.toLowerCase() === requestedPlayer.toLowerCase())
      : videoList;
      
    console.log(`Returning ${filteredVideos.length} videos for player: ${requestedPlayer || 'all'}`);
    res.json(filteredVideos);
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch or upload videos' });
  }
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
  console.log('Registration request received:', req.body);
  
  const { username, password, name, email } = req.body;
  
  // Check if user already exists
  if (users.find(user => user.username === username)) {
    console.log('Username already exists:', username);
    return res.status(400).json({ success: false, message: 'Username already exists' });
  }
  
  // Check if email already exists
  if (users.find(user => user.email === email)) {
    console.log('Email already exists:', email);
    return res.status(400).json({ success: false, message: 'Email already exists' });
  }
  
  // Add new user (in production, hash the password!)
  const newUser = {
    id: users.length + 1,
    username,
    password,
    name: name || username,
    email: email || `${username}@example.com`
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

// Serve videos from S3
app.get('/videos/:filename', async (req, res) => {
  const { filename } = req.params;
  
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: filename
    };
    
    const s3Object = await s3.getObject(params).promise();
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(s3Object.Body);
    
  } catch (err) {
    console.error(`Error serving video ${filename}: ${err.message}`);
    res.status(404).json({ error: 'Video not found' });
  }
});

// Serve video files (fallback)
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
