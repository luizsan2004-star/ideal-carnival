// Serviço de verificação de números (WhatsApp Web via Baileys). NÃO envia mensagens, só consulta se o número existe.
import makeWASocket,{useMultiFileAuthState,DisconnectReason,fetchLatestBaileysVersion,Browsers} from "@whiskeysockets/baileys";
import pino from "pino"; import QRCode from "qrcode"; import http from "http"; import fs from "fs";
const PORT=process.env.PORT||3001, ORIGIN=process.env.ORIGIN||"*";
let sock,st="connecting",qr=null,me=null;

async function start(){
  const {state,saveCreds}=await useMultiFileAuthState("auth");
  const {version}=await fetchLatestBaileysVersion();
  sock=makeWASocket({version,auth:state,logger:pino({level:"silent"}),browser:Browsers.macOS("Dabang"),syncFullHistory:false,markOnlineOnConnect:false});
  sock.ev.on("creds.update",saveCreds);
  sock.ev.on("connection.update",async u=>{
    if(u.qr){qr=await QRCode.toDataURL(u.qr,{width:280,margin:1});st="qr"}
    if(u.connection==="open"){st="open";qr=null;me=(sock.user?.id||"").split(":")[0]}
    if(u.connection==="close"){
      const code=u.lastDisconnect?.error?.output?.statusCode;
      qr=null;me=null;st="connecting";
      if(code===DisconnectReason.loggedOut)fs.rmSync("auth",{recursive:true,force:true});
      setTimeout(boot,2000);
    }
  });
}

// Fila (uma consulta por vez, com intervalo) + cache de 10 min, para não levantar suspeita do WhatsApp
let chain=Promise.resolve();const cache=new Map();
function check(n){
  const d=String(n).replace(/\D/g,"");
  const c=cache.get(d);if(c&&Date.now()-c.t<6e5)return Promise.resolve(c.v);
  const p=chain.then(async()=>{
    const r=await sock.onWhatsApp(d);const v=!!(r&&r[0]&&r[0].exists);
    cache.set(d,{v,t:Date.now()});await new Promise(x=>setTimeout(x,1200));return v;
  });
  chain=p.catch(()=>{});return p;
}

http.createServer(async(req,res)=>{
  const h={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"*","Content-Type":"application/json"};
  const send=(c,o)=>{res.writeHead(c,h);res.end(JSON.stringify(o))};
  if(req.method==="OPTIONS")return send(204,{});
  const u=new URL(req.url,"http://x");
  try{
    if(u.pathname==="/"||u.pathname==="/health")return send(200,{ok:true,state:st});
    if(u.pathname==="/status")return send(200,{state:st,qr,number:me});
    if(u.pathname==="/check"){
      if(st!=="open")return send(503,{error:"WhatsApp não conectado"});
      const n=u.searchParams.get("n")||"";if(n.replace(/\D/g,"").length<10)return send(400,{error:"número inválido"});
      return send(200,{exists:await check(n)});
    }
    if(u.pathname==="/logout"&&req.method==="POST"){await sock.logout().catch(()=>{});return send(200,{ok:true})}
    send(404,{error:"não encontrado"});
  }catch(e){send(500,{error:String(e.message||e)})}
}).listen(PORT,()=>console.log("Verificador rodando na porta "+PORT));
process.on("unhandledRejection",e=>console.error("erro:",e));
process.on("uncaughtException",e=>console.error("erro:",e));
const boot=()=>start().catch(e=>{console.error("falha ao iniciar o WhatsApp:",e);setTimeout(boot,5000)});
boot();
