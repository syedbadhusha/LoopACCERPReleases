import express from "express";
import {
  getStockGroupsByCompany,
  createStockGroup,
  updateStockGroup,
  deleteStockGroup,
} from "../services/stockGroupService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const companyId = req.query.companyId;
  if (!companyId)
    return res
      .status(400)
      .json({ success: false, message: "companyId is required" });
  try {
    const data = await getStockGroupsByCompany(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/stock-groups error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const inserted = await createStockGroup(req.body);
    res.json({ success: true, data: inserted });
  } catch (error) {
    console.error("POST /api/stock-groups error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await updateStockGroup(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/stock-groups/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const ok = await deleteStockGroup(req.params.id);
    res.json({ success: ok });
  } catch (error) {
    console.error("DELETE /api/stock-groups/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
