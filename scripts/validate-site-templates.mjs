import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVE_TEMPLATE_IDS, DEFAULT_TEMPLATE_ID, SITE_TEMPLATES } from '../data/site-templates.mjs';

const root = process.cwd();
const errors = [];
const requiredFields = ['id', 'name', 'active', 'category', 'target', 'colorMood', 'layout', 'salesPoint', 'replaceableFields'];
const forbiddenWords = ['開発者向け', '内部事情', '特定ツール', 'template_id'];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const ids = SITE_TEMPLATES.map((template) => template.id);
assert(new Set(ids).size === ids.length, 'テンプレートIDが重複しています');
assert(ids.includes(DEFAULT_TEMPLATE_ID), 'DEFAULT_TEMPLATE_ID がテンプレート一覧に存在しません');

for (const template of SITE_TEMPLATES) {
  for (const field of requiredFields) {
    assert(template[field] !== undefined && template[field] !== null && template[field] !== '', `${template.id || 'unknown'} に ${field} がありません`);
  }
  assert(/^[a-z0-9-]+$/.test(template.id), `${template.id} はID形式が不正です`);
  assert(Array.isArray(template.replaceableFields) && template.replaceableFields.length >= 5, `${template.id} の差し替え項目が不足しています`);
}

for (const activeId of ACTIVE_TEMPLATE_IDS) {
  const template = SITE_TEMPLATES.find((item) => item.id === activeId);
  assert(Boolean(template), `有効テンプレートID ${activeId} がテンプレート一覧に存在しません`);
  assert(template?.active === true, `有効テンプレートID ${activeId} の active が true ではありません`);
}

const calmTemplate = SITE_TEMPLATES.find((template) => template.id === 'calm-journey-salon');
assert(Boolean(calmTemplate), 'calm-journey-salon が登録されていません');
assert(calmTemplate?.demoPath === '/templates/salon/calm-journey/', 'calm-journey-salon の demoPath が不正です');

const filesToCheck = new Set([
  'data/site-templates.mjs',
  'templates/index.html',
  'templates/css/templates.css',
  'templates/js/templates.js',
  'partner/index.html',
  'partner/css/partner.css',
  'partner/js/partner.js',
  'admin/templates.html',
  'admin/css/template-admin.css',
  'admin/js/templates-admin.js',
  'functions/api/templates.js',
  'functions/api/demo-generate.js',
  'functions/api/template-selection.js',
  'scripts/validate-site-templates.mjs',
  ...(calmTemplate?.files || []),
]);

for (const file of filesToCheck) {
  assert(existsSync(join(root, file)), `${file} が存在しません`);
}

for (const file of calmTemplate?.files || []) {
  const content = readFileSync(join(root, file), 'utf8');
  for (const word of forbiddenWords) {
    assert(!content.includes(word), `${file} に表示不要な文言「${word}」が含まれています`);
  }
}

for (const file of ['functions/api/templates.js', 'functions/api/demo-generate.js', 'functions/api/template-selection.js']) {
  const content = readFileSync(join(root, file), 'utf8');
  assert(content.includes('site-templates.mjs'), `${file} がテンプレートデータに接続されていません`);
}

if (errors.length) {
  console.error('Validation failed');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('Validation passed');
console.log(`Templates: ${SITE_TEMPLATES.length}`);
console.log(`Active IDs: ${ACTIVE_TEMPLATE_IDS.join(', ')}`);
