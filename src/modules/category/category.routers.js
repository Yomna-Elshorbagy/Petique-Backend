import { Router } from "express";
import * as categoryControllers from "./category.controllers.js";
import { validate } from "../../middelwares/validate.js";
import { addCategoryVal, updateCategoryVal } from "./category.validation.js";
import { isAuthenticated } from "../../middelwares/auth.js";
import { uploadSingleFile } from "../../utils/fileUpload/multer-cloud.js";

const categoryRouter = Router();

categoryRouter.post(
  "/",
  isAuthenticated,
  uploadSingleFile("image"),
  validate(addCategoryVal),
  categoryControllers.addCategoryCloud
);

categoryRouter.get("/", categoryControllers.getAllCategories);
categoryRouter.get("/getCategories", categoryControllers.getCategories);
categoryRouter.get(
  "/:id/products",
  categoryControllers.getProductsByCategoryId
);
categoryRouter.get(
  "/analytics/trending",
  categoryControllers.getTrendingCategories
);
categoryRouter.get("/analytics/stats", categoryControllers.getCategoryStats);
categoryRouter.get(
  "/getRevenues",
  isAuthenticated,
  categoryControllers.getRevenueDistribution
);
categoryRouter.get(
  "/getDeleted",
  isAuthenticated,
  categoryControllers.getSoftDeletedCategories
);
categoryRouter.put(
  "/restore/:id",
  isAuthenticated,
  categoryControllers.restoreCategory
);

categoryRouter.put(
  "/soft/:id",
  isAuthenticated,
  categoryControllers.softDeleteCategory
);
categoryRouter
  .route("/:id")
  .get(categoryControllers.getSpecificCategory)
  .put(
    isAuthenticated,
    uploadSingleFile("image", "categories"),
    validate(updateCategoryVal),
    categoryControllers.updateCategoryCloud
  )
  .delete(isAuthenticated, categoryControllers.deleteCategoryCloud);

export default categoryRouter;
