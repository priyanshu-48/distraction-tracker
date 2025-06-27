import { authenticate } from '../middleware/auth.js';

router.get('/api/userdata', authenticate, async (req, res) => {
  const userId = req.user.id;

  const result = await db.query('SELECT * FROM tab_activity WHERE user_id = $1', [userId]);

  res.json(result.rows);
});
