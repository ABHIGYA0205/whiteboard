import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import { io } from "socket.io-client";

const API = process.env.API_URL || "http://127.0.0.1:4001";
let serverProcess = null;
let mongoProcess = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureMongo() {
  try {
    const s = new net.Socket();
    await new Promise((resolve, reject) => {
      s.connect(27017, "127.0.0.1", () => {
        s.destroy();
        resolve(true);
      });
      s.on("error", reject);
    });
    return;
  } catch {}

  try {
    fs.mkdirSync("/tmp/test-mongo", { recursive: true });
    const mongodPath = fs.existsSync("/opt/homebrew/bin/mongod")
      ? "/opt/homebrew/bin/mongod"
      : "mongod";
    mongoProcess = spawn(mongodPath, ["--dbpath", "/tmp/test-mongo", "--port", "27017"], {
      stdio: "pipe"
    });
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      try {
        const s = new net.Socket();
        const connected = await new Promise((resolve) => {
          s.connect(27017, "127.0.0.1", () => {
            s.destroy();
            resolve(true);
          });
          s.on("error", () => resolve(false));
        });
        if (connected) {
          console.log("Local mongod started on port 27017.");
          return;
        }
      } catch {}
    }
  } catch (err) {
    console.warn("Could not start local mongod:", err.message);
  }
}

async function ensureServer() {
  await ensureMongo();

  try {
    const res = await fetch(`${API}/health`);
    if (res.ok) return;
  } catch {}

  console.log("Starting backend server for test...");
  serverProcess = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: "server",
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: "4001",
      BOARD_SECRET: "test-board-secret-32-chars-long!",
      NODE_ENV: "test"
    }
  });

  serverProcess.stderr.on("data", (chunk) => {
    const msg = chunk.toString();
    if (msg.includes("Error:") || msg.includes("throw")) {
      process.stderr.write(chunk);
    }
  });

  for (let i = 0; i < 50; i++) {
    await sleep(200);
    try {
      const res = await fetch(`${API}/health/ready`);
      if (res.ok) {
        console.log("Server and MongoDB ready.");
        return;
      }
    } catch {}
  }

  throw new Error("Server failed to respond to /health/ready within 10s");
}

function runScript(args = []) {
  return new Promise((resolve) => {
    const p = spawn("node", ["server/scripts/migrate-owner-ids.mjs", ...args], {
      stdio: "pipe"
    });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + JSON.stringify(detail) : ""}`);
}

async function run() {
  await ensureServer();

  console.log("\n--- Running Board Role & Token E2E Verification ---\n");

  // a) POST /board returns ownerToken; server stores ownerId as a sha256 hash, not the token.
  let board;
  {
    const res = await fetch(`${API}/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const statusOk = res.status === 201;
    board = await res.json();
    const hasOwnerToken = Boolean(board.ownerToken && typeof board.ownerToken === "string");
    const hasOwnerId = Boolean(board.ownerId && typeof board.ownerId === "string");
    const notRawToken = board.ownerId !== board.ownerToken;
    const expectedHash = hasOwnerToken
      ? crypto.createHash("sha256").update(board.ownerToken).digest("hex")
      : null;
    const hashMatches = board.ownerId === expectedHash;

    check(
      "a) POST /board returns ownerToken and stores ownerId as sha256 hash",
      statusOk && hasOwnerToken && hasOwnerId && notRawToken && hashMatches,
      { status: res.status, hasOwnerToken, notRawToken, hashMatches }
    );
  }

  // b) GET /board/:id without a token on that new board returns 401 TOKEN_REQUIRED.
  {
    const res = await fetch(`${API}/board/${board.id}`);
    const data = await res.json();
    const pass = res.status === 401 && data.code === "TOKEN_REQUIRED";
    check("b) GET /board/:id without token returns 401 TOKEN_REQUIRED", pass, {
      status: res.status,
      code: data.code
    });
  }

  // c) GET /board/:id with Authorization: Bearer <ownerToken> returns 200.
  {
    const res = await fetch(`${API}/board/${board.id}`, {
      headers: { Authorization: `Bearer ${board.ownerToken}` }
    });
    const data = await res.json();
    const pass = res.status === 200 && data.id === board.id;
    check("c) GET /board/:id with Authorization: Bearer <ownerToken> returns 200", pass, {
      status: res.status,
      boardId: data.id
    });
  }

  // d) POST /board/:id/share with { role: 'viewer' } using ownerToken returns a viewer token and url.
  let viewerToken;
  let viewerUrl;
  {
    const res = await fetch(`${API}/board/${board.id}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${board.ownerToken}`
      },
      body: JSON.stringify({ role: "viewer" })
    });
    const data = await res.json();
    viewerToken = data.token;
    viewerUrl = data.url;
    const pass =
      res.status === 200 &&
      Boolean(viewerToken) &&
      Boolean(viewerUrl) &&
      viewerUrl.includes(`?share=${viewerToken}`);
    check("d) POST /board/:id/share with viewer role returns token & url", pass, {
      status: res.status,
      hasToken: Boolean(viewerToken),
      hasUrl: Boolean(viewerUrl)
    });
  }

  // e) GET /board/:id using that viewer token returns 200.
  {
    const res = await fetch(`${API}/board/${board.id}`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    const pass = res.status === 200;
    check("e) GET /board/:id using viewer token returns 200", pass, { status: res.status });
  }

  // f) PUT /board/:id and POST /board/:id/ops using that viewer token return 403 FORBIDDEN.
  {
    const putRes = await fetch(`${API}/board/${board.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerToken}`
      },
      body: JSON.stringify({ elements: [] })
    });
    const putData = await putRes.json();
    const putPass = putRes.status === 403 && putData.code === "FORBIDDEN";

    const opsRes = await fetch(`${API}/board/${board.id}/ops`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerToken}`
      },
      body: JSON.stringify({
        ops: [
          {
            op: "add",
            element: {
              id: "v-shape-1",
              type: "rectangle",
              x: 10,
              y: 10,
              width: 50,
              height: 50,
              strokeColor: "#ffffff",
              strokeWidth: 2,
              points: []
            }
          }
        ]
      })
    });
    const opsData = await opsRes.json();
    const opsPass = opsRes.status === 403 && opsData.code === "FORBIDDEN";

    check("f) PUT and POST /ops using viewer token return 403 FORBIDDEN", putPass && opsPass, {
      putStatus: putRes.status,
      putCode: putData.code,
      opsStatus: opsRes.status,
      opsCode: opsData.code
    });
  }

  // g) POST /board/:id/share with { role: 'editor' } using ownerToken returns an editor token;
  //    PUT /board/:id using the editor token returns 200.
  let editorToken;
  {
    const res = await fetch(`${API}/board/${board.id}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${board.ownerToken}`
      },
      body: JSON.stringify({ role: "editor" })
    });
    const data = await res.json();
    editorToken = data.token;

    const putRes = await fetch(`${API}/board/${board.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editorToken}`
      },
      body: JSON.stringify({
        elements: [
          {
            id: "ed-shape-1",
            type: "rectangle",
            x: 20,
            y: 20,
            width: 100,
            height: 80,
            strokeColor: "#ffffff",
            strokeWidth: 2,
            points: []
          }
        ]
      })
    });
    const putPass = putRes.status === 200;
    check("g) Editor token allows PUT /board/:id (returns 200)", res.status === 200 && putPass, {
      shareStatus: res.status,
      putStatus: putRes.status
    });
  }

  // h) POST /board/:id/share using the editor token returns 403 FORBIDDEN (only owners can share).
  {
    const res = await fetch(`${API}/board/${board.id}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editorToken}`
      },
      body: JSON.stringify({ role: "viewer" })
    });
    const data = await res.json();
    const pass = res.status === 403 && data.code === "FORBIDDEN";
    check("h) POST /board/:id/share using editor token returns 403 FORBIDDEN", pass, {
      status: res.status,
      code: data.code
    });
  }

  // i) Share token generated with ttlHours: 0 returns 401 TOKEN_INVALID immediately.
  {
    const res = await fetch(`${API}/board/${board.id}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${board.ownerToken}`
      },
      body: JSON.stringify({ role: "viewer", ttlHours: 0 })
    });
    const data = await res.json();
    const expiredToken = data.token;

    const getRes = await fetch(`${API}/board/${board.id}`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    const getData = await getRes.json();
    const pass = getRes.status === 401 && getData.code === "TOKEN_INVALID";
    check("i) Share token with ttlHours: 0 immediately returns 401 TOKEN_INVALID", pass, {
      status: getRes.status,
      code: getData.code
    });
  }

  // j) Tampered token (modified payload or signature) returns 401 TOKEN_INVALID.
  {
    const [payloadB64, sigB64] = viewerToken.split(".");
    const tamperedSigToken = `${payloadB64}.${sigB64.slice(0, -4)}xxxx`;

    const resSig = await fetch(`${API}/board/${board.id}`, {
      headers: { Authorization: `Bearer ${tamperedSigToken}` }
    });
    const dataSig = await resSig.json();
    const sigPass = resSig.status === 401 && dataSig.code === "TOKEN_INVALID";

    const payloadObj = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    payloadObj.role = "owner";
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const tamperedPayloadToken = `${tamperedPayloadB64}.${sigB64}`;

    const resPayload = await fetch(`${API}/board/${board.id}`, {
      headers: { Authorization: `Bearer ${tamperedPayloadToken}` }
    });
    const dataPayload = await resPayload.json();
    const payloadPass = resPayload.status === 401 && dataPayload.code === "TOKEN_INVALID";

    check("j) Tampered token signature and payload return 401 TOKEN_INVALID", sigPass && payloadPass, {
      sigStatus: resSig.status,
      sigCode: dataSig.code,
      payloadStatus: resPayload.status,
      payloadCode: dataPayload.code
    });
  }

  // Socket tests
  {
    const socketDeniedTest = await new Promise((resolve) => {
      const s = io(API, {
        transports: ["websocket"],
        auth: { userId: "unauth-socket-user" }
      });

      s.on("connect", () => {
        s.emit("join-board", { boardId: board.id });
      });

      s.on("join-denied", ({ boardId: deniedId, code }) => {
        s.disconnect();
        resolve(deniedId === board.id && code === "TOKEN_REQUIRED");
      });

      setTimeout(() => {
        s.disconnect();
        resolve(false);
      }, 3000);
    });

    check("Socket join on claimed board without token receives join-denied (TOKEN_REQUIRED)", socketDeniedTest);

    const socketViewerTest = await new Promise((resolve) => {
      const s = io(API, {
        transports: ["websocket"],
        auth: { userId: "viewer-socket-user", token: viewerToken }
      });

      s.on("connect", () => {
        s.emit("join-board", { boardId: board.id, token: viewerToken });
      });

      s.on("board:state", () => {
        s.disconnect();
        resolve(true);
      });

      s.on("join-denied", () => {
        s.disconnect();
        resolve(false);
      });

      setTimeout(() => {
        s.disconnect();
        resolve(false);
      }, 3000);
    });

    check("Socket join with valid viewer token receives board:state", socketViewerTest);
  }

  console.log("\n--- Testing Legacy UUID OwnerId & Migration ---\n");

  // 1. Seed a board with ownerId = a uuid (simulating pre-migration data)
  const legacyUuid = crypto.randomUUID();
  let legacyBoard;
  {
    const res = await fetch(`${API}/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legacy: true, ownerId: legacyUuid })
    });
    legacyBoard = await res.json();
    const pass = res.status === 201 && legacyBoard.claimable === true && !legacyBoard.ownerToken;
    check("1) Seed board with ownerId = legacy UUID (returns claimable: true, no ownerToken)", pass, {
      status: res.status,
      claimable: legacyBoard.claimable,
      hasToken: Boolean(legacyBoard.ownerToken)
    });
  }

  // 2. GET without a token -> 200 with claimable: true
  {
    const res = await fetch(`${API}/board/${legacyBoard.id}`);
    const data = await res.json();
    const pass =
      res.status === 200 &&
      data.claimable === true &&
      (!data.ownerId || !/^[0-9a-f]{64}$/.test(data.ownerId));
    check("2) GET without token on legacy UUID board returns 200 with claimable: true", pass, {
      status: res.status,
      claimable: data.claimable,
      ownerId: data.ownerId
    });
  }

  // 3. POST /claim -> 200 with ownerToken, and ownerId becomes a 64-char sha256 hex
  let claimedToken;
  {
    const res = await fetch(`${API}/board/${legacyBoard.id}/claim`, { method: "POST" });
    const data = await res.json();
    claimedToken = data.ownerToken;
    const hasToken = Boolean(claimedToken);
    const ownerId = data.board?.ownerId;
    const isSha256Hex = typeof ownerId === "string" && /^[0-9a-f]{64}$/.test(ownerId);
    const expectedHash = hasToken
      ? crypto.createHash("sha256").update(claimedToken).digest("hex")
      : null;
    const matches = ownerId === expectedHash;

    check(
      "3) POST /claim on legacy board returns ownerToken and sets ownerId to 64-char sha256 hex",
      res.status === 200 && hasToken && isSha256Hex && matches,
      { status: res.status, isSha256Hex, matches }
    );
  }

  // 4. After claiming: GET without token -> 401; GET with new token -> 200
  {
    const unauthRes = await fetch(`${API}/board/${legacyBoard.id}`);
    const unauthData = await unauthRes.json();
    const unauthPass = unauthRes.status === 401 && unauthData.code === "TOKEN_REQUIRED";

    const authRes = await fetch(`${API}/board/${legacyBoard.id}`, {
      headers: { Authorization: `Bearer ${claimedToken}` }
    });
    const authData = await authRes.json();
    const authPass = authRes.status === 200 && authData.id === legacyBoard.id;

    check(
      "4) After claiming: GET without token returns 401, GET with token returns 200",
      unauthPass && authPass,
      { unauthStatus: unauthRes.status, unauthCode: unauthData.code, authStatus: authRes.status }
    );
  }

  // 5. A board with a real hash ownerId still returns claimable: false and 409 on claim
  {
    const claimAgainRes = await fetch(`${API}/board/${legacyBoard.id}/claim`, { method: "POST" });
    const claimAgainData = await claimAgainRes.json();
    const pass = claimAgainRes.status === 409 && claimAgainData.code === "ALREADY_CLAIMED";
    check("5) Board with real hash ownerId returns 409 ALREADY_CLAIMED on claim", pass, {
      status: claimAgainRes.status,
      code: claimAgainData.code
    });
  }

  // 6. The migration script reports the legacy board in dry-run and nulls it with --apply
  {
    const legacyUuid2 = crypto.randomUUID();
    const seedRes = await fetch(`${API}/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legacy: true, ownerId: legacyUuid2 })
    });
    const boardToMigrate = await seedRes.json();

    // Dry-run
    const dryRun = await runScript([]);
    const dryRunPass =
      dryRun.code === 0 &&
      dryRun.stdout.includes(boardToMigrate.id) &&
      dryRun.stdout.includes("Updated: 0");

    // Apply
    const applyRun = await runScript(["--apply"]);
    const applyPass =
      applyRun.code === 0 &&
      applyRun.stdout.includes(boardToMigrate.id) &&
      applyRun.stdout.includes("Updated:");

    // Subsequent GET without token -> 200 with claimable: true
    const getRes = await fetch(`${API}/board/${boardToMigrate.id}`);
    const getData = await getRes.json();
    const getPass = getRes.status === 200 && getData.claimable === true;

    // Idempotency: second apply should find 0 legacy boards
    const secondApply = await runScript(["--apply"]);
    const secondApplyPass =
      secondApply.code === 0 && secondApply.stdout.includes("Legacy boards found: 0");

    check(
      "6) Migration script reports in dry-run, nulls ownerId with --apply, and is idempotent",
      dryRunPass && applyPass && getPass && secondApplyPass,
      {
        dryRunCode: dryRun.code,
        applyCode: applyRun.code,
        getClaimable: getData.claimable,
        idempotent: secondApplyPass
      }
    );
  }

  console.log(`\nResults: ${results.filter(Boolean).length} / ${results.length} checks passed.\n`);

  if (serverProcess) {
    serverProcess.kill();
  }
  if (mongoProcess) {
    mongoProcess.kill();
  }

  if (results.some((pass) => !pass)) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  if (serverProcess) serverProcess.kill();
  if (mongoProcess) mongoProcess.kill();
  process.exit(1);
});
