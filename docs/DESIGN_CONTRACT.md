# MargAI interface contract

Purpose: help drivers inspect road conditions, try the cooperative warning journey and review road reports. Primary actions: open the road map, start the drive demo, open the phone camera. Audience: commuters and municipal reviewers.

Direction: a quiet transport instrument with editorial typography, warm off-white paper, charcoal/olive map, citrus route signal and restrained functional amber/red. Use precise lines, generous margins and compact tabular data. No gradients, glossy controls, decorative blobs, emoji navigation or confetti. The local corridor fixture and actual API hazard/report fields are the product references.

Homepage hierarchy: compact navigation → road-awareness headline and corridor preview → actual network counts → recent observations → three short workflow explanations. The corridor illustration is explicitly a schematic. Data provenance is always visible. Never invent fleet counts, latency numbers or repair claims.

Target viewports: 1440x1000 and 390x844. Mobile navigation must expose every primary task; buttons at least 44px, visible keyboard focus, semantic headings and reduced-motion support. No document horizontal overflow. Map interaction must not block page navigation.

States:
- Loading: stable placeholder counts and loading message while REST requests resolve.
- Empty: zero observations with an action to run the demo.
- Error: actionable inline retry; no fabricated data on request failure.
- Partial: retain loaded data and identify unavailable source.
- Success: observations, selected details and reports reflect the API response.
- Permission: camera starts from a user gesture; denial explains browser settings and offers sample replay. No measured GPS until a real fix arrives.

Verify homepage, live map, drive demo, report review and phone pairing. Keep screenshots and a JSON evidence record in docs/verification. Real camera quality and physical vehicle testing require device access and are explicitly outside browser evidence.
