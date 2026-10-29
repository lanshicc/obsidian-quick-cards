import { App, Component, ItemView, MarkdownRenderer, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { cardFilename, cardTitle, Draft, matchesSearch, storageFolder } from './model';
const VIEW = 'quick-cards-view';
/** Persist only presentation settings; card text belongs in Markdown files. */
interface Settings { folder: string; collapsed: boolean; }
/** A file-backed card shared by the page and save queue. */
interface Card { file: TFile; draft: Draft; }
/** Card DOM and disposable rendering/editor resources. */
interface CardUI { el: HTMLElement; preview: HTMLElement; measure: HTMLElement; host: HTMLElement; status: HTMLElement; nav: HTMLButtonElement; renderer?: Component; editor?: EditorView; rendered?: string; generation: number; }

/** Own commands, file synchronization and durable Markdown persistence. */
export default class QuickCards extends Plugin {
  settings: Settings = { folder: 'Quick Cards', collapsed: false };
  cards = new Map<TFile, Card>();
  views = new Set<CardsView>();
  private opening?: Promise<CardsView>;
  private syncing: Promise<void> = Promise.resolve();
  /** Load settings and register only public Obsidian APIs. */
  async onload(): Promise<void> {
    const stored = await this.loadData();
    try { this.settings.folder = storageFolder(stored?.folder ?? 'Quick Cards'); } catch { /* Invalid old settings fall back to the default. */ }
    this.settings.collapsed = !!stored?.collapsed;
    this.registerView(VIEW, leaf => new CardsView(leaf, this));
    this.addCommand({ id: 'open', name: '打开卡片页面', callback: () => { void this.open().catch(this.report); } });
    this.addCommand({ id: 'new', name: '新增卡片', callback: () => { void this.newCard().catch(this.report); } });
    this.addRibbonIcon('panels-top-left', 'Quick Cards', () => { void this.open().catch(this.report); });
    this.addSettingTab(new CardsSettings(this.app, this));
    for (const event of ['create', 'modify', 'delete', 'rename'] as const) {
      this.registerEvent(this.app.vault.on(event as 'create', () => { void this.sync().catch(this.report); }));
    }
    this.app.workspace.onLayoutReady(() => { void this.sync().catch(this.report); });
  }
  /** Surface write errors instead of implying that unsaved text is safe. */
  report = (error: unknown): void => { console.error('Quick Cards:', error); new Notice(`Quick Cards：${error instanceof Error ? error.message : String(error)}`, 8000); };
  /** Include Markdown files immediately within the configured folder. */
  includes(file: TFile): boolean { return file.extension.toLowerCase() === 'md' && file.parent?.path === this.settings.folder; }
  /** Ensure a nested storage folder exists without touching unrelated files. */
  async ensureFolder(): Promise<void> {
    let path = '';
    for (const segment of this.settings.folder.split('/')) {
      path = path ? `${path}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing && !(existing instanceof TFolder)) throw new Error(`${path} 已被文件占用`);
      if (!existing) {
        try { await this.app.vault.createFolder(path); }
        catch (error) { if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)) throw error; }
      }
    }
  }
  /** Save a raw Markdown file, also used to preserve conflicting local revisions. */
  async createFile(text: string): Promise<TFile> {
    await this.ensureFolder();
    return this.app.vault.create(`${this.settings.folder}/${cardFilename()}`, text);
  }
  /** Build a card whose compare-and-write operation protects external changes. */
  makeCard(file: TFile, text: string): Card {
    const card: Card = { file, draft: new Draft(text, async (expected, next) => {
      const current = this.app.vault.getAbstractFileByPath(file.path);
      if (current !== file || !this.includes(file)) {
        await this.createFile(next);
        new Notice('原文件已移走或删除，本地编辑已保存为新卡片');
        return next;
      }
      let conflict = false;
      const actual = await this.app.vault.process(file, disk => {
        if (disk !== expected && disk !== next) { conflict = true; return disk; }
        return next;
      });
      if (conflict) {
        await this.createFile(next);
        new Notice('检测到外部修改：本地编辑已另存为新卡片，原文件保留外部版本', 8000);
      }
      return actual;
    }, error => { this.report(error); this.changed(); }, () => this.changed()) };
    return card;
  }
  /** Serialize refreshes so asynchronous reads cannot apply in reverse order. */
  sync(): Promise<void> {
    const run = this.syncing.then(async () => {
      const files = this.app.vault.getMarkdownFiles().filter(file => this.includes(file));
      const live = new Set(files);
      for (const [file, card] of this.cards) {
        if (!live.has(file)) { await card.draft.flush(); this.cards.delete(file); }
      }
      await Promise.all(files.map(async file => {
        let card = this.cards.get(file);
        if (card?.draft.dirty) await card.draft.flush();
        if (this.app.vault.getAbstractFileByPath(file.path) !== file) return;
        const text = await this.app.vault.read(file);
        if (!card) { card = this.makeCard(file, text); this.cards.set(file, card); }
        else card.draft.external(text);
      }));
      this.changed();
    });
    this.syncing = run.catch(this.report);
    return run;
  }
  /** Update mounted cards incrementally while preserving active editors. */
  changed(): void { for (const view of this.views) view.refresh(); }
  /** Await every pending write, including writes started during earlier saves. */
  async flush(): Promise<void> { await Promise.all([...this.cards.values()].map(card => card.draft.flush())); }
  /** Reuse the existing page even when two commands arrive concurrently. */
  async open(): Promise<CardsView> {
    if (this.opening) return this.opening;
    this.opening = (async () => {
      let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
      if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({ type: VIEW, active: true }); }
      await this.app.workspace.revealLeaf(leaf);
      const view = leaf.view as CardsView;
      await view.ready;
      return view;
    })();
    try { return await this.opening; } finally { this.opening = undefined; }
  }
  /** Create an empty file, reveal it at the top and focus its inline editor. */
  async newCard(): Promise<void> {
    const view = await this.open();
    const file = await this.createFile('');
    await this.sync();
    const card = this.cards.get(file);
    if (card) view.startNew(card);
  }
  /** Flush before trashing so accidental deletion is recoverable with recent text. */
  async remove(card: Card): Promise<void> {
    await card.draft.flush();
    await this.app.vault.trash(card.file, false);
    this.cards.delete(card.file);
    this.changed();
  }
  /** Change the watched folder after finishing current writes; do not move notes. */
  async changeFolder(folder: string): Promise<void> {
    const validated = storageFolder(folder);
    await this.flush();
    const old = this.settings.folder;
    this.settings.folder = validated;
    try { await this.ensureFolder(); await this.saveData(this.settings); }
    catch (error) { this.settings.folder = old; throw error; }
    await this.sync();
  }
  /** Obsidian cannot await unload; start a best-effort final drain. */
  onunload(): void { void this.flush().catch(this.report); }
}

/** Single-column card page with an independently scrolling outline. */
class CardsView extends ItemView {
  ready: Promise<void> = Promise.resolve();
  private ui = new Map<Card, CardUI>();
  private list!: HTMLElement;
  private outline!: HTMLElement;
  private search!: HTMLInputElement;
  private empty!: HTMLElement;
  private active?: Card;
  private closed = false;
  private frame = 0;
  /** Connect the workspace leaf to the plugin-owned card store. */
  constructor(leaf: WorkspaceLeaf, private plugin: QuickCards) { super(leaf); }
  /** Stable view identifier used to reuse this page. */
  getViewType(): string { return VIEW; }
  /** Tab label shown by Obsidian. */
  getDisplayText(): string { return 'Quick Cards'; }
  /** Native icon for the page tab. */
  getIcon(): string { return 'panels-top-left'; }
  /** Mount the shell once; load file content before commands focus an editor. */
  async onOpen(): Promise<void> {
    this.contentEl.empty(); this.contentEl.addClass('qc-root');
    const toolbar = this.contentEl.createDiv('qc-toolbar');
    toolbar.createEl('h2', { text: 'Quick Cards' });
    this.search = toolbar.createEl('input', { type: 'search', placeholder: '搜索卡片正文…' });
    this.search.setAttribute('aria-label', '搜索卡片');
    this.search.addEventListener('input', () => this.filter());
    const add = toolbar.createEl('button', { text: '+ 新增卡片', cls: 'mod-cta' });
    add.onclick = () => { void this.plugin.newCard().catch(this.plugin.report); };
    const toggle = toolbar.createEl('button', { text: '目录' });
    toggle.setAttribute('aria-label', '展开或收起卡片目录');
    toggle.setAttribute('aria-expanded', String(!this.plugin.settings.collapsed));
    toggle.onclick = () => {
      this.plugin.settings.collapsed = !this.plugin.settings.collapsed;
      this.contentEl.toggleClass('qc-collapsed', this.plugin.settings.collapsed);
      toggle.setAttribute('aria-expanded', String(!this.plugin.settings.collapsed));
      void this.plugin.saveData(this.plugin.settings).catch(this.plugin.report);
    };
    this.contentEl.toggleClass('qc-collapsed', this.plugin.settings.collapsed);
    const body = this.contentEl.createDiv('qc-body');
    this.list = body.createDiv('qc-list');
    this.empty = this.list.createDiv({ cls: 'qc-empty', text: '点击「+ 新增卡片」开始记录' });
    const aside = body.createEl('aside', { cls: 'qc-outline' });
    aside.createEl('h3', { text: '卡片目录' });
    this.outline = aside.createEl('nav', { attr: { 'aria-label': '卡片目录' } });
    this.list.addEventListener('scroll', () => {
      if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.highlight(); });
    }, { passive: true });
    this.registerDomEvent(this.contentEl.ownerDocument, 'pointerdown', event => {
      if (this.active && !event.composedPath().includes(this.ui.get(this.active)!.el)) this.finishEditing();
    });
    this.registerDomEvent(this.contentEl.ownerDocument, 'visibilitychange', () => {
      if (this.contentEl.ownerDocument.hidden) void this.plugin.flush().catch(this.plugin.report);
    });
    this.plugin.views.add(this);
    this.ready = this.plugin.sync();
    await this.ready;
  }
  /** Flush before releasing editors and Markdown render children. */
  async onClose(): Promise<void> {
    this.closed = true;
    this.plugin.views.delete(this);
    cancelAnimationFrame(this.frame);
    try { await this.plugin.flush(); } catch (error) { this.plugin.report(error); }
    for (const ui of this.ui.values()) this.dispose(ui);
    this.ui.clear();
  }
  /** Remove resources belonging to a single card. */
  private dispose(ui: CardUI): void {
    ui.generation++; ui.editor?.destroy();
    if (ui.renderer) this.removeChild(ui.renderer);
    ui.el.remove(); ui.nav.remove();
  }
  /** Add an accessible action button with centralized error reporting. */
  private action(parent: HTMLElement, label: string, callback: () => void | Promise<void>): void {
    const button = parent.createEl('button', { text: label, attr: { 'aria-label': label } });
    button.onclick = () => { Promise.resolve().then(callback).catch(this.plugin.report); };
  }
  /** Build only newly encountered cards; subsequent edits reuse these nodes. */
  private mount(card: Card): CardUI {
    const el = this.list.createEl('article', { cls: 'qc-card' });
    const header = el.createDiv('qc-card-header');
    header.createEl('time', { text: new Date(card.file.stat.ctime).toLocaleString(), attr: { datetime: new Date(card.file.stat.ctime).toISOString() } });
    const status = header.createEl('span', { cls: 'qc-status', attr: { 'aria-live': 'polite' } });
    const actions = header.createDiv('qc-actions');
    this.action(actions, '复制', async () => { await navigator.clipboard.writeText(card.draft.text); new Notice('已复制 Markdown'); });
    this.action(actions, '编辑', () => this.edit(card));
    this.action(actions, '删除', () => this.plugin.remove(card));
    const body = el.createDiv('qc-card-body');
    const measure = body.createDiv({ cls: 'qc-measure', attr: { 'aria-hidden': 'true' } });
    const preview = body.createDiv('qc-preview markdown-rendered');
    preview.tabIndex = 0; preview.setAttribute('aria-label', '编辑卡片正文');
    preview.onclick = event => { if (!(event.target as HTMLElement).closest('a, button, input')) this.edit(card); };
    preview.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); this.edit(card); } };
    const host = body.createDiv('qc-editor'); host.hidden = true;
    const nav = this.outline.createEl('button', { cls: 'qc-nav' });
    nav.onclick = () => this.navigate(el);
    return { el, preview, measure, host, status, nav, generation: 0 };
  }
  /** Reconcile file identities without replacing active card DOM. */
  refresh(): void {
    if (this.closed || !this.list) return;
    const cards = [...this.plugin.cards.values()].sort((a,b) => b.file.stat.ctime - a.file.stat.ctime || b.file.path.localeCompare(a.file.path));
    const live = new Set(cards);
    for (const [card, ui] of this.ui) if (!live.has(card)) {
      if (this.active === card) this.active = undefined;
      this.dispose(ui); this.ui.delete(card);
    }
    let previous: HTMLElement | undefined;
    let previousNav: HTMLElement | undefined;
    for (const card of cards) {
      let ui = this.ui.get(card);
      if (!ui) { ui = this.mount(card); this.ui.set(card, ui); }
      const expected = previous ? previous.nextElementSibling : this.list.firstElementChild;
      if (expected !== ui.el) this.list.insertBefore(ui.el, expected);
      const expectedNav = previousNav ? previousNav.nextElementSibling : this.outline.firstElementChild;
      if (expectedNav !== ui.nav) this.outline.insertBefore(ui.nav, expectedNav);
      previous = ui.el; previousNav = ui.nav;
      this.updateLabel(card, ui);
      if (ui.editor) {
        if (ui.editor.state.sliceDoc() !== card.draft.text) {
          const anchor = Math.min(ui.editor.state.selection.main.anchor, card.draft.text.length);
          ui.editor.dispatch({ changes: { from: 0, to: ui.editor.state.doc.length, insert: card.draft.text }, selection: { anchor } });
        }
      } else this.render(card, ui);
    }
    this.filter();
  }
  /** Keep the outline and save indicator current without rebuilding the list. */
  private updateLabel(card: Card, ui: CardUI): void {
    // A hidden raw-text mirror reserves editor space in both modes, including the final empty line.
    ui.measure.textContent = card.draft.text + '\u200b';
    const title = cardTitle(card.draft.text);
    ui.nav.textContent = title; ui.nav.title = title;
    ui.status.textContent = card.draft.dirty ? '待保存' : '';
  }
  /** Render only changed preview text and discard stale asynchronous renders. */
  private render(card: Card, ui: CardUI): void {
    if (ui.rendered === card.draft.text) return;
    ui.rendered = card.draft.text;
    const generation = ++ui.generation;
    if (ui.renderer) this.removeChild(ui.renderer);
    const component = new Component(); this.addChild(component); ui.renderer = component;
    const target = ui.preview.ownerDocument.createElement('div');
    if (!card.draft.text) target.textContent = '点击输入 Markdown…';
    void MarkdownRenderer.render(this.app, card.draft.text, target, card.file.path, component).then(() => {
      if (generation === ui.generation) ui.preview.replaceChildren(target);
    }).catch(error => { ui.rendered = undefined; this.plugin.report(error); });
  }
  /** Mount a native-platform CodeMirror 6 editor only for the selected card. */
  private edit(card: Card): void {
    const ui = this.ui.get(card); if (!ui) return;
    if (this.active === card) { ui.editor?.focus(); return; }
    this.finishEditing(); this.active = card;
    ui.el.addClass('qc-editing'); ui.preview.inert = true; ui.host.hidden = false;
    ui.editor = new EditorView({ parent: ui.host, state: EditorState.create({ doc: card.draft.text, extensions: [
      EditorState.lineSeparator.of(card.draft.text.includes('\r\n') ? '\r\n' : '\n'),
      history(), keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown({ codeLanguages: languages }), syntaxHighlighting(defaultHighlightStyle),
      EditorView.lineWrapping, placeholder('输入 Markdown…'),
      EditorView.contentAttributes.of({ 'aria-label': '卡片 Markdown 编辑器', spellcheck: 'false' }),
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        card.draft.edit(update.state.sliceDoc()); this.updateLabel(card, ui);
        // Keep the hidden preview in sync so switching modes never changes the sizing inputs.
        this.render(card, ui);
        // Keep the active card visible until editing ends, even if its text stops matching.
        this.filter();
      })
    ] }) });
    ui.editor.focus();
  }
  /** End inline editing and start an immediate save without a dialog. */
  private finishEditing(): void {
    if (!this.active) return;
    const card = this.active, ui = this.ui.get(card); this.active = undefined;
    if (ui) { ui.editor?.destroy(); ui.editor = undefined; ui.host.empty(); ui.host.hidden = true; ui.el.removeClass('qc-editing'); ui.preview.inert = false; this.render(card, ui); }
    void card.draft.flush().catch(this.plugin.report);
    this.filter();
  }
  /** Clear filters so a newly created empty card is always visible and focused. */
  startNew(card: Card): void {
    this.search.value = ''; this.refresh(); this.list.scrollTop = 0; this.edit(card);
  }
  /** Filter cards and outline together using the entire raw Markdown body. */
  private filter(): void {
    let visible = 0;
    for (const [card, ui] of this.ui) {
      const show = card === this.active || matchesSearch(card.draft.text, this.search.value);
      ui.el.hidden = ui.nav.hidden = !show; if (show) visible++;
    }
    this.empty.hidden = visible > 0;
    this.empty.textContent = this.search.value ? '没有匹配的卡片' : '点击「+ 新增卡片」开始记录';
    this.highlight();
  }
  /** Reserve enough trailing space to align even the last card at the viewport top. */
  private navigate(el: HTMLElement): void {
    const visible = [...this.ui.values()].filter(ui => !ui.el.hidden);
    const last = visible.reduce<CardUI | undefined>((result, ui) => !result || ui.el.offsetTop > result.el.offsetTop ? ui : result, undefined);
    this.list.style.paddingBottom = `${Math.max(20, this.list.clientHeight - (last?.el.offsetHeight ?? 0) - 20)}px`;
    this.list.scrollTo({ top: Math.max(0, el.offsetTop - 20), behavior: 'smooth' });
  }
  /** Highlight the visible card nearest the top of the scrolling viewport. */
  private highlight(): void {
    const top = this.list.getBoundingClientRect().top + 24;
    const visible = [...this.ui.values()].filter(ui => !ui.el.hidden).sort((a,b) => a.el.offsetTop-b.el.offsetTop);
    const current = visible.find(ui => ui.el.getBoundingClientRect().bottom > top) ?? visible[visible.length - 1];
    for (const ui of this.ui.values()) {
      ui.nav.toggleClass('is-active', ui === current);
      if (ui === current) ui.nav.setAttribute('aria-current', 'true'); else ui.nav.removeAttribute('aria-current');
    }
  }
}

/** Minimal settings panel for changing the file storage directory. */
class CardsSettings extends PluginSettingTab {
  /** Bind the settings tab to the owning plugin. */
  constructor(app: App, private plugin: QuickCards) { super(app, plugin); }
  /** Apply folder changes explicitly to avoid changing scope on every keystroke. */
  display(): void {
    this.containerEl.empty(); let value = this.plugin.settings.folder;
    new Setting(this.containerEl).setName('卡片存储目录').setDesc('Vault 内的目录。修改后展示新目录中的 Markdown 文件，旧文件保留原位；不读取子目录。')
      .addText(text => text.setValue(value).onChange(next => { value = next; }))
      .addButton(button => button.setButtonText('应用').onClick(async () => {
        try { await this.plugin.changeFolder(value); new Notice('存储目录已更新'); }
        catch (error) { this.plugin.report(error); }
      }));
  }
}
