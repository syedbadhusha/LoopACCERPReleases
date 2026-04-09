import express from "express";
import { getDb } from "../db.js";
import {
  getBatchAllocationsByItem,
  createBatchAllocation,
  updateBatchAllocation,
  deleteBatchAllocation,
} from "../services/batchAllocationService.js";

const router = express.Router();

/**
 * GET /has-batches?companyId=X - Check if any batch allocations exist for company
 */
router.get("/has-batches", async (req, res) => {
  const { companyId } = req.query;
  if (!companyId) {
    return res.status(400).json({ success: false, message: "companyId is required" });
  }
  try {
    const db = getDb();
    // Exclude the system "PRIMARY" placeholder batch — only count real user-created batches
    const count = await db.collection("batch_allocation").countDocuments({
      company_id: companyId,
      batch_number: { $not: /^primary$/i }
    });
    res.json({ success: true, hasBatches: count > 0, count });
  } catch (error) {
    console.error("has-batches check error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET batch allocations for an item
 * Query params: itemId, companyId
 */
router.get("/", async (req, res) => {
  const { itemId, companyId } = req.query;
  if (!itemId || !companyId) {
    return res.status(400).json({
      success: false,
      message: "itemId and companyId are required",
    });
  }
  try {
    const batches = await getBatchAllocationsByItem(itemId, companyId);
    res.json({ success: true, data: batches });
  } catch (error) {
    console.error("GET /api/batch-allocations error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST create batch allocation
 * Body: { itemId, companyId, batch_number, opening_qty, opening_rate, opening_value }
 */
router.post("/", async (req, res) => {
  try {
    const { itemId, companyId, ...batch } = req.body;
    if (!itemId || !companyId) {
      return res.status(400).json({
        success: false,
        message: "itemId and companyId are required",
      });
    }
    const created = await createBatchAllocation(batch, itemId, companyId);
    res.json({ success: true, data: created });
  } catch (error) {
    console.error("POST /api/batch-allocations error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT update batch allocation
 * Params: id (batch allocation id)
 * Body: { batch_number, opening_qty, opening_rate, opening_value }
 */
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const update = req.body;
    const updated = await updateBatchAllocation(id, update);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/batch-allocations/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE batch allocation
 * Params: id (batch allocation id)
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const ok = await deleteBatchAllocation(id);
    res.json({ success: ok });
  } catch (error) {
    console.error("DELETE /api/batch-allocations/:id error:", error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
