# Quick Cards for Obsidian

在一个页面中快速记录和管理 Markdown 卡片：**按快捷键新增 → 直接输入 → 自动保存 → 一键复制或删除**。

每张卡片都是 Vault 内的独立 `.md` 文件。无需账号、不联网、不上传数据；卸载插件后笔记仍可正常使用。

## 功能

- 新增卡片置于顶部，自动聚焦编辑器，无需标题或确认。
- 点击正文原地编辑，点击卡片外部返回 Markdown 预览。
- 支持标题、列表、引用、链接和带语法高亮的代码块，可粘贴多行 Shell、SQL、JSON。
- 查看与编辑共用同一正文高度，切换不跳高；内容增加或删减时自动调整。
- 自动保存；复制原始 Markdown；删除移入 Obsidian 本地回收站。
- 右侧目录自动生成，点击定位、滚动高亮；支持折叠。
- 全文实时搜索，包含标题和代码；文件同时兼容 Obsidian 原生全局搜索。
- 原生编辑器或外部工具修改、重命名、删除文件后自动同步。
- 使用 Obsidian 主题变量，适配浅色、深色和窄窗口布局。

## 安装

要求 **Obsidian 1.8.7 或更新版本**。本插件通过手动方式安装，不需要在社区插件市场中搜索。

### 方法一：下载安装包（推荐）

1. [下载 quick-cards-1.0.0.zip](https://github.com/lanshicc/obsidian-quick-cards/raw/refs/heads/main/downloads/quick-cards-1.0.0.zip)。安装包保存在仓库的 `downloads/` 目录；不要用 GitHub 的「Code → Download ZIP」源码压缩包代替。
2. 解压得到 `quick-cards` 文件夹。
3. 将该文件夹复制到目标 Vault 的 `.obsidian/plugins/` 目录下。若 `plugins` 不存在，可以自行创建。
4. 在 Obsidian 中打开「设置 → 第三方插件」，允许使用第三方插件，启用 **Quick Cards**。
5. 如果列表里暂时没有插件，重启 Obsidian 后再启用。

安装后的目录应当是：

```text
你的 Vault/
└── .obsidian/
    └── plugins/
        └── quick-cards/
            ├── manifest.json
            ├── main.js
            └── styles.css
```

注意不要多套一层 `quick-cards/quick-cards/`。macOS Finder 可按 `Cmd+Shift+.` 显示 `.obsidian` 等隐藏目录。

### 方法二：从源码构建

需要 Node.js 22 或更新版本及 npm：

```sh
git clone https://github.com/lanshicc/obsidian-quick-cards.git
cd obsidian-quick-cards
npm ci
npm run build
```

构建完成后，将项目根目录下的 `main.js`、`manifest.json`、`styles.css` 复制到 Vault 的 `.obsidian/plugins/quick-cards/`，再启用插件。无需复制 `src/` 或 `node_modules/`。

### 更新已有安装

先结束编辑，再禁用 Quick Cards，使用新版的上述三个文件替换旧文件，最后重新启用。保留插件目录中的 `data.json` 可保留设置；卡片正文存储在 Vault 中，不在插件目录内。

## 第一次使用

1. 按 `Cmd+P`（macOS）或 `Ctrl+P`（Windows/Linux）打开 Obsidian 命令面板。
2. 搜索并执行 **Quick Cards: 新增卡片**。
3. 页面顶部出现空卡片，直接输入或粘贴 Markdown，光标无需再次定位。
4. 停止输入后自动保存；点击卡片外部，查看渲染结果。
5. 下次需要记录时，再执行「新增卡片」，或点击顶部 **+ 新增卡片**。

也可以通过左侧功能区的 Quick Cards 图标打开页面。

### 配置快捷键

打开「设置 → 快捷键」，搜索 **Quick Cards**，为以下两个命令设置自己习惯的按键：

| 命令 | 用途 |
| --- | --- |
| Quick Cards: 打开卡片页面 | 打开或切换到已有页面，不重复创建标签页 |
| Quick Cards: 新增卡片 | 打开页面、清空页面搜索、在顶部新增并立即聚焦 |

例如，可以给「新增卡片」绑定 `Cmd+Shift+N`（macOS）或 `Ctrl+Shift+N`（Windows/Linux）；若提示冲突，请换成空闲组合。插件不预占任何快捷键。

**最短使用路径：为「新增卡片」绑定一个快捷键，以后按一次就能开始输入。**

## 编辑与保存

- 默认显示 Markdown 预览。点击正文，在卡片内部编辑。
- 点击卡片外部退出编辑，无弹窗、无需手动保存。
- 停止输入约 **350ms** 后写入文件；退出编辑或关闭页面时会立即尝试完成待保存操作。
- 卡片上出现「待保存」表示内容还没完全落盘。保存失败会弹出提示并保留内存草稿，可继续编辑触发重试。
- 支持 Tab 缩进及常用撤销、重做快捷键。

下面的内容可以直接复制到一张卡片中：

````markdown
# API 请求

```sh
curl -X POST 'https://example.com/api' \
  -H 'Content-Type: application/json' \
  --data '{"name":"中文","enabled":true}'
```

```sql
SELECT id, name
  FROM users
 WHERE enabled = 1;
```

```json
{
  "name": "中文",
  "lines": "a\nb"
}
```
````

编辑器使用 CodeMirror 6，预览使用 Obsidian MarkdownRenderer。卡片内不保证具备完整的 Obsidian Live Preview 或其他第三方编辑器扩展能力。应用强制退出或磁盘不可写时，最后尚未落盘的输入无法保证恢复。

## 复制、删除与恢复

**复制：**点击卡片右上角「复制」。复制的是完整 Markdown 原始正文，包括刚输入的内容，不附加创建时间；成功后提示「已复制 Markdown」。插件不会读取剪贴板。

**删除：**点击「删除」后立即执行保存和删除，不弹确认框。卡片及目录项移除，Markdown 文件进入 **Vault 根目录的 `.trash/`**，不使用系统回收站。

**恢复误删：**

1. 在文件管理器中打开 Vault，显示隐藏文件。
2. 进入 `.trash/`，找到删除的 `.md` 文件，可先打开确认正文。
3. 将文件移回卡片存储目录（默认为 `Quick Cards/`）。
4. Quick Cards 页面会自动重新显示该卡片。若同名文件已经存在，请先改名，避免覆盖。

## 目录导航与搜索

右侧目录按卡片顺序自动生成名称：

1. 优先使用正文中的第一个 Markdown 标题，忽略 YAML 元数据和代码块内的伪标题。
2. 没有标题时使用第一行非空文本。
3. 空白卡片显示「未命名卡片」。

点击目录项滚动到卡片；滚动列表时目录高亮同步。长标题自动截断，悬停可查看完整名称。点击顶部「目录」可折叠；页面宽度小于 700px 时自动隐藏。

在顶部搜索框输入关键词，实时过滤所有卡片的原始 Markdown，支持标题和代码，忽略大小写。搜索结果可直接编辑、复制和删除，清空搜索后恢复全部卡片。

为避免输入时丢失焦点，正在编辑的卡片即使不再匹配搜索条件，也会保留到退出编辑为止。

## 数据存在哪里

默认目录为：

```text
你的 Vault/
└── Quick Cards/
    ├── 20261029-192754-<UUID>.md
    └── 20261029-192443-<UUID>.md
```

每张卡片一个独立文件，文件名包含时间戳和唯一标识。文件正文只保存用户输入的 Markdown，插件不自动插入 frontmatter；创建时间读取文件元数据。卡片按创建时间倒序排列，编辑不会改变顺序。

打开「设置 → Quick Cards → 卡片存储目录」，填写 Vault 内的目录路径并点击「应用」。支持 `Notes/Cards` 这样的嵌套路径。

- 展示指定目录**直接包含的全部 Markdown 文件**，不扫描子目录。
- 修改目录只会切换读写位置，**不会自动迁移旧文件**；切回旧目录即可继续查看旧卡片。
- 文件可被 Obsidian 原生全局搜索检索，前提是没有被用户配置为排除目录。
- 复制文件、跨设备同步等操作可能改变创建时间，从而影响显示时间和排序。
- 卸载插件不会删除卡片；插件 `data.json` 只存储目录和折叠等设置。

外部修改与尚未保存的本地编辑冲突时，插件保留原文件的外部版本，将本地编辑另存为新卡片并提示。外部删除或移走文件时，未保存的本地内容也会尽量另存保留。

## 常见问题

**为什么卡片正文出现了创建时间、更新时间属性？**

检查是否启用了 Update Time 等自动修改 Markdown 的插件。请在这些插件的设置中，将卡片目录加入排除列表。以后更改卡片目录时，也要同步调整排除目录；Quick Cards 不会自动修改其他插件的设置。

**为什么右侧目录看不到？**

先点击顶部「目录」展开；若窗口较窄，扩大窗口或收起 Obsidian 的侧边栏。

**为什么切换目录后旧卡片不见了？**

旧文件仍在原目录。切回原存储目录，或自行将所需文件移动到新目录。

**为什么保存失败？**

查看弹出的错误信息，检查 Vault 是否可写、磁盘是否有空间。不要在仍有未保存内容时强制退出应用。

## 开发与测试

```sh
npm ci
npm run check  # 运行测试、TypeScript 严格检查、构建生产 main.js
npm run dev   # 监听源码变化并重新构建
```

`npm ci` 需要下载开发依赖；安装后的插件运行不需要联网。

目前包含 15 项自动测试，覆盖保存队列、防抖、并发保存、失败重试、搜索、标题提取、唯一文件名、多行正文与 CRLF 保留，以及模拟 Vault 的文件生命周期。100 张卡片的数据完整性有自动测试，但不等同于 100 张卡片的实机性能证明。

macOS Obsidian 1.14.4 已实测新增聚焦、原地编辑保存、复制、删除恢复、目录导航和查看/编辑高度一致。移动端和完整跨平台兼容性尚未实测。详见 [验证说明](docs/verification.md) 和 [手动验收清单](TESTING.md)。

```text
src/main.ts        命令、视图、编辑器、文件同步、设置
src/model.ts       保存队列、标题、搜索、文件名与目录校验
styles.css         卡片布局和主题样式
tests/             自动化测试及 Vault 测试替身
manifest.json      Obsidian 插件信息
esbuild.config.mjs 构建配置
```
