import { useState, useEffect } from 'react';

const API_URL = window.location.origin;

function MyLiveBets() {
  const [liveBets, setLiveBets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLiveBets();
    const interval = setInterval(fetchLiveBets, 40000); // Update every 40s
    return () => clearInterval(interval);
  }, []);

  async function fetchLiveBets() {
    try {
      const res = await fetch(`${API_URL}/api/tracked-live-matches`);
      const data = await res.json();
      
      if (data.success) {
        setLiveBets(data.matches || []);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching live bets:', err);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>🎯 My Live Bets</h2>
        <p style={styles.empty}>Checking for live matches...</p>
      </div>
    );
  }

  if (liveBets.length === 0) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>🎯 My Live Bets</h2>
        <p style={styles.empty}>
          None of your tracked bets are currently live.<br />
          <small style={{ color: '#64748b' }}>We'll show them here when matches start!</small>
        </p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h2 style={styles.title}>🎯 My Live Bets</h2>
        <span style={styles.badge}>{liveBets.length} live</span>
      </div>

      <div style={styles.betsContainer}>
        {liveBets.map((bet, index) => (
          <div key={index} style={styles.betCard}>
            <div style={styles.betHeader}>
              <span style={styles.betCode}>Code: {bet.shareCode}</span>
              <span style={styles.liveIndicator}>🔴 LIVE</span>
            </div>

            <div style={styles.matchInfo}>
              <div style={styles.teams}>
                <span style={styles.team}>{bet.match.home}</span>
                <span style={styles.score}>
                  {bet.match.homeScore} - {bet.match.awayScore}
                </span>
                <span style={styles.team}>{bet.match.away}</span>
              </div>

              <div style={styles.betDetails}>
                <span style={styles.league}>🏆 {bet.match.league}</span>
                <span style={styles.status}>{bet.match.status}</span>
              </div>

              <div style={styles.selection}>
                <span style={styles.label}>Your bet:</span>
                <span style={styles.value}>
                  {bet.marketName}: {bet.selection}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: '#1e293b',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #334155',
    marginBottom: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#f1f5f9',
    margin: 0,
  },
  badge: {
    background: '#dc2626',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 12px',
    borderRadius: '20px',
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#64748b',
    fontSize: '14px',
  },
  betsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  betCard: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '16px',
  },
  betHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  betCode: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#94a3b8',
  },
  liveIndicator: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#ef4444',
  },
  matchInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  teams: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  team: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
  },
  score: {
    fontSize: '20px',
    fontWeight: '800',
    color: '#4ade80',
    background: '#0f172a',
    padding: '4px 16px',
    borderRadius: '8px',
    border: '1px solid #334155',
  },
  betDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  league: {
    fontSize: '12px',
    color: '#64748b',
  },
  status: {
    fontSize: '12px',
    color: '#4ade80',
    fontWeight: '700',
  },
  selection: {
    background: '#1e293b',
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #334155',
    marginTop: '4px',
  },
  label: {
    fontSize: '11px',
    color: '#64748b',
    marginRight: '8px',
  },
  value: {
    fontSize: '13px',
    color: '#f1f5f9',
    fontWeight: '600',
  },
};

export default MyLiveBets;