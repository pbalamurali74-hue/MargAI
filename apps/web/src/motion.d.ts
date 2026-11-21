declare module 'rellax' {
  export default class Rellax {
    constructor(element:string|HTMLElement,options?:{speed?:number;center?:boolean;round?:boolean;vertical?:boolean;horizontal?:boolean});
    destroy():void;
    refresh():void;
  }
}
declare module '@mojs/core' { const mojs:any; export default mojs; }
