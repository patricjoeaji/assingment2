const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createPayrollApp,request}=require('./helpers/payroll-app');
const {calculateWeeklyTax,getAustralianFinancialYearStart}=require('../payroll/payroll-calculations');
const {createPayslipPdfBuffer}=require('../payroll/payroll-pdf');
const approval='/api/jobs/job/hours-approval';
const release='/api/payroll/send-payslips';
const week='2026-10-12';
function completedJob(overrides={}) {
 return {_id:'job',title:'Test job',date:'2026-10-15',startTime:'09:00',endTime:'11:00',assignedWorker:'Test Worker',status:'Finished',completionSubmittedAt:new Date('2026-10-15T02:00:00Z'),hoursApprovalStatus:'Pending',...overrides};
}
function approvedJob(overrides={}) {
 return completedJob({hoursApprovalStatus:'Approved',approvedClockInSource:'scheduled',approvedClockOutSource:'scheduled',approvedClockInAt:new Date('2026-10-14T23:00:00Z'),approvedClockOutAt:new Date('2026-10-15T01:00:00Z'),approvedHourlyRate:30,...overrides});
}
const scheduled={clockInSource:'scheduled',clockOutSource:'scheduled'};

test('FR-12 approval: scheduled times save approved hours, rate and Owner',async()=>{
 const job=completedJob(),h=createPayrollApp({job});const r=await request(h,'PATCH',approval,scheduled);
 assert.equal(r.status,200);assert.equal(job.hoursApprovalStatus,'Approved');assert.equal(job.approvedClockOutAt-job.approvedClockInAt,120*60000);assert.equal(job.approvedHourlyRate,30);assert.equal(job.hoursApprovedBy,'owner');assert.equal(h.calls.savedJobs,1);
});
test('FR-12 approval: actual punches retained',async()=>{
 const job=completedJob({clockInAt:new Date('2026-10-14T23:05:00Z'),clockOutAt:new Date('2026-10-15T01:10:00Z')});const h=createPayrollApp({job});const r=await request(h,'PATCH',approval,{clockInSource:'actual',clockOutSource:'actual'});
 assert.equal(r.status,200);assert.equal(job.approvedClockInAt.valueOf(),job.clockInAt.valueOf());assert.equal(job.approvedClockOutAt.valueOf(),job.clockOutAt.valueOf());
});
test('FR-12 approval: manual times can be chosen independently',async()=>{
 const job=completedJob(),h=createPayrollApp({job});const r=await request(h,'PATCH',approval,{clockInSource:'manual',clockInManual:'09:30',clockOutSource:'scheduled'});assert.equal(r.status,200);assert.equal(job.approvedClockOutAt-job.approvedClockInAt,90*60000);
});
for(const [name,body,job,status] of [
 ['invalid time source',{...scheduled,clockInSource:'bad'},completedJob(),400],
 ['missing actual punch',{...scheduled,clockInSource:'actual'},completedJob(),400],
 ['invalid manual time',{...scheduled,clockOutSource:'manual',clockOutManual:'25:00'},completedJob(),400],
 ['zero-length working time',{clockInSource:'manual',clockOutSource:'manual',clockInManual:'09:00',clockOutManual:'09:00'},completedJob(),400],
 ['unfinished job',scheduled,completedJob({status:'Accepted'}),409],
 ['already approved job',scheduled,approvedJob(),409],
 ['missing job',scheduled,null,404]
])test(`FR-12 approval error: ${name}`,async()=>{const h=createPayrollApp({job});assert.equal((await request(h,'PATCH',approval,body)).status,status);assert.equal(h.calls.savedJobs,0);});
test('FR-12 Undo: clears approval, preserves job completion and released payslip',async()=>{
 const job=approvedJob({hoursApprovedBy:'owner',hoursApprovedAt:new Date()}),records=new Map([['worker:'+week,{snapshot:{gross:60}}]]),h=createPayrollApp({job,records});const before=structuredClone(records.get('worker:'+week));
 assert.equal((await request(h,'PATCH',approval+'/undo',{})).status,200);assert.equal(job.hoursApprovalStatus,'Pending');for(const field of ['hoursApprovedBy','hoursApprovedAt','approvedClockInSource','approvedClockOutSource','approvedClockInAt','approvedClockOutAt','approvedHourlyRate'])assert.equal(job[field],null);assert.equal(job.status,'Finished');assert.deepEqual(records.get('worker:'+week),before);
});
test('FR-12 Undo error: pending timesheet cannot be undone',async()=>{const h=createPayrollApp({job:completedJob()});assert.equal((await request(h,'PATCH',approval+'/undo',{})).status,409);assert.equal(h.calls.savedJobs,0);});
for(const [name,identity,status] of [['signed out','none',401],['Worker','worker',403],['inactive account','inactive',403]])test(`FR-12 access: ${name} cannot approve or release`,async()=>{const h=createPayrollApp({identity,job:completedJob(),jobs:[approvedJob()]});assert.equal((await request(h,'PATCH',approval,scheduled)).status,status);assert.equal((await request(h,'POST',release,{weekStart:week})).status,status);assert.equal(h.calls.savedJobs,0);assert.equal(h.records.size,0);});

test('FR-12 release: saves pay snapshot, references, daily hours and YTD',async()=>{
 const job=approvedJob(),h=createPayrollApp({jobs:[job]});const r=await request(h,'POST',release,{weekStart:week});assert.equal(r.status,200);assert.equal(r.body.sentCount,1);const saved=h.records.get('worker:'+week);assert.equal(saved.workerId,'worker');assert.equal(saved.sentBy,'owner');assert.equal(saved.snapshot.gross,60);assert.equal(saved.snapshot.superAmount,7.2);assert.equal(saved.snapshot.minutes,120);assert.equal(saved.snapshot.days[3],120);assert.equal(saved.snapshot.ytd.gross,60);assert.equal(h.calls.writes[0].options.upsert,true);assert.equal(h.calls.queries[0].hoursApprovalStatus,'Approved');
});
test('FR-12 release: repeated push does not overwrite saved snapshot',async()=>{
 const job=approvedJob(),h=createPayrollApp({jobs:[job]});await request(h,'POST',release,{weekStart:week});const saved=structuredClone(h.records.get('worker:'+week));job.approvedHourlyRate=100;await request(h,'POST',release,{weekStart:week});assert.equal(h.records.size,1);assert.deepEqual(h.records.get('worker:'+week),saved);assert.ok(h.calls.writes.every(call=>call.update.$setOnInsert));
});
test('FR-12 release: combines prior approved work into YTD',async()=>{
 const prior=approvedJob({date:'2026-10-08',approvedClockInAt:new Date('2026-10-07T23:00:00Z'),approvedClockOutAt:new Date('2026-10-08T00:00:00Z')});const h=createPayrollApp({jobs:[approvedJob()],priorJobs:[prior]});assert.equal((await request(h,'POST',release,{weekStart:week})).status,200);const s=h.records.get('worker:'+week).snapshot;assert.equal(s.current.gross,60);assert.equal(s.ytd.gross,90);assert.equal(s.ytd.minutes,180);
});
test('FR-12 release error: invalid week rejected',async()=>{const h=createPayrollApp();assert.equal((await request(h,'POST',release,{weekStart:'invalid'})).status,400);assert.equal(h.records.size,0);});
test('FR-12 release error: no approved hours rejected',async()=>{const h=createPayrollApp();assert.equal((await request(h,'POST',release,{weekStart:week})).status,400);assert.equal(h.records.size,0);});
test('FR-12 release error: missing hourly rate rejected',async()=>{const h=createPayrollApp({jobs:[approvedJob({approvedHourlyRate:null})],workers:[{_id:'worker',name:'Test Worker',role:'Worker',isActive:true,hourlyRate:null}]});assert.equal((await request(h,'POST',release,{weekStart:week})).status,409);assert.equal(h.records.size,0);});
async function releasedRecords(){const h=createPayrollApp({jobs:[approvedJob()]});await request(h,'POST',release,{weekStart:week});return h.records;}
test('FR-12 Worker view: returns saved data after job and rate changes',async()=>{
 const records=await releasedRecords(),h=createPayrollApp({identity:'worker',records,workers:[{_id:'worker',name:'Test Worker',role:'Worker',isActive:true,hourlyRate:100}]});const r=await request(h,'GET','/api/worker/payslip?weekStart='+week);assert.equal(r.status,200);assert.equal(r.body.isSent,true);assert.equal(r.body.current.gross,60);assert.equal(r.body.current.hourlyRate,30);assert.equal(h.calls.queries[0].workerId,'worker');
});
test('FR-12 download: generates real PDF from saved snapshot',async()=>{
 const records=await releasedRecords(),h=createPayrollApp({identity:'worker',records});const r=await request(h,'GET','/api/worker/payslip/download?weekStart='+week);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/pdf/);assert.match(r.headers.get('content-disposition'),/attachment/);assert.equal(r.body.subarray(0,5).toString(),'%PDF-');assert.ok(r.body.length>1000);assert.equal(h.calls.queries[0].workerId,'worker');
});
test('FR-12 download error: unreleased payslip rejected',async()=>{const h=createPayrollApp({identity:'worker'});assert.equal((await request(h,'GET','/api/worker/payslip/download?weekStart='+week)).status,404);});
test('FR-12 access: another Worker cannot download recipient payslip',async()=>{const h=createPayrollApp({identity:'other',records:await releasedRecords()});assert.equal((await request(h,'GET','/api/worker/payslip/download?weekStart='+week)).status,404);assert.equal(h.calls.queries[0].workerId,'other');});
test('FR-12 access: Owner cannot use Worker payslip endpoints',async()=>{const h=createPayrollApp();for(const endpoint of ['/api/worker/payslip','/api/worker/payslip/download'])assert.equal((await request(h,'GET',endpoint+'?weekStart='+week)).status,403);});
test('FR-12 download error: invalid week rejected',async()=>{const h=createPayrollApp({identity:'worker'});assert.equal((await request(h,'GET','/api/worker/payslip/download?weekStart=bad')).status,400);});
test('FR-12 PDF function: invalid saved data rejects generation',async()=>{await assert.rejects(createPayslipPdfBuffer({}));});
test('FR-12 payroll calculations: financial year and weekly tax boundaries',()=>{assert.equal(getAustralianFinancialYearStart('2026-06-30'),'2025-07-01');assert.equal(getAustralianFinancialYearStart('2026-07-01'),'2026-07-01');assert.equal(calculateWeeklyTax(350,'2026-07-01'),0);assert.equal(calculateWeeklyTax(500,'2026-07-01'),22.5);});
