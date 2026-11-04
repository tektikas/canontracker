// Background extraction statuses in this project (server/utils/extractions.ts), polled by the uploader, Library, a document
// page and Review while something is in progress. Any member may read them.
export default defineEventHandler(() => listExtractions())
