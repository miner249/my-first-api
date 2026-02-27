import { useState, useEffect } from 'react';
import MatchCard from './MatchCard';
import { fetchLiveMatches, fetchTodayMatches } from '../lib/api';
import '../styles/ScheduledMatches.css';

function groupByLeague(matches) {
  return matches.reduce((groups, match) => {
    const league = match.league || 'Unknown League';
    if (!groups[league]) groups[league] = [];
    groups[league].push(match);
    return groups;
  }, {});
}

function ScheduledMatches({ onOpenMatch }) {
  const [allMatches, setAllMatches]   = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [filter, setFilter]           = useState('all');

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (filter === 'live') fetchLiveOnly();
    }, 45000);
    return () => clearInterval(interval);
  }, [filter]);

  async function loadData() {
    try {
      setLoading(true);
      const [todayData, liveData] = await Promise.all([fetchTodayMatches(), fetchLiveMatches()]);

      if (todayData.success) setAllMatches(todayData.matches || []);

      if (liveData.success) {
        setLiveMatches(
          (liveData.matches || []).filter(
            (m) => m?.status === 'IN_PLAY' || m?.status === 'PAUSED' || m?.status === 'Live'
          )
        );
      }

      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch matches');
    } finally {
      setLoading(false);
    }
  }

  async function fetchLiveOnly() {
    try {
      const liveData = await fetchLiveMatches();
      if (liveData.success) {
        setLiveMatches(
          (liveData.matches || []).filter(
            (m) => m?.status === 'IN_PLAY' || m?.status === 'PAUSED' || m?.status === 'Live'
          )
        );
      }
    } catch (err) {
      console.error(err);
    }
  }

  const filteredMatches =
    filter === 'all'      ? allMatches :
    filter === 'live'     ? liveMatches :
    filter === 'finished' ? allMatches.filter(m => m.status === 'FINISHED') :
    [];

  const groupedMatches = groupByLeague(filteredMatches);
  const leagueNames    = Object.keys(groupedMatches).sort();

  if (loading) {
    return (
      <section className="section">
        <div className="card-static">
          <h2 className="section-title">📅 Today Matches</h2>
          <p className="empty-text">Loading matches...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section">
        <div className="card-static">
          <h2 className="section-title">📅 Today Matches</h2>
          <p className="empty-text">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">📅 Today Matches</h2>
        <span className="badge badge-pending">{filteredMatches.length} matches</span>
      </div>

      <div className="filters-container">
        <button
          className={`filter-btn ${filter === 'all' ? 'filter-btn-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`filter-btn ${filter === 'live' ? 'filter-btn-active' : ''}`}
          onClick={() => setFilter('live')}
        >
          🔴 Live
        </button>
        <button
          className={`filter-btn ${filter === 'finished' ? 'filter-btn-active' : ''}`}
          onClick={() => setFilter('finished')}
        >
          Finished
        </button>
      </div>

      {filteredMatches.length === 0 ? (
        <div className="empty-state card-static">
          <div className="empty-icon">⚽</div>
          <p className="empty-text">
            {filter === 'live'     ? 'No live matches right now' :
             filter === 'finished' ? 'No finished matches yet today' :
             'No matches found'}
          </p>
        </div>
      ) : (
        <div className="matches-container">
          {leagueNames.map((league) => (
            <div key={league} className="league-group">
              <div className="league-header">
                <span className="league-name">🏆 {league}</span>
                <span className="league-count">{groupedMatches[league].length}</span>
              </div>
              {groupedMatches[league].map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onClick={() => onOpenMatch(match.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default ScheduledMatches;