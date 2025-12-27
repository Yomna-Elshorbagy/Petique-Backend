import { Router } from "express";
import * as staffControllers from "./staff.controllers.js";
import { isAuthenticated, isAuthorized } from "../../middelwares/auth.js";
import { roles } from "../../utils/constant/enums.js";

const staffRouter = Router();

staffRouter.use(
  isAuthenticated,
  isAuthorized(roles.STAFF, roles.OWNER)
);

// get all reservations
staffRouter.get(
  "/reservations",
  staffControllers.getAllReservationsForStaff
);

// update reservation status
staffRouter.patch(
  "/reservations/:id/status",
  staffControllers.updateReservationStatusByStaff
);


// get today reservations
staffRouter.get(
  "/reservations/today",
  staffControllers.getTodayReservationsForStaff
);

// dashboard numbers
staffRouter.get(
  "/dashboard/stats",
  staffControllers.getStaffDashboardStats
);

// reservations per service
staffRouter.get(
  "/dashboard/reservations-per-service",
  staffControllers.reservationsPerServiceForStaff
);

// get all pets (read-only)
staffRouter.get(
  "/pets",
  staffControllers.getAllPetsForStaff
);

// get all pet owners
staffRouter.get(
  "/pet-owners",
  staffControllers.getAllPetOwnersForStaff
);
// vaccination overview
staffRouter.get(
  "/vaccinations/overview",
  staffControllers.getVaccinationOverviewForStaff
);


// assign / change doctor
staffRouter.patch(
  "/reservations/:id/assign-doctor",
  staffControllers.assignDoctorToReservation
);

export default staffRouter;
