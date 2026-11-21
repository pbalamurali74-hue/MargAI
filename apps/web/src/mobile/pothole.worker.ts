/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import {decodeYolo} from '../driver/detectionTypes';
let session:ort.InferenceSession|null=null;
const SIZE=640;
self.onmessage=async(event:MessageEvent)=>{
  const data=event.data;
  try{
    if(data.type==='load'){
      ort.env.wasm.wasmPaths=data.runtime;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
      session=await ort.InferenceSession.create(data.model,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
      self.postMessage({type:'ready'});return;
    }
    if(data.type==='frame'&&session){
      const image:ImageBitmap=data.image;const started=performance.now();
      try{
        const canvas=new OffscreenCanvas(SIZE,SIZE);const ctx=canvas.getContext('2d',{willReadFrequently:true})!;const scale=Math.min(SIZE/image.width,SIZE/image.height);const w=Math.round(image.width*scale),h=Math.round(image.height*scale),px=Math.floor((SIZE-w)/2),py=Math.floor((SIZE-h)/2);
        ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,SIZE,SIZE);ctx.drawImage(image,px,py,w,h);
        const rgba=ctx.getImageData(0,0,SIZE,SIZE).data,n=SIZE*SIZE,input=new Float32Array(3*n);
        for(let i=0;i<n;i++){input[i]=rgba[i*4]/255;input[n+i]=rgba[i*4+1]/255;input[n*2+i]=rgba[i*4+2]/255;}
        const result=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',input,[1,3,SIZE,SIZE])});const output=result[session.outputNames[0]];
        // Single pothole class + segmentation coefficients: decode class channel 4 only.
        const detections=decodeYolo(output.data as Float32Array,1,output.dims[2],{scale,padX:px,padY:py,srcW:image.width,srcH:image.height},{pothole:.7}).map(d=>({...d,src:'pothole-yolov8'}));
        self.postMessage({type:'result',detections,ms:performance.now()-started});
      }finally{image.close();}
    }
  }catch(error){self.postMessage({type:'error',message:String(error instanceof Error?error.message:error)});}
};
