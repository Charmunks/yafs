import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.get("/search", async (req, res) => {
  const userId = req.session.userId;
  const query = req.query.q || "";

  if (!query.trim()) {
    return res.json({ files: [] });
  }

  const searchPattern = `%${query}%`;

  let files;
  if (!userId) {
    files = await db("files")
      .where({ isPublic: true })
      .andWhere((builder) => {
        builder
          .whereILike("filename", searchPattern)
          .orWhereILike("description", searchPattern)
          .orWhereILike("folder", searchPattern);
      })
      .orderBy("created_at", "desc")
      .limit(50);
  } else {
    files = await db("files")
      .where({ ownerId: userId })
      .andWhere((builder) => {
        builder
          .whereILike("filename", searchPattern)
          .orWhereILike("description", searchPattern)
          .orWhereILike("folder", searchPattern);
      })
      .orderBy("created_at", "desc")
      .limit(50);
  }

  res.json({ files });
});

export default router;
