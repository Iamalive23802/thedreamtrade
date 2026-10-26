const express = require('express');
const router = express.Router();
const { authorizeRoles } = require('../middleware/auth');
const { MANAGE_USER_ROLES } = require('../utils/userAccess');

const {
  getAllUsers,
  addUser,
  updateUser,
  deleteUser,
  bulkInactivateUsers
} = require('../controllers/users');

const manageUsers = authorizeRoles(MANAGE_USER_ROLES);

router.get('/', getAllUsers);
router.post('/', manageUsers, addUser);
router.put('/bulk-inactivate', manageUsers, bulkInactivateUsers);
router.put('/:id', manageUsers, updateUser);
router.delete('/:id', manageUsers, deleteUser);

module.exports = router;
