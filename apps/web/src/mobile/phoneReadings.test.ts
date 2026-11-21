import {describe,it,expect} from 'vitest';
import {emptyTelemetry} from './telemetry';
import {readPhoneTelemetry,readingState} from './phoneReadings';
describe('phone to showcase sensor packets',()=>{
 it('preserves stationary speed, zero coordinates and real three-axis readings',()=>{const t={...emptyTelemetry(),gps:{latitude:0,longitude:0,accuracy:4,timestamp:1000,speedMps:0,heading:0,altitude:null},acceleration:{x:0,y:2,z:-1},rotation:{alpha:0,beta:3,gamma:0},gForce:1,motionAt:1000};expect(readPhoneTelemetry(t)).toMatchObject(t);});
 it('rejects invalid coordinates and non-finite readings without substituting defaults',()=>{const t=readPhoneTelemetry({gps:{latitude:999,longitude:0,accuracy:1,timestamp:1},acceleration:{x:NaN,y:0,z:0},gForce:Infinity});expect(t.gps).toBeNull();expect(t.acceleration).toBeNull();expect(t.gForce).toBeNull();});
 it('shows stale readings and preserves explicit permission failures',()=>{expect(readingState('active',1000,8000)).toBe('Reading is stale');expect(readingState('denied',null,8000)).toBe('Permission denied');expect(readingState('active',null,8000)).toBe('Waiting for readings');});
 it('does not invent sensor values for an empty packet',()=>{expect(readPhoneTelemetry(null)).toEqual(emptyTelemetry());});
});
