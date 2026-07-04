const apiNameMap = {
  changeX: "change_x",
  changeY: "change_y",
  goTo: "go_to",
  setSize: "set_size",
  getVar: "get_var",
  setVar: "set_var",
  changeVar: "change_var",
  bounceOnEdge: "bounce_on_edge",
  touchingEdge: "touching_edge",
  setX: "set_x",
  setY: "set_y"
};

const reverseApiNameMap = Object.fromEntries(Object.entries(apiNameMap).map(([js, py]) => [py, js]));

export function downloadProjectFile(project) {
  return Promise.all(project.assets.map(assetToPortable)).then((assets) => {
    const payload = {
      format: "ScriptCraft",
      version: 1,
      exportedAt: new Date().toISOString(),
      title: project.title,
      description: project.description,
      published: false,
      thumbnailAssetId: project.thumbnailAssetId,
      data: project.data,
      assets
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `${slug(project.title || "scriptcraft-project")}.scriptcraft`
    );
  });
}

async function assetToPortable(asset) {
  const res = await fetch(asset.url);
  const blob = await res.blob();
  return {
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    mimeType: asset.mimeType || blob.type,
    fileName: `${slug(asset.name || "asset")}${extensionForMime(asset.mimeType || blob.type)}`,
    dataUrl: await blobToDataUrl(blob)
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "scriptcraft-project";
}

function extensionForMime(mimeType = "") {
  if (mimeType.includes("svg")) return ".svg";
  if (mimeType.includes("jpeg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  return ".png";
}

export function convertScript(code, fromLanguage, toLanguage) {
  if (fromLanguage === toLanguage) return code;
  const js = fromLanguage === "javascript" ? code : fromLanguage === "python" ? pythonToJs(code) : cToJs(code);
  if (toLanguage === "javascript") return js;
  if (toLanguage === "python") return jsToPython(js);
  return jsToC(js);
}

function pythonToJs(code) {
  const lines = code.replace(/\t/g, "    ").split("\n");
  const out = [];
  const stack = [0];
  const closeTo = (indent) => {
    while (stack.length > 1 && indent <= stack[stack.length - 1]) {
      out.push(`${"  ".repeat(stack.length - 2)}}`);
      stack.pop();
    }
  };

  for (const raw of lines) {
    if (!raw.trim()) {
      out.push("");
      continue;
    }
    const indent = raw.match(/^ */)[0].length;
    let line = raw.trim();
    closeTo(indent);
    line = replaceWords(line, reverseApiNameMap).replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false");
    const level = "  ".repeat(stack.length - 1);
    const def = line.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\):$/);
    if (def) {
      out.push(`${level}function ${def[1]}(${def[2]}) {`);
      stack.push(indent);
      continue;
    }
    const ifMatch = line.match(/^if\s+(.+):$/);
    if (ifMatch) {
      out.push(`${level}if (${ifMatch[1]}) {`);
      stack.push(indent);
      continue;
    }
    out.push(`${level}${line.replace(/;$/, "")};`);
  }
  closeTo(-1);
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function cToJs(code) {
  return code
    .replace(/\bvoid\s+start\s*\(\s*\)/g, "function start()")
    .replace(/\bvoid\s+update\s*\(\s*float\s+dt\s*\)/g, "function update(dt)")
    .replace(/\b(int|float|double|char)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g, "let $2 =");
}

function jsToC(code) {
  return code
    .replace(/\bfunction\s+start\s*\(\s*\)/g, "void start()")
    .replace(/\bfunction\s+update\s*\(\s*dt\s*\)/g, "void update(float dt)")
    .replace(/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g, "float $1 =")
    .replace(/\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g, "float $1 =");
}

function jsToPython(code) {
  const out = [];
  let indent = 0;
  for (const raw of code.split("\n")) {
    let line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }
    while (line.startsWith("}")) {
      indent = Math.max(0, indent - 1);
      line = line.slice(1).trim();
    }
    line = line.replace(/;$/, "").replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False");
    line = replaceWords(line, apiNameMap);

    const fn = line.match(/^function\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)\s*\{$/);
    if (fn) {
      out.push(`${"    ".repeat(indent)}def ${fn[1]}(${fn[2]}):`);
      indent += 1;
      continue;
    }
    const ifMatch = line.match(/^if\s*\((.*)\)\s*\{$/);
    if (ifMatch) {
      out.push(`${"    ".repeat(indent)}if ${ifMatch[1]}:`);
      indent += 1;
      continue;
    }
    if (line.endsWith("{")) {
      out.push(`${"    ".repeat(indent)}# ${line.slice(0, -1).trim()}`);
      indent += 1;
      continue;
    }
    if (line) out.push(`${"    ".repeat(indent)}${line}`);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function replaceWords(code, map) {
  let result = code;
  for (const [from, to] of Object.entries(map)) {
    result = result.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  return result;
}
