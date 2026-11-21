#!/usr/bin/env node
/**
 * Verifies that every app's translation files have exactly the same keys and
 * matching {placeholders} as its English source (messages/en.json).
 * Run: npm run check:i18n  (also runs in CI)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APPS_DIR = 'apps';
const SOURCE_LOCALE = 'en';

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flatten(value, path)
      : [[path, String(value)]];
  });
}

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)/g)]
    .map((match) => match[1])
    .sort()
    .join(',');
}

let problems = 0;
let checkedFiles = 0;

for (const app of readdirSync(APPS_DIR)) {
  const messagesDir = join(APPS_DIR, app, 'messages');
  const sourcePath = join(messagesDir, `${SOURCE_LOCALE}.json`);
  if (!existsSync(sourcePath)) {
    continue;
  }
  const source = new Map(flatten(JSON.parse(readFileSync(sourcePath, 'utf8'))));

  for (const file of readdirSync(messagesDir).filter((name) => name.endsWith('.json'))) {
    if (file === `${SOURCE_LOCALE}.json`) {
      continue;
    }
    checkedFiles++;
    const target = new Map(flatten(JSON.parse(readFileSync(join(messagesDir, file), 'utf8'))));
    const where = `${app}/messages/${file}`;

    for (const [key, text] of source) {
      if (!target.has(key)) {
        console.error(`✖ ${where}: missing "${key}"`);
        problems++;
      } else if (!target.get(key).trim()) {
        console.error(`✖ ${where}: empty "${key}"`);
        problems++;
      } else if (placeholders(text) !== placeholders(target.get(key))) {
        console.error(`✖ ${where}: placeholders differ for "${key}"`);
        problems++;
      }
    }
    for (const key of target.keys()) {
      if (!source.has(key)) {
        console.error(`✖ ${where}: unknown key "${key}" (not in ${SOURCE_LOCALE}.json)`);
        problems++;
      }
    }
  }
}

if (problems > 0) {
  console.error(`\n${problems} translation problem(s) found.`);
  process.exit(1);
}
console.log(`✓ Translations complete (${checkedFiles} locale file(s) checked).`);
