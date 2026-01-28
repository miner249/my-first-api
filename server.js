const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.json({ message: 'Hey, i built this Api. Hope it works!' });
});

app.get('/bets', (req, res) => {
    res.json({ 
        bets: [
            { id: 1, team: 'Arsenal', odds: 2.5 },
            { id: 2, team: 'Chelsea', odds: 1.8 },
            { id: 3, team: 'Liverpool', odds: 2.0 }
        ] 
    });
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
