export class QuestionGate {
  constructor(){this.held=false;this.pending=null;this.last='';}
  offer(text,id,automatic=true){
    const key=text.trim().toLowerCase().replace(/\s+/g,' ');
    if(!key||key===this.last)return 'ignore';
    this.last=key;
    if(this.held||!automatic){this.pending={text,id};return 'queued';}
    this.pending=null;return 'answer';
  }
  take(){const next=this.pending;this.pending=null;return next;}
}
export function sessionExport({settings={},turns=[],suggestions=[],startedAt=null,elapsedMs=0}){
  return {version:1,exportedAt:new Date().toISOString(),startedAt,elapsedMs,
    interview:{company:settings.company||'',role:settings.role||'',stage:settings.stage||'',focus:settings.focus||''},
    note:'Automatic transcript, speakers unknown; segments are not necessarily complete questions or answers. Generated suggestions are not evidence of what was spoken. No audio is included. Received times are transcription-event times, not precise speech timestamps.',
    transcript:turns.map((t,i)=>({index:i+1,id:t.id,receivedAt:t.receivedAt||null,speaker:'unknown',text:t.text,complete:!!t.done})),
    generatedSuggestions:suggestions.map(s=>({createdAt:s.createdAt,question:s.question,text:s.text,style:s.style,status:s.status,spoken:false}))};
}
export function renderAnswer(element,text,outline=true){
  element.classList.toggle('outline-answer',outline);
  if(!outline){element.textContent=text;return;}
  const top=element.scrollTop;const fragment=document.createDocumentFragment();let opening=true,list=null;
  for(const raw of text.split(/\n+/)){
    const line=raw.trim();if(!line)continue;
    if(/^[-•]\s/.test(line)){
      if(!list){list=document.createElement('ul');list.className='answer-points';fragment.append(list);}
      const item=document.createElement('li');item.textContent=line.replace(/^[-•]\s+/,'');list.append(item);opening=false;
    }else{
      list=null;const p=document.createElement('p');p.className=/^Check:/i.test(line)?'answer-check':opening?'answer-opening':'answer-paragraph';p.textContent=line;fragment.append(p);opening=false;
    }
  }
  element.replaceChildren(fragment);element.scrollTop=top;
}
