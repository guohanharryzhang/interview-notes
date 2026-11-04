export function allowedRequest({ host, origin, token }, port, expectedToken) {
  return [`127.0.0.1:${port}`, `localhost:${port}`].includes(host) &&
    [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin) &&
    typeof token === 'string' && token === expectedToken;
}
export function cleanQuestion(q) {
  if (typeof q !== 'string' || !q.trim()) throw new Error('Enter a question first.');
  if (q.length > 6000) throw new Error('Question is too long (6,000 characters maximum).');
  return q.trim();
}
