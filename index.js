require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
   const PORT = process.env.PORT || 3001;

// Add CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Ensure the videos directory exists
const videosDir = path.join(__dirname, 'videos');
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir);
}

// Endpoint to fetch session data and download videos (MOCK VERSION)
app.get('/api/fetch-videos', async (req, res) => {
  const requestedPlayer = req.query.player;
  
  // Mock video data - replace with real API call later
  const mockVideos = [
    { player: "Dom Stagliano", date: "2025-07-18", filename: "Stags_07_18_P01.mp4" },
    { player: "Dom Stagliano", date: "2025-07-18", filename: "Stags_07_18_P02.mp4" },
    { player: "Michael Kelly", date: "2025-07-26", filename: "Michael_Kelly_07_26_P01.mp4" },
    {player: "Michael Kelly", date: "2025-07-26", filename: "Michael_Kelly_07_26_P02.mp4" }
  ];
  
  // Filter by player if requested
  const filteredVideos = requestedPlayer 
    ? mockVideos.filter(v => v.player.toLowerCase() === requestedPlayer.toLowerCase())
    : mockVideos;
    
  console.log(`Returning ${filteredVideos.length} videos for player: ${requestedPlayer || 'all'}`);
  res.json(filteredVideos);
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