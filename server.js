// Node loads production environment variables before importing the application.
// The request limit includes the file and multipart fields.
process.env.BODY_SIZE_LIMIT ??= '50M';
await import('./build/index.js');
