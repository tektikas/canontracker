// Which files the Library imports, by name. The server checks the bytes too (server/utils/docx.ts); the client asks first
// so a person hears at once.
export const UPLOAD_ACCEPT = '.md,.markdown,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.wav,.mp3,.m4a,.ogg,.oga,.opus,.webm,.flac,.aac,audio/*'

// `other`: what to say about any other file (the Library also takes audio, sent to /api/recordings).
export function uploadNameProblem(name: string, other = 'Not a supported file: use .md, .txt or .docx.') {
  if (/\.(md|markdown|txt|docx)$/i.test(name)) return null
  if (/\.(docm|dotm)$/i.test(name)) return 'Macro-enabled Word files are not imported. Save it as a Word Document (.docx).'
  if (/\.(doc|dot|rtf|odt|pages)$/i.test(name)) return 'This word-processor format is not imported. Save it as a Word Document (.docx).'
  return other
}

// A file name that reads as a chapter of a book: a leading number ("01 The Arrival"), a chapter word with a number ("Chapter 3",
// "ch02", "Book 2", "Part II", "Chapter One"), or Prologue / Epilogue / Interlude as the first word. A chapter word without a
// number is not enough ("book-notes", "Part of the plan"), and only whole words count ("notebook", "facebook").
const WORDS = '(?:[ivx]{1,5}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)'
const CHAPTER = new RegExp(`^\\d|\\b(?:chapter|chap|ch|part|book)(?:\\s*\\d+|\\s+${WORDS})\\b|^(?:prologue|epilogue|interlude)\\b`, 'i')
export const chapterLike = (filename: string) => CHAPTER.test(filename.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').trim())
