#!/usr/bin/env node

/**
 * Deploy Script - CaixaFácil
 * 
 * Uso: node scripts/deploy.mjs [--production] [--message "msg"]
 * 
 * Faz:
 * 1. Incrementa a versão no version.ts
 * 2. Faz commit e push para main e master
 * 3. Dispara deploy no Vercel
 * 4. Aguarda o build e mostra a versão final
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const isProduction = args.includes('--production');
const msgIndex = args.indexOf('--message');
const customMsg = msgIndex !== -1 ? args[msgIndex + 1] : '';

// ==================== STEP 1: Bump Version ====================
console.log('\n📦 Step 1: Incrementando versão...');

const versionFile = join(__dirname, '..', 'src', 'lib', 'version.ts');
const content = readFileSync(versionFile, 'utf-8');

const match = content.match(/VERSION_STRING\s*=\s*'(\d+)\.(\d+)\.(\d+)\.(\d+)'/);
if (!match) {
  console.error('❌ Could not parse VERSION_STRING');
  process.exit(1);
}

const [, major, minor, patch, build] = match.map(Number);
const newBuild = build + 1;
const today = new Date().toISOString().slice(0, 10);
const versionStr = `${major}.${minor}.${patch}.${newBuild}`;
const versionDisplay = `v${versionStr}`;

const newContent = content
  .replace(/VERSION_STRING\s*=\s*'\d+\.\d+\.\d+\.\d+'/, `VERSION_STRING = '${versionStr}'`)
  .replace(/VERSION_DISPLAY\s*=\s*'v[\d.]+'/, `VERSION_DISPLAY = '${versionDisplay}'`)
  .replace(/LAST_DEPLOY\s*=\s*'\d{4}-\d{2}-\d{2}'/, `LAST_DEPLOY = '${today}'`)
  .replace(/VERSION_WITH_DATE\s*=\s*'v[\d.]+ \(\d{4}-\d{2}-\d{2}\)'/, `VERSION_WITH_DATE = '${versionDisplay} (${today})'`);

writeFileSync(versionFile, newContent, 'utf-8');
console.log(`   ✅ Versão: ${versionDisplay} (${today})`);

// ==================== STEP 2: Git Commit & Push ====================
console.log('\n📦 Step 2: Commit e push...');

const commitMsg = customMsg || `chore: bump version to ${versionDisplay}`;
execSync('git add -A', { cwd: join(__dirname, '..'), stdio: 'pipe' });

try {
  execSync(`git commit -m "${commitMsg}"`, { cwd: join(__dirname, '..'), stdio: 'pipe' });
  console.log(`   ✅ Commit: ${commitMsg}`);
} catch {
  console.log('   ℹ️  Nenhuma mudança para commitar (versão já atualizada)');
}

execSync('git push origin main', { cwd: join(__dirname, '..'), stdio: 'pipe' });
execSync('git push origin main:master', { cwd: join(__dirname, '..'), stdio: 'pipe' });
console.log('   ✅ Push para main e master');

console.log(`\n=============================`);
console.log(`  VERSÃO: ${versionDisplay}`);
console.log(`  DATA: ${today}`);
console.log(`  Aguardando deploy no Vercel...`);
console.log(`=============================\n`);

if (isProduction) {
  console.log('⏳ Para deploy de produção, use a API do Vercel manualmente.');
}
