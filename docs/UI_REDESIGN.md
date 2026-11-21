# MargAI UI redesign

Date: **20 November 2026**.

This redesign updates the existing MargAI web application while preserving its backend, contracts, driver workflows, and application navigation. It presents MargAI as an independent road-safety and civic-intelligence project built for Startup Buildathon India 2026.

## Design direction

- Graphite foundation `#0a0d0d`, elevated panels `#121817`, and subtle borders `#26312d`.
- Chartreuse signal accent `#d7ff69`, off-white primary text `#f2f5ef`, and muted secondary text `#94a49c`.
- Editorial typography, deliberate spacing, a coherent road-inspired identity, and restrained icon use.
- Responsive navigation, keyboard focus states, a skip link, reduced-motion handling, and explicit loading/error states.
- Recognizable product demonstrations with their live, replay, simulated, or planned status visible.

## Eight application views

| View | Route query | Redesign summary |
| --- | --- | --- |
| Overview | `/` or `?view=public` | Product-led landing page, horizontal animated concept demonstration, road-hazard story, feature explanations, voice sample, and working application entry points |
| Drive studio | `?view=command-center` | Clearer observation, relay, warning, and civic workflow workspace; preserved camera/source selection, phone pairing, alert, and report interactions |
| Phone camera | `?view=smartphone` | Mobile-focused camera connection and capture experience with readable controls and explicit service state |
| In-car display | `?view=in-car` | Focused cockpit presentation with road context and glanceable warning information; the browser experience does not itself establish Android Auto or CarPlay integration |
| Scenario lab | `?view=driver` | Scenario replay and driver-warning exploration with existing localization and risk interactions preserved |
| Civic intelligence | `?view=civic` | Searchable/filterable case registry, evidence detail, report preparation/export, review notices, and clearly labelled prototype dispatch |
| Google Cloud | `?view=google-stack` | Google architecture inspector, backend-reported capability states, sample-gated latency values, repository model-report context, and official ecosystem resources |
| Our story | `?view=deck` | Eight-slide editorial pitch with chapter navigation, keyboard controls, wide view, and links back to the command center |

The application stores the selected language locally where browser storage is available. View changes update query parameters and support browser back/forward navigation. Existing phone/cockpit query aliases remain recognized by the application.

## Run locally

From the repository root:

```bash
npm ci
npm run build
npm test
npm run dev
```

These are the repository's installation, build, test, and development commands, not a declaration that every command has passed. Full verification results should be recorded by the integration owner after running them against the final source state. A targeted web TypeScript check passed during the Stack/Pitch component handoff; other checks were still underway when this document was authored.

The development script starts the API and Vite web application. Defaults in the current source:

- Frontend: `http://localhost:5173`
- HTTP API and relay: `http://localhost:8080`
- Optional vision service proxy target: `http://localhost:8000`

Use the server's printed URL if a port is overridden or Vite selects another available port. The vision service has its own Python/model setup; see [road-safety-ai/README.md](../road-safety-ai/README.md). Installing the JavaScript workspace does not automatically install vision dependencies or model assets.

Useful direct local views:

```text
http://localhost:5173/?view=command-center
http://localhost:5173/?view=smartphone
http://localhost:5173/?view=in-car
http://localhost:5173/?view=driver
http://localhost:5173/?view=civic
http://localhost:5173/?view=google-stack
http://localhost:5173/?view=deck
```

## Backend and deployment configuration

The application architecture remains a Google Cloud-oriented backend with its existing HTTP/WebSocket interfaces, storage abstraction, assistance service, and optional vision service. The UI redesign does not migrate these services to the static frontend host.

The frontend supports these optional Vite build-time configuration values:

```dotenv
# apps/web/.env.local — use the actual reachable origins for your environment
VITE_API_ORIGIN=https://your-api-service.example
VITE_VISION_API_ORIGIN=https://your-vision-service.example
```

- Leave both empty for the existing same-origin contract and local Vite proxy setup.
- `VITE_API_ORIGIN` identifies the API/relay service origin; `VITE_VISION_API_ORIGIN` identifies the separate vision-service origin.
- Use origins without endpoint paths. The client appends API paths and derives `ws:`/`wss:` from the configured URL.
- These values are public frontend configuration, not secret storage. Never put private model keys or service-account credentials in `VITE_` variables.
- Rebuild the frontend after changing Vite environment values.
- For a separately hosted frontend, configure the real backend's CORS, authentication, WebSocket, and network access as required.

A **static Site preview requires a real backend to be configured** for connection-dependent features. It does not inherit Vite's development proxy, deploy the Node API, start the Python vision server, or provision Google services. Without reachable services, informational pages and relevant local demonstrations can render, while API-dependent actions must show unavailable state instead of pretending to succeed.

Cloud key configuration is not evidence of a successful provider call. A local storage mode is not a Firestore deployment. A browser cockpit is not an approved in-car application. Existing simulated submission endpoints remain prototype behavior and must not be represented as contacting a government portal.

## Verification and review checklist

The integration owner should record results for:

- Workspace build and meaningful existing tests.
- All eight views at desktop and mobile widths.
- Navigation, query deep links, back/forward history, keyboard controls, and reduced motion.
- Backend-up and backend-unavailable states.
- Camera permission/error behavior and resource cleanup.
- Relay/scenario interactions, case refresh, draft generation, report download, and prototype dispatch labelling.
- Correct origin configuration for HTTP and WebSocket connections.
- Source and media provenance, accurate performance labels, and absence of invented endorsements.

## Research and source links

See [buildathon and Google resource research](research/buildathon-google-resources.md) for access notes, evidence distinctions, and partner-source limitations.

- [Startup Buildathon India 2026](https://startupbuildathon.com/)
- [Google for Startups Cloud Program](https://cloud.google.com/startup)
- [Google DeepMind](https://deepmind.google/)
- [Headstart](https://www.headstart.in/)
- [Hack2skill](https://hack2skill.com/)
- [nasscom](https://nasscom.in/)
- [Cloud Run](https://cloud.google.com/run)
- [Cloud Run WebSocket guidance](https://docs.cloud.google.com/run/docs/triggering/websockets)
- [Firestore](https://firebase.google.com/products/firestore)
- [Google Maps Platform](https://developers.google.com/maps)
- [Gemini Live](https://aistudio.google.com/docs/live-api)
- [LiteRT](https://developers.google.com/edge/litert)
- [Android for Cars navigation](https://developer.android.com/training/cars/apps/navigation)
- [Google brand guidance](https://about.google/brand-resource-center/guidance/)

Technology references identify the stack and implementation paths. They do not imply that Google or the event organizations endorse MargAI.
