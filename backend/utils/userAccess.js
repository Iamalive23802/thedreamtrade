const ROLES = [
  'super_admin',
  'admin',
  'team_leader',
  'relationship_mgr',
  'financial_manager',
];

const MANAGE_USER_ROLES = ['super_admin', 'admin'];
const FULL_USER_LIST_ROLES = ['super_admin', 'admin'];
const DIRECTORY_ROLES = ['relationship_mgr', 'financial_manager'];

const canManageUsers = (role) => MANAGE_USER_ROLES.includes(role);

const userListScope = (role) => {
  if (FULL_USER_LIST_ROLES.includes(role)) return 'full';
  if (role === 'team_leader') return 'team';
  if (DIRECTORY_ROLES.includes(role)) return 'directory';
  return 'none';
};

const canAssignRole = (actorRole, nextRole) => {
  if (!ROLES.includes(nextRole)) return false;
  if (nextRole === 'super_admin' && actorRole !== 'super_admin') return false;
  return true;
};

const canModifyUser = (actorRole, existingRole) => {
  if (existingRole === 'super_admin' && actorRole !== 'super_admin') return false;
  return true;
};

module.exports = {
  ROLES,
  MANAGE_USER_ROLES,
  canManageUsers,
  userListScope,
  canAssignRole,
  canModifyUser,
};
