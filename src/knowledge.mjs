const stringify=v=>typeof v==='string'?v:JSON.stringify(v);
const words=t=>String(t).toLowerCase().match(/[a-z0-9]+/g)||[];
const stop=new Set('a an the and or to of in on for with about me my you your how what why did do does is was were can could would tell explain walk through that it project experience work detail detailed technical'.split(' '));
const includesAlias=(text,alias)=>new RegExp('(?:^|[^a-z0-9])'+alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z0-9])','i').test(text);
export function buildLibrary(db,supplement={}){
  return (db.entities||[]).map(e=>{
    const extra=supplement[e.id]||{};
    return {id:e.id,title:e.name||e.organization||e.id,organization:e.organization||'',role:e.title||'',dates:e.dates?.display||'',aliases:[...(e.aliases||[]),...(extra.aliases||[]),e.name||e.id],tags:e.tags||e.role_tags||[],
      pitch:extra.pitch||[e.title,e.name,e.organization].filter(Boolean).join(' — '),behavioralTopics:extra.behavioralTopics||[],
      overview:extra.overview||'',recruiterValue:extra.recruiterValue||'',
      evidence:(db.claims||[]).filter(c=>c.entity_id===e.id).map(c=>({id:c.id,text:c.text,ownership:c.ownership||'',limits:c.scope_notes||[],sources:c.sources||[]})),
      metrics:(db.metrics||[]).filter(m=>m.entity_id===e.id).map(m=>({id:m.id,value:m.value,unit:m.unit,limits:m.scope_notes||'',sources:m.sources||[]})),
      observations:extra.observations||[],answerExamples:(extra.observations||[]).filter(o=>(extra.answerExampleIds||[]).includes(o.id)),followUps:extra.followUps||['What did you personally deliver?','How was it tested or evaluated?','What would you change now?'],gaps:extra.gaps||['One specific challenge, your decision, and its outcome.'],sources:e.sources||[]};
  });
}
export function buildExperienceIndex(library){
  // Give the answer model enough cross-project evidence to match meaning even
  // when lexical retrieval misses. Keep full technical packets separate.
  return library.map(d=>({id:d.id,title:d.title,role:d.role,
    summary:d.overview||d.pitch,
    examples:d.answerExamples||[],
    evidence:d.overview?[]:d.evidence.slice(0,2),
    sources:d.sources}));
}
export function explicitExperiences(library,text){return library.filter(d=>d.aliases.some(a=>includesAlias(text,a)));}
export function selectExperiences(library,question,{previousQuestion='',deep=false}={}){
  const named=text=>explicitExperiences(library,text);
  let found=named(question);
  if(!found.length)found=library.filter(d=>d.behavioralTopics.some(topic=>includesAlias(question,topic)));
  if(!found.length&&previousQuestion&&/\b(that|it|those|this|test|tradeoff|trade-off|instead|choose|choice|scale|learn|different|approach|decision|why)\b/i.test(question))found=named(previousQuestion);
  if(!found.length){
    const query=[...new Set(words(question).filter(w=>!stop.has(w)))];
    found=library.map(d=>{const body=new Set(words([d.title,d.overview,...d.evidence.map(c=>c.text),...d.observations.map(c=>c.text)].join(' ')));return {d,score:query.reduce((n,w)=>n+(body.has(w)?1:0),0)};}).filter(x=>x.score>=2).sort((a,b)=>b.score-a.score).slice(0,deep?3:2).map(x=>x.d);
  }
  const query=new Set(words(question).filter(w=>!stop.has(w)));
  const ranked=(items,limit)=>items.map((item,index)=>({item,index,score:words(item.text).reduce((n,w)=>n+(query.has(w)?1:0),0)})).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(x=>x.item);
  return found.slice(0,3).map(({aliases,...d})=>deep?d:{...d,evidence:ranked(d.evidence,7),observations:ranked(d.observations,3),followUps:d.followUps.slice(0,4)});
}
export function libraryMarkdown(library){
  return '# Interview experience reference\n\nPrepared from the experience database, user statements, and cited local source observations. These notes support an answer; they do not establish missing personal incidents or motivations.\n\n'+library.map(d=>
    `## ${d.title}\n\n${[d.role,d.organization,d.dates].filter(Boolean).join(' | ')}\n\n${d.pitch}\n\n${d.overview}\n\nRecruiter relevance: ${d.recruiterValue||'Use the concrete contribution and outcome below.'}\n\n### Evidence and technical detail\n\n`+
    d.evidence.map(c=>`- ${c.text}\n  Contribution: ${c.ownership}. Source: ${c.id}. ${c.limits.length?'Limits: '+c.limits.join(' '):''}`).join('\n')+
    '\n\n'+d.observations.map(o=>`- ${o.text}\n  Source: ${o.source}. Scope: ${o.scope}`).join('\n')+
    '\n\n### Recorded outcomes\n\n'+(d.metrics.map(m=>`- ${stringify(m.value)} ${m.unit}. ${m.limits}`).join('\n')||'Use the deliverables above; no additional quantified outcome is supplied.')+
    '\n\n### Follow-up preparation\n\n'+d.followUps.map(q=>'- '+q).join('\n')+'\n\n### Details to supply\n\n'+d.gaps.map(q=>'- '+q).join('\n')+'\n'
  ).join('\n');
}
