# Workstream D: API-token operations

## Objective

Turn the one-time owner bootstrap into a safe personal-token lifecycle for
Josh's agents. This work does not add public account creation.

## Owned files

- new token administration modules under `src/server/identity/`
- token scripts under `scripts/`
- token-focused server and database tests
- token-operation documentation

Do not add browser account UI or edit `src/app.ts`. Export handlers or commands
for coordinator wiring.

## Required work

1. Mint a named token with selected scopes and optional expiry.
2. List token metadata without revealing token hashes or secrets.
3. Revoke one token immediately.
4. Rotate a token without a period where both old and new tokens are
   accidentally displayed.
5. Distinguish invalid authentication (`401`) from valid authentication with an
   insufficient scope (`403`).
6. Store only a token prefix and SHA-256 hash of at least 256 bits of random
   secret material.
7. Ensure logs, errors, snapshots, and test reports redact bearer tokens.

The full token is shown or written once at creation. Existing tokens cannot be
retrieved.

## Acceptance gate

Database tests must prove scope enforcement, expiry, revocation, last-used
updates, and non-disclosure. Include a real-process smoke that creates a token,
uses it, revokes it, and confirms the next request fails.

