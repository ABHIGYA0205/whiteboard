import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";

const children = [];

function runProcess(name, args, color) {
  const child = spawn(npmCmd, args, {
    stdio: ["inherit", "pipe", "pipe"],
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: "1" }
  });

  children.push(child);

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        process.stdout.write(`${color}[${name}]\x1b[0m ${line}\n`);
      }
    }
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        process.stderr.write(`${color}[${name}]\x1b[0m ${line}\n`);
      }
    }
  });

  child.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.log(`\x1b[31m[${name}] exited with code ${code}\x1b[0m`);
    }
    shutdown();
  });

  return child;
}

let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  for (const child of children) {
    try {
      if (isWindows) {
        spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"]);
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("\x1b[36mStarting Whiteboard development server (client + server)...\x1b[0m\n");
runProcess("server", ["run", "dev", "--workspace", "server"], "\x1b[35m");
runProcess("client", ["run", "dev", "--workspace", "client"], "\x1b[34m");
