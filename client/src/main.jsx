import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Brush,
  Code2,
  Eye,
  FolderOpen,
  Image,
  LogIn,
  LogOut,
  Play,
  Plus,
  Save,
  Trash2,
  Upload,
  User
} from "lucide-react";
import { createRuntime, defaultScripts } from "./runtime.js";
import "./styles.css";

const api = {
  async request(path, options = {}) {
    const res = await fetch(path, {
      credentials: "include",
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  },
  me: () => api.request("/api/auth/me"),
  signup: (body) => api.request("/api/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => api.request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => api.request("/api/auth/logout", { method: "POST" }),
  projects: (mine = false) => api.request(`/api/projects${mine ? "?mine=1" : ""}`),
  project: (id) => api.request(`/api/projects/${id}`),
  createProject: (body) => api.request("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  saveProject: (id, body) => api.request(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProject: (id) => api.request(`/api/projects/${id}`, { method: "DELETE" }),
  uploadAsset: (id, form) => api.request(`/api/projects/${id}/assets`, { method: "POST", body: form }),
  deleteAsset: (projectId, assetId) => api.request(`/api/projects/${projectId}/assets/${assetId}`, { method: "DELETE" })
};

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("popstate"));
}

function useRoute() {
  const [route, setRoute] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return route;
}

function App() {
  const route = useRoute();
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshUser() {
    const data = await api.me();
    setUser(data.user);
  }

  useEffect(() => {
    refreshUser().catch(() => {});
  }, []);

  const page = (() => {
    if (route.startsWith("/editor/")) return <Editor id={route.split("/").pop()} user={user} setMessage={setMessage} />;
    if (route.startsWith("/projects/")) return <ProjectViewer id={route.split("/").pop()} user={user} setMessage={setMessage} />;
    if (route === "/studio") return <Studio user={user} openAuth={() => setAuthOpen(true)} setMessage={setMessage} />;
    return <Browse user={user} openAuth={() => setAuthOpen(true)} setMessage={setMessage} />;
  })();

  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("/")}>
          <Code2 size={22} />
          <span>ScriptCraft</span>
        </button>
        <nav>
          <button onClick={() => navigate("/")}>
            <Eye size={17} />
            Browse
          </button>
          <button onClick={() => (user ? navigate("/studio") : setAuthOpen(true))}>
            <FolderOpen size={17} />
            My Studio
          </button>
        </nav>
        <div className="account">
          {user ? (
            <>
              <span className="user-chip">
                <User size={16} />
                {user.username}
              </span>
              <button
                onClick={async () => {
                  await api.logout();
                  setUser(null);
                  navigate("/");
                }}
              >
                <LogOut size={17} />
                Log out
              </button>
            </>
          ) : (
            <button className="primary" onClick={() => setAuthOpen(true)}>
              <LogIn size={17} />
              Log in
            </button>
          )}
        </div>
      </header>
      {message && (
        <button className="toast" onClick={() => setMessage("")}>
          {message}
        </button>
      )}
      <main>{page}</main>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onDone={refreshUser} />}
    </>
  );
}

function AuthModal({ onClose, onDone }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (mode === "login") await api.login({ username, password });
      else await api.signup({ username, password });
      await onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="auth-modal" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Log in
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Browse({ user, openAuth, setMessage }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.projects(false).then((data) => setProjects(data.projects)).finally(() => setLoading(false));
  }, []);

  return (
    <section className="page-shell">
      <div className="page-title">
        <div>
          <h1>Explore projects</h1>
          <p>Play shared ScriptCraft projects made with sprites, images, and code.</p>
        </div>
        <button
          className="primary"
          onClick={async () => {
            if (!user) {
              openAuth();
              return;
            }
            const data = await api.createProject({ title: "Untitled Project" });
            setMessage("Project created.");
            navigate(`/editor/${data.project.id}`);
          }}
        >
          <Plus size={17} />
          New Project
        </button>
      </div>
      {loading ? <p className="muted">Loading projects...</p> : <ProjectGrid projects={projects} empty="No published projects yet." />}
    </section>
  );
}

function Studio({ user, openAuth, setMessage }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      const data = await api.projects(true);
      setProjects(data.projects);
    } catch {
      openAuth();
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (!user) return null;

  return (
    <section className="page-shell">
      <div className="page-title">
        <div>
          <h1>My Studio</h1>
          <p>Create, edit, publish, or delete your projects.</p>
        </div>
        <button
          className="primary"
          onClick={async () => {
            const title = prompt("Project title", "Untitled Project") || "Untitled Project";
            const data = await api.createProject({ title });
            setMessage("Project created.");
            navigate(`/editor/${data.project.id}`);
          }}
        >
          <Plus size={17} />
          New Project
        </button>
      </div>
      {loading ? <p className="muted">Loading studio...</p> : <ProjectGrid projects={projects} owner empty="You have not created any projects yet." onChanged={load} />}
    </section>
  );
}

function ProjectGrid({ projects, owner = false, empty, onChanged }) {
  if (!projects.length) return <p className="empty">{empty}</p>;
  return (
    <div className="project-grid">
      {projects.map((project) => (
        <article className="project-card" key={project.id}>
          <button className="project-thumb" onClick={() => navigate(owner ? `/editor/${project.id}` : `/projects/${project.id}`)}>
            {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" /> : <span>{project.title.slice(0, 1).toUpperCase()}</span>}
          </button>
          <div className="project-card-body">
            <h2>{project.title}</h2>
            <p>{project.description || "No description yet."}</p>
            <div className="meta">
              <span>by {project.author}</span>
              <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
            </div>
            <div className="card-actions">
              <button onClick={() => navigate(`/projects/${project.id}`)}>
                <Play size={16} />
                Play
              </button>
              {owner && (
                <>
                  <button onClick={() => navigate(`/editor/${project.id}`)}>
                    <Code2 size={16} />
                    Edit
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (!confirm(`Delete "${project.title}"?`)) return;
                      await api.deleteProject(project.id);
                      onChanged?.();
                    }}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ProjectViewer({ id, user, setMessage }) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.project(id).then((data) => setProject(data.project)).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <section className="page-shell"><p className="error">{error}</p></section>;
  if (!project) return <section className="page-shell"><p className="muted">Loading project...</p></section>;

  return (
    <section className="play-page">
      <div className="viewer-info">
        <h1>{project.title}</h1>
        <p>{project.description || "No description."}</p>
        <div className="meta">
          <span>by {project.author}</span>
          <span>updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
        {user?.username === project.author && (
          <button onClick={() => navigate(`/editor/${project.id}`)}>
            <Code2 size={17} />
            Edit project
          </button>
        )}
      </div>
      <Stage project={project} playing showControls setMessage={setMessage} />
    </section>
  );
}

function Editor({ id, user, setMessage }) {
  const [project, setProject] = useState(null);
  const [selectedSpriteId, setSelectedSpriteId] = useState("");
  const [assetKind, setAssetKind] = useState("costume");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.project(id)
      .then((data) => {
        setProject(data.project);
        setSelectedSpriteId(data.project.data.sprites[0]?.id || "");
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const selectedSprite = project?.data.sprites.find((sprite) => sprite.id === selectedSpriteId);

  function updateProject(mutator) {
    setProject((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
  }

  async function save(overrides = {}) {
    setSaving(true);
    try {
      const data = await api.saveProject(project.id, {
        title: project.title,
        description: project.description,
        data: project.data,
        published: project.published,
        thumbnailAssetId: project.thumbnailAssetId,
        ...overrides
      });
      setProject(data.project);
      setMessage("Saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <section className="page-shell"><p className="error">{error}</p></section>;
  if (!project) return <section className="page-shell"><p className="muted">Loading editor...</p></section>;
  if (!user || user.username !== project.author) {
    return <section className="page-shell"><p className="error">Only the author can edit this project.</p></section>;
  }

  return (
    <section className="editor">
      <aside className="panel project-panel">
        <label>
          Title
          <input value={project.title} onChange={(event) => updateProject((draft) => (draft.title = event.target.value))} />
        </label>
        <label>
          Description
          <textarea rows="4" value={project.description} onChange={(event) => updateProject((draft) => (draft.description = event.target.value))} />
        </label>
        <label>
          Stage color
          <input
            type="color"
            value={project.data.stage.backgroundColor}
            onChange={(event) => updateProject((draft) => (draft.data.stage.backgroundColor = event.target.value))}
          />
        </label>
        <div className="toolbar">
          <button className="primary" onClick={() => save()} disabled={saving}>
            <Save size={17} />
            {saving ? "Saving" : "Save"}
          </button>
          <button
            onClick={() => {
              const next = !project.published;
              updateProject((draft) => (draft.published = next));
              save({ published: next });
            }}
          >
            <Eye size={17} />
            {project.published ? "Unpublish" : "Publish"}
          </button>
        </div>

        <SpriteList
          sprites={project.data.sprites}
          selectedSpriteId={selectedSpriteId}
          onSelect={setSelectedSpriteId}
          onAdd={() => {
            const sprite = {
              id: `sprite-${Date.now()}`,
              name: `Sprite ${project.data.sprites.length + 1}`,
              x: 160,
              y: 140,
              size: 64,
              rotation: 0,
              visible: true,
              costumeAssetId: null,
              color: "#16a34a",
              script: { language: "javascript", code: defaultScripts.javascript }
            };
            updateProject((draft) => draft.data.sprites.push(sprite));
            setSelectedSpriteId(sprite.id);
          }}
          onDelete={(spriteId) => {
            if (project.data.sprites.length === 1) return;
            updateProject((draft) => {
              draft.data.sprites = draft.data.sprites.filter((sprite) => sprite.id !== spriteId);
            });
            setSelectedSpriteId(project.data.sprites.find((sprite) => sprite.id !== spriteId)?.id || "");
          }}
        />
      </aside>

      <section className="stage-column">
        <Stage project={project} editable selectedSpriteId={selectedSpriteId} onProjectChange={setProject} showControls setMessage={setMessage} />
        <AssetPanel
          project={project}
          assetKind={assetKind}
          setAssetKind={setAssetKind}
          onUploaded={(nextProject) => setProject(nextProject)}
          onApply={(asset) => {
            updateProject((draft) => {
              if (asset.kind === "background") draft.data.stage.backgroundAssetId = asset.id;
              if (asset.kind === "thumbnail") draft.thumbnailAssetId = asset.id;
              if (["sprite", "costume"].includes(asset.kind) && selectedSprite) {
                draft.data.sprites.find((sprite) => sprite.id === selectedSprite.id).costumeAssetId = asset.id;
              }
            });
          }}
          setMessage={setMessage}
        />
      </section>

      <aside className="panel code-panel">
        {selectedSprite ? (
          <SpriteInspector sprite={selectedSprite} project={project} updateProject={updateProject} />
        ) : (
          <p className="muted">Select a sprite.</p>
        )}
      </aside>
    </section>
  );
}

function SpriteList({ sprites, selectedSpriteId, onSelect, onAdd, onDelete }) {
  return (
    <div className="sprite-list">
      <div className="section-row">
        <h2>Sprites</h2>
        <button onClick={onAdd} title="Add sprite">
          <Plus size={17} />
        </button>
      </div>
      {sprites.map((sprite) => (
        <div className={`sprite-row ${selectedSpriteId === sprite.id ? "selected" : ""}`} key={sprite.id}>
          <button onClick={() => onSelect(sprite.id)}>{sprite.name}</button>
          <button className="icon danger" onClick={() => onDelete(sprite.id)} title="Delete sprite">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function SpriteInspector({ sprite, project, updateProject }) {
  const costumeAssets = project.assets.filter((asset) => ["sprite", "costume"].includes(asset.kind));
  const updateSprite = (mutator) =>
    updateProject((draft) => {
      const target = draft.data.sprites.find((item) => item.id === sprite.id);
      mutator(target);
    });

  return (
    <>
      <div className="section-row">
        <h2>{sprite.name}</h2>
      </div>
      <label>
        Name
        <input value={sprite.name} onChange={(event) => updateSprite((draft) => (draft.name = event.target.value))} />
      </label>
      <div className="grid-two">
        <label>
          X
          <input type="number" value={sprite.x} onChange={(event) => updateSprite((draft) => (draft.x = Number(event.target.value)))} />
        </label>
        <label>
          Y
          <input type="number" value={sprite.y} onChange={(event) => updateSprite((draft) => (draft.y = Number(event.target.value)))} />
        </label>
        <label>
          Size
          <input type="number" value={sprite.size} onChange={(event) => updateSprite((draft) => (draft.size = Number(event.target.value)))} />
        </label>
        <label>
          Rotation
          <input type="number" value={sprite.rotation} onChange={(event) => updateSprite((draft) => (draft.rotation = Number(event.target.value)))} />
        </label>
      </div>
      <label>
        Sprite color
        <input type="color" value={sprite.color} onChange={(event) => updateSprite((draft) => (draft.color = event.target.value))} />
      </label>
      <label>
        Costume
        <select value={sprite.costumeAssetId || ""} onChange={(event) => updateSprite((draft) => (draft.costumeAssetId = Number(event.target.value) || null))}>
          <option value="">Shape</option>
          {costumeAssets.map((asset) => (
            <option value={asset.id} key={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Language
        <select
          value={sprite.script.language}
          onChange={(event) =>
            updateSprite((draft) => {
              draft.script.language = event.target.value;
              draft.script.code = defaultScripts[event.target.value];
            })
          }
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="c">C</option>
        </select>
      </label>
      <label>
        Code
        <textarea
          className="code-editor"
          spellCheck="false"
          value={sprite.script.code}
          onChange={(event) => updateSprite((draft) => (draft.script.code = event.target.value))}
        />
      </label>
    </>
  );
}

function AssetPanel({ project, assetKind, setAssetKind, onUploaded, onApply, setMessage }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");

  async function upload(fileToUpload = file, kind = assetKind, assetName = name) {
    if (!fileToUpload) return;
    const form = new FormData();
    form.append("image", fileToUpload);
    form.append("kind", kind);
    form.append("name", assetName || fileToUpload.name);
    try {
      const data = await api.uploadAsset(project.id, form);
      onUploaded(data.project);
      setFile(null);
      setName("");
      setMessage("Image added.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="assets">
      <div className="asset-tools">
        <div className="segmented">
          {["costume", "background", "thumbnail", "sprite"].map((kind) => (
            <button key={kind} className={assetKind === kind ? "active" : ""} onClick={() => setAssetKind(kind)}>
              {kind}
            </button>
          ))}
        </div>
        <label className="file-button">
          <Upload size={17} />
          Image
          <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <input placeholder="Asset name" value={name} onChange={(event) => setName(event.target.value)} />
        <button onClick={() => upload()} disabled={!file}>
          <Save size={17} />
          Add
        </button>
      </div>
      <DrawingTool onSave={(blob) => upload(new File([blob], `drawing-${Date.now()}.png`, { type: "image/png" }), assetKind, "Drawing")} />
      <div className="asset-grid">
        {project.assets.map((asset) => (
          <article key={asset.id} className="asset-card">
            <img src={asset.url} alt="" />
            <div>
              <strong>{asset.name}</strong>
              <span>{asset.kind}</span>
            </div>
            <button onClick={() => onApply(asset)}>
              <Image size={16} />
              Use
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function DrawingTool({ onSave }) {
  const canvasRef = useRef(null);
  const [color, setColor] = useState("#111827");
  const [size, setSize] = useState(8);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((source.clientY - rect.top) / rect.height) * canvasRef.current.height
    };
  }

  function draw(event) {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  return (
    <div className="drawing-tool">
      <canvas
        ref={canvasRef}
        width="320"
        height="180"
        onMouseDown={(event) => {
          drawing.current = true;
          const ctx = canvasRef.current.getContext("2d");
          const p = point(event);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onMouseMove={draw}
        onMouseUp={() => (drawing.current = false)}
        onMouseLeave={() => (drawing.current = false)}
        onTouchStart={(event) => {
          drawing.current = true;
          const ctx = canvasRef.current.getContext("2d");
          const p = point(event);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onTouchMove={draw}
        onTouchEnd={() => (drawing.current = false)}
      />
      <div className="drawing-actions">
        <Brush size={17} />
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        <input type="range" min="2" max="24" value={size} onChange={(event) => setSize(Number(event.target.value))} />
        <button
          onClick={() => {
            const ctx = canvasRef.current.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }}
        >
          Clear
        </button>
        <button onClick={() => canvasRef.current.toBlob((blob) => onSave(blob), "image/png")}>
          <Save size={17} />
          Save drawing
        </button>
      </div>
    </div>
  );
}

function Stage({ project, editable = false, selectedSpriteId, onProjectChange, playing = false, showControls = false, setMessage }) {
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(playing);
  const [runtimeError, setRuntimeError] = useState("");
  const assetMap = useMemo(() => Object.fromEntries(project.assets.map((asset) => [asset.id, asset.url])), [project.assets]);

  useEffect(() => {
    const runtime = createRuntime(canvasRef.current, project.data, assetMap, {
      onError: (message) => {
        setRuntimeError(message);
        setMessage?.(message);
      }
    });
    runtimeRef.current = runtime;
    runtime.draw();
    if (isPlaying) runtime.start();
    return () => runtime.stop();
  }, [project.id, JSON.stringify(project.data), JSON.stringify(assetMap)]);

  useEffect(() => {
    if (!runtimeRef.current) return;
    if (isPlaying) runtimeRef.current.start();
    else runtimeRef.current.stop();
  }, [isPlaying]);

  return (
    <div className="stage-wrap">
      <div className="stage-top">
        <div>
          <h2>Stage</h2>
          {runtimeError && <span className="runtime-error">{runtimeError}</span>}
        </div>
        {showControls && (
          <div className="toolbar">
            <button className="primary" onClick={() => setIsPlaying((value) => !value)}>
              <Play size={17} />
              {isPlaying ? "Stop" : "Play"}
            </button>
          </div>
        )}
      </div>
      <canvas className={editable ? "editable-canvas" : ""} ref={canvasRef} width={project.data.stage.width} height={project.data.stage.height} />
      {editable && <p className="muted">Selected sprite: {selectedSpriteId || "none"}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
