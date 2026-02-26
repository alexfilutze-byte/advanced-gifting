import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

let appAccessToken = null;

// Get Twitch App Access Token
async function getAppAccessToken() {
  const response = await axios.post(
    "https://id.twitch.tv/oauth2/token",
    null,
    {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials"
      }
    }
  );

  appAccessToken = response.data.access_token;
  console.log("Twitch App Token Retrieved");
}

// Check if streamer is live
async function isStreamerLive(username) {
  if (!appAccessToken) {
    await getAppAccessToken();
  }

  const response = await axios.get(
    `https://api.twitch.tv/helix/streams?user_login=${username}`,
    {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${appAccessToken}`
      }
    }
  );

  return response.data.data.length > 0;
}

// API endpoint
app.get("/api/live-status", async (req, res) => {
  try {
    const username = req.query.twitch;

    if (!username) {
      return res.json({ live: false });
    }

    const live = await isStreamerLive(username);

    res.json({ live });
  } catch (error) {
    console.error(error);
    res.status(500).json({ live: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
