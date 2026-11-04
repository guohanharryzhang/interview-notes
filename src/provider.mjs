import WebSocket from 'ws';

export async function* answerStream({ key, prompt, model, deep, signal }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, ...prompt, stream: true, store: false, ...(model.startsWith('gpt-5') ? {reasoning: { effort: deep ? 'low' : 'none' }} : {}), max_output_tokens: deep ? 3800 : 1400 })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`OpenAI ${response.status}: ${body.error?.message || 'Answer request failed.'}`);
  }
  const decoder = new TextDecoder(); let buffer = ''; let completed = false;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data: ') || line.slice(6) === '[DONE]') continue;
        const data = JSON.parse(line.slice(6));
        if (data.type === 'response.output_text.delta') yield { type: 'delta', text: data.delta };
        if (data.type === 'response.completed') { completed = true; yield { type: 'usage', usage: data.response?.usage }; }
        if (data.type === 'error' || data.type === 'response.failed') throw new Error(data.message || data.response?.error?.message || 'Answer generation failed.');
        if (data.type === 'response.incomplete') throw new Error('Answer was cut short. Try a shorter question or use More detail.');
      }
    }
  }
  if (!completed) throw new Error('The answer connection ended early. Please retry.');
}

export function connectTranscription(client, { key, model = 'gpt-live-transcribe', company = '', role = '' }) {
  let ready = false, bytes = 0, closed = false;
  const send = data => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); };
  const upstream = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 15000 });
  const timer = setTimeout(() => { send({ type: 'app.error', message: 'Transcription did not connect. Check your key and selected transcription model.' }); close(); }, 18000);
  function close() { if (closed) return; closed = true; clearTimeout(timer); try { upstream.close(); } catch {} try { client.close(); } catch {} }
  upstream.on('open', () => {
    const transcription = model === 'gpt-live-transcribe'
      ? { model, languages: ['en'], delay: 'low', keywords: [company, role].filter(Boolean), prompt: `An interview for ${role || 'an engineering role'} at ${company || 'a company'}. Questions may concern electrical engineering, software, robotics and research.` }
      : { model, language: 'en', prompt: `An interview for ${role || 'a role'} at ${company || 'a company'}.`  };
    upstream.send(JSON.stringify({ type: 'session.update', session: { type: 'transcription', audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription, turn_detection: null } } } }));
  });
  upstream.on('message', raw => {
    let event; try { event = JSON.parse(raw.toString()); } catch { return; }
    if (event.type === 'session.updated') { ready = true; clearTimeout(timer); send({ type: 'app.ready' }); }
    else if (event.type === 'error') { send({ type: 'app.error', message: event.error?.message || 'Transcription error.' }); close(); }
    else if (event.type === 'conversation.item.input_audio_transcription.failed') { send({ type: 'app.error', message: event.error?.message || 'Could not transcribe this audio. Try a typed question.' }); }
    else if (['input_audio_buffer.committed', 'conversation.item.input_audio_transcription.delta', 'conversation.item.input_audio_transcription.completed'].includes(event.type)) send(event);
  });
  upstream.on('error', () => { send({ type: 'app.error', message: 'Could not connect to OpenAI transcription. Check your network and API key.' }); close(); });
  upstream.on('close', () => { if (!closed) { send({ type: 'app.error', message: 'Live transcription disconnected. Press Start listening to reconnect.' }); close(); } });
  client.on('message', (data, binary) => {
    if (!ready || upstream.readyState !== WebSocket.OPEN) return;
    if (binary) {
      if (data.length > 48000 || data.length % 2) { send({ type: 'app.error', message: 'Invalid audio packet.' }); close(); return; }
      bytes += data.length; upstream.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data.toString('base64') }));
    } else {
      let event; try { event = JSON.parse(data.toString()); } catch { return; }
      if (event.type === 'commit' && bytes >= 4800) { upstream.send(JSON.stringify({ type: 'input_audio_buffer.commit' })); bytes = 0; }
      if (event.type === 'clear') { upstream.send(JSON.stringify({ type: 'input_audio_buffer.clear' })); bytes = 0; }
    }
  });
  client.on('close', close); client.on('error', close);
  return close;
}
