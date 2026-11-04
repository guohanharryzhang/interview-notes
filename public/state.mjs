export function likelyQuestion(text) {
  const s = text.trim();
  if (s.length < 15 || /^(i |i've |i’m |i'm |we |we've |my |yes[, .]|no[, .])/i.test(s)) return false;
  return /\?\s*$/.test(s) || /^(?:okay[, ]+|so[, ]+|and[, ]+|great[, ]+)?(?:tell me|walk me|explain|describe|compare|design|calculate|what |why |how |when |where |which |can you|could you|would you|have you|do you)/i.test(s) || /\b(?:tell me (?:a little )?about|give me an introduction|would love to hear|wanted to (?:ask|see|confirm)|what (?:are|were|would|have|do|did) you|why did you|any questions (?:at all |for us|you))/i.test(s);
}
export class Transcript {
  constructor() { this.items = new Map(); this.order = []; }
  item(id) { if (!this.items.has(id)) this.items.set(id, { id, text: '', done: false, eligible: true, receivedAt: new Date().toISOString() }); return this.items.get(id); }
  commit(id, previous, eligible = true) {
    const item = this.item(id); item.eligible = eligible;
    this.order = this.order.filter(x => x !== id);
    const index = this.order.indexOf(previous);
    if (index >= 0) this.order.splice(index + 1, 0, id); else this.order.push(id);
  }
  delta(id, delta) { const item = this.item(id); if (!this.order.includes(id)) this.order.push(id); if (!item.done) item.text += delta; return item; }
  complete(id, text) { const item = this.item(id); item.text = text; item.done = true; if (!this.order.includes(id)) this.order.push(id); return item; }
  turns() { return this.order.map(id => this.items.get(id)); }
  finalTurns() { return this.turns().filter(x => x.done && x.text.trim()); }
}
