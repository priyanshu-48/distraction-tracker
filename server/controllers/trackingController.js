let isTracking = false;

export async function startTracking(req, res) {
  try {
    isTracking = true;
    console.log('Tracking started');
    res.json({ success: true });
  } catch (err) {
    res.status(500).send("Failed to start tracking");
  }
};

export async function stopTracking(req, res) {
  try {
    isTracking = false;
    console.log('Tracking stopped');
    res.json({ success: true });
  } catch (err) {
    res.status(500).send("Failed to start tracking");
  }
};

export async function is_Tracking(req, res) {
  res.json({ isTracking });
};
