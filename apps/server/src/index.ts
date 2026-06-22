import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { createApp, createServices } from "./app.js";
import { attachSessionSocket } from "./session-socket.js";

const services = createServices();
const appConfig = services.getConfig();
const host = process.env.HOST || appConfig.serverBindHost;
const port = Number(process.env.PORT || appConfig.serverPort);
const app = createApp(services);
const sessionManager = services.sessionManager;

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/ws/session"
});

wss.on("connection", (socket) => {
  const ownerId = crypto.randomUUID();
  attachSessionSocket(socket, ownerId, sessionManager);
});

server.listen(port, host, () => {
  console.log(`Server listening at http://${host}:${port}`);
});

function shutdown() {
  sessionManager.stopAll();
  wss.close();
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
