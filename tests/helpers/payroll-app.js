const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const calculations = require('../../payroll/payroll-calculations');
const pdf = require('../../payroll/payroll-pdf');

// Exercise current server.js functions and routes without starting its production
// listener, loading .env, or connecting to MongoDB. Fail if route markers change.
function section(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Backend test marker missing: ${start}`);
  return source.slice(first, last);
}
function createPayrollApp({ identity = 'owner', job = null, jobs = [], priorJobs = [], workers, records = new Map(), dbError = false } = {}) {
  const owner = { _id: 'owner', name: 'Owner', role: 'Owner', isActive: true };
  const worker = { _id: 'worker', name: 'Test Worker', email: 'worker@example.com', role: 'Worker', isActive: true, hourlyRate: 30 };
  workers = workers || [worker];
  const calls = { savedJobs: 0, queries: [], writes: [], marked: 0 };
  if (job) job.save = async () => { if (dbError) throw new Error('Database failure'); calls.savedJobs++; return job; };
  const User = {
    findById: async id => id === 'owner' ? owner : id === 'inactive' ? {...worker,isActive:false} : workers.find(w=>w._id===id) || {...worker,_id:id},
    findOne: async query => workers.find(w=>w.name===query.name) || null,
    find: async () => workers
  };
  const Job = {
    findById: async () => job,
    find: query => ({sort: async () => {
      calls.queries.push(query);
      if (dbError) throw new Error('Database failure');
      return query.date?.$lt ? priorJobs : jobs;
    }}),
    updateMany: async () => { calls.marked++; }
  };
  const recordKey = query => `${query.workerId}:${query.weekStart}`;
  const Payslip = {
    init: async () => {},
    updateOne: async (query, update, options) => {
      calls.writes.push({query,update,options});
      if (dbError) throw new Error('Database failure');
      if (!records.has(recordKey(query))) records.set(recordKey(query), structuredClone(update.$setOnInsert));
    },
    exists: async query => records.has(recordKey(query)),
    findOne: query => ({lean: async () => { calls.queries.push(query); return records.get(recordKey(query)) || null; }})
  };
  const app = express(); app.use(express.json());
  app.use((req,res,next)=>{req.session=identity==='none'?{}:{userId:identity};next();});
  const source=fs.readFileSync(path.join(__dirname,'../../server.js'),'utf8');
  const context=vm.createContext({app,User,Job,Payslip,console,Date,Map,Set,Buffer,...calculations,...pdf});
  const code = section(source,'async function requireOwner(', 'async function requireCompletedJobAccess(')
    + section(source,'function getWeekRange(', '\nmongoose\n')
    + section(source,"app.get('/api/worker/payslip',", "app.get('/api/worker/payslip/download',")
    + section(source,"app.get('/api/worker/payslip/download',", "app.get('/api/payroll/ytd',")
    + section(source,"app.post('/api/payroll/send-payslips',", "app.get('/api/jobs/:id/completed-details',");
  vm.runInContext(code,context,{filename:'server-payroll-under-test.js'});
  return {app,calls,records,worker,context};
}
async function request(harness, method, url, body) {
  const server=harness.app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{
      method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    const isPdf=response.headers.get('content-type')?.startsWith('application/pdf');
    return {status:response.status,headers:response.headers,body:isPdf?Buffer.from(await response.arrayBuffer()):await response.json()};
  } finally {await new Promise(resolve=>server.close(resolve));}
}
module.exports={createPayrollApp,request};
