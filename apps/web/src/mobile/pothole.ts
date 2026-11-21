import type {Det} from '../driver/detect';
import {visionAsset} from '../driver/assets';
/** The road network runs off the UI thread; fresh results are reused between camera frames. */
export class PotholeDetector {
  ready=false;ms=0;private worker:Worker|null=null;private busy=false;private last:Det[]=[];private lastAt=0;private loading:Promise<void>|null=null;
  constructor(private failed:(message:string)=>void){}
  load(){
    if(this.ready)return Promise.resolve();if(this.loading)return this.loading;
    this.worker?.terminate();this.last=[];this.lastAt=0;this.busy=false;
    this.loading=new Promise<void>((resolve,reject)=>{
      if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'){reject(new Error('This browser does not support the on-device road model worker. Use Chrome on Android.'));return;}
      const worker=new Worker(new URL('./pothole.worker.ts',import.meta.url),{type:'module'});this.worker=worker;
      const timeout=setTimeout(()=>{worker.terminate();this.worker=null;reject(new Error('The pothole model timed out while loading. Check the connection and retry.'));},45000);
      worker.onmessage=event=>{
        const data=event.data;
        if(data.type==='ready'){clearTimeout(timeout);this.ready=true;resolve();}
        else if(data.type==='result'){this.lastAt=Date.now();this.last=data.detections.map((d:Det)=>({...d,frameTime:this.lastAt}));this.ms=data.ms;this.busy=false;}
        else if(data.type==='error'){clearTimeout(timeout);this.ready=false;this.busy=false;this.last=[];reject(new Error(data.message));this.failed(data.message);}
      };
      worker.onerror=event=>{clearTimeout(timeout);this.ready=false;this.busy=false;reject(new Error(event.message||'Road model worker failed.'));this.failed(event.message||'Road model worker failed.');};
      worker.postMessage({type:'load',runtime:visionAsset('ort/'),model:visionAsset('models/pothole-yolov8.onnx')});
    }).finally(()=>{this.loading=null;});return this.loading;
  }
  async detect(frame:HTMLCanvasElement):Promise<Det[]>{
    if(this.ready&&!this.busy&&this.worker){this.busy=true;try{const image=await createImageBitmap(frame);if(this.worker)this.worker.postMessage({type:'frame',image},[image]);else image.close();}catch(error){this.busy=false;this.failed(String(error));}}
    return Date.now()-this.lastAt<2000?this.last:[];
  }
  dispose(){this.worker?.terminate();this.worker=null;this.ready=false;this.last=[];}
}
