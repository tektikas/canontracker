import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

// MCP over Streamable HTTP, stateless: one server per request, authenticated by a per-user API token.
// Tool handlers run inside this request, so access()/pid()/audit() behave exactly as in the web guard.
const MAX_BODY = 256_000 // bytes per JSON-RPC request; the largest tool input (20 facts to check, a 2,000-character quote) is far below

export default defineEventHandler(async (event) => {
  await readLimitedBody(event, MAX_BODY, `MCP requests are limited to ${MAX_BODY / 1000} KB.`)
  const auth = accessForToken(event)
  if (!auth) {
    setResponseHeader(event, 'www-authenticate', 'Bearer realm="Story Bible"')
    throw createError({ statusCode: 401, statusMessage: 'UNAUTHENTICATED', message: 'Missing, invalid or revoked API token. Create one under Settings > Agents & API.' })
  }
  event.context.access = auth.access
  const server = buildMcpServer(auth.token)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  return transport.handleRequest(toWebRequest(event))
})
