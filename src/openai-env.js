const fs = require("fs");
const path = require("path");

const ENV_PATH = path.resolve(process.cwd(), ".env");

function supplementOpenAiEnvFromFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }
  let raw = fs.readFileSync(ENV_PATH, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("export ")) {
      line = line.slice(7).trim();
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === "OPENAI_API_KEY" && val) {
      process.env.OPENAI_API_KEY = val;
    }
    if (key === "OPENAI_KEY" && val && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = val;
    }
    if (key === "OPENAI_MODEL" && val) {
      process.env.OPENAI_MODEL = val;
    }
  }
}

function loadOpenAiEnv() {
  require("dotenv").config({ path: ENV_PATH });
  supplementOpenAiEnvFromFile();
}

function getOpenAiApiKey() {
  return (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "").trim();
}

module.exports = {
  ENV_PATH,
  loadOpenAiEnv,
  getOpenAiApiKey,
};
