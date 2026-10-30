// @rubrion/agent-kit-server/gateway: only the gateway, with no Mastra in the
// bundle. Import this from the app's API Worker.
export { createAgentGateway, type GatewayOptions, type Preflight, type Blocked } from './gateway.js';
export { HEADER, readCaller, writeCaller, writeModel } from './headers.js';
export type { Caller, ModelChoice, Provider } from './types.js';
