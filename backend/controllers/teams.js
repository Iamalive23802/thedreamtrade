const pool = require('../db');

const getTeams = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM teams ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[❌ getTeams Error]', err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
};

const addTeam = async (req, res) => {
  const { name } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO teams (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add team' });
  }
};

const updateTeam = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Team name is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE teams SET name = $1 WHERE id = $2 RETURNING *',
      [name.trim(), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[❌ updateTeam Error]', err);
    res.status(500).json({ error: 'Failed to update team' });
  }
};

const deleteTeam = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM teams WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team' });
  }
};

module.exports = {
  getTeams,
  addTeam,
  updateTeam,
  deleteTeam
};
