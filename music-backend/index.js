const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// --- MUSIC SOURCE ADAPTER ---
// Swap this out for any music source.
// Currently uses Deezer's free API for search/metadata/artwork.
// Override getStreamUrl() to return full-length audio from your own source.

const musicSource = {
  async search(query) {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`);
    const data = await res.json();
    if (!data.data) return [];
    return data.data.map(track => ({
      id: String(track.id),
      title: track.title,
      artistName: track.artist?.name || 'Unknown Artist',
      coverId: String(track.album?.id || track.id),
      coverUrl: track.album?.cover_medium || track.album?.cover || '',
      duration: track.duration,
      preview: track.preview
    }));
  },

  async getArtworkUrl(coverId) {
    // Try to get album cover from Deezer
    const res = await fetch(`https://api.deezer.com/album/${coverId}`);
    const data = await res.json();
    return data.cover_big || data.cover_medium || data.cover || null;
  },

  async getStreamUrl(trackId) {
    // Default: return Deezer 30s preview URL
    // Replace this with your own full-length stream source
    const res = await fetch(`https://api.deezer.com/track/${trackId}`);
    const data = await res.json();
    return data.preview || null;
  }
};

// --- API ENDPOINTS ---

// Search for tracks
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Missing query parameter q' });
    const results = await musicSource.search(query);
    res.json(results);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Proxy artwork
app.get('/api/artwork/:coverId', async (req, res) => {
  try {
    const url = await musicSource.getArtworkUrl(req.params.coverId);
    if (!url) return res.status(404).json({ error: 'Artwork not found' });

    const response = await fetch(url);
    if (!response.ok) return res.status(404).json({ error: 'Artwork not found' });

    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    response.body.pipe(res);
  } catch (err) {
    console.error('Artwork error:', err);
    res.status(500).json({ error: 'Artwork fetch failed' });
  }
});

// Proxy audio stream
app.get('/api/stream/:trackId', async (req, res) => {
  try {
    const url = await musicSource.getStreamUrl(req.params.trackId);
    if (!url) return res.status(404).json({ error: 'Stream not found' });

    const response = await fetch(url);
    if (!response.ok) return res.status(404).json({ error: 'Stream not found' });

    res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.set('Accept-Ranges', 'bytes');
    const contentLength = response.headers.get('content-length');
    if (contentLength) res.set('Content-Length', contentLength);

    response.body.pipe(res);
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({ error: 'Stream failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', source: 'deezer-preview' });
});

app.listen(PORT, () => {
  console.log(`Music proxy backend running on port ${PORT}`);
});
