import { io } from "socket.io-client";

const base = process.argv[2] || "http://127.0.0.1:4000";

async function post(path, body, token) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), 5000);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

const suffix = Math.floor(Math.random() * 90000) + 10000;
const avatarImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const a = await post("/auth/register", { username: `wsa${suffix}`, displayName: "WS A", password: "secret123", avatarImage });
const b = await post("/auth/register", { username: `wsb${suffix}`, displayName: "WS B", password: "secret123", avatarImage });

const s1 = io(base, { auth: { token: a.token }, transports: ["websocket"] });
const s2 = io(base, { auth: { token: b.token }, transports: ["websocket"] });

await Promise.all([once(s1, "connect"), once(s2, "connect")]);
const incoming = once(s2, "chat:message");
s1.emit("chat:send", { toUserId: b.user.id, content: "hello websocket" });
const message = await incoming;

s1.disconnect();
s2.disconnect();

console.log(JSON.stringify({ websocket: true, messageId: message.id, content: message.content }));
