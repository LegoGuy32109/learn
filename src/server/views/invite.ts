// The invite landing page. A valid invite shows one button that registers a passkey;
// an invalid one shows a plain explanation, never a stack trace.
import type { InviteLookup } from "../identity/passkeys.ts";
import { document, escapeHtml, inlineJson } from "./page.ts";

const EXPLANATIONS: Record<Exclude<InviteLookup["state"], "valid">, { title: string; detail: string }> = {
  unknown: { title: "This invite link is not valid", detail: "Check that the whole link was copied, or ask for a new one." },
  expired: { title: "This invite link has expired", detail: "An invite works for ten minutes. Ask for a new one." },
  used: { title: "This invite link was already used", detail: "Each invite signs in once. If this phone is not signed in, ask for a new one." },
};

function shell(inner: string): string {
  return `<main id="app" class="page invite"><div class="libhead"><div><p class="eyebrow">Sign in</p><h1 class="libtitle">learn</h1></div></div>${inner}</main>`;
}

export function invitePage(lookup: InviteLookup, token: string): string {
  if (lookup.state !== "valid") {
    const explanation = EXPLANATIONS[lookup.state];
    const inner = `<div class="notice" role="alert"><span><strong>${escapeHtml(explanation.title)}.</strong> ${escapeHtml(explanation.detail)}</span></div><div class="actions"><a class="go quiet" href="/">Open the shelf as a guest</a></div>`;
    return document(shell(inner), { title: explanation.title });
  }
  const name = escapeHtml(lookup.account.displayName);
  const inner = [
    `<div class="notice"><span><strong>Invite for ${name}.</strong> Register a passkey on this phone to sign in here without typing a token. It uses Face ID, Touch ID or your fingerprint.</span></div>`,
    '<p id="invite-status" class="state" aria-live="polite"></p>',
    '<div class="actions"><button class="go" id="register-passkey" type="button">Register a passkey</button></div>',
    `<script>window.__INVITE__=${inlineJson({ token, displayName: lookup.account.displayName })}</script>`,
    '<script type="module" src="/js/invite.js"></script>',
  ].join("");
  return document(shell(inner), { title: "Sign in" });
}
