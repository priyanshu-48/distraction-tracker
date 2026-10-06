import logger from "../logger.js";

export function notFound(req, res) {
  res.status(404).json({ error: "Not found", message: `${req.method} ${req.path} does not exist` });
}

// Last middleware. Express 5 forwards rejected promises from async handlers here, so
// handlers can just throw. Clients get a stable shape and never see internals.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status ?? err.statusCode;
  if (status >= 400 && status < 500) {
    const message =
      err.type === "entity.parse.failed" ? "Request body is not valid JSON"
      : err.type === "entity.too.large" ? "Request body is too large"
      : "Bad request";
    return res.status(status).json({ error: status === 413 ? "Payload too large" : "Bad request", message });
  }

  (req.log ?? logger).error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error", message: "Something went wrong", requestId: req.id });
}
