// Research mode: real-world questions answered from outside sources, never canon. Contract shared with card c54, which
// replaces this stub with the research agent. Whatever it returns stays a research answer in the conversation; nothing it
// says becomes canon (promoting a note is a human decision that goes through review).
export interface ResearchInput {
  projectId: string
  conversationId: string
  question: string
  // Earlier messages in the conversation, oldest first.
  history: { role: 'user' | 'assistant', mode: 'canon' | 'research', author: string, text: string }[]
  // The chips the asker attached (resolved on the server): the page they were on, a quoted selection.
  context: { type: string, id: string, label: string, quote?: string }[]
  // The project's research profile (c54). null until it exists.
  profile: Record<string, string> | null
}
export interface ResearchResult {
  kind: 'answer' | 'followup'
  text: string
  noteIds?: string[]
  followup?: { question: string, options?: string[] }
}

export async function runResearch(_input: ResearchInput): Promise<ResearchResult> {
  return { kind: 'answer', text: 'Research isn’t available yet. Switch to Canon to ask what your story already says.' }
}
