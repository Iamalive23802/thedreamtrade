const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  addUser,
  updateUser,
  deleteUser,
  bulkInactivateUsers
} = require('../controllers/users');


router.get('/', getAllUsers);             
router.post('/', addUser);                
router.put('/bulk-inactivate', bulkInactivateUsers);  
router.put('/:id', updateUser);           
router.delete('/:id', deleteUser);     
module.exports = router;
