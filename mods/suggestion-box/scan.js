// What must not go out in an issue. Known token shapes always block Create; other hits (emails,
// home paths, IP addresses, long random strings) can each be marked fine to publish. Commit SHAs,
// UUIDs, version numbers, 127.0.0.1 and example addresses never count. Pure.

// A real key mixes letters and digits; a placeholder such as YOUR_ACCESS_TOKEN or a slug that
// happens to start with sk- does not, and is not a token.
const isKeyLike = (text) => /\d/.test(text) && /[A-Za-z]/.test(text);

const TOKENS = [
  ["a GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/g],
  ["an AWS key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["a Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g],
  ["an Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, isKeyLike],
  ["an OpenAI key", /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, (m) => isKeyLike(m.replace(/^sk-(?:proj-)?/, ""))],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["a bearer token", /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g, (m) => isKeyLike(m.replace(/^Bearer\s+/, ""))],
];

const OTHERS = [
  ["an email address", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (m) => /@(?:example\.(?:com|org|net)|[\w.-]*\.test|users\.noreply\.github\.com)$/i.test(m)],
  ["a home path", /(?:\/Users|\/home)\/[A-Za-z0-9._-]+/g, (m) => /\/(?:you|user|me|runner|USER|name)$/.test(m)],
  ["an IP address", /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m, text, index) => m === "127.0.0.1" || m === "0.0.0.0" || /v$/i.test(text.slice(Math.max(0, index - 1), index)) || m.split(".").some((n) => Number(n) > 255)],
  ["a long random string", /\b[A-Za-z0-9+/_-]{32,}={0,2}/g, (m) => /^[0-9a-f]{40}$/i.test(m) || /^[0-9a-f]{64}$/i.test(m) || !(/[A-Z]/.test(m) && /[a-z]/.test(m) && /\d/.test(m))],
];

// Every hit in a text: { kind, text, blocking }.
export function scan(text) {
  const value = String(text ?? "");
  const hits = [];
  const seen = new Set();
  for (const [kind, pattern, isReal = () => true] of TOKENS) {
    for (const match of value.matchAll(pattern)) if (isReal(match[0])) add(hits, seen, { kind, text: match[0], blocking: true });
  }
  for (const [kind, pattern, harmless] of OTHERS) {
    for (const match of value.matchAll(pattern)) {
      if (harmless(match[0], value, match.index)) continue;
      if ([...seen].some((s) => s.includes(match[0]))) continue;
      add(hits, seen, { kind, text: match[0], blocking: false });
    }
  }
  return hits;
}

function add(hits, seen, hit) {
  if (seen.has(hit.text)) return;
  seen.add(hit.text);
  hits.push(hit);
}

// Why Create must wait, or null: a token always; in a public repo, any hit not marked fine.
export function scanBlock(hits, { isPublic, fine = [] }) {
  const token = hits.find((hit) => hit.blocking);
  if (token) return `Remove ${token.kind}: ${token.text.slice(0, 12)}…`;
  const open = hits.filter((hit) => !fine.includes(hit.text));
  if (isPublic && open.length) return `Remove or mark fine ${open.length === 1 ? `${open[0].kind}` : `${open.length} items`}: this repo is public`;
  return null;
}
