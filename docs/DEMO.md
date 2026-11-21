# Presentation runbook

Servers: `npm run build:packages`, then `npm run dev`.

1. Open http://localhost:5173 for the redesigned overview.
2. Use **Live camera** for the latest upstream phone capture and **Road showcase** for the camera/3D in-car view. Choose **Drive demo**, then **Start drive**. The four vehicles run at 3× speed. The following driver receives a warning; the opposite carriageway and service road remain quiet. The warning clears after passing.
3. Open **Road reports** to review the report and record a demo notice. This is a local simulation; it does not contact a municipal authority.
4. **Start driving** opens the phone camera app. Camera/GPS need localhost or HTTPS. Allow permissions; pair the car screen using its displayed code.

`npm run verify` checks tests and production builds. `npm run test:integration` checks the running REST and WebSocket API.

The local backend uses memory storage and a template report when Gemini credentials are absent. Do not present these as connected cloud services. The latest upstream code is origin/main at d87c0fb; its independent WebRTC prototype remains in source.

## Android phone over local Wi-Fi

Run `npm run dev:phone` alongside the API. It prints a setup URL on port 8088 and an HTTPS app URL on port 8443, bound to the laptop's private Wi-Fi address. No public tunnel is used.

1. Connect phone and laptop to the same Wi-Fi. Open the printed setup URL on Android.
2. Download the local CA certificate and install through Android Settings → Security / Encryption & credentials → Install a certificate → CA certificate (labels vary by device). This trusts this local demo CA for seven days. Remove it from user credentials after presenting.
3. Refresh the laptop's Road showcase, select Pair Smartphone, scan the regenerated QR, then allow the phone camera. The pairing URL now uses the LAN HTTPS origin, and camera frames can travel through the local WebSocket relay without external signalling.
4. If the setup URL cannot open even on the same Wi-Fi, the Wi-Fi may isolate devices. Connect the laptop to the phone's hotspot, restart `npm run dev:phone`, and use its new address.

Keys and certificates stay in ignored `apps/web/certs/`; never commit or share private keys. Existing localhost links still work only on the laptop.

If the current Wi-Fi isolates devices and switching networks is unavailable, the pairing modal also offers **Hosted phone page**. This uses the repository's existing GitHub Pages camera app and its existing WebRTC protocol. It does not tunnel or publicly host the local API; it requires Internet access for the phone page and signalling. Choose this mode explicitly, scan its QR, then grant phone camera access. Actual video transport may still depend on the network's WebRTC policy.
