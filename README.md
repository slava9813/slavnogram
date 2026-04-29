# Slavnogram

Slavnogram is a local social network that runs on your PC and can be opened by other people through your public IP address or a tunnel.

## Structure

```text
slavnogram/
  apps/api/      NestJS API, Socket.IO, SQLite, uploads
  apps/web/      Next.js React UI
  data/          Local SQLite database file
  scripts/       Dev/start launchers that read .env
```

## Environment

The ready-to-run `.env` file is already in the project root:

```env
HOST=0.0.0.0
PORT=4000
WEB_PORT=3000
PUBLIC_URL=http://localhost:4000
JWT_SECRET=replace_this_with_a_long_random_secret
DB_PATH=./data/slavnogram.sqlite
```

For external access, replace `PUBLIC_URL` with your public API URL:

```env
PUBLIC_URL=http://YOUR_PUBLIC_IP:4000
```

For ngrok or Cloudflare Tunnel, use the HTTPS tunnel URL as `PUBLIC_URL`.

## Run

```powershell
npm install
npm run dev
```

Development mode starts:

- API and WebSocket: `http://localhost:4000`
- Web UI: `http://localhost:3000`
- API listens on `0.0.0.0:4000`
- Web UI listens on `0.0.0.0:3000`

For a single public port after development:

```powershell
npm run build
npm run start
```

Then open:

```text
http://YOUR_IP:4000
```

In this mode NestJS serves the built Next.js UI, the API, and WebSocket from the same port.

## Public IP Access

1. Find your local IPv4 address:

```powershell
ipconfig
```

Look for `IPv4 Address`, for example `192.168.1.23`.

2. Find your public IP:

```powershell
nslookup myip.opendns.com resolver1.opendns.com
```

Or open `https://ifconfig.me` in a browser.

3. Open Windows Firewall for the API port:

```powershell
New-NetFirewallRule -DisplayName "Slavnogram API 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow
```

For development UI access, also open port 3000:

```powershell
New-NetFirewallRule -DisplayName "Slavnogram Web 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

4. Configure your router:

- Open router admin page, usually `192.168.0.1` or `192.168.1.1`.
- Find Port Forwarding / NAT.
- Forward external TCP `4000` to your PC local IP, TCP `4000`.
- In dev mode, also forward TCP `3000` to your PC local IP, TCP `3000`.

5. Set `.env`:

```env
PUBLIC_URL=http://YOUR_PUBLIC_IP:4000
```

6. Run:

```powershell
npm run dev
```

Friends open:

- Dev UI: `http://YOUR_PUBLIC_IP:3000`
- API: `http://YOUR_PUBLIC_IP:4000`

For single-port mode:

```powershell
npm run build
npm run start
```

Friends open:

```text
http://YOUR_PUBLIC_IP:4000
```

## Ngrok Tunnel

Single-port production mode is easiest:

```powershell
npm run build
npm run start
ngrok http 4000
```

Copy the HTTPS forwarding URL from ngrok, for example:

```text
https://abc-123.ngrok-free.app
```

Set `.env`:

```env
PUBLIC_URL=https://abc-123.ngrok-free.app
```

Restart:

```powershell
npm run start
```

Friends open the same ngrok URL.

Development mode needs two tunnels:

```powershell
ngrok http 3000
ngrok http 4000
```

Set `PUBLIC_URL` to the API tunnel on port 4000, and send friends the UI tunnel on port 3000.

Official ngrok HTTP endpoint docs: https://ngrok.com/docs/universal-gateway/http

## Cloudflare Tunnel

Install `cloudflared`, log in, then run a temporary tunnel:

```powershell
cloudflared tunnel --url http://localhost:4000
```

Use single-port production mode:

```powershell
npm run build
npm run start
cloudflared tunnel --url http://localhost:4000
```

Cloudflare prints an HTTPS URL. Set:

```env
PUBLIC_URL=https://YOUR-TUNNEL.trycloudflare.com
```

Restart `npm run start`, then send that HTTPS URL to friends.

Official Cloudflare Quick Tunnel docs: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/

## API

- Public without login: `GET /posts`, `GET /users`, `GET /communities`
- Requires login: posting, likes, comments, saved posts, friends, chat, group chat, call rooms, settings, account deletion, community subscribe
- Avatar is drawn in the registration canvas editor and saved as a locked PNG data URL. It can be created only once during registration.
- Automatic moderation blocks forbidden content before posts and comments are saved.

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /users`
- `GET /users/me`
- `PATCH /users/me/profile`
- `PATCH /users/me/settings`
- `PATCH /users/me/avatar` returns an error after registration because avatars are locked
- `DELETE /users/me` with `{ "confirm": "УДАЛИТЬ" }`
- `GET /posts`
- `GET /posts/saved`
- `POST /posts`
- `POST /posts/:id/like`
- `POST /posts/:id/save`
- `POST /posts/:id/comments`
- `GET /friends`
- `POST /friends/:id`
- `DELETE /friends/:id`
- `GET /chat/:userId/history`
- `POST /chat/:userId/messages`
- `GET /chat/groups/list`
- `POST /chat/groups`
- `GET /chat/groups/:groupId/history`
- `POST /chat/groups/:groupId/messages`
- `GET /communities`
- `POST /communities`
- `POST /communities/:id/subscribe`
- `POST /communities/:id/posts`

## WebSocket

Socket.IO connects to `PUBLIC_URL`.

Events:

- Client sends `chat:send` with `{ toUserId, content }`
- Server emits `chat:message`
- Client sends `chat:group-send` with `{ groupId, content }`
- Server emits `chat:group-message`
- Server emits `chat:group-updated`
- Client sends `call:join` with `{ roomId, label }`
- Client sends `call:leave` with `{ roomId }`
- Server emits `call:user-joined` and `call:user-left`
- Client/server can relay `call:signal` for WebRTC peers
- Server emits `presence:update` with online user ids

The token is sent in the Socket.IO auth payload.
