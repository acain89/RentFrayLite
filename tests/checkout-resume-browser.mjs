import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { harness } from './helpers/checkout-harness.mjs';
const bundle=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Review from './app/[accountCode]/review/ReviewPaymentClient.tsx'; createRoot(document.getElementById('root')).render(React.createElement(Review,window.reviewProps));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'isolated-next-link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react'; export default function Link(p){return React.createElement('a',p,p.children);}`,loader:'js',resolveDir:process.cwd()}));}}]});
const browser=await chromium.launch({headless:true});
try { for(const method of ['ACH','CARD']) {
 const h=await harness(method);const checkout=await h.prepare();let origin;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if(req.method==='POST'){
   h.cookieJar.clear();for(const item of (req.headers.cookie??'').split(';')){const [k,...v]=item.trim().split('=');if(k)h.cookieJar.set(k,v.join('='));}
   let body='';for await(const chunk of req)body+=chunk;
   const response=await h.load('app/api/public/checkout/start/route.ts').POST(new Request(origin+req.url,{method:'POST',body}));
   res.statusCode=response.status;res.setHeader('Content-Type','application/json');
   res.setHeader('Set-Cookie',[...h.cookieJar].map(([k,v])=>{const options=h.calls.cookieOptions.get(k);assert.equal(options.path,'/');return `${k}=${v}; Path=${options.path}; HttpOnly; SameSite=Lax; Max-Age=${options.maxAge}`;}));res.end(await response.text());return;
  }
  const element=await h.load('app/[accountCode]/review/page.tsx').default({params:Promise.resolve({accountCode:h.business.accountCode}),searchParams:Promise.resolve({session:url.searchParams.get('session')})});
  res.setHeader('Content-Type','text/html');res.end(`<div id="root"></div><script>window.reviewProps=${JSON.stringify(element.props).replaceAll('<','\\u003c')}</script><script src="/bundle.js"></script>`);
 }catch(e){res.statusCode=500;res.end(String(e));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 const context=await browser.newContext();const page=await context.newPage();
 try{
  await context.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:`<h1>Isolated Stripe destination</h1><a href="${h.calls.creates[0].params.cancel_url}">Cancel and return</a>`}));
  await page.goto(`${origin}/${h.business.accountCode}/review?session=${checkout.id}`);
  await page.getByRole('button',{name:'Continue to Secure Payment'}).click();await page.waitForURL('https://checkout.stripe.com/**');
  const [before]=await h.payments();const snapshot=await h.db.checkoutSession.findUnique({where:{id:checkout.id}});
  await page.getByRole('link',{name:'Cancel and return'}).click();await page.waitForURL(`${origin}/**/review?session=*`);
  await page.getByRole('button',{name:'Continue to Secure Payment'}).click();await page.waitForURL('https://checkout.stripe.com/**');
  assert.equal(h.calls.creates.length,1);assert.deepEqual((await h.payments())[0],before);assert.deepEqual(await h.db.checkoutSession.findUnique({where:{id:checkout.id}}),snapshot);
  assert.equal(h.calls.access.length,2);console.log(`${method}: real review producer/client, HTTP cookie, cancel/back, second Continue PASS; same Payment and Stripe session`);
 }finally{await context.close();await new Promise(r=>server.close(r));}
} }finally{await browser.close();}
