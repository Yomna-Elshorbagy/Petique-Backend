export const roles = {
  PETOWNER: "petOwner",
  DOCTORS: "doctor",
  ADMIN: "admin",
  OWNER: "owner",
  STAFF: "staff",
};
Object.freeze(roles);

export const gender = {
  MALE: "male",
  FEMALE: "female",
};

export const status = {
  BLOCKED: "blocked",
  PENDING: "pending",
  VERIFIED: "verified",
  DELETED: "deleted",
};
Object.freeze(status);

export const replay = {
  REPLIED: "replied",
  INPROGRESS: "inProgress",
  PENDING: "pending",
};

export const orderStatus = {
  PENDING: "pending", // Awaiting payment (for VISA)
  PLACED: "placed",
  SHIPPING: "shipping",
  COMPLETED: "completed",
  CANCELED: "canceled",
  FAILED: "failed", // Payment failed
  REFUNDED: "refund",
};
Object.freeze(orderStatus);

export const payments = {
  CASH: "Cash on Delivery",
  VISA: "visa",
};
Object.freeze(payments);
export const couponTypes = {
  FIXED_AMOUNT: "fixedAmount",
  PERCENTAGE: "percentage",
};
Object.freeze(couponTypes);
