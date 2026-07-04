export const defaultScripts = {
  javascript:
    "function start() {\n  say(\"Ready\", 1);\n}\n\nfunction update(dt) {\n  if (key(\"ArrowRight\")) changeX(4);\n  if (key(\"ArrowLeft\")) changeX(-4);\n  if (key(\"ArrowUp\")) changeY(-4);\n  if (key(\"ArrowDown\")) changeY(4);\n  bounceOnEdge();\n}",
  python:
    "def start():\n    say(\"Ready\", 1)\n\ndef update(dt):\n    if key(\"ArrowRight\"):\n        change_x(4)\n    if key(\"ArrowLeft\"):\n        change_x(-4)\n    if key(\"ArrowUp\"):\n        change_y(-4)\n    if key(\"ArrowDown\"):\n        change_y(4)\n    bounce_on_edge()",
  c:
    "void start() {\n  say(\"Ready\", 1);\n}\n\nvoid update(float dt) {\n  if (key(\"ArrowRight\")) changeX(4);\n  if (key(\"ArrowLeft\")) changeX(-4);\n  if (key(\"ArrowUp\")) changeY(-4);\n  if (key(\"ArrowDown\")) changeY(4);\n  bounceOnEdge();\n}"
};

const keys = new Set();
window.addEventListener("keydown", (event) => keys.add(event.key));
window.addEventListener("keyup", (event) => keys.delete(event.key));

function transpilePython(code) {
  const lines = code.replace(/\t/g, "    ").split("\n");
  const output = [];
  const stack = [0];

  const closeTo = (indent) => {
    while (stack.length > 1 && indent <= stack[stack.length - 1]) {
      output.push("}");
      stack.pop();
    }
  };

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^ */)[0].length;
    let line = raw.trim();
    closeTo(indent);
    line = line
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bchange_x\b/g, "changeX")
      .replace(/\bchange_y\b/g, "changeY")
      .replace(/\bgo_to\b/g, "goTo")
      .replace(/\bset_size\b/g, "setSize")
      .replace(/\bbounce_on_edge\b/g, "bounceOnEdge")
      .replace(/\btouching_edge\b/g, "touchingEdge");

    const defMatch = line.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\):$/);
    if (defMatch) {
      output.push(`function ${defMatch[1]}(${defMatch[2]}) {`);
      stack.push(indent);
      continue;
    }
    const ifMatch = line.match(/^if\s+(.+):$/);
    if (ifMatch) {
      output.push(`if (${ifMatch[1]}) {`);
      stack.push(indent);
      continue;
    }
    output.push(`${line};`);
  }
  closeTo(-1);
  return output.join("\n");
}

function transpileC(code) {
  return code
    .replace(/\bvoid\s+start\s*\(\s*\)/g, "function start()")
    .replace(/\bvoid\s+update\s*\(\s*float\s+dt\s*\)/g, "function update(dt)")
    .replace(/\b(int|float|double|char)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g, "let $2 =")
    .replace(/\btrue\b/g, "true")
    .replace(/\bfalse\b/g, "false");
}

function compile(script) {
  const source =
    script.language === "python" ? transpilePython(script.code) : script.language === "c" ? transpileC(script.code) : script.code;
  return new Function(
    "api",
    `with (api) {
      ${source}
      return {
        start: typeof start === "function" ? start : null,
        update: typeof update === "function" ? update : null
      };
    }`
  );
}

export function createRuntime(canvas, initialData, assets, hooks = {}) {
  const ctx = canvas.getContext("2d");
  let data = structuredClone(initialData);
  let raf = null;
  let last = performance.now();
  let programs = [];
  const images = new Map();
  const speech = new Map();

  function imageFor(assetId) {
    if (!assetId || !assets[assetId]) return null;
    if (images.has(assetId)) return images.get(assetId);
    const image = new Image();
    image.src = assets[assetId];
    images.set(assetId, image);
    image.onload = draw;
    return image;
  }

  function makeApi(sprite) {
    return {
      get x() {
        return sprite.x;
      },
      get y() {
        return sprite.y;
      },
      move(steps) {
        const radians = (sprite.rotation * Math.PI) / 180;
        sprite.x += Math.cos(radians) * Number(steps || 0);
        sprite.y += Math.sin(radians) * Number(steps || 0);
      },
      turn(degrees) {
        sprite.rotation += Number(degrees || 0);
      },
      goTo(x, y) {
        sprite.x = Number(x || 0);
        sprite.y = Number(y || 0);
      },
      setX(x) {
        sprite.x = Number(x || 0);
      },
      setY(y) {
        sprite.y = Number(y || 0);
      },
      changeX(dx) {
        sprite.x += Number(dx || 0);
      },
      changeY(dy) {
        sprite.y += Number(dy || 0);
      },
      setSize(size) {
        sprite.size = Math.max(8, Number(size || sprite.size));
      },
      say(text, seconds = 1.5) {
        speech.set(sprite.id, { text: String(text), until: performance.now() + Number(seconds) * 1000 });
      },
      show() {
        sprite.visible = true;
      },
      hide() {
        sprite.visible = false;
      },
      key(name) {
        return keys.has(name);
      },
      random(min, max) {
        return Number(min) + Math.random() * (Number(max) - Number(min));
      },
      touchingEdge() {
        return sprite.x < 0 || sprite.y < 0 || sprite.x > data.stage.width || sprite.y > data.stage.height;
      },
      bounceOnEdge() {
        sprite.x = Math.max(0, Math.min(data.stage.width, sprite.x));
        sprite.y = Math.max(0, Math.min(data.stage.height, sprite.y));
      }
    };
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bg = imageFor(data.stage.backgroundAssetId);
    if (bg?.complete && bg.naturalWidth) {
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = data.stage.backgroundColor || "#eef3ff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    for (const sprite of data.sprites) {
      if (!sprite.visible) continue;
      ctx.save();
      ctx.translate(sprite.x, sprite.y);
      ctx.rotate((sprite.rotation * Math.PI) / 180);
      const image = imageFor(sprite.costumeAssetId);
      const size = Number(sprite.size || 64);
      if (image?.complete && image.naturalWidth) {
        ctx.drawImage(image, -size / 2, -size / 2, size, size);
      } else {
        ctx.fillStyle = sprite.color || "#f97316";
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2, size, size, 14);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      const line = speech.get(sprite.id);
      if (line && line.until > performance.now()) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(sprite.x + 20, sprite.y - 44, Math.max(80, line.text.length * 8), 30, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#111827";
        ctx.font = "14px system-ui";
        ctx.fillText(line.text, sprite.x + 31, sprite.y - 24);
      }
    }
  }

  function buildPrograms() {
    programs = [];
    for (const sprite of data.sprites) {
      try {
        const factory = compile(sprite.script);
        const api = makeApi(sprite);
        programs.push({ sprite, api, program: factory(api) });
      } catch (error) {
        hooks.onError?.(`${sprite.name}: ${error.message}`);
      }
    }
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const item of programs) {
      try {
        item.program.update?.(dt);
      } catch (error) {
        hooks.onError?.(`${item.sprite.name}: ${error.message}`);
        stop();
        return;
      }
    }
    draw();
    hooks.onData?.(structuredClone(data));
    raf = requestAnimationFrame(tick);
  }

  function start() {
    stop();
    buildPrograms();
    for (const item of programs) {
      try {
        item.program.start?.();
      } catch (error) {
        hooks.onError?.(`${item.sprite.name}: ${error.message}`);
      }
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    draw();
  }

  return { start, stop, draw };
}
