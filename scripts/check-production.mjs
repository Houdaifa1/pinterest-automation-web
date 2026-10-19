const origin = 'https://automation.houdaifa.dev';
for (const [path, expected] of [['/api/health', 200], ['/api/me', 401], ['/api/environment', 200], ['/auth/dev', 404]]) {
  const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
  if (path === '/api/health' && (await response.json()).ok !== true) throw new Error('Health response was not confirmed.');
  if (path === '/api/environment' && (await response.json()).local !== false) throw new Error('Production must never enable local sign-in.');
  console.log(`${path}: ${response.status}`);
}
