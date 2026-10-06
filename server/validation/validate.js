/**
 * Validates part of the request against a zod schema. `source` is "body" (default), "query" or "params".
 * The body is replaced with the parsed value. Express 5 makes req.query read-only, so parsed query and
 * params are put on req.validated.query and req.validated.params instead.
 */
export default function validate(schema, source = "body") {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
    if (source === "body") req.body = parsed.data;
    else req.validated = { ...req.validated, [source]: parsed.data };
    next();
  };
}
