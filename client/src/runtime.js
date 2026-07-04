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
      .replace(/\bset_x\b/g, "setX")
      .replace(/\bset_y\b/g, "setY")
      .replace(/\bset_size\b/g, "setSize")
      .replace(/\bget_var\b/g, "getVar")
      .replace(/\bset_var\b/g, "setVar")
      .replace(/\bchange_var\b/g, "changeVar")
      .replace(/\bpoint_towards\b/g, "pointTowards")
      .replace(/\bpoint_in_direction\b/g, "pointInDirection")
      .replace(/\bset_rotation\b/g, "setRotation")
      .replace(/\bset_color\b/g, "setColor")
      .replace(/\btouching_sprite\b/g, "touchingSprite")
      .replace(/\btouching_mouse\b/g, "touchingMouse")
      .replace(/\bmouse_x\b/g, "mouseX")
      .replace(/\bmouse_y\b/g, "mouseY")
      .replace(/\bmouse_down\b/g, "mouseDown")
      .replace(/\breset_timer\b/g, "resetTimer")
      .replace(/\bclear_pen\b/g, "clearPen")
      .replace(/\bpen_down\b/g, "penDown")
      .replace(/\bpen_up\b/g, "penUp")
      .replace(/\bset_pen_color\b/g, "setPenColor")
      .replace(/\bset_pen_size\b/g, "setPenSize")
      .replace(/\bon_message\b/g, "onMessage")
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
    .replace(/\bvoid\s+onMessage\s*\(\s*char\s*\*\s*message\s*\)/g, "function onMessage(message)")
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
        update: typeof update === "function" ? update : null,
        onMessage: typeof onMessage === "function" ? onMessage : null
      };
    }`
  );
}

function formatLogValue(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createRuntime(canvas, initialData, assets, hooks = {}) {
  const ctx = canvas.getContext("2d");
  let data = structuredClone(initialData);
  data.variables ||= [];
  let raf = null;
  let last = performance.now();
  let timerStart = performance.now();
  let programs = [];
  const images = new Map();
  const speech = new Map();
  const mouse = { x: 0, y: 0, down: false };
  const penCanvas = document.createElement("canvas");
  penCanvas.width = canvas.width;
  penCanvas.height = canvas.height;
  const penCtx = penCanvas.getContext("2d");

  const updateMouse = (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  };
  const onPointerMove = (event) => updateMouse(event);
  const onPointerDown = (event) => {
    updateMouse(event);
    mouse.down = true;
  };
  const onPointerUp = () => {
    mouse.down = false;
  };
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  function imageFor(assetId) {
    if (!assetId || !assets[assetId]) return null;
    if (images.has(assetId)) return images.get(assetId);
    const image = new Image();
    image.src = assets[assetId];
    images.set(assetId, image);
    image.onload = draw;
    return image;
  }

  function penState(sprite) {
    sprite.__pen ||= { down: false, color: "#111827", size: 2 };
    return sprite.__pen;
  }

  function placeSprite(sprite, x, y) {
    const pen = penState(sprite);
    if (pen.down) {
      penCtx.strokeStyle = pen.color;
      penCtx.lineWidth = pen.size;
      penCtx.lineCap = "round";
      penCtx.beginPath();
      penCtx.moveTo(sprite.x, sprite.y);
      penCtx.lineTo(Number(x || 0), Number(y || 0));
      penCtx.stroke();
    }
    sprite.x = Number(x || 0);
    sprite.y = Number(y || 0);
  }

  function makeApi(sprite) {
    return {
      get x() {
        return sprite.x;
      },
      get y() {
        return sprite.y;
      },
      get direction() {
        return sprite.rotation;
      },
      get mouseX() {
        return mouse.x;
      },
      get mouseY() {
        return mouse.y;
      },
      get mouseDown() {
        return mouse.down;
      },
      move(steps) {
        const radians = (sprite.rotation * Math.PI) / 180;
        placeSprite(sprite, sprite.x + Math.cos(radians) * Number(steps || 0), sprite.y + Math.sin(radians) * Number(steps || 0));
      },
      turn(degrees) {
        sprite.rotation += Number(degrees || 0);
      },
      setRotation(degrees) {
        sprite.rotation = Number(degrees || 0);
      },
      pointInDirection(degrees) {
        sprite.rotation = Number(degrees || 0);
      },
      pointTowards(x, y) {
        sprite.rotation = (Math.atan2(Number(y || 0) - sprite.y, Number(x || 0) - sprite.x) * 180) / Math.PI;
      },
      goTo(x, y) {
        placeSprite(sprite, x, y);
      },
      setX(x) {
        placeSprite(sprite, x, sprite.y);
      },
      setY(y) {
        placeSprite(sprite, sprite.x, y);
      },
      changeX(dx) {
        placeSprite(sprite, sprite.x + Number(dx || 0), sprite.y);
      },
      changeY(dy) {
        placeSprite(sprite, sprite.x, sprite.y + Number(dy || 0));
      },
      setSize(size) {
        sprite.size = Math.max(8, Number(size || sprite.size));
      },
      setColor(color) {
        sprite.color = String(color || sprite.color);
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
      console: {
        log(...values) {
          hooks.onLog?.(values.map(formatLogValue).join(" "));
        }
      },
      log(...values) {
        hooks.onLog?.(values.map(formatLogValue).join(" "));
      },
      random(min, max) {
        return Number(min) + Math.random() * (Number(max) - Number(min));
      },
      timer() {
        return (performance.now() - timerStart) / 1000;
      },
      resetTimer() {
        timerStart = performance.now();
      },
      distanceTo(x, y) {
        return Math.hypot(Number(x || 0) - sprite.x, Number(y || 0) - sprite.y);
      },
      touchingSprite(name) {
        return data.sprites.some((other) => {
          if (other === sprite || other.visible === false) return false;
          if (name && other.name !== name) return false;
          return Math.hypot(other.x - sprite.x, other.y - sprite.y) <= (Number(other.size || 64) + Number(sprite.size || 64)) / 2;
        });
      },
      touchingMouse() {
        return Math.hypot(mouse.x - sprite.x, mouse.y - sprite.y) <= Number(sprite.size || 64) / 2;
      },
      getVar(name) {
        return data.variables.find((item) => item.name === name)?.value ?? 0;
      },
      setVar(name, value) {
        const variable = data.variables.find((item) => item.name === name);
        if (variable) variable.value = value;
        else data.variables.push({ id: `var-${Date.now()}`, name: String(name), value });
      },
      changeVar(name, amount) {
        const current = Number(this.getVar(name) || 0);
        this.setVar(name, current + Number(amount || 0));
      },
      broadcast(message) {
        for (const item of programs) {
          try {
            item.program.onMessage?.(String(message));
          } catch (error) {
            hooks.onError?.(`${item.sprite.name}: ${error.message}`);
          }
        }
      },
      penDown() {
        penState(sprite).down = true;
      },
      penUp() {
        penState(sprite).down = false;
      },
      setPenColor(color) {
        penState(sprite).color = String(color || "#111827");
      },
      setPenSize(size) {
        penState(sprite).size = Math.max(1, Number(size || 1));
      },
      clearPen() {
        penCtx.clearRect(0, 0, penCanvas.width, penCanvas.height);
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
    ctx.drawImage(penCanvas, 0, 0);

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

    ctx.font = "13px system-ui";
    data.variables
      .filter((variable) => variable.visible)
      .forEach((variable, index) => {
        const text = `${variable.name}: ${variable.value}`;
        const width = Math.max(90, ctx.measureText(text).width + 18);
        const x = 10;
        const y = 12 + index * 30;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.strokeStyle = "#aebbd0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, width, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#18202f";
        ctx.fillText(text, x + 9, y + 15);
      });
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

  function pause() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function resume() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function dispose() {
    stop();
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
  }

  return { start, stop, pause, resume, draw, dispose };
}
