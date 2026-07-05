import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Brush,
  ArrowDown,
  ArrowUp,
  Camera,
  Circle,
  Code2,
  Copy,
  Download,
  Eraser,
  Eye,
  FolderOpen,
  Image,
  LogIn,
  LogOut,
  Maximize2,
  Minus,
  Minimize2,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
  Trash2,
  Upload,
  User
} from "lucide-react";
import { convertScript, downloadProjectFile } from "./projectFiles.js";
import { createRuntime, defaultBackgroundScripts, defaultScripts } from "./runtime.js";
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
  importProject: (form) => api.request("/api/projects/import", { method: "POST", body: form }),
  remixProject: (id) => api.request(`/api/projects/${id}/remix`, { method: "POST" }),
  saveProject: (id, body) => api.request(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProject: (id) => api.request(`/api/projects/${id}`, { method: "DELETE" }),
  uploadAsset: (id, form) => api.request(`/api/projects/${id}/assets`, { method: "POST", body: form }),
  deleteAsset: (projectId, assetId) => api.request(`/api/projects/${projectId}/assets/${assetId}`, { method: "DELETE" })
};

function normalizeProject(project) {
  const next = structuredClone(project);
  next.data.stage ||= {};
  next.data.stage.script ||= {
    language: "javascript",
    code: defaultBackgroundScripts.javascript
  };
  next.data.variables ||= [];
  next.data.sprites ||= [];
  return next;
}

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
          <span className="brand-mark">&lt;/&gt;</span>
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
                {user.isAdmin ? " admin" : ""}
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
        <CreateProjectActions user={user} openAuth={openAuth} setMessage={setMessage} />
      </div>
      {loading ? <p className="muted">Loading projects...</p> : <ProjectGrid projects={projects} user={user} empty="No published projects yet." />}
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
        <CreateProjectActions user={user} openAuth={openAuth} setMessage={setMessage} />
      </div>
      {loading ? <p className="muted">Loading studio...</p> : <ProjectGrid projects={projects} user={user} owner empty="You have not created any projects yet." onChanged={load} />}
    </section>
  );
}

function CreateProjectActions({ user, openAuth, setMessage }) {
  const inputRef = useRef(null);

  async function createProject() {
    if (!user) {
      openAuth();
      return;
    }
    const title = prompt("Project title", "Untitled Project") || "Untitled Project";
    const data = await api.createProject({ title });
    setMessage("Project created.");
    navigate(`/editor/${data.project.id}`);
  }

  async function importProject(file) {
    if (!user) {
      openAuth();
      return;
    }
    if (!file) return;
    const form = new FormData();
    form.append("project", file);
    try {
      const data = await api.importProject(form);
      setMessage("Project imported.");
      navigate(`/editor/${data.project.id}`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="toolbar">
      <button className="primary" onClick={createProject}>
        <Plus size={17} />
        New Project
      </button>
      <button onClick={() => (user ? inputRef.current?.click() : openAuth())}>
        <Upload size={17} />
        Import
      </button>
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept=".sb3,.ent,.scriptcraft,.json"
        onChange={(event) => {
          importProject(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function ProjectGrid({ projects, user, owner = false, empty, onChanged }) {
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
              {(owner || user?.isAdmin) && (
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
    api.project(id).then((data) => setProject(normalizeProject(data.project))).catch((err) => setError(err.message));
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
        {project.remixOfProjectId && (
          <p className="remix-note">
            Remixed from {project.remixOfTitle || "a project"} by {project.remixOfAuthor || "unknown"}
          </p>
        )}
        {user && user.username !== project.author && (
          <button
            className="primary"
            onClick={async () => {
              try {
                const data = await api.remixProject(project.id);
                setMessage("Remix created.");
                navigate(`/editor/${data.project.id}`);
              } catch (err) {
                setMessage(err.message);
              }
            }}
          >
            <Copy size={17} />
            Remix
          </button>
        )}
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
  const [dirty, setDirty] = useState(false);
  const [activePane, setActivePane] = useState("code");

  useEffect(() => {
    api.project(id)
      .then((data) => {
        const normalized = normalizeProject(data.project);
        setProject(normalized);
        setSelectedSpriteId(data.project.data.sprites[0]?.id || "");
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const selectedSprite = selectedSpriteId === "__stage__" ? null : project?.data.sprites.find((sprite) => sprite.id === selectedSpriteId);
  const selectedBackground = selectedSpriteId === "__stage__";
  const backgroundAssets = project?.assets.filter((asset) => asset.kind === "background") || [];
  const thumbnailAssets = project?.assets.filter((asset) => asset.kind === "thumbnail") || [];
  const currentThumbnail = project?.assets.find((asset) => asset.id === project.thumbnailAssetId);

  function updateProject(mutator) {
    setProject((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setDirty(true);
  }

  async function save(overrides = {}, options = {}) {
    if (!project) return;
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
      setProject(normalizeProject(data.project));
      setDirty(false);
      if (!options.silent) setMessage("Saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!project || !dirty) return undefined;
    const timer = window.setTimeout(() => {
      save({}, { silent: true });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [project, dirty]);

  if (error) return <section className="page-shell"><p className="error">{error}</p></section>;
  if (!project) return <section className="page-shell"><p className="muted">Loading editor...</p></section>;
  if (!user || user.username !== project.author) {
    return <section className="page-shell"><p className="error">Only the author can edit this project.</p></section>;
  }

  return (
    <section className="editor">
      <aside className="panel editor-sidebar">
        <div className="sidebar-project">
          <strong>{project.title}</strong>
          <span>{dirty ? "Unsaved edits" : project.published ? "Published" : "Draft"}</span>
        </div>
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
          <button
            onClick={() => {
              updateProject((draft) => (draft.thumbnailAssetId = null));
              save({ thumbnailAssetId: null });
            }}
          >
            Clear thumbnail
          </button>
        </div>
        <div className="toolbar">
          <button
            onClick={async () => {
              try {
                await downloadProjectFile(project);
                setMessage("Project exported.");
              } catch (err) {
                setMessage(err.message);
              }
            }}
          >
            <Download size={17} />
            Export
          </button>
        </div>
        <SpriteList
          sprites={project.data.sprites}
          selectedSpriteId={selectedSpriteId}
          selectedBackground={selectedBackground}
          onSelectBackground={() => {
            setSelectedSpriteId("__stage__");
            setActivePane("code");
          }}
          onSelect={(spriteId) => {
            setSelectedSpriteId(spriteId);
            setActivePane("code");
          }}
          onAdd={() => {
            const sprite = {
              id: `sprite-${Date.now()}`,
              name: `Sprite ${project.data.sprites.length + 1}`,
              x: project.data.stage.width / 2,
              y: project.data.stage.height / 2,
              size: 64,
              rotation: 0,
              visible: true,
              costumeAssetId: null,
              script: { language: "javascript", code: defaultScripts.javascript }
            };
            updateProject((draft) => draft.data.sprites.push(sprite));
            setSelectedSpriteId(sprite.id);
            setActivePane("sprite");
          }}
          onDelete={(spriteId) => {
            if (project.data.sprites.length === 1) return;
            updateProject((draft) => {
              draft.data.sprites = draft.data.sprites.filter((sprite) => sprite.id !== spriteId);
            });
            setSelectedSpriteId(project.data.sprites.find((sprite) => sprite.id !== spriteId)?.id || "");
          }}
          onDuplicate={(spriteId) => {
            const original = project.data.sprites.find((sprite) => sprite.id === spriteId);
            if (!original) return;
            const copy = structuredClone(original);
            copy.id = `sprite-${Date.now()}`;
            copy.name = `${original.name} copy`;
            copy.x += 24;
            copy.y += 24;
            updateProject((draft) => draft.data.sprites.push(copy));
            setSelectedSpriteId(copy.id);
          }}
          onMove={(spriteId, direction) => {
            updateProject((draft) => {
              const index = draft.data.sprites.findIndex((sprite) => sprite.id === spriteId);
              const next = index + direction;
              if (index < 0 || next < 0 || next >= draft.data.sprites.length) return;
              const [sprite] = draft.data.sprites.splice(index, 1);
              draft.data.sprites.splice(next, 0, sprite);
            });
          }}
        />
        <VariablePanel project={project} updateProject={updateProject} />
      </aside>

      <section className="stage-column">
        <Stage project={project} editable selectedSpriteId={selectedSpriteId} onProjectChange={setProject} showControls setMessage={setMessage} />
      </section>

      <aside className="panel work-panel">
        <div className="editor-tabs">
          {[
            ["code", "Code"],
            ["sprite", "Sprite"],
            ["assets", "Assets"],
            ["project", "Project"]
          ].map(([key, label]) => (
            <button key={key} className={activePane === key ? "active" : ""} onClick={() => setActivePane(key)}>
              {label}
            </button>
          ))}
        </div>
        {activePane === "code" &&
          (selectedBackground ? (
            <BackgroundInspector project={project} updateProject={updateProject} setMessage={setMessage} />
          ) : selectedSprite ? (
            <SpriteInspector mode="code" sprite={selectedSprite} project={project} updateProject={updateProject} setMessage={setMessage} />
          ) : (
            <p className="muted">Select a sprite.</p>
          ))}
        {activePane === "sprite" &&
          (selectedBackground ? (
            <ProjectSettings
              project={project}
              backgroundAssets={backgroundAssets}
              thumbnailAssets={thumbnailAssets}
              currentThumbnail={currentThumbnail}
              updateProject={updateProject}
            />
          ) : selectedSprite ? (
            <SpriteInspector mode="sprite" sprite={selectedSprite} project={project} updateProject={updateProject} setMessage={setMessage} />
          ) : (
            <p className="muted">Select a sprite.</p>
          ))}
        {activePane === "assets" && (
          <AssetPanel
            project={project}
            assetKind={assetKind}
            setAssetKind={setAssetKind}
            onUploaded={(nextProject) => setProject(normalizeProject(nextProject))}
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
        )}
        {activePane === "project" && (
          <ProjectSettings
            project={project}
            backgroundAssets={backgroundAssets}
            thumbnailAssets={thumbnailAssets}
            currentThumbnail={currentThumbnail}
            updateProject={updateProject}
          />
        )}
      </aside>
    </section>
  );
}

function ProjectSettings({ project, backgroundAssets, thumbnailAssets, currentThumbnail, updateProject }) {
  return (
    <div className="settings-stack">
      <div className="section-row">
        <h2>Project Settings</h2>
      </div>
      <label>
        Title
        <input value={project.title} onChange={(event) => updateProject((draft) => (draft.title = event.target.value))} />
      </label>
      <label>
        Description
        <textarea rows="4" value={project.description} onChange={(event) => updateProject((draft) => (draft.description = event.target.value))} />
      </label>
      <label>
        Visibility
        <select value={project.published ? "published" : "draft"} onChange={(event) => updateProject((draft) => (draft.published = event.target.value === "published"))}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
      <div className="grid-two">
        <label>
          Stage width
          <input
            type="number"
            min="240"
            max="1280"
            value={project.data.stage.width}
            onChange={(event) => updateProject((draft) => (draft.data.stage.width = Number(event.target.value) || 480))}
          />
        </label>
        <label>
          Stage height
          <input
            type="number"
            min="180"
            max="720"
            value={project.data.stage.height}
            onChange={(event) => updateProject((draft) => (draft.data.stage.height = Number(event.target.value) || 360))}
          />
        </label>
      </div>
      <label>
        Stage color
        <input
          type="color"
          value={project.data.stage.backgroundColor}
          onChange={(event) => updateProject((draft) => (draft.data.stage.backgroundColor = event.target.value))}
        />
      </label>
      <label>
        Background image
        <select value={project.data.stage.backgroundAssetId || ""} onChange={(event) => updateProject((draft) => (draft.data.stage.backgroundAssetId = Number(event.target.value) || null))}>
          <option value="">Stage color only</option>
          {backgroundAssets.map((asset) => (
            <option value={asset.id} key={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project thumbnail
        <select value={project.thumbnailAssetId || ""} onChange={(event) => updateProject((draft) => (draft.thumbnailAssetId = Number(event.target.value) || null))}>
          <option value="">No thumbnail</option>
          {thumbnailAssets.map((asset) => (
            <option value={asset.id} key={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      <div className="thumbnail-preview">
        {currentThumbnail ? <img src={currentThumbnail.url} alt="" /> : <span>{project.title.slice(0, 1).toUpperCase()}</span>}
      </div>
      <dl className="project-facts">
        <div>
          <dt>Author</dt>
          <dd>{project.author}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{project.published ? "Published" : "Draft"}</dd>
        </div>
        <div>
          <dt>Sprites</dt>
          <dd>{project.data.sprites.length}</dd>
        </div>
        <div>
          <dt>Assets</dt>
          <dd>{project.assets.length}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{new Date(project.createdAt).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{new Date(project.updatedAt).toLocaleDateString()}</dd>
        </div>
      </dl>
    </div>
  );
}

function SpriteList({ sprites, selectedSpriteId, selectedBackground, onSelectBackground, onSelect, onAdd, onDelete, onDuplicate, onMove }) {
  return (
    <div className="sprite-list">
      <div className="section-row">
        <h2>Sprites</h2>
        <button onClick={onAdd} title="Add sprite">
          <Plus size={17} />
        </button>
      </div>
      <div className={`sprite-row stage-target ${selectedBackground ? "selected" : ""}`}>
        <button onClick={onSelectBackground}>Background</button>
        <span />
        <span />
        <span />
        <span />
      </div>
      {sprites.map((sprite) => (
        <div className={`sprite-row ${selectedSpriteId === sprite.id ? "selected" : ""}`} key={sprite.id}>
          <button onClick={() => onSelect(sprite.id)}>{sprite.name}</button>
          <button className="icon" onClick={() => onMove(sprite.id, -1)} title="Move back">
            <ArrowUp size={15} />
          </button>
          <button className="icon" onClick={() => onMove(sprite.id, 1)} title="Move forward">
            <ArrowDown size={15} />
          </button>
          <button className="icon" onClick={() => onDuplicate(sprite.id)} title="Duplicate sprite">
            <Copy size={15} />
          </button>
          <button className="icon danger" onClick={() => onDelete(sprite.id)} title="Delete sprite">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function VariablePanel({ project, updateProject }) {
  const variables = project.data.variables || [];
  return (
    <div className="sprite-list">
      <div className="section-row">
        <h2>Variables</h2>
        <button
          onClick={() =>
            updateProject((draft) => {
              draft.data.variables ||= [];
              draft.data.variables.push({ id: `var-${Date.now()}`, name: `score${draft.data.variables.length || ""}`, value: 0, visible: true });
            })
          }
          title="Add variable"
        >
          <Plus size={17} />
        </button>
      </div>
      {variables.map((variable) => (
        <div className="variable-row" key={variable.id}>
          <input
            value={variable.name}
            onChange={(event) =>
              updateProject((draft) => {
                draft.data.variables.find((item) => item.id === variable.id).name = event.target.value;
              })
            }
          />
          <input
            value={variable.value}
            onChange={(event) =>
              updateProject((draft) => {
                draft.data.variables.find((item) => item.id === variable.id).value = event.target.value;
              })
            }
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={variable.visible !== false}
              onChange={(event) =>
                updateProject((draft) => {
                  draft.data.variables.find((item) => item.id === variable.id).visible = event.target.checked;
                })
              }
            />
            Show
          </label>
          <button
            className="icon danger"
            onClick={() =>
              updateProject((draft) => {
                draft.data.variables = draft.data.variables.filter((item) => item.id !== variable.id);
              })
            }
            title="Delete variable"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function SpriteInspector({ mode = "all", sprite, project, updateProject, setMessage }) {
  const costumeAssets = project.assets.filter((asset) => ["sprite", "costume"].includes(asset.kind));
  const [showBuiltIns, setShowBuiltIns] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [codeDraft, setCodeDraft] = useState(sprite.script.code);
  const [codeDirty, setCodeDirty] = useState(false);
  const updateSprite = (mutator) =>
    updateProject((draft) => {
      const target = draft.data.sprites.find((item) => item.id === sprite.id);
      mutator(target);
    });

  useEffect(() => {
    setCodeDraft(sprite.script.code);
    setCodeDirty(false);
  }, [sprite.id, sprite.script.language]);

  useEffect(() => {
    if (!codeDirty) return undefined;
    const timer = window.setTimeout(() => {
      updateSprite((draft) => {
        draft.script.code = codeDraft;
      });
      setCodeDirty(false);
      setMessage?.("Code applied.");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [codeDraft, codeDirty]);

  const stageX = Math.round(sprite.x - project.data.stage.width / 2);
  const stageY = Math.round(project.data.stage.height / 2 - sprite.y);
  const currentCostume = project.assets.find((asset) => asset.id === sprite.costumeAssetId);
  const showSpriteSettings = mode === "all" || mode === "sprite";
  const showCodeEditor = mode === "all" || mode === "code";

  return (
    <div className="settings-stack">
      <div className="section-row">
        <h2>{sprite.name}</h2>
      </div>
      {showSpriteSettings && (
        <>
          <div className="sprite-preview">
            {currentCostume ? <img src={currentCostume.url} alt="" /> : <span>SC</span>}
            <div>
              <strong>{currentCostume?.name || "Default ScriptCraft sprite"}</strong>
              <span>{currentCostume ? "Costume asset" : "Built-in logo sprite"}</span>
            </div>
          </div>
          <label>
            Name
            <input value={sprite.name} onChange={(event) => updateSprite((draft) => (draft.name = event.target.value))} />
          </label>
          <div className="grid-two">
            <label>
              X
              <input
                type="number"
                value={stageX}
                onChange={(event) => updateSprite((draft) => (draft.x = project.data.stage.width / 2 + Number(event.target.value || 0)))}
              />
            </label>
            <label>
              Y
              <input
                type="number"
                value={stageY}
                onChange={(event) => updateSprite((draft) => (draft.y = project.data.stage.height / 2 - Number(event.target.value || 0)))}
              />
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
          <label className="check-row">
            <input type="checkbox" checked={sprite.visible !== false} onChange={(event) => updateSprite((draft) => (draft.visible = event.target.checked))} />
            Visible on stage
          </label>
          <label>
            Costume
            <select value={sprite.costumeAssetId || ""} onChange={(event) => updateSprite((draft) => (draft.costumeAssetId = Number(event.target.value) || null))}>
              <option value="">Default logo sprite</option>
              {costumeAssets.map((asset) => (
                <option value={asset.id} key={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {showCodeEditor && (
        <>
          <label>
            Language
            <select
              value={sprite.script.language}
              onChange={(event) => {
                const nextLanguage = event.target.value;
                const converted = convertScript(codeDraft, sprite.script.language, nextLanguage);
                setCodeDraft(converted);
                setCodeDirty(false);
                updateSprite((draft) => {
                  draft.script.code = converted;
                  draft.script.language = nextLanguage;
                });
              }}
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
              value={codeDraft}
              onChange={(event) => {
                setCodeDraft(event.target.value);
                setCodeDirty(true);
              }}
              onBlur={() => {
                if (!codeDirty) return;
                updateSprite((draft) => {
                  draft.script.code = codeDraft;
                });
                setCodeDirty(false);
              }}
            />
          </label>
          <div className="toolbar code-toolbar">
            <button
              className="primary"
              onClick={() => {
                updateSprite((draft) => {
                  draft.script.code = codeDraft;
                });
                setCodeDirty(false);
                setMessage?.("Code applied.");
              }}
            >
              <Save size={17} />
              Apply code
            </button>
            <button onClick={() => setShowBuiltIns((value) => !value)}>
              <Code2 size={17} />
              {showBuiltIns ? "Hide Functions" : "Info for Functions"}
            </button>
            <button onClick={() => setShowCoach((value) => !value)}>
              <Sparkles size={17} />
              {showCoach ? "Hide AI Help" : "AI Help"}
            </button>
            {codeDirty && <span className="inline-status">Applies after 2000 ms idle</span>}
          </div>
          {showCoach && <CodeCoach code={codeDraft} language={sprite.script.language} target="sprite" />}
          {showBuiltIns && (
            <BuiltInReference
              language={sprite.script.language}
              onInsert={(snippet) => {
                setCodeDraft((current) => `${current.trimEnd()}\n${snippet}`);
                setCodeDirty(true);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function BackgroundInspector({ project, updateProject, setMessage }) {
  const script = project.data.stage.script || { language: "javascript", code: defaultBackgroundScripts.javascript };
  const [showBuiltIns, setShowBuiltIns] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [codeDraft, setCodeDraft] = useState(script.code);
  const [codeDirty, setCodeDirty] = useState(false);

  const updateScript = (mutator) =>
    updateProject((draft) => {
      draft.data.stage.script ||= { language: "javascript", code: defaultBackgroundScripts.javascript };
      mutator(draft.data.stage.script);
    });

  useEffect(() => {
    setCodeDraft(script.code);
    setCodeDirty(false);
  }, [script.language]);

  useEffect(() => {
    if (!codeDirty) return undefined;
    const timer = window.setTimeout(() => {
      updateScript((draft) => {
        draft.code = codeDraft;
      });
      setCodeDirty(false);
      setMessage?.("Background code applied.");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [codeDraft, codeDirty]);

  return (
    <div className="settings-stack">
      <div className="section-row">
        <h2>Background Code</h2>
      </div>
      <label>
        Language
        <select
          value={script.language}
          onChange={(event) => {
            const nextLanguage = event.target.value;
            const converted = convertScript(codeDraft, script.language, nextLanguage);
            setCodeDraft(converted);
            setCodeDirty(false);
            updateScript((draft) => {
              draft.code = converted;
              draft.language = nextLanguage;
            });
          }}
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
          value={codeDraft}
          onChange={(event) => {
            setCodeDraft(event.target.value);
            setCodeDirty(true);
          }}
          onBlur={() => {
            if (!codeDirty) return;
            updateScript((draft) => {
              draft.code = codeDraft;
            });
            setCodeDirty(false);
          }}
        />
      </label>
      <div className="toolbar code-toolbar">
        <button
          className="primary"
          onClick={() => {
            updateScript((draft) => {
              draft.code = codeDraft;
            });
            setCodeDirty(false);
            setMessage?.("Background code applied.");
          }}
        >
          <Save size={17} />
          Apply code
        </button>
        <button onClick={() => setShowBuiltIns((value) => !value)}>
          <Code2 size={17} />
          {showBuiltIns ? "Hide Functions" : "Info for Functions"}
        </button>
        <button onClick={() => setShowCoach((value) => !value)}>
          <Sparkles size={17} />
          {showCoach ? "Hide AI Help" : "AI Help"}
        </button>
        {codeDirty && <span className="inline-status">Applies after 2000 ms idle</span>}
      </div>
      {showCoach && <CodeCoach code={codeDraft} language={script.language} target="background" />}
      {showBuiltIns && (
        <BuiltInReference
          language={script.language}
          onInsert={(snippet) => {
            setCodeDraft((current) => `${current.trimEnd()}\n${snippet}`);
            setCodeDirty(true);
          }}
        />
      )}
    </div>
  );
}

function CodeCoach({ code, language, target }) {
  const tips = useMemo(() => analyzeCode(code, language, target), [code, language, target]);
  return (
    <div className="coach-panel">
      <div className="section-row">
        <h2>AI Help</h2>
        <span>{tips.score}</span>
      </div>
      <div className="coach-grid">
        {tips.items.map((item) => (
          <article className={`coach-card ${item.level}`} key={item.title}>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function analyzeCode(code, language, target) {
  const text = String(code || "");
  const items = [];
  const add = (level, title, body) => items.push({ level, title, body });
  const hasStart = language === "python" ? /\bdef\s+start\s*\(/.test(text) : /\b(start|void\s+start)\s*\(/.test(text);
  const hasUpdate = language === "python" ? /\bdef\s+update\s*\(/.test(text) : /\b(update|void\s+update)\s*\(/.test(text);

  if (!hasStart) add("warn", "Add start()", "Use start() for setup that should happen once when Play begins.");
  if (!hasUpdate) add("warn", "Add update(dt)", "Use update(dt) for frame behavior. dt is milliseconds, so speed code should multiply by dt.");
  if (/\bsay\s*\([^,\n]+,\s*(0\.\d+|1(\.0)?|1\.5|2(\.0)?)\s*\)/.test(text)) {
    add("warn", "Use milliseconds", "ScriptCraft durations use milliseconds now. For example, use say(\"Hello\", 1500), not say(\"Hello\", 1.5).");
  }
  if (/\bchange[XY]\s*\(\s*[A-Za-z_$][\w$]*\s*\*\s*dt\s*\)/.test(text) && !/\/\s*1000/.test(text)) {
    add("info", "Check speed units", "Because dt is milliseconds, pixels-per-second speeds should usually divide by 1000 before multiplying by dt.");
  }
  if (/\b(fetch|while\s*\(\s*true\s*\)|alert\s*\(|prompt\s*\()/i.test(text)) {
    add("warn", "Avoid blocking the frame", "Long or blocking work inside update(dt) can freeze the stage. Keep update small and spread work across frames.");
  }
  if (target === "background" && /\b(move|changeX|changeY|goTo|setX|setY|bounceOnEdge)\s*\(/.test(text)) {
    add("info", "Background has no sprite body", "Background code can use timers, variables, broadcasts, console logs, and setBackgroundColor(). Sprite movement commands only affect sprites.");
  }
  if (target === "sprite" && /\bsetBackgroundColor\s*\(/.test(text)) {
    add("info", "Stage changes are global", "setBackgroundColor() works from sprite code too, but background code is usually the cleaner place for stage-wide behavior.");
  }
  if (/console\.log|log\s*\(/.test(text)) {
    add("ok", "Console ready", "Logs appear under the stage console while the project is playing.");
  } else {
    add("info", "Use the console", "Add console.log(value) in JavaScript or log(value) in Python/C-style code to debug values while playing.");
  }
  if (!items.some((item) => item.level === "warn")) {
    add("ok", "Looks runnable", "No common ScriptCraft mistakes were found. Press Play and watch the console for runtime logs.");
  }

  return {
    score: items.some((item) => item.level === "warn") ? "Needs review" : "Clean",
    items
  };
}

const builtIns = [
  {
    name: "start",
    args: "",
    description: "Runs once when Play starts.",
    js: "function start() {\n  say(\"Ready\", 1000);\n}",
    python: "def start():\n    say(\"Ready\", 1000)",
    c: "void start() {\n  say(\"Ready\", 1000);\n}"
  },
  {
    name: "update",
    args: "dt",
    description: "Runs every frame while playing.",
    js: "function update(dt) {\n  move(0.24 * dt);\n}",
    python: "def update(dt):\n    move(0.24 * dt)",
    c: "void update(float dt) {\n  move(0.24 * dt);\n}"
  },
  { name: "x / y", args: "", description: "Current sprite position values.", js: "console.log(x, y);", python: "log(x, y)", c: "log(x, y);" },
  { name: "direction", args: "", description: "Current sprite rotation.", js: "console.log(direction);", python: "log(direction)", c: "log(direction);" },
  { name: "mouseX / mouseY", args: "", description: "Mouse position on stage.", js: "console.log(mouseX, mouseY);", python: "log(mouse_x, mouse_y)", c: "log(mouseX, mouseY);" },
  { name: "backgroundColor", args: "", description: "Current background color.", js: "console.log(backgroundColor);", python: "log(backgroundColor)", c: "log(backgroundColor);" },
  { name: "mouseDown", args: "", description: "Whether the mouse is pressed.", js: "if (mouseDown) {\n  say(\"click\", 200);\n}", python: "if mouse_down:\n    say(\"click\", 200)", c: "if (mouseDown) {\n  say(\"click\", 200);\n}" },
  { name: "console.log", args: "value", description: "Print to the stage console.", js: "console.log(\"hello\");", python: "log(\"hello\")", c: "log(\"hello\");" },
  { name: "move", args: "steps", description: "Move in the sprite direction.", js: "move(10);", python: "move(10)", c: "move(10);" },
  { name: "turn", args: "degrees", description: "Rotate the sprite.", js: "turn(15);", python: "turn(15)", c: "turn(15);" },
  { name: "setRotation", args: "degrees", description: "Set sprite rotation.", js: "setRotation(90);", python: "set_rotation(90)", c: "setRotation(90);" },
  { name: "pointInDirection", args: "degrees", description: "Point to an angle.", js: "pointInDirection(0);", python: "point_in_direction(0)", c: "pointInDirection(0);" },
  { name: "pointTowards", args: "x, y", description: "Face a point.", js: "pointTowards(mouseX, mouseY);", python: "point_towards(mouse_x, mouse_y)", c: "pointTowards(mouseX, mouseY);" },
  { name: "goTo", args: "x, y", description: "Place the sprite.", js: "goTo(0, 0);", python: "go_to(0, 0)", c: "goTo(0, 0);" },
  { name: "setX", args: "x", description: "Set horizontal position.", js: "setX(0);", python: "set_x(0)", c: "setX(0);" },
  { name: "setY", args: "y", description: "Set vertical position.", js: "setY(0);", python: "set_y(0)", c: "setY(0);" },
  { name: "changeX", args: "amount", description: "Move horizontally.", js: "changeX(4);", python: "change_x(4)", c: "changeX(4);" },
  { name: "changeY", args: "amount", description: "Move vertically.", js: "changeY(4);", python: "change_y(4)", c: "changeY(4);" },
  { name: "setSize", args: "pixels", description: "Set sprite size.", js: "setSize(80);", python: "set_size(80)", c: "setSize(80);" },
  { name: "setColor", args: "color", description: "Set shape color.", js: "setColor(\"#16a34a\");", python: "set_color(\"#16a34a\")", c: "setColor(\"#16a34a\");" },
  { name: "say", args: "text, milliseconds", description: "Show a speech bubble.", js: "say(\"Hello\", 1500);", python: "say(\"Hello\", 1500)", c: "say(\"Hello\", 1500);" },
  { name: "show / hide", args: "", description: "Toggle sprite visibility.", js: "show();\nhide();", python: "show()\nhide()", c: "show();\nhide();" },
  { name: "key", args: "name", description: "Check a keyboard key.", js: "if (key(\"ArrowRight\")) {\n  changeX(4);\n}", python: "if key(\"ArrowRight\"):\n    change_x(4)", c: "if (key(\"ArrowRight\")) {\n  changeX(4);\n}" },
  { name: "random", args: "min, max", description: "Pick a random number.", js: "goTo(random(-240, 240), random(-180, 180));", python: "go_to(random(-240, 240), random(-180, 180))", c: "goTo(random(-240, 240), random(-180, 180));" },
  { name: "touchingEdge", args: "", description: "Check stage edge.", js: "if (touchingEdge()) {\n  turn(180);\n}", python: "if touching_edge():\n    turn(180)", c: "if (touchingEdge()) {\n  turn(180);\n}" },
  { name: "touchingSprite", args: "name", description: "Check another sprite.", js: "if (touchingSprite(\"Sprite 2\")) {\n  say(\"hit\", 500);\n}", python: "if touching_sprite(\"Sprite 2\"):\n    say(\"hit\", 500)", c: "if (touchingSprite(\"Sprite 2\")) {\n  say(\"hit\", 500);\n}" },
  { name: "touchingMouse", args: "", description: "Check the mouse pointer.", js: "if (touchingMouse()) {\n  setColor(\"#ef4444\");\n}", python: "if touching_mouse():\n    set_color(\"#ef4444\")", c: "if (touchingMouse()) {\n  setColor(\"#ef4444\");\n}" },
  { name: "bounceOnEdge", args: "", description: "Keep sprite on stage.", js: "bounceOnEdge();", python: "bounce_on_edge()", c: "bounceOnEdge();" },
  { name: "timer", args: "", description: "Milliseconds since timer reset.", js: "console.log(timer());", python: "log(timer())", c: "log(timer());" },
  { name: "resetTimer", args: "", description: "Reset the timer.", js: "resetTimer();", python: "reset_timer()", c: "resetTimer();" },
  { name: "getVar", args: "name", description: "Read a variable.", js: "const score = getVar(\"score\");", python: "score = get_var(\"score\")", c: "float score = getVar(\"score\");" },
  { name: "setVar", args: "name, value", description: "Set a variable.", js: "setVar(\"score\", 0);", python: "set_var(\"score\", 0)", c: "setVar(\"score\", 0);" },
  { name: "changeVar", args: "name, amount", description: "Change a variable.", js: "changeVar(\"score\", 1);", python: "change_var(\"score\", 1)", c: "changeVar(\"score\", 1);" },
  { name: "broadcast", args: "message", description: "Send a message to sprites.", js: "broadcast(\"start\");", python: "broadcast(\"start\")", c: "broadcast(\"start\");" },
  { name: "onMessage", args: "message", description: "Runs when broadcast receives a message.", js: "function onMessage(message) {\n  say(message, 1000);\n}", python: "def on_message(message):\n    say(message, 1000)", c: "void onMessage(char* message) {\n  say(message, 1000);\n}" },
  { name: "penDown / penUp", args: "", description: "Start or stop drawing.", js: "penDown();\nmove(40);\npenUp();", python: "pen_down()\nmove(40)\npen_up()", c: "penDown();\nmove(40);\npenUp();" },
  { name: "setPenColor", args: "color", description: "Set pen color.", js: "setPenColor(\"#1565c0\");", python: "set_pen_color(\"#1565c0\")", c: "setPenColor(\"#1565c0\");" },
  { name: "setPenSize", args: "size", description: "Set pen width.", js: "setPenSize(4);", python: "set_pen_size(4)", c: "setPenSize(4);" },
  { name: "clearPen", args: "", description: "Clear pen drawings.", js: "clearPen();", python: "clear_pen()", c: "clearPen();" },
  { name: "setBackgroundColor", args: "color", description: "Set the stage background color.", js: "setBackgroundColor(\"#eef3ff\");", python: "set_background_color(\"#eef3ff\")", c: "setBackgroundColor(\"#eef3ff\");" }
];

const builtInParamInfo = {
  start: ["No parameters. Runs once when Play starts."],
  update: ["dt: milliseconds since the last frame."],
  "x / y": ["x: current horizontal position.", "y: current vertical position."],
  direction: ["No parameters. Reads the sprite rotation in degrees."],
  "mouseX / mouseY": ["mouseX: mouse horizontal stage position.", "mouseY: mouse vertical stage position."],
  backgroundColor: ["No parameters. Reads the stage background color."],
  mouseDown: ["No parameters. True while the mouse is pressed."],
  "console.log": ["value: any value to print in the stage console."],
  move: ["steps: pixels to move in the current direction."],
  turn: ["degrees: amount to rotate clockwise."],
  setRotation: ["degrees: exact rotation angle."],
  pointInDirection: ["degrees: direction to face."],
  pointTowards: ["x: target horizontal position.", "y: target vertical position."],
  goTo: ["x: target horizontal position.", "y: target vertical position."],
  setX: ["x: new horizontal position."],
  setY: ["y: new vertical position."],
  changeX: ["amount: pixels to add to x."],
  changeY: ["amount: pixels to add to y."],
  setSize: ["pixels: sprite display size."],
  setColor: ["color: CSS color like \"#16a34a\" or \"red\"."],
  say: ["text: message to show.", "milliseconds: how long the bubble stays."],
  "show / hide": ["No parameters. Changes sprite visibility."],
  key: ["name: keyboard key, like \"ArrowRight\" or \"a\"."],
  random: ["min: lowest value.", "max: highest value."],
  touchingEdge: ["No parameters. True if the sprite touches the stage edge."],
  touchingSprite: ["name: sprite name to check. Leave empty to check any sprite."],
  touchingMouse: ["No parameters. True when the pointer touches the sprite."],
  bounceOnEdge: ["No parameters. Clamps the sprite inside the stage."],
  timer: ["No parameters. Returns milliseconds since reset."],
  resetTimer: ["No parameters. Starts timer back at zero."],
  getVar: ["name: variable name to read."],
  setVar: ["name: variable name.", "value: new value."],
  changeVar: ["name: variable name.", "amount: number to add."],
  broadcast: ["message: text message sent to all sprites."],
  onMessage: ["message: text received from broadcast."],
  "penDown / penUp": ["No parameters. Starts or stops drawing while moving."],
  setPenColor: ["color: CSS color for pen lines."],
  setPenSize: ["size: pen line width in pixels."],
  clearPen: ["No parameters. Clears all pen drawings."],
  setBackgroundColor: ["color: CSS color for the stage background."]
};

function BuiltInReference({ language, onInsert }) {
  return (
    <div className="builtins">
      <div className="section-row">
        <h2>Built-ins</h2>
      </div>
      <div className="builtin-grid">
        {builtIns.map((item) => (
          <article key={item.name} className="builtin-card">
            <div>
              <strong>
                {item.name}
                {item.args ? `(${item.args})` : ""}
              </strong>
              <span>{item.description}</span>
              <ul className="param-list">
                {(builtInParamInfo[item.name] || ["No parameter details."]).map((param) => (
                  <li key={param}>{param}</li>
                ))}
              </ul>
            </div>
            <button onClick={() => onInsert(`\n${item[language]}\n`)}>
              <Plus size={14} />
              Insert
            </button>
          </article>
        ))}
      </div>
    </div>
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
              {asset.kind === "background" ? "Set background" : asset.kind === "thumbnail" ? "Set thumbnail" : "Use as costume"}
            </button>
            <button
              className="danger"
              onClick={async () => {
                await api.deleteAsset(project.id, asset.id);
                const data = await api.project(project.id);
                onUploaded(normalizeProject(data.project));
                setMessage("Asset deleted.");
              }}
            >
              <Trash2 size={16} />
              Delete
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
  const [mode, setMode] = useState("brush");
  const drawing = useRef({ active: false, start: null, snapshot: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    const source = event.touches?.[0] || event.changedTouches?.[0] || event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((source.clientY - rect.top) / rect.height) * canvasRef.current.height
    };
  }

  function configureStroke(ctx, tool = mode) {
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  }

  function strokeShape(ctx, start, end, tool = mode) {
    configureStroke(ctx, tool);
    ctx.beginPath();
    if (tool === "line") {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    } else if (tool === "rectangle") {
      ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (tool === "ellipse") {
      ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function beginDraw(event) {
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = point(event);
    drawing.current = {
      active: true,
      start: p,
      snapshot: ctx.getImageData(0, 0, canvas.width, canvas.height)
    };
    configureStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function draw(event) {
    if (!drawing.current.active) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = point(event);
    if (mode === "brush" || mode === "eraser") {
      configureStroke(ctx);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      return;
    }
    ctx.putImageData(drawing.current.snapshot, 0, 0);
    strokeShape(ctx, drawing.current.start, p);
  }

  function endDraw(event) {
    if (!drawing.current.active) return;
    if (event) draw(event);
    drawing.current = { active: false, start: null, snapshot: null };
  }

  return (
    <div className="drawing-tool">
      <canvas
        ref={canvasRef}
        width="320"
        height="180"
        onMouseDown={beginDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={() => endDraw()}
        onTouchStart={beginDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="drawing-actions">
        <div className="segmented tool-modes">
          {[
            ["brush", Brush, "Brush"],
            ["eraser", Eraser, "Eraser"],
            ["line", Minus, "Line"],
            ["rectangle", Square, "Rectangle"],
            ["ellipse", Circle, "Ellipse"]
          ].map(([key, Icon, label]) => (
            <button key={key} className={mode === key ? "active" : ""} onClick={() => setMode(key)} title={label}>
              <Icon size={16} />
            </button>
          ))}
        </div>
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
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(playing);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const [consoleLines, setConsoleLines] = useState([]);
  const assetMap = useMemo(() => Object.fromEntries(project.assets.map((asset) => [asset.id, asset.url])), [project.assets]);
  const dataSignature = useMemo(() => JSON.stringify(project.data), [project.data]);
  const assetSignature = useMemo(() => project.assets.map((asset) => `${asset.id}:${asset.url}`).join("|"), [project.assets]);

  useEffect(() => {
    setRuntimeError("");
    const runtime = createRuntime(canvasRef.current, project.data, assetMap, {
      onError: (message) => {
        setRuntimeError(message);
        setMessage?.(message);
      },
      onLog: (line) => {
        setConsoleLines((current) => [...current.slice(-80), { id: `${Date.now()}-${Math.random()}`, text: line }]);
      }
    });
    runtimeRef.current = runtime;
    runtime.draw();
    if (isPlaying && !isPaused) runtime.start();
    return () => runtime.dispose();
  }, [project.id, dataSignature, assetSignature]);

  useEffect(() => {
    if (!runtimeRef.current) return;
    if (!isPlaying) runtimeRef.current.stop();
    else if (isPaused) runtimeRef.current.pause();
  }, [isPlaying, isPaused]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await wrapRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  function captureThumbnail() {
    canvasRef.current?.toBlob(async (blob) => {
      if (!blob) return;
      const form = new FormData();
      form.append("image", new File([blob], `stage-${Date.now()}.png`, { type: "image/png" }));
      form.append("kind", "thumbnail");
      form.append("name", "Stage thumbnail");
      try {
        const data = await api.uploadAsset(project.id, form);
        onProjectChange?.(data.project);
        setMessage?.("Thumbnail captured.");
      } catch (err) {
        setMessage?.(err.message);
      }
    }, "image/png");
  }

  return (
    <div className="stage-wrap" ref={wrapRef}>
      <div className="stage-top">
        <div>
          <h2>Stage</h2>
          {runtimeError && <span className="runtime-error">{runtimeError}</span>}
        </div>
        {showControls && (
          <div className="toolbar">
            <button
              className="primary"
              onClick={() => {
                setRuntimeError("");
                if (isPlaying) {
                  runtimeRef.current?.stop();
                  setIsPlaying(false);
                  setIsPaused(false);
                } else {
                  setConsoleLines([]);
                  setIsPaused(false);
                  runtimeRef.current?.start();
                  setIsPlaying(true);
                }
              }}
            >
              {isPlaying ? <Square size={17} /> : <Play size={17} />}
              {isPlaying ? "Stop" : "Play"}
            </button>
            {isPlaying && (
              <button
                onClick={() => {
                  if (isPaused) {
                    runtimeRef.current?.resume();
                    setIsPaused(false);
                  } else {
                    runtimeRef.current?.pause();
                    setIsPaused(true);
                  }
                }}
              >
                {isPaused ? <Play size={17} /> : <Pause size={17} />}
                {isPaused ? "Resume" : "Pause"}
              </button>
            )}
            <button onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
            {editable && (
              <button onClick={captureThumbnail}>
                <Camera size={17} />
                Thumbnail
              </button>
            )}
          </div>
        )}
      </div>
      <canvas className={editable ? "editable-canvas" : ""} ref={canvasRef} width={project.data.stage.width} height={project.data.stage.height} />
      {editable && <p className="muted">Selected target: {selectedSpriteId === "__stage__" ? "Background" : selectedSpriteId || "none"}</p>}
      <div className="console-panel">
        <div className="section-row">
          <h2>Console</h2>
          <button onClick={() => setConsoleLines([])}>Clear</button>
        </div>
        <div className="console-output">
          {consoleLines.length ? consoleLines.map((line) => <div key={line.id}>{line.text}</div>) : <span>No logs yet.</span>}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
