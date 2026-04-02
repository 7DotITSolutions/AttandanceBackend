// =============================================================
// FILE: src/middleware/deleteImage.js
// PURPOSE: Deletes an image from Cloudinary by its public_id.
//          Call this before updating or deleting any record
//          that has an image so you don't leave orphan files.
//          Usage: await deleteFromCloudinary(user.profile_id)
// =============================================================

import { cloudinary } from "./upload.js";

const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    // Log but don't throw — image deletion failure should
    // never block the main operation
    console.error("Cloudinary delete failed:", err.message);
  }
};

export default deleteFromCloudinary;