const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Environment variable for port
const PORT = process.env.PORT || 3000;

// Routes
app.get('/', (req, res) => {
    res.json({ message: 'Hey, I built this API. Hope it works!' });
});

app.get('/bets', (req, res) => {
    try {
        res.json({ 
            bets: [
                { id: 1, team: 'Arsenal', odds: 2.5 },
                { id: 2, team: 'Chelsea', odds: 1.8 },
                { id: 3, team: 'Liverpool', odds: 2.0 }
            ] 
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bets' });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});