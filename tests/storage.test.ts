import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { EditorState } from '@codemirror/state';

/** Load the real plugin with only the Obsidian host API replaced by a test double. */
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'quick-cards-test-'));
  const outfile = join(directory, 'plugin.cjs');
  await build({ stdin: { contents: "export {default as QuickCards} from './src/main'; export {TFile,TFolder,Notice} from './tests/obsidian-mock';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { obsidian: resolve('tests/obsidian-mock.ts') }, logLevel:'silent' });
  const {QuickCards, TFile, TFolder, Notice} = createRequire(import.meta.url)(outfile);
  const files = new Map<string, any>(); const data = new Map<any, string>(); const trash = new Map<string,string>();
  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path),
    getMarkdownFiles: () => [...files.values()].filter(file => file instanceof TFile),
    createFolder: async (path: string) => { files.set(path, new TFolder(path)); },
    create: async (path: string, text: string) => { assert.ok(!files.has(path)); const file = new TFile(path); files.set(path, file); data.set(file, text); return file; },
    read: async (file: any) => data.get(file),
    process: async (file: any, callback: (text:string) => string) => { const next = callback(data.get(file)!); data.set(file,next); return next; },
    trash: async (file: any, system: boolean) => { assert.equal(system,false); trash.set(file.path,data.get(file)!); files.delete(file.path); data.delete(file); }
  };
  const plugin = new QuickCards(); plugin.app = {vault};
  return {plugin, vault, files, data, trash, Notice, cleanup: () => rm(directory, {recursive:true,force:true})};
}

test('file lifecycle: raw save, external edit, conflict copy, rename, trash, restore and external deletion', async () => {
  const f = await fixture();
  try {
    const file = await f.plugin.createFile('original'); await f.plugin.sync();
    const card = f.plugin.cards.get(file);
    const text = '```sh\ncurl \\\n  -H "X: $HOME"\n```\n';
    card.draft.edit(text); await f.plugin.flush(); assert.equal(f.data.get(file),text);
    f.data.set(file,'external'); await f.plugin.sync(); assert.equal(card.draft.text,'external');
    card.draft.edit('local conflict'); f.data.set(file,'remote conflict'); await f.plugin.sync(); await f.plugin.sync();
    assert.equal(f.data.get(file),'remote conflict'); assert.ok([...f.data.values()].includes('local conflict'));
    assert.ok(f.Notice.messages.some((message:string) => message.includes('外部修改')));
    f.files.delete(file.path); file.path = 'Quick Cards/renamed.md'; f.files.set(file.path,file);
    await f.plugin.sync(); assert.equal(f.plugin.cards.get(file),card);
    card.draft.edit('latest before delete'); await f.plugin.remove(card);
    assert.equal(f.trash.get(file.path),'latest before delete'); assert.ok(!f.plugin.cards.has(file));
    const restored = await f.vault.create(file.path,f.trash.get(file.path)!); await f.plugin.sync(); assert.equal(f.plugin.cards.get(restored).draft.text,'latest before delete');
    const recovered = f.plugin.cards.get(restored); recovered.draft.edit('local after external delete');
    f.files.delete(restored.path); f.data.delete(restored); await f.plugin.sync(); await f.plugin.sync();
    assert.ok([...f.data.values()].includes('local after external delete')); assert.ok(!f.plugin.cards.has(restored));
  } finally { await f.cleanup(); }
});
test('CodeMirror roundtrip preserves multiline content and CRLF indentation', () => {
  const raw = '```json\r\n{\r\n\t"x": "\\n中文$"\r\n}\r\n```\r\n';
  let state = EditorState.create({doc:raw, extensions:[EditorState.lineSeparator.of('\r\n')]});
  assert.equal(state.sliceDoc(),raw);
  state = state.update({changes:{from:state.doc.length,insert:'SELECT *\r\n  FROM users;'}}).state;
  assert.equal(state.sliceDoc(),raw+'SELECT *\r\n  FROM users;');
});
