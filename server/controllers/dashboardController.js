export function dashboardController(req, res) {
  res.json({
    message: `Welcome, ${req.user.email}!`,
    user: req.user
  });
}

