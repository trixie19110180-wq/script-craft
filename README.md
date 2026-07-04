# ScriptCraft

ScriptCraft is a Scratch-like creative coding platform for browser-based sprite projects. It supports username/password accounts without email, project saving and publishing, uploaded image assets, a built-in drawing canvas, and a playable stage runtime for JavaScript plus Python-style and C-style beginner code.

## Features

- Username/password signup and login with hashed passwords and HTTP-only session cookies.
- Project ownership, private drafts, publishing, browsing, playing, editing, and deleting.
- Stage, sprites, costumes, backgrounds, thumbnails, and project metadata.
- Safe image upload handling for PNG, JPEG, WebP, GIF, and SVG files.
- Built-in drawing tool that saves drawings as project image assets.
- Fullscreen project playback.
- In-editor built-in function reference with insert buttons.
- In-app stage console for `console.log(...)` and `log(...)`.
- Remix button for published projects, with original project attribution.
- Variables with stage monitors and runtime commands.
- Sprite duplicate, visibility, and layer-order controls.
- Stage thumbnail capture from the editor.
- ScriptCraft `.scriptcraft` export/import with embedded image assets.
- Scratch `.sb3` and Entry `.ent` imports for stages, sprites, costumes, backgrounds, positions, and editable imported-code stubs.
- JavaScript, Python-style, and C-style code switching with common ScriptCraft API conversion.
- SQLite schema initialized automatically on startup.
- Render deployment config with a persistent disk for the database and uploads.

## Tech stack

- Backend: Node.js, Express, SQLite via `better-sqlite3`, `bcryptjs`, and `multer`.
- Frontend: React and Vite.
- Runtime: project code runs in the visitor's browser, never on the server. JavaScript is executed directly. Python and C modes are intentionally small ScriptCraft subsets that compile common beginner commands to the browser runtime.

## Local development

1. Install Node.js 20 LTS.
2. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173`.

The API runs on `http://localhost:3000` during development. Uploaded files are written to `server/uploads`, and the local database is written to `server/data/scriptcraft.sqlite`.

## Production build

```bash
npm install
npm run build
npm start
```

The production server serves the built React app and the API from the same port.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Web server port | `3000` |
| `NODE_ENV` | Use `production` on Render | `development` |
| `DB_PATH` | SQLite database path | `server/data/scriptcraft.sqlite` |
| `UPLOAD_DIR` | Uploaded image directory | `server/uploads` |
| `SESSION_COOKIE_NAME` | Browser session cookie name | `scriptcraft_session` |
| `SESSION_DAYS` | Session lifetime | `14` |
| `MAX_UPLOAD_MB` | Maximum uploaded image size | `8` |

## Admin account

On startup, ScriptCraft creates or updates an admin account:

- Username: `TrixieStreamz`
- Password: `trixie19110180@gmail.com`

Admin users can view, edit, and delete projects across the platform.

## Render deployment

This repo includes `render.yaml`.

1. Create a new GitHub repository named `ScriptCraft`.
2. Push this folder to that repository.
3. In Render, create a new Blueprint from the GitHub repo, or create a Web Service manually.
4. Use:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
5. Keep these production environment values:
   - `NODE_ENV=production`
   - `DB_PATH=/var/data/scriptcraft.sqlite`
   - `UPLOAD_DIR=/var/data/uploads`
6. Add a persistent disk mounted at `/var/data`.

Without a persistent disk, the database and uploaded images can be lost when the service restarts.
If you are using Render Free without a disk, remove `DB_PATH` and `UPLOAD_DIR` or leave the app fallback in place. The service will run from temporary storage, but saved accounts, projects, and images are ephemeral.

## GitHub upload

After creating the empty GitHub repo:

```bash
git init
git add .
git commit -m "Initial ScriptCraft platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ScriptCraft.git
git push -u origin main
```

## ScriptCraft code API

Every sprite and the background can define `start`, `update`, and `onMessage`. `update(dt)` receives milliseconds since the last frame, and time-based commands also use milliseconds. The code coordinate system is centered like Scratch: on the default 480 x 360 stage, `x` is `-240..240` and `y` is `-180..180`.

JavaScript:

```js
function start() {
  say("Ready", 1000);
}

function update(dt) {
  if (key("ArrowRight")) changeX(0.24 * dt);
  bounceOnEdge();
}
```

Python mode:

```python
def start():
    say("Ready", 1000)

def update(dt):
    if key("ArrowRight"):
        change_x(0.24 * dt)
    bounce_on_edge()
```

C mode:

```c
void start() {
  say("Ready", 1000);
}

void update(float dt) {
  if (key("ArrowRight")) changeX(0.24 * dt);
  bounceOnEdge();
}
```

Background code can change the stage:

```js
function start() {
  setBackgroundColor("#eef3ff");
}
```

Available values and commands include `x`, `y`, `direction`, `mouseX`, `mouseY`, `mouseDown`, `backgroundColor`, `move`, `turn`, `setRotation`, `pointInDirection`, `pointTowards`, `goTo`, `setX`, `setY`, `changeX`, `changeY`, `setSize`, `setColor`, `say`, `show`, `hide`, `key`, `random`, `timer`, `resetTimer`, `getVar`, `setVar`, `changeVar`, `touchingEdge`, `touchingSprite`, `touchingMouse`, `bounceOnEdge`, `broadcast`, `onMessage`, `penDown`, `penUp`, `setPenColor`, `setPenSize`, `clearPen`, `setBackgroundColor`, `console.log`, and `log`.

## Project files

ScriptCraft can import:

- `.scriptcraft` files exported from ScriptCraft.
- `.sb3` Scratch 3 projects. Image costumes and backdrops are imported, and block scripts are summarized in editable JavaScript stubs.
- `.ent` Entry projects saved as gzip packages. Objects, pictures, and the selected stage picture are imported, and block scripts are summarized in editable JavaScript stubs.
- `.json` ScriptCraft export JSON.

Use **Export** inside the editor to download a portable `.scriptcraft` file that includes the project data and embedded image assets.
