import 'dotenv/config';
import http from 'http';
import dotenv from 'dotenv';
import { createExpressApp } from './server';
import { realtimeRelay } from './relay';

dotenv.config();

const PORT = process.env.PORT || 8080;
const app = createExpressApp();
const server = http.createServer(app);

// Initialize WebSocket Relay Server
realtimeRelay.init(server);
setInterval(() => realtimeRelay.sweepExpired(), 5000);

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 MargAI Cloud Run & Realtime Relay Server Active!`);
  console.log(`🌐 HTTP Server: http://localhost:${PORT}`);
  console.log(`⚡ WebSocket Relay: ws://localhost:${PORT}/v1/relay`);
  console.log(`📄 OpenAPI Spec: http://localhost:${PORT}/openapi.json`);
  console.log(`🏆 Built for Google Startup Buildathon India 2026`);
  console.log(`=======================================================`);
});
