const { authorizeRoles } = require('../middleware/auth');

const INBOX_ROLES = ['super_admin'];
const canAccessInbox = (user) => INBOX_ROLES.includes(user?.role);
const inboxAuthorize = authorizeRoles(INBOX_ROLES);

module.exports = { INBOX_ROLES, canAccessInbox, inboxAuthorize };
