/**
 * Timetable Web Worker — stub.
 * In a later prompt this will:
 *  1. Receive a GenerateRequest message from the main thread
 *  2. POST to /api/v1/generate and stream/poll progress
 *  3. Post progress updates back via self.postMessage()
 */

self.onmessage = (event) => {
  const { type, payload } = event.data

  if (type === 'GENERATE') {
    self.postMessage({ type: 'STATUS', status: 'not_implemented' })
  }
}
