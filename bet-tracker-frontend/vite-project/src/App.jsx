import { useState } from 'react';

function App() {
  const [betCode, setBetCode] = useState('');
  const [message, setMessage] = useState('');
  const [bets, setBets] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!betCode.trim()) {
      setMessage('Please enter a bet code');
      return;
    }

    console.log('Bet code:', betCode);
    setMessage(`Tracking bet: ${betCode}`);
    setBetCode(''); // Clear input after submit
    
    // Optional: Fetch from your backend
    // try {
    //   const response = await fetch('http://localhost:3000/bets');
    //   const data = await response.json();
    //   setBets(data.bets);
    // } catch (error) {
    //   setMessage('Error fetching bets');
    // }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>⚽ Bet Tracker</h1>
      
      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <input 
          type="text"
          placeholder="Enter bet code"
          value={betCode}
          onChange={(e) => setBetCode(e.target.value)}
          style={{ 
            padding: '10px', 
            width: '70%', 
            fontSize: '16px',
            marginRight: '10px'
          }}
        />
        <button 
          type="submit"
          style={{ 
            padding: '10px 20px', 
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Track Bet
        </button>
      </form>

      {message && (
        <p style={{ 
          padding: '10px', 
          backgroundColor: '#e8f5e9', 
          borderRadius: '4px' 
        }}>
          {message}
        </p>
      )}
    </div>
  );
}

export default App;