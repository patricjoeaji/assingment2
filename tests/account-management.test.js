const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const express=require('express'),bcrypt=require('bcryptjs');
const User=require('../models/User');
const AccountManagementService=require('../services/AccountManagementService');
const UserRepository=require('../repositories/UserRepository');
const PasswordService=require('../services/PasswordService');
const {createProfileHandler,createPasswordHandler}=require('../routes/accountManagementHandlers');
const original=fs.readFileSync(path.join(__dirname,'fixtures/original-account-management.txt'),'utf8');
const creation=fs.readFileSync(path.join(__dirname,'fixtures/original-worker-creation.txt'),'utf8');
const publicCode=creation.slice(creation.indexOf('function toPublicUser('),creation.indexOf('async function requireOwner('));

test('Account service composes independent repository and password objects',()=>{
 const service=new AccountManagementService();assert.ok(service.users instanceof UserRepository);assert.ok(service.passwords instanceof PasswordService);assert.notEqual(service.users,new AccountManagementService().users);
});
test('FR-11 profile and password HTTP behaviour matches baseline',async t=>{
 const profile={name:' New Name ',phone:' 0400000000 ',email:' NEW@EXAMPLE.COM '};const password={currentPassword:'Worker123',newPassword:'Changed123'};
 const cases=[
 {name:'profile update',route:'profile',body:profile,status:200},
 {name:'optional phone',route:'profile',body:{...profile,phone:''},status:200},
 {name:'missing name',route:'profile',body:{...profile,name:''},status:400},
 {name:'missing email',route:'profile',body:{...profile,email:''},status:400},
 {name:'duplicate email',route:'profile',body:profile,duplicate:true,status:409},
 {name:'missing account profile',route:'profile',body:profile,missing:true,status:404},
 {name:'password change',route:'password',body:password,status:200},
 {name:'wrong current password',route:'password',body:{...password,currentPassword:'wrong'},status:401},
 {name:'short new password',route:'password',body:{...password,newPassword:'short'},status:400},
 {name:'missing current password',route:'password',body:{...password,currentPassword:''},status:400},
 {name:'missing account password',route:'password',body:password,missing:true,status:404},
 {name:'signed out profile',route:'profile',body:profile,identity:'none',status:401},
 {name:'signed out password',route:'password',body:password,identity:'none',status:401},
 {name:'other account profile',route:'profile',body:profile,identity:'other',status:403},
 {name:'other account password',route:'password',body:password,identity:'other',status:403},
 {name:'profile save error',route:'profile',body:profile,saveError:true,status:400},
 {name:'password save error',route:'password',body:password,saveError:true,status:400}
 ];const oldFind=User.findById;const hash=await bcrypt.hash('Worker123',10);
 try{for(const c of cases)await t.test(c.name,async()=>{
  const results=[];
  for(const version of ['original','refactored']){
   let saves=0,reads=0;const account={_id:'target',name:'Old Name',email:'old@example.com',phone:'',password:hash,role:'Worker',isActive:true,save:async()=>{if(c.duplicate)throw Object.assign(new Error('duplicate'),{code:11000});if(c.saveError)throw new Error('Save failed');saves++;}};
   User.findById=async()=>{reads++;return c.missing?null:account;};
   const app=express();app.use(express.json());app.use((req,res,next)=>{req.session=c.identity==='none'?{}:{userId:c.identity||'target'};next();});
   const context=vm.createContext({app,User,bcrypt});vm.runInContext(publicCode + original.slice(0, original.indexOf("app.put(")),context);
   if(version==='original')vm.runInContext(original,context);
   else{const service=new AccountManagementService();app.put('/api/users/:id/profile',context.requireSelf,createProfileHandler(service,context.toPublicUser));app.put('/api/users/:id/password',context.requireSelf,createPasswordHandler(service));}
   const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
   try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/users/target/${c.route}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(c.body)});const payload=await response.json();assert.equal(response.status,c.status);
    if(c.status===200){assert.equal(saves,1);if(c.route==='profile'){assert.equal(payload.user.name,'New Name');assert.equal(payload.user.email,'new@example.com');assert.equal(Object.hasOwn(payload.user,'password'),false);}else{assert.equal(await bcrypt.compare('Changed123',account.password),true);assert.equal(await bcrypt.compare('Worker123',account.password),false);assert.equal(bcrypt.getRounds(account.password),10);}}
    else assert.equal(saves,0);if([401,403].includes(c.status)&&c.identity)assert.equal(reads,0);
    results.push({status:response.status,payload,saves,reads});
   }finally{await new Promise(r=>server.close(r));}
  }assert.deepEqual(results[1],results[0]);
 });}finally{User.findById=oldFind;}
});
