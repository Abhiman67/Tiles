# Tiles

This is a simple real-time shared grid app made for the assignment.

## About the project

The app shows a board with many small blocks. Any user can open the site, click a block, and claim it. If another person opens the same app, they can see the changes right away.

## What it uses

- Frontend: HTML, CSS, and JavaScript
- Backend: Node.js and Express
- Real-time updates: WebSockets

## How it works

1. The browser connects to the server.
2. The server keeps track of which block belongs to which user.
3. When a user clicks a block, the server updates the ownership.
4. The update is sent to all connected users instantly.

## Features

- Shared grid with 400 blocks
- Users can claim blocks
- Everyone sees updates in real time
- Simple live status and user info
- Auto reconnect if the connection drops

## How to run

```bash
npm install
npm start
```

After that, open `http://localhost:3000` in the browser.

## CONTEXT f u stalker

This assignment was about building a shared grid where multiple users can interact at the same time. I used a Node.js backend with WebSockets so the board updates instantly for everyone.
