import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {authHarness,postgres} from "./auth-harness.mjs";
export {postgres};
// Preserve the browser's real Request contract. Missing Origin/body validation
// still belongs to the production handler, never to a success-shaped mock.
export async function reportingSignOut(f,request){
 assert.equal(request.method(),'POST');
 return f.load('app/api/auth/logout/route.ts').POST(new Request(request.url(),{method:request.method(),headers:await request.allHeaders(),body:request.postDataBuffer()}));
}
export async function assertReportingSignOutDestroyed(response,remainingSession){
 assert.equal(response.status,200,'Sign-out must succeed before accepting navigation');
 assert.equal((await response.clone().json()).success,true);
 assert.equal(remainingSession,null,'The intended durable session must be deleted');
}
function matches(row,where={}){
 return Object.entries(where).every(([key,value])=>{
  if(key==="AND")return value.every(w=>matches(row,w));
  if(key==="OR")return value.some(w=>matches(row,w));
  if(value&&typeof value==="object"&&!(value instanceof Date))return Object.entries(value).every(([op,v])=>{
   if(op==="mode")return true;if(op==="in")return v.includes(row[key]);if(op==="gte")return row[key]>=v;if(op==="lt")return row[key]<v;
   if(op==="contains"){const needle=v.replace(/\\([\\%_])/g,"$1");return value.mode==="insensitive"?String(row[key]??"").toLowerCase().includes(needle.toLowerCase()):String(row[key]??"").includes(needle);}
   throw Error("Unknown reporting filter "+op);
  });return row[key]===value;
 });
}
export async function reportingFixture(backend="isolated"){
 const h=await authHarness(backend);let rows=[];
 if(backend==="isolated"){
  // These financial-report fixtures contain no SMS records. Delivery suites
  // separately exercise real grouping, legacy exclusion and recipient scopes.
  h.db.smsNotification={groupBy:async()=>[]};
  h.db.smsReceipt={findMany:async()=>[]};
 }
 if(backend==="isolated")h.db.payment={
  create:async({data})=>{const row={id:randomUUID(),...structuredClone(data)};rows.push(row);return structuredClone(row);},
  createMany:async({data})=>{for(const r of data)await h.db.payment.create({data:r});return {count:data.length};},
  update:async({where,data})=>{const row=rows.find(r=>matches(r,where));assert.ok(row);Object.assign(row,structuredClone(data));return structuredClone(row);},
  count:async({where={}}={})=>rows.filter(r=>matches(r,where)).length,
  findMany:async({where={},orderBy=[],skip=0,take,select,cursor}={})=>{
   const ordered=rows.filter(r=>matches(r,where)).sort((a,b)=>{for(const o of Array.isArray(orderBy)?orderBy:[orderBy])for(const [k,dir]of Object.entries(o)){const c=a[k]<b[k]?-1:a[k]>b[k]?1:0;if(c)return dir==="desc"?-c:c;}return 0;});
   const index=cursor?ordered.findIndex(r=>r.id===cursor.id):0;if(cursor)assert.ok(index>=0,"Cursor must exist");
   const selected=ordered.slice(index+skip,take===undefined?undefined:index+skip+take);
   return structuredClone(select?selected.map(r=>Object.fromEntries(Object.entries(select).filter(([,v])=>v===true||(v&&typeof v==="object")).map(([k])=>[k,r[k]]))):selected);
  },
 };
 const business=await h.db.business.update({where:{id:h.businesses[0].id},data:{propertyTimeZone:"America/Chicago",firstStandardBillingDate:new Date("2026-11-01")}});
 await h.issue();
 h.mocks["./ManagerHistoryClient"]={__esModule:true,default:()=>null};h.mocks["./ManagerDashboardClient"]={__esModule:true,default:()=>null};
 h.mocks["@/lib/businessPaymentReadiness"]={loadBusinessPaymentReadiness:async()=>({readiness:{title:"Mock readiness",reasons:[]}})};
 const calendar=h.load("lib/reportingCalendar.ts"),view=h.load("lib/transactionReportView.ts"),report=h.load("lib/transactionReporting.ts"),dashboard=h.load("lib/dashboard.ts");
 h.mocks["@/lib/dashboard"]={...dashboard,getCurrentBillingCycle:()=>"2026-11"};
 const seed=(patch={})=>h.db.payment.create({data:{businessId:business.id,checkoutAttemptId:null,sourceType:"RECURRING_PLAN",sourceId:"original-tier",status:"PAID",paymentMethod:"ACH",payerFirstName:"Jane",payerLastName:"Smith",payerPhone:"5555551234",payerEmail:null,referenceLabel:"12",
  itemDescription:"Original tier",lineItemsSnapshot:[{label:"Original base rent",amountCents:9000},{label:"Original mandatory charge",amountCents:1000}],subtotalCents:10000,platformFeeCents:200,totalChargedCents:10200,businessProceedsCents:10000,expectedStripeProcessingFeeCents:119,processorFeeCents:null,actualManagementNetCents:null,stripeBalanceTransactionId:null,
  billingCycle:"2026-11",createdAt:new Date("2026-11-15T12:00:00Z"),paidAt:new Date("2026-12-02T12:00:00Z"),pendingAt:new Date("2026-11-15T12:00:00Z"),failedAt:null,returnedAt:null,disputedAt:null,failureCode:null,chargeModel:"LEGACY_DESTINATION",...patch}});
 const filters=q=>view.parseReportFilters(new URLSearchParams(q));
 const list=(q="",complete=false)=>report.loadTransactionReport(h.db,business.id,filters(q),"America/Chicago",complete);
 const history=q=>h.load("app/manager/history/page.tsx").default({searchParams:Promise.resolve(Object.fromEntries(new URLSearchParams(q)))});
 const dashboardPage=q=>h.load("app/manager/dashboard/page.tsx").default({searchParams:Promise.resolve(Object.fromEntries(new URLSearchParams(q)))});
 const endpoint=q=>h.load("app/api/manager/transactions/export/route.ts").GET(new Request("https://example.test/api/manager/transactions/export?"+q));
 return {...h,business,calendar,view,report,dashboard,seed,filters,list,history,dashboardPage,endpoint};
}


// Request-bound native-browser adapter. Authentication still runs in production
// handlers/pages; no pre-seeded fixture jar may authorize a browser request.
export async function reportingBrowserBridge(f,render){
 const {AsyncLocalStorage}=await import('node:async_hooks');
 const {default:server}=await import('next/server.js');
 const {NextRequest,NextResponse}=server,state=new AsyncLocalStorage();
 const originalCookies=f.mocks['next/headers'].cookies,originalRedirect=f.mocks['next/navigation'].redirect;
 const events=[];const origin=f.load('lib/credentialRequest.ts').configuredCredentialOrigin();
 class BrowserRedirect extends Error{constructor(location){super('BROWSER_PAGE_REDIRECT');this.location=location;}}
 f.mocks['next/navigation'].redirect=location=>{throw new BrowserRedirect(location);};
 f.mocks['next/headers'].cookies=async()=>{
  const scope=state.getStore();if(!scope)throw Error('BROWSER_REQUEST_SCOPE_REQUIRED');
  return {get:name=>scope.cookies.get(name),set:(name,value,options)=>{
   if(scope.readOnly){scope.readOnlyAttempts++;throw Error('Cookies can only be modified in a Server Action or Route Handler.');}
   scope.cookies.set(name,value);scope.staged.cookies.set(name,value,options);
  }};
 };
 async function dispatch(request){
  const url=new URL(request.url);if(url.origin!==origin)throw Error('BROWSER_ORIGIN_NOT_ALLOWED');
  const api=url.pathname.startsWith('/api/'),scope={readOnly:!api,cookies:new NextRequest(request.url,{headers:request.headers}).cookies,staged:new NextResponse(),readOnlyAttempts:0};
  return state.run(scope,async()=>{
   let response;
   try{
    if(request.method==='POST'&&['/api/auth/login','/api/auth/logout'].includes(url.pathname))response=await f.load('app'+url.pathname+'/route.ts').POST(request);
    else if(request.method==='GET'&&url.pathname==='/api/manager/transactions/export')response=await f.load('app/api/manager/transactions/export/route.ts').GET(request);
    else if(request.method==='GET'&&url.pathname==='/login/manager'){
     f.mocks['./ManagerLoginClient']={__esModule:true,default:()=>null};
     response=new Response(await render('login',(await f.load('app/login/manager/page.tsx').default()).props),{headers:{'content-type':'text/html; charset=utf-8'}});
    }else if(request.method==='GET'&&['/manager/dashboard','/manager/history'].includes(url.pathname)){
     const dashboard=url.pathname==='/manager/dashboard',element=dashboard?await f.dashboardPage(url.searchParams.toString()):await f.history(url.searchParams.toString());
     response=new Response(await render(dashboard?'dashboard':'history',element.props),{headers:{'content-type':'text/html; charset=utf-8'}});
    }else if(request.method==='GET'&&url.pathname==='/')response=new Response('<h1>Signed out</h1>',{headers:{'content-type':'text/html'}});
    else response=new Response('Not found',{status:404});
   }catch(error){
    if(!(error instanceof BrowserRedirect))throw error;
    if(typeof error.location!=='string'||new URL(error.location,origin).origin!==origin)throw Error('BROWSER_REDIRECT_ORIGIN_NOT_ALLOWED');
    response=new Response(null,{status:307,headers:{location:error.location}});
   }
   const headers=new Headers(response.headers);for(const cookie of scope.staged.headers.getSetCookie())headers.append('set-cookie',cookie);
   const result=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
   events.push({path:url.pathname,method:request.method,status:result.status,location:result.headers.get('location'),cookieReceived:request.headers.has('cookie'),cookieHeaders:result.headers.getSetCookie().length,expiredSessionCookie:result.headers.getSetCookie().some(c=>/^rfl_session=;/.test(c)&&/Expires=.*1970/i.test(c)&&/HttpOnly/i.test(c)&&/Secure/i.test(c)&&/SameSite=lax/i.test(c)),readOnlyCookieAttempts:scope.readOnlyAttempts});
   return result;
  });
 }
 return {origin,events,dispatch,close(){f.mocks['next/headers'].cookies=originalCookies;f.mocks['next/navigation'].redirect=originalRedirect;}};
}

// Playwright's route API automatically continues redirect hops. For these auth
// scenarios use one Playwright CDP Fetch layer for every hop, including redirects.
// Browser DNS/proxy/child guards stay in force; unmatched origins abort locally.
export async function interceptReportingBrowser(page,bridge){
 const context=page.context();if(page.url()!=='about:blank'||context.pages().length!==1)throw Error('FRESH_PRIVATE_BROWSER_PAGE_REQUIRED');
 await context.unrouteAll({behavior:'wait'});
 const session=await context.newCDPSession(page),pending=new Set(),errors=[];
 const onPaused=event=>{
  const task=(async()=>{
   if(new URL(event.request.url).origin!==bridge.origin)return session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});
   if(event.request.hasPostData&&typeof event.request.postData!=='string')throw Error('BROWSER_REQUEST_BODY_UNAVAILABLE');
   const request=new Request(event.request.url,{method:event.request.method,headers:event.request.headers,...(event.request.postData===undefined?{}:{body:event.request.postData})});
   const response=await bridge.dispatch(request),headers=[...response.headers].filter(([name])=>name!=='set-cookie').map(([name,value])=>({name,value}));
   for(const value of response.headers.getSetCookie())headers.push({name:'Set-Cookie',value});
   await session.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:response.status,responseHeaders:headers,body:Buffer.from(await response.arrayBuffer()).toString('base64')});
  })().catch(async()=>{errors.push('BROWSER_FIXTURE_DISPATCH_FAILED');await session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'}).catch(()=>{});});
  pending.add(task);task.finally(()=>pending.delete(task));
 };
 session.on('Fetch.requestPaused',onPaused);await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 return {errors,async close(){await Promise.all([...pending]);await context.route('**/*',route=>route.abort('blockedbyclient'));await session.send('Fetch.disable');session.off('Fetch.requestPaused',onPaused);await session.detach();if(errors.length)throw Error('BROWSER_FIXTURE_DISPATCH_FAILED');}};
}
