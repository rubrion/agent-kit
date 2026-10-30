// The contract between the gateway and the agent worker. The gateway is the only
// caller (service binding, no public route), so these headers are trusted there.
import type { Caller, ModelChoice } from './types.js';

export const HEADER = {
	tenant: 'X-Agent-Tenant',
	person: 'X-Agent-Person',
	role: 'X-Agent-Role',
	/** URI-encoded: names carry accents. */
	name: 'X-Agent-Name',
	/** JSON ModelChoice; carries a decrypted key only inside this request. */
	model: 'X-Agent-Model',
} as const;

/** Ids are kept to a safe alphabet: they become part of thread ids. */
const ID = /^[A-Za-z0-9_.@-]{1,64}$/;

export function writeCaller(headers: Headers, caller: Caller) {
	headers.set(HEADER.tenant, caller.tenant);
	headers.set(HEADER.person, caller.person);
	headers.set(HEADER.role, caller.role);
	headers.set(HEADER.name, encodeURIComponent(caller.name).slice(0, 300));
}

export function readCaller(headers: Headers): Caller | null {
	const tenant = headers.get(HEADER.tenant) ?? '';
	const person = headers.get(HEADER.person) ?? '';
	if (!ID.test(tenant) || !ID.test(person)) return null;
	let name = headers.get(HEADER.name) ?? '';
	try { name = decodeURIComponent(name); } catch { /* sent raw */ }
	return { tenant, person, role: headers.get(HEADER.role) ?? '', name };
}

export const writeModel = (headers: Headers, choice: ModelChoice) => headers.set(HEADER.model, JSON.stringify(choice));
