import esbuild from 'esbuild';
// Reuse CodeMirror modules supplied by Obsidian and bundle language parsers locally.
const options = {entryPoints:['src/main.ts'], bundle:true, external:['obsidian','electron','@codemirror/state','@codemirror/view','@codemirror/language','@codemirror/commands','@codemirror/search','@codemirror/autocomplete','@codemirror/lint','@lezer/common','@lezer/highlight','@lezer/lr'], format:'cjs', target:'es2020', outfile:'main.js', logLevel:'info', sourcemap:process.argv.includes('--watch')?'inline':false};
if(process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
