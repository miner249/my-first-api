import '../styles/Navbar.css';

const tabs = [
  {
    id: 'home',
    label: 'My Bets',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 10.5L12 3l9 7.5" fill="none" />
        <path d="M5 9.5V21h14V9.5" fill="none" />
      </svg>
    ),
  },
  {
    id: 'my-live-bets',
    label: 'Live Bets',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8" fill="none" />
        <circle cx="12" cy="12" r="3" fill="none" />
      </svg>
    ),
  },
  {
    id: 'scheduled',
    label: 'Today Matches',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="5" width="16" height="15" rx="2" fill="none" />
        <path d="M8 3v4M16 3v4M4 10h16" fill="none" />
      </svg>
    ),
  },
];

function Navbar({ currentPage, onNavigate, liveCount }) {
  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        <div className="navbar-logo" aria-label="Track It logo">TRACK <span>IT</span></div>

        <div className="navbar-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-tab ${currentPage === tab.id ? 'nav-tab-active' : ''}`}
              onClick={() => onNavigate(tab.id)}
              aria-label={tab.label}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {liveCount > 0 && <span className="live-pill" aria-label={`${liveCount} live bets`}>LIVE {liveCount}</span>}
      </div>
    </nav>
  );
}

export default Navbar;
