// @ts-check
// The revision of /api/v1 this build of the application speaks. The browser sends it on every API
// request; the server refuses a lower one with `client.outdated`, and the browser then resets
// itself. Bump it only for a breaking change, as docs/api-v1.md's compatibility rules describe:
// every installed copy older than the bump is then reset the next time it calls the API.

/** Raise by one for a change an older copy of the application cannot survive. */
export const API_REVISION = 1;

/** The request header that carries the sender's API revision. */
export const API_REVISION_HEADER = "learn-api-revision";
