import { Router } from "express";
import * as symptomCheckerController from "./symptomChecker.controllers.js";
import { isAuthenticated } from "../../middelwares/auth.js";

const symptomCheckerRouter = Router();

// Create a new symptom check
symptomCheckerRouter.post(
  "/",
  isAuthenticated,
  symptomCheckerController.createSymptomCheck
);

// Get all symptom checks for the authenticated user
symptomCheckerRouter.get(
  "/",
  isAuthenticated,
  symptomCheckerController.getUserSymptomChecks
);

// Get symptom check statistics
symptomCheckerRouter.get(
  "/stats",
  isAuthenticated,
  symptomCheckerController.getSymptomCheckStats
);

// Get a specific symptom check by ID
symptomCheckerRouter.get(
  "/:id",
  isAuthenticated,
  symptomCheckerController.getSymptomCheckById
);

// Mark symptom check as resolved
symptomCheckerRouter.patch(
  "/:id/resolve",
  isAuthenticated,
  symptomCheckerController.markSymptomCheckResolved
);

export default symptomCheckerRouter;
