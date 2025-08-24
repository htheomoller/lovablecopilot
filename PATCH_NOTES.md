Fix edge 404s by forcing absolute Supabase invoke URLs from env in src/lib/ai.ts,
adding robust JSON parsing and clear diagnostics, and exposing a "Ping Edge"
button on Chat. Added a tiny /functions/hello for independent routing tests and
ensured supabase/config.toml lists both functions with verify_jwt=false.