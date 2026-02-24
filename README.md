# TrackIT Phase 1 Backend (Multi-Bookmaker)

TrackIT now includes a modular Phase 1 backend skeleton that ingests booking codes from multiple bookmakers, normalizes all selections, tracks live updates, and streams real-time events for frontend consumption.

## Supported bookmakers

- SportyBet
- Bet9ja
- 1xBet
- 22Bet
- Betway
- BetKing
- Football.com

## Normalized selection schema

```json
{
  "match_id": "...",
  "home_team": "...",
  "away_team": "...",
  "market_type": "...",
  "selection": "...",
  "odds": 1.82,
  "start_time": "2026-01-10T17:00:00.000Z",
  "source_platform": "SportyBet"
}
```

## Backend structure

```txt
parsers/          bookmaker-specific parsers + schema normalization
live_engine/      polling and real-time live update engine
notifications/    push notification subscription scaffolding
database/         persistence abstraction + PostgreSQL schema
lib/api.js        live schedule/live score API adapter + caching
server.js         Express entrypoint + event streaming
```

## API endpoints

- `POST /track-bet` -> body `{ bookingCode, platform }`
- `GET /bets` -> all normalized tracked bets
- `GET /live` -> current live snapshot
- `GET /schedule` -> schedule snapshot
- `POST /subscribe` -> body `{ betId, channel, target }`
- `GET /events` -> SSE stream for live updates (`live:update`, `bet:tracked`)
- `GET /health` -> service health + configured platforms

## Real-time channel

- Current skeleton uses SSE at `/events` for preview and frontend integration.
- The live engine is modular and can be connected to Socket.io by swapping the realtime adapter with your Socket.io emitter.

## Database

- Runtime store uses in-memory persistence for easy preview.
- Production PostgreSQL schema is provided in `database/postgres.schema.sql`.
- Event logs are modeled for historical analysis (`event_logs` table in schema).

## Preview before deployment

Yes — you can preview locally before deployment:

```bash
npm install
npm start
```

Then open:
- Backend health: `http://localhost:3000/health`
- Fetch live data: `http://localhost:3000/live`
- Realtime stream: `http://localhost:3000/events`

Your React frontend can immediately consume these endpoints while Phase 1 backend integration is in progress.
