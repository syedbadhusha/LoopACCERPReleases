import express from "express";
import {
  listVoucherTypes,
  getVoucherTypeById,
  getVoucherTypeByBaseType,
  createVoucherType,
  updateVoucherType,
  deleteVoucherType,
  createDefaultVoucherTypesForCompany,
} from "../services/voucherTypeService.js";
import { getDb } from "../db.js";

const router = express.Router();

// ─── GET /api/voucher-types?companyId=... ─────────────────────────────────────
// List all voucher types for a company
router.get("/", async (req, res) => {
  try {
    const { companyId, base_type } = req.query;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "companyId required" });
    }

    let types = await listVoucherTypes(String(companyId));

    // If this company has no voucher types yet (migrating existing company),
    // auto-create defaults from current settings
    if (types.length === 0) {
      const db = getDb();
      const company = await db
        .collection("companies")
        .findOne({ id: String(companyId) });
      await createDefaultVoucherTypesForCompany(
        String(companyId),
        company?.settings || {}
      );
      types = await listVoucherTypes(String(companyId));
    }

    if (base_type) {
      types = types.filter((t) => t.base_type === base_type);
    }

    return res.json({ success: true, data: types });
  } catch (error) {
    console.error("GET /api/voucher-types error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/voucher-types/:id ───────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const doc = await getVoucherTypeById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Voucher type not found" });
    }
    return res.json({ success: true, data: doc });
  } catch (error) {
    console.error("GET /api/voucher-types/:id error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/voucher-types ──────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      company_id, name, base_type, prefix, suffix, starting_number,
      is_pos,
      pos_sales_ledger_id, pos_cash_ledger_id, pos_card_ledger_id,
      pos_online_ledger_id, pos_tax_ledger_id, pos_cgst_ledger_id, pos_sgst_ledger_id,
    } = req.body;
    if (!company_id || !name || !base_type) {
      return res.status(400).json({
        success: false,
        message: "company_id, name and base_type are required",
      });
    }
    const doc = await createVoucherType(String(company_id), {
      name,
      base_type,
      prefix,
      suffix,
      starting_number,
      is_pos,
      pos_sales_ledger_id,
      pos_cash_ledger_id,
      pos_card_ledger_id,
      pos_online_ledger_id,
      pos_tax_ledger_id,
      pos_cgst_ledger_id,
      pos_sgst_ledger_id,
    });
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    console.error("POST /api/voucher-types error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/voucher-types/:id ───────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const updated = await updateVoucherType(req.params.id, req.body);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/voucher-types/:id error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/voucher-types/:id ───────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await deleteVoucherType(req.params.id);
    return res.json({ success: true, message: "Voucher type deleted" });
  } catch (error) {
    console.error("DELETE /api/voucher-types/:id error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
