import express from "express";
import {
  getUomsByCompany,
  createUom,
  updateUom,
  deleteUom,
} from "../services/uomService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const companyId = req.query.companyId;
  if (!companyId)
    return res
      .status(400)
      .json({ success: false, message: "companyId is required" });
  try {
    const data = await getUomsByCompany(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/uom error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const doc = req.body;
    const inserted = await createUom(doc);
    res.json({ success: true, data: inserted });
  } catch (error) {
    console.error("POST /api/uom error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updated = await updateUom(id, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/uom/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const ok = await deleteUom(id);
    res.json({ success: ok });
  } catch (error) {
    console.error("DELETE /api/uom/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
