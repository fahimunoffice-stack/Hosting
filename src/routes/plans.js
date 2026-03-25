import { Router } from "express";
const router = Router();

const PLANS = {
  shared: [
    { id: "starter", name: "Starter", price: 3.99, websites: 1, storage: "10GB SSD", ssl: true, backups: false, badge: null },
    { id: "business", name: "Business", price: 7.99, websites: 5, storage: "50GB SSD", ssl: true, backups: true, badge: "Most Popular" },
    { id: "pro", name: "Pro", price: 14.99, websites: -1, storage: "200GB SSD", ssl: true, backups: true, staging: true, badge: "Best Value" },
  ],
  vps: [
    { id: "vps-basic", name: "VPS Basic", price: 19.99, cpu: 2, ram: 4, disk: "80GB SSD", bandwidth: "2TB", badge: null },
    { id: "vps-pro", name: "VPS Pro", price: 39.99, cpu: 4, ram: 8, disk: "200GB SSD", bandwidth: "4TB", badge: "Most Popular" },
    { id: "vps-elite", name: "VPS Elite", price: 79.99, cpu: 8, ram: 16, disk: "400GB SSD", bandwidth: "8TB", badge: "High Performance" },
  ],
};

router.get("/", (req, res) => res.json({ success: true, plans: PLANS }));
router.get("/shared", (req, res) => res.json({ success: true, plans: PLANS.shared }));
router.get("/vps", (req, res) => res.json({ success: true, plans: PLANS.vps }));
router.get("/:id", (req, res) => {
  const plan = [...PLANS.shared, ...PLANS.vps].find(p => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json({ success: true, plan });
});

export default router;
