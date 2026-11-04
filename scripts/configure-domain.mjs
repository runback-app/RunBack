// Runs in GitHub Actions with the existing deployment credential. Never prints it.
const token = process.env.VERCEL_TOKEN;
const project = process.env.VERCEL_PROJECT_ID;
const team = process.env.VERCEL_ORG_ID;
if (!token || !project || !team) throw new Error('Existing Vercel deployment configuration is missing.');
const query = `?teamId=${encodeURIComponent(team)}`;
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.vercel.com${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}
const selected = await api(`/v9/projects/${project}`);
if (!selected.ok) throw new Error(`Could not access the existing project (${selected.status}).`);
console.log(JSON.stringify({ project: selected.data.name, project_id: selected.data.id }));
for (const name of ['runback.net', 'www.runback.net']) {
  let result = await api(`/v9/projects/${project}/domains/${name}`);
  if (result.status === 404) {
    result = await api(`/v10/projects/${project}/domains`, 'POST', {
      name,
      ...(name.startsWith('www.') ? { redirect: 'runback.net', redirectStatusCode: 308 } : {}),
    });
  }
  if (!result.ok) {
    console.error(JSON.stringify({ domain: name, status: result.status, code: result.data.error?.code, message: result.data.error?.message }));
    process.exitCode = 1;
    continue;
  }
  if (!result.data.verified) {
    const verified = await api(`/v9/projects/${project}/domains/${name}/verify`, 'POST');
    if (verified.ok) result = verified;
  }
  console.log(JSON.stringify({ domain: name, verified: result.data.verified, redirect: result.data.redirect, verification: result.data.verification }));
  const config = await api(`/v6/domains/${name}/config`);
  if (config.ok) console.log(JSON.stringify({ domain: name, dns: config.data }));
}
