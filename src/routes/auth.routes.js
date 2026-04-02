// =============================================================
// FILE: src/middleware/handleErrors.js
// PURPOSE: Factory function to create consistent HTTP errors.
//          Usage: return next(handleErrors(404, "Not found"))
//          The global error handler in server.js catches these.
// =============================================================

const handleErrors = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.status = statusCode;
  return error;
};

export default handleErrors;