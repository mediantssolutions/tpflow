# Shopper Survey

Static GitHub Pages frontend for the original five-question private feedback form.
The eight current store routes and five legacy aliases share the original layout,
question labels and choices. No framework or installed dependency is required.

```sh
npm run build
npm test
```

Commit the generated route pages together with the shared assets. Production Pages
currently publishes `main:/` at `https://shopper-survey.com/`; a push to that branch
can publish immediately. This working branch has not been pushed or deployed.

## Invitation and API contract

Open `/<store>/#invite=<opaque>` from a signed survey invitation. Only the fragment
is read; query parameters are not used for identity. The token is held in memory,
never browser storage, and is sent only in the JSON request body to the fixed API.
Every page declares `no-referrer`, requests use `no-referrer` and omit credentials,
and the optional external review link uses `noopener noreferrer`.

- `POST https://api-production-c98b.up.railway.app/api/public/surveys/v1/context`
  with `{ "invite_token": "..." }`.
- `POST .../api/public/surveys/v1/submit` with
  `{ "invite_token": "...", "form_version": 1,
  "answers": { "name": "...", "ease": "...", "decision": "...",
  "improve": "...", "stars": 1 } }`.

The route's expected store must match the server context. The server owns order
identity, response/reward idempotency and any actual reward delivery. The frontend
does not generate a benefit, amount, payment claim, deadline or marketing event.
It displays only the validated server reward status/description. The reward is the
same for every rating and never depends on a public review. Owner 2026-11-12: only a
4–5 star answer is shown the store's Trustpilot write-a-review link, when the server
sends one (the server sends none for 1–3 stars, and the page also checks the rating
it submitted).

Without a token, all five questions remain visible as a disabled preview. Invalid
or expired invitations offer generic store support. Network/server failures stay
retryable and retain the entered answers. The thank-you step requires an actual
successful submit acknowledgement, or a server context saying `submitted`.
Reloading an already submitted invitation does not submit again.

## Routes

| Current route | Store key | Legacy alias |
| --- | --- | --- |
| `/selzari/` | `nosura` | `/nonali/`, `/nosu/` |
| `/loomlu/` | `celzoir` | |
| `/muupa/` | `vicancio` | `/vic/` |
| `/decorivialiving/` | `decorivialiving` | |
| `/lasson/` | `lasson-living` | `/lasso/` |
| `/hale/` | `hale` | |
| `/livadora/` | `zoe-sydney` | `/zoesyd/` |
| `/nova/` | `house-of-nova-london` | |

Each folder includes both `index.html` and `thankyou.html`. Directly opening a
thank-you URL does not create or imply a successful response.

Owner 2026-11-14: Nonali is now Selzari (same Shopify shop). Old invitation links on `/nonali/`
and `/nosu/` keep working, a context may still name the old `nonali.com` home host while the
server's pin moves (`retired_hosts`), and its review link may name Trustpilot's page on
`selzari.com` or the older `nonali.com` one (`other_review_domains`) until that page moves.

## Validation

The offline tests inject a fake API at the controller boundary. They never send
real feedback or invoke an external endpoint. They cover all ratings, anonymous
previews, token/store mismatch, HTTP/network failures, malformed acknowledgements,
double clicks, previously completed invitations, route aliases and page contracts.
Browser visual QA is separate and uses external local-only fixtures.
