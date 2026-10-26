const express = require('express');
const router = express.Router();
const { authorizeRoles } = require('../middleware/auth');

const { getTeams, addTeam, updateTeam, deleteTeam } = require('../controllers/teams');

const manageTeams = authorizeRoles(['super_admin', 'admin']);

router.get('/', getTeams);
router.post('/', manageTeams, addTeam);
router.put('/:id', manageTeams, updateTeam);
router.delete('/:id', manageTeams, deleteTeam);

module.exports = router;
