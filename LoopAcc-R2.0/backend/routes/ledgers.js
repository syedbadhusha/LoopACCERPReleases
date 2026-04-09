import express from "express";
import {
  getLedgersByCompany,
  createLedger,
  updateLedger,
  deleteLedger,
  getTrialBalance,
  getBalanceSheetData,
  getLedgerReportData,
  getGroupVoucherReportData,
  getBillAllocations,
  saveBillAllocations,
  deleteBillAllocation,
} from "../services/ledgerService.js";

const router = express.Router();

// GET /api/ledgers?companyId=...
router.get("/", async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId)
      return res
        .status(400)
        .json({ success: false, message: "companyId query required" });
    const data = await getLedgersByCompany(String(companyId));
    res.json({ success: true, data });
  } catch (err) {
    console.error("Get ledgers error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ledgers
router.post("/", async (req, res) => {
  try {
    const doc = req.body;
    if (!doc || !doc.company_id)
      return res
        .status(400)
        .json({ success: false, message: "company_id required" });
    const created = await createLedger(doc);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error("Create ledger error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/ledgers/:id
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const updated = await updateLedger(id, update);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Update ledger error:", err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// DELETE /api/ledgers/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await deleteLedger(id);
    res.json({ success: ok });
  } catch (err) {
    console.error("Delete ledger error:", err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// GET /api/ledgers/report/trial-balance?companyId=...&dateFrom=...&dateTo=...
router.get("/report/trial-balance", async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo } = req.query;
    if (!companyId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, dateFrom, and dateTo required",
      });
    }
    const data = await getTrialBalance(companyId, dateFrom, dateTo);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Trial balance report error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ledgers/report/balance-sheet?companyId=...&dateFrom=...&dateTo=...
router.get("/report/balance-sheet", async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo } = req.query;
    if (!companyId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, dateFrom, and dateTo required",
      });
    }
    console.log('[Balance Sheet API] Request received:', { companyId, dateFrom, dateTo });
    const data = await getBalanceSheetData(companyId, dateFrom, dateTo);
    console.log('[Balance Sheet API] Response data count:', data?.length || 0);
    console.log('[Balance Sheet API] Response data sample:', data?.slice(0, 2));
    res.json({ success: true, data });
  } catch (err) {
    console.error("Balance sheet report error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ledgers/report/ledger?companyId=...&ledgerId=...&dateFrom=...&dateTo=...
router.get("/report/ledger", async (req, res) => {
  try {
    const { companyId, ledgerId, dateFrom, dateTo } = req.query;
    if (!companyId || !ledgerId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, ledgerId, dateFrom, and dateTo required",
      });
    }

    const data = await getLedgerReportData(
      String(companyId),
      String(ledgerId),
      String(dateFrom),
      String(dateTo),
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error("Ledger report error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ledgers/report/group-vouchers?companyId=...&groupId=...&dateFrom=...&dateTo=...
router.get("/report/group-vouchers", async (req, res) => {
  try {
    const { companyId, groupId, dateFrom, dateTo } = req.query;
    if (!companyId || !groupId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, groupId, dateFrom, and dateTo required",
      });
    }

    const data = await getGroupVoucherReportData(
      String(companyId),
      String(groupId),
      String(dateFrom),
      String(dateTo),
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error("Group vouchers report error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ledgers/:id/bill-allocations?companyId=...
router.get("/:id/bill-allocations", async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!id || !companyId) {
      return res.status(400).json({
        success: false,
        message: "ledgerId and companyId required",
      });
    }
    const data = await getBillAllocations(id, companyId);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Get bill allocations error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ledgers/:id/bill-allocations
router.post("/:id/bill-allocations", async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId, allocations } = req.body;

    console.log(
      `[BILL ALLOCATIONS API] Received POST request for ledger ${id}`,
      {
        companyId,
        allocationCount: allocations?.length || 0,
      }
    );

    if (!id || !companyId || !allocations) {
      console.error(`[BILL ALLOCATIONS API] Missing required fields:`, {
        id: !!id,
        companyId: !!companyId,
        allocations: !!allocations,
      });
      return res.status(400).json({
        success: false,
        message: "ledgerId, companyId, and allocations required",
      });
    }

    console.log(`[BILL ALLOCATIONS API] Calling saveBillAllocations...`);
    const result = await saveBillAllocations(id, companyId, allocations);

    console.log(
      `[BILL ALLOCATIONS API] ✅ saveBillAllocations completed successfully`,
      {
        createdBillsCount: result.createdBills?.length || 0,
      }
    );

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Save bill allocations error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/ledgers/:id/bill-allocations/:allocationId?companyId=...
router.delete("/:id/bill-allocations/:allocationId", async (req, res) => {
  try {
    const { id, allocationId } = req.params;
    const { companyId } = req.query;
    if (!id || !allocationId || !companyId) {
      return res.status(400).json({
        success: false,
        message: "ledgerId, allocationId, and companyId required",
      });
    }
    const success = await deleteBillAllocation(id, allocationId, companyId);
    res.json({ success });
  } catch (err) {
    console.error("Delete bill allocation error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
