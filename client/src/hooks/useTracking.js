import { useState, useEffect } from "react";
import api from "../api";

export function useTracking() {
  const [isTracking, setTracking] = useState(false);

  useEffect(() => {
    api.get("/is-tracking")
      .then(res => setTracking(res.data.isTracking))
      .catch(err => console.error("Failed to fetch tracking state", err));
  }, []);

  const toggleTracking = async () => {
    try {
      if (isTracking) await api.post("/stop-tracking", { time: new Date().toISOString() });
      else await api.post("/start-tracking", { time: new Date().toISOString()});
      setTracking(!isTracking);
    } catch (err) {
      console.error("Error toggling tracking:", err);
    }
  };

  return { isTracking, toggleTracking };
}
