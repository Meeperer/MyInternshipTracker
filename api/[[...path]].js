/**
 * Vercel serverless catch-all: forwards /api/* to the Express app.
 * Uses dynamic import so the ESM Express app and CJS serverless-http load correctly.
 */
export const config = { maxDuration: 30 };

let handler;

export default async function (req, res) {
  if (!handler) {
    const serverlessHttp = (await import('serverless-http')).default;
    const { default: app } = await import('../server/app.js');
    handler = serverlessHttp(app);
  }
  return handler(req, res);
}
