const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const output = path.join(root, 'final', 'browser-scenes');
fs.mkdirSync(output, { recursive: true });
const log = (message) => fs.appendFileSync(path.join(output, 'render.log'), `${message}\n`);
log('script-start');
log(`electron=${process.versions.electron || 'none'} app=${typeof app}`);

async function captureScene(win, index) {
  log(`loading-${index}`);
  await win.loadFile(path.join(root, 'render-browser-scenes.html'));
  await win.webContents.executeJavaScript(`window.scrollTo(0, ${(index - 1) * 1920});`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1080, height: 1920 });
  fs.writeFileSync(path.join(output, `scene-${index}.png`), image.toPNG());
  log(`saved-${index}`);
}

app.whenReady().then(async () => {
  log('app-ready');
  const win = new BrowserWindow({
    show: false,
    frame: false,
    width: 1080,
    height: 1920,
    webPreferences: { backgroundThrottling: false },
  });
  win.setContentSize(1080, 1920);
  for (let index = 1; index <= 4; index += 1) await captureScene(win, index);
  await app.quit();
}).catch((error) => {
  log(error.stack || String(error));
  console.error(error);
  app.exit(1);
});
