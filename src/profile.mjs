const terms = value => String(value).toLowerCase().match(/[a-z0-9+#]+/g) || [];
const ignore = new Set('a an and or the is are do does did can could would you your me my i about tell what how why for to of in at on this that with'.split(' '));
export function personalCue(profile,question){
  const gaps=profile?.missingDetails;if(!gaps)return null;
  if(/(?:fail(?:ed|ure|ures)?|mistake|wrong|setback|didn.t work|did not work)/i.test(question)&&/(?:\byou\b|\byour\b|time|biggest|personal|a failure)/i.test(question))return gaps.failure||null;
  if(/customer|client|pilot/i.test(question)&&/problem|incident|example|time|broke|challenge|walk.*through|troubleshoot/i.test(question))return gaps.pilot||null;
  if(/why|interest|attract|reason/i.test(question)&&(/company|employer|work here/i.test(question)||question.toLowerCase().includes(String(profile.company||'').toLowerCase())))return gaps.motivation||null;
  if(/(?:time|example|situation|how.*you).*(?:conflict|disagree|difficult teammate|negative feedback)/i.test(question))return gaps.conflict||null;
  if(/(?:your|you).*(?:weakness|weakest|improve yourself)/i.test(question))return gaps.weakness||null;
  return null;
}
function relevant(items, question, render, limit) {
  const wanted=new Set(terms(question).filter(w=>!ignore.has(w)));
  const ranked=items.map(item=>{
    const text=render(item).toLowerCase(), seen=new Set(terms(text));
    let score=[...wanted].reduce((sum,w)=>sum+(seen.has(w)?1:0),0);
    if(item.q && item.q.toLowerCase()===question.trim().toLowerCase())score+=20;
    return {item,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  return ranked.slice(0,limit).map(x=>x.item);
}
export function selectPrep(profile,question,company=profile?.company){
  if(!profile||profile.company.toLowerCase()!==String(company).trim().toLowerCase())return null;
  return {id:profile.id,role:profile.role,card:profile.card,constraints:profile.constraints,
    qa:relevant(profile.qa||[],question,q=>q.q,3).map(({q,tag,beats,dont,stage,basis,sources})=>({q,tag,beats,dont,stage,basis,sources})),
    story_notes:relevant(profile.stories||[],question,s=>s.title+' '+s.beats.join(' '),2),
    submitted_answers:relevant(profile.application||[],question,a=>a.question+' '+String(a.answer),3),
    questions_to_ask: /questions.*(?:us|ask)|(?:ask|anything).*questions|next steps/i.test(question)?profile.ask:[],
    company_facts:profile.companyFacts||[],candidate_preferences:profile.userAnswers||{},source:profile.source};
}
