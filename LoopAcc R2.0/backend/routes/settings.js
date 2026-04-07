import express from "express";
import { getDb } from "../db.js";

const router = express.Router();

// GET /api/settings?companyId=...
// Get all settings for a company from the company document
router.get("/", async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId)
      return res
        .status(400)
        .json({ success: false, message: "companyId required" });

    const db = getDb();
    const company = await db
      .collection("companies")
      .findOne({ id: String(companyId) });

    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    // Convert settings object to array format for compatibility
    const settings = company.settings || {};
    const settingsArray = Object.entries(settings).map(([key, value]) => ({
      setting_key: key,
      setting_value: value,
    }));

    res.json({ success: true, data: settingsArray });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/settings - Update settings in company document
router.post("/", async (req, res) => {
  try {
    const { company_id, setting_key, setting_value } = req.body;
    if (!company_id || !setting_key)
      return res.status(400).json({
        success: false,
        message: "company_id and setting_key required",
      });

    const db = getDb();
    const companiesCollection = db.collection("companies");

    const result = await companiesCollection.updateOne(
      { id: String(company_id) },
      {
        $set: {
          [`settings.${setting_key}`]: String(setting_value),
          updated_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    res.json({
      success: true,
      data: {
        company_id,
        setting_key,
        setting_value,
      },
    });
  } catch (error) {
    console.error("POST /api/settings error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/settings/batch - Batch update settings in company document
router.post("/batch", async (req, res) => {
  try {
    const { company_id, settings } = req.body;
    if (!company_id || !Array.isArray(settings))
      return res.status(400).json({
        success: false,
        message: "company_id and settings array required",
      });

    const db = getDb();
    const companiesCollection = db.collection("companies");

    // Build update object for all settings
    const updateObj = {};
    settings.forEach((setting) => {
      updateObj[`settings.${setting.setting_key}`] = String(
        setting.setting_value
      );
    });
    updateObj["updated_at"] = new Date();

    const result = await companiesCollection.updateOne(
      { id: String(company_id) },
      { $set: updateObj }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    res.json({
      success: true,
      data: {
        company_id,
        updated_count: settings.length,
      },
    });
  } catch (error) {
    console.error("POST /api/settings/batch error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
