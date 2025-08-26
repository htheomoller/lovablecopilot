# M3 — Final normalization for { response: ... } shapes

**Why:** Your latest samples were JSON objects with a response field containing either a string or { text: "..." }. Our extractor didn't treat response as first-class, so the whole wrapper leaked through.

**What changed:**
- extractHumanTextLike() now prioritizes response and uses extractFromResponseValue() to unwrap strings, {text|message|content|output_text|value}, or arrays (parts|outputs|items).
- Keeps: envelope passthrough, JSON-string unwrap, arrays/objects flattening, fence stripping.
- Version header: X-CP-Version: m3.15-response-key.

**Test plan:**
1. Hard refresh /chat.
2. Ping → header shows m3.15-response-key.
3. "How are you doing today?" → Should render a clean sentence, not a JSON object.
4. "I would like some help coding a to do list" → Should render a clean clarifying question (no {session_id,...,"response":{...}}).

If any new wrapper shape appears, paste a sample and we'll extend the extractor keys—though with response handled, this should close the loop.