/** Extract a navigation label, ignoring headings inside fenced code. */
export function cardTitle(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  // YAML frontmatter is metadata, not a Setext heading.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
    if (end > 0) lines.splice(0, end + 1);
  }
  let fence = '', width = 0, previous = '';
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) { fence = marker[1][0]; width = marker[1].length; }
      else if (marker[1][0] === fence && marker[1].length >= width && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = '';
      previous = ''; continue;
    }
    if (fence) continue;
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
    if (heading) return heading[1].trim();
    if (previous.trim() && /^ {0,3}(?:=+|-+)\s*$/.test(line)) return previous.trim();
    previous = line;
  }
  return lines.find(line => line.trim())?.trim() || '未命名卡片';
}
/** Search raw Markdown, including code blocks. */
export function matchesSearch(content: string, query: string): boolean {
  return content.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
/** Validate a normal vault-relative folder. */
export function storageFolder(value: string): string {
  const folder = value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!folder || folder.startsWith('/') || folder.split('/').some(p => !p || p.startsWith('.') || /[:*?"<>|]/.test(p)))
    throw new Error('请输入 Vault 内的普通目录，例如 Quick Cards 或 Notes/Cards');
  return folder;
}
/** Generate a local timestamp with a collision-resistant identifier. */
export function cardFilename(now = new Date(), id: string = crypto.randomUUID()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${id}.md`;
}
/** Serialize debounced saves without dropping edits made during a write. */
export class Draft {
  text: string;
  saved: string;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  /** Inject persistence so save behavior can be tested outside Obsidian. */
  constructor(text: string, private persist: (expected: string, text: string) => Promise<string>, private onError: (error: unknown) => void, private onSaved: () => void = () => {}) { this.text = this.saved = text; }
  /** Whether local changes require persistence. */
  get dirty(): boolean { return this.text !== this.saved; }
  /** Schedule a trailing save after each edit. */
  edit(text: string): void {
    this.text = text; clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(this.onError); }, 350);
  }
  /** Accept external content only when local changes are saved. */
  external(text: string): void { if (!this.dirty && !this.running) this.text = this.saved = text; }
  /** Drain queued revisions; page close can await this operation. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) { await this.running; if (this.dirty) await this.flush(); return; }
    this.running = (async () => {
      while (this.dirty) {
        const snapshot = this.text;
        const actual = await this.persist(this.saved, snapshot);
        this.saved = actual;
        if (this.text === snapshot) this.text = actual;
        this.onSaved();
      }
    })();
    try { await this.running; } finally { this.running = undefined; }
  }
}
