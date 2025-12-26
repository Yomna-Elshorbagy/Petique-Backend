import { Router } from "express";
import { isAuthenticated, isAuthorized } from "../../middelwares/auth.js";
import { roles } from "../../utils/constant/enums.js";
import { addCouponVal, updateCouponVal } from "./coupon.validation.js";
import * as couponControllers from "./coupon.controllers.js";
import { validate } from "../../middelwares/validate.js";

const couponRouter = Router();

couponRouter.get("/", isAuthenticated, couponControllers.getCoupons);
couponRouter.get(
  "/getDeleted",
  isAuthenticated,
  couponControllers.getSoftDeletedCoupons
);
couponRouter.get("/:id", isAuthenticated, couponControllers.getCoupon);
couponRouter.post(
  "/addCoupon",
  isAuthenticated,
  validate(addCouponVal),
  couponControllers.addCoupon
);

couponRouter.post("/valid", isAuthenticated, couponControllers.validateCoupon);

couponRouter.patch(
  "/restore/:id",
  isAuthenticated,
  couponControllers.restoreCoupon
);

couponRouter.put(
  "/:id",
  isAuthenticated,
  validate(updateCouponVal),
  couponControllers.updateCoupon
);
couponRouter.get(
  "/code/:code",
  isAuthenticated,
  couponControllers.getCouponByCode
);
couponRouter.put(
  "/soft/:id",
  isAuthenticated,
  couponControllers.softDeleteCoupon
);
couponRouter.delete("/:id", isAuthenticated, couponControllers.deleteCoupon);

export default couponRouter;
