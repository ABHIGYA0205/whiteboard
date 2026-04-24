# Whiteboard

A collaborative whiteboard built with Next.js 14, TypeScript, Express, Socket.io, Zustand, and MongoDB.

## Features

- Infinite HTML5 canvas with pan and zoom
- Drawing tools: pencil, rectangle, circle, and line
- Unified element-based data model
- Selection, dragging, and resizing
- Undo and redo
- Real-time collaboration with live cursors
- Board persistence with MongoDB
- Auto-save on the frontend
- Heuristic "Auto-clean" shape detection for rough strokes

## Project Structure

```text
.
├── client/          # Next.js 14 frontend
├── server/          # Express + Socket.io backend
├── shared/          # Shared TypeScript types
├── package.json     # Workspace root
└── README.md
```

## Requirements

- Node.js 18+ recommended
- npm 9+ recommended
- MongoDB running locally or a MongoDB connection string

## Environment Variables

Create a `.env` file inside `server/`:

```env
PORT=4001
MONGO_URI=mongodb://127.0.0.1:27017/whiteboard
CLIENT_ORIGIN=http://localhost:3000,http://localhost:3001
```

`CLIENT_ORIGIN` supports a comma-separated list, which is handy if Next.js starts on a different local port.

You can optionally create a `.env.local` inside `client/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4001
NEXT_PUBLIC_SOCKET_URL=http://localhost:4001
```

The client already defaults to `http://localhost:4001`, so the frontend env file is optional for local development.

## Install Dependencies

From the project root:

```bash
npm install
```

## Run the Project

### Option 1: Run client and server together

From the project root:

```bash
npm run dev
```

This starts:

- Next.js client on `http://localhost:3000`
- Express + Socket.io server on `http://localhost:4001`

If port `3000` is busy, Next.js may start on `http://localhost:3001`. The default server config now allows both `3000` and `3001`.

### Option 2: Run each app separately

Client:

```bash
npm run dev:client
```

The client dev script clears `client/.next` before starting, which helps avoid stale Next.js dev-cache errors around missing `vendor-chunks` files.

Server:

```bash
npm run dev:server
```

If you want file watching specifically for the backend, use:

```bash
npm run dev:watch --workspace server
```

## Build for Production

From the project root:

```bash
npm run build
```

You can also build each workspace separately:

```bash
npm run build --workspace client
npm run build --workspace server
```

## How to Use

1. Start MongoDB.
2. Start the server and client.
3. Open `http://localhost:3000`.
4. Click `Create new board`.
5. Draw on the canvas with the toolbar tools.
6. Open the same board URL in another tab or browser to test collaboration.

## Collaboration Events

The frontend and backend sync these live events:

- `draw`
- `update-element`
- `cursor-position`
- `clear-board`
- `replace-elements`

Each board uses a Socket.io room keyed by `boardId`.

## API Endpoints

### `POST /board`

Creates a new board.

### `GET /board/:id`

Loads an existing board. If the board does not exist yet, the server creates it.

### `PUT /board/:id`

Updates the board's `elements` array.

### `POST /board/clean`

Accepts raw element data and returns cleaned geometric shapes when the heuristic matcher recognizes them.

## Notes

- Pan the canvas with `Shift + drag`, middle mouse button, or right mouse button.
- Zoom with the mouse wheel.
- The current auto-clean implementation is heuristic-based and designed so an LLM-assisted cleanup service can be added later.
- Boards are auto-saved every few seconds from the frontend.

## Troubleshooting

### MongoDB connection error

Make sure MongoDB is running and that `MONGO_URI` in `server/.env` is correct.

### Frontend cannot reach backend

Check that:

- the server is running on port `4001`
- `CLIENT_ORIGIN` matches the frontend URL
- `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` point to the backend

### Port already in use

Change `PORT` in `server/.env` and update the frontend env values if needed.
