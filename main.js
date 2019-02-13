// Modules to control application life and create native browser window
'use strict'
const {
  app,
  ipcMain
} = require('electron')
const path = require('path')
const fs = require('fs')
const bencode = require('bencode')

const Window = require('./window')

function main() {
  let mainWindow = new Window({
    file: path.join('renderer', 'index.html')
  })

  ipcMain.on('files', async (event, filesArray) => {
    try {
      const torrentArray = await Promise.all(filesArray.map(async ({
        name,
        pathName
      }) => {
        await bencode.decode(fs.readFileSync(pathName))
      }))
    } catch (error) {
      mainWindow.webContents.send('BitTorrentError', error)
    }

  })
}
app.on('ready', main)
app.on('windows-all-closed', function () {
  app.quit()
})