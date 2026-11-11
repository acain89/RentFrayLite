import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { authHarness, postgres } from './auth-harness.mjs';

// Storage adapter only. Production routes, authorization, revision checks,
// request validation and financial validators execute unchanged in both modes.
function isolatedModels(h) {
  let tables = { recurringPlan: [], recurringCharge: [], payment: [], checkoutSession: [] };
  const clone = structuredClone;
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some(w => matches(row,w));
      if (key === 'AND') return value.every(w => matches(row,w));
      if (key === 'recurringPlan') return matches(tables.recurringPlan.find(p=>p.id===row.recurringPlanId)??{},value);
      if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op,v]) => {
        if(op==='in')return v.includes(row[key]); if(op==='notIn')return !v.includes(row[key]);
        if(op==='gt')return row[key]>v; if(op==='not')return row[key]!==v; if(op==='mode')return true;
        if(op==='equals')return value.mode==='insensitive'?String(row[key]).toLowerCase()===String(v).toLowerCase():row[key]===v;
        throw Error('Unsupported fixture filter '+op);
      });
      return row[key]===value;
    });
  }
  const hydrated = (name,row,include) => {
    if(!row)return null;const result=clone(row);
    if(name==='recurringPlan'&&include?.charges){let charges=tables.recurringCharge.filter(c=>c.recurringPlanId===row.id&&matches(c,include.charges.where));charges=ordered(charges,include.charges.orderBy);result.charges=clone(charges);}
    return result;
  };
  function ordered(rows,orderBy) {
    const rules=Array.isArray(orderBy)?orderBy:orderBy?[orderBy]:[];
    return [...rows].sort((a,b)=>{for(const rule of rules)for(const [key,dir]of Object.entries(rule)){if(a[key]===b[key])continue;return(a[key]<b[key]?-1:1)*(dir==='desc'?-1:1);}return 0;});
  }
  for(const name of Object.keys(tables)){
    const model={
      async create({data,include}){const row={id:randomUUID(),isActive:true,sortOrder:0,createdAt:new Date(),updatedAt:new Date(),
        ...(name==='recurringPlan'?{dueDay:1,gracePeriodDays:5,initialLateFeeCents:0,dailyLateFeeCents:0,dailyLateFeeMaxDays:0}:name==='recurringCharge'?{sharedChargeGroupId:null,effectiveBillingCycle:null,endsAfterBillingCycle:null}:{}),...clone(data)};
        assert.ok(!tables[name].some(r=>r.id===row.id),'Unique identity');tables[name].push(row);return hydrated(name,row,include);},
      async createMany({data}){for(const row of data)await model.create({data:row});return{count:data.length};},
      async findMany({where={},orderBy,take,skip=0,include}={}){const rows=ordered(tables[name].filter(r=>matches(r,where)),orderBy).slice(skip,take===undefined?undefined:skip+take);return rows.map(row=>hydrated(name,row,include));},
      async findFirst(args={}){return(await model.findMany({...args,take:1}))[0]??null;},
      async findUnique({where,include}){return hydrated(name,tables[name].find(r=>matches(r,where)),include);},
      async findUniqueOrThrow(args){const row=await model.findUnique(args);assert.ok(row);return row;},
      async count({where={}}={}){return tables[name].filter(r=>matches(r,where)).length;},
      async update({where,data,include}){const row=tables[name].find(r=>matches(r,where));assert.ok(row);Object.assign(row,clone(data),{updatedAt:new Date()});return hydrated(name,row,include);},
      async updateMany({where,data}){let count=0;for(const row of tables[name].filter(r=>matches(r,where))){Object.assign(row,clone(data),{updatedAt:new Date()});count++;}return{count};},
      async deleteMany({where={}}={}){const prior=tables[name].length;tables[name]=tables[name].filter(r=>!matches(r,where));return{count:prior-tables[name].length};},
    };h.db[name]=model;
  }
  const query=h.db.$queryRaw;
  h.db.$queryRaw=async q=>{
    if(q.sql.includes('recurring-global-charge-groups')){
      const businessId=q.values[0],groups=q.values.slice(1,-1),total=q.values.at(-1);return groups.filter(group=>new Set(tables.recurringCharge.filter(c=>c.sharedChargeGroupId===group&&c.isActive&&tables.recurringPlan.some(p=>p.id===c.recurringPlanId&&p.businessId===businessId&&p.isActive)).map(c=>c.recurringPlanId)).size===total).map(sharedChargeGroupId=>({sharedChargeGroupId}));
    }
    if(q.sql.includes('recurring-charge-count')){const row=tables.recurringPlan.find(p=>p.businessId===q.values[0]&&p.isActive&&tables.recurringCharge.filter(c=>c.recurringPlanId===p.id&&c.isActive).length>q.values[1]);return row?[{id:row.id}]:[];}
    if(q.sql.includes('recurring-inherit-conflict')){
      const [firstId,businessId,newId]=q.values,others=tables.recurringPlan.filter(p=>p.businessId===businessId&&p.isActive&&p.id!==newId);
      const row=tables.recurringCharge.find(s=>s.recurringPlanId===firstId&&s.isActive&&s.sharedChargeGroupId&&others.every(p=>tables.recurringCharge.some(c=>c.recurringPlanId===p.id&&c.isActive&&c.sharedChargeGroupId===s.sharedChargeGroupId))&&tables.recurringCharge.some(c=>others.some(p=>p.id===c.recurringPlanId)&&c.sharedChargeGroupId===s.sharedChargeGroupId&&c.isActive&&['label','amountCents','effectiveBillingCycle','endsAfterBillingCycle'].some(k=>c[k]!==s[k])));return row?[{id:row.id}]:[];
    }
    if(q.sql.includes('recurring-shared-range')){const [businessId,group,start,end]=q.values;const row=tables.recurringCharge.find(c=>c.sharedChargeGroupId===group&&tables.recurringPlan.some(p=>p.id===c.recurringPlanId&&p.businessId===businessId&&p.isActive)&&(!c.isActive||c.effectiveBillingCycle!==start||c.endsAfterBillingCycle!==end));return row?[{id:row.id}]:[];}
    if(q.sql.includes('recurring-global-version')){const plans=tables.recurringPlan.filter(p=>p.businessId===q.values[0]),ids=new Set(plans.map(p=>p.id));return[{version:createHash('md5').update(JSON.stringify([plans,tables.recurringCharge.filter(c=>ids.has(c.recurringPlanId))])).digest('hex')}];}
    if(q.sql.includes('recurring-maximum')){
      const rows=tables.recurringPlan.filter(p=>p.businessId===q.values[0]&&p.isActive).map(p=>({...p,recurringChargeCents:tables.recurringCharge.filter(c=>c.recurringPlanId===p.id&&c.isActive).reduce((sum,c)=>sum+c.amountCents,0)}));
      rows.sort((a,b)=>(b.baseAmountCents+b.recurringChargeCents+b.initialLateFeeCents+b.dailyLateFeeCents*b.dailyLateFeeMaxDays)-(a.baseAmountCents+a.recurringChargeCents+a.initialLateFeeCents+a.dailyLateFeeCents*a.dailyLateFeeMaxDays));
      return rows.slice(0,1).map(row=>({...row,recurringChargeCents:BigInt(row.recurringChargeCents)}));
    }
    return query(q);
  };
  h.db.$executeRaw=async q=>{
    if(q.sql.includes('recurring-inherit-charges')){
      const [planId,,firstId,businessId]=q.values,others=tables.recurringPlan.filter(p=>p.businessId===businessId&&p.isActive&&p.id!==planId);
      for(const c of [...tables.recurringCharge].filter(c=>c.recurringPlanId===firstId&&c.isActive&&c.sharedChargeGroupId))if(others.every(p=>tables.recurringCharge.some(r=>r.recurringPlanId===p.id&&r.isActive&&r.sharedChargeGroupId===c.sharedChargeGroupId)))await h.db.recurringCharge.create({data:{...c,id:'rc_'+createHash('md5').update(planId+c.sharedChargeGroupId).digest('hex'),recurringPlanId:planId}});
      return 1;
    }
    if(q.sql.includes('recurring-shared-charge')){
      const [group,,label,amountCents,effectiveBillingCycle,endsAfterBillingCycle,businessId]=q.values;
      for(const p of tables.recurringPlan.filter(p=>p.businessId===businessId&&p.isActive))if(!tables.recurringCharge.some(c=>c.recurringPlanId===p.id&&c.sharedChargeGroupId===group))await h.db.recurringCharge.create({data:{id:'rc_'+createHash('md5').update(group+p.id).digest('hex'),recurringPlanId:p.id,sharedChargeGroupId:group,label,amountCents,effectiveBillingCycle,endsAfterBillingCycle,sortOrder:tables.recurringCharge.filter(c=>c.recurringPlanId===p.id).length}});
      return 1;
    }
    throw Error('Unsupported storage statement '+q.sql);
  };
  const transaction=h.db.$transaction;
  h.db.$transaction=async(fn,options)=>transaction(async tx=>{const prior=clone(tables);try{return await fn(tx);}catch(error){tables=prior;throw error;}},options);
}

export async function tierFixture(backend='isolated',count=1){
  const h=await authHarness(backend);if(backend==='isolated')isolatedModels(h);await h.issue();const businessId=h.businesses[0].id;
  await h.db.recurringPlan.createMany({data:Array.from({length:count},(_,index)=>({businessId,name:'Tier '+String(index+1).padStart(4,'0'),baseAmountCents:10000+index,dueDay:1,gracePeriodDays:5,sortOrder:index}))});
  const first=await h.db.recurringPlan.findFirst({where:{businessId},orderBy:{sortOrder:'asc'}});
  const request=(body,headers={})=>new Request('https://example.test/api/setup/recurring/tiers',{method:'PATCH',headers:{origin:'https://example.test','content-type':'application/json',...headers},body:JSON.stringify(body)});
  const send=(section,body,headers)=>h.load('app/api/setup/recurring/'+section+'/route.ts').PATCH(request({requestId:randomUUID(),...body},headers));
  const page=async(cursor)=>{const response=await h.load('app/api/setup/recurring/tiers/route.ts').GET(new Request('https://example.test/api/setup/recurring/tiers'+(cursor?'?cursor='+encodeURIComponent(cursor):'')));assert.equal(response.status,200,await response.clone().text());return response.json();};
  const row=id=>h.db.recurringPlan.findUnique({where:{id},include:{charges:true}});
  const version=async id=>{const plan=await row(id);return h.load('lib/recurringConfiguration.ts').configurationFingerprint([{...plan,charges:plan.charges.filter(c=>c.isActive)}]);};
  return{...h,businessId,first,request,send,page,row,version};
}
export {postgres};
