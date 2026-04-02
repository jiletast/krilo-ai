import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Stripe Checkout Session
  app.post("/api/create-checkout-session", async (req, res) => {
    const { priceId, userId, email } = req.body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Stripe Secret Key is not configured in Secrets." });
    }

    if (!priceId || typeof priceId !== 'string' || !priceId.startsWith('price_')) {
      return res.status(400).json({ 
        error: "Invalid Stripe Price ID. Please ensure you are using the 'Price ID' (starts with 'price_') from your Stripe Dashboard, not the numerical price." 
      });
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${appUrl}/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/`,
        client_reference_id: userId,
        customer_email: email,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Verify Stripe Session
  app.get("/api/verify-session", async (req, res) => {
    const { session_id } = req.query;

    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({ error: "Missing session_id" });
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      
      // In a real app, you'd check if this session was already processed
      // and update the database from the server.
      // For this demo, we'll return the session info so the client can update.
      res.json({
        status: session.status,
        payment_status: session.payment_status,
        client_reference_id: session.client_reference_id,
        amount_total: session.amount_total,
        // Map amount to credits (e.g., $1 = 100 credits)
        credits_to_add: (session.amount_total || 0) / 100 * 10 
      });
    } catch (error: any) {
      console.error("Stripe Verification Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
