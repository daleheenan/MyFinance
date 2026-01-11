/**
 * Generate version.json with git commit info
 * Run this before building or committing to update version info
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Read base version from package.json
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const baseVersion = packageJson.version;

let version = baseVersion;

try {
  // Try to get git info
  const gitCommit = execSync('git rev-parse --short HEAD', {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore']
  }).trim();

  const gitCommitCount = execSync('git rev-list --count HEAD', {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore']
  }).trim();

  version = `${baseVersion}.${gitCommitCount}+${gitCommit}`;
  console.log(`Generated version from git: ${version}`);
} catch (err) {
  // Git not available, use build timestamp
  const buildTime = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 12);
  version = `${baseVersion}.${buildTime}`;
  console.log(`Generated version with timestamp: ${version}`);
}

// Write version.json
const versionData = { version };
writeFileSync(
  join(projectRoot, 'version.json'),
  JSON.stringify(versionData, null, 2) + '\n',
  'utf8'
);

console.log('Written to version.json');
