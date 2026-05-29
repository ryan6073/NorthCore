const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const fs = require('fs');
const path = require('path');

async function main() {
  const { version } = require('./node_modules/electron/package.json');
  console.log('Electron version:', version);

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    force: true,
    platform: 'win32',
    arch: 'x64'
  });
  
  console.log('Downloaded to:', zipPath);
  console.log('Zip file exists:', fs.existsSync(zipPath));
  console.log('Zip file size:', fs.statSync(zipPath).size, 'bytes');
  
  const distPath = path.join(__dirname, 'node_modules', 'electron', 'dist');
  console.log('Dist path:', distPath);
  
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
    console.log('Created dist directory');
  }
  
  await extract(zipPath, { dir: distPath });
  console.log('Extracted successfully');
  
  fs.writeFileSync(path.join(__dirname, 'node_modules', 'electron', 'path.txt'), 'electron.exe');
  console.log('Created path.txt');
  
  console.log('All done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
