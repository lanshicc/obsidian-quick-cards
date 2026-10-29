/** Lightweight public API stand-ins for file lifecycle integration tests. */
export class Plugin { app: any; }
/** Minimal base class; UI behavior is verified separately in Obsidian. */
export class ItemView {}
/** Settings tab placeholder needed when loading the plugin module. */
export class PluginSettingTab {}
/** Rendering component placeholder needed when loading the plugin module. */
export class Component {}
/** Settings control placeholder needed when loading the plugin module. */
export class Setting {}
/** Markdown rendering placeholder; these tests exercise storage, not rendering. */
export class MarkdownRenderer {}
/** In-memory file identity remains stable across rename, just like TFile. */
export class TFile {
  extension = 'md'; stat = { ctime: Date.now() }; parent: {path: string};
  /** Derive the parent folder from the supplied vault-relative path. */
  constructor(public path: string) { this.parent = {path: path.slice(0, path.lastIndexOf('/'))}; }
}
/** Directory identity used by ensureFolder. */
export class TFolder { /** Store a vault-relative folder path. */ constructor(public path: string) {} }
/** Capture user-facing notices for conflict assertions. */
export class Notice { static messages: string[] = []; /** Record the emitted notice. */ constructor(message: string) { Notice.messages.push(message); } }
