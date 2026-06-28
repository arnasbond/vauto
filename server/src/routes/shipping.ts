import { Router } from "express";
import {
  estimateNationalShippingRoute,
  searchParcelLockers,
  type ShippingProviderId,
} from "../shipping/shipping-routing.js";

export const shippingRouter = Router();

shippingRouter.get("/lockers", (req, res) => {
  try {
    const providerId = String(req.query.provider ?? "omniva") as ShippingProviderId;
    const city = req.query.city ? String(req.query.city) : undefined;
    const query = req.query.q ? String(req.query.q) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 80;

    const lockers = searchParcelLockers({
      providerId,
      city,
      query,
      limit: Number.isFinite(limit) ? limit : 80,
    });

    res.json({ ok: true, lockers, coverage: "Visa Lietuva" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

shippingRouter.post("/route-estimate", (req, res) => {
  try {
    const origin = String((req.body as { origin?: string })?.origin ?? "").trim();
    const destination = String(
      (req.body as { destination?: string })?.destination ?? ""
    ).trim();
    const providerId = (req.body as { providerId?: ShippingProviderId })
      ?.providerId;

    if (!origin || !destination) {
      return res.status(400).json({ error: "origin and destination are required" });
    }

    const estimate = estimateNationalShippingRoute(
      origin,
      destination,
      providerId
    );

    if (!estimate) {
      return res.status(404).json({
        error: "Nepavyko nustatyti maršruto — patikrinkite miestų pavadinimus",
      });
    }

    res.json({ ok: true, estimate });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
