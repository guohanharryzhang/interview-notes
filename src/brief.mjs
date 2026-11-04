const focusTerms={
  software:/software|python|api|backend|frontend|database|web|machine learning/ig,
  hardware:/hardware|electrical|circuit|instrument|measurement|sensor|manufactur|bench|test/ig,
  embedded:/embedded|firmware|microcontroller|robot|motor|serial|controller/ig,
  research:/research|experiment|study|simulation|analysis|scientific/ig,
  general:/project|team|lead|design|build|test/ig
};
const labels={software:'Software',hardware:'Electrical / hardware',embedded:'Embedded / robotics',research:'Research',general:'Engineering'};
export function inferFocus(settings={}){
  if(labels[settings.focus])return settings.focus;
  const role=settings.role||'';
  if(/embedded|firmware|robot|controls/i.test(role))return 'embedded';
  if(/software|\bswe\b|full.?stack|backend|front.?end|machine learning|\bAI\b|data engineer/i.test(role))return 'software';
  if(/electrical|hardware|analog|silicon|semiconductor|manufactur|validation|\bee\b|vlsi|asic|test engineer/i.test(role))return 'hardware';
  if(/research|scientist|materials/i.test(role))return 'research';
  return 'general';
}
export const isIntroduction=q=>/about yourself|introduc(?:e yourself|tion)|walk.*r[eé]sum[eé]|(?:your|my) (?:background|experience) (?:and|for this)|tell me (?:a little )?about your background/i.test(q);
export function buildBrief(library,settings={},prep=null){
  const focus=inferFocus(settings), order=Array.isArray(prep?.experienceOrder)?prep.experienceOrder:[];
  const score=d=>{
    const explicit=order.indexOf(d.id);
    if(explicit>=0)return 10000-explicit;
    const body=[d.title,d.role,d.overview,d.pitch,...(d.evidence||[]).map(e=>e.text)].join(' ');
    return ((d.tags||[]).includes(focus)?100:0)+(body.match(focusTerms[focus])||[]).length;
  };
  const stories=[...library].sort((a,b)=>score(b)-score(a)).slice(0,3).map(d=>({id:d.id,title:d.title,pitch:d.pitch}));
  const intern=/intern|co.?op/i.test(settings.role||'');
  const questions=settings.stage==='technical'
    ? ['What technical tradeoffs does this team face most often?','How are designs and changes reviewed and tested?','What should I prepare for the next round?']
    : settings.stage==='manager'
      ? ['What would you want the person in this role to accomplish first?','How does the team give feedback and divide ownership?','What distinguishes people who do particularly well here?']
      : [intern?'How are interns matched to teams and projects?':'How does this role fit the team’s current priorities?',intern?'What distinguishes interns who do particularly well here?':'What distinguishes people who do particularly well in this role?','What is the format of the next interview, and how should I prepare?'];
  return {focus,label:labels[focus],stage:settings.stage||'recruiter',stories,questions:Array.isArray(prep?.ask)&&prep.ask.length?prep.ask.slice(0,3):questions,
    needs:[!settings.companyResearch&&'Add one specific company fact with its source.',!settings.motivation&&'Add your own reason for wanting this role.'].filter(Boolean)};
}
export function overviewFacts(corpus,brief,limit=9){
  const selected=corpus.filter(f=>f.id==='profile');
  for(const story of brief.stories){
    const items=corpus.filter(f=>f.entity===story.id&&!f.id.startsWith('skill_'));
    const claims=items.filter(f=>!f.id.startsWith('entity:'));
    selected.push(...(claims.length?claims:items).slice(0,3));
  }
  return selected.slice(0,limit).map(({tokens,...fact})=>fact);
}
