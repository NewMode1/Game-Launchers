const { app, BrowserWindow, ipcMain, dialog, screen, shell, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const store = () => path.join(app.getPath('userData'), 'launcher.json');
const DEFAULT = { theme: 'dark', autoClose: true, groups: [] };
const load = () => { try { return { ...DEFAULT, ...JSON.parse(fs.readFileSync(store(), 'utf8')) }; } catch { return { ...DEFAULT }; } };
const save = (d) => fs.writeFileSync(store(), JSON.stringify(d, null, 2));

// Window size by the display's real pixel height
function windowSize() {
  const d = screen.getPrimaryDisplay();
  const h = d.size.height * d.scaleFactor;
  if (h >= 2000) return [2560, 1440];   // 4K
  if (h >= 1300) return [1707, 960];    // 1440p
  return [1280, 720];    // 1080p
}

let win;
const groupArg = (argv) => (argv.find((a) => a.startsWith('--group=')) || '').slice(8) || null;
let startGroup = groupArg(process.argv);

function createWindow() {
  const [width, height] = windowSize();
  win = new BrowserWindow({
    width, height, useContentSize: true, resizable: false, maximizable: false,
    autoHideMenuBar: true, backgroundColor: '#080808', title: 'Program Launcher',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.removeMenu();
  // The UI is designed at 1280x720; zoom so it looks identical at every window size
  const zoom = width / 1280;
  win.webContents.on('dom-ready', () => win.webContents.setZoomFactor(zoom));
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.loadFile('index.html');
}

ipcMain.handle('load', () => load());
ipcMain.handle('save', (_, d) => save(d));
const expand = (p) => (p || '').replace(/%([^%]+)%/g, (m, v) => process.env[v] ?? m);
const isUrl = (p) => /^[a-z][a-z0-9+.-]+:\/\//i.test(p || '');
const selfPaths = () => [process.execPath, process.env.PORTABLE_EXECUTABLE_FILE].filter(Boolean).map((p) => path.resolve(p).toLowerCase());
const isSelf = (p) => !!p && !isUrl(p) && selfPaths().includes(path.resolve(expand(p)).toLowerCase());
const nameOf = (p) => path.basename(p).replace(/\.[^.]+$/, '');

// Turn a picked file into a launchable item. .lnk and .url (Steam) shortcuts
// are read so we keep their target, arguments and icon.
function resolveItem(p) {
  const ext = path.extname(p).toLowerCase();
  const item = { path: p, name: nameOf(p), kind: 'file', target: p, args: '', cwd: path.dirname(p), icon: null };
  try {
    if (ext === '.lnk') {
      const l = shell.readShortcutLink(p);
      Object.assign(item, { kind: 'lnk', target: expand(l.target), args: l.args || '',
        cwd: expand(l.cwd) || path.dirname(expand(l.target)), icon: expand(l.icon) || expand(l.target) });
    } else if (ext === '.url') {
      const t = fs.readFileSync(p, 'utf8');
      const url = (t.match(/^URL=(.*)$/mi) || [])[1]?.trim();
      const ico = (t.match(/^IconFile=(.*)$/mi) || [])[1]?.trim();
      if (url) Object.assign(item, { kind: 'url', target: url, icon: ico || null });
    }
  } catch { /* fall back to launching the file itself */ }
  return item;
}

ipcMain.handle('pick-exes', async () => {
  const r = await dialog.showOpenDialog({ title: 'Add games', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Programs and shortcuts', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd'] }] });
  if (r.canceled) return { items: [], blocked: 0 };
  const all = r.filePaths.map(resolveItem);
  const items = all.filter((i) => !isSelf(i.path) && !isSelf(i.target));   // the launcher can't add itself
  return { items, blocked: all.length - items.length };
});
ipcMain.handle('pick-image', async () => {
  const r = await dialog.showOpenDialog({ title: 'Choose group icon', properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'webp'] }] });
  if (r.canceled) return null;
  const ext = path.extname(r.filePaths[0]).slice(1).replace('jpg', 'jpeg');
  return `data:image/${ext};base64,` + fs.readFileSync(r.filePaths[0]).toString('base64');
});
ipcMain.handle('file-icon', async (_, it) => {
  const from = async (p) => {
    if (!p || isUrl(p)) return null;
    try {
      if (p.toLowerCase().endsWith('.ico')) { const i = nativeImage.createFromPath(p); if (!i.isEmpty()) return i.toDataURL(); }
      return (await app.getFileIcon(p, { size: 'large' })).toDataURL();
    } catch { return null; }
  };
  return (await from(it.icon)) || (await from(it.target)) || (await from(it.path));
});
ipcMain.handle('launch', (_, it) => new Promise((resolve) => {
  const target = it.target || it.path;
  if (isSelf(target)) return resolve("the launcher can't start itself");
  if (it.kind === 'url' || isUrl(target)) return shell.openExternal(target).then(() => resolve(null), (e) => resolve(String(e.message || e)));
  const cmd = `"${target}"${it.args ? ' ' + it.args : ''}`;
  const c = spawn(cmd, { shell: true, cwd: fs.existsSync(it.cwd || '') ? it.cwd : path.dirname(target), detached: true, stdio: 'ignore' });
  c.once('error', (e) => resolve(e.message));
  c.once('spawn', () => { c.unref(); resolve(null); });
}));
ipcMain.handle('exists', (_, it) => { const t = it.target || it.path; return isUrl(t) || fs.existsSync(t); });

ipcMain.handle('startup-group', () => startGroup);
ipcMain.handle('quit', () => app.quit());
// Build a multi-size .ico (PNG-compressed entries) from PNGs drawn by the renderer
function buildIco(pngs) {
  const n = pngs.length, head = Buffer.alloc(6 + 16 * n);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  let off = head.length;
  pngs.forEach((p, i) => {
    const o = 6 + 16 * i, d = p.size >= 256 ? 0 : p.size;
    head[o] = d; head[o + 1] = d;
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(p.buf.length, o + 8); head.writeUInt32LE(off, o + 12);
    off += p.buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

// Save the group's image as an .ico in the user data folder; returns its path or null
function groupIcon(g) {
  try {
    if (!g.icon) return null;
    const dir = path.join(app.getPath('userData'), 'icons');
    fs.mkdirSync(dir, { recursive: true });
    fs.readdirSync(dir).filter((f) => f.startsWith(g.id + '-')).forEach((f) => fs.unlinkSync(path.join(dir, f)));
    const file = path.join(dir, `${g.id}-${Date.now()}.ico`);   // new name each time dodges Windows' icon cache
    const m = /^data:image\/([a-z0-9+.-]+);base64,(.*)$/i.exec(g.icon);
    if (m && /ico/i.test(m[1])) fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    else if (g.pngs && g.pngs.length) fs.writeFileSync(file, buildIco(g.pngs.map((p) => ({ size: p.size, buf: Buffer.from(p.data, 'base64') }))));
    else return null;
    return file;
  } catch { return null; }
}

ipcMain.handle('make-shortcut', (_, g) => {
  try {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const args = (app.isPackaged ? '' : `"${app.getAppPath()}" `) + `--group=${g.id}`;
    const safe = g.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Group';
    const file = path.join(app.getPath('desktop'), `${safe} - Program Launcher.lnk`);
    const ok = shell.writeShortcutLink(file, 'create', { target: exe, args, cwd: path.dirname(exe),
      icon: groupIcon(g) || exe, iconIndex: 0, description: `Open ${g.name} in Program Launcher` });
    return ok ? null : 'Windows refused to create the file';
  } catch (e) { return e.message; }
});

// One window only: a group shortcut clicked while the launcher is open switches groups
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const id = groupArg(argv);
    if (id) win.webContents.send('select-group', id);
  });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => app.quit());
