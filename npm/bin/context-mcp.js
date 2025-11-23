#!/usr/bin/env node

const { spawn } = require('child_process');
const { join } = require('path');
const { existsSync } = require('fs');

// Detect platform and architecture
const platform = process.platform;
const arch = process.arch;

// Map Node.js platform/arch to our package names
const platformMap = {
  'linux-x64': '@context-mcp/linux-x64',
  'linux-arm64': '@context-mcp/linux-arm64',
  'darwin-x64': '@context-mcp/darwin-x64',
  'darwin-arm64': '@context-mcp/darwin-arm64',
  'win32-x64': '@context-mcp/win32-x64',
};

const platformKey = `${platform}-${arch}`;
const packageName = platformMap[platformKey];

if (!packageName) {
  console.error(`Unsupported platform: ${platform}-${arch}`);
  console.error('Supported platforms:');
  Object.keys(platformMap).forEach(key => {
    console.error(`  - ${key}`);
  });
  process.exit(1);
}

// Construct the path to the binary
let binaryName = 'context-mcp';
if (platform === 'win32') {
  binaryName += '.exe';
}

// Try to find the binary in the optional dependency
let binaryPath;
try {
  const packagePath = require.resolve(`${packageName}/package.json`);
  const packageDir = join(packagePath, '..');
  binaryPath = join(packageDir, 'bin', binaryName);
} catch (error) {
  console.error(`Failed to locate ${packageName} package.`);
  console.error('Please ensure the package is installed correctly.');
  console.error('Try running: npm install @context-mcp/server');
  process.exit(1);
}

// Check if the binary exists
if (!existsSync(binaryPath)) {
  console.error(`Binary not found at: ${binaryPath}`);
  console.error('The binary may not have been downloaded correctly.');
  console.error(`Try reinstalling: npm install ${packageName}`);
  process.exit(1);
}

// Execute the binary with the same arguments
const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: false
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code || 0);
  }
});

child.on('error', (error) => {
  console.error(`Failed to start context-mcp: ${error.message}`);
  process.exit(1);
});
