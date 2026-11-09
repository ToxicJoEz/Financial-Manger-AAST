// This catches requests that hit URLs that don't exist
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error); // Passes it down to the global error handler below
};

// The Global Error Handler
export const errorHandler = (err, req, res, next) => {
  // If the status is 200 but there's an error, force it to 500 (Server Error)
  let statusCode = err.status || err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) statusCode = 500;
  let message = err.message;

  // One error shape across the API: { error }.
  res.status(statusCode).json({
    error: message,
    // Only show the detailed stack trace if we are in development mode!
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: err.stack })
  });
};
