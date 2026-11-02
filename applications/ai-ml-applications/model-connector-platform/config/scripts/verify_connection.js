const http = require("node:http");

const payload = JSON.stringify({
  modelId: "gemini-3.8-flash",
  authType: "cli_oauth",
  credentialValue: "ya29.live_test_cli_token",
  prompt: "Hi , whats date time now ?"
});

const req = http.request("http://localhost:8095/api/v1/models/config/test-connection", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  }
}, (res) => {
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data);
    }
  });
});

req.on("error", (err) => {
  console.error("Request Error:", err);
});

req.write(payload);
req.end();
