import express from "express";
import {
  createVoucherWithDetails,
  updateVoucherWithDetails,
  getVouchersByCompany,
  getVoucherById,
  deleteVoucher,
  getVoucherHistory,
  getSalesRegister,
  getPurchaseRegister,
  getStockSummary,
  getOutstandingReceivables,
  getOutstandingPayables,
} from "../services/voucherService.js";
import { getDb } from "../db.js";

const router = express.Router();

// GET /api/vouchers/report/held-pos?companyId=...
// Returns all POS vouchers with optional=true (held/on-hold bills)
router.get("/report/held-pos", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "companyId required" });
    }
    const db = getDb();
    const data = await db.collection("vouchers").find({
      company_id: String(companyId),
      is_pos: true,
      optional: true,
    }).sort({ created_at: -1 }).toArray();
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/held-pos error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/history?companyId=...&dateFrom=...&dateTo=...&voucherType=...
// MUST be before /:id route to prevent /:id catching "report"
router.get("/report/history", async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo, voucherType } = req.query;
    if (!companyId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, dateFrom, and dateTo required",
      });
    }
    const data = await getVoucherHistory(
      companyId,
      dateFrom,
      dateTo,
      voucherType,
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/history error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId)
      return res
        .status(400)
        .json({ success: false, message: "companyId required" });
    const voucherType = req.query.voucherType;
    const ledgerId = req.query.ledgerId;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;

    console.log("[VOUCHERS ROUTE] GET / called with:", {
      companyId,
      voucherType,
      ledgerId,
      dateFrom,
      dateTo,
    });

    const data = await getVouchersByCompany(
      String(companyId),
      voucherType,
      ledgerId,
      dateFrom,
      dateTo,
    );

    console.log("[VOUCHERS ROUTE] Returning", data.length, "vouchers");
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/has-pos-vouchers?companyId=X&voucherTypeId=Y
// Check if any vouchers exist for a specific POS voucher type
router.get("/has-pos-vouchers", async (req, res) => {
  try {
    const { companyId, voucherTypeId } = req.query;
    if (!companyId || !voucherTypeId) {
      return res.status(400).json({ success: false, message: "companyId and voucherTypeId required" });
    }
    const db = getDb();
    const count = await db.collection("vouchers").countDocuments({
      company_id: String(companyId),
      voucher_type_id: String(voucherTypeId),
    });
    res.json({ success: true, hasVouchers: count > 0, count });
  } catch (error) {
    console.error("has-pos-vouchers check error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getVoucherById(id);
    if (!data)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/:id error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = req.body;
    const created = await createVoucherWithDetails(payload);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("POST /api/vouchers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await updateVoucherWithDetails(id, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/vouchers/:id error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await deleteVoucher(id);
    res.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/vouchers/:id error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/sales-register?companyId=...&dateFrom=...&dateTo=...
router.get("/report/sales-register", async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo } = req.query;
    if (!companyId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, dateFrom, and dateTo required",
      });
    }
    const data = await getSalesRegister(companyId, dateFrom, dateTo);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/sales-register error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/purchase-register?companyId=...&dateFrom=...&dateTo=...
router.get("/report/purchase-register", async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo } = req.query;
    if (!companyId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, dateFrom, and dateTo required",
      });
    }
    const data = await getPurchaseRegister(companyId, dateFrom, dateTo);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/purchase-register error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/stock-summary?companyId=...
router.get("/report/stock-summary", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId required",
      });
    }
    const data = await getStockSummary(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/stock-summary error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/outstanding-receivables?companyId=...
router.get("/report/outstanding-receivables", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId required",
      });
    }
    const data = await getOutstandingReceivables(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error(
      "GET /api/vouchers/report/outstanding-receivables error:",
      error,
    );
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/outstanding-payables-debug?companyId=...
router.get("/report/outstanding-payables-debug", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId required",
      });
    }

    const { getDb } = await import("../db.js");
    const db = getDb();

    // Get creditor groups
    const creditorGroups = await db
      .collection("groups")
      .find({
        company_id: companyId,
        name: { $regex: "creditors|suppliers|payable", $options: "i" },
      })
      .toArray();

    // Get supplier ledgers
    const groupIds = creditorGroups.map((g) => g.id);
    const suppliers = await db
      .collection("ledgers")
      .find({
        company_id: companyId,
        group_id: { $in: groupIds },
      })
      .toArray();

    // Get bills from bills collection
    const ledgerIds = suppliers.map((s) => s.id);
    const bills = await db
      .collection("bills")
      .find({
        company_id: companyId,
        ledger_id: { $in: ledgerIds },
        source: "ledger-opening",
      })
      .toArray();

    // Get opening-style entries from voucher documents (embedded ledger_entries)
    const openingVouchers = await db
      .collection("vouchers")
      .find({
        company_id: companyId,
        voucher_type: "opening",
      })
      .toArray();

    const entries = openingVouchers.flatMap((v) =>
      (Array.isArray(v.ledger_entries) ? v.ledger_entries : [])
        .filter(
          (e) =>
            ledgerIds.includes(e.ledger_id) &&
            Array.isArray(e.billallocation) &&
            e.billallocation.length > 0,
        )
        .map((e) => ({
          ledger_id: e.ledger_id,
          billallocation: e.billallocation,
        })),
    );

    res.json({
      success: true,
      debug: {
        creditorGroups: creditorGroups.length,
        suppliers: suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          is_billwise: s.is_billwise,
        })),
        bills: {
          count: bills.length,
          samples: bills.slice(0, 3).map((b) => ({
            bill_reference: b.bill_reference,
            allocated_amount: b.allocated_amount,
            isDeemedPositive: b.isDeemedPositive,
            source: b.source,
            ledger_id: b.ledger_id,
          })),
        },
        entries: {
          count: entries.length,
          samples: entries.slice(0, 2).map((e) => ({
            ledger_id: e.ledger_id,
            billcount: e.billallocation?.length,
          })),
        },
      },
    });
  } catch (error) {
    console.error(
      "GET /api/vouchers/report/outstanding-payables-debug error:",
      error,
    );
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/outstanding-payables?companyId=...
router.get("/report/outstanding-payables", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId required",
      });
    }
    const data = await getOutstandingPayables(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error(
      "GET /api/vouchers/report/outstanding-payables error:",
      error,
    );
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
