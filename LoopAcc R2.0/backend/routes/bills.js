import express from "express";
import { getDb } from "../db.js";
import {
  createStandaloneBill,
  updateStandaloneBill,
  deleteStandaloneBill,
  getStandaloneBillsForLedger,
  getOutstandingStandaloneBills,
} from "../services/billService.js";

const router = express.Router();

// POST /api/bills - Create a new standalone bill
router.post("/", async (req, res) => {
  try {
    const billData = req.body;
    const hasMovementInput =
      billData.opening !== undefined ||
      billData.credit !== undefined ||
      billData.debit !== undefined ||
      billData.amount !== undefined;

    if (!billData.company_id || !billData.ledger_id || !hasMovementInput) {
      return res.status(400).json({
        success: false,
        message:
          "company_id, ledger_id, and at least one of opening/credit/debit are required",
      });
    }

    const bill = await createStandaloneBill(billData);
    res.json({ success: true, data: bill });
  } catch (error) {
    console.error("Create bill error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT /api/bills/:id - Update a standalone or ledger-opening bill
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId, ...billData } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const bill = await updateStandaloneBill(id, companyId, billData);
    res.json({ success: true, data: bill });
  } catch (error) {
    console.error("Update bill error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE /api/bills/:id - Delete a standalone bill
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    await deleteStandaloneBill(id, companyId);
    res.json({ success: true, message: "Bill deleted successfully" });
  } catch (error) {
    console.error("Delete bill error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/bills - Get all bills (optionally filtered by companyId and source)
router.get("/", async (req, res) => {
  try {
    const { companyId, source } = req.query;
    const db = getDb ? getDb() : null;

    if (!db) {
      return res.status(500).json({
        success: false,
        message: "Database connection unavailable",
      });
    }

    let filter = {};
    if (companyId) filter.company_id = companyId;
    if (source) filter.source = source;

    const bills = await db
      .collection("bills")
      .find(filter)
      .project({
        invoice_voucher_id: 0,
        invoice_voucher_number: 0,
        payment_voucher_id: 0,
        payment_voucher_number: 0,
      })
      .toArray();
    res.json({ success: true, data: bills });
  } catch (error) {
    console.error("Get bills error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/bills/ledger/:ledgerId - Get all bills for a ledger
router.get("/ledger/:ledgerId", async (req, res) => {
  try {
    const { ledgerId } = req.params;
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const bills = await getStandaloneBillsForLedger(ledgerId, companyId);
    res.json({ success: true, data: bills });
  } catch (error) {
    console.error("Get ledger bills error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/bills/has-bills?companyId=X - Check if any real bills exist for company
router.get("/has-bills", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "companyId is required" });
    }
    const db = getDb ? getDb() : null;
    if (!db) return res.status(500).json({ success: false, message: "Database unavailable" });
    // Exclude system-generated "ON ACCOUNTS" entries — only count real user-created bills
    const count = await db.collection("bills").countDocuments({
      company_id: companyId,
      bill_type: { $nin: ["ON ACCOUNTS", "on accounts", "on account"] }
    });
    res.json({ success: true, hasBills: count > 0, count });
  } catch (error) {
    console.error("has-bills check error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/bills/outstanding - Get all outstanding bills (receivable and payable)
router.get("/outstanding", async (req, res) => {
  try {
    const { companyId, type } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const bills = await getOutstandingStandaloneBills(companyId, type || "all");
    res.json({ success: true, data: bills });
  } catch (error) {
    console.error("Get outstanding bills error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
