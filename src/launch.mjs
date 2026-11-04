import {spawn} from 'node:child_process';
import {mkdir,open,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4319);
const url=`http://127.0.0.1:${port}`;
async function running(){
  let response;
  try{response=await fetch(`${url}/api/config`,{signal:AbortSignal.timeout(1200)});}catch{return false;}
  const config=await response.json().catch(()=>({}));
  if(config.app!=='interview-notes')throw new Error('The port belongs to another app. Set PORT to a free port.');
  return true;
}
try{
  if(!await running()){
    const runtime=path.join(root,'.runtime');await mkdir(runtime,{recursive:true,mode:0o700});
    const logfile=path.join(runtime,'server.log');const log=await open(logfile,'a',0o600);await chmod(logfile,0o600);
    const child=spawn(process.execPath,[path.join(root,'src/server.mjs')],{cwd:root,detached:true,stdio:['ignore',log.fd,log.fd]});
    child.unref();await log.close();
    let ready=false;
    for(let attempt=0;attempt<50;attempt++){await new Promise(r=>setTimeout(r,200));if(await running()){ready=true;break;}}
    if(!ready)throw new Error(`App did not start. Check ${logfile}`);
  }
  console.log(`Interview notes is running at ${url}`);
  if(!process.argv.includes('--no-open')) {
    const command=process.platform==='darwin'?['open','-a','Google Chrome',url]:process.platform==='win32'?['explorer.exe',url]:['xdg-open',url];
    const browser=spawn(command[0],command.slice(1),{stdio:'ignore'});
    browser.on('error',()=>console.log(`Open ${url} in your browser.`));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
