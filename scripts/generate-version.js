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
let changelog = null;

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

  // Get the commit message for changelog
  const commitMessage = execSync('git log -1 --format=%s', {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore']
  }).trim();

  // Get the commit body (extended description) if any
  const commitBody = execSync('git log -1 --format=%b', {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore']
  }).trim();

  version = `${baseVersion}.${gitCommitCount}+${gitCommit}`;

  // Build changelog from commit info
  changelog = commitMessage;
  if (commitBody && !commitBody.includes('Generated with')) {
    // Filter out auto-generated footer text
    const cleanBody = commitBody
      .split('\n')
      .filter(line => !line.includes('Generated with') && !line.includes('Co-Authored-By'))
      .join('\n')
      .trim();
    if (cleanBody) {
      changelog += '\n' + cleanBody;
    }
  }

  console.log(`Generated version from git: ${version}`);
  console.log(`Changelog: ${changelog.substring(0, 100)}${changelog.length > 100 ? '...' : ''}`);
} catch (err) {
  // Git not available, use build timestamp
  const buildTime = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 12);
  version = `${baseVersion}.${buildTime}`;
  console.log(`Generated version with timestamp: ${version}`);
}

// Write version.json
const versionData = { version, changelog };
writeFileSync(
  join(projectRoot, 'version.json'),
  JSON.stringify(versionData, null, 2) + '\n',
  'utf8'
);

console.log('Written to version.json');
