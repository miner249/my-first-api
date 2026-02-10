import { useState, useEffect } from 'react';

const API_URL = window.location.origin;

function LiveMatchTracker({ bets }) {
  const [liveMatches, setLiveMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('unknown');

  // Fetch live matches every 40 seconds
  useEffect(() => {
    async function fetchLiveMatches() {
      try {
        const response = await fetch(`${API_URL}/api/live-matches`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || 'Failed to fetch matches');
          setLoading(false);
          return;
        }

        setLiveMatches(data.matches || []);
        setSource(data.source || 'unknown');
        setError(null);
        setLoading(false);

      } catch (err) {
        console.error('❌ Error fetching live matches:', err);
        setError('Network error');
        setLoading(false);
      }
    }

    fetchLiveMatches();
    const interval = setInterval(fetchLiveMatches, 40000); // Update every 40s
    return () => clearInterval(interval);
  }, []);

  // Match user's bets to live matches
  const matchedBets = bets.filter(bet => {
    if (!bet.matches || bet.matches.length === 0) return false;

    return bet.matches.some(match => {
      const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const betHome = normalize(match.home_team);
      const betAway = normalize(match.away_team);

      return liveMatches.some(live => {
        const liveHome = normalize(live.home);
        const liveAway = normalize(live.away);

        return (
          (liveHome === betHome && liveAway === betAway) ||
          (liveHome.includes(betHome) && liveAway.includes(betAway)) ||
          (betHome.includes(liveHome) && betAway.includes(liveAway))
        );
      });
    });
  });

  if (loading) {
    return (
      <div style={styles.liveCard}>
        <div style={styles.liveHeader}>
          <span>🔴 Live Matches</span>
          <span style={styles.loadingDot}>●</span>
        </div>
        <p style={styles.liveEmpty}>Loading live matches...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.liveCard}>
        <div style={styles.liveHeader}>
          <span>🔴 Live Matches</span>
          <span style={styles.errorBadge}>Error</span>
        </div>
        <p style={styles.liveEmpty}>
          ⚠️ Could not fetch live matches<br />
          <small style={{ color: '#64748b', fontSize: '12px' }}>
            {error}
          </small>
        </p>
      </div>
    );
  }

  // Source badge color
  const sourceColor = source === 'football-data' ? '#4ade80' : source === 'flashscore' ? '#fb923c' : '#64748b';

  return (
    <div style={styles.liveCard}>
      <div style={styles.liveHeader}>
        <span>🔴 Live Matches</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ ...styles.sourceBadge, background: sourceColor }}>
            {source === 'football-data' ? 'Fast' : source === 'flashscore' ? 'Flash' : 'Live'}
          </span>
          <span style={styles.liveBadge}>{liveMatches.length}</span>
        </div>
      </div>

      {liveMatches.length === 0 ? (
        <p style={styles.liveEmpty}>No live matches right now</p>
      ) : (
        <>
          {matchedBets.length > 0 && (
            <div style={styles.matchedAlert}>
              🎯 You have {matchedBets.length} bet(s) with live matches!
            </div>
          )}

          <div style={styles.liveMatches}>
            {liveMatches.slice(0, 10).map((match) => (
              <div key={match.eventId} style={styles.liveMatch}>
                <div style={styles.liveMatchHeader}>
                  <span style={styles.liveLeague}>{match.league}</span>
                  <span style={styles.liveStatus}>{match.status}</span>
                </div>
                <div style={styles.liveScore}>
                  <span style={styles.liveTeam}>{match.home}</span>
                  <span style={styles.liveScoreNum}>
                    {match.homeScore ?? '-'} - {match.awayScore ?? '-'}
                  </span>
                  <span style={styles.liveTeam}>{match.away}</span>
                </div>
              </div>
            ))}
          </div>

          {liveMatches.length > 10 && (
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', marginTop: '12px' }}>
              +{liveMatches.length - 10} more matches
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────
const styles = {
  liveCard: {
    background: '#1e293b',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #334155',
    marginBottom: '20px',
  },
  liveHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    fontSize: '16px',
    fontWeight: '700',
    color: '#f1f5f9',
  },
  liveBadge: {
    background: '#dc2626',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '20px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sourceBadge: {
    color: '#0f172a',
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    borderRadius: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  errorBadge: {
    background: '#7f1d1d',
    color: '#fca5a5',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '20px',
  },
  loadingDot: {
    color: '#38bdf8',
    fontSize: '20px',
  },
  liveEmpty: {
    textAlign: 'center',
    padding: '20px',
    color: '#64748b',
    fontSize: '14px',
  },
  matchedAlert: {
    background: '#166534',
    color: '#bbf7d0',
    border: '1px solid #15803d',
    borderRadius: '10px',
    padding: '12px 16px',
    marginBottom: '16px',
    fontSize: '14px',
    fontWeight: '600',
    textAlign: 'center',
  },
  liveMatches: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  liveMatch: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '12px',
  },
  liveMatchHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  liveLeague: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: '600',
  },
  liveStatus: {
    fontSize: '11px',
    color: '#4ade80',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  liveScore: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  liveTeam: {
    fontSize: '14px',
    color: '#f1f5f9',
    fontWeight: '600',
    flex: 1,
  },
  liveScoreNum: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#4ade80',
    padding: '4px 12px',
    background: '#0f172a',
    borderRadius: '8px',
    border: '1px solid #334155',
  },
};

export default LiveMatchTracker;