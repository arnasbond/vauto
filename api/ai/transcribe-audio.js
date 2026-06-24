module.exports = async function handler(_req, res) {
  return res.status(501).json({
    error:
      "Whisper transkripcija pašalinta. Naudokite naršyklės balso atpažinimą (Web Speech API).",
  });
};
