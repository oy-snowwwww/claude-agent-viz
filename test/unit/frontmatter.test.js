// 실행: node --test test/unit/frontmatter.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const { parseFrontmatter, buildFrontmatter } = require('../../server.js');

test('parseFrontmatter: 정상 YAML + body', () => {
  const content = '---\nname: coder\ndescription: 백엔드 구현\nmodel: sonnet\n---\n\n본문입니다';
  const r = parseFrontmatter(content);
  assert.strictEqual(r.meta.name, 'coder');
  assert.strictEqual(r.meta.description, '백엔드 구현');
  assert.strictEqual(r.meta.model, 'sonnet');
  assert.strictEqual(r.body.trim(), '본문입니다');
});

test('parseFrontmatter: tools 배열 파싱', () => {
  const content = '---\nname: a\ntools: ["Read","Edit","Grep"]\n---\nbody';
  const r = parseFrontmatter(content);
  assert.deepStrictEqual(r.meta.tools, ['Read', 'Edit', 'Grep']);
});

test('parseFrontmatter: frontmatter 없으면 빈 meta + 전체 body', () => {
  const content = '그냥 본문';
  const r = parseFrontmatter(content);
  assert.deepStrictEqual(r.meta, {});
  assert.strictEqual(r.body, '그냥 본문');
});

test('parseFrontmatter: boolean 파싱', () => {
  const content = '---\nname: x\nactive: true\nhidden: false\n---\nbody';
  const r = parseFrontmatter(content);
  assert.strictEqual(r.meta.active, true);
  assert.strictEqual(r.meta.hidden, false);
});

test('buildFrontmatter: 정상 생성', () => {
  const result = buildFrontmatter(
    { name: 'test', description: 'desc', tools: ['Read'], model: 'sonnet' },
    'body text'
  );
  assert.match(result, /^---\n/);
  assert.match(result, /name: test/);
  assert.match(result, /description: desc/);
  assert.match(result, /model: sonnet/);
  assert.match(result, /body text/);
});

test('roundtrip: build → parse → 동일 meta', () => {
  const meta = { name: 'x', description: 'd', tools: ['Read', 'Write'], model: 'opus' };
  const body = '로직 설명';
  const built = buildFrontmatter(meta, body);
  const parsed = parseFrontmatter(built);
  assert.strictEqual(parsed.meta.name, 'x');
  assert.strictEqual(parsed.meta.description, 'd');
  assert.deepStrictEqual(parsed.meta.tools, ['Read', 'Write']);
  assert.strictEqual(parsed.meta.model, 'opus');
  assert.strictEqual(parsed.body.trim(), '로직 설명');
});
