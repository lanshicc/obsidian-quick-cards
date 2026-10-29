import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardTitle, cardFilename, Draft, matchesSearch, storageFolder } from '../src/model';
const raw = '# 请求\n```sh\ncurl -X POST \\\n  "https://example.com?q=$HOME&x=1" \\\n  -d \'{"key":"中文\\nvalue"}\'\n```\n```sql\nSELECT *\n  FROM users\n WHERE name = \'a_b%\';\n```\n```json\n{\n  "tab": "\\t",\n  "list": [1, 2]\n}\n```\n';

test('outline prefers first real heading outside fenced code', () => {
  assert.equal(cardTitle('first\n```sh\n# shell comment\n```\n## Real **title**'), 'Real **title**');
  assert.equal(cardTitle('~~~sql\n# fake\n~~~\nTitle\n==='), 'Title');
  assert.equal(cardTitle(' \n第一行\nmore'), '第一行');
  assert.equal(cardTitle('\n  \n'), '未命名卡片');
});
test('literal search covers shell, SQL, JSON, and case-insensitive titles', () => {
  for (const query of ['请求', '$HOME', 'select *', '"list": [1, 2]', '']) assert.ok(matchesSearch(raw, query));
  assert.equal(matchesSearch(raw, 'missing'), false);
});
test('folder validation rejects traversal and hidden or absolute locations', () => {
  assert.equal(storageFolder('Notes/Cards/'), 'Notes/Cards');
  for (const folder of ['', '/', '/tmp', '../Cards', 'A/../B', '.obsidian', 'A//B', 'C:\\Cards']) assert.throws(() => storageFolder(folder));
});
test('timestamp names remain unique for simultaneous creation', () => {
  const now = new Date(2026, 9, 29, 19, 27, 54);
  assert.match(cardFilename(now, 'unique'), /^20261029-192754-unique\.md$/);
  assert.equal(new Set(Array.from({length:1000}, () => cardFilename(now))).size, 1000);
});
test('flush preserves multiline special characters and trailing newline exactly', async () => {
  let disk = '';
  const draft = new Draft('', async (_, next) => disk = next, error => assert.fail(String(error)));
  draft.edit(raw); await draft.flush();
  assert.equal(disk, raw); assert.equal(draft.dirty, false);
});
test('edits during an in-flight write are serialized and fully drained', async () => {
  const writes: string[] = []; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const draft = new Draft('', async (expected, next) => {
    assert.equal(expected, writes.at(-1) ?? '');
    if (!writes.length) await gate;
    writes.push(next); return next;
  }, error => assert.fail(String(error)));
  draft.edit('first'); const flush = draft.flush();
  draft.edit(raw); release(); await flush;
  assert.deepEqual(writes, ['first', raw]); assert.equal(draft.dirty, false);
});
test('debounce coalesces keystrokes and saves without explicit flush', async () => {
  const writes: string[] = [];
  const draft = new Draft('', async (_, next) => { writes.push(next); return next; }, error => assert.fail(String(error)));
  draft.edit('a'); draft.edit('ab'); draft.edit('abc');
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.deepEqual(writes, ['abc']);
});
test('write failure retains the dirty revision and permits retry', async () => {
  let fail = true;
  const draft = new Draft('', async (_, next) => { if (fail) throw new Error('disk full'); return next; }, () => {});
  draft.edit(raw); await assert.rejects(draft.flush(), /disk full/);
  assert.equal(draft.text, raw); assert.ok(draft.dirty);
  fail = false; await draft.flush(); assert.equal(draft.dirty, false);
});
test('external changes do not replace unsaved local drafts', async () => {
  const draft = new Draft('old', async (_, next) => next, error => assert.fail(String(error)));
  draft.external('external'); assert.equal(draft.text, 'external');
  draft.edit('local'); draft.external('another'); assert.equal(draft.text, 'local'); await draft.flush();
});
test('conflict resolution accepts disk revision after preserving local text', async () => {
  let recovery = '';
  const draft = new Draft('old', async (_, next) => { recovery = next; return 'external'; }, error => assert.fail(String(error)));
  draft.edit(raw); await draft.flush();
  assert.equal(recovery, raw); assert.equal(draft.text, 'external'); assert.equal(draft.dirty, false);
});
test('concurrent flush callers do not duplicate writes', async () => {
  let writes = 0;
  const draft = new Draft('', async (_, next) => { writes++; await Promise.resolve(); return next; }, error => assert.fail(String(error)));
  draft.edit(raw); await Promise.all([draft.flush(), draft.flush(), draft.flush()]); assert.equal(writes, 1);
});
test('100 independent cards retain their full content', async () => {
  const disk = new Map<number,string>();
  const cards = Array.from({length:100}, (_, i) => new Draft('', async (_, next) => { disk.set(i,next); return next; }, error => assert.fail(String(error))));
  cards.forEach((draft,i) => draft.edit(`${i}\n${raw}`)); await Promise.all(cards.map(draft => draft.flush()));
  cards.forEach((_,i) => assert.equal(disk.get(i), `${i}\n${raw}`));
});

test('outline skips YAML frontmatter before a Markdown heading', () => {
  assert.equal(cardTitle('---\n创建时间: today\n更新时间: today\n---\n# Correct title'), 'Correct title');
});
