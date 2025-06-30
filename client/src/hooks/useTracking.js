import { useState, useEffect } from "react";
import axios from "axios";

export function useTracking() {
  const [isTracking, setTracking] = useState(false);

  useEffect(() => {
    axios.get("/api/is-tracking")
      .then(res => setTracking(res.data.isTracking))
      .catch(err => console.error("Failed to fetch tracking state", err));
  }, []);

  const toggleTracking = async () => {
    try {
      if (isTracking) await axios.post("/api/stop-tracking", { time: new Date().toISOString() });
      else await axios.post("/api/start-tracking", { time: now });
      setTracking(!isTracking);
    } catch (err) {
      console.error("Error toggling tracking:", err);
    }
  };

  return { isTracking, toggleTracking };
}
