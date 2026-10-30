import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

// MCP over Streamable HTTP, stateless: one server per request, authenticated by a per-user API token.
// Tool handlers run inside this request, so access()/pid()/audit() behave exactly as in the web guard.
export default defineEventHandler(async (event) => {
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
