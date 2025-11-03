#!/usr/bin/env node

/**
 * Update CHANGELOG.md with new version information
 * This script is automatically run when `npm version` is executed
 */

const fs = require('fs');
const path = require('path');

// Get the new version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const newVersion = packageJson.version;

// Get current date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0];

// Read CHANGELOG.md
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
let changelog = fs.readFileSync(changelogPath, 'utf8');

// Check if this version already exists in the changelog
const versionHeader = `## [${newVersion}]`;
if (changelog.includes(versionHeader)) {
  console.log(`Version ${newVersion} already exists in CHANGELOG.md - skipping update`);
  process.exit(0);
}

// Find the [Unreleased] section
const unreleasedIndex = changelog.indexOf('## [Unreleased]');
if (unreleasedIndex === -1) {
  console.log('No [Unreleased] section found in CHANGELOG.md - skipping update');
  process.exit(0);
}

// Find the next section after [Unreleased]
const nextSectionIndex = changelog.indexOf('\n## [', unreleasedIndex + 1);
if (nextSectionIndex === -1) {
  console.log('Could not find next section after [Unreleased] - skipping update');
  process.exit(0);
}

// Extract unreleased content
const unreleasedContent = changelog.substring(unreleasedIndex, nextSectionIndex).trim();

// Check if there's any actual content in the unreleased section
const hasContent = unreleasedContent.includes('### Added') ||
                   unreleasedContent.includes('### Changed') ||
                   unreleasedContent.includes('### Deprecated') ||
                   unreleasedContent.includes('### Removed') ||
                   unreleasedContent.includes('### Fixed') ||
                   unreleasedContent.includes('### Security');

if (!hasContent) {
  console.log('No unreleased changes found - skipping update');
  process.exit(0);
}

// Create new version section
const newVersionSection = `## [${newVersion}] - ${today}

${unreleasedContent.replace('## [Unreleased]', '').trim()}

`;

// Create new unreleased section
const newUnreleasedSection = `## [Unreleased]

### Planned
- (Add planned features here)

`;

// Replace the unreleased section with both new sections
const beforeUnreleased = changelog.substring(0, unreleasedIndex);
const afterUnreleased = changelog.substring(nextSectionIndex);

const updatedChangelog = beforeUnreleased + newUnreleasedSection + '\n' + newVersionSection + afterUnreleased;

// Update the version link at the bottom if it exists
let finalChangelog = updatedChangelog;
const versionLinksMatch = finalChangelog.match(/\[Unreleased\]:.*?\n/);
if (versionLinksMatch) {
  const currentLink = versionLinksMatch[0];
  const repoUrl = packageJson.repository?.url?.replace(/\.git$/, '') || 'https://github.com/your-org/lsp-mcp';
  const newVersionLink = `[${newVersion}]: ${repoUrl}/releases/tag/v${newVersion}\n`;
  finalChangelog = finalChangelog.replace(
    /---\n\n/,
    `---\n\n${newVersionLink}`
  );
}

// Write updated changelog
fs.writeFileSync(changelogPath, finalChangelog, 'utf8');

console.log(`CHANGELOG.md updated for version ${newVersion}`);
