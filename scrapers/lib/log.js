// Single-line JSON logger (AGENTS.md rule 5). info → stdout, warn/error → stderr.

function emit(level, component, msg, extra = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component,
    msg,
    ...extra,
  });
  if (level === "info") {
    process.stdout.write(line + "\n");
  } else {
    process.stderr.write(line + "\n");
  }
}

export function logger(component) {
  return {
    info: (msg, extra) => emit("info", component, msg, extra),
    warn: (msg, extra) => emit("warn", component, msg, extra),
    error: (msg, extra) => emit("error", component, msg, extra),
  };
}
