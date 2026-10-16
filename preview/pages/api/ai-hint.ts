import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json()
    const question = body.question

    if (typeof question !== 'string' || !question.trim()) {
      return Response.json({ error: 'Lütfen bir matematik sorusu yaz.' }, { status: 400 })
    }

    if (question.length > 2000) {
      return Response.json({ error: 'Soru en fazla 2000 karakter olabilir.' }, { status: 400 })
    }

    // Browser -> Astro API -> local AI server -> Ollama.
    const aiResponse = await fetch('http://127.0.0.1:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ messages: [{ role: 'user', content: question.trim() }] }),
    })

    const data = await aiResponse.json()
    if (!aiResponse.ok) {
      return Response.json({ error: data.error || 'AI sunucusu yanıt veremedi.' }, { status: aiResponse.status })
    }

    return Response.json({ answer: data.reply })
  } catch (error) {
    console.error('AI bağlantı hatası:', error)
    console.error('Hata ayrıntısı:', error)
    const isUnavailable = error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')

    return Response.json(
      { error: isUnavailable ? 'AI sunucusu çalışmıyor. Ollama ve AI sunucusunu aç.' : 'İstek işlenemedi.' },
      { status: isUnavailable ? 503 : 500 },
    )
  }
}
