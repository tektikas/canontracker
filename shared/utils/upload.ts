// Which files the Library imports, by name. The server checks the bytes too (server/utils/docx.ts); the client asks first
// so a person hears at once. Screenplay (.fountain), dialogue (.yarn, .ink) and table or data exports (.csv, .tsv, .json) are
// read as plain text: a file with no blank lines is one passage per line (splitPassages).
export const TEXT_UPLOAD = /\.(md|markdown|txt|fountain|yarn|ink|csv|tsv|json)$/i
export const TEXT_ACCEPT = '.md,.markdown,.txt,.fountain,.yarn,.ink,.csv,.tsv,.json,.docx,text/markdown,text/plain,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const UPLOAD_ACCEPT = `${TEXT_ACCEPT},.wav,.mp3,.m4a,.ogg,.oga,.opus,.webm,.flac,.aac,audio/*`
export const UPLOAD_FORMATS = '.md, .txt, .fountain, .yarn, .ink, .csv, .tsv, .json or .docx'

// `other`: what to say about any other file (the Library also takes audio, sent to /api/recordings).
export function uploadNameProblem(name: string, other = `Not a supported file: use ${UPLOAD_FORMATS}.`) {
  if (TEXT_UPLOAD.test(name) || /\.docx$/i.test(name)) return null
  if (/\.(docm|dotm)$/i.test(name)) return 'Macro-enabled Word files are not imported. Save it as a Word Document (.docx).'
  if (/\.(doc|dot|rtf|odt|pages)$/i.test(name)) return 'This word-processor format is not imported. Save it as a Word Document (.docx).'
  return other
}

// Before the AI has read a file, its kind comes from its name: reference ('lore') only when the name clearly says so (a whole
// word: lore, notes, characters, bible, outline, worldbuilding, glossary, wiki, readme; "CharacterNotes" counts as two
// words), else story text ('scene'). "notebook", "S03-the-chord-stone" and "chapter-07" are story text.
const REFERENCE = /\b(?:lore|notes?|characters?|bible|outlines?|world ?building|glossary|wiki|readme)\b/i
export const referenceLike = (filename: string) =>
  REFERENCE.test(filename.replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' '))
