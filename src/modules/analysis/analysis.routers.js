import { Router } from "express";
import * as analytics from "./analytics.controllers.js";
import { isAuthenticated } from "../../middelwares/auth.js";

const analyticsRouter = Router();

/* ===== PET ===== */
analyticsRouter.get("/pets/total", isAuthenticated, analytics.getTotalPets);
analyticsRouter.get(
  "/pets/per-category",
  isAuthenticated,
  analytics.petsPerCategory
);
analyticsRouter.get("/pets/per-user", isAuthenticated, analytics.petsPerUser);
analyticsRouter.get(
  "/pets/age-distribution",
  isAuthenticated,
  analytics.petsAgeDistribution
);

/* ===== VACCINATION ===== */
analyticsRouter.get(
  "/vaccinations/status",
  isAuthenticated,
  analytics.vaccinationStatusSummary
);
analyticsRouter.get(
  "/vaccinations/upcoming",
  isAuthenticated,
  analytics.upcomingVaccinations
);
analyticsRouter.get(
  "/vaccinations/overdue",
  isAuthenticated,
  analytics.overdueVaccinations
);

/* ===== CATEGORY ===== */
analyticsRouter.get(
  "/categories/top",
  isAuthenticated,
  analytics.topCategories
);
analyticsRouter.get(
  "/vaccinations/top-categories",
  isAuthenticated,
  analytics.getTopVaccinatedCategories
);
analyticsRouter.get(
  "/doctor-workload",
  isAuthenticated,
  analytics.doctorWorkload
);
analyticsRouter.get(
  "/monthly-trend",
  isAuthenticated,
  analytics.monthlyReservationsTrend
);

analyticsRouter.get(
  "/total-revenue",
  isAuthenticated,
  analytics.getResRevenueAnalysis
);
analyticsRouter.get(
  "/revenue",
  isAuthenticated,
  analytics.getMonthlyRevenue
);
export default analyticsRouter;
