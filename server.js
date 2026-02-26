import express from "express";
import axios from "axios";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json({ verify: rawBodySaver }));

const PORT = process.env.PORT || 3000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

let appAccessToken = null;

/* -----------------------------
   RAW BODY CAPTURE
------------------------------ */
function rawBodySaver(req, res, buf) {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
}

/* -----------------------------
   VERIFY SHOPIFY WEBHOOK
------------------------------ */
function verifyShopifyWebhook(req) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  const generated = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(generated),
    Buffer.from(hmac)
  );
}

/* -----------------------------
   QUEUE SYSTEM
------------------------------ */

const channelQueues = {};

function ensureChannelQueue(channel) {
  if (!channelQueues[channel]) {
    channelQueues[channel] = {
      active: false,
      queue: []
    };
  }
}

function startNextGift(channel) {
  const channelData = channelQueues[channel];

  if (!channelData || channelData.active) return;
  if (channelData.queue.length === 0) return;

  const giftEvent = channelData.queue.shift();
  channelData.active = true;

  console.log(`🎁 Starting giveaway for ${channel}`);
  console.log(`Variant ID: ${giftEvent.variantId}`);

  // Simulate 10 second giveaway timer for now
  setTimeout(() => {
    console.log(`✅ Giveaway finished for ${channel}`);
    channelData.active = false;

    // Immediately fire next gift
    startNextGift(channel);

  }, 10000);
}

/* -----------------------------
   WEBHOOK HANDLER
------------------------------ */

app.post("/webhook/order-paid", (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      console.log("❌ Invalid Shopify webhook signature");
      return res.status(401).send("Invalid signature");
    }

    const order = req.body;

    const discountCode =
      order.discount_codes?.length > 0
        ? order.discount_codes[0].code.toLowerCase()
        : null;

    if (!discountCode) {
      console.log("⚠️ No discount code used");
      return res.status(200).send("OK");
    }

    const channel = discountCode; // channel name matches code
    ensureChannelQueue(channel);

    order.line_items.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {

        channelQueues[channel].queue.push({
          variantId: item.variant_id,
          productTitle: item.title
        });

        console.log(`Queued gift for ${channel} - ${item.title}`);
      }
    });

    startNextGift(channel);

    res.status(200).send("OK");

  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Server error");
  }
});

/* -----------------------------
   LIVE STATUS ENDPOINT
------------------------------ */

app.get("/api/live-status", async (req, res) => {
  try {
    const username = req.query.twitch;
    if (!username) return res.json({ live: false });

    if (!appAccessToken) {
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

    res.json({ live: response.data.data.length > 0 });

  } catch (error) {
    console.error(error);
    res.status(500).json({ live: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
