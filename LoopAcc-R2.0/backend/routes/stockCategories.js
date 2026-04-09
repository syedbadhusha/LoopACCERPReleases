import express from "express";
import {
  getStockCategoriesByCompany,
  createStockCategory,
  updateStockCategory,
  deleteStockCategory,
} from "../services/stockCategoryService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const companyId = req.query.companyId;
  if (!companyId)
    return res
      .status(400)
      .json({ success: false, message: "companyId is required" });
  try {
    const data = await getStockCategoriesByCompany(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/stock-categories error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const inserted = await createStockCategory(req.body);
    res.json({ success: true, data: inserted });
  } catch (error) {
    console.error("POST /api/stock-categories error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await updateStockCategory(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/stock-categories/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const ok = await deleteStockCategory(req.params.id);
    res.json({ success: ok });
  } catch (error) {
    console.error("DELETE /api/stock-categories/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
