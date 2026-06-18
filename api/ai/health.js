const { getServerOpenAiKey } = require("../lib/openai");

module.exports = function handler(_req, res) {
  const hasKey = Boolean(getServerOpenAiKey());
  res.status(200).json({
    ok: true,
    openai: hasKey,
    mode: hasKey ? "server" : "demo",
  });
};
