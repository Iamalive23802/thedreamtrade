// ✅ routes/teams.js (fixed)
const express = require('express');
const router = express.Router();

const { getTeams, addTeam, updateTeam, deleteTeam } = require('../controllers/teams');

router.get('/', getTeams);
router.post('/', addTeam);
router.put('/:id', updateTeam);
router.delete('/:id', deleteTeam);

module.exports = router;
