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

// 🔐 Save raw body for HMAC verification
function rawBodySaver(req, res, buf) {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
}

// 🔐 Verify Shopify Webhook
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

// 🔴 WEBHOOK HANDLER
app.post("/webhook/order-paid", (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      console.log("❌ Invalid Shopify webhook signature");
      return res.status(401).send("Invalid signature");
    }

    const order = req.body;

    console.log("🟢 Order Received:");
    console.log("Order ID:", order.id);

    const discountCode =
      order.discount_codes?.length > 0
        ? order.discount_codes[0].code
        : null;

    console.log("Discount Code:", discountCode);

    order.line_items.forEach(item => {
      console.log("Product:", item.title);
      console.log("Variant ID:", item.variant_id);
      console.log("Quantity:", item.quantity);
    });

    res.status(200).send("OK");

  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Server error");
  }
});

// 🟢 LIVE STATUS ENDPOINT (existing)
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
