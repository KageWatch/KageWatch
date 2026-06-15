export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const {
      anime,
      episode,
      provider,
      reason,
      note
    } = req.body;

    const message = `
🚨 New Report

🎬 Anime: ${anime}
📺 Episode: ${episode}
🌐 Provider: ${provider}

⚠️ Issue: ${reason}

📝 Notes:
${note || "No details provided"}
`;

    await fetch(
      process.env.DISCORD_WEBHOOK_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: message
        })
      }
    );

    return res.status(200).json({
      success: true
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error: "Failed to send report"
    });

  }
}
