import {PotholeDetector} from './pothole';
import {MediaPipeDetector,type Det} from '../driver/detect';
export type ModelState={pothole:'off'|'loading'|'ready'|'error';objects:'off'|'loading'|'ready'|'error';potholeError:string;objectsError:string};
export const emptyModels=():ModelState=>({pothole:'off',objects:'off',potholeError:'',objectsError:''});
/** Two real model heads. The custom road model supplies potholes; COCO supplies people/animals/vehicles. */
export class PhoneVision {
  readonly road=new PotholeDetector(message=>this.update({pothole:'error',potholeError:message}));readonly objects=new MediaPipeDetector();state=emptyModels();private loading:Promise<void>|null=null;private busy=false;
  constructor(private notify:(state:ModelState)=>void){}
  private update(patch:Partial<ModelState>){this.state={...this.state,...patch};this.notify(this.state);}
  load(){
    if(this.loading)return this.loading;
    this.loading=(async()=>{
      const jobs:Promise<void>[]=[];
      if(!this.road.ready){this.update({pothole:'loading',potholeError:''});jobs.push(this.road.load().then(()=>this.update({pothole:'ready'})).catch(error=>this.update({pothole:'error',potholeError:String(error?.message||error)})));}
      if(!this.objects.ready){this.update({objects:'loading',objectsError:''});jobs.push(this.objects.load().then(()=>this.update({objects:'ready'})).catch(error=>this.update({objects:'error',objectsError:String(error?.message||error)})));}
      await Promise.all(jobs);
    })().finally(()=>{this.loading=null;});return this.loading;
  }
  async detect(frame:HTMLCanvasElement):Promise<{detections:Det[];ms:number}|null>{
    if(this.busy)return null;this.busy=true;const started=performance.now();
    try{
      const detections:Det[]=[];
      if(this.objects.ready){try{detections.push(...this.objects.detect(frame));}catch(error){this.objects.ready=false;this.update({objects:'error',objectsError:String(error)});}}
      if(this.road.ready){try{detections.push(...(await this.road.detect(frame)).filter(d=>d.cls==='pothole'));}catch(error){this.road.ready=false;this.update({pothole:'error',potholeError:String(error)});}}
      return {detections,ms:performance.now()-started};
    }finally{this.busy=false;}
  }
  dispose(){this.road.dispose();this.objects.dispose();}
}
