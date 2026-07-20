import { countTokens, bytesToTokens, TOKEN_ENCODING } from "../scripts/lib/tokens.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const hello = countTokens("hello world");
assert(hello > 0 && hello < 10, `hello tokens: ${hello}`);

const json = JSON.stringify({ name: "search_code", type: "object" });
assert(countTokens(json) > 0, "json tokens");

assert(bytesToTokens(0) === 0, "zero bytes");
assert(bytesToTokens(100) === 25, "bytes fallback");

assert(TOKEN_ENCODING === "estimate", "encoding");
assert(countTokens("abcd") === 1, "estimate length/4");
assert(countTokens("abcdefgh") === 2, "estimate length/4 round-up");

console.log("[tokens-test] ok");
