import app from './app.js';

const PORT = process.env.PORT || 3001;

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Another server is probably running.`);
    console.error('To free it on Windows, run in a new terminal:');
    console.error(`  for /f "tokens=5" %a in ('netstat -ano ^| findstr :${PORT}') do taskkill /F /PID %a`);
    console.error('Or close the other terminal where the server is running, then try again.\n');
    process.exit(1);
  }
  throw err;
});
