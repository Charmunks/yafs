import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});


export default router;
