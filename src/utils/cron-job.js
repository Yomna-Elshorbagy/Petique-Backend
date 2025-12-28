import cron from "node-cron";
import AutomaticDiscount from "../../database/models/discount.model.js";

cron.schedule("*/5 * * * *", async () => {
  await AutomaticDiscount.updateMany(
    { expire: { $lt: new Date() }, isActive: true },
    { isActive: false }
  );
});