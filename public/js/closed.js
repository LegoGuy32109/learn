// @ts-check
// Closed-site page: a device that already has a passkey signs in, then the shelf opens.
import { signInWithPasskey } from "../../src/client/identity/passkey.js";

const button = /** @type {HTMLButtonElement} */ (document.querySelector(
  "#sign-in",
));
const status =
  /** @type {HTMLElement} */ (document.querySelector("#sign-in-status"));

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Waiting for your passkey…";
  const outcome = await signInWithPasskey();
  if (!outcome.ok) {
    status.textContent = outcome.message;
    button.disabled = false;
    return;
  }
  status.textContent =
    `Signed in as ${outcome.displayName}. Opening your shelf…`;
  location.replace(location.href);
});
