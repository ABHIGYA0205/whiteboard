// Proves: (1) an un-autosaved stroke is served to a client that reconnects,
//          (2) a dropped socket comes back and live sync resumes.
import { io } from "socket.io-client";
const API="http://127.0.0.1:4001";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const el=(id,x=0)=>({id,type:"rectangle",x,y:0,width:10,height:10,strokeColor:"#fff",strokeWidth:2,points:[]});
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?"PASS":"FAIL"}  ${n}${d?"  "+JSON.stringify(d):""}`);};

const board=(await (await fetch(`${API}/board`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).json()).id;

// drawer keeps the board ONLY in memory (draw events are not persisted)
const drawer=io(API,{transports:["websocket"],auth:{userId:"drawer"}});
await new Promise(r=>drawer.on("connect",r)); drawer.emit("join-board",{boardId:board,userName:"drawer"});
drawer.emit("draw",{boardId:board,element:el("live-shape")});
await sleep(300);

// a brand new client joins (same as a reconnect) — it must see the live shape
const late=io(API,{transports:["websocket"],auth:{userId:"late"}});
await new Promise(r=>late.on("connect",r));
const state=await new Promise(res=>{ late.once("board:state",res); late.emit("join-board",{boardId:board,userName:"late"}); });
check("reconnecting client sees un-autosaved live stroke", state.elements.some(e=>e.id==="live-shape"), {count:state.elements.length});

// now drop the late client and reconnect: sync must resume immediately
late.disconnect(); await sleep(300);
const again=io(API,{transports:["websocket"],auth:{userId:"late"},reconnection:true,reconnectionDelay:300});
await new Promise(r=>again.on("connect",r)); again.emit("join-board",{boardId:board,userName:"late"});
let got=0; again.on("draw",()=>got++);
drawer.emit("draw",{boardId:board,element:el("after-reconnect",55)});
await sleep(500);
check("live sync resumes after reconnect", got>0, {framesReceived:got});

// tombstones survive a reconnect too
drawer.emit("replace-elements",{boardId:board,elements:[el("after-reconnect",55)],deletedIds:["live-shape"]});
await sleep(400);
const late2=io(API,{transports:["websocket"],auth:{userId:"late2"}});
await new Promise(r=>late2.on("connect",r));
const st2=await new Promise(res=>{ late2.once("board:state",res); late2.emit("join-board",{boardId:board,userName:"late2"}); });
check("deleted element is not served back after reconnect", !st2.elements.some(e=>e.id==="live-shape"), {ids:st2.elements.map(e=>e.id)});

drawer.close(); again.close(); late2.close();
const failed=results.filter(r=>!r).length;
console.log(`\n${results.length-failed}/${results.length} passed`);
process.exit(failed?1:0);
