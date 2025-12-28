import { Router } from "express";
import * as staffControllers from "./staff.controllers.js";
import { isAuthenticated, isAuthorized } from "../../middelwares/auth.js";
import { roles } from "../../utils/constant/enums.js";
import { uploadSingleFile } from "../../utils/fileUpload/multer-cloud.js";

const staffRouter = Router();

staffRouter.use(
  isAuthenticated,
  isAuthorized([roles.OWNER, roles.STAFF])
);

staffRouter.get("/", staffControllers.getAllEmployee);
staffRouter.post("/", uploadSingleFile("image"), staffControllers.addNewEmployee);

// get all reservations
staffRouter.get(
  "/reservations",
  staffControllers.getAllReservationsForStaff
);

// update reservation status & schedule
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

staffRouter.get(
  "/pet-owners/:userId",
  staffControllers.getPetOwnerDetailsForStaff
);


// assign / change doctor
staffRouter.put(
  "/reservations/:id/assign-doctor",
  staffControllers.assignDoctorToReservation
);

staffRouter.patch(
  "/pets/:petId/vaccinations/:vaccinationHistoryId",
  staffControllers.updatePetVaccinationByStaff
);

// update / delete / soft delete employee
staffRouter.put("/soft/:id", staffControllers.softDeletedEmployee);
staffRouter.delete("/deleteDoc/:id", staffControllers.deleteEmployee);
staffRouter.put("/updateDoc/:id", uploadSingleFile("image"),staffControllers.updateEmployee);

export default staffRouter;
