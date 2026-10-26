const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  canManageUsers,
  userListScope,
  canAssignRole,
  canModifyUser,
} = require('../utils/userAccess');
const { verifyMetaSignature } = require('../utils/metaSignature');

describe('user management authorization', () => {
  it('lets only admin and super_admin manage users', () => {
    assert.equal(canManageUsers('super_admin'), true);
    assert.equal(canManageUsers('admin'), true);
    assert.equal(canManageUsers('team_leader'), false);
    assert.equal(canManageUsers('relationship_mgr'), false);
    assert.equal(canManageUsers('financial_manager'), false);
  });

  it('scopes the user list and keeps a directory for lead assignment', () => {
    assert.equal(userListScope('super_admin'), 'full');
    assert.equal(userListScope('admin'), 'full');
    assert.equal(userListScope('team_leader'), 'team');
    assert.equal(userListScope('relationship_mgr'), 'directory');
    assert.equal(userListScope('financial_manager'), 'directory');
    assert.equal(userListScope('guest'), 'none');
  });

  it('blocks everyone except super_admin from granting super_admin', () => {
    assert.equal(canAssignRole('admin', 'super_admin'), false);
    assert.equal(canAssignRole('super_admin', 'super_admin'), true);
    assert.equal(canAssignRole('admin', 'relationship_mgr'), true);
    assert.equal(canAssignRole('admin', 'not_a_role'), false);
  });

  it('blocks admins from editing an existing super_admin', () => {
    assert.equal(canModifyUser('admin', 'super_admin'), false);
    assert.equal(canModifyUser('super_admin', 'super_admin'), true);
    assert.equal(canModifyUser('admin', 'relationship_mgr'), true);
  });
});

describe('webhook signature verification', () => {
  const secret = 'test-secret';
  const rawBody = Buffer.from('{"object":"page"}');

  const signedReq = (signature) => ({
    headers: { 'x-hub-signature-256': signature },
    rawBody,
  });

  it('fails closed when the app secret is missing', () => {
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    assert.equal(verifyMetaSignature(signedReq(`sha256=${digest}`), ''), false);
    assert.equal(verifyMetaSignature(signedReq(`sha256=${digest}`), undefined), false);
  });

  it('accepts a matching signature and rejects a forged one', () => {
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    assert.equal(verifyMetaSignature(signedReq(`sha256=${digest}`), secret), true);
    assert.equal(verifyMetaSignature(signedReq('sha256=deadbeef'), secret), false);
    assert.equal(verifyMetaSignature({ headers: {}, rawBody }, secret), false);
  });
});
