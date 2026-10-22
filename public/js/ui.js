// UI-only behaviour. Nothing here talks to a server.
// Each "TODO(backend)" marks where the real passkey calls will be wired in later.

const USERNAME_RE = /^[A-Za-z0-9._@-]{1,64}$/;

const MESSAGES = {
  unsupported: "This browser doesn't support passkeys. Use a current version of Chrome, Safari, or Edge.",
  invalidUsername: "Use letters, numbers, and . _ @ - only, up to 64 characters.",
  cancelled: "You cancelled the passkey prompt. Try again when you're ready.",
  waiting: "Waiting for your passkey. Follow the prompt on your device.",
  registered: "Passkey saved. You can sign in with it now.",
};

function showMessage(el, kind, text) {
  el.className = "msg " + kind;
  el.textContent = text;
  el.hidden = false;
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.textContent = busy ? "Waiting…" : label;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function wireForm({ form, status, button, label, run }) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    const username = form.elements.username.value.trim();
    if (!USERNAME_RE.test(username)) {
      showMessage(status, "error", MESSAGES.invalidUsername);
      return;
    }
    showMessage(status, "wait", MESSAGES.waiting);
    setBusy(button, true, label);
    try {
      await run(username);
    } finally {
      setBusy(button, false, label);
    }
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
