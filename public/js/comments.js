// Comments section on signed-in.html. Uses api() and showMessage() from ui.js.
// Comments are text written by users, so they are only ever inserted with
// textContent, never innerHTML: anything that looks like HTML is shown as text, not run.
(() => {
  const MAX = 500;
  const form = document.getElementById("comment-form");
  const textarea = document.getElementById("comment-text");
  const count = document.getElementById("comment-count");
  const status = document.getElementById("comment-status");
  const button = document.getElementById("comment-submit");
  const list = document.getElementById("comment-list");
  const empty = document.getElementById("comment-empty");

  // A 401 means the session ended (expired or signed out elsewhere).
  const handleError = (err) => {
    if (err.message === "Not authenticated") location.href = "login.html";
    else showMessage(status, "error", err.message);
  };

  function renderComment(c) {
    const li = document.createElement("li");
    li.className = "comment";
    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const author = document.createElement("strong");
    author.textContent = c.username;
    const when = document.createElement("time");
    when.dateTime = new Date(c.createdAt).toISOString();
    when.textContent = new Date(c.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    meta.append(author, " · ", when);
    const text = document.createElement("p");
    text.className = "comment-text";
    text.textContent = c.text;
    li.append(meta, text);
    return li;
  }

  async function loadComments() {
    try {
      const { comments } = await api("/api/comments");
      list.replaceChildren(...comments.map(renderComment));
      empty.hidden = comments.length > 0;
    } catch (err) {
      handleError(err);
    }
  }

  const updateCount = () => { count.textContent = `${textarea.value.length} / ${MAX}`; };
  textarea.addEventListener("input", updateCount);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    const text = textarea.value.trim();
    if (!text) {
      showMessage(status, "error", "Write a comment before posting.");
      return;
    }
    button.disabled = true;
    button.textContent = "Posting…";
    try {
      await api("/api/comments", { text });
      textarea.value = "";
      updateCount();
      status.hidden = true;
      await loadComments();
    } catch (err) {
      handleError(err);
    } finally {
      button.disabled = false;
      button.textContent = "Post comment";
    }
  });

  loadComments();
})();
