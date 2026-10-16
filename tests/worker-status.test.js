const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const User = require('../models/User');
const UserRepository = require('../repositories/UserRepository');
const WorkerStatusService = require('../services/WorkerStatusService');
const handler = require('../routes/createWorkerStatusHandler');
const baseline = readFileSync(path.join(__dirname, 'fixtures/original-worker-creation.txt'), 'utf8');
const accessCode = baseline.slice(baseline.indexOf('function toPublicUser('), baseline.indexOf("app.post('/api/workers',"));
const oldRoute = readFileSync(path.join(__dirname,'fixtures/original-worker-status.txt'),'utf8');

test('WorkerStatusService owns an independent UserRepository', () => {
  const service = new WorkerStatusService();
  assert.ok(service.users instanceof UserRepository);
  assert.notEqual(service.users, new WorkerStatusService().users);
});

test('FR-10 status endpoint preserves baseline responses and database updates', async t => {
  const scenarios = [
    { name: 'deactivate Worker', body: {isActive:false}, status:200 },
    { name: 'reactivate Worker', body: {isActive:true}, status:200 },
    { name: 'missing status', body: {}, status:400 },
    { name: 'string status rejected', body: {isActive:'false'}, status:400 },
    { name: 'unknown or non-Worker account', body: {isActive:false}, missing:true, status:404 },
    { name: 'invalid ID or database error', body: {isActive:false}, dbError:true, status:400 },
    { name: 'signed out', body: {isActive:false}, identity:'none', status:401 },
    { name: 'Worker access rejected', body: {isActive:false}, identity:'worker', status:403 },
    { name: 'inactive Owner rejected', body: {isActive:true}, identity:'inactive', status:403 }
  ];
  const oldFind = User.findById, oldUpdate = User.findOneAndUpdate;
  try {
    for(const scenario of scenarios) await t.test(scenario.name, async()=>{
      const results=[];
      for(const version of ['original','refactored']) {
        const updates=[];
        User.findById=async id=>({_id:id,role:id==='worker'?'Worker':'Owner',isActive:id!=='inactive'});
        User.findOneAndUpdate=async(query, update, options)=>{
          if(scenario.dbError) throw new Error('Database update failed');
          if(scenario.missing) return null;
          updates.push(JSON.parse(JSON.stringify({query,update,options})));
          return {_id:'target',name:'Test Worker',role:'Worker',email:'test@example.com',phone:'0400000000',password:'private-hash',hourlyRate:30,...update};
        };
        const app=express();app.use(express.json());app.use((req,res,next)=>{req.session=scenario.identity==='none'?{}:{userId:scenario.identity||'owner'};next();});
        const context=vm.createContext({app,User});vm.runInContext(accessCode,context);
        if(version==='original') vm.runInContext(oldRoute,context);
        else app.patch('/api/workers/:id/status',context.requireOwner,handler(new WorkerStatusService(),context.toPublicUser));
        const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
        try {
          const response=await fetch(`http://127.0.0.1:${server.address().port}/api/workers/target/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(scenario.body)});
          const payload=await response.json();assert.equal(response.status,scenario.status);
          if(response.status===200){assert.equal(payload.worker.isActive,scenario.body.isActive);assert.equal(Object.hasOwn(payload.worker,'password'),false);assert.deepEqual(updates,[{query:{_id:'target',role:'Worker'},update:{isActive:scenario.body.isActive},options:{new:true,runValidators:true}}]);}
          else assert.equal(updates.length,0);
          results.push({status:response.status,payload,updates});
        } finally {await new Promise(resolve=>server.close(resolve));}
      }
      assert.deepEqual(results[1],results[0]);
    });
  } finally {User.findById=oldFind;User.findOneAndUpdate=oldUpdate;}
});
