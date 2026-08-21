const express = require('express');
const router = express.Router();
const { loginUser, checkNetworkAccess } = require('../controllers/auth');

console.log('Setting up auth routes');
router.get('/network-check', checkNetworkAccess);
router.post('/login', loginUser); 
console.log('Login route registered');

module.exports = router;
