// Local Wi-Fi HTTPS gateway. No tunnel or public hosting.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const certDir = path.join(root, 'apps/web/certs');
const interfaces = os.networkInterfaces();
const candidates = [...(interfaces.en0 || []), ...Object.values(interfaces).flat()];
const host = process.env.DEMO_LAN_IP || candidates.find(i => i.family === 'IPv4' && !i.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))?.address;
if (!host) throw new Error('Connect this laptop to Wi-Fi, then retry.');
const securePort = 8443, setupPort = 8088;
fs.mkdirSync(certDir, {recursive:true});
const file = n => path.join(certDir, n);
const openssl = args => execFileSync('/usr/bin/openssl', args, {stdio:'ignore'});
fs.writeFileSync(file('ca.cnf'), `[req]\ndistinguished_name=dn\nx509_extensions=v3_ca\n[dn]\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`);
if (!fs.existsSync(file('local-ca.key'))) {
  openssl(['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','7','-keyout',file('local-ca.key'),'-out',file('local-ca.pem'),'-subj','/CN=MargAI Local Demo CA','-config',file('ca.cnf')]);
  fs.chmodSync(file('local-ca.key'), 0o600);
}
fs.writeFileSync(file('server.ext'), `subjectAltName=IP:${host},IP:127.0.0.1,DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
openssl(['req','-newkey','rsa:2048','-nodes','-keyout',file('server.key'),'-out',file('server.csr'),'-subj','/CN=MargAI Local WiFi Demo']);
fs.chmodSync(file('server.key'), 0o600);
openssl(['x509','-req','-in',file('server.csr'),'-CA',file('local-ca.pem'),'-CAkey',file('local-ca.key'),'-CAcreateserial','-out',file('server.pem'),'-days','7','-sha256','-extfile',file('server.ext')]);
openssl(['x509','-in',file('local-ca.pem'),'-outform','DER','-out',file('margai-local-ca.crt')]);
const origin = `https://${host}:${securePort}`;
fs.writeFileSync(file('phone-origin.txt'), origin);
const setupHtml = `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>MargAI phone setup</title><body style="font:16px/1.7 system-ui;max-width:620px;margin:40px auto;padding:20px"><h1>Connect your Android phone</h1><p>Keep the phone and laptop on the same Wi-Fi.</p><ol><li><a href="/margai-local-ca.crt">Download the MargAI local certificate</a>.</li><li>In Android Settings, search for <b>Install a certificate</b>. Choose <b>CA certificate</b>, then select the downloaded file. This trusts this laptop’s local demo certificate for seven days. Remove <b>MargAI Local Demo CA</b> from your user credentials after the demo.</li><li><a href="${origin}/?view=smartphone">Open the phone camera</a>, or scan the updated pairing QR on the laptop and allow Camera access.</li></ol><p><a href="${origin}/?view=in-car">Open road showcase</a></p><p>This service stays on the local Wi-Fi. No public tunnel is running.</p></body></html>`;
const setup = http.createServer((req,res) => {
  if (req.url === '/margai-local-ca.crt') { res.writeHead(200, {'Content-Type':'application/x-x509-ca-cert','Content-Disposition':'attachment; filename="margai-local-ca.crt"'}); res.end(fs.readFileSync(file('margai-local-ca.crt'))); }
  else { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(setupHtml); }
});
const server = https.createServer({key:fs.readFileSync(file('server.key')),cert:fs.readFileSync(file('server.pem'))},(req,res) => {
  const proxy = http.request({hostname:'127.0.0.1',port:8080,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-proto':'https'}}, upstream => {res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
  proxy.on('error',()=>{res.writeHead(502,{'content-type':'text/plain'});res.end('MargAI API is offline. Start npm run dev or npm start on the laptop.');});
  req.pipe(proxy);
});
server.on('upgrade',(req,client,head)=>{
  const proxy=http.request({hostname:'127.0.0.1',port:8080,path:req.url,headers:req.headers});
  proxy.on('upgrade',(response,upstream,upstreamHead)=>{
    client.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if(head.length)upstream.write(head);if(upstreamHead.length)client.write(upstreamHead);
    upstream.pipe(client);client.pipe(upstream);
    client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
  });
  proxy.on('error',()=>client.destroy());proxy.end();
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;setup.close();});
setup.listen(setupPort,host,()=>console.log(`Android setup: http://${host}:${setupPort}`));
server.listen(securePort,host,()=>console.log(`Local HTTPS demo: ${origin}`));
const stop=()=>{setup.close();server.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
