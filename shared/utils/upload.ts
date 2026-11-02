// Which files the Library imports, by name. The server checks the bytes too (server/utils/docx.ts); the client asks first
// so a person hears at once.
export const UPLOAD_ACCEPT = '.md,.markdown,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function uploadNameProblem(name: string) {
  if (/\.(md|markdown|txt|docx)$/i.test(name)) return null
  if (/\.(docm|dotm)$/i.test(name)) return 'Macro-enabled Word files are not imported. Save it as a Word Document (.docx).'
  if (/\.(doc|dot|rtf|odt|pages)$/i.test(name)) return 'This word-processor format is not imported. Save it as a Word Document (.docx).'
  return 'Not a supported file: use .md, .txt or .docx.'
}
