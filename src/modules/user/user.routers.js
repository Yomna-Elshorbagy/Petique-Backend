import { Router } from "express";
import * as userController from "./user.controllers.js";
import * as userAnalysisController from "./userAnalysisProducts.js";
import { isAuthenticated } from "../../middelwares/auth.js";
import { validate } from "../../middelwares/validate.js";
import { resetPassVal } from "./user.validation.js";
import { uploadSingleFile } from "../../utils/fileUpload/multer-cloud.js";
const userRouter = Router();

userRouter.get("/profile", isAuthenticated, userController.getProfile);
userRouter.get("/allUsers", isAuthenticated, userController.getAllUsers);

// ===> Analysis routes for dashboard
userRouter.get("/analysis/overview", isAuthenticated, userController.getUsersOverview);
userRouter.get(
  "/analysis/deleted",
  isAuthenticated,
  userController.getDeletedUsersAnalysis
);
userRouter.get("/analysis/demographics", isAuthenticated, userController.getDemographics);

userRouter.put(
  "/reset-pass",
  isAuthenticated,
  validate(resetPassVal),
  userController.resetPassword
);
userRouter.put(
  "/",
  isAuthenticated,
  uploadSingleFile("image", "users"),
  userController.updateUser
);

//===> calculating user analysis data required for his prediction
userRouter.get("/spending", isAuthenticated, userAnalysisController.getUserSpendingSummary);
userRouter.get("/top-categories", isAuthenticated, userAnalysisController.getUserTopCategories);
userRouter.get("/top-products", isAuthenticated, userAnalysisController.getUserTopProducts);


userRouter.delete("/", isAuthenticated, userController.deleteUserByUser);
userRouter.put("/softDelete", isAuthenticated, userController.softDeleteUserByUser);

//===> admin
userRouter.put("/byadmin/:id", isAuthenticated, userController.updateUserByAdmin);
userRouter.delete("/delete/:id", isAuthenticated, userController.deleteUser);
userRouter.put("/softDelete/:id", isAuthenticated, userController.softDeleteUser);

export default userRouter;
