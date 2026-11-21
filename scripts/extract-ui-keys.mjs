import ts from 'typescript';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const keys=new Set();
const literal=node=>{if(ts.isStringLiteralLike(node))keys.add(node.text);else if(ts.isConditionalExpression(node)){literal(node.whenTrue);literal(node.whenFalse);}};
async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory()){if(entry.name!=='i18n')await walk(file);}else if(/\.tsx?$/.test(file)&&!file.endsWith('.test.ts')){const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)){if(node.expression.text==='t'&&node.arguments[0])literal(node.arguments[0]);if(node.expression.text==='translate'&&node.arguments[1])literal(node.arguments[1]);if(/^set(SourceNotice|ActionNotice|CameraError|StatusMessage|Error|Notice|ToastMessage)$/.test(node.expression.text)&&node.arguments[0])literal(node.arguments[0]);}if(ts.isPropertyAssignment(node)&&['label','title','description','copy'].includes(node.name?.text))literal(node.initializer);ts.forEachChild(node,visit);}visit(source);}}}
await walk('apps/web/src');
const extras=['Home','Drive','Road reports','Drive studio','In-car display','Scenarios','Technology','Our story','Open navigation','Close navigation','Pause animation','Play animation','Choose a scenario below.','Unknown time','information','caution','urgent','all','detected','corroborated','prepared','submitted','normal','warm','hot','critical','straight','left','right','pothole','pedestrian','animal','waterlogging','low visibility','suspected incident','confirmed incident','Warning audio','Audio standby','Browser audio · illustration','Ready for a warning','Illustrative active audio waveform','Audio standby indicator'];
extras.forEach(key=>keys.add(key));
keys.delete('');
const result=[...keys].filter(key=>!key.startsWith('http')&&!key.startsWith('gs://')).sort();
await writeFile('apps/web/src/i18n/source-keys.json',JSON.stringify(result,null,2)+'\n');
console.log(`${result.length} UI source keys recorded.`);
