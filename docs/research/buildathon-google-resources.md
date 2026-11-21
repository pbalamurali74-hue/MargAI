# Buildathon and Google technology research

Access date: **20 November 2026**. Research scope: the requested Startup Buildathon website, official event/partner websites, and primary Google product documentation. These notes support the MargAI interface and its resource links; they do not establish deployment, program admission, or endorsement.

## Official event findings

Source: [Startup Buildathon India 2026](https://startupbuildathon.com/).

- The event centers on building an AI product with Google AI and deploying on Google Cloud.
- The website lists city buildathons on **20–21 November 2026** across ten cities; regional showcases on **23, 25, and 27 November**; and a finale at Google, Bengaluru, on **2 December**.
- Evaluation areas include founder profile, product potential, market viability, technical architecture, and use of Google AI/Cloud.
- The page identifies Google DeepMind and Google Cloud, alongside Hack2skill, nasscom, and Headstart in the event ecosystem.
- It describes cash and Google AI/Cloud credits for the top ten teams. This is an event offering, not an award or credit balance received by MargAI.
- The page contains inconsistent application-deadline text. The redesigned product does not reproduce a registration deadline or suggest registration is open.

UI application: use a factual event-context link and explain the actual product architecture. Do not reproduce the event's marketing claims as MargAI achievements.

## Official partner and startup resources

| Source | Verified relevance | Scope of use |
| --- | --- | --- |
| [Google for Startups Cloud Program](https://cloud.google.com/startup) | Startup cloud support, technical resources, and eligibility-dependent benefits | Resource link; no claim that MargAI has been admitted or awarded credits |
| [Google DeepMind](https://deepmind.google/) | Gemini and other model/research resources | Technology/research reference, not project sponsorship |
| [Headstart](https://www.headstart.in/) | Founder community, pitch initiatives, mentoring, and learning content | Community resource; no membership or partnership claim |
| [Hack2skill](https://hack2skill.com/) | Innovation events and builder ecosystem | Event/resource reference |
| [Hack2skill event page](https://hack2skill.com/event/startupbuildathon2026) | Official event destination | The research tool received a limited iframe-only extraction; substantive event facts above come from startupbuildathon.com |
| [nasscom](https://nasscom.in/) | Listed in the official buildathon ecosystem | The homepage returned **HTTP 406** to the research tool, including the www variant. Current program terms were not verified; do not invent them |

These organizations appear in a resource section, not a MargAI customer, sponsor, or endorsement strip.

## Google products relevant to the current repository

| Product | Relevant responsibility | Implementation/status distinction |
| --- | --- | --- |
| [Cloud Run](https://cloud.google.com/run) | Deployable HTTP API and WebSocket relay | Backend source and deployment configuration are distinct from a live deployment. The inspector labels local runtime versus a backend-reported cloud runtime |
| [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets) | Persistent relay connections | Official guidance covers reconnects, request timeouts, and coordination across instances. A socket connection does not guarantee fixed end-to-end latency |
| [Firestore](https://firebase.google.com/products/firestore) | Shared hazard and civic case storage | A local storage implementation is not durable cloud persistence. A backend-reported live flag is displayed as reported state |
| [Firestore realtime documentation](https://firebase.google.com/docs/firestore/query-data/listen) | Realtime state updates | Useful implementation documentation; actual integration must be demonstrated |
| [Google Maps Platform](https://developers.google.com/maps) | Mapping, routing, and location context | A configured key does not prove a successful API request, road-match correctness, or navigation coverage |
| [Gemini developer documentation](https://ai.google.dev/) | Structured assistance and civic draft generation | A configured key does not prove a model call succeeded. Generated reports remain drafts requiring review |
| [Gemini Live](https://aistudio.google.com/docs/live-api) | Candidate conversational voice interface | Separate from cached/local urgent warnings; verify current models, languages, access, and authentication before claiming live support |
| [LiteRT](https://developers.google.com/edge/litert) | Candidate mobile inference runtime | Repository ONNX/TorchScript exports do not establish a working LiteRT deployment on a phone |
| [Android for Cars navigation](https://developer.android.com/training/cars/apps/navigation) | Supported in-car navigation templates and alerts | Browser cockpit rendering, phone audio, Android Auto compatibility, and distribution approval are separate milestones |
| [Google speech languages and voices](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types) | Regional-language speech options | Provider language availability does not establish usable offline or noisy-cabin support |

Additional map integration references: [Android Auto with Navigation SDK](https://developers.google.com/maps/documentation/navigation/android-sdk/android-auto) and [CarPlay with Navigation SDK](https://developers.google.com/maps/documentation/navigation/ios-sdk/carplay). Support and approval requirements must be checked for the actual native implementation.

## Evidence labels used by the redesign

- **Runtime reported:** the backend reports a state. This is not an independent infrastructure audit.
- **Key configured:** an environment/configuration flag exists; successful provider operation is not established by the flag alone.
- **Local / demo:** local state, controlled replay, simulated input, or a prototype service is being used.
- **Reported model artifact:** metrics or export formats read from repository reports. Show the reported device and sample context; do not substitute them for current phone benchmarks.
- **Pending / integration pathway:** planned capabilities or an implementation path that has not been demonstrated.
- **Unavailable:** the service did not return usable data. Missing metrics are not replaced with fabricated fallback numbers.

The original fixed UI latency figures and unconditional cloud/edge success claims were removed from the Stack and Pitch views. Runtime measurements appear only when the API reports samples. Server relay timing is distinguished from camera-to-audio and mobile-network timing.

## Independent-project and non-endorsement scope

MargAI is an **independent buildathon project**. Event participation context and use of Google technologies do not establish a formal Google partnership, sponsorship, certification, or endorsement. The UI uses accurate technology names and source links without an invented partner badge.

Primary references:

- [Google brand guidance](https://about.google/brand-resource-center/guidance/): do not imply affiliation, endorsement, or sponsorship where none exists.
- [Google partnership guidance](https://about.google/brand-resource-center/guidance/partnerships/): formal partner badges and logo usage are not established by ordinary product usage.
- [Google sponsorship guidance](https://about.google/brand-resource-center/guidance/sponsorships/): describe actual involvement accurately and do not overstate the relationship.

No customer logos, testimonials, achieved accident reductions, awarded credits, fleet traction, government acknowledgements, or benchmark results were inferred from these websites.

## Motion references for the revised bright interface

Access date: **20 November 2026**. These are interface animation libraries, not Google services or project sponsors.

- [mo.js official repository](https://github.com/mojs/mojs) and [documentation](https://mojs.github.io/): motion graphics, timelines, and small shape effects. The documented npm package is `@mojs/core`. Use restrained moments of feedback and clean up animations when a view unmounts.
- [Rellax official repository](https://github.com/dixonandmoe/rellax) and [project site](https://dixonandmoe.com/rellax/): lightweight parallax, published as npm package `rellax`. Limit movement to decorative layers so reading and primary controls remain stable.

Respect reduced-motion preferences and touch/mobile layouts. Library selection alone does not establish accessibility or performance; validate the actual integration on the final pages.
