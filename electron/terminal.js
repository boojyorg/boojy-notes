import pty from "node-pty";
import fs from "node:fs";
import os from "node:os";

const terminals = new Map(); // id → { pty, cols, rows }
let idCounter = 0;

// Warm PTY pool — pre-spawned shells ready for instant use
const warmPool = []; // { proc, shell, cwd, cols, rows, buffer, exited }

function resolveShell(preferred) {
  let shell = preferred || process.env.SHELL;
  if (!shell || !fs.existsSync(shell)) {
    for (const candidate of ["/bin/zsh", "/bin/bash", "/bin/sh"]) {
      if (fs.existsSync(candidate)) {
        shell = candidate;
        break;
      }
    }
  }
  return shell;
}

function resolveCwd(preferred, getNotesDir) {
  const home = os.homedir();
  let cwd = preferred || (getNotesDir ? getNotesDir() : home);
  // Resolve to absolute and validate within home directory
  const path = require("node:path");
  cwd = path.resolve(cwd);
  if (!cwd.startsWith(home + path.sep) && cwd !== home) {
    cwd = home;
  }
  if (!fs.existsSync(cwd)) {
    try {
      fs.mkdirSync(cwd, { recursive: true });
    } catch {}
  }
  if (!fs.existsSync(cwd)) cwd = home;
  return cwd;
}

function preSpawnTerminal(getNotesDir) {
  const shell = resolveShell();
  const cwd = resolveCwd(null, getNotesDir);
  const cols = 80;
  const rows = 24;

  let proc;
  try {
    proc = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: "xterm-256color", PROMPT_EOL_MARK: "" },
    });
  } catch {
    return; // pty.spawn failed — skip silently
  }

  const warm = { proc, shell, cwd, cols, rows, buffer: "", exited: false };

  proc.onData((data) => {
    warm.buffer += data;
  });
  proc.onExit(() => {
    warm.exited = true;
  });

  warmPool.push(warm);
}

function claimWarm(opts, getNotesDir) {
  const wantShell = resolveShell(opts.shell);
  const wantCwd = resolveCwd(opts.cwd, getNotesDir);

  for (let i = 0; i < warmPool.length; i++) {
    const warm = warmPool[i];
    if (warm.exited) {
      warmPool.splice(i, 1);
      i--;
      continue;
    }
    if (warm.shell === wantShell && warm.cwd === wantCwd) {
      warmPool.splice(i, 1);
      return warm;
    }
  }
  return null;
}

function killWarmPool() {
  for (const warm of warmPool) {
    if (!warm.exited) {
      try {
        warm.proc.kill();
      } catch {}
    }
  }
  warmPool.length = 0;
}

export function registerTerminalIPC(ipcMain, getMainWindow, getNotesDir) {
  // Pre-spawn a warm PTY after a short delay so it doesn't block app startup
  setTimeout(() => preSpawnTerminal(getNotesDir), 2000);

  ipcMain.handle("terminal:create", (_event, opts = {}) => {
    const id = `term-${++idCounter}`;
    const warm = claimWarm(opts, getNotesDir);

    if (warm) {
      // Use pre-spawned PTY — instant startup
      const { proc, cols, rows } = warm;

      // Resize if requested dimensions differ
      const wantCols = opts.cols || 80;
      const wantRows = opts.rows || 24;
      if (wantCols !== cols || wantRows !== rows) {
        try {
          proc.resize(wantCols, wantRows);
        } catch {}
      }

      const entry = { pty: proc, cols: wantCols, rows: wantRows };
      terminals.set(id, entry);

      // Replace buffering listeners with real forwarding
      proc.onData((data) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("terminal:data", { id, data });
        }
      });
      proc.onExit(({ exitCode }) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("terminal:exit", { id, exitCode });
        }
        terminals.delete(id);
      });

      // Flush buffered output (the prompt) to the renderer
      if (warm.buffer) {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("terminal:data", { id, data: warm.buffer });
        }
      }

      // Pre-spawn another warm PTY for the next terminal
      setTimeout(() => preSpawnTerminal(getNotesDir), 100);

      const shell = warm.shell;
      return { id, pid: proc.pid, title: opts.title || shell.split("/").pop(), cwd: warm.cwd };
    }

    // No warm PTY available — fall back to normal spawn
    const shell = resolveShell(opts.shell);
    const cwd = resolveCwd(opts.cwd, getNotesDir);
    const cols = opts.cols || 80;
    const rows = opts.rows || 24;

    const proc = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: "xterm-256color", PROMPT_EOL_MARK: "" },
    });

    const entry = { pty: proc, cols, rows };
    terminals.set(id, entry);

    // Forward PTY output → renderer
    proc.onData((data) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("terminal:data", { id, data });
      }
    });

    // Forward PTY exit → renderer
    proc.onExit(({ exitCode }) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("terminal:exit", { id, exitCode });
      }
      terminals.delete(id);
    });

    // Pre-spawn a warm PTY for the next terminal
    setTimeout(() => preSpawnTerminal(getNotesDir), 100);

    return { id, pid: proc.pid, title: opts.title || shell.split("/").pop(), cwd };
  });

  ipcMain.on("terminal:write", (_event, { id, data }) => {
    const entry = terminals.get(id);
    if (entry) entry.pty.write(data);
  });

  ipcMain.on("terminal:resize", (_event, { id, cols, rows }) => {
    const entry = terminals.get(id);
    if (entry && cols > 0 && rows > 0) {
      try {
        entry.pty.resize(cols, rows);
      } catch {}
      entry.cols = cols;
      entry.rows = rows;
    }
  });

  ipcMain.handle("terminal:kill", (_event, id) => {
    const entry = terminals.get(id);
    if (entry) {
      try {
        entry.pty.kill();
      } catch {}
      terminals.delete(id);
      return true;
    }
    return false;
  });

  ipcMain.handle("terminal:kill-all", () => {
    for (const [id, entry] of terminals) {
      try {
        entry.pty.kill();
      } catch {}
      terminals.delete(id);
    }
    killWarmPool();
    return true;
  });
}

export function killAllTerminals() {
  for (const [id, entry] of terminals) {
    try {
      entry.pty.kill();
    } catch {}
    terminals.delete(id);
  }
  killWarmPool();
}
