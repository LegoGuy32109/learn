// @ts-check
// Invite page: one button registers a passkey for the invited account, then the shelf opens signed in.
import { registerWithInvite } from "../../src/client/identity/passkey.js";

const invite = (/** @type {any} */ (window)).__INVITE__;
const button = /** @type {HTMLButtonElement} */ (document.querySelector("#register-passkey"));
const status = /** @type {HTMLElement} */ (document.querySelector("#invite-status"));

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Waiting for your passkey…";
  const outcome = await registerWithInvite(invite.token);
  if (!outcome.ok) {
    status.textContent = outcome.message;
    button.disabled = false;
    return;
  }
  status.textContent = `Signed in as ${outcome.displayName}. Opening your shelf…`;
  location.replace("/");
});
