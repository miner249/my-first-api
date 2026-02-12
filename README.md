# ⚡ TRACK IT - SportyBet Tracker

A modern, real-time betting tracker for SportyBet share codes. Track your bets, monitor live matches, and view upcoming games all in one sleek interface.

<img width="1271" height="506" alt="Screenshot Capture - 2026-02-12 - 06-42-09" src="https://github.com/user-attachments/assets/f92621a0-d86f-495c-a3d6-648475e40a08" />



---

## ✨ Features

### 🎯 **Bet Tracking**
- Add SportyBet bets via share code
- View all tracked bets in one dashboard
- Real-time bet details with odds, stake, and potential winnings
- Delete unwanted bets

### 🔴 **Live Match Monitoring**
- Automatic detection of live matches from your tracked bets
- Real-time score updates every 40 seconds
- Live match status indicators
- Match your bets to ongoing games

### 📅 **Today's Schedule**
- View all scheduled matches for the day
- Filter by: All, Upcoming, Live, or Finished
- Real-time match status updates
- Countdown to kickoff times

### 🎨 **Modern Design**
- Clean, professional white interface
- Royal Blue accent colors
- Smooth animations and transitions
- Mobile-first responsive design
- Dark mode ready (coming soon)

---

## 🚀 Tech Stack

### **Frontend**
- **React 18+** - Modern UI library
- **Vanilla CSS** - No frameworks, pure CSS with variables
- **Vite** - Lightning-fast build tool

### **Backend** 
- Node.js / Express
- REST API endpoints
- Real-time data fetching

### **Design System**
- CSS Variables for theming
- Mobile-first responsive design
- Semantic HTML5
- Accessible UI components

---

## 📦 Installation

### **Prerequisites**
- Node.js 16+ and npm/yarn
- A backend API (see API Requirements below)

### **Setup**

```bash
# Clone the repository
git clone https://github.com/yourusername/track-it.git
cd track-it/client

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The app will run on `http://localhost:5173` by default.

---

## 🎯 Usage

### **1. Track a Bet**
1. Get a SportyBet share code from your betting slip
2. Paste it into the input field on the home page
3. Click "Track Bet"
4. View your bet details instantly

### **2. Monitor Live Bets**
1. Navigate to the "Live Bets" tab
2. See all your tracked bets that are currently live
3. Real-time score updates every 40 seconds
4. See your bet selections highlighted

### **3. View Schedule**
1. Go to the "Schedule" tab
2. Filter matches by status (All, Upcoming, Live, Finished)
3. Check kickoff times and current scores
4. Plan your betting strategy

---

## 📁 Project Structure

```
client/
├── src/
│   ├── components/
│   │   ├── Navbar.jsx           # Dynamic SVG header
│   │   ├── MyLiveBets.jsx       # Live bets component
│   │   └── ScheduledMatches.jsx # Schedule component
│   ├── styles/
│   │   ├── design.css           # Global design system
│   │   ├── Navbar.css
│   │   ├── MyLiveBets.css
│   │   └── ScheduledMatches.css
│   ├── App.jsx                  # Main app component
│   ├── App.css                  # App-specific styles
│   ├── main.jsx                 # React entry point
│   └── index.css                # Global reset
├── public/
├── package.json
└── vite.config.js
```

---

## 🔌 API Requirements

Your backend must provide these endpoints:

### **Bets**
```
GET    /bets              # Get all tracked bets
POST   /track-bet         # Track a new bet
GET    /bets/:id          # Get bet details
DELETE /bets/:id          # Delete a bet
```

### **Matches**
```
GET /api/live-matches           # Get all live matches
GET /api/tracked-live-matches   # Get user's live bets
GET /api/today-matches          # Get today's schedule
```

### **Example Response Format**

**GET /bets**
```json
{
  "success": true,
  "bets": [
    {
      "id": 1,
      "share_code": "ABC123XYZ",
      "total_odds": "5.40",
      "stake": "1000.00",
      "potential_win": "5400.00",
      "created_at": "2024-02-12T10:30:00Z",
      "matches": [
        {
          "home_team": "Arsenal",
          "away_team": "Chelsea",
          "league": "Premier League",
          "odds": "1.80",
          "market_name": "Match Winner",
          "selection": "Arsenal",
          "match_time": "2024-02-12T15:00:00Z"
        }
      ]
    }
  ]
}
```

**GET /api/live-matches**
```json
{
  "success": true,
  "source": "football-data",
  "matches": [
    {
      "eventId": "12345",
      "league": "Premier League",
      "home": "Arsenal",
      "away": "Chelsea",
      "homeScore": 2,
      "awayScore": 1,
      "status": "Live - 67'"
    }
  ]
}
```

---

## 🎨 Design System

### **Color Palette**
| Color | Hex | Usage |
|-------|-----|-------|
| Royal Blue | `#0052CC` | Primary accent, links, active states |
| White | `#FFFFFF` | Main background, cards |
| Light Gray | `#F4F4F4` | Section backgrounds |
| Green | `#16A34A` | Win status, positive values |
| Red | `#DC2626` | Loss status, live indicators |
| Gray | `#6B7280` | Pending status, muted text |

### **Typography**
- **Font Family**: Inter, system-ui, sans-serif
- **Headings**: 24-32px, Bold (700)
- **Body**: 15px, Regular (400)
- **Labels**: 12px, Semibold (600), Uppercase

### **Spacing**
- **xs**: 8px
- **sm**: 12px
- **md**: 16px
- **lg**: 24px
- **xl**: 32px

### **Components**
- **Cards**: White background, subtle shadow, 10px border-radius
- **Buttons**: 8px border-radius, hover lift effect
- **Badges**: 20px border-radius, uppercase, 12px font

---

## 📱 Responsive Design

### **Breakpoints**
```css
/* Tablet */
@media (max-width: 768px) {
  /* Stacks grids, full-width buttons */
}

/* Mobile */
@media (max-width: 480px) {
  /* Smaller fonts, compact spacing */
  /* Prevents iOS zoom on inputs */
}
```

### **Mobile Features**
- ✅ Full-width buttons on small screens
- ✅ Stacked card layouts
- ✅ Optimized touch targets (min 44px)
- ✅ Prevents zoom on iOS inputs
- ✅ Responsive SVG navbar

---

## ⚙️ Configuration

### **API URL**
The app uses `window.location.origin` by default. To change:

```javascript
// In App.jsx, MyLiveBets.jsx, ScheduledMatches.jsx
const API_URL = "https://your-api-url.com";
```

### **Update Intervals**
```javascript
// Live bets: 40 seconds
setInterval(fetchLiveBets, 40000);

// Today's matches: 60 seconds
setInterval(fetchScheduledMatches, 60000);

// Live matches: 30 seconds
setInterval(fetchLiveMatches, 30000);
```

---

## 🚧 Roadmap

- [ ] Dark mode toggle
- [ ] Bet history and analytics
- [ ] Push notifications for live matches
- [ ] Export bets to CSV/PDF
- [ ] Multi-language support
- [ ] Bet result tracking (Win/Loss)
- [ ] Profit/Loss calculator
- [ ] Betting stats dashboard

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### **Code Style**
- Use semantic HTML
- Follow BEM naming convention for CSS
- Keep components small and focused
- Write descriptive commit messages
- Add comments for complex logic

---

## 🐛 Known Issues

- None currently! 🎉

If you find a bug, please [open an issue](https://github.com/miner249/track-it/issues).

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author
 ZAKARIYAU MUBARAK

- GitHub: (https://github.com/miner249)- Twitter: (https://twitter.com/MUBARAK_yomide)

---

## 🙏 Acknowledgments

- SportyBet for the betting platform
- Football-Data.org API for live match data
- Inter font family by Rasmus Andersson
- React team for the amazing framework

---

## 📸 Screenshots

### Home Dashboard
<img width="1271" height="506" alt="Screenshot Capture - 2026-02-12 - 06-42-09" src="https://github.com/user-attachments/assets/2829de4e-3401-4edd-89f9-48edba2dd42e" />


### Live Bets
<img width="1292" height="501" alt="Screenshot Capture - 2026-02-12 - 07-13-20" src="https://github.com/user-attachments/assets/ef8c6cc4-6d38-413f-9b09-100090ee57c4" />

### Today's Schedule
<img width="1283" height="580" alt="Screenshot Capture - 2026-02-12 - 06-42-45" src="https://github.com/user-attachments/assets/9da193f2-7ed5-4a9f-b212-c517d94060be" />


### Bet Details Modal
<img width="1206" height="617" alt="Screenshot Capture - 2026-02-12 - 07-12-41" src="https://github.com/user-attachments/assets/985791ab-071a-4d57-bc96-ae07ff4498cb" />


---

## 💡 Tips

### **For Best Experience**
1. Track 3-5 bets at a time for easy monitoring
2. Use the Live Bets tab during match hours
3. Check the Schedule tab to plan your bets
4. Delete old/lost bets to keep dashboard clean

### **Performance**
- The app auto-refreshes data at regular intervals
- Live updates use minimal bandwidth
- All data is fetched from your backend API

---

## 🔐 Privacy

- No user data is stored in the frontend
- All bet data is managed by your backend
- No third-party tracking or analytics (unless you add them)
- Share codes are only sent to your API

---

---

<div align="center">

Built with ❤️ and attention to detail
View Live Demo → [https://trackit-ro60.onrender.com/] 

⭐ Star this repo if you find it useful!

</div>
