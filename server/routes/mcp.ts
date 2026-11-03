import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

// MCP over Streamable HTTP, stateless: one server per request, authenticated by a per-user API token.
// Tool handlers run inside this request, so access()/pid()/audit() behave exactly as in the web guard.
const MAX_BODY = 256_000 // bytes per JSON-RPC request; the largest text input (20 facts to check, a 12,000-character text) is far below
// Tools that carry a file or a whole document (base64 .docx or image up to 4 MB, document text up to 1 MB) may send more; a
// request for any other tool over MAX_BODY is still a 413. Both caps are counted while the body streams in.
const MAX_FILE_BODY = 6_000_000
const FILE_TOOLS = new Set(['sb_document', 'sb_draft', 'sb_entity', 'sb_images'])

export default defineEventHandler(async (event) => {
  const auth = accessForToken(event) // headers only: an unauthenticated body is never read
  if (!auth) {
    setResponseHeader(event, 'www-authenticate', 'Bearer realm="CanonTracker"')
    throw createError({ statusCode: 401, statusMessage: 'UNAUTHENTICATED', message: 'Missing, invalid or revoked API token. Create one under Settings > Agents & API.' })
  }
  await readLimitedBody(event, MAX_FILE_BODY, `MCP requests are limited to ${MAX_FILE_BODY / 1_000_000} MB.`)
  const raw = event._requestBody as Buffer | undefined
  if (raw && raw.length > MAX_BODY) {
    let tool: unknown
    try {
      const m = JSON.parse(raw.toString('utf8'))
      tool = m?.method === 'tools/call' ? m.params?.name : undefined
    } catch {}
    if (!FILE_TOOLS.has(tool as string)) {
      setResponseHeader(event, 'connection', 'close')
      throw createError({ statusCode: 413, statusMessage: 'TOO_LARGE', message: `MCP requests are limited to ${MAX_BODY / 1000} KB (${MAX_FILE_BODY / 1_000_000} MB for ${[...FILE_TOOLS].join(', ')}).` })
    }
  }
  event.context.access = auth.access
  const server = buildMcpServer(auth.token)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  return transport.handleRequest(toWebRequest(event))
})
