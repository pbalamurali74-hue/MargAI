import {describe,it,expect} from 'vitest';
import {decodeYolo,type Det} from '../driver/detectionTypes';
import {Tracker} from '../driver/tracker';
describe('road model decoding and tracking',()=>{
 it('ignores segmentation mask channels when reading a single-class YOLOv8 head',()=>{const data=new Float32Array(37);data.set([320,320,128,64,.85]);data[5]=100;const results=decodeYolo(data,1,1,{scale:1,padX:0,padY:0,srcW:640,srcH:640},{pothole:.7});expect(results).toHaveLength(1);expect(results[0].cls).toBe('pothole');expect(results[0].x).toBeCloseTo(.4);expect(results[0].w).toBeCloseTo(.2);});
 it('does not corroborate one cached worker result as three independent frames',()=>{const tracker=new Tracker();const d:Det={cls:'pothole',conf:.9,x:.4,y:.5,w:.1,h:.1,src:'pothole-yolov8',frameTime:1};tracker.update([d],0);tracker.update([d],100);tracker.update([d],200);expect(tracker.tracks[0].confirmed).toBe(false);tracker.update([{...d,frameTime:2}],700);tracker.update([{...d,frameTime:3}],1400);expect(tracker.tracks[0].confirmed).toBe(true);});
});
