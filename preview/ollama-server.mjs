import { createServer } from 'node:http'

const PORT = Number(process.env.AI_PORT || 3001)
const MODEL = 'gemma4:e2b'
const ALLOWED_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000'])
const SYSTEM_PROMPT = 'Sen Türkçe konuşan, sabırlı bir matematik öğretmenisin. Öğrenciye önce kısa bir ipucu ver; doğrudan cevabı ancak isterse açıkla. Çözümü anlaşılır küçük adımlara böl. Matematiksel gösterimi LaTeX ile yazabilirsin.'

function send(response, status, body, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  })
  response.end(JSON.stringify(body))
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin
  if (origin && !ALLOWED_ORIGINS.has(origin)) return send(response, 403, { error: 'Bu siteye izin verilmiyor.' })

  if (request.method === 'OPTIONS' && request.url === '/api/chat') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': origin || 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    })
    return response.end()
  }

  if (request.method !== 'POST' || request.url !== '/api/chat') return send(response, 404, { error: 'Bulunamadı.' }, origin)
  if (!request.headers['content-type']?.includes('application/json')) return send(response, 415, { error: 'JSON isteği gerekli.' }, origin)

  try {
    let raw = ''
    for await (const chunk of request) {
      raw += chunk
      if (raw.length > 16_000) return send(response, 413, { error: 'İstek çok uzun.' }, origin)
    }

    const body = JSON.parse(raw)
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 10) {
      return send(response, 400, { error: 'En fazla 10 sohbet iletisi gönderilebilir.' }, origin)
    }
    const messages = body.messages.map((message) => {
      if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 2000) {
        throw new Error('Her ileti en fazla 2000 karakter olmalı.')
      }
      return { role: message.role, content: message.content.trim() }
    })
    if (messages.at(-1).role !== 'user') return send(response, 400, { error: 'Son ileti bir soru olmalı.' }, origin)

    const ollamaResponse = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        options: { temperature: 0.4 },
      }),
    })
    if (!ollamaResponse.ok) return send(response, 502, { error: 'Ollama yanıt veremedi. Ollama ve modeli kontrol et.' }, origin)
    const result = await ollamaResponse.json()
    const reply = result.message?.content?.trim()
    if (!reply) return send(response, 502, { error: 'Model boş yanıt verdi; tekrar deneyebilirsin.' }, origin)
    return send(response, 200, { reply }, origin)
  } catch (error) {
    const message = error instanceof SyntaxError
      ? 'İstek biçimi geçersiz.'
      : error.name === 'TimeoutError'
        ? 'Model uzun süre yanıt vermedi. Tekrar deneyebilirsin.'
        : error.message === 'fetch failed'
          ? 'Ollama çalışmıyor. Önce Ollama uygulamasını aç.'
          : error.message
    return send(response, 400, { error: message }, origin)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Ollama matematik yardımcısı http://127.0.0.1:${PORT} adresinde hazır (${MODEL})`)
})
