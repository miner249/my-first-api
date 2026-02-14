function iconForAction(action) {
  if (action === 'Goal') return '⚽';
  if (action === 'Yellow card') return '🟨';
  if (action === 'Red card') return '🟥';
  if (action === 'Substitution') return '🔁';
  return '•';
}

function MatchDetails({ match }) {
  const history = Array.isArray(match?.history) ? match.history : [];

  if (!match) {
    return <p className="empty-text">Sorry, match details could not be loaded.</p>;
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">{match.home_team} vs {match.away_team}</h2>
        <span className="badge badge-live">{match.status_time || match.status || 'TBD'}</span>
      </div>

      <div className="card-static" style={{ marginBottom: '12px' }}>
        <p><strong>Score:</strong> {match.home_score ?? '-'} - {match.away_score ?? '-'}</p>
        <p><strong>League:</strong> {match.league || 'Unknown'}</p>
      </div>

      <div className="card-static">
        <h3 className="section-title" style={{ fontSize: '1rem' }}>Timeline</h3>
        {history.length === 0 && <p className="empty-text">No timeline data available.</p>}
        {history.map((item, index) => {
          if (item.kind === 'summary') {
            return (
              <div key={`${item.time}-${index}`} className="match-meta-item" style={{ marginBottom: '8px' }}>
                <strong>{item.time} — {item.score}</strong>
              </div>
            );
          }

          if (item.kind === 'event') {
            return (
              <div key={`${item.time}-${item.action}-${index}`} className="match-meta-item" style={{ marginBottom: '8px', display: 'block' }}>
                <div>{item.time}' {iconForAction(item.action)} {item.player ? `${item.player} (${item.side === 'home' ? 'Home' : 'Away'})` : item.action}</div>
                {item.score && <div>Score: {item.score}</div>}
              </div>
            );
          }

          return null;
        })}
      </div>
    </section>
  );
}

export default MatchDetails;
