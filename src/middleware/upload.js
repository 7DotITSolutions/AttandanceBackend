// =============================================================
// FILE: src/middleware/upload.js
// PURPOSE: Multer + Cloudinary setup for image uploads.
//          Uses memory storage (no local disk writes).
//          Used by profile picture and Aadhaar card uploads.
//          Import and use as: upload.single("profile")
//                         or: upload.fields([...])
// =============================================================

import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";

dotenv.config();

// ── Configure Cloudinary ──────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Cloudinary storage for multer ─────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Determine folder based on fieldname
    let folder = "attendance-pro/misc";
    if (file.fieldname === "profile")          folder = "attendance-pro/profiles";
    if (file.fieldname === "aadharCardImage")  folder = "attendance-pro/aadhar";

    return {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ width: 800, quality: "auto" }],
      public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
    };
  },
});

// ── File filter — images only ─────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and WEBP images are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

export default upload;
export { cloudinary };