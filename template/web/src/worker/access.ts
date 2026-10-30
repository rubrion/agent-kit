// Who is asking, from Cloudflare Access. Access sits in front of the hostname,
// but the Worker verifies the JWT itself as well (signature, audience, expiry):
// a request reaching the Worker by any other path carries no valid token.

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let keys: { at: number; byKid: Map<string, CryptoKey> } | undefined;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function signingKeys(team: string) {
	// Access rotates keys; an hour of cache is well inside the rotation window.
	if (keys && Date.now() - keys.at < 3_600_000) return keys.byKid;
	const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
	if (!r.ok) throw new Error(`Access certs: ${r.status}`);
	const { keys: list } = (await r.json()) as { keys: Jwk[] };
	const byKid = new Map<string, CryptoKey>();
	for (const k of list) {
		byKid.set(k.kid, await crypto.subtle.importKey('jwk', { ...k, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
	}
	keys = { at: Date.now(), byKid };
	return byKid;
}

/** The verified email, or null. */
export async function accessEmail(req: Request, team: string, aud: string): Promise<string | null> {
	const token = req.headers.get('Cf-Access-Jwt-Assertion');
	if (!token || !team || !aud) return null;
	const [h, p, s] = token.split('.');
	if (!h || !p || !s) return null;
	try {
		const header = JSON.parse(new TextDecoder().decode(b64url(h))) as { kid?: string; alg?: string };
		if (header.alg !== 'RS256' || !header.kid) return null;
		const key = (await signingKeys(team)).get(header.kid);
		if (!key) return null;
		const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
		if (!ok) return null;
		const claims = JSON.parse(new TextDecoder().decode(b64url(p))) as { aud?: string | string[]; exp?: number; email?: string; iss?: string };
		const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (!auds.includes(aud)) return null;
		if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
		if (claims.iss !== `https://${team}`) return null;
		return claims.email?.toLowerCase() ?? null;
	} catch {
		return null;
	}
}
