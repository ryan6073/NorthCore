const { nativeImage } = require('electron')

function getTrayIcon() {
  return nativeImage.createEmpty()
}

module.exports = { getTrayIcon }
