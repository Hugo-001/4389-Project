const status = document.querySelector('#status');
const list = document.querySelector('#list');
async function api(path, body) {
  const r = await fetch(path, {method: body ? 'POST' : 'GET', credentials:'same-origin',
    headers: body ? {'Content-Type':'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || 'Request failed');
  return result;
}
async function refresh() {
  list.replaceChildren();
  try {
    const {credentials} = await api('/api/credentials');
    status.textContent = `${credentials.length} registered passkey(s)`;
    for (const credential of credentials) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${credential.nickname} — ${credential.id.slice(0,12)}… `;
      const rename = document.createElement('button'); rename.textContent = 'Rename';
      rename.onclick = async () => {
        const nickname = prompt('New passkey name',credential.nickname);
        if (nickname === null) return;
        try { await api('/api/credentials/rename',{id:credential.id,nickname}); await refresh(); }
        catch(e) { status.textContent=e.message; }
      };
      const remove = document.createElement('button'); remove.textContent = 'Remove';
      remove.onclick = async () => {
        const last = credentials.length === 1;
        const warning = last
          ? 'This is your LAST passkey. Removing it will permanently delete your account and sign you out. You will need to register again. Continue?'
          : 'Remove this passkey from your account? This does not delete it from your device.';
        if (!confirm(warning)) return;
        try {
          const result = await api('/api/credentials/remove',{id:credential.id});
          if (result.accountDeleted) { window.location.assign('/register.html'); return; }
          await refresh();
        }
        catch(e) { status.textContent=e.message; }
      };
      li.append(name,rename,document.createTextNode(' '),remove); list.append(li);
    }
  } catch(e) { status.textContent=e.message; }
}
refresh();
