#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream/promises');

const PLATFORM = 'win32-x64';
const BINARY_NAME = 'context-mcp.exe';
const GITHUB_REPO = 'windschord/context-mcp';

async function downloadBinary() {
  const version = process.env.npm_package_version || '0.1.0';
  const url = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${BINARY_NAME.replace('.exe', '')}-${PLATFORM}.exe`;
  const binDir = path.join(__dirname, 'bin');
  const binPath = path.join(binDir, BINARY_NAME);

  console.log(`Downloading context-mcp binary for ${PLATFORM}...`);
  console.log(`URL: ${url}`);

  try {
    // Create bin directory if it doesn't exist
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    // Download the binary
    await new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'context-mcp-installer'
        }
      }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          https.get(response.headers.location, (redirectResponse) => {
            if (redirectResponse.statusCode !== 200) {
              reject(new Error(`Failed to download: HTTP ${redirectResponse.statusCode}`));
              return;
            }
            const fileStream = fs.createWriteStream(binPath);
            redirectResponse.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve();
            });
            fileStream.on('error', reject);
          }).on('error', reject);
        } else if (response.statusCode === 200) {
          const fileStream = fs.createWriteStream(binPath);
          response.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
          fileStream.on('error', reject);
        } else {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        }
      }).on('error', reject);
    });

    console.log(`Successfully installed context-mcp for ${PLATFORM}`);
  } catch (error) {
    console.error(`Failed to download binary: ${error.message}`);
    console.error('You can manually download the binary from:');
    console.error(`  ${url}`);
    process.exit(1);
  }
}

downloadBinary();
