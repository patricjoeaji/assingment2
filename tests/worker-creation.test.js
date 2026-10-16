const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const UserRepository = require('../repositories/UserRepository');
const PasswordService = require('../services/PasswordService');
const WorkerCreationService = require('../services/WorkerCreationService');
const createWorkerHandler = require('../routes/createWorkerHandler');

// Compare against the original route from the branch's base commit.
const original = readFileSync(path.join(__dirname, 'fixtures/original-worker-creation.txt'), 'utf8');
const publicUserCode = original.slice(original.indexOf('function toPublicUser('), original.indexOf('async function requireOwner('));
const ownerCode = original.slice(original.indexOf('async function requireOwner('), original.indexOf("app.post('/api/workers',"));
const oldRoute = original.slice(original.indexOf("app.post('/api/workers',"), original.length);

test('WorkerCreationService owns repository and password collaborators', () => {
  const service = new WorkerCreationService();
  assert.ok(service.users instanceof UserRepository);
  assert.ok(service.passwords instanceof PasswordService);
  assert.notEqual(service.users, new WorkerCreationService().users);
});

test('FR-09 HTTP behaviour remains equivalent to the original route', async t => {
  const valid = { name: ' Sarah ', phone: ' 0400000000 ', email: ' SARAH@EXAMPLE.COM ', password: 'Worker123' };
  const scenarios = [
    { name: 'successful creation', body: valid, status: 201 },
    { name: 'missing name', body: { ...valid, name: ' ' }, status: 400 },
    { name: 'missing phone', body: { ...valid, phone: '' }, status: 400 },
    { name: 'missing email', body: { ...valid, email: '' }, status: 400 },
    { name: 'short password', body: { ...valid, password: 'short' }, status: 400 },
    { name: 'empty body', body: {}, status: 400 },
    { name: 'duplicate email', body: valid, dbError: Object.assign(new Error('duplicate'), { code: 11000 }), status: 409 },
    { name: 'database failure', body: valid, dbError: new Error('Database unavailable'), status: 400 },
    { name: 'signed out', body: valid, identity: 'none', status: 401 },
    { name: 'Worker cannot create accounts', body: valid, identity: 'worker', status: 403 },
    { name: 'inactive Owner cannot create accounts', body: valid, identity: 'inactive', status: 403 }
  ];

  const originalCreate = User.create;
  const originalFindById = User.findById;
  try {
    for (const scenario of scenarios) {
      await t.test(scenario.name, async () => {
        const results = [];
        for (const version of ['original', 'refactored']) {
          const saved = [];
          User.findById = async id => ({ _id: id, role: id === 'worker' ? 'Worker' : 'Owner', isActive: id !== 'inactive' });
          User.create = async details => {
            if (scenario.dbError) throw scenario.dbError;
            saved.push(details);
            return { _id: 'worker-id', hourlyRate: null, ...details };
          };
          const app = express();
          app.use(express.json());
          app.use((req, res, next) => {
            req.session = scenario.identity === 'none' ? {} : { userId: scenario.identity || 'owner' };
            next();
          });
          const context = vm.createContext({ app, User, bcrypt });
          vm.runInContext(publicUserCode + ownerCode, context);
          if (version === 'original') {
            vm.runInContext(oldRoute, context);
          } else {
            app.post('/api/workers', context.requireOwner,
              createWorkerHandler(new WorkerCreationService(), context.toPublicUser));
          }
          const server = app.listen(0, '127.0.0.1');
          await new Promise(resolve => server.once('listening', resolve));
          try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/workers`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scenario.body)
            });
            const payload = await response.json();
            assert.equal(response.status, scenario.status);
            if (response.status === 201) {
              assert.equal(saved.length, 1);
              assert.equal(saved[0].name, 'Sarah');
              assert.equal(saved[0].email, 'sarah@example.com');
              assert.equal(saved[0].phone, '0400000000');
              assert.equal(saved[0].role, 'Worker');
              assert.equal(saved[0].isActive, true);
              assert.notEqual(saved[0].password, valid.password);
              assert.equal(await bcrypt.compare(valid.password, saved[0].password), true);
              assert.equal(bcrypt.getRounds(saved[0].password), 10);
              assert.equal(Object.hasOwn(payload.worker, 'password'), false);
            } else {
              assert.equal(saved.length, 0);
            }
            results.push({ status: response.status, payload });
          } finally {
            await new Promise(resolve => server.close(resolve));
          }
        }
        assert.deepEqual(results[1], results[0]);
      });
    }
  } finally {
    User.create = originalCreate;
    User.findById = originalFindById;
  }
});
