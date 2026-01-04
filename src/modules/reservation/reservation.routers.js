import { Router } from "express";
import * as reservationControllers from "./reservation.controllers.js";
import { isAuthenticated } from "../../middelwares/auth.js";

const reservationRouter = Router();

reservationRouter.post(
  "/",
  isAuthenticated,
  reservationControllers.createReservation
);
reservationRouter.post(
  "/addByAdmin",
  isAuthenticated,
  reservationControllers.createReservationForAdmin
);
reservationRouter.get(
  "/",
  isAuthenticated,
  reservationControllers.getReservations
);
reservationRouter.get(
  "/types/upcoming",
  isAuthenticated,
  reservationControllers.getUpcomingReservations
);

reservationRouter.get(
  "/types/past",
  isAuthenticated,
  reservationControllers.getPastReservations
);
reservationRouter.get(
  "/check/availability",
  isAuthenticated,
  reservationControllers.checkAvailableSlots
);
// ===> doctor routes
reservationRouter.get(
  "/doctor/reservations/today",
  isAuthenticated,
  reservationControllers.getDoctorTodayReservations
);

reservationRouter.get(
  "/doctor/reservations/weekly",
  isAuthenticated,
  reservationControllers.getDoctorWeeklyReservations
);

// ====> statistics
reservationRouter.get(
  "/stats/total",
  isAuthenticated,
  reservationControllers.getTotalReservations
);

reservationRouter.get(
  "/stats/service",
  isAuthenticated,
  reservationControllers.getReservationsByService
);

reservationRouter.get(
  "/stats/daily",
  isAuthenticated,
  reservationControllers.getDailyReservations
);

reservationRouter.get(
  "/stats/monthly",
  isAuthenticated,
  reservationControllers.getMonthlyReservations
);

reservationRouter.get(
  "/stats/most-active-doctors",
  isAuthenticated,
  reservationControllers.getMostActiveDoctors
);

reservationRouter.get(
  "/today",
  isAuthenticated,
  reservationControllers.getTodayReservations
);
reservationRouter.get(
  "/track/my",
  isAuthenticated,
  reservationControllers.getTrackReservations
);
// ===> FILTER
reservationRouter.get(
  "/filter/search",
  isAuthenticated,
  reservationControllers.filterReservations
);
reservationRouter.get(
  "/status/:status",
  isAuthenticated,
  reservationControllers.getReservationsByStatus
);

reservationRouter.get(
  "/my-reservations",
  isAuthenticated,
  reservationControllers.getMyReservations
);

reservationRouter.get(
  "/my-reservations/upcoming",
  isAuthenticated,
  reservationControllers.getMyUpcomingReservations
);

reservationRouter.get(
  "/my-reservations/past",
  isAuthenticated,
  reservationControllers.getMyPastReservations
);
reservationRouter.get(
  "/today-with-alerts",
  isAuthenticated,
  reservationControllers.getTodayVaccinations
);
reservationRouter.get(
  "/search/:petId",
  isAuthenticated,
  reservationControllers.doctorSearchPets
);
//===> reservation
reservationRouter.get(
  "/:id",
  isAuthenticated,
  reservationControllers.getSpecificReservation
);
reservationRouter.put(
  "/:id",
  isAuthenticated,
  reservationControllers.updateReservation
);

reservationRouter.put(
  "/soft/:id",
  isAuthenticated,
  reservationControllers.softDeleteReservation
);

reservationRouter.delete(
  "/:id",
  isAuthenticated,
  reservationControllers.deleteReservation
);

export default reservationRouter;
