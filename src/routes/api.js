import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.get("/folders", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.json({ folders: [], tree: [] });
  }

  const folders = await db("files")
    .where({ ownerId: userId })
    .whereNotNull("folder")
    .distinct("folder")
    .pluck("folder");

  const sortedFolders = folders.sort();

  const tree = buildFolderTree(sortedFolders);

  res.json({ folders: sortedFolders, tree });
});

function buildFolderTree(folderPaths) {
  const tree = [];
  const nodeMap = new Map();

  for (const path of folderPaths) {
    const parts = path.split("/");
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!nodeMap.has(currentPath)) {
        const node = {
          name: part,
          path: currentPath,
          children: []
        };
        nodeMap.set(currentPath, node);

        if (parentPath) {
          const parent = nodeMap.get(parentPath);
          if (parent) {
            parent.children.push(node);
          }
        } else {
          tree.push(node);
        }
      }
    }
  }

  return tree;
}

router.get("/search", async (req, res) => {
  const userId = req.session.userId;
  const query = (req.query.q || "").slice(0, 100);

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
