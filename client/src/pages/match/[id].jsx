import { useEffect, useState } from 'react';
import MatchDetails from '../../components/MatchDetails';
import { fetchMatchDetails } from '../../lib/api';

function MatchPage({ matchId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [match, setMatch] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchMatchDetails(matchId);
        if (!mounted) return;
        if (data.success) {
          setMatch(data.match);
          setError('');
        } else {
          setError(data.error || 'Unable to fetch match details');
        }
      } catch {
        if (mounted) setError('Network error while loading match details');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [matchId]);

  if (loading) {
    return <section className="section"><div className="card-static"><p className="empty-text">Loading match details...</p></div></section>;
  }

  if (error) {
    return <section className="section"><div className="card-static"><p className="empty-text">{error}</p></div></section>;
  }

  return <MatchDetails match={match} />;
}

export default MatchPage;
