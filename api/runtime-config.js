// Vercel Node Function: exposes only the browser-safe Supabase connection data.
// Never add SUPABASE_SERVICE_ROLE_KEY to this response.
module.exports = (request, response) => {
  const url = process.env.EVENTHUB_SUPABASE_URL;
  const key = process.env.EVENTHUB_SUPABASE_PUBLISHABLE_KEY;

  response.setHeader("Cache-Control", "no-store, max-age=0");
  if (!url || !key) {
    return response.status(503).json({ error: "Supabase runtime configuration is unavailable." });
  }

  return response.status(200).json({ url, key });
};
