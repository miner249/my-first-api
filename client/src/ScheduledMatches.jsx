import { useState, useEffect } from 'react';

const API_URL = window.location.origin;

function ScheduledMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'upcoming', 'live', 'finished'

  useEffect(() => {
    fetchScheduledMatches();
    const interval = setInterval(fetchScheduledMatches, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  async function fetchScheduledMatches() {
    try {
      const res = await fetch(`${API_URL}/api/today-matches`);
      const data = await res.json();

      if (data.success) {
        setMatches(data.matches || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch matches');
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching scheduled matches:', err);
      setError('Network error');
      setLoading(false);
    }
  }

  const filteredMatches = matches.filter(match => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return match.status === 'Upcoming' || match.status === 'TIMED';
    if (filter === 'live') return match.status === 'Live' || match.status === 'IN_PLAY' || match.status === 'PAUSED';
    if (filter === 'finished') return match.status === 'Finished' || match.status === 'FINISHED';
    return true;
  });

  const formatTime = (dateString) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>📅 Today's Matches</h2>
        <p style={styles.empty}>Loading matches...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>📅 Today's Matches</h2>
        <p style={styles.empty}>
          ⚠️ {error}<br />
          <button onClick={fetchScheduledMatches} style={styles.retryBtn}>Retry</button>
        </p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h2 style={styles.title}>📅 Today's Matches</h2>
        <span style={styles.badge}>{filteredMatches.length} matches</span>
      </div>

      <div style={styles.filters}>
        <button 
          style={filter === 'all' ? {...styles.filterBtn, ...styles.filterBtnActive} : styles.filterBtn}
          onClick={() => setFilter('all')}
        >
          All ({matches.length})
        </button>
        <button 
          style={filter === 'upcoming' ? {...styles.filterBtn, ...styles.filterBtnActive} : styles.filterBtn}
          onClick={() => setFilter('upcoming')}
        >
          Upcoming ({matches.filter(m => m.status === 'Upcoming' || m.status === 'TIMED').length})
        </button>
        <button 
          style={filter === 'live' ? {...styles.filterBtn, ...styles.filterBtnActive} : styles.filterBtn}
          onClick={() => setFilter('live')}
        >
          🔴 Live ({matches.filter(m => m.status === 'Live' || m.status === 'IN_PLAY' || m.status === 'PAUSED').length})
        </button>
        <button 
          style={filter === 'finished' ? {...styles.filterBtn, ...styles.filterBtnActive} : styles.filterBtn}
          onClick={() => setFilter('finished')}
        >
          Finished ({matches.filter(m => m.status === 'Finished' || m.status === 'FINISHED').length})
        </button>
      </div>

      {filteredMatches.length === 0 ? (
        <p style={styles.empty}>No matches found for this filter</p>
      ) : (
        <div style={styles.matchesContainer}>
          {filteredMatches.map((match, index) => (
            <div key={index} style={styles.matchCard}>
              <div style={styles.matchHeader}>
                <span style={styles.league}>{match.league}</span>
                <span style={{
                  ...styles.statusBadge,
                  ...(match.status === 'Live' || match.status === 'IN_PLAY' ? styles.statusLive : {}),
                  ...(match.status === 'Upcoming' || match.status === 'TIMED' ? styles.statusUpcoming : {}),
                  ...(match.status === 'Finished' || match.status === 'FINISHED' ? styles.statusFinished : {}),
                }}>
                  {match.status}
                </span>
              </div>

              <div style={styles.teams}>
                <div style={styles.teamRow}>
                  <span style={styles.teamName}>{match.home}</span>
                  <span style={styles.score}>{match.homeScore ?? '-'}</span>
                </div>
                <div style={styles.teamRow}>
                  <span style={styles.teamName}>{match.away}</span>
                  <span style={styles.score}>{match.awayScore ?? '-'}</span>
                </div>
              </div>

              <div style={styles.matchTime}>
                🕐 {match.status === 'Upcoming' || match.status === 'TIMED' 
                  ? `Starts at ${formatTime(match.startTime)}` 
                  : match.status === 'Live' || match.status === 'IN_PLAY'
                  ? 'In Progress'
                  : 'Full Time'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: '#1e293b',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #334155',
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
    background: '#334155',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 12px',
    borderRadius: '20px',
  },
  filters: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '600',
    background: '#0f172a',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterBtnActive: {
    background: '#4ade80',
    color: '#0f172a',
    border: '1px solid #4ade80',
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#64748b',
    fontSize: '14px',
  },
  retryBtn: {
    marginTop: '10px',
    padding: '8px 16px',
    background: '#4ade80',
    color: '#0f172a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  matchesContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  matchCard: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '14px',
  },
  matchHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  league: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: '600',
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    borderRadius: '12px',
    textTransform: 'uppercase',
  },
  statusLive: {
    background: '#dc2626',
    color: '#fff',
  },
  statusUpcoming: {
    background: '#1e3a5f',
    color: '#38bdf8',
  },
  statusFinished: {
    background: '#334155',
    color: '#94a3b8',
  },
  teams: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '10px',
  },
  teamRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
  },
  score: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#4ade80',
    minWidth: '30px',
    textAlign: 'right',
  },
  matchTime: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '8px',
  },
};

export default ScheduledMatches;