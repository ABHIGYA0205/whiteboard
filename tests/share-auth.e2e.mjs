import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { io } from "socket.io-client";

const API = process.env.API_URL || "http://127.0.0.1:4001";
let serverProcess = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureServer() {
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
      BOARD_SECRET: "test-board-secret-32-chars-long!"
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
      const res = await fetch(`${API}/health`);
      if (res.ok) {
        console.log("Server ready.");
        return;
      }
    } catch {}
  }

  throw new Error("Server failed to respond to /health within 10s");
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

  // k) Legacy board created without ownerId allows unauthenticated GET with claimable: true,
  //    can be claimed via POST /board/:id/claim which returns ownerToken and sets ownerId,
  //    and subsequent GET without a token returns 401.
  {
    const legacyCreate = await fetch(`${API}/board?legacy=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const legacyBoard = await legacyCreate.json();
    const legacyIsClaimable = legacyBoard.claimable === true;
    const noOwnerToken = !legacyBoard.ownerToken;

    // Unauthenticated GET
    const unauthGet = await fetch(`${API}/board/${legacyBoard.id}`);
    const unauthData = await unauthGet.json();
    const unauthPass = unauthGet.status === 200 && unauthData.claimable === true;

    // Claim board
    const claimRes = await fetch(`${API}/board/${legacyBoard.id}/claim`, { method: "POST" });
    const claimData = await claimRes.json();
    const claimPass =
      claimRes.status === 200 &&
      Boolean(claimData.ownerToken) &&
      claimData.board?.ownerId ===
        crypto.createHash("sha256").update(claimData.ownerToken).digest("hex");

    // Second claim must fail with 409
    const secondClaim = await fetch(`${API}/board/${legacyBoard.id}/claim`, { method: "POST" });
    const secondClaimData = await secondClaim.json();
    const secondClaimPass = secondClaim.status === 409 && secondClaimData.code === "ALREADY_CLAIMED";

    // Subsequent untokened GET returns 401
    const claimedUntokenedGet = await fetch(`${API}/board/${legacyBoard.id}`);
    const claimedUntokenedData = await claimedUntokenedGet.json();
    const claimedUntokenedPass =
      claimedUntokenedGet.status === 401 && claimedUntokenedData.code === "TOKEN_REQUIRED";

    check(
      "k) Legacy board allows unauthenticated GET, can be claimed once, and enforces 401 thereafter",
      legacyIsClaimable && noOwnerToken && unauthPass && claimPass && secondClaimPass && claimedUntokenedPass,
      {
        legacyIsClaimable,
        unauthStatus: unauthGet.status,
        claimStatus: claimRes.status,
        secondClaimStatus: secondClaim.status,
        claimedUntokenedStatus: claimedUntokenedGet.status
      }
    );
  }

  // l) Socket server enforcement: join-denied on claimed board without token or invalid token
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

    check("l) Socket join on claimed board without token receives join-denied (TOKEN_REQUIRED)", socketDeniedTest);
  }

  // m) Socket server enforcement: join with viewer token succeeds
  {
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

    check("m) Socket join with valid viewer token receives board:state", socketViewerTest);
  }

  console.log(`\nResults: ${results.filter(Boolean).length} / ${results.length} checks passed.\n`);

  if (serverProcess) {
    serverProcess.kill();
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
  process.exit(1);
});
