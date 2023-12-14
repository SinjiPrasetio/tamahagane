import path from 'path';
import { app, ipcMain } from 'electron';
import serve from 'electron-serve';
import { createWindow } from './helpers';
import fs from 'fs/promises';
import GrfArchive from '../core/compress/grf/GrfReader';
import { ThorArchive, ThorFileEntry } from '../core/compress/thor/ThorReader';
import { GrfArchiveBuilder } from '../core/compress/grf/GrfBuilder';

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  serve({ directory: 'app' });
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

(async () => {
  await app.whenReady();

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isProd) {
    await mainWindow.loadURL('app://./home');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/home`);
    mainWindow.webContents.openDevTools();
  }

  // IPC event for opening any file
  ipcMain.handle('open-file', async (event, filePath) => {
    try {
      const data = await fs.readFile(filePath);
      return data; // Returning the data back to the renderer process
    } catch (error) {
      console.error('Error opening file:', error);
      throw error; // Re-throw the error to be caught on the renderer side
    }
  });

  ipcMain.handle('open-grf-file', async (_, grfPath) => {
    const read = new GrfArchive();
    const data = await read.open(grfPath);
    const FILE =
      '/Users/sinjiprasetio/Documents/Coding/tamahagane/resources/test/thor/dir2.thor';
    const thor = await ThorArchive.open(FILE);
    // console.log(data);
    // console.log(await read.getEntries());
    // console.log(await read.readFileContent('data\\06guild_r.gat'));
    console.log(thor);
    console.log(thor.getEntries());
    // console.log(await thor.isValid());
    // console.log(thor.targetGrfName());
    const main = await GrfArchiveBuilder.create('main.grf', 2, 0);

    const entries = [...thor.getEntries()];
    entries.map((v: ThorFileEntry) => {
      main.importRawEntryFromThor(thor, v.relativePath);
    });

    // await main.finish();
    return 'test';
  });
})();

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`);
});
