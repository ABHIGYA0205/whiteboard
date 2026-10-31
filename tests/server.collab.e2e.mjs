// End-to-end: two clients, one patched server, concurrent saves + socket traffic.
import { io } from "socket.io-client";
const API = "http://127.0.0.1:4001";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const el = (id, x=0) => ({ id, type:"rectangle", x, y:0, width:10, height:10, strokeColor:"#fff", strokeWidth:2, points:[] });
const post = (p,b) => fetch(API+p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b||{})}).then(r=>r.json());
const put = (id,b) => fetch(`${API}/board/${id}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(b)});
const getId = async id => (await fetch(`${API}/board/${id}`)).json();

const results = [];
const check = (name, pass, detail) => { results.push({name,pass,detail}); console.log(`${pass?"PASS":"FAIL"}  ${name}${detail?"  "+JSON.stringify(detail):""}`); };

// --- 1. two stale full-array saves must not clobber each other (server-side merge)
{
  const board = await post("/board");
  // Alice saves {a1}; Bob (whose view predates a1) saves {b1} one after the other.
  await put(board.id, { elements: [el("a1")], version: 0 });
  await put(board.id, { elements: [el("b1")], version: 1 });
  const after = await getId(board.id);
  const ids = after.elements.map(e => e.id).sort();
  check("concurrent partial saves keep both clients' work (REST)", JSON.stringify(ids)===JSON.stringify(["a1","b1"]), ids);
}

// --- 2. explicit delete still deletes
{
  const board = await post("/board");
  await put(board.id, { elements: [el("a1"), el("b1")], version: 0 });
  await put(board.id, { elements: [el("a1")], version: 1, deletedIds: ["b1"] });
  const after = await getId(board.id);
  check("explicit delete persists", JSON.stringify(after.elements.map(e=>e.id))===JSON.stringify(["a1"]), after.elements.map(e=>e.id));
}

// --- 3. a deleted element cannot be resurrected by the other client's stale snapshot
{
  const board = await post("/board");
  await put(board.id, { elements: [el("a1"), el("b1")], version: 0 });
  await put(board.id, { elements: [el("a1")], version: 1, deletedIds: ["b1"] });
  await put(board.id, { elements: [el("a1"), el("b1")], version: 2 }); // stale peer re-saves b1
  const after = await getId(board.id);
  check("deleted element is not resurrected by a stale save", !after.elements.some(e=>e.id==="b1"), after.elements.map(e=>e.id));
}

// --- 4. realtime: Alice drawing must never make Bob's in-progress board shrink
{
  const board = await post("/board");
  const mk = (name) => new Promise(res => {
    const s = io(API, { transports:["websocket"], auth:{userId:name} });
    s.on("connect", () => { s.emit("join-board",{boardId:board.id,userName:name}); res(s); });
  });
  const alice = await mk("alice"), bob = await mk("bob");
  await sleep(400);
  let bobLastReplace = null;
  bob.on("replace-elements", p => { bobLastReplace = p; });
  // Bob draws two shapes and pushes his board.
  bob.emit("draw", { boardId: board.id, element: el("b1") });
  bob.emit("draw", { boardId: board.id, element: el("b2") });
  await put(board.id, { elements: [el("b1"), el("b2")], version: 0 });
  // Alice, who has not received those draws yet in a real race, sends only her own.
  alice.emit("replace-elements", { boardId: board.id, elements: [el("a1")], version: 1 });
  await sleep(900);
  const after = await getId(board.id);
  const ids = after.elements.map(e=>e.id).sort();
  check("peer replace-elements does not erase other users' shapes", JSON.stringify(ids)===JSON.stringify(["a1","b1","b2"]), ids);
  check("replace-elements broadcast carries tombstones", Array.isArray(bobLastReplace?.deletedIds), {deletedIds: bobLastReplace?.deletedIds});
  alice.close(); bob.close();
}

// --- 5. board:state on reconnect is a snapshot, and the client merge keeps local work
{
  const board = await post("/board");
  const s = io(API,{transports:["websocket"],auth:{userId:"carol"}});
  await new Promise(r=>s.on("connect",r));
  s.emit("join-board",{boardId:board.id,userName:"carol"});
  const state = await new Promise(r=>s.once("board:state",r));
  check("join delivers board:state for the client-side merge", Array.isArray(state.elements), {version:state.version});
  s.close();
}

const failed = results.filter(r=>!r.pass).length;
console.log(`\n${results.length-failed}/${results.length} passed`);
process.exit(failed?1:0);
