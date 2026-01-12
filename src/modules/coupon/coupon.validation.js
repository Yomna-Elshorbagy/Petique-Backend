import joi from "joi";
import { couponTypes } from "../../utils/constant/enums.js";
import { generalFields } from "../../middelwares/validate.js";

export const addCouponVal = joi
  .object({
    code: joi.string().max(10).required(),
    type: joi
      .string()
      .valid(...Object.values(couponTypes))
      .required(),
    discount: joi.number().positive().min(1),
    fromDate: joi.date().greater(Date.now() - 24 * 60 * 60 * 1000),
    expire: joi.date().greater(joi.ref("fromDate")),
  })
  .required();

export const updateCouponVal = joi.object({
  code: joi.string().length(6),
  type: joi.string().valid(...Object.values(couponTypes)),
  discount: joi.number().positive().min(1),
  fromDate: joi.date(),
  expire: joi.date().greater(joi.ref("fromDate")),
  id: generalFields.objectId.required(),
});
