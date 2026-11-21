import Peer, {type DataConnection,type MediaConnection} from 'peerjs';
import {LiveRelay} from '../live/relay';
export type LinkState={state:'off'|'connecting'|'connected'|'error';message:string;transport?:'WebRTC'|'Local relay'};
export const validTarget=(input:string)=>/^margai-[A-Za-z0-9]{4,8}$/.test(input.trim());
export class PhoneBridge {
  private peer:Peer|null=null;private data:DataConnection|null=null;private call:MediaConnection|null=null;private relay:LiveRelay|null=null;private target='';private stream:MediaStream|null=null;private relayAck=0;private stopped=false;
  constructor(private notify:(state:LinkState)=>void){}
  connect(target:string,backend:boolean){
    this.close();this.stopped=false;this.target=target.trim();
    if(!validTarget(this.target)){this.notify({state:'error',message:'Enter the margai-… ID shown on the car display.'});return;}
    this.notify({state:'connecting',message:'Waiting for the car display…'});
    if(backend){const relay=new LiveRelay();this.relay=relay;relay.whenOpen(()=>relay.send('pair.join',{code:this.target.slice(7).toUpperCase(),role:'phone'}));relay.on('ack',e=>{if(e.payload?.deliveredToDisplays>0){this.relayAck=Date.now();this.notify({state:'connected',transport:'Local relay',message:'Frames delivered to the car display'});}});}
    const peer=new Peer({secure:true,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}});this.peer=peer;
    peer.on('open',()=>{if(this.stopped||this.peer!==peer)return;this.openData(peer);this.attach(this.stream);});
    peer.on('disconnected',()=>{if(this.stopped||this.peer!==peer)return;this.notify({state:'connecting',message:'Reconnecting to the car display…'});try{peer.reconnect();}catch{}});
    peer.on('error',error=>{if(!this.stopped&&this.peer===peer&&Date.now()-this.relayAck>4000)this.notify({state:'error',message:`Pairing unavailable: ${error.type}. Check the display ID and connection.`});});
  }
  private openData(peer:Peer){
    const data=peer.connect(this.target,{reliable:true});this.data=data;
    data.on('open',()=>{if(this.data===data)this.notify({state:'connected',transport:'WebRTC',message:'Display connected · waiting for camera frames'});});
    data.on('data',(packet:any)=>{if(this.data===data&&packet?.kind==='margai.frame.received')this.notify({state:'connected',transport:'WebRTC',message:'Website is receiving live camera frames'});});
    data.on('close',()=>{if(this.data===data){this.data=null;if(!this.stopped)this.notify({state:'connecting',message:'Display disconnected. Tap Connect to retry.'});}});
    data.on('error',()=>{if(!this.stopped)this.notify({state:'error',message:'The car data connection failed. Tap Connect to retry.'});});
  }
  attach(stream:MediaStream|null){this.stream=stream;this.call?.close();this.call=null;if(!stream||!this.peer?.open||this.stopped)return;this.call=this.peer.call(this.target,stream);this.call.on('error',()=>{/* JPEG frames continue over the data channel or local relay. */});}
  send(payload:unknown){if(this.stopped)return;try{if(this.data?.open)this.data.send(payload);this.relay?.send('infotainment.push',payload);}catch{this.notify({state:'error',message:'Camera frames could not be sent. Tap Connect to retry.'});}}
  close(){this.stopped=true;this.call?.close();this.data?.close();this.peer?.destroy();this.relay?.close();this.call=null;this.data=null;this.peer=null;this.relay=null;this.relayAck=0;this.notify({state:'off',message:'No car paired'});}
}
