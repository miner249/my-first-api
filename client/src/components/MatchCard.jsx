import { getMatchStatusLabel } from '../lib/api';

function MatchCard({ match, onClick }) {
  const statusLabel = getMatchStatusLabel(match);
  const isLive = match?.status === 'Live';

  return (
    <button className={`schedule-match-card card ${isLive ? 'match-live' : ''}`} onClick={onClick} aria-label={`Open details for ${match.home_team} vs ${match.away_team}`}>
      <div className="schedule-match-header">
        <span className="schedule-league">{match.league || 'Unknown League'}</span>
        <span className={`badge ${isLive ? 'badge-live' : 'badge-pending'}`}>{statusLabel}</span>
      </div>

      <div className="schedule-teams">
        <div className="schedule-team-row">
          <span className="schedule-team-name">{match.home_team || 'Unknown'}</span>
          <span className="schedule-score text-win">{match.home_score ?? '-'}</span>
        </div>
        <div className="schedule-team-row">
          <span className="schedule-team-name">{match.away_team || 'Unknown'}</span>
          <span className="schedule-score text-win">{match.away_score ?? '-'}</span>
        </div>
      </div>
    </button>
  );
}

export default MatchCard;
