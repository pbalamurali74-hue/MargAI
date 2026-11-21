# Phone camera, models and measured sensors

The `smartphone` and `app` routes now use one mobile implementation. Tap **Start camera & sensors** on a secure origin. Camera startup is independent of ML loading: failed models do not disable GPS or camera. Nothing requests a microphone.

## Models

- Potholes: dedicated YOLOv8 ONNX checkpoint from `subhodeepmoitra/pothole-detection-yolov8`, revision `d5dc6345de76700191bddb6bf543a19e7e0ae53d`, publisher-declared MIT license. File SHA-256: `a8553eb1dd0113fa8d7c8985e21f3a50f8ee641e2fa2a4efc93b14c93932fc5b`. Output `[1,37,8400]`: first four box channels and one class channel; segmentation coefficients are not confidence scores. Input 640×640, letterboxed RGB CHW floats. Conservative 0.70 threshold, NMS, three distinct model frames before API sharing. Runs in a dedicated worker, not on the camera UI thread.
- People, animals, vehicles: Google's EfficientDet-Lite0 float16 COCO model, `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`, through MediaPipe 0.10.18. Score threshold 0.55. Bundled for same-origin model loading.
- Installed ONNX Runtime 1.20.1 and MediaPipe 0.10.18 runtime assets are copied from npm by `npm run prepare:vision`; no CDN scripts or mismatched runtime binaries are required for phone detection.
- Model sources: https://huggingface.co/subhodeepmoitra/pothole-detection-yolov8 ; https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector . The previous MargAI model artifacts remain intact but are not used by the new phone runtime.

## Measurements and permissions

GPS uses `watchPosition` with timestamps, accuracy, nullable speed/altitude/heading. Zero speed remains zero. Stale positions are labelled. Motion uses actual three-axis gravity and acceleration, measured rotation rates, and absolute compass/GPS heading. Relative alpha is not north. Sensors show active only after receiving non-null readings; denial, missing APIs and no-data timeouts are explicit. Stop closes camera tracks and GPS/motion listeners. Location and motion each have independent retry controls.

Observation sharing waits for a fresh location with accuracy of 50m or better and a measured heading. Location is explicitly the estimated phone position, not a geometrically verified hazard coordinate. Vehicle detections do not become pothole reports. Camera/sensor telemetry reaches a paired display through WebRTC or the local relay; no active connection is claimed before delivery/connection events.

## Google Maps

Set `VITE_GOOGLE_MAPS_API_KEY` in `apps/web/.env.local`, enable Maps JavaScript API and restrict the browser key to the actual website origins. Rebuild after changing it. The live map updates the phone position, accuracy circle and measured heading. Without a key, it explicitly uses OpenStreetMap and offers an Open in Google Maps link. There is no substitute default GPS position. Shared Maps loader includes timeout and authentication-error handling; the drive demo uses the same loader.

## Verification limits

Actual ONNX/MediaPipe inference ran in Chrome on repository photos: dedicated model detected potholes in three road images, EfficientDet detected a person, dog and car. Clear-road and non-road examples were also inspected. This is a functional smoke test, not a hold-out accuracy benchmark; the model can miss hazards or produce false positives.

Browser camera startup, model status, GPS/motion displays, stale data and Stop are tested with explicitly injected device fixtures and synthetic camera streams. These do not prove that a physical Android device grants permissions or exposes a particular sensor. HTTPS and Chrome site permissions remain required. The original hosted phone site is a separate old deployment; it must be updated to use this runtime. No physical-device pass or live Google Maps authorization is claimed without device access and a Maps key.
# Road showcase receiver

Open `?view=in-car` on the laptop. Scan that tab's pairing QR or enter its **Website display ID** in the phone's **Car display** field. Each tab has its own ID, preserved across refreshes; reconnect if the displayed ID changes because another tab already owns it. Keep the phone's camera page open and tap **Start camera & sensors**.

The showcase receives native video and JPEG fallback frames, acknowledges frame delivery to the phone, and displays the phone's measured GPS, speed, acceleration, gyroscope and compass with freshness and permission states. The right map pane follows actual phone coordinates. Configure `VITE_GOOGLE_MAPS_API_KEY` locally or as the Pages Actions secret to use Google Maps; without it the pane explicitly uses OpenStreetMap. No key is committed. See `docs/verification/road-showcase-live.json` for test evidence and hardware limits.
