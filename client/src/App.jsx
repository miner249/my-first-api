import { useState, useEffect } from 'react';

const API_URL = window.location.origin;

// Later in code:
fetch(`${API_URL}/bets`)  // Works everywhere!

function App() {
  const [shareCode, setShareCode] = useState('');
  const [message, setMessage] = useState('');
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBet, setSelectedBet] = useState(null);

  // Load bets when app starts
  useEffect(() => {
    fetchBets();
  }, []);

  // Fetch all bets from backend
  const fetchBets = async () => {
    try {
      const response = await fetch(`${API_URL}/bets`);
      const data = await response.json();
      setBets(data.bets || []);
    } catch (error) {
      console.error('Error fetching bets:', error);
      setMessage('⚠️ Could not load bets');
    }
  };

  // Submit new bet - NOW CALLS SPORTYBET FROM CLIENT SIDE
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!shareCode.trim()) {
      setMessage('⚠️ Please enter a share code');
      return;
    }

    setLoading(true);
    setMessage('Fetching bet from Sportybet...');

    try {
      // Step 1: Fetch from Sportybet API (client-side to avoid CORS)
      console.log(`🔍 Fetching bet: ${shareCode.trim()}`);
      const timestamp = Date.now();
      const sportyUrl = `https://www.sportybet.com/api/ng/orders/share/${shareCode.trim()}?_t=${timestamp}`;
      
      const sportyResponse = await fetch(sportyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      console.log(`📡 Sportybet response status: ${sportyResponse.status}`);
      
      if (!sportyResponse.ok) {
        throw new Error(`Sportybet API returned status ${sportyResponse.status}`);
      }
      
      const sportyData = await sportyResponse.json();
      console.log(`📦 Sportybet data:`, sportyData);
      
      // Check if the response is valid
      if (!sportyData) {
        throw new Error('No data received from Sportybet');
      }
      
      if (sportyData.code !== 0) {
        setMessage(`❌ ${sportyData.msg || 'Invalid share code or bet not found'}`);
        setLoading(false);
        return;
      }
      
      if (!sportyData.data) {
        setMessage('❌ Bet data not found. The share code may be invalid.');
        setLoading(false);
        return;
      }
      
      // Step 2: Send to backend to save
      setMessage('Saving bet to database...');
      const response = await fetch(`${API_URL}/save-bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          shareCode: shareCode.trim(),
          betData: sportyData.data 
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ Bet tracked successfully: ${shareCode.trim()}`);
        setShareCode(''); // Clear input
        fetchBets(); // Refresh the list
      } else {
        setMessage(`❌ Error saving bet: ${data.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Error tracking bet:', error);
      
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        setMessage('❌ Network error. Please check your internet connection.');
      } else if (error.message.includes('CORS')) {
        setMessage('❌ CORS error. Please make sure the share code is valid.');
      } else {
        setMessage(`❌ Error: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // View bet details
  const handleViewBet = async (id) => {
    try {
      const response = await fetch(`${API_URL}/bets/${id}`);
      const data = await response.json();
      
      if (data.success) {
        setSelectedBet(data.bet);
      }
    } catch (error) {
      console.error('Error viewing bet:', error);
      setMessage('❌ Could not load bet details');
    }
  };

  // Delete a bet
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bet?')) return;

    try {
      const response = await fetch(`${API_URL}/bets/${id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Bet deleted');
        setSelectedBet(null);
        fetchBets(); // Refresh the list
      }
    } catch (error) {
      console.error('Error deleting bet:', error);
      setMessage('❌ Could not delete bet');
    }
  };

  const formatCurrency = (amount) => {
    return `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div style={{ 
      padding: '40px', 
      maxWidth: '1000px', 
      margin: '0 auto',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center' }}>⚽ Sportybet Tracker</h1>
      <p style={{ textAlign: 'center', color: '#666' }}>
        Track and view your Sportybet betting slips
      </p>
      
      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text"
            placeholder="Enter share code (e.g., YC02SB)"
            value={shareCode}
            onChange={(e) => setShareCode(e.target.value)}
            disabled={loading}
            style={{ 
              padding: '12px', 
              flex: 1,
              fontSize: '16px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              outline: 'none'
            }}
          />
          <button 
            type="submit"
            disabled={loading}
            style={{ 
              padding: '12px 24px', 
              fontSize: '16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              backgroundColor: loading ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Tracking...' : 'Track Bet'}
          </button>
        </div>
      </form>

      {/* Message */}
      {message && (
        <p style={{ 
          padding: '12px', 
          backgroundColor: message.includes('✅') ? '#e8f5e9' : '#ffebee', 
          color: message.includes('✅') ? '#2e7d32' : '#c62828',
          borderRadius: '6px',
          marginBottom: '20px',
          fontWeight: '500'
        }}>
          {message}
        </p>
      )}

      {/* Selected Bet Details */}
      {selectedBet && (
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '30px',
          border: '2px solid #4CAF50'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>📋 Bet Details: {selectedBet.share_code}</h2>
            <button
              onClick={() => setSelectedBet(null)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px' }}>
              <small style={{ color: '#666' }}>Total Odds</small>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4CAF50' }}>{selectedBet.total_odds}</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px' }}>
              <small style={{ color: '#666' }}>Stake</small>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatCurrency(selectedBet.stake)}</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px' }}>
              <small style={{ color: '#666' }}>Potential Win</small>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#FF9800' }}>{formatCurrency(selectedBet.potential_win)}</div>
            </div>
          </div>

          <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>Matches ({selectedBet.matches?.length || 0})</h3>
          {selectedBet.matches && selectedBet.matches.length > 0 ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              {selectedBet.matches.map((match, index) => (
                <div key={index} style={{
                  backgroundColor: 'white',
                  padding: '15px',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <strong style={{ color: '#4CAF50' }}>Match #{index + 1}</strong>
                    <span style={{ 
                      backgroundColor: '#4CAF50', 
                      color: 'white', 
                      padding: '4px 12px', 
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}>
                      {match.odds}
                    </span>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                    {match.home_team} vs {match.away_team}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                    🏆 {match.league}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                    📊 {match.market_name}: <strong>{match.selection}</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#999' }}>
                    🕐 {new Date(match.match_time).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>No matches found</p>
          )}
        </div>
      )}

      {/* Bets List */}
      <div style={{ marginTop: '30px' }}>
        <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
          📋 Tracked Bets ({bets.length})
        </h2>
        
        {bets.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>
            No bets tracked yet. Add one above! 👆
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {bets.map(bet => (
              <li 
                key={bet.id} 
                style={{ 
                  padding: '15px', 
                  backgroundColor: '#f8f9fa', 
                  marginBottom: '10px',
                  borderRadius: '8px',
                  border: '1px solid #e9ecef',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '18px', color: '#333' }}>
                    {bet.share_code}
                  </strong>
                  <br />
                  <small style={{ color: '#666' }}>
                    Odds: {bet.total_odds} | Stake: {formatCurrency(bet.stake)} | Win: {formatCurrency(bet.potential_win)}
                  </small>
                  <br />
                  <small style={{ color: '#999' }}>
                    {new Date(bet.created_at).toLocaleString()}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleViewBet(bet.id)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleDelete(bet.id)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;
