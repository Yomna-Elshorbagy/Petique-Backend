import { dbConnection } from "../../database/dbconnection.js";
import { AppError } from "../utils/catch-error.js";
import { globalError } from "../utils/global-error.js";
import * as allRouters from "./index.js";
import "../schedulers/reminder.scheduler.js";
import "../schedulers/cleanupDeletedData_scheduler.js";

export const bootstrap = (app) => {
  process.on("uncaughtException", (err) => {
    console.log("ERROR in code: ", err);
  });

  dbConnection();

  app.use("/auth", allRouters.authRouter);
  app.use("/user", allRouters.userRouter);
  app.use("/qr", allRouters.qrRouter);
  app.use("/contact", allRouters.contactRouter);
  app.use("/pet", allRouters.petRouter);
  app.use("/categories", allRouters.categoryRouter);
  app.use("/products", allRouters.productRouter);
  app.use("/coupons", allRouters.couponRouter);
  app.use("/cart", allRouters.cartRouter);
  app.use("/order", allRouters.orderRouter);
  app.use("/pet", allRouters.petRouter);
  app.use("/reminder", allRouters.reminderRouter);
  app.use("/service", allRouters.serviceRouter);
  app.use("/reserve", allRouters.reservationRouter);
  app.use("/vaccine", allRouters.vaccinationRouter);
  app.use("/animalCat", allRouters.animalCategoryRouter);
  app.use("/reviews", allRouters.reviewRouter);
  app.use("/clinicReview", allRouters.clinicReviewRouter);
  app.use("/doctor", allRouters.doctorRouter);
  app.use("/chat", allRouters.chatRouter);
  app.use("/api/chat", allRouters.realtimeChatRouter);
  app.use("/disc", allRouters.discountRouter);
  app.use("/analytics", allRouters.analyticsRouter);
  app.use("/staff", allRouters.staffRouter);
  app.use("/symptom-checker", allRouters.symptomCheckerRouter);

  app.use((req, res, next) => {
    next(new AppError(`Route Not Found ${req.originalUrl}`, 404));
  });
  app.use(globalError);

  process.on("unhandledRejection", (err) => {
    console.log("ERROR: ", err);
  });
};
