# Leave by

A traffic-aware arrival planner powered by TomTom. Enter a starting address,
destination, and desired arrival time to calculate when to leave.

## Run locally

Requires Node.js 22.13 or newer.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000/` and keep the terminal window running.

## Configuration

Copy `.env.example` to `.env` and set `TOMTOM_API_KEY`. The real `.env` file is
ignored by Git and must not be committed or exposed in browser code.

## Commands

- `npm run dev` starts the local site.
- `npm run build` verifies the production build.
- `npm run start` runs a completed production build locally.
- `npm run lint` checks the source code.
