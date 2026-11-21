import {copyFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const [pkg,source,destination,files] of [
 ['onnxruntime-web','dist','ort',['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']],
 ['@mediapipe/tasks-vision','wasm','vision-wasm',['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm']],
]){const target=path.join(root,'apps/web/public',destination);await mkdir(target,{recursive:true});for(const file of files)await copyFile(path.join(root,'node_modules',pkg,source,file),path.join(target,file));}
console.log('Pinned on-device vision runtimes copied to the frontend.');
