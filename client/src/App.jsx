import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import MyLiveBets from './components/MyLiveBets';
import ScheduledMatches from './components/ScheduledMatches';
import MatchPage from './pages/match/[id]';
import './styles/design.css';
import './App.css';

const API_URL = window.location.origin;

function App() {
  const [shareCode, setShareCode] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBet, setSelectedBet] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedMatchId, setSelectedMatchId] = useState('');

  useEffect(() => {
    fetchBets();
  }, []);

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => setMessage({ text: '', type: '' }), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchBets = async () => {
    try {
      const res = await fetch(`${API_URL}/bets`);
      const data = await res.json();
      setBets(data.bets || []);
    } catch (err) {
      console.error('Error fetching bets:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!shareCode.trim()) {
      setMessage({ text: '⚠️ Please enter a share code', type: 'error' });
      return;
    }
    setLoading(true);
    setMessage({ text: '🔄 Tracking bet...', type: 'loading' });

    try {
      const res = await fetch(`${API_URL}/track-bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareCode: shareCode.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ text: `✅ Bet tracked successfully!`, type: 'success' });
        setShareCode('');
        fetchBets();
      } else {
        setMessage({ text: `❌ ${data.error || 'Failed to track bet'}`, type: 'error' });
      }
    } catch {
      setMessage({ text: '❌ Network error. Check your connection.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleViewBet = async (id, e) => {
    e?.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/bets/${id}`);
      const data = await res.json();
      if (data.success) setSelectedBet(data.bet);
    } catch {
      setMessage({ text: '❌ Could not load bet details', type: 'error' });
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this bet?')) return;
    try {
      const res = await fetch(`${API_URL}/bets/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: '✅ Bet deleted', type: 'success' });
        setSelectedBet(null);
        fetchBets();
      }
    } catch {
      setMessage({ text: '❌ Could not delete bet', type: 'error' });
    }
  };

  const fmt = (n) => `₦${parseFloat(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  // Count live bets for navbar indicator
  const liveCount = bets.filter(bet => 
    bet.matches?.some(m => m.status === 'Live' || m.status === 'IN_PLAY')
  ).length;

  return (
    <div className="app">
      <Navbar 
        currentPage={currentPage} 
        onNavigate={setCurrentPage}
        liveCount={liveCount}
      />

      <div className="container">
        {currentPage === 'home' && (
          <>
            {/* Track Bet Section */}
            <section className="section">
              <div className="track-card card-static">
                <h2 className="section-title">📋 Track a Bet</h2>
                <form onSubmit={handleSubmit} className="track-form">
                  <input 
                    type="text"
                    placeholder="Enter SportyBet share code..."
                    value={shareCode}
                    onChange={(e) => setShareCode(e.target.value)}
                    disabled={loading}
                    className="track-input"
                  />
                  <button 
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    {loading ? '🔄 Tracking...' : '+ Track Bet'}
                  </button>
                </form>
                
                {message.text && (
                  <div className={`message message-${message.type}`}>
                    {message.text}
                  </div>
                )}
              </div>
            </section>

            {/* Stats Section */}
            <section className="section">
              <div className="stats-grid grid grid-3">
                <div className="stat-card card-static">
                  <div className="stat-value text-accent">{bets.length}</div>
                  <div className="stat-label">Total Bets</div>
                </div>
                <div className="stat-card card-static">
                  <div className="stat-value text-win">
                    {bets.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0) > 0
                      ? fmt(bets.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0))
                      : '₦0.00'}
                  </div>
                  <div className="stat-label">Total Staked</div>
                </div>
                <div className="stat-card card-static">
                  <div className="stat-value" style={{ color: '#FB923C' }}>
                    {bets.reduce((sum, b) => sum + (parseFloat(b.potential_win) || 0), 0) > 0
                      ? fmt(bets.reduce((sum, b) => sum + (parseFloat(b.potential_win) || 0), 0))
                      : '₦0.00'}
                  </div>
                  <div className="stat-label">Potential Win</div>
                </div>
              </div>
            </section>

            {/* My Bets Section */}
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">🎯 My Tracked Bets</h2>
                <span className="badge badge-pending">{bets.length} tracked</span>
              </div>

              {bets.length === 0 ? (
                <div className="empty-state card-static">
                  <div className="empty-icon">🎯</div>
                  <p className="empty-text">
                    No bets tracked yet.<br />
                    Enter a share code above to get started!
                  </p>
                </div>
              ) : (
                <div className="bets-list">
                  {bets.map((bet) => (
                    <div 
                      key={bet.id}
                      className="bet-card card"
                      onClick={(e) => handleViewBet(bet.id, e)}
                    >
                      <div className="bet-card-header">
                        <span className="bet-code">{bet.share_code}</span>
                        <span className="badge badge-pending">Pending</span>
                      </div>

                      <div className="bet-info-grid">
                        <div className="bet-info-item">
                          <span className="bet-info-label">Odds</span>
                          <span className="bet-info-value text-win">{bet.total_odds}x</span>
                        </div>
                        <div className="bet-info-item">
                          <span className="bet-info-label">Stake</span>
                          <span className="bet-info-value">{fmt(bet.stake)}</span>
                        </div>
                        <div className="bet-info-item">
                          <span className="bet-info-label">Potential Win</span>
                          <span className="bet-info-value" style={{ color: '#FB923C' }}>
                            {fmt(bet.potential_win)}
                          </span>
                        </div>
                      </div>

                      <div className="bet-actions">
                        <button 
                          className="btn btn-secondary"
                          onClick={(e) => handleViewBet(bet.id, e)}
                        >
                          View Details
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={(e) => handleDelete(bet.id, e)}
                        >
                          Delete
                        </button>
                      </div>

                      <div className="bet-time">
                        🕐 {new Date(bet.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {currentPage === 'my-live-bets' && <MyLiveBets />}
        {currentPage === 'scheduled' && !selectedMatchId && (
          <ScheduledMatches onOpenMatch={setSelectedMatchId} />
        )}
        {currentPage === 'scheduled' && selectedMatchId && (
          <>
            <button className="btn btn-secondary" onClick={() => setSelectedMatchId('')} style={{ marginBottom: '12px' }}>
              ← Back to Today Matches
            </button>
            <MatchPage matchId={selectedMatchId} />
          </>
        )}
      </div>

      {/* Modal for Bet Details */}
      {selectedBet && (
        <div className="modal-overlay" onClick={() => setSelectedBet(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📋 {selectedBet.share_code}</h2>
              <button className="modal-close" onClick={() => setSelectedBet(null)}>✕</button>
            </div>

            <div className="modal-stats grid grid-3">
              <div className="stat-card card-static">
                <div className="stat-value text-win">{selectedBet.total_odds}x</div>
                <div className="stat-label">Total Odds</div>
              </div>
              <div className="stat-card card-static">
                <div className="stat-value">{fmt(selectedBet.stake)}</div>
                <div className="stat-label">Stake</div>
              </div>
              <div className="stat-card card-static">
                <div className="stat-value" style={{ color: '#FB923C' }}>
                  {fmt(selectedBet.potential_win)}
                </div>
                <div className="stat-label">Potential Win</div>
              </div>
            </div>

            <div className="modal-matches">
              <h3 className="section-title">
                ⚽ Matches ({selectedBet.matches?.length || 0})
              </h3>

              {selectedBet.matches?.length > 0 ? (
                selectedBet.matches.map((m, i) => (
                  <div key={i} className="match-card card-static">
                    <div className="match-header">
                      <span className="match-teams">
                        {m.home_team} <span className="vs">vs</span> {m.away_team}
                      </span>
                      <span className="match-odds badge badge-win">{m.odds}</span>
                    </div>
                    <div className="match-meta">
                      <span className="match-meta-item">
                        🏆 <strong>{m.league}</strong>
                      </span>
                      <span className="match-meta-item">
                        📊 {m.market_name}: <strong>{m.selection}</strong>
                      </span>
                      <span className="match-meta-item">
                        🕐 {m.match_time ? new Date(m.match_time).toLocaleString() : 'TBD'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-text">No matches found</p>
              )}
            </div>

            <button 
              onClick={(e) => handleDelete(selectedBet.id, e)}
              className="btn btn-danger"
              style={{ width: '100%', marginTop: '16px' }}
            >
              🗑️ Delete this bet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
