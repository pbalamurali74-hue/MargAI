# Demo verification

- Upstream fetched: origin/main d87c0fb. Prior local premium-ui work retained while merging updated camera, detector and in-car code.
- Full production monorepo build passed; final camera/showcase frontend build passed.
- TypeScript checks passed. All 16 Vitest tests passed.
- Live API integration passed: health, hazards, cases, invalid observation rejection, watcher snapshot, phone/car pairing and delivery acknowledgement.
- Four-vehicle replay observed alerts on following car and none on opposite/service road.
- Rendered desktop overview inspected at 1440px; road showcase loaded without console errors. Drive journey exercised in browser: following car warned, opposite/service road not warned.
- Screenshot file export was denied by the Chrome tool's configured workspace roots. Inline screenshot inspection was available.
- Mobile rendered review, complete loading/error/partial-state coverage, physical camera capture accuracy and cross-device WebRTC are unverified. No complete ECC design-evidence pass is claimed.
- Backend is local memory/template mode without configured cloud credentials. Civic notice submission is a simulation.

## Phone pairing repair

- Root failure reported by user: Android cannot reach the laptop LAN URL. Laptop firewall disabled; LAN HTTP/HTTPS listeners active. Device isolation or a network mismatch remains a physical-network limitation.
- Added a Wi-Fi-only HTTPS gateway (`npm run dev:phone`) with a seven-day local CA and Android setup page; no public tunnel was started. Verified certificate chain, REST health and WebSocket upgrades through the LAN HTTPS endpoint.
- Pairing QR now uses configured LAN origin and is generated locally. Added explicit Local Wi-Fi / Hosted phone page choices; local remains the default.
- Added local relay camera-frame fallback, and verified frame payload delivery plus isolation between pairing rooms.
- Independently verified existing GitHub Pages phone camera → local in-car WebRTC: synthetic 320×180 test video received as an active MediaStream, readyState 4; receiver logged incoming media and data connections. No hardware camera was accessed for this check. Physical Android capture still needs the user to scan and grant camera permission.

## Published phone to website live view

- Published fork Pages successfully at `https://chandrakiran-05.github.io/MargAI/`; both models load on the published origin.
- Published phone runtime was exercised using a synthetic road-photo camera and injected GPS/motion data, paired over WebRTC to the local website. Receiver video reached readyState 4 at 480×480; real model boxes and telemetry (zero speed, GPS accuracy, 1 g) appeared on the website.
- Repaired the receiver's allocated-but-unplayable stream state: JPEG fallback frames can display while a MediaStream exists but has no playable frames. Added frame freshness, disconnected state, a persistent website display ID, shared telemetry ingestion, and live phone location map.
- Physical phone camera operation was confirmed by the user. Physical sensor readings and end-to-end phone transport still depend on permissions and network conditions; the automated stream/telemetry checks use explicit fixtures.
