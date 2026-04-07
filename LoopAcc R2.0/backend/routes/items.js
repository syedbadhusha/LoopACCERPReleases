import express from "express";
import {
  getItemsByCompany,
  createItem,
  updateItem,
  deleteItem,
} from "../services/itemService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const companyId = req.query.companyId;
  if (!companyId)
    return res
      .status(400)
      .json({ success: false, message: "companyId is required" });
  try {
    const items = await getItemsByCompany(companyId);
    res.json({ success: true, data: items });
  } catch (error) {
    console.error("GET /api/items error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const doc = req.body;
    const inserted = await createItem(doc);
    res.json({ success: true, data: inserted });
  } catch (error) {
    console.error("POST /api/items error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updated = await updateItem(id, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/items/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const ok = await deleteItem(id);
    res.json({ success: ok });
  } catch (error) {
    console.error("DELETE /api/items/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
