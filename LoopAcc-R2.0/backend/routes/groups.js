import express from "express";
import {
  getGroupsByCompany,
  createGroup,
  updateGroup,
  deleteGroup,
} from "../services/groupService.js";

const router = express.Router();

// GET /api/groups?companyId=...
router.get("/", async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId)
      return res
        .status(400)
        .json({ success: false, message: "companyId query required" });
    const data = await getGroupsByCompany(String(companyId));
    res.json({ success: true, data });
  } catch (err) {
    console.error("Get groups error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/groups
router.post("/", async (req, res) => {
  try {
    const doc = req.body;
    if (!doc || !doc.company_id)
      return res
        .status(400)
        .json({ success: false, message: "company_id required" });
    const created = await createGroup(doc);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error("Create group error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/groups/:id
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const updated = await updateGroup(id, update);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Update group error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/groups/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await deleteGroup(id);
    res.json({ success: ok });
  } catch (err) {
    console.error("Delete group error:", err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

export default router;
